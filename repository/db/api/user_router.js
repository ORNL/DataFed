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
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client uid")
.queryParam('pw', joi.string().required(), "SDMS account password")
.summary('Authenticate user')
.description('Authenticate user using SDMS password');


router.get('/create', function (req, res) {
    try {
        var result;

        g_db._executeTransaction({
            collections: {
                read: ["u"],
                write: ["u","c","a","owner","ident","alias","admin"]
            },
            action: function() {
                var user = g_db.u.save({ _key: req.queryParams.uid, password: req.queryParams.password, name: req.queryParams.name, globus_id: req.queryParams.globus_id, email: req.queryParams.email, is_admin: req.queryParams.is_admin, is_project: req.queryParams.is_project }, { returnNew: true });

                var root = g_db.c.save({ _key: req.queryParams.uid + "_root", is_root: true, title: "root", desc: "Root collection for user " + req.queryParams.name + " (" + req.queryParams.uid +")" }, { returnNew: true });

                var alias = g_db.a.save({ _key: req.queryParams.uid + ":root" }, { returnNew: true });
                g_db.owner.save({ _from: alias._id, _to: user._id });

                g_db.alias.save({ _from: root._id, _to: alias._id });
                g_db.owner.save({ _from: root._id, _to: user._id });

                if ( req.queryParams.admins ) {
                    for ( var i in req.queryParams.admins ) {
                        if ( !g_db._exists( "u/" + req.queryParams.admins[i] ))
                            throw g_lib.ERR_USER_NOT_FOUND;
                        g_db.admin.save({ _from: user._id, _to: "u/" + req.queryParams.admins[i] });
                    }
                }

                user.new.uid = user.new._key;
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
.queryParam('uid', joi.string().required(), "SDMS user ID for new user")
.queryParam('password', joi.string().required(), "SDMS account password")
.queryParam('name', joi.string().required(), "Name")
.queryParam('email', joi.string().required(), "Email")
.queryParam('globus_id', joi.string().required(), "Primary Globus ID (user name portion only)")
.queryParam('is_admin', joi.boolean().optional(), "New account is a system administrator")
.queryParam('is_project', joi.boolean().optional(), "New account is a project")
.queryParam('admins', joi.array().items(joi.string()).optional(), "Account administrators (uids)")
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
                    user_id = "u/" + req.queryParams.subject;
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

                if ( req.queryParams.globus_id )
                    obj.globus_id = req.queryParams.globus_id;

                if ( req.queryParams.email )
                    obj.email = req.queryParams.email;

                if ( client.is_admin ) {
                    if ( req.queryParams.is_admin )
                        obj.is_admin = req.queryParams.is_admin;

                    if ( req.queryParams.is_project )
                        obj.is_project = req.queryParams.is_project;
                }

                var user = g_db._update( user_id, obj, { keepNull: false, returnNew: true });

                var admins = g_db._query( "for i in admin filter i._from == @user return i._to", { user: user_id }).toArray();
                console.log("admins:",admins);
                for ( var i in admins ) {
                    admins[i] = admins[i].substr( 2 );
                }

                var admin;

                if ( req.queryParams.admin_remove ) {
                    var idx;

                    for ( i in req.queryParams.admin_remove ) {
                        admin = req.queryParams.admin_remove[i];
                        idx = admins.indexOf( admin );
                        if ( idx != -1 ) {
                            g_db.admin.removeByExample({ _from: user_id, _to: "u/" + admin });
                            admins.splice( idx, 1 );
                        }
                    }
                }

                if ( req.queryParams.admin_add ) {

                    for ( i in req.queryParams.admin_add ) {
                        admin = req.queryParams.admin_add[i];
                        if ( admins.indexOf( admin ) == -1 ) {
                            if ( !g_db._exists( "u/" + admin ))
                                throw g_lib.ERR_USER_NOT_FOUND;

                            g_db.admin.save({ _from: user_id, _to: "u/" + admin });
                            admins.push( admin );
                        }
                    }
                }

                user.new.uid = user.new._key;

                if ( admins.length )
                    user.new.admins = admins;

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
.queryParam('client', joi.string().required(), "Client uid")
.queryParam('subject', joi.string().optional(), "UID of subject user (optional)")
.queryParam('password', joi.string().optional(), "SDMS account password")
.queryParam('name', joi.string().optional(), "New name")
.queryParam('globus_id', joi.string().optional(), "Globus ID (user name portion only)")
.queryParam('email', joi.string().optional(), "New email")
.queryParam('is_admin', joi.boolean().optional(), "New system administrator flag value")
.queryParam('is_project', joi.boolean().optional(), "New account project flag value")
.queryParam('admin_add', joi.array().items(joi.string()).optional(), "Account administrators (uids) to add")
.queryParam('admin_remove', joi.array().items(joi.string()).optional(), "Account administrators (uids) to remove")
.summary('Update user information')
.description('Update user information');



router.get('/view', function (req, res) {
    try {
        var user;

        if ( req.queryParams.subject ) {
            try {
                user = g_db.u.document({ _id: req.queryParams.subject });
            } catch ( e ) {
                throw g_lib.ERR_USER_NOT_FOUND;
            }
        } else if ( req.queryParams.client ) {
            user = g_lib.getUserFromClientID( req.queryParams.client );
        } else {
            throw g_lib.ERR_MISSING_REQ_OPTION;
        }

        var admins = g_db._query("for v in 1..1 outbound @user admin return v._key", { user: user._id } ).toArray();
        if ( admins.length ) {
            user.admins = admins;
        }

        user.uid = user._key;

        delete user._id;
        delete user._key;
        delete user._rev;

        res.send([user]);
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('subject', joi.string().optional(), "UID of subject user to view")
.summary('View user information')
.description('View user information');


router.get('/list', function (req, res) {
    res.send( g_db._query( "for i in u return { uid: i._key, name: i.name }" ));
})
.summary('List users')
.description('List users');


router.get('/delete', function (req, res) {
    try {
        g_db._executeTransaction({
            collections: {
                read: ["u","admin"],
                write: ["u","g","uuid","accn","c","d","n","a","acl","owner","ident","alias","admin","member","item","tag","note"]
            },
            action: function() {
                const client = g_lib.getUserFromClientID( req.queryParams.client );
                var user_id;

                if ( req.queryParams.subject ) {
                    user_id = "u/" + req.queryParams.subject;
                    g_lib.ensureAdminPermUser( client, user_id );
                }
                else {
                    user_id = client._id;
                }

                var objects;
                var obj;
                var i;

                // Delete linked accounts
                objects = g_db._query( "for v in 1..1 outbound @user ident return v._id", { user: user_id }).toArray();
                for ( i in objects ) {
                    obj = objects[i];
                    g_graph[obj.substr(0,obj.indexOf("/"))].remove( obj );
                }

                // Delete collections, data, groups, notes
                objects = g_db._query( "for v in 1..1 inbound @user owner return v._id", { user: user_id }).toArray();
                for ( i in objects ) {
                    obj = objects[i];
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
                    if ( g_db._exists({ _id: "accn/" + req.queryParams.ident }))
                        return;
                    id = g_db.accn.save({ _key: req.queryParams.ident }, { returnNew: true });
                } else
                    throw g_lib.ERR_INVALID_IDENT;

                if ( req.queryParams.subject ) {
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
                    //g_db.uuid.remove({ _id: "uuid/" + req.queryParams.ident });
                } else if ( g_lib.isDomainAccount( req.queryParams.ident )) {
                    //const acc = g_db.accn.document({ _key: req.queryParams.ident });
                    //g_db.ident.removeByExample({ _to: acc._id });

                    g_graph.accn.remove( "accn/" + req.queryParams.ident );
                    //g_db.accn.remove({ _id: "accn/" + req.queryParams.ident });
                } else
                    throw g_lib.ERR_INVALID_IDENT;
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

