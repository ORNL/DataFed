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

router.get('/create', function (req, res) {
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

                if ( req.queryParams.parent ) {
                    parent_id = g_lib.resolveID( req.queryParams.parent, client );

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
                    parent_id = "c/" + client._key + "_root";
                    owner_id = client._id;
                }

                var obj = { title: req.queryParams.title };
                if ( req.queryParams.desc )
                    obj.desc = req.queryParams.desc;
                if ( req.queryParams.public )
                    obj.public = req.queryParams.public;

                var coll = g_db.c.save( obj, { returnNew: true });
                g_db.owner.save({ _from: coll._id, _to: owner_id });
    
                g_graph.item.save({ _from: parent_id, _to: coll._id });

                if ( req.queryParams.alias ) {
                    g_lib.validateAlias( req.queryParams.alias );
                    var alias_key = owner_id.substr(2) + ":" + req.queryParams.alias;

                    g_db.a.save({ _key: alias_key });
                    g_db.alias.save({ _from: coll._id, _to: "a/" + alias_key });
                    g_db.owner.save({ _from: "a/" + alias_key, _to: owner_id });

                    coll.new.alias = req.queryParams.alias;
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
.queryParam('title', joi.string().required(), "Title")
.queryParam('desc', joi.string().optional(), "Description")
.queryParam('public', joi.boolean().optional(), "Enable public access")
.queryParam('alias', joi.string().optional(), "Alias")
.queryParam('parent', joi.string().optional(), "Parent collection ID or alias (default = root)")
.summary('Creates a new data collection')
.description('Creates a new data collection');

router.get('/update', function (req, res) {
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
                var coll_id = g_lib.resolveID( req.queryParams.id, client );
                if ( !g_lib.hasAdminPermObject( client, coll_id )) {
                    coll = g_db.c.document( coll_id );
                    if ( !g_lib.hasPermission( client, coll, g_lib.PERM_UPDATE ))
                        throw g_lib.ERR_PERM_DENIED;
                }

                if ( req.queryParams.alias )
                    g_lib.validateAlias( req.queryParams.alias );

                var obj = {};
                var do_update = false;

                if ( req.queryParams.title ) {
                    obj.title = req.queryParams.title;
                    do_update = true;
                }

                if ( req.queryParams.desc ) {
                    obj.desc = req.queryParams.desc;
                    do_update = true;
                }

                if ( req.queryParams.public != undefined ){
                    obj.public = req.queryParams.public;
                    do_update = true;
                }

                if ( do_update ) {
                    coll = g_db._update( coll_id, obj, { returnNew: true });
                    coll = coll.new;
                } else {
                    coll = g_db.c.document( coll_id );
                }

                if ( req.queryParams.alias ) {
                    var old_alias = g_db.alias.firstExample({ _from: coll_id });
                    if ( old_alias ) {
                        g_db.a.remove( old_alias._to );
                        g_db.alias.remove( old_alias );
                    }

                    var owner_id = g_db.owner.firstExample({ _from: coll_id })._to;
                    var alias_key = owner_id.substr(2) + ":" + req.queryParams.alias;

                    g_db.a.save({ _key: alias_key });
                    g_db.alias.save({ _from: coll_id, _to: "a/" + alias_key });
                    g_db.owner.save({ _from: "a/" + alias_key, _to: owner_id });
                    coll.alias = req.queryParams.alias;
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
.queryParam('title', joi.string().optional(), "Title")
.queryParam('desc', joi.string().optional(), "Description")
.queryParam('public', joi.boolean().optional(), "Enable public access")
.queryParam('alias', joi.string().optional(), "Alias")
.queryParam('parent', joi.string().optional(), "Parent collection ID or alias (default = root)")
.summary('Updates an existing data collection')
.description('Updates an existing data collection');

router.get('/delete', function (req, res) {
    try {
        g_db._executeTransaction({
            collections: {
                read: ["u","uuid","accn"],
                write: ["c","a","n","owner","item","acl","tag","note","alias"]
            },
            action: function() {
                const client = g_lib.getUserFromClientID( req.queryParams.client );
                var coll_id = g_lib.resolveID( req.queryParams.id, client );

                g_lib.ensureAdminPermObject( client, coll_id );

                var coll = g_db.c.document( coll_id );

                if ( coll.is_root )
                    throw g_lib.ERR_CANNOT_DEL_ROOT;

                var obj;

                // Delete attached notes and aliases
                var objects = g_db._query( "for v in 1..1 outbound @coll note, alias return v._id", { coll: coll._id }).toArray();
                for ( var i in objects ) {
                    obj = objects[i];
                    g_graph[obj[0]].remove( obj );
                }

                g_graph.c.remove( coll._id );
            }
        });
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('id', joi.string().required(), "Collection ID or alias")
.summary('Deletes an existing data collection')
.description('Deletes an existing data collection');

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
            coll.alias = alias[0]._key.substr( owner_id.length - 1 );
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


/* This version of read assumes that if a client has read permissions for a collection, then
 * the items in the collection only need to be checked for local overrides to the LIST permission.
 * Have READ access to a collection translates to having LIST access for the contained items,
 * unless LIST is explicitly revoked on an item (i.e. not inherited)
*/
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
                // Since hasPermission call above has established collection read permission (which implies LIST),
                // only check for local deny settings (much more efficient)
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
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('id', joi.string().required(), "Collection ID or alias to list")
.queryParam('mode', joi.string().valid('a','d','c').optional(), "Read mode: (a)ll, (d)ata only, (c)ollections only")
.summary('Read contents of a collection by ID or alias')
.description('Read contents of a collection by ID or alias');


router.get('/read2', function (req, res) {
    try {
        const client = g_lib.getUserFromClientID( req.queryParams.client );

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

                if ( !g_lib.hasAdminPermObject( client, coll_id )) {
                    if ( !g_lib.hasPermission( client, coll, g_lib.PERM_WRITE ))
                        throw g_lib.ERR_PERM_DENIED;
                }

                var i, obj;
                var loose = [];

                if ( req.queryParams.remove ) {
                    for ( i in req.queryParams.remove ) {
                        obj = g_lib.getObject( req.queryParams.remove[i], client );
                        g_db.item.removeByExample({ _from: coll_id, _to: obj._id });
                        if ( !g_db.item.firstExample({ _to: obj._id })){
                            loose.push({ id: obj._id, title: obj.title });
                        }
                    }

                    if ( loose.length ){
                        var owner_id = g_db.owner.firstExample({ _from: coll_id })._to;
                        var root_id = "c/"+owner_id.substr(2)+"_root";
                        for ( i in loose ){
                            g_db.item.save({ _from: root_id, _to: loose[i].id });
                        }
                    }
                }

                if ( req.queryParams.add ) {
                    for ( i in req.queryParams.add ) {
                        obj = g_lib.getObject( req.queryParams.add[i], client );
                        if ( g_db.item.firstExample({ _from: coll_id, _to: obj._id }) == null )
                            g_db.item.save({ _from: coll_id, _to: obj._id });
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
        var item_id = g_lib.resolveID( req.queryParams.id, client );

        // TODO How to check non-owner permission for this?

        const items = g_db._query( "for v in 1..1 inbound @item item let a = (for i in outbound v._id alias return i._id) return { id: v._id, title: v.title, alias: a[0] }", { item: item_id }).toArray();

        res.send( items );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('id', joi.string().required(), "ID or alias of child item")
.summary('Get parent collection(s) of item')
.description('Get parent collection(s) of item');

