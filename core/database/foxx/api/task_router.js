"use strict";

const createRouter = require("@arangodb/foxx/router");
const router = createRouter();
const joi = require("joi");
const g_db = require("@arangodb").db;
const g_lib = require("./support");
const error = require("./lib/error_codes");
const g_tasks = require("./tasks");
const logger = require("./lib/logger");
const basePath = "task";

module.exports = router;

//==================== TASK API FUNCTIONS

router
    .get("/view", function (req, res) {
        let task = null;
        try {
            logger.logRequestStarted({
                client: req?.queryParams?.task_id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/view",
                status: "Started",
                description: "View an existing task record",
            });
            if (!g_db._exists(req.queryParams.task_id)) {
                // WARNING - do not change this error message it is acted on by the task worker
                throw [
                    error.ERR_INVALID_PARAM,
                    "Task " + req.queryParams.task_id + " does not exist.",
                ];
            }

            task = g_db.task.document(req.queryParams.task_id);
            var blocks = g_db.block.byExample({
                _from: req.queryParams.task_id,
            });
            task.blocked_by = [];
            while (blocks.hasNext()) {
                task.blocked_by.push(blocks.next()._to);
            }

            blocks = g_db.block.byExample({
                _to: req.queryParams.task_id,
            });
            task.blocking = [];
            while (blocks.hasNext()) {
                task.blocking.push(blocks.next()._from);
            }

            delete task._rev;
            delete task._key;

            const { state, ...partial_task } = task;

            res.send([task]);
            logger.logRequestSuccess({
                client: req?.queryParams?.task_id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/view",
                status: "Success",
                description: "View an existing task record",
                extra: partial_task,
            });
        } catch (e) {
            logger.logRequestFailure({
                client: req?.queryParams?.task_id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/view",
                status: "Failure",
                description: "View an existing task record",
                extra: task,
                error: e,
            });

            g_lib.handleException(e, res);
        }
    })
    .queryParam("task_id", joi.string().required(), "Task ID")
    .summary("View an existing task record")
    .description("View an existing task record.");

router
    .get("/run", function (req, res) {
        var task, run_func;
        let result = null;

        try {
            logger.logRequestStarted({
                client: req?.queryParams?.task_id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/run",
                status: "Started",
                description: "Run task",
            });

            g_db._executeTransaction({
                collections: {
                    read: [],
                    write: ["task"],
                },
                lockTimeout: 0,
                waitForSync: true,
                action: function () {
                    if (!g_db.task.exists(req.queryParams.task_id))
                        throw [
                            error.ERR_INVALID_PARAM,
                            "Task " + req.queryParams.task_id + " does not exist.",
                        ];

                    task = g_db.task.document(req.queryParams.task_id);
                    run_func = g_tasks.taskGetRunFunc(task);

                    // If the last step is about to run, add exclusive lock, block access to transaction
                    //if ( req.queryParams.step != undefined && req.queryParams.step == task.steps - 2 ){
                    //    exc = ["lock","block"];
                    //}

                    // There should never be a wr-wr conflict here b/c the core server serializes task operations
                    if (task.status == g_lib.TS_READY) {
                        g_tasks.taskReady(task._id);
                    } else if (task.status == g_lib.TS_RUNNING) {
                        if (
                            req.queryParams.step != undefined &&
                            req.queryParams.step == task.step
                        ) {
                            // This confirms previous step was completed, so update step number
                            task.step++;
                            g_db.task.update(
                                task._id,
                                {
                                    step: task.step,
                                    ut: Math.floor(Date.now() / 1000),
                                },
                                {
                                    waitForSync: true,
                                },
                            );
                        } else if (
                            req.queryParams.step != undefined &&
                            req.queryParams.step >= task.steps
                        ) {
                            throw [
                                error.ERR_INVALID_PARAM,
                                "Called run on task " +
                                    task._id +
                                    " with invalid step: " +
                                    req.queryParams.step,
                            ];
                        }
                    } else {
                        throw [
                            error.ERR_INVALID_PARAM,
                            "Called run on task " +
                                task._id +
                                " with incorrect status: " +
                                task.status,
                        ];
                    }
                },
            });

            for (;;) {
                try {
                    if (req.queryParams.err_msg) {
                        throw [0, req.queryParams.err_msg];
                    }

                    result = run_func.call(g_tasks, task);
                    // An empty result means rollback has completed without additional errors
                    if (!result) {
                        result = {
                            cmd: g_lib.TC_STOP,
                            params: g_tasks.taskComplete(task._id, false, task.error),
                        };
                    }
                    break;
                } catch (e) {
                    var err = Array.isArray(e) ? e[1] : e;
                    if (err.errorMessage) err = err.errorMessage;

                    // Load current task and check step #
                    task = g_db.task.document(task._id);
                    if (task.step > 0) {
                        // Exception on processing, start roll-back
                        task.step = -task.step;
                        task.error = String(err);
                        g_db.task.update(
                            task._id,
                            {
                                step: task.step,
                                error: task.error,
                                ut: Math.floor(Date.now() / 1000),
                            },
                            {
                                waitForSync: true,
                            },
                        );
                    } else {
                        // Exception on roll-back, abort and return next tasks to process
                        result = {
                            cmd: g_lib.TC_STOP,
                            params: g_tasks.taskComplete(
                                task._id,
                                false,
                                task.error + " (Rollback failed: " + err + ")",
                            ),
                        };
                        break;
                    }

                    req.queryParams.err_msg = null;
                }
            }

            res.send(result);
            logger.logRequestSuccess({
                client: req?.queryParams?.task_id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/run",
                status: "Success",
                description: "Run task",
                extra: result,
            });
        } catch (e) {
            logger.logRequestFailure({
                client: req?.queryParams?.task_id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/run",
                status: "Failure",
                description: "Run task",
                extra: result,
                error: e,
            });
            g_lib.handleException(e, res);
        }
    })
    .queryParam("task_id", joi.string().required(), "Task ID")
    .queryParam("step", joi.number().integer().optional(), "Task step")
    .queryParam("err_msg", joi.string().optional(), "Error message")
    .summary("Run task")
    .description(
        "Run an initialized task. Step param confirms last command. Error message indicates external permanent failure.",
    );

