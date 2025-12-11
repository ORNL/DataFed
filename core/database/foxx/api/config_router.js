"use strict";

const createRouter = require("@arangodb/foxx/router");
const router = createRouter();
const g_db = require("@arangodb").db;
const g_lib = require("./support");
const logger = require("./lib/logger");
const basePath = "config";
module.exports = router;

router
    .get("/msg/daily", function (req, res) {
        let msg = null;
        try {
            logger.logRequestStarted({
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/msg/daily",
                status: "Started",
                description: "Get message of the day",
            });
            msg = {};
            var key = {
                _key: "msg_daily",
            };

            if (g_db.config.exists(key)) {
                msg = g_db.config.document(key);

                delete msg._id;
                delete msg._key;
                delete msg._rev;
            }

            res.send(msg);
            logger.logRequestSuccess({
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/msg/daily",
                status: "Success",
                description: "Get message of the day",
                extra: (msg.text || "").substring(0, 10),
            });
        } catch (e) {
            logger.logRequestFailure({
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/msg/daily",
                status: "Failure",
                description: "Get message of the day",
                extra: (msg.msg || "").substring(0, 10),
                error: e,
            });

            g_lib.handleException(e, res);
        }
    })
    .summary("Get message of the day.")
    .description("Get message of the day. If not set, an empty document will be returned.");
