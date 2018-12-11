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
                read: ["u","uuid","accn"],
                write: ["c","a","alias","owner","item"]
            },
            action: function() {
                const client = g_lib.getUserFromClientID( req.queryParams.client );
                var owner_id;
                var parent_id;

                g_lib.validateTitle( req.body.title );
                g_lib.validateDescShort( req.body.desc );

                if ( req.body.parent ) {
                    parent_id = g_lib.resolveID( req.body.parent, client );

                    if ( parent_id[0] != "c" )
                        throw g_lib.ERR_PARENT_NOT_A_COLLECTION;

                    if ( !g_db._exists( parent_id ))
                        throw g_lib.ERR_COLL_NOT_FOUND;

                    owner_id = g_db.owner.firstExample({_from:parent_id})._to;
                    if ( owner_id != client._id ){
                        if ( !g_lib.hasManagerPermProj( client, owner_id )){
                            var parent_coll = g_db.c.document( parent_id );

                            if ( !g_lib.hasPermissions( client, parent_coll, g_lib.PERM_WR_DATA ))
                                throw g_lib.ERR_PERM_DENIED;
                        }
                    }
                }else{
                    parent_id = g_lib.getRootID(client._id);
                    owner_id = client._id;
                }

                var time = Math.floor( Date.now()/1000 );
                var obj = { title: req.body.title, owner: owner_id, ct: time, ut: time };

                if ( req.body.desc )
                    obj.desc = req.body.desc;

                if ( req.body.public )
                    obj.public = req.body.public;

                if ( req.body.alias ) {
                    obj.alias = req.body.alias.toLowerCase();
                    g_lib.validateAlias( obj.alias );
                }

                var coll = g_db.c.save( obj, { returnNew: true });
                g_db.owner.save({ _from: coll._id, _to: owner_id });

                g_graph.item.save({ _from: parent_id, _to: coll._id });

                if ( obj.alias ) {
                    var alias_key = owner_id[0] + ":" + owner_id.substr(2) + ":" + obj.alias;

                    g_db.a.save({ _key: alias_key });
                    g_db.alias.save({ _from: coll._id, _to: "a/" + alias_key });
                    g_db.owner.save({ _from: "a/" + alias_key, _to: owner_id });
                }

                coll = coll.new;
                coll.id = coll._id;
                delete coll._id;
                delete coll._key;
                delete coll._rev;

                result.push( coll );
            }
        });

        res.send( result );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.body(joi.object({
    title: joi.string().required(),
    desc: joi.string().allow('').optional(),
    alias: joi.string().allow('').optional(),
    public: joi.boolean().optional(),
    parent: joi.string().allow('').optional()
}).required(), 'Collection fields')
.summary('Create a new data collection')
.description('Create a new data collection from JSON body');

