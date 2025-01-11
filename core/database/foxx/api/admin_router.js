"use strict";

const createRouter = require("@arangodb/foxx/router");
const router = createRouter();
const joi = require("joi");

const g_db = require("@arangodb").db;
const g_lib = require("./support");
//const   perf = require('@arangodb/foxx');

module.exports = router;

router
    .get("/ping", function (req, res) {
        try {
            res.send({
                status: 1,
            });
        } catch (e) {
            g_lib.handleException(e, res);
        }
    })
    .summary("Ping DB server")
    .description("Ping DB server");

router
    .get("/test", function (req, res) {
        try {
            const client = g_lib.getUserFromClientID(req.queryParams.client);
            //var perms = req.queryParams.perms?req.queryParams.perms:g_lib.PERM_ALL;
            var result = true;
            var item = g_lib.resolveID(req.queryParams.item, client);
            var obj = g_db[item[0]].document(item);

            var t1 = new Date();

            for (var i = 0; i < 1000; i++) {
                result = g_lib.hasPermissions(client, obj, 3);
                //result = g_lib.getPermissions( client, obj, 255 );
            }
            var t2 = new Date();

            res.send({
                perm: result,
                time: (t2 - t1) / 1000,
            });
        } catch (e) {
            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().required(), "Client ID")
    .queryParam("item", joi.string().required(), "Data/collection ID or alias")
    .summary("Do perf test")
    .description("Do perf test");

router
    .get("/check", function (req, res) {
        try {
            var result = {};

            g_db._executeTransaction({
                collections: {
                    read: ["u", "p"],
                    write: [],
                },
                action: function () {
                    var edges = [
                        "owner",
                        "member",
                        "item",
                        "acl",
                        "ident",
                        "admin",
                        "alias",
                        "alloc",
                        "loc",
                        "top",
                        "dep",
                    ];
                    var ecoll;
                    var subres;
                    var count = 0;

                    // Check for dangling edges
                    for (var e in edges) {
                        ecoll = edges[e];
                        subres = g_db
                            ._query(
                                "for i in @@coll let a = document(i._from)._id let b = document(i._to)._id filter a == null or b == null return {edge:i._id,fr:a,to:b}",
                                {
                                    "@coll": ecoll,
                                },
                            )
                            .toArray();
                        count += subres.length;
                        result[ecoll] = subres;
                    }

                    result.edge_bad_count = count;

                    // Check for correct structure per vertex type
                    count = 0;

                    subres = g_db
                        ._query(
                            "for i in d let x = (for v in 1..1 outbound i._id owner return v) filter length(x) == 0 return i._id",
                        )
                        .toArray();
                    count += subres.length;
                    result.data_no_owner = subres;

                    subres = g_db
                        ._query(
                            "for i in d let x = (for v in 1..1 outbound i._id owner return v) filter length(x) > 1 return i._id",
                        )
                        .toArray();
                    count += subres.length;
                    result.data_multi_owner = subres;

                    subres = g_db
                        ._query(
                            "for i in d filter i.external != true let x = (for v in 1..1 outbound i._id loc return v) filter length(x) == 0 return i._id",
                        )
                        .toArray();
                    count += subres.length;
                    result.data_no_loc = subres;

                    subres = g_db
                        ._query(
                            "for i in d let x = (for v in 1..1 outbound i._id loc return v) filter length(x) > 1 return i._id",
                        )
                        .toArray();
                    count += subres.length;
                    result.data_multi_loc = subres;

                    subres = g_db
                        ._query(
                            "for i in d let x = (for v in 1..1 inbound i._id item return v) filter length(x) == 0 return i._id",
                        )
                        .toArray();
                    count += subres.length;
                    result.data_no_parent = subres;

                    subres = g_db
                        ._query(
                            "for i in c let x = (for v in 1..1 outbound i._id owner return v) filter length(x) == 0 return i._id",
                        )
                        .toArray();
                    count += subres.length;
                    result.coll_no_owner = subres;

                    subres = g_db
                        ._query(
                            "for i in c let x = (for v in 1..1 outbound i._id owner return v) filter length(x) > 1 return i._id",
                        )
                        .toArray();
                    count += subres.length;
                    result.coll_multi_owner = subres;

                    subres = g_db
                        ._query(
                            "for i in c let x = (for v in 1..1 inbound i._id item return v) filter i.is_root != true and length(x) == 0 return i._id",
                        )
                        .toArray();
                    count += subres.length;
                    result.coll_no_parent = subres;

                    subres = g_db
                        ._query(
                            "for i in c let x = (for v in 1..1 inbound i._id item return v) filter length(x) > 1 return i._id",
                        )
                        .toArray();
                    count += subres.length;
                    result.coll_multi_parent = subres;

                    subres = g_db
                        ._query(
                            "for i in g let x = (for v in 1..1 outbound i._id owner return v) filter length(x) == 0 return i._id",
                        )
                        .toArray();
                    count += subres.length;
                    result.group_no_owner = subres;

                    subres = g_db
                        ._query(
                            "for i in g let x = (for v in 1..1 outbound i._id owner return v) filter length(x) > 1 return i._id",
                        )
                        .toArray();
                    count += subres.length;
                    result.group_multi_owner = subres;

                    subres = g_db
                        ._query(
                            "for i in a let x = (for v in 1..1 outbound i._id owner return v) filter length(x) == 0 return i._id",
                        )
                        .toArray();
                    count += subres.length;
                    result.alias_no_owner = subres;

                    subres = g_db
                        ._query(
                            "for i in a let x = (for v in 1..1 outbound i._id owner return v) filter length(x) > 1 return i._id",
                        )
                        .toArray();
                    count += subres.length;
                    result.alias_multi_owner = subres;

                    subres = g_db
                        ._query(
                            "for i in a let x = (for v in 1..1 inbound i._id alias return v) filter length(x) == 0 return i._id",
                        )
                        .toArray();
                    count += subres.length;
                    result.alias_no_alias = subres;

                    subres = g_db
                        ._query(
                            "for i in a let x = (for v in 1..1 inbound i._id alias return v) filter length(x) > 1 return i._id",
                        )
                        .toArray();
                    count += subres.length;
                    result.alias_multi_alias = subres;

                    subres = g_db
                        ._query(
                            "for i in p let x = (for v in 1..1 outbound i._id owner return v) filter length(x) == 0 return i._id",
                        )
                        .toArray();
                    count += subres.length;
                    result.proj_no_owner = subres;

                    subres = g_db
                        ._query(
                            "for i in p let x = (for v in 1..1 outbound i._id owner return v) filter length(x) > 1 return i._id",
                        )
                        .toArray();
                    count += subres.length;
                    result.proj_multi_owner = subres;

                    subres = g_db
                        ._query(
                            "for i in q let x = (for v in 1..1 outbound i._id owner return v) filter length(x) == 0 return i._id",
                        )
                        .toArray();
                    count += subres.length;
                    result.query_no_owner = subres;

                    subres = g_db
                        ._query(
                            "for i in q let x = (for v in 1..1 outbound i._id owner return v) filter length(x) > 1 return i._id",
                        )
                        .toArray();
                    count += subres.length;
                    result.query_multi_owner = subres;

                    subres = g_db
                        ._query(
                            "for i in t let x = (for v in 1..1 outbound i._id top return v) filter i.top != true && length(x) == 0 return i._id",
                        )
                        .toArray();
                    count += subres.length;
                    result.topic_no_parent = subres;

                    subres = g_db
                        ._query(
                            "for i in t let x = (for v in 1..1 outbound i._id top return v) filter length(x) > 1 return i._id",
                        )
                        .toArray();
                    count += subres.length;
                    result.topic_multi_parent = subres;

                    subres = g_db
                        ._query(
                            "for i in repo let x = (for v in 1..1 outbound i._id admin return v) filter length(x) == 0 return i._id",
                        )
                        .toArray();
                    count += subres.length;
                    result.repo_no_admin = subres;

                    result.vertex_bad_count = count;
                },
            });

            res.send(result);
        } catch (e) {
            g_lib.handleException(e, res);
        }
    })
    .queryParam("fix", joi.bool().optional(), "Automatically fix dangling edges.")
    .summary("Database integrity check")
    .description("Database integrity check.");
