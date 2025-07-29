"use strict";

const { db: g_db } = require("@arangodb");
const request = require("@arangodb/request");
const { baseUrl } = module.context;
const { RepositoryType } = require("../api/repository/types");

const TestUsers = {
    admin: {
        _key: "test_admin",
        _id: "u/test_admin",
        is_admin: true,
    },
    regular: {
        _key: "test_user",
        _id: "u/test_user",
        is_admin: false,
    },
};

const TestRepositories = {
    globus: (overrides = {}) => ({
        id: "test_globus_repo",
        type: RepositoryType.GLOBUS,
        title: "Test Globus Repository",
        desc: "A test repository for Globus",
        capacity: 1000000000,
        admins: ["u/test_admin"],
        pub_key: "ssh-rsa AAAAB3NzaC1yc2EAAAAtest...",
        address: "test.server.org",
        endpoint: "test-endpoint-123",
        path: "/data/repos/test_globus_repo",
        domain: "test.org",
        ...overrides,
    }),

    metadata: (overrides = {}) => ({
        id: "test_metadata_repo",
        type: RepositoryType.METADATA_ONLY,
        title: "Test Metadata Repository",
        desc: "A test repository for metadata only",
        capacity: 1000000,
        admins: ["u/test_admin"],
        ...overrides,
    }),
};

const cleanupDatabase = (
    collections = [
        "repo",
        "admin",
        "alloc",
        "task",
        "u",
        "d",
        "p",
        "uuid",
        "accn",
        "lock",
        "block",
        "loc",
        "owner",
    ],
) => {
    collections.forEach((coll) => {
        if (g_db._collection(coll)) {
            g_db[coll].truncate();
        }
    });
};

const setupTestUsers = () => {
    g_db.u.save(TestUsers.admin);
    g_db.u.save(TestUsers.regular);
};

const createRepository = (repoData) => {
    const saved = g_db.repo.save(repoData);
    if (repoData.admins) {
        repoData.admins.forEach((admin) => {
            g_db.admin.save({ _from: saved._id, _to: admin });
        });
    }
    return saved;
};

const httpRequest = {
    post: (path, clientKey, body) => {
        return request.post(`${baseUrl}${path}?client=${clientKey}`, {
            json: true,
            body: body,
        });
    },

    get: (path, queryParams = {}) => {
        const queryString = Object.entries(queryParams)
            .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
            .join("&");
        const url = queryString ? `${baseUrl}${path}?${queryString}` : `${baseUrl}${path}`;
        return request.get(url);
    },
};

const expectError = (response, statusCode, errorNum = null, errorMessageContains = null) => {
    const { expect } = require("chai");
    expect(response.status).to.equal(statusCode);
    if (errorNum !== null) {
        expect(response.json.errorNum).to.equal(errorNum);
    }
    if (errorMessageContains !== null) {
        expect(response.json.errorMessage).to.include(errorMessageContains);
    }
};

const expectSuccess = (response, validateJson = null) => {
    const { expect } = require("chai");
    expect(response.status).to.equal(200);
    expect(response.json).to.exist;
    if (validateJson) {
        validateJson(response.json);
    }
};

const RepositoryBuilder = {
    globus: () => {
        let config = { ...TestRepositories.globus() };
        return {
            withId: function (id) {
                config.id = id;
                config.path = `/data/repos/${id}`;
                return this;
            },
            withTitle: function (title) {
                config.title = title;
                return this;
            },
            withCapacity: function (capacity) {
                config.capacity = capacity;
                return this;
            },
            withAdmins: function (admins) {
                config.admins = admins;
                return this;
            },
            build: function () {
                return config;
            },
        };
    },

    metadata: () => {
        let config = { ...TestRepositories.metadata() };
        return {
            withId: function (id) {
                config.id = id;
                return this;
            },
            withTitle: function (title) {
                config.title = title;
                return this;
            },
            withCapacity: function (capacity) {
                config.capacity = capacity;
                return this;
            },
            withAdmins: function (admins) {
                config.admins = admins;
                return this;
            },
            build: function () {
                return config;
            },
        };
    },
};

module.exports = {
    TestUsers,
    TestRepositories,
    cleanupDatabase,
    setupTestUsers,
    createRepository,
    httpRequest,
    expectError,
    expectSuccess,
    RepositoryBuilder,
};
