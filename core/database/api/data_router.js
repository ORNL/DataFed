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
                write: ["d","a","loc","owner","alias","item"]
            },
            action: function() {
                const client = g_lib.getUserFromClientID( req.queryParams.client );
                var owner_id;
                var parent_id;
                var repo_alloc;

                g_lib.validateTitle( req.body.title );
                g_lib.validateDesc( req.body.desc );

                if ( req.body.parent ) {
                    parent_id = g_lib.resolveID( req.body.parent, client );

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
                    parent_id = g_lib.getRootID(client._id);
                    owner_id = client._id;
                }

                if ( owner_id != client._id ){
                    console.log( "not owner" );
                    // Storage location uses either project, or, if none, then owner's allocation(s)
                    if ( req.body.repo ) {
                        console.log( "repo specified" );
                        repo_alloc = g_db.alloc.firstExample({ _from: owner_id, _to: req.body.repo });
                        //repo_alloc = g_lib.verifyRepo( owner_id, req.body.repo );
                    } else {
                        console.log( "repo not specified" );
                        repo_alloc = g_lib.assignRepo( owner_id );
                    }
                    if ( !repo_alloc ){
                        console.log( "alloc not found" );
                        // Project does not have it's own allocation, use one from project owner
                        // Note: owner_id is the owner of the collection, which is the project, we need the owner of the project
                        var proj = g_db.p.document( owner_id );
                        var proj_owner = g_db.owner.firstExample({_from:owner_id})._to;
                        // If project has a specified repo, use that; otherwise let system assign one
                        console.log( "try again with", proj_owner );

                        if ( proj.repo )
                            repo_alloc = g_lib.verifyRepo( proj_owner, proj.repo );
                        else
                            repo_alloc = g_lib.assignRepo( proj_owner );
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
                var obj = { size: 0, ct: time, ut: time };

                obj.title = req.body.title;

                if ( req.body.public )
                    obj.public = req.body.public;

                if ( req.body.desc )
                    obj.desc = req.body.desc;

                if ( req.body.md ){
                    obj.md = req.body.md; //JSON.parse( req.body.md );
                    //console.log( "parsed:", obj.md );
                }

                //console.log("Save data");

                var data = g_db.d.save( obj, { returnNew: true });
                //console.log("Save owner");
                g_db.owner.save({ _from: data.new._id, _to: owner_id });
                //console.log("Save loc", repo_alloc );
                g_db.loc.save({ _from: data.new._id, _to: repo_alloc._to, path: repo_alloc.path + data.new._key });

                if ( req.body.alias ) {
                    g_lib.validateAlias( req.body.alias );
                    var alias_key = owner_id[0] + ":" + owner_id.substr(2) + ":" + req.body.alias;

                    if ( g_db.a.exists({ _key: alias_key }))
                        throw g_lib.ERR_ALIAS_IN_USE;

                    g_db.a.save({ _key: alias_key });
                    g_db.alias.save({ _from: data.new._id, _to: "a/" + alias_key });
                    g_db.owner.save({ _from: "a/" + alias_key, _to: owner_id });
                    data.new.alias = req.body.alias;
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
    title: joi.string().required(),
    desc: joi.string().optional(),
    alias: joi.string().optional(),
    public: joi.boolean().optional(),
    parent: joi.string().optional(),
    repo: joi.string().optional(),
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
                write: ["d","a","owner","alias","alloc"]
            },
            action: function() {
                const client = g_lib.getUserFromClientID( req.queryParams.client );
                var data_id = g_lib.resolveID( req.body.id, client );
                var owner_id = g_db.owner.firstExample({ _from: data_id })._to;
                var data = g_db.d.document( data_id );

                if ( !g_lib.hasAdminPermObject( client, data_id )) {
                    if ( !g_lib.hasPermission( client, data, g_lib.PERM_UPDATE ))
                        throw g_lib.ERR_PERM_DENIED;
                }

                g_lib.validateTitle( req.body.title );
                g_lib.validateDesc( req.body.desc );

                if ( req.body.alias )
                    g_lib.validateAlias( req.body.alias );

                var obj = { ut: Math.floor( Date.now()/1000 ) };

                if ( req.body.title != undefined )
                    obj.title = req.body.title;

                if ( req.body.desc != undefined )
                    obj.desc = req.body.desc;

                if ( req.body.public != undefined )
                    obj.public = req.body.public;

                if ( req.body.md != undefined )
                    obj.md = req.body.md;

                if ( req.body.size != undefined ) {
                    obj.size = req.body.size;

                    data = g_db.d.document( data_id );
                    if ( obj.size != data.size ){
                        var loc = g_db.loc.firstExample({ _from: data_id });
                        if ( loc ){
                            //console.log("owner:",owner_id,"repo:",loc._to);
                            var alloc = g_db.alloc.firstExample({ _from: owner_id, _to: loc._to });
                            var usage = Math.max(0,alloc.usage - data.size + obj.size);
                            g_db._update( alloc._id, {usage:usage});
                        }
                    }
                }

                if ( req.body.dt != undefined )
                    obj.dt = req.body.dt;

                data = g_db._update( data_id, obj, { keepNull: false, returnNew: true, mergeObjects: req.body.mdset?false:true });
                data = data.new;

                if ( req.body.alias ) {
                    var old_alias = g_db.alias.firstExample({ _from: data_id });
                    if ( old_alias ) {
                        const graph = require('@arangodb/general-graph')._graph('sdmsg');
                        graph.a.remove( old_alias._to );
                    }

                    var alias_key = owner_id[0] + ":" + owner_id.substr(2) + ":" + req.body.alias;

                    if ( g_db.a.exists({ _key: alias_key }))
                        throw g_lib.ERR_ALIAS_IN_USE;

                    g_db.a.save({ _key: alias_key });
                    g_db.alias.save({ _from: data_id, _to: "a/" + alias_key });
                    g_db.owner.save({ _from: "a/" + alias_key, _to: owner_id });
                    data.alias = req.body.alias;
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
    title: joi.string().optional(),
    desc: joi.string().optional(),
    alias: joi.string().optional(),
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

        var query = "",count = 0,users,proj,i;

        if ( scope & g_lib.SS_MY_DATA ) count++;
        if ( scope & g_lib.SS_MY_PROJ ) count++;
        if ( scope & g_lib.SS_TEAM_PROJ ) count++;
        if ( scope & g_lib.SS_USER_SHARE ) count++;
        if ( scope & g_lib.SS_PROJ_SHARE ) count++;
        if ( scope & g_lib.SS_PUBLIC ) count++;

        if ( count == 0 )
            throw g_lib.ERR_INVALID_PARAM;

        if ( count > 1 )
            query = "for x in union(";

        var comma = false;

        if ( scope & g_lib.SS_MY_DATA ){
            //result = searchMyData( req.queryParams.query, client );
            query += (count>1?"(":"") + "for i in 1..1 inbound @user owner filter IS_SAME_COLLECTION('d',i) and (" + req.queryParams.query + ") return {id:i._id,title:i.title}" + (count>1?")":"");
            comma = true;
        }

        if ( scope & g_lib.SS_MY_PROJ ){
            // Owned projects
            query += (comma?",":"") + "(for i,e,p in 2..2 inbound @user owner filter IS_SAME_COLLECTION('p',p.vertices[1]) and IS_SAME_COLLECTION('d',i) and (" + req.queryParams.query + ") return {id:i._id,title:i.title}),";

            // Administered projects
            query += "(for i,e,p in 2..2 inbound @user admin filter IS_SAME_COLLECTION('p',p.vertices[1]) and IS_SAME_COLLECTION('d',i) and (" + req.queryParams.query + ") return {id:i._id,title:i.title})";

            comma = true;
        }

        if ( scope & g_lib.SS_TEAM_PROJ ){
            query += (comma?",":"") + (count>1?"(":"") + "for i,e,p in 3..3 inbound @user member, any owner filter p.vertices[1].gid == 'members' and IS_SAME_COLLECTION('p',p.vertices[2]) and IS_SAME_COLLECTION('d',i) and (" + req.queryParams.query + ") return {id:i._id,title:i.title}" + (count>1?")":"");

            comma = true;
        }

        if ( scope & g_lib.SS_USER_SHARE ){
            users = g_lib.usersWithClientACLs( client._id );
            for ( i in users )
                users[i] = "u/"+users[i].uid;

            query += (comma?",":"") + (count>1?"(":"") + "for u in @users for i in 1..1 inbound u owner filter IS_SAME_COLLECTION('d',i) and (" + req.queryParams.query + ") return {id:i._id,title:i.title}" + (count>1?")":"");

            comma = true;
        }

        if ( scope & g_lib.SS_PROJ_SHARE ){
            proj = g_lib.projectsWithClientACLs( client._id );
            for ( i in proj )
                proj[i] = proj[i].id;

            query += (comma?",":"") + (count>1?"(":"") + "for p in @proj for i in 1..1 inbound p owner filter IS_SAME_COLLECTION('d',i) and (" + req.queryParams.query + ") return {id:i._id,title:i.title}" + (count>1?")":"");

            comma = true;
        }

        if ( scope & g_lib.SS_PUBLIC ){
            query += (comma?",":"") + (count>1?"(":"") + "for i in d filter i.public == true let owner = (for j in outbound i._id owner return j._id) filter owner != @user and (" + req.queryParams.query + ") return {id:i._id,title:i.title}" + (count>1?")":"");
        }

        if ( count > 1 )
            query += ") sort x.title return x";

        result = g_db._query( query, { user: client._id, users: users, proj: proj } ).toArray();
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

router.get('/search2', function (req, res) {
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
        var result;

        g_db._executeTransaction({
            collections: {
                read: ["u","uuid","accn","d"],
                write: ["d","a","owner","item","acl","alias","loc","alloc"]
            },
            action: function() {
                const client = g_lib.getUserFromClientID( req.queryParams.client );

                var data_id = g_lib.resolveID( req.queryParams.id, client );
                g_lib.ensureAdminPermObject( client, data_id );

                var data = g_db.d.document( data_id );
                var loc = g_db.loc.firstExample({_from: data_id });

                // Adjust allocation for data size
                if ( data.size ){
                    var owner_id = g_db.owner.firstExample({ _from: data_id })._to;
                    var alloc = g_db.alloc.firstExample({ _from: owner_id, _to: loc._to });
                    var usage = Math.max(0,alloc.usage - data.size);
                    g_db._update( alloc._id, {usage:usage});
                }

                result = { id: data_id, repo_id: loc._to, path: loc.path };

                const graph = require('@arangodb/general-graph')._graph('sdmsg');
                var obj;

                // Delete attached aliases
                var objects = g_db._query( "for v in 1..1 outbound @data alias return v._id", { data: data._id }).toArray();
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
}

