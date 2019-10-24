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

router.post('/create', function (req, res) {
    try {
        var result = [];
        g_db._executeTransaction({
            collections: {
                read: ["u","uuid","accn","d","c"],
                write: ["task","lock","block"]
            },
            action: function() {
                var time = Math.floor( Date.now()/1000 );
                var obj = { type: req.body.type, status: 1, ct: time, ut: time, can_cancel: req.body.can_cancel?true:false, can_pause:req.body.can_pause?true:false, progress: 0, write:req.body.write?true:false, state: req.body.state };

                if ( req.body.client )
                    obj.client = g_lib.getUserFromClientID( req.body.client );

                if ( req.body.servers )
                    obj.servers = req.body.servers;

                var task = g_db.task.save( obj, { returnNew: true });

                if ( req.body.deps ){
                    var i, j, dep, lock, locks, block = new Set();
                    for ( i in req.body.deps ){
                        // ensure dependency exists
                        dep = req.body.deps[i];
                        if ( !g_db._exists( dep ))
                            throw [g_lib.ERR_INVALID_PARAM,"Task dependency " + dep + " does not exist."];

                        // Gather other tasks with priority over this new one
                        locks = g_db.lock.byExample({_to: dep});
                        while ( locks.hasNext() ){
                            lock = locks.next();
                            //console.log("check lock:",lock);
                            if ( req.body.write || lock.write ){
                                //console.log("add to block:",lock._from);
                                block.add(lock._from);
                            }
                        }

                        // Add new lock
                        g_db.lock.save({ _from: task.new._id, _to: dep, write: req.body.write?true:false });
                    }

                    if ( block.size ){
                        //console.log("have blocks, adding edges");
                        block.forEach( function(val){
                            //console.log("block on", val);
                            g_db.block.save({ _from: task.new._id, _to: val });
                        });

                        task = g_db._update( task.new._id, {status:0}, { keepNull: false, returnNew: true });
                    }
                }

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
.body(joi.object({
    client: joi.string().optional(),
    type: joi.number().integer().min(0).max(7).required(),
    can_cancel: joi.boolean().optional(),
    can_pause: joi.boolean().optional(),
    state: joi.any().optional(),
    deps: joi.array().items(joi.string()).optional(),
    servers: joi.array().items(joi.string()).optional(),
    write: joi.boolean().optional()
}).required(), 'Record fields')
.summary('Create a new task record')
.description('Create a new task record from JSON body');

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

                if ( req.body.state )
                    obj.state = req.body.state;

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
    state: joi.any().optional()
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

                while ( blocks.hasNext() ){
                    dep = blocks.next()._from;
                    dep_blocks = g_db.block.byExample({_from:dep}).toArray();
                    if ( dep_blocks.length == 1 ){
                        result.push( dep );
                        g_db._update( dep, {status:1}, { keepNull: false, returnNew: false });
                    }
                }

                var obj = {status:req.queryParams.succeeded?g_lib.TS_SUCCEEDED:g_lib.TS_FAILED,message:req.queryParams.message?req.queryParams.message:null};

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

        if ( req.queryParams.client || req.queryParams.server || req.queryParams.status ){
            qry += " filter";
            if ( req.queryParams.client ){
                qry += " i.client == '" + g_lib.getUserFromClientID( req.queryParams.client ) + "'";
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

        qry += " return {id:i._id,type:i.type,status:i.status,progress:i.progress}";

        var result = g_db._query( qry, params );

        res.send( result );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().optional(), "Filter by Client ID")
.queryParam('server', joi.string().optional(), "Filter by server ID")
.queryParam('status', joi.array().items(joi.number().integer()).optional(), "List of task states to retrieve.")
.summary('List task records')
.description('List task records.');
