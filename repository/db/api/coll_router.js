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
                read: ["u","uid"],
                write: ["c","a","alias","owner","item"]
            },
            action: function() {
                const client = g_lib.getUserFromUID( req.queryParams.client );

                var obj = { title: req.queryParams.title };
                if ( req.queryParams.descr )
                    obj.descr = req.queryParams.descr;

                if ( req.queryParams.grant )
                    obj.grant = req.queryParams.grant;

                if ( req.queryParams.deny )
                    obj.deny = req.queryParams.deny;

                var coll = g_db.c.save( obj, { returnNew: true });
                g_db.owner.save({ _from: coll._id, _to: client._id });

                var parent_id = null;
                if ( req.queryParams.parent )
                    parent_id = g_lib.resolveID( req.queryParams.parent, client );
                else
                    parent_id = "c/" + client._key + "_root";

                // Arango bug requires this
                if ( !g_db._exists( parent_id ))
                    throw g_lib.ERR_COLL_NOT_FOUND;

                g_graph.item.save({ _from: parent_id, _to: coll._id });

                if ( req.queryParams.alias ) {
                    g_lib.validateAlias( req.queryParams.alias );
                    var alias_key = client._key + ":" + req.queryParams.alias;

                    g_db.a.save({ _key: alias_key });
                    g_db.alias.save({ _from: coll._id, _to: "a/" + alias_key });
                    g_db.owner.save({ _from: "a/" + alias_key, _to: client._id });
                }

                result.push( coll.new );
            }
        });

        res.send( result );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client UID")
.queryParam('title', joi.string().required(), "Title")
.queryParam('descr', joi.string().optional(), "Description")
.queryParam('alias', joi.string().optional(), "Alias")
.queryParam('grant', joi.number().optional(), "Default grant permission mask")
.queryParam('deny', joi.number().optional(), "Default deny permission mask")
.queryParam('parent', joi.string().optional(), "Parent collection ID or alias (default = root)")
.summary('Creates a new data collection')
.description('Creates a new data collection');

router.post('/update', function (req, res) {
    res.throw( 500, "Not yet implemented" );
})
.summary('Updates an existing data collection')
.description('Updates an existing data collection');

