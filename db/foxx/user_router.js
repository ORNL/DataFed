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
        g_db._executeTransaction({
            collections: {
                read: ["user","cert"],
                write: ["user","cert","coll","owner","ident","alias","aliases"]
            },
            action: function() {
                var user = g_db.user.save({ _key: req.queryParams.uid, name_last: req.queryParams.name_last, name_first: req.queryParams.name_first, email: req.queryParams.email, is_admin: req.queryParams.is_admin, is_project: req.queryParams.is_project }, { returnNew: true });

                var cert = g_db.cert.save({ subject: req.queryParams.cert }, { returnNew: true });
                var root = g_db.coll.save({ _key: req.queryParams.uid + "_root", is_root: true, title: "root", desc: "Root collection for user " + req.queryParams.name_first + " " + req.queryParams.name_last + " (" + req.queryParams.uid +")" }, { returnNew: true });
                var alias = g_db.aliases.save({ _key: req.queryParams.uid + ":root" }, { returnNew: true });

                g_db.alias.save({ _from: root._id, _to: alias._id });
                g_db.ident.save({ _from: user._id, _to: cert._id });
                g_db.owner.save({ _from: root._id, _to: user._id });

                // TODO must check referential integrity for admins

                if ( req.queryParams.admins ) {
                    for ( var i in req.queryParams.admins ) {
                        g_db.admin.save({ _from: user._id, _to: "user/" + req.queryParams.admins });
                    }
                }
            }
        });
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('uid', joi.string().required(), "User ID for new user")
.queryParam('name_first', joi.string().required(), "First name")
.queryParam('name_last', joi.string().required(), "Last name")
.queryParam('email', joi.string().required(), "Email")
//.queryParam('org', joi.string().required(), "User's home organization")
.queryParam('cert', joi.string().required(), "New user certificate subject string")
.queryParam('is_admin', joi.boolean().optional(), "New account is a system administrator")
.queryParam('is_project', joi.boolean().optional(), "New account is a project")
.queryParam('admins', joi.array().items(joi.string()).optional(), "Account administrators (uids)")
.summary('Create new user entry')
.description('Create new user entry. Requires admin permissions.');


router.get('/view', function (req, res) {
    try {
        if ( req.queryParams.uid ) {
            try {
                res.send([ g_db.user.document({ _id: req.queryParams.uid }) ]);
            } catch ( e ) {
                throw g_lib.ERR_USER_NOT_FOUND;
            }
        } else if ( req.queryParams.cert ) {
            res.send([ g_lib.getUserFromCert( req.queryParams.cert ) ]);
        } else {
            throw g_lib.ERR_MISSING_REQ_OPTION;
        }
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('uid', joi.string().optional(), "UID of user to view")
.queryParam('cert', joi.string().optional(), "Certificate of user to view")
.summary('View user information')
.description('View user information');


router.get('/list', function (req, res) {
    res.send( g_db._query( "for u in user return u" ));
})
.summary('List users')
.description('List users');


router.post('/update', function (req, res) {
    res.throw( 400, "NOT IMPLEMENTED" );
})
.queryParam('client', joi.string().required(), "Client certificate")
.queryParam('subject', joi.string().optional(), "UID of subject user (optional)")
.summary('Update user information')
.description('Update user information');


router.post('/delete', function (req, res) {
    try {
        g_db._executeTransaction({
            collections: {
                read: ["user","cert","admin"],
                write: ["user","cert","coll","data","acl","owner","ident"]
            },
            action: function() {
                const client = g_lib.getUserFromCert( req.queryParams.client );

                var user = g_db.user.document({ _id: req.queryParams.subject });

                g_lib.ensureAdminPermUser( client, user._id );


                // TODO This MUST use graph engine to ensure all edges are removed

                // Delete ALL certificates
                g_db._query( "for v in 1..1 outbound @user ident remove v", { user: user._id } );

                // Delete ALL collections and data
                g_db._query( "for v in 1..1 inbound @user owner remove v", { user: user._id } );

                // Delete ALL edges
                g_db.removeByExample({ _from: user._id });
                g_db.removeByExample({ _to: user._id });

                g_db.user.remove({ _id: user._id });
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
                read: ["user","cert","admin"],
                write: ["cert","ident"]
            },
            action: function() {
                const client = g_lib.getUserFromCert( req.queryParams.client );
                var cert;

                if ( req.queryParams.subject ) {
                    const user = g_db.user.document( req.queryParams.subject );
                    g_lib.ensureAdminPermUser( client, user._id );

                    cert = g_db.cert.save({ subject: req.queryParams.cert }, { returnNew: true });
                    g_db.ident.save({ _from: user._id, _to: cert._id });
                } else {
                    cert = g_db.cert.save({ subject: req.queryParams.cert }, { returnNew: true });
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
            const subject = g_db.user.document( req.queryParams.subject );
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
                read: ["user","cert","admin"],
                write: ["cert","ident"]
            },
            action: function() {
                const client = g_lib.getUserFromCert( req.queryParams.client );
                const owner = g_lib.getUserFromCert( req.queryParams.cert_old );

                g_lib.ensureAdminPermUser( client, owner._id );

                var cert = g_db.cert.firstExample({ subject: req.queryParams.cert_old });

                g_db.cert.update( cert, { subject: req.queryParams.cert_new });
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
                read: ["user","cert"],
                write: ["cert","ident"]
            },
            action: function() {

                if ( req.queryParams.client == req.queryParams.cert )
                    throw g_lib.ERR_CERT_IN_USE;

                const client = g_lib.getUserFromCert( req.queryParams.client );
                const owner = g_lib.getUserFromCert( req.queryParams.cert );

                g_lib.ensureAdminPermUser( client, owner._id );

                const cert = g_db.cert.firstExample({ subject: req.queryParams.cert });

                g_db.ident.removeByExample({ _to: cert._id });
                g_db.cert.remove({ _id: cert._id });
            }        });
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client certificate")
.queryParam('cert', joi.string().required(), "Certificate to delete")
.summary('Remove certificate from user account')
.description('Remove certificate from user account');

