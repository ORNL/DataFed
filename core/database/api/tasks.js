/*jshint strict: global */
/*jshint esversion: 6 */
/*jshint multistr: true */
/* globals require */
/* globals module */
/* globals console */

'use strict';

const   g_db = require('@arangodb').db;
const   g_lib = require('./support');
const   g_graph = require('@arangodb/general-graph')._graph('sdmsg');
const   g_proc = require('./process');
var     g_internal = require("internal");

var tasks_func = function() {
    var obj = {};

    // ----------------------- ALLOC CREATE ----------------------------

    obj.taskInitAllocCreate = function( a_client, a_repo_id, a_subject_id, a_data_limit, a_rec_limit ){
        console.log("taskInitAllocCreate");

        if ( !g_db._exists( a_repo_id ))
            throw [g_lib.ERR_NOT_FOUND,"Repo, '" + a_repo_id + "', does not exist"];

        if ( !g_db._exists( a_subject_id ))
            throw [g_lib.ERR_NOT_FOUND,"Subject, '" + a_subject_id + "', does not exist"];

        g_lib.ensureAdminPermRepo( a_client, a_repo_id );

        var alloc = g_db.alloc.firstExample({ _from: a_subject_id, _to: a_repo_id });
        if ( alloc )
            throw [g_lib.ERR_INVALID_PARAM, "Subject, '" + a_subject_id + "', already has as allocation on " + a_repo_id ];

        var repo = g_db.repo.document( a_repo_id );
        var path = repo.path + (a_subject_id.charAt(0) == "p"?"project/":"user/") + a_subject_id.substr(2) + "/";
        var state = { repo_id: a_repo_id, subject: a_subject_id, data_limit: a_data_limit, rec_limit: a_rec_limit, repo_path: path };
        var task = obj._createTask( a_client._id, g_lib.TT_ALLOC_CREATE, 2, state );

        if ( g_proc._lockDepsGeneral( task._id, [{id:a_repo_id,lev:1,ctx:a_subject_id},{id:a_subject_id,lev:0}] )){
            task = g_db.task.update( task._id, { status: g_lib.TS_BLOCKED, msg: "Queued" }, { returnNew: true, waitForSync: true }).new;
        }

        return { "task" : task };
    };

    obj.taskRunAllocCreate = function( a_task ){
        console.log("taskRunAllocCreate");

        var reply, state = a_task.state;

        // No rollback functionality
        if ( a_task.step < 0 )
            return;

        if ( a_task.step == 0 ){
            reply = { cmd: g_lib.TC_ALLOC_CREATE, params: { repo_id: state.repo_id, repo_path: state.repo_path }, step: a_task.step };
        }else{
             // Create allocation edge and finish

            obj._transact( function(){
                console.log("saving alloc:", state.subject, state.repo_id, state.data_limit, state.rec_limit,  0, 0, state.repo_path );

                g_db.alloc.save({ _from: state.subject, _to: state.repo_id, data_limit: state.data_limit, rec_limit: state.rec_limit, rec_count: 0, data_size: 0, path: state.repo_path });
                reply = { cmd: g_lib.TC_STOP, params: obj.taskComplete( a_task._id, true )};
            }, [], ["task","alloc"], ["lock","block"] );
        }

        return reply;
    };


    // ----------------------- ALLOC DELETE ----------------------------

    obj.taskInitAllocDelete = function( a_client, a_repo_id, a_subject_id ){
        console.log("taskInitAllocDelete");

        if ( !g_db._exists( a_repo_id ))
            throw [g_lib.ERR_NOT_FOUND,"Repo, '" + a_repo_id + "', does not exist"];

        if ( !g_db._exists( a_subject_id ))
            throw [g_lib.ERR_NOT_FOUND,"Subject, '" + a_subject_id + "', does not exist"];

        var repo = g_db.repo.document( a_repo_id );

        g_lib.ensureAdminPermRepo( a_client, a_repo_id );

        var alloc = g_db.alloc.firstExample({ _from: a_subject_id, _to: a_repo_id });
        if ( !alloc )
            throw [g_lib.ERR_NOT_FOUND, "Subject, '" + a_subject_id + "', has no allocation on " + a_repo_id ];

        var count = g_db._query("return length(for v, e in 1..1 inbound @repo loc filter e.uid == @subj return 1)", { repo: a_repo_id, subj: a_subject_id }).next();
        if ( count )
            throw [g_lib.ERR_IN_USE,"Cannot delete allocation - records present"];

        var path = repo.path + (a_subject_id.charAt(0) == "p"?"project/":"user/") + a_subject_id.substr(2) + "/";
        var state = { repo_id: a_repo_id, subject: a_subject_id, repo_path: path };
        var task = obj._createTask( a_client._id, g_lib.TT_ALLOC_DEL, 2, state );

        if ( g_proc._lockDepsGeneral( task._id, [{id:a_repo_id,lev:1,ctx:a_subject_id},{id:a_subject_id,lev:0}] )){
            task = g_db.task.update( task._id, { status: g_lib.TS_BLOCKED, msg: "Queued" }, { returnNew: true, waitForSync: true }).new;
        }

        return { "task" : task };
    };

    obj.taskRunAllocDelete = function( a_task ){
        console.log("taskRunAllocDelete");

        var reply, state = a_task.state;

        // No rollback functionality
        if ( a_task.step < 0 )
            return;

        if ( a_task.step == 0 ){
            // Delete alloc edge, request repo path delete
            obj._transact( function(){
                g_db.alloc.removeByExample({ _from: state.subject, _to: state.repo_id });
                reply = { cmd: g_lib.TC_ALLOC_DELETE, params: { repo_id: state.repo_id, repo_path: state.repo_path }, step: a_task.step };
            }, [], ["alloc"] );
        }else{
            // Complete task
            obj._transact( function(){
                reply = { cmd: g_lib.TC_STOP, params: obj.taskComplete( a_task._id, true )};
            }, [], ["task"], ["lock","block"] );
        }

        return reply;
    };

    // ----------------------- DATA GET ----------------------------

    obj.taskInitDataGet = function( a_client, a_path, a_encrypt, a_res_ids, a_check ){
        console.log("taskInitDataGet");

        var result = g_proc.preprocessItems( a_client, null, a_res_ids, g_lib.TT_DATA_GET );

        if ( result.glob_data.length > 0 && !a_check ){
            var idx = a_path.indexOf("/");
            if ( idx == -1 )
                throw [g_lib.ERR_INVALID_PARAM,"Invalid destination path (must include endpoint)"];

            var state = { path: a_path, encrypt: a_encrypt, glob_data: result.glob_data };
            var task = obj._createTask( a_client._id, g_lib.TT_DATA_GET, 2, state );

            var dep_ids = [];
            for ( var i in result.glob_data )
                dep_ids.push( result.glob_data[i]._id );

            if ( g_proc._processTaskDeps( task._id, dep_ids, 0, 0 )){
                task = g_db._update( task._id, { status: g_lib.TS_BLOCKED, msg: "Queued" }, { returnNew: true }).new;
            }

            result.task = task;
        }

        return result;
    };

    obj.taskRunDataGet = function( a_task ){
        console.log("taskRunDataGet");

        var reply, state = a_task.state;

        // No rollback functionality
        if ( a_task.step < 0 )
            return;

        if ( a_task.step == 0 ){
            console.log("taskRunDataGet - do setup");
            obj._transact( function(){
                // Generate transfer steps
                state.xfr = obj._buildTransferDoc( g_lib.TT_DATA_GET, state.glob_data, state.path );
                // Update step info
                a_task.step = 1;
                a_task.steps = state.xfr.length + 2;
                // Update task
                g_db._update( a_task._id, { step: a_task.step, steps: a_task.steps, state: { xfr: state.xfr }, ut: Math.floor( Date.now()/1000 )});
                // Fall-through to initiate first transfer
            }, ["repo","loc"], ["task"] );
        }

        if ( a_task.step < a_task.steps - 1 ){
            console.log("taskRunDataGet - do xfr");
            // Transfer data step

            var tokens = g_lib.getAccessToken( a_task.client );
            var params = {
                uid: a_task.client,
                type: a_task.type,
                encrypt: state.encrypt,
                acc_tok: tokens.acc_tok,
                ref_tok: tokens.ref_tok,
                acc_tok_exp_in: tokens.acc_tok_exp_in
            };
            params = Object.assign( params, state.xfr[a_task.step-1] );

            reply = { cmd: g_lib.TC_RAW_DATA_TRANSFER, params: params, step: a_task.step };
        }else{
            console.log("taskRunDataGet - complete task");
            obj._transact( function(){
                // Last step - complete task
                reply = { cmd: g_lib.TC_STOP, params: obj.taskComplete( a_task._id, true )};
            }, [], ["task"],["lock","block"] );
        }

        return reply;
    };

    // ----------------------- DATA PUT ----------------------------

    obj.taskInitDataPut = function( a_client, a_path, a_encrypt, a_ext, a_res_ids, a_check ){
        console.log("taskInitDataPut");

        var result = g_proc.preprocessItems( a_client, null, a_res_ids, g_lib.TT_DATA_PUT );

        if ( result.glob_data.length > 0 && !a_check ){
            var idx = a_path.indexOf("/");
            if ( idx == -1 )
                throw [g_lib.ERR_INVALID_PARAM,"Invalid destination path (must include endpoint)"];

            var state = { path: a_path, encrypt: a_encrypt, ext: a_ext, glob_data: result.glob_data };
            var task = obj._createTask( a_client._id, g_lib.TT_DATA_PUT, 2, state );

            var dep_ids = [];
            for ( var i in result.glob_data )
                dep_ids.push( result.glob_data[i].id );

            if ( g_proc._processTaskDeps( task._id, dep_ids, 1, 0 )){
                task = g_db._update( task._id, { status: g_lib.TS_BLOCKED, msg: "Queued" }, { returnNew: true }).new;
            }

            result.task = task;
        }

        return result;
    };

    obj.taskRunDataPut = function( a_task ){
        console.log("taskRunDataPut");
        var reply, state = a_task.state, params, xfr;

        // No rollback functionality
        if ( a_task.step < 0 )
            return;

        if ( a_task.step == 0 ){
            console.log("taskRunDataPut - do setup");
            obj._transact( function(){
                // Generate transfer steps
                state.xfr = obj._buildTransferDoc( g_lib.TT_DATA_PUT, state.glob_data, state.path );
                // Update step info
                a_task.step = 1;
                a_task.steps = state.xfr.length + 3;
                // Update task
                g_db._update( a_task._id, { step: a_task.step, steps: a_task.steps, state: { xfr: state.xfr }, ut: Math.floor( Date.now()/1000 )});
                // Fall-through to initiate first transfer
            }, ["repo","loc"], ["task"] );
        }

        if ( a_task.step < a_task.steps - 2 ){
            console.log("taskRunDataPut - do xfr");
            // Transfer data step

            var tokens = g_lib.getAccessToken( a_task.client );
            params = {
                uid: a_task.client,
                type: a_task.type,
                encrypt: state.encrypt,
                acc_tok: tokens.acc_tok,
                ref_tok: tokens.ref_tok,
                acc_tok_exp_in: tokens.acc_tok_exp_in
            };
            params = Object.assign( params, state.xfr[a_task.step-1] );
            reply = { cmd: g_lib.TC_RAW_DATA_TRANSFER, params: params, step: a_task.step };
        } else if ( a_task.step < a_task.steps - 1 ){
            xfr = state.xfr[a_task.step-2];

            // Update extention, manual/auto
            var rec = g_db.d.document( xfr.files[0].id ), upd_rec = {};

            if ( state.ext ){
                upd_rec.ext = state.ext;
                upd_rec.ext_auto = false;

                if ( upd_rec.ext.charAt(0) != "." )
                    upd_rec.ext = "." + upd_rec.ext;

            }else if ( rec.ext_auto ){
                var src = xfr.files[0].from;

                // Extention starts at LAST "." filename
                var pos = src.lastIndexOf(".");
                if ( pos != -1 ){
                    upd_rec.ext = src.substr( pos );
                }else{
                    upd_rec.ext = null;
                }
            }

            g_db._update( xfr.files[0].id, upd_rec, { keepNull: false });

            // Request data size update
            params = {
                repo_id: xfr.dst_repo_id,
                repo_path: xfr.dst_repo_path,
                ids: [xfr.files[0].id]
            };
            reply = { cmd: g_lib.TC_RAW_DATA_UPDATE_SIZE, params: params, step: a_task.step };
        } else {
            console.log("taskRunDataPut - complete task");
            obj._transact( function(){
                // Last step - complete task
                reply = { cmd: g_lib.TC_STOP, params: obj.taskComplete( a_task._id, true )};
            }, [], ["task"],["lock","block"] );
        }

        return reply;
    };

    // ----------------------- ALLOCATION CHANGE ----------------------------

    obj.taskInitRecAllocChg = function( a_client, a_proj_id, a_res_ids, a_dst_repo_id, a_check ){
        console.log("taskInitRecAllocChg");

        // Verify that client is owner, or has admin permission to project owner
        var owner_id;

        if ( a_proj_id ){
            if ( !g_db.p.exists( a_proj_id ))
                throw [ g_lib.ERR_INVALID_PARAM, "Project '" + a_proj_id + "' does not exist." ];

            if ( !g_lib.hasManagerPermProj( a_client, a_proj_id ))
                throw [ g_lib.ERR_PERM_DENIED, "Operation requires admin permissions to project." ];

            owner_id = a_proj_id;
        }else{
            owner_id = a_client._id;
        }

        // Verify destination repo
        if ( !g_db.repo.exists( a_dst_repo_id ))
            throw [ g_lib.ERR_INVALID_PARAM, "No such repo '" + a_dst_repo_id + "'" ];

        // Verify client/owner has an allocation
        var alloc = g_db.alloc.firstExample({ _from: owner_id, _to: a_dst_repo_id });
        if ( !alloc )
            throw [ g_lib.ERR_INVALID_PARAM, "No allocation on '" + a_dst_repo_id + "'" ];

        var result = g_proc.preprocessItems({ _id: owner_id, is_admin: false }, null, a_res_ids, g_lib.TT_REC_ALLOC_CHG );

        var i,loc,rec,rec_ids = [];

        result.tot_cnt = result.http_data.length + result.glob_data.length;
        result.act_size = 0;
        result.act_cnt = 0;

        for ( i in result.http_data ){
            rec = result.http_data[i];
            rec_ids.push( rec.id );

            loc = g_db.loc.firstExample({ _from: rec.id });
            if ( loc._to != a_dst_repo_id ){
                result.act_cnt++;
            }
        }

        for ( i in result.glob_data ){
            rec = result.glob_data[i];
            rec_ids.push( rec.id );

            loc = g_db.loc.firstExample({ _from: rec.id });
            if ( loc._to != a_dst_repo_id ){
                if ( rec.size ){
                    result.act_cnt++;
                    result.act_size += rec.size;
                }
            }
        }

        result.act_cnt = rec_ids.length;
        result.data_limit = alloc.data_limit;
        result.data_size = alloc.data_size;
        result.rec_limit = alloc.rec_limit;
        result.rec_count = alloc.rec_count;

        // Stop if no record to process, or if this is just a check
        if ( rec_ids.length == 0 || a_check )
            return result;

        var state = { encrypt: 1, http_data: result.http_data, glob_data: result.glob_data, dst_repo_id: a_dst_repo_id, owner_id: owner_id };
        var task = obj._createTask( a_client._id, g_lib.TT_REC_ALLOC_CHG, 3, state );

        if ( g_proc._processTaskDeps( task._id, rec_ids, 1, 0 )){
            task = g_db._update( task._id, { status: g_lib.TS_BLOCKED, msg: "Queued"}, { returnNew: true }).new;
        }

        result.task = task;

        return result;
    };

    obj.taskRunRecAllocChg = function( a_task ){
        console.log("taskRunRecAllocChg");

        var reply, state = a_task.state, params, xfr, alloc, substep, xfrnum;

        // TODO Add rollback functionality
        if ( a_task.step < 0 ){
            var step = -a_task.step;
            console.log("taskRunRecAllocChg - rollback step: ", step );

            if ( step > 1 && step < a_task.steps - 1 ){
                substep = (step - 2) % 4;
                xfrnum = Math.floor((step-2)/4);
                xfr = state.xfr[xfrnum];
                console.log("taskRunRecAllocChg - rollback substep: ", substep );

                // Only action is to revert location in DB if transfer failed.
                if ( substep > 0 && substep < 3 ){
                    obj._transact( function(){
                        console.log("taskRunRecAllocChg - recMoveRevert" );
                        obj.recMoveRevert( xfr.files );

                        // Update task step
                        a_task.step -= substep;
                        g_db._update( a_task._id, { step: a_task.step, ut: Math.floor( Date.now()/1000 )});
                    }, [], ["loc","task"] );
                }
            }

            return;
        }

        if ( a_task.step == 0 ){
            console.log("taskRunRecAllocChg - do setup");
            obj._transact( function(){
                // Generate transfer steps
                state.xfr = obj._buildTransferDoc( g_lib.TT_REC_ALLOC_CHG, state.glob_data, state.dst_repo_id, state.owner_id );
                // Update step info
                a_task.step = 1;
                a_task.steps = ( state.xfr.length * 4 ) + 3;
                // Update task
                g_db._update( a_task._id, { step: a_task.step, steps: a_task.steps, state: { xfr: state.xfr }, ut: Math.floor( Date.now()/1000 )});
                // Fall-through to initiate first transfer
            }, ["repo","loc"], ["task"] );
        }

        if ( a_task.step == 1 ){
            console.log("taskRunRecAllocChg - move non-globus records");
            obj._transact( function(){
                if ( state.http_data.length ){
                    // Ensure allocation has sufficient record capacity
                    alloc = g_db.alloc.firstExample({_from: state.owner_id, _to: state.dst_repo_id });
                    if ( alloc.rec_count + state.http_data.length > alloc.rec_limit )
                        throw [ g_lib.ERR_PERM_DENIED, "Allocation record limit exceeded on " + state.dst_repo_id ];

                    obj.recMoveInit( state.http_data, state.dst_repo_id );
                    obj.recMoveFini( state.http_data );
                }
                // Update task step
                a_task.step = 2;
                g_db._update( a_task._id, { step: a_task.step, ut: Math.floor( Date.now()/1000 )});
                // Fall-through to next step
            }, [], ["loc","alloc","task"] );
        }

        if ( a_task.step > 1 && a_task.step < a_task.steps - 1 ){
            substep = (a_task.step - 2) % 4;
            xfrnum = Math.floor((a_task.step-2)/4);
            xfr = state.xfr[xfrnum];
            console.log("taskRunRecAllocChg - xfr num",xfrnum,"substep",substep);

            switch ( substep ){
                case 0:
                    console.log("taskRunRecAllocChg - init move");
                    obj._transact( function(){
                        // Ensure allocation has sufficient record and data capacity
                        alloc = g_db.alloc.firstExample({_from: state.owner_id, _to: state.dst_repo_id });
                        if ( alloc.rec_count + xfr.files.length > alloc.rec_limit )
                            throw [ g_lib.ERR_PERM_DENIED, "Allocation record count limit exceeded on " + state.dst_repo_id ];
                        if ( alloc.data_size + xfr.size > alloc.data_limit )
                            throw [ g_lib.ERR_PERM_DENIED, "Allocation data size limit exceeded on " + state.dst_repo_id ];

                        // Init record move
                        obj.recMoveInit( xfr.files, state.dst_repo_id );

                        // Update task step
                        a_task.step += 1;
                        g_db._update( a_task._id, { step: a_task.step, ut: Math.floor( Date.now()/1000 )});
                    }, [], ["loc","task"] );
                    /* falls through */
                case 1:
                    console.log("taskRunRecAllocChg - do xfr");
                    // Transfer data step

                    var tokens = g_lib.getAccessToken( a_task.client );
                    params = {
                        uid: a_task.client,
                        type: a_task.type,
                        encrypt: state.encrypt,
                        acc_tok: tokens.acc_tok,
                        ref_tok: tokens.ref_tok,
                        acc_tok_exp_in: tokens.acc_tok_exp_in
                    };
                    params = Object.assign( params, xfr );
                    reply = { cmd: g_lib.TC_RAW_DATA_TRANSFER, params: params, step: a_task.step };
                    break;
                case 2:
                    console.log("taskRunRecAllocChg - finalize move");
                    obj._transact( function(){
                        // Init record move
                        obj.recMoveFini( xfr.files );

                        // Update task step
                        a_task.step += 1;
                        g_db._update( a_task._id, { step: a_task.step, ut: Math.floor( Date.now()/1000 )});

                    }, [], ["loc","alloc","task"] );
                    /* falls through */
                case 3:
                    console.log("taskRunRecAllocChg - delete old data");
                    // Request data size update
                    params = {
                        repo_id: xfr.src_repo_id,
                        repo_path: xfr.src_repo_path,
                    };
                    params.ids = [];
                    for ( var i in xfr.files ){
                        params.ids.push( xfr.files[i].id );
                    }

                    reply = { cmd: g_lib.TC_RAW_DATA_DELETE, params: params, step: a_task.step };
                    break;
            }
        } else {
            console.log("taskRunRecAllocChg - complete task");
            obj._transact( function(){
                // Last step - complete task
                reply = { cmd: g_lib.TC_STOP, params: obj.taskComplete( a_task._id, true )};
            }, [], ["task"],["lock","block"] );
        }

        return reply;
    };

    // ----------------------- OWNER CHANGE ----------------------------

    obj.taskInitRecOwnerChg = function( a_client, a_res_ids, a_dst_coll_id, a_dst_repo_id, a_check ){
        console.log("taskInitRecOwnerChg");


        console.log("taskInitRecOwnerChg 2");

        // Verify destination collection

        if ( !g_db.c.exists( a_dst_coll_id ))
            throw [ g_lib.ERR_INVALID_PARAM, "No such collection '" + a_dst_coll_id + "'" ];

        console.log("taskInitRecOwnerChg 2.1");

        var owner_id = g_db.owner.firstExample({_from: a_dst_coll_id })._to;

        console.log("taskInitRecOwnerChg 2.2" );

        if ( owner_id != a_client._id ){

            if (( owner_id.charAt(0) != 'p' ) || !g_lib.hasManagerPermProj( a_client, owner_id )){
                console.log("taskInitRecOwnerChg 2.3");

                var coll = g_db.c.document( a_dst_coll_id );
                console.log("taskInitRecOwnerChg 2.4");

                if ( g_lib.hasPermissions( a_client, coll, g_lib.PERM_CREATE ) != true )
                    throw [ g_lib.ERR_PERM_DENIED, "Operation requires CREATE permission on destination collection '" + a_dst_coll_id + "'" ];
            }
        }

        console.log("taskInitRecOwnerChg 3");

        var allocs;

        if ( a_check ){
            // Get a list of available repos for client to pick from (there must be at least one)
            allocs = g_db.alloc.byExample({ _from: owner_id });
            if ( !allocs.hasNext() )
                throw [ g_lib.ERR_PERM_DENIED, "No allocations available for '" + owner_id + "'" ];
        }else{
            // Verify destination repo
            if ( !g_db.repo.exists( a_dst_repo_id ))
                throw [ g_lib.ERR_INVALID_PARAM, "No such repo '" + a_dst_repo_id + "'" ];

            // Verify client/owner has an allocation
            if ( !g_db.alloc.firstExample({ _from: owner_id, _to: a_dst_repo_id }) )
                throw [ g_lib.ERR_INVALID_PARAM, "No allocation on '" + a_dst_repo_id + "'" ];
        }

        console.log("taskInitRecOwnerChg 3.1");

        var result = g_proc.preprocessItems( a_client, owner_id, a_res_ids, g_lib.TT_REC_OWNER_CHG );

        var i,loc,rec,deps = [];

        console.log("taskInitRecOwnerChg 4");

        result.tot_cnt = result.http_data.length + result.glob_data.length;
        result.act_size = 0;
        result.act_cnt = 0;

        for ( i in result.http_data ){
            rec = result.http_data[i];
            deps.push({ id: rec.id, lev: 1 });

            loc = g_db.loc.firstExample({ _from: rec.id });
            if ( loc.uid != owner_id || loc._to != a_dst_repo_id ){
                result.act_cnt++;
            }
        }

        for ( i in result.glob_data ){
            rec = result.glob_data[i];
            deps.push({ id: rec.id, lev: 1 });

            loc = g_db.loc.firstExample({ _from: rec.id });
            if ( loc.uid != owner_id || loc._to != a_dst_repo_id ){
                if ( rec.size ){
                    result.act_cnt++;
                    result.act_size += rec.size;
                }
            }
        }

        console.log("taskInitRecOwnerChg 5");

        result.act_cnt = deps.length;
        //result.data_limit = alloc.data_limit;
        //result.data_size = alloc.data_size;
        //result.rec_limit = alloc.rec_limit;
        //result.rec_count = alloc.rec_count;

        if ( a_check ){
            result.allocs = [];
            while ( allocs.hasNext() ){
                rec = allocs.next();
                rec.repo = rec._to;
                delete rec._id;
                result.allocs.push( rec );
            }
        }

        // Stop if no record to process, or if this is just a check
        if ( deps.length == 0 || a_check )
            return result;

        // Add additional dependencies for locks
        deps.push({ id: a_dst_coll_id, lev: 0 });
        deps.push({ id: owner_id, lev: 0 });
        deps.push({ id: a_dst_repo_id, lev: 1, ctx: owner_id });

        var state = { encrypt: 1, http_data: result.http_data, glob_data: result.glob_data, dst_coll_id: a_dst_coll_id, dst_repo_id: a_dst_repo_id, owner_id: owner_id };
        var task = obj._createTask( a_client._id, g_lib.TT_REC_OWNER_CHG, 3, state );
        if ( g_proc._lockDepsGeneral( task._id, deps )){
            task = g_db._update( task._id, { status: g_lib.TS_BLOCKED, msg: "Queued"}, { returnNew: true }).new;
        }

        result.task = task;

        return result;
    };

    obj.taskRunRecOwnerChg = function( a_task ){
        console.log("taskRunRecOwnerChg");

        var reply, state = a_task.state, params, xfr, alloc, substep, xfrnum;

        // TODO Add rollback functionality
        if ( a_task.step < 0 ){
            var step = -a_task.step;
            console.log("taskRunRecOwnerChg - rollback step: ", step );

            if ( step > 1 && step < a_task.steps - 1 ){
                substep = (step - 2) % 4;
                xfrnum = Math.floor((step-2)/4);
                xfr = state.xfr[xfrnum];
                console.log("taskRunRecOwnerChg - rollback substep: ", substep );

                // Only action is to revert location in DB if transfer failed.
                if ( substep > 0 && substep < 3 ){
                    obj._transact( function(){
                        console.log("taskRunRecOwnerChg - recMoveRevert" );
                        obj.recMoveRevert( xfr.files );

                        // Update task step
                        a_task.step -= substep;
                        g_db._update( a_task._id, { step: a_task.step, ut: Math.floor( Date.now()/1000 )});
                    }, [], ["loc","task"] );
                }
            }

            return;
        }

        if ( a_task.step == 0 ){
            console.log("taskRunRecOwnerChg - do setup");
            obj._transact( function(){
                // Generate transfer steps
                state.xfr = obj._buildTransferDoc( g_lib.TT_REC_OWNER_CHG, state.glob_data, state.dst_repo_id, state.owner_id );
                // Update step info
                a_task.step = 1;
                a_task.steps = ( state.xfr.length * 4 ) + 3;
                // Update task
                g_db._update( a_task._id, { step: a_task.step, steps: a_task.steps, state: { xfr: state.xfr }, ut: Math.floor( Date.now()/1000 )});
                // Fall-through to initiate first transfer
            }, ["repo","loc"], ["task"] );
        }

        if ( a_task.step == 1 ){
            console.log("taskRunRecOwnerChg - move non-globus records");
            obj._transact( function(){
                if ( state.http_data.length ){
                    // Ensure allocation has sufficient record capacity
                    alloc = g_db.alloc.firstExample({_from: state.owner_id, _to: state.dst_repo_id });
                    if ( alloc.rec_count + state.http_data.length > alloc.rec_limit )
                        throw [ g_lib.ERR_PERM_DENIED, "Allocation record limit exceeded on " + state.dst_repo_id ];

                    obj.recMoveInit( state.http_data, state.dst_repo_id, state.owner_id, state.dst_coll_id );
                    obj.recMoveFini( state.http_data );
                }
                // Update task step
                a_task.step = 2;
                g_db._update( a_task._id, { step: a_task.step, ut: Math.floor( Date.now()/1000 )});
                // Fall-through to next step
            }, ["loc"], ["task"] );
        }

        if ( a_task.step > 1 && a_task.step < a_task.steps - 1 ){
            substep = (a_task.step - 2) % 4;
            xfrnum = Math.floor((a_task.step-2)/4);
            xfr = state.xfr[xfrnum];
            console.log("taskRunRecOwnerChg - xfr num",xfrnum,"substep",substep);

            switch ( substep ){
                case 0:
                    console.log("taskRunRecOwnerChg - init move");
                    obj._transact( function(){
                        // Ensure allocation has sufficient record and data capacity
                        alloc = g_db.alloc.firstExample({_from: state.owner_id, _to: state.dst_repo_id });
                        if ( alloc.rec_count + xfr.files.length > alloc.rec_limit )
                            throw [ g_lib.ERR_PERM_DENIED, "Allocation record count limit exceeded on " + state.dst_repo_id ];
                        if ( alloc.data_size + xfr.size > alloc.data_limit )
                            throw [ g_lib.ERR_PERM_DENIED, "Allocation data size limit exceeded on " + state.dst_repo_id ];

                        // Init record move
                        obj.recMoveInit( xfr.files, state.dst_repo_id, state.owner_id, state.dst_coll_id );

                        // Update task step
                        a_task.step += 1;
                        g_db._update( a_task._id, { step: a_task.step, ut: Math.floor( Date.now()/1000 )});
                    }, [], ["loc","task"] );
                    /* falls through */
                case 1:
                    console.log("taskRunRecOwnerChg - do xfr");
                    // Transfer data step

                    var tokens = g_lib.getAccessToken( a_task.client );
                    params = {
                        uid: a_task.client,
                        type: a_task.type,
                        encrypt: state.encrypt,
                        acc_tok: tokens.acc_tok,
                        ref_tok: tokens.ref_tok,
                        acc_tok_exp_in: tokens.acc_tok_exp_in
                    };
                    params = Object.assign( params, xfr );
                    reply = { cmd: g_lib.TC_RAW_DATA_TRANSFER, params: params, step: a_task.step };
                    break;
                case 2:
                    console.log("taskRunRecOwnerChg - finalize move");
                    obj._transact( function(){
                        // Init record move
                        obj.recMoveFini( xfr.files );

                        // Update task step
                        a_task.step += 1;
                        g_db._update( a_task._id, { step: a_task.step, ut: Math.floor( Date.now()/1000 )});

                    }, ["c"], ["loc","alloc","acl","d","owner","item","task"] );
                    /* falls through */
                case 3:
                    console.log("taskRunRecOwnerChg - delete old data");
                    // Request data size update
                    params = {
                        repo_id: xfr.src_repo_id,
                        repo_path: xfr.src_repo_path,
                    };
                    params.ids = [];
                    for ( var i in xfr.files ){
                        params.ids.push( xfr.files[i].id );
                    }

                    reply = { cmd: g_lib.TC_RAW_DATA_DELETE, params: params, step: a_task.step };
                    break;
            }
        } else {
            console.log("taskRunRecOwnerChg - complete task");
            obj._transact( function(){
                // Last step - complete task
                reply = { cmd: g_lib.TC_STOP, params: obj.taskComplete( a_task._id, true )};
            }, [], ["task"],["lock","block"] );
        }

        return reply;
    };

    obj.taskInitRecCollDelete = function( a_client, a_ids ){
        console.log("taskInitRecCollDelete");

        var result = g_proc.preprocessItems( a_client, null, a_ids, g_lib.TT_REC_DEL );
        var i,rec_ids = [];

        console.log("taskInitRecCollDelete - 1",rec_ids, result.http_data );

        for ( i in result.http_data ){
            console.log("taskInitRecCollDelete - 1.5", result.http_data[i].id );
            rec_ids.push( result.http_data[i].id );
        }
        console.log("taskInitRecCollDelete - 2",rec_ids);

        for ( i in result.glob_data )
            rec_ids.push( result.glob_data[i].id );

        console.log("get exl acc",rec_ids);

        obj._ensureExclusiveAccess( rec_ids );

        console.log("del collections");

        for ( i in result.coll ){
            // TODO Adjust for collection limit on allocation
            obj._deleteCollection( result.coll[i] );
        }

        console.log("del empty data");

        // Delete records with no data
        for ( i in result.http_data ){
            obj._deleteDataRecord( result.http_data[i].id );
        }

        // Mark and schedule records for delete
        if ( result.glob_data.length ){
            console.log("sched data del task");

            var state = { del: obj._buildDeleteDoc( result.glob_data )};

            result.task = obj._createTask( a_client._id, g_lib.TT_REC_DEL, state.del.length + 1, state );

            // Records with managed data must be marked as deleted, but not actually deleted
            for ( i in result.glob_data ){
                obj._deleteDataRecord( result.glob_data[i].id );
            }
        }

        return result;
    };

    obj.taskRunRecCollDelete = function( a_task ){
        console.log("taskRunRecCollDelete");

        var reply, state = a_task.state;

        // No rollback functionality
        if ( a_task.step < 0 )
            return;

        if ( a_task.step < a_task.steps - 1 ){
            console.log("taskRunRecCollDelete - del", a_task.step );
            reply = { cmd: g_lib.TC_RAW_DATA_DELETE, params: state.del[ a_task.step ], step: a_task.step };
        }else{
            console.log("taskRunRecCollDelete - complete task");
            obj._transact( function(){
                // Last step - complete task
                reply = { cmd: g_lib.TC_STOP, params: obj.taskComplete( a_task._id, true )};
            }, [], ["task"],["lock","block"] );
        }

        return reply;
    };

    // ----------------------- External Support Functions ---------------------


    /** @brief Delete projects and associated data
     *
     * Delete one or more projects. If a project has no allocations,
     * it can be deleted immediately. If a project has allocations and
     * raw data, the project can be deleted, but a task must be initialized
     * to delete the allocations. Deletion is an exclusive operation - if
     * any other tasks are using the project or associated data, the delete
     * operation will be denied.
     */
    obj.taskInitProjDelete = function( a_client, a_proj_ids ){
        var i,proj_id,proj;

        // Verify existence and check permission
        for ( i in a_proj_ids ){
            proj_id = a_proj_ids[i];
            if ( !g_db.p.exists( proj_id ))
                throw [ g_lib.ERR_INVALID_PARAM, "No such project '" + proj_id + "'" ];

            g_lib.ensureAdminPermProj( a_client, proj_id );
        }

        obj._ensureExclusiveAccess( a_proj_ids );

        var allocs, alloc;
        var task_allocs = [];

        // For each project, determine allocation/raw data status and take appropriate actions
        for ( i in a_proj_ids ){
            proj_id = a_proj_ids[i];

            allocs = g_db.alloc.byExample({ _from: proj_id });
            while ( allocs.hasNext() ){
                alloc = allocs.next();
                task_allocs.push({ repo_id: alloc._to, repo_path: alloc.path });
            }

            obj._projectDelete( proj_id );
        }

        var result = {};

        if ( task_allocs.length ){
            result.task = obj._createTask( a_client._id, g_lib.TT_PROJ_DEL, task_allocs.length + 1, { allocs: task_allocs });
        }

        return result;
    };

    obj.taskRunProjDelete = function( a_task ){
        console.log("taskRunProjDelete");

        var reply, state = a_task.state;

        // No rollback functionality
        if ( a_task.step < 0 )
            return;

        if ( a_task.step < a_task.steps - 1 ){
            // Request repo path delete
            reply = { cmd: g_lib.TC_ALLOC_DELETE, params: state.allocs[ a_task.step ], step: a_task.step };
        }else{
            // Complete task
            obj._transact( function(){
                reply = { cmd: g_lib.TC_STOP, params: obj.taskComplete( a_task._id, true )};
            }, [], ["task"], ["lock","block"] );
        }

        return reply;
    };

    // ----------------------- External Support Functions ---------------------

    obj.taskGetRunFunc = function( a_task ){
        switch ( a_task.type ){
            case g_lib.TT_DATA_GET:      return obj.taskRunDataGet;
            case g_lib.TT_DATA_PUT:      return obj.taskRunDataPut;
            case g_lib.TT_DATA_DEL:      return obj.taskRunDataDelete;
            case g_lib.TT_REC_ALLOC_CHG: return obj.taskRunRecAllocChg;
            case g_lib.TT_REC_OWNER_CHG: return obj.taskRunRecOwnerChg;
            case g_lib.TT_REC_DEL:       return obj.taskRunRecCollDelete;
            case g_lib.TT_ALLOC_CREATE:  return obj.taskRunAllocCreate;
            case g_lib.TT_ALLOC_DEL:     return obj.taskRunAllocDelete;
            case g_lib.TT_USER_DEL:      return obj.taskRunUserDelete;
            case g_lib.TT_PROJ_DEL:      return obj.taskRunProjDelete;
            default:
                throw [ g_lib.ERR_INVALID_PARAM, "Invalid task type: " + a_task.type ];
        }
    };

    // ----------------------- Internal Support Functions ---------------------

    obj.taskReady = function( a_task_id ){
        g_db._update( a_task_id, { status: g_lib.TS_RUNNING, msg: "Running", ut: Math.floor( Date.now()/1000 ) }, { returnNew: true, waitForSync: true });
    };

    obj.taskComplete = function( a_task_id, a_success, a_msg ){
        //console.log("taskComplete 1");
        var ready_tasks = [], dep, dep_blocks, blocks = g_db.block.byExample({_to: a_task_id});
        var time = Math.floor( Date.now()/1000 );

        //console.log("taskComplete 2");

        while ( blocks.hasNext() ){
            dep = blocks.next()._from;
            dep_blocks = g_db.block.byExample({_from:dep}).toArray();
            // If blocked task has only one block, then it's this task being finalized and will be able to run now
            if ( dep_blocks.length == 1 ){
                ready_tasks.push( dep );
                //console.log("taskComplete - task", dep, "ready");
                g_db.task.update( dep, { status: g_lib.TS_READY, msg: "Pending", ut: time }, { returnNew: true, waitForSync: true });
            }
        }
        //console.log("taskComplete 3");

        var doc;
        if ( a_success ){
            doc = { status: g_lib.TS_SUCCEEDED, msg: "Finished" };
        }else{
            doc = { status: g_lib.TS_FAILED, msg: a_msg?a_msg:"Failed (unknown reason)" };
        }

        doc.ut = time;

        //console.log("taskComplete 4", doc );
        g_db.block.removeByExample({ _to: a_task_id });
        g_db.lock.removeByExample({ _from: a_task_id });
        //console.log("taskComplete 5");
        var delay = 1;
        while( true ){
            try{
                g_db.task.update( a_task_id, doc );
                break;
            }
            catch( e ){
                if ( e.errorNum == 1200 ){
                    if ( delay > 64 )
                        throw e;

                    //console.log("retry sleep");
                    g_internal.sleep(0.2*delay);
                    //console.log("do retry");

                    delay *= 2;
                }else{
                    throw e;
                }
            }
        }
        //console.log("taskComplete 6");

        return ready_tasks;
    };

    obj._transact = function( a_func, a_rdc = [], a_wrc = [], a_exc = [] ){
        g_db._executeTransaction({
            collections: {
                read: a_rdc,
                write: a_wrc,
                exclusive: a_exc
            },
            lockTimeout: 0,
            waitForSync: true,
            action: a_func
        });
    };

    obj._createTask = function( a_client_id, a_type, a_steps, a_state ){
        var time = Math.floor( Date.now()/1000 );
        var obj = { type: a_type, status: g_lib.TS_READY, msg: "Pending", ct: time, ut: time, client: a_client_id, step: 0, steps: a_steps, state: a_state };
        var task = g_db.task.save( obj, { returnNew: true });
        return task.new;
    };

    obj._buildTransferDoc = function( a_mode, a_data, a_remote, a_dst_owner ){
        /* Output per mode:
        GET:
            src_repo_xx - DataFed storage location
            dst_repo_xx - a_remote is full globus path
            files - from: data key, to: id + ext
            xfr_docs - one per source repo
        PUT:
            src_repo_xx - a_remote is full globus path
            dst_repo_xx - DataFed storage location
            files - from: filename, to: data key
            xfr_docs - one (only one file per put allowed)
        ALLOC_CHG:
            src_repo_xx - DataFed storage location
            dst_repo_xx - a_remote is dest repo id
            files - from/to: data key
            xfr_docs - chunked per source repo and max data transfer size
        OWNER_CHG:
            src_repo_xx - DataFed storage location
            dst_repo_xx - a_remote is dest repo id
            files - from/to: data key
            a_new_owner - new owner (w/ remote indicates dst allocation)
            xfr_docs - chunked per source repo and max data transfer size
        */

        console.log("_buildTransferDoc",a_mode,a_data, a_remote);

        var idx, locs, loc, file, rem_ep, rem_fname, rem_path, xfr, repo_map = {};

        if ( a_mode == g_lib.TT_DATA_GET || a_mode == g_lib.TT_DATA_PUT ){
            idx = a_remote.indexOf("/");
            if ( idx < 1 )
                throw [g_lib.ERR_INVALID_PARAM,"Invalid remote path (must include endpoint)"];

            //console.log("rem idx:",idx);

            rem_ep = a_remote.substr(0,idx);
            rem_path = a_remote.substr(idx);

            //console.log("rem ep:",rem_ep);
            //console.log("rem path:",rem_path);

            if ( a_mode == g_lib.TT_DATA_GET ){
                if ( rem_path.charAt( rem_path.length - 1 ) != "/" )
                    rem_path += "/";
            } else if ( a_mode == g_lib.TT_DATA_PUT ){
                idx = rem_path.lastIndexOf("/",rem_path.length-1);
                //console.log("new idx:",idx);

                rem_fname = rem_path.substr( idx + 1 );
                rem_path = rem_path.substr( 0, idx + 1 );
                //console.log("rem_fname",rem_fname);
                //console.log("rem_path",rem_path);
            } 
        }else{
            //console.log("should not be here!",a_mode, g_lib.TT_DATA_GET, g_lib.TT_DATA_PUT);

            var repo = g_db.repo.document( a_remote );
            rem_ep = repo.endpoint;
            rem_path = repo.path + (a_dst_owner.charAt(0)=="u"?"user/":"project/") + a_dst_owner.substr(2) + "/";
        }

        locs = g_db._query("for i in @data for v,e in 1..1 outbound i loc return { d_id: i._id, d_sz: i.size, d_ext: i.ext, r_id: v._id, r_ep: v.endpoint, r_path: v.path, uid: e.uid }", { data: a_data });

        //console.log("locs hasNext",locs.hasNext());

        while ( locs.hasNext() ){
            loc = locs.next();
            //console.log("loc",loc);

            file = { id: loc.d_id, size: loc.d_sz };

            switch ( a_mode ){
                case g_lib.TT_DATA_GET:
                    file.from = loc.d_id.substr( 2 );
                    file.to = file.from + (loc.d_ext?loc.d_ext:"");
                    break;
                case g_lib.TT_DATA_PUT:
                    file.from = rem_fname;
                    file.to = loc.d_id.substr( 2 );
                    break;
                case g_lib.TT_REC_ALLOC_CHG:
                case g_lib.TT_REC_OWNER_CHG:
                    file.from = loc.d_id.substr( 2 );
                    file.to = file.from;
                    break;
            }

            //console.log("file:",file);

            if ( loc.r_id in repo_map ){
                repo_map[loc.r_id].files.push(file);
            }else{
                repo_map[loc.r_id] = {
                    repo_id: loc.r_id,
                    repo_ep: loc.r_ep,
                    repo_path: loc.r_path + (loc.uid.charAt(0)=="u"?"user/":"project/") + loc.uid.substr(2) + "/",
                    files:[file]
                };
            }
        }

        //console.log("repo map len",Object.keys(repo_map).length);

        var i, rm, xfr_docs = [];

        if ( a_mode == g_lib.TT_REC_ALLOC_CHG || a_mode == g_lib.TT_REC_OWNER_CHG ){
            var j, k, chunks, chunk_sz, files, sz;

            for ( i in repo_map ){
                rm = repo_map[i];

                // Pack roughly equal transfer sizes into each transfer chunk/step

                // Sort files from largest to smallest
                rm.files.sort( function( a, b ){
                    return b.size - a.size;
                });

                chunks = [];
                chunk_sz = [];

                // Push files larger than chunk size into own transfers
                for ( j = 0; j < rm.files.length; j++ ){
                    file = rm.files[j];
                    if ( file.size >= g_lib.GLOB_MAX_XFR_SIZE ){
                        //console.log("rec",file.id,"alone in xfr, sz:",file.size);
                        chunks.push( [file] );
                        chunk_sz.push( file.size );
                    }else{
                        break;
                    }
                }

                // Remaining files are smaller than max chunk size
                // Build chunks by combining largest with smallest files
                for ( ; j < rm.files.length; j++ ){
                    file = rm.files[j];
                    sz = file.size;
                    files = [file];
                    //console.log("rec",file.id,"first in xfr, sz:",file.size);

                    for ( k = j + 1; k < rm.files.length; ){
                        file = rm.files[k];
                        if ( sz + file.size <= g_lib.GLOB_MAX_XFR_SIZE ){
                            //console.log("rec",file.id,"added to xfr, sz:",file.size);
                            files.push( file );
                            sz += file.size;
                            rm.files.splice(k,1);
                        }else{
                            //console.log("rec",file.id,"too big for xfr, sz:",file.size,"sum",sz + file.size,"max",g_lib.GLOB_MAX_XFR_SIZE);
                            k++;
                        }
                    }

                    chunks.push( files );
                    chunk_sz.push( sz );
                }

                for ( j in chunks ){

                    xfr = {
                        src_repo_id: rm.repo_id,
                        src_repo_ep: rm.repo_ep,
                        src_repo_path: rm.repo_path,
                        dst_repo_id: a_remote,
                        dst_repo_ep: rem_ep,
                        dst_repo_path: rem_path,
                        size: chunk_sz[j]
                    };

                    xfr.files = chunks[j];
                    xfr_docs.push( xfr );
                }
            }
        }else{
            for ( i in repo_map ){
                rm = repo_map[i];

                if ( a_mode == g_lib.TT_DATA_GET ){
                    xfr = {
                        src_repo_id: rm.repo_id,
                        src_repo_ep: rm.repo_ep,
                        src_repo_path: rm.repo_path,
                        dst_repo_ep: rem_ep,
                        dst_repo_path: rem_path
                    };
                }else{
                    xfr = {
                        src_repo_ep: rem_ep,
                        src_repo_path: rem_path,
                        dst_repo_id: rm.repo_id,
                        dst_repo_ep: rm.repo_ep,
                        dst_repo_path: rm.repo_path
                    };
                }

                xfr.files = rm.files;
                xfr_docs.push( xfr );
            }
        }

        return xfr_docs;
    };


    obj._buildDeleteDoc = function( a_data ){
        var loc, locs, doc = [], repo_map = {};

        locs = g_db._query("for i in @data for v,e in 1..1 outbound i loc return { d_id: i._id, r_id: v._id, r_path: v.path, uid: e.uid }", { data: a_data });

        console.log("locs hasNext",locs.hasNext());

        while ( locs.hasNext() ){
            loc = locs.next();

            if ( loc.r_id in repo_map ){
                repo_map[loc.r_id].ids.push(loc.d_id);
            }else{
                repo_map[loc.r_id] = {
                    repo_id: loc.r_id,
                    repo_path: loc.r_path + (loc.uid.charAt(0)=="u"?"user/":"project/") + loc.uid.substr(2) + "/",
                    ids:[loc.d_id]
                };
            }
        }

        for ( var i in repo_map ){
            doc.push(repo_map[i]);
        }

        return doc;
    };

    /** @brief Deletes a collection record
     *
     * NOTE: DO NOT CALL THIS DIRECTLY - USED ONLY BY TASK/PROCESS CODE
     *
     * Does not recursively delete contained items.
     */
    obj._deleteCollection = function( a_id ){
        var tmp = g_db.alias.firstExample({ _from: a_id });
        if ( tmp ){
            g_graph.a.remove( tmp._to );
        }

        tmp = g_db.top.firstExample({ _from: a_id });
        if ( tmp )
            g_lib.topicUnlink( a_id );

        g_graph.c.remove( a_id );
    };


    /** @brief Deletes data records
     *
     * Deletes record and associated graph objects. Does not delete raw data
     * but does adjust allocation.
     */
    obj._deleteDataRecord = function( a_id ){
        console.log( "delete rec", a_id );
        var doc = g_db.d.document( a_id );

        var alias = g_db.alias.firstExample({ _from: a_id });
        if ( alias ){
            g_graph.a.remove( alias._to );
        }

        var loc = g_db.loc.firstExample({ _from: a_id });
        var alloc = g_db.alloc.firstExample({ _from: doc.owner, _to: loc._to });

        //console.log( "alloc", alloc );
        //console.log( "data size", doc.size );
        //console.log( "upd:", { data_size: alloc.data_size - doc.size,  rec_count: alloc.rec_count - 1 });
        g_db.alloc.update( alloc._id, { data_size: alloc.data_size - doc.size,  rec_count: alloc.rec_count - 1 });

        g_graph.d.remove( a_id );
    };


    /** @brief Deletes project immediately
     *
     * Deletes projects and associated graph objects.
     *
     * DO NOT USE ON PROJECTS WITH RAW DATA!!!!
     */
    obj._projectDelete = function( a_proj_id ){
        // Delete allocations
        g_db.alloc.removeByExample({ _from: a_proj_id });

        // Delete all owned records (data, collections, groups, aliases
        var id, rec_ids = g_db._query( "for v in 1..1 inbound @proj owner return v._id", { proj: a_proj_id });

        while ( rec_ids.hasNext() ) {
            id = rec_ids.next();
            if ( id.charAt(0) == "c" ){
                g_lib.topicUnlink( id );
            }
            g_graph[id.charAt(0)].remove( id );
        }

        g_graph.d.remove( a_proj_id );
    };


    /*
    if ( a_new_coll_id ){
        if ( !g_db.c.exists( req.body.new_coll_id ))
            throw [ g_lib.ERR_INTERNAL_FAULT, "New collection '" + req.body.new_coll_id + "' does not exist!" ];

        var coll = g_db.c.document( req.body.new_coll_id );

        if ( coll.owner != req.body.new_owner_id )
            throw [ g_lib.ERR_INTERNAL_FAULT, "Record '" + id + "' destination collection '" + req.body.new_coll_id + "' not owner by new owner!" ];
    }*/

    obj.recMoveInit = function( a_data, a_new_repo_id, a_new_owner_id, a_new_coll_id ) {
        var loc;

        console.log("recMoveInit", a_new_repo_id, a_new_owner_id, a_new_coll_id );

        for ( var i in a_data ){
            loc = g_db.loc.firstExample({ _from: a_data[i].id });

            var obj = {};

            // Skip records that are already on new allocation
            if ( !a_new_owner_id && loc._to == a_new_repo_id )
                continue;

            obj.new_repo = a_new_repo_id;

            if ( a_new_owner_id ){
                // Skip records that are have already been move to new owner
                if ( loc.uid == a_new_owner_id )
                    continue;

                obj.new_owner = a_new_owner_id;
                obj.new_coll = a_new_coll_id;
            }

            g_db._update( loc._id, obj );
        }
    };


    obj.recMoveRevert = function( a_data ) {
        var id, loc;

        for ( var i in a_data ){
            id = a_data[i].id;
            console.log("recMoveRevert", id );

            loc = g_db.loc.firstExample({ _from: id });
            g_db._update( loc._id, { new_repo: null, new_owner: null, new_coll: null }, { keepNull: false } );
        }
    };


    obj.recMoveFini = function( a_data ) {
        var data, loc, new_loc, alloc, rec, coll;

        for ( var i in a_data ){
            data = a_data[i];

            loc = g_db.loc.firstExample({ _from: data.id });

            if ( loc.new_owner ){
                // Changing owner and repo

                // DEV-ONLY SANITY CHECKS:
                if ( !loc.new_coll )
                    throw [ g_lib.ERR_INTERNAL_FAULT, "Record '" + data.id + "' missing destination collection!" ];

                if ( !g_db.c.exists( loc.new_coll ))
                    throw [ g_lib.ERR_INTERNAL_FAULT, "Record '" + data.id + "' destination collection '" + loc.new_coll + "' does not exist!" ];

                coll = g_db.c.document( loc.new_coll );

                if ( coll.owner != loc.new_owner )
                    throw [ g_lib.ERR_INTERNAL_FAULT, "Record '" + data.id + "' destination collection '" + loc.new_coll + "' not owner by new owner!" ];

                // Clear all record ACLs
                g_db.acl.removeByExample({ _from: data.id });

                // Update record to new owner
                g_db._update( data.id, { owner: loc.new_owner });

                // Move ownership edge
                g_db.owner.removeByExample({ _from: data.id });
                g_db.owner.save({ _from: data.id, _to: loc.new_owner });

                // Move to new collection
                g_db.item.removeByExample({ _to: data.id });
                g_db.item.save({ _from: loc.new_coll, _to: data.id });
            }

            //rec = g_db.d.document( id );

            // Update old allocation stats
            alloc = g_db.alloc.firstExample({ _from: loc.uid, _to: loc._to });
            if ( !alloc )
                throw [ g_lib.ERR_INTERNAL_FAULT, "Record '" + data.id + "' has mismatched allocation/location (cur)!" ];

            g_db._update( alloc._id, { rec_count: alloc.rec_count - 1, data_size: alloc.data_size - data.size });

            // Update new allocation stats
            alloc = g_db.alloc.firstExample({ _from: loc.new_owner?loc.new_owner:loc.uid, _to: loc.new_repo });
            if ( !alloc )
                throw [ g_lib.ERR_INTERNAL_FAULT, "Record '" + data.id + "' has mismatched allocation/location (new)!" ];

            g_db._update( alloc._id, { rec_count: alloc.rec_count + 1, data_size: alloc.data_size + data.size });

            // Create new edge to new owner/repo, delete old
            new_loc = { _from: loc._from, _to: loc.new_repo, uid: loc.new_owner?loc.new_owner:loc.uid };
            g_db.loc.save( new_loc );
            g_db.loc.remove( loc );
        }
    };


    obj._ensureExclusiveAccess = function( a_ids ){
        var i, id, lock;
        for ( i in a_ids ){
            id = a_ids[i];
            console.log("_ensureExclusiveAccess",id);
            lock = g_db.lock.firstExample({ _to: id });
            if ( lock )
                throw [ g_lib.ERR_PERM_DENIED, "Operation not permitted - '" + id + "' in use." ];
        }
        console.log("_ensureExclusiveAccess done");
    };

    return obj;
}();

module.exports = tasks_func;