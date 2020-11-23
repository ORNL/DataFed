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


//==================== SCHEMA API FUNCTIONS

router.post('/create', function (req, res) {
    try {
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

        // TODO Parse definition to find references and add sch_dep edges

        fixSchOwnNm( sch );

        delete sch._id;
        delete sch._key;
        delete sch._rev;

        res.send([ sch ]);
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
        const client = g_lib.getUserFromClientID( req.queryParams.client );
        var sch_old = g_db.sch.firstExample({ id: req.queryParams.id, ver: req.queryParams.ver });

        if ( !sch_old )
            throw [ g_lib.ERR_NOT_FOUND, "Schema '" + req.queryParams.id + "' not found." ];

        if ( sch_old.cnt )
            throw [ g_lib.ERR_PERM_DENIED, "Schema is in use - cannot update." ];

        if ( sch_old.own_id != client._id && !client.is_admin )
            throw g_lib.ERR_PERM_DENIED;

        var obj = {};

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

        console.log("sch upd",obj);
        var sch_new = g_db.sch.update( sch_old._id, obj, { returnNew: true, keepNull: false }).new;

        // TODO Parse definition to find references and add sch_dep edges

        fixSchOwnNm( sch_new );

        delete sch_new._id;
        delete sch_new._key;
        delete sch_new._rev;

        res.send([ sch_new ]);
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
        const client = g_lib.getUserFromClientID( req.queryParams.client );
        var sch = g_db.sch.firstExample({ id: req.queryParams.id, ver: req.queryParams.ver });

        if ( !sch )
            throw [ g_lib.ERR_NOT_FOUND, "Schema '" + req.queryParams.id + "' not found." ];

        if ( sch.own_id != client._id && !client.is_admin )
            throw g_lib.ERR_PERM_DENIED;

        if ( g_sb.sch_ver.firstExample({ _from: sch._id }) )
            throw [ g_lib.ERR_PERM_DENIED, "A revision of schema '" + req.queryParams.id + "' already exists." ];

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
        g_db.sch_ver.save({ _from: old_id, _to: sch_new._id });

        // TODO Parse definition to find references and add sch_dep edges

        fixSchOwnNm( sch_new );

        delete sch_new._id;
        delete sch_new._key;
        delete sch_new._rev;

        res.send([ sch_new ]);
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

        if ( sch_old.cnt )
            throw [ g_lib.ERR_PERM_DENIED, "Schema is in use - cannot delete." ];

        if ( sch_old.own_id != client._id && !client.is_admin )
            throw g_lib.ERR_PERM_DENIED;

        // TODO Handle older / newer versions

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
.summary('View schema')
.description('View schema');


router.get('/search', function (req, res) {
    try {
        const client = g_lib.getUserFromClientID( req.queryParams.client );
        var qry, par = {uid: client._id}, result, off = 0, cnt = 50;

        if ( req.queryParams.offset != undefined )
            off = req.queryParams.offset;

        if ( req.queryParams.count != undefined && req.queryParams.count <= 100 )
            cnt = req.queryParams.count;

        qry = "for i in sch";

        qry += " filter (i.pub == true || i.own_id == @uid) sort i.id limit " + off + "," + cnt + " return {id:i.id,ver:i.ver,cnt:i.cnt,pub:i.pub,own_nm:i.own_nm,own_id:i.own_id}";
        result = g_db._query( qry, par, {}, { fullCount: true });
        var tot = result.getExtra().stats.fullCount;
        result = result.toArray();

        fixSchOwnNmAr( result );

        result.push({ paging: {off: off, cnt: cnt, tot: tot }});

        res.send( result );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('id', joi.number().integer().min(0).optional(), "ID (partial)")
.queryParam('offset', joi.number().integer().min(0).optional(), "Offset")
.queryParam('count', joi.number().integer().min(1).optional(), "Count")
.summary('Search schemas')
.description('Search schema');
