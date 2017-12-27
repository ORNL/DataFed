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


//==================== ACL API FUNCTIONS

router.get('/update', function (req, res) {
    try {
        g_db._executeTransaction({
            collections: {
                read: ["user","cert","data","coll","admin","alias","aliases"],
                write: ["acl","coll","data"]
            },
            action: function() {
                const client = g_lib.getUserFromCert( req.queryParams.client );
                var object = g_lib.getObject( req.queryParams.object, client );

                g_lib.ensureAdminPermObject( client, object._id );

                var i;

                if ( req.queryParams.delete ) {
                    var subject;

                    for ( i in req.queryParams.delete ) {
                        subject = req.queryParams.delete[i];
                        if ( !g_db._exists( subject ))
                            throw g_lib.ERR_OBJ_NOT_FOUND;
                        g_db.acl.removeByExample({ _from: object._id, _to: subject });
                    }
                }

                if ( req.queryParams.create ) {
                    var rule;

                    for ( i in req.queryParams.create ) {
                        rule = req.queryParams.create[i];

                        if ( !g_db._exists( rule.subject ))
                            throw g_lib.ERR_OBJ_NOT_FOUND;

                        g_db.acl.removeByExample({ _from: object._id, _to: rule.subject });
                        g_db.acl.save({ _from: object._id, _to: rule.subject, perm_grant: rule.grant, perm_deny: rule.deny });
                    }
                }

                if ( req.queryParams.def_grant || req.queryParams.def_deny ) {
                    var obj = {};
                    if ( req.queryParams.def_grant ) {
                        if ( req.queryParams.def_grant == -1 )
                            obj.perm_grant = null;
                        else
                            obj.perm_grant = req.queryParams.def_grant;
                    }
                    if ( req.queryParams.def_deny ) {
                        if ( req.queryParams.def_deny == -1 )
                            obj.perm_deny = null;
                        else
                            obj.perm_deny = req.queryParams.def_deny;
                    }

                    g_db._update( object._id, obj, { keepNull: false } );
                }
            }
        });
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client certificate")
.queryParam('object', joi.string().required(), "ID or alias of data record or collection")
.queryParam('create', joi.array().items(g_lib.acl_schema).optional(), "User and/or group ACL rules to create")
.queryParam('delete', joi.array(joi.string()).optional(), "User and/or group ACL rules to delete")
.queryParam('def_grant', joi.number().optional(), "Set default grant permission mask (set to -1 to unset)")
.queryParam('def_deny', joi.number().optional(), "Set default deny permission mask (set to -1 to unset)")
.summary('Update ACL rules on an object')
.description('Update ACL rules on an object (data record or collection)');



router.get('/view', function (req, res) {
    try {
        const client = g_lib.getUserFromCert( req.queryParams.client );
        var object = g_lib.getObject( req.queryParams.object, client );

        if ( !g_lib.hasAdminPermObject( client, object._id )) {
            if ( !g_lib.hasPermission( client, object, g_lib.PERM_VIEW ))
                throw g_lib.ERR_PERM_DENIED;
        }

        res.send( g_db._query( "for v, e in 1..1 outbound @object acl return { subject: v._id, grant: e.perm_grant, deny: e.perm_deny }", { object: object._id }));
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client certificate")
.queryParam('object', joi.string().required(), "ID or alias of data record or collection")
.summary('View current ACL on an object')
.description('View current ACL on an object (data record or collection)');


