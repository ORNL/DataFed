"use strict";

const createRouter = require("@arangodb/foxx/router");
const router = createRouter();
const joi = require("joi");
const g_db = require("@arangodb").db;
const g_lib = require("./support");
const error = require("./lib/error_codes");
const g_proc = require("./process");
const g_tasks = require("./tasks");
const { UserToken } = require("./lib/user_token");
const logger = require("./lib/logger");
const basePath = "data";

module.exports = router;

//==================== DATA API FUNCTIONS

function recordCreate(client, record, result) {
    var owner_id, parent_id, repo_alloc, alias_key;

    //console.log("Create new data:",record.title);

    // TODO Need to verify parent exists

    if (record.parent) {
        parent_id = g_lib.resolveCollID(record.parent, client);
        owner_id = g_db.owner.firstExample({
            _from: parent_id,
        })._to;
        if (owner_id != client._id) {
            if (!g_lib.hasManagerPermProj(client, owner_id)) {
                var parent_coll = g_db.c.document(parent_id);
                if (!g_lib.hasPermissions(client, parent_coll, g_lib.PERM_CREATE)) {
                    throw error.ERR_PERM_DENIED;
                }
            }
        }
    } else {
        parent_id = g_lib.getRootID(client._id);
        owner_id = client._id;
    }

    // TODO This need to be updated when allocations can be assigned to collections

    // Enforce collection item limit
    var cnt_res = g_db._query(
        "for v in 1..1 outbound @coll item collect with count into n return n",
        {
            coll: parent_id,
        },
    );
    if (cnt_res.next() >= g_lib.MAX_COLL_ITEMS)
        throw [
            error.ERR_INPUT_TOO_LONG,
            "Parent collection item limit exceeded (" + g_lib.MAX_COLL_ITEMS + " items)",
        ];

    var time = Math.floor(Date.now() / 1000),
        obj = {
            size: 0,
            ct: time,
            ut: time,
            owner: owner_id,
            creator: client._id,
        },
        sch_id,
        sch_ver;

    g_lib.procInputParam(record, "title", false, obj);
    g_lib.procInputParam(record, "desc", false, obj);
    g_lib.procInputParam(record, "alias", false, obj);
    g_lib.procInputParam(record, "source", false, obj);
    g_lib.procInputParam(record, "sch_id", false, obj);

    if (record.external) {
        obj.external = true;
        // Verify source path is a full globus path to a file
        if (obj.source) {
            if (!g_lib.isFullGlobusPath(obj.source, true, false)) {
                throw [error.ERR_INVALID_PARAM, "Source must be a full Globus path to a file."];
            }

            obj.size = 1048576; // Don't know actual size - doesn't really matter
        }
    } else {
        // If repo is specified, verify it; otherwise assign one (aware of default)
        if (record.repo) {
            repo_alloc = g_lib.verifyRepo(owner_id, record.repo);
        } else {
            repo_alloc = g_lib.assignRepo(owner_id);
        }

        if (!repo_alloc) throw [error.ERR_NO_ALLOCATION, "No allocation available"];

        // Extension setting only apply to managed data
        if (record.ext) {
            obj.ext_auto = false;
            obj.ext = record.ext;
            if (obj.ext.length && obj.ext.charAt(0) != ".") obj.ext = "." + obj.ext;
        } else {
            obj.ext_auto = true;
        }
    }

    if (record.md) {
        obj.md = JSON.parse(record.md); // parse escaped JSON string TODO: this could be dangerous
        if (Array.isArray(obj.md)) throw [error.ERR_INVALID_PARAM, "Metadata cannot be an array"];
    }

    if (obj.alias) {
        alias_key = owner_id[0] + ":" + owner_id.substr(2) + ":" + obj.alias;
    }

    if (record.tags != undefined) {
        g_lib.addTags(record.tags);
        obj.tags = record.tags;
    }

    // If parent collection or ancestor is published, get tags
    var cat_tags = g_lib.getCollCategoryTags(parent_id);
    if (cat_tags) {
        obj.cat_tags = cat_tags;
        obj.public = true;
    }

    // Note: sch_id function param is the "id:ver" of sch, not "_id", must convert to "_id" before processing
    // sch_id stored in record is sch "_id" field.

    if (obj.sch_id) {
        var idx = obj.sch_id.indexOf(":");
        if (idx < 0) {
            throw [error.ERR_INVALID_PARAM, "Schema ID missing version number suffix."];
        }
        ((sch_id = obj.sch_id.substr(0, idx)), (sch_ver = parseInt(obj.sch_id.substr(idx + 1))));
        var sch = g_db.sch.firstExample({
            id: sch_id,
            ver: sch_ver,
        });

        if (!sch) throw [error.ERR_INVALID_PARAM, "Schema '" + obj.sch_id + "' does not exist"];

        obj.sch_id = sch._id;
        g_db._update(sch._id, {
            cnt: sch.cnt + 1,
        });
    }

    var data = g_db.d.save(obj, {
        returnNew: true,
    }).new;

    g_db.owner.save({
        _from: data._id,
        _to: owner_id,
    });

    g_lib.makeTitleUnique(parent_id, data);

    if (!record.external) {
        // Create data location edge and update allocation and stats
        var loc = {
            _from: data._id,
            _to: repo_alloc._to,
            uid: owner_id,
        };
        g_db.loc.save(loc);
        g_db.alloc.update(repo_alloc._id, {
            rec_count: repo_alloc.rec_count + 1,
        });
        data.repo_id = repo_alloc._to;
    }

    if (alias_key) {
        if (
            g_db.a.exists({
                _key: alias_key,
            })
        )
            throw [error.ERR_INVALID_PARAM, "Alias, " + alias_key + ", already in use"];

        g_db.a.save({
            _key: alias_key,
        });
        g_db.alias.save({
            _from: data._id,
            _to: "a/" + alias_key,
        });
        g_db.owner.save({
            _from: "a/" + alias_key,
            _to: owner_id,
        });
    }

    var updates = new Set();

    // Handle specified dependencies
    if (record.deps != undefined) {
        var dep,
            id,
            dep_data,
            dep_ids = new Set();
        data.deps = [];

        for (var i in record.deps) {
            dep = record.deps[i];
            id = g_lib.resolveDataID(dep.id, client);
            dep_data = g_db.d.document(id);
            if (
                g_db.dep.firstExample({
                    _from: data._id,
                    _to: id,
                })
            )
                throw [
                    error.ERR_INVALID_PARAM,
                    "Only one dependency can be defined between any two data records.",
                ];
            g_db.dep.save({
                _from: data._id,
                _to: id,
                type: dep.type,
            });
            data.deps.push({
                id: id,
                alias: dep_data.alias,
                type: dep.type,
                dir: g_lib.DEP_OUT,
            });

            if (dep.type < g_lib.DEP_IS_NEW_VERSION_OF) dep_ids.add(id);
        }

        if (dep_ids.size) g_lib.annotationDependenciesUpdated(data, dep_ids, null, updates);
    }

    g_db.item.save({
        _from: parent_id,
        _to: data._id,
    });

    // Replace internal sch_id with user-facing sch_id + sch_ver
    if (sch_id) {
        data.sch_id = sch_id + ":" + sch_ver;
    }

    data.id = data._id;
    data.parent_id = parent_id;

    delete data._id;
    delete data._key;
    delete data._rev;

    result.results.push(data);
}

