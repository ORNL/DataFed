"use strict";

const createRouter = require("@arangodb/foxx/router");
const router = createRouter();
const joi = require("joi");

const g_db = require("@arangodb").db;
const g_graph = require("@arangodb/general-graph")._graph("sdmsg");
const g_lib = require("./support");
const error = require("./lib/error_codes");
const permissions = require("./lib/permissions");

module.exports = router;

//===== COLLECTION API FUNCTIONS =====

router
    .post("/create", function (req, res) {
        var retry = 10;

        for (;;) {
            try {
                var result = [];

                g_db._executeTransaction({
                    collections: {
                        read: ["u", "uuid", "accn", "alloc"],
                        write: ["c", "a", "alias", "owner", "item", "t", "top", "tag"],
                    },
                    action: function () {
                        const client = g_lib.getUserFromClientID(req.queryParams.client);
                        var owner = client,
                            parent_id;

                        if (req.body.parent) {
                            parent_id = g_lib.resolveCollID(req.body.parent, client);

                            var owner_id = g_db.owner.firstExample({
                                _from: parent_id,
                            })._to;
                            if (owner_id != client._id) {
                                if (!permissions.hasManagerPermProj(client, owner_id)) {
                                    var parent_coll = g_db.c.document(parent_id);

                                    if (
                                        !permissions.hasPermissions(
                                            client,
                                            parent_coll,
                                            permissions.PERM_CREATE,
                                        )
                                    )
                                        throw error.ERR_PERM_DENIED;
                                }
                                owner = g_db._document(owner_id);
                            }
                        } else {
                            parent_id = g_lib.getRootID(client._id);
                        }

                        // Ensure owner of collection has at least one allocation
                        if (
                            !g_db.alloc.firstExample({
                                _from: owner_id,
                            })
                        ) {
                            throw [
                                error.ERR_NO_ALLOCATION,
                                "An allocation is required to create a collection.",
                            ];
                        }

                        // Enforce collection limit if set
                        if (owner.max_coll >= 0) {
                            var count = g_db
                                ._query(
                                    "return length(FOR i IN owner FILTER i._to == @id and is_same_collection('c',i._from) RETURN 1)",
                                    {
                                        id: owner_id,
                                    },
                                )
                                .next();
                            if (count >= owner.max_coll)
                                throw [
                                    error.ERR_ALLOCATION_EXCEEDED,
                                    "Collection limit reached (" +
                                        owner.max_coll +
                                        "). Contact system administrator to increase limit.",
                                ];
                        }

                        var time = Math.floor(Date.now() / 1000);
                        var obj = {
                            owner: owner._id,
                            creator: client._id,
                            ct: time,
                            ut: time,
                        };

                        g_lib.procInputParam(req.body, "title", false, obj);
                        g_lib.procInputParam(req.body, "desc", false, obj);
                        g_lib.procInputParam(req.body, "alias", false, obj);

                        if (req.body.topic) {
                            g_lib.procInputParam(req.body, "topic", false, obj);

                            obj.public = true;
                            obj.cat_tags = [];

                            var tag,
                                tags = req.body.topic.split(".");
                            for (var i in tags) {
                                tag = tags[i];
                                if (tag) obj.cat_tags.push(tag);
                            }

                            //g_lib.addTags( obj.cat_tags );
                        }

                        if (req.body.tags != undefined) {
                            g_lib.addTags(req.body.tags);
                            obj.tags = req.body.tags;
                        }

                        var coll = g_db.c.save(obj, {
                            returnNew: true,
                        });
                        g_db.owner.save({
                            _from: coll._id,
                            _to: owner._id,
                        });

                        g_lib.makeTitleUnique(parent_id, coll.new);

                        g_graph.item.save({
                            _from: parent_id,
                            _to: coll._id,
                        });

                        if (obj.alias) {
                            var alias_key =
                                owner._id[0] + ":" + owner._id.substr(2) + ":" + obj.alias;

                            g_db.a.save({
                                _key: alias_key,
                            });
                            g_db.alias.save({
                                _from: coll._id,
                                _to: "a/" + alias_key,
                            });
                            g_db.owner.save({
                                _from: "a/" + alias_key,
                                _to: owner._id,
                            });
                        }

                        if (obj.topic) {
                            g_lib.topicLink(obj.topic, coll._id, owner._id);
                        }

                        coll = coll.new;
                        coll.id = coll._id;
                        coll.parent_id = parent_id;
                        delete coll._id;
                        delete coll._key;
                        delete coll._rev;

                        result.push(coll);
                    },
                });

                res.send({
                    results: result,
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
                title: joi.string().allow("").optional(),
                desc: joi.string().allow("").optional(),
                alias: joi.string().allow("").optional(),
                topic: joi.string().allow("").optional(),
                parent: joi.string().allow("").optional(),
                tags: joi.array().items(joi.string()).optional(),
            })
            .required(),
        "Collection fields",
    )
    .summary("Create a new data collection")
    .description("Create a new data collection from JSON body");

router
    .post("/update", function (req, res) {
        var retry = 10;

        for (;;) {
            try {
                var result = {
                    results: [],
                    updates: [],
                };

                g_db._executeTransaction({
                    collections: {
                        read: ["u", "uuid", "accn"],
                        write: ["c", "a", "d", "owner", "alias", "t", "top", "tag"],
                    },
                    action: function () {
                        const client = g_lib.getUserFromClientID(req.queryParams.client);
                        var coll_id = g_lib.resolveCollID(req.body.id, client);
                        var coll = g_db.c.document(coll_id);

                        //console.log("update coll",req.body);

                        var time = Math.floor(Date.now() / 1000),
                            obj = {
                                ut: time,
                            },
                            i,
                            tags,
                            tag; //, idx;

                        g_lib.procInputParam(req.body, "title", true, obj);
                        g_lib.procInputParam(req.body, "desc", true, obj);
                        g_lib.procInputParam(req.body, "alias", true, obj);
                        g_lib.procInputParam(req.body, "topic", true, obj);

                        //console.log("coll obj:",obj);

                        if (!permissions.hasAdminPermObject(client, coll_id)) {
                            var perms = 0;

                            if (
                                obj.title !== undefined ||
                                obj.alias !== undefined ||
                                obj.desc !== undefined
                            )
                                perms |= permissions.PERM_WR_REC;

                            if (obj.topic !== undefined) perms |= permissions.PERM_SHARE;

                            if (!permissions.hasPermissions(client, coll, perms))
                                throw error.ERR_PERM_DENIED;
                        }

                        /* Updating topic and tags is complex because topic parts are added as
                        collection tags, and the user must not be able to interfere with this
                        behavior.
                            1. If topic is changed, old unused topic tags must be removed, and new topic tags added
                            2. If user updates tags, tags must be added/removed based on diff, excluding any topic tags
                            3. If both topic and tags are changed, user tags and topic tags must be differentiated
                               and topic tags take priority. (user may not remove a topic tag)
                        */

                        //if ( coll.tags ){
                        //g_lib.removeTags( coll.tags );

                        if (req.body.tags_clear) {
                            req.body.tags = [];
                        }

                        if (obj.topic !== undefined && obj.topic != coll.topic) {
                            //console.log("update topic, old:", data.topic ,",new:", obj.topic );
                            if (coll.topic) {
                                //console.log("rem cat_tags:",coll.cat_tags);
                                //console.log("unlink old topic");
                                g_lib.topicUnlink(coll._id);
                                obj.public = null;
                                obj.cat_tags = null;
                                //rem_tags = coll.cat_tags;
                            }

                            if (obj.topic && obj.topic.length) {
                                //console.log("link new topic");
                                g_lib.topicLink(obj.topic, coll._id, coll.owner);
                                obj.public = true;
                                obj.cat_tags = [];

                                tags = obj.topic.split(".");
                                for (i in tags) {
                                    tag = tags[i];
                                    if (tag) {
                                        obj.cat_tags.push(tag);
                                        //idx = rem_tag.indexOf( tag );
                                        //if ( idx != -1 ){
                                        //    rem_tag.splice( idx, 1 );
                                        //}
                                    }
                                }
                                //console.log("add cat_tags:",obj.cat_tags);
                            }

                            //console.log("cat add_tags:",add_tags,"cat rem_tags:",rem_tags);

                            //g_lib.addTags( add_tags );
                            //g_lib.removeTags( rem_tags );
                        }

                        //console.log("col upd tags",req.body.tags);
                        if (req.body.tags != undefined) {
                            if (coll.tags && coll.tags.length) {
                                var add_tags = [],
                                    rem_tags = [];

                                //console.log("coll.tags:",coll.tags,"req.body.tags:",req.body.tags);

                                for (i in coll.tags) {
                                    tag = coll.tags[i];
                                    if (!req.body.tags.includes(tag)) {
                                        rem_tags.push(tag);
                                    }
                                }

                                for (i in req.body.tags) {
                                    tag = req.body.tags[i];
                                    if (!coll.tags.includes(tag)) {
                                        add_tags.push(tag);
                                    }
                                }

                                //console.log("add_tags:",add_tags,"rem_tags:",rem_tags);

                                g_lib.addTags(add_tags);
                                g_lib.removeTags(rem_tags);
                            } else {
                                g_lib.addTags(req.body.tags);
                            }

                            obj.tags = req.body.tags;
                        }

                        coll = g_db._update(coll_id, obj, {
                            keepNull: false,
                            returnNew: true,
                        });
                        coll = coll.new;

                        if (obj.cat_tags !== undefined) {
                            //console.log("update topic data");
                            g_lib.catalogUpdateColl(coll);
                        }

                        if (obj.alias !== undefined) {
                            var old_alias = g_db.alias.firstExample({
                                _from: coll_id,
                            });
                            if (old_alias) {
                                const graph = require("@arangodb/general-graph")._graph("sdmsg");
                                graph.a.remove(old_alias._to);
                            }

                            if (obj.alias) {
                                var owner_id = g_db.owner.firstExample({
                                    _from: coll_id,
                                })._to;
                                var alias_key =
                                    owner_id[0] + ":" + owner_id.substr(2) + ":" + obj.alias;

                                g_db.a.save({
                                    _key: alias_key,
                                });
                                g_db.alias.save({
                                    _from: coll_id,
                                    _to: "a/" + alias_key,
                                });
                                g_db.owner.save({
                                    _from: "a/" + alias_key,
                                    _to: owner_id,
                                });
                            }
                        }

                        delete coll._rev;
                        delete coll._key;
                        coll.id = coll._id;
                        delete coll._id;

                        result.results.push(coll);
                        result.updates.push(coll);
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
    .queryParam("client", joi.string().required(), "Client ID")
    .body(
        joi
            .object({
                id: joi.string().required(),
                title: joi.string().allow("").optional(),
                desc: joi.string().allow("").optional(),
                alias: joi.string().allow("").optional(),
                topic: joi.string().allow("").optional(),
                tags: joi.array().items(joi.string()).optional(),
                tags_clear: joi.boolean().optional(),
            })
            .required(),
        "Collection fields",
    )
    .summary("Update an existing collection")
    .description("Update an existing collection from JSON body");

router
    .get("/view", function (req, res) {
        try {
            const client = g_lib.getUserFromClientID_noexcept(req.queryParams.client);

            var coll_id = g_lib.resolveCollID(req.queryParams.id, client),
                coll = g_db.c.document(coll_id),
                admin = false;

            if (client) {
                admin = permissions.hasAdminPermObject(client, coll_id);

                if (!admin) {
                    if (!permissions.hasPermissions(client, coll, permissions.PERM_RD_REC)) {
                        //console.log("perm denied");
                        throw error.ERR_PERM_DENIED;
                    }
                }
            } else if (!g_lib.hasPublicRead(coll_id)) {
                throw error.ERR_PERM_DENIED;
            }

            coll.notes = g_lib.getNoteMask(client, coll, admin);

            coll.id = coll._id;
            delete coll._id;
            delete coll._key;
            delete coll._rev;

            res.send({
                results: [coll],
            });
        } catch (e) {
            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().required(), "Client ID")
    .queryParam("id", joi.string().required(), "Collection ID or alias")
    .summary("View collection information by ID or alias")
    .description("View collection information by ID or alias");

router
    .get("/read", function (req, res) {
        try {
            const client = g_lib.getUserFromClientID_noexcept(req.queryParams.client);

            var coll_id = g_lib.resolveCollID(req.queryParams.id, client),
                coll = g_db.c.document(coll_id),
                admin = false;

            if (client) {
                admin = permissions.hasAdminPermObject(client, coll_id);

                if (!admin) {
                    if (!permissions.hasPermissions(client, coll, permissions.PERM_LIST))
                        throw error.ERR_PERM_DENIED;
                }
            } else if (!g_lib.hasPublicRead(coll_id)) {
                throw error.ERR_PERM_DENIED;
            }

            var qry =
                    "for v in 1..1 outbound @coll item sort is_same_collection('c',v) DESC, v.title",
                result,
                params = {
                    coll: coll_id,
                },
                item;

            if (req.queryParams.offset != undefined && req.queryParams.count != undefined) {
                qry += " limit " + req.queryParams.offset + ", " + req.queryParams.count;
                qry +=
                    " return { id: v._id, title: v.title, alias: v.alias, owner: v.owner, creator: v.creator, size: v.size, external: v.external, md_err: v.md_err, locked: v.locked }";
                result = g_db._query(
                    qry,
                    params,
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
                    " return { id: v._id, title: v.title, alias: v.alias, owner: v.owner, creator: v.creator, size: v.size, external: v.external, md_err: v.md_err, locked: v.locked }";
                result = g_db._query(qry, params).toArray();
            }

            for (var i in result) {
                item = result[i];
                if (item.id) {
                    item.notes = g_lib.getNoteMask(client, item, admin);
                }
            }

            res.send(result);
        } catch (e) {
            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().required(), "Client ID")
    .queryParam("id", joi.string().required(), "Collection ID or alias to list")
    .queryParam("offset", joi.number().integer().min(0).optional(), "Offset")
    .queryParam("count", joi.number().integer().min(1).optional(), "Count")
    .summary("Read contents of a collection by ID or alias")
    .description("Read contents of a collection by ID or alias");

router
    .get("/write", function (req, res) {
        try {
            g_db._executeTransaction({
                collections: {
                    read: ["u", "c", "uuid", "accn"],
                    write: ["item", "d"],
                },
                action: function () {
                    const client = g_lib.getUserFromClientID(req.queryParams.client);

                    if (req.queryParams.add && req.queryParams.remove) {
                        throw [
                            error.ERR_INVALID_PARAM,
                            "Cannot add and remove collection items at the same time.",
                        ];
                    }

                    var coll_id = g_lib.resolveCollID(req.queryParams.id, client);
                    var coll = g_db.c.document(coll_id);
                    var owner_id = g_db.owner.firstExample({
                        _from: coll_id,
                    })._to;
                    var chk_perm = false;

                    if (!permissions.hasAdminPermObject(client, coll_id)) {
                        var req_perm = permissions.PERM_LINK;
                        if (!permissions.hasPermissions(client, coll, req_perm, true))
                            throw [
                                error.ERR_PERM_DENIED,
                                "Permission denied - requires LINK on collection.",
                            ];

                        chk_perm = true;
                    }

                    var i,
                        obj,
                        cres,
                        loose,
                        have_loose = false,
                        visited = {},
                        coll_ctx = g_lib.catalogCalcParCtxt(coll, visited);

                    // Enforce following link/unlink rules:
                    // 1. Root collection may not be linked
                    // 2. Items can only be linked once to a given collection
                    // 3. Only items sharing the same owner as the target collection may be linked
                    // 4. Linking and unlinking requires WRITE permission on parent collections and ADMIN permission on item
                    // 5. Circular links are not allowed (linking a parent into a child collection)
                    // 6. Collections can only be linked to one parent
                    // 7. All records and collections must have at least one parent (except root)

                    if (req.queryParams.remove) {
                        loose = {};

                        for (i in req.queryParams.remove) {
                            obj = g_lib.getObject(req.queryParams.remove[i], client);

                            if (
                                !g_db.item.firstExample({
                                    _from: coll_id,
                                    _to: obj._id,
                                })
                            )
                                throw [
                                    error.ERR_UNLINK,
                                    obj._id + " is not in collection " + coll_id,
                                ];

                            if (chk_perm && obj.creator != client._id) {
                                // Check if another instance exists in same scope, if not deny permission
                                if (!g_lib.hasAnyCommonAccessScope(obj._id, coll_id)) {
                                    throw [
                                        error.ERR_PERM_DENIED,
                                        "Cannot unlink items owned by other users.",
                                    ];
                                }
                            }

                            g_db.item.removeByExample({
                                _from: coll_id,
                                _to: obj._id,
                            });

                            if (
                                !g_db.item.firstExample({
                                    _to: obj._id,
                                })
                            ) {
                                loose[obj._id] = obj;
                                have_loose = true;
                            } else if (coll_ctx.pub) {
                                if (obj._id.charAt(0) == "c") {
                                    // Must update all records in this collection
                                    g_lib.catalogUpdateColl(obj, null, visited);
                                } else {
                                    // Update this record
                                    g_lib.catalogUpdateRecord(obj, null, null, visited);
                                }
                            }
                        }
                    }

                    if (req.queryParams.add) {
                        // Limit number of items in collection
                        cres = g_db._query("for v in 1..1 outbound @coll item return v._id", {
                            coll: coll_id,
                        });
                        //console.log("coll item count:",cres.count());
                        if (cres.count() + req.queryParams.add.length > g_lib.MAX_COLL_ITEMS)
                            throw [
                                error.ERR_INPUT_TOO_LONG,
                                "Collection item limit exceeded (" +
                                    g_lib.MAX_COLL_ITEMS +
                                    " items)",
                            ];

                        cres.dispose();

                        for (i in req.queryParams.add) {
                            obj = g_lib.getObject(req.queryParams.add[i], client);

                            // Check if item is already in this collection
                            if (
                                g_db.item.firstExample({
                                    _from: coll_id,
                                    _to: obj._id,
                                })
                            )
                                throw [error.ERR_LINK, obj._id + " already linked to " + coll_id];

                            // Check if item is a root collection
                            if (obj.is_root) throw [error.ERR_LINK, "Cannot link root collection"];

                            // Check if item has same owner as this collection
                            if (
                                g_db.owner.firstExample({
                                    _from: obj._id,
                                })._to != owner_id
                            )
                                throw [
                                    error.ERR_LINK,
                                    obj._id + " and " + coll_id + " have different owners",
                                ];

                            if (chk_perm && obj.creator != client._id) {
                                // TODO check if another instance exists in same scope, if not deny
                                if (!g_lib.hasAnyCommonAccessScope(obj._id, coll_id)) {
                                    throw [
                                        error.ERR_PERM_DENIED,
                                        "Cannot link items from other access-control scopes.",
                                    ];
                                }
                            }

                            if (obj._id.charAt(0) == "c") {
                                // Check for circular dependency
                                if (obj._id == coll_id || g_lib.isSrcParentOfDest(obj._id, coll_id))
                                    throw [
                                        error.ERR_LINK,
                                        "Cannot link ancestor, " +
                                            obj._id +
                                            ", to descendant, " +
                                            coll_id,
                                    ];

                                // Collections can only be linked to one parent
                                g_db.item.removeByExample({
                                    _to: obj._id,
                                });
                                g_db.item.save({
                                    _from: coll_id,
                                    _to: obj._id,
                                });

                                if (coll_ctx.pub) {
                                    //console.log("update pub coll");

                                    // Must update all records in this collection
                                    g_lib.catalogUpdateColl(obj, coll_ctx, visited);
                                }
                            } else {
                                g_db.item.save({
                                    _from: coll_id,
                                    _to: obj._id,
                                });

                                if (coll_ctx.pub) {
                                    //console.log("update pub record");

                                    // Update this record
                                    g_lib.catalogUpdateRecord(obj, coll, coll_ctx, visited);
                                }
                            }
                        }
                    }

                    // 7. Re-link loose items to root
                    if (have_loose) {
                        var root_id = g_lib.getRootID(owner_id),
                            rctxt = null,
                            loose_res = [];

                        cres = g_db._query("for v in 1..1 outbound @coll item return v._id", {
                            coll: root_id,
                        });

                        if (
                            cres.count() + (req.queryParams.add ? req.queryParams.add.length : 0) >
                            g_lib.MAX_COLL_ITEMS
                        )
                            throw [
                                error.ERR_INPUT_TOO_LONG,
                                "Root collection item limit exceeded (" +
                                    g_lib.MAX_COLL_ITEMS +
                                    " items)",
                            ];

                        cres.dispose();

                        if (coll_ctx.pub) {
                            rctxt = {
                                pub: false,
                                tag: new Set(),
                            };
                        }

                        for (i in loose) {
                            obj = loose[i];
                            g_db.item.save({
                                _from: root_id,
                                _to: obj._id,
                            });

                            loose_res.push({
                                id: obj._id,
                                title: obj.title,
                            });

                            if (coll_ctx.pub) {
                                if (obj._id.charAt(0) == "c") {
                                    // Must update all records in this collection
                                    g_lib.catalogUpdateColl(obj, rctxt, visited);
                                } else {
                                    // Update this record
                                    g_db._update(
                                        obj._id,
                                        {
                                            public: false,
                                            cat_tags: null,
                                        },
                                        {
                                            keepNull: false,
                                        },
                                    );
                                }
                            }

                            res.send(loose_res);
                        }
                    } else {
                        res.send([]);
                    }
                },
            });
        } catch (e) {
            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().required(), "Client ID")
    .queryParam("id", joi.string().required(), "Collection ID or alias to modify")
    .queryParam("add", joi.array().items(joi.string()).optional(), "Array of item IDs to add")
    .queryParam("remove", joi.array().items(joi.string()).optional(), "Array of item IDs to remove")
    .summary("Add/remove items in a collection")
    .description("Add/remove items in a collection");

router
    .get("/move", function (req, res) {
        try {
            g_db._executeTransaction({
                collections: {
                    read: ["u", "c", "uuid", "accn"],
                    write: ["item", "d"],
                },
                action: function () {
                    const client = g_lib.getUserFromClientID(req.queryParams.client);
                    var src_id = g_lib.resolveCollID(req.queryParams.source, client),
                        src = g_db.c.document(src_id),
                        dst_id = g_lib.resolveCollID(req.queryParams.dest, client),
                        dst = g_db.c.document(dst_id),
                        visited = {},
                        src_ctx = g_lib.catalogCalcParCtxt(src, visited),
                        dst_ctx = g_lib.catalogCalcParCtxt(dst, visited),
                        is_pub = src_ctx.pub | dst_ctx.pub;

                    if (src.owner != dst.owner)
                        throw [
                            error.ERR_LINK,
                            req.queryParams.source +
                                " and " +
                                req.queryParams.dest +
                                " have different owners",
                        ];

                    var chk_perm = false,
                        src_perms = 0,
                        dst_perms = 0;

                    if (!permissions.hasAdminPermObject(client, src_id)) {
                        src_perms = permissions.getPermissions(client, src, permissions.PERM_LINK, true);
                        if ((src_perms & permissions.PERM_LINK) == 0)
                            throw [
                                error.ERR_PERM_DENIED,
                                "Permission denied - requires LINK on source collection.",
                            ];

                        chk_perm = true;
                    }

                    if (!permissions.hasAdminPermObject(client, dst_id)) {
                        dst_perms = permissions.getPermissions(
                            client,
                            dst,
                            permissions.PERM_LINK,
                            true,
                        );
                        if ((dst_perms & permissions.PERM_LINK) == 0)
                            throw [
                                error.ERR_PERM_DENIED,
                                "Permission denied - requires LINK on destination collection.",
                            ];

                        chk_perm = true;
                    }

                    var i, item;

                    for (i in req.queryParams.items) {
                        // TODO - should aliases be resolved with client or owner ID?
                        item = g_lib.getObject(req.queryParams.items[i], client);

                        if (item.is_root) throw [error.ERR_LINK, "Cannot link root collection"];

                        if (chk_perm && item.creator != client._id /*&& !has_share*/) {
                            if (!g_lib.hasCommonAccessScope(src_id, dst_id)) {
                                throw [
                                    error.ERR_PERM_DENIED,
                                    "Cannot move items across access-control scopes.",
                                ];
                            }
                        }

                        if (
                            !g_db.item.firstExample({
                                _from: src_id,
                                _to: item._id,
                            })
                        )
                            throw [error.ERR_UNLINK, item._id + " is not in collection " + src_id];

                        if (
                            g_db.item.firstExample({
                                _from: dst_id,
                                _to: item._id,
                            })
                        )
                            throw [
                                error.ERR_LINK,
                                item._id + " is already in collection " + dst_id,
                            ];

                        if (item._id[0] == "c") {
                            // Check for circular dependency
                            if (item._id == dst_id || g_lib.isSrcParentOfDest(item._id, dst_id))
                                throw [
                                    error.ERR_LINK,
                                    "Cannot link ancestor, " +
                                        item._id +
                                        ", to descendant, " +
                                        dst_id,
                                ];
                        }

                        g_db.item.removeByExample({
                            _from: src_id,
                            _to: item._id,
                        });
                        g_db.item.save({
                            _from: dst_id,
                            _to: item._id,
                        });

                        // Update public flag & cat tags for published items
                        if (is_pub) {
                            if (item._id.charAt(0) == "c") {
                                // Must update all records in this collection
                                g_lib.catalogUpdateColl(item, dst_ctx, visited);
                            } else {
                                // Update this record
                                g_lib.catalogUpdateRecord(item, dst, dst_ctx, visited);
                            }
                        }
                    }

                    var cres = g_db._query("for v in 1..1 outbound @coll item return v._id", {
                        coll: dst_id,
                    });

                    if (cres.count() > g_lib.MAX_COLL_ITEMS)
                        throw [
                            error.ERR_INPUT_TOO_LONG,
                            "Collection item limit exceeded (" + g_lib.MAX_COLL_ITEMS + " items)",
                        ];

                    cres.dispose();

                    res.send({});
                },
            });
        } catch (e) {
            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().required(), "Client ID")
    .queryParam("items", joi.array().items(joi.string()).optional(), "Items IDs/aliases to move")
    .queryParam("source", joi.string().required(), "Source collection ID/alias")
    .queryParam("dest", joi.string().required(), "Destination collection ID/alias")
    .summary("Move items from source collection to destination collection")
    .description("Move items from source collection to destination collection");

router
    .get("/get_parents", function (req, res) {
        try {
            const client = g_lib.getUserFromClientID(req.queryParams.client);
            var item_id = g_lib.resolveID(req.queryParams.id, client);

            if (!item_id.startsWith("d/") && !item_id.startsWith("c/"))
                throw [error.ERR_INVALID_PARAM, "ID is not a collection or record."];

            var results = g_lib.getParents(item_id);
            if (req.queryParams.inclusive) {
                var item;
                if (item_id[0] == "c") item = g_db.c.document(item_id);
                else item = g_db.d.document(item_id);

                item = {
                    id: item._id,
                    title: item.title,
                    alias: item.alias,
                };
                for (var i in results) {
                    results[i].unshift(item);
                }
            }
            res.send(results);
        } catch (e) {
            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().required(), "Client ID")
    .queryParam("id", joi.string().required(), "ID or alias of child item")
    .queryParam("inclusive", joi.boolean().optional(), "Include child item in result")
    .summary("Get parent collection(s) (path) of item")
    .description("Get parent collection(s) (path) of item");

router
    .get("/get_offset", function (req, res) {
        try {
            const client = g_lib.getUserFromClientID(req.queryParams.client);
            var coll_id = g_lib.resolveID(req.queryParams.id, client);
            var item_id = g_lib.resolveID(req.queryParams.item, client);

            if (coll_id.charAt(0) != "c")
                throw [error.ERR_INVALID_PARAM, "ID is not a collection."];

            var qry = "for v in 1..1 outbound @coll item ";
            if (item_id.charAt(0) == "c")
                qry += "filter is_same_collection('c',v) sort v.title return v._id";
            else qry += "sort is_same_collection('c',v) DESC, v.title return v._id";

            var ids = g_db
                ._query(qry, {
                    coll: coll_id,
                })
                .toArray();
            if (ids.length < req.queryParams.page_sz)
                res.send({
                    offset: 0,
                });
            else {
                var idx = ids.indexOf(item_id);
                if (idx < 0)
                    throw [
                        error.ERR_NOT_FOUND,
                        "Item " +
                            req.queryParams.item +
                            " was not found in collection " +
                            req.queryParams.id,
                    ];

                res.send({
                    offset: req.queryParams.page_sz * Math.floor(idx / req.queryParams.page_sz),
                });
            }
        } catch (e) {
            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().required(), "Client ID")
    .queryParam("id", joi.string().required(), "ID or alias of collection")
    .queryParam("item", joi.string().required(), "ID or alias of child item")
    .queryParam("page_sz", joi.number().required(), "Page size")
    .summary("Get offset to item in collection")
    .description(
        "Get offset to item in collection. Offset will be aligned to specified page size.",
    );

router
    .get("/published/list", function (req, res) {
        try {
            const client = g_lib.getUserFromClientID(req.queryParams.client);
            var owner_id;

            if (req.queryParams.subject) {
                owner_id = req.queryParams.subject;
            } else {
                owner_id = client._id;
            }

            var qry =
                "for v in 1..1 inbound @user owner filter is_same_collection('c',v) && v.public sort v.title";
            var result;

            if (req.queryParams.offset != undefined && req.queryParams.count != undefined) {
                qry += " limit " + req.queryParams.offset + ", " + req.queryParams.count;
                qry += " return { id: v._id, title: v.title, alias: v.alias }";
                result = g_db._query(
                    qry,
                    {
                        user: owner_id,
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
                qry += " return { id: v._id, title: v.title, alias: v.alias }";
                result = g_db._query(qry, {
                    user: owner_id,
                });
            }

            res.send(result);
        } catch (e) {
            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().required(), "Client ID")
    .queryParam("subject", joi.string().optional(), "UID of subject user (optional)")
    .queryParam("offset", joi.number().optional(), "Offset")
    .queryParam("count", joi.number().optional(), "Count")
    .summary("Get list of clients published collections.")
    .description("Get list of clients published collections.");
