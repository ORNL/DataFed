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


//===== COLLECTION API FUNCTIONS =====

router.post('/create', function (req, res) {
    try {
        var result = [];

        g_db._executeTransaction({
            collections: {
                read: ["u","x"],
                write: ["c","owner","item"]
            },
            action: function() {
                const client = g_lib.getUserFromCert( req.queryParams.client );

                var obj = { title: req.queryParams.title };
                if ( req.queryParams.descr )
                    obj.descr = req.queryParams.descr;

                if ( req.queryParams.grant )
                    obj.perm_grant = req.queryParams.grant;

                if ( req.queryParams.deny )
                    obj.perm_deny = req.queryParams.deny;

                var coll = g_db.c.save( obj, { returnNew: true });
                g_db.owner.save({ _from: coll._id, _to: client._id });

                var parent = null;
                if ( req.queryParams.parent )
                    parent = g_lib.resolveID( req.queryParams.parent, client );
                else
                    parent = "c/" + client._key + "_root";

                // Arango bug requires this
                if ( !g_db._exists({ _id: parent }) )
                    throw g_lib.ERR_COLL_NOT_FOUND;

                g_graph.item.save({ _from: parent, _to: coll._id });

                if ( req.queryParams.alias ) {
                    g_db.validateAlias( req.queryParams.alias );
                    var alias_id = client._key + ":" + req.queryParams.alias;

                    g_db.a.save({ _id: alias_id });
                    g_db.alias.save({ _from: coll._id, _to: alias_id });
                }

                result.push( coll.new );
            }
        });

        res.send( result );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client crtificate subject string")
.queryParam('title', joi.string().required(), "Title")
.queryParam('descr', joi.string().optional(), "Description")
.queryParam('alias', joi.string().optional(), "Alias")
.queryParam('grant', joi.number().optional(), "Default grant permission mask")
.queryParam('deny', joi.number().optional(), "Default deny permission mask")
.queryParam('parent', joi.string().optional(), "Parent collection ID or alias (default = root)")
.summary('Creates a new data collection')
.description('Creates a new data collection');


router.post('/delete', function (req, res) {
    try {
        g_db._executeTransaction({
            collections: {
                read: ["u","x"],
                write: ["c","owner","item","acl","meta"]
            },
            action: function() {
                const client = g_lib.getUserFromCert( req.queryParams.client );
                var coll_id = g_lib.resolveID( req.queryParams.id, client );

                g_lib.ensureAdminPermObject( client, coll_id );

                var coll = g_db.c.document( coll_id );

                if ( coll.is_root )
                    throw g_lib.ERR_CANNOT_DEL_ROOT;

                // TODO Need to delete attached notes

                g_db.owner.removeByExample({ _from: coll._id });
                g_db.meta.removeByExample({ _from: coll._id });
                g_db.item.removeByExample({ _to: coll._id });
                g_db.item.removeByExample({ _from: coll._id });
                g_db.acl.removeByExample({ _from: coll._id });
                g_db.c.remove({ _id: coll._id });
            }
        });
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client crtificate subject string")
.queryParam('id', joi.string().required(), "Collection ID or alias")
.summary('Deletes an existing data collection')
.description('Deletes an existing data collection');


router.get('/list', function (req, res) {
    try {
        const client = g_lib.getUserFromCert( req.queryParams.client );
        var owner_id;

        if ( req.queryParams.subject ) {
            owner_id = "u/" + req.queryParams.subject;
        } else {
            owner_id = client._id;
        }

        const result = g_db._query( "for v in 1..1 inbound @owner owner filter IS_SAME_COLLECTION('c', v) return v", { owner: owner_id });

        // TODO Enforce VIEW perm on individual items returned

        res.send( result );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client certificate")
.queryParam('subject', joi.string().optional(), "UID of subject user (optional)")
.summary('List all data collections owned by client (or subject)')
.description('List all data collections owned by client (or subject)');


router.get('/view', function (req, res) {
    try {
        const client = g_lib.getUserFromCert( req.queryParams.client );

        var coll_id = g_lib.resolveID( req.queryParams.id, client );
        var coll = g_db.c.document( coll_id );

        if ( !g_lib.hasAdminPermObject( client, coll_id )) {
            if ( !g_lib.hasPermission( client, coll, g_lib.PERM_VIEW ))
                throw g_lib.ERR_PERM_DENIED;
        }

        res.send( coll );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client certificate subject string")
.queryParam('id', joi.string().required(), "Collection ID or alias")
.summary('Get a data collection by ID or alias')
.description('Get a data collection by ID or alias');


router.get('/read', function (req, res) {
    try {
        const client = g_lib.getUserFromCert( req.queryParams.client );

        var coll_id = g_lib.resolveID( req.queryParams.id, client );
        var coll = g_db.c.document( coll_id );

        if ( !g_lib.hasAdminPermObject( client, coll_id )) {
            if ( !g_lib.hasPermission( client, coll, g_lib.PERM_READ ))
                throw g_lib.ERR_PERM_DENIED;
        }

        var result = g_db._query( "for v in 1..1 outbound @coll_id item return v", { coll_id: coll_id } );

        res.send( result );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client certificate subject string")
.queryParam('id', joi.string().required(), "Collection ID or alias to list")
.summary('List content of a collection')
.description('List content of a collection');

