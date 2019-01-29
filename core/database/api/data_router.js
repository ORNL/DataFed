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

//==================== DATA API FUNCTIONS


router.post('/create', function (req, res) {
    try {
        var result = [];
        console.log( "create data" );

        g_db._executeTransaction({
            collections: {
                read: ["u","uuid","accn","repo","alloc"],
                write: ["d","a","loc","owner","alias","item","t","top"]
            },
            action: function() {
                const client = g_lib.getUserFromClientID( req.queryParams.client );
                var owner_id;
                var parent_id;
                var repo_alloc;

                console.log("Create new data");

                if ( req.body.parent ) {
                    parent_id = g_lib.resolveID( req.body.parent, client );
                    console.log("parent: ", parent_id);

                    if ( parent_id[0] != "c" )
                        throw g_lib.ERR_PARENT_NOT_A_COLLECTION;

                    if ( !g_db._exists( parent_id ))
                        throw g_lib.ERR_COLL_NOT_FOUND;

                    owner_id = g_db.owner.firstExample({_from:parent_id})._to;
                    if ( owner_id != client._id ){
                        if ( !g_lib.hasManagerPermProj( client, owner_id )){
                            var parent_coll = g_db.c.document( parent_id );

                            console.log("check admin perm on parent coll: ",parent_id);
                            if ( !g_lib.hasPermissions( client, parent_coll, g_lib.PERM_CREATE )){
                                console.log("NO admin perm on parent coll: ",parent_id);
                                throw g_lib.ERR_PERM_DENIED;
                            }
                        }
                    }
                }else{
                    console.log("no body?");
                    parent_id = g_lib.getRootID(client._id);
                    owner_id = client._id;
                }

                var alloc_parent = null;

                if ( owner_id != client._id ){
                    console.log( "not owner" );
                    if ( req.body.repo ) {
                        // If a repo is specified, must be a real allocation - verify it as usual
                        console.log( "repo specified" );
                        //repo_alloc = g_db.alloc.firstExample({ _from: owner_id, _to: req.body.repo });
                        repo_alloc = g_lib.verifyRepo( owner_id, req.body.repo );
                    } else {
                        // If a repo is not specified, must check for project sub-allocation
                        console.log( "repo not specified" );

                        if ( owner_id[0] == 'p' ){
                            // For projects, use sub-allocation if defined, otherwise auto-assign from project owner
                            console.log( "owner is a project" );
                            var proj = g_db.p.document( owner_id );
                            if ( proj.sub_repo ){
                                console.log( "project has sub allocation" );
                                // Make sure soft capacitt hasn't been exceeded
                                if ( proj.sub_usage > proj.sub_alloc )
                                    throw g_lib.ERR_ALLOCATION_EXCEEDED;

                                // TODO Handle multiple project owners?
                                var proj_owner_id = g_db.owner.firstExample({_from:proj._id})._to;
                                repo_alloc = g_lib.verifyRepo( proj_owner_id, proj.sub_repo );
                                // Make sure hard capacity hasn't been exceeded
                                if ( repo_alloc.usage > repo_alloc.capacity )
                                    throw g_lib.ERR_ALLOCATION_EXCEEDED;

                                alloc_parent = repo_alloc._id;
                            }
                        }

                        if ( !repo_alloc ){
                            // Try to auto-assign an available allocation
                            repo_alloc = g_lib.assignRepo( owner_id );
                        }
                    }
                }else{
                    // Storage location uses client allocation(s)
                    if ( req.body.repo ) {
                        repo_alloc = g_lib.verifyRepo( client._id, req.body.repo );
                    } else {
                        repo_alloc = g_lib.assignRepo( client._id );
                    }
                }

                if ( !repo_alloc )
                    throw g_lib.ERR_NO_ALLOCATION;

                var time = Math.floor( Date.now()/1000 );
                var obj = { size: 0, ct: time, ut: time, owner: owner_id };

                g_lib.procInputParam( req.body, "title", false, obj );
                g_lib.procInputParam( req.body, "desc", false, obj );
                g_lib.procInputParam( req.body, "keyw", false, obj );
                g_lib.procInputParam( req.body, "alias", false, obj );
                g_lib.procInputParam( req.body, "topic", false, obj );

                if ( req.body.public )
                    obj.public = req.body.public;

                if ( req.body.md ){
                    obj.md = req.body.md; //JSON.parse( req.body.md );
                    //console.log( "parsed:", obj.md );
                }

                //console.log("Save data");

                var data = g_db.d.save( obj, { returnNew: true });
                //console.log("Save owner");
                g_db.owner.save({ _from: data.new._id, _to: owner_id });

                //console.log("Save loc", repo_alloc );
                var loc = { _from: data.new._id, _to: repo_alloc._to, path: repo_alloc.path + data.new._key, uid: owner_id };
                if ( alloc_parent )
                    loc.parent = alloc_parent;
                g_db.loc.save(loc);

                if ( obj.alias ) {
                    var alias_key = owner_id[0] + ":" + owner_id.substr(2) + ":" + obj.alias;

                    if ( g_db.a.exists({ _key: alias_key }))
                        throw g_lib.ERR_ALIAS_IN_USE;

                    g_db.a.save({ _key: alias_key });
                    g_db.alias.save({ _from: data.new._id, _to: "a/" + alias_key });
                    g_db.owner.save({ _from: "a/" + alias_key, _to: owner_id });
                }

                if ( obj.topic ){
                    g_lib.topicLink( obj.topic, data._id );
                }

                g_db.item.save({ _from: parent_id, _to: data.new._id });

                data.new.id = data.new._id;
                delete data.new._id;
                delete data.new._key;
                delete data.new._rev;

                result.push( data.new );
            }
        });

        res.send( result );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.body(joi.object({
    title: joi.string().allow('').optional(),
    desc: joi.string().allow('').optional(),
    keyw: joi.string().allow('').optional(),
    topic: joi.string().allow('').optional(),
    alias: joi.string().allow('').optional(),
    public: joi.boolean().optional(),
    parent: joi.string().allow('').optional(),
    repo: joi.string().allow('').optional(),
    md: joi.any().optional()
}).required(), 'Record fields')
.summary('Create a new data record')
.description('Create a new data record from JSON body');

router.post('/update', function (req, res) {
    try {
        var result = [];

        g_db._executeTransaction({
            collections: {
                read: ["u","uuid","accn","loc"],
                write: ["d","a","p","owner","alias","alloc","t","top"]
            },
            action: function() {
                const client = g_lib.getUserFromClientID( req.queryParams.client );
                var data_id = g_lib.resolveID( req.body.id, client );
                var owner_id = g_db.owner.firstExample({ _from: data_id })._to;
                var data = g_db.d.document( data_id );

                if ( !g_lib.hasAdminPermObject( client, data_id )) {
                    // Required permissions depend on which fields are being modified:
                    // Metadata = PERM_WR_META, file_size = PERM_WR_DATA, all else = ADMIN
                    var perms = 0;
                    if ( req.body.md )
                        perms |= g_lib.PERM_WR_META;

                    if ( req.body.size || req.body.dt )
                        perms |= g_lib.PERM_WR_DATA;

                    if ( req.body.title || req.body.alias  || req.body.desc || req.body.public )
                        perms |= g_lib.PERM_WR_REC;

                    if ( data.locked || !g_lib.hasPermissions( client, data, perms ))
                        throw g_lib.ERR_PERM_DENIED;
                }

                var obj = { ut: Math.floor( Date.now()/1000 ) };

                g_lib.procInputParam( req.body, "title", true, obj );
                g_lib.procInputParam( req.body, "desc", true, obj );
                g_lib.procInputParam( req.body, "keyw", true, obj );
                g_lib.procInputParam( req.body, "alias", true, obj );
                g_lib.procInputParam( req.body, "topic", true, obj );

                console.log("New data title:", obj.title );

                if ( obj.topic != undefined && obj.topic != data.topic ){
                    if ( data.topic )
                        g_lib.topicUnlink( data._id );

                    if ( obj.topic.length )
                        g_lib.topicLink( obj.topic, data._id );
                }

                if ( req.body.public != undefined )
                    obj.public = req.body.public;

                if ( req.body.md === "" )
                    obj.md = null;
                else if ( req.body.md )
                    obj.md = req.body.md;

                if ( req.body.size != undefined ) {
                    obj.size = req.body.size;

                    data = g_db.d.document( data_id );
                    if ( obj.size != data.size ){
                        var loc = g_db.loc.firstExample({ _from: data_id });
                        if ( loc ){
                            //console.log("owner:",owner_id,"repo:",loc._to);
                            var alloc, usage;
                            if ( loc.parent ){
                                alloc = g_db.alloc.document( loc.parent );
                                // Update project sub allocation
                                var proj = g_db.p.document( owner_id );
                                usage = Math.max(0,proj.sub_usage - data.size + obj.size);
                                g_db._update( proj._id, {sub_usage:usage});
                            }else{
                                alloc = g_db.alloc.firstExample({ _from: owner_id, _to: loc._to });
                            }

                            // Update primary/parent allocation
                            usage = Math.max(0,alloc.usage - data.size + obj.size);
                            g_db._update( alloc._id, {usage:usage});
                        }
                    }
                }

                if ( req.body.dt != undefined )
                    obj.dt = req.body.dt;

                data = g_db._update( data_id, obj, { keepNull: false, returnNew: true, mergeObjects: req.body.mdset?false:true });
                data = data.new;

                if ( obj.alias != undefined ) {
                    var old_alias = g_db.alias.firstExample({ _from: data_id });
                    if ( old_alias ) {
                        const graph = require('@arangodb/general-graph')._graph('sdmsg');
                        graph.a.remove( old_alias._to );
                    }

                    if ( obj.alias ){
                        var alias_key = owner_id[0] + ":" + owner_id.substr(2) + ":" + obj.alias;
                        if ( g_db.a.exists({ _key: alias_key }))
                            throw g_lib.ERR_ALIAS_IN_USE;

                        g_db.a.save({ _key: alias_key });
                        g_db.alias.save({ _from: data_id, _to: "a/" + alias_key });
                        g_db.owner.save({ _from: "a/" + alias_key, _to: owner_id });
                    }
                }

                delete data._rev;
                delete data._key;
                data.id = data._id;
                delete data._id;

                result.push( data );
            }
        });

        res.send( result );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.body(joi.object({
    id: joi.string().required(),
    title: joi.string().allow('').optional(),
    desc: joi.string().allow('').optional(),
    keyw: joi.string().allow('').optional(),
    topic: joi.string().allow('').optional(),
    alias: joi.string().allow('').optional(),
    public: joi.boolean().optional(),
    md: joi.any().optional(),
    mdset: joi.boolean().optional().default(false),
    size: joi.number().optional(),
    dt: joi.number().optional()
}).required(), 'Record fields')
.summary('Update an existing data record')
.description('Update an existing data record from JSON body');


router.get('/view', function (req, res) {
    try {
        const client = g_lib.getUserFromClientID( req.queryParams.client );

        var data_id = g_lib.resolveID( req.queryParams.id, client );
        var data = g_db.d.document( data_id );
        var rem_md = false;

        if ( !g_lib.hasAdminPermObject( client, data_id )) {
            var perms = g_lib.getPermissions( client, data, g_lib.PERM_RD_REC | g_lib.PERM_RD_META );
            if ( data.locked || ( perms & ( g_lib.PERM_RD_REC | g_lib.PERM_RD_META )) == 0 )
                throw g_lib.ERR_PERM_DENIED;
            if (( perms & g_lib.PERM_RD_META ) == 0 )
                rem_md = true;
        }

        if ( rem_md && data.md )
            delete data.md;

        data.repo_id = g_db.loc.firstExample({ _from: data_id })._to;

        delete data._rev;
        delete data._key;
        data.id = data._id;
        delete data._id;

        res.send( [data] );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('id', joi.string().required(), "Data ID or alias")
.summary('Get data by ID or alias')
.description('Get data by ID or alias');

router.get('/lock/toggle', function (req, res) {
    try {
        const client = g_lib.getUserFromClientID( req.queryParams.client );
        var data_id = g_lib.resolveID( req.queryParams.id, client );

        if ( !g_lib.hasAdminPermObject( client, data_id )) {
            throw g_lib.ERR_PERM_DENIED;
        }

        var data = g_db.d.document( data_id );
        var obj = {};
        if ( !data.locked )
            obj.locked = true;
        else
            obj.locked = false;

        data = g_db._update( data_id, obj, { returnNew: true });
        data = data.new;

        data.repo_id = g_db.loc.firstExample({ _from: data_id })._to;

        delete data._rev;
        delete data._key;
        data.id = data._id;
        delete data._id;

        res.send([data]);

    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().optional(), "Client ID")
.queryParam('id', joi.string().required(), "Data ID or alias")
.summary('Toggle data record lock')
.description('Toggle data record lock');


router.get('/loc', function (req, res) {
    try {
        // This is a system call - no need to check permissions
        const client = g_lib.getUserFromClientID( req.queryParams.client );
        var data_id = g_lib.resolveID( req.queryParams.id, client );
        var repo = g_db.loc.firstExample({ _from: data_id });
        if ( !repo )
            throw g_lib.ERR_NO_RAW_DATA;

        res.send({ id: data_id, repo_id:repo._to, path:repo.path });
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().optional(), "Client ID")
.queryParam('id', joi.string().required(), "Data ID (not alias)")
.summary('Get raw data repo location')
.description('Get raw data repo location');

router.get('/path', function (req, res) {
    try {
        const client = g_lib.getUserFromClientID( req.queryParams.client );
        var data_id = g_lib.resolveID( req.queryParams.id, client );

        if ( !g_lib.hasAdminPermObject( client, data_id )) {
            var data = g_db.d.document( data_id );
            var perms = g_lib.getPermissions( client, data, g_lib.PERM_RD_DATA );
            if (( perms & g_lib.PERM_RD_DATA ) == 0 )
                throw g_lib.ERR_PERM_DENIED;
        }

        var loc = g_db.loc.firstExample({ _from: data_id });
        if ( !loc )
            throw g_lib.ERR_NO_RAW_DATA;

        var repo = g_db.repo.document( loc._to );
        if ( repo.domain != req.queryParams.domain )
            throw g_lib.ERR_INVALID_DOMAIN;

        res.send({ path: repo.exp_path + loc.path.substr( repo.path.length ) });
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().optional(), "Client ID")
.queryParam('id', joi.string().required(), "Data ID (not alias)")
.queryParam('domain', joi.string().required(), "Client domain")
.summary('Get raw data local path')
.description('Get raw data local path');


router.get('/list/by_alloc', function (req, res) {
    try {
        const client = g_lib.getUserFromClientID( req.queryParams.client );
        var owner_id;

        if ( req.queryParams.subject ) {
            owner_id = req.queryParams.subject;
            if ( req.queryParams.subject.startsWith("u/")){
                g_lib.ensureAdminPermUser( client, owner_id );
            }else{
                g_lib.ensureManagerPermProj( client, owner_id );
            }
        } else {
            owner_id = client._id;
        }

        var qry = "for v,e in 1..1 inbound @repo loc filter e.uid == @uid sort v.title";
        var result;

        if ( req.queryParams.offset != undefined && req.queryParams.count != undefined ){
            qry += " limit " + req.queryParams.offset + ", " + req.queryParams.count;
            qry += " return { id: v._id, title: v.title, alias: v.alias, locked: v.locked }";
            result = g_db._query( qry, { repo: req.queryParams.repo, uid: owner_id },{},{fullCount:true});
            var tot = result.getExtra().stats.fullCount;
            result = result.toArray();
            result.push({paging:{off:req.queryParams.offset,cnt:req.queryParams.count,tot:tot}});
        }
        else{
            qry += " return { id: v._id, title: v.title, alias: v.alias, locked: v.locked }";
            result = g_db._query( qry, { repo: req.queryParams.repo, uid: owner_id });
        }

        res.send( result );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('subject', joi.string().optional(), "UID of subject user (optional)")
.queryParam('repo', joi.string().required(), "Repo ID")
.queryParam('offset', joi.number().optional(), "Offset")
.queryParam('count', joi.number().optional(), "Count")
.summary('List data records by allocation')
.description('List data records by allocation');

router.get('/search', function (req, res) {
    try {
        const client = g_lib.getUserFromClientID( req.queryParams.client );
        var params = {};

        if ( req.queryParams.use_client )
            params.client = client._id;

        if ( req.queryParams.use_shared_users ){
            params.users = g_lib.usersWithClientACLs( client._id, true );
        }

        if ( req.queryParams.use_shared_projects ){
            params.projs = g_lib.projectsWithClientACLs( client._id, true );
        }
        
        res.send( g_db._query( req.queryParams.query, params ));
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('query', joi.string().required(), "Query")
.queryParam('use_client', joi.bool().required(), "Query uses client param")
.queryParam('use_shared_users', joi.bool().required(), "Query uses shared users param")
.queryParam('use_shared_projects', joi.bool().required(), "Query uses shared projects param")
.summary('Find all data records that match query in body')
.description('Find all data records that match query in body');

router.get('/delete', function (req, res) {
    try {
        g_db._executeTransaction({
            collections: {
                read: ["u","uuid","accn","d"],
                write: ["d","a","owner","item","acl","alias","loc","alloc","p","t","top"]
            },
            action: function() {
                const client = g_lib.getUserFromClientID( req.queryParams.client );

                var data_id = g_lib.resolveID( req.queryParams.id, client );
                var data = g_db.d.document( data_id );

                if ( !g_lib.hasAdminPermObject( client, data_id )){
                    if ( data.locked || !g_lib.hasPermissions( client, data, g_lib.PERM_DELETE ))
                        throw g_lib.ERR_PERM_DENIED;
                }

                var owner_id = g_db.owner.firstExample({ _from: data_id })._to;
                var allocs = {}, locations = [];

                g_lib.deleteData( data, allocs, locations );
                g_lib.updateAllocations( allocs, owner_id );

                res.send( locations[0] );
            }
        });

    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('id', joi.string().required(), "Data ID or alias")
.summary('Deletes an existing data record')
.description('Deletes an existing data record');
