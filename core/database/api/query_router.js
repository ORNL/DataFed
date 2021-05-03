'use strict';

const   createRouter = require('@arangodb/foxx/router');
const   router = createRouter();
const   joi = require('joi');

const   g_db = require('@arangodb').db;
const   g_graph = require('@arangodb/general-graph')._graph('sdmsg');
const   g_lib = require('./support');

module.exports = router;

//==================== QUERY API FUNCTIONS


router.post('/create', function (req, res) {
    try {
        var result;

        g_db._executeTransaction({
            collections: {
                read: ["u","uuid","accn","admin"],
                write: ["q","owner"]
            },
            action: function() {
                const client = g_lib.getUserFromClientID( req.queryParams.client );

                // Check max number of saved queries
                if ( client.max_sav_qry >= 0 ){
                    var count = g_db._query("return length(FOR i IN owner FILTER i._to == @id and is_same_collection('q',i._from) RETURN 1)",{id:client._id}).next();

                    if ( count >= client.max_sav_qry )
                        throw [g_lib.ERR_ALLOCATION_EXCEEDED,"Saved query limit reached ("+client.max_sav_qry+"). Contact system administrator to increase limit."];
                }

                var time = Math.floor( Date.now()/1000 );

                var obj = req.body;

                obj.owner = client._id;
                obj.ct = time;
                obj.ut = time;

                g_lib.procInputParam( req.body, "title", false, obj );

                var qry = g_db.q.save( obj, { returnNew: true }).new;
                g_db.owner.save({ _from: qry._id, _to: client._id });

                qry.id = qry._id;

                delete qry._id;
                delete qry._key;
                delete qry._rev;
                delete qry.qry_begin;
                delete qry.qry_end;
                delete qry.qry_filter;
                delete qry.params;
                delete qry.lmit;

                result = qry;
            }
        });

        res.send( result );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.body( joi.object({
    title: joi.string().required(),
    qry_begin: joi.string().required(),
    qry_end: joi.string().required(),
    qry_filter: joi.string().allow('').required(),
    params: joi.any().required(),
    limit: joi.number().integer().required(),
    query: joi.any().required()
}).required(), 'Query fields' )
.summary('Create a query')
.description('Create a query');


router.post('/update', function (req, res) {
    try {
        var result;

        g_db._executeTransaction({
            collections: {
                read: ["u","uuid","accn","admin"],
                write: ["q","owner"]
            },
            action: function() {
                const client = g_lib.getUserFromClientID( req.queryParams.client );
                var qry = g_db.q.document( req.body.id );

                if ( client._id != qry.owner && !client.is_admin ) {
                    throw g_lib.ERR_PERM_DENIED;
                }

                var time = Math.floor( Date.now()/1000 ),
                    obj = req.body;

                obj.ut = time;
                g_lib.procInputParam( req.body, "title", true, obj );

                qry = g_db._update( qry._id, obj, { keepNull: false, returnNew: true }).new;

                qry.id = qry._id;

                delete qry._id;
                delete qry._key;
                delete qry._rev;
                delete qry.qry_begin;
                delete qry.qry_end;
                delete qry.qry_filter;
                delete qry.params;
                delete qry.lmit;

                result = qry;
            }
        });

        res.send( result );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.body( joi.object({
    id: joi.string().required(),
    title: joi.string().optional(),
    qry_begin: joi.string().required(),
    qry_end: joi.string().required(),
    qry_filter: joi.string().allow('').required(),
    params: joi.any().required(),
    limit: joi.number().integer().required(),
    query: joi.any().required()
}).required(), 'Query fields' )
.summary('Update a saved query')
.description('Update a saved query');

router.get('/view', function (req, res) {
    try {
        const client = g_lib.getUserFromClientID( req.queryParams.client );
        var qry = g_db.q.document( req.queryParams.id );

        if ( client._id != qry.owner && !client.is_admin) {
            throw g_lib.ERR_PERM_DENIED;
        }

        qry.id = qry._id;
        delete qry._id;
        delete qry._key;
        delete qry._rev;
        delete qry.qry_begin;
        delete qry.qry_end;
        delete qry.qry_filter;
        delete qry.params;
        delete qry.lmit;

        res.send( qry );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('id', joi.string().required(), "Query ID")
.summary('View specified query')
.description('View specified query');


router.get('/delete', function (req, res) {
    try {
        const client = g_lib.getUserFromClientID( req.queryParams.client );
        var owner;

        for ( var i in req.queryParams.ids ){
            if ( !req.queryParams.ids[i].startsWith( "q/" )){
                throw [ g_lib.ERR_INVALID_PARAM, "Invalid query ID '" + req.queryParams.ids[i] + "'."];
            }

            owner = g_db.owner.firstExample({ _from: req.queryParams.ids[i] });
            if ( !owner ){
                throw [ g_lib.ERR_NOT_FOUND, "Query '" + req.queryParams.ids[i] + "' not found."];
            }

            if ( client._id != owner._to && !client.is_admin ) {
                throw g_lib.ERR_PERM_DENIED;
            }

            g_graph.q.remove( owner._from );
        }
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('ids', joi.array().items(joi.string()).required(), "Query IDs")
.summary('Delete specified query')
.description('Delete specified query');


router.get('/list', function (req, res) {
    try {
        const client = g_lib.getUserFromClientID( req.queryParams.client );

        var qry = "for v in 1..1 inbound @user owner filter is_same_collection('q',v) sort v.title";
        var result;

        if ( req.queryParams.offset != undefined && req.queryParams.count != undefined ){
            qry += " limit " + req.queryParams.offset + ", " + req.queryParams.count;
            qry += " return { id: v._id, title: v.title }";
            result = g_db._query( qry, { user: client._id },{},{fullCount:true});
            var tot = result.getExtra().stats.fullCount;
            result = result.toArray();
            result.push({paging:{off:req.queryParams.offset,cnt:req.queryParams.count,tot:tot}});
        }
        else{
            qry += " return { id: v._id, title: v.title }";
            result = g_db._query( qry, { user: client._id });
        }

        res.send( result );

    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('offset', joi.number().integer().min(0).optional(), "Offset")
.queryParam('count', joi.number().integer().min(1).optional(), "Count")
.summary('List client saved queries')
.description('List client saved queries');

function execQuery( client, scope, mode, query ){
    var col_chk = true;

    switch ( scope ){
        case g_lib.SS_PROJECT:
            if ( !query.params.owner )
                throw [g_lib.ERR_MISSING_REQ_PARAM, "Project ID not specified." ];

            if ( !query.params.owner.startsWith( "p/" ))
                throw [g_lib.ERR_INVALID_PARAM, "Invalid project ID: " + query.params.owner ];

            if ( !g_db.p.exists( query.params.owner ))
                throw [g_lib.ERR_NOT_FOUND,"Project " + query.params.owner + " not found"];

            //console.log("chk 1");

            var role = g_lib.getProjectRole( client._id, query.params.owner );

            //console.log("chk 2");

            if( role == g_lib.PROJ_MEMBER ){
                // If no collections specified, add project root
                if ( !query.params.cols ){
                    query.params.cols = ["c/p_" + query.params.owner.substr(2) + "_root"];
                    col_chk = false;
                }
            }else if ( role != g_lib.PROJ_ADMIN && role != g_lib.PROJ_MANAGER ){
                throw g_lib.ERR_PERM_DENIED;
            }
            break;
        case g_lib.SS_SHARED:
            // Get collections shared by owner (user/project)
            if ( !query.params.owner )
                throw [g_lib.ERR_MISSING_REQ_PARAM, "Project / user ID not specified." ];

            if ( query.params.owner.startsWith( "p/" )){
                if ( !g_db.p.exists( query.params.owner ))
                    throw [g_lib.ERR_NOT_FOUND,"Project " + query.params.owner + " not found"];
            }else if ( query.params.owner.startsWith( "u/" )){
                if ( !g_db.u.exists( query.params.owner ))
                    throw [g_lib.ERR_NOT_FOUND,"user " + query.params.owner + " not found"];
            }else{
                throw [g_lib.ERR_INVALID_PARAM, "Invalid project / user ID: " + query.params.owner ];
            }

            //console.log("chk 3");

            if ( !query.params.cols ){
                query.params.cols = g_db._query("for v in 1..2 inbound @client member, acl filter v.owner == @owner and is_same_collection('c',v) return v._id", { client: client._id, owner: query.params.owner }).toArray();
                col_chk = false;
            }

            break;
    }

    //console.log("chk 4");

    // If user-specified collections given, must verify scope and access, then expand to include all sub-collections
    if ( query.params.cols ){
        //console.log("proc cols");
        if ( col_chk ){
            var col;
            for ( var c in query.params.cols ){
                col = query.params.cols[c];

                if ( !col.startsWith( "c/" )){
                    throw [g_lib.ERR_INVALID_PARAM, "Invalid collection ID: " + col ];
                }

                if ( !g_db.c.exists( col )){
                    throw [g_lib.ERR_NOT_FOUND,"Collection '" + col + "' not found"];
                }
                
                if ( query.params.owner ){
                    if ( g_db.owner.firstExample({ _from: col })._to != query.params.owner ){
                        throw [ g_lib.ERR_INVALID_PARAM, "Collection '" + col + "' not in search scope." ];
                    }
                }
            }
        }

        query.params.cols = g_lib.expandSearchCollections( client, query.params.cols );
        //console.log("exp cols:",query.params.cols);
    }

    //console.log("chk 5");

    if ( query.params.sch_id ){
        // sch_id is id:ver
        var idx = query.params.sch_id.indexOf(":");
        if ( idx < 0 ){
            throw [ g_lib.ERR_INVALID_PARAM, "Schema ID missing version number suffix." ];
        }
        var sch_id = query.params.sch_id.substr( 0, idx ),
            sch_ver = parseInt( query.params.sch_id.substr( idx + 1 ));

        query.params.sch = g_db.sch.firstExample({ id: sch_id, ver: sch_ver });
        if ( !query.params.sch )
            throw [ g_lib.ERR_NOT_FOUND, "Schema '" + sch_id + "-" + sch_ver + "' does not exist." ];

        query.params.sch = query.params.sch._id;
        delete query.params.sch_id;
    }

    // Assemble query based on filter and collection state
    var qry = query.qry_begin;

    if ( query.params.cols ){
        if ( mode == g_lib.SM_DATA ){
            qry += " for e in item filter e._to == i._id and e._from in @cols";
        }else{
            qry += " filter i._id in @cols";
        }

        if ( query.qry_filter ){
            qry += " and " + query.qry_filter;
        }
    }else if ( query.qry_filter ){
        qry += " filter " + query.qry_filter;
    }

    qry += query.qry_end;

    //console.log( "execqry" );
    //console.log( "qry", qry );
    //console.log( "params", query.params );

    var item, count, result = g_db._query( qry, query.params, {}, { fullCount: true }).toArray();

    if ( result.length > query.limit ){
        result.length = query.limit;
        count = query.limit + 1;
    }else{
        count = result.length;
    }

    for ( var i in result ){
        item = result[i];

        if ( item.owner_name && item.owner_name.length )
            item.owner_name = item.owner_name[0];
        else
            item.owner_name = null;

        if ( item.desc && item.desc.length > 120 ){
            item.desc = item.desc.slice(0,120) + " ...";
        }

        item.notes = g_lib.annotationGetMask( client, item._id );

        if ( item.md_err ){
            item.notes |= g_lib.NOTE_MASK_MD_ERR;
        }
    }

    result.push({ paging: { off: query.params.off, cnt: result.length, tot: query.params.off + count }});

    return result;
}

router.get('/exec', function (req, res) {
    try {
        const client = g_lib.getUserFromClientID( req.queryParams.client );
        var qry = g_db.q.document( req.queryParams.id );

        if ( client._id != qry.owner && !client.is_admin ){
            throw g_lib.ERR_PERM_DENIED;
        }

        if ( req.queryParams.offset != undefined && req.queryParams.count != undefined ){
            qry.params.off = req.queryParams.offset;
            qry.params.cnt = req.queryParams.count;
        }

        var results = execQuery( client, qry.query.scope, qry.query.mode, qry );

        res.send( results );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('id', joi.string().required(), "Query ID")
.queryParam('offset', joi.number().integer().min(0).max(999).optional(), "Offset")
.queryParam('count', joi.number().integer().min(1).max(1000).optional(), "Count")
.summary('Execute specified query')
.description('Execute specified query');


router.post('/exec/direct', function (req, res) {
    try {
        const client = g_lib.getUserFromClientID_noexcept( req.queryParams.client );

        var results = execQuery( client, req.body.scope, req.body.mode, req.body );

        res.send( results );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.body(joi.object({
    scope: joi.number().integer().required(),
    mode: joi.number().integer().required(),
    qry_begin: joi.string().required(),
    qry_end: joi.string().required(),
    qry_filter: joi.string().optional().allow(""),
    params: joi.object().required(),
    limit: joi.number().integer().required()
}).required(), 'Collection fields')
.summary('Execute published data search query')
.description('Execute published data search query');
