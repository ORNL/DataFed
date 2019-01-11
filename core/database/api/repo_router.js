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
    var result;

    if ( req.queryParams.admin ){
        result = g_db._query( "for v in 1..1 inbound @admin admin filter is_same_collection('repo',v) return v",{admin:req.queryParams.admin}).toArray();
    }else{
        result = g_db._query( "for i in repo return i").toArray();
    }

    var repo;
    for ( var i in result ){
        repo = result[i];

        repo.id = repo._id;
        delete repo._id;
        delete repo._key;
        delete repo._rev;

        if ( !req.queryParams.details ){
            delete repo.capacity;
            delete repo.pub_key;
            delete repo.address;
            delete repo.endpoint;
        }
    }

    res.send( result );
})
.queryParam('admin', joi.string().optional(), "Admin UID of repo(s) to list")
.queryParam('details', joi.boolean().optional(), "Show additional record details")
.summary('List repo servers')
.description('List repo servers. Will list all if no admin UID is provided; otherwise, repos administered by UID.');


router.get('/view', function (req, res) {
    try {
        var repo = g_db.repo.document( req.queryParams.id );

        repo.admins = [];
        var admins = g_db.admin.byExample({_from:req.queryParams.id}).toArray();
        for ( var i in admins )
            repo.admins.push( admins[i]._to );
        repo.id = repo._id;
        delete repo._id;
        delete repo._key;
        delete repo._rev;

        res.send([repo]);
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
                    capacity: req.queryParams.capacity,
                    pub_key: req.queryParams.pub_key,
                    address: req.queryParams.address,
                    endpoint: req.queryParams.endpoint,
                    path: req.queryParams.endpoint
                };

                if ( !obj.path.endsWith("/"))
                    obj.path += "/";

                if ( req.queryParams.title )
                    obj.title = req.queryParams.title;

                if ( req.queryParams.desc )
                    obj.desc = req.queryParams.desc;

                if ( req.queryParams.domain )
                    obj.domain = req.queryParams.domain;

                if ( req.queryParams.exp_path ){
                    obj.exp_path = req.queryParams.exp_path;
                    if ( !obj.exp_path.endsWith("/"))
                        obj.exp_path += "/";
                }

                var repo = g_db.repo.save( obj, { returnNew: true });

                for ( var i in req.queryParams.admins ) {
                    if ( !g_db._exists( req.queryParams.admins[i] ))
                        throw g_lib.ERR_USER_NOT_FOUND;
                    g_db.admin.save({ _from: repo._id, _to: req.queryParams.admins[i] });
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
.queryParam('capacity', joi.number().required(), "Total storage capacity (in bytes)")
.queryParam('pub_key', joi.string().required(), "Repo server public key")
.queryParam('address', joi.string().required(), "Repo server address")
.queryParam('endpoint', joi.string().required(), "Repo server endpoint")
.queryParam('path', joi.string().required(), "Repo server data path")
.queryParam('domain', joi.string().optional(), "Repo server domain (must be unique)")
.queryParam('exp_path', joi.string().optional(), "Repo server export data path")
.queryParam('admins', joi.array().items(joi.string()).required(), "Repo admin user IDs")
.summary('Create a repo server record')
.description('Create a repo server record.');
// TODO Add base path to repo

router.get('/update', function (req, res) {
    try {
        g_db._executeTransaction({
            collections: {
                read: ["u"],
                write: ["repo","admin"]
            },
            action: function() {
                var client = g_lib.getUserFromClientID( req.queryParams.client );
                g_lib.ensureAdminPermRepo( client, req.queryParams.id );
                var obj = {};

                if ( req.queryParams.title )
                    obj.title = req.queryParams.title;

                if ( req.queryParams.desc )
                    obj.desc = req.queryParams.desc;

                if ( req.queryParams.domain )
                    obj.domain = req.queryParams.domain;

                if ( req.queryParams.exp_path ){
                    obj.exp_path = req.queryParams.exp_path;
                    if ( !obj.exp_path.endsWith("/"))
                        obj.exp_path += "/";
                }

                if ( req.queryParams.capacity )
                    obj.capacity = req.queryParams.capacity;

                g_db._update( req.queryParams.id, obj );

                if ( req.queryParams.admins ){
                    g_db.admin.removeByExample({_from: req.queryParams.id});
                    for ( var i in req.queryParams.admins ) {
                        if ( !g_db._exists( req.queryParams.admins[i] ))
                            throw g_lib.ERR_USER_NOT_FOUND;
                        g_db.admin.save({ _from: req.queryParams.id, _to: req.queryParams.admins[i] });
                    }
                }
            }
        });
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('id', joi.string().required(), "Repo server ID")
.queryParam('title', joi.string().optional(), "Title")
.queryParam('desc', joi.string().optional(), "Description")
.queryParam('capacity', joi.number().optional(), "Total storage capacity (in bytes)")
.queryParam('domain', joi.string().optional(), "Repo server domain (must be unique)")
.queryParam('exp_path', joi.string().optional(), "Repo server export data path")
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
                var client = g_lib.getUserFromClientID( req.queryParams.client );
                g_lib.ensureAdminPermRepo( client, req.queryParams.id );

                const graph = require('@arangodb/general-graph')._graph('sdmsg');

                // TODO There may be other tasks to perform prior to deleting server record
                graph.repo.remove( req.queryParams.id );
            }
        });
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('id', joi.string().required(), "Repo server ID")
.summary('Delete repo server record')
.description('Delete repo server record');

router.get('/alloc/list/by_repo', function (req, res) {
    var client = g_lib.getUserFromClientID( req.queryParams.client );
    var repo = g_db.repo.document( req.queryParams.repo );

    g_lib.ensureAdminPermRepo( client, repo._id );

    var result = g_db._query("for v, e in 1..1 inbound @repo alloc return {id:v._id,name:v.name?v.name:v.title,repo:@repo,alloc:e.alloc,usage:e.usage,path:e.path}", { repo: repo._id } ).toArray();

    res.send( result );
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('repo', joi.string().required(), "Repo ID")
.summary('List all allocations for a repo')
.description('List all allocations a repo');

router.get('/alloc/list/by_owner', function (req, res) {
    var result = g_db.alloc.byExample({_from: req.queryParams.owner}).toArray();
    var obj;
    for ( var i in result ){
        obj = result[i];

        if ( req.queryParams.stats ){
            obj.stats = getAllocStats( obj._to, req.queryParams.owner );
        }

        delete obj._from;
        obj.repo = obj._to;
        delete obj._to;
        delete obj._key;
        delete obj._id;
        delete obj._rev;
    }

    res.send( result );
})
.queryParam('owner', joi.string().required(), "Owner ID (user or project)")
.queryParam('stats', joi.boolean().optional(), "Include statistics")
.summary('List owner\'s repo allocations')
.description('List owner\'s repo allocations (user or project ID)');

router.get('/alloc/list/by_object', function (req, res) {
    var client = g_lib.getUserFromClientID( req.queryParams.client );
    var obj_id = g_lib.resolveID( req.queryParams.object, client );
    var owner_id = g_db.owner.firstExample({_from: obj_id})._to;
    var result = g_db.alloc.byExample({_from: owner_id}).toArray();

    var obj;
    for ( var i in result ){
        obj = result[i];
        delete obj._from;
        obj.repo = obj._to;
        delete obj._to;
        delete obj._key;
        delete obj._id;
        delete obj._rev;
    }
    res.send( result );
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('object', joi.string().required(), "Object ID (data or collection ID or alias)")
.summary('List object repo allocations')
.description('List object repo allocations');

function getAllocStats( a_repo, a_subject ){
    var sizes;

    if ( a_subject ){
        var alloc = g_db.alloc.firstExample({_from:a_subject,_to:a_repo});
        if ( alloc ){
            sizes = g_db._query("for v,e,p in 2..2 inbound @repo loc, outbound owner filter v._id == @subj || p.edges[0].parent == @alloc return p.vertices[1].size", { repo: a_repo, alloc: alloc._id, subj: a_subject });
        }
    }else{
        sizes = g_db._query("for v in 1..1 inbound @repo loc return v.size", { repo: a_repo });
    }

    var size;
    var count = 0;
    var file_count = 0;
    var tot_sz = 0;
    var hist = [0,0,0,0,0,0,0,0,0,0,0,0,0];
    var l;

    while ( sizes.hasNext() ){
        size = sizes.next();
        count++;

        if ( size > 0 ){
            tot_sz += size;
            file_count++;
            l = Math.floor(Math.log10( size ));
            hist[Math.min(l,12)]++;
        }
    }

    /*if ( file_count > 0 ){
        for ( var i = 0; i < 12; ++i )
            hist[i] = 100*hist[i]/file_count;
    }*/

    return { records:count, files:file_count, total_sz:tot_sz, histogram:hist };
}

router.get('/alloc/stats', function (req, res) {
    try {
        var client = g_lib.getUserFromClientID( req.queryParams.client );
        g_lib.ensureAdminPermRepo( client, req.queryParams.repo );
        var result = getAllocStats( req.queryParams.repo, req.queryParams.subject );
        res.send( result );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('repo', joi.string().required(), "Repo ID")
.queryParam('subject', joi.string().optional(), "User/project ID of allocation")
.summary('View allocation statistics')
.description('View allocation statistics (or repo stats if no subject provided)');

router.get('/alloc/set', function (req, res) {
    try {
        g_db._executeTransaction({
            collections: {
                read: ["u","uuid","accn","repo","admin"],
                write: ["alloc"]
            },
            action: function() {
                var client = g_lib.getUserFromClientID( req.queryParams.client );
                var subject_id;
                if ( req.queryParams.subject.startsWith("p/"))
                    subject_id = req.queryParams.subject;
                else
                    subject_id = g_lib.getUserFromClientID( req.queryParams.subject )._id;

                // Ensure subject exists
                if ( !g_db._exists( subject_id ))
                    throw g_lib.ERR_INVALID_ID;

                var repo = g_db.repo.document( req.queryParams.repo );

                g_lib.ensureAdminPermRepo( client, repo._id );
                var alloc = g_db.alloc.firstExample({ _from: subject_id, _to: repo._id });

                if ( req.queryParams.alloc == 0 && alloc ){
                    // Check if there are any records using this repo and fail if so
                    // Check for sub allocations
                    if ( g_db.loc.firstExample({ parent: alloc._id }))
                        throw g_lib.ERR_ALLOC_IN_USE;
                    // Check for direct use of allocation
                    var records = g_db._query("for v,e,p in 2..2 inbound @repo loc, outbound owner filter v._id == @subj return p.vertices[1]._id", { repo: repo._id, subj: subject_id }).toArray();
                    if ( records.length )
                        throw g_lib.ERR_ALLOC_IN_USE;

                    g_db.alloc.removeByExample({ _from: subject_id, _to: repo._id });
                } else {
                    if ( alloc ){
                        g_db.alloc.update( alloc._id, { alloc: req.queryParams.alloc });
                    } else {
                        var path;
                        if ( subject_id[0] == "p" )
                            path = repo.path + "project/";
                        else
                            path = repo.path + "user/";
                        g_db.alloc.save({ _from: subject_id, _to: repo._id, alloc: req.queryParams.alloc, usage: 0, path: path + subject_id.substr(2) + "/" });
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
