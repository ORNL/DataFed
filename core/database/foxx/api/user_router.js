"use strict";

const createRouter = require("@arangodb/foxx/router");
const router = createRouter();
const joi = require("joi");
const createAuth = require("@arangodb/foxx/auth");
const auth = createAuth("pbkdf2");
const g_db = require("@arangodb").db;
const g_graph = require("@arangodb/general-graph")._graph("sdmsg");
const g_lib = require("./support");
const { UserToken } = require("./lib/user_token");
const { UserModel } = require("./models/user");
const logger = require("./lib/logger");
const basePath = "usr";

module.exports = router;

//==================== USER API FUNCTIONS

router
    .get("/authn/password", function (req, res) {
        let client = null;
        try {
            client = g_lib.getUserFromClientID(req.queryParams.client);
            const is_verified = auth.verify(client.password, req.queryParams.pw);
            if (is_verified === false) {
                throw g_lib.ERR_AUTHN_FAILED;
            }
            logger.logRequestStarted({
                client: client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/authn/password",
                status: "Started",
                description: "Authenticating user via password",
            });

            res.send({
                uid: client._id,
                authorized: true,
            });
            logger.logRequestSuccess({
                client: client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/authn/password",
                status: "Success",
                description: "Authenticating user via password",
                extra: "undefined",
            });
        } catch (e) {
            logger.logRequestFailure({
                client: client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/authn/password",
                status: "Failure",
                description: "Authenticating user via password",
                extra: "undefined",
                error: e,
            });
            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().required(), "Client SDMS UID")
    .queryParam("pw", joi.string().required(), "SDMS account password")
    .summary("Authenticate user")
    .description("Authenticate user using password");

router
    .get("/authn/token", function (req, res) {
        let user = null;
        try {
            user = g_db._query("for i in u filter i.access == @tok return i", {
                tok: req.queryParams.token,
            });
            logger.logRequestStarted({
                client: user?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/authn/token",
                status: "Started",
                description: "Authenticating user via access token",
            });

            if (!user.hasNext()) throw g_lib.ERR_AUTHN_FAILED;

            res.send({
                uid: user.next()._id,
                authorized: true,
            });

            logger.logRequestSuccess({
                client: user?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/authn/token",
                status: "Success",
                description: "Authenticating user via access token",
                extra: "undefined",
            });
        } catch (e) {
            logger.logRequestFailure({
                client: user?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/authn/token",
                status: "Failure",
                description: "Authenticating user via access token",
                extra: "undefined",
                error: e,
            });

            g_lib.handleException(e, res);
        }
    })
    .queryParam("token", joi.string().required(), "Client access token")
    .summary("Authenticate user")
    .description("Authenticate user using access token");

router
    .get("/create", function (req, res) {
        let user = null;
        let result = null;
        try {
            g_db._executeTransaction({
                collections: {
                    read: ["u"],
                    write: ["u", "c", "a", "g", "acl", "owner", "ident", "uuid", "alias", "admin"],
                },
                action: function () {
                    var i,
                        time = Math.floor(Date.now() / 1000),
                        name = req.queryParams.name.trim(),
                        idx = name.lastIndexOf(" ");

                    if (idx < 1)
                        throw [
                            g_lib.ERR_INVALID_PARAM,
                            "ERROR: invalid user name (no first/last name) " + name,
                        ];

                    var lname = name.substr(idx + 1),
                        fname = name.substr(0, idx).trim();

                    var is_admin = req.queryParams.is_admin;
                    // It is assumed that if this is the first user to ever log
                    // into the database they are by default made the admin.
                    // This will simplify the setup process.
                    if (g_db.u.count() === 0) {
                        is_admin = true;
                    }

                    var user_data = {
                        _key: req.queryParams.uid,
                        name: name.toLowerCase() + " " + req.queryParams.uid,
                        name_first: fname,
                        name_last: lname,
                        is_admin: is_admin,
                        max_coll: g_lib.DEF_MAX_COLL,
                        max_proj: g_lib.DEF_MAX_PROJ,
                        max_sav_qry: g_lib.DEF_MAX_SAV_QRY,
                        ct: time,
                        ut: time,
                    };

                    if (req.queryParams.password) {
                        g_lib.validatePassword(req.queryParams.password);
                        user_data.password = auth.create(req.queryParams.password);
                    }

                    if (req.queryParams.email) {
                        user_data.email = req.queryParams.email;
                    }

                    if (req.queryParams.options) {
                        user_data.options = req.queryParams.options;
                    }

                    user = g_db.u.save(user_data, {
                        returnNew: true,
                    });
                    logger.logRequestStarted({
                        client: user?._id,
                        correlationId: req.headers["x-correlation-id"],
                        httpVerb: "GET",
                        routePath: basePath + "/create",
                        status: "Started",
                        description: "Create new user entry",
                    });

                    var root = g_db.c.save(
                        {
                            _key: "u_" + req.queryParams.uid + "_root",
                            is_root: true,
                            owner: user._id,
                            title: "Root Collection",
                            desc:
                                "Root collection for user " +
                                req.queryParams.name +
                                " (" +
                                req.queryParams.uid +
                                ")",
                            alias: "root",
                        },
                        {
                            returnNew: true,
                        },
                    );

                    var alias = g_db.a.save(
                        {
                            _key: "u:" + req.queryParams.uid + ":root",
                        },
                        {
                            returnNew: true,
                        },
                    );
                    g_db.owner.save({
                        _from: alias._id,
                        _to: user._id,
                    });

                    g_db.alias.save({
                        _from: root._id,
                        _to: alias._id,
                    });
                    g_db.owner.save({
                        _from: root._id,
                        _to: user._id,
                    });

                    var uuid;

                    for (i in req.queryParams.uuids) {
                        uuid = "uuid/" + req.queryParams.uuids[i];
                        if (
                            g_db._exists({
                                _id: uuid,
                            })
                        )
                            throw [
                                g_lib.ERR_IN_USE,
                                "ERROR: linked identity value, " + uuid + ", already in use",
                            ];

                        g_db.uuid.save(
                            {
                                _key: req.queryParams.uuids[i],
                            },
                            {
                                returnNew: true,
                            },
                        );
                        g_db.ident.save({
                            _from: user._id,
                            _to: uuid,
                        });
                    }

                    user.new.uid = user.new._id;
                    if (req.queryParams.admins) user.new.admins = req.queryParams.admins;

                    delete user.new._id;
                    delete user.new._key;
                    delete user.new._rev;
                    delete user.new.name;

                    result = [user.new];
                    delete user.new.password;
                },
            });
            res.send(result);
            logger.logRequestSuccess({
                client: user?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/create",
                status: "Success",
                description: "Create new user entry",
                extra: result,
            });
        } catch (e) {
            logger.logRequestFailure({
                client: user?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/create",
                status: "Failure",
                description: "Create new user entry",
                extra: result,
                error: e,
            });
            g_lib.handleException(e, res);
        }
    })
    .queryParam(
        "secret",
        joi.string().optional(),
        "System secret required to authorize this action",
    )
    .queryParam("uid", joi.string().required(), "SDMS user ID (globus) for new user")
    .queryParam("password", joi.string().optional().allow(""), "New CLI password")
    .queryParam("name", joi.string().required(), "Name")
    .queryParam("email", joi.string().optional(), "Email")
    .queryParam("options", joi.string().optional(), "Application options (JSON string)")
    .queryParam("uuids", joi.array().items(joi.string()).required(), "Globus identities (UUIDs)")
    .queryParam("is_admin", joi.boolean().optional(), "New account is a system administrator")
    .summary("Create new user entry")
    .description("Create new user entry.");

router
    .get("/update", function (req, res) {
        let client = null;
        let result = null;
        try {
            g_db._executeTransaction({
                collections: {
                    read: ["u", "uuid", "accn"],
                    write: ["u", "admin"],
                },
                action: function () {
                    client = g_lib.getUserFromClientID(req.queryParams.client);
                    var user_id;
                    logger.logRequestStarted({
                        client: client?._id,
                        correlationId: req.headers["x-correlation-id"],
                        httpVerb: "GET",
                        routePath: basePath + "/update",
                        status: "Started",
                        description: "Update user information",
                    });

                    if (req.queryParams.subject) {
                        user_id = req.queryParams.subject;
                        if (!g_db.u.exists(user_id))
                            throw [g_lib.ERR_INVALID_PARAM, "No such user '" + user_id + "'"];
                        g_lib.ensureAdminPermUser(client, user_id);
                    } else {
                        user_id = client._id;
                    }

                    var obj = {};

                    if (req.queryParams.password) {
                        g_lib.validatePassword(req.queryParams.password);
                        obj.password = auth.create(req.queryParams.password);
                    }

                    if (req.queryParams.name) {
                        var name = req.queryParams.name.trim();
                        var idx = name.lastIndexOf(" ");

                        if (idx < 1) {
                            throw [
                                g_lib.ERR_INVALID_PARAM,
                                "Invalid user name (no first/last name) " + req.queryParams.name,
                            ];
                        }

                        ((obj.name_first = name.substr(0, idx).trim()),
                            (obj.name_last = name.substr(idx + 1)));
                        obj.name = name.toLowerCase() + " " + user_id.substr(2);
                    }

                    if (req.queryParams.email) obj.email = req.queryParams.email;

                    if (req.queryParams.options) obj.options = req.queryParams.options;

                    if (client.is_admin) {
                        if (req.queryParams.is_admin) obj.is_admin = req.queryParams.is_admin;
                    }

                    var user = g_db._update(user_id, obj, {
                        keepNull: false,
                        returnNew: true,
                    });

                    user.new.uid = user.new._id;

                    delete user.new._id;
                    delete user.new._key;
                    delete user.new._rev;
                    delete user.new.name;
                    delete user.new.pub_key;
                    delete user.new.priv_key;
                    delete user.new.access;
                    delete user.new.refresh;

                    result = [user.new];
                },
            });
            logger.logRequestSuccess({
                client: client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/update",
                status: "Success",
                description: "Update user information",
                extra: result,
            });
        } catch (e) {
            logger.logRequestFailure({
                client: client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/update",
                status: "Failure",
                description: "Update user information",
                extra: result,
                error: e,
            });
            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().required(), "Client uid")
    .queryParam("subject", joi.string().optional(), "UID of subject user (optional)")
    .queryParam("password", joi.string().optional(), "New CLI password")
    .queryParam("name", joi.string().optional(), "New name")
    .queryParam("email", joi.string().optional(), "New email")
    .queryParam("options", joi.string().optional(), "Application options (JSON string)")
    .queryParam("is_admin", joi.boolean().optional(), "New system administrator flag value")
    .summary("Update user information")
    .description("Update user information");

router
    .get("/find/by_uuids", function (req, res) {
        let user = null;
        try {
            // Convert UUIDs to DB _ids
            var uuids = [];
            for (var i in req.queryParams.uuids) {
                uuids.push("uuid/" + req.queryParams.uuids[i]);
            }

            user = g_lib.findUserFromUUIDs(uuids);
            logger.logRequestStarted({
                client: user?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/find/by_uuids",
                status: "Started",
                description: "Find a user from list of UUIDs",
            });
            var idents = g_db
                ._query("for v in 1..1 outbound @user ident return v._key", {
                    user: user._id,
                })
                .toArray();
            if (idents.length) {
                user.idents = idents;
            }

            user.uid = user._id;

            delete user._id;
            delete user._key;
            delete user._rev;
            delete user.name;

            res.send([user]);
            logger.logRequestSuccess({
                client: user?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/find/by_uuids",
                status: "Success",
                description: "Find a user from list of UUIDs",
                extra: req.queryParams.uuids,
            });
        } catch (e) {
            logger.logRequestFailure({
                client: user?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/find/by_uuids",
                status: "Failure",
                description: "Find a user from list of UUIDs",
                extra: req.queryParams.uuids,
                error: e,
            });
            g_lib.handleException(e, res);
        }
    })
    .queryParam("uuids", joi.array().items(joi.string()).required(), "User UUID List")
    .summary("Find a user from list of UUIDs")
    .description("Find a user from list of UUIDs");

router
    .get("/find/by_name_uid", function (req, res) {
        let name = null;
        try {
            name = req.queryParams.name_uid.trim();
            logger.logRequestStarted({
                client: name,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/find/by_name_uid",
                status: "Started",
                description: "Find users matching partial name and/or uid",
            });

            if (name.length < 2)
                throw [g_lib.ERR_INVALID_PARAM, "Input is too short for name/uid search."];
            else if (name.length < 3) name = " " + name + " "; // Pad to allow matches for very short first/last names (i.e. Bo, Li, Xi)

            var off = req.queryParams.offset ? req.queryParams.offset : 0,
                cnt = req.queryParams.count ? req.queryParams.count : 20;

            var result = g_db._query(
                "for u in userview search analyzer(u.name in tokens(@name,'user_name'), 'user_name')" +
                    " let s = BM25(u) filter s > 0 sort s desc limit @off,@cnt return {uid:u._id,name_last:u.name_last,name_first:u.name_first}",
                {
                    name: name,
                    off: off,
                    cnt: cnt,
                },
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
            logger.logRequestSuccess({
                client: name,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/find/by_name_uid",
                status: "Success",
                description: "Find users matching partial name and/or uid",
                extra: result,
            });
        } catch (e) {
            logger.logRequestFailure({
                client: name,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/find/by_name_uid",
                status: "Failure",
                description: "Find users matching partial name and/or uid",
                extra: result,
                error: e,
            });
            g_lib.handleException(e, res);
        }
    })
    .queryParam("name_uid", joi.string().required(), "User name and/or uid (partial)")
    .queryParam("offset", joi.number().optional(), "Offset")
    .queryParam("count", joi.number().optional(), "Count")
    .summary("Find users matching partial name and/or uid")
    .description("Find users matching partial name and/or uid");

router
    .get("/keys/set", function (req, res) {
        let client = null;
        try {
            g_db._executeTransaction({
                collections: {
                    read: ["u", "uuid", "accn"],
                    write: ["u"],
                },
                action: function () {
                    client = g_lib.getUserFromClientID(req.queryParams.client);

                    logger.logRequestStarted({
                        client: client?._id,
                        correlationId: req.headers["x-correlation-id"],
                        httpVerb: "GET",
                        routePath: basePath + "/keys/set",
                        status: "Started",
                        description: "Set user public and private keys",
                    });

                    var user_id;

                    if (req.queryParams.subject) {
                        user_id = req.queryParams.subject;
                        if (!g_db.u.exists(user_id))
                            throw [g_lib.ERR_INVALID_PARAM, "No such user '" + user_id + "'"];
                        g_lib.ensureAdminPermUser(client, user_id);
                    } else {
                        user_id = client._id;
                    }

                    var obj = {
                        pub_key: req.queryParams.pub_key,
                        priv_key: req.queryParams.priv_key,
                    };
                    g_db._update(user_id, obj, {
                        keepNull: false,
                    });
                },
            });

            logger.logRequestSuccess({
                client: client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/keys/set",
                status: "Success",
                description: "Set user public and private keys",
                extra: "undefined",
            });
        } catch (e) {
            logger.logRequestFailure({
                client: client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/keys/set",
                status: "Failure",
                description: "Set user public and private keys",
                extra: "undefined",
                error: e,
            });
            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().required(), "Client ID")
    .queryParam("subject", joi.string().optional(), "UID of subject user")
    .queryParam("pub_key", joi.string().required(), "User public key")
    .queryParam("priv_key", joi.string().required(), "User private key")
    .summary("Set user public and private keys")
    .description("Set user public and private keys");

router
    .get("/keys/clear", function (req, res) {
        let client = null;
        try {
            g_db._executeTransaction({
                collections: {
                    read: ["u", "uuid", "accn"],
                    write: ["u"],
                },
                action: function () {
                    client = g_lib.getUserFromClientID(req.queryParams.client);
                    logger.logRequestStarted({
                        client: client?._id,
                        correlationId: req.headers["x-correlation-id"],
                        httpVerb: "GET",
                        routePath: basePath + "/keys/clear",
                        status: "Started",
                        description: "Clear user public and private keys",
                    });

                    var user_id;

                    if (req.queryParams.subject) {
                        user_id = req.queryParams.subject;
                        if (!g_db.u.exists(user_id))
                            throw [g_lib.ERR_INVALID_PARAM, "No such user '" + user_id + "'"];
                        g_lib.ensureAdminPermUser(client, user_id);
                    } else {
                        user_id = client._id;
                    }

                    var obj = {
                        pub_key: null,
                        priv_key: null,
                    };
                    g_db._update(user_id, obj, {
                        keepNull: false,
                    });
                },
            });
            logger.logRequestSuccess({
                client: client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/keys/clear",
                status: "Success",
                description: "Clear user public and private keys",
                extra: "undefined",
            });
        } catch (e) {
            logger.logRequestFailure({
                client: client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/keys/clear",
                status: "Failure",
                description: "Clear user public and private keys",
                extra: "undefined",
                error: e,
            });
            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().required(), "Client ID")
    .queryParam("subject", joi.string().optional(), "UID of subject user")
    .summary("Clear user public and private keys")
    .description("Clear user public and private keys");

router
    .get("/keys/get", function (req, res) {
        let user = null;
        try {
            if (req.queryParams.subject) {
                if (!g_db.u.exists(req.queryParams.subject))
                    throw [
                        g_lib.ERR_INVALID_PARAM,
                        "No such user '" + req.queryParams.subject + "'",
                    ];

                user = g_db.u.document({
                    _id: req.queryParams.subject,
                });
                logger.logRequestStarted({
                    client: user?._id,
                    correlationId: req.headers["x-correlation-id"],
                    httpVerb: "GET",
                    routePath: basePath + "/keys/get",
                    status: "Started",
                    description: "Get user public and private keys",
                });
            } else {
                user = g_lib.getUserFromClientID(req.queryParams.client);
            }

            if (!user.pub_key || !user.priv_key) {
                res.send([
                    {
                        uid: user._id,
                    },
                ]);
                logger.logRequestSuccess({
                    client: user?._id,
                    correlationId: req.headers["x-correlation-id"],
                    httpVerb: "GET",
                    routePath: basePath + "/keys/get",
                    status: "Success",
                    description: "Get user public and private keys",
                    extra: "undefined",
                });
            } else
                res.send([
                    {
                        uid: user._id,
                        pub_key: user.pub_key,
                        priv_key: user.priv_key,
                    },
                ]);
            logger.logRequestSuccess({
                client: user?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/keys/get",
                status: "Success",
                description: "Get user public and private keys",
                extra: "undefined",
            });
        } catch (e) {
            logger.logRequestFailure({
                client: user?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/keys/get",
                status: "Failure",
                description: "Get user public and private keys",
                extra: "undefined",
                error: e,
            });
            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().required(), "Client ID")
    .queryParam("subject", joi.string().optional(), "UID of subject user")
    .summary("Get user public and private keys")
    .description("Get user public and private keys");

router
    .get("/find/by_pub_key", function (req, res) {
        let uid = null;
        try {
            uid = g_lib.uidFromPubKey(req.queryParams.pub_key);
            logger.logRequestStarted({
                client: uid,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/find/by_pub_key",
                status: "Started",
                description: "Find a user by public key",
            });
            res.send(uid);
            logger.logRequestSuccess({
                client: uid,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/find/by_pub_key",
                status: "Success",
                description: "Find a user by public key",
                extra: uid,
            });
        } catch (e) {
            logger.logRequestFailure({
                client: uid,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/find/by_pub_key",
                status: "Failure",
                description: "Find a user by public key",
                extra: uid,
                error: e,
            });
            g_lib.handleException(e, res);
        }
    })
    .queryParam("pub_key", joi.string().required(), "User public key")
    .summary("Find a user by public key")
    .description("Find a user by public key");

router
    .get("/token/set", function (req, res) {
        let client = null;
        try {
            g_db._executeTransaction({
                collections: {
                    read: ["u", "uuid", "accn", "globus_coll"],
                    write: ["u", "globus_coll", "globus_token"],
                },
                action: function () {
                    client = g_lib.getUserFromClientID(req.queryParams.client);

                    logger.logRequestStarted({
                        client: client?._id,
                        correlationId: req.headers["x-correlation-id"],
                        httpVerb: "GET",
                        routePath: basePath + "/token/set",
                        status: "Started",
                        description: "Setting user token",
                    });

                    var user_id;
                    let user_doc;

                    const { type: token_type, other_token_data } = req.queryParams;
                    // validate optional query params
                    if (
                        Boolean(other_token_data) &&
                        token_type === g_lib.AccessTokenType.GLOBUS_DEFAULT
                    ) {
                        throw [
                            g_lib.ERR_INVALID_PARAM,
                            "Invalid parameters passed, the default action cannot process other_token_data.",
                        ];
                    } else if (
                        !other_token_data &&
                        token_type !== g_lib.AccessTokenType.GLOBUS_DEFAULT
                    ) {
                        throw [
                            g_lib.ERR_INVALID_PARAM,
                            "Invalid parameters passed, type and other_token_data depend on one another.",
                        ];
                    }

                    if (req.queryParams.subject) {
                        user_id = req.queryParams.subject;
                        if (!g_db.u.exists(user_id))
                            throw [g_lib.ERR_INVALID_PARAM, "No such user '" + user_id + "'"];
                        g_lib.ensureAdminPermUser(client, user_id);
                        user_doc = g_db.u.document(user_id);
                    } else {
                        user_id = client._id;
                        user_doc = client;
                    }
                    var obj = {
                        access: req.queryParams.access,
                        refresh: req.queryParams.refresh,
                        expiration: Math.floor(Date.now() / 1000) + req.queryParams.expires_in,
                    };

                    switch (token_type) {
                        // TODO: update logic for various AccessTokenType instances as they are defined.
                        case g_lib.AccessTokenType.GENERIC: {
                            break;
                        }
                        case g_lib.AccessTokenType.GLOBUS: {
                            break;
                        }
                        case g_lib.AccessTokenType.GLOBUS_AUTH: {
                            break;
                        }
                        case g_lib.AccessTokenType.GLOBUS_TRANSFER: {
                            // find or insert collection
                            const { uuid: collection_search_key, scopes } =
                                g_lib.parseOtherTokenData(
                                    g_lib.AccessTokenType.GLOBUS_TRANSFER,
                                    other_token_data,
                                ); // TODO: the call site and function and docs will need to be updated if changes are made to assumed data
                            // GLOBUS_TRANSFER parse currently assumes uuid and scopes exist
                            let globus_collection = g_db.globus_coll.exists({
                                _key: collection_search_key,
                            });
                            if (!globus_collection) {
                                globus_collection = g_db.globus_coll.save({
                                    _key: collection_search_key,
                                    name: "Newly Inserted Collection",
                                    description: "The collection description",
                                    required_scopes: scopes, // string - Is this always the minimum required set?
                                    owner: "", // Should this be looked up on Globus?
                                    ct: Math.floor(Date.now() / 1000),
                                    ut: Math.floor(Date.now() / 1000),
                                    type: "mapped", // mapped/guest TODO: to be pulled from token data on follow-up ticket
                                    ha_enabled: false, // boolean - TODO: to be pulled from token data on follow-up ticket
                                });
                            }

                            const token_key =
                                globus_collection._key + "_" + token_type + "_" + user_doc._key;
                            const token_doc = {
                                _key: token_key,
                                _from: user_id, // the uid field
                                _to: globus_collection._id,
                                type: token_type,
                                dependent_scopes: scopes,
                                request_time: Math.floor(Date.now() / 1000),
                                last_used: Math.floor(Date.now() / 1000),
                                status:
                                    obj.expiration > Math.floor(Date.now() / 1000)
                                        ? "active"
                                        : "inactive",
                                ...obj,
                            };

                            const token_doc_upsert = g_db.globus_token.insert(token_doc, {
                                overwriteMode: "replace", // TODO: perhaps use 'update' and specify values for true upsert.
                            });
                            break;
                        }
                        case g_lib.AccessTokenType.GLOBUS_DEFAULT:
                            {
                                // Existing logic, default actions
                                g_db._update(user_id, obj, {
                                    keepNull: false,
                                });
                                break;
                            }
                            logger.logRequestSuccess({
                                client: client?._id,
                                correlationId: req.headers["x-correlation-id"],
                                httpVerb: "GET",
                                routePath: basePath + "/token/set",
                                status: "Success",
                                description: "Setting user token",
                                extra: "undefined",
                            });
                    }
                },
            });
        } catch (e) {
            logger.logRequestFailure({
                client: client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/token/set",
                status: "Failure",
                description: "Setting user tokens",
                extra: "undefined",
                error: e,
            });
            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().required(), "Client ID")
    .queryParam("subject", joi.string().optional(), "UID of subject user")
    .queryParam("access", joi.string().required(), "User access token")
    .queryParam("refresh", joi.string().required(), "User refresh token")
    .queryParam(
        "expires_in",
        joi.number().integer().required(),
        "Access token expiration timestamp",
    )
    .queryParam(
        "type",
        joi
            .number()
            .valid(...Object.values(g_lib.AccessTokenType))
            .optional()
            .default(g_lib.AccessTokenType.GLOBUS_DEFAULT),
        "Type of token being stored",
    )
    .queryParam(
        "other_token_data",
        joi.string().optional(),
        "Other data associated with token, currently only supported as Globus Collection UUID e.g. other_token_data=1cbaaee5-b938-4a4e-87a8-f1ec4d5d92f9",
    )
    .summary("Set user tokens")
    .description("Set user tokens");

router
    .get("/token/get", function (req, res) {
        let user = null;
        try {
            const collection_token = UserToken.validateRequestParams(req.queryParams);
            // TODO: collection type determines logic when mapped vs HA
            const { collection_id, collection_type } = req.queryParams;

            if (req.queryParams.subject) {
                if (!g_db.u.exists(req.queryParams.subject))
                    throw [
                        g_lib.ERR_INVALID_PARAM,
                        "No such user '" + req.queryParams.subject + "'",
                    ];

                user = g_db.u.document({
                    _id: req.queryParams.subject,
                });
            } else {
                user = g_lib.getUserFromClientID(req.queryParams.client);
            }

            logger.logRequestStarted({
                client: user?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/token/get",
                status: "Started",
                description: "Getting user token",
            });

            const user_token = new UserToken({
                user_id: user._id,
                globus_collection_id: collection_id,
            });
            let needs_consent = false;

            const token_document = user_token.get_token();
            if (!user_token.exists()) {
                needs_consent = true;
            }
            const result = UserToken.formatUserToken(
                collection_token,
                token_document,
                needs_consent,
            );

            res.send(result);
            logger.logRequestSuccess({
                client: user?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/token/get",
                status: "Success",
                description: "Getting user token",
            });
        } catch (e) {
            logger.logRequestFailure({
                client: user?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/token/get",
                status: "Failure",
                description: "Getting user tokens",
                extra: "undefined",
                error: e,
            });
            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().required(), "Client ID")
    .queryParam("subject", joi.string().optional(), "UID of subject user")
    .queryParam(
        "collection_id",
        joi.string().optional().guid(),
        "ID of collection with which token is associated",
    ) // https://joi.dev/api/?v=17.13.3#stringguid---aliases-uuid
    .queryParam(
        "collection_type",
        joi.string().optional().valid("mapped"),
        "Type of collection with which token is associated",
    )
    .summary("Get user tokens")
    .description("Get user tokens");

router
    .get("/token/get/access", function (req, res) {
        let user = null;
        try {
            if (req.queryParams.subject) {
                if (!g_db.u.exists(req.queryParams.subject))
                    throw [
                        g_lib.ERR_INVALID_PARAM,
                        "No such user '" + req.queryParams.subject + "'",
                    ];
                user = g_db.u.document({
                    _id: req.queryParams.subject,
                });
            } else {
                user = g_lib.getUserFromClientID(req.queryParams.client);
            }
            logger.logRequestStarted({
                client: user?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/token/get/access",
                status: "Started",
                description: "Getting User Access Token",
            });

            if (!user.access) throw [g_lib.ERR_NOT_FOUND, "No access token found"];

            res.send(user.access);
            logger.logRequestSuccess({
                client: user?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/token/get/access",
                status: "Success",
                description: "Getting User Access Token",
                extra: "undefined",
            });
        } catch (e) {
            logger.logRequestFailure({
                client: user?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/token/get/access",
                status: "Failure",
                description: "Getting User Access Token",
                extra: "undefined",
                error: e,
            });

            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().required(), "Client ID")
    .queryParam("subject", joi.string().optional(), "UID of subject user")
    .summary("Get user access token")
    .description("Get user access token");

router
    .get("/token/get/expiring", function (req, res) {
        let user = null;
        let result = null;
        try {
            logger.logRequestStarted({
                client: user?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/token/get/expiring",
                status: "Started",
                description: "Getting expiring user access token",
            });

            results = g_db._query(
                "for i in u filter i.expiration != Null && i.expiration < @exp return {id:i._id,access:i.access,refresh:i.refresh,expiration:i.expiration}",
                {
                    exp: Math.floor(Date.now() / 1000) + req.queryParams.expires_in,
                },
            );
            res.send(results);
            logger.logRequestSuccess({
                client: client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/token/get/expiring",
                status: "Success",
                description: "Getting expiring user access token",
                extra: results,
            });
        } catch (e) {
            logger.logRequestFailure({
                client: client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/token/get/expiring",
                status: "Failure",
                description: "Getting expiring user access token",
                extra: result,
                error: e,
            });
            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().required(), "Client ID")
    .queryParam("expires_in", joi.number().integer().required(), "Expires in (sec)")
    .summary("Get expiring user access tokens")
    .description("Get expiring user access token");

router
    .get("/view", function (req, res) {
        let client = null;
        try {
            client = g_lib.getUserFromClientID_noexcept(req.queryParams.client);
            logger.logRequestStarted({
                client: client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/view",
                status: "Started",
                description: "View User Information",
            });

            var user,
                det_ok = false;

            if (req.queryParams.subject) {
                if (!g_db.u.exists(req.queryParams.subject))
                    throw [
                        g_lib.ERR_INVALID_PARAM,
                        "No such user '" + req.queryParams.subject + "'",
                    ];
                user = g_db.u.document({
                    _id: req.queryParams.subject,
                });
                if (client && (client._id == user._id || client.is_admin)) det_ok = true;
            } else {
                user = client;
                det_ok = true;
            }

            if (det_ok) {
                var repos = g_db
                    ._query(
                        "for v in 1..1 inbound @user admin filter is_same_collection('repo',v) limit 1 return v._key",
                        {
                            user: user._id,
                        },
                    )
                    .toArray();
                if (repos.length) user.is_repo_admin = true;

                user.allocs = g_db.alloc
                    .byExample({
                        _from: user._id,
                    })
                    .toArray();
                if (user.allocs.length) {
                    var alloc;

                    for (var i in user.allocs) {
                        alloc = user.allocs[i];
                        delete alloc._from;
                        alloc.repo = alloc._to.substr(5);
                        delete alloc._to;
                        delete alloc._key;
                        delete alloc._id;
                        delete alloc._rev;
                    }
                }

                if (req.queryParams.details) {
                    var idents = g_db
                        ._query("for v in 1..1 outbound @user ident return v._key", {
                            user: user._id,
                        })
                        .toArray();
                    if (idents.length) {
                        user.idents = idents;
                    }
                }
            } else {
                delete user.options;
            }

            user.uid = user._id;

            delete user._id;
            delete user._key;
            delete user._rev;
            delete user.name;
            delete user.password;
            delete user.max_coll;
            delete user.max_proj;
            delete user.max_sav_qry;
            delete user.eps;
            delete user.pub_key;
            delete user.priv_key;
            delete user.access;
            delete user.refresh;

            res.send([user]);
            logger.logRequestSuccess({
                client: client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/view",
                status: "Success",
                description: "View User Information",
                extra: user,
            }); //req.queryParams.details ?
        } catch (e) {
            g_lib.handleException(e, res);
            logger.logRequestFailure({
                client: client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/view",
                status: "Failure",
                description: "View User Information",
                extra: user,
                error: e,
            });
        }
    })
    .queryParam("client", joi.string().required(), "Client ID")
    .queryParam("subject", joi.string().optional(), "UID of subject user to view")
    .queryParam("details", joi.boolean().optional(), "Show additional user details")
    .summary("View user information")
    .description("View user information");

router
    .get("/list/all", function (req, res) {
        let client = null;
        var qry = "for i in u sort i.name_last, i.name_first";
        var result;
        logger.logRequestStarted({
            client: client?._id,
            correlationId: req.headers["x-correlation-id"],
            httpVerb: "GET",
            routePath: basePath + "/list/all",
            status: "Started",
            description: "List all users",
        });

        if (req.queryParams.offset != undefined && req.queryParams.count != undefined) {
            qry +=
                " limit " +
                req.queryParams.offset +
                ", " +
                req.queryParams.count +
                " return { uid: i._id, name_last: i.name_last, name_first: i.name_first }";
            result = g_db._query(
                qry,
                {},
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
            qry += " return { uid: i._id, name_last: i.name_last, name_first: i.name_first }";
            result = g_db._query(qry);
        }

        res.send(result);
        logger.logRequestSuccess({
            client: client?._id,
            correlationId: req.headers["x-correlation-id"],
            httpVerb: "GET",
            routePath: basePath + "/list/all",
            status: "Success",
            description: "List all users",
            extra: result,
        });
    })
    .queryParam("offset", joi.number().optional(), "Offset")
    .queryParam("count", joi.number().optional(), "Count")
    .summary("List all users")
    .description("List all users");

router
    .get("/list/collab", function (req, res) {
        var result,
            client = g_lib.getUserFromClientID(req.queryParams.client);
        logger.logRequestStarted({
            client: client?._id,
            correlationId: req.headers["x-correlation-id"],
            httpVerb: "GET",
            routePath: basePath + "/list/collab",
            status: "Started",
            description: "List collaborators of client",
        });

        var qry =
            "for x in union_distinct((for v in 2..2 any @user owner, member, acl filter is_same_collection('u',v) return" +
            " distinct { uid: v._id, name_last: v.name_last, name_first: v.name_first }),(for v in 3..3 inbound @user member, outbound owner, outbound admin" +
            " filter is_same_collection('u',v) return distinct { uid: v._id, name_last: v.name_last, name_first: v.name_first }),(for v in 2..2 inbound @user" +
            " owner, outbound admin filter is_same_collection('u',v) return distinct { uid: v._id, name_last: v.name_last, name_first: v.name_first })) sort x.name_last, x.name_first";

        // Members of owned groups and owned user ACLS:
        // Members of groups client belongs to (not owned - projects and ACLs)
        // Owner of user-ACLs of with client is the subject
        // Members and admins of owned projects
        // Owner and admins of member projects (members gathered by group members above)
        if (req.queryParams.offset != undefined && req.queryParams.count != undefined) {
            qry += " limit " + req.queryParams.offset + ", " + req.queryParams.count + " return x";
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
            qry += " return x";
            result = g_db._query(qry, {
                user: client._id,
            });
        }

        res.send(result);
        logger.logRequestSucceed({
            client: client?._id,
            correlationId: req.headers["x-correlation-id"],
            httpVerb: "GET",
            routePath: basePath + "/list/collab",
            status: "Success",
            description: "List collaborators of client",
            extra: result,
        });

        //res.send( g_db._query( "for x in union_distinct((for v in 2..2 any @user owner, member, acl filter is_same_collection('u',v) return distinct { uid: v._id, name: v.name }),(for v in 3..3 inbound @user member, outbound owner, outbound admin filter is_same_collection('u',v) return distinct { uid: v._id, name: v.name }),(for v in 2..2 inbound @user owner, outbound admin filter is_same_collection('u',v) return distinct { uid: v._id, name: v.name })) return x", { user: client._id }));
    })
    .queryParam("client", joi.string().required(), "Client ID")
    .queryParam("offset", joi.number().optional(), "Offset")
    .queryParam("count", joi.number().optional(), "Count")
    .summary("List collaborators of client")
    .description("List collaborators of client (from groups, projects, and ACLs)");

/* Remove a user account from the system.

Note: must delete ALL data records and projects owned by the user being deleted before deleting the user.
*/
router
    .get("/delete", function (req, res) {
        let client = null;
        let user_id = null;
        try {
            g_db._executeTransaction({
                collections: {
                    read: ["u", "admin"],
                    write: [
                        "u",
                        "p",
                        "g",
                        "uuid",
                        "accn",
                        "c",
                        "d",
                        "a",
                        "acl",
                        "owner",
                        "ident",
                        "alias",
                        "admin",
                        "member",
                        "item",
                        "alloc",
                        "loc",
                    ],
                },
                action: function () {
                    client = g_lib.getUserFromClientID(req.queryParams.client);
                    logger.logRequestStarted({
                        client: client?._id,
                        correlationId: req.headers["x-correlation-id"],
                        httpVerb: "GET",
                        routePath: basePath + "/delete",
                        status: "Started",
                        description: "Remove existing user entry",
                    });

                    if (req.queryParams.subject) {
                        user_id = req.queryParams.subject;
                        if (!g_db.u.exists(user_id))
                            throw [g_lib.ERR_INVALID_PARAM, "No such user '" + user_id + "'"];
                        g_lib.ensureAdminPermUser(client, user_id);
                    } else {
                        user_id = client._id;
                    }

                    var objects, subobjects, obj, subobj, i, j;

                    // Delete linked accounts
                    objects = g_db
                        ._query("for v in 1..1 outbound @user ident return v._id", {
                            user: user_id,
                        })
                        .toArray();
                    for (i in objects) {
                        obj = objects[i];
                        g_graph[obj.substr(0, obj.indexOf("/"))].remove(obj);
                    }

                    // Delete owned projects
                    objects = g_db
                        ._query(
                            "for v in 1..1 inbound @user owner filter is_same_collection('p',v) return v._id",
                            {
                                user: user_id,
                            },
                        )
                        .toArray();
                    for (i in objects) {
                        obj = objects[i];
                        subobjects = g_db
                            ._query("for v in 1..1 inbound @proj owner return v._id", {
                                proj: obj,
                            })
                            .toArray();
                        for (j in subobjects) {
                            subobj = subobjects[j];
                            g_graph[subobj.substr(0, subobj.indexOf("/"))].remove(subobj);
                        }

                        g_graph.p.remove(obj);
                    }

                    // Delete collections, data, groups, notes
                    objects = g_db
                        ._query("for v in 1..1 inbound @user owner return v._id", {
                            user: user_id,
                        })
                        .toArray();
                    for (i in objects) {
                        obj = objects[i];
                        g_graph[obj.substr(0, obj.indexOf("/"))].remove(obj);
                    }

                    g_graph.u.remove(user_id);
                },
            });
            logger.logRequestSuccess({
                client: client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/delete",
                status: "Success",
                description: "Remove existing user entry",
                extra: user_id,
            });
        } catch (e) {
            logger.logRequestFailure({
                client: client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/delete",
                status: "Failure",
                description: "Remove existing user entry",
                extra: user_id,
                error: e,
            });
            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().required(), "Client ID")
    .queryParam("subject", joi.string().optional(), "UID of subject user (optional)")
    .summary("Remove existing user entry")
    .description("Remove existing user entry. Requires admin permissions.");

router
    .get("/ident/list", function (req, res) {
        let client = null;
        try {
            client = g_lib.getUserFromClientID(req.queryParams.client);
            logger.logRequestStarted({
                client: client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/ident/list",
                status: "Started",
                description: "List user linked IDs",
            });
            if (req.queryParams.subject) {
                if (!g_db.u.exists(req.queryParams.subject))
                    throw [
                        g_lib.ERR_INVALID_PARAM,
                        "No such user '" + req.queryParams.subject + "'",
                    ];
                const subject = g_db.u.document(req.queryParams.subject);
                g_lib.ensureAdminPermUser(client, subject._id);

                res.send(
                    g_db._query("for v in 1..1 outbound @client ident return v._key", {
                        client: subject._id,
                    }),
                );
                logger.logRequestSuccess({
                    client: client?._id,
                    correlationId: req.headers["x-correlation-id"],
                    httpVerb: "GET",
                    routePath: basePath + "/ident/list",
                    status: "Success",
                    description: "List user linked IDs",
                });
            } else {
                res.send(
                    g_db._query("for v in 1..1 outbound @client ident return v._key", {
                        client: client._id,
                    }),
                );
                logger.logRequestSuccess({
                    client: client?._id,
                    correlationId: req.headers["x-correlation-id"],
                    httpVerb: "GET",
                    routePath: basePath + "/ident/list",
                    status: "Success",
                    description: "List user linked IDs",
                });
            }
        } catch (e) {
            logger.logRequestFailure({
                client: client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/ident/list",
                status: "Failure",
                description: "List user linked IDs",
                error: e,
            });
            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().required(), "Client ID")
    .queryParam("subject", joi.string().optional(), "UID of subject user (optional)")
    .summary("List user linked UIDs");

router
    .get("/ident/add", function (req, res) {
        let client = null;
        try {
            g_db._executeTransaction({
                collections: {
                    read: ["u", "admin"],
                    write: ["uuid", "accn", "ident"],
                },
                action: function () {
                    client = g_lib.getUserFromClientID(req.queryParams.client);
                    var id;
                    logger.logRequestStarted({
                        client: client?._id,
                        correlationId: req.headers["x-correlation-id"],
                        httpVerb: "GET",
                        routePath: basePath + "/ident/add",
                        status: "Started",
                        description: "Add new linked identity",
                    });

                    if (g_lib.isUUID(req.queryParams.ident)) {
                        if (
                            g_db._exists({
                                _id: "uuid/" + req.queryParams.ident,
                            })
                        )
                            logger.logRequestSuccess({
                                client: client?._id,
                                correlationId: req.headers["x-correlation-id"],
                                httpVerb: "GET",
                                routePath: basePath + "/ident/add",
                                status: "Success",
                                description: "Add new linked identity",
                                extra: req.queryParams.ident,
                            });

                        return;
                        id = g_db.uuid.save(
                            {
                                _key: req.queryParams.ident,
                            },
                            {
                                returnNew: true,
                            },
                        );
                    } else if (g_lib.isDomainAccount(req.queryParams.ident)) {
                        if (
                            g_db._exists({
                                _id: "accn/" + req.queryParams.ident,
                            })
                        ) {
                            if (req.queryParams.pub_key && req.queryParams.priv_key) {
                                // Update existing accn with new keys
                                g_db.accn.update(
                                    {
                                        _id: "accn/" + req.queryParams.ident,
                                    },
                                    {
                                        pub_key: req.queryParams.pub_key,
                                        priv_key: req.queryParams.priv_key,
                                    },
                                );
                            }
                            logger.logRequestSuccess({
                                client: client?._id,
                                correlationId: req.headers["x-correlation-id"],
                                httpVerb: "GET",
                                routePath: basePath + "/ident/add",
                                status: "Success",
                                description: "Add new linked identity",
                                extra: req.queryParams.ident,
                            });
                            return;
                        } else {
                            var accn = {
                                _key: req.queryParams.ident,
                            };
                            if (req.queryParams.pub_key && req.queryParams.priv_key) {
                                accn.pub_key = req.queryParams.pub_key;
                                accn.priv_key = req.queryParams.priv_key;
                            }
                            id = g_db.accn.save(accn, {
                                returnNew: true,
                            });
                        }
                    } else
                        throw [
                            g_lib.ERR_INVALID_PARAM,
                            "Invalid identity value: " + req.queryParams.ident,
                        ];

                    if (req.queryParams.subject) {
                        if (!g_db.u.exists(req.queryParams.subject))
                            throw [
                                g_lib.ERR_INVALID_PARAM,
                                "No such user '" + req.queryParams.subject + "'",
                            ];

                        const user = g_db.u.document(req.queryParams.subject);
                        g_lib.ensureAdminPermUser(client, user._id);

                        g_db.ident.save({
                            _from: user._id,
                            _to: id._id,
                        });
                    } else {
                        g_db.ident.save({
                            _from: client._id,
                            _to: id._id,
                        });
                    }
                },
            });
            logger.logRequestSuccess({
                client: client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/ident/add",
                status: "Success",
                description: "Add new linked identity",
                extra: req.queryParams.ident,
            });
        } catch (e) {
            logger.logRequestFailure({
                client: client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/ident/add",
                status: "Failure",
                description: "Add new linked identity",
                extra: req.queryParams.ident,
                error: e,
            });
            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().required(), "Client ID")
    .queryParam("subject", joi.string().optional(), "UID of subject user (optional)")
    .queryParam("ident", joi.string().required(), "Identity to add")
    .queryParam("pub_key", joi.string().optional(), "Optional public key (domain accounts only)")
    .queryParam("priv_key", joi.string().optional(), "Optional private key (domain accounts only)")
    .summary("Add new linked identity")
    .description(
        "Add new linked identity to user account. Identities can be UUIDs or domain accounts.",
    );

router
    .get("/ident/remove", function (req, res) {
        let client = null;
        try {
            g_db._executeTransaction({
                collections: {
                    read: ["u", "admin"],
                    write: ["uuid", "accn", "ident"],
                },
                action: function () {
                    client = g_lib.getUserFromClientID(req.queryParams.client);
                    const owner = g_lib.getUserFromClientID(req.queryParams.ident);
                    logger.logRequestStarted({
                        client: client?._id,
                        correlationId: req.headers["x-correlation-id"],
                        httpVerb: "GET",
                        routePath: basePath + "/ident/remove",
                        status: "Started",
                        description: "Remove linked identity from user account",
                    });
                    g_lib.ensureAdminPermUser(client, owner._id);

                    if (g_lib.isUUID(req.queryParams.ident)) {
                        g_graph.uuid.remove("uuid/" + req.queryParams.ident);
                    } else if (g_lib.isDomainAccount(req.queryParams.ident)) {
                        g_graph.accn.remove("accn/" + req.queryParams.ident);
                    } else
                        throw [
                            g_lib.ERR_INVALID_PARAM,
                            "Invalid identity value: " + req.queryParams.ident,
                        ];
                },
            });
            logger.logRequestSuccess({
                client: client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/ident/remove",
                status: "Success",
                description: "Remove linked identity from user account",
                extra: req.queryParams.ident,
            });
        } catch (e) {
            logger.logRequestFailure({
                client: client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/ident/remove",
                status: "Failure",
                description: "Remove linked identity from user account",
                extra: req.queryParams.ident,
                error: e,
            });
            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().required(), "Client ID")
    .queryParam("ident", joi.string().required(), "Certificate to delete")
    .summary("Remove linked identity from user account")
    .description("Remove linked identity from user account");

router
    .get("/ep/get", function (req, res) {
        let client = null;
        try {
            client = g_lib.getUserFromClientID(req.queryParams.client);
            logger.logRequestStarted({
                client: client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/ep/get",
                status: "Started",
                description: "Get recent end-points",
            });

            res.send(client.eps ? client.eps : []);
            logger.logRequestSuccess({
                client: client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/ep/get",
                status: "Success",
                description: "Get recent end-points",
                extra: client.eps,
            });
        } catch (e) {
            logger.logRequestFailure({
                client: client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/ep/get",
                status: "Failure",
                description: "Get recent end-points",
                extra: client.eps,
                error: e,
            });
            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().required(), "Client ID")
    .summary("Get recent end-points")
    .description("Get recent end-points");

router
    .get("/ep/set", function (req, res) {
        let client = null;
        try {
            client = g_lib.getUserFromClientID(req.queryParams.client);
            logger.logRequestStarted({
                client: client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/ep/set",
                status: "Started",
                description: "Set recent end-points",
            });
            g_db._update(
                client._id,
                {
                    eps: req.queryParams.eps,
                },
                {
                    keepNull: false,
                },
            );
            logger.logRequestSuccess({
                client: client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/ep/set",
                status: "Started",
                description: "Set recent end-points",
                extra: client.eps,
            });
        } catch (e) {
            logger.logRequestFailure({
                client: client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/ep/set",
                status: "Failure",
                description: "Set recent end-points",
                extra: client.eps,
                error: e,
            });
            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().required(), "Client ID")
    .queryParam(
        "eps",
        joi.array().items(joi.string()).required(),
        "End-points (UUIDs or legacy names)",
    )
    .summary("Set recent end-points")
    .description("Set recent end-points");
