'use strict';

const   createRouter = require('@arangodb/foxx/router');
const   router = createRouter();
const   joi = require('joi');

const   g_db = require('@arangodb').db;
const   g_lib = require('./support');

module.exports = router;


//==================== SCHEMA API FUNCTIONS

router.post('/create', function (req, res) {
    try {
        const client = g_lib.getUserFromClientID( req.queryParams.client );

        var obj = { cnt: 0, ver: 1, pub: req.body.pub, def: req.body.def };

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

        res.send( sch );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().optional(), "Client ID")
.body(joi.object({
    _sch_id: joi.string().required(),
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

        var sch_new = g_db.sch.update( sch_old._id, obj, { returnNew: true, keepNull: false }).new;

        // TODO Parse definition to find references and add sch_dep edges

        res.send( sch_new );
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



router.get('/view', function (req, res) {
    try {
        //var result = g_db.schema.document( "schema" + (req.queryParams.id.charAt(0) == "/"?"":"/") + req.queryParams.id );
        var result = g_db.sch.firstExample({ id: req.queryParams.id, ver: req.queryParams.ver });
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
.queryParam('ver', joi.number().integer().min(0).required(), "Schema Version")
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

