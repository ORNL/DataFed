"use strict";

const createRouter = require("@arangodb/foxx/router");
const router = createRouter();
const joi = require("joi");

const g_db = require("@arangodb").db;
const g_lib = require("./support");
const g_tasks = require("./tasks");

// Import new repository system
const { RepositoryType } = require("./repository/types");
const { createRepositoryByType } = require("./repository/factory");
const { RepositoryOps } = require("./repository/operations");

module.exports = router;

router
    .get("/list", function (req, res) {
        var client;
        if (req.queryParams.client) {
            client = g_lib.getUserFromClientID(req.queryParams.client);

            if (req.queryParams.all && !client.is_admin) {
                throw g_lib.ERR_PERM_DENIED;
            }
        }

        var filter = {};
        if (req.queryParams.type) {
            filter.type = req.queryParams.type;
        }
        if (!req.queryParams.all && client) {
            filter.admin = client._id;
        }

        const listResult = RepositoryOps.list(filter);
        if (!listResult.ok) {
            throw [listResult.error.code, listResult.error.message];
        }

        var result = listResult.value.map(repo => {
            const data = repo.data;
            data.id = data._id;
            delete data._id;
            delete data._key;
            delete data._rev;
            return data;
        });

        res.send(result);
    })
    .queryParam("client", joi.string().allow("").optional(), "Client ID")
    .queryParam("details", joi.boolean().optional(), "Show additional record details")
    .queryParam("all", joi.boolean().optional(), "List all repos (requires admin)")
    .queryParam("type", joi.string().valid('globus', 'metadata_only').optional(), "Filter by repository type")
    .summary("List repo servers administered by client")
    .description(
        "List repo servers administered by client. If client is an admin and all flag is specified, will list all repos in system.",
    );

router
    .get("/view", function (req, res) {
        try {
            const findResult = RepositoryOps.find(req.queryParams.id);
            if (!findResult.ok) {
                throw [findResult.error.code, findResult.error.message];
            }

            var repo = findResult.value.data;
            repo.admins = [];
            var admins = g_db.admin
                .byExample({
                    _from: repo._id,
                })
                .toArray();
            for (var i in admins) repo.admins.push(admins[i]._to);
            repo.id = repo._id;
            delete repo._id;
            delete repo._key;
            delete repo._rev;

            res.send([repo]);
        } catch (e) {
            g_lib.handleException(e, res);
        }
    })
    .queryParam("id", joi.string().required(), "Repo server ID")
    .summary("View repo server record")
    .description("View repo server record");

