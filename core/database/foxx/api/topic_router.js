"use strict";

const createRouter = require("@arangodb/foxx/router");
const router = createRouter();
const joi = require("joi");

const g_db = require("@arangodb").db;
const g_lib = require("./support");

module.exports = router;

//==================== TOPIC API FUNCTIONS

router
    .get("/list/topics", function (req, res) {
        try {
            var qry,
                par = {},
                result,
                off = 0,
                cnt = 50;

            if (req.queryParams.offset != undefined) off = req.queryParams.offset;

            if (req.queryParams.count != undefined && req.queryParams.count <= 100)
                cnt = req.queryParams.count;

            if (req.queryParams.id) {
                (qry = "for i in 1..1 inbound @par top filter is_same_collection('t',i)"),
                    (par.par = req.queryParams.id);
            } else {
                qry = "for i in t filter i.top == true";
            }

            qry +=
                " sort i.title limit " +
                off +
                "," +
                cnt +
                " return {_id:i._id, title: i.title, admin: i.admin, coll_cnt: i.coll_cnt}";
            result = g_db._query(
                qry,
                par,
                {},
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
        } catch (e) {
            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().optional(), "Client ID")
    .queryParam("id", joi.string().optional(), "ID of topic to list (omit for top-level)")
    .queryParam("offset", joi.number().integer().min(0).optional(), "Offset")
    .queryParam("count", joi.number().integer().min(1).optional(), "Count")
    .summary("List topics")
    .description("List topics under specified topic ID. If ID is omitted, lists top-level topics.");

router
    .get("/view", function (req, res) {
        try {
            if (!g_db.t.exists(req.queryParams.id))
                throw [g_lib.ERR_NOT_FOUND, "Topic, " + req.queryParams.id + ", not found"];

            var topic = g_db.t.document(req.queryParams.id);

            res.send([topic]);
        } catch (e) {
            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().optional(), "Client ID")
    .queryParam("id", joi.string().optional(), "ID of topic to view")
    .summary("View topic")
    .description("View a topic.");

router
    .get("/search", function (req, res) {
        try {
            var tokens = req.queryParams.phrase.match(/(?:[^\s"]+|"[^"]*")+/g),
                qry = "for i in topicview search analyzer((",
                params = {},
                i,
                p,
                qry_res,
                result = [],
                item,
                it,
                topic,
                path,
                op = false;

            if (tokens.length == 0) throw [g_lib.ERR_INVALID_PARAM, "Invalid topic search phrase."];

            it = 0;
            for (i in tokens) {
                if (op) {
                    qry += " or ";
                }
                p = "p" + it;
                qry += "phrase(i.title,@" + p + ")";
                params[p] = tokens[i];
                op = true;
                it++;
            }

            qry += "),'text_en') limit 0, 100 return i";

            qry_res = g_db._query(qry, params);
            while (qry_res.hasNext()) {
                item = qry_res.next();
                it = item;
                topic = item.title;
                path = [
                    {
                        _id: item._id,
                        title: item.title,
                    },
                ];

                while (
                    (item = g_db.top.firstExample({
                        _from: item._id,
                    }))
                ) {
                    item = g_db.t.document(item._to);
                    topic = item.title + "." + topic;
                    path.unshift({
                        _id: item._id,
                        title: item.title,
                    });
                }

                result.push({
                    _id: it._id,
                    title: topic,
                    path: path,
                    admin: it.admin,
                    coll_cnt: it.coll_cnt,
                });
            }

            res.send(result);
        } catch (e) {
            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().optional(), "Client ID")
    .queryParam("phrase", joi.string().required(), "Search words or phrase")
    .summary("Search topics")
    .description("Search topics by keyword or phrase");
