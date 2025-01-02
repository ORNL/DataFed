"use strict";

const createRouter = require("@arangodb/foxx/router");
const router = createRouter();
const joi = require("joi");

const g_db = require("@arangodb").db;
const g_lib = require("./support");

module.exports = router;

//==================== TAG API FUNCTIONS

router
    .post("/search", function (req, res) {
        try {
            var name = req.queryParams.name.trim();
            if (name.length < 3)
                throw [g_lib.ERR_INVALID_PARAM, "Input is too short for tag search."];

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
        } catch (e) {
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
        try {
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
                },
            });
        } catch (e) {
            g_lib.handleException(e, res);
        }
    })
    .queryParam("offset", joi.number().optional(), "Offset")
    .queryParam("count", joi.number().optional(), "Count")
    .summary("List tags by count")
    .description("List tags by count");
