"use strict";

const { db: g_db } = require("@arangodb");
const { RepositoryType } = require("../../api/repository/types");

function createTestSetup() {
    const collections = [
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
    ];

    collections.forEach((coll) => {
        if (g_db._collection(coll)) {
            g_db[coll].truncate();
        }
    });

    const adminUser = g_db.u.save({
        _key: "test_admin",
        _id: "u/test_admin",
        is_admin: true,
    });

    const regularUser = g_db.u.save({
        _key: "test_user",
        _id: "u/test_user",
        is_admin: false,
    });

    const project = g_db.p.save({
        _key: "test_project",
        _id: "p/test_project",
    });

    const globusRepo = g_db.repo.save({
        _key: "test_globus_repo",
        type: RepositoryType.GLOBUS,
        title: "Test Globus Repository",
        desc: "A test repository for Globus",
        capacity: 10000000000,
        endpoint: "test-endpoint-123",
        pub_key: "ssh-rsa AAAAB3NzaC1yc2EAAAAtest...",
        address: "test.server.org",
        path: "/data/repos/test_globus_repo",
        domain: "test.org",
    });

    const metadataRepo = g_db.repo.save({
        _key: "test_metadata_repo",
        type: RepositoryType.METADATA_ONLY,
        title: "Test Metadata Repository",
        desc: "A test repository for metadata only",
        capacity: 1000000,
    });

    const legacyRepo = g_db.repo.save({
        _key: "test_legacy_repo",
        title: "Test Legacy Repository",
        desc: "A legacy repository without type field",
        capacity: 5000000000,
        endpoint: "legacy-endpoint",
        pub_key: "ssh-rsa legacy-key",
        address: "legacy.server.org",
        path: "/data/repos/test_legacy_repo",
        domain: "legacy.org",
    });

    g_db.admin.save({ _from: globusRepo._id, _to: adminUser._id });
    g_db.admin.save({ _from: metadataRepo._id, _to: adminUser._id });
    g_db.admin.save({ _from: legacyRepo._id, _to: adminUser._id });

    const regularUserRepo = g_db.repo.save({
        _key: "test_user_repo",
        type: RepositoryType.GLOBUS,
        title: "Regular User Repository",
        capacity: 1000000000,
        endpoint: "user-endpoint",
        pub_key: "ssh-rsa user-key",
        address: "user.server.org",
        path: "/data/repos/test_user_repo",
        domain: "user.org",
    });

    g_db.admin.save({ _from: regularUserRepo._id, _to: regularUser._id });

    return {
        users: {
            admin: adminUser,
            regular: regularUser,
            project: project,
        },
        repos: {
            globus: globusRepo,
            metadata: metadataRepo,
            legacy: legacyRepo,
            userRepo: regularUserRepo,
        },
    };
}

module.exports = { createTestSetup };