router
    .post("/create", function (req, res) {
        var retry = 10;
        let result = null;
        let client = null;
        for (;;) {
            try {
                logger.logRequestStarted({
                    client: g_lib.getUserFromClientID(req.queryParams.client),
                    correlationId: req.headers["x-correlation-id"],
                    httpVerb: "POST",
                    routePath: basePath + "/create",
                    status: "Started",
                    description: "Create a new data record",
                });
                result = {
                    results: [],
                };

                g_db._executeTransaction({
                    collections: {
                        read: ["u", "uuid", "accn", "repo"],
                        write: [
                            "d",
                            "a",
                            "alloc",
                            "loc",
                            "owner",
                            "alias",
                            "item",
                            "dep",
                            "n",
                            "note",
                            "tag",
                            "sch",
                        ],
                    },
                    action: function () {
                        const client = g_lib.getUserFromClientID(req.queryParams.client);
                        recordCreate(client, req.body, result);
                    },
                });

                res.send(result);
                logger.logRequestSuccess({
                    client: g_lib.getUserFromClientID(req.queryParams.client),
                    correlationId: req.headers["x-correlation-id"],
                    httpVerb: "POST",
                    routePath: basePath + "/create",
                    status: "Success",
                    description: "Create a new data record",
                    extra: result,
                });

                break;
            } catch (e) {
                logger.logRequestFailure({
                    client: g_lib.getUserFromClientID(req.queryParams.client),
                    correlationId: req.headers["x-correlation-id"],
                    httpVerb: "POST",
                    routePath: basePath + "/create",
                    status: "Failure",
                    description: "Create a new data record",
                    extra: result,
                    message: e.message,
                    stack: e.stack,
                });
                if (--retry == 0 || !e.errorNum || e.errorNum != 1200) {
                    g_lib.handleException(e, res);
                }
            }
        }
    })
    .queryParam("client", joi.string().required(), "Client ID")
    .body(
        joi
            .object({
                title: joi.string().allow("").optional(),
                desc: joi.string().allow("").optional(),
                alias: joi.string().allow("").optional(),
                parent: joi.string().allow("").optional(),
                external: joi.boolean().optional(),
                source: joi.string().allow("").optional(),
                repo: joi.string().allow("").optional(),
                md: joi.any().optional(),
                sch_id: joi.string().allow("").optional(),
                ext: joi.string().allow("").optional(),
                ext_auto: joi.boolean().optional(),
                deps: joi
                    .array()
                    .items(
                        joi.object({
                            id: joi.string().required(),
                            type: joi.number().integer().required(),
                        }),
                    )
                    .optional(),
                tags: joi.array().items(joi.string()).optional(),
            })
            .required(),
        "Record fields",
    )
    .summary("Create a new data record")
    .description("Create a new data record from JSON body");

router
    .post("/create/batch", function (req, res) {
        var retry = 10;
        let result = null;
        let client = null;
        for (;;) {
            try {
                logger.logRequestStarted({
                    client: g_lib.getUserFromClientID(req.queryParams.client),
                    correlationId: req.headers["x-correlation-id"],
                    httpVerb: "POST",
                    routePath: basePath + "/create/batch",
                    status: "Started",
                    description: "Create a batch of new data records",
                });
                result = {
                    results: [],
                };

                //console.log( "create data" );

                g_db._executeTransaction({
                    collections: {
                        read: ["u", "uuid", "accn", "repo"],
                        write: [
                            "d",
                            "a",
                            "alloc",
                            "loc",
                            "owner",
                            "alias",
                            "item",
                            "dep",
                            "n",
                            "note",
                            "tag",
                            "sch",
                        ],
                    },
                    action: function () {
                        client = g_lib.getUserFromClientID(req.queryParams.client);
                        for (var i in req.body) {
                            recordCreate(client, req.body[i], result);
                        }
                    },
                });

                res.send(result);
                logger.logRequestSuccess({
                    client: g_lib.getUserFromClientID(req.queryParams.client),
                    correlationId: req.headers["x-correlation-id"],
                    httpVerb: "POST",
                    routePath: basePath + "/create/batch",
                    status: "Success",
                    description: "Create a batch of new data records",
                    extra: result,
                });

                break;
            } catch (e) {
                logger.logRequestFailure({
                    client: g_lib.getUserFromClientID(req.queryParams.client),
                    correlationId: req.headers["x-correlation-id"],
                    httpVerb: "POST",
                    routePath: basePath + "/create/batch",
                    status: "Failure",
                    description: "Create a batch of new data records",
                    extra: result,
                    error: e
                });
                if (--retry == 0 || !e.errorNum || e.errorNum != 1200) {
                    g_lib.handleException(e, res);
                }
            }
        }
    })
    .queryParam("client", joi.string().required(), "Client ID")
    .body(
        joi
            .array()
            .items(
                joi.object({
                    title: joi.string().allow("").optional(),
                    desc: joi.string().allow("").optional(),
                    alias: joi.string().allow("").optional(),
                    parent: joi.string().allow("").optional(),
                    external: joi.boolean().optional(),
                    source: joi.string().allow("").optional(),
                    repo: joi.string().allow("").optional(),
                    md: joi.any().optional(),
                    sch_id: joi.string().allow("").optional(),
                    ext: joi.string().allow("").optional(),
                    ext_auto: joi.boolean().optional(),
                    deps: joi
                        .array()
                        .items(
                            joi.object({
                                id: joi.string().required(),
                                type: joi.number().integer().required(),
                            }),
                        )
                        .optional(),
                    tags: joi.array().items(joi.string()).optional(),
                    id: joi.string().allow("").optional(), // Ignored
                    locked: joi.boolean().optional(), // Ignore
                    size: joi.number().optional(), // Ignored
                    owner: joi.string().allow("").optional(), // Ignored
                    creator: joi.string().allow("").optional(), // Ignored
                    dt: joi.number().optional(), // Ignored
                    ut: joi.number().optional(), // Ignored
                    ct: joi.number().optional(), // Ignored
                }),
            )
            .required(),
        "Array of record with attributes",
    )
    .summary("Create a batch of new data records")
    .description("Create a batch of new data records from JSON body");

