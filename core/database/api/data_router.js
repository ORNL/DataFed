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

                //console.log("check admin perm on parent coll: ",parent_id);
                if ( !g_lib.hasPermissions( client, parent_coll, g_lib.PERM_CREATE )){
                    //console.log("NO admin perm on parent coll: ",parent_id);
                    throw g_lib.ERR_PERM_DENIED;
                }
            }
        }
    }else{
        //console.log("no body?");
        parent_id = g_lib.getRootID(client._id);
        owner_id = client._id;
    }

    var alloc_parent = null;

    if ( owner_id != client._id ){
        //console.log( "not owner" );
        if ( record.repo ) {
            // If a repo is specified, must be a real allocation - verify it as usual
            //console.log( "repo specified" );
            //repo_alloc = g_db.alloc.firstExample({ _from: owner_id, _to: record.repo });
            repo_alloc = g_lib.verifyRepo( owner_id, record.repo );
        } else {
            // If a repo is not specified, must check for project sub-allocation
            //console.log( "repo not specified" );

            if ( owner_id[0] == 'p' ){
                // For projects, use sub-allocation if defined, otherwise auto-assign from project owner
                //console.log( "owner is a project" );
                var proj = g_db.p.document( owner_id );
                if ( proj.sub_repo ){
                    //console.log( "project has sub allocation" );
                    // Make sure soft capacity hasn't been exceeded
                    if ( proj.sub_usage > proj.sub_alloc )
                        throw [g_lib.ERR_ALLOCATION_EXCEEDED,"Allocation exceeded (max: "+proj.sub_alloc+")"];

                    // TODO Handle multiple project owners?
                    var proj_owner_id = g_db.owner.firstExample({_from:proj._id})._to;
                    repo_alloc = g_lib.verifyRepo( proj_owner_id, proj.sub_repo );
                    alloc_parent = repo_alloc._id;
                }
            }

            if ( !repo_alloc ){
                // Try to auto-assign an available allocation
                repo_alloc = g_lib.assignRepo( owner_id );
            }
        }
    }else{
        // Storage location uses client allocation(s)
        if ( record.repo ) {
            repo_alloc = g_lib.verifyRepo( client._id, record.repo );
        } else {
            repo_alloc = g_lib.assignRepo( client._id );
        }
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

    //console.log("Save data");

    var data = g_db.d.save( obj, { returnNew: true });
    //console.log("Save owner");
    g_db.owner.save({ _from: data.new._id, _to: owner_id });

    //console.log("Save loc", repo_alloc );
    //var loc = { _from: data.new._id, _to: repo_alloc._to, path: repo_alloc.path + data.new._key, uid: owner_id };
    var loc = { _from: data.new._id, _to: repo_alloc._to, uid: owner_id };
    if ( alloc_parent )
        loc.parent = alloc_parent;
    g_db.loc.save(loc);

    if ( obj.alias ) {
        var alias_key = owner_id[0] + ":" + owner_id.substr(2) + ":" + obj.alias;

        if ( g_db.a.exists({ _key: alias_key }))
            throw [g_lib.ERR_INVALID_PARAM,"Alias, "+obj.alias+", already in use"];

        g_db.a.save({ _key: alias_key });
        g_db.alias.save({ _from: data.new._id, _to: "a/" + alias_key });
        g_db.owner.save({ _from: "a/" + alias_key, _to: owner_id });
    }

    if ( record.deps != undefined ){
        var dep,id,dep_data;
        data.new.deps = [];

        for ( var i in record.deps ) {
            dep = record.deps[i];
            id = g_lib.resolveDataID( dep.id, client );
            dep_data = g_db.d.document( id );
            if ( g_db.dep.firstExample({_from:data._id,_to:id}) )
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
                read: ["u","uuid","accn","repo","alloc"],
                write: ["d","a","loc","owner","alias","item","dep"]
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
                read: ["u","uuid","accn","repo","alloc"],
                write: ["d","a","loc","owner","alias","item","dep"]
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

function recordUpdate( client, record, results, alloc_sz, locations ){
    var data_id = g_lib.resolveDataID( record.id, client );
    var owner_id = g_db.owner.firstExample({ _from: data_id })._to;
    var data = g_db.d.document( data_id );

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

    var has_data = true;

    if ( data.doi ){
        // Data was previously published, check for invalid updates
        if ( obj.doi === null || obj.data_url === null ){
            if ( obj.doi || obj.data_url )
                throw [g_lib.ERR_INVALID_PARAM,"DOI number and Data URL must both be set or cleared together."];
        }else{
            has_data = false;
        }
    }else if ( obj.doi || obj.data_url ){
        has_data = false;

        if ( !obj.doi || !obj.data_url )
            throw [g_lib.ERR_INVALID_PARAM,"DOI number and Data URL must specified together."];

        if ( data.size ){
            // Data is being published, delete existing managed raw data
            g_lib.deleteRawData( data, alloc_sz, locations );
            obj.size = 0;
        }
        obj.source = null;
        obj.ext = null;
    }

    if ( has_data ){
        if ( record.ext_auto !== undefined ){
            //console.log("auto ext set:",record.ext_auto);
            obj.ext_auto = record.ext_auto;
        }

        if ( obj.ext_auto == true || ( obj.ext_auto == undefined && data.ext_auto == true )){
            //console.log("auto ext ON, calc ext");
            if ( obj.source !== undefined || data.source !== undefined ){
                // Changed - update auto extension
                var src = obj.source || data.source;
                if ( src ){
                    //console.log("src defined");
                    // Skip possible "." in end-point name
                    var pos = src.lastIndexOf("/");
                    pos = src.indexOf(".",pos>0?pos:0);
                    if ( pos != -1 ){
                        obj.ext = src.substr( pos );
                        //console.log("new auto ext",obj.ext);
                    }else{
                        obj.ext = null;
                        //console.log("new auto ext = NONE");
                    }
                }
            }
        }else{
            g_lib.procInputParam( record, "ext", true, obj );
            if ( obj.ext && obj.ext.charAt(0) != "." )
                obj.ext = "." + obj.ext;
        }

        if ( record.size !== undefined ) {
            console.log("new data syze:",record.size,typeof record.size);

            obj.size = record.size;

            data = g_db.d.document( data_id );
            if ( obj.size != data.size ){
                var loc = g_db.loc.firstExample({ _from: data_id });
                if ( loc ){
                    //console.log("owner:",owner_id,"repo:",loc._to);
                    var alloc, usage;
                    if ( loc.parent ){
                        alloc = g_db.alloc.document( loc.parent );
                        // Update project sub allocation
                        var proj = g_db.p.document( owner_id );
                        usage = Math.max(0,proj.sub_usage - data.size + obj.size);
                        g_db._update( proj._id, {sub_usage:usage});
                    }else{
                        alloc = g_db.alloc.firstExample({ _from: owner_id, _to: loc._to });
                    }

                    // Update primary/parent allocation
                    usage = Math.max(0,alloc.tot_size - data.size + obj.size);
                    g_db._update( alloc._id, {tot_size:usage});
                }
            }
        }
    }

    if ( record.dt != undefined )
        obj.dt = record.dt;
    //console.log("new ext:",obj.ext,",auto:",obj.ext_auto);
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
        var result = [];

        g_db._executeTransaction({
            collections: {
                read: ["u","uuid","accn","loc"],
                write: ["d","a","p","owner","alias","alloc","dep"]
            },
            action: function() {
                const client = g_lib.getUserFromClientID( req.queryParams.client );
                var alloc_sz = {}, locations = {};

                recordUpdate( client, req.body, result, alloc_sz, locations );
                console.log("update allocs:",alloc_sz);
                g_lib.updateAllocations( alloc_sz );
                result.push({"deletions":locations});
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
        var result = [];

        g_db._executeTransaction({
            collections: {
                read: ["u","uuid","accn","loc"],
                write: ["d","a","p","owner","alias","alloc","dep"]
            },
            action: function() {
                const client = g_lib.getUserFromClientID( req.queryParams.client );
                var alloc_sz = {}, locations = {};

                for ( var i in req.body ){
                    recordUpdate( client, req.body[i], result, alloc_sz, locations );
                }

                g_lib.updateAllocations( alloc_sz );
                result.push({"deletions":locations});
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

router.get('/lock/toggle', function (req, res) {
    try {
        const client = g_lib.getUserFromClientID( req.queryParams.client );
        var data_id = g_lib.resolveDataID( req.queryParams.id, client );

        if ( !g_lib.hasAdminPermObject( client, data_id )) {
            throw g_lib.ERR_PERM_DENIED;
        }

        var data = g_db.d.document( data_id );
        var obj = {};
        if ( !data.locked )
            obj.locked = true;
        else
            obj.locked = false;

        data = g_db._update( data_id, obj, { returnNew: true });
        data = data.new;

        data.repo_id = g_db.loc.firstExample({ _from: data_id })._to;

        delete data._rev;
        delete data._key;
        data.id = data._id;
        delete data._id;

        res.send([data]);

    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().optional(), "Client ID")
.queryParam('id', joi.string().required(), "Data ID or alias")
.summary('Toggle data record lock')
.description('Toggle data record lock');

router.get('/loc', function (req, res) {
    try {
        // This is a system call - no need to check permissions
        const client = g_lib.getUserFromClientID( req.queryParams.client );
        var data_id,loc,result={};
        for ( var i in req.queryParams.ids ){
            data_id = g_lib.resolveDataID( req.queryParams.ids[i], client );
            loc = g_db.loc.firstExample({ _from: data_id });
            if ( result[loc._to] )
                result[loc._to].push({ id: data_id, path: g_lib.computeDataPath( loc )});
            else
                result[loc._to] = [{ id: data_id, path: g_lib.computeDataPath( loc )}];
        }

        res.send(result);
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().optional(), "Client ID")
.queryParam('ids', joi.array().items(joi.string()).required(), "Array of data IDs and/or aliases")
.summary('Get raw data repo location')
.description('Get raw data repo location');

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

router.get('/delete', function (req, res) {
    try {
        g_db._executeTransaction({
            collections: {
                read: ["u","uuid","accn","d"],
                write: ["d","a","owner","item","acl","alias","loc","lock","alloc","p","t","top","dep"]
            },
            action: function() {
                const client = g_lib.getUserFromClientID( req.queryParams.client );
                var data,data_id; //,owner_id;
                var alloc_sz = {}, locations = {};

                for ( var i in req.queryParams.ids ){
                    data_id = g_lib.resolveDataID( req.queryParams.ids[i], client );
                    data = g_db.d.document( data_id );

                    if ( !g_lib.hasAdminPermObject( client, data_id )){
                        if ( data.locked || !g_lib.hasPermissions( client, data, g_lib.PERM_DELETE ))
                            throw g_lib.ERR_PERM_DENIED;
                    }

                    //owner_id = g_db.owner.firstExample({ _from: data_id })._to;

                    g_lib.deleteData( data, alloc_sz, locations );
                }

                g_lib.updateAllocations( alloc_sz );
                res.send( locations );
            }
        });

    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('ids', joi.array().items(joi.string()).required(), "Array of data IDs or aliases")
.summary('Deletes an existing data record')
.description('Deletes an existing data record');

function dataGetPreproc( a_client, a_ids, a_res, a_vis ){
    var id, obj, list, locked;

    for ( var i in a_ids ){
        id = a_ids[i];
        //console.log("proc",id);

        if ( id.charAt(0) == 'c' ){
            if ( !g_lib.hasAdminPermObject( a_client, id )) {
                obj = g_db.c.document( id );
                if ( !g_lib.hasPermissions( a_client, obj, g_lib.PERM_LIST ))
                    throw g_lib.ERR_PERM_DENIED;
            }
            //console.log("read coll");

            list = g_db._query( "for v in 1..1 outbound @coll item return v._id", { coll: id }).toArray();
            dataGetPreproc( a_client, list, a_res, a_vis );
        }else{
            if ( a_vis.indexOf(id) == -1 ){
                //console.log("not visited");

                obj = g_db.d.document( id );
                if ( !g_lib.hasAdminPermObject( a_client, id )) {
                    if ( !g_lib.hasPermissions( a_client, obj, g_lib.PERM_RD_DATA ))
                        throw g_lib.ERR_PERM_DENIED;
                    locked = obj.locked;
                }else{
                    locked = false;
                }
                //console.log("store res");
                a_res.push({id:id,title:obj.title,locked:obj.locked,size:obj.size,url:obj.data_url});
                a_vis.push(id);
            }
        }
    }
}

router.get('/get/preproc', function (req, res) {
    try {
        g_db._executeTransaction({
            collections: {
                read: ["u","uuid","accn","d","c","item"],
            },
            action: function() {
                //console.log("/dat/get/preproc client", req.queryParams.client);
                const client = g_lib.getUserFromClientID( req.queryParams.client );
                var ids = [], result = [];
                for ( var i in req.queryParams.ids ){
                    //console.log("id ini: ",req.queryParams.ids[i]);
                    var id = g_lib.resolveID( req.queryParams.ids[i], client );
                    //console.log("id: ",id);
                    ids.push( id );
                }
                dataGetPreproc( client, ids, result, [] );

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
