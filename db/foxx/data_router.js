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
                read: ["user","cert"],
                write: ["data","owner"]
            },
            action: function() {
                const client = g_lib.getUserFromCert( req.queryParams.client );

                var alias_id = g_lib.getAliasID( req.queryParams.alias, client );
                if ( alias_id && !alias_id.startsWith( client._key + ":" ))
                    throw g_lib.ERR_INVALID_ALIAS;

                var data = g_db.data.save({ title: req.queryParams.title, descr: req.queryParams.descr, metadata: req.queryParams.metadata }, { returnNew: true });
                g_db.owner.save({ _from: data._id, _to: client._id });

                if ( alias_id ) {
                    g_db.aliases.save({ _id: alias_id });
                    g_db.alias.save({ _from: data._id, _to: alias_id });
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
.queryParam('metadata', joi.string().optional(), "Metadata (JSON)")
.summary('Creates a new data record')
.description('Creates a new data record');


router.get('/view', function (req, res) {
    try {
        const client = g_lib.getUserFromCert( req.queryParams.client );

        // TODO Check permissions
        var result;
        var alias = g_lib.getAliasID( req.queryParams.id, client );

        if ( alias ) {
            // FIXME
            result = g_db._query("for d in data filter d.alias == @alias return d", { alias: alias });
        } else {
            result = [g_db.data.document({ _key: req.queryParams.id })];
        }

        res.send( result );
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
        var result;

        if ( req.queryParams.subject ) {
            if ( g_lib.hasAdminPermUser( client, req.queryParams.subject )) {
                result = g_db._query( "for v in 1..1 inbound @client owner filter IS_SAME_COLLECTION('data', v) return v", { client: "user/" + req.queryParams.subject });
            }
        } else {
            result = g_db._query( "for v in 1..1 inbound @client owner filter IS_SAME_COLLECTION('data', v) return v", { client: client._id} );
        }

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
                read: ["user","cert","data"],
                write: ["data","owner","meta","acl","item"]
            },
            action: function() {
                const client = g_lib.getUserFromCert( req.queryParams.client );

                // TODO Check permissions
                var data;
                var alias = g_lib.getAliasID( req.queryParams.id, client );

                if ( alias ) {
                    // FIXME
                    data = g_db._query("for d in data filter d.alias == @alias return d", { alias: alias }).toArray();
                    if ( data.length == 1 )
                        data = data[0];
                    else
                        throw g_lib.ERR_DATA_NOT_FOUND;
                } else {
                    data = g_db.data.document({ _key: req.queryParams.id });
                }

                // TODO Need to delete attached notes

                g_db.owner.removeByExample({ _from: data._id });
                g_db.meta.removeByExample({ _from: data._id });
                g_db.item.removeByExample({ _to: data._id });
                g_db.acl.removeByExample({ _from: data._id });
                g_db.data.remove({ _id: data._id });
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