function recordUpdate(client, record, result) {
    // /console.log("recordUpdate:",record);

    var data_id = g_lib.resolveDataID(record.id, client);
    var data = g_db.d.document(data_id);

    if (!g_lib.hasAdminPermObject(client, data_id)) {
        // Required permissions depend on which fields are being modified:
        // Metadata = PERM_WR_META, file_size = PERM_WR_DATA, all else = ADMIN
        var perms = 0;
        if (record.md !== undefined) perms |= g_lib.PERM_WR_META;

        if (
            record.title !== undefined ||
            record.alias !== undefined ||
            record.desc !== undefined ||
            record.tags !== undefined ||
            record.source !== undefined ||
            (record.dep_add && record.dep_add.length) ||
            (record.dep_rem && record.dep_rem.length)
        ) {
            perms |= g_lib.PERM_WR_REC;
        }

        if (data.locked || !g_lib.hasPermissions(client, data, perms)) throw error.ERR_PERM_DENIED;
    }

    var owner_id = g_db.owner.firstExample({
            _from: data_id,
        })._to,
        obj = {
            ut: Math.floor(Date.now() / 1000),
        },
        sch,
        i;

    g_lib.procInputParam(record, "title", true, obj);
    g_lib.procInputParam(record, "desc", true, obj);
    g_lib.procInputParam(record, "alias", true, obj);
    g_lib.procInputParam(record, "sch_id", true, obj);
    g_lib.procInputParam(record, "source", true, obj);

    if (record.md === "") {
        obj.md = null;
        obj.md_err_msg = null;
        obj.md_err = false;
    } else if (record.md) {
        obj.md = JSON.parse(record.md);
        if (Array.isArray(obj.md)) {
            throw [error.ERR_INVALID_PARAM, "Metadata cannot be an array"];
        }
        obj.md_err_msg = null;
        obj.md_err = false;
    }

    // Note: sch_id function param is the "id" field of sch, not "_id", must convert to "_id" before processing
    // sch_id stored in record is sch "_id" field.

    if (obj.sch_id === null) {
        // If there was a schema set before, deref count it and clear any metadata errors
        if (data.sch_id) {
            sch = g_db.sch.document(data.sch_id);
            g_db._update(sch._id, {
                cnt: sch.cnt - 1,
            });
            obj.md_err_msg = null;
            obj.md_err = false;
        }
    } else if (obj.sch_id) {
        // Schema ID has changed - clear md err, will be revalidated
        obj.md_err_msg = null;
        obj.md_err = false;

        var idx = obj.sch_id.indexOf(":");
        if (idx < 0) {
            throw [error.ERR_INVALID_PARAM, "Schema ID missing version number suffix."];
        }
        var sch_id = obj.sch_id.substr(0, idx),
            sch_ver = parseInt(obj.sch_id.substr(idx + 1));

        sch = g_db.sch.firstExample({
            id: sch_id,
            ver: sch_ver,
        });

        if (!sch) {
            throw [error.ERR_INVALID_PARAM, "Schema '" + obj.sch_id + "' does not exist"];
        }

        obj.sch_id = sch._id;
        g_db._update(sch._id, {
            cnt: sch.cnt + 1,
        });

        if (data.sch_id) {
            sch = g_db.sch.document(data.sch_id);
            g_db._update(sch._id, {
                cnt: sch.cnt - 1,
            });
        }
    }

    if (data.external) {
        if (obj.source) {
            if (!g_lib.isFullGlobusPath(obj.source, true, false)) {
                throw [error.ERR_INVALID_PARAM, "Source must be a full Globus path to a file."];
            }

            obj.size = 1048576; // Don't know actual size - doesn't really matter
        }
    } else {
        if (obj.source) {
            throw [
                error.ERR_INVALID_PARAM,
                "Raw data source cannot be specified for managed data records.",
            ];
        }

        if (record.ext_auto !== undefined) obj.ext_auto = record.ext_auto;

        if (obj.ext_auto == true || (obj.ext_auto == undefined && data.ext_auto == true)) {
            if (data.source !== undefined) {
                var src = obj.source || data.source;
                if (src) {
                    // Skip possible "." in end-point name
                    var pos = src.lastIndexOf("/");
                    pos = src.indexOf(".", pos > 0 ? pos : 0);
                    if (pos != -1) {
                        obj.ext = src.substr(pos);
                    } else {
                        obj.ext = null;
                    }
                }
            } else {
                obj.ext = null;
            }
        } else {
            g_lib.procInputParam(record, "ext", true, obj);
            if (obj.ext && obj.ext.charAt(0) != ".") obj.ext = "." + obj.ext;
        }
    }

    if (record.tags_clear) {
        if (data.tags) {
            g_lib.removeTags(data.tags);
            obj.tags = null;
        }
    } else if (record.tags != undefined) {
        if (data.tags && data.tags.length) {
            var add_tags = [],
                rem_tags = [],
                tag;

            for (i in data.tags) {
                tag = data.tags[i];
                if (!(tag in record.tags)) {
                    rem_tags.push(tag);
                }
            }

            for (i in record.tags) {
                tag = record.tags[i];
                if (!(tag in data.tags)) {
                    add_tags.push(tag);
                }
            }

            g_lib.addTags(add_tags);
            g_lib.removeTags(rem_tags);
        } else {
            g_lib.addTags(record.tags);
        }

        obj.tags = record.tags;
    }

    //console.log("upd obj",obj);

    data = g_db._update(data_id, obj, {
        keepNull: false,
        returnNew: true,
        mergeObjects: record.mdset ? false : true,
    }).new;

    if (obj.alias !== undefined) {
        var old_alias = g_db.alias.firstExample({
            _from: data_id,
        });
        if (old_alias) {
            const graph = require("@arangodb/general-graph")._graph("sdmsg");
            graph.a.remove(old_alias._to);
        }

        if (obj.alias) {
            var alias_key = owner_id[0] + ":" + owner_id.substr(2) + ":" + obj.alias;
            if (
                g_db.a.exists({
                    _key: alias_key,
                })
            )
                throw [error.ERR_INVALID_PARAM, "Alias, " + obj.alias + ", already in use"];

            g_db.a.save({
                _key: alias_key,
            });
            g_db.alias.save({
                _from: data_id,
                _to: "a/" + alias_key,
            });
            g_db.owner.save({
                _from: "a/" + alias_key,
                _to: owner_id,
            });
        }
    }

    if (record.deps != undefined && (record.deps_add != undefined || record.deps_rem != undefined))
        throw [error.ERR_INVALID_PARAM, "Cannot use both dependency set and add/remove."];

    var dep,
        id,
        deps_add = new Set(),
        deps_rem = new Set();

    if (record.dep_rem != undefined) {
        //console.log("dep_rem set");
        for (i in record.dep_rem) {
            dep = record.dep_rem[i];
            //console.log("dep_rem: ", dep.id, dep.type );

            id = g_lib.resolveDataID(dep.id, client);
            dep = g_db.dep.firstExample({
                _from: data._id,
                _to: id,
                type: dep.type,
            });
            if (!dep)
                throw [
                    error.ERR_INVALID_PARAM,
                    "Specified dependency on " + id + " does not exist.",
                ];

            if (dep.type <= g_lib.DEP_IS_COMPONENT_OF) {
                //console.log("will remove:", id );
                deps_rem.add(id);
            }

            g_db.dep.removeByExample({
                _from: data._id,
                _to: id,
                type: dep.type,
            });
        }
    }

    if (record.dep_add != undefined) {
        for (i in record.dep_add) {
            dep = record.dep_add[i];
            id = g_lib.resolveDataID(dep.id, client);
            if (!id.startsWith("d/"))
                throw [error.ERR_INVALID_PARAM, "Dependencies can only be set on data records."];

            if (
                g_db.dep.firstExample({
                    _from: data._id,
                    _to: id,
                    type: dep.type,
                })
            )
                throw [
                    error.ERR_INVALID_PARAM,
                    "Only one dependency of each type may be defined between any two data records.",
                ];

            g_db.dep.save({
                _from: data_id,
                _to: id,
                type: dep.type,
            });

            if (dep.type <= g_lib.DEP_IS_COMPONENT_OF) deps_add.add(id);
        }

        g_lib.checkDependencies(data_id);
    }

    if (deps_add.size || deps_rem.size) {
        g_lib.annotationDependenciesUpdated(
            data,
            deps_add.size ? deps_add : null,
            deps_rem.size ? deps_rem : null,
            result.updates,
        );
    }

    // Convert DB schema _id to user-facing id + ver
    if (data.sch_id) {
        sch = g_db.sch.document(data.sch_id);
        data.sch_id = sch.id + ":" + sch.ver;
    }

    data.notes = g_lib.getNoteMask(client, data);

    data.deps = g_db
        ._query(
            "for v,e in 1..1 any @data dep return {id:v._id,alias:v.alias,type:e.type,from:e._from}",
            {
                data: data_id,
            },
        )
        .toArray();
    for (i in data.deps) {
        dep = data.deps[i];
        if (dep.from == data_id) dep.dir = g_lib.DEP_OUT;
        else dep.dir = g_lib.DEP_IN;
        delete dep.from;
    }

    result.updates.add(data._id);

    data.id = data._id;

    if (!data.external) {
        var loc = g_db.loc.firstExample({
                _from: data_id,
            }),
            alloc = g_db.alloc.firstExample({
                _from: owner_id,
                _to: loc._to,
            });

        data.repo_id = alloc._to;
    }

    delete data._rev;
    delete data._key;
    delete data._id;

    result.results.push(data);
}

