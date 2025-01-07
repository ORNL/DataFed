"use strict";

const g_db = require("@arangodb").db;
const g_lib = require("./support");
const g_graph = require("@arangodb/general-graph")._graph("sdmsg");
const g_proc = require("./process");
var g_internal = require("internal");

var tasks_func = (function () {
    var obj = {};

    // ----------------------- ALLOC CREATE ----------------------------

    obj.taskInitAllocCreate = function (
        a_client,
        a_repo_id,
        a_subject_id,
        a_data_limit,
        a_rec_limit,
    ) {
        console.log("taskInitAllocCreate");

        // Check if repo and subject exist
        if (!g_db._exists(a_repo_id))
            throw [g_lib.ERR_NOT_FOUND, "Repo, '" + a_repo_id + "', does not exist"];

        if (!g_db._exists(a_subject_id))
            throw [g_lib.ERR_NOT_FOUND, "Subject, '" + a_subject_id + "', does not exist"];

        // Check for proper permissions
        g_lib.ensureAdminPermRepo(a_client, a_repo_id);

        // Check if there is already a matching allocation
        var alloc = g_db.alloc.firstExample({
            _from: a_subject_id,
            _to: a_repo_id,
        });
        if (alloc)
            throw [
                g_lib.ERR_INVALID_PARAM,
                "Subject, '" + a_subject_id + "', already has as allocation on " + a_repo_id,
            ];

        // Check if there is an existing alloc task to involving the same allocation (repo + subject)
        var res = g_db._query(
            "for v, e in 1..1 inbound @repo lock filter e.context == @subj && v.type == @type return v._id",
            {
                repo: a_repo_id,
                subj: a_subject_id,
                type: g_lib.TT_ALLOC_CREATE,
            },
        );

        if (res.hasNext()) {
            throw [g_lib.ERR_IN_USE, "A duplicate allocation create task was found."];
        }

        var repo = g_db.repo.document(a_repo_id);
        var path =
            repo.path +
            (a_subject_id.charAt(0) == "p" ? "project/" : "user/") +
            a_subject_id.substr(2) +
            "/";
        var state = {
            repo_id: a_repo_id,
            subject: a_subject_id,
            data_limit: a_data_limit,
            rec_limit: a_rec_limit,
            repo_path: path,
        };
        var task = obj._createTask(a_client._id, g_lib.TT_ALLOC_CREATE, 2, state);

        if (
            g_proc._lockDepsGeneral(task._id, [
                {
                    id: a_repo_id,
                    lev: 1,
                    ctx: a_subject_id,
                },
                {
                    id: a_subject_id,
                    lev: 0,
                },
            ])
        ) {
            task = g_db.task.update(
                task._id,
                {
                    status: g_lib.TS_BLOCKED,
                    msg: "Queued",
                },
                {
                    returnNew: true,
                    waitForSync: true,
                },
            ).new;
        }

        return {
            task: task,
        };
    };

    obj.taskRunAllocCreate = function (a_task) {
        console.log("taskRunAllocCreate");

        var reply,
            state = a_task.state;

        // No rollback functionality
        if (a_task.step < 0) return;

        if (a_task.step === 0) {
            reply = {
                cmd: g_lib.TC_ALLOC_CREATE,
                params: {
                    repo_id: state.repo_id,
                    repo_path: state.repo_path,
                },
                step: a_task.step,
            };
        } else {
            // Create allocation edge and finish

            obj._transact(
                function () {
                    //console.log("saving alloc:", state.subject, state.repo_id, state.data_limit, state.rec_limit,  0, 0, state.repo_path );

                    g_db.alloc.save({
                        _from: state.subject,
                        _to: state.repo_id,
                        data_limit: state.data_limit,
                        rec_limit: state.rec_limit,
                        rec_count: 0,
                        data_size: 0,
                        path: state.repo_path,
                    });
                    reply = {
                        cmd: g_lib.TC_STOP,
                        params: obj.taskComplete(a_task._id, true),
                    };
                },
                [],
                ["task", "alloc"],
                ["lock", "block"],
            );
        }

        return reply;
    };

    // ----------------------- ALLOC DELETE ----------------------------

    obj.taskInitAllocDelete = function (a_client, a_repo_id, a_subject_id) {
        console.log("taskInitAllocDelete");

        if (!g_db._exists(a_repo_id))
            throw [g_lib.ERR_NOT_FOUND, "Repo, '" + a_repo_id + "', does not exist"];

        if (!g_db._exists(a_subject_id))
            throw [g_lib.ERR_NOT_FOUND, "Subject, '" + a_subject_id + "', does not exist"];

        var repo = g_db.repo.document(a_repo_id);

        g_lib.ensureAdminPermRepo(a_client, a_repo_id);

        var alloc = g_db.alloc.firstExample({
            _from: a_subject_id,
            _to: a_repo_id,
        });
        if (!alloc)
            throw [
                g_lib.ERR_NOT_FOUND,
                "Subject, '" + a_subject_id + "', has no allocation on " + a_repo_id,
            ];

        var count = g_db
            ._query(
                "return length(for v, e in 1..1 inbound @repo loc filter e.uid == @subj return 1)",
                {
                    repo: a_repo_id,
                    subj: a_subject_id,
                },
            )
            .next();
        if (count) throw [g_lib.ERR_IN_USE, "Cannot delete allocation - records present"];

        // Check if there is an existing alloc task to involving the same allocation (repo + subject)
        var res = g_db._query(
            "for v, e in 1..1 inbound @repo lock filter e.context == @subj && v.type == @type return v._id",
            {
                repo: a_repo_id,
                subj: a_subject_id,
                type: g_lib.TT_ALLOC_DEL,
            },
        );

        if (res.hasNext()) {
            throw [g_lib.ERR_IN_USE, "A duplicate allocation delete task was found."];
        }

        var path =
            repo.path +
            (a_subject_id.charAt(0) == "p" ? "project/" : "user/") +
            a_subject_id.substr(2) +
            "/";
        var state = {
            repo_id: a_repo_id,
            subject: a_subject_id,
            repo_path: path,
        };
        var task = obj._createTask(a_client._id, g_lib.TT_ALLOC_DEL, 2, state);

        if (
            g_proc._lockDepsGeneral(task._id, [
                {
                    id: a_repo_id,
                    lev: 1,
                    ctx: a_subject_id,
                },
                {
                    id: a_subject_id,
                    lev: 0,
                },
            ])
        ) {
            task = g_db.task.update(
                task._id,
                {
                    status: g_lib.TS_BLOCKED,
                    msg: "Queued",
                },
                {
                    returnNew: true,
                    waitForSync: true,
                },
            ).new;
        }

        return {
            task: task,
        };
    };

    obj.taskRunAllocDelete = function (a_task) {
        console.log("taskRunAllocDelete");

        var reply,
            state = a_task.state;

        // No rollback functionality
        if (a_task.step < 0) return;

        if (a_task.step == 0) {
            // Delete alloc edge, request repo path delete
            obj._transact(
                function () {
                    g_db.alloc.removeByExample({
                        _from: state.subject,
                        _to: state.repo_id,
                    });
                    reply = {
                        cmd: g_lib.TC_ALLOC_DELETE,
                        params: {
                            repo_id: state.repo_id,
                            repo_path: state.repo_path,
                        },
                        step: a_task.step,
                    };
                },
                [],
                ["alloc"],
            );
        } else {
            // Complete task
            obj._transact(
                function () {
                    reply = {
                        cmd: g_lib.TC_STOP,
                        params: obj.taskComplete(a_task._id, true),
                    };
                },
                [],
                ["task"],
                ["lock", "block"],
            );
        }

        return reply;
    };

    // ----------------------- DATA GET ----------------------------

    obj.taskInitDataGet = function (a_client, a_path, a_encrypt, a_res_ids, a_orig_fname, a_check) {
        console.log("taskInitDataGet");

        var result = g_proc.preprocessItems(a_client, null, a_res_ids, g_lib.TT_DATA_GET);

        if (result.glob_data.length + result.ext_data.length > 0 && !a_check) {
            var idx = a_path.indexOf("/");
            if (idx == -1)
                throw [g_lib.ERR_INVALID_PARAM, "Invalid destination path (must include endpoint)"];

            // Check for duplicate names
            if (a_orig_fname) {
                var fname,
                    fnames = new Set();

                for (i in result.glob_data) {
                    fname = result.glob_data[i].source.substr(
                        result.glob_data[i].source.lastIndexOf("/") + 1,
                    );
                    if (fnames.has(fname)) {
                        throw [
                            g_lib.ERR_XFR_CONFLICT,
                            "Duplicate filename(s) detected in transfer request.",
                        ];
                    }

                    fnames.add(fname);
                }

                for (i in result.ext_data) {
                    fname = result.ext_data[i].source.substr(
                        result.ext_data[i].source.lastIndexOf("/") + 1,
                    );
                    if (fnames.has(fname)) {
                        throw [
                            g_lib.ERR_XFR_CONFLICT,
                            "Duplicate filename(s) detected in transfer request.",
                        ];
                    }

                    fnames.add(fname);
                }
            }

            var state = {
                    path: a_path,
                    encrypt: a_encrypt,
                    orig_fname: a_orig_fname,
                    glob_data: result.glob_data,
                    ext_data: result.ext_data,
                },
                task = obj._createTask(a_client._id, g_lib.TT_DATA_GET, 2, state),
                i,
                dep_ids = [];

            // Determine if any other tasks use the selected records and queue this task if needed

            for (i in result.glob_data) dep_ids.push(result.glob_data[i]._id);

            for (i in result.ext_data) dep_ids.push(result.ext_data[i]._id);

            if (g_proc._processTaskDeps(task._id, dep_ids, 0, 0)) {
                task = g_db._update(
                    task._id,
                    {
                        status: g_lib.TS_BLOCKED,
                        msg: "Queued",
                    },
                    {
                        returnNew: true,
                    },
                ).new;
            }

            result.task = task;
        }

        return result;
    };

    obj.taskRunDataGet = function (a_task) {
        console.log("taskRunDataGet");

        var reply,
            state = a_task.state;

        // No rollback functionality
        if (a_task.step < 0) return;

        if (a_task.step == 0) {
            //console.log("taskRunDataGet - do setup");
            obj._transact(
                function () {
                    // Generate transfer steps
                    state.xfr = obj._buildTransferDoc(
                        g_lib.TT_DATA_GET,
                        state.glob_data,
                        state.ext_data,
                        state.path,
                        state.orig_fname,
                    );
                    // Update step info
                    a_task.step = 1;
                    a_task.steps = state.xfr.length + 2;
                    // Update task
                    g_db._update(a_task._id, {
                        step: a_task.step,
                        steps: a_task.steps,
                        state: {
                            xfr: state.xfr,
                        },
                        ut: Math.floor(Date.now() / 1000),
                    });
                    // Fall-through to initiate first transfer
                },
                ["repo", "loc"],
                ["task"],
            );
        }

        if (a_task.step < a_task.steps - 1) {
            //console.log("taskRunDataGet - do xfr");
            // Transfer data step

            var tokens = g_lib.getAccessToken(a_task.client);
            var params = {
                uid: a_task.client,
                type: a_task.type,
                encrypt: state.encrypt,
                acc_tok: tokens.acc_tok,
                ref_tok: tokens.ref_tok,
                acc_tok_exp_in: tokens.acc_tok_exp_in,
            };
            params = Object.assign(params, state.xfr[a_task.step - 1]);

            reply = {
                cmd: g_lib.TC_RAW_DATA_TRANSFER,
                params: params,
                step: a_task.step,
            };
        } else {
            //console.log("taskRunDataGet - complete task");
            obj._transact(
                function () {
                    // Last step - complete task
                    reply = {
                        cmd: g_lib.TC_STOP,
                        params: obj.taskComplete(a_task._id, true),
                    };
                },
                [],
                ["task"],
                ["lock", "block"],
            );
        }

        return reply;
    };

    // ----------------------- DATA PUT ----------------------------

    obj.taskInitDataPut = function (a_client, a_path, a_encrypt, a_ext, a_res_ids, a_check) {
        console.log("taskInitDataPut");

        var result = g_proc.preprocessItems(a_client, null, a_res_ids, g_lib.TT_DATA_PUT);

        if (result.glob_data.length > 0 && !a_check) {
            var idx = a_path.indexOf("/");
            if (idx == -1)
                throw [g_lib.ERR_INVALID_PARAM, "Invalid destination path (must include endpoint)"];

            var state = {
                path: a_path,
                encrypt: a_encrypt,
                ext: a_ext,
                glob_data: result.glob_data,
            };
            var task = obj._createTask(a_client._id, g_lib.TT_DATA_PUT, 2, state);

            var dep_ids = [];
            for (var i in result.glob_data) dep_ids.push(result.glob_data[i].id);

            if (g_proc._processTaskDeps(task._id, dep_ids, 1, 0)) {
                task = g_db._update(
                    task._id,
                    {
                        status: g_lib.TS_BLOCKED,
                        msg: "Queued",
                    },
                    {
                        returnNew: true,
                    },
                ).new;
            }

            result.task = task;
        }

        return result;
    };

    obj.taskRunDataPut = function (a_task) {
        console.log("taskRunDataPut");
        var reply,
            state = a_task.state,
            params,
            xfr,
            retry;

        // No rollback functionality
        if (a_task.step < 0) return;

        console.log("taskRunDataPut begin Step: ", a_task.step);
        if (a_task.step == 0) {
            //console.log("taskRunDataPut - do setup");
            obj._transact(
                function () {
                    // Generate transfer steps
                    state.xfr = obj._buildTransferDoc(
                        g_lib.TT_DATA_PUT,
                        state.glob_data,
                        null,
                        state.path,
                        false,
                    );
                    // Update step info
                    a_task.step = 1;
                    a_task.steps = state.xfr.length + 3;
                    // Update task
                    g_db._update(a_task._id, {
                        step: a_task.step,
                        steps: a_task.steps,
                        state: {
                            xfr: state.xfr,
                        },
                        ut: Math.floor(Date.now() / 1000),
                    });
                    // Fall-through to initiate first transfer
                },
                ["repo", "loc"],
                ["task"],
            );
        }

        if (a_task.step < a_task.steps - 2) {
            //console.log("taskRunDataPut - do xfr");
            // Transfer data step

            var tokens = g_lib.getAccessToken(a_task.client);
            params = {
                uid: a_task.client,
                type: a_task.type,
                encrypt: state.encrypt,
                acc_tok: tokens.acc_tok,
                ref_tok: tokens.ref_tok,
                acc_tok_exp_in: tokens.acc_tok_exp_in,
            };
            params = Object.assign(params, state.xfr[a_task.step - 1]);
            reply = {
                cmd: g_lib.TC_RAW_DATA_TRANSFER,
                params: params,
                step: a_task.step,
            };
        } else if (a_task.step < a_task.steps - 1) {
            xfr = state.xfr[a_task.step - 2];

            // Update source, extention, manual/auto
            var rec = g_db.d.document(xfr.files[0].id),
                upd_rec = {};

            upd_rec.source = state.path;

            if (state.ext) {
                upd_rec.ext = state.ext;
                upd_rec.ext_auto = false;

                if (upd_rec.ext.charAt(0) != ".") upd_rec.ext = "." + upd_rec.ext;
            } else if (rec.ext_auto) {
                var src = xfr.files[0].from;

                // Extention starts at LAST "." filename
                var pos = src.lastIndexOf(".");
                if (pos != -1) {
                    upd_rec.ext = src.substr(pos);
                } else {
                    upd_rec.ext = null;
                }
            }

            // Must do this in a retry loop in case of concurrent (non-put) updates
            retry = 10;

            for (;;) {
                try {
                    obj._transact(
                        function () {
                            g_db._update(xfr.files[0].id, upd_rec, {
                                keepNull: false,
                            });
                        },
                        [],
                        ["d"],
                        [],
                    );
                    break;
                } catch (e) {
                    if (--retry === 0 || !e.errorNum || e.errorNum != 1200) {
                        throw e;
                    }
                }
            }

            // Request data size update
            params = {
                repo_id: xfr.dst_repo_id,
                repo_path: xfr.dst_repo_path,
                ids: [xfr.files[0].id],
            };

            console.log("Printing params in task update size");
            console.log(params);
            reply = {
                cmd: g_lib.TC_RAW_DATA_UPDATE_SIZE,
                params: params,
                step: a_task.step,
            };
        } else {
            //console.log("taskRunDataPut - complete task");
            obj._transact(
                function () {
                    // Last step - complete task
                    reply = {
                        cmd: g_lib.TC_STOP,
                        params: obj.taskComplete(a_task._id, true),
                    };
                },
                [],
                ["task"],
                ["lock", "block"],
            );
        }

        console.log("taskRunDataPut final reply");
        console.log(reply);
        return reply;
    };

    // ----------------------- ALLOCATION CHANGE ----------------------------

    /* Move records with managed data to the specified destination repository.
    Requires removing old "loc" edges and creating new ones between the affected
    records and the destination repository, and updating the statistics of all
    involved allocations. Unmanaged records do not use allocations and are ignored.
    */
    obj.taskInitRecAllocChg = function (a_client, a_proj_id, a_res_ids, a_dst_repo_id, a_check) {
        console.log("taskInitRecAllocChg");

        // Verify that client is owner, or has admin permission to project owner
        var owner_id;

        if (a_proj_id) {
            if (!g_db.p.exists(a_proj_id))
                throw [g_lib.ERR_INVALID_PARAM, "Project '" + a_proj_id + "' does not exist."];

            if (!g_lib.hasManagerPermProj(a_client, a_proj_id))
                throw [g_lib.ERR_PERM_DENIED, "Operation requires admin permissions to project."];

            owner_id = a_proj_id;
        } else {
            owner_id = a_client._id;
        }

        // Verify destination repo
        if (!g_db.repo.exists(a_dst_repo_id))
            throw [g_lib.ERR_INVALID_PARAM, "No such repo '" + a_dst_repo_id + "'"];

        // Verify client/owner has an allocation
        var alloc = g_db.alloc.firstExample({
            _from: owner_id,
            _to: a_dst_repo_id,
        });
        if (!alloc) throw [g_lib.ERR_INVALID_PARAM, "No allocation on '" + a_dst_repo_id + "'"];

        var result = g_proc.preprocessItems(
            {
                _id: owner_id,
                is_admin: false,
            },
            null,
            a_res_ids,
            g_lib.TT_REC_ALLOC_CHG,
        );

        var i,
            loc,
            rec,
            rec_ids = [];

        result.tot_cnt = result.ext_data.length + result.glob_data.length;
        result.act_size = 0;

        for (i in result.glob_data) {
            rec = result.glob_data[i];
            loc = g_db.loc.firstExample({
                _from: rec.id,
            });
            if (loc && loc._to != a_dst_repo_id) {
                rec_ids.push(rec.id);
                if (rec.size) {
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
        if (rec_ids.length === 0 || a_check) return result;

        var state = {
            encrypt: 1,
            glob_data: result.glob_data,
            dst_repo_id: a_dst_repo_id,
            owner_id: owner_id,
        };
        var task = obj._createTask(a_client._id, g_lib.TT_REC_ALLOC_CHG, 2, state);

        if (g_proc._processTaskDeps(task._id, rec_ids, 1, 0)) {
            task = g_db._update(
                task._id,
                {
                    status: g_lib.TS_BLOCKED,
                    msg: "Queued",
                },
                {
                    returnNew: true,
                },
            ).new;
        }

        result.task = task;

        return result;
    };

    obj.taskRunRecAllocChg = function (a_task) {
        console.log("taskRunRecAllocChg");

        var reply,
            state = a_task.state,
            params,
            xfr,
            alloc,
            substep,
            xfrnum;

        // TODO Add rollback functionality
        if (a_task.step < 0) {
            var step = -a_task.step;
            //console.log("taskRunRecAllocChg - rollback step: ", step );

            if (step > 1 && step < a_task.steps - 1) {
                substep = (step - 2) % 4;
                xfrnum = Math.floor((step - 2) / 4);
                xfr = state.xfr[xfrnum];
                //console.log("taskRunRecAllocChg - rollback substep: ", substep );

                // Only action is to revert location in DB if transfer failed.
                if (substep > 0 && substep < 3) {
                    obj._transact(
                        function () {
                            //console.log("taskRunRecAllocChg - recMoveRevert" );
                            obj.recMoveRevert(xfr.files);

                            // Update task step
                            a_task.step -= substep;
                            g_db._update(a_task._id, {
                                step: a_task.step,
                                ut: Math.floor(Date.now() / 1000),
                            });
                        },
                        [],
                        ["loc", "task"],
                    );
                }
            }

            return;
        }

        if (a_task.step == 0) {
            //console.log("taskRunRecAllocChg - do setup");
            obj._transact(
                function () {
                    // Generate transfer steps
                    state.xfr = obj._buildTransferDoc(
                        g_lib.TT_REC_ALLOC_CHG,
                        state.glob_data,
                        null,
                        state.dst_repo_id,
                        false,
                        state.owner_id,
                    );
                    // Recalculate number of steps
                    a_task.step = 1;
                    a_task.steps = state.xfr.length * 4 + 2;
                    // Update task
                    g_db._update(a_task._id, {
                        step: a_task.step,
                        steps: a_task.steps,
                        state: {
                            xfr: state.xfr,
                        },
                        ut: Math.floor(Date.now() / 1000),
                    });
                    // Fall-through to initiate first transfer
                },
                ["repo", "loc"],
                ["task"],
            );
        }

        if (a_task.step > 0 && a_task.step < a_task.steps - 1) {
            substep = (a_task.step - 1) % 4;
            xfrnum = Math.floor((a_task.step - 1) / 4);
            xfr = state.xfr[xfrnum];
            //console.log("taskRunRecAllocChg - xfr num",xfrnum,"substep",substep);

            switch (substep) {
                case 0:
                    //console.log("taskRunRecAllocChg - init move");
                    obj._transact(
                        function () {
                            // Ensure allocation has sufficient record and data capacity
                            alloc = g_db.alloc.firstExample({
                                _from: state.owner_id,
                                _to: state.dst_repo_id,
                            });
                            if (alloc.rec_count + xfr.files.length > alloc.rec_limit)
                                throw [
                                    g_lib.ERR_PERM_DENIED,
                                    "Allocation record count limit exceeded on " +
                                        state.dst_repo_id,
                                ];
                            if (alloc.data_size + xfr.size > alloc.data_limit)
                                throw [
                                    g_lib.ERR_PERM_DENIED,
                                    "Allocation data size limit exceeded on " + state.dst_repo_id,
                                ];

                            // Init record move
                            obj.recMoveInit(xfr.files, state.dst_repo_id);

                            // TEST ONLY
                            //throw [g_lib.ERR_INTERNAL_FAULT,"TEST ONLY ERROR"];

                            // Update task step
                            a_task.step += 1;
                            g_db._update(a_task._id, {
                                step: a_task.step,
                                ut: Math.floor(Date.now() / 1000),
                            });
                        },
                        [],
                        ["loc", "task"],
                    );
                /* falls through */
                case 1:
                    //console.log("taskRunRecAllocChg - do xfr");
                    // Transfer data step

                    var tokens = g_lib.getAccessToken(a_task.client);
                    params = {
                        uid: a_task.client,
                        type: a_task.type,
                        encrypt: state.encrypt,
                        acc_tok: tokens.acc_tok,
                        ref_tok: tokens.ref_tok,
                        acc_tok_exp_in: tokens.acc_tok_exp_in,
                    };
                    params = Object.assign(params, xfr);
                    reply = {
                        cmd: g_lib.TC_RAW_DATA_TRANSFER,
                        params: params,
                        step: a_task.step,
                    };
                    break;
                case 2:
                    //console.log("taskRunRecAllocChg - finalize move");
                    obj._transact(
                        function () {
                            // Init record move
                            obj.recMoveFini(xfr.files);

                            // Update task step
                            a_task.step += 1;
                            g_db._update(a_task._id, {
                                step: a_task.step,
                                ut: Math.floor(Date.now() / 1000),
                            });
                        },
                        [],
                        ["loc", "alloc", "task"],
                    );
                /* falls through */
                case 3:
                    //console.log("taskRunRecAllocChg - delete old data");
                    // Request data size update
                    params = {
                        repo_id: xfr.src_repo_id,
                        repo_path: xfr.src_repo_path,
                    };
                    params.ids = [];
                    for (var i in xfr.files) {
                        params.ids.push(xfr.files[i].id);
                    }

                    reply = {
                        cmd: g_lib.TC_RAW_DATA_DELETE,
                        params: params,
                        step: a_task.step,
                    };
                    break;
            }
        } else {
            //console.log("taskRunRecAllocChg - complete task");
            obj._transact(
                function () {
                    // Last step - complete task
                    reply = {
                        cmd: g_lib.TC_STOP,
                        params: obj.taskComplete(a_task._id, true),
                    };
                },
                [],
                ["task"],
                ["lock", "block"],
            );
        }

        return reply;
    };

    // ----------------------- OWNER CHANGE ----------------------------

    /* Move records to the specified new owner and destination collection and
    repository. Requires removing old "owner" and "loc" edges and creating new
    ones between the affected records and the destination owner and repository,
    and updating the statistics of all involved allocations. Unmanaged records
    do not use allocations, so only ownership is updated.
    */

    obj.taskInitRecOwnerChg = function (
        a_client,
        a_res_ids,
        a_dst_coll_id,
        a_dst_repo_id,
        a_check,
    ) {
        // Verify destination collection

        if (!g_db.c.exists(a_dst_coll_id))
            throw [g_lib.ERR_INVALID_PARAM, "No such collection '" + a_dst_coll_id + "'"];

        var owner_id = g_db.owner.firstExample({
            _from: a_dst_coll_id,
        })._to;

        if (owner_id != a_client._id) {
            if (owner_id.charAt(0) != "p" || !g_lib.hasManagerPermProj(a_client, owner_id)) {
                var coll = g_db.c.document(a_dst_coll_id);

                if (!g_lib.hasPermissions(a_client, coll, g_lib.PERM_CREATE))
                    throw [
                        g_lib.ERR_PERM_DENIED,
                        "Operation requires CREATE permission on destination collection '" +
                            a_dst_coll_id +
                            "'",
                    ];
            }
        }

        var allocs;

        if (a_check) {
            // Get a list of available repos for client to pick from (there must be at least one)
            allocs = g_db.alloc
                .byExample({
                    _from: owner_id,
                })
                .toArray();
            if (!allocs.length)
                throw [g_lib.ERR_PERM_DENIED, "No allocations available for '" + owner_id + "'"];

            g_lib.sortAllocations(allocs);
        } else {
            // Verify destination repo
            if (!g_db.repo.exists(a_dst_repo_id))
                throw [g_lib.ERR_INVALID_PARAM, "No such repo '" + a_dst_repo_id + "'"];

            // Verify client/owner has an allocation
            if (
                !g_db.alloc.firstExample({
                    _from: owner_id,
                    _to: a_dst_repo_id,
                })
            )
                throw [g_lib.ERR_INVALID_PARAM, "No allocation on '" + a_dst_repo_id + "'"];
        }

        var result = g_proc.preprocessItems(a_client, owner_id, a_res_ids, g_lib.TT_REC_OWNER_CHG);

        if (result.has_pub) {
            throw [
                g_lib.ERR_PERM_DENIED,
                "Owner change not allowed - selection contains public data.",
            ];
        }

        var i,
            loc,
            rec,
            deps = [];

        result.tot_cnt = result.ext_data.length + result.glob_data.length;
        result.act_size = 0;

        for (i in result.ext_data) {
            rec = result.ext_data[i];
            if (rec.owner != owner_id) {
                deps.push({
                    id: rec.id,
                    lev: 1,
                });
            }
        }

        for (i in result.glob_data) {
            rec = result.glob_data[i];
            loc = g_db.loc.firstExample({
                _from: rec.id,
            });
            if (loc.uid != owner_id || loc._to != a_dst_repo_id) {
                deps.push({
                    id: rec.id,
                    lev: 1,
                });
                if (rec.size) {
                    result.act_size += rec.size;
                }
            }
        }

        result.act_cnt = deps.length;

        if (a_check) {
            for (i in allocs) {
                rec = allocs[i];
                rec.repo = rec._to;
                delete rec._id;
            }
            result.allocs = allocs;
        }

        // Stop if no record to process, or if this is just a check
        if (deps.length === 0 || a_check) return result;

        // Add additional dependencies for locks
        deps.push({
            id: a_dst_coll_id,
            lev: 0,
        });
        deps.push({
            id: owner_id,
            lev: 0,
        });
        deps.push({
            id: a_dst_repo_id,
            lev: 1,
            ctx: owner_id,
        });

        var state = {
            encrypt: 1,
            ext_data: result.ext_data,
            glob_data: result.glob_data,
            dst_coll_id: a_dst_coll_id,
            dst_repo_id: a_dst_repo_id,
            owner_id: owner_id,
        };
        var task = obj._createTask(a_client._id, g_lib.TT_REC_OWNER_CHG, 3, state);
        if (g_proc._lockDepsGeneral(task._id, deps)) {
            task = g_db._update(
                task._id,
                {
                    status: g_lib.TS_BLOCKED,
                    msg: "Queued",
                },
                {
                    returnNew: true,
                },
            ).new;
        }

        result.task = task;

        return result;
    };

    obj.taskRunRecOwnerChg = function (a_task) {
        console.log("taskRunRecOwnerChg");

        var reply,
            state = a_task.state,
            params,
            xfr,
            alloc,
            substep,
            xfrnum;

        // TODO Add rollback functionality
        if (a_task.step < 0) {
            var step = -a_task.step;
            //console.log("taskRunRecOwnerChg - rollback step: ", step );

            if (step > 1 && step < a_task.steps - 1) {
                substep = (step - 2) % 4;
                xfrnum = Math.floor((step - 2) / 4);
                xfr = state.xfr[xfrnum];
                //console.log("taskRunRecOwnerChg - rollback substep: ", substep );

                // Only action is to revert location in DB if transfer failed.
                if (substep > 0 && substep < 3) {
                    obj._transact(
                        function () {
                            //console.log("taskRunRecOwnerChg - recMoveRevert" );
                            obj.recMoveRevert(xfr.files);

                            // Update task step
                            a_task.step -= substep;
                            g_db._update(a_task._id, {
                                step: a_task.step,
                                ut: Math.floor(Date.now() / 1000),
                            });
                        },
                        [],
                        ["loc", "task"],
                    );
                }
            }

            return;
        }

        if (a_task.step == 0) {
            //console.log("taskRunRecOwnerChg - do setup");
            obj._transact(
                function () {
                    // Generate transfer steps
                    state.xfr = obj._buildTransferDoc(
                        g_lib.TT_REC_OWNER_CHG,
                        state.glob_data,
                        null,
                        state.dst_repo_id,
                        false,
                        state.owner_id,
                    );
                    // Update step info
                    a_task.step = 1;
                    a_task.steps = state.xfr.length * 4 + 3;
                    // Update task
                    g_db._update(a_task._id, {
                        step: a_task.step,
                        steps: a_task.steps,
                        state: {
                            xfr: state.xfr,
                        },
                        ut: Math.floor(Date.now() / 1000),
                    });
                    // Fall-through to initiate first transfer
                },
                ["repo", "loc"],
                ["task"],
            );
        }

        if (a_task.step === 1) {
            //console.log("taskRunRecOwnerChg - move unmanaged records");
            obj._transact(
                function () {
                    if (state.ext_data.length) {
                        obj.recMoveExt(state.ext_data, state.owner_id, state.dst_coll_id);
                    }

                    // Update task step
                    a_task.step = 2;
                    g_db._update(a_task._id, {
                        step: a_task.step,
                        ut: Math.floor(Date.now() / 1000),
                    });
                    // Fall-through to next step
                },
                ["c"],
                ["loc", "alloc", "acl", "d", "owner", "item", "task", "a", "alias"],
            );
        }

        if (a_task.step > 1 && a_task.step < a_task.steps - 1) {
            substep = (a_task.step - 2) % 4;
            xfrnum = Math.floor((a_task.step - 2) / 4);
            xfr = state.xfr[xfrnum];
            //console.log("taskRunRecOwnerChg - xfr num",xfrnum,"substep",substep);

            switch (substep) {
                case 0:
                    //console.log("taskRunRecOwnerChg - init move");
                    obj._transact(
                        function () {
                            // Ensure allocation has sufficient record and data capacity
                            alloc = g_db.alloc.firstExample({
                                _from: state.owner_id,
                                _to: state.dst_repo_id,
                            });
                            if (alloc.rec_count + xfr.files.length > alloc.rec_limit)
                                throw [
                                    g_lib.ERR_PERM_DENIED,
                                    "Allocation record count limit exceeded on " +
                                        state.dst_repo_id,
                                ];
                            if (alloc.data_size + xfr.size > alloc.data_limit)
                                throw [
                                    g_lib.ERR_PERM_DENIED,
                                    "Allocation data size limit exceeded on " + state.dst_repo_id,
                                ];

                            // Init record move
                            obj.recMoveInit(
                                xfr.files,
                                state.dst_repo_id,
                                state.owner_id,
                                state.dst_coll_id,
                            );

                            // Update task step
                            a_task.step += 1;
                            g_db._update(a_task._id, {
                                step: a_task.step,
                                ut: Math.floor(Date.now() / 1000),
                            });
                        },
                        [],
                        ["loc", "task"],
                    );
                /* falls through */
                case 1:
                    //console.log("taskRunRecOwnerChg - do xfr");
                    // Transfer data step

                    var tokens = g_lib.getAccessToken(a_task.client);
                    params = {
                        uid: a_task.client,
                        type: a_task.type,
                        encrypt: state.encrypt,
                        acc_tok: tokens.acc_tok,
                        ref_tok: tokens.ref_tok,
                        acc_tok_exp_in: tokens.acc_tok_exp_in,
                    };
                    params = Object.assign(params, xfr);
                    reply = {
                        cmd: g_lib.TC_RAW_DATA_TRANSFER,
                        params: params,
                        step: a_task.step,
                    };
                    break;
                case 2:
                    //console.log("taskRunRecOwnerChg - finalize move");
                    obj._transact(
                        function () {
                            // Init record move
                            obj.recMoveFini(xfr.files);

                            // Update task step
                            a_task.step += 1;
                            g_db._update(a_task._id, {
                                step: a_task.step,
                                ut: Math.floor(Date.now() / 1000),
                            });
                        },
                        ["c"],
                        ["loc", "alloc", "acl", "d", "owner", "item", "task", "a", "alias"],
                    );
                /* falls through */
                case 3:
                    //console.log("taskRunRecOwnerChg - delete old data");
                    // Request data size update
                    params = {
                        repo_id: xfr.src_repo_id,
                        repo_path: xfr.src_repo_path,
                    };
                    params.ids = [];
                    for (var i in xfr.files) {
                        params.ids.push(xfr.files[i].id);
                    }

                    reply = {
                        cmd: g_lib.TC_RAW_DATA_DELETE,
                        params: params,
                        step: a_task.step,
                    };
                    break;
            }
        } else {
            //console.log("taskRunRecOwnerChg - complete task");
            obj._transact(
                function () {
                    // Last step - complete task
                    reply = {
                        cmd: g_lib.TC_STOP,
                        params: obj.taskComplete(a_task._id, true),
                    };
                },
                [],
                ["task"],
                ["lock", "block"],
            );
        }

        return reply;
    };

    obj.taskInitRecCollDelete = function (a_client, a_ids) {
        console.log("taskInitRecCollDelete start", Date.now());

        var result = g_proc.preprocessItems(a_client, null, a_ids, g_lib.TT_REC_DEL);

        if (result.has_pub) {
            throw [g_lib.ERR_PERM_DENIED, "Deletion not allowed - selection contains public data."];
        }

        var i,
            rec_ids = [];

        //console.log("Extern recs:", result.ext_data.length, ", Globus recs:", result.glob_data.length );

        for (i in result.ext_data) {
            rec_ids.push(result.ext_data[i].id);
        }

        for (i in result.glob_data) rec_ids.push(result.glob_data[i].id);

        obj._ensureExclusiveAccess(rec_ids);

        var state = {};

        //console.log("ext_data:",result.ext_data);
        //console.log("glob_data:",result.glob_data);
        //console.log("rec_ids:",rec_ids);
        //console.log("del coll:",result.coll);
        //throw [1,"Stop for debug"];

        // For deleted collections, unlink all contained items
        if (result.coll.length) {
            state.del_coll = result.coll;
            for (i in result.coll) {
                g_db.item.removeByExample({
                    _to: result.coll[i],
                });
            }
        }

        state.del_rec = [];

        if (result.ext_data.length) {
            for (i in result.ext_data) {
                state.del_rec.push(result.ext_data[i].id);
                g_db.item.removeByExample({
                    _to: result.ext_data[i].id,
                });
            }
        }

        if (result.glob_data.length) {
            state.del_data = obj._buildDeleteDoc(result.glob_data);

            for (i in result.glob_data) {
                state.del_rec.push(result.glob_data[i].id);
                g_db.item.removeByExample({
                    _to: result.glob_data[i].id,
                });
            }
        } else {
            state.del_data = [];
        }

        result.task = obj._createTask(
            a_client._id,
            g_lib.TT_REC_DEL,
            state.del_data.length + 2,
            state,
        );

        //console.log("taskInitRecCollDelete finished",Date.now());
        return result;
    };

    obj.taskRunRecCollDelete = function (a_task) {
        console.log("taskRunRecCollDelete");

        var i,
            reply,
            state = a_task.state,
            retry;

        // No rollback functionality
        if (a_task.step < 0) return;

        if (a_task.step == 0) {
            retry = 10;

            for (;;) {
                try {
                    obj._transact(
                        function () {
                            //console.log("Del collections",Date.now());

                            for (i in state.del_coll) {
                                // TODO Adjust for collection limit on allocation
                                obj._deleteCollection(state.del_coll[i]);
                            }

                            //console.log("Del records",Date.now());

                            // Delete records with no data
                            if (state.del_rec.length) {
                                obj._deleteDataRecords(state.del_rec);
                            }

                            // Update task step
                            a_task.step += 1;
                            g_db._update(a_task._id, {
                                step: a_task.step,
                                ut: Math.floor(Date.now() / 1000),
                            });
                        },
                        [],
                        [
                            "d",
                            "c",
                            "a",
                            "alias",
                            "owner",
                            "item",
                            "acl",
                            "loc",
                            "alloc",
                            "t",
                            "top",
                            "dep",
                            "n",
                            "note",
                            "task",
                            "tag",
                            "sch",
                        ],
                    );
                    break;
                } catch (e) {
                    if (--retry == 0 || !e.errorNum || e.errorNum != 1200) {
                        throw e;
                    }
                }
            }
            // Continue to next step
        }

        if (a_task.step < a_task.steps - 1) {
            //console.log("taskRunRecCollDelete - del", a_task.step, Date.now() );
            reply = {
                cmd: g_lib.TC_RAW_DATA_DELETE,
                params: state.del_data[a_task.step - 1],
                step: a_task.step,
            };
        } else {
            //console.log("taskRunRecCollDelete - complete task", Date.now() );
            obj._transact(
                function () {
                    // Last step - complete task
                    reply = {
                        cmd: g_lib.TC_STOP,
                        params: obj.taskComplete(a_task._id, true),
                    };
                },
                [],
                ["task"],
                ["lock", "block"],
            );
        }

        return reply;
    };

    // ----------------------- External Support Functions ---------------------

    /**
     * Deletes one or more projects and associated data. If a project has no allocations, it can
     * be deleted immediately. If a project has allocations and raw data, a task must be initialized
     * to delete the allocations. Deletion is exclusive—if any other tasks are using the project or
     * associated data, the operation will be denied.
     *
     * @param {object} a_client - The client object that contains user details and permissions.
     * @param {Array<string>} a_proj_ids - An array of project IDs to be deleted.
     * @returns {object} An object containing the task to delete the projects and allocations.
     * @throws {Array} Throws an error array containing a code and message if the project does
     * not exist or the client lacks permissions.
     *
     * @example
     * const result = obj.taskInitProjDelete(client, ['proj_id_1', 'proj_id_2']);
     * console.log(result);
     */
    obj.taskInitProjDelete = function (a_client, a_proj_ids) {
        var i, proj_id;

        // Verify existence and check permission
        for (i in a_proj_ids) {
            proj_id = a_proj_ids[i];
            if (!g_db.p.exists(proj_id))
                throw [g_lib.ERR_INVALID_PARAM, "No such project '" + proj_id + "'"];

            g_lib.ensureAdminPermProj(a_client, proj_id);
        }

        obj._ensureExclusiveAccess(a_proj_ids);

        var allocs, alloc, gr;
        var state = {
            proj_ids: [],
            allocs: [],
        };

        // For each project, determine allocation/raw data status and take appropriate actions
        for (i in a_proj_ids) {
            proj_id = a_proj_ids[i];

            state.proj_ids.push(proj_id);

            allocs = g_db.alloc.byExample({
                _from: proj_id,
            });
            while (allocs.hasNext()) {
                alloc = allocs.next();
                state.allocs.push({
                    repo_id: alloc._to,
                    repo_path: alloc.path,
                });
            }

            // Remove owner, admins, members to prevent access
            g_db.owner.removeByExample({
                _from: proj_id,
            });
            g_db.admin.removeByExample({
                _from: proj_id,
            });

            gr = g_db.g.byExample({
                uid: proj_id,
                gid: "members",
            });
            if (gr.hasNext()) {
                g_graph.g.remove(gr.next()._id);
            }
        }

        var result = {
            task: obj._createTask(a_client._id, g_lib.TT_PROJ_DEL, state.allocs.length + 2, state),
        };

        return result;
    };

    obj.taskRunProjDelete = function (a_task) {
        console.log("taskRunProjDelete");

        var reply,
            state = a_task.state;

        // No rollback functionality
        if (a_task.step < 0) {
            return;
        }

        if (a_task.step == 0) {
            obj._transact(
                function () {
                    //console.log("Del projects",Date.now());

                    for (var i in state.proj_ids) {
                        obj._projectDelete(state.proj_ids[i]);
                    }

                    // Update task step
                    a_task.step += 1;
                    g_db._update(a_task._id, {
                        step: a_task.step,
                        ut: Math.floor(Date.now() / 1000),
                    });
                },
                [],
                [
                    "d",
                    "c",
                    "p",
                    "a",
                    "g",
                    "alias",
                    "owner",
                    "item",
                    "acl",
                    "loc",
                    "alloc",
                    "t",
                    "top",
                    "dep",
                    "n",
                    "note",
                    "task",
                    "tag",
                    "sch",
                ],
            );

            // Continue to next step
        }

        if (a_task.step < a_task.steps - 1) {
            // Request repo path delete
            reply = {
                cmd: g_lib.TC_ALLOC_DELETE,
                params: state.allocs[a_task.step - 1],
                step: a_task.step,
            };
        } else {
            // Complete task
            obj._transact(
                function () {
                    reply = {
                        cmd: g_lib.TC_STOP,
                        params: obj.taskComplete(a_task._id, true),
                    };
                },
                [],
                ["task"],
                ["lock", "block"],
            );
        }

        return reply;
    };

    // ----------------------- External Support Functions ---------------------

    obj.taskGetRunFunc = function (a_task) {
        switch (a_task.type) {
            case g_lib.TT_DATA_GET:
                return obj.taskRunDataGet;
            case g_lib.TT_DATA_PUT:
                return obj.taskRunDataPut;
            case g_lib.TT_DATA_DEL:
                return obj.taskRunDataDelete;
            case g_lib.TT_REC_ALLOC_CHG:
                return obj.taskRunRecAllocChg;
            case g_lib.TT_REC_OWNER_CHG:
                return obj.taskRunRecOwnerChg;
            case g_lib.TT_REC_DEL:
                return obj.taskRunRecCollDelete;
            case g_lib.TT_ALLOC_CREATE:
                return obj.taskRunAllocCreate;
            case g_lib.TT_ALLOC_DEL:
                return obj.taskRunAllocDelete;
            case g_lib.TT_USER_DEL:
                return obj.taskRunUserDelete;
            case g_lib.TT_PROJ_DEL:
                return obj.taskRunProjDelete;
            default:
                throw [g_lib.ERR_INVALID_PARAM, "Invalid task type: " + a_task.type];
        }
    };

    // ----------------------- Internal Support Functions ---------------------

    obj.taskReady = function (a_task_id) {
        g_db._update(
            a_task_id,
            {
                status: g_lib.TS_RUNNING,
                msg: "Running",
                ut: Math.floor(Date.now() / 1000),
            },
            {
                returnNew: true,
                waitForSync: true,
            },
        );
    };

    obj.taskComplete = function (a_task_id, a_success, a_msg) {
        console.log("taskComplete 1");
        var ready_tasks = [],
            dep,
            dep_blocks,
            blocks = g_db.block.byExample({
                _to: a_task_id,
            });
        var time = Math.floor(Date.now() / 1000);

        console.log("taskComplete 2");

        while (blocks.hasNext()) {
            dep = blocks.next()._from;
            dep_blocks = g_db.block
                .byExample({
                    _from: dep,
                })
                .toArray();
            // If blocked task has only one block, then it's this task being finalized and will be able to run now
            if (dep_blocks.length === 1) {
                ready_tasks.push(dep);
                //console.log("taskComplete - task", dep, "ready");
                g_db.task.update(
                    dep,
                    {
                        status: g_lib.TS_READY,
                        msg: "Pending",
                        ut: time,
                    },
                    {
                        returnNew: true,
                        waitForSync: true,
                    },
                );
            }
        }
        console.log("taskComplete 3");

        var doc;
        if (a_success) {
            doc = {
                status: g_lib.TS_SUCCEEDED,
                msg: "Finished",
            };
        } else {
            doc = {
                status: g_lib.TS_FAILED,
                msg: a_msg ? a_msg : "Failed (unknown reason)",
            };
        }

        doc.ut = time;

        console.log("taskComplete 4", doc);
        g_db.block.removeByExample({
            _to: a_task_id,
        });
        g_db.lock.removeByExample({
            _from: a_task_id,
        });
        console.log("taskComplete 5");
        var delay = 1;
        for (;;) {
            try {
                g_db.task.update(a_task_id, doc);
                break;
            } catch (e) {
                if (e.errorNum === 1200) {
                    if (delay > 64) throw e;

                    //console.log("retry sleep");
                    g_internal.sleep(0.2 * delay);
                    //console.log("do retry");

                    delay *= 2;
                } else {
                    throw e;
                }
            }
        }
        console.log("taskComplete 6");

        return ready_tasks;
    };

    obj._transact = function (a_func, a_rdc = [], a_wrc = [], a_exc = []) {
        g_db._executeTransaction({
            collections: {
                read: a_rdc,
                write: a_wrc,
                exclusive: a_exc,
            },
            lockTimeout: 0,
            waitForSync: true,
            action: a_func,
        });
    };

    obj._createTask = function (a_client_id, a_type, a_steps, a_state) {
        var time = Math.floor(Date.now() / 1000);
        var obj = {
            type: a_type,
            status: g_lib.TS_READY,
            msg: "Pending",
            ct: time,
            ut: time,
            client: a_client_id,
            step: 0,
            steps: a_steps,
            state: a_state,
        };
        var task = g_db.task.save(obj, {
            returnNew: true,
        });
        return task.new;
    };

    obj._buildTransferDoc = function (
        a_mode,
        a_data,
        a_ext_data,
        a_remote,
        a_orig_fname,
        a_dst_owner,
    ) {
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

        console.log("_buildTransferDoc", a_mode, a_remote, a_orig_fname);

        var fnames,
            i,
            idx,
            file,
            rem_ep,
            rem_fname,
            rem_path,
            xfr,
            repo_map = {},
            src;

        if (a_mode == g_lib.TT_DATA_GET || a_mode == g_lib.TT_DATA_PUT) {
            idx = a_remote.indexOf("/");
            if (idx < 1)
                throw [g_lib.ERR_INVALID_PARAM, "Invalid remote path (must include endpoint)"];

            //console.log("rem idx:",idx);

            rem_ep = a_remote.substr(0, idx);
            rem_path = a_remote.substr(idx);

            //console.log("rem ep:",rem_ep);
            //console.log("rem path:",rem_path);

            if (a_mode == g_lib.TT_DATA_GET) {
                if (rem_path.charAt(rem_path.length - 1) != "/") rem_path += "/";
            } else if (a_mode == g_lib.TT_DATA_PUT) {
                idx = rem_path.lastIndexOf("/", rem_path.length - 1);
                //console.log("new idx:",idx);

                rem_fname = rem_path.substr(idx + 1);
                rem_path = rem_path.substr(0, idx + 1);
                //console.log("rem_fname",rem_fname);
                //console.log("rem_path",rem_path);
            }
        } else {
            //console.log("should not be here!",a_mode, g_lib.TT_DATA_GET, g_lib.TT_DATA_PUT);

            var repo = g_db.repo.document(a_remote);
            rem_ep = repo.endpoint;
            rem_path =
                repo.path +
                (a_dst_owner.charAt(0) == "u" ? "user/" : "project/") +
                a_dst_owner.substr(2) +
                "/";
        }

        if (a_mode == g_lib.TT_DATA_GET) {
            fnames = new Set();
        }

        if (a_data.length) {
            var loc,
                locs = g_db._query(
                    "for i in @data for v,e in 1..1 outbound i loc return { d_id: i._id, d_sz: i.size, d_ext: i.ext, d_src: i.source, r_id: v._id, r_ep: v.endpoint, r_path: v.path, uid: e.uid }",
                    {
                        data: a_data,
                    },
                );

            //console.log("locs hasNext",locs.hasNext());

            while (locs.hasNext()) {
                loc = locs.next();
                //console.log("loc",loc);

                file = {
                    id: loc.d_id,
                    size: loc.d_sz,
                };

                switch (a_mode) {
                    case g_lib.TT_DATA_GET:
                        file.from = loc.d_id.substr(2);
                        if (a_orig_fname) {
                            file.to = loc.d_src.substr(loc.d_src.lastIndexOf("/") + 1);
                            if (fnames.has(file.to)) {
                                throw [
                                    g_lib.ERR_XFR_CONFLICT,
                                    "Duplicate filename(s) detected in transfer request.",
                                ];
                            }

                            fnames.add(file.to);

                            /*if ( loc.d_ext ){
                                idx = src.indexOf(".");
                                if ( idx > 0 ){
                                    src = src.substr(0,idx);
                                }
                                file.to = src + loc.d_ext;
                            }else{
                                file.to = src;
                            }*/
                        } else {
                            file.to = file.from + (loc.d_ext ? loc.d_ext : "");
                        }
                        break;
                    case g_lib.TT_DATA_PUT:
                        file.from = rem_fname;
                        file.to = loc.d_id.substr(2);
                        break;
                    case g_lib.TT_REC_ALLOC_CHG:
                    case g_lib.TT_REC_OWNER_CHG:
                        file.from = loc.d_id.substr(2);
                        file.to = file.from;
                        break;
                }

                //console.log("file:",file);

                if (loc.r_id in repo_map) {
                    repo_map[loc.r_id].files.push(file);
                } else {
                    repo_map[loc.r_id] = {
                        repo_id: loc.r_id,
                        repo_ep: loc.r_ep,
                        repo_path:
                            loc.r_path +
                            (loc.uid.charAt(0) == "u" ? "user/" : "project/") +
                            loc.uid.substr(2) +
                            "/",
                        files: [file],
                    };
                }
            }
        }

        // Process external data (only supported for GET)
        if (a_ext_data && a_ext_data.length) {
            var edat, ep;

            // Add external endpoints to repo_map using endpoint as ID

            for (i in a_ext_data) {
                edat = a_ext_data[i];
                file = {
                    id: edat.id,
                    size: edat.size,
                };

                idx = edat.source.indexOf("/");
                if (idx < 0) {
                    throw [g_lib.ERR_INVALID_PARAM, "Invalid external source path: " + edat.source];
                }
                ep = edat.source.substr(0, idx);
                src = edat.source.substr(idx);
                file.from = src;
                if (a_orig_fname) {
                    idx = src.lastIndexOf("/");
                    if (idx < 0) {
                        throw [
                            g_lib.ERR_INVALID_PARAM,
                            "Invalid external source path: " + edat.source,
                        ];
                    }
                    file.to = src.substr(idx + 1);
                    if (fnames.has(file.to)) {
                        throw [
                            g_lib.ERR_XFR_CONFLICT,
                            "Duplicate filename(s) detected in transfer request.",
                        ];
                    }
                } else {
                    file.to = file.id.substr(2);
                }

                if (ep in repo_map) {
                    repo_map[ep].files.push(file);
                } else {
                    repo_map[ep] = {
                        repo_id: 0, // ID 0 indicates external endpoint
                        files: [file],
                    };
                }
            }
        }

        //console.log("repo map len",Object.keys(repo_map).length);

        var rm,
            xfr_docs = [];

        if (a_mode == g_lib.TT_REC_ALLOC_CHG || a_mode == g_lib.TT_REC_OWNER_CHG) {
            var j, k, chunks, chunk_sz, files, sz;

            for (i in repo_map) {
                rm = repo_map[i];

                // Pack roughly equal transfer sizes into each transfer chunk/step

                // Sort files from largest to smallest
                rm.files.sort(function (a, b) {
                    return b.size - a.size;
                });

                chunks = [];
                chunk_sz = [];

                // Push files larger than chunk size into own transfers
                for (j = 0; j < rm.files.length; j++) {
                    file = rm.files[j];
                    if (file.size >= g_lib.GLOB_MAX_XFR_SIZE) {
                        //console.log("rec",file.id,"alone in xfr, sz:",file.size);
                        chunks.push([file]);
                        chunk_sz.push(file.size);
                    } else {
                        break;
                    }
                }

                // Remaining files are smaller than max chunk size
                // Build chunks by combining largest with smallest files
                for (; j < rm.files.length; j++) {
                    file = rm.files[j];
                    sz = file.size;
                    files = [file];
                    //console.log("rec",file.id,"first in xfr, sz:",file.size);

                    for (k = j + 1; k < rm.files.length; ) {
                        file = rm.files[k];
                        if (sz + file.size <= g_lib.GLOB_MAX_XFR_SIZE) {
                            //console.log("rec",file.id,"added to xfr, sz:",file.size);
                            files.push(file);
                            sz += file.size;
                            rm.files.splice(k, 1);
                        } else {
                            //console.log("rec",file.id,"too big for xfr, sz:",file.size,"sum",sz + file.size,"max",g_lib.GLOB_MAX_XFR_SIZE);
                            k++;
                        }
                    }

                    chunks.push(files);
                    chunk_sz.push(sz);
                }

                for (j in chunks) {
                    xfr = {
                        src_repo_id: rm.repo_id,
                        src_repo_ep: rm.repo_ep,
                        src_repo_path: rm.repo_path,
                        dst_repo_id: a_remote,
                        dst_repo_ep: rem_ep,
                        dst_repo_path: rem_path,
                        size: chunk_sz[j],
                    };

                    xfr.files = chunks[j];
                    xfr_docs.push(xfr);
                }
            }
        } else {
            for (i in repo_map) {
                rm = repo_map[i];

                if (a_mode == g_lib.TT_DATA_GET) {
                    if (rm.repo_id === 0) {
                        xfr = {
                            src_repo_id: 0,
                            src_repo_ep: i,
                            src_repo_path: "",
                            dst_repo_ep: rem_ep,
                            dst_repo_path: rem_path,
                        };
                    } else {
                        xfr = {
                            src_repo_id: rm.repo_id,
                            src_repo_ep: rm.repo_ep,
                            src_repo_path: rm.repo_path,
                            dst_repo_ep: rem_ep,
                            dst_repo_path: rem_path,
                        };
                    }
                } else {
                    xfr = {
                        src_repo_ep: rem_ep,
                        src_repo_path: rem_path,
                        dst_repo_id: rm.repo_id,
                        dst_repo_ep: rm.repo_ep,
                        dst_repo_path: rm.repo_path,
                    };
                }

                xfr.files = rm.files;
                xfr_docs.push(xfr);
            }
        }

        return xfr_docs;
    };

    obj._buildDeleteDoc = function (a_data) {
        var loc,
            locs,
            doc = [],
            repo_map = {};

        locs = g_db._query(
            "for i in @data for v,e in 1..1 outbound i loc return { d_id: i._id, r_id: v._id, r_path: v.path, uid: e.uid }",
            {
                data: a_data,
            },
        );

        //console.log("locs hasNext",locs.hasNext());

        while (locs.hasNext()) {
            loc = locs.next();

            // Delete all files regardless of raw data size (may have 0 sized files)

            if (loc.r_id in repo_map) {
                repo_map[loc.r_id].ids.push(loc.d_id);
            } else {
                repo_map[loc.r_id] = {
                    repo_id: loc.r_id,
                    repo_path:
                        loc.r_path +
                        (loc.uid.charAt(0) == "u" ? "user/" : "project/") +
                        loc.uid.substr(2) +
                        "/",
                    ids: [loc.d_id],
                };
            }
        }

        for (var i in repo_map) {
            doc.push(repo_map[i]);
        }

        return doc;
    };

    /**
     * Deletes a collection record. This function should not be called directly and is used
     * only by task or process code. The function does not recursively delete contained items.
     *
     * @param {string} a_id - The ID of the collection to delete.
     * @throws {Error} Throws an error if the collection or associated graph objects cannot be deleted.
     *
     * This function will delete aliases, notes, topics, and tags associated with the collection,
     * but it will not recursively delete contained items.
     * Use this function only within tasks or process code.
     */
    obj._deleteCollection = function (a_id) {
        // Delete alias
        var tmp = g_db.alias.firstExample({
            _from: a_id,
        });
        if (tmp) {
            g_graph.a.remove(tmp._to);
        }

        // Delete notes
        tmp = g_db.note.byExample({
            _from: a_id,
        });
        while (tmp.hasNext()) {
            g_graph.n.remove(tmp.next()._to);
        }

        // Unlink/delete topic
        tmp = g_db.top.firstExample({
            _from: a_id,
        });
        if (tmp) g_lib.topicUnlink(a_id);

        // Remove tags
        var doc = g_db.c.document(a_id);
        if (doc.tags && doc.tags.length) g_lib.removeTags(doc.tags);

        // Delete collection
        g_graph.c.remove(a_id);
    };

    /**
     * Deletes a data record and its associated graph objects. This function does not delete raw
     * data but adjusts the allocation accordingly.
     *
     * @param {string} a_id - The ID of the data record to delete.
     * @throws {Error} Throws an error if the data record or associated graph objects cannot be deleted.
     *
     * This function will delete aliases, notes, tags, and update schema counts and allocations.
     * It will not delete raw data, but it will adjust the allocation associated with the data record.
     */
    obj._deleteDataRecord = function (a_id) {
        //console.log( "delete rec", a_id );
        var doc = g_db.d.document(a_id);

        // Delete alias
        var tmp = g_db.alias.firstExample({
            _from: a_id,
        });
        if (tmp) {
            g_graph.a.remove(tmp._to);
        }

        // Delete notes and all inherted notes
        tmp = g_db.note.byExample({
            _from: a_id,
        });
        while (tmp.hasNext()) {
            g_lib.annotationDelete(tmp.next()._to);
        }

        // Remove tags
        if (doc.tags && doc.tags.length) g_lib.removeTags(doc.tags);

        // Update schema count
        if (doc.sch_id && g_db.sch.exists(doc.sch_id)) {
            var sch = g_db.sch.document(doc.sch_id);
            g_db._update(sch._id, {
                cnt: sch.cnt - 1,
            });
        }

        // Update allocation
        var loc = g_db.loc.firstExample({
            _from: a_id,
        });
        if (loc) {
            var alloc = g_db.alloc.firstExample({
                _from: doc.owner,
                _to: loc._to,
            });
            if (alloc) {
                g_db.alloc.update(alloc._id, {
                    data_size: alloc.data_size - doc.size,
                    rec_count: alloc.rec_count - 1,
                });
            }
        }

        // Delete data record
        g_graph.d.remove(a_id);
    };

    obj._deleteDataRecords = function (a_ids) {
        //console.log( "deleting records", Date.now() );
        var i,
            j,
            id,
            doc,
            tmp,
            loc,
            alloc,
            allocs = {};

        for (i in a_ids) {
            id = a_ids[i];
            doc = g_db.d.document(id);

            // Delete alias
            tmp = g_db.alias.firstExample({
                _from: id,
            });
            if (tmp) {
                g_graph.a.remove(tmp._to);
            }

            // Delete notes and all inherted notes
            tmp = g_db.note.byExample({
                _from: id,
            });
            while (tmp.hasNext()) {
                g_lib.annotationDelete(tmp.next()._to);
            }

            // Remove tags
            if (doc.tags && doc.tags.length) {
                g_lib.removeTags(doc.tags);
            }

            // Update schema count
            if (doc.sch_id && g_db.sch.exists(doc.sch_id)) {
                var sch = g_db.sch.document(doc.sch_id);
                g_db._update(sch._id, {
                    cnt: sch.cnt - 1,
                });
            }

            // Update allocation
            loc = g_db.loc.firstExample({
                _from: id,
            });
            if (loc) {
                if (!(doc.owner in allocs)) {
                    allocs[doc.owner] = {};
                }

                tmp = allocs[doc.owner][loc._to];

                if (!tmp) {
                    allocs[doc.owner][loc._to] = {
                        ct: 1,
                        sz: doc.size,
                    };
                } else {
                    tmp.ct++;
                    tmp.sz += doc.size;
                }
            }

            // Delete data record
            g_graph.d.remove(id);
        }

        // /console.log( "allocation", allocs );
        //console.log( "updating allocation", Date.now() );

        for (i in allocs) {
            tmp = allocs[i];
            for (j in tmp) {
                alloc = g_db.alloc.firstExample({
                    _from: i,
                    _to: j,
                });
                if (alloc) {
                    doc = tmp[j];
                    g_db.alloc.update(alloc._id, {
                        data_size: alloc.data_size - doc.sz,
                        rec_count: alloc.rec_count - doc.ct,
                    });
                }
            }
        }

        //console.log( "deleting records finished", Date.now() );
    };

    /**
     * Deletes a project and all associated graph objects immediately.
     *
     * This function deletes allocations, owned records (e.g., data, collections, groups),
     * and the project itself. It performs a direct deletion of the project and its related
     * items, and should **NOT** be used on projects containing raw data.
     *
     * @param {string} a_proj_id - The ID of the project to delete.
     * @throws {Error} Throws an error if the project or associated items cannot be deleted.
     *
     * Use this function with caution, as it will permanently delete allocations, data,
     * collections, groups, and the project. It should not be used for projects that
     * contain raw data.
     */
    obj._projectDelete = function (a_proj_id) {
        console.log("_projectDelete", a_proj_id);
        // Delete allocations
        g_db.alloc.removeByExample({
            _from: a_proj_id,
        });

        // Delete all owned records (data, collections, groups, etc.)
        var id,
            rec_ids = g_db._query(
                "for v in 1..1 inbound @proj owner filter !is_same_collection('a',v) return v._id",
                {
                    proj: a_proj_id,
                },
            );

        while (rec_ids.hasNext()) {
            id = rec_ids.next();
            //console.log("del ",id);

            if (id.charAt(0) == "d") {
                obj._deleteDataRecord(id);
            } else if (id.charAt(0) == "c") {
                obj._deleteCollection(id);
            } else {
                g_graph[id.charAt(0)].remove(id);
            }
        }

        //console.log("del",a_proj_id);

        g_graph.p.remove(a_proj_id);
    };

    obj.recMoveInit = function (a_data, a_new_repo_id, a_new_owner_id, a_new_coll_id) {
        var loc;

        //console.log("recMoveInit", a_new_repo_id, a_new_owner_id, a_new_coll_id );

        for (var i in a_data) {
            loc = g_db.loc.firstExample({
                _from: a_data[i].id,
            });

            var obj = {};

            // Skip records that are already on new allocation
            if (!a_new_owner_id && loc._to == a_new_repo_id) continue;

            obj.new_repo = a_new_repo_id;

            if (a_new_owner_id) {
                // Skip records that are have already been move to new owner
                if (loc.uid == a_new_owner_id) continue;

                obj.new_owner = a_new_owner_id;
                obj.new_coll = a_new_coll_id;
            }

            g_db._update(loc._id, obj);
        }
    };

    obj.recMoveRevert = function (a_data) {
        var id, loc;

        for (var i in a_data) {
            id = a_data[i].id;
            //console.log("recMoveRevert", id );

            loc = g_db.loc.firstExample({
                _from: id,
            });
            g_db._update(
                loc._id,
                {
                    new_repo: null,
                    new_owner: null,
                    new_coll: null,
                },
                {
                    keepNull: false,
                },
            );
        }
    };

    obj.recMoveFini = function (a_data) {
        var data, loc, new_loc, alloc, coll, alias, alias_pref, a, key;

        //console.log("recMoveFini" );

        for (var i in a_data) {
            data = a_data[i];

            loc = g_db.loc.firstExample({
                _from: data.id,
            });

            //console.log("recMoveFini, id:", data.id, "loc:", loc );

            if (!loc.new_owner && !loc.new_repo) continue;

            if (loc.new_owner) {
                // Changing owner and repo

                if (!alias_pref) {
                    alias_pref = loc.new_owner.charAt(0) + ":" + loc.new_owner.substr(2) + ":";
                }

                // DEV-ONLY SANITY CHECKS:
                if (!loc.new_coll)
                    throw [
                        g_lib.ERR_INTERNAL_FAULT,
                        "Record '" + data.id + "' missing destination collection!",
                    ];

                if (!g_db.c.exists(loc.new_coll))
                    throw [
                        g_lib.ERR_INTERNAL_FAULT,
                        "Record '" +
                            data.id +
                            "' destination collection '" +
                            loc.new_coll +
                            "' does not exist!",
                    ];

                coll = g_db.c.document(loc.new_coll);

                if (coll.owner != loc.new_owner)
                    throw [
                        g_lib.ERR_INTERNAL_FAULT,
                        "Record '" +
                            data.id +
                            "' destination collection '" +
                            loc.new_coll +
                            "' not owner by new owner!",
                    ];

                // Clear all record ACLs
                g_db.acl.removeByExample({
                    _from: data.id,
                });

                // Update record to new owner
                g_db._update(data.id, {
                    owner: loc.new_owner,
                });

                // Move ownership edge
                g_db.owner.removeByExample({
                    _from: data.id,
                });
                g_db.owner.save({
                    _from: data.id,
                    _to: loc.new_owner,
                });

                // Move to new collection
                g_db.item.removeByExample({
                    _to: data.id,
                });
                g_db.item.save({
                    _from: loc.new_coll,
                    _to: data.id,
                });

                // Move owner edge of alias if alias present
                alias = g_db.alias.firstExample({
                    _from: data.id,
                });
                if (alias) {
                    // remove old alias and all edges
                    g_graph.a.remove(alias._to);

                    // Create new alias (add suffix if collides with existing alias)
                    alias = alias_pref + alias._to.substr(alias._to.lastIndexOf(":") + 1);
                    for (a = 0; ; a++) {
                        key = alias + (a > 0 ? "-" + a : "");
                        if (
                            !g_db.a.exists({
                                _key: key,
                            })
                        ) {
                            //console.log("try alias:",key);
                            g_db.a.save({
                                _key: key,
                            });
                            break;
                        }
                    }
                    // If alias suffix, update record
                    if (a > 0) {
                        g_db.d.update(data.id, {
                            alias: key,
                        });
                    }

                    g_db.alias.save({
                        _from: data.id,
                        _to: "a/" + key,
                    });
                    g_db.owner.save({
                        _from: "a/" + key,
                        _to: loc.new_owner,
                    });
                }
            }

            //rec = g_db.d.document( id );

            // Update old allocation stats
            alloc = g_db.alloc.firstExample({
                _from: loc.uid,
                _to: loc._to,
            });
            if (!alloc)
                throw [
                    g_lib.ERR_INTERNAL_FAULT,
                    "Record '" + data.id + "' has mismatched allocation/location (cur)!",
                ];

            //console.log("alloc:", alloc );
            //console.log("recMoveFini, adj src alloc to:", alloc.rec_count - 1, alloc.data_size - data.size );

            g_db._update(alloc._id, {
                rec_count: alloc.rec_count - 1,
                data_size: alloc.data_size - data.size,
            });

            //console.log("update alloc:", alloc );

            // Update new allocation stats
            alloc = g_db.alloc.firstExample({
                _from: loc.new_owner ? loc.new_owner : loc.uid,
                _to: loc.new_repo,
            });
            if (!alloc)
                throw [
                    g_lib.ERR_INTERNAL_FAULT,
                    "Record '" + data.id + "' has mismatched allocation/location (new)!",
                ];

            //console.log("recMoveFini, adj dest alloc to:", alloc.rec_count + 1, alloc.data_size + data.size );

            g_db._update(alloc._id, {
                rec_count: alloc.rec_count + 1,
                data_size: alloc.data_size + data.size,
            });

            // Create new edge to new owner/repo, delete old
            new_loc = {
                _from: loc._from,
                _to: loc.new_repo,
                uid: loc.new_owner ? loc.new_owner : loc.uid,
            };
            g_db.loc.save(new_loc);
            g_db.loc.remove(loc);
        }
    };

    obj.recMoveExt = function (a_data, a_dst_owner_id, a_dst_coll_id) {
        if (!g_db.c.exists(a_dst_coll_id)) {
            throw [
                g_lib.ERR_INTERNAL_FAULT,
                "Destination collection '" + a_dst_coll_id + "' does not exist!",
            ];
        }

        var data,
            alias,
            a,
            key,
            alias_pref = a_dst_owner_id.charAt(0) + ":" + a_dst_owner_id.substr(2) + ":",
            coll = g_db.c.document(a_dst_coll_id);

        if (coll.owner != a_dst_owner_id)
            throw [
                g_lib.ERR_INTERNAL_FAULT,
                "Destination collection '" + a_dst_coll_id + "' not owned by new owner!",
            ];

        for (var i in a_data) {
            data = a_data[i];

            // Clear all record ACLs
            g_db.acl.removeByExample({
                _from: data.id,
            });

            // Update record to new owner
            g_db._update(data.id, {
                owner: a_dst_owner_id,
            });

            // Move ownership edge
            g_db.owner.removeByExample({
                _from: data.id,
            });
            g_db.owner.save({
                _from: data.id,
                _to: a_dst_owner_id,
            });

            // Move to new collection
            g_db.item.removeByExample({
                _to: data.id,
            });
            g_db.item.save({
                _from: a_dst_coll_id,
                _to: data.id,
            });

            // Move owner edge of alias if alias present
            alias = g_db.alias.firstExample({
                _from: data.id,
            });
            if (alias) {
                // remove old alias and all edges
                g_graph.a.remove(alias._to);

                // Create new alias (add suffix if collides with existing alias)
                alias = alias_pref + alias._to.substr(alias._to.lastIndexOf(":") + 1);
                for (a = 0; ; a++) {
                    key = alias + (a > 0 ? "-" + a : "");
                    if (
                        !g_db.a.exists({
                            _key: key,
                        })
                    ) {
                        //console.log("try alias:",key);
                        g_db.a.save({
                            _key: key,
                        });
                        break;
                    }
                }
                // If alias suffix, update record
                if (a > 0) {
                    g_db.d.update(data.id, {
                        alias: key,
                    });
                }

                g_db.alias.save({
                    _from: data.id,
                    _to: "a/" + key,
                });
                g_db.owner.save({
                    _from: "a/" + key,
                    _to: a_dst_owner_id,
                });
            }
        }
    };

    obj._ensureExclusiveAccess = function (a_ids) {
        //console.log("_ensureExclusiveAccess start", Date.now());
        var i, id, lock;
        for (i in a_ids) {
            id = a_ids[i];
            //console.log("_ensureExclusiveAccess",id);
            lock = g_db.lock.firstExample({
                _to: id,
            });
            if (lock)
                throw [g_lib.ERR_PERM_DENIED, "Operation not permitted - '" + id + "' in use."];
        }
        //console.log("_ensureExclusiveAccess done", Date.now());
    };

    return obj;
})();

module.exports = tasks_func;
