'use strict';

const   createRouter = require('@arangodb/foxx/router');
const   router = createRouter();
const   joi = require('joi');

const   g_db = require('@arangodb').db;
const   g_lib = require('./support');
const   g_graph = require('@arangodb/general-graph')._graph('sdmsg');

module.exports = router;

function fixSchOwnNm( a_sch ){
    if ( !a_sch.own_nm )
        return;

    var j, nm = "", tmp = a_sch.own_nm.split(" ");

    console.log("tmp", tmp, tmp.length );

    for ( j = 0; j < tmp.length - 1; j++ ){
        if ( j )
            nm += " ";
        nm += tmp[j].charAt(0).toUpperCase() + tmp[j].substr(1);
    }

    a_sch.own_nm = nm;
}

function fixSchOwnNmAr( a_sch ){
    //console.log("fixSchOwnNmAr");
    var sch, tmp, j, nm;
    for ( var i in a_sch ){
        sch = a_sch[i];
        if ( !sch.own_nm )
            continue;
        tmp = sch.own_nm.split(" ");
        nm = "";
        for ( j = 0; j < tmp.length - 1; j++ ){
            if ( j )
                nm += " ";
            nm += tmp[j].charAt(0).toUpperCase() + tmp[j].substr(1);
        }
        sch.own_nm = nm;
    }
}

// This function only works on schemas that have already been validated
function _resolveRefs( a_props, a_refs ){
    var v, p, s, tmp, id, vr;
    for ( var k in a_props ){
        v = a_props[k];

        if ( "$ref" in v ){
            s = v["$ref"];
            if ( !(s in a_refs )){
                tmp = s.indexOf(":");
                id = s.substr(0,tmp);
                vr = parseInt( s.substr(tmp+1) );
                tmp = g_db.sch.firstExample({ id: id, ver: vr });
                //delete tmp._id;
                a_refs[s] = tmp.def;
                _resolveRefs( tmp.def.properties, a_refs );
            }
        }else if (( p = v.properties ) != undefined ) {
            _resolveRefs( p, a_refs );
        }
    }
}


//==================== SCHEMA API FUNCTIONS

