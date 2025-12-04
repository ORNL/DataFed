"use strict";

const createRouter = require("@arangodb/foxx/router");
const router = createRouter();
const joi = require("joi");
const g_db = require("@arangodb").db;
const g_lib = require("./support");
const error = require("./lib/error_codes");
const permissions = require("./lib/permissions");
const authzModule = require("./authz");
const logger = require("./lib/logger");
const { Repo, PathType } = require("./repo");
const basePath = "authz";
module.exports = router;

router
    .get("/gridftp", function (req, res) {
        let client = null;
        let description = `Check authorization to ${req.queryParams.act} ${req.queryParams.file} on ${req.queryParams.repo} `;
        try {
            client = g_lib.getUserFromClientID(req.queryParams.client);
            logger.logRequestStarted({
                client: client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/gridftp",
                status: "Started",
                description: description,
            });

            // Client will contain the following information
            //
            // "_key" : "bob",
            // "_id" : "u/bob",
            // "name" : "bob junior ",
            // "name_first" : "bob",
            // "name_last" : "jones",
            // "is_admin" : true,
            // "max_coll" : 50,
            // "max_proj" : 10,
            // "max_sav_qry" : 20,
            // :
            // "email" : "bobjones@gmail.com"
            client = g_lib.getUserFromClientID_noexcept(req.queryParams.client);
            if (!client) {
                throw [error.ERR_PERM_DENIED, "Unknown client: " + req.queryParams.client];
            }
            let repo = new Repo(req.queryParams.repo);
            let path_type = repo.pathType(req.queryParams.file);

            // If the provided path is not within the repo throw an error
            if (path_type === PathType.UNKNOWN) {
                throw [
                    error.ERR_PERM_DENIED,
                    "Unknown path, or path is not consistent with supported repository folder hierarchy: " +
                        req.queryParams.file,
                ];
            }

            // Determine permissions associated with path provided
            // Actions: read, write, create, delete, chdir, lookup
            if (Object.keys(authzModule.authz_strategy).includes(req.queryParams.act)) {
                authzModule.authz_strategy[req.queryParams.act][path_type](
                    client,
                    req.queryParams.file,
                );
            } else {
                throw [error.ERR_INVALID_PARAM, "Invalid gridFTP action: ", req.queryParams.act];
            }
            logger.logRequestSuccess({
                client: client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/gridftp",
                status: "Success",
                description: description,
                extra: {
                    id: client?._id,
                    is_admin: client?.is_admin,
                },
            });
        } catch (e) {
            logger.logRequestFailure({
                client: client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/gridftp",
                status: "Failure",
                description: description,
                extra: {
                    id: client?._id,
                    is_admin: client?.is_admin,
                },
                error: e,
            });

            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().required(), "Client ID")
    .queryParam(
        "repo",
        joi.string().required(),
        "Originating repo ID, where the DataFed managed GridFTP server is running.",
    )
    .queryParam("file", joi.string().required(), "Data file name")
    .queryParam(
        "act",
        joi.string().required(),
        "GridFTP action: 'lookup', 'chdir', 'read', 'write', 'create', 'delete'",
    )
    .summary("Checks authorization")
    .description("Checks authorization");

router
    .get("/perm/check", function (req, res) {
        let client = null;
        let result = null;
        try {
            client = g_lib.getUserFromClientID(req.queryParams.client);
            logger.logRequestStarted({
                client: client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/perm/check",
                status: "Started",
                description: "Checks client permissions for object",
            });

            var perms = req.queryParams.perms ? req.queryParams.perms : permissions.PERM_ALL;
            var obj;
            result = true;
            var id = g_lib.resolveID(req.queryParams.id, client),
                ty = id[0];

            if (id[1] != "/") {
                throw [error.ERR_INVALID_PARAM, "Invalid ID, " + req.queryParams.id];
            }

            if (ty == "p") {
                var role = g_lib.getProjectRole(client._id, id);
                if (role == g_lib.PROJ_NO_ROLE) {
                    // Non members have only VIEW permissions
                    if (perms != permissions.PERM_RD_REC) result = false;
                } else if (role == g_lib.PROJ_MEMBER) {
                    // Non members have only VIEW permissions
                    if ((perms & ~permissions.PERM_MEMBER) != 0) result = false;
                } else if (role == g_lib.PROJ_MANAGER) {
                    // Managers have all but UPDATE
                    if ((perms & ~permissions.PERM_MANAGER) != 0) result = false;
                }
            } else if (ty == "d") {
                if (!permissions.hasAdminPermObject(client, id)) {
                    obj = g_db.d.document(id);
                    if (obj.locked) result = false;
                    else result = permissions.hasPermissions(client, obj, perms);
                }
            } else if (ty == "c") {
                // If create perm is requested, ensure owner of collection has at least one allocation
                if (perms & permissions.PERM_CREATE) {
                    var owner = g_db.owner.firstExample({
                        _from: id,
                    });
                    if (
                        !g_db.alloc.firstExample({
                            _from: owner._to,
                        })
                    ) {
                        throw [
                            error.ERR_NO_ALLOCATION,
                            "An allocation is required to create a collection.",
                        ];
                    }
                }

                if (!permissions.hasAdminPermObject(client, id)) {
                    obj = g_db.c.document(id);
                    result = permissions.hasPermissions(client, obj, perms);
                }
            } else {
                throw [error.ERR_INVALID_PARAM, "Invalid ID, " + req.queryParams.id];
            }

            res.send({
                granted: result,
            });
            logger.logRequestSuccess({
                client: client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/perm/check",
                status: "Success",
                description:
                    "Checks client permissions for object. OBJ ID:" +
                    req.queryParams.id +
                    ", Permissions: " +
                    req.queryParams.perms,
                extra: result,
            });
        } catch (e) {
            logger.logRequestFailure({
                client: client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/perm/check",
                status: "Failure",
                description:
                    "Checks client permissions for object. OBJ ID:" +
                    req.queryParams.id +
                    ", Permissions: " +
                    req.queryParams.perms,
                extra: result,
                error: e,
            });
            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().required(), "Client ID")
    .queryParam("id", joi.string().required(), "Object ID or alias")
    .queryParam("perms", joi.number().required(), "Permission bit mask to check")
    .summary("Checks client permissions for object")
    .description("Checks client permissions for object (projects, data, collections");

router
    .get("/perm/get", function (req, res) {
        let client = null;
        let result = null;
        try {
            client = g_lib.getUserFromClientID(req.queryParams.client);
            logger.logRequestStarted({
                client: client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/perm/get",
                status: "Started",
                description:
                    "Gets client permissions for object. Permissions:" + req.queryParams.perms,
            });

            result = req.queryParams.perms ? req.queryParams.perms : permissions.PERM_ALL;
            var obj,
                id = g_lib.resolveID(req.queryParams.id, client),
                ty = id[0];

            if (id[1] != "/") throw [error.ERR_INVALID_PARAM, "Invalid ID, " + req.queryParams.id];

            if (ty == "p") {
                var role = g_lib.getProjectRole(client._id, id);
                if (role == g_lib.PROJ_NO_ROLE) {
                    // Non members have only VIEW permissions
                    result &= permissions.PERM_RD_REC;
                } else if (role == g_lib.PROJ_MEMBER) {
                    result &= permissions.PERM_MEMBER;
                } else if (role == g_lib.PROJ_MANAGER) {
                    // Managers have all but UPDATE
                    result &= permissions.PERM_MANAGER;
                }
            } else if (ty == "d") {
                if (!permissions.hasAdminPermObject(client, id)) {
                    obj = g_db.d.document(id);
                    if (obj.locked) result = 0;
                    else result = permissions.getPermissions(client, obj, result);
                }
            } else if (ty == "c") {
                if (!permissions.hasAdminPermObject(client, id)) {
                    obj = g_db.c.document(id);
                    result = permissions.getPermissions(client, obj, result);
                }
            } else throw [error.ERR_INVALID_PARAM, "Invalid ID, " + req.queryParams.id];

            res.send({
                granted: result,
            });
            logger.logRequestSuccess({
                client: client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/perm/get",
                status: "Success",
                description:
                    "Gets client permissions for object. Permissions:" + req.queryParams.perms,
                extra: result,
            });
        } catch (e) {
            logger.logRequestFailure({
                client: client?._id,
                correlationId: req.headers["x-correlation-id"],
                httpVerb: "GET",
                routePath: basePath + "/perm/get",
                status: "Failure",
                description:
                    "Gets client permissions for object. Permissions:" + req.queryParams.perms,
                extra: result,
                error: e,
            });
            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().required(), "Client ID")
    .queryParam("id", joi.string().required(), "Object ID or alias")
    .queryParam("perms", joi.number().optional(), "Permission bit mask to get (default = all)")
    .summary("Gets client permissions for object")
    .description(
        'Gets client permissions for object (projects, data, collections. Note this is potentially slower than using "check" method.',
    );