router.post('/delete', function (req, res) {
    try {
        g_db._executeTransaction({
            collections: {
                read: ["u","uid"],
                write: ["c","a","n","owner","item","acl","tag","note","alias"]
            },
            action: function() {
                const client = g_lib.getUserFromUID( req.queryParams.client );
                var coll_id = g_lib.resolveID( req.queryParams.id, client );

                g_lib.ensureAdminPermObject( client, coll_id );

                var coll = g_db.c.document( coll_id );

                if ( coll.is_root )
                    throw g_lib.ERR_CANNOT_DEL_ROOT;

                var obj;

                // Delete attached notes and aliases
                var objects = g_db._query( "for v in 1..1 outbound @coll note, alias v.return v._id", { coll: coll._id }).toArray();
                for ( var i in objects ) {
                    obj = objects[i];
                    g_graph.obj[0].remove( obj );
                }

                g_graph.c.remove( coll._id );
            }
        });
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client UID")
.queryParam('id', joi.string().required(), "Collection ID or alias")
.summary('Deletes an existing data collection')
.description('Deletes an existing data collection');

// This is an OWNER or ADMIN only function, other users must navigate the collection hierarchy
router.get('/priv/list', function (req, res) {
    try {
        const client = g_lib.getUserFromUID( req.queryParams.client );
        var owner_id;

        if ( req.queryParams.subject ) {
            owner_id = "u/" + req.queryParams.subject;
        } else {
            owner_id = client._id;
        }

        if ( client.is_admin || owner_id == client._id || g_lib.db.admin.firstExample({ _from: owner_id, _to: client._id }) ) {
            var result = g_db._query( "for v in 1..1 inbound @owner owner filter IS_SAME_COLLECTION('c', v) return { id: v._id, title: v.title }", { owner: owner_id }).toArray();
            res.send( result );
        } else
            throw g_lib.ERR_PERM_DENIED;
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client UID")
.queryParam('subject', joi.string().optional(), "UID of subject user (optional)")
.summary('List all data collections owned by client (or subject)')
.description('List all data collections owned by client (or subject)');


router.get('/view', function (req, res) {
    try {
        const client = g_lib.getUserFromUID( req.queryParams.client );

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
.queryParam('client', joi.string().required(), "Client UID")
.queryParam('id', joi.string().required(), "Collection ID or alias")
.summary('View collection information by ID or alias')
.description('View collection information by ID or alias');


/* This version of read assumes that if a client has read permissions for a collection, then
 * the items in the collection only need to be checked for local overrides to the LIST permission.
 * Have READ access to a collection translates to having LIST access for the contained items,
 * unless LIST is explicitly revoked on an item (i.e. not inherited)
*/
router.get('/read', function (req, res) {
    try {
        const client = g_lib.getUserFromUID( req.queryParams.client );

        var coll_id = g_lib.resolveID( req.queryParams.id, client );
        var coll = g_db.c.document( coll_id );
        var result = [];
        var items;
        var item;
        var mode = 0;
        var i;

        if ( req.queryParams.mode == "c" )
            mode = 1;
        else if ( req.queryParams.mode == "d" )
            mode = 2;

        if ( g_lib.hasAdminPermObject( client, coll_id )) {
            // No need to perform pernission checks on items if client has admin perm on collection
            items = g_db._query( "for v in 1..1 outbound @coll item let a = (for i in outbound v._id alias return i._id) return { id: v._id, title: v.title, alias: a[0] }", { coll: coll_id }).toArray();

            if ( mode > 0 ) {
                for ( i in items ) {
                    item = items[i];
                    if ((mode == 1 && item.id[0] == 'c') || (mode == 2 && item.id[0] == 'd' ))
                        result.push( item );
                }
            } else {
                result = items;
            }

        } else {
            if ( !g_lib.hasPermission( client, coll, g_lib.PERM_READ ))
                throw g_lib.ERR_PERM_DENIED;

            items = g_db._query( "for v in 1..1 outbound @coll item let a = (for i in outbound v._id alias return i._id) return { _id: v._id, grant: v.grant, deny: v.deny, title: v.title, alias: a[0] }", { coll: coll_id }).toArray();

            for ( i in items ) {
                item = items[i];
                if ( g_lib.hasLocalDeny( client, item, g_lib.PERM_LIST ))
                    continue;
                if ( !mode || (mode == 1 && item._id[0] == 'c') || (mode == 2 && item._id[0] == 'd' ))
                    result.push({ id: item._id, title: item.title, alias: item.alias });
                //}
            }
        }

        res.send( result );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client UID")
.queryParam('id', joi.string().required(), "Collection ID or alias to list")
.queryParam('mode', joi.string().valid('a','d','c').optional(), "Read mode: (a)ll, (d)ata only, (c)ollections only")
.summary('Read contents of a collection by ID or alias')
.description('Read contents of a collection by ID or alias');


router.get('/read2', function (req, res) {
    try {
        const client = g_lib.getUserFromUID( req.queryParams.client );

        var coll_id = g_lib.resolveID( req.queryParams.id, client );
        var coll = g_db.c.document( coll_id );

        if ( !g_lib.hasAdminPermObject( client, coll_id )) {
            if ( !g_lib.hasPermission( client, coll, g_lib.PERM_READ ))
                throw g_lib.ERR_PERM_DENIED;
        }

//"for i in d filter i.metadata.x == 3 let a = (for v in outbound i._id alias return v._id) let o = (for v in outbound i._id owner return v._id) return {id: i._id, title: i.title,alias:a[0],owner:o[0]}"

        const items = g_db._query( "for v in 1..1 outbound @coll item let a = (for i in outbound v._id alias return i._id) return { _id: v._id, grant: v.grant, deny: v.deny, inh_grant: v.inh_grant, inh_deny: v.inh_deny, title: v.title, alias: a[0] }", { coll: coll_id }).toArray();

        var result = [];
        var item;
        var mode = 0;

        if ( req.queryParams.mode == "c" )
            mode = 1;
        else if ( req.queryParams.mode == "d" )
            mode = 2;

        for ( var i in items ) {
            item = items[i];
            if ( g_lib.hasAdminPermObject( client, item._id ) || g_lib.hasPermission( client, item, g_lib.PERM_LIST )) {
                if ( !mode || (mode == 1 && item._id[0] == 'c') || (mode == 2 && item._id[0] == 'd' ))
                    result.push({ id: item._id, title: item.title, alias: item.alias });
            }
        }

        res.send( result );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client UID")
.queryParam('id', joi.string().required(), "Collection ID or alias to list")
.queryParam('mode', joi.string().valid('a','d','c').optional(), "Read mode: (a)ll, (d)ata only, (c)ollections only")
.summary('Read contents of a collection by ID or alias')
.description('Read contents of a collection by ID or alias');


router.post('/write', function (req, res) {
    try {
        const client = g_lib.getUserFromUID( req.queryParams.client );

        var coll_id = g_lib.resolveID( req.queryParams.id, client );
        var coll = g_db.c.document( coll_id );

        if ( !g_lib.hasAdminPermObject( client, coll_id )) {
            if ( !g_lib.hasPermission( client, coll, g_lib.PERM_WRITE ))
                throw g_lib.ERR_PERM_DENIED;
        }

        var i, id;

        if ( req.queryParams.remove ) {
            for ( i in req.queryParams.remove ) {
                id = req.queryParams.remove[i];
                g_db.item.removeByExample({ _from: coll_id, _to: id });
            }
        }

        if ( req.queryParams.add ) {
            for ( i in req.queryParams.add ) {
                id = req.queryParams.add[i];
                if ( g_db.item.firstExample({ _from: coll_id, _to: id }) == null )
                    g_db.item.save({ _from: coll_id, _to: id });
            }
        }
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client UID")
.queryParam('id', joi.string().required(), "Collection ID or alias to modify")
.queryParam('add', joi.array().items(joi.string()).optional(), "Array of item IDs to add")
.queryParam('remove', joi.array().items(joi.string()).optional(), "Array of item IDs to remove")
.summary('Add/remove items in a collection')
.description('Add/remove items in a collection');