router.post('/update', function (req, res) {
    try {
        var result = [];

        g_db._executeTransaction({
            collections: {
                read: ["u","uuid","accn"],
                write: ["c","a","owner","alias"]
            },
            action: function() {
                const client = g_lib.getUserFromClientID( req.queryParams.client );
                var coll_id = g_lib.resolveID( req.body.id, client );
                var coll = g_db.c.document( coll_id );
                if ( !g_lib.hasAdminPermObject( client, coll_id )) {
                    if ( !g_lib.hasPermissions( client, coll, g_lib.PERM_ADMIN ))
                        throw g_lib.ERR_PERM_DENIED;
                }

                g_lib.validateTitle( req.body.title );
                g_lib.validateDescShort( req.body.desc );


                var time = Math.floor( Date.now()/1000 );
                var obj = {ut:time};

                if ( req.body.title != undefined && req.body.title != coll.title )
                    obj.title = req.body.title;

                if ( req.body.desc != undefined && req.body.desc != coll.desc )
                    obj.desc = req.body.desc;

                if ( req.body.alias != undefined ){
                    obj.alias = req.body.alias.toLowerCase();
                    g_lib.validateAlias( obj.alias );
                }
    
                if ( req.body.public != undefined && req.body.public != coll.public ){
                    obj.public = req.body.public;
                }

                coll = g_db._update( coll_id, obj, { returnNew: true });
                coll = coll.new;

                if ( obj.alias != undefined ) {
                    var old_alias = g_db.alias.firstExample({ _from: coll_id });
                    if ( old_alias ) {
                        const graph = require('@arangodb/general-graph')._graph('sdmsg');
                        graph.a.remove( old_alias._to );
                    }

                    if ( obj.alias ){
                        var owner_id = g_db.owner.firstExample({ _from: coll_id })._to;
                        var alias_key = owner_id[0] + ":" + owner_id.substr(2) + ":" + obj.alias;

                        g_db.a.save({ _key: alias_key });
                        g_db.alias.save({ _from: coll_id, _to: "a/" + alias_key });
                        g_db.owner.save({ _from: "a/" + alias_key, _to: owner_id });
                    }
                }

                if ( obj.public != undefined ){
                    // Public flag has changed - process all contained items recursively
                }

                delete coll._rev;
                delete coll._key;
                coll.id = coll._id;
                delete coll._id;

                result.push( coll );
            }
        });

        res.send( result );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.body(joi.object({
    id: joi.string().required(),
    title: joi.string().optional(),
    desc: joi.string().allow('').optional(),
    alias: joi.string().allow('').optional(),
    public: joi.boolean().optional()
}).required(), 'Collection fields')
.summary('Update an existing collection')
.description('Update an existing collection from JSON body');

router.get('/delete', function (req, res) {
    try {
        g_db._executeTransaction({
            collections: {
                read: ["u","uuid","accn"],
                write: ["c","d","a","owner","item","loc","acl","alias","alloc","t","top","p"]
            },
            action: function() {
                var i,obj;

                const client = g_lib.getUserFromClientID( req.queryParams.client );
                var coll_id = g_lib.resolveID( req.queryParams.id, client );
                var coll = g_db.c.document( coll_id );

                if ( !g_lib.hasAdminPermObject( client, coll_id )) {
                    if ( !g_lib.hasPermissions( client, coll, g_lib.PERM_ADMIN ))
                        throw g_lib.ERR_PERM_DENIED;
                }

                var owner_id = g_db.owner.firstExample({ _from: coll_id })._to;

                if ( coll.is_root )
                    throw g_lib.ERR_CANNOT_DEL_ROOT;

                var locations=[], allocs={};
                g_lib.deleteCollection( coll._id, allocs, locations );
                g_lib.updateAllocations( allocs, owner_id );

                res.send( locations );
            }
        });
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('id', joi.string().required(), "Collection ID or alias")
.summary('Deletes an existing data collection')
.description('Deletes an existing data collection and contained data');

// This is an OWNER or ADMIN only function, other users must navigate the collection hierarchy
router.get('/priv/list', function (req, res) {
    try {
        const client = g_lib.getUserFromClientID( req.queryParams.client );
        var owner_id;

        if ( req.queryParams.subject ) {
            owner_id = req.queryParams.subject;
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
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('subject', joi.string().optional(), "UID of subject user (optional)")
.summary('List all data collections owned by client (or subject)')
.description('List all data collections owned by client (or subject)');


router.get('/view', function (req, res) {
    try {
        const client = g_lib.getUserFromClientID( req.queryParams.client );

        var coll_id = g_lib.resolveID( req.queryParams.id, client );
        var coll = g_db.c.document( coll_id );

        if ( !g_lib.hasAdminPermObject( client, coll_id )) {
            if ( !g_lib.hasPermissions( client, coll, g_lib.PERM_VIEW ))
                throw g_lib.ERR_PERM_DENIED;
        }

        var owner_id = g_db.owner.firstExample({ _from: coll_id })._to;
        coll.owner = owner_id;
        coll.id = coll._id;
        delete coll._id;
        delete coll._key;
        delete coll._rev;

        res.send( [coll] );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('id', joi.string().required(), "Collection ID or alias")
.summary('View collection information by ID or alias')
.description('View collection information by ID or alias');


router.get('/read', function (req, res) {
    try {
        const client = g_lib.getUserFromClientID( req.queryParams.client );
        var coll_id = g_lib.resolveID( req.queryParams.id, client );
        var coll = g_db.c.document( coll_id );

        if ( !g_lib.hasAdminPermObject( client, coll_id )) {
            if ( !g_lib.hasPermissions( client, coll, g_lib.PERM_RD_DATA ))
                throw g_lib.ERR_PERM_DENIED;
        }

        var qry = "for v in 1..1 outbound @coll item sort is_same_collection('c',v) DESC, v.title";
        var result;

        if ( req.queryParams.offset != undefined && req.queryParams.count != undefined ){
            qry += " limit " + req.queryParams.offset + ", " + req.queryParams.count;
            qry += " return { id: v._id, title: v.title, alias: v.alias, locked: v.locked }";
            result = g_db._query( qry, { coll: coll_id },{},{fullCount:true});
            var tot = result.getExtra().stats.fullCount;
            result = result.toArray();
            result.push({paging:{off:req.queryParams.offset,cnt:req.queryParams.count,tot:tot}});
        }
        else{
            qry += " return { id: v._id, title: v.title, alias: v.alias, locked: v.locked }";
            result = g_db._query( qry, { coll: coll_id });
        }

        res.send( result );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('id', joi.string().required(), "Collection ID or alias to list")
.queryParam('offset', joi.number().optional(), "Offset")
.queryParam('count', joi.number().optional(), "Count")
.summary('Read contents of a collection by ID or alias')
.description('Read contents of a collection by ID or alias');


router.get('/write', function (req, res) {
    try {
        g_db._executeTransaction({
            collections: {
                read: ["u","d","c","uuid","accn"],
                write: ["item"]
            },
            action: function() {
                const client = g_lib.getUserFromClientID( req.queryParams.client );

                var coll_id = g_lib.resolveID( req.queryParams.id, client );
                var coll = g_db.c.document( coll_id );
                var is_admin = false;
                var owner_id = g_db.owner.firstExample({ _from: coll_id })._to;

                if ( !g_lib.hasAdminPermObject( client, coll_id )) {
                    if ( !g_lib.hasPermissions( client, coll, g_lib.PERM_WR_DATA ))
                        throw g_lib.ERR_PERM_DENIED;
                }else
                    is_admin = true;

                var i, obj,idx;
                var loose = [];

                // Enforce following link/unlink rules:
                // 1. Root collection may not be linked
                // 2. Items can only be linked once to a given collection
                // 3. Only items sharing the same owner as the target collection may be linked
                // 4. Linking and unlinking requires WRITE permission on parent collections and ADMIN permission on item
                // 5. Circular links are not allowed (linking a parent into a child collection)
                // 6. Collections can only be linked to one parent
                // 7. All records and collections must have at least one parent (except root)

                if ( req.queryParams.remove ) {
                    for ( i in req.queryParams.remove ) {
                        obj = g_lib.getObject( req.queryParams.remove[i], client );

                        // 2. Check if item is in this collection
                        if ( !g_db.item.firstExample({ _from: coll_id, _to: obj._id }))
                            throw g_lib.ERR_ITEM_NOT_LINKED;
                    
                        if ( !is_admin ) {
                            if ( !g_lib.hasPermissions( client, obj, g_lib.PERM_ADMIN ))
                                throw g_lib.ERR_PERM_DENIED;
                        }

                        g_db.item.removeByExample({ _from: coll_id, _to: obj._id });

                        // 7. If item has no parent collection AND it's not being added, link to root
                        if ( !g_db.item.firstExample({ _to: obj._id }) ){
                            loose.push({ id: obj._id, title: obj.title });
                        }
                    }
                }

                if ( req.queryParams.add ) {
                    for ( i in req.queryParams.add ) {
                        obj = g_lib.getObject( req.queryParams.add[i], client );

                        // Check if item is already in this collection
                        if ( !g_db.item.firstExample({ _from: coll_id, _to: obj._id })){
                            // Check if item is a root collection
                            if ( obj.is_root )
                                throw g_lib.ERR_CANNOT_LINK_ROOT;

                            // Check if item has same owner as this collection
                            if ( g_db.owner.firstExample({ _from: obj._id })._to != owner_id )
                                throw g_lib.ERR_CANNOT_CROSS_LINK;

                            // Check for proper permission on item
                            if ( !is_admin ) {
                                if ( !g_lib.hasPermissions( client, obj, g_lib.PERM_ADMIN ))
                                    throw g_lib.ERR_PERM_DENIED;
                            }

                            if ( obj._id[0] == "c" ){
                                // Check for circular dependency
                                if ( obj._id == coll_id || g_lib.isSrcParentOfDest( obj._id, coll_id ))
                                    throw g_lib.ERR_CIRCULAR_LINK;

                                // Collections can only be linked to one parent
                                g_db.item.removeByExample({ _to: obj._id });
                            }

                            g_db.item.save({ _from: coll_id, _to: obj._id });

                            // If item has no parent collection AND it's not being added, link to root
                            for ( idx in loose ){
                                if ( loose[idx].id == obj._id ){
                                    loose.slice(idx,1);
                                    break;
                                }
                            }
                        }
                    }
                }

                // 7. Re-link loose items to root
                if ( loose.length ){
                    var root_id = g_lib.getRootID(owner_id);
                    for ( i in loose )
                        g_db.item.save({ _from: root_id, _to: loose[i].id });
                }

                res.send( loose );
            }
        });
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('id', joi.string().required(), "Collection ID or alias to modify")
.queryParam('add', joi.array().items(joi.string()).optional(), "Array of item IDs to add")
.queryParam('remove', joi.array().items(joi.string()).optional(), "Array of item IDs to remove")
.summary('Add/remove items in a collection')
.description('Add/remove items in a collection');

router.get('/get_parents', function (req, res) {
    try {
        const client = g_lib.getUserFromClientID( req.queryParams.client );
        var items, item_id = g_lib.resolveID( req.queryParams.id, client );

        // TODO Check non-owner permission for this?

        if ( req.queryParams.all ){
            items = g_db._query( "for v in 1..20 inbound @item item return { id: v._id, title: v.title, alias: v.alias }", { item: item_id }).toArray();
        }else{
            items = g_db._query( "for v in 1..1 inbound @item item return { id: v._id, title: v.title, alias: v.alias }", { item: item_id }).toArray();
        }

        res.send( items );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('id', joi.string().required(), "ID or alias of child item")
.queryParam('all', joi.boolean().optional(), "Get all parents (true), or just immediate (false, default)" )
.summary('Get parent collection(s) of item')
.description('Get parent collection(s) of item');

