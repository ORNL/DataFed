"use strict";

const { expect } = require("chai");
const {
    RepositoryType,
    Result,
    ExecutionMethod,
    createRepositoryData,
    createGlobusConfig,
    createRepository,
    createAllocationResult,
} = require("../api/repository/types");

const {
    createRepositoryByType,
    getRepositoryImplementation,
    executeRepositoryOperation,
} = require("../api/repository/factory");

const { RepositoryOps } = require("../api/repository/operations");

describe("Repository Type System Tests", function () {
    describe("Types Module", function () {
        describe("RepositoryType Enum", function () {
            it("should have GLOBUS and METADATA_ONLY types", function () {
                expect(RepositoryType.GLOBUS).to.equal("globus");
                expect(RepositoryType.METADATA_ONLY).to.equal("metadata_only");
            });

            it("should be frozen (immutable)", function () {
                expect(Object.isFrozen(RepositoryType)).to.be.true;
            });
        });

        describe("Result Type", function () {
            it("should create success result with ok()", function () {
                const result = Result.ok("test value");
                expect(result.ok).to.be.true;
                expect(result.value).to.equal("test value");
                expect(result.error).to.be.undefined;
            });

            it("should create error result with err()", function () {
                const error = { code: 400, message: "Test error" };
                const result = Result.err(error);
                expect(result.ok).to.be.false;
                expect(result.error).to.deep.equal(error);
                expect(result.value).to.be.undefined;
            });
        });

        describe("createRepositoryData", function () {
            it("should create repository data with required fields", function () {
                const config = {
                    id: "test-repo",
                    type: RepositoryType.GLOBUS,
                    title: "Test Repository",
                    desc: "Test description",
                    capacity: 1000000,
                    admins: ["user1", "user2"],
                };

                const repoData = createRepositoryData(config);

                expect(repoData._key).to.equal("test-repo");
                expect(repoData._id).to.equal("repo/test-repo");
                expect(repoData.type).to.equal(RepositoryType.GLOBUS);
                expect(repoData.title).to.equal("Test Repository");
                expect(repoData.desc).to.equal("Test description");
                expect(repoData.capacity).to.equal(1000000);
                expect(repoData.admins).to.deep.equal(["user1", "user2"]);
            });

            it("should merge type-specific fields", function () {
                const typeSpecific = { endpoint: "test-endpoint", path: "/test/path" };
                const config = {
                    id: "test-repo",
                    type: RepositoryType.GLOBUS,
                    title: "Test Repository",
                    capacity: 1000000,
                    admins: ["user1"],
                    typeSpecific,
                };

                const repoData = createRepositoryData(config);

                expect(repoData.endpoint).to.equal("test-endpoint");
                expect(repoData.path).to.equal("/test/path");
            });
        });

        describe("createGlobusConfig", function () {
            it("should create Globus configuration object", function () {
                const config = {
                    endpoint: "test-endpoint",
                    path: "/test/path",
                    pub_key: "ssh-rsa test-key",
                    address: "test.example.com",
                    exp_path: "/export/path",
                    domain: "example.com",
                };

                const globusConfig = createGlobusConfig(config);

                expect(globusConfig).to.deep.equal(config);
            });
        });

        describe("createRepository", function () {
            it("should create tagged union with type and data", function () {
                const data = { _id: "repo/test", title: "Test" };
                const repo = createRepository(RepositoryType.GLOBUS, data);

                expect(repo.type).to.equal(RepositoryType.GLOBUS);
                expect(repo.data).to.deep.equal(data);
            });
        });

        describe("ExecutionMethod Enum", function () {
            it("should have TASK and DIRECT methods", function () {
                expect(ExecutionMethod.TASK).to.equal("task");
                expect(ExecutionMethod.DIRECT).to.equal("direct");
            });

            it("should be frozen (immutable)", function () {
                expect(Object.isFrozen(ExecutionMethod)).to.be.true;
            });
        });

        describe("createAllocationResult", function () {
            it("should create task-based allocation result", function () {
                const taskPayload = { task_id: "task123", status: "pending" };
                const result = createAllocationResult(ExecutionMethod.TASK, taskPayload);

                expect(result.execution_method).to.equal(ExecutionMethod.TASK);
                expect(result.task).to.deep.equal(taskPayload);
                expect(result.result).to.be.undefined;
            });

            it("should create direct allocation result", function () {
                const directPayload = { allocation_id: "alloc123", size: 1000 };
                const result = createAllocationResult(ExecutionMethod.DIRECT, directPayload);

                expect(result.execution_method).to.equal(ExecutionMethod.DIRECT);
                expect(result.result).to.deep.equal(directPayload);
                expect(result.task).to.be.undefined;
            });
        });
    });

    describe("Factory Module", function () {
        describe("createRepositoryByType", function () {
            it("should return error for missing required fields", function () {
                const result = createRepositoryByType({ type: RepositoryType.GLOBUS });
                expect(result.ok).to.be.false;
                expect(result.error.message).to.include("Missing required repository fields");
            });

            it("should return error for unknown repository type", function () {
                const config = {
                    id: "test",
                    type: "unknown",
                    title: "Test",
                    capacity: 1000,
                    admins: ["user1"],
                };
                const result = createRepositoryByType(config);
                expect(result.ok).to.be.false;
                expect(result.error.message).to.include("Unknown repository type");
            });

            it("should create GLOBUS repository with valid config", function () {
                const config = {
                    id: "test-globus",
                    type: RepositoryType.GLOBUS,
                    title: "Test Globus Repository",
                    capacity: 1000000,
                    admins: ["user1"],
                    endpoint: "test-endpoint",
                    path: "/test/path/test-globus",
                    pub_key: "ssh-rsa test",
                    address: "test.example.com",
                    domain: "example.com",
                };

                const result = createRepositoryByType(config);
                expect(result.ok).to.be.true;
                expect(result.value.type).to.equal(RepositoryType.GLOBUS);
                expect(result.value.data._id).to.equal("repo/test-globus");
                expect(result.value.data.endpoint).to.equal("test-endpoint");
            });

            it("should create METADATA_ONLY repository with valid config", function () {
                const config = {
                    id: "test-metadata",
                    type: RepositoryType.METADATA_ONLY,
                    title: "Test Metadata Repository",
                    capacity: 0,
                    admins: ["user1"],
                };

                const result = createRepositoryByType(config);
                expect(result.ok).to.be.true;
                expect(result.value.type).to.equal(RepositoryType.METADATA_ONLY);
                expect(result.value.data._id).to.equal("repo/test-metadata");
            });
        });

        describe("getRepositoryImplementation", function () {
            it("should return implementation for GLOBUS type", function () {
                const impl = getRepositoryImplementation(RepositoryType.GLOBUS);
                expect(impl).to.not.be.null;
                expect(impl).to.have.property("validate");
                expect(impl).to.have.property("createAllocation");
            });

            it("should return implementation for METADATA_ONLY type", function () {
                const impl = getRepositoryImplementation(RepositoryType.METADATA_ONLY);
                expect(impl).to.not.be.null;
                expect(impl).to.have.property("validate");
                expect(impl).to.have.property("createAllocation");
            });

            it("should return null for unknown type", function () {
                const impl = getRepositoryImplementation("unknown");
                expect(impl).to.be.null;
            });
        });

        describe("executeRepositoryOperation", function () {
            it("should return error for unknown repository type", function () {
                const repo = { type: "unknown", data: {} };
                const result = executeRepositoryOperation(repo, "validate");
                expect(result.ok).to.be.false;
                expect(result.error.message).to.include("No implementation for repository type");
            });

            it("should return error for non-existent operation", function () {
                const repo = { type: RepositoryType.GLOBUS, data: {} };
                const result = executeRepositoryOperation(repo, "nonExistentOp");
                expect(result.ok).to.be.false;
                expect(result.error.message).to.include(
                    "Operation 'nonExistentOp' not implemented",
                );
            });

            it("should execute validate operation on GLOBUS repository", function () {
                const repo = {
                    type: RepositoryType.GLOBUS,
                    data: { _id: "repo/test", type: RepositoryType.GLOBUS },
                };
                const result = executeRepositoryOperation(repo, "validate");
                expect(result.ok).to.be.true;
            });
        });
    });

    describe("Operations Module", function () {
        describe("RepositoryOps", function () {
            const testRepo = {
                type: RepositoryType.METADATA_ONLY,
                data: {
                    _id: "repo/test-ops",
                    _key: "test-ops",
                    type: RepositoryType.METADATA_ONLY,
                    title: "Test Repository",
                    capacity: 0,
                    admins: ["user1"],
                },
            };

            it("should have all required operations", function () {
                expect(RepositoryOps).to.have.property("validate");
                expect(RepositoryOps).to.have.property("createAllocation");
                expect(RepositoryOps).to.have.property("deleteAllocation");
                expect(RepositoryOps).to.have.property("supportsDataOperations");
                expect(RepositoryOps).to.have.property("getCapacityInfo");
                expect(RepositoryOps).to.have.property("save");
                expect(RepositoryOps).to.have.property("update");
                expect(RepositoryOps).to.have.property("find");
                expect(RepositoryOps).to.have.property("list");
                expect(RepositoryOps).to.have.property("checkPermission");
            });

            it("should validate repository", function () {
                const result = RepositoryOps.validate(testRepo);
                expect(result.ok).to.be.true;
            });

            it("should check repository permissions", function () {
                const result = RepositoryOps.checkPermission(testRepo, "user1", "admin");
                expect(result.ok).to.be.true;
                expect(result.value).to.be.true;

                const result2 = RepositoryOps.checkPermission(testRepo, "user2", "admin");
                expect(result2.ok).to.be.true;
                expect(result2.value).to.be.false;
            });
        });
    });

    describe("Integration Tests", function () {
        it("should create and validate a complete GLOBUS repository", function () {
            const config = {
                id: "integration-test",
                type: RepositoryType.GLOBUS,
                title: "Integration Test Repository",
                desc: "Repository for integration testing",
                capacity: 5000000,
                admins: ["admin1", "admin2"],
                endpoint: "integration-endpoint",
                path: "/data/repos/integration-test",
                pub_key: "ssh-rsa integration-key",
                address: "integration.test.com",
                domain: "test.com",
            };

            // Create repository
            const createResult = createRepositoryByType(config);
            expect(createResult.ok).to.be.true;

            const repo = createResult.value;
            expect(repo.type).to.equal(RepositoryType.GLOBUS);
            expect(repo.data._id).to.equal("repo/integration-test");

            // Validate repository
            const validateResult = RepositoryOps.validate(repo);
            expect(validateResult.ok).to.be.true;

            // Check permissions
            const permResult = RepositoryOps.checkPermission(repo, "admin1", "admin");
            expect(permResult.ok).to.be.true;
            expect(permResult.value).to.be.true;
        });
    });
});
