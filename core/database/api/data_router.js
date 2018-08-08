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


router.get('/create', function (req, res) {
    try {
        var result = [];

        g_db._executeTransaction({
            collections: {
                read: ["u","uuid","accn","repo","alloc"],
                write: ["d","a","loc","owner","alias","item"]
            },
            action: function() {
                const client = g_lib.getUserFromClientID( req.queryParams.client );
                var owner_id;
                var parent_id;
                var repo_alloc;

                if ( req.queryParams.parent ) {
                    console.log("Has collection");

                    parent_id = g_lib.resolveID( req.queryParams.parent, client );

                    if ( parent_id[0] != "c" )
                        throw g_lib.ERR_PARENT_NOT_A_COLLECTION;

                    if ( !g_db._exists( parent_id ))
                        throw g_lib.ERR_COLL_NOT_FOUND;

                    owner_id = g_db.owner.firstExample({_from:parent_id})._to;
                    if ( owner_id != client._id ){
                        if ( !g_lib.hasAdminPermProj( client, owner_id )){
                            var parent_coll = g_db.c.document( parent_id );

                            if ( !g_lib.hasPermission( client, parent_coll, g_lib.PERM_CREATE ))
                                throw g_lib.ERR_PERM_DENIED;
                        }
                    }
                }else{
                    console.log("Default collection");
                    parent_id = "c/" + client._key + "_root";
                    owner_id = client._id;
                }

                if ( owner_id != client._id ){
                    console.log("Project");
                    // Storage location uses either project, or, if none, then owner's allocation(s)
                    if ( req.queryParams.repo ) {
                        repo_alloc = g_lib.verifyRepo( owner_id, req.queryParams.repo );
                    } else {
                        repo_alloc = g_lib.assignRepo( owner_id );
                        if ( !repo_alloc ){
                            // Project does not have it's own allocation, use one from project owner
                            // Note: owner_id is the owner of the collection, which is the project, we need the owner of the project
                            var proj = g_db.p.document( owner_id );
                            var proj_owner = g_db.owner.firstExample({_from:owner_id})._to;
                            // If project has a specified repo, use that; otherwise let system assign one
                            if ( proj.repo )
                                repo_alloc = g_lib.verifyRepo( proj_owner, proj.repo );
                            else
                                repo_alloc = g_lib.assignRepo( proj_owner );
                        }
                    }
                }else{
                    console.log("Owner");
                    // Storage location uses client allocation(s)
                    if ( req.queryParams.repo ) {
                        repo_alloc = g_lib.verifyRepo( client._id, req.queryParams.repo );
                    } else {
                        repo_alloc = g_lib.assignRepo( client._id );
                    }
                }

                if ( !repo_alloc )
                    throw g_lib.ERR_NO_ALLOCATION;

                var obj = { data_size: 0, rec_time: Math.floor( Date.now()/1000 ) };

                if ( req.queryParams.title )
                    obj.title = req.queryParams.title;

                if ( req.queryParams.public )
                    obj.public = req.queryParams.public;

                if ( req.queryParams.desc )
                    obj.desc = req.queryParams.desc;

                if ( req.queryParams.md )
                    obj.md = JSON.parse( req.queryParams.md );

                //console.log("Save data");

                var data = g_db.d.save( obj, { returnNew: true });
                //console.log("Save owner");
                g_db.owner.save({ _from: data.new._id, _to: owner_id });
                //console.log("Save loc", repo_alloc );
                g_db.loc.save({ _from: data.new._id, _to: repo_alloc._to, path: repo_alloc.path + data.new._key });

                if ( req.queryParams.alias ) {
                    g_lib.validateAlias( req.queryParams.alias );
                    var alias_key = owner_id[0] + ":" + owner_id.substr(2) + ":" + req.queryParams.alias;

                    g_db.a.save({ _key: alias_key });
                    g_db.alias.save({ _from: data.new._id, _to: "a/" + alias_key });
                    g_db.owner.save({ _from: "a/" + alias_key, _to: owner_id });
                    data.new.alias = req.queryParams.alias;
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
.queryParam('title', joi.string().optional(), "Title")
.queryParam('desc', joi.string().optional(), "Description")
.queryParam('alias', joi.string().optional(), "Alias")
.queryParam('public', joi.boolean().optional(), "Enable public access")
.queryParam('parent', joi.string().optional(), "Parent collection ID or alias (default = root)")
.queryParam('repo', joi.string().optional(), "Optional repo ID for allocation")
.queryParam('md', joi.string().optional(), "Metadata (JSON)")
.summary('Creates a new data record')
.description('Creates a new data record');

router.get('/update', function (req, res) {
    try {
        var result = [];

        g_db._executeTransaction({
            collections: {
                read: ["u","uuid","accn","loc"],
                write: ["d","a","owner","alias","alloc"]
            },
            action: function() {
                var data;
                const client = g_lib.getUserFromClientID( req.queryParams.client );
                var data_id = g_lib.resolveID( req.queryParams.id, client );
                var owner_id = g_db.owner.firstExample({ _from: data_id })._to;

                if ( !g_lib.hasAdminPermObject( client, data_id )) {
                    if ( !g_lib.hasPermission( client, data, g_lib.PERM_UPDATE ))
                        throw g_lib.ERR_PERM_DENIED;
                }

                if ( req.queryParams.alias )
                    g_lib.validateAlias( req.queryParams.alias );

                var obj = { rec_time: Math.floor( Date.now()/1000 ) };
                var do_update = false;

                if ( req.queryParams.title != undefined ) {
                    obj.title = req.queryParams.title;
                    do_update = true;
                }

                if ( req.queryParams.desc != undefined ) {
                    obj.desc = req.queryParams.desc;
                    do_update = true;
                }

                if ( req.queryParams.public != undefined ){
                    obj.public = req.queryParams.public;
                    do_update = true;
                }

                if ( req.queryParams.md != undefined ) {
                    obj.md = JSON.parse( req.queryParams.md );
                    do_update = true;
                }

                if ( req.queryParams.data_size != undefined ) {
                    obj.data_size = req.queryParams.data_size;
                    do_update = true;

                    data = g_db.d.document( data_id );
                    if ( obj.data_size != data.data_size ){
                        var loc = g_db.loc.firstExample({ _from: data_id });
                        if ( loc ){
                            console.log("owner:",owner_id,"repo:",loc._to);
                            var alloc = g_db.alloc.firstExample({ _from: owner_id, _to: loc._to });
                            var usage = Math.max(0,alloc.usage - data.data_size + obj.data_size);
                            g_db._update( alloc._id, {usage:usage});
                        }
                    }
                }

                if ( req.queryParams.data_time != undefined ) {
                    obj.data_time = req.queryParams.data_time;
                    do_update = true;
                }

                if ( do_update ) {
                    data = g_db._update( data_id, obj, { keepNull: false, returnNew: true, mergeObjects: req.queryParams.mdset?false:true });
                    data = data.new;
                } else {
                    data = g_db.d.document( data_id );
                }

                if ( req.queryParams.alias ) {
                    var old_alias = g_db.alias.firstExample({ _from: data_id });
                    if ( old_alias ) {
                        g_db.a.remove( old_alias._to );
                        g_db.alias.remove( old_alias );
                    }

                    var alias_key = owner_id[0] + ":" + owner_id.substr(2) + ":" + req.queryParams.alias;

                    g_db.a.save({ _key: alias_key });
                    g_db.alias.save({ _from: data_id, _to: "a/" + alias_key });
                    g_db.owner.save({ _from: "a/" + alias_key, _to: owner_id });
                    data.alias = req.queryParams.alias;
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
.queryParam('id', joi.string().required(), "Data record ID or alias")
.queryParam('title', joi.string().optional(), "Title")
.queryParam('desc', joi.string().optional(), "Description")
.queryParam('alias', joi.string().optional(), "Alias")
.queryParam('public', joi.boolean().optional(), "Enable public access")
.queryParam('md', joi.string().optional(), "Metadata (JSON)")
.queryParam('mdset', joi.boolean().optional().default(false), "Set metadata instead of merging")
.queryParam('data_size', joi.number().optional(), "Data size (bytes)")
.queryParam('data_time', joi.number().optional(), "Data modification time")
.summary('Updates an existing data record')
.description('Updates an existing data record');


router.get('/view', function (req, res) {
    try {
        const client = g_lib.getUserFromClientID( req.queryParams.client );

        var data_id = g_lib.resolveID( req.queryParams.id, client );
        var data = g_db.d.document( data_id );

        if ( !g_lib.hasAdminPermObject( client, data_id )) {
            if ( !g_lib.hasPermission( client, data, g_lib.PERM_VIEW ))
                throw g_lib.ERR_PERM_DENIED;
        }

        var owner_id = g_db.owner.firstExample({ _from: data_id })._to;

        var alias = g_db._query("for v in 1..1 outbound @data alias return v", { data: data_id }).toArray();
        if ( alias.length ) {
            data.alias = alias[0]._key;
        }

        data.repo_id = g_db.loc.firstExample({ _from: data_id })._to;
        data.owner = owner_id;
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

router.get('/loc', function (req, res) {
    try {
        // This is a system call - no need to check permissions
        var repo = g_db.loc.firstExample({ _from: req.queryParams.id });
        if ( !repo )
            throw g_lib.ERR_NO_ALLOCATION;

        res.send([{repo_id:repo._to.substr(5),path:repo.path}]);
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().optional(), "Client ID")
.queryParam('id', joi.string().required(), "Data ID (not alias)")
.summary('Get raw data repo location')
.description('Get raw data repo location');


// TODO Add limit, offset, and details options
// TODO Add options for ALL, user/project, or collection (recursize or not) options
router.get('/search', function (req, res) {
    try {
        const client = g_lib.getUserFromClientID( req.queryParams.client );

        var result = [];
        var scope;
        if ( req.queryParams.scope )
            scope = parseInt( req.queryParams.scope, 10 );
        else
            scope = g_lib.SS_MY_DATA | g_lib.SS_MY_PROJ;

        console.log("search scope:", scope );

        if ( scope & g_lib.SS_MY_DATA )
            result = searchMyData( req.queryParams.query, client );

        if ( scope & g_lib.SS_MY_PROJ )
            result = result.concat( searchMyProj( req.queryParams.query, client ));

        if ( scope & g_lib.SS_TEAM_PROJ )
            result = result.concat( searchTeamProj( req.queryParams.query, client ));

        if ( scope & g_lib.SS_USER_SHARE )
            result = result.concat( searchUserShared( req.queryParams.query, client ));

        if ( scope & g_lib.SS_PROJ_SHARE )
            result = result.concat( searchProjShared( req.queryParams.query, client ));

        if ( scope & g_lib.SS_PUBLIC )
            result = result.concat( searchPublic( req.queryParams.query, client ));

        res.send( result );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('query', joi.string().optional(), "Query expression")
.queryParam('scope', joi.number().optional(), "Scope")
.summary('Find all data records that match query')
.description('Find all data records that match query');


router.get('/delete', function (req, res) {
    try {
        var result = [];

        g_db._executeTransaction({
            collections: {
                read: ["u","uuid","accn","d"],
                write: ["d","a","n","owner","item","acl","tag","note","alias","loc","alloc"]
            },
            action: function() {
                const client = g_lib.getUserFromClientID( req.queryParams.client );

                var data_id = g_lib.resolveID( req.queryParams.id, client );
                g_lib.ensureAdminPermObject( client, data_id );

                var data = g_db.d.document( data_id );
                var loc = g_db.loc.firstExample({_from: data_id });

                // Adjust allocation for data size
                if ( data.data_size ){
                    var owner_id = g_db.owner.firstExample({ _from: data_id })._to;
                    var alloc = g_db.alloc.firstExample({ _from: owner_id, _to: loc._to });
                    var usage = Math.max(0,alloc.usage - data.data_size);
                    g_db._update( alloc._id, {usage:usage});
                }

                result.push({ id: data_id, repo_id: loc._to, path: loc.path });

                const graph = require('@arangodb/general-graph')._graph('sdmsg');
                var obj;

                // Delete attached notes and aliases
                var objects = g_db._query( "for v in 1..1 outbound @data note, alias return v._id", { data: data._id }).toArray();
                for ( var i in objects ) {
                    obj = objects[i];
                    graph[obj[0]].remove( obj );
                }

                graph.d.remove( data._id );
            }
        });

        res.send( result );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('id', joi.string().required(), "Data ID or alias")
.summary('Deletes an existing data record')
.description('Deletes an existing data record');

function searchMyData( query, client ){
    return g_db._query( "for i in 1..1 inbound @user owner filter IS_SAME_COLLECTION('d',i) and (" + query + ") return {id:i._id,title:i.title}", { user: client._id } ).toArray();
}

function searchMyProj( query, client ){
    // Owned projects
    var result = g_db._query( "for i,e,p in 2..2 inbound @user owner filter IS_SAME_COLLECTION('p',p.vertices[1]) and IS_SAME_COLLECTION('d',i) and (" + query + ") return {id:i._id,title:i.title}", { user: client._id } ).toArray();

    // Administered projects
    result = result.concat( g_db._query( "for i,e,p in 2..2 inbound @user admin filter IS_SAME_COLLECTION('p',p.vertices[1]) and IS_SAME_COLLECTION('d',i) and (" + query + ") return {id:i._id,title:i.title}", { user: client._id } ).toArray());

    return result;
}

function searchTeamProj( query, client ){
    // Member of project
    var result = g_db._query( "for i,e,p in 3..3 inbound @user member, any owner filter p.vertices[1].gid == 'members' and IS_SAME_COLLECTION('p',p.vertices[2]) and IS_SAME_COLLECTION('d',i) and (" + query + ") return {id:i._id,title:i.title}", { user: client._id } ).toArray();

    return result;
}

function searchUserShared( query, client ){
    console.log("searchUserShared");
    var users = g_lib.usersWithClientACLs( client._id );
    for ( var i in users ){
        users[i] = "u/"+users[i].uid;
    }
    return g_db._query( "for u in @users for i in 1..1 inbound u owner filter IS_SAME_COLLECTION('d',i) and (" + query + ") return {id:i._id,title:i.title}", { users: users } ).toArray();
}

function searchProjShared( query, client ){
    console.log("searchProjShared");
    var proj = g_lib.projectsWithClientACLs( client._id );
    for ( var i in proj ){
        proj[i] = proj[i].id;
    }
    return g_db._query( "for p in @proj for i in 1..1 inbound p owner filter IS_SAME_COLLECTION('d',i) and (" + query + ") return {id:i._id,title:i.title}", { proj: proj } ).toArray();}

function searchPublic( query, client ){
    console.log("searchPublic",query);
    return g_db._query( "for i in d filter i.public == true let owner = (for j in outbound i._id owner return j._id) filter owner != @user " + (query?" and (" + query + ") ":"") +"return {id:i._id,title:i.title}", { user: client._id } ).toArray();

    /*
    var item;

    while ( cursor.hasNext() ) {
        item = cursor.next();
        if ( g_lib.hasAdminPermObject( client, item._id ) || g_lib.hasPermission( client, item, g_lib.PERM_LIST )) {
            result.push({ id: item._id, title: item.title, desc: item.desc, md: item.md });
        }
    }*/
}

