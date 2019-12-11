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
const   g_lib = require('./support');

module.exports = router;


//==================== TASK API FUNCTIONS

router.get('/view', function (req, res) {
    try{
        if ( !g_db._exists( req.queryParams.task_id ))
            throw [g_lib.ERR_INVALID_PARAM,"Task " + req.queryParams.task_id + " does not exist."];

        var task = g_db.task.document( req.queryParams.task_id );
        var blocks = g_db.block.byExample({_from:req.queryParams.task_id});
        task.blocked_by = [];
        while ( blocks.hasNext() ){
            task.blocked_by.push( blocks.next()._to );
        }

        blocks = g_db.block.byExample({_to:req.queryParams.task_id});
        task.blocking = [];
        while ( blocks.hasNext() ){
            task.blocking.push( blocks.next()._from );
        }

        task.id = task._id;
        delete task._id;
        delete task._rev;
        delete task._key;

        res.send( [task] );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('task_id', joi.string().required(), "Task ID")
.summary('View an existing task record')
.description('View an existing task record.');


function createTask( a_client_id, a_type, a_state ){
    var time = Math.floor( Date.now()/1000 );
    var obj = { type: a_type, status: g_lib.TS_READY, msg: "Pending", ct: time, ut: time, progress: 0, user: a_client_id, state: a_state };

    return obj;
}

function computeDataPaths( a_client, a_mode, a_ids, a_src_repos, a_rem_path, a_res_ids ){
    var id, data, loc, file; //, perm;

    /*
    switch ( a_mode ){
        case g_lib.TT_DATA_GET:
            perm = g_lib.PERM_RD_DATA;
            break;
        case g_lib.TT_DATA_PUT:
            perm = g_lib.PERM_WR_DATA;
            break;
        case g_lib.TT_DATA_MOVE:
        case g_lib.TT_DATA_DEL:
            perm = g_lib.PERM_DELETE;
            break;
    }
    */

    for ( var i in a_ids ){
        //id = g_lib.resolveDataID( a_ids[i], a_client );
        id = a_ids[i];
        data = g_db.d.document( id );

        /*

        if ( data.data_url )
            throw [g_lib.ERR_NO_RAW_DATA,"Data record, "+a_ids[i]+", has external data"];

        if ( !data.size ){
            if ( a_mode == g_lib.TT_DATA_GET )
                throw [g_lib.ERR_NO_RAW_DATA,"Data record, "+a_ids[i]+", has no raw data"];

            // Ignore records without raw data for moves and deletes
            if ( a_mode != g_lib.TT_DATA_PUT )
                continue;
        }

        if ( !g_lib.hasAdminPermObject( a_client, id )) {
            if ( !g_lib.hasPermissions( a_client, data, perm ))
                throw g_lib.ERR_PERM_DENIED;
        }*/

        // Get data storage location
        loc = g_db._query("for v,e in 1..1 outbound @data loc return { repo: v, loc: e }", { data: id } );
        if ( !loc.hasNext() )
            throw [g_lib.ERR_INTERNAL_FAULT,"No storage location for data record, " + id];

        loc = loc.next();

        //console.log("repo:",repo_loc.repo._key);

        file = { id: id };

        if ( a_mode == g_lib.TT_DATA_PUT ){
            file.from = a_rem_path;
            file.to = g_lib.computeDataPath(loc.loc);
        }else if ( a_mode == g_lib.TT_DATA_GET ){
            file.from = g_lib.computeDataPath(loc.loc);
            file.to = id.substr( 2 ) + (data.ext?data.ext:"");
        }else{ // MOVE
            file.from = g_lib.computeDataPath(loc.loc);
            file.to = id.substr( 2 );
            if ( a_rem_path + file.to == file.from )
                throw [ERR_INVALID_PARAM, "Invalid destination allocation for record " + id ];
        }

        if ( loc.repo._key in a_src_repos ){
            a_src_repos[loc.repo._key].files.push(file);
        }else{
            a_src_repos[loc.repo._key] = {repo_id:loc.repo._key,repo_ep:loc.repo.endpoint,files:[file]};
        }

        a_res_ids.push( id );
    }
}

function processTaskDependencies( a_task_id, a_deps, a_mode ){
    var i, j, dep, lock, locks, block = new Set();
    for ( i in a_deps ){
        // ensure dependency exists
        dep = a_deps[i];
        if ( !g_db._exists( dep ))
            throw [g_lib.ERR_INVALID_PARAM,"Task dependency " + dep + " does not exist."];

        // Gather other tasks with priority over this new one
        locks = g_db.lock.byExample({_to: dep});
        while ( locks.hasNext() ){
            lock = locks.next();
            if ( a_write || lock.write ){
                block.add(lock._from);
            }
        }

        // Add new lock
        g_db.lock.save({ _from: a_task_id, _to: dep, write: a_write });
    }

    if ( block.size ){
        block.forEach( function(val){
            g_db.block.save({ _from: a_task_id, _to: val });
        });

        return true;
    }
    return false;
}

function createDataGetTask( a_client, a_ids, a_path, a_encrypt ){
    var state = { encrypt: a_encrypt, encrypted: false };

    var idx = a_path.indexOf("/");

    if ( idx == -1 )
        throw [g_lib.ERR_INVALID_PARAM,"Invalid destination path (must include endpoint)"];

    state.dst_ep = a_path.substr(0,idx);
    state.dst_path = a_path.substr(idx);

    if ( state.dst_path.charAt( state.dst_path.length - 1 ) != "/" )
        state.dst_path += "/";

    state.repos = {};
    state.repo_idx = 0;
    state.file_idx = 0;

    var res_ids = [];

    computeDataPaths( a_client, g_lib.TT_DATA_GET, a_ids, state.repos, null, res_ids );

    if ( res_ids.length == 0 )
        return;

    var obj = createTask( a_client._id, g_lib.TT_DATA_GET, state );
    var task = g_db.task.save( obj, { returnNew: true });

    if ( processTaskDependencies( task.new._id, res_ids, g_lib.TT_DATA_GET )){
        task = g_db._update( task.new._id, { status: g_lib.TS_BLOCKED, msg: "Queued" }, { returnNew: true });
    }

    return task.new;
}


function createDataPutTask( a_client, a_ids, a_path, a_encrypt, a_ext ){
    var state = { encrypt: a_encrypt, encrypted: false };

    if ( a_ext )
        state.ext = a_ext;

    var idx = a_path.indexOf("/");

    if ( idx == -1 )
        throw [g_lib.ERR_INVALID_PARAM,"Invalid destination path (must include endpoint)"];

    state.src_ep = a_path.substr(0,idx);
    state.src_path = a_path.substr(idx);

    state.repos = {};
    state.repo_idx = 0;
    state.file_idx = 0;

    var res_ids = [];

    computeDataPaths( a_client, g_lib.TT_DATA_PUT, a_ids, state.repos, state.src_path, res_ids );

    var obj = createTask( a_client._id, g_lib.TT_DATA_PUT, state );
    var task = g_db.task.save( obj, { returnNew: true });

    if ( processTaskDependencies( task.new._id, res_ids, g_lib.TT_DATA_PUT )){
        task = g_db._update( task.new._id, { status: g_lib.TS_BLOCKED, msg: "Queued" }, { returnNew: true });
    }

    return task.new;
}


function createDataMoveTask( a_client, a_ids, a_dst_repo_id, a_encrypt ){
    var state = { encrypt: a_encrypt, encrypted: false };

    var dst_repo = g_db.repo.document( a_dst_repo_id );
    state.dst_ep = dst_repo.endpoint;
    state.dst_path = g_lib.computeDataPathPrefix( a_dst_repo_id, a_client._id );

    state.repos = {};
    state.repo_idx = 0;
    state.file_idx = 0;

    var res_ids = [];

    computeDataPaths( a_client, g_lib.TT_DATA_MOVE, a_ids, state.repos, state.dst_path, res_ids );

    if ( res_ids.length == 0 )
        return;

    var obj = createTask( a_client._id, g_lib.TT_DATA_MOVE, state );
    var task = g_db.task.save( obj, { returnNew: true });

    if ( processTaskDependencies( task.new._id, res_ids, g_lib.TT_DATA_MOVE )){
        task = g_db._update( task.new._id, { status: g_lib.TS_BLOCKED, msg: "Queued" }, { returnNew: true });
    }

    return task.new;
}

function createDataDeleteTask( a_client, a_ids ){
    var id, state = {ids:[]};

    for ( var i in a_ids ){
        /*id = g_lib.resolveDataID( a_ids[i], a_client );
        if ( !g_lib.hasAdminPermObject( a_client, id )) {
            if ( !g_lib.hasPermissions( a_client, data, g_lib.PERM_DELETE ))
                throw g_lib.ERR_PERM_DENIED;
        }*/

        state.ids.push( id );
    }

    if ( state.ids.length == 0 )
        return;

    var obj = createTask( a_client._id, g_lib.TT_DATA_DEL, state );
    var task = g_db.task.save( obj, { returnNew: true });

    if ( processTaskDependencies( task.new._id, state.ids, g_lib.TT_DATA_DEL )){
        task = g_db._update( task.new._id, { status: g_lib.TS_BLOCKED, msg: "Queued" }, { returnNew: true });
    }

    return task.new;
}

/*
router.post('/create', function (req, res) {
    try {
        var result = [];
        g_db._executeTransaction({
            collections: {
                read: ["u","uuid","accn","d","c"],
                write: ["task","lock","block"]
            },
            action: function() {
                var client = g_lib.getUserFromClientID( req.queryParams.client );
                var task;

                switch ( req.body.type ){
                    case 0: task = createDataGetTask( req.body, client ); break;
                    case 1: task = createDataPutTask( req.body, client ); break;
                    case 2: task = createDataMoveTask( req.body, client ); break;
                    case 3: task = createDataDeleteTask( req.body, client ); break;
                }

                task.id = task._id;
                delete task._id;
                delete task._key;
                delete task._rev;

                result.push( task );
            }
        });

        res.send( result );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.body(joi.object({
    type: joi.number().integer().min(0).max(3).required(),
    state: joi.any().optional()
}).required(), 'Task details')
.summary('Create a new task record')
.description('Create a new task record from JSON body, type will affect how state info is interpreted');
*/


router.post('/create/data/get', function (req, res) {
    try {
        var result = {};
        g_db._executeTransaction({
            collections: {
                read: ["u","uuid","accn","d","c"],
                write: ["task","lock","block"]
            },
            action: function() {
                var client = g_lib.getUserFromClientID( req.queryParams.client );
                var task = createDataGetTask( client, req.body.ids, req.body.path, req.body.encrypt );

                if ( task ){
                    task.id = task._id;
                    delete task._id;
                    delete task._key;
                    delete task._rev;

                    result = task;
                }
            }
        });

        res.send( result );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.body(joi.object({
    ids: joi.array().items(joi.string()).required(),
    path: joi.string().required(),
    encrypt: joi.number().required()
}).required(), 'Task details')
.summary('Create a new data get task record')
.description('Create a new data get task record. Does not resolve data IDs nor check permissions.');

//.queryParam('ids', joi.array().items(joi.string()).required(), "Array of data record IDs or aliases")
//.queryParam('path', joi.string().required(), "Remote destination path including endpoint")
//.queryParam('encrypt', joi.number().required(), "Encrypt mode (0=none,1=try,2=force)")

router.post('/create/data/put', function (req, res) {
    try {
        var result = [];
        g_db._executeTransaction({
            collections: {
                read: ["u","uuid","accn","d","c"],
                write: ["task","lock","block"]
            },
            action: function() {
                var client = g_lib.getUserFromClientID( req.queryParams.client );
                var task = createDataPutTask( client, req.queryParams.ids, req.queryParams.path, req.queryParams.encrypt, req.queryParams.ext );

                task.id = task._id;
                delete task._id;
                delete task._key;
                delete task._rev;

                result.push( task );
            }
        });

        res.send( result );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('ids', joi.array().items(joi.string()).required(), "Array of data record IDs or aliases")
.queryParam('path', joi.string().required(), "Remote source path including endpoint")
.queryParam('encrypt', joi.number().required(), "Encrypt mode (0=none,1=try,2=force)")
.queryParam('ext', joi.string().optional(), "Extension override")
.summary('Create a new data put task record')
.description('Create a new data put task record. Does not resolve data IDs nor check permissions.');


router.post('/create/data/move', function (req, res) {
    try {
        var result = [];
        g_db._executeTransaction({
            collections: {
                read: ["u","uuid","accn","d","c"],
                write: ["task","lock","block"]
            },
            action: function() {
                var client = g_lib.getUserFromClientID( req.queryParams.client );
                var task = createDataMoveTask( client, req.queryParams.ids, req.queryParams.path, req.queryParams.encrypt, req.queryParams.ext );

                task.id = task._id;
                delete task._id;
                delete task._key;
                delete task._rev;

                result.push( task );
            }
        });

        res.send( result );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('ids', joi.array().items(joi.string()).required(), "Array of data record IDs or aliases")
.queryParam('repo_id', joi.string().required(), "Destination repository ID")
.queryParam('encrypt', joi.number().required(), "Encrypt mode (0=none,1=try,2=force)")
.summary('Create a new data move task record')
.description('Create a new data move task record. Does not resolve data IDs nor check permissions. Records with no raw data are ignored.');


router.post('/create/data/delete', function (req, res) {
    try {
        var result = [];
        g_db._executeTransaction({
            collections: {
                read: ["u","uuid","accn","d","c"],
                write: ["task","lock","block"]
            },
            action: function() {
                var client = g_lib.getUserFromClientID( req.queryParams.client );
                var task = createDataDeleteTask( client, req.queryParams.ids );

                task.id = task._id;
                delete task._id;
                delete task._key;
                delete task._rev;

                result.push( task );
            }
        });

        res.send( result );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('ids', joi.array().items(joi.string()).required(), "Array of data record IDs or aliases")
.summary('Create a new data delete task record')
.description('Create a new data delete task record. Does not resolve data IDs nor check permissions. Records with no raw data are ignored.');


router.post('/update', function (req, res) {
    try {
        var result = [];
        g_db._executeTransaction({
            collections: {
                read: ["u","uuid","accn"],
                write: ["task"]
            },
            action: function() {
                if ( !g_db._exists( req.queryParams.task_id ))
                    throw [g_lib.ERR_INVALID_PARAM,"Task " + req.queryParams.task_id + " does not exist."];

                var obj = { ut: Math.floor( Date.now()/1000 ) };

                if ( req.body.status )
                    obj.status = req.body.status;

                if ( req.body.state ){
                    obj.state = {};
                    for ( var k in req.body.state ){
                        obj.state[k] = req.body.state[k];
                    }
                }

                if ( req.body.progress )
                    obj.progress = req.body.progress;

                var task = g_db._update( req.queryParams.task_id, obj, { keepNull: false, returnNew: true });

                task.new.id = task.new._id;
                delete task.new._id;
                delete task.new._key;
                delete task.new._rev;
            
                result.push( task.new );
            }
        });

        res.send( result );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('task_id', joi.string().required(), "Task ID")
.body(joi.object({
    status: joi.number().integer().optional(),
    state: joi.any().optional(),
    progress: joi.number().min(0).max(100).optional()
}).required(), 'Record fields')
.summary('Update an existing task record')
.description('Update an existing task record from JSON body');


router.post('/finalize', function (req, res) {
    try {
        var result = [];
        g_db._executeTransaction({
            collections: {
                read: ["u","uuid","accn"],
                write: ["task","lock","block"]
            },
            action: function() {
                if ( !g_db._exists( req.queryParams.task_id ))
                    throw [g_lib.ERR_INVALID_PARAM,"Task " + req.queryParams.task_id + " does not exist."];

                var dep, dep_blocks, blocks = g_db.block.byExample({_to:req.queryParams.task_id});
                //console.log("have blocks:",blocks.hasNext());
                while ( blocks.hasNext() ){
                    dep = blocks.next()._from;
                    dep_blocks = g_db.block.byExample({_from:dep}).toArray();
                    //console.log("blocks for",dep,dep_blocks);
                    if ( dep_blocks.length == 1 ){
                        result.push( dep );
                        g_db._update( dep, { status: g_lib.TS_READY, msg: "Pending" }, { keepNull: false, returnNew: false });
                    }
                }

                var obj = {status:req.queryParams.succeeded?g_lib.TS_SUCCEEDED:g_lib.TS_FAILED,msg:req.queryParams.message?req.queryParams.message:null};

                if ( req.queryParams.succeeded )
                    obj.progress = 100;

                g_db._update( req.queryParams.task_id, obj, { keepNull: false, returnNew: false });

                g_db.lock.removeByExample({_from:req.queryParams.task_id});
                // Should only have in-coming block edges
                g_db.block.removeByExample({_to:req.queryParams.task_id});
            }
        });

        res.send( result );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('task_id', joi.string().required(), "Task ID")
.queryParam('succeeded', joi.boolean().required(), "Final task success/failure status.")
.queryParam('message', joi.string().optional(), "Final task message.")
.summary('Finalize an existing task record')
.description('Clear locks, update dependencies & status, and return list of new runnable tasks.');


router.post('/delete', function (req, res) {
    try{
        if ( !g_db._exists( req.queryParams.task_id ))
            throw [g_lib.ERR_INVALID_PARAM,"Task " + req.queryParams.task_id + " does not exist."];

        var task = g_db.task.document( req.queryParams.task_id );
        if ( task.status < g_lib.TS_SUCCEEDED )
            throw [g_lib.ERR_IN_USE,"Cannot delete task that has not been finalized."];

        g_lib.graph.task.remove( req.queryParams.task_id );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('task_id', joi.string().required(), "Task ID")
.summary('Delete an existing task record')
.description('Delete an existing finalized task record.');


router.get('/list', function (req, res) {
    try{
        var qry = "for i in task";
        var params = {};

        if ( req.queryParams.user || req.queryParams.server || req.queryParams.status ){
            qry += " filter";
            if ( req.queryParams.client ){
                qry += " i.user == '" + g_lib.getUserFromClientID( req.queryParams.client ) + "'";
            }

            if ( req.queryParams.server ){
                qry += " @server in i.servers";
                params.server =  req.queryParams.server;
            }

            if ( req.queryParams.status ){
                qry += " i.status in @status";
                params.status =  req.queryParams.status;
            }
        }

        qry += " return {id:i._id,type:i.type,status:i.status,progress:i.progress,msg:i.msg}";

        var result = g_db._query( qry, params );

        res.send( result );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('user', joi.string().optional(), "Filter by user ID")
.queryParam('server', joi.string().optional(), "Filter by server ID")
.queryParam('status', joi.array().items(joi.number().integer()).optional(), "List of task states to retrieve.")
.summary('List task records')
.description('List task records.');
