"use strict";

const chai = require("chai");
const { expect } = chai;
const g_db = require("@arangodb").db;
const g_lib = require("../api/support");

// Import all modules to test
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
    validateNonEmptyString,
    validateCommonFields,
    validatePOSIXPath,
    validateRepositoryPath,
    validateGlobusConfig,
    validateMetadataConfig,
    validateAllocationParams,
} = require("../api/repository/validation");

const {
    createRepositoryByType,
    getRepositoryImplementation,
    executeRepositoryOperation,
} = require("../api/repository/factory");

const { RepositoryOps } = require("../api/repository/operations");
const globusImpl = require("../api/repository/globus");
const metadataImpl = require("../api/repository/metadata");

describe("Repository Type System Tests", () => {
    // Clean up database before each test
    beforeEach(() => {
        if (g_db._collection("repo")) g_db.repo.truncate();
        if (g_db._collection("alloc")) g_db.alloc.truncate();
        if (g_db._collection("task")) g_db.task.truncate();
        if (g_db._collection("test_allocations")) {
            g_db._drop("test_allocations");
        }
    });

    describe("Types Module", () => {
        it("unit_types: RepositoryType enum should have correct values", () => {
            expect(RepositoryType.GLOBUS).to.equal("globus");
            expect(RepositoryType.METADATA_ONLY).to.equal("metadata_only");
            expect(Object.keys(RepositoryType).length).to.equal(2);
        });

        it("unit_types: RepositoryType enum should be immutable", () => {
            expect(() => {
                RepositoryType.NEW_TYPE = "new";
            }).to.throw();
            expect(() => {
                RepositoryType.GLOBUS = "modified";
            }).to.throw();
        });

        it("unit_types: Result type should create ok results", () => {
            const result = Result.ok("success");
            expect(result.ok).to.be.true;
            expect(result.value).to.equal("success");
            expect(result.error).to.be.undefined;
        });

        it("unit_types: Result type should create error results", () => {
            const error = { code: 404, message: "Not found" };
            const result = Result.err(error);
            expect(result.ok).to.be.false;
            expect(result.error).to.deep.equal(error);
            expect(result.value).to.be.undefined;
        });

        it("unit_types: ExecutionMethod enum should have correct values", () => {
            expect(ExecutionMethod.TASK).to.equal("task");
            expect(ExecutionMethod.DIRECT).to.equal("direct");
        });

        it("unit_types: createRepositoryData should create proper structure", () => {
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
            expect(data.title).to.equal("Test Repository");
            expect(data.capacity).to.equal(1000000);
            expect(data.admins).to.deep.equal(["u/admin1"]);
            expect(data.endpoint).to.equal("ep1");
        });

        it("unit_types: createGlobusConfig should create proper config", () => {
            const config = createGlobusConfig({
                endpoint: "ep123",
                path: "/data/repo",
                pub_key: "ssh-rsa...",
                address: "server.org",
                exp_path: "/export",
                domain: "org",
            });

            expect(config.endpoint).to.equal("ep123");
            expect(config.path).to.equal("/data/repo");
            expect(config.pub_key).to.equal("ssh-rsa...");
            expect(config.address).to.equal("server.org");
            expect(config.exp_path).to.equal("/export");
            expect(config.domain).to.equal("org");
        });

        it("unit_types: createRepository should create tagged union", () => {
            const data = { _id: "repo/test", title: "Test" };
            const repo = createRepository(RepositoryType.GLOBUS, data);

            expect(repo.type).to.equal("globus");
            expect(repo.data).to.deep.equal(data);
        });

        it("unit_types: createAllocationResult should handle task method", () => {
            const taskPayload = { task_id: "123", status: "pending" };
            const result = createAllocationResult(ExecutionMethod.TASK, taskPayload);

            expect(result.execution_method).to.equal("task");
            expect(result.task).to.deep.equal(taskPayload);
            expect(result.result).to.be.undefined;
        });

        it("unit_types: createAllocationResult should handle direct method", () => {
            const directPayload = { allocation_id: "456", status: "completed" };
            const result = createAllocationResult(ExecutionMethod.DIRECT, directPayload);

            expect(result.execution_method).to.equal("direct");
            expect(result.result).to.deep.equal(directPayload);
            expect(result.task).to.be.undefined;
        });
    });

    describe("Validation Module", () => {
        it("unit_validation: validateNonEmptyString should accept valid strings", () => {
            const result = validateNonEmptyString("valid string", "Test field");
            expect(result.ok).to.be.true;
            expect(result.value).to.be.true;
        });

        it("unit_validation: validateNonEmptyString should reject empty strings", () => {
            const result = validateNonEmptyString("", "Test field");
            expect(result.ok).to.be.false;
            expect(result.error.message).to.include("Test field is required");
        });

        it("unit_validation: validateNonEmptyString should reject null/undefined", () => {
            let result = validateNonEmptyString(null, "Test field");
            expect(result.ok).to.be.false;

            result = validateNonEmptyString(undefined, "Test field");
            expect(result.ok).to.be.false;
        });

        it("unit_validation: validateNonEmptyString should reject whitespace-only strings", () => {
            const result = validateNonEmptyString("   ", "Test field");
            expect(result.ok).to.be.false;
        });

        it("unit_validation: validateCommonFields should accept valid config", () => {
            const config = {
                id: "test_repo",
                title: "Test Repository",
                capacity: 1000000,
                admins: ["u/admin1"],
            };
            const result = validateCommonFields(config);
            expect(result.ok).to.be.true;
        });

        it("unit_validation: validateCommonFields should reject missing fields", () => {
            const config = {
                id: "test_repo",
                // missing title
                capacity: 1000000,
                admins: ["u/admin1"],
            };
            const result = validateCommonFields(config);
            expect(result.ok).to.be.false;
            expect(result.error.message).to.include("Repository title");
        });

        it("unit_validation: validateCommonFields should reject invalid capacity", () => {
            const config = {
                id: "test_repo",
                title: "Test Repository",
                capacity: -100, // negative
                admins: ["u/admin1"],
            };
            const result = validateCommonFields(config);
            expect(result.ok).to.be.false;
            expect(result.error.message).to.include("positive number");
        });

        it("unit_validation: validateCommonFields should reject empty admins", () => {
            const config = {
                id: "test_repo",
                title: "Test Repository",
                capacity: 1000000,
                admins: [], // empty array
            };
            const result = validateCommonFields(config);
            expect(result.ok).to.be.false;
            expect(result.error.message).to.include("at least one admin");
        });

        it("unit_validation: validatePOSIXPath should accept valid paths", () => {
            const result = validatePOSIXPath("/data/repo", "Test path");
            expect(result.ok).to.be.true;
        });

        it("unit_validation: validatePOSIXPath should reject relative paths", () => {
            const result = validatePOSIXPath("data/repo", "Test path");
            expect(result.ok).to.be.false;
            expect(result.error.message).to.include("absolute path");
        });

        it("unit_validation: validatePOSIXPath should reject paths with ..", () => {
            const result = validatePOSIXPath("/data/../repo", "Test path");
            expect(result.ok).to.be.false;
            expect(result.error.message).to.include("invalid path sequences");
        });

        it("unit_validation: validateRepositoryPath should validate path ends with ID", () => {
            const result = validateRepositoryPath("/data/repos/myrepo", "myrepo");
            expect(result.ok).to.be.true;
        });

        it("unit_validation: validateRepositoryPath should reject path not ending with ID", () => {
            const result = validateRepositoryPath("/data/repos/other", "myrepo");
            expect(result.ok).to.be.false;
            expect(result.error.message).to.include("must end with repository ID");
        });

        it("unit_validation: validateGlobusConfig should accept complete config", () => {
            const config = {
                id: "test_repo",
                title: "Test Repository",
                capacity: 1000000,
                admins: ["u/admin1"],
                pub_key: "ssh-rsa...",
                address: "server.org",
                endpoint: "ep123",
                path: "/data/test_repo",
                domain: "org",
            };
            const result = validateGlobusConfig(config);
            expect(result.ok).to.be.true;
        });

        it("unit_validation: validateGlobusConfig should reject missing Globus fields", () => {
            const config = {
                id: "test_repo",
                title: "Test Repository",
                capacity: 1000000,
                admins: ["u/admin1"],
                // missing Globus-specific fields
            };
            const result = validateGlobusConfig(config);
            expect(result.ok).to.be.false;
            expect(result.error.message).to.include("Public key");
        });

        it("unit_validation: validateMetadataConfig should accept metadata-only config", () => {
            const config = {
                id: "meta_repo",
                title: "Metadata Repository",
                capacity: 1000000,
                admins: ["u/admin1"],
            };
            const result = validateMetadataConfig(config);
            expect(result.ok).to.be.true;
        });

        it("unit_validation: validateMetadataConfig should reject Globus fields", () => {
            const config = {
                id: "meta_repo",
                title: "Metadata Repository",
                capacity: 1000000,
                admins: ["u/admin1"],
                pub_key: "should not be here",
            };
            const result = validateMetadataConfig(config);
            expect(result.ok).to.be.false;
            expect(result.error.message).to.include("should not have");
        });

        it("unit_validation: validateAllocationParams should accept valid params", () => {
            const params = {
                subject: "d/dataset1",
                size: 1000000,
                path: "/data/alloc1",
            };
            const result = validateAllocationParams(params);
            expect(result.ok).to.be.true;
        });

        it("unit_validation: validateAllocationParams should reject invalid size", () => {
            const params = {
                subject: "d/dataset1",
                size: 0, // invalid
            };
            const result = validateAllocationParams(params);
            expect(result.ok).to.be.false;
            expect(result.error.message).to.include("positive number");
        });
    });

    describe("Factory Module", () => {
        it("unit_factory: createRepositoryByType should create GLOBUS repository", () => {
            const config = {
                id: "globus_repo",
                type: RepositoryType.GLOBUS,
                title: "Globus Repository",
                capacity: 1000000,
                admins: ["u/admin1"],
                pub_key: "ssh-rsa...",
                address: "server.org",
                endpoint: "ep123",
                path: "/data/globus_repo",
                domain: "org",
            };
            const result = createRepositoryByType(config);

            expect(result.ok).to.be.true;
            expect(result.value.type).to.equal(RepositoryType.GLOBUS);
            expect(result.value.data.type).to.equal(RepositoryType.GLOBUS);
            expect(result.value.data._id).to.equal("repo/globus_repo");
        });

        it("unit_factory: createRepositoryByType should create METADATA_ONLY repository", () => {
            const config = {
                id: "meta_repo",
                type: RepositoryType.METADATA_ONLY,
                title: "Metadata Repository",
                capacity: 1000000,
                admins: ["u/admin1"],
            };
            const result = createRepositoryByType(config);

            expect(result.ok).to.be.true;
            expect(result.value.type).to.equal(RepositoryType.METADATA_ONLY);
            expect(result.value.data.type).to.equal(RepositoryType.METADATA_ONLY);
        });

        it("unit_factory: createRepositoryByType should reject unknown type", () => {
            const config = {
                id: "unknown_repo",
                type: "unknown_type",
                title: "Unknown Repository",
                capacity: 1000000,
                admins: ["u/admin1"],
            };
            const result = createRepositoryByType(config);

            expect(result.ok).to.be.false;
            expect(result.error.message).to.include("Unknown repository type");
        });

        it("unit_factory: createRepositoryByType should reject missing required fields", () => {
            const config = {
                // missing id
                type: RepositoryType.GLOBUS,
                title: "Test Repository",
                capacity: 1000000,
                admins: ["u/admin1"],
            };
            const result = createRepositoryByType(config);

            expect(result.ok).to.be.false;
            expect(result.error.message).to.include("Missing required");
        });

        it("unit_factory: getRepositoryImplementation should return correct implementation", () => {
            const globusImpl = getRepositoryImplementation(RepositoryType.GLOBUS);
            expect(globusImpl).to.not.be.null;
            expect(typeof globusImpl.validate).to.equal("function");

            const metadataImpl = getRepositoryImplementation(RepositoryType.METADATA_ONLY);
            expect(metadataImpl).to.not.be.null;
            expect(typeof metadataImpl.validate).to.equal("function");
        });

        it("unit_factory: getRepositoryImplementation should return null for unknown type", () => {
            const impl = getRepositoryImplementation("unknown_type");
            expect(impl).to.be.null;
        });

        it("unit_factory: executeRepositoryOperation should dispatch to correct implementation", () => {
            const repository = {
                type: RepositoryType.METADATA_ONLY,
                data: { _id: "repo/test" },
            };
            const result = executeRepositoryOperation(repository, "supportsDataOperations");

            expect(result.ok).to.be.true;
            expect(result.value).to.be.false; // metadata repos don't support data ops
        });

        it("unit_factory: executeRepositoryOperation should handle unknown operation", () => {
            const repository = {
                type: RepositoryType.GLOBUS,
                data: { _id: "repo/test" },
            };
            const result = executeRepositoryOperation(repository, "unknownOperation");

            expect(result.ok).to.be.false;
            expect(result.error.message).to.include("not implemented");
        });
    });

    describe("Operations Module", () => {
        beforeEach(() => {
            // Create test repository in database
            g_db.repo.save({
                _key: "test_repo",
                _id: "repo/test_repo",
                type: RepositoryType.GLOBUS,
                title: "Test Repository",
                capacity: 1000000,
                admins: ["u/admin1"],
                endpoint: "ep123",
                path: "/data/test_repo",
            });
        });

        it("unit_operations: find should return existing repository", () => {
            const result = RepositoryOps.find("repo/test_repo");

            expect(result.ok).to.be.true;
            expect(result.value.type).to.equal(RepositoryType.GLOBUS);
            expect(result.value.data._id).to.equal("repo/test_repo");
        });

        it("unit_operations: find should handle non-existent repository", () => {
            const result = RepositoryOps.find("repo/nonexistent");

            expect(result.ok).to.be.false;
            expect(result.error.code).to.equal(404);
            expect(result.error.message).to.include("not found");
        });

        it("unit_operations: find should handle key without prefix", () => {
            const result = RepositoryOps.find("test_repo");

            expect(result.ok).to.be.true;
            expect(result.value.data._id).to.equal("repo/test_repo");
        });

        it("unit_operations: list should return all repositories", () => {
            // Add another repository
            g_db.repo.save({
                _key: "another_repo",
                type: RepositoryType.METADATA_ONLY,
                title: "Another Repository",
                capacity: 1000,
                admins: ["u/admin2"],
            });

            const result = RepositoryOps.list();

            expect(result.ok).to.be.true;
            expect(result.value).to.have.length(2);
            expect(result.value[0].type).to.be.oneOf(["globus", "metadata_only"]);
        });

        it("unit_operations: list should filter by type", () => {
            // Add metadata repository
            g_db.repo.save({
                _key: "meta_repo",
                type: RepositoryType.METADATA_ONLY,
                title: "Metadata Repository",
                capacity: 1000,
                admins: ["u/admin1"],
            });

            const result = RepositoryOps.list({ type: RepositoryType.METADATA_ONLY });

            expect(result.ok).to.be.true;
            expect(result.value).to.have.length(1);
            expect(result.value[0].type).to.equal(RepositoryType.METADATA_ONLY);
        });

        it("unit_operations: list should filter by admin", () => {
            // Add repository with different admin
            g_db.repo.save({
                _key: "other_admin_repo",
                type: RepositoryType.GLOBUS,
                title: "Other Admin Repository",
                capacity: 1000,
                admins: ["u/admin2"],
            });

            const result = RepositoryOps.list({ admin: "u/admin1" });

            expect(result.ok).to.be.true;
            expect(result.value).to.have.length(1);
            expect(result.value[0].data.admins).to.include("u/admin1");
        });

        it("unit_operations: save should persist repository", () => {
            const repository = {
                type: RepositoryType.METADATA_ONLY,
                data: {
                    _key: "new_repo",
                    _id: "repo/new_repo",
                    type: RepositoryType.METADATA_ONLY,
                    title: "New Repository",
                    capacity: 5000,
                    admins: ["u/admin3"],
                },
            };

            const result = RepositoryOps.save(repository);

            expect(result.ok).to.be.true;
            expect(result.value._id).to.equal("repo/new_repo");

            // Verify it was saved
            const saved = g_db.repo.document("new_repo");
            expect(saved.title).to.equal("New Repository");
        });

        it("unit_operations: update should modify repository", () => {
            const repository = {
                type: RepositoryType.GLOBUS,
                data: g_db.repo.document("test_repo"),
            };

            const updates = {
                title: "Updated Title",
                capacity: 2000000,
            };

            const result = RepositoryOps.update(repository, updates);

            expect(result.ok).to.be.true;
            expect(result.value.title).to.equal("Updated Title");
            expect(result.value.capacity).to.equal(2000000);

            // Verify in database
            const updated = g_db.repo.document("test_repo");
            expect(updated.title).to.equal("Updated Title");
        });

        it("unit_operations: validate should use type-specific validation", () => {
            const repository = {
                type: RepositoryType.GLOBUS,
                data: { _id: "repo/test" },
            };

            const result = RepositoryOps.validate(repository);
            expect(result.ok).to.be.true;
        });

        it("unit_operations: checkPermission should verify admin access", () => {
            const repository = {
                type: RepositoryType.GLOBUS,
                data: {
                    _id: "repo/test",
                    admins: ["u/admin1", "u/admin2"],
                },
            };

            const result1 = RepositoryOps.checkPermission(repository, "u/admin1", "admin");
            expect(result1.ok).to.be.true;
            expect(result1.value).to.be.true;

            const result2 = RepositoryOps.checkPermission(repository, "u/other", "admin");
            expect(result2.ok).to.be.true;
            expect(result2.value).to.be.false;
        });
    });

    describe("Globus Implementation", () => {
        it("unit_globus: validate should always return ok", () => {
            const repoData = { _id: "repo/globus1" };
            const result = globusImpl.validate(repoData);
            expect(result.ok).to.be.true;
        });

        it("unit_globus: supportsDataOperations should return true", () => {
            const repoData = { _id: "repo/globus1" };
            const result = globusImpl.supportsDataOperations(repoData);
            expect(result.ok).to.be.true;
            expect(result.value).to.be.true;
        });

        it("unit_globus: getCapacityInfo should return capacity details", () => {
            const repoData = {
                _id: "repo/globus1",
                capacity: 1000000000,
            };
            const result = globusImpl.getCapacityInfo(repoData);

            expect(result.ok).to.be.true;
            expect(result.value.total_capacity).to.equal(1000000000);
            expect(result.value.supports_quotas).to.be.true;
        });

        it("unit_globus: createAllocation should return task result", () => {
            const repoData = { _id: "repo/globus1" };
            const params = {
                subject: "d/dataset1",
                size: 1000000,
                path: "/data/alloc1",
            };

            // Mock task creation (in real tests, g_tasks would be mocked)
            const result = globusImpl.createAllocation(repoData, params);

            expect(result.ok).to.be.true;
            expect(result.value.execution_method).to.equal(ExecutionMethod.TASK);
            // Task creation would be tested with proper mocking
        });

        it("unit_globus: deleteAllocation should validate subject ID", () => {
            const repoData = { _id: "repo/globus1" };
            const result = globusImpl.deleteAllocation(repoData, null);

            expect(result.ok).to.be.false;
            expect(result.error.message).to.include("Subject ID is required");
        });
    });

    describe("Metadata Implementation", () => {
        it("unit_metadata: validate should always return ok", () => {
            const repoData = { _id: "repo/meta1" };
            const result = metadataImpl.validate(repoData);
            expect(result.ok).to.be.true;
        });

        it("unit_metadata: supportsDataOperations should return false", () => {
            const repoData = { _id: "repo/meta1" };
            const result = metadataImpl.supportsDataOperations(repoData);
            expect(result.ok).to.be.true;
            expect(result.value).to.be.false;
        });

        it("unit_metadata: getCapacityInfo should indicate metadata-only", () => {
            const repoData = {
                _id: "repo/meta1",
                capacity: 1000000,
            };
            const result = metadataImpl.getCapacityInfo(repoData);

            expect(result.ok).to.be.true;
            expect(result.value.total_capacity).to.equal(1000000);
            expect(result.value.supports_quotas).to.be.false;
            expect(result.value.is_metadata_only).to.be.true;
        });

        it("unit_metadata: createAllocation should return direct result", () => {
            const repoData = { _id: "repo/meta1" };
            const params = {
                subject: "d/dataset1",
                size: 1000,
            };

            const result = metadataImpl.createAllocation(repoData, params);

            expect(result.ok).to.be.true;
            expect(result.value.execution_method).to.equal(ExecutionMethod.DIRECT);
            expect(result.value.result).to.exist;
            expect(result.value.result.status).to.equal("completed");
        });

        it("unit_metadata: deleteAllocation should return direct result", () => {
            const repoData = { _id: "repo/meta1" };
            const result = metadataImpl.deleteAllocation(repoData, "d/dataset1");

            expect(result.ok).to.be.true;
            expect(result.value.execution_method).to.equal(ExecutionMethod.DIRECT);
            expect(result.value.result.status).to.equal("completed");
        });
    });

    describe("Integration Tests", () => {
        it("unit_integration: full workflow - create, save, find, allocate", () => {
            // Step 1: Create repository
            const createResult = createRepositoryByType({
                id: "integration_repo",
                type: RepositoryType.GLOBUS,
                title: "Integration Test Repository",
                capacity: 5000000000,
                admins: ["u/test_admin"],
                pub_key: "ssh-rsa integration...",
                address: "integration.test.org",
                endpoint: "integration-ep",
                path: "/data/integration_repo",
                domain: "test.org",
            });

            expect(createResult.ok).to.be.true;
            const repository = createResult.value;

            // Step 2: Save repository
            const saveResult = RepositoryOps.save(repository);
            expect(saveResult.ok).to.be.true;

            // Step 3: Find repository
            const findResult = RepositoryOps.find("integration_repo");
            expect(findResult.ok).to.be.true;
            expect(findResult.value.type).to.equal(RepositoryType.GLOBUS);

            // Step 4: Create allocation
            const allocResult = RepositoryOps.createAllocation(findResult.value, {
                subject: "d/integration_dataset",
                size: 1000000000,
                path: "/data/integration_repo/dataset1",
            });

            expect(allocResult.ok).to.be.true;
            expect(allocResult.value.execution_method).to.equal(ExecutionMethod.TASK);
        });

        it("unit_integration: error propagation through the system", () => {
            // Create invalid repository
            const createResult = createRepositoryByType({
                type: RepositoryType.GLOBUS,
                // missing required fields
            });

            expect(createResult.ok).to.be.false;
            expect(createResult.error.code).to.equal(g_lib.ERR_INVALID_PARAM);
        });

        it("unit_integration: different behavior for different repository types", () => {
            // Create and save both types
            const globusConfig = {
                id: "globus_test",
                type: RepositoryType.GLOBUS,
                title: "Globus Test",
                capacity: 1000000,
                admins: ["u/admin"],
                pub_key: "ssh-rsa...",
                address: "server.org",
                endpoint: "ep1",
                path: "/data/globus_test",
                domain: "org",
            };

            const metadataConfig = {
                id: "metadata_test",
                type: RepositoryType.METADATA_ONLY,
                title: "Metadata Test",
                capacity: 1000000,
                admins: ["u/admin"],
            };

            const globusResult = createRepositoryByType(globusConfig);
            const metadataResult = createRepositoryByType(metadataConfig);

            expect(globusResult.ok).to.be.true;
            expect(metadataResult.ok).to.be.true;

            // Save both
            RepositoryOps.save(globusResult.value);
            RepositoryOps.save(metadataResult.value);

            // Test different behaviors
            const globusRepo = RepositoryOps.find("globus_test").value;
            const metadataRepo = RepositoryOps.find("metadata_test").value;

            // Data operations support
            const globusDataOps = RepositoryOps.supportsDataOperations(globusRepo);
            const metadataDataOps = RepositoryOps.supportsDataOperations(metadataRepo);

            expect(globusDataOps.value).to.be.true;
            expect(metadataDataOps.value).to.be.false;

            // Allocation behavior
            const allocParams = { subject: "d/test", size: 1000 };
            const globusAlloc = RepositoryOps.createAllocation(globusRepo, allocParams);
            const metadataAlloc = RepositoryOps.createAllocation(metadataRepo, allocParams);

            expect(globusAlloc.value.execution_method).to.equal(ExecutionMethod.TASK);
            expect(metadataAlloc.value.execution_method).to.equal(ExecutionMethod.DIRECT);
        });

        it("unit_integration: backward compatibility with legacy Repo class", () => {
            // Create repository using new system
            const createResult = createRepositoryByType({
                id: "legacy_compat",
                type: RepositoryType.METADATA_ONLY,
                title: "Legacy Compatible",
                capacity: 1000000,
                admins: ["u/admin"],
            });

            RepositoryOps.save(createResult.value);

            // Use legacy Repo class
            const { Repo } = require("../api/repo");
            const legacyRepo = new Repo("legacy_compat");

            expect(legacyRepo.exists()).to.be.true;
            expect(legacyRepo.key()).to.equal("legacy_compat");
            expect(legacyRepo.id()).to.equal("repo/legacy_compat");

            // Access new repository object
            const newRepo = legacyRepo.getRepository();
            expect(newRepo).to.not.be.null;
            expect(newRepo.type).to.equal(RepositoryType.METADATA_ONLY);
        });
    });
});