router
    .post("/create", function (req, res) {
        try {
            g_db._executeTransaction({
                collections: {
                    read: ["u"],
                    write: ["repo", "admin"],
                },
                action: function () {
                    var client = g_lib.getUserFromClientID(req.queryParams.client);
                    if (!client.is_admin) throw g_lib.ERR_PERM_DENIED;

                    // Build config object for factory
                    const config = {
                        id: req.body.id,
                        type: req.body.type,
                        title: req.body.title,
                        desc: req.body.desc,
                        capacity: req.body.capacity,
                        admins: req.body.admins,
                        // Type-specific fields
                        ...(req.body.type === RepositoryType.GLOBUS && {
                            pub_key: req.body.pub_key,
                            address: req.body.address,
                            endpoint: req.body.endpoint,
                            path: req.body.path,
                            exp_path: req.body.exp_path,
                            domain: req.body.domain
                        })
                    };

                    // Create repository using factory
                    const createResult = createRepositoryByType(config);
                    if (!createResult.ok) {
                        throw [createResult.error.code, createResult.error.message];
                    }

                    const repository = createResult.value;

                    // Validate admins exist
                    for (var i in req.body.admins) {
                        if (!g_db._exists(req.body.admins[i]))
                            throw [
                                g_lib.ERR_NOT_FOUND,
                                "User, " + req.body.admins[i] + ", not found",
                            ];
                    }

                    // Save repository to database
                    const saveResult = RepositoryOps.save(repository);
                    if (!saveResult.ok) {
                        throw [saveResult.error.code, saveResult.error.message];
                    }

                    const saved = saveResult.value;

                    // Create admin edges
                    for (var i in req.body.admins) {
                        g_db.admin.save({
                            _from: saved._id,
                            _to: req.body.admins[i],
                        });
                    }

                    saved.id = saved._id;
                    delete saved._id;
                    delete saved._key;
                    delete saved._rev;
                    res.send([saved]);
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
                id: joi.string().required(),
                type: joi.string().valid('globus', 'metadata_only').required(),
                title: joi.string().required(),
                desc: joi.string().optional(),
                capacity: joi.number().integer().min(1).required(),
                admins: joi.array().items(joi.string()).required(),
                // Globus-specific fields
                pub_key: joi.string().when('type', { is: 'globus', then: joi.required() }),
                address: joi.string().when('type', { is: 'globus', then: joi.required() }),
                endpoint: joi.string().when('type', { is: 'globus', then: joi.required() }),
                path: joi.string().when('type', { is: 'globus', then: joi.required() }),
                exp_path: joi.string().optional(),
                domain: joi.string().when('type', { is: 'globus', then: joi.required() })
            })
            .required(),
        "Repo fields",
    )
    .summary("Create a repo server record")
    .description("Create a repo server record with specified type (globus or metadata_only).");

router
    .post("/update", function (req, res) {
        try {
            g_db._executeTransaction({
                collections: {
                    read: ["u", "repo"],
                    write: ["repo", "admin"],
                },
                action: function () {
                    var client = g_lib.getUserFromClientID(req.queryParams.client);
                    if (!client.is_admin) throw g_lib.ERR_PERM_DENIED;

                    const findResult = RepositoryOps.find(req.body.id);
                    if (!findResult.ok) {
                        throw [findResult.error.code, findResult.error.message];
                    }

                    const repository = findResult.value;
                    const updates = {};

                    // Only allow updating certain fields
                    g_lib.procInputParam(req.body, "title", true, updates);
                    g_lib.procInputParam(req.body, "desc", true, updates);
                    g_lib.procInputParam(req.body, "capacity", true, updates);

                    // Type-specific updates
                    if (repository.type === RepositoryType.GLOBUS) {
                        g_lib.procInputParam(req.body, "pub_key", true, updates);
                        g_lib.procInputParam(req.body, "address", true, updates);
                        g_lib.procInputParam(req.body, "exp_path", true, updates);
                    }

                    const updateResult = RepositoryOps.update(repository, updates);
                    if (!updateResult.ok) {
                        throw [updateResult.error.code, updateResult.error.message];
                    }

                    const updated = updateResult.value;

                    // Handle admin updates if provided
                    if (req.body.admins) {
                        // Remove old admins
                        g_db.admin.removeByExample({ _from: updated._id });
                        
                        // Add new admins
                        for (var i in req.body.admins) {
                            if (!g_db._exists(req.body.admins[i]))
                                throw [
                                    g_lib.ERR_NOT_FOUND,
                                    "User, " + req.body.admins[i] + ", not found",
                                ];

                            g_db.admin.save({
                                _from: updated._id,
                                _to: req.body.admins[i],
                            });
                        }
                    }

                    updated.id = updated._id;
                    delete updated._id;
                    delete updated._key;
                    delete updated._rev;
                    res.send([updated]);
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
                id: joi.string().required(),
                title: joi.string().optional(),
                desc: joi.string().optional(),
                capacity: joi.number().integer().min(1).optional(),
                pub_key: joi.string().optional(),
                address: joi.string().optional(),
                exp_path: joi.string().optional(),
                admins: joi.array().items(joi.string()).optional(),
            })
            .required(),
        "Repo update fields",
    )
    .summary("Update repo server record")
    .description("Update repo server record");

// Allocation endpoints with new response format
router
    .post("/alloc/create", function (req, res) {
        try {
            const findResult = RepositoryOps.find(req.body.repo);
            if (!findResult.ok) {
                throw [findResult.error.code, findResult.error.message];
            }

            const repository = findResult.value;

            // Check permissions
            var client = g_lib.getUserFromClientID(req.queryParams.client);
            const permResult = RepositoryOps.checkPermission(repository, client._id, 'allocate');
            if (!permResult.ok || !permResult.value) {
                throw g_lib.ERR_PERM_DENIED;
            }

            // Create allocation
            const allocResult = RepositoryOps.createAllocation(repository, {
                subject: req.body.subject,
                size: req.body.size,
                path: req.body.path,
                metadata: req.body.metadata
            });

            if (!allocResult.ok) {
                throw [allocResult.error.code, allocResult.error.message];
            }

            res.send(allocResult.value);
        } catch (e) {
            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().required(), "Client ID")
    .body(
        joi.object({
            repo: joi.string().required(),
            subject: joi.string().required(),
            size: joi.number().integer().min(1).required(),
            path: joi.string().optional(),
            metadata: joi.object().optional()
        }).required(),
        "Allocation parameters"
    )
    .summary("Create allocation in repository")
    .description("Create allocation in repository. Returns task for Globus repos, direct result for metadata repos.");

router
    .post("/alloc/delete", function (req, res) {
        try {
            const findResult = RepositoryOps.find(req.body.repo);
            if (!findResult.ok) {
                throw [findResult.error.code, findResult.error.message];
            }

            const repository = findResult.value;

            // Check permissions
            var client = g_lib.getUserFromClientID(req.queryParams.client);
            const permResult = RepositoryOps.checkPermission(repository, client._id, 'allocate');
            if (!permResult.ok || !permResult.value) {
                throw g_lib.ERR_PERM_DENIED;
            }

            // Delete allocation
            const deleteResult = RepositoryOps.deleteAllocation(repository, req.body.subject);

            if (!deleteResult.ok) {
                throw [deleteResult.error.code, deleteResult.error.message];
            }

            res.send(deleteResult.value);
        } catch (e) {
            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().required(), "Client ID")
    .body(
        joi.object({
            repo: joi.string().required(),
            subject: joi.string().required()
        }).required(),
        "Deletion parameters"
    )
    .summary("Delete allocation from repository")
    .description("Delete allocation from repository. Returns task for Globus repos, direct result for metadata repos.");

// Additional endpoints would go here...