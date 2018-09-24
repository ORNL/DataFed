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
                        if ( !g_lib.hasAdminPermProj( client, owner_id )){
                            var parent_coll = g_db.c.document( parent_id );

                            if ( !g_lib.hasPermission( client, parent_coll, g_lib.PERM_CREATE ))
                                throw g_lib.ERR_PERM_DENIED;
                        }
                    }
                }else{
                    parent_id = g_lib.getRootID(client._id);
                    owner_id = client._id;
                }

                var obj = { title: req.body.title };
                if ( req.body.desc )
                    obj.desc = req.body.desc;
                if ( req.body.public )
                    obj.public = req.body.public;

                var coll = g_db.c.save( obj, { returnNew: true });
                g_db.owner.save({ _from: coll._id, _to: owner_id });
    
                g_graph.item.save({ _from: parent_id, _to: coll._id });

                if ( req.body.alias ) {
                    g_lib.validateAlias( req.body.alias );
                    var alias_key = owner_id[0] + ":" + owner_id.substr(2) + ":" + req.body.alias;

                    g_db.a.save({ _key: alias_key });
                    g_db.alias.save({ _from: coll._id, _to: "a/" + alias_key });
                    g_db.owner.save({ _from: "a/" + alias_key, _to: owner_id });

                    coll.new.alias = req.body.alias;
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
    desc: joi.string().optional(),
    alias: joi.string().optional(),
    public: joi.boolean().optional(),
    parent: joi.string().optional()
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
                var coll;
                const client = g_lib.getUserFromClientID( req.queryParams.client );
                var coll_id = g_lib.resolveID( req.body.id, client );
                if ( !g_lib.hasAdminPermObject( client, coll_id )) {
                    coll = g_db.c.document( coll_id );
                    if ( !g_lib.hasPermission( client, coll, g_lib.PERM_UPDATE ))
                        throw g_lib.ERR_PERM_DENIED;
                }

                g_lib.validateTitle( req.body.title );
                g_lib.validateDescShort( req.body.desc );

                if ( req.body.alias ){
                    g_lib.validateAlias( req.body.alias );
                }

                var obj = {};
                var do_update = false;

                if ( req.body.title ) {
                    obj.title = req.body.title;
                    do_update = true;
                }

                if ( req.body.desc ) {
                    obj.desc = req.body.desc;
                    do_update = true;
                }

                if ( req.body.public != undefined ){
                    obj.public = req.body.public;
                    do_update = true;
                }

                if ( do_update ) {
                    coll = g_db._update( coll_id, obj, { returnNew: true });
                    coll = coll.new;
                } else {
                    coll = g_db.c.document( coll_id );
                }

                if ( req.body.alias ) {
                    var old_alias = g_db.alias.firstExample({ _from: coll_id });
                    if ( old_alias ) {
                        const graph = require('@arangodb/general-graph')._graph('sdmsg');
                        graph.a.remove( old_alias._to );
                    }

                    var owner_id = g_db.owner.firstExample({ _from: coll_id })._to;
                    var alias_key = owner_id[0] + ":" + owner_id.substr(2) + ":" + req.body.alias;

                    g_db.a.save({ _key: alias_key });
                    g_db.alias.save({ _from: coll_id, _to: "a/" + alias_key });
                    g_db.owner.save({ _from: "a/" + alias_key, _to: owner_id });
                    coll.alias = req.body.alias;
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
    desc: joi.string().optional(),
    alias: joi.string().optional(),
    public: joi.boolean().optional()
}).required(), 'Collection fields')
.summary('Update an existing collection')
.description('Update an existing collection from JSON body');