/**
 * @function
 * @description Cleans up a task by removing it from the task dependency graph.
 * It removes dependency locks and patches the task dependency graph both upstream and downstream.
 * It returns a list of new runnable tasks if available.
 *
 * @param {object} req - The request object containing the task ID in the query parameters and other relevant data in the body.
 * @param {object} res - The response object used to send the result or an error message.
 * @returns {void} Sends a list of new runnable tasks to the response.
 *
 * @throws {Error} Throws an error if the task does not exist or if there's an issue processing the transaction.
 */
router
    .post("/abort", function (req, res) {
        let result = null;
        try {
            logger.logRequestStarted({
                client: req?.queryParams?.task_id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "POST",
                routePath: basePath + "/abort",
                status: "Started",
                description: "Abort a schedule task",
            });

            result = [];
            g_db._executeTransaction({
                collections: {
                    read: [],
                    write: ["task"],
                    exclusive: ["lock", "block"],
                },
                action: function () {
                    if (!g_db._exists(req.queryParams.task_id))
                        throw [
                            error.ERR_INVALID_PARAM,
                            "Task " + req.queryParams.task_id + " does not exist.",
                        ];

                    result = g_tasks.taskComplete(req.queryParams.task_id, false, req.body);
                },
            });

            res.send(result);
            logger.logRequestSuccess({
                client: req?.queryParams?.task_id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "POST",
                routePath: basePath + "/abort",
                status: "Success",
                description: "Abort a schedule task",
                extra: result,
            });
        } catch (e) {
            logger.logRequestFailure({
                client: req?.queryParams?.task_id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "POST",
                routePath: basePath + "/abort",
                status: "Failure",
                description: "Abort a schedule task",
                extra: result,
                error: e,
            });
            g_lib.handleException(e, res);
        }
    })
    .queryParam("task_id", joi.string().required(), "Task ID")
    .body(joi.object().optional(), "Parameters")
    .summary("Abort a schedule task")
    .description("Abort a schedule task and return list of new runnable tasks.");

router
    .post("/delete", function (req, res) {
        try {
            logger.logRequestStarted({
                client: req?.queryParams?.task_id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "POST",
                routePath: basePath + "/delete",
                status: "Started",
                description: "Delete an existing task record",
            });

            if (!g_db._exists(req.queryParams.task_id))
                throw [
                    error.ERR_INVALID_PARAM,
                    "Task " + req.queryParams.task_id + " does not exist.",
                ];

            var task = g_db.task.document(req.queryParams.task_id);
            if (task.status < g_lib.TS_SUCCEEDED)
                throw [error.ERR_IN_USE, "Cannot delete task that is still scheduled."];

            g_lib.graph.task.remove(req.queryParams.task_id);
            logger.logRequestSuccess({
                client: req?.queryParams?.task_id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "POST",
                routePath: basePath + "/delete",
                status: "Success",
                description: "Delete an existing task record",
                extra: req.queryParams.task_id,
            });
        } catch (e) {
            g_lib.handleException(e, res);
            logger.logRequestFailure({
                client: req?.queryParams?.task_id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "POST",
                routePath: basePath + "/delete",
                status: "Failure",
                description: "Delete an existing task record",
                extra: "undefined",
                error: e,
            });
        }
    })
    .queryParam("task_id", joi.string().required(), "Task ID")
    .summary("Delete an existing task record")
    .description("Delete an existing finalized task record.");

