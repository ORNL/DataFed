"use strict";

const createRouter = require("@arangodb/foxx/router");
const router = createRouter();
const joi = require("joi");

const g_db = require("@arangodb").db;
const g_graph = require("@arangodb/general-graph")._graph("sdmsg");
const g_lib = require("./support");
const logger = require("./lib/logger");
const basePath = "qry";

module.exports = router;

//==================== QUERY API FUNCTIONS

router
    .post("/create", function (req, res) {
        let client = undefined;
        let result = undefined;
        try {
            g_db._executeTransaction({
                collections: {
                    read: ["u", "uuid", "accn", "admin"],
                    write: ["q", "owner"],
                },
                action: function () {
                    client = g_lib.getUserFromClientID(req.queryParams.client);
                    logger.logRequestStarted({
                        client: client?._id,
                        correlationId: req.headers["x-correlation-id"],
                        httpVerb: "POST",
                        routePath: basePath + "/create",
                        status: "Started",
                        description: "Create Query",
                    });

                    // Check max number of saved queries
                    if (client.max_sav_qry >= 0) {
                        var count = g_db
                            ._query(
                                "return length(FOR i IN owner FILTER i._to == @id and is_same_collection('q',i._from) RETURN 1)",
                                {
                                    id: client._id,
                                },
                            )
                            .next();

                        if (count >= client.max_sav_qry)
                            throw [
                                g_lib.ERR_ALLOCATION_EXCEEDED,
                                "Saved query limit reached (" +
                                    client.max_sav_qry +
                                    "). Contact system administrator to increase limit.",
                            ];
                    }

                    var time = Math.floor(Date.now() / 1000);

                    var obj = req.body;

                    obj.owner = client._id;
                    obj.ct = time;
                    obj.ut = time;

                    g_lib.procInputParam(req.body, "title", false, obj);

                    //console.log("qry/create filter:",obj.qry_filter);

                    var qry = g_db.q.save(obj, {
                        returnNew: true,
                    }).new;
                    g_db.owner.save({
                        _from: qry._id,
                        _to: client._id,
                    });

                    qry.id = qry._id;

                    delete qry._id;
                    delete qry._key;
                    delete qry._rev;
                    delete qry.qry_begin;
                    delete qry.qry_end;
                    delete qry.qry_filter;
                    delete qry.params;
                    delete qry.lmit;

                    result = qry;
                },
            });

            res.send(result);
            logger.logRequestSuccess({
                client: client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "POST",
                routePath: basePath + "/create",
                status: "Success",
                description: "Create Query",
                extra: result,
            });
        } catch (e) {
            logger.logRequestFailure({
                client: client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "POST",
                routePath: basePath + "/create",
                status: "Failure",
                description: "Create Query",
                extra: result,
                message: e.message,
                stack: e.stack,
            });

            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().required(), "Client ID")
    .body(
        joi
            .object({
                title: joi.string().required(),
                qry_begin: joi.string().required(),
                qry_end: joi.string().required(),
                qry_filter: joi.string().allow("").required(),
                params: joi.any().required(),
                limit: joi.number().integer().required(),
                query: joi.any().required(),
            })
            .required(),
        "Query fields",
    )
    .summary("Create a query")
    .description("Create a query");

router
    .post("/update", function (req, res) {
        let client = undefined;
        let result = undefined;
        try {
            g_db._executeTransaction({
                collections: {
                    read: ["u", "uuid", "accn", "admin"],
                    write: ["q", "owner"],
                },
                action: function () {
                    client = g_lib.getUserFromClientID(req.queryParams.client);
                    logger.logRequestStarted({
                        client: client?._id,
                        correlationId: req.headers["x-correlation-id"],
                        httpVerb: "POST",
                        routePath: basePath + "/update",
                        status: "Started",
                        description: "Update a saved query",
                    });

                    var qry = g_db.q.document(req.body.id);

                    if (client._id != qry.owner && !client.is_admin) {
                        throw g_lib.ERR_PERM_DENIED;
                    }

                    // Update time and title (if set)
                    qry.ut = Math.floor(Date.now() / 1000);
                    g_lib.procInputParam(req.body, "title", true, qry);

                    // Replace all other query fields with those in body
                    qry.qry_begin = req.body.qry_begin;
                    qry.qry_end = req.body.qry_end;
                    qry.qry_filter = req.body.qry_filter;
                    qry.params = req.body.params;
                    qry.limit = req.body.limit;
                    qry.query = req.body.query;

                    /*if ( !req.body.query.coll ){
                        qry.query.coll = null;
                        qry.params.cols = null;
                    }*/

                    //console.log("qry/upd filter:",obj.qry_filter);
                    qry = g_db._update(qry._id, qry, {
                        mergeObjects: false,
                        returnNew: true,
                    }).new;

                    qry.id = qry._id;

                    delete qry._id;
                    delete qry._key;
                    delete qry._rev;
                    delete qry.qry_begin;
                    delete qry.qry_end;
                    delete qry.qry_filter;
                    delete qry.params;
                    delete qry.lmit;

                    result = qry;
                },
            });
            res.send(result);
            logger.logRequestSuccess({
                client: client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "POST",
                routePath: basePath + "/update",
                status: "Success",
                description: "Update a saved query",
                extra: result,
            });
        } catch (e) {
            logger.logRequestFailure({
                client: client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "POST",
                routePath: basePath + "/update",
                status: "Failure",
                description: "Update a saved query",
                extra: result,
                message: e.message,
                stack: e.stack,
            });
            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().required(), "Client ID")
    .body(
        joi
            .object({
                id: joi.string().required(),
                title: joi.string().optional(),
                qry_begin: joi.string().required(),
                qry_end: joi.string().required(),
                qry_filter: joi.string().allow("").required(),
                params: joi.any().required(),
                limit: joi.number().integer().required(),
                query: joi.any().required(),
            })
            .required(),
        "Query fields",
    )
    .summary("Update a saved query")
    .description("Update a saved query");

router
    .get("/view", function (req, res) {
        let client = undefined;
        let qry = undefined;
        try {
            client = g_lib.getUserFromClientID(req.queryParams.client);
            logger.logRequestStarted({
                client: client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/view",
                status: "Started",
                description: "View specified query",
            });
            qry = g_db.q.document(req.queryParams.id);

            if (client._id != qry.owner && !client.is_admin) {
                throw g_lib.ERR_PERM_DENIED;
            }

            qry.id = qry._id;
            delete qry._id;
            delete qry._key;
            delete qry._rev;
            delete qry.qry_begin;
            delete qry.qry_end;
            delete qry.qry_filter;
            delete qry.params;
            delete qry.lmit;

            res.send(qry);
            logger.logRequestSuccess({
                client: client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/view",
                status: "Success",
                description: "View specified query",
                extra: qry,
            });
        } catch (e) {
            logger.logRequestFailure({
                client: client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/view",
                status: "Failure",
                description: "View specified query",
                extra: qry,
                message: e.message,
                stack: e.stack,
            });

            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().required(), "Client ID")
    .queryParam("id", joi.string().required(), "Query ID")
    .summary("View specified query")
    .description("View specified query");

router
    .get("/delete", function (req, res) {
        let client = undefined;
        try {
            client = g_lib.getUserFromClientID(req.queryParams.client);
            var owner;
            logger.logRequestStarted({
                client: client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/delete",
                status: "Started",
                description: "Delete specified query",
            });

            for (var i in req.queryParams.ids) {
                if (!req.queryParams.ids[i].startsWith("q/")) {
                    throw [
                        g_lib.ERR_INVALID_PARAM,
                        "Invalid query ID '" + req.queryParams.ids[i] + "'.",
                    ];
                }

                owner = g_db.owner.firstExample({
                    _from: req.queryParams.ids[i],
                });
                if (!owner) {
                    throw [
                        g_lib.ERR_NOT_FOUND,
                        "Query '" + req.queryParams.ids[i] + "' not found.",
                    ];
                }

                if (client._id != owner._to && !client.is_admin) {
                    throw g_lib.ERR_PERM_DENIED;
                }

                g_graph.q.remove(owner._from);
                logger.logRequestSuccess({
                    client: client?._id,
                    correlationId: req.headers["x-correlation-id"],
                    httpVerb: "GET",
                    routePath: basePath + "/delete",
                    status: "Success",
                    description: "Delete specified query",
                    extra: req.queryParams.ids[i],
                });
            }
        } catch (e) {
            logger.logRequestFailure({
                client: client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/delete",
                status: "Failure",
                description: "Delete specified query",
                extra: req.queryParams.ids[i],
                message: e.message,
                stack: e.stack,
            });

            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().required(), "Client ID")
    .queryParam("ids", joi.array().items(joi.string()).required(), "Query IDs")
    .summary("Delete specified query")
    .description("Delete specified query");

router
    .get("/list", function (req, res) {
        let client = undefined;
        let result = undefined;
        try {
            client = g_lib.getUserFromClientID(req.queryParams.client);
            logger.logRequestStarted({
                client: client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/list",
                status: "Started",
                description: "List client saved queries",
            });

            var qry =
                "for v in 1..1 inbound @user owner filter is_same_collection('q',v) sort v.title";

            if (req.queryParams.offset != undefined && req.queryParams.count != undefined) {
                qry += " limit " + req.queryParams.offset + ", " + req.queryParams.count;
                qry += " return { id: v._id, title: v.title }";
                result = g_db._query(
                    qry,
                    {
                        user: client._id,
                    },
                    {},
                    {
                        fullCount: true,
                    },
                );
                var tot = result.getExtra().stats.fullCount;
                result = result.toArray();
                result.push({
                    paging: {
                        off: req.queryParams.offset,
                        cnt: req.queryParams.count,
                        tot: tot,
                    },
                });
            } else {
                qry += " return { id: v._id, title: v.title }";
                result = g_db._query(qry, {
                    user: client._id,
                });
            }

            res.send(result);
            logger.logRequestSuccess({
                client: client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/list",
                status: "Success",
                description: "List client saved queries",
                extra: result,
            });
        } catch (e) {
            logger.logRequestFailure({
                client: client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/list",
                status: "Failure",
                description: "List client saved queries",
                extra: result,
                message: e.message,
                stack: e.stack,
            });
            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().required(), "Client ID")
    .queryParam("offset", joi.number().integer().min(0).optional(), "Offset")
    .queryParam("count", joi.number().integer().min(1).optional(), "Count")
    .summary("List client saved queries")
    .description("List client saved queries");

function execQuery(client, mode, published, orig_query) {
    var col_chk = true,
        ctxt = client._id;
    let query = {
        ...orig_query,
    };
    if (!published) {
        // For searches over private data, must perform access checks based on owner field and client id

        if (query.params.owner.startsWith("u/") && query.params.owner != client._id) {
            // A non-client owner for non-public searches means this is a search over shared data
            if (!g_db.u.exists(query.params.owner))
                throw [g_lib.ERR_NOT_FOUND, "user " + query.params.owner + " not found"];

            ctxt = query.params.owner;

            // Build list of accessible collections shared with client
            if (!query.params.cols) {
                query.params.cols = g_db
                    ._query(
                        "for v in 1..2 inbound @client member, acl filter v.owner == @owner and is_same_collection('c',v) return v._id",
                        {
                            client: client._id,
                            owner: query.params.owner,
                        },
                    )
                    .toArray();
                if (!query.params.cols) {
                    throw [
                        g_lib.ERR_PERM_DENIED,
                        "No access to user '" + query.params.owner + "' data/collections.",
                    ];
                }
                col_chk = false;
            }
        } else if (query.params.owner.startsWith("p/")) {
            if (!g_db.p.exists(query.params.owner))
                throw [g_lib.ERR_NOT_FOUND, "Project " + query.params.owner + " not found"];

            // Must determine clients access to the project

            var role = g_lib.getProjectRole(client._id, query.params.owner);

            /*if( role == g_lib.PROJ_MEMBER ){
                // If no collections specified, add project root
                if ( !query.params.cols ){
                    query.params.cols = ["c/p_" + query.params.owner.substr(2) + "_root"];
                    col_chk = false;
                }*/
            if (role == g_lib.PROJ_MEMBER || role == g_lib.PROJ_NO_ROLE) {
                // Build list of accessible collections shared with client
                if (!query.params.cols) {
                    query.params.cols = g_db
                        ._query(
                            "for v in 1..2 inbound @client member, acl filter v.owner == @owner and is_same_collection('c',v) return v._id",
                            {
                                client: client._id,
                                owner: query.params.owner,
                            },
                        )
                        .toArray();
                    if (!query.params.cols) {
                        throw [
                            g_lib.ERR_PERM_DENIED,
                            "No access to project '" + query.params.owner + "'.",
                        ];
                    }
                    col_chk = false;
                }
            }

            ctxt = query.params.owner;
        }
    }

    //console.log("chk 4");

    // If user-specified collections given, must verify scope and access, then expand to include all sub-collections
    if (query.params.cols) {
        //console.log("proc cols");
        if (col_chk) {
            var col,
                cols = [];

            for (var c in query.params.cols) {
                col = g_lib.resolveCollID2(query.params.cols[c], ctxt);
                //console.log("col:", query.params.cols[c],",ctxt:", ctxt,",id:", col);
                if (query.params.owner) {
                    if (
                        g_db.owner.firstExample({
                            _from: col,
                        })._to != query.params.owner
                    ) {
                        throw [
                            g_lib.ERR_INVALID_PARAM,
                            "Collection '" + col + "' not in search scope.",
                        ];
                    }
                }
                cols.push(col);
            }
            query.params.cols = g_lib.expandSearchCollections(client, cols);
        } else {
            query.params.cols = g_lib.expandSearchCollections(client, query.params.cols);
        }
    }

    //console.log("chk 5");

    if (query.params.sch_id) {
        // sch_id is id:ver
        var idx = query.params.sch_id.indexOf(":");
        if (idx < 0) {
            throw [g_lib.ERR_INVALID_PARAM, "Schema ID missing version number suffix."];
        }
        var sch_id = query.params.sch_id.substr(0, idx),
            sch_ver = parseInt(query.params.sch_id.substr(idx + 1));

        query.params.sch = g_db.sch.firstExample({
            id: sch_id,
            ver: sch_ver,
        });
        if (!query.params.sch)
            throw [g_lib.ERR_NOT_FOUND, "Schema '" + sch_id + "-" + sch_ver + "' does not exist."];

        query.params.sch = query.params.sch._id;
        delete query.params.sch_id;
    }

    // Assemble query based on filter and collection state
    var qry = query.qry_begin;

    if (query.params.cols) {
        if (mode == g_lib.SM_DATA) {
            qry += " for e in item filter e._to == i._id and e._from in @cols";
        } else {
            qry += " filter i._id in @cols";
        }

        if (query.qry_filter) {
            qry += " and " + query.qry_filter;
        }
    } else if (query.qry_filter) {
        qry += " filter " + query.qry_filter;
    }

    qry += query.qry_end;

    //console.log( "execqry" );
    //console.log( "qry", qry );
    //console.log( "params", query.params );

    // Enforce query paging limits
    if (query.params.cnt > g_lib.MAX_PAGE_SIZE) {
        query.params.cnt = g_lib.MAX_PAGE_SIZE;
    }

    if (query.params.off + query.params.cnt > g_lib.MAX_QRY_ITEMS) {
        query.params.off = g_lib.MAX_QRY_ITEMS - query.params.cnt;
    }

    // Increase limit by 1 to detect more results
    query.params.cnt += 1;

    var item,
        result = g_db._query(qry, query.params, {}, {}).toArray(),
        cnt = result.length;

    //console.log( "res len:", result.length, "cnt:", query.params.cnt );

    // If result count is at limit, reduce back to specified limit
    if (result.length == query.params.cnt) {
        query.params.cnt -= 1;
        result.length = query.params.cnt;
    }

    for (var i in result) {
        item = result[i];

        if (item.owner_name && item.owner_name.length) item.owner_name = item.owner_name[0];
        else item.owner_name = null;

        if (item.desc && item.desc.length > 120) {
            item.desc = item.desc.slice(0, 120) + " ...";
        }

        item.notes = g_lib.getNoteMask(client, item);
    }

    result.push({
        paging: {
            off: query.params.off,
            cnt: result.length,
            tot: query.params.off + cnt,
        },
    });

    return result;
}

router
    .get("/exec", function (req, res) {
        let client = undefined;
        let results = undefined;
        try {
            client = g_lib.getUserFromClientID(req.queryParams.client);
            logger.logRequestStarted({
                client: client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/exec",
                status: "Started",
                description: "Execute specified queries",
            });

            var qry = g_db.q.document(req.queryParams.id);

            if (client._id != qry.owner && !client.is_admin) {
                throw g_lib.ERR_PERM_DENIED;
            }

            if (req.queryParams.offset != undefined && req.queryParams.count != undefined) {
                qry.params.off = req.queryParams.offset;
                qry.params.cnt = req.queryParams.count;
            }

            results = execQuery(client, qry.query.mode, qry.query.published, qry);

            res.send(results);
            logger.logRequestSuccess({
                client: client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/exec",
                status: "Success",
                description: "Execute specified queries",
                extra: results,
            });
        } catch (e) {
            logger.logRequestFailure({
                client: client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/exec",
                status: "Failure",
                description: "Execute specified queries",
                extra: results,
                message: e.message,
                stack: e.stack,
            });
            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().required(), "Client ID")
    .queryParam("id", joi.string().required(), "Query ID")
    .queryParam("offset", joi.number().integer().min(0).max(999).optional(), "Offset")
    .queryParam("count", joi.number().integer().min(1).max(1000).optional(), "Count")
    .summary("Execute specified query")
    .description("Execute specified query");

router
    .post("/exec/direct", function (req, res) {
        let results = undefined;
        let client = undefined;
        try {
            client = g_lib.getUserFromClientID_noexcept(req.queryParams.client);
            logger.logRequestStarted({
                client: client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "POST",
                routePath: basePath + "/exec/direct",
                status: "Started",
                description: "Execute published data search query",
            });

            const query = {
                ...req.body,
                params: JSON.parse(req.body.params),
            };
            results = execQuery(client, req.body.mode, req.body.published, query);

            res.send(results);
            logger.logRequestSuccess({
                client: client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "POST",
                routePath: basePath + "/exec/direct",
                status: "Success",
                description: "Execute published data search query",
                extra: results,
            });
        } catch (e) {
            logger.logRequestFailure({
                client: client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "POST",
                routePath: basePath + "/exec/direct",
                status: "Failure",
                description: "Execute published data search query",
                extra: results,
                message: e.message,
                stack: e.stack,
            });
            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().required(), "Client ID")
    .body(
        joi
            .object({
                mode: joi.number().integer().required(),
                published: joi.boolean().required(),
                qry_begin: joi.string().required(),
                qry_end: joi.string().required(),
                qry_filter: joi.string().optional().allow(""),
                params: joi.string().required(),
                limit: joi.number().integer().required(),
            })
            .required(),
        "Collection fields",
    )
    .summary("Execute published data search query")
    .description("Execute published data search query");
