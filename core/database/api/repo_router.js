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
    var client;
    if ( req.queryParams.client ){
        client = g_lib.getUserFromClientID( req.queryParams.client );

        if ( req.queryParams.all && !client.is_admin ){
            throw g_lib.ERR_PERM_DENIED;
        }
    }

    var result,repo,i;

    if ( !client ){
        result = g_db._query( "for v in repo return v").toArray();
        for ( i in result ){
            repo = result[i];
            repo.id = repo._id;
            delete repo._id;
            delete repo._key;
            delete repo._rev;
        }
    }else if( req.queryParams.all ){
        result = g_db._query( "for v in repo return {id:v._id,title:v.title,domain:v.domain}");
    }else{
            if ( req.queryParams.details ){
            result = g_db._query( "for v in 1..1 inbound @admin admin filter is_same_collection('repo',v) return v",{admin:client._id}).toArray();
            for ( i in result ){
                repo = result[i];
                repo.id = repo._id;
                delete repo._id;
                delete repo._key;
                delete repo._rev;
            }
        }else{
            result = g_db._query( "for v in 1..1 inbound @admin admin filter is_same_collection('repo',v) return {id:v._id,title:v.title,domain:v.domain}",{admin:client._id});
        }
    }

    res.send( result );
})
.queryParam('client', joi.string().allow('').optional(), "Client ID")
.queryParam('details', joi.boolean().optional(), "Show additional record details")
.queryParam('all', joi.boolean().optional(), "List all repos (requires admin)")
.summary('List repo servers administered by client')
.description('List repo servers administered by client. If client is an admin and all flag is specified, will list all repos in system.');


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


