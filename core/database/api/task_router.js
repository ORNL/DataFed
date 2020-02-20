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
const   g_proc = require('./process');
const   g_tasks = require('./tasks');

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


router.get('/run', function (req, res) {
    try {
        g_db._executeTransaction({
            collections: {
                read: ["u","uuid","accn","d","c"],
                write: ["task"]
            },
            action: function() {
                if ( !g_db.task.exists( req.queryParams.task_id ))
                    throw [ g_lib.ERR_INVALID_PARAM, "Task " + req.queryParams.task_id + " does not exist." ];

                var result, task = g_db.task.document( req.queryParams.task_id ), step = req.queryParams.step;

                // TODO Validate task state/step

                if ( task.status == g_lib.TS_READY ){
                    g_proc.taskReady( task._id );
                } else if ( step == task.step ){
                    task.step++;
                    g_db._update( task._id, { step: task.step });
                }

                switch ( task.type ){
                    case g_lib.TT_DATA_GET:      result = g_tasks.taskRunDataGet( task ); break;
                    case g_lib.TT_DATA_PUT:      result = g_tasks.taskRunDataPut( task ); break;
                    case g_lib.TT_DATA_DEL:      result = g_tasks.taskRunDataDel( task ); break;
                    case g_lib.TT_REC_ALLOC_CHG: result = g_tasks.taskRunRecAllocChg( task ); break;
                    case g_lib.TT_REC_OWNER_CHG: result = g_tasks.taskRunRecOwnerChg( task ); break;
                    case g_lib.TT_REC_DEL:       result = g_tasks.taskRunRecDel( task ); break;
                    case g_lib.TT_ALLOC_CREATE:  result = g_tasks.taskRunAllocCreate( task ); break;
                    case g_lib.TT_ALLOC_DEL:     result = g_tasks.taskRunAllocDel( task ); break;
                    case g_lib.TT_USER_DEL:      result = g_tasks.taskRunUserDel( task ); break;
                    case g_lib.TT_PROJ_DEL:      result = g_tasks.taskRunProjDel( task ); break;
                }

                res.send( result );
            }
        });

    } catch( e ){
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().optional(), "Client ID")
.queryParam('task_id', joi.string().required(), "Task ID")
.queryParam('step', joi.number().integer().min(0).optional(), "Task step")
.summary('Start task')
.description('Start task. Creates and returns detailed task state');

/*
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

                if ( req.body.status ){
                    if ( req.body.status >= g_lib.TS_SUCCEEDED )
                        throw [g_lib.ERR_INTERNAL_FAULT,"Must finalize task to set status to SUCCEEDED or FAILED."];

                    obj.status = req.body.status;
                }

                if ( req.body.state )
                    obj.state = req.body.state;

                if ( req.body.progress )
                    obj.progress = req.body.progress;

                if ( req.body.message != undefined )
                    obj.msg = req.body.message;

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
    progress: joi.number().min(0).max(100).optional(),
    message: joi.string().allow('').optional()
}).required(), 'Record fields')
.summary('Update an existing task record')
.description('Update an existing task record from JSON body');
*/

/** @brief Clean-up a task and remove it from task dependency graph
 *
 * Removes dependency locks and patches task dependency graph (up and down
 * stream). Returns list of new runnable tasks if available.
 */
router.post('/abort', function (req, res) {
    try {
        var result = [];
        g_db._executeTransaction({
            collections: {
                read: ["u","uuid","accn"],
                exclusive: ["task","lock","block"]
            },
            action: function() {
                if ( !g_db._exists( req.queryParams.task_id ))
                    throw [g_lib.ERR_INVALID_PARAM,"Task " + req.queryParams.task_id + " does not exist."];

                result = g_proc._taskComplete( req.queryParams.task_id, false, req.queryParams.message );
            }
        });

        res.send( result );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('task_id', joi.string().required(), "Task ID")
.queryParam('message', joi.string().required(), "Final task message.")
.summary('Abort a schedule task')
.description('Abort a schedule task and return list of new runnable tasks.');


router.post('/delete', function (req, res) {
    try{
        if ( !g_db._exists( req.queryParams.task_id ))
            throw [g_lib.ERR_INVALID_PARAM,"Task " + req.queryParams.task_id + " does not exist."];

        var task = g_db.task.document( req.queryParams.task_id );
        if ( task.status < g_lib.TS_SUCCEEDED )
            throw [g_lib.ERR_IN_USE,"Cannot delete task that is still scheduled."];

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
        const client = g_lib.getUserFromClientID( req.queryParams.client );

        var params = {client: client._id};
        var qry = "for i in task filter i.client == @client";

        if ( req.queryParams.since ) {
            qry += " and i.ut >= " + ((Date.now()/1000) - req.queryParams.since);
        }else{
            if ( req.queryParams.from != undefined ) {
                qry += " and i.ut >= " + req.queryParams.from;
            }

            if ( req.queryParams.to != undefined ) {
                qry += " and i.ut <= " + req.queryParams.to;
            }
        }

        if ( req.queryParams.status ){
            qry += " and i.status in @status";
            params.status =  req.queryParams.status;
        }

        qry += " sort i.ut desc";

        if ( req.queryParams.offset != undefined && req.queryParams.count != undefined ){
            qry += " limit " + req.queryParams.offset + ", " + req.queryParams.count;
        }

        qry += " return {id:i._id,type:i.type,status:i.status,client:i.client,progress:i.progress,msg:i.msg,ct:i.ct,ut:i.ut}";

        var result = g_db._query( qry, params );

        res.send( result );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('status', joi.array().items(joi.number().integer()).optional(), "List of task states to retrieve.")
.queryParam('since', joi.number().integer().min(0).optional(), "List tasks updated since this many seconds ago.")
.queryParam('from', joi.number().integer().min(0).optional(), "List tasks from this timestamp.")
.queryParam('to', joi.number().integer().min(0).optional(), "List tasks to this timestamp.")
.queryParam('offset', joi.number().integer().min(0).optional(), "Offset")
.queryParam('count', joi.number().integer().min(0).optional(), "Count")
.summary('List task records')
.description('List task records.');


router.get('/reload', function (req, res) {
    try{
        var result = [];

        g_db._executeTransaction({
            collections: {
                read: ["u","uuid","accn"],
                exclusive: ["task","lock","block"]
            },
            action: function() {
                result = g_db._query( "for i in task filter i.status > 0 and i.status < 3 sort i.status desc return i" ).toArray();
                var task;
                for ( var i in result ){
                    task = result[i];
                    task.id = task._id;
                    delete task._id;
                    delete task._rev;
                    delete task._key;
                }
            }
        });

        res.send( result );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.summary('Reload ready/running task records')
.description('Reload ready/running task records.');