router.get('/delete', function (req, res) {
    try {
        g_db._executeTransaction({
            collections: {
                read: ["u","uuid","accn"],
                write: ["c","d","a","owner","item","loc","acl","alias","alloc"]
            },
            action: function() {
                var i,obj;

                const client = g_lib.getUserFromClientID( req.queryParams.client );
                var coll_id = g_lib.resolveID( req.queryParams.id, client );

                g_lib.ensureAdminPermObject( client, coll_id );
                var coll = g_db.c.document( coll_id );
                var owner_id = g_db.owner.firstExample({ _from: coll_id })._to;

                if ( coll.is_root )
                    throw g_lib.ERR_CANNOT_DEL_ROOT;

                // Delete attached aliases
                var objects = g_db._query( "for v in 1..1 outbound @coll alias return v._id", { coll: coll._id }).toArray();
                for ( i in objects ) {
                    obj = objects[i];
                    g_graph[obj[0]].remove( obj );
                }

                // Recursively collect all linked items (data and collections) for deleteion or unlinking
                // Since this could be a very large and/or deep collection hierarchy, we will use a breadth-first traversal
                // to delete the collection layer-by-layer, rather than all-at-once. While deleting, any data records that are
                // actually deleted will have their data locations placed in an array that will be returned to the client. This
                // allows the client to coordinate deletion of raw data from associated data repos.

                // Note: data may be linked into the collection hierarchy being deleted more than once. This will cause the
                // delete logic to initially pass-over this data (in OWNED mode), but it will be deleted when the logic arrives
                // at the final instance of this data (thie link count will be 1 then).

                var locations=[], alloc={};
                var c,cur,next = [coll._id];

                while ( next.length ){
                    cur = next;
                    next = [];
                    for ( c in cur ){
                        coll = cur[c];
                        objects = g_db._query( "for v in 1..1 outbound @coll item let links = length(for v1 in 1..1 inbound v._id item return v1._id) let loc = (for v2,e2 in 1..1 outbound v._id loc return {repo:e2._to,path:e2.path}) return {id:v._id,size:v.data_size,links:links,loc:loc[0]}", { coll: coll }).toArray();

                        for ( i in objects ) {
                            obj = objects[i];
                            if ( obj.id[0] == "d" ){
                                if ( obj.links == 1 ){
                                    // Save location and delete
                                    locations.push({id:obj.id,repo_id:obj.loc.repo,path:obj.loc.path});
                                    if ( alloc[obj.loc.repo] )
                                        alloc[obj.loc.repo] += obj.size;
                                    else
                                        alloc[obj.loc.repo] = obj.size;
                                    g_lib.deleteObject( obj.id );
                                }else{
                                    // Unlink from current collection
                                    g_db.item.removeByExample({_from:coll,_to:obj.id});
                                }
                            }else{
                                next.push(obj.id);
                            }
                        }

                        g_lib.deleteObject( coll );
                    }
                }

                for ( i in alloc ){
                    console.log( "update alloc for ", alloc );
                    obj = g_db.alloc.firstExample({_from: owner_id, _to: i});
                    g_db._update( obj._id, { usage: obj.usage - alloc[i] });
                }

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
            if ( !g_lib.hasPermission( client, coll, g_lib.PERM_VIEW ))
                throw g_lib.ERR_PERM_DENIED;
        }

        var owner_id = g_db.owner.firstExample({ _from: coll_id })._to;
        coll.owner = owner_id;

        var alias = g_db._query("for v in 1..1 outbound @coll alias return v", { coll: coll_id }).toArray();
        if ( alias.length ) {
            coll.alias = alias[0]._key;
        }

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
            items = g_db._query( "for v in 1..1 outbound @coll item let a = (for i in outbound v._id alias return i._id) sort left(v._id,1), v.title return { id: v._id, title: v.title, alias: a[0] }", { coll: coll_id }).toArray();

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

            items = g_db._query( "for v in 1..1 outbound @coll item let a = (for i in outbound v._id alias return i._id) return { _id: v._id, title: v.title, alias: a[0] }", { coll: coll_id }).toArray();

            for ( i in items ) {
                item = items[i];
                if ( !mode || (mode == 1 && item._id[0] == 'c') || (mode == 2 && item._id[0] == 'd' ))
                    result.push({ id: item._id, title: item.title, alias: item.alias });
            }
        }

        res.send( result );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('id', joi.string().required(), "Collection ID or alias to list")
.queryParam('mode', joi.string().valid('a','d','c').optional(), "Read mode: (a)ll, (d)ata only, (c)ollections only")
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

                if ( !g_lib.hasAdminPermObject( client, coll_id )) {
                    if ( !g_lib.hasPermission( client, coll, g_lib.PERM_WRITE ))
                        throw g_lib.ERR_PERM_DENIED;
                }else
                    is_admin = true;

                var i, obj,idx;
                var loose = [];

                if ( req.queryParams.remove ) {
                    for ( i in req.queryParams.remove ) {
                        obj = g_lib.getObject( req.queryParams.remove[i], client );
                        if ( obj._id[0] == "c" && obj.is_root )
                            throw g_lib.ERR_CANNOT_UNLINK_ROOT;

                        if ( !is_admin ) {
                            if ( !g_lib.hasPermission( client, obj, g_lib.PERM_ADMIN ))
                                throw g_lib.ERR_PERM_DENIED;
                        }

                        g_db.item.removeByExample({ _from: coll_id, _to: obj._id });
                        // If item has no parent collection AND it's not being added, link to root
                        if ( !g_db.item.firstExample({ _to: obj._id }) ){
                            console.log("found poten loose:",obj._id);
                            loose.push({ id: obj._id, title: obj.title });
                        }
                    }
                }

                if ( req.queryParams.add ) {
                    for ( i in req.queryParams.add ) {
                        obj = g_lib.getObject( req.queryParams.add[i], client );
                        // Ignore if obj already in this collection?
                        if ( !g_db.item.firstExample({ _from: coll_id, _to: obj._id })){
                            // If obj is a collection, unlink from current parent
                            if ( !is_admin ) {
                                if ( !g_lib.hasPermission( client, obj, g_lib.PERM_ADMIN ))
                                    throw g_lib.ERR_PERM_DENIED;
                            }

                            if ( obj._id[0] == "c" ){
                                if ( obj.is_root )
                                    throw g_lib.ERR_CANNOT_LINK_ROOT;
                                g_db.item.removeByExample({ _to: obj._id });
                            }

                            g_db.item.save({ _from: coll_id, _to: obj._id });
                            for ( idx in loose ){
                                if ( loose[idx].id == obj._id ){
                                    console.log("remove poten loose:",obj._id);

                                    loose.slice(idx,1);
                                    break;
                                }
                            }
                        }
                    }
                }

                if ( loose.length ){
                    var owner_id = g_db.owner.firstExample({ _from: coll_id })._to;
                    var root_id = g_lib.getRootID(owner_id);
                    for ( i in loose ){
                        console.log("relink loose item", loose[i].id );
                        g_db.item.save({ _from: root_id, _to: loose[i].id });
                    }
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
            items = g_db._query( "for v in 1..20 inbound @item item let a = (for i in outbound v._id alias return i._id) return { id: v._id, title: v.title, alias: a[0] }", { item: item_id }).toArray();
        }else{
            items = g_db._query( "for v in 1..1 inbound @item item let a = (for i in outbound v._id alias return i._id) return { id: v._id, title: v.title, alias: a[0] }", { item: item_id }).toArray();
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

