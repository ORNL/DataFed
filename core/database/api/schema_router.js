'use strict';

const   createRouter = require('@arangodb/foxx/router');
const   router = createRouter();
const   joi = require('joi');

const   g_db = require('@arangodb').db;
const   g_lib = require('./support');

module.exports = router;


//==================== SCHEMA API FUNCTIONS

router.get('/view', function (req, res) {
    try {
        //var result = g_db.schema.document( "schema" + (req.queryParams.id.charAt(0) == "/"?"":"/") + req.queryParams.id );
        var result = g_db.sch.firstExample({ id: req.queryParams.id });
        delete result._id;
        delete result._key;
        delete result._rev;

        res.send( result );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().optional(), "Client ID")
.queryParam('id', joi.string().required(), "ID of schema")
.summary('View schema')
.description('View schema');

router.get('/search', function (req, res) {
    try {
        var qry, par = {}, result, off = 0, cnt = 50;

        if ( req.queryParams.offset != undefined )
            off = req.queryParams.offset;

        if ( req.queryParams.count != undefined && req.queryParams.count <= 100 )
            cnt = req.queryParams.count;

        qry = "for i in sch";

        qry += " sort i.id limit " + off + "," + cnt + " return {id:i.id,ver:i.ver,cnt:i.cnt}";
        result = g_db._query( qry, par, {}, { fullCount: true });
        var tot = result.getExtra().stats.fullCount;
        result = result.toArray();
        result.push({ paging: {off: off, cnt: cnt, tot: tot }});

        res.send( result );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().optional(), "Client ID")
.queryParam('id', joi.number().integer().min(0).optional(), "ID (partial)")
.queryParam('offset', joi.number().integer().min(0).optional(), "Offset")
.queryParam('count', joi.number().integer().min(1).optional(), "Count")
.summary('Search schemas')
.description('Search schema');

/*
router.get('/list', function (req, res) {
    try {
        var qry, par = {}, result, off = 0, cnt = 50;

        if ( req.queryParams.offset != undefined )
            off = req.queryParams.offset;

        if ( req.queryParams.count != undefined && req.queryParams.count <= 100 )
            cnt = req.queryParams.count;

        if ( req.queryParams.id ){
            qry = "for i in 1..1 inbound @par top filter is_same_collection('t',i)",
            par.par = req.queryParams.id;
        }else{
            qry = "for i in t filter i.top == true";
        }

        qry += " sort i.title limit " + off + "," + cnt + " return {_id:i._id, title: i.title, admin: i.admin, coll_cnt: i.coll_cnt}";
        result = g_db._query( qry, par, {}, { fullCount: true });
        var tot = result.getExtra().stats.fullCount;
        result = result.toArray();
        result.push({ paging: {off: off, cnt: cnt, tot: tot }});

        res.send( result );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().optional(), "Client ID")
.queryParam('id', joi.string().optional(), "ID of topic to list (omit for top-level)")
.queryParam('offset', joi.number().integer().min(0).optional(), "Offset")
.queryParam('count', joi.number().integer().min(1).optional(), "Count")
.summary('List topics')
.description('List topics under specified topic ID. If ID is omitted, lists top-level topics.');


router.get('/view', function (req, res) {
    try {
        if ( !g_db.t.exists( req.queryParams.id ))
            throw [g_lib.ERR_NOT_FOUND,"Topic, "+req.queryParams.id+", not found"];

        var topic = g_db.t.document( req.queryParams.id );

        res.send( [topic] );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().optional(), "Client ID")
.queryParam('id', joi.string().optional(), "ID of topic to view")
.summary('View topic')
.description('View a topic.');
*/

