"use strict";

const chai = require("chai");
const { expect } = chai;
const { Repo, PathType } = require("../api/repo");
const g_db = require("@arangodb").db;
const g_lib = require("../api/support");
const arangodb = require("@arangodb");
const { RepositoryType, Result, ExecutionMethod } = require("../api/repository/types");
const {
    validateNonEmptyString,
    validatePOSIXPath,
    validateGlobusConfig,
    validateMetadataConfig,
} = require("../api/repository/validation");
const { createRepositoryByType, executeRepositoryOperation } = require("../api/repository/factory");

const { RepositoryOps } = require("../api/repository/operations");

const {
    ValidationTestCases,
    RepositoryTestData,
    runParameterizedTest,
} = require("./test-fixtures");

const { cleanupDatabase, setupTestUsers, RepositoryBuilder } = require("./test-helpers");

const { createAPIAdapter } = require("./helpers/api-adapters");
const { createTestSetup } = require("./helpers/test-setup");

describe("Testing Repo class", () => {
    beforeEach(() => {
        g_db.d.truncate();
        g_db.alloc.truncate();
        g_db.loc.truncate();
        g_db.repo.truncate();
    });

    it("unit_repo: should throw an error if the repo does not exist", () => {
        const repo = new Repo("invalidKey");
        expect(repo.exists()).to.be.false;
        expect(repo.key()).to.equal("invalidKey");
        expect(repo.error()).to.equal(g_lib.ERR_NOT_FOUND);
    });

    it("unit_repo: should return REPO_ROOT_PATH for exact match with repo root", () => {
        const path = "/repo_root";
        g_db.repo.save({
            _id: "repo/foo",
            _key: "foo",
            path: path,
        });
        const repo = new Repo("foo");
        expect(repo.pathType(path)).to.equal(PathType.REPO_ROOT_PATH);
    });

    it("unit_repo: should return UNKNOWN for invalid path not matching repo root", () => {
        const path = "/repo_root";
        g_db.repo.save({
            _id: "repo/foo",
            _key: "foo",
            path: path,
        });
        const repo = new Repo("foo");
        expect(repo.pathType("/invalid_path")).to.equal(PathType.UNKNOWN);
    });

    it("unit_repo: should return PROJECT_PATH for valid project paths", () => {
        const path = "/repo_root";
        g_db.repo.save({
            _id: "repo/foo",
            _key: "foo",
            path: path,
        });
        const repo = new Repo("foo");
        expect(repo.pathType("/repo_root/project/bam")).to.equal(PathType.PROJECT_PATH);
    });

    it("unit_repo: should return USER_PATH for valid user paths", () => {
        const path = "/repo_root";
        g_db.repo.save({
            _id: "repo/foo",
            _key: "foo",
            path: path,
        });
        const repo = new Repo("foo");
        expect(repo.pathType("/repo_root/user/george")).to.equal(PathType.USER_PATH);
    });

    it("unit_repo: should return UNKNOWN for a path that does not start with repo root", () => {
        const path = "/repo_root";
        g_db.repo.save({
            _id: "repo/foo",
            _key: "foo",
            path: path,
        });
        const repo = new Repo("foo");
        expect(repo.pathType("/randome_string/user/george/id")).to.equal(PathType.UNKNOWN);
    });

    it("unit_repo: should trim trailing slashes from repo root path and input path", () => {
        const path = "/repo_root";
        g_db.repo.save({
            _id: "repo/foo",
            _key: "foo",
            path: path,
        });
        const repo = new Repo("foo");
        expect(repo.pathType("/repo_root/user/")).to.equal(PathType.REPO_PATH);
    });

    it("unit_repo: should handle an empty relative path correctly", () => {
        const path = "/repo_root";
        g_db.repo.save({
            _id: "repo/foo",
            _key: "foo",
            path: path,
        });
        const repo = new Repo("foo");
        expect(repo.pathType("/repo_root/")).to.equal(PathType.REPO_ROOT_PATH);
    });

    it("unit_repo: should handle an unknown path that begins with project", () => {
        const path = "/repo_root";
        g_db.repo.save({
            _id: "repo/foo",
            _key: "foo",
            path: path,
        });
        const repo = new Repo("foo");
        expect(repo.pathType("/random_string/project_bam")).to.equal(PathType.UNKNOWN);
    });

    it("unit_repo: should handle an repo base path", () => {
        const path = "/mnt/repo_root";
        g_db.repo.save({
            _id: "repo/foo",
            _key: "foo",
            path: path,
        });
        const repo = new Repo("foo");
        expect(repo.pathType("/mnt")).to.equal(PathType.REPO_BASE_PATH);
    });

    it("unit_repo: should handle an repo base path with ending /", () => {
        const path = "/mnt/repo_root";
        g_db.repo.save({
            _id: "repo/foo",
            _key: "foo",
            path: path,
        });
        const repo = new Repo("foo");
        expect(repo.pathType("/mnt/")).to.equal(PathType.REPO_BASE_PATH);
    });

    it("unit_repo: should handle an repo base path containing only /", () => {
        const path = "/mnt/repo_root";
        g_db.repo.save({
            _id: "repo/foo",
            _key: "foo",
            path: path,
        });
        const repo = new Repo("foo");
        expect(repo.pathType("/")).to.equal(PathType.REPO_BASE_PATH);
    });

    it("unit_repo: should handle an repo base path and repo root path are the same and only containing only /", () => {
        const path = "/";
        g_db.repo.save({
            _id: "repo/foo",
            _key: "foo",
            path: path,
        });
        const repo = new Repo("foo");
        expect(repo.pathType("/")).to.equal(PathType.REPO_ROOT_PATH);
    });

    it("unit_repo: should handle an repo base path containing only part of base.", () => {
        const path = "/mnt/repo_root";
        g_db.repo.save({
            _id: "repo/foo",
            _key: "foo",
            path: path,
        });
        const repo = new Repo("foo");
        expect(repo.pathType("/m")).to.equal(PathType.UNKNOWN);
    });

    it("unit_repo: should handle an repo root path containing only part of root.", () => {
        const path = "/mnt/repo_root";
        g_db.repo.save({
            _id: "repo/foo",
            _key: "foo",
            path: path,
        });
        const repo = new Repo("foo");
        expect(repo.pathType("/mnt/re")).to.equal(PathType.UNKNOWN);
    });

    it("unit_repo: should handle an repo path containing only part of project.", () => {
        const path = "/mnt/repo_root";
        g_db.repo.save({
            _id: "repo/foo",
            _key: "foo",
            path: path,
        });
        const repo = new Repo("foo");
        expect(repo.pathType("/mnt/repo_root/pro")).to.equal(PathType.UNKNOWN);
    });

    it("unit_repo: should handle an repo path containing only part of user.", () => {
        const path = "/mnt/repo_root";
        g_db.repo.save({
            _id: "repo/foo",
            _key: "foo",
            path: path,
        });
        const repo = new Repo("foo");
        expect(repo.pathType("/mnt/repo_root/us")).to.equal(PathType.UNKNOWN);
    });

    it("unit_repo: should handle a project record path.", () => {
        const path = "/mnt/repo_root";
        g_db.repo.save({
            _id: "repo/foo",
            _key: "foo",
            path: path,
        });
        const repo = new Repo("foo");
        expect(repo.pathType("/mnt/repo_root/project/bam/4243")).to.equal(
            PathType.PROJECT_RECORD_PATH,
        );
    });

    it("unit_repo: should handle a user record path.", () => {
        const path = "/mnt/repo_root";
        g_db.repo.save({
            _id: "repo/foo",
            _key: "foo",
            path: path,
        });
        const repo = new Repo("foo");
        expect(repo.pathType("/mnt/repo_root/user/jane/4243")).to.equal(PathType.USER_RECORD_PATH);
    });

    it("unit_repo: should handle a user record path.", () => {
        const path = "/mnt/datafed/compose-home/";
        g_db.repo.save({
            _id: "repo/foo",
            _key: "foo",
            path: path,
        });
        const repo = new Repo("foo");
        expect(repo.pathType("/mnt/datafed/compose-home/user/tim/1135")).to.equal(
            PathType.USER_RECORD_PATH,
        );
    });
});

