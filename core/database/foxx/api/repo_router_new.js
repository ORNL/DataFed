"use strict";

const createRouter = require("@arangodb/foxx/router");
const router = createRouter();
const joi = require("joi");
const { db: g_db } = require("@arangodb");
const g_lib = require("./support");
const { RepositoryType } = require("./repository/types");
const { createRepositoryByType } = require("./repository/factory");
const { RepositoryOps } = require("./repository/operations");

module.exports = router;

// Helper to clean repository data
const cleanRepoData = (repo) => {
    const { _id, _key, _rev, ...data } = repo.data;
    return { ...data, id: _id };
};

// List repositories
router
    .get("/list", (req, res) => {
        const client = req.queryParams.client
            ? g_lib.getUserFromClientID(req.queryParams.client)
            : null;

        if (req.queryParams.all && client && !client.is_admin) {
            throw g_lib.ERR_PERM_DENIED;
        }

        const filter = {
            ...(req.queryParams.type && { type: req.queryParams.type }),
            ...(!req.queryParams.all && client && { admin: client._id }),
        };

        const listResult = RepositoryOps.list(filter);
        if (!listResult.ok) throw [listResult.error.code, listResult.error.message];

        res.send(listResult.value.map(cleanRepoData));
    })
    .queryParam("client", joi.string().allow("").optional(), "Client ID")
    .queryParam("details", joi.boolean().optional(), "Show additional record details")
    .queryParam("all", joi.boolean().optional(), "List all repos (requires admin)")
    .queryParam(
        "type",
        joi.string().valid("globus", "metadata_only").optional(),
        "Filter by repository type",
    )
    .summary("List repositories")
    .description("List repositories administered by the client.");

// View repository
router
    .get("/view", (req, res) => {
        try {
            const findResult = RepositoryOps.find(req.queryParams.id);
            if (!findResult.ok) throw [findResult.error.code, findResult.error.message];

            const repo = cleanRepoData(findResult.value);
            repo.admins = g_db.admin
                .byExample({ _from: repo.id })
                .toArray()
                .map((admin) => admin._to);

            res.send([repo]);
        } catch (e) {
            g_lib.handleException(e, res);
        }
    })
    .queryParam("id", joi.string().required(), "Repository ID")
    .summary("View repository")
    .description("View repository details.");

