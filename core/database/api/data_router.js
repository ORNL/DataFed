'use strict';

const   createRouter = require('@arangodb/foxx/router');
const   router = createRouter();
const   joi = require('joi');
const   g_db = require('@arangodb').db;
const   g_lib = require('./support');
const   g_proc = require('./process');
const   g_tasks = require('./tasks');

module.exports = router;

//==================== DATA API FUNCTIONS

function recordCreate( client, record, results ){
    var owner_id, parent_id, repo_alloc, alias_key;

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
    var obj = { size: 0, ct: time, ut: time, owner: owner_id, creator: client._id, loc_err: false, inh_err: false };

    g_lib.procInputParam( record, "title", false, obj );
    g_lib.procInputParam( record, "desc", false, obj );
    g_lib.procInputParam( record, "keyw", false, obj );
    g_lib.procInputParam( record, "alias", false, obj );
    g_lib.procInputParam( record, "doi", false, obj );
    g_lib.procInputParam( record, "data_url", false, obj );

    if ( record.md ){
        obj.md = record.md;
        if ( Array.isArray( obj.md ))
            throw [g_lib.ERR_INVALID_PARAM,"Metadata cannot be an array"];
    }

    if ( obj.doi || obj.data_url ){
        if ( !obj.doi || !obj.data_url )
            throw [g_lib.ERR_INVALID_PARAM,"DOI number and Data URL must specified together."];

        alias_key = (obj.doi.split("/").join("_"));
        console.log("alias:",alias_key);
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

        if ( obj.alias ) {
            alias_key = owner_id[0] + ":" + owner_id.substr(2) + ":" + obj.alias;
        }
    }

    var data = g_db.d.save( obj, { returnNew: true });
    g_db.owner.save({ _from: data.new._id, _to: owner_id });

    g_lib.makeTitleUnique( parent_id, data.new );

    // Create data location edge and update allocation and stats
    var loc = { _from: data.new._id, _to: repo_alloc._to, uid: owner_id };
    g_db.loc.save( loc );
    g_db.alloc.update( repo_alloc._id, { rec_count: repo_alloc.rec_count + 1 });

    if ( alias_key ) {
        if ( g_db.a.exists({ _key: alias_key }))
            throw [g_lib.ERR_INVALID_PARAM,"Alias, "+alias_key+", already in use"];

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

        // Recalc inh_err and update
        if ( g_lib.calcInhError( data.new._id )){
            data.new.inh_err = true;
            g_db.d.update( data.new._id, { inh_error: true });
        }
    }

    g_db.item.save({ _from: parent_id, _to: data.new._id });

    data.new.id = data.new._id;
    data.new.parent_id = parent_id;
    data.new.repo_id = repo_alloc._to;

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
    doi: joi.string().allow('').optional(),
    data_url: joi.string().allow('').optional(),
    parent: joi.string().allow('').optional(),
    repo: joi.string().allow('').optional(),
    md: joi.any().optional(),
    ext: joi.string().allow('').optional(),
    ext_auto: joi.boolean().optional(),
    deps: joi.array().items(joi.object({
        id: joi.string().required(),
        type: joi.number().integer().required()})).optional(),
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
        doi: joi.string().allow('').optional(),
        data_url: joi.string().allow('').optional(),
        parent: joi.string().allow('').optional(),
        repo: joi.string().allow('').optional(),
        md: joi.any().optional(),
        ext: joi.string().allow('').optional(),
        ext_auto: joi.boolean().optional(),
        deps: joi.array().items(joi.object({
            id: joi.string().required(),
            type: joi.number().integer().required()})).optional(),
        id: joi.string().allow('').optional(), // Ignored
        locked: joi.boolean().optional(), // Ignore
        size: joi.number().optional(), // Ignored
        source: joi.string().allow('').optional(), // Ignored
        owner: joi.string().allow('').optional(), // Ignored
        creator: joi.string().allow('').optional(), // Ignored
        dt: joi.number().optional(), // Ignored
        ut: joi.number().optional(), // Ignored
        ct: joi.number().optional() // Ignored
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

    var loc = g_db.loc.firstExample({ _from: data_id });
    var alloc = g_db.alloc.firstExample({ _from: owner_id, _to: loc._to });

    if ( record.size !== undefined ) {
        obj.size = record.size;

        if ( obj.size != data.size ){
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

    if ( obj.alias !== undefined ) {
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

    var i,dep,id,chk_err=false; //dep_data;

    if ( record.deps ){
        chk_err = true;
        g_db.dep.removeByExample({_from:data_id});
        for ( i in record.deps ) {
            dep = record.deps[i];

            id = g_lib.resolveDataID( dep.id, client );
            if ( !id.startsWith("d/"))
                throw [g_lib.ERR_INVALID_PARAM,"Dependencies can only be set on data records."];

            if ( g_db.dep.firstExample({_from:data._id,_to:id}) )
                throw [g_lib.ERR_INVALID_PARAM,"Only one dependency can be defined between any two data records."];

            g_db.dep.save({ _from: data_id, _to: id, type: dep.type });
        }

        g_lib.checkDependencies(data_id);
    }else{
        if ( record.deps_rem != undefined ){
            chk_err = true;

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
            chk_err = true;

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
    }

    if ( chk_err ){
        // Recalc inh_err and update
        chk_err = g_lib.calcInhError( data._id );
        if ( chk_err != data.inh_err ){
            // Inh err state has chnaged, update record
            var has_err = data.inh_err || data.loc_err;
            data.inh_err = chk_err;
            g_db.d.update( data._id, { inh_error: data.inh_err });

            // If combined inh & loc err state has changed, recalc inh_err for dependent records
            if ( has_err != ( data.inh_err || data.loc_err )){
                g_lib.recalcInhErrorDeps( data._id, !has_err );
            }
        }
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

    data.id = data._id;
    data.repo_id = alloc._to;

    delete data._rev;
    delete data._key;
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
    doi: joi.string().allow('').optional(),
    data_url: joi.string().allow('').optional(),
    md: joi.any().optional(),
    mdset: joi.boolean().optional().default(false),
    size: joi.number().optional(),
    source: joi.string().allow('').optional(),
    ext: joi.string().allow('').optional(),
    ext_auto: joi.boolean().optional(),
    dt: joi.number().optional(),
    deps: joi.array().items(joi.object({
        id: joi.string().required(),
        type: joi.number().integer().required()})).optional(),
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
                var rec;

                for ( var i in req.body ){
                    rec = req.body[i];

                    // Strip-out 'active' fields that should be ignored
                    delete rec.source;
                    delete rec.size;
                    delete rec.dt;

                    recordUpdate( client, rec, result.data );
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
        doi: joi.string().allow('').optional(),
        data_url: joi.string().allow('').optional(),
        md: joi.any().optional(),
        mdset: joi.boolean().optional().default(false),
        ext: joi.string().allow('').optional(),
        ext_auto: joi.boolean().optional(),
        deps: joi.array().items(joi.object({
            id: joi.string().required(),
            type: joi.number().integer().required()})).optional(),
        deps_add: joi.array().items(joi.object({
            id: joi.string().required(),
            type: joi.number().integer().required()})).optional(),
        deps_rem: joi.array().items(joi.object({
            id: joi.string().required(),
            type: joi.number().integer().required()})).optional(),
        dt: joi.number().optional(), // Ignore
        locked: joi.boolean().optional(), // Ignore
        size: joi.number().optional(), // Ignore
        source: joi.string().allow('').optional(), // Ignore
        owner: joi.string().allow('').optional(), // Ignored
        creator: joi.string().allow('').optional(), // Ignored
        ut: joi.number().optional(), // Ignored
        ct: joi.number().optional() // Ignored
    })
).required(), 'Array of records and field updates')
.summary('Update a batch of existing data record')
.description('Update a batch of existing data record from JSON body');


router.post('/update/size', function (req, res) {
    try {
        var result = [];

        g_db._executeTransaction({
            collections: {
                read: ["owner","loc"],
                write: ["d","alloc"]
            },
            action: function() {
                var owner_id, data, loc, alloc, rec, obj, t = Math.floor( Date.now()/1000 );

                for ( var i in req.body.records ){
                    rec = req.body.records[i];

                    data = g_db.d.document( rec.id );

                    if ( rec.size != data.size ){
                        owner_id = g_db.owner.firstExample({ _from: rec.id })._to;
                        loc = g_db.loc.firstExample({ _from: rec.id });
                        alloc = g_db.alloc.firstExample({ _from: owner_id, _to: loc._to });

                        obj = { ut: t, size: rec.size, dt: t };

                        g_db._update( alloc._id, { data_size: Math.max( 0, alloc.data_size - data.size + obj.size )});
                        g_db._update( rec.id, obj );
                    }
                }
            }
        });

        res.send( result );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().allow('').optional(), "Client ID")
.body(joi.object({
    records: joi.array().items(joi.object({
        id: joi.string().required(),
        size: joi.number().required()
    })).required()
}).required(), 'Record fields')
.summary('Update existing data record size')
.description('Update existing data record raw data size');


router.get('/view', function (req, res) {
    try {
        const client = g_lib.getUserFromClientID( req.queryParams.client );
        var data_id = g_lib.resolveDataID( req.queryParams.id, client );
        var data = g_db.d.document( data_id );
        var i,dep,rem_md = false, admin = g_lib.hasAdminPermObject( client, data_id );

        if ( !admin) {
            var perms = g_lib.getPermissions( client, data, g_lib.PERM_RD_REC | g_lib.PERM_RD_META );
            if ( data.locked || ( perms & ( g_lib.PERM_RD_REC | g_lib.PERM_RD_META )) == 0 )
                throw g_lib.ERR_PERM_DENIED;
            if (( perms & g_lib.PERM_RD_META ) == 0 )
                rem_md = true;
        }

        if ( admin )
            data.notes = g_db._query("for n in 1..1 outbound @data note filter n.state > 0 return distinct n.type",{data:data_id}).toArray();
        else
            data.notes = g_db._query("for n in 1..1 outbound @data note filter n.state == 2 || ( n.creator == @client && n.state == 1 ) return distinct n.type",{data:data_id,client:client._id}).toArray();

        data.deps = g_db._query("for v,e in 1..1 any @data dep let dir=e._from == @data?1:0 sort dir desc, e.type asc return {id:v._id,alias:v.alias,owner:v.owner,type:e.type,dir:dir}",{data:data_id}).toArray();
        for ( i in data.deps ){
            dep = data.deps[i];
            if ( dep.alias && client._id != dep.owner )
                dep.alias = dep.owner.charAt(0) + ":" + dep.owner.substr(2) + ":" + dep.alias;

            if ( g_lib.hasAdminPermObject( client, dep.id ) )
                dep.notes = g_db._query("for n in 1..1 outbound @data note filter n.state > 0 return distinct n.type",{data:dep.id}).toArray();
             else
                dep.notes = g_db._query("for n in 1..1 outbound @data note filter n.state == 2 || ( n.creator == @client && n.state == 1 ) return distinct n.type",{data:dep.id,client:client._id}).toArray();
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


router.get('/view/doi', function (req, res) {
    try {
        var data_id = g_lib.resolveDataID( "doi:" + req.queryParams.doi );
        var data = g_db.d.document( data_id );

        var i,dep,rem_md = false;

        data.deps = g_db._query("for v,e in 1..1 any @data dep let dir=e._from == @data?1:0 sort dir desc, e.type asc return {id:v._id,alias:v.alias,owner:v.owner,type:e.type,dir:dir}",{data:data_id}).toArray();
        for ( i in data.deps ){
            dep = data.deps[i];
            if ( dep.alias )
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
.queryParam('doi', joi.string().required(), "DOI number (without doi: prefix)")
.summary('Get data by DOI')
.description('Get data by DOI');

router.post('/export', function (req, res) {
    try {
        g_db._executeTransaction({
            collections: {
                read: ["uuid","accn","d","c","item"]
            },
            action: function() {
                const client = g_lib.getUserFromClientID( req.queryParams.client );
                var i, id, res_ids = [];

                for ( i in req.body.id ){
                    id = g_lib.resolveDataCollID( req.body.id[i], client );
                    res_ids.push( id );
                }

                var ctxt = g_proc.preprocessItems( client, null, res_ids, g_lib.TT_DATA_EXPORT );
                var data, ids = [], results = [];

                for ( i in ctxt.glob_data )
                    ids.push( ctxt.glob_data[i].id );
                for ( i in ctxt.http_data )
                    ids.push( ctxt.http_data[i].id );

                for ( i in ids ){
                    data = g_db.d.document( ids[i] );

                    data.deps = g_db._query("for v,e in 1..1 outbound @data dep return {id:v._id,type:e.type}",{data:data._id}).toArray();
           
                    delete data._rev;
                    delete data._key;
                    data.id = data._id;
                    delete data._id;
            
                    results.push( JSON.stringify( data ));
                }

                res.send(results);
            }
        });

    } catch( e ){
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.body(joi.object({
    id: joi.array().items(joi.string()).required()
}).required(), 'Parameters')
.summary('Export record metadata')
.description('Export record metadata');


router.get('/dep/get', function (req, res) {
    const client = g_lib.getUserFromClientID( req.queryParams.client );
    var data_id = g_lib.resolveDataID( req.queryParams.id, client );
    var dep,result = {id:data_id,title:""};

    result.deps = g_db._query("for v,e in 1..1 any @data dep let dir=e._from == @data?1:0 sort dir desc, e.type asc return {id:v._id,alias:v.alias,owner:v.owner,type:e.type,dir:dir}",{data:data_id}).toArray();

    for ( var i in result.deps ){
        dep = result.deps[i];
        if ( dep.alias && client._id != dep.owner )
            dep.alias = dep.owner.charAt(0) + ":" + dep.owner.substr(2) + ":" + dep.alias;

        if ( g_lib.hasAdminPermObject( client, dep.id ) )
            dep.notes = g_db._query("for n in 1..1 outbound @data note filter n.state > 0 return distinct n.type",{data:dep.id}).toArray();
        else
            dep.notes = g_db._query("for n in 1..1 outbound @data note filter n.state == 2 || ( n.creator == @client && n.state == 1 ) return distinct n.type",{data:dep.id,client:client._id}).toArray();
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

                if ( rec.alias && client._id != rec.owner ){
                    rec.alias = rec.owner.charAt(0) + ":" + rec.owner.substr(2) + ":" + rec.alias;
                }
                
                if ( g_lib.hasAdminPermObject( client, rec._id ))
                    rec.notes = g_db._query("for n in 1..1 outbound @data note filter n.state > 0 return distinct n.type",{data:rec._id}).toArray();
                else
                    rec.notes = g_db._query("for n in 1..1 outbound @data note filter n.state == 2 || ( n.creator == @client && n.state == 1 ) return distinct n.type",{data:rec._id,client:client._id}).toArray();

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
                    result.push({id:rec._id,title:rec.title,alias:rec.alias,owner:rec.owner,creator:rec.creator,doi:rec.doi,size:rec.size,notes:rec.notes,locked:rec.locked,gen:gen,deps:deps});
                }else{
                    result.push({id:rec._id,title:rec.title,alias:rec.alias,owner:rec.owner,creator:rec.creator,doi:rec.doi,size:rec.size,notes:rec.notes,locked:rec.locked});
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
                deps = g_db._query("for v,e in 1..1 inbound @data dep return {id:v._id,alias:v.alias,title:v.title,owner:v.owner,creator:v.creator,doi:v.doi,size:v.size,locked:v.locked,type:e.type}",{data:entry[0]}).toArray();

                if ( entry[1] ){
                    for ( j in deps ){
                        dep = deps[j]; 

                        //console.log("dep:",dep.id,"ty:",dep.type);

                        if ( visited.indexOf(dep.id) < 0 ){
                            //console.log("follow");
                            node = {id:dep.id,title:dep.title,alias:dep.alias,owner:dep.owner,creator:dep.creator,doi:dep.doi,size:dep.size,locked:dep.locked,deps:[{id:entry[0],type:dep.type,dir:0}]};
                            if ( node.alias && client._id != node.owner )
                                node.alias = node.owner.charAt(0) + ":" + node.owner.substr(2) + ":" + node.alias;

                            if ( g_lib.hasAdminPermObject( client, node.id ))
                                node.notes = g_db._query("for n in 1..1 outbound @data note filter n.state > 0 return distinct n.type",{data:node.id}).toArray();
                            else
                                node.notes = g_db._query("for n in 1..1 outbound @data note filter n.state == 2 || ( n.creator == @client && n.state == 1 ) return distinct n.type",{data:node.id,client:client._id}).toArray();
            
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
            qry += " return { id: v._id, title: v.title, alias: v.alias, doi: v.doi, owner: v.owner, creator: v.creator, size: v.size, inh_err: v.inh_err, locked: v.locked }";
            result = g_db._query( qry, { repo: req.queryParams.repo, uid: owner_id },{},{fullCount:true});
            var tot = result.getExtra().stats.fullCount;
            result = result.toArray();
            result.push({paging:{off:req.queryParams.offset,cnt:req.queryParams.count,tot:tot}});
        }
        else{
            qry += " return { id: v._id, title: v.title, alias: v.alias, doi: v.doi, owner: v.owner, creator: v.creator, size: v.size, inh_err: v.inh_err, locked: v.locked }";
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

                if ( !req.body.check && !req.body.path )
                    throw [ g_lib.ERR_INVALID_PARAM, "Must provide path parameter if not running check." ];

                for ( var i in req.body.id ){
                    id = g_lib.resolveDataCollID( req.body.id[i], client );
                    res_ids.push( id );
                }

                var result = g_tasks.taskInitDataGet( client, req.body.path, req.body.encrypt, res_ids, req.body.orig_fname, req.body.check );

                if ( !req.body.check )
                    g_lib.saveRecentGlobusPath( client, req.body.path, g_lib.TT_DATA_GET );

                res.send(result);
            }
        });

    } catch( e ){
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.body(joi.object({
    id: joi.array().items(joi.string()).required(),
    path: joi.string().optional(),
    encrypt: joi.number().optional(),
    orig_fname: joi.boolean().optional(),
    check: joi.boolean().optional()
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

                if ( !req.body.check && !req.body.path )
                    throw [ g_lib.ERR_INVALID_PARAM, "Must provide path parameter if not running check." ];

                if ( req.body.id.length > 1 )
                    throw [g_lib.ERR_INVALID_PARAM,"Concurrent put of multiple records no supported."];

                for ( var i in req.body.id ){
                    res_ids.push( g_lib.resolveDataID( req.body.id[i], client ));
                }

                var result = g_tasks.taskInitDataPut( client, req.body.path, req.body.encrypt, req.body.ext, res_ids, req.body.check );

                if ( !req.body.check )
                    g_lib.saveRecentGlobusPath( client, req.body.path, g_lib.TT_DATA_PUT );

                res.send(result);
            }
        });

    } catch( e ){
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.body(joi.object({
    id: joi.array().items(joi.string()).required(),
    path: joi.string().optional(),
    encrypt: joi.number().optional(),
    ext: joi.string().optional(),
    check: joi.boolean().optional()
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

                var result = g_tasks.taskInitRecAllocChg( client, req.body.proj_id, res_ids, req.body.repo_id, req.body.check );

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
                read: ["u","uuid","accn","d","c","item","admin"],
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
                var result = g_tasks.taskInitRecOwnerChg( client, res_ids, coll_id, req.body.repo_id, req.body.check );

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
    check: joi.boolean().optional()
}).required(), 'Parameters')
.summary('Move data records and raw data to a new owner/allocation')
.description('Move data records and raw data to a new owner/allocation. IDs may be data/collection IDs or aliases.');


router.post('/delete', function (req, res) {
    try {
        g_db._executeTransaction({
            collections: {
                read: ["u","uuid","accn"],
                write: ["d","c","a","alias","owner","item","acl","loc","alloc","p","t","top","dep","n","note"],
                exclusive: ["lock","task","block"],
            },
            action: function() {
                const client = g_lib.getUserFromClientID( req.queryParams.client );
                var i, id, ids = [];

                for ( i in req.body.ids ){
                    id = g_lib.resolveDataCollID( req.body.ids[i], client );
                    ids.push( id );
                }

                var result = g_tasks.taskInitRecCollDelete( client, ids );

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