router
    .post("/update", function (req, res) {
       let result = null; 
        try {
            logger.logRequestStarted({
                    client: g_lib.getUserFromClientID(req.queryParams.client),
                    correlationId: req.headers["x-correlation-id"],
                    httpVerb: "POST",
                    routePath: basePath + "/update",
                    status: "Started",
                    description: "Update an existing data record",
            });

            result = {
                results: [],
                updates: new Set(),
            };
            const client = g_lib.getUserFromClientID(req.queryParams.client);

            g_db._executeTransaction({
                collections: {
                    read: ["u", "uuid", "accn", "loc"],
                    write: [
                        "d",
                        "a",
                        "p",
                        "owner",
                        "alias",
                        "alloc",
                        "dep",
                        "n",
                        "note",
                        "tag",
                        "sch",
                    ],
                    exclusive: ["task", "lock", "block"],
                },
                action: function () {
                    recordUpdate(client, req.body, result);
                },
            });

            var doc,
                updates = [];
            result.updates.forEach(function (id) {
                if (id == req.body.id) {
                    // Updated record is already in results - just copy it
                    doc = Object.assign(result.results[0]);
                } else {
                    doc = g_db._document(id);
                    doc.notes = g_lib.getNoteMask(client, doc);
                }
                delete doc.desc;
                //delete doc.md;
                updates.push(doc);
            });
            result.updates = updates;

            res.send(result);
            logger.logRequestSuccess({
                    client: g_lib.getUserFromClientID(req.queryParams.client),
                    correlationId: req.headers["x-correlation-id"],
                    httpVerb: "POST",
                    routePath: basePath + "/update",
                    status: "Success",
                    description: "Update an existing data record",
                    extra: result
                });

        } catch (e) {
            logger.logRequestFailure({
                    client: g_lib.getUserFromClientID(req.queryParams.client),
                    correlationId: req.headers["x-correlation-id"],
                    httpVerb: "POST",
                    routePath: basePath + "/update",
                    status: "Failure",
                    description: "Update an existing data record",
                    extra: result,
                    message: e.message,
                    stack: e.stack
                });

            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().required(), "Client ID")
    .body(
        joi
            .object({
                id: joi.string().required(),
                title: joi.string().allow("").optional(),
                desc: joi.string().allow("").optional(),
                alias: joi.string().allow("").optional(),
                tags: joi.array().items(joi.string()).optional(),
                tags_clear: joi.boolean().optional(),
                md: joi.any().optional(),
                mdset: joi.boolean().optional().default(false),
                sch_id: joi.string().allow("").optional(),
                //size: joi.number().optional(),
                source: joi.string().allow("").optional(),
                ext: joi.string().allow("").optional(),
                ext_auto: joi.boolean().optional(),
                //dt: joi.number().optional(),
                dep_add: joi
                    .array()
                    .items(
                        joi.object({
                            id: joi.string().required(),
                            type: joi.number().integer().required(),
                        }),
                    )
                    .optional(),
                dep_rem: joi
                    .array()
                    .items(
                        joi.object({
                            id: joi.string().required(),
                            type: joi.number().integer().required(),
                        }),
                    )
                    .optional(),
            })
            .required(),
        "Record fields",
    )
    .summary("Update an existing data record")
    .description("Update an existing data record from JSON body");

router
    .post("/update/batch", function (req, res) {
        let result = null;
        try {
            logger.logRequestStarted({
                client: g_lib.getUserFromClientID(req.queryParams.client),
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "POST",
                routePath: basePath + "/update/batch",
                status: "Started",
                description: "Update a batch of existing data record",
            });


            result = {
                results: [],
                updates: new Set(),
            };
            const client = g_lib.getUserFromClientID(req.queryParams.client);

            g_db._executeTransaction({
                collections: {
                    read: ["u", "uuid", "accn", "loc"],
                    write: [
                        "d",
                        "a",
                        "p",
                        "owner",
                        "alias",
                        "alloc",
                        "dep",
                        "n",
                        "note",
                        "tag",
                        "sch",
                    ],
                    exclusive: ["task", "lock", "block"],
                },
                action: function () {
                    var rec;

                    for (var i in req.body) {
                        rec = req.body[i];

                        // Strip-out 'active' fields that should be ignored
                        delete rec.source;
                        delete rec.size;
                        delete rec.dt;

                        recordUpdate(client, rec, result);
                    }
                },
            });

            var doc,
                updates = [];
            result.updates.forEach(function (id) {
                doc = g_db._document(id);
                doc.notes = g_lib.getNoteMask(client, doc);

                delete doc.desc;
                delete doc.md;
                updates.push(doc);
            });
            result.updates = updates;

            res.send(result);
            logger.logRequestSuccess({
                client: g_lib.getUserFromClientID(req.queryParams.client),
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "POST",
                routePath: basePath + "/update/batch",
                status: "Success",
                description: "Update a batch of existing data record",
                extra: result
            });
        } catch (e) {
            logger.logRequestFailure({
                client: g_lib.getUserFromClientID(req.queryParams.client),
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "POST",
                routePath: basePath + "/update/batch",
                status: "Success",
                description: "Update a batch of existing data record",
                extra: result,

            });

            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().required(), "Client ID")
    .body(
        joi
            .array()
            .items(
                joi.object({
                    id: joi.string().required(),
                    title: joi.string().allow("").optional(),
                    desc: joi.string().allow("").optional(),
                    alias: joi.string().allow("").optional(),
                    tags: joi.array().items(joi.string()).optional(),
                    tags_clear: joi.boolean().optional(),
                    md: joi.any().optional(),
                    mdset: joi.boolean().optional().default(false),
                    sch_id: joi.string().allow("").optional(),
                    source: joi.string().allow("").optional(),
                    ext: joi.string().allow("").optional(),
                    ext_auto: joi.boolean().optional(),
                    dep_add: joi
                        .array()
                        .items(
                            joi.object({
                                id: joi.string().required(),
                                type: joi.number().integer().required(),
                            }),
                        )
                        .optional(),
                    dep_rem: joi
                        .array()
                        .items(
                            joi.object({
                                id: joi.string().required(),
                                type: joi.number().integer().required(),
                            }),
                        )
                        .optional(),
                    dt: joi.number().optional(), // Ignore
                    locked: joi.boolean().optional(), // Ignore
                    size: joi.number().optional(), // Ignore
                    owner: joi.string().allow("").optional(), // Ignored
                    creator: joi.string().allow("").optional(), // Ignored
                    ut: joi.number().optional(), // Ignored
                    ct: joi.number().optional(), // Ignored
                }),
            )
            .required(),
        "Array of records and field updates",
    )
    .summary("Update a batch of existing data record")
    .description("Update a batch of existing data record from JSON body");

router
    .post("/update/md_err_msg", function (req, res) {
        try {
            logger.logRequestStarted({
                    client: g_lib.getUserFromClientID(req.queryParams.client),
                    correlationId: req.headers["x-correlation-id"],
                    httpVerb: "POST",
                    routePath: basePath + "/update/md_err_msg",
                    status: "Started",
                    description: "Update data record schema validation error message"
                });

            g_db._executeTransaction({
                collections: {
                    write: ["d"],
                },
                action: function () {
                    const client = g_lib.getUserFromClientID(req.queryParams.client);
                    var data_id = g_lib.resolveDataID(req.queryParams.id, client);

                    if (
                        !g_db.d.exists({
                            _id: data_id,
                        })
                    )
                        throw [error.ERR_INVALID_PARAM, "Record, " + data_id + ", does not exist."];

                    // TODO Update schema validation error flag
                    g_db._update(
                        data_id,
                        {
                            md_err_msg: req.body,
                            md_err: true,
                        },
                        {
                            keepNull: false,
                        },
                    );
                },
            });
            logger.logRequestSuccess({
                    client: g_lib.getUserFromClientID(req.queryParams.client),
                    correlationId: req.headers["x-correlation-id"],
                    httpVerb: "POST",
                    routePath: basePath + "/update/md_err_msg",
                    status: "Success",
                    description: "Update data record schema validation error message",
                    extra:"undefined"
                });
        } catch (e) {
            logger.logRequestSuccess({
                    client: g_lib.getUserFromClientID(req.queryParams.client),
                    correlationId: req.headers["x-correlation-id"],
                    httpVerb: "POST",
                    routePath: basePath + "/update/md_err_msg",
                    status: "Success",
                    description: "Update data record schema validation error message",
                    extra:"undefined"
            });
            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().optional(), "Client ID")
    .queryParam("id", joi.string().required(), "Record ID")
    //.body( joi.string().required(), 'Error message')
    .body(["text/plain"], "Error message")
    .summary("Update data record schema validation error message")
    .description("Update data record schema validation error message");

// Only called after upload of raw data for managed records
router
    .post("/update/size", function (req, res) {
        var retry = 10;

        // Must do this in a retry loop in case of concurrent (non-put) updates
        for (;;) {
            try {
                var result = [];

                g_db._executeTransaction({
                    collections: {
                        read: ["owner", "loc"],
                        write: ["d", "alloc"],
                    },
                    action: function () {
                        var owner_id,
                            data,
                            loc,
                            alloc,
                            rec,
                            obj,
                            t = Math.floor(Date.now() / 1000);

                        for (var i in req.body.records) {
                            rec = req.body.records[i];

                            data = g_db.d.document(rec.id);

                            if (rec.size != data.size) {
                                owner_id = g_db.owner.firstExample({
                                    _from: rec.id,
                                })._to;
                                loc = g_db.loc.firstExample({
                                    _from: rec.id,
                                });
                                alloc = g_db.alloc.firstExample({
                                    _from: owner_id,
                                    _to: loc._to,
                                });

                                obj = {
                                    ut: t,
                                    size: rec.size,
                                    dt: t,
                                };

                                g_db._update(alloc._id, {
                                    data_size: Math.max(0, alloc.data_size - data.size + obj.size),
                                });
                                g_db._update(rec.id, obj);
                            }
                        }
                    },
                });

                res.send(result);
                break;
            } catch (e) {
                if (--retry == 0 || !e.errorNum || e.errorNum != 1200) {
                    g_lib.handleException(e, res);
                }
            }
        }
    })
    .queryParam("client", joi.string().allow("").optional(), "Client ID")
    .body(
        joi
            .object({
                records: joi
                    .array()
                    .items(
                        joi.object({
                            id: joi.string().required(),
                            size: joi.number().required(),
                        }),
                    )
                    .required(),
            })
            .required(),
        "Record fields",
    )
    .summary("Update existing data record size")
    .description("Update existing data record raw data size");

router
    .get("/view", function (req, res) {
        try {
            const client = g_lib.getUserFromClientID_noexcept(req.queryParams.client);

            var data_id = g_lib.resolveDataID(req.queryParams.id, client);

            var data = g_db.d.document(data_id),
                i,
                dep,
                rem_md = false,
                admin = false;

            if (client) {
                admin = g_lib.hasAdminPermObject(client, data_id);

                if (!admin) {
                    var perms = g_lib.getPermissions(
                        client,
                        data,
                        g_lib.PERM_RD_REC | g_lib.PERM_RD_META,
                    );
                    if (data.locked || (perms & (g_lib.PERM_RD_REC | g_lib.PERM_RD_META)) == 0)
                        throw error.ERR_PERM_DENIED;
                    if ((perms & g_lib.PERM_RD_META) == 0) rem_md = true;
                }
            } else if (!g_lib.hasPublicRead(data_id)) {
                throw error.ERR_PERM_DENIED;
            }

            data.notes = g_lib.getNoteMask(client, data);

            if (data.sch_id) {
                var sch = g_db.sch.document(data.sch_id);
                data.sch_id = sch.id + ":" + sch.ver;
            }

            data.deps = g_db
                ._query(
                    "for v,e in 1..1 any @data dep let dir=e._from == @data?1:0 sort dir desc, e.type asc return {id:v._id,alias:v.alias,owner:v.owner,md_err:v.md_err,type:e.type,dir:dir}",
                    {
                        data: data_id,
                    },
                )
                .toArray();
            for (i in data.deps) {
                dep = data.deps[i];
                if (dep.alias && (!client || client._id != dep.owner))
                    dep.alias = dep.owner.charAt(0) + ":" + dep.owner.substr(2) + ":" + dep.alias;

                dep.notes = g_lib.getNoteMask(client, dep);
            }

            if (rem_md && data.md) delete data.md;

            if (!data.external) {
                data.repo_id = g_db.loc.firstExample({
                    _from: data_id,
                })._to;
            }

            delete data._rev;
            delete data._key;
            data.id = data._id;
            delete data._id;

            res.send({
                results: [data],
            });
        } catch (e) {
            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().required(), "Client ID")
    .queryParam("id", joi.string().required(), "Data ID or alias")
    .summary("Get data by ID or alias")
    .description("Get data by ID or alias");

router
    .post("/export", function (req, res) {
        try {
            g_db._executeTransaction({
                collections: {
                    read: ["uuid", "accn", "d", "c", "item"],
                },
                action: function () {
                    const client = g_lib.getUserFromClientID(req.queryParams.client);
                    var i,
                        id,
                        res_ids = [];

                    for (i in req.body.id) {
                        id = g_lib.resolveDataCollID(req.body.id[i], client);
                        res_ids.push(id);
                    }

                    var ctxt = g_proc.preprocessItems(client, null, res_ids, g_lib.TT_DATA_EXPORT);
                    var data,
                        ids = [],
                        results = [];

                    for (i in ctxt.glob_data) ids.push(ctxt.glob_data[i].id);
                    for (i in ctxt.http_data) ids.push(ctxt.http_data[i].id);

                    for (i in ids) {
                        data = g_db.d.document(ids[i]);

                        data.deps = g_db
                            ._query(
                                "for v,e in 1..1 outbound @data dep return {id:v._id,type:e.type}",
                                {
                                    data: data._id,
                                },
                            )
                            .toArray();

                        delete data._rev;
                        delete data._key;
                        data.id = data._id;
                        delete data._id;

                        results.push(JSON.stringify(data));
                    }

                    res.send(results);
                },
            });
        } catch (e) {
            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().required(), "Client ID")
    .body(
        joi
            .object({
                id: joi.array().items(joi.string()).required(),
            })
            .required(),
        "Parameters",
    )
    .summary("Export record metadata")
    .description("Export record metadata");

router
    .get("/dep/graph/get", function (req, res) {
        try {
            const client = g_lib.getUserFromClientID(req.queryParams.client);
            var data_id = g_lib.resolveDataID(req.queryParams.id, client);
            var i,
                j,
                entry,
                rec,
                deps,
                dep,
                node,
                visited = [data_id],
                cur = [[data_id, true]],
                next = [],
                result = [],
                notes,
                gen = 0;

            // Get Ancestors

            //console.log("get ancestors");

            while (cur.length) {
                //console.log("gen",gen);
                for (i in cur) {
                    entry = cur[i];
                    rec = g_db.d.document(entry[0]);

                    if (rec.alias && client._id != rec.owner) {
                        rec.alias =
                            rec.owner.charAt(0) + ":" + rec.owner.substr(2) + ":" + rec.alias;
                    }

                    //console.log("calc notes for", rec._id );
                    notes = g_lib.getNoteMask(client, rec);

                    if (entry[1]) {
                        deps = g_db
                            ._query(
                                "for v,e in 1..1 outbound @data dep return {id:v._id,type:e.type,dir:1}",
                                {
                                    data: entry[0],
                                },
                            )
                            .toArray();

                        for (j in deps) {
                            dep = deps[j];
                            //console.log("dep:",dep.id,"ty:",dep.type);

                            if (visited.indexOf(dep.id) < 0) {
                                visited.push(dep.id);
                                next.push([dep.id, dep.type < 2]);
                            }
                        }
                        result.push({
                            id: rec._id,
                            title: rec.title,
                            alias: rec.alias,
                            owner: rec.owner,
                            creator: rec.creator,
                            size: rec.size,
                            notes: notes,
                            locked: rec.locked,
                            gen: gen,
                            deps: deps,
                        });
                    } else {
                        result.push({
                            id: rec._id,
                            title: rec.title,
                            alias: rec.alias,
                            owner: rec.owner,
                            creator: rec.creator,
                            size: rec.size,
                            notes: notes,
                            locked: rec.locked,
                        });
                    }
                }

                cur = next;
                next = [];
                gen--;
            }

            var gen_min = gen;

            // Get Descendants

            //console.log("get descendants");

            cur = [[data_id, true]];
            next = [];
            gen = 1;

            while (cur.length) {
                //console.log("gen",gen);

                for (i in cur) {
                    entry = cur[i];

                    //rec = g_db.d.document( cur[i] );
                    deps = g_db
                        ._query(
                            "for v,e in 1..1 inbound @data dep return {id:v._id,alias:v.alias,title:v.title,owner:v.owner,creator:v.creator,size:v.size,md_err:v.md_err,locked:v.locked,type:e.type}",
                            {
                                data: entry[0],
                            },
                        )
                        .toArray();

                    if (entry[1]) {
                        for (j in deps) {
                            dep = deps[j];

                            //console.log("dep:",dep.id,"ty:",dep.type);

                            if (visited.indexOf(dep.id) < 0) {
                                // TODO Why are we not just copying the dep object?
                                node = {
                                    id: dep.id,
                                    title: dep.title,
                                    alias: dep.alias,
                                    owner: dep.owner,
                                    creator: dep.creator,
                                    size: dep.size,
                                    md_err: dep.md_err,
                                    locked: dep.locked,
                                    deps: [
                                        {
                                            id: entry[0],
                                            type: dep.type,
                                            dir: 0,
                                        },
                                    ],
                                };
                                if (node.alias && client._id != node.owner)
                                    node.alias =
                                        node.owner.charAt(0) +
                                        ":" +
                                        node.owner.substr(2) +
                                        ":" +
                                        node.alias;

                                node.notes = g_lib.getNoteMask(client, node);

                                if (dep.type < 2) node.gen = gen;
                                result.push(node);
                                visited.push(dep.id);
                                if (dep.type < 2) next.push([dep.id, true]);
                            }
                        }
                    }
                }
                gen += 1;
                cur = next;
                next = [];
            }

            //console.log("adjust gen:",gen_min);

            // Adjust gen values to start at 0
            if (gen_min < 0) {
                for (i in result) {
                    node = result[i];
                    if (node.gen != undefined) node.gen -= gen_min;
                }
            }

            res.send(result);
        } catch (e) {
            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().required(), "Client ID")
    .queryParam("id", joi.string().required(), "Data ID or alias")
    .summary("Get data dependency graph")
    .description("Get data dependency graph");

router
    .get("/lock", function (req, res) {
        try {
            const client = g_lib.getUserFromClientID(req.queryParams.client);
            g_db._executeTransaction({
                collections: {
                    read: ["u", "uuid", "accn", "a", "alias"],
                    write: ["d"],
                },
                action: function () {
                    var obj,
                        i,
                        result = [];
                    for (i in req.queryParams.ids) {
                        obj = g_lib.getObject(req.queryParams.ids[i], client);

                        if (!g_lib.hasAdminPermObject(client, obj._id)) {
                            if (!g_lib.hasPermissions(client, obj, g_lib.PERM_LOCK))
                                throw error.ERR_PERM_DENIED;
                        }
                        g_db._update(
                            obj._id,
                            {
                                locked: req.queryParams.lock,
                            },
                            {
                                returnNew: true,
                            },
                        );
                        result.push({
                            id: obj._id,
                            alias: obj.alias,
                            title: obj.title,
                            owner: obj.owner,
                            locked: req.queryParams.lock,
                        });
                    }
                    res.send(result);
                },
            });
        } catch (e) {
            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().optional(), "Client ID")
    .queryParam("ids", joi.array().items(joi.string()).required(), "Array of data IDs or aliases")
    .queryParam("lock", joi.bool().required(), "Lock (true) or unlock (false) flag")
    .summary("Toggle data record lock")
    .description("Toggle data record lock");

/**
 * @function
 * @description Gets the raw data path for local direct access from the specified domain,
 * if available, for a given data ID and client.
 *
 * The method checks the client's permissions for the data ID and returns the path to the data
 * if the client has the required permissions and the data exists in the specified domain.
 *
 * @param {object} req - The request object, containing the query parameters.
 * @param {object} res - The response object, used to send the raw data path or error.
 *
 * @throws {Error} error.ERR_PERM_DENIED - If the client does not have permission to read the data.
 * @throws {Error} error.ERR_NO_RAW_DATA - If the raw data is not found.
 * @throws {Error} error.ERR_INVALID_PARAM - If the data belongs to a different domain than specified.
 *
 * @returns {void} - Returns the raw data path in the response if the request is successful.
 */
router
    .get("/path", function (req, res) {
        try {
            const client = g_lib.getUserFromClientID(req.queryParams.client);
            var data_id = g_lib.resolveDataID(req.queryParams.id, client);

            if (!g_lib.hasAdminPermObject(client, data_id)) {
                var data = g_db.d.document(data_id);
                var perms = g_lib.getPermissions(client, data, g_lib.PERM_RD_DATA);
                if ((perms & g_lib.PERM_RD_DATA) == 0) throw error.ERR_PERM_DENIED;
            }

            var loc = g_db.loc.firstExample({
                _from: data_id,
            });
            if (!loc) throw error.ERR_NO_RAW_DATA;

            var repo = g_db.repo.document(loc._to);
            if (repo.domain != req.queryParams.domain)
                throw [
                    error.ERR_INVALID_PARAM,
                    "Can only access data from '" + repo.domain + "' domain",
                ];

            var path = g_lib.computeDataPath(loc, true);
            res.send({
                path: path,
            });
            //res.send({ path: repo.exp_path + loc.path.substr( repo.path.length ) });
        } catch (e) {
            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().optional(), "Client ID")
    .queryParam("id", joi.string().required(), "Data ID (not alias)")
    .queryParam("domain", joi.string().required(), "Client domain")
    .summary("Get raw data local path")
    .description("Get raw data local path");

router
    .get("/list/by_alloc", function (req, res) {
        try {
            const client = g_lib.getUserFromClientID(req.queryParams.client);
            var owner_id;

            if (req.queryParams.subject) {
                owner_id = req.queryParams.subject;
                if (req.queryParams.subject.startsWith("u/")) {
                    g_lib.ensureAdminPermUser(client, owner_id);
                } else {
                    g_lib.ensureManagerPermProj(client, owner_id);
                }
            } else {
                owner_id = client._id;
            }

            var qry = "for v,e in 1..1 inbound @repo loc filter e.uid == @uid sort v.title",
                result,
                doc;

            if (req.queryParams.offset != undefined && req.queryParams.count != undefined) {
                qry += " limit " + req.queryParams.offset + ", " + req.queryParams.count;
                qry +=
                    " return { id: v._id, title: v.title, alias: v.alias, owner: v.owner, creator: v.creator, size: v.size, md_err: v.md_err, external: v.external, locked: v.locked }";
                result = g_db._query(
                    qry,
                    {
                        repo: req.queryParams.repo,
                        uid: owner_id,
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
                qry +=
                    " return { id: v._id, title: v.title, alias: v.alias, owner: v.owner, creator: v.creator, size: v.size, md_err: v.md_err, external: v.external, locked: v.locked }";
                result = g_db._query(qry, {
                    repo: req.queryParams.repo,
                    uid: owner_id,
                });
            }

            for (var i in result) {
                doc = result[i];
                if (doc.id) {
                    doc.notes = g_lib.getNoteMask(client, doc);
                }
            }

            res.send(result);
        } catch (e) {
            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().required(), "Client ID")
    .queryParam("subject", joi.string().optional(), "UID of subject user (optional)")
    .queryParam("repo", joi.string().required(), "Repo ID")
    .queryParam("offset", joi.number().optional(), "Offset")
    .queryParam("count", joi.number().optional(), "Count")
    .summary("List data records by allocation")
    .description("List data records by allocation");

router
    .post("/get", function (req, res) {
        try {
            g_db._executeTransaction({
                collections: {
                    read: ["uuid", "accn", "d", "c", "item"],
                    write: ["u"],
                    exclusive: ["task", "lock", "block"],
                },
                action: function () {
                    const client = g_lib.getUserFromClientID(req.queryParams.client);
                    var id,
                        res_ids = [];

                    if (!req.body.check && !req.body.path)
                        throw [
                            error.ERR_INVALID_PARAM,
                            "Must provide path parameter if not running check.",
                        ];

                    const { collection_id, collection_type } = req.body;
                    const is_collection = UserToken.validateRequestParams(req.body);
                    const token_exists = new UserToken({
                        user_id: client._id,
                        globus_collection_id: req.body.collection_id,
                    }).exists();
                    if (is_collection && !token_exists) {
                        throw [
                            error.ERR_NOT_FOUND,
                            "Globus token for mapped collection " +
                                collection_id +
                                " for user " +
                                client._id +
                                " does not exist.",
                        ];
                    }

                    for (var i in req.body.id) {
                        id = g_lib.resolveDataCollID(req.body.id[i], client);
                        res_ids.push(id);
                    }

                    var result = g_tasks.taskInitDataGet(
                        client,
                        req.body.path,
                        req.body.encrypt,
                        res_ids,
                        req.body.orig_fname,
                        req.body.check,
                        is_collection,
                        { collection_id: collection_id, collection_type: collection_type },
                    );

                    if (!req.body.check)
                        g_lib.saveRecentGlobusPath(client, req.body.path, g_lib.TT_DATA_GET);

                    res.send(result);
                },
            });
        } catch (e) {
            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().required(), "Client ID")
    .body(
        joi
            .object({
                id: joi.array().items(joi.string()).required(),
                path: joi.string().optional(),
                encrypt: joi.number().optional(),
                orig_fname: joi.boolean().optional(),
                check: joi.boolean().optional(),
                collection_id: joi.string().optional().guid(),
                collection_type: joi.string().optional().valid("mapped"),
            })
            .required(),
        "Parameters",
    )
    .summary("Get (download) data to Globus destination path")
    .description(
        "Get (download) data to Globus destination path. IDs may be data/collection IDs or aliases.",
    );

router
    .post("/put", function (req, res) {
        try {
            g_db._executeTransaction({
                collections: {
                    read: ["uuid", "accn", "d", "c", "item"],
                    write: ["u"],
                    exclusive: ["task", "lock", "block"],
                },
                action: function () {
                    const client = g_lib.getUserFromClientID(req.queryParams.client);
                    var res_ids = [];

                    if (!req.body.check && !req.body.path)
                        throw [
                            error.ERR_INVALID_PARAM,
                            "Must provide path parameter if not running check.",
                        ];

                    if (req.body.id.length > 1)
                        throw [
                            error.ERR_INVALID_PARAM,
                            "Concurrent put of multiple records no supported.",
                        ];

                    const { collection_id, collection_type } = req.body;
                    const is_collection = UserToken.validateRequestParams(req.body);
                    const token_exists = new UserToken({
                        user_id: client._id,
                        globus_collection_id: req.body.collection_id,
                    }).exists();
                    if (is_collection && !token_exists) {
                        throw [
                            error.ERR_NOT_FOUND,
                            "Globus token for mapped collection " +
                                collection_id +
                                " for user " +
                                client._id +
                                " does not exist.",
                        ];
                    }

                    for (var i in req.body.id) {
                        res_ids.push(g_lib.resolveDataID(req.body.id[i], client));
                    }

                    var result = g_tasks.taskInitDataPut(
                        client,
                        req.body.path,
                        req.body.encrypt,
                        req.body.ext,
                        res_ids,
                        req.body.check,
                        is_collection,
                        { collection_id: collection_id, collection_type: collection_type },
                    );

                    if (!req.body.check)
                        g_lib.saveRecentGlobusPath(client, req.body.path, g_lib.TT_DATA_PUT);

                    res.send(result);
                },
            });
        } catch (e) {
            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().required(), "Client ID")
    .body(
        joi
            .object({
                id: joi.array().items(joi.string()).required(),
                path: joi.string().optional(),
                encrypt: joi.number().optional(),
                ext: joi.string().optional(),
                check: joi.boolean().optional(),
                collection_id: joi.string().optional().guid(),
                collection_type: joi.string().optional().valid("mapped"),
            })
            .required(),
        "Parameters",
    )
    .summary("Put (upload) raw data to record")
    .description(
        "Put (upload) raw data to record from Globus source path. ID must be a data ID or alias.",
    );

router
    .post("/alloc_chg", function (req, res) {
        try {
            g_db._executeTransaction({
                collections: {
                    read: ["u", "uuid", "accn", "d", "c", "item"],
                    exclusive: ["task", "lock", "block"],
                },
                action: function () {
                    const client = g_lib.getUserFromClientID(req.queryParams.client);
                    var id,
                        res_ids = [];

                    for (var i in req.body.ids) {
                        id = g_lib.resolveDataCollID(req.body.ids[i], client);
                        res_ids.push(id);
                    }

                    var result = g_tasks.taskInitRecAllocChg(
                        client,
                        req.body.proj_id,
                        res_ids,
                        req.body.repo_id,
                        req.body.check,
                    );

                    res.send(result);
                },
            });
        } catch (e) {
            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().required(), "Client ID")
    .body(
        joi
            .object({
                ids: joi.array().items(joi.string()).required(),
                proj_id: joi.string().optional(),
                repo_id: joi.string().required(),
                check: joi.boolean().optional(),
            })
            .required(),
        "Parameters",
    )
    .summary("Move raw data to a new allocation")
    .description("Move data to a new allocation. IDs may be data/collection IDs or aliases.");

router
    .post("/owner_chg", function (req, res) {
        try {
            g_db._executeTransaction({
                collections: {
                    read: ["u", "uuid", "accn", "d", "c", "item", "admin"],
                    exclusive: ["task", "lock", "block"],
                },
                action: function () {
                    const client = g_lib.getUserFromClientID(req.queryParams.client);
                    var id,
                        res_ids = [];

                    for (var i in req.body.ids) {
                        id = g_lib.resolveDataCollID(req.body.ids[i], client);
                        res_ids.push(id);
                    }
                    var coll_id = g_lib.resolveDataCollID(req.body.coll_id, client);
                    var result = g_tasks.taskInitRecOwnerChg(
                        client,
                        res_ids,
                        coll_id,
                        req.body.repo_id,
                        req.body.check,
                    );

                    res.send(result);
                },
            });
        } catch (e) {
            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().required(), "Client ID")
    .body(
        joi
            .object({
                ids: joi.array().items(joi.string()).required(),
                coll_id: joi.string().required(),
                repo_id: joi.string().optional(),
                check: joi.boolean().optional(),
            })
            .required(),
        "Parameters",
    )
    .summary("Move data records and raw data to a new owner/allocation")
    .description(
        "Move data records and raw data to a new owner/allocation. IDs may be data/collection IDs or aliases.",
    );

router
    .post("/delete", function (req, res) {
        var retry = 10;

        for (;;) {
            try {
                g_db._executeTransaction({
                    collections: {
                        read: ["u", "uuid", "accn"],
                        write: [
                            "d",
                            "c",
                            "a",
                            "alias",
                            "owner",
                            "item",
                            "acl",
                            "loc",
                            "alloc",
                            "p",
                            "t",
                            "top",
                            "dep",
                            "n",
                            "note",
                        ],
                        exclusive: ["lock", "task", "block"],
                    },
                    action: function () {
                        const client = g_lib.getUserFromClientID(req.queryParams.client);
                        var i,
                            id,
                            ids = [];

                        for (i in req.body.ids) {
                            id = g_lib.resolveDataCollID(req.body.ids[i], client);
                            ids.push(id);
                        }

                        var result = g_tasks.taskInitRecCollDelete(client, ids);

                        res.send(result);
                    },
                });
                break;
            } catch (e) {
                if (--retry == 0 || !e.errorNum || e.errorNum != 1200) {
                    g_lib.handleException(e, res);
                }
            }
        }
    })
    .queryParam("client", joi.string().required(), "Client ID")
    .body(
        joi
            .object({
                ids: joi.array().items(joi.string()).required(),
            })
            .required(),
        "Parameters",
    )
    .summary("Delete collections, data records and raw data")
    .description(
        "Delete collections, data records and associated raw data. IDs may be data IDs or aliases.",
    );