router.post('/create', function (req, res) {
    try {
        g_db._executeTransaction({
            collections: {
                read: ["u"],
                write: ["repo","admin"]
            },
            action: function() {
                var client = g_lib.getUserFromClientID( req.queryParams.client );
                if ( !client.is_admin )
                    throw obj.ERR_PERM_DENIED;

                var obj = {
                    capacity: req.body.capacity,
                    pub_key: req.body.pub_key,
                    address: req.body.address,
                    endpoint: req.body.endpoint,
                    path: req.body.path
                };

                g_lib.procInputParam( req.body, "id", false, obj );
                g_lib.procInputParam( req.body, "title", false, obj );
                g_lib.procInputParam( req.body, "summary", false, obj );
                g_lib.procInputParam( req.body, "domain", false, obj );

                if ( !obj.path.endsWith("/"))
                    obj.path += "/";

                if ( req.body.exp_path ){
                    obj.exp_path = req.body.exp_path;
                    if ( !obj.exp_path.endsWith("/"))
                        obj.path += "/";
                }

                var repo = g_db.repo.save( obj, { returnNew: true });

                for ( var i in req.body.admins ) {
                    if ( !g_db._exists( req.body.admins[i] ))
                        throw [g_lib.ERR_NOT_FOUND,"User, "+req.body.admins[i]+", not found"];

                    g_db.admin.save({ _from: repo._id, _to: req.body.admins[i] });
                }

                repo.new.id = repo.new._id;
                delete repo.new._id;
                delete repo.new._key;
                delete repo.new._rev;
                res.send([repo.new]);
            }
        });
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.body(joi.object({
    id: joi.string().required(),
    title: joi.string().required(),
    desc: joi.string().optional(),
    domain: joi.string().optional(),
    capacity: joi.number().integer().min(0).max(10000000000).required(),
    pub_key: joi.string().required(),
    address: joi.string().required(),
    endpoint: joi.string().required(),
    path: joi.string().required(),
    exp_path: joi.string().optional(),
    admins: joi.array().items(joi.string()).required()
}).required(), 'Repo fields')
.summary('Create a repo server record')
.description('Create a repo server record.');
// TODO Add base path to repo


router.post('/update', function (req, res) {
    try {
        g_db._executeTransaction({
            collections: {
                read: ["u"],
                write: ["repo","admin"]
            },
            action: function() {
                var client = g_lib.getUserFromClientID( req.queryParams.client );
                g_lib.ensureAdminPermRepo( client, req.body.id );
                var obj = {};

                g_lib.procInputParam( req.body, "title", true, obj );
                g_lib.procInputParam( req.body, "summary", true, obj );
                g_lib.procInputParam( req.body, "domain", true, obj );

                if ( req.body.path ){
                    obj.path = req.body.path;
                    if ( !obj.path.endsWith("/"))
                        obj.path += "/";
                }

                if ( req.body.exp_path ){
                    obj.exp_path = req.body.exp_path;
                    if ( !obj.exp_path.endsWith("/"))
                        obj.exp_path += "/";
                }

                if ( req.body.capacity )
                    obj.capacity = req.body.capacity;

                if ( req.body.pub_key )
                    obj.pub_key = req.body.pub_key;

                if ( req.body.address )
                    obj.address = req.body.address;

                if ( req.body.endpoint )
                    obj.endpoint = req.body.endpoint;

                var repo = g_db._update( req.body.id, obj, {returnNew: true});

                if ( req.body.admins ){
                    g_db.admin.removeByExample({_from: req.body.id});
                    for ( var i in req.body.admins ) {
                        if ( !g_db._exists( req.body.admins[i] ))
                            throw [g_lib.ERR_NOT_FOUND,"User, "+req.body.admins[i]+", not found"];
                        g_db.admin.save({ _from: req.body.id, _to: req.body.admins[i] });
                    }
                }

                repo.new.id = repo.new._id;
                delete repo.new._id;
                delete repo.new._key;
                delete repo.new._rev;
                console.log("repo:",repo.new);
                res.send([repo.new]);
            }
        });
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.body(joi.object({
    id: joi.string().required(),
    title: joi.string().optional(),
    desc: joi.string().optional(),
    domain: joi.string().optional(),
    capacity: joi.number().optional(),
    pub_key: joi.string().optional(),
    address: joi.string().optional(),
    endpoint: joi.string().optional(),
    path: joi.string().optional(),
    exp_path: joi.string().optional(),
    admins: joi.array().items(joi.string()).optional()
}).required(), 'Repo fields')
.summary('Update a repo server record')
.description('Update a repo server record');


router.get('/delete', function (req, res) {
    try {
        g_db._executeTransaction({
            collections: {
                read: [],
                write: ["repo","admin"]
            },
            action: function() {
                var client = g_lib.getUserFromClientID( req.queryParams.client );

                if ( !g_db._exists( req.queryParams.id ))
                    throw [g_lib.ERR_NOT_FOUND,"Repo, "+req.queryParams.id+", not found"];

                g_lib.ensureAdminPermRepo( client, req.queryParams.id );
                const graph = require('@arangodb/general-graph')._graph('sdmsg');

                // Make sure there are no allocations present on repo
                var alloc = g_db._query("for v in 1..1 inbound @repo alloc return {id:v._id}", { repo: req.queryParams.id } );
                if ( alloc.hasNext() )
                    throw [g_lib.ERR_IN_USE,"Cannot delete repo with associated allocations."];
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

router.get('/calc_size', function (req, res) {
    var client = g_lib.getUserFromClientID( req.queryParams.client );

    // TODO Check permissions
    var i, repo_map = {};
    for ( i in req.queryParams.items ){
        calcSize( req.queryParams.items[i], req.queryParams.recurse, 0, {}, repo_map );
    }

    var result = [], stats;
    for ( i in repo_map ){
        stats = repo_map[i];
        stats.repo = i;
        result.push(stats);
    }

    res.send( result );
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('items', joi.array().items(joi.string()).required(), "Array of data and/or collection IDs")
.queryParam('recurse', joi.boolean().required(), "Recursive flag")
.summary('Calculate per-repo sizes for specified data records and collections.')
.description('Calculate per-repo sizes for specified data records and collections.');

function calcSize( a_item, a_recurse, a_depth, a_visited, a_result ){
    var item, loc, res;
    if ( a_item.charAt(0) == 'd' ){
        if ( a_item in a_visited )
            return;
        item = g_db.d.document( a_item );
        loc = g_db.loc.firstExample({ _from: a_item });
        if ( !loc )
            throw [g_lib.ERR_INTERNAL_FAULT,"Data record missing allocation link"];

        if ( loc._to in a_result ){
            (res = a_result[loc._to]).records++;
            if ( item.size ){
                res.files++;
                res.total_sz += item.size;
            }
        }else{
            a_result[loc._to] = {records:1,files:item.size?1:0,total_sz:item.size};
        }
        a_visited[a_item] = true;
    }else if ( a_item.charAt(0) == 'c' ){
        if ( a_recurse || a_depth == 0 ){
            item = g_db.c.document( a_item );
            var items = g_db._query("for v in 1..1 outbound @coll item return v._id",{coll:a_item});
            while ( items.hasNext() ){
                calcSize( items.next(), a_recurse, a_depth+1, a_visited, a_result );
            }
        }
    }else
        throw [g_lib.ERR_INVALID_PARAM,"Invalid item type for size calculation: " + a_item];
}

router.get('/alloc/list/by_repo', function (req, res) {
    var client = g_lib.getUserFromClientID( req.queryParams.client );
    var repo = g_db.repo.document( req.queryParams.repo );

    g_lib.ensureAdminPermRepo( client, repo._id );

    var result = g_db._query("for v, e in 1..1 inbound @repo alloc return {id:v._id,name:v.name?v.name:v.title,repo:@repo,max_size:e.max_size,tot_size:e.tot_size,max_count:e.max_count,path:e.path}", { repo: repo._id } ).toArray();

    res.send( result );
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('repo', joi.string().required(), "Repo ID")
.summary('List all allocations for a repo')
.description('List all allocations a repo');

router.get('/alloc/list/by_owner', function (req, res) {
    var result = g_db.alloc.byExample({_from: req.queryParams.owner}).toArray();

    // Check for project sub-allocation
    // No support for sub-allocation statistics
    if ( result.length == 0 && req.queryParams.owner.startsWith("p/") ){
        var proj = g_db.p.document(req.queryParams.owner);
        if ( proj.sub_repo ){
            var alloc = g_db.alloc.firstExample({_from: proj.owner, _to: proj.sub_repo });
            if ( !alloc )
                throw [g_lib.ERR_INTERNAL_FAULT,"Project sub-allocation references non-existent allocation."];

            result = [{
                id:req.queryParams.owner,
                repo:proj.sub_repo,
                max_size:proj.sub_alloc,
                tot_size:proj.sub_usage,
                max_count:alloc.max_count,
                path:alloc.path,
                sub_alloc:true
            }];
        }
    }else{
        var obj;
        for ( var i in result ){
            obj = result[i];

            obj.id = req.queryParams.owner;
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

    // Check for sub-allocation
    if ( result.length == 0 && owner_id.startsWith("p/") ){
        var proj = g_db.p.document( owner_id );
        if ( proj.sub_repo ){
            var alloc = g_db.alloc.firstExample({_from: proj.owner, _to: proj.sub_repo });
            if ( !alloc )
                throw [g_lib.ERR_INTERNAL_FAULT,"Project sub-allocation references non-existent allocation."];

            result = [{
                id:owner_id,
                repo:proj.sub_repo,
                max_size:proj.sub_alloc,
                tot_size:proj.sub_usage,
                max_count:alloc.max_count,
                path:alloc.path,
                sub_alloc:true
            }];
        }
    }else{
        var obj;
        for ( var i in result ){
            obj = result[i];
            obj.id = owner_id;
            obj.repo = obj._to;

            delete obj._from;
            delete obj._to;
            delete obj._key;
            delete obj._id;
            delete obj._rev;
        }
    }

    res.send( result );
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('object', joi.string().required(), "Object ID (data or collection ID or alias)")
.summary('List object repo allocations')
.description('List object repo allocations');

router.get('/alloc/view', function (req, res) {
    try {
        var owner_id, client = g_lib.getUserFromClientID( req.queryParams.client );

        if ( req.queryParams.subject ){
            owner_id = req.queryParams.subject;
            // Check permissions
            if (( owner_id != client._id ) && !g_lib.hasAdminPermProj( client, owner_id ) ){
                throw g_lib.ERR_PERM_DENIED;
            }
        }else{
            owner_id = client._id;
        }

        var result = g_db.alloc.byExample({_from: owner_id, _to: req.queryParams.repo }).toArray();

        // Check for project sub-allocation

        if ( result.length == 0 && owner_id.startsWith("p/") ){
            var proj = g_db.p.document(owner_id);
            if ( proj.sub_repo ){
                var alloc = g_db.alloc.firstExample({_from: proj.owner, _to: proj.sub_repo });
                if ( !alloc )
                    throw [g_lib.ERR_INTERNAL_FAULT,"Project sub-allocation references non-existent allocation."];

                result = [{
                    id:owner_id,
                    repo:proj.sub_repo,
                    max_size:proj.sub_alloc,
                    tot_size:proj.sub_usage,
                    max_count:alloc.max_count,
                    path:alloc.path,
                    sub_alloc:true
                }];
            }
        }else{
            var obj;
            for ( var i in result ){
                obj = result[i];
                obj.id = owner_id;

                delete obj._from;
                obj.repo = obj._to;
                delete obj._to;
                delete obj._key;
                delete obj._id;
                delete obj._rev;
            }
        }
    
        res.send( result );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('repo', joi.string().required(), "Repo ID")
.queryParam('subject', joi.string().optional(), "User/project ID of allocation")
.summary('View allocation details')
.description('View allocation details');

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

    return { repo: a_repo, records:count, files:file_count, total_sz:tot_sz, histogram:hist };
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
                    throw [g_lib.ERR_NOT_FOUND,"Subject, "+subject_id+", not found"];

                var repo = g_db.repo.document( req.queryParams.repo );

                g_lib.ensureAdminPermRepo( client, repo._id );
                var alloc = g_db.alloc.firstExample({ _from: subject_id, _to: repo._id });

                if ( req.queryParams.max_size == 0 && alloc ){
                    // Check if there are any records using this repo and fail if so
                    // Check for sub allocations
                    if ( g_db.loc.firstExample({ parent: alloc._id }))
                        throw [g_lib.ERR_IN_USE,"Cannot clear allocation - sub-allocation defined"];
                    // Check for direct use of allocation
                    var count = g_db._query("return length(for v in 2..2 inbound @repo loc, outbound owner filter v._id == @subj return 1)", { repo: repo._id, subj: subject_id }).next();
                    if ( count )
                        throw [g_lib.ERR_IN_USE,"Cannot clear allocation - records present"];

                    g_db.alloc.removeByExample({ _from: subject_id, _to: repo._id });
                } else {
                    if ( alloc ){
                        g_db.alloc.update( alloc._id, { max_size: req.queryParams.max_size,max_count:req.queryParams.max_count });
                    } else {
                        var path;
                        if ( subject_id[0] == "p" )
                            path = repo.path + "project/";
                        else
                            path = repo.path + "user/";
                        g_db.alloc.save({ _from: subject_id, _to: repo._id, max_size: req.queryParams.max_size, max_count: req.queryParams.max_count, tot_size: 0, path: path + subject_id.substr(2) + "/" });
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
.queryParam('max_size', joi.number().required(), "Max total data size (bytes)")
.queryParam('max_count', joi.number().required(), "Max number of records (files)")
.summary('Set user/project repo allocation')
.description('Set user repo/project allocation. Only repo admin can set allocations.');
