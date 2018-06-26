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


router.get('/list', function (req, res) {
    var result = g_db._query( "for i in repo return i").toArray();
    res.send( result );
})
.queryParam('details', joi.boolean().optional(), "Show additional record details")
.summary('List all repo servers')
.description('List all repo servers');


router.get('/view', function (req, res) {
    try {
        var repo = g_db.repo.document( req.queryParams.id );

        repo.id = repo._id;
        delete repo._id;
        delete repo._key;
        delete repo._rev;

        res.send( repo );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('id', joi.string().required(), "Repo server ID")
.summary('View repo server record')
.description('View repo server record');


router.get('/create', function (req, res) {
    try {
        g_db._executeTransaction({
            collections: {
                read: ["u"],
                write: ["repo","admin"]
            },
            action: function() {
                var obj = {
                    _key: req.queryParams.id,
                    total_sz: req.queryParams.total_sz,
                    pub_key: req.queryParams.pub_key,
                    address: req.queryParams.address,
                    endpoint: req.queryParams.endpoint
                };

                if ( req.queryParams.title )
                    obj.title = req.queryParams.title;

                if ( req.queryParams.desc )
                    obj.desc = req.queryParams.desc;

                var repo = g_db.repo.save( obj, { returnNew: true });

                for ( var i in req.queryParams.admins ) {
                    if ( !g_db._exists( "u/" + req.queryParams.admins[i] ))
                        throw g_lib.ERR_USER_NOT_FOUND;
                    g_db.admin.save({ _from: repo._id, _to: "u/" + req.queryParams.admins[i] });
                }

                repo.new.id = repo.new._id;
                delete repo.new._id;
                delete repo.new._key;
                delete repo.new._rev;
                res.send( repo.new );
            }
        });
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('id', joi.string().required(), "Repo server ID")
.queryParam('title', joi.string().optional(), "Title")
.queryParam('desc', joi.string().optional(), "Description")
.queryParam('total_sz', joi.number().required(), "Total storage size (capacity) (GB)")
.queryParam('pub_key', joi.string().required(), "Repo server public key")
.queryParam('address', joi.string().required(), "Repo server address")
.queryParam('endpoint', joi.string().required(), "Repo server endpoint")
.queryParam('admins', joi.array().items(joi.string()).required(), "Repo admin user IDs")
.summary('Create a repo server record')
.description('Create a repo server record.');
// TODO Add base path to repo

router.get('/update', function (req, res) {
})
.queryParam('id', joi.string().required(), "Repo server ID")
.queryParam('title', joi.string().optional(), "Title")
.queryParam('desc', joi.string().optional(), "Description")
.queryParam('total_sz', joi.number().optional(), "Total storage size (capacity) (GB)")
.queryParam('pub_key', joi.string().optional(), "Repo server public key")
.queryParam('address', joi.string().optional(), "Repo server address")
.queryParam('endpoint', joi.string().optional(), "Repo server endpoint")
.queryParam('admins', joi.array().items(joi.string()).optional(), "Repo admin user IDs")
.summary('Update a repo server record')
.description('Update a repo server record');


router.get('/delete', function (req, res) {
    try {
        g_db._executeTransaction({
            collections: {
                read: [],
                write: ["repo","alloc","loc"]
            },
            action: function() {
                const graph = require('@arangodb/general-graph')._graph('sdmsg');

                // TODO There may be other tasks to perform prior to deleting server record
                graph.repo.remove( req.queryParams.id );
            }
        });
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('id', joi.string().required(), "Repo server ID")
.summary('Delete repo server record')
.description('Delete repo server record');

router.get('/alloc/list/by_repo', function (req, res) {
    var client = g_lib.getUserFromClientID( req.queryParams.client );
    var repo = g_db.repo.document( "repo/" + req.queryParams.repo );

    g_lib.ensureAdminPermRepo( client, repo._id );

    var result = g_db._query("for v, e in 1..1 inbound @repo alloc return { uid: v._id, name: v.name, alloc: e.alloc, path: e.path }", { repo: repo._id } ).toArray();
    var obj;
    for ( var i in result ){
        obj = result[i];
        obj.uid = obj.uid.substr(2);
    }
    res.send( result );
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('repo', joi.string().required(), "Repo ID")
.summary('List all allocations for a repo')
.description('List all allocations a repo');

router.get('/alloc/list/by_user', function (req, res) {
    var user = g_lib.getUserFromClientID( req.queryParams.client );

    var result = g_db._query("for v, e in 1..1 outbound @user alloc return { id: e._to, alloc: e.alloc, path: e.path }", { user: user._id } ).toArray();
    var obj;
    for ( var i in result ){
        obj = result[i];
        obj.id = obj.id.substr(5);
    }
    res.send( result );
})
.queryParam('client', joi.string().required(), "Client ID")
.summary('List user\'s repo allocations')
.description('List user\'s repo allocations');

router.get('/alloc/set', function (req, res) {
    try {
        g_db._executeTransaction({
            collections: {
                read: ["u","uuid","accn","repo","admin"],
                write: ["alloc"]
            },
            action: function() {
                var client = g_lib.getUserFromClientID( req.queryParams.client );
                var subject = g_lib.getUserFromClientID( req.queryParams.subject );
                var repo = g_db.repo.document( "repo/" + req.queryParams.repo );

                g_lib.ensureAdminPermRepo( client, repo._id );

                if ( req.queryParams.alloc == 0 ){
                    g_db.alloc.removeByExample({ _from: subject._id, _to: repo._id });
                } else {
                    var alloc = g_db.alloc.firstExample({ _from: subject._id, _to: repo._id });
                    if ( alloc ){
                        g_db.alloc.update( alloc._id, { alloc: req.queryParams.alloc });
                    } else {
                        g_db.alloc.save({ _from: subject._id, _to: repo._id, alloc: req.queryParams.alloc, usage: 0, path: "/data/" + subject._key + "/" });
                    }
                }
            }
        });
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('subject', joi.string().required(), "User/project ID to receive allocation")
.queryParam('repo', joi.string().required(), "Repo ID")
.queryParam('alloc', joi.number().required(), "Allocation (GB)")
.summary('Set user/project repo allocation')
.description('Set user repo/project allocation. Only repo admin can set allocations.');
