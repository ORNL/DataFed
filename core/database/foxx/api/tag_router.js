"use strict";

const createRouter = require("@arangodb/foxx/router");
const router = createRouter();
const error = require("./lib/error_codes");
const joi = require("joi");

const g_db = require("@arangodb").db;
const g_lib = require("./support");
const logger = require("./lib/logger");

const basePath = "tag";
module.exports = router;

//==================== TAG API FUNCTIONS

router
    .post("/search", function (req, res) {
        const client = req.queryParams.client
            ? g_lib.getUserFromClientID(req.queryParams.client)
            : null;
        try {
            logger.logRequestStarted({
                client: client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "POST",
                routePath: basePath + "/search",
                status: "Started",
                description: "Search for tags by name",
            });
            var name = req.queryParams.name.trim();
            if (name.length < 3)
                throw [error.ERR_INVALID_PARAM, "Input is too short for tag search."];

            var off = req.queryParams.offset ? req.queryParams.offset : 0,
                cnt = req.queryParams.count ? req.queryParams.count : 50,
                result = g_db._query(
                    "for t in tagview search analyzer(t._key in tokens(@name,'tag_name'), 'tag_name') let s = BM25(t) sort s desc limit @off,@cnt return {name: t._key, count: t.count}",
                    {
                        name: name,
                        off: off,
                        cnt: cnt,
                    },
                    {
                        fullCount: true,
                    },
                ),
                tot = result.getExtra().stats.fullCount;

            result = result.toArray();
            result.push({
                paging: {
                    off: off,
                    cnt: cnt,
                    tot: tot,
                },
            });

            res.send(result);
            logger.logRequestSuccess({
                client: client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "POST",
                routePath: basePath + "/search",
                status: "Success",
                description: "Search for tags by name",
                extra: result
            });
        } catch (e) {
            logger.logRequestFailure({
                client: client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "POST",
                routePath: basePath + "/search",
                status: "Failure",
                description: "Search for tags by name",
                extra: result,
                error: e
            });
            g_lib.handleException(e, res);
        }
    })
    .queryParam("name", joi.string().required(), "Tag name or part of name to search for")
    .queryParam("offset", joi.number().optional(), "Offset")
    .queryParam("count", joi.number().optional(), "Count")
    .summary("Search for tags")
    .description("Search for tags by name");

router
    .post("/list/by_count", function (req, res) {
        const client = req.queryParams.client
            ? g_lib.getUserFromClientID(req.queryParams.client)
            : null;
        try {
            logger.logRequestStarted({
                client: client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "POST",
                routePath: basePath + "/list/by_count",
                status: "Started",
                description: "List tags by count",
            });

            g_db._executeTransaction({
                collections: {
                    read: ["tag"],
                },
                action: function () {
                    var off = req.queryParams.offset ? req.queryParams.offset : 0,
                        cnt = req.queryParams.count ? req.queryParams.count : 50;

                    var result = g_db._query(
                        "for t in tag sort t.count desc limit @off,@cnt return {name: t._key, count: t.count}",
                        {
                            off: off,
                            cnt: cnt,
                        },
                        {
                            fullCount: true,
                        },
                    );

                    var tot = result.getExtra().stats.fullCount;
                    result = result.toArray();
                    result.push({
                        paging: {
                            off: off,
                            cnt: cnt,
                            tot: tot,
                        },
                    });

                    res.send(result);
                    logger.logRequestSuccess({
                        client: client?._id,
                        correlationId: req.headers["x-correlation-id"],
                        httpVerb: "POST",
                        routePath: basePath + "/list/by_count",
                        status: "Success",
                        description: "List tags by count",
                        extra: result
                    });
                },
            });
        } catch (e) {
            logger.logRequestFailure({
                client: client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "POST",
                routePath: basePath + "/list/by_count",
                status: "Failure",
                description: "List tags by count",
                extra: result,
                error: e
            });

            g_lib.handleException(e, res);
        }
    })
    .queryParam("offset", joi.number().optional(), "Offset")
    .queryParam("count", joi.number().optional(), "Count")
    .summary("List tags by count")
    .description("List tags by count");
