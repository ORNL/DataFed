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
        console.log( "create data" );

        g_db._executeTransaction({
            collections: {
                read: ["u","uuid","accn","repo","alloc"],
                write: ["d","a","loc","owner","alias","item","t","top","dep"]
            },
            action: function() {
                const client = g_lib.getUserFromClientID( req.queryParams.client );
                var owner_id;
                var parent_id;
                var repo_alloc;

                //console.log("Create new data");

                if ( req.body.parent ) {
                    parent_id = g_lib.resolveID( req.body.parent, client );
                    //console.log("parent: ", parent_id);

                    if ( parent_id[0] != "c" )
                        throw [g_lib.ERR_INVALID_PARAM,"Invalid parent collection, " + parent_id];

                    if ( !g_db._exists( parent_id ))
                        throw [g_lib.ERR_INVALID_PARAM,"Parent collection, "+parent_id+", not found"];

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
                    if ( req.body.repo ) {
                        // If a repo is specified, must be a real allocation - verify it as usual
                        //console.log( "repo specified" );
                        //repo_alloc = g_db.alloc.firstExample({ _from: owner_id, _to: req.body.repo });
                        repo_alloc = g_lib.verifyRepo( owner_id, req.body.repo );
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
                                // Make sure hard capacity hasn't been exceeded
                                if ( repo_alloc.usage > repo_alloc.capacity )
                                    throw [g_lib.ERR_ALLOCATION_EXCEEDED,"Allocation exceeded (max: "+repo_alloc.capacity+")"];

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
                    if ( req.body.repo ) {
                        repo_alloc = g_lib.verifyRepo( client._id, req.body.repo );
                    } else {
                        repo_alloc = g_lib.assignRepo( client._id );
                    }
                }

                if ( !repo_alloc )
                    throw [g_lib.ERR_NO_ALLOCATION,"No allocation available"];

                var time = Math.floor( Date.now()/1000 );
                var obj = { size: 0, ct: time, ut: time, owner: owner_id };

                g_lib.procInputParam( req.body, "title", false, obj );
                g_lib.procInputParam( req.body, "desc", false, obj );
                g_lib.procInputParam( req.body, "keyw", false, obj );
                g_lib.procInputParam( req.body, "alias", false, obj );
                g_lib.procInputParam( req.body, "topic", false, obj );

                if ( req.body.public )
                    obj.public = req.body.public;

                if ( req.body.md ){
                    obj.md = req.body.md; //JSON.parse( req.body.md );
                    if ( Array.isArray( obj.md ))
                        throw [g_lib.ERR_INVALID_PARAM,"Metadata cannot be an array"];

                    //console.log( "parsed:", obj.md );
                }

                //console.log("Save data");

                var data = g_db.d.save( obj, { returnNew: true });
                //console.log("Save owner");
                g_db.owner.save({ _from: data.new._id, _to: owner_id });

                //console.log("Save loc", repo_alloc );
                var loc = { _from: data.new._id, _to: repo_alloc._to, path: repo_alloc.path + data.new._key, uid: owner_id };
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

                if ( obj.topic ){
                    g_lib.topicLink( obj.topic, data._id );
                }

                if ( req.body.deps != undefined ){
                    var dep,id,dep_data;
                    data.new.deps = [];

                    for ( var i in req.body.deps ) {
                        dep = req.body.deps[i];
                        id = g_lib.resolveID( dep.id, client );
                        if ( !id.startsWith("d/"))
                            throw [g_lib.ERR_INVALID_PARAM,"Dependencies can only be set on data records."];
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

                result.push( data.new );
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
    topic: joi.string().allow('').optional(),
    alias: joi.string().allow('').optional(),
    public: joi.boolean().optional(),
    parent: joi.string().allow('').optional(),
    repo: joi.string().allow('').optional(),
    md: joi.any().optional(),
    deps: joi.array().items(joi.object({
        id: joi.string().required(),
        type: joi.number().integer().required()})).optional()
}).required(), 'Record fields')
.summary('Create a new data record')
.description('Create a new data record from JSON body');

router.post('/update', function (req, res) {
    try {
        var result = [];

        g_db._executeTransaction({
            collections: {
                read: ["u","uuid","accn","loc"],
                write: ["d","a","p","owner","alias","alloc","t","top","dep"]
            },
            action: function() {
                const client = g_lib.getUserFromClientID( req.queryParams.client );
                var data_id = g_lib.resolveID( req.body.id, client );
                var owner_id = g_db.owner.firstExample({ _from: data_id })._to;
                var data = g_db.d.document( data_id );

                if ( !g_lib.hasAdminPermObject( client, data_id )) {
                    // Required permissions depend on which fields are being modified:
                    // Metadata = PERM_WR_META, file_size = PERM_WR_DATA, all else = ADMIN
                    var perms = 0;
                    if ( req.body.md )
                        perms |= g_lib.PERM_WR_META;

                    if ( req.body.size || req.body.dt )
                        perms |= g_lib.PERM_WR_DATA;

                    if ( req.body.title || req.body.alias  || req.body.desc || req.body.public )
                        perms |= g_lib.PERM_WR_REC;

                    if ( data.locked || !g_lib.hasPermissions( client, data, perms ))
                        throw g_lib.ERR_PERM_DENIED;
                }

                var obj = { ut: Math.floor( Date.now()/1000 ) };

                g_lib.procInputParam( req.body, "title", true, obj );
                g_lib.procInputParam( req.body, "desc", true, obj );
                g_lib.procInputParam( req.body, "keyw", true, obj );
                g_lib.procInputParam( req.body, "alias", true, obj );
                g_lib.procInputParam( req.body, "topic", true, obj );

                //console.log("topic, old:", data.topic ,",new:", obj.topic );
                //console.log("new !== undefined", obj.topic !== undefined );

                if ( obj.topic !== undefined && obj.topic != data.topic ){
                    //console.log("update topic, old:", data.topic ,",new:", obj.topic );

                    if ( data.topic ){
                        //console.log("unlink old topic");
                        g_lib.topicUnlink( data._id );
                    }

                    if ( obj.topic && obj.topic.length ){
                        //console.log("link new topic");
                        g_lib.topicLink( obj.topic, data._id );
                    }
                }

                if ( req.body.public !== undefined )
                    obj.public = req.body.public;

                if ( req.body.md === "" )
                    obj.md = null;
                else if ( req.body.md ){
                    obj.md = req.body.md;
                    if ( Array.isArray( obj.md ))
                        throw [ g_lib.ERR_INVALID_PARAM, "Metadata cannot be an array" ];
                }

                if ( req.body.size !== undefined ) {
                    obj.size = req.body.size;

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
                            usage = Math.max(0,alloc.usage - data.size + obj.size);
                            g_db._update( alloc._id, {usage:usage});
                        }
                    }
                }

                if ( req.body.dt != undefined )
                    obj.dt = req.body.dt;

                data = g_db._update( data_id, obj, { keepNull: false, returnNew: true, mergeObjects: req.body.mdset?false:true });
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

                if ( req.body.deps != undefined && ( req.body.deps_add != undefined || req.body.deps_rem != undefined ))
                    throw [g_lib.ERR_INVALID_PARAM,"Cannot use both dependency set and add/remove."];

                var i,dep,dep_data,id;

                if ( req.body.deps_clear ){
                    g_db.dep.removeByExample({_from:data_id});
                    data.deps = [];
                }

                var get_deps = false;
                if ( req.body.deps_rem != undefined ){
                    console.log("rem deps from ",data._id);
                    for ( i in req.body.deps_rem ) {
                        dep = req.body.deps_rem[i];
                        id = g_lib.resolveID( dep.id, client );
                        console.log("rem id:",id);
                        if ( !g_db.dep.firstExample({_from:data._id,_to:id}) )
                            throw [g_lib.ERR_INVALID_PARAM,"Specified dependency on "+id+" does not exist."];
                        console.log("done rem");
                        g_db.dep.removeByExample({_from:data._id,_to:id});
                    }
                    get_deps = true;
                }

                if ( req.body.deps_add != undefined ){
                    console.log("add deps");
                    for ( i in req.body.deps_add ) {
                        dep = req.body.deps_add[i];
                        id = g_lib.resolveID( dep.id, client );
                        if ( !id.startsWith("d/"))
                            throw [g_lib.ERR_INVALID_PARAM,"Dependencies can only be set on data records."];
                        dep_data = g_db.d.document( id );
                        if ( g_db.dep.firstExample({_from:data._id,_to:id}) )
                            throw [g_lib.ERR_INVALID_PARAM,"Only one dependency can be defined between any two data records."];

                        g_db.dep.save({ _from: data_id, _to: id, type: dep.type });
                    }

                    g_lib.checkDependencies(data_id);
                    get_deps = true;
                }

                if ( get_deps ){
                    console.log("get deps");
                    data.deps = g_db._query("for v,e in 1..1 any @data dep return {id:v._id,alias:v.alias,type:e.type,from:e._from}",{data:data_id}).toArray();
                    for ( i in data.deps ){
                        dep = data.deps[i];
                        if ( dep.from == data_id )
                            dep.dir = g_lib.DEP_OUT;
                        else
                            dep.dir = g_lib.DEP_IN;
                        delete dep.from;
                    }
                }

                delete data._rev;
                delete data._key;
                data.id = data._id;
                delete data._id;

                result.push( data );
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
    topic: joi.string().allow('').optional(),
    alias: joi.string().allow('').optional(),
    public: joi.boolean().optional(),
    md: joi.any().optional(),
    mdset: joi.boolean().optional().default(false),
    size: joi.number().optional(),
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


router.get('/view', function (req, res) {
    try {
        const client = g_lib.getUserFromClientID( req.queryParams.client );

        var data_id = g_lib.resolveID( req.queryParams.id, client );
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
    try {
        console.log("/dep/get");

        const client = g_lib.getUserFromClientID( req.queryParams.client );
        var data_id = g_lib.resolveID( req.queryParams.id, client );
        var i, j, rec, deps, dep, node, visited = [data_id], cur = [data_id], next = [], skip = [], result = [];

        // Get Ancestors
        var gen = 0;

        console.log("get ancestors");

        while ( cur.length ){
            console.log("gen",gen);

            for ( i in cur ) {
                rec = g_db.d.document( cur[i] );
                deps = g_db._query("for v,e in 1..1 outbound @data dep return {id:v._id,type:e.type,dir:1}",{data:cur[i]}).toArray();

                result.push({id:rec._id,title:rec.title,alias:rec.alias,owner:rec.owner,gen:gen,deps:deps});

                for ( j in deps ){
                    dep = deps[j]; 
                    console.log("dep:",dep.id,"ty:",dep.type);

                    if ( dep.type < 2 && visited.indexOf(dep.id) < 0 ){
                        console.log("follow");
                        visited.push(dep.id);
                        next.push(dep.id);
                    }else if ( skip.indexOf(dep.id) < 0 ){
                        console.log("skip");
                        skip.push(dep.id);
                    }
                }
            }

            cur = next;
            next = [];
            gen--;
        }

        var gen_min = gen;

        // Get Descendants

        console.log("get descendants");

        cur = [data_id];
        next = [];
        gen = 1;

        while ( cur.length ){
            console.log("gen",gen);

            for ( i in cur ) {
                //rec = g_db.d.document( cur[i] );
                deps = g_db._query("for v,e in 1..1 inbound @data dep return {id:v._id,alias:v.alias,title:v.title,owner:v.owner,type:e.type}",{data:cur[i]}).toArray();

                for ( j in deps ){
                    dep = deps[j]; 

                    console.log("dep:",dep.id,"ty:",dep.type);

                    if ( visited.indexOf(dep.id) < 0 ){
                        console.log("follow");
                        node = {id:dep.id,title:dep.title,alias:dep.alias,owner:dep.owner,deps:[{id:cur[i],type:dep.type,dir:0}]};
                        if ( dep.type<2 )
                            node.gen = gen;
                        result.push(node);
                        visited.push(dep.id);
                        if ( dep.type < 2 )
                            next.push(dep.id);
                    }else{
                        console.log("skip");
                    }
                }
            }
            gen += 1;
            cur = next;
            next = [];
        }

        console.log("proc skips");

        for ( i in skip ){
            if ( visited.indexOf( skip[i] ) < 0 )
                result.push({id:skip[i],title:"n/a"});
        }

        console.log("adjust gen:",gen_min);

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
        var data_id = g_lib.resolveID( req.queryParams.id, client );

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
        var data_id = g_lib.resolveID( req.queryParams.id, client );
        var repo = g_db.loc.firstExample({ _from: data_id });
        if ( !repo )
            throw g_lib.ERR_NO_RAW_DATA;

        res.send({ id: data_id, repo_id:repo._to, path:repo.path });
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().optional(), "Client ID")
.queryParam('id', joi.string().required(), "Data ID (not alias)")
.summary('Get raw data repo location')
.description('Get raw data repo location');

router.get('/path', function (req, res) {
    try {
        const client = g_lib.getUserFromClientID( req.queryParams.client );
        var data_id = g_lib.resolveID( req.queryParams.id, client );

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
            throw [g_lib.ERR_INVALID_PARAM,"Conflicting domain"];

        res.send({ path: repo.exp_path + loc.path.substr( repo.path.length ) });
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
            qry += " return { id: v._id, title: v.title, alias: v.alias, locked: v.locked }";
            result = g_db._query( qry, { repo: req.queryParams.repo, uid: owner_id },{},{fullCount:true});
            var tot = result.getExtra().stats.fullCount;
            result = result.toArray();
            result.push({paging:{off:req.queryParams.offset,cnt:req.queryParams.count,tot:tot}});
        }
        else{
            qry += " return { id: v._id, title: v.title, alias: v.alias, locked: v.locked }";
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
        
        res.send( g_db._query( req.queryParams.query, params ));
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('query', joi.string().required(), "Query")
.queryParam('use_client', joi.bool().required(), "Query uses client param")
.queryParam('use_shared_users', joi.bool().required(), "Query uses shared users param")
.queryParam('use_shared_projects', joi.bool().required(), "Query uses shared projects param")
.summary('Find all data records that match query in body')
.description('Find all data records that match query in body');

router.get('/delete', function (req, res) {
    try {
        g_db._executeTransaction({
            collections: {
                read: ["u","uuid","accn","d"],
                write: ["d","a","owner","item","acl","alias","loc","alloc","p","t","top"]
            },
            action: function() {
                const client = g_lib.getUserFromClientID( req.queryParams.client );

                var data_id = g_lib.resolveID( req.queryParams.id, client );
                var data = g_db.d.document( data_id );

                if ( !g_lib.hasAdminPermObject( client, data_id )){
                    if ( data.locked || !g_lib.hasPermissions( client, data, g_lib.PERM_DELETE ))
                        throw g_lib.ERR_PERM_DENIED;
                }

                var owner_id = g_db.owner.firstExample({ _from: data_id })._to;
                var allocs = {}, locations = [];

                g_lib.deleteData( data, allocs, locations );
                g_lib.updateAllocations( allocs, owner_id );

                res.send( locations[0] );
            }
        });

    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('id', joi.string().required(), "Data ID or alias")
.summary('Deletes an existing data record')
.description('Deletes an existing data record');
