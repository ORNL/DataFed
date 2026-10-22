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
const pathModule = require("./posix_path");
const { Repo, PathType } = require("./repo");
const basePath = "authz";
module.exports = router;

router
    .get("/gridftp", function (req, res) {
        // ===================================================================
        // WORKED EXAMPLE used in the comments below
        //
        // One GridFTP server (Globus endpoint "E1") serves two repos:
        //
        //   repo/A   endpoint: "E1"   path: /mnt/datafed/A
        //   repo/B   endpoint: "E1"   path: /mnt/datafed/B
        //
        // A different server (endpoint "E2") serves:
        //
        //   repo/C   endpoint: "E2"   path: /data/C
        //
        // The authz callout on E1 is configured with repo_id=repo/A, so every
        // request from E1 arrives with repo=repo/A, whatever the file path.
        //
        // Alice (u/alice) has an allocation on repo/B and owns record 1234.
        //
        // Requests traced below (all arrive from E1, all with repo=repo/A):
        //   R1: act=lookup  file=/mnt/datafed                    (ancestor)
        //   R2: act=lookup  file=/mnt/datafed/B                  (repo root)
        //   R3: act=read    file=/mnt/datafed/B/user/alice/1234  (record)
        //   R4: act=lookup  file=/mnt/other                      (not ours)
        //   R5: act=read    file=/data/C/user/alice/99           (E2's repo)
        //   R6: act=write   file=/mnt/datafed                    (ancestor, write)
        //
        // Paths are COLLECTION-RELATIVE: the callout has already removed the
        // Globus collection base path. With the collection at "/", they
        // match host paths exactly.
        // ===================================================================
        let client = null;
        let description = `Check authorization to ${req.queryParams.act} ${req.queryParams.file} on ${req.queryParams.repo} `;
        try {
            // ---------------------------------------------------------------
            // STEP 1: Resolve the client.
            //
            // req.queryParams.client may be a comma-separated list of Globus
            // identity UUIDs (a guest collection passes every linked
            // identity). Any one of them matching a DataFed account resolves
            // the user.
            //   e.g. "c819525e-...,39a5286d-..." -> u/alice
            //   e.g. "deadbeef-..." (no DataFed account) -> null -> DENY below
            // ---------------------------------------------------------------
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
            if (!client) {
                throw [error.ERR_PERM_DENIED, "Unknown client: " + req.queryParams.client];
            }

            // ---------------------------------------------------------------
            // STEP 2: Identify the endpoint the request came from.
            //
            // The originating repo identifies the GridFTP endpoint making the
            // request. Several repos may be served by the same endpoint, so the
            // repo that owns the path is resolved from the path itself and must
            // be served by the same endpoint as the originating repo.
            //
            // Example (all of R1-R6): repo=repo/A
            //   repo/A exists                       -> continue
            //   repo/A.endpoint = "E1"              -> origin_endpoint = "E1"
            //
            // Failure cases:
            //   repo=repo/nope (no such repo)       -> DENY "Unknown originating repo"
            //   repo/A has no endpoint field        -> INTERNAL FAULT. Failing
            //     here is deliberate: otherwise undefined === undefined in
            //     STEP 4 would let a repo without an endpoint match any other
            //     repo without one.
            // ---------------------------------------------------------------
            let origin = new Repo(req.queryParams.repo);
            if (!origin.exists()) {
                throw [error.ERR_PERM_DENIED, "Unknown originating repo: " + req.queryParams.repo];
            }
            const origin_endpoint = g_db._document(origin.id()).endpoint;
            if (!origin_endpoint) {
                throw [
                    error.ERR_INTERNAL_FAULT,
                    "Originating repo is missing endpoint: " + req.queryParams.repo,
                ];
            }

            // ---------------------------------------------------------------
            // STEP 3: Resolve which repo owns the path.
            //
            // resolveFromPath finds the repo whose path is the longest prefix
            // of the file path (at or below the repo root).
            //
            //   R2: /mnt/datafed/B                 -> repo/B (exact root match)
            //   R3: /mnt/datafed/B/user/alice/1234 -> repo/B
            //   R5: /data/C/user/alice/99          -> repo/C
            //   R1: /mnt/datafed                   -> THROWS (above every repo)
            //   R4: /mnt/other                     -> THROWS (matches nothing)
            //   R6: /mnt/datafed                   -> THROWS (above every repo)
            // ---------------------------------------------------------------
            let repo = null;
            try {
                repo = Repo.resolveFromPath(req.queryParams.file, origin_endpoint);
            } catch (e) {
                // -----------------------------------------------------------
                // STEP 3a: Ancestor fallback.
                //
                // Not inside any repo. The only acceptable case is traversal
                // (lookup/chdir) of a directory above a repo served by this
                // endpoint; the strategy table decides access for REPO_BASE_PATH.
                //
                // GridFTP looks up every parent directory on the way to a
                // file, so R1 must be allowed for R3 to ever happen.
                //
                //   R6: act=write            -> not traversal -> rethrow (DENY)
                //   non-canonical path, e.g. /mnt/datafed/B/../../etc
                //                            -> rethrow (DENY)
                //
                //   R1: act=lookup, /mnt/datafed, canonical -> search:
                //     repo/A (E1): pathType(/mnt/datafed) = REPO_BASE_PATH ✓
                //     repo/B (E1): pathType(/mnt/datafed) = REPO_BASE_PATH ✓
                //     repo/C (E2): dropped, wrong endpoint
                //     candidates = [repo/A, repo/B]
                //     alice can access repo/B -> repo = repo/B
                //
                //   R4: act=lookup, /mnt/other -> search:
                //     repo/A: pathType(/mnt/other) = UNKNOWN  ✗
                //     repo/B: pathType(/mnt/other) = UNKNOWN  ✗
                //     candidates = [] -> rethrow original error (DENY)
                //
                // If candidates exist but the client can access none of them,
                // candidates[0] is used anyway, so that traverseRepo in STEP 6
                // denies with a reason rather than this block failing silently.
                // -----------------------------------------------------------
                const file = req.queryParams.file;
                if (
                    (req.queryParams.act !== "lookup" && req.queryParams.act !== "chdir") ||
                    pathModule.normalizePOSIXPath(file) !== file
                ) {
                    throw e;
                }
                const candidates = g_db.repo
                    .all()
                    .toArray()
                    .filter((r) => r.endpoint === origin_endpoint)
                    .map((r) => new Repo(r._id))
                    .filter((r) => r.pathType(file) === PathType.REPO_BASE_PATH);
                if (candidates.length === 0) {
                    throw e;
                }
                repo =
                    candidates.find((r) => authzModule.hasRepoAccess(client, r)) || candidates[0];
            }

            // ---------------------------------------------------------------
            // STEP 4: The owning repo must be served by the requesting endpoint.
            //
            // This stops a GridFTP server from getting approval for paths
            // that belong to a repo hosted on a different server.
            //
            //   R1: repo/B.endpoint "E1" === "E1" ✓
            //   R2: repo/B.endpoint "E1" === "E1" ✓
            //   R3: repo/B.endpoint "E1" === "E1" ✓  (repo=repo/A in the
            //       request does NOT cause a denial; repo/B shares its endpoint)
            //   R5: repo/C.endpoint "E2" !== "E1" ✗  -> DENY
            // ---------------------------------------------------------------
            if (g_db._document(repo.id()).endpoint !== origin_endpoint) {
                throw [
                    error.ERR_PERM_DENIED,
                    "File path belongs to a repository not served by this endpoint: " +
                        req.queryParams.file,
                ];
            }

            // ---------------------------------------------------------------
            // STEP 5: Classify the path within the owning repo.
            //
            // repo/B root = /mnt/datafed/B
            //   R1: /mnt/datafed                    -> REPO_BASE_PATH
            //   R2: /mnt/datafed/B                  -> REPO_ROOT_PATH
            //       /mnt/datafed/B/user             -> REPO_PATH
            //       /mnt/datafed/B/user/alice       -> USER_PATH
            //   R3: /mnt/datafed/B/user/alice/1234  -> USER_RECORD_PATH
            //       /mnt/datafed/B/junk             -> UNKNOWN -> DENY below
            //       /mnt/datafed/B/user/a/1/extra   -> UNKNOWN -> DENY below
            // ---------------------------------------------------------------
            let path_type = repo.pathType(req.queryParams.file);

            // If the provided path is not within the repo throw an error
            if (path_type === PathType.UNKNOWN) {
                throw [
                    error.ERR_PERM_DENIED,
                    "Unknown path, or path is not consistent with supported repository folder hierarchy: " +
                        req.queryParams.file,
                ];
            }

            // ---------------------------------------------------------------
            // STEP 6: Apply the permission strategy for (action, path type).
            //
            // authz_strategy[act][path_type](client, file, repo). A strategy
            // returns to ALLOW and throws to DENY.
            //
            //   R1: lookup / REPO_BASE_PATH   -> traverseRepo:
            //       alice has an allocation on repo/B        -> ALLOW
            //       (a user with no access to repo/B         -> DENY)
            //   R2: lookup / REPO_ROOT_PATH   -> traverseRepo    -> ALLOW
            //       lookup / USER_PATH (/mnt/datafed/B/user/alice)
            //                                 -> traverseUserFolder:
            //       alice owns the folder                     -> ALLOW
            //       (bob, even with an ACL grant on one of alice's records
            //        in repo/B                                -> DENY)
            //   R3: read / USER_RECORD_PATH   -> readRecord:
            //       alice has PERM_RD_DATA on d/1234, and the record's
            //       stored path matches the requested path    -> ALLOW
            //
            // An unrecognised action, e.g. act=rename     -> INVALID PARAM
            // ---------------------------------------------------------------
            // Determine permissions associated with path provided
            // Actions: read, write, create, delete, chdir, lookup
            if (Object.keys(authzModule.authz_strategy).includes(req.queryParams.act)) {
                authzModule.authz_strategy[req.queryParams.act][path_type](
                    client,
                    req.queryParams.file,
                    repo,
                );
            } else {
                throw [error.ERR_INVALID_PARAM, "Invalid gridFTP action: " + req.queryParams.act];
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
            // Every DENY above lands here. The thrown [code, message] is
            // logged and returned; the core relays it to the authz callout as
            // a NACK, whose message is what appears in the GridFTP logs.
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
                extra: `Object ID: ${req.queryParams.id}`,
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
                extra: `Object ID: ${req.queryParams.id}`,
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
