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
                read: ["user","cert"],
                write: ["coll","owner","item"]
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

                var alias_id = g_lib.getAliasID( req.queryParams.alias, client );
                if ( alias_id && !alias_id.startsWith( client._key + ":" ))
                    throw g_lib.ERR_INVALID_ALIAS;

                var coll = g_db.coll.save( obj, { returnNew: true });
                g_db.owner.save({ _from: coll._id, _to: client._id });

                var parent = null;
                if ( req.queryParams.parent_coll_id )
                    parent = "coll/" + req.queryParams.parent_coll_id;
                else
                    parent = "coll/" + client._key + "_root";

                // Arango bug requires this
                if ( !g_db._exists({ _id: parent }) )
                    throw g_lib.ERR_COLL_NOT_FOUND;

                g_graph.item.save({ _from: parent, _to: coll._id });

                if ( alias_id ) {
                    g_db.aliases.save({ _id: alias_id });
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
.queryParam('parent_coll_id', joi.string().optional(), "Parent collection ID (default = root)")
.summary('Creates a new data collection')
.description('Creates a new data collection');


router.post('/delete', function (req, res) {
    try {
        g_db._executeTransaction({
            collections: {
                read: ["user","cert"],
                write: ["coll","owner","item","acl","meta"]
            },
            action: function() {
                const client = g_lib.getUserFromCert( req.queryParams.client );

                // TODO Check permissions

                var coll;
                var alias = g_lib.getAliasID( req.queryParams.id, client );

                if ( alias ) {
                    coll = g_db._query("for c in coll filter c.alias == @alias return c", { alias: alias }).toArray();
                    if ( coll.length == 1 )
                        coll = coll[0];
                    else
                        throw g_lib.ERR_COLL_NOT_FOUND;
                } else {
                    coll = g_db.coll.document({ _key: req.queryParams.id });
                }

                if ( coll.is_root )
                    throw g_lib.ERR_CANNOT_DEL_ROOT;

                // TODO Need to delete attached notes

                g_db.owner.removeByExample({ _from: coll._id });
                g_db.meta.removeByExample({ _from: coll._id });
                g_db.item.removeByExample({ _to: coll._id });
                g_db.item.removeByExample({ _from: coll._id });
                g_db.acl.removeByExample({ _from: coll._id });
                g_db.coll.remove({ _id: coll._id });
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

        const result = g_db._query( "for v in 1..1 inbound @client owner filter IS_SAME_COLLECTION('coll', v) return v", { client: client._id} );

        res.send( result );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client certificate subject string")
.summary('Get all data collections owned by client')
.description('Get all data collections owned by client');


router.get('/view', function (req, res) {
    try {
        const client = g_lib.getUserFromCert( req.queryParams.client );

        var coll;
        var alias_id = g_lib.getAliasID( req.queryParams.id, client );

        if ( alias_id ) {
            coll = g_db._query("for v in 1..1 inbound @alias_id alias filter is_same_collection('coll', v) return v", { alias_id: alias_id }).toArray();
            if ( coll.length != 1 )
                throw g_lib.ERR_INVALID_ALIAS;
            coll = coll[0];
        } else {
            coll = g_db.coll.document({ _key: req.queryParams.id });
        }

        if ( !g_lib.hasAdminPermObject( client, coll._id )) {
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

        var result;
        var alias_id = g_lib.getAliasID( req.queryParams.id, client );
        if ( alias_id ) {
            var alias = g_db.alias.firstExample({ _to: alias_id });
            if ( !alias )
                throw g_lib.ERR_ALIAS_NOT_FOUND;
            result = g_db._query("for v in 1..1 outbound @coll item return v", { coll: alias._to });
            //result = g_db._query("for v in 1..1 inbound @alias_id alias filter is_same_collection('coll', v) for v2 in 1..1 outbound v item return v2", { alias_id: alias_id });
        } else {
            result = g_db._query( "for v in 1..1 outbound @coll_id item return v", { coll_id: "coll/" + req.queryParams.id } );
        }

        res.send( result );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client certificate subject string")
.queryParam('id', joi.string().required(), "Collection ID or alias to list")
.summary('List content of a collection')
.description('List content of a collection');

/*
router.post('/collection/data/add', function (req, res) {
    try {
        g_db._executeTransaction({
            collections: {
                read: ["user","cert","data","coll"],
                write: ["item"]
            },
            action: function ( params ) {
                const g_db = require("@arangog_db").g_db;

                const client = getUserFromCert( params[0] );
                var coll_id;
                var data_id;
                var alias = checkAlias( params[1], client );

                if ( alias ) {
                    coll_id = g_db.coll.firstExample({ alias: alias })._id;
                } else
                    coll_id = "coll/" + params[1];

                alias = checkAlias( params[2], client );
                if ( alias ) {
                    data_id = g_db.data.firstExample({ alias: alias })._id;
                } else
                    data_id = "data/" + params[2];

                if ( g_db.item.firstExample({ _from: coll_id, _to: data_id }) == null )
                    g_db.item.save({ _from: coll_id, _to: data_id });
                else
                    throw ERR_ITEM_ALREADY_LINKED;
            },
            params: [ req.queryParams.client, req.queryParams.coll_id, req.queryParams.data_id ]
        });
    } catch( e ) {
        handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client certificate subject string")
.queryParam('coll_id', joi.string().required(), "Collection ID or alias")
.queryParam('data_id', joi.string().required(), "Data ID or alias")
.summary('Add data to collection')
.description('Add data to collection by id or alias (must specify ID OR alias for collection and data)');


router.post('/collection/data/remove', function (req, res) {
    try {
        g_db._executeTransaction({
            collections: {
                read: ["user","cert","data","coll"],
                write: ["item"]
            },
            action: function ( params ) {
                const g_db = require("@arangog_db").g_db;

                const client = getUserFromCert( params[0] );
                var coll_id;
                var data_id;

                if ( params[1] )
                    coll_id = "coll/" + params[1];
                else if ( params[2] ) {
                    var coll = null;
                    if ( params[2].indexOf( "." ) > -1 )
                        coll = g_db.coll.firstExample({ alias: params[2] });
                    else
                        coll = g_db.coll.firstExample({ alias: client._key + "." + params[2] });
                    if ( coll )
                        coll_id = coll._id;
                    else
                        throw -3;
                } else
                    throw -2;

                if ( params[3] )
                    data_id = "data/" + params[3];
                else if ( params[4] ) {
                    var data = null;
                    if ( params[4].indexOf( "." ) > -1 )
                        data = g_db.data.firstExample({ alias: params[4] });
                    else
                        data = g_db.data.firstExample({ alias: client._key + "." + params[4] });
                    if ( data )
                        data_id = data._id;
                    else
                        throw -5;
                } else
                    throw -4;

                if ( g_db.item.firstExample({ _from: coll_id, _to: data_id }) == null )
                    throw -6;
                else
                    g_db.item.removeByExample({ _from: coll_id, _to: data_id });
            },
            params: [ req.queryParams.client, req.queryParams.coll_id, req.queryParams.coll_alias, req.queryParams.data_id, req.queryParams.data_alias ]
        });
    } catch( e ) {
        handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client certificate subject string")
.queryParam('coll_id', joi.string().optional(), "Collection ID")
.queryParam('coll_alias', joi.string().optional(), "Collection alias")
.queryParam('data_id', joi.string().optional(), "Data ID")
.queryParam('data_alias', joi.string().optional(), "Data alias")
.summary('Add data to collection')
.description('Add data to collection by id or alias (must specify ID OR alias for collection and data)');
*/