describe("Repository Tests", () => {
    describe("Legacy Repo Class", () => {
        beforeEach(() => {
            ["d", "alloc", "loc", "repo"].forEach((coll) => {
                if (g_db._collection(coll)) g_db[coll].truncate();
            });
        });

        it("should throw an error if the repo does not exist", () => {
            const repo = new Repo("invalidKey");
            expect(repo.exists()).to.be.false;
            expect(repo.key()).to.equal("invalidKey");
            expect(repo.error()).to.equal(g_lib.ERR_NOT_FOUND);
        });

        it("should integrate with new repository type system", () => {
            const createResult = createRepositoryByType({
                id: "legacy_compat",
                type: RepositoryType.METADATA_ONLY,
                title: "Legacy Compatible",
                capacity: 1000000,
                admins: ["u/admin"],
            });

            RepositoryOps.save(createResult.value);

            const legacyRepo = new Repo("legacy_compat");
            expect(legacyRepo.exists()).to.be.true;
            expect(legacyRepo.key()).to.equal("legacy_compat");
            expect(legacyRepo.id()).to.equal("repo/legacy_compat");

            const newRepo = legacyRepo.getRepository();
            expect(newRepo).to.not.be.null;
            expect(newRepo.type).to.equal(RepositoryType.METADATA_ONLY);
        });

        describe("Path Type Detection", () => {
            beforeEach(() => {
                g_db.repo.save({
                    _key: "path_test",
                    path: "/mnt/repo_root",
                });
            });

            const pathTests = [
                { path: "/mnt/repo_root", expected: PathType.REPO_ROOT_PATH },
                {
                    path: "/mnt/repo_root/",
                    expected: PathType.REPO_ROOT_PATH,
                },
                { path: "/mnt", expected: PathType.REPO_BASE_PATH },
                {
                    path: "/mnt/",
                    expected: PathType.REPO_BASE_PATH,
                },
                { path: "/", expected: PathType.REPO_BASE_PATH },
                {
                    path: "/mnt/repo_root/project/bam",
                    expected: PathType.PROJECT_PATH,
                },
                {
                    path: "/mnt/repo_root/user/george",
                    expected: PathType.USER_PATH,
                },
                {
                    path: "/mnt/repo_root/project/bam/4243",
                    expected: PathType.PROJECT_RECORD_PATH,
                },
                { path: "/mnt/repo_root/user/jane/4243", expected: PathType.USER_RECORD_PATH },
                {
                    path: "/invalid_path",
                    expected: PathType.UNKNOWN,
                },
                { path: "/mnt/re", expected: PathType.UNKNOWN },
                { path: "/m", expected: PathType.UNKNOWN },
            ];

            runParameterizedTest(pathTests, (test) => {
                const repo = new Repo("path_test");
                expect(repo.pathType(test.path)).to.equal(test.expected);
            });
        });
    });

    describe("Repository API Routers", () => {
        describe("Legacy-Specific Endpoints", () => {
            let setup, apiAdapter;

            beforeEach(() => {
                setup = createTestSetup();
                apiAdapter = createAPIAdapter("legacy");
            });

            it("lists allocations by repository", () => {
                g_db.alloc.save({
                    _from: setup.users.regular._id,
                    _to: setup.repos.globus._id,
                    data_limit: 1000000000,
                    data_size: 0,
                    rec_limit: 1000,
                    rec_count: 0,
                });

                const response = apiAdapter.listAllocationsByRepo(
                    setup.repos.globus._id,
                    setup.users.admin._key,
                );

                expect(response.status).to.equal(200);
                expect(response.json).to.be.an("array");
            });

            it("calculates repository size", () => {
                const dataset = g_db.d.save({
                    _key: "size_test",
                    size: 1000000,
                });

                g_db.loc.save({
                    _from: dataset._id,
                    _to: setup.repos.globus._id,
                    uid: setup.users.admin._id,
                });

                const response = apiAdapter.calculateSize(
                    dataset._id,
                    false,
                    setup.users.admin._key,
                );

                expect(response.status).to.equal(200);
                expect(response.json).to.be.an("array");
            });

            it("deletes repository with dependency checks", () => {
                const response = apiAdapter.deleteRepository(
                    setup.repos.metadata._id,
                    setup.users.admin._key,
                );

                expect(response.status).to.equal(204);
            });
        });

        describe("New API-Specific Features", () => {
            let setup, apiAdapter;

            beforeEach(() => {
                setup = createTestSetup();
                apiAdapter = createAPIAdapter("new");
            });

            it("creates repository with comprehensive validation", () => {
                const globusRepo = RepositoryBuilder.globus().withId("new_api_repo").build();

                const response = apiAdapter.createRepository(setup.users.admin._key, globusRepo);

                expect(response.status).to.equal(200);
                expect(response.json.type).to.equal(RepositoryType.GLOBUS);
            });

            it("validates repository type constraints", () => {
                const invalidRepo = {
                    ...RepositoryBuilder.metadata().build(),
                    pub_key: "should-not-be-here",
                };

                const response = apiAdapter.createRepository(setup.users.admin._key, invalidRepo);

                expect(response.status).to.equal(400);
                expect(response.json.errorMessage).to.include("should not have");
            });
        });
    });

    describe("Integration Scenarios", () => {
        beforeEach(() => {
            cleanupDatabase();
            setupTestUsers();
        });

        it("completes full repository lifecycle", () => {
            const createResult = createRepositoryByType({
                id: "lifecycle_test",
                type: RepositoryType.GLOBUS,
                title: "Lifecycle Test",
                capacity: 5000000000,
                admins: ["u/test_admin"],
                pub_key: "ssh-rsa lifecycle...",
                address: "lifecycle.test.org",
                endpoint: "lifecycle-ep",
                path: "/data/lifecycle_test",
                domain: "test.org",
            });

            expect(createResult.ok).to.be.true;

            const saveResult = RepositoryOps.save(createResult.value);
            expect(saveResult.ok).to.be.true;

            const findResult = RepositoryOps.find("lifecycle_test");
            expect(findResult.ok).to.be.true;

            const legacyRepo = new Repo("lifecycle_test");
            expect(legacyRepo.exists()).to.be.true;
            expect(legacyRepo.pathType("/data/lifecycle_test")).to.equal(PathType.REPO_ROOT_PATH);

            const allocResult = RepositoryOps.createAllocation(findResult.value, {
                subject: "d/lifecycle_dataset",
                size: 1000000000,
                path: "/data/lifecycle_test/dataset1",
            });

            expect(allocResult.ok).to.be.true;
            expect(allocResult.value.execution_method).to.equal(ExecutionMethod.TASK);
        });

        it("handles type migration scenarios", () => {
            const createResult = createRepositoryByType({
                id: "migration_test",
                type: RepositoryType.METADATA_ONLY,
                title: "Migration Test",
                capacity: 1000000,
                admins: ["u/test_admin"],
            });

            RepositoryOps.save(createResult.value);

            g_db.repo.update("migration_test", {
                type: RepositoryType.GLOBUS,
                endpoint: "migrated-ep",
                pub_key: "migrated-key",
                address: "migrated.server",
                path: "/data/migration_test",
                domain: "migrated.org",
            });

            const findResult = RepositoryOps.find("migration_test");
            expect(findResult.ok).to.be.true;
            expect(findResult.value.type).to.equal(RepositoryType.GLOBUS);

            const dataOpsResult = RepositoryOps.supportsDataOperations(findResult.value);
            expect(dataOpsResult.value).to.be.true;
        });
    });
});
