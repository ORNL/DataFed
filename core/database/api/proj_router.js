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

//==================== PROJECT API FUNCTIONS


router.get('/create', function (req, res) {
    try {
        var result;

        g_db._executeTransaction({
            collections: {
                read: ["u","p"],
                write: ["p","c","a","g","acl","owner","ident","alias","admin","member"]
            },
            action: function() {
                const client = g_lib.getUserFromClientID( req.queryParams.client );
                var time = Math.floor( Date.now()/1000 );
                var proj_data = { ct: time, ut: time };

                g_lib.procInputParam( req.queryParams, "id", false, proj_data ); // Sets _key field
                g_lib.procInputParam( req.queryParams, "title", false, proj_data );
                g_lib.procInputParam( req.queryParams, "desc", false, proj_data );

                if ( req.queryParams.sub_repo ){
                    var alloc = g_lib.verifyRepo( client._id, req.queryParams.sub_repo );
                    //var alloc_sz = parseInt( req.queryParams.sub_alloc );
                    //if ( isNaN(alloc_sz) || alloc_sz <= 0 )
                    if (  req.queryParams.sub_alloc <= 0 )
                        throw g_lib.ERR_INVALID_PARAM;
                    if ( req.queryParams.sub_alloc > alloc.alloc ) // Ok to over-allocate across projects
                        throw g_lib.ERR_ALLOCATION_EXCEEDED;

                    proj_data.sub_repo = req.queryParams.sub_repo;
                    proj_data.sub_alloc = req.queryParams.sub_alloc;
                    proj_data.sub_usage = 0;
                }


                var proj = g_db.p.save( proj_data, { returnNew: true });
                g_db.owner.save({ _from: proj._id, _to: client._id });


                var root = g_db.c.save({ _key: "p_" + proj_data._key + "_root", is_root: true, title: "root", desc: "Root collection for project " + proj_data._key }, { returnNew: true });

                var alias = g_db.a.save({ _key: "p:"+proj_data._key+":root" }, { returnNew: true });
                g_db.owner.save({ _from: alias._id, _to: proj._id });

                g_db.alias.save({ _from: root._id, _to: alias._id });
                g_db.owner.save({ _from: root._id, _to: proj._id });

                var i;
                var mem_grp;

                // Projects have a special "members" group associated with root
                mem_grp = g_db.g.save({ uid: "p/"+proj_data._key, gid: "members", title: "Project Members", desc: "Use to set baseline project member permissions." }, { returnNew: true });
                g_db.owner.save({ _from: mem_grp._id, _to: proj._id });
                g_db.acl.save({ _from: root._id, _to: mem_grp._id, grant: g_lib.PERM_MEMBER, inhgrant: g_lib.PERM_MEMBER });

                proj.new.admins = [];
                proj.new.members = [];
                proj.new.owner = client._id;
                var uid;

                if ( req.queryParams.admins ) {
                    for ( i in req.queryParams.admins ) {
                        uid = req.queryParams.admins[i];
                        if ( uid == client._id )
                            continue;
                        if ( !g_db._exists( uid ))
                            throw g_lib.ERR_USER_NOT_FOUND;
                        g_db.admin.save({ _from: proj._id, _to: uid });
                        proj.new.admins.push( uid );
                    }
                }

                if ( req.queryParams.members ) {
                    for ( i in req.queryParams.members ) {
                        uid = req.queryParams.members[i];
                        if ( uid == client._id || proj.new.admins.indexOf( uid ) != -1 )
                            continue;
                        if ( !g_db._exists( uid ))
                            throw g_lib.ERR_USER_NOT_FOUND;
                        g_db.member.save({ _from: mem_grp._id, _to: uid });
                        proj.new.members.push( uid );
                    }
                }

                proj.new.id = proj.new._id;
                delete proj.new._id;
                delete proj.new._key;
                delete proj.new._rev;

                result = [proj.new];
            }
        });

        res.send( result );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('id', joi.string().optional().allow(""), "ID for new project")
.queryParam('title', joi.string().optional().allow(""), "Title")
.queryParam('desc', joi.string().optional().allow(""), "Description")
.queryParam('sub_repo', joi.string().optional(), "Sub-allocation repo ID")
.queryParam('sub_alloc', joi.number().optional(), "Sub-allocation size")
.queryParam('admins', joi.array().items(joi.string()).optional(), "Additional project administrators (uids)")
.queryParam('members', joi.array().items(joi.string()).optional(), "Project members (uids)")
.summary('Create new project')
.description('Create new project.');


router.get('/update', function (req, res) {
    try {
        var result;

        g_db._executeTransaction({
            collections: {
                read: ["u","p","uuid","accn"],
                write: ["p","admin","member","acl"]
            },
            action: function() {
                const client = g_lib.getUserFromClientID( req.queryParams.client );
                var proj_id = req.queryParams.id;
                g_lib.ensureAdminPermProj( client, proj_id );
                var owner_id = g_db.owner.firstExample({ _from: proj_id })._to;

                console.log("proj update" );
                console.log("pu client id:", client._id );
                console.log("pu proj id:", proj_id );
                console.log("pu owner id:", owner_id );

                var time = Math.floor( Date.now()/1000 );
                var obj = {ut:time};

                g_lib.procInputParam( req.queryParams, "title", true, obj );
                g_lib.procInputParam( req.queryParams, "desc", true, obj );

                console.log("pu 1" );

                if ( req.queryParams.sub_repo ){
                    // Verify there isn't a real allocation present
                    if ( g_db.alloc.firstExample({_from:proj_id}))
                        throw g_lib.ERR_ALLOC_IN_USE;

                    // Verify that there are no existing data records
                    var data = g_db._query("for v in 1..1 inbound @proj owner filter IS_SAME_COLLECTION('d',v) return v._id",{proj:proj_id}).toArray();
                    if ( data.length )
                        throw g_lib.ERR_ALLOC_IN_USE;
                    if ( req.queryParams.sub_repo != 'none' ){
                        var alloc = g_lib.verifyRepo( client._id, req.queryParams.sub_repo );
                        if (  req.queryParams.sub_alloc <= 0 )
                            throw g_lib.ERR_INVALID_PARAM;
                        if ( req.queryParams.sub_alloc > alloc.alloc )
                            throw g_lib.ERR_ALLOCATION_EXCEEDED;

                        obj.sub_repo = req.queryParams.sub_repo;
                        obj.sub_alloc = req.queryParams.sub_alloc;
                        obj.sub_usage = 0;
                    }else{
                        obj.sub_repo = null;
                        obj.sub_alloc = null;
                        obj.sub_usage = null;
                    }
                }else if ( req.queryParams.sub_alloc ){
                    obj.sub_alloc = req.queryParams.sub_alloc;
                }
                console.log("pu 2");

                var proj = g_db._update( proj_id, obj, { keepNull: false, returnNew: true });

                var uid, i;
                proj.new.admins = [];
                proj.new.members = [];

                if ( req.queryParams.admins ) {
                    var links;
                    g_db.admin.removeByExample({ _from: proj_id });
                    for ( i in req.queryParams.admins ) {
                        uid = req.queryParams.admins[i];
                        if ( uid == owner_id )
                            continue;
                        if ( !g_db._exists( uid ))
                            throw g_lib.ERR_USER_NOT_FOUND;
                        g_db.admin.save({ _from: proj_id, _to: uid });
                        // Remove Admin from all groups and ACLs
                        links = g_db._query("for v,e,p in 2..2 inbound @user acl, outbound owner filter v._id == @proj return p.edges[0]._id",{user:uid,proj:proj_id});
                        while ( links.hasNext() ){
                            g_db.acl.remove( links.next() );
                        }
                        links = g_db._query("for v,e,p in 2..2 inbound @user member, outbound owner filter v._id == @proj return p.edges[0]._id",{user:uid,proj:proj_id});
                        while ( links.hasNext() ){
                            g_db.member.remove( links.next() );
                        }
                        proj.new.admins.push( uid );
                    }
                }else{
                    // TODO - Why not just assign query result directly to new?
                    var admins = g_db._query( "for i in admin filter i._from == @proj return i._to", { proj: proj_id }).toArray();
                    for ( i in admins ) {
                        proj.new.admins.push( admins[i]);
                    }
                }
                console.log("pu 3" );

                if ( req.queryParams.members ) {
                    var mem_grp = g_db.g.firstExample({ uid: proj_id, gid: "members" });
                    g_db.member.removeByExample({ _from: mem_grp._id });
                    for ( i in req.queryParams.members ) {
                        uid = req.queryParams.members[i];
                        if ( uid == owner_id || proj.new.admins.indexOf( uid ) != -1 )
                            continue;
                        if ( !g_db._exists( uid ))
                            throw g_lib.ERR_USER_NOT_FOUND;
                        g_db.member.save({ _from: mem_grp._id, _to: uid });
                        proj.new.members.push( uid );
                    }
                }else{
                    var members = g_db._query( "for v,e,p in 2..2 inbound @proj owner, outbound member filter p.vertices[1].gid == 'members' return v._id", { proj: proj_id }).toArray();

                    if ( members.length )
                        proj.new.members = members;
                }
                console.log("pu 4");
                console.log("pu new",proj.new );
                console.log("pu new id",proj.new._id );

                proj.new.id = proj.new._id;
                proj.new.owner = owner_id;

                delete proj.new._id;
                delete proj.new._key;
                delete proj.new._rev;

                result = [proj.new];
            }
        });

        res.send( result );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('id', joi.string().required(), "Project ID")
.queryParam('title', joi.string().optional().allow(''), "New title")
.queryParam('desc', joi.string().optional().allow(''), "Description")
.queryParam('sub_repo', joi.string().optional(), "Sub-allocation repo ID")
.queryParam('sub_alloc', joi.number().optional(), "Sub-allocation size")
.queryParam('admins', joi.array().items(joi.string()).optional(), "Account administrators (uids)")
.queryParam('members', joi.array().items(joi.string()).optional(), "Project members (uids)")
.summary('Update project information')
.description('Update project information');


router.get('/view', function (req, res) {
    try {
        // TODO Enforce view permission

        var client = g_lib.getUserFromClientID( req.queryParams.client );
        var proj = g_db.p.document({ _id: req.queryParams.id });
        var owner_id = g_db.owner.firstExample({_from: proj._id })._to;
        var admins = g_db._query("for v in 1..1 outbound @proj admin return v._id", { proj: proj._id } ).toArray();
        if ( admins.length ) {
            proj.admins = admins;
        } else
            proj.admins = [];

        if ( g_lib.getProjectRole( client._id, proj._id ) != g_lib.PROJ_NO_ROLE ){
            var members = g_db._query( "for v,e,p in 2..2 inbound @proj owner, outbound member filter p.vertices[1].gid == 'members' return v._id", { proj: proj._id }).toArray();

            if ( members.length ) {
                proj.members = members;
            } else
                proj.members = [];

            proj.allocs = g_db.alloc.byExample({_from:proj._id}).toArray();
            if ( proj.allocs.length ) {
                var alloc;

                for ( var i in proj.allocs ){
                    alloc = proj.allocs[i];
                    delete alloc._from;
                    alloc.repo = alloc._to.substr(5);
                    delete alloc._to;
                    delete alloc._key;
                    delete alloc._id;
                    delete alloc._rev;
                }
            }
        }


        proj.id = proj._id;
        proj.owner = owner_id;

        delete proj._id;
        delete proj._key;
        delete proj._rev;

        res.send([proj]);
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('id', joi.string().required(), "Project ID")
.summary('View project information')
.description('View project information');

router.get('/list/all', function (req, res) {
    res.send( g_db._query( "for i in p return { id: i._id, name: i.name }" ));
})
.summary('List projects')
.description('List projects');

router.get('/list', function (req, res) {
    const client = g_lib.getUserFromClientID( req.queryParams.client );
    var count = (req.queryParams.by_owner?1:0) + (req.queryParams.by_admin?1:0) + (req.queryParams.by_member?1:0);
    var comma = false;

    var qry;
    if ( count != 1 )
        qry = "for x in union((";
    else
        qry = "";

    if ( !count || req.queryParams.by_owner ){
        qry += "for v in 1..1 inbound @user owner filter IS_SAME_COLLECTION('p',v) return { id: v._id, title: v.title }";
        comma = (count != 1);
    }

    if ( !count || req.queryParams.by_admin ){
        qry += (comma?"),(":"") + "for v in 1..1 inbound @user admin filter IS_SAME_COLLECTION('p',v) return { id: v._id, title: v.title }";
        comma = (count != 1);
    }

    if ( !count || req.queryParams.by_member )
        qry += (comma?"),(":"") + "for v,e,p in 2..2 inbound @user member, outbound owner filter p.vertices[1].gid == 'members' return { id: v._id, title: v.title }";

    if ( comma )
        qry += ")) sort x.title return x";

    res.send( g_db._query( qry, { user: client._id }));

})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('by_owner', joi.bool().optional(), "List projects owned by client")
.queryParam('by_admin', joi.bool().optional(), "List projects administered by client")
.queryParam('by_member', joi.bool().optional(), "List projects where client is a member")
.summary('List projects')
.description('List projects. If no options are provided, lists all projects associated with client.');

/*
router.get('/list/by_owner', function (req, res) {
    const client = g_lib.getUserFromClientID( req.queryParams.client );
    res.send( g_db._query( "for v in 1..1 inbound @user owner filter IS_SAME_COLLECTION('p',v) return { uid: v._key, title: v.title }", { user: client._id }));
})
.queryParam('client', joi.string().required(), "Client ID")
.summary('List projects')
.description('List projects');

router.get('/list/by_admin', function (req, res) {
    const client = g_lib.getUserFromClientID( req.queryParams.client );
    res.send( g_db._query( "for v in 1..1 inbound @user admin filter IS_SAME_COLLECTION('p',v) return { uid: v._key, title: v.title }", { user: client._id }));
})
.queryParam('client', joi.string().required(), "Client ID")
.summary('List projects')
.description('List projects');

router.get('/list/by_member', function (req, res) {
    const client = g_lib.getUserFromClientID( req.queryParams.client );
    res.send( g_db._query( "for v,e,p in 2..2 inbound @user member, outbound owner filter p.vertices[1].gid == 'members' return { uid: v._key, title: v.title }", { user: client._id }));
})
.queryParam('client', joi.string().required(), "Client ID")
.summary('List projects')
.description('List projects');
*/

router.get('/delete', function (req, res) {
    try {
        g_db._executeTransaction({
            collections: {
                read: ["u","admin"],
                write: ["p","g","uuid","accn","c","d","a","acl","owner","ident","alias","admin","member","item","alloc","loc","top","t"]
            },
            action: function() {
                const client = g_lib.getUserFromClientID( req.queryParams.client );
                var proj_id = req.queryParams.id;
                g_lib.ensureAdminPermProj( client, proj_id );
                var proj = g_db.p.document( proj_id );
                var size = 0;
                var objects,obj;
                var locations=[];

                if ( proj.sub_repo ){
                    // Collect data locations, size
                    objects = g_db._query( "for v in 1..1 inbound @proj owner filter is_same_collection('d',v) let loc = (for v2,e2 in 1..1 outbound v._id loc return {repo:e2._to,path:e2.path}) return {id:v._id,size:v.size,loc:loc[0]}", { proj: proj_id });

                    while ( objects.hasNext() ) {
                        obj = objects.next();
                        // Save location
                        locations.push({id:obj.id,repo_id:obj.loc.repo,path:obj.loc.path});
                        size += obj.size;
                    }

                    var owner_id = g_db.owner.firstExample({ _from: proj_id })._to;
                    obj = g_db.alloc.firstExample({_from: owner_id, _to: proj.sub_repo});
                    g_db._update( obj._id, { usage: obj.usage - size });
                }else{
                    objects = g_db.alloc.byExample({ _from: proj_id });
                    while ( objects.hasNext() ) {
                        obj = objects.next();
                        locations.push({id:proj_id,repo_id:obj._to,path:"all"});
                    }
                }

                objects = g_db._query( "for v in 1..1 inbound @proj owner return v._id", { proj: proj_id });
                var top;

                while ( objects.hasNext() ) {
                    obj = objects.next();
                    if ( obj[0] == "d" ){
                        top = g_db.top.firstExample({_from: obj});
                        if ( top )
                            g_lib.topicUnlink( obj );
                    }
                    g_graph[obj[0]].remove( obj );
                    //g_graph[obj.substr(0,obj.indexOf("/"))].remove( obj );
                }

                g_graph.p.remove( proj_id );

                res.send( locations );
            }
        });
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('id', joi.string().required(), "Project ID")
.summary('Remove existing project')
.description('Remove existing project.');