// Create repository
router
    .post("/create", (req, res) => {
        try {
            g_db._executeTransaction({
                collections: { read: ["u"], write: ["repo", "admin"] },
                action: () => {
                    const client = g_lib.getUserFromClientID(req.queryParams.client);
                    if (!client.is_admin) throw g_lib.ERR_PERM_DENIED;

                    const config = {
                        ...req.body,
                        ...(req.body.type === RepositoryType.GLOBUS && {
                            pub_key: req.body.pub_key,
                            address: req.body.address,
                            endpoint: req.body.endpoint,
                            path: req.body.path,
                            exp_path: req.body.exp_path,
                            domain: req.body.domain,
                        }),
                    };

                    const createResult = createRepositoryByType(config);
                    if (!createResult.ok)
                        throw [createResult.error.code, createResult.error.message];

                    const repository = createResult.value;

                    req.body.admins.forEach((admin) => {
                        if (!g_db._exists(admin))
                            throw [g_lib.ERR_NOT_FOUND, `User ${admin} not found`];
                    });

                    const saveResult = RepositoryOps.save(repository);
                    if (!saveResult.ok) throw [saveResult.error.code, saveResult.error.message];

                    const saved = saveResult.value;
                    req.body.admins.forEach((admin) =>
                        g_db.admin.save({ _from: saved._id, _to: admin }),
                    );

                    res.send([cleanRepoData(saved)]);
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
                type: joi.string().valid("globus", "metadata_only").required(),
                title: joi.string().required(),
                desc: joi.string().optional(),
                capacity: joi.number().integer().min(1).required(),
                admins: joi.array().items(joi.string()).required(),
                // Globus-specific fields
                pub_key: joi.string().when("type", { is: "globus", then: joi.required() }),
                address: joi.string().when("type", { is: "globus", then: joi.required() }),
                endpoint: joi.string().when("type", { is: "globus", then: joi.required() }),
                path: joi.string().when("type", { is: "globus", then: joi.required() }),
                exp_path: joi.string().optional(),
                domain: joi.string().when("type", { is: "globus", then: joi.required() }),
            })
            .required(),
        "Repository fields",
    )
    .summary("Create repository")
    .description("Create a new repository.");

// Update repository
router
    .post("/update", (req, res) => {
        try {
            g_db._executeTransaction({
                collections: { read: ["u", "repo"], write: ["repo", "admin"] },
                action: () => {
                    const client = g_lib.getUserFromClientID(req.queryParams.client);
                    if (!client.is_admin) throw g_lib.ERR_PERM_DENIED;

                    const findResult = RepositoryOps.find(req.body.id);
                    if (!findResult.ok) throw [findResult.error.code, findResult.error.message];

                    const repository = findResult.value;
                    const updates = {};

                    ["title", "desc", "capacity"].forEach((field) => {
                        g_lib.procInputParam(req.body, field, true, updates);
                    });

                    // Type-specific updates
                    if (repository.type === RepositoryType.GLOBUS) {
                        g_lib.procInputParam(req.body, "pub_key", true, updates);
                        g_lib.procInputParam(req.body, "address", true, updates);
                        g_lib.procInputParam(req.body, "exp_path", true, updates);
                    }

                    const updateResult = RepositoryOps.update(repository, updates);
                    if (!updateResult.ok)
                        throw [updateResult.error.code, updateResult.error.message];

                    // Handle admin updates if provided
                    if (req.body.admins) {
                        // Remove old admins
                        g_db.admin.removeByExample({ _from: repository._id });
                        // Add new admins
                        req.body.admins.forEach((admin) => {
                            if (!g_db._exists(admin))
                                throw [g_lib.ERR_NOT_FOUND, `User ${admin} not found`];
                            g_db.admin.save({ _from: repository._id, _to: admin });
                        });
                    }

                    res.send([cleanRepoData(updateResult.value)]);
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
        "Repository update fields",
    )
    .summary("Update repository")
    .description("Update an existing repository.");

// Allocation endpoints
router
    .post("/alloc/create", (req, res) => {
        try {
            const findResult = RepositoryOps.find(req.body.repo);
            if (!findResult.ok) throw [findResult.error.code, findResult.error.message];

            const repository = findResult.value;
            const client = g_lib.getUserFromClientID(req.queryParams.client);

            const permResult = RepositoryOps.checkPermission(repository, client._id, "allocate");
            if (!permResult.ok || !permResult.value) throw g_lib.ERR_PERM_DENIED;

            const allocResult = RepositoryOps.createAllocation(repository, req.body);
            if (!allocResult.ok) throw [allocResult.error.code, allocResult.error.message];

            res.send(allocResult.value);
        } catch (e) {
            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().required(), "Client ID")
    .body(
        joi
            .object({
                repo: joi.string().required(),
                subject: joi.string().required(),
                size: joi.number().integer().min(1).required(),
                path: joi.string().optional(),
                metadata: joi.object().optional(),
            })
            .required(),
        "Allocation parameters",
    )
    .summary("Create allocation")
    .description("Create an allocation in a repository.");

router
    .post("/alloc/delete", (req, res) => {
        try {
            const findResult = RepositoryOps.find(req.body.repo);
            if (!findResult.ok) throw [findResult.error.code, findResult.error.message];

            const repository = findResult.value;
            const client = g_lib.getUserFromClientID(req.queryParams.client);

            const permResult = RepositoryOps.checkPermission(repository, client._id, "allocate");
            if (!permResult.ok || !permResult.value) throw g_lib.ERR_PERM_DENIED;

            const deleteResult = RepositoryOps.deleteAllocation(repository, req.body.subject);
            if (!deleteResult.ok) throw [deleteResult.error.code, deleteResult.error.message];

            res.send(deleteResult.value);
        } catch (e) {
            g_lib.handleException(e, res);
        }
    })
    .queryParam("client", joi.string().required(), "Client ID")
    .body(
        joi
            .object({
                repo: joi.string().required(),
                subject: joi.string().required(),
            })
            .required(),
        "Deletion parameters",
    )
    .summary("Delete allocation")
    .description("Delete an allocation from a repository.");
