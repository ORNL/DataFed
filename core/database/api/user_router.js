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

//==================== USER API FUNCTIONS

router.get('/authn', function (req, res) {
    try {
        const client = g_lib.getUserFromClientID( req.queryParams.client );

        if ( client.password != req.queryParams.pw )
            throw g_lib.ERR_AUTHN_FAILED;

        res.send({ "authorized": 1 });
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client SDMS UID")
.queryParam('pw', joi.string().required(), "SDMS account password")
.summary('Authenticate user')
.description('Authenticate user using SDMS password');


router.get('/create', function (req, res) {
    try {
        var result;

        g_db._executeTransaction({
            collections: {
                read: ["u"],
                write: ["u","c","a","g","acl","owner","ident","uuid","alias","admin"]
            },
            action: function() {
                var user_data = {
                    _key: req.queryParams.uid,
                    name: req.queryParams.name,
                    is_admin: req.queryParams.is_admin,
                    max_coll: g_lib.DEF_MAX_COLL,
                    max_proj: g_lib.DEF_MAX_PROJ,
                    max_sav_qry: g_lib.DEF_MAX_SAV_QRY
                };

                if ( req.queryParams.password )
                    user_data.password = req.queryParams.password;

                if ( req.queryParams.email )
                    user_data.email = req.queryParams.email;

                if ( req.queryParams.options )
                    user_data.options = req.queryParams.options;

                var user = g_db.u.save( user_data, { returnNew: true });

                var root = g_db.c.save({ _key: "u_" + req.queryParams.uid + "_root", is_root: true, owner: user._id, title: "root", desc: "Root collection for user " + req.queryParams.name + " (" + req.queryParams.uid +")" }, { returnNew: true });

                var alias = g_db.a.save({ _key: "u:" + req.queryParams.uid + ":root" }, { returnNew: true });
                g_db.owner.save({ _from: alias._id, _to: user._id });

                g_db.alias.save({ _from: root._id, _to: alias._id });
                g_db.owner.save({ _from: root._id, _to: user._id });

                var i,uuid;

                for ( i in req.queryParams.uuids ) {
                    uuid = "uuid/" + req.queryParams.uuids[i];
                    if ( g_db._exists({ _id: uuid }))
                        throw [g_lib.ERR_IN_USE,"Identity value, "+uuid+", already in use"];

                    g_db.uuid.save({ _key: req.queryParams.uuids[i] }, { returnNew: true });
                    g_db.ident.save({ _from: user._id, _to: uuid });
                }

                user.new.uid = user.new._id;
                if ( req.queryParams.admins )
                    user.new.admins = req.queryParams.admins;

                delete user.new._id;
                delete user.new._key;
                delete user.new._rev;

                result = [user.new];
            }
        });

        res.send( result );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('uid', joi.string().required(), "SDMS user ID (globus) for new user")
.queryParam('password', joi.string().required(), "SDMS account password")
.queryParam('name', joi.string().required(), "Name")
.queryParam('email', joi.string().optional(), "Email")
.queryParam('options', joi.string().optional(), "Application options (JSON string)")
.queryParam('uuids', joi.array().items(joi.string()).required(), "Globus identities (UUIDs)")
.queryParam('is_admin', joi.boolean().optional(), "New account is a system administrator")
.summary('Create new user entry')
.description('Create new user entry.');


router.get('/update', function (req, res) {
    try {
        var result;

        g_db._executeTransaction({
            collections: {
                read: ["u","uuid","accn"],
                write: ["u","admin"]
            },
            action: function() {
                const client = g_lib.getUserFromClientID( req.queryParams.client );
                var user_id;

                if ( req.queryParams.subject ) {
                    user_id = req.queryParams.subject;
                    if ( !g_db.u.exists( user_id ))
                        throw [ g_lib.ERR_INVALID_PARAM, "No such user '" + user_id + "'" ];
                    g_lib.ensureAdminPermUser( client, user_id );
                }
                else {
                    user_id = client._id;
                }

                var obj = {};

                if ( req.queryParams.password )
                    obj.password = req.queryParams.password;

                if ( req.queryParams.name )
                    obj.name = req.queryParams.name;

                if ( req.queryParams.email )
                    obj.email = req.queryParams.email;

                if ( req.queryParams.options )
                    obj.options = req.queryParams.options;

                if ( client.is_admin ) {
                    if ( req.queryParams.is_admin )
                        obj.is_admin = req.queryParams.is_admin;
                }

                var user = g_db._update( user_id, obj, { keepNull: false, returnNew: true });

                user.new.uid = user.new._id;

                delete user.new._id;
                delete user.new._key;
                delete user.new._rev;
                delete user.new.pub_key;
                delete user.new.priv_key;
                delete user.new.access;
                delete user.new.refresh;

                result = [user.new];
            }
        });

        res.send( result );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client uid")
.queryParam('subject', joi.string().optional(), "UID of subject user (optional)")
.queryParam('password', joi.string().optional(), "SDMS account password")
.queryParam('name', joi.string().optional(), "New name")
.queryParam('email', joi.string().optional(), "New email")
.queryParam('options', joi.string().optional(), "Application options (JSON string)")
.queryParam('is_admin', joi.boolean().optional(), "New system administrator flag value")
.summary('Update user information')
.description('Update user information');


router.get('/find/by_uuids', function (req, res) {
    try {
        // Convert UUIDs to DB _ids
        var uuids = [];
        for ( var i in req.queryParams.uuids ) {
            uuids.push( "uuid/" + req.queryParams.uuids[i] );
        }

        var user = g_lib.findUserFromUUIDs( uuids );

        var idents = g_db._query("for v in 1..1 outbound @user ident return v._key", { user: user._id } ).toArray();
        if ( idents.length ) {
            user.idents = idents;
        }

        user.uid = user._id;

        delete user._id;
        delete user._key;
        delete user._rev;

        res.send([user]);
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('uuids', joi.array().items(joi.string()).required(), "User UUID List")
.summary('Find a user from list of UUIDs')
.description('Find a user from list of UUIDs');


router.get('/keys/set', function (req, res) {
    try {
        g_db._executeTransaction({
            collections: {
                read: ["u","uuid","accn"],
                write: ["u"]
            },
            action: function() {
                const client = g_lib.getUserFromClientID( req.queryParams.client );
                var user_id;

                if ( req.queryParams.subject ) {
                    user_id = req.queryParams.subject;
                    if ( !g_db.u.exists( user_id ))
                        throw [ g_lib.ERR_INVALID_PARAM, "No such user '" + user_id + "'" ];
                    g_lib.ensureAdminPermUser( client, user_id );
                }
                else {
                    user_id = client._id;
                }

                var obj = { pub_key: req.queryParams.pub_key, priv_key: req.queryParams.priv_key };
                g_db._update( user_id, obj, { keepNull: false });
            }
        });
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('subject', joi.string().optional(), "UID of subject user")
.queryParam('pub_key', joi.string().required(), "User public key")
.queryParam('priv_key', joi.string().required(), "User private key")
.summary('Set user public and private keys')
.description('Set user public and private keys');

router.get('/keys/clear', function (req, res) {
    try {
        g_db._executeTransaction({
            collections: {
                read: ["u","uuid","accn"],
                write: ["u"]
            },
            action: function() {
                const client = g_lib.getUserFromClientID( req.queryParams.client );
                var user_id;

                if ( req.queryParams.subject ) {
                    user_id = req.queryParams.subject;
                    if ( !g_db.u.exists( user_id ))
                        throw [ g_lib.ERR_INVALID_PARAM, "No such user '" + user_id + "'" ];
                    g_lib.ensureAdminPermUser( client, user_id );
                }
                else {
                    user_id = client._id;
                }

                var obj = { pub_key: null, priv_key: null };
                g_db._update( user_id, obj, { keepNull: false });
            }
        });
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('subject', joi.string().optional(), "UID of subject user")
.summary('Clear user public and private keys')
.description('Clear user public and private keys');

router.get('/keys/get', function( req, res ) {
    try {
        var user;

        if ( req.queryParams.subject ) {
            if ( !g_db.u.exists( req.queryParams.subject ))
                throw [ g_lib.ERR_INVALID_PARAM, "No such user '" + req.queryParams.subject + "'" ];

            user = g_db.u.document({ _id: req.queryParams.subject });
        }else{
            user = g_lib.getUserFromClientID( req.queryParams.client );
        }

        if ( !user.pub_key || !user.priv_key )
            res.send([{ uid: user._id }]);
        else
            res.send([{ uid: user._id, pub_key: user.pub_key, priv_key: user.priv_key }]);
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('subject', joi.string().optional(), "UID of subject user")
.summary('Get user public and private keys')
.description('Get user public and private keys');

router.get('/find/by_pub_key', function (req, res) {
    try {
        var uid = g_lib.uidFromPubKey( req.queryParams.pub_key );

        res.send(uid);
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('pub_key', joi.string().required(), "User public key")
.summary('Find a user by public key')
.description('Find a user by public key');

router.get('/token/set', function (req, res) {
    try {
        g_db._executeTransaction({
            collections: {
                read: ["u","uuid","accn"],
                write: ["u"]
            },
            action: function() {
                const client = g_lib.getUserFromClientID( req.queryParams.client );
                var user_id;

                if ( req.queryParams.subject ) {
                    user_id = req.queryParams.subject;
                    if ( !g_db.u.exists( user_id ))
                        throw [ g_lib.ERR_INVALID_PARAM, "No such user '" + user_id + "'" ];
                    g_lib.ensureAdminPermUser( client, user_id );
                }
                else {
                    user_id = client._id;
                }

                var obj = { access: req.queryParams.access, refresh: req.queryParams.refresh };
                g_db._update( user_id, obj, { keepNull: false });
            }
        });
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('subject', joi.string().optional(), "UID of subject user")
.queryParam('access', joi.string().required(), "User access token")
.queryParam('refresh', joi.string().required(), "User refresh token")
.summary('Set user tokens')
.description('Set user tokens');

router.get('/token/get', function( req, res ) {
    try {
        var user;

        if ( req.queryParams.subject ) {
            if ( !g_db.u.exists( req.queryParams.subject ))
                throw [ g_lib.ERR_INVALID_PARAM, "No such user '" + req.queryParams.subject + "'" ];

            user = g_db.u.document({ _id: req.queryParams.subject });
        } else {
            user = g_lib.getUserFromClientID( req.queryParams.client );
        }

        var result = {};
        if ( user.access )
            result.access = user.access;
        if ( user.refresh )
            result.refresh = user.refresh;

        res.send(result);
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('subject', joi.string().optional(), "UID of subject user")
.summary('Get user tokens')
.description('Get user tokens');

router.get('/token/get/access', function( req, res ) {
    try {
        var user;

        if ( req.queryParams.subject ) {
            if ( !g_db.u.exists( req.queryParams.subject ))
                throw [ g_lib.ERR_INVALID_PARAM, "No such user '" + req.queryParams.subject + "'" ];
            user = g_db.u.document({ _id: req.queryParams.subject });
        } else {
            user = g_lib.getUserFromClientID( req.queryParams.client );
        }

        if ( !user.access )
            throw [g_lib.ERR_NOT_FOUND,"No access token found"];

        res.send( user.access );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('subject', joi.string().optional(), "UID of subject user")
.summary('Get user access token')
.description('Get user access token');


router.get('/view', function (req, res) {
    try {
        var user;

        if ( req.queryParams.subject ) {
            if ( !g_db.u.exists( req.queryParams.subject ))
                throw [ g_lib.ERR_INVALID_PARAM, "No such user '" + req.queryParams.subject + "'" ];
            user = g_db.u.document({ _id: req.queryParams.subject });
        } else {
            user = g_lib.getUserFromClientID( req.queryParams.client );
        }

        var repos = g_db._query("for v in 1..1 inbound @user admin filter is_same_collection('repo',v) return v._key", { user: user._id } ).toArray();
        if ( repos.length )
            user.is_repo_admin = true;

        if ( req.queryParams.details ) {
            var idents = g_db._query("for v in 1..1 outbound @user ident return v._key", { user: user._id } ).toArray();
            if ( idents.length ) {
                user.idents = idents;
            }

            user.allocs = g_db.alloc.byExample({_from:user._id}).toArray();
            if ( user.allocs.length ) {
                var alloc;

                for ( var i in user.allocs ){
                    alloc = user.allocs[i];
                    delete alloc._from;
                    alloc.repo = alloc._to.substr(5);
                    delete alloc._to;
                    delete alloc._key;
                    delete alloc._id;
                    delete alloc._rev;
                }
            }
        }

        user.uid = user._id;

        delete user._id;
        delete user._key;
        delete user._rev;
        delete user.pub_key;
        delete user.priv_key;
        delete user.access;
        delete user.refresh;

        res.send([user]);
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('subject', joi.string().optional(), "UID of subject user to view")
.queryParam('details', joi.boolean().optional(), "Show additional user details")
.summary('View user information')
.description('View user information');


router.get('/list/all', function (req, res) {
    var qry = "for i in u sort i.name";
    var result;

    if ( req.queryParams.offset != undefined && req.queryParams.count != undefined ){
        qry += " limit " + req.queryParams.offset + ", " + req.queryParams.count + " return { uid: i._id, name: i.name }";
        result = g_db._query( qry, {},{},{fullCount:true});
        var tot = result.getExtra().stats.fullCount;
        result = result.toArray();
        result.push({paging:{off:req.queryParams.offset,cnt:req.queryParams.count,tot:tot}});
    }
    else{
        qry += " return { uid: i._id, name: i.name }";
        result = g_db._query( qry );
    }

    res.send( result );
})
.queryParam('offset', joi.number().optional(), "Offset")
.queryParam('count', joi.number().optional(), "Count")
.summary('List all users')
.description('List all users');

router.get('/list/collab', function (req, res) {
    var client = g_lib.getUserFromClientID( req.queryParams.client );
    var qry = "for x in union_distinct((for v in 2..2 any @user owner, member, acl filter is_same_collection('u',v) return distinct { uid: v._id, name: v.name }),(for v in 3..3 inbound @user member, outbound owner, outbound admin filter is_same_collection('u',v) return distinct { uid: v._id, name: v.name }),(for v in 2..2 inbound @user owner, outbound admin filter is_same_collection('u',v) return distinct { uid: v._id, name: v.name })) sort x.name";
    var result;

    // Members of owned groups and owned user ACLS:
    // Members of groups client belongs to (not owned - projects and ACLs)
    // Owner of user-ACLs of with client is the subject
    // Members and admins of owned projects
    // Owner and admins of member projects (members gathered by group members above)
    if ( req.queryParams.offset != undefined && req.queryParams.count != undefined ){
        qry += " limit " + req.queryParams.offset + ", " + req.queryParams.count + " return x";
        result = g_db._query( qry, { user: client._id }, {}, {fullCount:true});
        var tot = result.getExtra().stats.fullCount;
        result = result.toArray();
        result.push({paging:{off:req.queryParams.offset,cnt:req.queryParams.count,tot:tot}});
    }
    else{
        qry += " return x";
        result = g_db._query( qry, { user: client._id } );
    }

    res.send( result );
    //res.send( g_db._query( "for x in union_distinct((for v in 2..2 any @user owner, member, acl filter is_same_collection('u',v) return distinct { uid: v._id, name: v.name }),(for v in 3..3 inbound @user member, outbound owner, outbound admin filter is_same_collection('u',v) return distinct { uid: v._id, name: v.name }),(for v in 2..2 inbound @user owner, outbound admin filter is_same_collection('u',v) return distinct { uid: v._id, name: v.name })) return x", { user: client._id }));
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('offset', joi.number().optional(), "Offset")
.queryParam('count', joi.number().optional(), "Count")
.summary('List collaborators of client')
.description('List collaborators of client (from groups, projects, and ACLs)');

router.get('/delete', function (req, res) {
    try {
        g_db._executeTransaction({
            collections: {
                read: ["u","admin"],
                write: ["u","p","g","uuid","accn","c","d","a","acl","owner","ident","alias","admin","member","item","alloc","loc"]
            },
            action: function() {
                const client = g_lib.getUserFromClientID( req.queryParams.client );
                var user_id;

                if ( req.queryParams.subject ) {
                    user_id = req.queryParams.subject;
                    if ( !g_db.u.exists( user_id ))
                        throw [ g_lib.ERR_INVALID_PARAM, "No such user '" + user_id + "'" ];
                    g_lib.ensureAdminPermUser( client, user_id );
                }
                else {
                    user_id = client._id;
                }
                console.log( "delete user", user_id );

                var objects,subobjects,obj,subobj,i,j;

                // Delete linked accounts
                objects = g_db._query( "for v in 1..1 outbound @user ident return v._id", { user: user_id }).toArray();
                for ( i in objects ) {
                    obj = objects[i];
                    console.log( "del ident", obj );
                    g_graph[obj.substr(0,obj.indexOf("/"))].remove( obj );
                }

                // Delete owned projects
                objects = g_db._query( "for v in 1..1 inbound @user owner filter is_same_collection('p',v) return v._id", { user: user_id }).toArray();
                for ( i in objects ) {
                    obj = objects[i];
                    console.log( "del proj", obj );
                    subobjects = g_db._query( "for v in 1..1 inbound @proj owner return v._id", { proj: obj }).toArray();
                    for ( j in subobjects ) {
                        subobj = subobjects[j];
                        console.log("del subobj",subobj);
                        g_graph[subobj.substr(0,subobj.indexOf("/"))].remove( subobj );
                    }

                    g_graph.p.remove( obj );
                }

                // Delete collections, data, groups, notes
                objects = g_db._query( "for v in 1..1 inbound @user owner return v._id", { user: user_id }).toArray();
                for ( i in objects ) {
                    obj = objects[i];
                    console.log( "del owned", obj );
                    g_graph[obj.substr(0,obj.indexOf("/"))].remove( obj );
                }

                g_graph.u.remove( user_id );
            }
        });
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('subject', joi.string().optional(), "UID of subject user (optional)")
.summary('Remove existing user entry')
.description('Remove existing user entry. Requires admin permissions.');


router.get('/ident/list', function (req, res) {
    try {
        var client = g_lib.getUserFromClientID( req.queryParams.client );
        if ( req.queryParams.subject ) {
            if ( !g_db.u.exists( req.queryParams.subject ))
                throw [ g_lib.ERR_INVALID_PARAM, "No such user '" + req.queryParams.subject + "'" ];
            const subject = g_db.u.document( req.queryParams.subject );
            g_lib.ensureAdminPermUser( client, subject._id );

            res.send( g_db._query( "for v in 1..1 outbound @client ident return v._key", { client: subject._id }));
        } else {
            res.send( g_db._query( "for v in 1..1 outbound @client ident return v._key", { client: client._id }));
        }
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('subject', joi.string().optional(), "UID of subject user (optional)")
.summary('List user linked UIDs');


router.get('/ident/add', function (req, res) {
    try {
        g_db._executeTransaction({
            collections: {
                read: ["u","admin"],
                write: ["uuid","accn","ident"]
            },
            action: function() {
                const client = g_lib.getUserFromClientID( req.queryParams.client );
                var id;

                if ( g_lib.isUUID( req.queryParams.ident )) {
                    if ( g_db._exists({ _id: "uuid/" + req.queryParams.ident }))
                        return;
                    id = g_db.uuid.save({ _key: req.queryParams.ident }, { returnNew: true });
                } else if ( g_lib.isDomainAccount( req.queryParams.ident )) {
                    if ( g_db._exists({ _id: "accn/" + req.queryParams.ident })) {
                        if ( req.queryParams.pub_key && req.queryParams.priv_key ) {
                            // Update existing accn with new keys
                            g_db.accn.update( { _id: "accn/" + req.queryParams.ident }, { pub_key: req.queryParams.pub_key, priv_key: req.queryParams.priv_key });
                        }
                        return;
                    } else {
                        var accn = { _key: req.queryParams.ident };
                        if ( req.queryParams.pub_key && req.queryParams.priv_key ) {
                            accn.pub_key = req.queryParams.pub_key;
                            accn.priv_key = req.queryParams.priv_key;
                        }
                        id = g_db.accn.save( accn, { returnNew: true });
                    }
                } else
                    throw [g_lib.ERR_INVALID_PARAM,"Invalid identity value: "+req.queryParams.ident];

                if ( req.queryParams.subject ) {
                    if ( !g_db.u.exists( req.queryParams.subject ))
                        throw [ g_lib.ERR_INVALID_PARAM, "No such user '" + req.queryParams.subject + "'" ];

                    const user = g_db.u.document( req.queryParams.subject );
                    g_lib.ensureAdminPermUser( client, user._id );

                    g_db.ident.save({ _from: user._id, _to: id._id });
                } else {
                    g_db.ident.save({ _from: client._id, _to: id._id });
                }
            }
        });
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('subject', joi.string().optional(), "UID of subject user (optional)")
.queryParam('ident', joi.string().required(), "Identity to add")
.queryParam('pub_key', joi.string().optional(), "Optional public key (domain accounts only)")
.queryParam('priv_key', joi.string().optional(), "Optional private key (domain accounts only)")
.summary('Add new linked identity')
.description('Add new linked identity to user account. Identities can be UUIDs or domain accounts.');


router.get('/ident/remove', function (req, res) {
    try {
        g_db._executeTransaction({
            collections: {
                read: ["u","admin"],
                write: ["uuid","accn","ident"]
            },
            action: function() {
                const client = g_lib.getUserFromClientID( req.queryParams.client );
                const owner = g_lib.getUserFromClientID( req.queryParams.ident );

                g_lib.ensureAdminPermUser( client, owner._id );

                if ( g_lib.isUUID( req.queryParams.ident )) {
                    g_graph.uuid.remove( "uuid/" + req.queryParams.ident );
                } else if ( g_lib.isDomainAccount( req.queryParams.ident )) {
                    g_graph.accn.remove( "accn/" + req.queryParams.ident );
                } else
                    throw [g_lib.ERR_INVALID_PARAM,"Invalid identity value: "+req.queryParams.ident];
            }
        });
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('ident', joi.string().required(), "Certificate to delete")
.summary('Remove linked identity from user account')
.description('Remove linked identity from user account');


router.get('/ep/get', function (req, res) {
    try {
        const client = g_lib.getUserFromClientID( req.queryParams.client );
        res.send( client.eps?client.eps:[] );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.summary('Get recent end-points')
.description('Get recent end-points');

router.get('/ep/set', function (req, res) {
    try {
        const client = g_lib.getUserFromClientID( req.queryParams.client );
        g_db._update( client._id, {eps:req.queryParams.eps}, { keepNull: false });
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('eps', joi.array().items(joi.string()).required(), "End-points (UUIDs or legacy names)")
.summary('Set recent end-points')
.description('Set recent end-points');

