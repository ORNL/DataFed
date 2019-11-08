/*jshint strict: global */
/*jshint esversion: 6 */
/*jshint multistr: true */
/* globals require */
/* globals module */
/* globals console */

'use strict';

const   createRouter = require('@arangodb/foxx/router');
const   router = createRouter();
const   joi = require('joi');

const   g_db = require('@arangodb').db;
const   g_graph = require('@arangodb/general-graph')._graph('sdmsg');
const   g_lib = require('./support');

module.exports = router;

//==================== QUERY API FUNCTIONS

router.get('/create', function (req, res) {
    try {
        var result = [];

        g_db._executeTransaction({
            collections: {
                read: ["u","uuid","accn","admin"],
                write: ["q","owner"]
            },
            action: function() {
                const client = g_lib.getUserFromClientID( req.queryParams.client );

                if ( client.max_sav_qry >= 0 ){
                    var count = g_db._query("return length(FOR i IN owner FILTER i._to == @id and is_same_collection('q',i._from) RETURN 1)",{id:client._id}).next();

                    if ( count >= client.max_sav_qry )
                        throw [g_lib.ERR_ALLOCATION_EXCEEDED,"Saved query limit reached ("+client.max_sav_qry+"). Contact system administrator to increase limit."];
                }

                var time = Math.floor( Date.now()/1000 );

                var obj = { query: req.queryParams.query, query_comp: req.queryParams.query_comp, ct: time, ut: time, owner: client._id };

                g_lib.procInputParam( req.queryParams, "title", false, obj );

                if ( req.queryParams.use_owner )
                    obj.use_owner = true;

                if ( req.queryParams.use_sh_usr )
                    obj.use_sh_usr = true;

                if ( req.queryParams.use_sh_prj )
                    obj.use_sh_prj = true;

                var qry = g_db.q.save( obj, { returnNew: true });
                g_db.owner.save({ _from: qry.new._id, _to: client._id });

                qry.new.id = qry.new._id;

                delete qry.new._id;
                delete qry.new._key;
                delete qry.new._rev;

                result.push( qry.new );
            }
        });

        res.send( result );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('title', joi.string().required(), "Query Title")
.queryParam('query', joi.string().required(), "Query expression")
.queryParam('query_comp', joi.string().required(), "Compiled query expression")
.queryParam('use_owner', joi.bool().optional(), "Query uses owner param")
.queryParam('use_sh_usr', joi.bool().optional(), "Query uses shared users param")
.queryParam('use_sh_prj', joi.bool().optional(), "Query uses shared projects param")
.summary('Create a query')
.description('Create a query');


router.get('/update', function (req, res) {
    try {
        var result = [];

        g_db._executeTransaction({
            collections: {
                read: ["u","uuid","accn","admin"],
                write: ["q","owner"]
            },
            action: function() {
                const client = g_lib.getUserFromClientID( req.queryParams.client );
                var qry = g_db.q.document( req.queryParams.id );

                if ( client._id != qry.owner && !client.is_admin) {
                    throw g_lib.ERR_PERM_DENIED;
                }

                var time = Math.floor( Date.now()/1000 );
                var obj = { ut: time };

                g_lib.procInputParam( req.queryParams, "title", true, obj );

                if ( req.queryParams.query != undefined )
                    obj.query = req.queryParams.query;

                if ( req.queryParams.query_comp != undefined )
                    obj.query_comp = req.queryParams.query_comp;

                if ( req.queryParams.use_owner != undefined )
                    obj.use_owner = req.queryParams.use_owner;

                if ( req.queryParams.use_sh_usr != undefined )
                    obj.use_sh_usr = req.queryParams.use_sh_usr;

                if ( req.queryParams.use_sh_prj != undefined )
                    obj.use_sh_prj = req.queryParams.use_sh_prj;

                qry = g_db._update( qry._id, obj, { keepNull: false, returnNew: true }).new;

                qry.id = qry._id;
                delete qry._id;
                delete qry._key;
                delete qry._rev;

                result.push( qry );
            }
        });

        res.send( result );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('id', joi.string().required(), "Query ID")
.queryParam('title', joi.string().optional(), "Query Title")
.queryParam('query', joi.string().optional(), "Query expression")
.queryParam('query_comp', joi.string().optional(), "Compiled query expression")
.queryParam('use_owner', joi.bool().optional(), "Query uses owner param")
.queryParam('use_sh_usr', joi.bool().optional(), "Query uses shared users param")
.queryParam('use_sh_prj', joi.bool().optional(), "Query uses shared projects param")
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

        res.send( [qry] );
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
        var qry = g_db.q.document( req.queryParams.id );

        if ( client._id != qry.owner && !client.is_admin) {
            throw g_lib.ERR_PERM_DENIED;
        }

        g_graph.q.remove( qry._id );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('id', joi.string().required(), "Query ID")
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

router.get('/exec', function (req, res) {
    try {
        const client = g_lib.getUserFromClientID( req.queryParams.client );
        var qry = g_db.q.document( req.queryParams.id );

        if ( client._id != qry.owner && !client.is_admin ){
            throw g_lib.ERR_PERM_DENIED;
        }

        var params = {};

        if ( qry.use_owner )
            params.client = qry.owner;

        if ( qry.use_sh_usr )
            params.users = g_lib.usersWithClientACLs( qry.owner, true );

        if ( qry.use_sh_prj )
            params.projs = g_lib.projectsWithClientACLs( qry.owner, true );

        if ( req.queryParams.offset )
            params.offset = req.queryParams.offset;
        else
            params.offset = 0;

        if ( req.queryParams.count ){
            params.count = Math.min(req.queryParams.count,1000-params.offset);
        }else{
            params.count = Math.min(50,1000-params.offset);
        }

        res.send( g_db._query( qry.query_comp, params ));
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
