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

                if ( req.queryParams.domain.startsWith("user.")){
                    if ( req.queryParams.domain != "user."+client._key)
                        throw g_lib.ERR_INVALID_DOMAIN;
                }

                var proj_data = { _key: req.queryParams.id, title: req.queryParams.title, domain: req.queryParams.domain };

                if ( req.queryParams.repo ){
                    if ( !g_lib.verifyRepo( client._id, req.queryParams.repo ))
                        throw g_lib.ERR_NO_ALLOCATION;
                    proj_data.repo =  req.queryParams.repo;
                }

                if ( req.queryParams.desc )
                    proj_data.desc = req.queryParams.desc;

                var proj = g_db.p.save( proj_data, { returnNew: true });
                g_db.owner.save({ _from: proj._id, _to: client._id });

                var root = g_db.c.save({ _key: req.queryParams.id + "_root", is_root: true, title: "root", desc: "Root collection for project " + req.queryParams.id }, { returnNew: true });

                var alias = g_db.a.save({ _key: req.queryParams.id + ":root" }, { returnNew: true });
                g_db.owner.save({ _from: alias._id, _to: proj._id });

                g_db.alias.save({ _from: root._id, _to: alias._id });
                g_db.owner.save({ _from: root._id, _to: proj._id });

                var i;
                var mem_grp;

                // Projects have a special "members" group associated with root
                mem_grp = g_db.g.save({ uid: "p/" + req.queryParams.id, gid: "members", title: "Project Members", desc: "Use to set baseline project member permissions." }, { returnNew: true });
                g_db.owner.save({ _from: mem_grp._id, _to: proj._id });
                g_db.acl.save({ _from: root._id, _to: mem_grp._id, grant: g_lib.PERM_MEMBER, inhgrant: g_lib.PERM_MEMBER });

                proj.new.admins = [];
                proj.new.members = [];
                proj.new.owner = client._key;
                var uid;

                if ( req.queryParams.admins ) {
                    for ( i in req.queryParams.admins ) {
                        uid = req.queryParams.admins[i];
                        if ( uid == client._key )
                            continue;
                        if ( !g_db._exists( "u/" + uid ))
                            throw g_lib.ERR_USER_NOT_FOUND;
                        g_db.admin.save({ _from: proj._id, _to: "u/" + uid });
                        proj.new.admins.push( uid );
                    }
                }

                if ( req.queryParams.members ) {
                    for ( i in req.queryParams.members ) {
                        uid = req.queryParams.members[i];
                        if ( uid == client._key || proj.new.admins.indexOf( uid ) != -1 )
                            continue;
                        if ( !g_db._exists( "u/" + uid ))
                            throw g_lib.ERR_USER_NOT_FOUND;
                        g_db.member.save({ _from: mem_grp._id, _to: "u/" + uid });
                        proj.new.members.push( uid );
                    }
                }

                proj.new.id = proj.new._key;
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
.queryParam('id', joi.string().required(), "ID for new project")
.queryParam('title', joi.string().required(), "Title (must be unque within domain)")
.queryParam('domain', joi.string().required(), "Domain or topic (in reverse dotted notation)")
.queryParam('desc', joi.string().required(), "Description")
.queryParam('repo', joi.string().optional(), "Repository ID (must be associated with client)")
.queryParam('admins', joi.array().items(joi.string()).optional(), "Additional project administrators (uids)")
.queryParam('members', joi.array().items(joi.string()).optional(), "Project members (uids)")
.summary('Create new project')
.description('Create new project. For personal projects, domain should be user.uid (where \'uid\' is your user ID).');


