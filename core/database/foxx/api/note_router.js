"use strict";

const createRouter = require("@arangodb/foxx/router");
const router = createRouter();
const joi = require("joi");
const g_db = require("@arangodb").db;
const g_lib = require("./support");
const error = require("./lib/error_codes");

module.exports = router;

//==================== ACL API FUNCTIONS

router
    .post("/create", function (req, res) {
        console.log("note/create");
        try {
            g_db._executeTransaction({
                collections: {
                    read: ["u", "uuid", "accn", "d", "c"],
                    write: ["d", "n", "note"],
                },
                action: function () {
                    const client = g_lib.getUserFromClientID(req.queryParams.client);
                    var id = g_lib.resolveDataCollID(req.queryParams.subject, client),
                        doc = g_db._document(id);

                    if (!g_lib.hasAdminPermObject(client, id)) {
                        if (
                            (g_lib.getPermissions(client, doc, g_lib.PERM_RD_REC) &
                                g_lib.PERM_RD_REC) ==
                            0
                        ) {
                            throw error.ERR_PERM_DENIED;
                        }
                        if (req.queryParams.activate) {
                            throw [
                                error.ERR_PERM_DENIED,
                                "Only owner or admin may create a new annotaion in active state.",
                            ];
                        }
                    }

                    var time = Math.floor(Date.now() / 1000);
                    var obj = {
                            state: req.queryParams.activate ? g_lib.NOTE_ACTIVE : g_lib.NOTE_OPEN,
                            type: req.queryParams.type,
                            subject_id: id,
                            ct: time,
                            ut: time,
                            creator: client._id,
                        },
                        updates = {};

                    g_lib.procInputParam(req.queryParams, "title", false, obj);
                    obj.comments = [
                        {
                            user: client._id,
                            new_type: obj.type,
                            new_state: obj.state,
                            time: time,
                        },
                    ];
                    g_lib.procInputParam(req.queryParams, "comment", false, obj.comments[0]);

                    var note = g_db.n.save(obj, {
                        returnNew: true,
                    });
                    g_db.note.save({
                        _from: id,
                        _to: note._id,
                    });

                    // For ACTIVE errors and warnings, propagate to direct children
                    if (obj.state == g_lib.NOTE_ACTIVE && obj.type >= g_lib.NOTE_WARN) {
                        g_lib.annotationInitDependents(client, note.new, updates);
                    }

                    delete doc.desc;
                    delete doc.md;
                    doc.notes = g_lib.getNoteMask(client, doc);

                    updates[doc._id] = doc;

                    res.send({
                        results: [note.new],
                        updates: Object.values(updates),
                    });
                },
            });
        } catch (e) {
            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().required(), "Client UID")
    .queryParam("subject", joi.string().required(), "ID or alias of data record or collection")
    .queryParam(
        "type",
        joi.number().min(0).max(3).required(),
        "Type of annotation (see SDMS.proto for NOTE_TYPE enum)",
    )
    .queryParam("title", joi.string().required(), "Title of annotaion")
    .queryParam("comment", joi.string().required(), "Comments")
    .queryParam("activate", joi.boolean().optional(), "Make new annotation active on create")
    .summary("Create an annotation on an object")
    .description("Create an annotation on an object");

router
    .post("/update", function (req, res) {
        console.log("note/update");
        try {
            g_db._executeTransaction({
                collections: {
                    read: ["u", "uuid", "accn"],
                    write: ["d", "n", "note"],
                },
                action: function () {
                    const client = g_lib.getUserFromClientID(req.queryParams.client);

                    if (!req.queryParams.id.startsWith("n/"))
                        throw [
                            error.ERR_INVALID_PARAM,
                            "Invalid annotaion ID '" + req.queryParams.id + "'",
                        ];

                    if (!g_db._exists(req.queryParams.id))
                        throw [
                            error.ERR_INVALID_PARAM,
                            "Annotaion ID '" + req.queryParams.id + "' does not exist.",
                        ];

                    var note = g_db.n.document(req.queryParams.id),
                        ne = g_db.note.firstExample({
                            _to: note._id,
                        }),
                        old_state = note.state,
                        old_type = note.type,
                        doc = g_db._document(ne._from),
                        updates = {};

                    /* Permissions to update: Currently any admin of the subject and the creator of the annotation may
                    make edits to the annotation. This approach is optimistic in assuming that conflicts will not arise
                    and all parties are ethical. Eventually a mechanism will be put in place to deal with conflicts and
                    potential ethics issues.
                    */

                    if (req.queryParams.new_state === note.state) {
                        throw [error.ERR_INVALID_PARAM, "Invalid new state for annotaion."];
                    }

                    // Subject admins can do anything
                    // Creators cannot edit if state is active
                    // Others can not update

                    if (!g_lib.hasAdminPermObject(client, ne._from)) {
                        if (client._id == note.creator) {
                            if (
                                (note.state == g_lib.NOTE_ACTIVE &&
                                    (req.queryParams.new_state != undefined ||
                                        req.queryParams.new_type != undefined ||
                                        req.queryParams.title != undefined)) ||
                                req.queryParams.new_state == g_lib.NOTE_ACTIVE
                            ) {
                                throw error.ERR_PERM_DENIED;
                            }
                        } else {
                            throw error.ERR_PERM_DENIED;
                        }
                    }

                    var time = Math.floor(Date.now() / 1000),
                        obj = {
                            ut: time,
                            comments: note.comments,
                        },
                        comment = {
                            user: client._id,
                            time: time,
                        };

                    if (req.queryParams.new_type !== undefined) {
                        obj.type = req.queryParams.new_type;
                        comment.new_type = obj.type;
                    }

                    if (req.queryParams.new_state !== undefined) {
                        obj.state = req.queryParams.new_state;
                        comment.new_state = req.queryParams.new_state;
                    }

                    if (req.queryParams.new_title && req.queryParams.new_title != note.title) {
                        g_lib.procInputParam(req.queryParams.new_title, "title", false, obj);
                    }

                    g_lib.procInputParam(req.queryParams, "comment", false, comment);

                    obj.comments.push(comment);

                    note = g_db.n.update(note._id, obj, {
                        returnNew: true,
                    }).new;

                    // If this is an error or warning, must assess impact to dependent records (derived/component only)
                    if (
                        g_db.note
                            .byExample({
                                _to: note._id,
                            })
                            .count() > 1
                    ) {
                        //console.log("update existing dependent notes");
                        g_lib.annotationUpdateDependents(
                            client,
                            note,
                            old_type,
                            old_state,
                            updates,
                        );
                    } else if (note.state == g_lib.NOTE_ACTIVE && note.type >= g_lib.NOTE_WARN) {
                        //console.log("init new dependent notes");
                        g_lib.annotationInitDependents(client, note, updates);
                    }

                    delete doc.desc;
                    delete doc.md;
                    doc.notes = g_lib.getNoteMask(client, doc);

                    updates[doc._id] = doc;

                    res.send({
                        results: [note],
                        updates: Object.values(updates),
                    });
                },
            });
        } catch (e) {
            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().required(), "Client UID")
    .queryParam("id", joi.string().required(), "ID of annotation")
    .queryParam(
        "new_type",
        joi.number().min(0).max(3).optional(),
        "Type of annotation (see SDMS.proto for NOTE_TYPE enum)",
    )
    .queryParam("new_state", joi.number().min(0).max(2).optional(), "New state (omit for comment)")
    .queryParam("new_title", joi.string().optional(), "New title")
    .queryParam("comment", joi.string().required(), "Comments")
    .summary("Update an annotation")
    .description("Update an annotation with new comment and optional new state");

router
    .post("/comment/edit", function (req, res) {
        try {
            g_db._executeTransaction({
                collections: {
                    read: ["u", "uuid", "accn"],
                    write: ["n"],
                },
                action: function () {
                    const client = g_lib.getUserFromClientID(req.queryParams.client);

                    if (!req.queryParams.id.startsWith("n/"))
                        throw [
                            error.ERR_INVALID_PARAM,
                            "Invalid annotaion ID '" + req.queryParams.id + "'",
                        ];

                    if (!g_db._exists(req.queryParams.id))
                        throw [
                            error.ERR_INVALID_PARAM,
                            "Annotaion ID '" + req.queryParams.id + "' does not exist.",
                        ];

                    var note = g_db.n.document(req.queryParams.id);

                    if (req.queryParams.comment_idx >= note.comments.length)
                        throw [error.ERR_INVALID_PARAM, "Comment index out of range."];

                    var obj = {
                            ut: Math.floor(Date.now() / 1000),
                        },
                        comment = note.comments[req.queryParams.comment_idx];

                    if (client._id != comment.user) {
                        throw [error.ERR_PERM_DENIED, "Only original commentor may edit comments."];
                    }

                    if (req.queryParams.comment != comment.comment) {
                        g_lib.procInputParam(req.queryParams, "comment", false, comment);
                        obj.comments = note.comments;
                    }

                    note = g_db.n.update(note._id, obj, {
                        returnNew: true,
                    });

                    res.send({
                        results: [note.new],
                    });
                },
            });
        } catch (e) {
            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().required(), "Client UID")
    .queryParam("id", joi.string().required(), "ID of annotation")
    .queryParam("comment", joi.string().required(), "New description / comments")
    .queryParam("comment_idx", joi.number().min(0).required(), "Comment index number to edit")
    .summary("Edit an annotation comment")
    .description("Edit a specific comment within an annotation.");

router
    .get("/view", function (req, res) {
        try {
            const client = g_lib.getUserFromClientID_noexcept(req.queryParams.client);

            if (!req.queryParams.id.startsWith("n/"))
                throw [
                    error.ERR_INVALID_PARAM,
                    "Invalid annotaion ID '" + req.queryParams.id + "'",
                ];

            if (!g_db._exists(req.queryParams.id))
                throw [
                    error.ERR_INVALID_PARAM,
                    "Annotaion ID '" + req.queryParams.id + "' does not exist.",
                ];

            var note = g_db.n.document(req.queryParams.id);

            if (!client || client._id != note.creator) {
                var ne = g_db.note.firstExample({
                    _to: note._id,
                });
                if (!client || !g_lib.hasAdminPermObject(client, ne._from)) {
                    if (note.state == g_lib.NOTE_ACTIVE) {
                        // Anyone with read permission to subject doc can comment on active notes
                        var doc = g_db._document(ne._from);
                        if (!client) {
                            if (!g_lib.hasPublicRead(doc._id)) {
                                throw error.ERR_PERM_DENIED;
                            }
                        } else if (
                            (g_lib.getPermissions(client, doc, g_lib.PERM_RD_REC) &
                                g_lib.PERM_RD_REC) ==
                            0
                        ) {
                            throw error.ERR_PERM_DENIED;
                        }
                    } else {
                        throw error.ERR_PERM_DENIED;
                    }
                }
            }

            if (
                g_db.note
                    .byExample({
                        _to: note._id,
                    })
                    .count() > 1
            )
                note.has_child = true;

            res.send({
                results: [note],
            });
        } catch (e) {
            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().required(), "Client UID")
    .queryParam("id", joi.string().required(), "ID of annotation")
    .summary("View annotation")
    .description("View annotation");

router
    .get("/list/by_subject", function (req, res) {
        try {
            const client = g_lib.getUserFromClientID_noexcept(req.queryParams.client);

            var results,
                qry,
                id = g_lib.resolveDataCollID(req.queryParams.subject, client);

            if (!client) {
                qry =
                    "for v in 1..1 outbound @subj note filter v.state == 2 sort v.ut desc return {_id:v._id,state:v.state,type:v.type,subject_id:v.subject_id,title:v.title,creator:v.creator,parent_id:v.parent_id,ct:v.ct,ut:v.ut}";
                results = g_db._query(qry, {
                    subj: id,
                });
            } else if (g_lib.hasAdminPermObject(client, id)) {
                qry =
                    "for v in 1..1 outbound @subj note sort v.ut desc return {_id:v._id,state:v.state,type:v.type,subject_id:v.subject_id,title:v.title,creator:v.creator,parent_id:v.parent_id,ct:v.ct,ut:v.ut}";
                results = g_db._query(qry, {
                    subj: id,
                });
            } else {
                qry =
                    "for v in 1..1 outbound @subj note filter v.state == 2 || v.creator == @client sort v.ut desc return {_id:v._id,state:v.state,type:v.type,subject_id:v.subject_id,title:v.title,creator:v.creator,parent_id:v.parent_id,ct:v.ct,ut:v.ut}";
                results = g_db._query(qry, {
                    subj: id,
                    client: client._id,
                });
            }

            res.send({
                results: results.toArray(),
            });
        } catch (e) {
            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().required(), "Client UID")
    .queryParam("subject", joi.string().required(), "ID/alias of subject")
    .summary("List annotations by subject")
    .description("List annotations attached to subject data record or colelction");

router
    .get("/purge", function (req, res) {
        try {
            g_db._executeTransaction({
                collections: {
                    read: ["u", "uuid", "accn"],
                    write: ["n", "note"],
                },
                action: function () {
                    //console.log("note purge, age:", req.queryParams.age_sec );

                    var t = Date.now() / 1000 - req.queryParams.age_sec;
                    var id,
                        notes = g_db._query(
                            "for i in n filter i.state == " +
                                g_lib.NOTE_CLOSED +
                                " && i.ut < " +
                                t +
                                " and i.parent_id == null return i._id",
                        );
                    while (notes.hasNext()) {
                        id = notes.next();
                        console.log("purging", id);
                        // This will also delete all dependent annotations
                        g_lib.annotationDelete(id);
                    }
                },
            });
        } catch (e) {
            g_lib.handleException(e, res);
        }
    })
    .queryParam("age_sec", joi.number().integer().min(0).required(), "Purge age (seconds)")
    .summary("Purge old closed annotations")
    .description("Purge old closed annotations");
