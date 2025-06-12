"use strict";

const createRouter = require("@arangodb/foxx/router");
const router = createRouter();
const joi = require("joi");

const g_db = require("@arangodb").db;
const g_lib = require("./support");
const g_graph = require("@arangodb/general-graph")._graph("sdmsg");

module.exports = router;

function fixSchOwnNm(a_sch) {
    if (!a_sch.own_nm) return;

    var j,
        nm = "",
        tmp = a_sch.own_nm.split(" ");

    for (j = 0; j < tmp.length - 1; j++) {
        if (j) nm += " ";
        nm += tmp[j].charAt(0).toUpperCase() + tmp[j].substr(1);
    }

    a_sch.own_nm = nm;
}

function fixSchOwnNmAr(a_sch) {
    var sch, tmp, j, nm;
    for (var i in a_sch) {
        sch = a_sch[i];
        if (!sch.own_nm) continue;
        tmp = sch.own_nm.split(" ");
        nm = "";
        for (j = 0; j < tmp.length - 1; j++) {
            if (j) nm += " ";
            nm += tmp[j].charAt(0).toUpperCase() + tmp[j].substr(1);
        }
        sch.own_nm = nm;
    }
}

// Find all references (internal and external), load them, then place in refs param (object)
// This allows preloading schema dependencies for schema processing on client side
function _resolveDeps(a_sch_id, a_refs) {
    var res,
        dep,
        id,
        cur = new Set(),
        nxt;

    cur.add(a_sch_id);

    while (cur.size) {
        nxt = new Set();

        cur.forEach(function (a_id) {
            res = g_db._query("for v in 1..1 outbound @id sch_dep return v", {
                id: a_id,
            });

            while (res.hasNext()) {
                dep = res.next();
                id = dep.id + ":" + dep.ver;
                if (!(id in a_refs)) {
                    a_refs[id] = dep.def;
                    nxt.add(dep._id);
                }
            }
        });

        cur = nxt;
    }
}

//==================== SCHEMA API FUNCTIONS

