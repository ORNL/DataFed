"use strict";

const createRouter = require("@arangodb/foxx/router");
const router = createRouter();
const g_db = require("@arangodb").db;
const g_lib = require("./support");

module.exports = router;

router
    .get("/msg/daily", function (req, res) {
        try {
            var msg = {},
                key = {
                    _key: "msg_daily",
                };

            if (g_db.config.exists(key)) {
                msg = g_db.config.document(key);

                delete msg._id;
                delete msg._key;
                delete msg._rev;
            }

            res.send(msg);
        } catch (e) {
            g_lib.handleException(e, res);
        }
    })
    .summary("Get message of the day.")
    .description("Get message of the day. If not set, an empty document will be returned.");
