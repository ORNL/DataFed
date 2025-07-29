"use strict";

const chai = require("chai");
const { expect } = chai;
const { db: g_db } = require("@arangodb");
const g_lib = require("../api/support");
const { Repo, PathType } = require("../api/repo");

const {
    RepositoryType,
    Result,
    ExecutionMethod,
} = require("../api/repository/types");

const {
    validateNonEmptyString,
    validatePOSIXPath,
    validateGlobusConfig,
    validateMetadataConfig,
} = require("../api/repository/validation");

const {
    createRepositoryByType,
    executeRepositoryOperation,
} = require("../api/repository/factory");

const { RepositoryOps } = require("../api/repository/operations");

const {
    ValidationTestCases,
    RepositoryTestData,
    runParameterizedTest,
} = require("./test-fixtures");

const {
    cleanupDatabase,
    setupTestUsers,
    RepositoryBuilder,
} = require("./test-helpers");

const { createAPIAdapter } = require("./helpers/api-adapters");
const { createTestSetup } = require("./helpers/test-setup");

describe("Repository Tests", () => {
    describe("Legacy Repo Class", () => {
        beforeEach(() => {
            ["d", "alloc", "loc", "repo"].forEach(coll => {
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
                { path: "/mnt/repo_root/", expected: PathType.REPO_ROOT_PATH },
                { path: "/mnt", expected: PathType.REPO_BASE_PATH },
                { path: "/mnt/", expected: PathType.REPO_BASE_PATH },
                { path: "/", expected: PathType.REPO_BASE_PATH },
                { path: "/mnt/repo_root/project/bam", expected: PathType.PROJECT_PATH },
                { path: "/mnt/repo_root/user/george", expected: PathType.USER_PATH },
                { path: "/mnt/repo_root/project/bam/4243", expected: PathType.PROJECT_RECORD_PATH },
                { path: "/mnt/repo_root/user/jane/4243", expected: PathType.USER_RECORD_PATH },
                { path: "/invalid_path", expected: PathType.UNKNOWN },
                { path: "/mnt/re", expected: PathType.UNKNOWN },
                { path: "/m", expected: PathType.UNKNOWN },
            ];

            runParameterizedTest(pathTests, (test) => {
                const repo = new Repo("path_test");
                expect(repo.pathType(test.path)).to.equal(test.expected);
            });
        });
    });

    describe("Repository Type System", () => {
        beforeEach(() => {
            cleanupDatabase();
        });

        describe("Type Definitions", () => {
            it("has correct enum values and immutability", () => {
                expect(RepositoryType.GLOBUS).to.equal("globus");
                expect(RepositoryType.METADATA_ONLY).to.equal("metadata_only");
                expect(Object.keys(RepositoryType).length).to.equal(2);
                
                expect(() => { RepositoryType.NEW_TYPE = "new"; }).to.throw();
                expect(() => { RepositoryType.GLOBUS = "modified"; }).to.throw();
                
                expect(ExecutionMethod.TASK).to.equal("task");
                expect(ExecutionMethod.DIRECT).to.equal("direct");
            });

            it("Result type handles success and error cases", () => {
                const success = Result.ok("value");
                expect(success.ok).to.be.true;
                expect(success.value).to.equal("value");
                expect(success.error).to.be.undefined;

                const error = Result.err({ code: 404, message: "Not found" });
                expect(error.ok).to.be.false;
                expect(error.error).to.deep.equal({ code: 404, message: "Not found" });
                expect(error.value).to.be.undefined;
            });
        });

        describe("Untested Core Functions", () => {
            const {
                createRepositoryData,
                createGlobusConfig,
                createRepository,
                createAllocationResult,
            } = require("../api/repository/types");

            const {
                validateCommonFields,
                validateRepositoryPath,
                validateAllocationParams,
            } = require("../api/repository/validation");

            const {
                getRepositoryImplementation,
            } = require("../api/repository/factory");

            it("createRepositoryData creates proper data structures", () => {
                const data = createRepositoryData({
                    id: "test_repo",
                    type: RepositoryType.GLOBUS,
                    title: "Test Repository",
                    desc: "Description",
                    capacity: 1000000,
                    admins: ["u/admin1"],
                    typeSpecific: { endpoint: "ep1" },
                });

                expect(data._key).to.equal("test_repo");
                expect(data._id).to.equal("repo/test_repo");
                expect(data.type).to.equal("globus");
                expect(data.endpoint).to.equal("ep1");
            });

            it("createGlobusConfig creates Globus configuration", () => {
                const config = createGlobusConfig({
                    pub_key: "test-key",
                    address: "test.server",
                    endpoint: "ep123",
                    path: "/data/test",
                    domain: "test.org",
                });

                expect(config.pub_key).to.equal("test-key");
                expect(config.address).to.equal("test.server");
                expect(config.endpoint).to.equal("ep123");
                expect(config.path).to.equal("/data/test");
                expect(config.domain).to.equal("test.org");
            });

            it("createRepository creates repository objects", () => {
                const repo = createRepository(RepositoryType.GLOBUS, {
                    _id: "repo/test",
                    type: RepositoryType.GLOBUS,
                    title: "Test",
                });

                expect(repo.type).to.equal(RepositoryType.GLOBUS);
                expect(repo.data._id).to.equal("repo/test");
            });

            it("createAllocationResult creates allocation results", () => {
                const taskResult = createAllocationResult(ExecutionMethod.TASK, { task_id: "123" });
                expect(taskResult.execution_method).to.equal("task");
                expect(taskResult.task.task_id).to.equal("123");
                expect(taskResult.result).to.be.undefined;

                const directResult = createAllocationResult(ExecutionMethod.DIRECT, null, { status: "completed" });
                expect(directResult.execution_method).to.equal("direct");
                expect(directResult.result.status).to.equal("completed");
                expect(directResult.task).to.be.undefined;
            });

            it("validateCommonFields validates repository common fields", () => {
                const validConfig = {
                    id: "test",
                    title: "Test Repository",
                    capacity: 1000000,
                    admins: ["u/admin"],
                };
                
                const result = validateCommonFields(validConfig);
                expect(result.ok).to.be.true;

                const invalidConfig = {
                    id: "test",
                    title: "",
                    capacity: -100,
                    admins: [],
                };
                
                const invalidResult = validateCommonFields(invalidConfig);
                expect(invalidResult.ok).to.be.false;
            });

            it("validateRepositoryPath validates path ends with ID", () => {
                const valid = validateRepositoryPath("/data/repos/myrepo", "myrepo");
                expect(valid.ok).to.be.true;

                const invalid = validateRepositoryPath("/data/repos/other", "myrepo");
                expect(invalid.ok).to.be.false;
                expect(invalid.error.message).to.include("must end with repository ID");
            });

            it("validateAllocationParams validates allocation parameters", () => {
                const validParams = {
                    subject: "d/dataset1",
                    size: 1000000,
                };
                
                const result = validateAllocationParams(validParams);
                expect(result.ok).to.be.true;

                const invalidParams = {
                    subject: "",
                    size: -1000,
                };
                
                const invalidResult = validateAllocationParams(invalidParams);
                expect(invalidResult.ok).to.be.false;
            });

            it("getRepositoryImplementation returns correct implementations", () => {
                const globusImpl = getRepositoryImplementation(RepositoryType.GLOBUS);
                const metadataImpl = getRepositoryImplementation(RepositoryType.METADATA_ONLY);
                const unknownImpl = getRepositoryImplementation("unknown");

                expect(globusImpl).to.not.be.null;
                expect(metadataImpl).to.not.be.null;
                expect(unknownImpl).to.be.null;
            });
        });

        describe("Validation", () => {
            describe("String validation", () => {
                runParameterizedTest(ValidationTestCases.strings, (testCase) => {
                    const result = validateNonEmptyString(testCase.input, "Test field");
                    expect(result.ok).to.equal(testCase.expected);
                    if (!testCase.expected && testCase.error) {
                        expect(result.error.message).to.include(testCase.error);
                    }
                });
            });

            describe("Path validation", () => {
                runParameterizedTest(ValidationTestCases.paths, (testCase) => {
                    const result = validatePOSIXPath(testCase.input, "Test path");
                    expect(result.ok).to.equal(testCase.expected);
                    if (!testCase.expected && testCase.error) {
                        expect(result.error.message).to.include(testCase.error);
                    }
                });
            });

            describe("Repository configuration validation", () => {
                runParameterizedTest(RepositoryTestData.globusConfigs, (testCase) => {
                    const result = validateGlobusConfig(testCase.config);
                    expect(result.ok).to.equal(testCase.valid);
                    if (!testCase.valid && testCase.error) {
                        expect(result.error.message).to.include(testCase.error);
                    }
                });

                runParameterizedTest(RepositoryTestData.metadataConfigs, (testCase) => {
                    const result = validateMetadataConfig(testCase.config);
                    expect(result.ok).to.equal(testCase.valid);
                    if (!testCase.valid && testCase.error) {
                        expect(result.error.message).to.include(testCase.error);
                    }
                });
            });
        });

        describe("Repository Operations", () => {
            let testRepo;

            beforeEach(() => {
                testRepo = g_db.repo.save({
                    _key: "test_repo",
                    type: RepositoryType.GLOBUS,
                    title: "Test Repository",
                    capacity: 1000000,
                    admins: ["u/admin1"],
                    endpoint: "ep123",
                    path: "/data/test_repo",
                });
            });

            it("creates repositories by type", () => {
                const globusResult = createRepositoryByType(RepositoryTestData.globusConfigs[0].config);
                expect(globusResult.ok).to.be.true;
                expect(globusResult.value.type).to.equal(RepositoryType.GLOBUS);

                const metadataResult = createRepositoryByType(RepositoryTestData.metadataConfigs[0].config);
                expect(metadataResult.ok).to.be.true;
                expect(metadataResult.value.type).to.equal(RepositoryType.METADATA_ONLY);
            });

            it("executes operations on repositories", () => {
                const globusRepo = { type: RepositoryType.GLOBUS, data: { _id: "repo/test" } };
                const metadataRepo = { type: RepositoryType.METADATA_ONLY, data: { _id: "repo/test" } };

                const globusOps = executeRepositoryOperation(globusRepo, "supportsDataOperations");
                expect(globusOps.ok).to.be.true;
                expect(globusOps.value).to.be.true;

                const metadataOps = executeRepositoryOperation(metadataRepo, "supportsDataOperations");
                expect(metadataOps.ok).to.be.true;
                expect(metadataOps.value).to.be.false;
            });

            it("handles different behavior for repository types", () => {
                const globusRepo = RepositoryOps.find("test_repo").value;
                
                expect(RepositoryOps.supportsDataOperations(globusRepo).value).to.be.true;
                
                const allocResult = RepositoryOps.createAllocation(globusRepo, {
                    subject: "d/test",
                    size: 1000,
                });
                
                expect(allocResult.ok).to.be.true;
                expect(allocResult.value.execution_method).to.equal(ExecutionMethod.TASK);
            });
        });

        describe("Implementation Modules", () => {
            const globusImpl = require("../api/repository/globus");
            const metadataImpl = require("../api/repository/metadata");

            it("Globus implementation supports data operations", () => {
                const repoData = { _id: "repo/globus1", capacity: 1000000000 };
                
                expect(globusImpl.supportsDataOperations(repoData).value).to.be.true;
                expect(globusImpl.getCapacityInfo(repoData).value.supports_quotas).to.be.true;
                
                const allocResult = globusImpl.createAllocation(repoData, {
                    subject: "d/dataset1",
                    size: 1000000,
                    path: "/data/alloc1",
                });
                expect(allocResult.ok).to.be.true;
                expect(allocResult.value.execution_method).to.equal(ExecutionMethod.TASK);

                const deleteResult = globusImpl.deleteAllocation(repoData, null);
                expect(deleteResult.ok).to.be.false;
                expect(deleteResult.error.message).to.include("Subject ID is required");
            });

            it("Metadata implementation does not support data operations", () => {
                const repoData = { _id: "repo/meta1", capacity: 1000000 };
                
                expect(metadataImpl.supportsDataOperations(repoData).value).to.be.false;
                expect(metadataImpl.getCapacityInfo(repoData).value.is_metadata_only).to.be.true;
                
                const allocResult = metadataImpl.createAllocation(repoData, {
                    subject: "d/dataset1",
                    size: 1000,
                });
                expect(allocResult.ok).to.be.true;
                expect(allocResult.value.execution_method).to.equal(ExecutionMethod.DIRECT);
                expect(allocResult.value.result.status).to.equal("completed");
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
                    setup.users.admin._key
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
                    setup.users.admin._key
                );

                expect(response.status).to.equal(200);
                expect(response.json).to.be.an("array");
            });

            it("deletes repository with dependency checks", () => {
                const response = apiAdapter.deleteRepository(
                    setup.repos.metadata._id,
                    setup.users.admin._key
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
                const globusRepo = RepositoryBuilder.globus()
                    .withId("new_api_repo")
                    .build();
                
                const response = apiAdapter.createRepository(
                    setup.users.admin._key,
                    globusRepo
                );

                expect(response.status).to.equal(200);
                expect(response.json.type).to.equal(RepositoryType.GLOBUS);
            });

            it("validates repository type constraints", () => {
                const invalidRepo = {
                    ...RepositoryBuilder.metadata().build(),
                    pub_key: "should-not-be-here",
                };

                const response = apiAdapter.createRepository(
                    setup.users.admin._key,
                    invalidRepo
                );

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