router
    .post("/create", function (req, res) {
        try {
            g_db._executeTransaction({
                collections: {
                    read: ["u", "uuid", "accn"],
                    write: ["sch", "sch_dep"],
                },
                waitForSync: true,
                action: function () {
                    const client = g_lib.getUserFromClientID(req.queryParams.client);

                    // Schema validator has already been run at this point; however, DataFed further restricts
                    // the allowed character set for keys and this must be applied at this point.
                    validateProperties(req.body.def.properties);

                    var obj = {
                        cnt: 0,
                        ver: 0,
                        pub: req.body.pub,
                        def: req.body.def,
                    };

                    if (req.body.sys) {
                        if (!client.is_admin)
                            throw [
                                g_lib.ERR_PERM_DENIED,
                                "Creating a system schema requires admin privileges.",
                            ];
                        if (!req.body.pub)
                            throw [g_lib.ERR_INVALID_PARAM, "System schemas cannot be private."];
                    } else {
                        obj.own_id = client._id;
                        obj.own_nm = client.name;
                    }

                    g_lib.procInputParam(req.body, "_sch_id", false, obj);
                    g_lib.procInputParam(req.body, "desc", false, obj);

                    var sch = g_db.sch.save(obj, {
                        returnNew: true,
                    }).new;

                    updateSchemaRefs(sch);
                    fixSchOwnNm(sch);

                    delete sch._id;
                    delete sch._key;
                    delete sch._rev;

                    res.send([sch]);
                },
            });
        } catch (e) {
            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().optional(), "Client ID")
    .body(
        joi
            .object({
                id: joi.string().required(),
                desc: joi.string().required(),
                def: joi.object().required(),
                pub: joi.boolean().optional().default(true),
                sys: joi.boolean().optional().default(false),
            })
            .required(),
        "Schema fields",
    )
    .summary("Create schema")
    .description("Create schema");

router
    .post("/update", function (req, res) {
        try {
            g_db._executeTransaction({
                collections: {
                    read: ["u", "uuid", "accn"],
                    write: ["sch", "sch_dep"],
                },
                waitForSync: true,
                action: function () {
                    const client = g_lib.getUserFromClientID(req.queryParams.client);
                    var idx = req.queryParams.id.indexOf(":");
                    if (idx < 0) {
                        throw [g_lib.ERR_INVALID_PARAM, "Schema ID missing version number suffix."];
                    }
                    var sch_id = req.queryParams.id.substr(0, idx),
                        sch_ver = parseInt(req.queryParams.id.substr(idx + 1)),
                        sch_old = g_db.sch.firstExample({
                            id: sch_id,
                            ver: sch_ver,
                        });

                    if (!sch_old) {
                        throw [
                            g_lib.ERR_NOT_FOUND,
                            "Schema '" + req.queryParams.id + "' not found.",
                        ];
                    }

                    // Cannot modify schemas that are in use
                    if (sch_old.cnt) {
                        throw [
                            g_lib.ERR_PERM_DENIED,
                            "Schema is associated with data records - cannot update.",
                        ];
                    }

                    // Cannot modify schemas that are referenced by other schemas
                    if (
                        g_db.sch_dep.firstExample({
                            _to: sch_old._id,
                        })
                    ) {
                        throw [
                            g_lib.ERR_PERM_DENIED,
                            "Schema is referenced by another schema - cannot update.",
                        ];
                    }

                    if (sch_old.own_id != client._id && !client.is_admin)
                        throw g_lib.ERR_PERM_DENIED;

                    var obj = {};

                    if (req.body.pub != undefined) {
                        obj.pub = req.body.pub;
                    }

                    if (req.body.sys) {
                        if (!client.is_admin)
                            throw [
                                g_lib.ERR_PERM_DENIED,
                                "Changing to a system schema requires admin privileges.",
                            ];

                        if (!sch_old.pub && !req.body.pub)
                            throw [g_lib.ERR_INVALID_PARAM, "System schemas cannot be private."];

                        obj.own_id = null;
                        obj.own_nm = null;
                    }

                    g_lib.procInputParam(req.body, "_sch_id", true, obj);

                    if (
                        obj.id &&
                        (sch_old.ver ||
                            g_db.sch_ver.firstExample({
                                _from: sch_old._id,
                            }))
                    ) {
                        throw [
                            g_lib.ERR_PERM_DENIED,
                            "Cannot change schema ID once revisions exist.",
                        ];
                    }

                    g_lib.procInputParam(req.body, "desc", true, obj);

                    if (req.body.def) {
                        validateProperties(req.body.def.properties);
                        obj.def = req.body.def;
                    }

                    var sch_new = g_db.sch.update(sch_old._id, obj, {
                        returnNew: true,
                        mergeObjects: false,
                        keepNull: false,
                    }).new;

                    updateSchemaRefs(sch_new);
                    fixSchOwnNm(sch_new);

                    delete sch_new._id;
                    delete sch_new._key;
                    delete sch_new._rev;

                    res.send([sch_new]);
                },
            });
        } catch (e) {
            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().optional(), "Client ID")
    .queryParam("id", joi.string().required(), "Schema ID (with version suffix)")
    .body(
        joi
            .object({
                id: joi.string().optional(),
                desc: joi.string().optional(),
                def: joi.object().optional(),
                pub: joi.boolean().optional(),
                sys: joi.boolean().optional(),
            })
            .required(),
        "Schema fields",
    )
    .summary("Update schema")
    .description("Update schema");

router
    .post("/revise", function (req, res) {
        try {
            g_db._executeTransaction({
                collections: {
                    read: ["u", "uuid", "accn"],
                    write: ["sch", "sch_dep", "sch_ver"],
                },
                waitForSync: true,
                action: function () {
                    const client = g_lib.getUserFromClientID(req.queryParams.client);
                    var idx = req.queryParams.id.indexOf(":");
                    if (idx < 0) {
                        throw [g_lib.ERR_INVALID_PARAM, "Schema ID missing version number suffix."];
                    }
                    var sch_id = req.queryParams.id.substr(0, idx),
                        sch_ver = parseInt(req.queryParams.id.substr(idx + 1)),
                        sch = g_db.sch.firstExample({
                            id: sch_id,
                            ver: sch_ver,
                        });

                    if (!sch)
                        throw [
                            g_lib.ERR_NOT_FOUND,
                            "Schema '" + req.queryParams.id + "' not found.",
                        ];

                    if (sch.own_id != client._id && !client.is_admin) throw g_lib.ERR_PERM_DENIED;

                    if (
                        g_db.sch_ver.firstExample({
                            _from: sch._id,
                        })
                    )
                        throw [
                            g_lib.ERR_PERM_DENIED,
                            "A revision of schema '" + req.queryParams.id + "' already exists.",
                        ];

                    if (!sch.own_id && !client.is_admin)
                        throw [
                            g_lib.ERR_PERM_DENIED,
                            "Revising a system schema requires admin privileges.",
                        ];

                    sch.ver++;
                    sch.cnt = 0;

                    if (req.body.pub != undefined) {
                        sch.pub = req.body.pub;

                        if (!sch.own_id) {
                            sch.own_id = client._id;
                            sch.own_nm = client.name;
                        }
                    }

                    if (req.body.sys) {
                        if (!client.is_admin)
                            throw [
                                g_lib.ERR_PERM_DENIED,
                                "Creating a system schema requires admin privileges.",
                            ];

                        sch.own_id = null;
                        sch.own_nm = null;
                    }

                    if (!sch.pub && !sch.own_id)
                        throw [g_lib.ERR_INVALID_PARAM, "System schemas cannot be private."];

                    g_lib.procInputParam(req.body, "desc", true, sch);

                    if (req.body.def != undefined) {
                        validateProperties(req.body.def.properties);
                        sch.def = req.body.def;
                    }

                    var old_id = sch._id;
                    delete sch._id;
                    delete sch._key;
                    delete sch._rev;

                    var sch_new = g_db.sch.save(sch, {
                        returnNew: true,
                    }).new;

                    g_db.sch_ver.save({
                        _from: old_id,
                        _to: sch_new._id,
                    });

                    updateSchemaRefs(sch_new);

                    fixSchOwnNm(sch_new);

                    delete sch_new._id;
                    delete sch_new._key;
                    delete sch_new._rev;

                    res.send([sch_new]);
                },
            });
        } catch (e) {
            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().optional(), "Client ID")
    .queryParam("id", joi.string().required(), "Schema ID")
    .body(
        joi
            .object({
                desc: joi.string().optional(),
                def: joi.object().optional(),
                pub: joi.boolean().optional(),
                sys: joi.boolean().optional(),
            })
            .required(),
        "Schema fields",
    )
    .summary("Revise schema")
    .description("Revise schema");

router
    .post("/delete", function (req, res) {
        try {
            const client = g_lib.getUserFromClientID(req.queryParams.client);
            var idx = req.queryParams.id.indexOf(":");
            if (idx < 0) {
                throw [g_lib.ERR_INVALID_PARAM, "Schema ID missing version number suffix."];
            }
            var sch_id = req.queryParams.id.substr(0, idx),
                sch_ver = parseInt(req.queryParams.id.substr(idx + 1)),
                sch_old = g_db.sch.firstExample({
                    id: sch_id,
                    ver: sch_ver,
                });

            if (!sch_old)
                throw [g_lib.ERR_NOT_FOUND, "Schema '" + req.queryParams.id + "' not found."];

            if (sch_old.own_id != client._id && !client.is_admin) throw g_lib.ERR_PERM_DENIED;

            // Cannot delete schemas that are in use
            if (sch_old.cnt) {
                throw [
                    g_lib.ERR_PERM_DENIED,
                    "Schema is associated with data records - cannot update.",
                ];
            }

            // Cannot delete schemas references by other schemas
            if (
                g_db.sch_dep.firstExample({
                    _to: sch_old._id,
                })
            ) {
                throw [
                    g_lib.ERR_PERM_DENIED,
                    "Schema is referenced by another schema - cannot update.",
                ];
            }

            // Only allow deletion of oldest and newest revisions of schemas
            if (
                g_db.sch_ver.firstExample({
                    _from: sch_old._id,
                }) &&
                g_db.sch_ver.firstExample({
                    _to: sch_old._id,
                })
            ) {
                throw [g_lib.ERR_PERM_DENIED, "Cannot delete intermediate schema revisions."];
            }

            g_graph.sch.remove(sch_old._id);
        } catch (e) {
            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().optional(), "Client ID")
    .queryParam("id", joi.string().required(), "Schema ID")
    .summary("Delete schema")
    .description("Delete schema");

router
    .get("/view", function (req, res) {
        try {
            const client = g_lib.getUserFromClientID(req.queryParams.client);
            var idx = req.queryParams.id.indexOf(":");
            if (idx < 0) {
                throw [g_lib.ERR_INVALID_PARAM, "Schema ID missing version number suffix."];
            }
            var sch_id = req.queryParams.id.substr(0, idx),
                sch_ver = parseInt(req.queryParams.id.substr(idx + 1)),
                sch = g_db.sch.firstExample({
                    id: sch_id,
                    ver: sch_ver,
                });

            if (!sch) throw [g_lib.ERR_NOT_FOUND, "Schema '" + req.queryParams.id + "' not found."];

            if (!(sch.pub || sch.own_id == client._id || client.is_admin))
                throw g_lib.ERR_PERM_DENIED;

            if (req.queryParams.resolve) {
                var refs = {};
                _resolveDeps(sch._id, refs);
                sch.def._refs = refs;
            }

            sch.depr = g_db.sch_ver.firstExample({
                _from: sch._id,
            })
                ? true
                : false;
            sch.uses = g_db
                ._query("for i in 1..1 outbound @sch sch_dep return {id:i.id,ver:i.ver}", {
                    sch: sch._id,
                })
                .toArray();
            sch.used_by = g_db
                ._query("for i in 1..1 inbound @sch sch_dep return {id:i.id,ver:i.ver}", {
                    sch: sch._id,
                })
                .toArray();

            delete sch._id;
            delete sch._key;
            delete sch._rev;

            fixSchOwnNm(sch);

            res.send([sch]);
        } catch (e) {
            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().optional(), "Client ID")
    .queryParam("id", joi.string().required(), "ID of schema")
    .queryParam("resolve", joi.bool().optional(), "Resolve references")
    .summary("View schema")
    .description("View schema");

router
    .get("/search", function (req, res) {
        try {
            const client = g_lib.getUserFromClientID(req.queryParams.client);
            var qry,
                par = {},
                result,
                off = 0,
                cnt = 50,
                doc;

            if (req.queryParams.offset != undefined) off = req.queryParams.offset;

            if (req.queryParams.count != undefined && req.queryParams.count <= 100)
                cnt = req.queryParams.count;

            qry = "for i in schemaview search ";

            if (req.queryParams.owner) {
                if (req.queryParams.owner == client._id) {
                    qry += "(i.own_id == @owner)";
                } else if (req.queryParams.owner.startsWith("u/")) {
                    qry += "(i.pub == true && i.own_id == @owner)";
                } else {
                    //qry += "(i.pub == true && analyzer(i.own_nm in tokens(@owner,'user_name'), 'user_name'))";
                    qry +=
                        "(analyzer(i.own_nm in tokens(@owner,'user_name'), 'user_name') && (i.pub == true || i.own_id == @client_id))";
                    par.client_id = client._id;
                }

                par.owner = req.queryParams.owner.toLowerCase();
            } else {
                qry += "boost(i.pub == true || i.own_id == @owner,0.01)";
                par.owner = client._id;
            }

            if (req.queryParams.text) {
                // TODO handle multiple words/phrases
                qry += " and analyzer( phrase(i['desc'],@text), 'text_en')";
                par.text = req.queryParams.text.toLowerCase();
            }

            if (req.queryParams.id) {
                qry += " and analyzer(i.id in tokens(@id,'sch_id'), 'sch_id')";
                par.id = req.queryParams.id.toLowerCase();
            }

            if (
                req.queryParams.sort == g_lib.SORT_RELEVANCE &&
                (req.queryParams.id || req.queryParams.text)
            ) {
                qry += " let s = BM25(i) sort s desc";
            } else if (req.queryParams.sort == g_lib.SORT_OWNER) {
                qry += " sort i.own_nm";
                qry += req.queryParams.sort_rev ? " desc" : "";
            } else {
                if (req.queryParams.sort_rev) qry += " sort i.id desc, i.ver";
                else qry += " sort i.id,i.ver";

                //qry += (req.queryParams.sort_rev?" desc":"");
            }

            qry +=
                " limit " +
                off +
                "," +
                cnt +
                " return {_id:i._id,id:i.id,ver:i.ver,cnt:i.cnt,pub:i.pub,own_nm:i.own_nm,own_id:i.own_id}";

            //qry += " filter (i.pub == true || i.own_id == @uid) sort i.id limit " + off + "," + cnt + " return {id:i.id,ver:i.ver,cnt:i.cnt,pub:i.pub,own_nm:i.own_nm,own_id:i.own_id}";

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

            for (var i in result) {
                doc = result[i];
                if (
                    g_db.sch_dep.firstExample({
                        _to: doc._id,
                    })
                ) {
                    doc.ref = true;
                }
            }

            fixSchOwnNmAr(result);

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
    .queryParam("client", joi.string().required(), "Client ID")
    .queryParam("id", joi.string().optional(), "ID (partial)")
    .queryParam("text", joi.string().optional(), "Text or phrase")
    .queryParam("owner", joi.string().optional(), "Owner ID")
    .queryParam("sort", joi.number().integer().min(0).optional(), "Sort by")
    .queryParam("sort_rev", joi.bool().optional(), "Sort in reverse order")
    .queryParam("offset", joi.number().integer().min(0).optional(), "Offset")
    .queryParam("count", joi.number().integer().min(1).optional(), "Count")
    .summary("Search schemas")
    .description("Search schema");

/* AQL rules:
    - Only a-z, A-Z, 0-9, and "_" are allowed
    - Cannot start with a number
    - Must contain at least one character a-z, A-Z
    - Can start with any number of "_", but must be followed by a-z, A-Z - not a number
*/
function validateKey(val) {
    var code,
        i = 0,
        len = val.length;

    // Skip leading "_"
    while (i < len && val.charCodeAt(i) == 95) {
        i++;
    }

    if (i == len) {
        throw [g_lib.ERR_INVALID_CHAR, "Malformed property '" + val + "'."];
    }

    code = val.charCodeAt(i);

    // Fist char after prefix must be a letter
    if (
        (code > 96 && code < 123) || // lower alpha (a-z)
        (code > 64 && code < 91)
    ) {
        // upper alpha (A-Z)
        i++;
    } else {
        throw [g_lib.ERR_INVALID_CHAR, "Malformed property '" + val + "'."];
    }

    // Check remaining chars
    for (; i < len; i++) {
        code = val.charCodeAt(i);

        if (
            !(code > 47 && code < 58) && // numeric (0-9)
            !(code > 64 && code < 91) && // upper alpha (A-Z)
            !(code > 96 && code < 123) && // lower alpha (a-z)
            code != 95
        ) {
            // _
            throw [g_lib.ERR_INVALID_CHAR, "Illegal character(s) in property '" + val + "'."];
        }
    }
}

function validateProperties(a_props) {
    var v, v2;
    for (var k in a_props) {
        validateKey(k);
        v = a_props[k];

        if (typeof v === "object") {
            if (v.type === "object") {
                validateProperties(v.properties);
            } else if (v.type == "array" && Array.isArray(v.items)) {
                for (var j in v.items) {
                    v2 = v.items[j];
                    if (typeof v2 === "object" && v2.type == "object") {
                        validateProperties(v2.properties);
                    }
                }
            }
        }
    }
}

function updateSchemaRefs(a_sch) {
    // Schema has been created, revised, or updated
    // Find and update dependencies to other schemas (not versions)

    g_db.sch_dep.removeByExample({
        _from: a_sch._id,
    });

    var idx,
        id,
        ver,
        r,
        refs = new Set();

    gatherRefs(a_sch.def.properties, refs);

    refs.forEach(function (v) {
        idx = v.indexOf(":");

        if (idx < 0)
            throw [
                g_lib.ERR_INVALID_PARAM,
                "Invalid reference ID '" + v + "' in schema (expected id:ver).",
            ];

        // TODO handle json pointer past #

        id = v.substr(0, idx);
        ver = parseInt(v.substr(idx + 1));

        r = g_db.sch.firstExample({
            id: id,
            ver: ver,
        });

        if (!r) throw [g_lib.ERR_INVALID_PARAM, "Referenced schema '" + v + "' does not exist."];

        if (r._id == a_sch._id) throw [g_lib.ERR_INVALID_PARAM, "Schema references self."];

        g_graph.sch_dep.save({
            _from: a_sch._id,
            _to: r._id,
        });
    });
}

function gatherRefs(a_doc, a_refs) {
    var v, i;

    for (var k in a_doc) {
        v = a_doc[k];

        if (v !== null && (typeof v === "object" || Array.isArray(v))) {
            gatherRefs(v, a_refs);
        } else if (k == "$ref") {
            if (typeof v !== "string")
                throw [g_lib.ERR_INVALID_PARAM, "Invalid reference type in schema."];

            // Add dependencies to external schemas, only once
            i = v.indexOf("#");

            // Ignore internal references
            if (i != 0) {
                if (i > 0) {
                    v = v.substr(0, i);
                }

                if (!a_refs.has(v)) {
                    a_refs.add(v);
                }
            }
        }
    }
}
