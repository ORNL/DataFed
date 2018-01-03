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

        g_db._executeTransaction({
            collections: {
                read: ["u","x"],
                write: ["d","owner"]
            },
            action: function() {
                const client = g_lib.getUserFromCert( req.queryParams.client );

                var obj = {};

                if ( req.queryParams.title )
                    obj.title = req.queryParams.title;

                if ( req.queryParams.descr )
                    obj.descr = req.queryParams.descr;

                if ( req.queryParams.metadata )
                    obj.metadata = req.queryParams.metadata;
                
                if ( req.queryParams.grant )
                    obj.def_grant = req.queryParams.grant;

                if ( req.queryParams.deny )
                    obj.def_deny = req.queryParams.deny;

                var data = g_db.d.save( obj, { returnNew: true });
                g_db.owner.save({ _from: data._id, _to: client._id });

                if ( req.queryParams.alias ) {
                    g_lib.validateAlias( req.queryParams.alias );
                    var alias_key = client._key + ":" + req.queryParams.alias;

                    g_db.a.save({ _key: alias_key });
                    g_db.alias.save({ _from: data._id, _to: "a/" + alias_key });
                    g_db.owner.save({ _from: "a/" + alias_key, _to: client._id });
                }

                result.push( data.new );
            }
        });

        res.send( result );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client certificate subject string")
.queryParam('title', joi.string().optional(), "Title")
.queryParam('desc', joi.string().optional(), "Description")
.queryParam('alias', joi.string().optional(), "Alias")
.queryParam('grant', joi.number().optional(), "Default grant permission mask")
.queryParam('deny', joi.number().optional(), "Default deny permission mask")
.queryParam('metadata', joi.string().optional(), "Metadata (JSON)")
.summary('Creates a new data record')
.description('Creates a new data record');


router.get('/view', function (req, res) {
    try {
        const client = g_lib.getUserFromCert( req.queryParams.client );

        var data_id = g_lib.resolveID( req.queryParams.id, client );
        var data = g_db.d.document( data_id );

        if ( !g_lib.hasAdminPermObject( client, data_id )) {
            if ( !g_lib.hasPermission( client, data, g_lib.PERM_VIEW ))
                throw g_lib.ERR_PERM_DENIED;
        }

        res.send( data );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client certificate subject string")
.queryParam('id', joi.string().required(), "Data ID or alias")
.summary('Get data by ID or alias')
.description('Get data by ID or alias');


router.get('/list', function (req, res) {
    try {
        const client = g_lib.getUserFromCert( req.queryParams.client );
        var owner_id;

        if ( req.queryParams.subject ) {
            owner_id = "u/" + req.queryParams.subject;
        } else {
            owner_id = client._id;
        }

        var result = g_db._query( "for v in 1..1 inbound @owner owner filter IS_SAME_COLLECTION('d', v) return v", { owner: owner_id });

        // TODO Enforce VIEW perm on individual items returned

        res.send( result );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client certificate")
.queryParam('subject', joi.string().optional(), "UID of subject user (optional)")
.summary('List all data owned by client, or subject')
.description('List all data owned by client, or subject');


router.post('/delete', function (req, res) {
    try {
        g_db._executeTransaction({
            collections: {
                read: ["u","x","d"],
                write: ["d","owner","meta","acl","item"]
            },
            action: function() {
                const client = g_lib.getUserFromCert( req.queryParams.client );

                var data_id = g_lib.resolveID( req.queryParams.id, client );
                g_lib.ensureAdminPermObject( client, data_id );

                var data = g_db.d.document( data_id );

                // TODO Need to delete attached notes

                g_db.owner.removeByExample({ _from: data._id });
                g_db.meta.removeByExample({ _from: data._id });
                g_db.item.removeByExample({ _to: data._id });
                g_db.acl.removeByExample({ _from: data._id });
                g_db.d.remove({ _id: data._id });
            }
        });
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client certificate subject string")
.queryParam('id', joi.string().required(), "Data ID or alias")
.summary('Deletes an existing data record')
.description('Deletes an existing data record');


