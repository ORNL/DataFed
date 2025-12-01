"use strict";

const createRouter = require("@arangodb/foxx/router");
const router = createRouter();
const g_db = require("@arangodb").db;
const g_lib = require("./support");
const joi = require("joi");
const logger = require("./lib/logger");

module.exports = router;

const basePath = "metrics";
router
    .post("/msg_count/update", function (req, res) {
        const client = g_lib.getUserFromClientID(req.queryParams.client);
        try {
            logger.logRequestStarted({
                client: client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "POST",
                routePath: basePath + "/msg_count/update",
                status: "Started",
                description: "Update message metrics",
            });
            var i,
                u,
                ts = req.body.timestamp,
                obj = {
                    timestamp: ts,
                    type: "msgcnt_total",
                    total: req.body.total,
                };

            g_db.metrics.save(obj);

            for (i in req.body.uids) {
                u = req.body.uids[i];
                obj = {
                    timestamp: ts,
                    type: "msgcnt_user",
                    uid: i,
                    total: u.tot,
                    msg: u.msg,
                };
                g_db.metrics.save(obj);
            }
            logger.logRequestSuccess({
                client: client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "POST",
                routePath: basePath + "/msg_count/update",
                status: "Success",
                description: "Update message metrics",
                extra: obj,
            });
        } catch (e) {
            logger.logRequestFailure({
                client: client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "POST",
                routePath: basePath + "/msg_count/update",
                status: "Failure",
                description: "Update message metrics",
                extra: obj,
                error: e,
            });
            g_lib.handleException(e, res);
        }
    })
    .body(joi.object().required(), "Metrics")
    .summary("Update message metrics.")
    .description("Update message metrics.");

router
    .get("/msg_count", function (req, res) {
        const client = g_lib.getUserFromClientID(req.queryParams.client);
        try {
            logger.logRequestStarted({
                client: client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/msg_count",
                status: "Started",
                description: "Update message metrics",
            });
            var par = {
                    now: Date.now() / 1000,
                    since: 60 * (req.queryParams.since ? req.queryParams.since : 60),
                },
                filter = "(( i.timestamp + @since ) >= @now )";

            if (req.queryParams.type) {
                filter += " && i.type == @type";
                par.type = req.queryParams.type;
            }

            if (req.queryParams.uid) {
                filter += " && i.uid == @uid";
                par.uid = req.queryParams.uid;
            }

            var qry = "for i in metrics filter " + filter + " sort i.timestamp return i",
                result = g_db._query(qry, par).toArray(),
                r;

            for (var i in result) {
                r = result[i];
                delete r._rev;
                delete r._key;
            }

            res.send(result);
            logger.logRequestSuccess({
                client: client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/msg_count",
                status: "Success",
                description: "Update message metrics",
                extra: result,
            });
        } catch (e) {
            logger.logRequestFailure({
                client: client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/msg_count",
                status: "Failure",
                description: "Update message metrics",
                extra: result,
                error: e,
            });
            g_lib.handleException(e, res);
        }
    })
    .queryParam("type", joi.string().optional(), "Metric type (default all)")
    .queryParam(
        "since",
        joi.number().min(0).optional(),
        "Return since last specified minutes ago (default 60)",
    )
    .queryParam("uid", joi.string().optional(), "User ID (default none)")
    .summary("Update message metrics.")
    .description("Update message metrics.");

router
    .get("/users/active", function (req, res) {
        const client = req.queryParams.client
            ? g_lib.getUserFromClientID(req.queryParams.client)
            : null;
        try {
            logger.logRequestStarted({
                client: client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/users/active",
                status: "Started",
                description: "Get recently active users from metrics",
            });

            var cnt = {},
                u,
                r,
                qryres = g_db
                    ._query(
                        "for i in metrics filter (( i.timestamp + @since ) >= @now ) && i.type == 'msgcnt_user' return {uid:i.uid,tot:i.total}",
                        {
                            now: Math.floor(Date.now() / 1000),
                            since: 60 * (req.queryParams.since ? req.queryParams.since : 15),
                        },
                    )
                    .toArray();

            for (r in qryres) {
                u = qryres[r];
                if (u.uid in cnt) {
                    cnt[u.uid] += u.tot;
                } else {
                    cnt[u.uid] = u.tot;
                }
            }

            res.json(cnt);
            logger.logRequestSuccess({
                client: client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/users/active",
                status: "Success",
                description: "Get recently active users from metrics",
                extra: cnt,
            });
        } catch (e) {
            logger.logRequestFailure({
                client: client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/users/active",
                status: "Failure",
                description: "Get recently active users from metrics",
                extra: cnt,
                error: e,
            });

            g_lib.handleException(e, res);
        }
    })
    .queryParam(
        "since",
        joi.number().min(0).optional(),
        "Users active since given minutes ago (default 15)",
    )
    .summary("Get recently active users from metrics.")
    .description("Get recently active users from metrics.");

router
    .post("/purge", function (req, res) {
        //const client = g_lib.getUserFromClientID(req.queryParams.client);
        try {
            logger.logRequestStarted({
                client: "undef", //client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "POST",
                routePath: basePath + "/purge",
                status: "Started",
                description: "Purge older metrics",
            });

            g_db.metrics.save({
                timestamp: Math.floor(Date.now() / 1000),
                type: "purge",
                ts: req.queryParams.timestamp,
            });

            g_db._query("for i in metrics filter i.timestamp < @ts remove i in metrics", {
                ts: req.queryParams.timestamp,
            });
            logger.logRequestSuccess({
                client: "undef", //client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "POST",
                routePath: basePath + "/purge",
                status: "Success",
                description: "Purge older metrics",
                extra: "undefined",
            });
        } catch (e) {
            logger.logRequestFailure({
                client: "undef", //client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "POST",
                routePath: basePath + "/purge",
                status: "Failure",
                description: "Purge older metrics",
                extra: "undefined",
                error: e,
            });
            g_lib.handleException(e, res);
        }
    })
    .queryParam(
        "timestamp",
        joi.number().min(0).required(),
        "Purge all metrics from before timestamp (Unix epoch)",
    )
    .summary("Purge older metrics.")
    .description("Purge older metrics.");
