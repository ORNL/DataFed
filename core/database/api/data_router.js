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
const   g_proc = require('./process');

module.exports = router;

//==================== DATA API FUNCTIONS

function recordCreate( client, record, results ){
    var owner_id;
    var parent_id;
    var repo_alloc;

    //console.log("Create new data");

    if ( record.parent ) {
        parent_id = g_lib.resolveCollID( record.parent, client );
        owner_id = g_db.owner.firstExample({_from:parent_id})._to;
        if ( owner_id != client._id ){
            if ( !g_lib.hasManagerPermProj( client, owner_id )){
                var parent_coll = g_db.c.document( parent_id );
                if ( !g_lib.hasPermissions( client, parent_coll, g_lib.PERM_CREATE )){
                    throw g_lib.ERR_PERM_DENIED;
                }
            }
        }
    }else{
        parent_id = g_lib.getRootID(client._id);
        owner_id = client._id;
    }

    // TODO This need to be updated when allocations can be assigned to collections

    // If repo is specified, verify it; otherwise assign one (aware of default)
    if ( record.repo ) {
        repo_alloc = g_lib.verifyRepo( owner_id, record.repo );
    } else {
        repo_alloc = g_lib.assignRepo( owner_id );
    }

    if ( !repo_alloc )
        throw [g_lib.ERR_NO_ALLOCATION,"No allocation available"];

    var time = Math.floor( Date.now()/1000 );
    var obj = { size: 0, ct: time, ut: time, owner: owner_id, creator: client._id };

    g_lib.procInputParam( record, "title", false, obj );
    g_lib.procInputParam( record, "desc", false, obj );
    g_lib.procInputParam( record, "keyw", false, obj );
    g_lib.procInputParam( record, "alias", false, obj );
    g_lib.procInputParam( record, "doi", false, obj );
    g_lib.procInputParam( record, "data_url", false, obj );

    if ( record.public ){
        obj.public = record.public;
    }

    if ( record.md ){
        obj.md = record.md;
        if ( Array.isArray( obj.md ))
            throw [g_lib.ERR_INVALID_PARAM,"Metadata cannot be an array"];
    }

    if ( obj.doi || obj.data_url ){
        if ( !obj.doi || !obj.data_url )
            throw [g_lib.ERR_INVALID_PARAM,"DOI number and Data URL must specified together."];
    }else{
        if ( record.ext_auto !== undefined )
            obj.ext_auto = record.ext_auto;
        else
            obj.ext_auto = true;

        if ( !obj.ext_auto && record.ext ){
            obj.ext = record.ext;
            if ( obj.ext.length && obj.ext.charAt(0) != "." )
                obj.ext = "." + obj.ext;
        }
    }

    var data = g_db.d.save( obj, { returnNew: true });
    g_db.owner.save({ _from: data.new._id, _to: owner_id });

    g_lib.makeTitleUnique( parent_id, data.new );

    // Create data location edge and update allocation and stats
    var loc = { _from: data.new._id, _to: repo_alloc._to, uid: owner_id };
    g_db.loc.save( loc );
    g_db.alloc.update( repo_alloc._id, { rec_count: repo_alloc.rec_count + 1 });

    if ( obj.alias ) {
        var alias_key = owner_id[0] + ":" + owner_id.substr(2) + ":" + obj.alias;

        if ( g_db.a.exists({ _key: alias_key }))
            throw [g_lib.ERR_INVALID_PARAM,"Alias, "+obj.alias+", already in use"];

        g_db.a.save({ _key: alias_key });
        g_db.alias.save({ _from: data.new._id, _to: "a/" + alias_key });
        g_db.owner.save({ _from: "a/" + alias_key, _to: owner_id });
    }

    // Handle specified dependencies
    if ( record.deps != undefined ){
        var dep,id,dep_data;
        data.new.deps = [];

        for ( var i in record.deps ) {
            dep = record.deps[i];
            id = g_lib.resolveDataID( dep.id, client );
            dep_data = g_db.d.document( id );
            if ( g_db.dep.firstExample({ _from: data._id, _to: id }))
                throw [g_lib.ERR_INVALID_PARAM,"Only one dependency can be defined between any two data records."];
            g_db.dep.save({ _from: data._id, _to: id, type: dep.type });
            data.new.deps.push({id:id,alias:dep_data.alias,type:dep.type,dir:g_lib.DEP_OUT});
        }
    }

    g_db.item.save({ _from: parent_id, _to: data.new._id });

    data.new.id = data.new._id;
    data.new.parent_id = parent_id;

    delete data.new._id;
    delete data.new._key;
    delete data.new._rev;

    results.push( data.new );
}