router.get('/update', function (req, res) {
    try {
        var result;

        g_db._executeTransaction({
            collections: {
                read: ["u","p","uuid","accn"],
                write: ["p","admin","member"]
            },
            action: function() {
                const client = g_lib.getUserFromClientID( req.queryParams.client );
                var proj_id = (req.queryParams.id.startsWith("p/")?"":"p/") + req.queryParams.id;
                g_lib.ensureAdminPermProj( client, proj_id );
                var owner_id = g_db.owner.firstExample({ _from: proj_id })._to.substr(2);

                var obj = {};

                if ( req.queryParams.domain ){
                    if ( req.queryParams.domain.startsWith("user.")){
                        if ( req.queryParams.domain != "user."+client._key)
                            throw g_lib.ERR_INVALID_DOMAIN;
                    }
                    obj.domain = req.queryParams.domain;
                }

                if ( req.queryParams.title )
                    obj.title = req.queryParams.title;

                if ( req.queryParams.desc )
                    obj.desc = req.queryParams.desc;

                var proj = g_db._update( proj_id, obj, { keepNull: false, returnNew: true });

                var uid, i;
                proj.new.admins = [];
                proj.new.members = [];

                if ( req.queryParams.admins ) {
                    g_db.admin.removeByExample({ _from: proj_id });
                    for ( i in req.queryParams.admins ) {
                        uid = req.queryParams.admins[i];
                        if ( uid == owner_id )
                            continue;
                        if ( !g_db._exists( "u/" + uid ))
                            throw g_lib.ERR_USER_NOT_FOUND;
                        g_db.admin.save({ _from: proj._id, _to: "u/" + uid });
                        proj.new.admins.push( uid );
                    }
                }else{
                    var admins = g_db._query( "for i in admin filter i._from == @proj return i._to", { proj: proj_id }).toArray();
                    for ( i in admins ) {
                        proj.new.admins.push( admins[i].substr( 2 ));
                    }
                }

                if ( req.queryParams.members ) {
                    var mem_grp = g_db.g.firstExample({ uid: proj_id, gid: "members" });
                    g_db.member.removeByExample({ _from: mem_grp._id });
                    for ( i in req.queryParams.members ) {
                        uid = req.queryParams.members[i];
                        if ( uid == owner_id || proj.new.admins.indexOf( uid ) != -1 )
                            continue;
                        if ( !g_db._exists( "u/" + uid ))
                            throw g_lib.ERR_USER_NOT_FOUND;
                        g_db.member.save({ _from: mem_grp._id, _to: "u/" + uid });
                        proj.new.members.push( uid );
                    }
                }else{
                    var members = g_db._query( "for v,e,p in 2..2 inbound @proj owner, outbound member filter p.vertices[1].gid == 'members' return v._key", { proj: proj_id }).toArray();

                    if ( members.length )
                        proj.new.members = members;
                }

                proj.new.id = proj.new._key;
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
.queryParam('title', joi.string().optional(), "New title")
.queryParam('domain', joi.string().optional(), "Domain or topic (in reverse dotted notation)")
.queryParam('desc', joi.string().optional(), "Description")
.queryParam('admins', joi.array().items(joi.string()).optional(), "Account administrators (uids)")
.queryParam('members', joi.array().items(joi.string()).optional(), "Project members (uids)")
.summary('Update project information')
.description('Update project information');


router.get('/view', function (req, res) {
    try {
        var client = g_lib.getUserFromClientID( req.queryParams.client );
        var proj = g_db.p.document({ _id: (req.queryParams.id.startsWith("p/")?"":"p/") + req.queryParams.id });
        var owner_id = g_db.owner.firstExample({_from: proj._id })._to.substr(2);
        var admins = g_db._query("for v in 1..1 outbound @proj admin return v._key", { proj: proj._id } ).toArray();
        if ( admins.length ) {
            proj.admins = admins;
        } else
            proj.admins = [];

        if ( g_lib.getProjectRole( client, proj ) != g_lib.PROJ_NO_ROLE ){
            var members = g_db._query( "for v,e,p in 2..2 inbound @proj owner, outbound member filter p.vertices[1].gid == 'members' return v._key", { proj: proj._id }).toArray();

            if ( members.length ) {
                proj.members = members;
            } else
                proj.members = [];
        }

        proj.id = proj._key;
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
    res.send( g_db._query( "for i in p return { id: i._key, name: i.name }" ));
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
        qry += "for v in 1..1 inbound @user owner filter IS_SAME_COLLECTION('p',v) return { id: v._key, title: v.title }";
        comma = (count != 1);
    }

    if ( !count || req.queryParams.by_admin ){
        qry += (comma?"),(":"") + "for v in 1..1 inbound @user admin filter IS_SAME_COLLECTION('p',v) return { id: v._key, title: v.title }";
        comma = (count != 1);
    }

    if ( !count || req.queryParams.by_member )
        qry += (comma?"),(":"") + "for v,e,p in 2..2 inbound @user member, outbound owner filter p.vertices[1].gid == 'members' return { id: v._key, title: v.title }";

    if ( comma )
        qry += ")) return x";

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
                write: ["p","g","uuid","accn","c","d","n","a","acl","owner","ident","alias","admin","member","item","tag","note","alloc","loc"]
            },
            action: function() {
                const client = g_lib.getUserFromClientID( req.queryParams.client );
                var proj_id = (req.queryParams.id.startsWith("p/")?"":"p/") + req.queryParams.id;
                g_lib.ensureAdminPermProj( client, proj_id );

                var objects;
                var obj;
                var i;

                // Delete collections, data, groups, notes
                objects = g_db._query( "for v in 1..1 inbound @proj owner return v._id", { proj: proj_id }).toArray();
                for ( i in objects ) {
                    obj = objects[i];
                    g_graph[obj.substr(0,obj.indexOf("/"))].remove( obj );
                }

                g_graph.p.remove( proj_id );
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

