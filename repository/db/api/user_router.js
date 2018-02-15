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


router.post('/create', function (req, res) {
    try {
        var result;

        g_db._executeTransaction({
            collections: {
                read: ["u","x"],
                write: ["u","x","c","a","owner","ident","alias","admin"]
            },
            action: function() {
                var user = g_db.u.save({ _key: req.queryParams.uid, name_last: req.queryParams.name_last, name_first: req.queryParams.name_first, globus_id: req.queryParams.globus_id, email: req.queryParams.email, is_admin: req.queryParams.is_admin, is_project: req.queryParams.is_project }, { returnNew: true });

                var cert = g_db.x.save({ subject: req.queryParams.cert }, { returnNew: true });
                var root = g_db.c.save({ _key: req.queryParams.uid + "_root", is_root: true, title: "root", desc: "Root collection for user " + req.queryParams.name_first + " " + req.queryParams.name_last + " (" + req.queryParams.uid +")" }, { returnNew: true });

                var alias = g_db.a.save({ _key: req.queryParams.uid + ":root" }, { returnNew: true });
                g_db.owner.save({ _from: alias._id, _to: user._id });

                g_db.alias.save({ _from: root._id, _to: alias._id });
                g_db.ident.save({ _from: user._id, _to: cert._id });
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
.queryParam('uid', joi.string().required(), "User ID for new user")
.queryParam('name_first', joi.string().required(), "First name")
.queryParam('name_last', joi.string().required(), "Last name")
.queryParam('globus_id', joi.string().required(), "Globus ID (user name portion only)")
.queryParam('email', joi.string().required(), "Email")
//.queryParam('org', joi.string().required(), "User's home organization")
.queryParam('cert', joi.string().required(), "New user certificate subject string")
.queryParam('is_admin', joi.boolean().optional(), "New account is a system administrator")
.queryParam('is_project', joi.boolean().optional(), "New account is a project")
.queryParam('admins', joi.array().items(joi.string()).optional(), "Account administrators (uids)")
.summary('Create new user entry')
.description('Create new user entry. Requires admin permissions.');


router.post('/update', function (req, res) {
    try {
        var result;

        g_db._executeTransaction({
            collections: {
                read: ["u","x"],
                write: ["u","admin"]
            },
            action: function() {
                const client = g_lib.getUserFromCert( req.queryParams.client );
                var user_id;

                if ( req.queryParams.subject ) {
                    user_id = "u/" + req.queryParams.subject;
                    g_lib.ensureAdminPermUser( client, user_id );
                }
                else {
                    user_id = client._id;
                }

                var obj = {};

                if ( req.queryParams.name_first )
                    obj.name_first = req.queryParams.name_first;

                if ( req.queryParams.name_last )
                    obj.name_last = req.queryParams.name_last;

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
.queryParam('client', joi.string().required(), "Client certificate")
.queryParam('subject', joi.string().optional(), "UID of subject user (optional)")
.queryParam('name_first', joi.string().optional(), "New first name")
.queryParam('name_last', joi.string().optional(), "New last name")
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

        if ( req.queryParams.uid ) {
            try {
                user = g_db.u.document({ _id: req.queryParams.uid });
            } catch ( e ) {
                throw g_lib.ERR_USER_NOT_FOUND;
            }
        } else if ( req.queryParams.client ) {
            user = g_lib.getUserFromCert( req.queryParams.client );
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
.queryParam('uid', joi.string().optional(), "UID of user to view")
.queryParam('client', joi.string().optional(), "Certificate of client")
.summary('View user information')
.description('View user information');


router.get('/list', function (req, res) {
    res.send( g_db._query( "for i in u return { uid: i._key, name_last: i.name_last, name_first: i.name_first }" ));
})
.summary('List users')
.description('List users');



router.post('/delete', function (req, res) {
    try {
        g_db._executeTransaction({
            collections: {
                read: ["u","x","admin"],
                write: ["u","g","x","c","d","n","a","acl","owner","ident","alias","admin","member","item","tag","note"]
            },
            action: function() {
                const client = g_lib.getUserFromCert( req.queryParams.client );
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

                // Delete certificates
                objects = g_db._query( "for v in 1..1 outbound @user ident return v._id", { user: user_id }).toArray();
                for ( i in objects ) {
                    g_graph.x.remove( objects[i] );
                }

                // Delete collections, data, groups, notes
                objects = g_db._query( "for v in 1..1 inbound @user owner return v._id", { user: user_id }).toArray();
                for ( i in objects ) {
                    obj = objects[i];
                    g_graph[obj[0]].remove( obj );
                }

                g_graph.u.remove( user_id );
            }
        });
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client certificate")
.queryParam('subject', joi.string().optional(), "UID of subject user (optional)")
.summary('Remove existing user entry')
.description('Remove existing user entry. Requires admin permissions.');


router.post('/cert/create', function (req, res) {
    try {
        g_db._executeTransaction({
            collections: {
                read: ["u","x","admin"],
                write: ["x","ident"]
            },
            action: function() {
                const client = g_lib.getUserFromCert( req.queryParams.client );
                var cert;

                if ( req.queryParams.subject ) {
                    const user = g_db.u.document( req.queryParams.subject );
                    g_lib.ensureAdminPermUser( client, user._id );

                    cert = g_db.x.save({ subject: req.queryParams.cert }, { returnNew: true });
                    g_db.ident.save({ _from: user._id, _to: cert._id });
                } else {
                    cert = g_db.x.save({ subject: req.queryParams.cert }, { returnNew: true });
                    g_db.ident.save({ _from: client._id, _to: cert._id });
                }
            }
        });
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client certificate")
.queryParam('cert', joi.string().required(), "Certificate to add")
.queryParam('subject', joi.string().optional(), "UID of subject user (optional)")
.summary('Add new certificate to user account')
.description('Add new certificate to user account');


router.get('/cert/list', function (req, res) {
    try {
        var client = g_lib.getUserFromCert( req.queryParams.client );
        if ( req.queryParams.subject ) {
            const subject = g_db.u.document( req.queryParams.subject );
            g_lib.ensureAdminPermUser( client, subject._id );

            res.send( g_db._query( "for v in 1..1 outbound @client ident return v.subject", { client: subject._id }));
        } else {
            res.send( g_db._query( "for v in 1..1 outbound @client ident return v.subject", { client: client._id }));
        }
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client certificate")
.queryParam('subject', joi.string().optional(), "UID of subject user (optional)")
.summary('List user certificates');


router.post('/cert/update', function (req, res) {
    try {
        g_db._executeTransaction({
            collections: {
                read: ["u","x","admin"],
                write: ["x","ident"]
            },
            action: function() {
                const client = g_lib.getUserFromCert( req.queryParams.client );
                const owner = g_lib.getUserFromCert( req.queryParams.cert_old );

                g_lib.ensureAdminPermUser( client, owner._id );

                var cert = g_db.x.firstExample({ subject: req.queryParams.cert_old });

                g_db.x.update( cert, { subject: req.queryParams.cert_new });
            }
        });
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client certificate")
.queryParam('cert_old', joi.string().required(), "Old certificate to update")
.queryParam('cert_new', joi.string().required(), "New certificate")
.summary('List user certificates');


router.post('/cert/delete', function (req, res) {
    try {
        g_db._executeTransaction({
            collections: {
                read: ["u","x"],
                write: ["x","ident"]
            },
            action: function() {

                if ( req.queryParams.client == req.queryParams.cert )
                    throw g_lib.ERR_CERT_IN_USE;

                const client = g_lib.getUserFromCert( req.queryParams.client );
                const owner = g_lib.getUserFromCert( req.queryParams.cert );

                g_lib.ensureAdminPermUser( client, owner._id );

                const cert = g_db.x.firstExample({ subject: req.queryParams.cert });

                g_db.ident.removeByExample({ _to: cert._id });
                g_db.x.remove({ _id: cert._id });
            }        });
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client certificate")
.queryParam('cert', joi.string().required(), "Certificate to delete")
.summary('Remove certificate from user account')
.description('Remove certificate from user account');

