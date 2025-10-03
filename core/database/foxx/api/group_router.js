"use strict";

const createRouter = require("@arangodb/foxx/router");
const router = createRouter();
const joi = require("joi");
const error = require("./lib/error_codes");

const g_db = require("@arangodb").db;
const g_graph = require("@arangodb/general-graph")._graph("sdmsg");
const g_lib = require("./support");

module.exports = router;

//========== GROUP API FUNCTIONS ==========

router
    .get("/create", function (req, res) {
        try {
            var result = [];

            g_db._executeTransaction({
                collections: {
                    read: ["u", "p", "uuid", "accn", "admin"],
                    write: ["g", "owner", "member"],
                },
                action: function () {
                    const client = g_lib.getUserFromClientID(req.queryParams.client);
                    var uid;

                    if (req.queryParams.proj) {
                        uid = req.queryParams.proj;
                        g_lib.ensureManagerPermProj(client, uid);
                    } else {
                        uid = client._id;
                    }

                    if (req.queryParams.gid == "members")
                        throw [error.ERR_PERM_DENIED, "Group ID 'members' is reserved"];

                    var obj = {
                        uid: uid,
                    };

                    g_lib.procInputParam(req.queryParams, "gid", false, obj);
                    g_lib.procInputParam(req.queryParams, "title", false, obj);
                    g_lib.procInputParam(req.queryParams, "summary", false, obj);

                    if (
                        g_db.g.firstExample({
                            uid: uid,
                            gid: obj.gid,
                        })
                    )
                        throw [error.ERR_IN_USE, "Group ID '" + obj.gid + "' already exists."];

                    var group = g_db.g.save(obj, {
                        returnNew: true,
                    });

                    g_db.owner.save({
                        _from: group._id,
                        _to: uid,
                    });

                    if (req.queryParams.members) {
                        group.new.members = req.queryParams.members;
                        var mem;
                        for (var i in req.queryParams.members) {
                            mem = req.queryParams.members[i];
                            if (!g_db._exists(mem))
                                throw [error.ERR_NOT_FOUND, "User, " + mem + ", not found"];

                            g_db.member.save({
                                _from: group._id,
                                _to: mem,
                            });
                        }
                    } else {
                        group.new.members = [];
                    }

                    delete group._id;
                    delete group._key;
                    delete group._rev;

                    result.push(group.new);
                },
            });

            res.send(result);
        } catch (e) {
            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().required(), "Client ID")
    .queryParam("proj", joi.string().optional(), "Project ID (optional)")
    .queryParam("gid", joi.string().required(), "Group ID")
    .queryParam("title", joi.string().optional().allow(""), "Title")
    .queryParam("desc", joi.string().optional().allow(""), "Description")
    .queryParam("members", joi.array().items(joi.string()).optional(), "Array of member UIDs")
    .summary("Creates a new group")
    .description("Creates a new group owned by client (or project), with optional members");

router
    .get("/update", function (req, res) {
        try {
            var result = [];

            g_db._executeTransaction({
                collections: {
                    read: ["u", "p", "uuid", "accn", "admin"],
                    write: ["g", "owner", "member"],
                },
                action: function () {
                    const client = g_lib.getUserFromClientID(req.queryParams.client);
                    var group;

                    if (req.queryParams.proj) {
                        var uid = req.queryParams.proj;
                        group = g_db.g.firstExample({
                            uid: uid,
                            gid: req.queryParams.gid,
                        });
                        if (!group)
                            throw [
                                error.ERR_NOT_FOUND,
                                "Group ID '" + req.queryParams.gid + "' not found",
                            ];

                        //g_lib.ensureAdminPermObject( client, group._id );
                        g_lib.ensureManagerPermProj(client, uid);
                    } else {
                        group = g_db.g.firstExample({
                            uid: client._id,
                            gid: req.queryParams.gid,
                        });
                        if (!group)
                            throw [
                                error.ERR_NOT_FOUND,
                                "Group ID '" + req.queryParams.gid + "' not found",
                            ];
                    }

                    var obj = {};

                    if (group.gid != "members") {
                        //g_lib.procInputParam( req.queryParams, "gid", false, obj );
                        g_lib.procInputParam(req.queryParams, "title", true, obj);
                        g_lib.procInputParam(req.queryParams, "desc", true, obj);

                        group = g_db._update(group._id, obj, {
                            keepNull: false,
                            returnNew: true,
                        });
                        group = group.new;
                    }

                    var mem, i;

                    if (req.queryParams.add) {
                        for (i in req.queryParams.add) {
                            mem = req.queryParams.add[i];

                            if (!g_db._exists(mem))
                                throw [error.ERR_NOT_FOUND, "User, " + mem + ", not found"];

                            if (
                                !g_db.member.firstExample({
                                    _from: group._id,
                                    _to: mem,
                                })
                            )
                                g_db.member.save({
                                    _from: group._id,
                                    _to: mem,
                                });
                        }
                    }

                    if (req.queryParams.rem) {
                        var edge;

                        for (i in req.queryParams.rem) {
                            mem = req.queryParams.rem[i];

                            edge = g_db.member.firstExample({
                                _from: group._id,
                                _to: mem,
                            });
                            if (edge) g_db._remove(edge);
                        }
                    }

                    group.members = g_db
                        ._query("for v in 1..1 outbound @group member return v._key", {
                            group: group._id,
                        })
                        .toArray();

                    delete group._id;
                    delete group._key;
                    delete group._rev;

                    result.push(group);
                },
            });

            res.send(result);
        } catch (e) {
            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().required(), "Client ID")
    .queryParam("proj", joi.string().optional(), "Project ID")
    .queryParam("gid", joi.string().required(), "Group ID")
    .queryParam("title", joi.string().allow("").optional(), "New title")
    .queryParam("desc", joi.string().allow("").optional(), "New description")
    .queryParam(
        "add",
        joi.array().items(joi.string()).optional(),
        "Array of member UIDs to add to group",
    )
    .queryParam(
        "rem",
        joi.array().items(joi.string()).optional(),
        "Array of member UIDs to remove from group",
    )
    .summary("Updates an existing group")
    .description("Updates an existing group owned by client (or project).");

router
    .get("/delete", function (req, res) {
        try {
            g_db._executeTransaction({
                collections: {
                    read: ["u", "uuid", "accn", "owner", "admin"],
                    write: ["g", "owner", "member", "acl"],
                },
                action: function () {
                    const client = g_lib.getUserFromClientID(req.queryParams.client);
                    var group;

                    if (req.queryParams.proj) {
                        var uid = req.queryParams.proj;
                        group = g_db.g.firstExample({
                            uid: uid,
                            gid: req.queryParams.gid,
                        });
                        if (!group)
                            throw [
                                error.ERR_NOT_FOUND,
                                "Group ID '" + req.queryParams.gid + "' not found",
                            ];

                        //g_lib.ensureAdminPermObject( client, group._id );
                        g_lib.ensureManagerPermProj(client, uid);

                        // Make sure special members project is protected
                        if (group.gid == "members") throw error.ERR_PERM_DENIED;
                    } else {
                        group = g_db.g.firstExample({
                            uid: client._id,
                            gid: req.queryParams.gid,
                        });
                        if (!group)
                            throw [
                                error.ERR_NOT_FOUND,
                                "Group, " + req.queryParams.gid + ", not found",
                            ];
                    }

                    g_graph.g.remove(group._id);
                },
            });
        } catch (e) {
            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().required(), "Client ID")
    .queryParam("proj", joi.string().optional(), "Project ID")
    .queryParam("gid", joi.string().required(), "Group ID")
    .summary("Deletes an existing group")
    .description("Deletes an existing group owned by client or project");

router
    .get("/list", function (req, res) {
        try {
            const client = g_lib.getUserFromClientID(req.queryParams.client);
            var owner_id;

            if (req.queryParams.proj) {
                owner_id = req.queryParams.proj;
                if (g_lib.getProjectRole(client._id, owner_id) == g_lib.PROJ_NO_ROLE)
                    throw error.ERR_PERM_DENIED;
            } else {
                owner_id = client._id;
            }

            var groups = g_db
                ._query(
                    "for v in 1..1 inbound @client owner filter IS_SAME_COLLECTION('g', v) return { uid: v.uid, gid: v.gid, title: v.title }",
                    {
                        client: owner_id,
                    },
                )
                .toArray();

            res.send(groups);
        } catch (e) {
            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().required(), "Client ID")
    .queryParam("proj", joi.string().optional(), "Project ID")
    .summary("List groups")
    .description("List groups owned by client or project");

router
    .get("/view", function (req, res) {
        try {
            const client = g_lib.getUserFromClientID(req.queryParams.client);
            var group;

            if (req.queryParams.proj) {
                var uid = req.queryParams.proj;
                group = g_db.g.firstExample({
                    uid: uid,
                    gid: req.queryParams.gid,
                });
                if (!group)
                    throw [error.ERR_NOT_FOUND, "Group ID '" + req.queryParams.gid + "' not found"];

                if (g_lib.getProjectRole(client._id, uid) == g_lib.PROJ_NO_ROLE)
                    throw error.ERR_PERM_DENIED;
            } else {
                group = g_db.g.firstExample({
                    uid: client._id,
                    gid: req.queryParams.gid,
                });
                if (!group)
                    throw [error.ERR_NOT_FOUND, "Group ID '" + req.queryParams.gid + "' not found"];
            }

            var result = {
                uid: group.uid,
                gid: group.gid,
                title: group.title,
                desc: group.desc,
            };
            result.members = g_db
                ._query("for v in 1..1 outbound @group member return v._id", {
                    group: group._id,
                })
                .toArray();
            res.send([result]);
        } catch (e) {
            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().required(), "Client ID")
    .queryParam("proj", joi.string().optional(), "Project ID")
    .queryParam("gid", joi.string().required(), "Group ID")
    .summary("View group details")
    .description("View group details");