router.post('/create', function (req, res) {
    try {
        var result = [];

        g_db._executeTransaction({
            collections: {
                read: ["u","uuid","accn","repo"],
                write: ["d","a","alloc","loc","owner","alias","item","dep"]
            },
            action: function() {
                const client = g_lib.getUserFromClientID( req.queryParams.client );
                recordCreate( client, req.body, result );
            }
        });

        res.send( result );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.body(joi.object({
    title: joi.string().allow('').optional(),
    desc: joi.string().allow('').optional(),
    keyw: joi.string().allow('').optional(),
    alias: joi.string().allow('').optional(),
    public: joi.boolean().optional(),
    doi: joi.string().allow('').optional(),
    data_url: joi.string().allow('').optional(),
    parent: joi.string().allow('').optional(),
    repo: joi.string().allow('').optional(),
    md: joi.any().optional(),
    ext: joi.string().allow('').optional(),
    ext_auto: joi.boolean().optional(),
    deps: joi.array().items(joi.object({
        id: joi.string().required(),
        type: joi.number().integer().required()})).optional()
}).required(), 'Record fields')
.summary('Create a new data record')
.description('Create a new data record from JSON body');


router.post('/create/batch', function (req, res) {
    try {
        var result = [];
        console.log( "create data" );

        g_db._executeTransaction({
            collections: {
                read: ["u","uuid","accn","repo"],
                write: ["d","a","alloc","loc","owner","alias","item","dep"]
            },
            action: function() {
                const client = g_lib.getUserFromClientID( req.queryParams.client );
                for ( var i in req.body ){
                    recordCreate( client, req.body[i], result );
                }
            }
        });

        res.send( result );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.body(joi.array().items(
    joi.object({
        title: joi.string().allow('').optional(),
        desc: joi.string().allow('').optional(),
        keyw: joi.string().allow('').optional(),
        alias: joi.string().allow('').optional(),
        public: joi.boolean().optional(),
        doi: joi.string().allow('').optional(),
        data_url: joi.string().allow('').optional(),
        parent: joi.string().allow('').optional(),
        repo: joi.string().allow('').optional(),
        md: joi.any().optional(),
        ext: joi.string().allow('').optional(),
        ext_auto: joi.boolean().optional(),
        deps: joi.array().items(joi.object({
            id: joi.string().required(),
            type: joi.number().integer().required()})).optional()
    })
).required(), 'Array of record with attributes')
.summary('Create a batch of new data records')
.description('Create a batch of new data records from JSON body');


function recordUpdate( client, record, results ){
    var data_id = g_lib.resolveDataID( record.id, client );
    var data = g_db.d.document( data_id );

    if ( !g_lib.hasAdminPermObject( client, data_id )) {
        // Required permissions depend on which fields are being modified:
        // Metadata = PERM_WR_META, file_size = PERM_WR_DATA, all else = ADMIN
        var perms = 0;
        if ( obj.md !== undefined )
            perms |= g_lib.PERM_WR_META;

        if ( obj.title !== undefined || obj.alias !== undefined || obj.desc !== undefined || obj.keyw !== undefined )
            perms |= g_lib.PERM_WR_REC;

        if ( obj.size !== undefined || obj.dt !== undefined || obj.data_url !== undefined || obj.doi !== undefined || obj.source !== undefined )
            perms |= g_lib.PERM_WR_DATA;

        if ( obj.public !== undefined )
            perms |= g_lib.PERM_SHARE;

        if ( data.locked || !g_lib.hasPermissions( client, data, perms ))
            throw g_lib.ERR_PERM_DENIED;
    }

    var owner_id = g_db.owner.firstExample({ _from: data_id })._to;

    var obj = { ut: Math.floor( Date.now()/1000 ) };

    g_lib.procInputParam( record, "title", true, obj );
    g_lib.procInputParam( record, "desc", true, obj );
    g_lib.procInputParam( record, "keyw", true, obj );
    g_lib.procInputParam( record, "alias", true, obj );
    g_lib.procInputParam( record, "source", true, obj );
    g_lib.procInputParam( record, "doi", true, obj );
    g_lib.procInputParam( record, "data_url", true, obj );

    if ( record.md === "" )
        obj.md = null;
    else if ( record.md ){
        obj.md = record.md;
        if ( Array.isArray( obj.md ))
            throw [ g_lib.ERR_INVALID_PARAM, "Metadata cannot be an array" ];
    }

    if ( record.public !== undefined )
        obj.public = record.public;

    if ( record.ext_auto !== undefined )
        obj.ext_auto = record.ext_auto;

    if ( obj.ext_auto == true || ( obj.ext_auto == undefined && data.ext_auto == true )){
        if ( obj.source !== undefined || data.source !== undefined ){
            var src = obj.source || data.source;
            if ( src ){
                // Skip possible "." in end-point name
                var pos = src.lastIndexOf("/");
                pos = src.indexOf(".",pos>0?pos:0);
                if ( pos != -1 ){
                    obj.ext = src.substr( pos );
                }else{
                    obj.ext = null;
                }
            }
        }
    }else{
        g_lib.procInputParam( record, "ext", true, obj );
        if ( obj.ext && obj.ext.charAt(0) != "." )
            obj.ext = "." + obj.ext;
    }

    if ( record.size !== undefined ) {
        var loc, alloc;

        obj.size = record.size;

        if ( obj.size != data.size ){
            loc = g_db.loc.firstExample({ _from: data_id });
            alloc = g_db.alloc.firstExample({ _from: owner_id, _to: loc._to });
            g_db._update( alloc._id, { data_size: Math.max( 0, alloc.data_size - data.size + obj.size )});
        }
    }

    if ( !data.doi && ( obj.doi || obj.data_url ))
        throw [ g_lib.ERR_INVALID_PARAM, "Cannot set DOI parameters for managed data." ];

    if ( data.doi && ( obj.size !== undefined || obj.source !== undefined || obj.ext_auto !== undefined || obj.ext !== undefined ))
        throw [ g_lib.ERR_INVALID_PARAM, "Cannot set data parameters for published data." ];

    if ( record.dt != undefined )
        obj.dt = record.dt;

    data = g_db._update( data_id, obj, { keepNull: false, returnNew: true, mergeObjects: record.mdset?false:true });
    data = data.new;

    if ( obj.alias != undefined ) {
        var old_alias = g_db.alias.firstExample({ _from: data_id });
        if ( old_alias ) {
            const graph = require('@arangodb/general-graph')._graph('sdmsg');
            graph.a.remove( old_alias._to );
        }

        if ( obj.alias ){
            var alias_key = owner_id[0] + ":" + owner_id.substr(2) + ":" + obj.alias;
            if ( g_db.a.exists({ _key: alias_key }))
                throw [g_lib.ERR_INVALID_PARAM,"Alias, "+obj.alias+", already in use"];

            g_db.a.save({ _key: alias_key });
            g_db.alias.save({ _from: data_id, _to: "a/" + alias_key });
            g_db.owner.save({ _from: "a/" + alias_key, _to: owner_id });
        }
    }

    if ( record.deps != undefined && ( record.deps_add != undefined || record.deps_rem != undefined ))
        throw [g_lib.ERR_INVALID_PARAM,"Cannot use both dependency set and add/remove."];

    var i,dep,id; //dep_data;

    if ( record.deps_clear ){
        g_db.dep.removeByExample({_from:data_id});
        data.deps = [];
    }

    if ( record.deps_rem != undefined ){
        //console.log("rem deps from ",data._id);
        for ( i in record.deps_rem ) {
            dep = record.deps_rem[i];
            id = g_lib.resolveDataID( dep.id, client );
            //console.log("rem id:",id);
            if ( !g_db.dep.firstExample({_from:data._id,_to:id}) )
                throw [g_lib.ERR_INVALID_PARAM,"Specified dependency on "+id+" does not exist."];
            //console.log("done rem");
            g_db.dep.removeByExample({_from:data._id,_to:id});
        }
    }

    if ( record.deps_add != undefined ){
        //console.log("add deps");
        for ( i in record.deps_add ) {
            dep = record.deps_add[i];
            //console.log("dep id:",dep.id);
            id = g_lib.resolveDataID( dep.id, client );
            if ( !id.startsWith("d/"))
                throw [g_lib.ERR_INVALID_PARAM,"Dependencies can only be set on data records."];
            //dep_data = g_db.d.document( id );
            if ( g_db.dep.firstExample({_from:data._id,_to:id}) )
                throw [g_lib.ERR_INVALID_PARAM,"Only one dependency can be defined between any two data records."];

            g_db.dep.save({ _from: data_id, _to: id, type: dep.type });
        }

        g_lib.checkDependencies(data_id);
    }

    data.deps = g_db._query("for v,e in 1..1 any @data dep return {id:v._id,alias:v.alias,type:e.type,from:e._from}",{data:data_id}).toArray();
    for ( i in data.deps ){
        dep = data.deps[i];
        if ( dep.from == data_id )
            dep.dir = g_lib.DEP_OUT;
        else
            dep.dir = g_lib.DEP_IN;
        delete dep.from;
    }

    delete data._rev;
    delete data._key;
    data.id = data._id;
    delete data._id;

    results.push( data );
}

router.post('/update', function (req, res) {
    try {
        var result = { data: [] };

        g_db._executeTransaction({
            collections: {
                read: ["u","uuid","accn","loc"],
                write: ["d","a","p","owner","alias","alloc","dep"],
                exclusive: ["task","lock","block"]
            },
            action: function() {
                const client = g_lib.getUserFromClientID( req.queryParams.client );

                recordUpdate( client, req.body, result.data );

                //result.task = g_proc.taskInitDeleteRawData( client, del_map );
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
    title: joi.string().allow('').optional(),
    desc: joi.string().allow('').optional(),
    keyw: joi.string().allow('').optional(),
    alias: joi.string().allow('').optional(),
    public: joi.boolean().optional(),
    doi: joi.string().allow('').optional(),
    data_url: joi.string().allow('').optional(),
    md: joi.any().optional(),
    mdset: joi.boolean().optional().default(false),
    size: joi.number().optional(),
    source: joi.string().allow('').optional(),
    ext: joi.string().allow('').optional(),
    ext_auto: joi.boolean().optional(),
    dt: joi.number().optional(),
    deps_clear: joi.boolean().optional(),
    deps_add: joi.array().items(joi.object({
        id: joi.string().required(),
        type: joi.number().integer().required()})).optional(),
    deps_rem: joi.array().items(joi.object({
        id: joi.string().required(),
        type: joi.number().integer().required()})).optional()
}).required(), 'Record fields')
.summary('Update an existing data record')
.description('Update an existing data record from JSON body');


router.post('/update/batch', function (req, res) {
    try {
        var result = { data: [] };

        g_db._executeTransaction({
            collections: {
                read: ["u","uuid","accn","loc"],
                write: ["d","a","p","owner","alias","alloc","dep"],
                exclusive: ["task","lock","block"]
            },
            action: function() {
                const client = g_lib.getUserFromClientID( req.queryParams.client );

                for ( var i in req.body ){
                    recordUpdate( client, req.body[i], result.data );
                }

                //result.task = g_proc.taskInitDeleteRawData( client, del_map );
            }
        });

        res.send( result );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.body(joi.array().items(
    joi.object({
        id: joi.string().required(),
        title: joi.string().allow('').optional(),
        desc: joi.string().allow('').optional(),
        keyw: joi.string().allow('').optional(),
        alias: joi.string().allow('').optional(),
        public: joi.boolean().optional(),
        doi: joi.string().allow('').optional(),
        data_url: joi.string().allow('').optional(),
        md: joi.any().optional(),
        mdset: joi.boolean().optional().default(false),
        size: joi.number().optional(),
        source: joi.string().allow('').optional(),
        ext: joi.string().allow('').optional(),
        ext_auto: joi.boolean().optional(),
        dt: joi.number().optional(),
        deps_clear: joi.boolean().optional(),
        deps_add: joi.array().items(joi.object({
            id: joi.string().required(),
            type: joi.number().integer().required()})).optional(),
        deps_rem: joi.array().items(joi.object({
            id: joi.string().required(),
            type: joi.number().integer().required()})).optional()
    })
).required(), 'Array of records and field updates')
.summary('Update a batch of existing data record')
.description('Update a batch of existing data record from JSON body');


router.post('/update/post_put', function (req, res) {
    try {
        var result = [];

        g_db._executeTransaction({
            collections: {
                read: ["u","uuid","accn","loc"],
                write: ["d","a","p","owner","alloc"]
            },
            action: function() {
                const client = g_lib.getUserFromClientID( req.queryParams.client );
                var data_id = g_lib.resolveDataID( req.body.id, client );
                var owner_id = g_db.owner.firstExample({ _from: data_id })._to;
                var data = g_db.d.document( data_id );

                var obj = { ut: Math.floor( Date.now()/1000 ), size: req.body.size, dt: req.body.dt };

                g_lib.procInputParam( req.body, "source", true, obj );

                if ( req.body.ext_auto !== undefined ){
                    obj.ext_auto = req.body.ext_auto;
                }

                if ( obj.ext_auto == true || ( obj.ext_auto == undefined && data.ext_auto == true )){
                    if ( obj.source !== undefined || data.source !== undefined ){
                        // Changed - update auto extension
                        var src = obj.source || data.source;
                        if ( src ){
                            // Skip possible "." in end-point name
                            var pos = src.lastIndexOf("/");
                            pos = src.indexOf(".",pos>0?pos:0);
                            if ( pos != -1 ){
                                obj.ext = src.substr( pos );
                            }else{
                                obj.ext = null;
                            }
                        }
                    }
                }else{
                    g_lib.procInputParam( req.body, "ext", true, obj );
                    if ( obj.ext && obj.ext.charAt(0) != "." )
                        obj.ext = "." + obj.ext;
                }

                if ( obj.size != data.size ){
                    var loc = g_db.loc.firstExample({ _from: data_id });
                    var alloc = g_db.alloc.firstExample({ _from: owner_id, _to: loc._to });

                    g_db._update( alloc._id, { data_size: Math.max( 0, alloc.data_size - data.size + obj.size )});
                }

                g_db._update( data_id, obj, { keepNull: false });
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
    size: joi.number().required(),
    source: joi.string().allow('').required(),
    ext: joi.string().allow('').optional(),
    ext_auto: joi.boolean().optional(),
    dt: joi.number().required()
}).required(), 'Record fields')
.summary('Update an existing data record after data put')
.description('Update an existing data record from JSON body');


router.post('/update/move_init', function (req, res) {
    try {
        g_db._executeTransaction({
            collections: {
                read: ["u","uuid","accn","d"],
                write: ["loc"]
            },
            action: function() {
                var id, loc;

                if (( req.body.new_owner_id && !req.body.new_coll_id ) || ( !req.body.new_owner_id && req.body.new_coll_id ))
                    throw [ g_lib.ERR_INVALID_PARAM, "New owner and new collection must be specified together." ];

                if ( req.body.new_coll_id ){
                    if ( !g_db.c.exists( req.body.new_coll_id ))
                        throw [ g_lib.ERR_INTERNAL_FAULT, "New collection '" + req.body.new_coll_id + "' does not exist!" ];

                    var coll = g_db.c.document( req.body.new_coll_id );

                    if ( coll.owner != req.body.new_owner_id )
                        throw [ g_lib.ERR_INTERNAL_FAULT, "Record '" + id + "' destination collection '" + req.body.new_coll_id + "' not owner by new owner!" ];
                }

                for ( var i in req.body.ids ){
                    id = req.body.ids[i];

                    if ( !g_db.d.exists( id ))
                        throw [ g_lib.ERR_INVALID_PARAM, "Record '" + id + "' does not exist." ];

                    loc = g_db.loc.firstExample({ _from: id });
                    if ( !loc )
                        throw [ g_lib.ERR_INTERNAL_FAULT, "Record '" + id + "' has no location edge!" ];

                    var obj = {};

                    if ( !req.body.new_owner_id && loc._to == req.body.new_repo_id )
                        throw [ g_lib.ERR_INVALID_PARAM, "Record '" + id + "' allocation already on repo '" + loc._to + "'." ];

                    obj.new_repo = req.body.new_repo_id;

                    if ( req.body.new_owner_id ){
                        if ( loc.uid == req.body.new_owner_id )
                            throw [ g_lib.ERR_INVALID_PARAM, "Record '" + id + "' already owned by '" + loc.uid + "'." ];

                        obj.new_owner = req.body.new_owner_id;
                        obj.new_coll = req.body.new_coll_id;
                    }

                    g_db._update( loc._id, obj );
                }
            }
        });

    } catch( e ){
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.body(joi.object({
    ids: joi.array().items(joi.string()).required(),
    new_repo_id: joi.string().required(),
    new_owner_id: joi.string().allow('').optional(),
    new_coll_id: joi.string().allow('').optional()
}).required(), 'Parameters')
.summary('Prepare record for raw data move to new allocation')
.description('Prepare record for raw data move data to a new allocation.');


router.post('/update/move_fini', function (req, res) {
    try {
        g_db._executeTransaction({
            collections: {
                read: ["u","uuid","accn"],
                write: ["d","owner","loc","alloc","item","acl"]
            },
            action: function() {
                var id, loc, new_loc, alloc, rec, coll;

                for ( var i in req.body.ids ){
                    id = req.body.ids[i];

                    if ( !g_db.d.exists( id ))
                        throw [ g_lib.ERR_INVALID_PARAM, "Record '" + id + "' does not exist." ];

                    loc = g_db.loc.firstExample({ _from: id });
                    if ( !loc )
                        throw [ g_lib.ERR_INTERNAL_FAULT, "Record '" + id + "' has no location edge!" ];

                    if ( loc.new_owner ){
                        // Changing owner and repo
                        if ( !loc.new_coll )
                            throw [ g_lib.ERR_INTERNAL_FAULT, "Record '" + id + "' missing destination collection!" ];

                        if ( !g_db.c.exists( loc.new_coll ))
                            throw [ g_lib.ERR_INTERNAL_FAULT, "Record '" + id + "' destination collection '" + loc.new_coll + "' does not exist!" ];

                        coll = g_db.c.document( loc.new_coll );

                        if ( coll.owner != loc.new_owner )
                            throw [ g_lib.ERR_INTERNAL_FAULT, "Record '" + id + "' destination collection '" + loc.new_coll + "' not owner by new owner!" ];

                        // Clear all record ACLs
                        g_db.acl.removeByExample({ _from: id });

                        // Update record to new owner
                        g_db._update( id, { owner: loc.new_owner });

                        // Move ownership edge
                        g_db.owner.removeByExample({ _from: id });
                        g_db.owner.save({ _from: id, _to: loc.new_owner });

                        // Move to new collection
                        g_db.item.removeByExample({ _to: id });
                        g_db.item.save({ _from: loc.new_coll, _to: id });
                    }

                    rec = g_db.d.document( id );

                    // Update old allocation stats
                    alloc = g_db.alloc.firstExample({ _from: loc.uid, _to: loc._to });
                    if ( !alloc )
                        throw [ g_lib.ERR_INTERNAL_FAULT, "Record '" + id + "' has mismatched allocation/location (cur)!" ];

                    g_db._update( alloc._id, { rec_count: alloc.rec_count - 1, data_size: alloc.data_size - rec.size });

                    // Update new allocation stats
                    alloc = g_db.alloc.firstExample({ _from: loc.uid, _to: loc.new_repo });
                    if ( !alloc )
                        throw [ g_lib.ERR_INTERNAL_FAULT, "Record '" + id + "' has mismatched allocation/location (new)!" ];

                    g_db._update( alloc._id, { rec_count: alloc.rec_count + 1, data_size: alloc.data_size + rec.size });

                    // Create new edge to new owner/repo, delete old
                    new_loc = { _from: loc._from, _to: loc.new_repo, uid: loc.new_owner?loc.new_owner:loc.uid };
                    g_db.loc.save( new_loc );
                    g_db.loc.remove( loc );
                }
            }
        });

    } catch( e ){
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.body(joi.object({
    ids: joi.array().items(joi.string()).required(),
}).required(), 'Parameters')
.summary('Finalize record after raw data move to new allocation')
.description('Finalize record after raw data move data to a new allocation.');


router.get('/view', function (req, res) {
    try {
        const client = g_lib.getUserFromClientID( req.queryParams.client );
        var data_id = g_lib.resolveDataID( req.queryParams.id, client );
        var data = g_db.d.document( data_id );

        var i,dep,rem_md = false;

        if ( !g_lib.hasAdminPermObject( client, data_id )) {
            var perms = g_lib.getPermissions( client, data, g_lib.PERM_RD_REC | g_lib.PERM_RD_META );
            if ( data.locked || ( perms & ( g_lib.PERM_RD_REC | g_lib.PERM_RD_META )) == 0 )
                throw g_lib.ERR_PERM_DENIED;
            if (( perms & g_lib.PERM_RD_META ) == 0 )
                rem_md = true;
        }

        data.deps = g_db._query("for v,e in 1..1 any @data dep let dir=e._from == @data?1:0 sort dir desc, e.type asc return {id:v._id,alias:v.alias,owner:v.owner,type:e.type,dir:dir}",{data:data_id}).toArray();
        for ( i in data.deps ){
            dep = data.deps[i];
            if ( dep.alias && client._id != dep.owner )
                dep.alias = dep.owner.charAt(0) + ":" + dep.owner.substr(2) + ":" + dep.alias;
        }

        if ( rem_md && data.md )
            delete data.md;

        data.repo_id = g_db.loc.firstExample({ _from: data_id })._to;

        delete data._rev;
        delete data._key;
        data.id = data._id;
        delete data._id;

        res.send( [data] );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('id', joi.string().required(), "Data ID or alias")
.summary('Get data by ID or alias')
.description('Get data by ID or alias');

router.get('/dep/get', function (req, res) {
    const client = g_lib.getUserFromClientID( req.queryParams.client );
    var data_id = g_lib.resolveDataID( req.queryParams.id, client );
    var dep,result = {id:data_id,title:""};

    result.deps = g_db._query("for v,e in 1..1 any @data dep let dir=e._from == @data?1:0 sort dir desc, e.type asc return {id:v._id,alias:v.alias,owner:v.owner,type:e.type,dir:dir}",{data:data_id}).toArray();

    for ( var i in result.deps ){
        dep = result.deps[i];
        if ( dep.alias && client._id != dep.owner )
            dep.alias = dep.owner.charAt(0) + ":" + dep.owner.substr(2) + ":" + dep.alias;
    }

    res.send( [result] );
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('id', joi.string().required(), "Data ID or alias")
.summary('Get data dependencies')
.description('Get data dependencies');

router.get('/dep/graph/get', function (req, res) {
    try {
        const client = g_lib.getUserFromClientID( req.queryParams.client );
        var data_id = g_lib.resolveDataID( req.queryParams.id, client );
        var i, j, entry, rec, deps, dep, node, visited = [data_id], cur = [[data_id,true]], next = [], result = [];

        // Get Ancestors
        var gen = 0;

        //console.log("get ancestors");

        while ( cur.length ){
            //console.log("gen",gen);
            for ( i in cur ) {
                entry = cur[i];
                rec = g_db.d.document( entry[0] );
                if ( rec.alias && client._id != rec.owner )
                    rec.alias = rec.owner.charAt(0) + ":" + rec.owner.substr(2) + ":" + rec.alias;

                if ( entry[1] ){
                    deps = g_db._query("for v,e in 1..1 outbound @data dep return {id:v._id,type:e.type,dir:1}",{data:entry[0]}).toArray();

                    for ( j in deps ){
                        dep = deps[j]; 
                        //console.log("dep:",dep.id,"ty:",dep.type);

                        if ( visited.indexOf(dep.id) < 0 ){
                            visited.push(dep.id);
                            next.push([dep.id,dep.type < 2]);
                        }
                    }
                    result.push({id:rec._id,title:rec.title,alias:rec.alias,owner:rec.owner,locked:rec.locked,gen:gen,deps:deps});
                }else{
                    result.push({id:rec._id,title:rec.title,alias:rec.alias,owner:rec.owner,locked:rec.locked});
                }
            }

            cur = next;
            next = [];
            gen--;
        }

        var gen_min = gen;

        // Get Descendants

        //console.log("get descendants");

        cur = [[data_id,true]];
        next = [];
        gen = 1;

        while ( cur.length ){
            //console.log("gen",gen);

            for ( i in cur ) {
                entry = cur[i];

                //rec = g_db.d.document( cur[i] );
                deps = g_db._query("for v,e in 1..1 inbound @data dep return {id:v._id,alias:v.alias,title:v.title,owner:v.owner,locked:v.locked,type:e.type}",{data:entry[0]}).toArray();

                if ( entry[1] ){
                    for ( j in deps ){
                        dep = deps[j]; 

                        //console.log("dep:",dep.id,"ty:",dep.type);

                        if ( visited.indexOf(dep.id) < 0 ){
                            //console.log("follow");
                            node = {id:dep.id,title:dep.title,alias:dep.alias,owner:dep.owner,locked:dep.locked,deps:[{id:entry[0],type:dep.type,dir:0}]};
                            if ( node.alias && client._id != node.owner )
                                node.alias = node.owner.charAt(0) + ":" + node.owner.substr(2) + ":" + node.alias;
                            if ( dep.type<2 )
                                node.gen = gen;
                            result.push(node);
                            visited.push(dep.id);
                            if ( dep.type < 2 )
                                next.push([dep.id,true]);
                        }
                    }
                }
            }
            gen += 1;
            cur = next;
            next = [];
        }


        //console.log("adjust gen:",gen_min);

        // Adjust gen values to start at 0
        if ( gen_min < 0 ){
            for ( i in result ){
                node = result[i];
                if ( node.gen != undefined )
                    node.gen -= gen_min;
            }
        }

        res.send( result );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('id', joi.string().required(), "Data ID or alias")
.summary('Get data dependency graph')
.description('Get data dependency graph');


router.get('/lock', function (req, res) {
    try {
        const client = g_lib.getUserFromClientID( req.queryParams.client );
        g_db._executeTransaction({
            collections: {
                read: ["u","uuid","accn","a","alias"],
                write: ["d"]
            },
            action: function() {
                var obj,i,result=[];
                for ( i in req.queryParams.ids ){
                    obj = g_lib.getObject( req.queryParams.ids[i], client );

                    if ( !g_lib.hasAdminPermObject( client, obj._id )) {
                        if ( !g_lib.hasPermissions( client, obj, g_lib.PERM_LOCK ))
                            throw g_lib.ERR_PERM_DENIED;
                    }
                    g_db._update( obj._id, {locked:req.queryParams.lock}, { returnNew: true });
                    result.push({id:obj._id,alias:obj.alias,title:obj.title,owner:obj.owner,locked:req.queryParams.lock});
                }
                res.send(result);
            }
        });
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().optional(), "Client ID")
.queryParam('ids', joi.array().items(joi.string()).required(), "Array of data IDs or aliases")
.queryParam('lock',joi.bool().required(),"Lock (true) or unlock (false) flag")
.summary('Toggle data record lock')
.description('Toggle data record lock');



/** @brief Get raw data path for local direct access, if possible from specified domain
 * 
 */
router.get('/path', function (req, res) {
    try {
        const client = g_lib.getUserFromClientID( req.queryParams.client );
        var data_id = g_lib.resolveDataID( req.queryParams.id, client );

        if ( !g_lib.hasAdminPermObject( client, data_id )) {
            var data = g_db.d.document( data_id );
            var perms = g_lib.getPermissions( client, data, g_lib.PERM_RD_DATA );
            if (( perms & g_lib.PERM_RD_DATA ) == 0 )
                throw g_lib.ERR_PERM_DENIED;
        }

        var loc = g_db.loc.firstExample({ _from: data_id });
        if ( !loc )
            throw g_lib.ERR_NO_RAW_DATA;

        var repo = g_db.repo.document( loc._to );
        if ( repo.domain != req.queryParams.domain )
            throw [g_lib.ERR_INVALID_PARAM,"Can only access data from '" + repo.domain + "' domain"];

        var path =  g_lib.computeDataPath( loc, true );
        res.send({ path: path });
        //res.send({ path: repo.exp_path + loc.path.substr( repo.path.length ) });
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().optional(), "Client ID")
.queryParam('id', joi.string().required(), "Data ID (not alias)")
.queryParam('domain', joi.string().required(), "Client domain")
.summary('Get raw data local path')
.description('Get raw data local path');


router.get('/list/by_alloc', function (req, res) {
    try {
        const client = g_lib.getUserFromClientID( req.queryParams.client );
        var owner_id;

        if ( req.queryParams.subject ) {
            owner_id = req.queryParams.subject;
            if ( req.queryParams.subject.startsWith("u/")){
                g_lib.ensureAdminPermUser( client, owner_id );
            }else{
                g_lib.ensureManagerPermProj( client, owner_id );
            }
        } else {
            owner_id = client._id;
        }

        var qry = "for v,e in 1..1 inbound @repo loc filter e.uid == @uid sort v.title";
        var result;

        if ( req.queryParams.offset != undefined && req.queryParams.count != undefined ){
            qry += " limit " + req.queryParams.offset + ", " + req.queryParams.count;
            qry += " return { id: v._id, title: v.title, alias: v.alias, doi: v.doi, locked: v.locked }";
            result = g_db._query( qry, { repo: req.queryParams.repo, uid: owner_id },{},{fullCount:true});
            var tot = result.getExtra().stats.fullCount;
            result = result.toArray();
            result.push({paging:{off:req.queryParams.offset,cnt:req.queryParams.count,tot:tot}});
        }
        else{
            qry += " return { id: v._id, title: v.title, alias: v.alias, doi: v.doi, locked: v.locked }";
            result = g_db._query( qry, { repo: req.queryParams.repo, uid: owner_id });
        }

        res.send( result );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('subject', joi.string().optional(), "UID of subject user (optional)")
.queryParam('repo', joi.string().required(), "Repo ID")
.queryParam('offset', joi.number().optional(), "Offset")
.queryParam('count', joi.number().optional(), "Count")
.summary('List data records by allocation')
.description('List data records by allocation');


router.get('/search', function (req, res) {
    try {
        const client = g_lib.getUserFromClientID( req.queryParams.client );
        var params = {};

        if ( req.queryParams.use_client )
            params.client = client._id;

        if ( req.queryParams.use_shared_users ){
            params.users = g_lib.usersWithClientACLs( client._id, true );
        }

        if ( req.queryParams.use_shared_projects ){
            params.projs = g_lib.projectsWithClientACLs( client._id, true );
        }

        if ( req.queryParams.offset )
            params.offset = req.queryParams.offset;
        else
            params.offset = 0;

        if ( req.queryParams.count ){
            params.count = Math.min(req.queryParams.count,1000-params.offset);
        }else{
            params.count = Math.min(50,1000-params.offset);
        }

        //console.log("params:",params);

        var results = g_db._query( req.queryParams.query, params ).toArray();

        //console.log("results:",results.length);

        res.send( results );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('query', joi.string().required(), "Query")
.queryParam('use_client', joi.bool().required(), "Query uses client param")
.queryParam('use_shared_users', joi.bool().required(), "Query uses shared users param")
.queryParam('use_shared_projects', joi.bool().required(), "Query uses shared projects param")
.queryParam('offset', joi.number().integer().min(0).max(999).optional(), "Offset")
.queryParam('count', joi.number().integer().min(1).max(1000).optional(), "Count")
.summary('Find all data records that match query')
.description('Find all data records that match query');


router.get('/get/preproc', function (req, res) {
    try {
        g_db._executeTransaction({
            collections: {
                read: ["u","uuid","accn","d","c","item"],
            },
            action: function() {
                //console.log("/dat/get/preproc client", req.queryParams.client);
                const client = g_lib.getUserFromClientID( req.queryParams.client );
                var ids = [];
                for ( var i in req.queryParams.ids ){
                    //console.log("id ini: ",req.queryParams.ids[i]);
                    var id = g_lib.resolveID( req.queryParams.ids[i], client );
                    //console.log("id: ",id);
                    ids.push( id );
                }

                var result = g_proc.preprocessItems( client, null, ids, g_lib.TT_DATA_GET );

                res.send(result);
            }
        });

    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('ids', joi.array().items(joi.string()).required(), "Array of data/collection IDs or aliases")
.summary('Data get preprocessing')
.description('Data get preprocessing (check permission, data size, lock, deduplicate)');



router.post('/get', function (req, res) {
    try {
        g_db._executeTransaction({
            collections: {
                read: ["uuid","accn","d","c","item"],
                write: ["u"],
                exclusive: ["task","lock","block"]
            },
            action: function() {
                const client = g_lib.getUserFromClientID( req.queryParams.client );
                var id, res_ids = [];

                for ( var i in req.body.ids ){
                    id = g_lib.resolveDataCollID( req.body.ids[i], client );
                    res_ids.push( id );
                }

                var result = g_proc.dataGet( client, req.body.path, req.body.encrypt, res_ids );

                // Save remote path to recent ep list
                if ( client.eps && client.eps.length ){
                    var idx = client.eps.indexOf( req.body.path );
                    if ( idx == -1 ){
                        if ( client.eps.unshift( req.body.path ) > 20 ){
                            client.eps.length = 20;
                        }
                    }else{
                        client.eps.splice( idx, 1 );
                        client.eps.unshift( req.body.path );
                    }
                }else{
                    client.eps = [req.body.path];
                }

                g_db._update( client._id, {eps:client.eps}, { keepNull: false });

                res.send(result);
            }
        });

    } catch( e ){
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.body(joi.object({
    ids: joi.array().items(joi.string()).required(),
    path: joi.string().required(),
    encrypt: joi.number().required()
}).required(), 'Parameters')
.summary('Get (download) data to Globus destination path')
.description('Get (download) data to Globus destination path. IDs may be data/collection IDs or aliases.');


router.post('/put', function (req, res) {
    try {
        g_db._executeTransaction({
            collections: {
                read: ["uuid","accn","d","c","item"],
                write: ["u"],
                exclusive: ["task","lock","block"]
            },
            action: function() {
                const client = g_lib.getUserFromClientID( req.queryParams.client );
                var res_ids = [];

                if ( req.body.ids.length > 1 )
                    throw [g_lib.ERR_INVALID_PARAM,"Concurrent put of multiple records no supported."];

                for ( var i in req.body.ids ){
                    res_ids.push( g_lib.resolveDataID( req.body.ids[i], client ));
                }

                var result = g_proc.dataPut( client, req.body.path, req.body.encrypt, req.body.ext, res_ids );

                // Save remote path to recent ep list
                var path, idx = req.body.path.lastIndexOf("/");
                if ( idx > 0 )
                    path = req.body.path.substr(0,idx);
                else
                    path = req.body.path;

                if ( client.eps && client.eps.length ){
                    idx = client.eps.indexOf( path );
                    if ( idx == -1 ){
                        if ( client.eps.unshift( path ) > 20 ){
                            client.eps.length = 20;
                        }
                    }else{
                        client.eps.splice( idx, 1 );
                        client.eps.unshift( path );
                    }
                }else{
                    client.eps = [path];
                }

                g_db._update( client._id, {eps:client.eps}, { keepNull: false });

                res.send(result);
            }
        });

    } catch( e ){
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.body(joi.object({
    ids: joi.array().items(joi.string()).required(),
    path: joi.string().required(),
    encrypt: joi.number().required(),
    ext: joi.string().optional()
}).required(), 'Parameters')
.summary('Put (upload) raw data to record')
.description('Put (upload) raw data to record from Globus source path. ID must be a data ID or alias.');


router.post('/alloc_chg', function (req, res) {
    try {
        g_db._executeTransaction({
            collections: {
                read: ["u","uuid","accn","d","c","item"],
                exclusive: ["task","lock","block"]
            },
            action: function() {
                const client = g_lib.getUserFromClientID( req.queryParams.client );
                var id, res_ids = [];

                for ( var i in req.body.ids ){
                    id = g_lib.resolveDataCollID( req.body.ids[i], client );
                    res_ids.push( id );
                }

                var result = g_proc.taskInitRecAllocChg( client, req.body.proj_id, res_ids, req.body.repo_id, req.body.check );

                res.send(result);
            }
        });

    } catch( e ){
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.body(joi.object({
    ids: joi.array().items(joi.string()).required(),
    proj_id: joi.string().optional(),
    repo_id: joi.string().required(),
    check: joi.boolean().optional()
}).required(), 'Parameters')
.summary('Move raw data to a new allocation')
.description('Move data to a new allocation. IDs may be data/collection IDs or aliases.');


router.post('/owner_chg', function (req, res) {
    try {
        g_db._executeTransaction({
            collections: {
                read: ["u","uuid","accn","d","c","item"],
                exclusive: ["task","lock","block"]
            },
            action: function() {
                const client = g_lib.getUserFromClientID( req.queryParams.client );
                var id, res_ids = [];

                for ( var i in req.body.ids ){
                    id = g_lib.resolveDataCollID( req.body.ids[i], client );
                    res_ids.push( id );
                }
                var coll_id = g_lib.resolveDataCollID( req.body.coll_id, client );
                var result = g_proc.dataOwnerChange( client, req.body.proj_id, res_ids, coll_id, req.body.repo_id );

                res.send(result);
            }
        });

    } catch( e ){
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.body(joi.object({
    ids: joi.array().items(joi.string()).required(),
    coll_id: joi.string().required(),
    repo_id: joi.string().optional(),
    proj_id: joi.string().optional(),
    check: joi.boolean().optional()
}).required(), 'Parameters')
.summary('Move data records and raw data to a new owner/allocation')
.description('Move data records and raw data to a new owner/allocation. IDs may be data/collection IDs or aliases.');


router.post('/delete', function (req, res) {
    try {
        g_db._executeTransaction({
            collections: {
                read: ["u","uuid","accn"],
                write: ["d","c","a","alias","owner","item","acl","loc","alloc","p","t","top","dep"],
                exclusive: ["lock","task","block"],
            },
            action: function() {
                const client = g_lib.getUserFromClientID( req.queryParams.client );
                var i, id, res_ids = [];

                for ( i in req.body.ids ){
                    id = g_lib.resolveDataCollID( req.body.ids[i], client );
                    res_ids.push( id );
                }

                // Deletes records w/ no raw data, returns those with for delete task
                var result = g_proc.dataCollDelete( client, res_ids );

                res.send(result);
            }
        });

    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.body(joi.object({
    ids: joi.array().items(joi.string()).required(),
}).required(), 'Parameters')
.summary('Delete collections, data records and raw data')
.description('Delete collections, data records and associated raw data. IDs may be data IDs or aliases.');


router.post('/trash/delete', function (req, res) {
    try {
        g_db._executeTransaction({
            collections: {
                read: ["u","uuid","accn","d"],
                write: ["d","c","a","alias","owner","item","acl","loc","alloc","p","t","top","dep"],
                exclusive: ["lock"]
            },
            action: function() {
                //const client = g_lib.getUserFromClientID( req.queryParams.client );
                var id, data, alloc_adj = {};

                // NOTE: This operation must be idempotent - it's OK if records have
                // already been deleted; however, it is an error if they are not
                // marked for deletion.

                for ( var i in req.body.ids ){
                    id = req.body.ids[i];
                    if ( g_db.d.exists( id )){
                        data = g_db.d.document( id );

                        if ( !data.deleted )
                            throw [g_lib.ERR_INVALID_PARAM,"Record ID: '" + id + "' not marked for deletion."];

                        g_proc.deleteTrashedRecord( data, alloc_adj );
                    }
                }

                g_proc.updateAllocations( alloc_adj );
            }
        });

    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().optional(), "Client ID")
.body(joi.object({
    ids: joi.array().items(joi.string()).required(),
}).required(), 'Parameters')
.summary('Delete trashed data records')
.description('Delete trashed data records after raw data has been deleted.');


