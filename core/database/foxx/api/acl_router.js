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
    .get("/update", function (req, res) {
        try {
            var result = [];

            g_db._executeTransaction({
                collections: {
                    read: ["u", "p", "uuid", "accn", "d", "c", "a", "admin", "alias"],
                    write: ["c", "d", "acl"],
                },
                action: function () {
                    const client = g_lib.getUserFromClientID(req.queryParams.client);
                    var object = g_lib.getObject(req.queryParams.id, client);
                    var owner_id = g_db.owner.firstExample({
                        _from: object._id,
                    })._to;
                    //var owner = g_db._document( owner_id );
                    //owner_id = owner_id.substr(2);

                    //console.log("obj:",object);

                    var is_coll;

                    if (object._id[0] == "c") is_coll = true;
                    else is_coll = false;

                    if (!is_coll && object._id[0] != "d")
                        throw [error.ERR_INVALID_PARAM, "Invalid object type, " + object._id];

                    var is_admin = true;

                    if (!g_lib.hasAdminPermObject(client, object._id)) {
                        is_admin = false;
                        if (!g_lib.hasPermissions(client, object, g_lib.PERM_SHARE))
                            throw error.ERR_PERM_DENIED;
                    }

                    var client_perm, cur_rules;

                    if (!is_admin) {
                        client_perm = g_lib.getPermissions(client, object, g_lib.PERM_ALL);
                        cur_rules = g_db
                            ._query(
                                "for v, e in 1..1 outbound @object acl return { id: v._id, gid: v.gid, grant: e.grant, inhgrant: e.inhgrant }",
                                {
                                    object: object._id,
                                },
                            )
                            .toArray();
                    }

                    var acl_mode = 0;
                    var new_obj = {};

                    if (req.queryParams.rules) {
                        // Delete existing ACL rules for this object
                        g_db.acl.removeByExample({
                            _from: object._id,
                        });

                        var rule, obj, old_rule, chg;

                        for (var i in req.queryParams.rules) {
                            rule = req.queryParams.rules[i];

                            if (!is_coll && rule.inhgrant)
                                throw [
                                    error.ERR_INVALID_PARAM,
                                    "Inherited permissions cannot be applied to data records",
                                ];

                            if (rule.id.startsWith("g/")) {
                                acl_mode |= 2;
                                var group = g_db.g.firstExample({
                                    uid: owner_id,
                                    gid: rule.id.substr(2),
                                });

                                if (!group)
                                    throw [error.ERR_NOT_FOUND, "Group " + rule.id + " not found"];

                                rule.id = group._id;
                            } else {
                                acl_mode |= 1;
                                if (!g_db._exists(rule.id))
                                    throw [error.ERR_NOT_FOUND, "User " + rule.id + " not found"];
                            }

                            if (!is_admin) {
                                // TODO I believe the code below is obsolete - granting sharing permission is (should be) unrestricted now
                                old_rule = cur_rules.findIndex(function (r) {
                                    return r.id == rule.id;
                                });

                                if (old_rule >= 0) {
                                    old_rule = cur_rules[old_rule];
                                    if (old_rule.grant != rule.grant) {
                                        chg = old_rule.grant ^ rule.grant;
                                        if ((chg & client_perm) != (chg & ~g_lib.PERM_SHARE)) {
                                            console.log(
                                                "bad alter",
                                                rule.id,
                                                old_rule,
                                                rule,
                                                client_perm,
                                            );
                                            throw [
                                                error.ERR_PERM_DENIED,
                                                "Attempt to alter protected permissions on " +
                                                    rule.id +
                                                    " ACL.",
                                            ];
                                        }
                                    }
                                } else {
                                    if (
                                        rule.grant & g_lib.PERM_SHARE ||
                                        (rule.grant & client_perm) != rule.grant
                                    ) {
                                        console.log(
                                            "exceeding",
                                            rule.id,
                                            old_rule.grant,
                                            rule.grant,
                                            client_perm,
                                        );
                                        throw [
                                            error.ERR_PERM_DENIED,
                                            "Attempt to exceed controlled permissions on " +
                                                rule.id +
                                                " ACL.",
                                        ];
                                    }
                                }
                            }

                            obj = {
                                _from: object._id,
                                _to: rule.id,
                            };
                            if (rule.grant) obj.grant = rule.grant;
                            if (rule.inhgrant) obj.inhgrant = rule.inhgrant;

                            g_db.acl.save(obj);
                        }
                    }

                    new_obj.acls = acl_mode;

                    g_db._update(object._id, new_obj, {
                        keepNull: false,
                    });

                    result = g_db
                        ._query(
                            "for v, e in 1..1 outbound @object acl return { id: v._id, gid: v.gid, grant: e.grant, inhgrant: e.inhgrant }",
                            {
                                object: object._id,
                            },
                        )
                        .toArray();
                    postProcACLRules(result, object);
                },
            });

            res.send(result);
        } catch (e) {
            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().required(), "Client ID")
    .queryParam("id", joi.string().required(), "ID or alias of data record or collection")
    .queryParam(
        "rules",
        joi.array().items(g_lib.acl_schema).optional(),
        "User and/or group ACL rules to create",
    )
    .summary("Update ACL(s) on a data record or collection")
    .description(
        "Update access control list(s) (ACLs) on a data record or collection. Inherited permissions can only be set on collections.",
    );

router
    .get("/view", function (req, res) {
        try {
            const client = g_lib.getUserFromClientID(req.queryParams.client);
            var object = g_lib.getObject(req.queryParams.id, client);

            if (object._id[0] != "c" && object._id[0] != "d")
                throw [error.ERR_INVALID_PARAM, "Invalid object type, " + object._id];

            if (!g_lib.hasAdminPermObject(client, object._id)) {
                if (!g_lib.hasPermissions(client, object, g_lib.PERM_SHARE))
                    throw error.ERR_PERM_DENIED;
            }

            var rules = g_db
                ._query(
                    "for v, e in 1..1 outbound @object acl return { id: v._id, gid: v.gid, grant: e.grant, inhgrant: e.inhgrant }",
                    {
                        object: object._id,
                    },
                )
                .toArray();
            postProcACLRules(rules, object);

            res.send(rules);
        } catch (e) {
            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().required(), "Client ID")
    .queryParam("id", joi.string().required(), "ID or alias of data record or collection")
    .summary("View current ACL on an object")
    .description("View current ACL on an object (data record or collection)");

router
    .get("/shared/list", function (req, res) {
        try {
            const client = g_lib.getUserFromClientID(req.queryParams.client);

            res.send(
                g_lib.getACLOwnersBySubject(
                    client._id,
                    req.queryParams.inc_users,
                    req.queryParams.inc_projects,
                ),
            );
        } catch (e) {
            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().required(), "Client ID")
    .queryParam("inc_users", joi.boolean().optional(), "Include users")
    .queryParam("inc_projects", joi.boolean().optional(), "Include projects")
    .summary("List users/projects that have shared data or collections with client/subject.")
    .description("List users/projects that have shared data or collections with client/subject.");

router
    .get("/shared/list/items", function (req, res) {
        try {
            const client = g_lib.getUserFromClientID(req.queryParams.client);
            var owner_id;

            if (req.queryParams.owner.charAt(0) == "p") {
                owner_id = req.queryParams.owner;

                // Verify project exists
                if (!g_db._exists(owner_id))
                    throw [error.ERR_NOT_FOUND, "Project " + owner_id + " not found"];
            } else {
                owner_id = g_lib.getUserFromClientID(req.queryParams.owner)._id;
            }

            var i,
                share,
                shares = g_db
                    ._query(
                        "for v in 1..2 inbound @client member, acl filter v.owner == @owner return {id:v._id,title:v.title,alias:v.alias,owner:v.owner,creator:v.creator,md_err:v.md_err,external:v.external,locked:v.locked}",
                        {
                            client: client._id,
                            owner: owner_id,
                        },
                    )
                    .toArray();

            for (i in shares) {
                share = shares[i];
                share.notes = g_lib.getNoteMask(client, share);
            }

            if (shares.length < 2) {
                res.send(shares);
            } else {
                res.send(dedupShares(client, shares));
            }
        } catch (e) {
            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().required(), "Client ID")
    .queryParam("owner", joi.string().required(), "Owner ID")
    .summary("Lists data and collections shared with client/subject by owner")
    .description("Lists data and collections shared with client/subject by owner");

/*
router.get('/by_user', function (req, res) {
    try {
        const client = g_lib.getUserFromClientID( req.queryParams.client );

        res.send( g_lib.usersWithClientACLs( client._id ));
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.summary('List users that have shared data or collections with client')
.description('List users that have shared data or collections with client');
*/

function dedupShares(client, shares) {
    var i, j, k, id;
    var items = {},
        item,
        parent;

    for (i in shares) {
        id = shares[i].id;
        item = {
            paths: [],
            data: shares[i],
        };
        parent = g_db.item
            .byExample({
                _to: item.data.id,
            })
            .toArray();
        if (parent.length) {
            for (j in parent) {
                item.paths.push({
                    path: [id, parent[j]._from],
                    par: null,
                    done: false,
                });
            }
        } else {
            item.paths.push({
                path: [id],
                par: null,
                done: true,
            });
        }
        items[id] = item;
    }

    // Calculate parent paths up to ancestors with shares
    var work = true,
        first = true,
        path;
    while (work) {
        work = false;
        for (i in items) {
            // TODO - Why is hasOwnProperty being used here?
            if (Object.prototype.hasOwnProperty.call(items, i)) {
                item = items[i];
                for (j in item.paths) {
                    path = item.paths[j];
                    if (!path.done) {
                        id = path.path[path.path.length - 1];

                        if (first) {
                            if (id in items) {
                                path.par = id;
                                path.done = true;
                                continue;
                            }
                        }

                        parent = g_db.item.firstExample({
                            _to: id,
                        });
                        if (parent) {
                            path.path.push(parent._from);
                            if (parent._from in items) {
                                path.par = parent._from;
                                path.done = true;
                            } else {
                                work = true;
                            }
                        } else {
                            path.done = true;
                        }
                    }
                }
            }
        }
        first = false;
    }

    // Remove any independent shares (no ancestor/descendant)
    shares = [];
    for (i in items) {
        if (Object.prototype.hasOwnProperty.call(items, i)) {
            item = items[i];
            parent = false;
            for (j in item.paths) {
                path = item.paths[j];
                if (path.par) {
                    parent = true;
                }
            }
            if (!parent) {
                shares.push(item.data);
                delete items[i];
            }
        }
    }

    // Determine if descendants are navigable from ancestors
    var perm, coll;
    for (i in items) {
        if (Object.prototype.hasOwnProperty.call(items, i)) {
            item = items[i];
            work = false;

            for (j in item.paths) {
                path = item.paths[j];

                for (k = path.path.length - 1; k > 0; k--) {
                    coll = g_db.c.document(path.path[k]);
                    perm = g_lib.getPermissionsLocal(client._id, coll);
                    if (perm.inhgrant & g_lib.PERM_LIST) {
                        k = 0;
                        break;
                    }
                    if ((perm.grant & g_lib.PERM_LIST) == 0) break;
                }

                if (k == 0) {
                    work = true;
                    break;
                }
            }

            if (!work) {
                shares.push(item.data);
            }
        }
    }

    shares.sort(function (a, b) {
        if (a.id.charAt(0) != b.id.charAt(0)) {
            if (a.id.charAt(0) == "c") return -1;
            else return 1;
        } else return a.title.localeCompare(b.title);
    });

    return shares;
}

/*
router.get('/by_user/list', function (req, res) {
    try {
        const client = g_lib.getUserFromClientID( req.queryParams.client );
        const owner = g_lib.getUserFromClientID( req.queryParams.owner );

        var shares = g_db._query("for v in 1..2 inbound @client member, acl filter v.owner == @owner return {id:v._id,title:v.title,alias:v.alias, doi:v.doi,locked:v.locked}", { client: client._id, owner: owner._id }).toArray();

        if ( shares.length < 2 ){
            res.send(shares);
        }else{
            res.send(dedupShares( client, shares ));
        }
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('owner', joi.string().required(), "Owner ID")
.summary('Lists data and collections shared with client by owner')
.description('Lists data and collections shared with client by owner');

router.get('/by_proj', function (req, res) {
    try {
        const client = g_lib.getUserFromClientID( req.queryParams.client );
        var result = g_lib.projectsWithClientACLs( client._id );
        res.send( result );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.summary('List users that have shared data or collections with client')
.description('List users that have shared data or collections with client');

router.get('/by_proj/list', function (req, res) {
    try {
        const client = g_lib.getUserFromClientID( req.queryParams.client );
        const owner_id = req.queryParams.owner;

        // Verify owner ID is a project
        if ( !owner_id.startsWith( "p/" ))
            throw [error.ERR_INVALID_PARAM,"Invalid project ID: "+owner_id];

        // Verify owner exists
        if ( !g_db._exists( owner_id ))
            throw [error.ERR_NOT_FOUND,"Project "+owner_id+" not found"];

        var shares = g_db._query("for v in 1..2 inbound @client member, acl filter v.owner == @owner return {id:v._id,title:v.title,alias:v.alias, doi:v.doi,locked:v.locked}", { client: client._id, owner: owner_id }).toArray();

        if ( shares.length < 2 ){
            res.send(shares);
        }else{
            res.send(dedupShares( client, shares ));
        }
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('owner', joi.string().required(), "Owner ID")
.summary('Lists data and collections shared with client by owner')
.description('Lists data and collections shared with client by owner');
*/

function postProcACLRules(rules, object) {
    var rule;

    for (var i in rules) {
        rule = rules[i];

        if (rule.gid != null) {
            rule.id = "g/" + rule.gid;
        } else delete rule.gid;

        if (rule.grant == null) delete rule.grant;

        if (rule.inhgrant == null) delete rule.inhgrant;
    }
}