router.post('/create', function (req, res) {
    try {
        g_db._executeTransaction({
            collections: {
                read: ["u","uuid","accn"],
                write: ["sch","sch_dep"]
            },
            waitForSync: true,
            action: function() {
                const client = g_lib.getUserFromClientID( req.queryParams.client );

                var obj = { cnt: 0, ver: 0, pub: req.body.pub, def: req.body.def };
        
                if ( req.body.sys ){
                    if ( !client.is_admin )
                        throw [ g_lib.ERR_PERM_DENIED, "Creating a system schema requires admin privileges."];
                    if ( !req.body.pub )
                        throw [ g_lib.ERR_INVALID_PARAM, "System schemas cannot be private."];
                }else{
                    obj.own_id = client._id;
                    obj.own_nm = client.name;
                }
        
                g_lib.procInputParam( req.body, "_sch_id", false, obj );
                g_lib.procInputParam( req.body, "desc", false, obj );
        
                var sch = g_db.sch.save( obj, { returnNew: true }).new;
        
                updateSchemaRefs( sch );
                fixSchOwnNm( sch );
        
                delete sch._id;
                delete sch._key;
                delete sch._rev;
        
                res.send([ sch ]);
            }
        });
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().optional(), "Client ID")
.body(joi.object({
    id: joi.string().required(),
    desc: joi.string().required(),
    def: joi.object().required(),
    pub: joi.boolean().optional().default(true),
    sys: joi.boolean().optional().default(false)
}).required(), 'Schema fields')
.summary('Create schema')
.description('Create schema');


router.post('/update', function (req, res) {
    try {
        g_db._executeTransaction({
            collections: {
                read: ["u","uuid","accn"],
                write: ["sch","sch_dep"]
            },
            waitForSync: true,
            action: function() {
                const client = g_lib.getUserFromClientID( req.queryParams.client );
                var sch_old = g_db.sch.firstExample({ id: req.queryParams.id, ver: req.queryParams.ver });

                if ( !sch_old )
                    throw [ g_lib.ERR_NOT_FOUND, "Schema '" + req.queryParams.id + "' not found." ];

                if ( sch_old.cnt )
                    throw [ g_lib.ERR_PERM_DENIED, "Schema is in use - cannot update." ];

                if ( sch_old.own_id != client._id && !client.is_admin )
                    throw g_lib.ERR_PERM_DENIED;

                var obj = {};

                if ( req.body.pub != undefined ){
                    obj.pub = req.body.pub;
                }

                if ( req.body.sys ){
                    if ( !client.is_admin )
                        throw [ g_lib.ERR_PERM_DENIED, "Changing to a system schema requires admin privileges."];

                    if ( !sch_old.pub && !req.body.pub )
                        throw [ g_lib.ERR_INVALID_PARAM, "System schemas cannot be private."];

                    obj.own_id = null;
                    obj.own_nm = null;
                }
            
                g_lib.procInputParam( req.body, "_sch_id", true, obj );

                if ( obj.id && ( sch_old.ver || g_db.sch_ver.firstExample({ _from: sch_old._id }) )){
                    throw [ g_lib.ERR_PERM_DENIED, "Cannot change schema ID once revisions exist."];
                }

                g_lib.procInputParam( req.body, "desc", true, obj );

                if ( req.body.def )
                    obj.def = req.body.def;

                var sch_new = g_db.sch.update( sch_old._id, obj, { returnNew: true, mergeObjects: false, keepNull: false }).new;

                updateSchemaRefs( sch_new );
                fixSchOwnNm( sch_new );

                delete sch_new._id;
                delete sch_new._key;
                delete sch_new._rev;

                res.send([ sch_new ]);
            }
        });
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().optional(), "Client ID")
.queryParam('id', joi.string().required(), "Schema ID")
.queryParam('ver', joi.number().integer().min(0).required(), "Schema Version")
.body(joi.object({
    id: joi.string().optional(),
    desc: joi.string().optional(),
    def: joi.object().optional(),
    pub: joi.boolean().optional(),
    sys: joi.boolean().optional()
}).required(), 'Schema fields')
.summary('Update schema')
.description('Update schema');

router.post('/revise', function (req, res) {
    try {
        g_db._executeTransaction({
            collections: {
                read: ["u","uuid","accn"],
                write: ["sch","sch_dep","sch_ver"]
            },
            waitForSync: true,
            action: function() {
                const client = g_lib.getUserFromClientID( req.queryParams.client );
                var sch = g_db.sch.firstExample({ id: req.queryParams.id, ver: req.queryParams.ver });

                if ( !sch )
                    throw [ g_lib.ERR_NOT_FOUND, "Schema '" + req.queryParams.id + "' not found." ];

                if ( sch.own_id != client._id && !client.is_admin )
                    throw g_lib.ERR_PERM_DENIED;

                if ( g_db.sch_ver.firstExample({ _from: sch._id }) )
                    throw [ g_lib.ERR_PERM_DENIED, "A revision of schema '" + req.queryParams.id + "' ver " + req.queryParams.ver + " already exists." ];

                if ( !sch.own_id && !client.is_admin )
                    throw [ g_lib.ERR_PERM_DENIED, "Revising a system schema requires admin privileges."];

                sch.ver++;

                if ( req.body.pub != undefined ){
                    sch.pub = req.body.pub;

                    if ( !sch.own_id ){
                        sch.own_id = client._id;
                        sch.own_nm = client.name;
                    }
                }

                if ( req.body.sys ){
                    if ( !client.is_admin )
                        throw [ g_lib.ERR_PERM_DENIED, "Creating a system schema requires admin privileges."];

                    sch.own_id = null;
                    sch.own_nm = null;
                }

                if ( !sch.pub && !sch.own_id )
                    throw [ g_lib.ERR_INVALID_PARAM, "System schemas cannot be private."];

                g_lib.procInputParam( req.body, "desc", true, sch );

                if ( req.body.def != undefined )
                    sch.def = req.body.def;

                var old_id = sch._id;
                delete sch._id;
                delete sch._key;
                delete sch._rev;

                console.log("sch rev",sch);

                var sch_new = g_db.sch.save( sch, { returnNew: true }).new;
                console.log("sch rev 1");

                g_db.sch_ver.save({ _from: old_id, _to: sch_new._id });
                console.log("sch rev 2");

                updateSchemaRefs( sch_new );
                console.log("sch rev 3");

                fixSchOwnNm( sch_new );

                delete sch_new._id;
                delete sch_new._key;
                delete sch_new._rev;

                console.log("sch rev 4");

                res.send([ sch_new ]);
            }
        });
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().optional(), "Client ID")
.queryParam('id', joi.string().required(), "Schema ID")
.queryParam('ver', joi.number().integer().min(0).required(), "Schema Version")
.body(joi.object({
    desc: joi.string().optional(),
    def: joi.object().optional(),
    pub: joi.boolean().optional(),
    sys: joi.boolean().optional()
}).required(), 'Schema fields')
.summary('Revise schema')
.description('Revise schema');

router.post('/delete', function (req, res) {
    try {
        const client = g_lib.getUserFromClientID( req.queryParams.client );

        var sch_old = g_db.sch.firstExample({ id: req.queryParams.id, ver: req.queryParams.ver });

        if ( !sch_old )
            throw [ g_lib.ERR_NOT_FOUND, "Schema '" + req.queryParams.id + "' not found." ];

        if ( sch_old.own_id != client._id && !client.is_admin )
            throw g_lib.ERR_PERM_DENIED;

        if ( sch_old.cnt )
            throw [ g_lib.ERR_PERM_DENIED, "Schema in use on data records - cannot delete." ];

        // Cannot delete schemas references by other schemas
        if ( g_db.sch_dep.firstExample({ _to: sch_old._id }))
            throw [ g_lib.ERR_PERM_DENIED, "Schema referenced by other schemas - cannot delete." ];

        // Only allow deletion of oldest and newest revisions of schemas
        if ( g_db.sch_ver.firstExample({ _from: sch_old._id }) && g_db.sch_ver.firstExample({ _to: sch_old._id }))
            throw [ g_lib.ERR_PERM_DENIED, "Cannot delete intermediate schema revisions." ];

        g_graph.sch.remove( sch_old._id );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().optional(), "Client ID")
.queryParam('id', joi.string().required(), "Schema ID")
.queryParam('ver', joi.number().integer().min(0).required(), "Schema Version")
.summary('Delete schema')
.description('Delete schema');


router.get('/view', function (req, res) {
    try {
        const client = g_lib.getUserFromClientID( req.queryParams.client );
        var sch = g_db.sch.firstExample({ id: req.queryParams.id, ver: req.queryParams.ver });

        if ( !sch )
            throw [ g_lib.ERR_NOT_FOUND, "Schema '" + req.queryParams.id + (req.queryParams.ver?"-"+req.queryParams.ver:"") + "' not found."];

        if ( !( sch.pub || sch.own_id == client._id || client.is_admin ))
            throw g_lib.ERR_PERM_DENIED;

        if ( req.queryParams.resolve ){
            var refs = {};
            _resolveRefs( sch.def.properties, refs );
            sch.def._refs = refs;
        }

        sch.depr = g_db.sch_ver.firstExample({ _from: sch._id })?true:false;
        sch.uses = g_db._query("for i in 1..1 outbound @sch sch_dep return {id:i.id,ver:i.ver}",{sch:sch._id}).toArray();
        sch.used_by = g_db._query("for i in 1..1 inbound @sch sch_dep return {id:i.id,ver:i.ver}",{sch:sch._id}).toArray();
        
        delete sch._id;
        delete sch._key;
        delete sch._rev;

        fixSchOwnNm( sch );

        res.send([ sch ]);
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().optional(), "Client ID")
.queryParam('id', joi.string().required(), "ID of schema")
.queryParam('ver', joi.number().integer().min(0).required(), "Schema Version")
.queryParam('resolve', joi.bool().optional(), "Resolve references")
.summary('View schema')
.description('View schema');


router.get('/search', function (req, res) {
    try {
        const client = g_lib.getUserFromClientID( req.queryParams.client );
        var qry, par = {}, result, off = 0, cnt = 50, comb = false;

        if ( req.queryParams.offset != undefined )
            off = req.queryParams.offset;

        if ( req.queryParams.count != undefined && req.queryParams.count <= 100 )
            cnt = req.queryParams.count;

        qry = "for i in schemaview search ";

        if ( req.queryParams.owner ){
            if ( req.queryParams.owner == client._id ){
                qry += "(i.own_id == @owner)";
            }else if ( req.queryParams.owner.startsWith("u/")){
                qry += "(i.pub == true && i.own_id == @owner)";
            }else{
                qry += "(i.pub == true && analyzer(i.own_nm in tokens(@owner,'user_name'), 'user_name'))";
            }

            par.owner = req.queryParams.owner.toLowerCase();
        }else{
            qry += "boost(i.pub == true || i.own_id == @owner,0.01)";
            par.owner = client._id;
        }

        if ( req.queryParams.text ){
            // TODO handle multiple words/phrases
            qry += " and analyzer( phrase(i['desc'],'" + req.queryParams.text.toLowerCase() + "'), 'text_en')";
        }

        if ( req.queryParams.id ){
            qry += " and analyzer(i.id in tokens(@id,'sch_id'), 'sch_id')";
            par.id = req.queryParams.id.toLowerCase();
        }

        if ( req.queryParams.sort == g_lib.SORT_RELEVANCE && ( req.queryParams.id || req.queryParams.text )){
            qry += " let s = BM25(i) sort s desc";
        }else if ( req.queryParams.sort == g_lib.SORT_OWNER ){
            qry += " sort i.own_nm";
            qry += (req.queryParams.sort_rev?" desc":"");
        }else{
            if ( req.queryParams.sort_rev )
                qry += " sort i.id desc, i.ver";
            else
                qry += " sort i.id,i.ver";

            //qry += (req.queryParams.sort_rev?" desc":"");
        }

        qry += " limit " + off + "," + cnt + " return {id:i.id,ver:i.ver,cnt:i.cnt,pub:i.pub,own_nm:i.own_nm,own_id:i.own_id}";

        //qry += " filter (i.pub == true || i.own_id == @uid) sort i.id limit " + off + "," + cnt + " return {id:i.id,ver:i.ver,cnt:i.cnt,pub:i.pub,own_nm:i.own_nm,own_id:i.own_id}";

        result = g_db._query( qry, par, {}, { fullCount: true });
        var tot = result.getExtra().stats.fullCount;
        result = result.toArray();

        /*for ( var i in result ){
            console.log("id:",result[i].id,", score:",result[i].s);
        }*/

        fixSchOwnNmAr( result );

        result.push({ paging: {off: off, cnt: cnt, tot: tot }});

        res.send( result );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('id', joi.string().optional(), "ID (partial)")
.queryParam('text', joi.string().optional(), "Text or phrase")
.queryParam('owner', joi.string().optional(), "Owner ID")
.queryParam('sort', joi.number().integer().min(0).optional(), "Sort by")
.queryParam('sort_rev', joi.bool().optional(), "Sort in reverse order")
.queryParam('offset', joi.number().integer().min(0).optional(), "Offset")
.queryParam('count', joi.number().integer().min(1).optional(), "Count")
.summary('Search schemas')
.description('Search schema');

function updateSchemaRefs( a_sch ){
    // Schema has been created, revised, or updated
    // Find and update dependencies to other schemas (not versions)

    // TODO This does not catch circular references (issue #563)

    g_db.sch_dep.removeByExample({ _from: a_sch._id });

    var idx,id,ver,r,refs = new Set();

    parseProps( a_sch.def.properties, refs );

    refs.forEach( function( v ){
        // Ignore internal references
        if ( v.charAt(0) != "#" ){
            idx = v.indexOf(":");

            if ( idx < 0 )
                throw [ g_lib.ERR_INVALID_PARAM, "Invalid reference ID '" + v + "' in schema (expected id:ver)." ];

            // TODO handle json pointer past #

            id = v.substr(0,idx);
            ver = parseInt( v.substr(idx+1) );
            //console.log("ref",id,ver);

            r = g_db.sch.firstExample({ id: id, ver: ver });

            if ( !r )
                throw [ g_lib.ERR_INVALID_PARAM, "Referenced schema '" + v + "' does not exist." ];

            if ( r._id == a_sch._id )
                throw [ g_lib.ERR_INVALID_PARAM, "Schema references self." ];

            g_graph.sch_dep.save({_from: a_sch._id, _to: r._id });
        }
    });
}

function parseProps( a_doc, a_refs ){
    var v;
    for ( var k in a_doc ){
        v = a_doc[k];

        if (  v !== null && typeof v === 'object' && Array.isArray( v ) === false ){
            parseProps( v, a_refs )
        }else if ( k == "$ref" ){
            if ( typeof v !== 'string' )
                throw [ g_lib.ERR_INVALID_PARAM, "Invalid reference type in schema." ];

            a_refs.add( v );
        }
    }
}