router
    .get("/list", function (req, res) {
        let result = null;
        try {
            const client = g_lib.getUserFromClientID(req.queryParams.client);
            logger.logRequestStarted({
                client: req?.queryParams?.task_id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/list",
                status: "Started",
                description: "List task records",
            });

            var params = {
                client: client._id,
            };
            var qry = "for i in task filter i.client == @client";

            if (req.queryParams.since) {
                qry += " and i.ut >= " + (Date.now() / 1000 - req.queryParams.since);
            } else {
                if (req.queryParams.from != undefined) {
                    qry += " and i.ut >= " + req.queryParams.from;
                }

                if (req.queryParams.to != undefined) {
                    qry += " and i.ut <= " + req.queryParams.to;
                }
            }

            if (req.queryParams.status) {
                qry += " and i.status in @status";
                params.status = req.queryParams.status;
            }

            qry += " sort i.ut desc";

            if (req.queryParams.offset != undefined && req.queryParams.count != undefined) {
                qry += " limit " + req.queryParams.offset + ", " + req.queryParams.count;
            }

            qry += " return i";

            result = g_db._query(qry, params);

            res.send(result);
            logger.logRequestSuccess({
                client: req?.queryParams?.task_id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/list",
                status: "Success",
                description: "List task records",
                extra: {
                    result: result,
                    numOfTasks: result._countTotal,
                },
            });
        } catch (e) {
            logger.logRequestFailure({
                client: req?.queryParams?.task_id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/list",
                status: "Failure",
                description: "List task records",
                extra: result,
                error: e,
            });
            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().required(), "Client ID")
    .queryParam(
        "status",
        joi.array().items(joi.number().integer()).optional(),
        "List of task states to retrieve.",
    )
    .queryParam(
        "since",
        joi.number().integer().min(0).optional(),
        "List tasks updated since this many seconds ago.",
    )
    .queryParam("from", joi.number().integer().min(0).optional(), "List tasks from this timestamp.")
    .queryParam("to", joi.number().integer().min(0).optional(), "List tasks to this timestamp.")
    .queryParam("offset", joi.number().integer().min(0).optional(), "Offset")
    .queryParam("count", joi.number().integer().min(0).optional(), "Count")
    .summary("List task records")
    .description("List task records.");

router
    .get("/reload", function (req, res) {
        let result = null;
        try {
            result = [];
            logger.logRequestStarted({
                client: req?.queryParams?.task_id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/reload",
                status: "Started",
                description: "Reload ready/running task records",
            });

            g_db._executeTransaction({
                collections: {
                    read: ["u", "uuid", "accn"],
                    exclusive: ["task", "lock", "block"],
                },
                action: function () {
                    result = g_db
                        ._query(
                            "for i in task filter i.status > 0 and i.status < 3 sort i.status desc return i._id",
                        )
                        .toArray();
                },
            });

            res.send(result);
            logger.logRequestSuccess({
                client: req?.queryParams?.task_id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/reload",
                status: "Success",
                description: "Reload ready/running task records",
                extra: result,
            });
        } catch (e) {
            logger.logRequestFailure({
                client: req?.queryParams?.task_id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/reload",
                status: "Failure",
                description: "Reload ready/running task records",
                extra: result,
                error: e,
            });
            g_lib.handleException(e, res);
        }
    })
    .summary("Reload ready/running task records")
    .description("Reload ready/running task records.");

router
    .get("/purge", function (req, res) {
        try {
            logger.logRequestStarted({
                client: "undefined",
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/purge",
                status: "Started",
                description: "Purge tasks",
            });

            g_db._executeTransaction({
                collections: {
                    read: [],
                    exclusive: ["task", "lock", "block"],
                },
                action: function () {
                    var t = Date.now() / 1000 - req.queryParams.age_sec;
                    // TODO This does NOT remove edges!
                    g_db._query(
                        "for i in task filter i.status >= " +
                            g_lib.TS_SUCCEEDED +
                            " and i.ut < " +
                            t +
                            " remove i in task",
                    );
                },
            });
            logger.logRequestSuccess({
                client: "undefined",
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/purge",
                status: "Success",
                description: "Purge tasks",
                extra: "undefined",
            });
        } catch (e) {
            logger.logRequestFailure({
                client: "undefined",
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/purge",
                status: "Failure",
                description: "Purge tasks",
                extra: "undefined",
                error: e,
            });
            g_lib.handleException(e, res);
        }
    })
    .queryParam("age_sec", joi.number().integer().min(0).required(), "Purge age (seconds)")
    .summary("Purge completed task records")
    .description("Purge completed task records.");
