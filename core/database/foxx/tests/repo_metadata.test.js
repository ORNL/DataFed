"use strict";

const { expect } = require("chai");
const { Result } = require("../api/models/repositories/types");
const { ExecutionMethod } = require("../api/lib/execution_types");
const { MetadataRepo } = require("../api/models/repositories/repository/metadata");
const g_tasks = require("../api/tasks");
const g_db = require("@arangodb").db;
const error = require("../api/lib/error_codes");
const permissions = require("../api/lib/permissions");

describe("unit_repository_metadata: Metadata Only Repository Operations", function () {
    beforeEach(() => {
        const collections = ["repo", "d", "alloc", "loc", "repo", "admin", "g", "p", "u"];
        collections.forEach((name) => {
            let col = g_db._collection(name);
            if (col) {
                col.truncate(); // truncate after ensuring collection exists
            } else {
                g_db._create(name); // create if it doesn’t exist
            }
        });
    });

    // The pub key is a test key
    function getValidRepoData() {
        return {
            id: "repo/123",
            key: "123",
            title: "Test Metadata Repository",
            capacity: 0,
            admins: ["u/bob"],
        };
    }

    function getValidRawRepoData() {
        return {
            _id: "repo/123",
            _key: "123",
            title: "Test Metadata Repository",
            capacity: 0,
            admins: ["u/bob"],
        };
    }

    function getValidUserData() {
        return {
            _id: "u/456",
            _key: "456",
            name: "Bobby",
        };
    }

    function getValidGroupData() {
        return {
            _id: "g/789",
            _key: "789",
            name: "Biker Bandits",
        };
    }

    function getValidProjectData() {
        return {
            _id: "p/999",
            _key: "999",
            title: "The Golden Peach",
        };
    }

    function getValidAllocationParams() {
        return {
            client: {
                _id: "u/456",
                is_admin: false,
            },
            subject: "u/456",
            rec_limit: 10000,
            data_limit: 0,
        };
    }

    describe("constructor and validation", function () {
        it("should create MetadataRepo successfully with valid config", function () {
            g_db.u.save(getValidUserData());
            const repoRawConfig = getValidRawRepoData();
            g_db.repo.save(repoRawConfig);

            const repoConfig = getValidRepoData();
            const result = new MetadataRepo(repoConfig);
            expect(result.ok).to.be.true;
            expect(result.value.type()).to.equal("metadata");
        });

        it("should fail if capacity is not 0", function () {
            const config = { ...getValidRepoData(), capacity: 10 };
            const repo = new MetadataRepo(config);
            expect(repo.ok).to.be.false;
            expect(repo.error.code).to.equal(error.ERR_INVALID_PARAM);
        });

        it("should fail if invalid fields exist", function () {
            const config = { ...getValidRepoData(), pub_key: "something" };
            const repo = new MetadataRepo(config);
            expect(repo.ok).to.be.false;
            expect(repo.error.message).to.include("Metadata-only repositories should not have");
        });
    });

    describe("unit_repository_metadata: Validation failures", function () {
        it("unit_repository_metadata: should fail when subject is missing", function () {
            const params = getValidAllocationParams();
            delete params.subject;

            const repo = new MetadataRepo(getValidRepoData()).value;
            const result = repo.createAllocation(params);

            expect(result.ok).to.be.false;
            expect(result.error.code).to.equal(error.ERR_INVALID_PARAM);
            expect(result.error.message).to.include("Allocation subject");
        });

        it("unit_repository_metadata: should fail when subject is empty string", function () {
            const params = getValidAllocationParams();
            params.subject = "";

            const repo = new MetadataRepo(getValidRepoData()).value;
            const result = repo.createAllocation(params);

            expect(result.ok).to.be.false;
            expect(result.error.code).to.equal(error.ERR_INVALID_PARAM);
            expect(result.error.message).to.include("Allocation subject");
        });

        it("unit_repository_metadata: should fail when data_limit is not a number", function () {
            const params = getValidAllocationParams();
            params.data_limit = "not-a-number";

            const repo = new MetadataRepo(getValidRepoData()).value;
            const result = repo.createAllocation(params);

            expect(result.ok).to.be.false;
            expect(result.error.code).to.equal(error.ERR_INVALID_PARAM);
            expect(result.error.message).to.include("data_limit must be a number");
        });

        it("unit_repository_metadata: should fail when rec_limit is not a number", function () {
            const repoData = getValidRepoData();
            const params = getValidAllocationParams();
            params.rec_limit = "invalid";

            const repo = new MetadataRepo(getValidRepoData()).value;
            const result = repo.createAllocation(params);

            expect(result.ok).to.be.false;
            expect(result.error.code).to.equal(error.ERR_INVALID_PARAM);
        });

        it("unit_repository_metadata: should fail when path is provided but not a string", function () {
            const repoData = getValidRepoData();
            const params = getValidAllocationParams();
            params.path = 123;

            const repo = new MetadataRepo(getValidRepoData()).value;
            const result = repo.createAllocation(params);

            expect(result.ok).to.be.false;
            expect(result.error.code).to.equal(error.ERR_INVALID_PARAM);
            expect(result.error.message).to.include("path must be a string");
        });
    });

    describe("unit_repository_metadata: validate", function () {
        it("unit_repository_metadata: should always return ok for valid repository data", function () {
            const repoData = getValidRepoData();

            const result = MetadataRepo.validate(repoData);
            expect(result.ok).to.be.true;
            expect(result.value).to.be.true;
        });

        it("unit_repository_metadata: should return false because of all of the incomplete repository data.", function () {
            const repoData = { id: "repo/123" };
            const result = MetadataRepo.validate(repoData);
            expect(result.ok).to.be.false;
            expect(result.error.message).to.include(
                "Metadata repository capacity must be 0: capacity=undefined",
            );
        });

        it("unit_repository_metadata: should return false for null repository data", function () {
            const result = MetadataRepo.validate(null);
            expect(result.ok).to.be.false;
        });
    });

    describe("unit_repository_metadata: createAllocation", function () {
        it("unit_repository_metadata: should fail to create allocation with non existent repo.", function () {
            const params = getValidAllocationParams();
            const repo = new MetadataRepo(getValidRepoData()).value;
            const result = repo.createAllocation(params);

            expect(result.ok).to.be.false;
            expect(result.error.message).to.include(
                "Failed to create metadata allocation: Repo, 'repo/123', does not exist.",
            );
        });

        it("unit_repository_metadata: should create allocation with valid parameters", function () {
            const repoRawData = getValidRawRepoData();
            const userData = getValidUserData();
            const params = getValidAllocationParams();

            g_db.repo.save(repoRawData);
            g_db.u.save(userData);
            g_db.admin.save({
                _from: repoRawData._id,
                _to: params.client._id,
            });

            const repo = new MetadataRepo(getValidRepoData()).value;
            const rv = repo.createAllocation(params);
            // const rv = metadata.createAllocation(repoData, params);

            expect(rv.ok).to.be.true;
            expect(rv.value.result).to.have.property("id");
            expect(rv.value.result).to.have.property("repo_id", repoRawData._id);
            expect(rv.value.result).to.have.property("subject", params.subject);
            expect(rv.value.result).to.have.property("rec_limit", params.rec_limit);
        });
    });
    describe("unit_repository_metadata: Repository and subject existence checks", function () {
        it("should fail when repository does not exist", function () {
            //const repoData = getValidRepoData();
            const params = getValidAllocationParams();

            // Subject exists but repo doesn't
            g_db.u.save(getValidUserData());

            const repo = new MetadataRepo(getValidRepoData()).value;
            const rv = repo.createAllocation(params);
            //const result = metadata.createAllocation(repoData, params);

            expect(rv.ok).to.be.false;
            expect(rv.error.code).to.equal(error.ERR_NOT_FOUND);
            expect(rv.error.message).to.equal(
                "Failed to create metadata allocation: Repo, 'repo/123', does not exist.",
            );
        });

        it("should fail when subject does not exist", function () {
            const repoData = getValidRawRepoData();
            const params = getValidAllocationParams();

            // Repo exists but subject doesn't
            g_db.repo.save(repoData);

            //const result = metadata.createAllocation(repoData, params);
            const repo = new MetadataRepo(getValidRepoData()).value;
            const rv = repo.createAllocation(params);

            expect(rv.ok).to.be.false;
            expect(rv.error.code).to.equal(error.ERR_NOT_FOUND);
            expect(rv.error.message).to.equal(
                "Failed to create metadata allocation: Subject, 'u/456', does not exist.",
            );
        });

        it("should work with different subject types (user, group, project)", function () {
            const repoData = getValidRawRepoData();
            g_db.repo.save(repoData);

            // Test with group subject
            const groupData = getValidGroupData();
            g_db.g.save(groupData);

            const paramsWithGroup = {
                client: {
                    _id: "u/456",
                    is_admin: true,
                },
                subject: groupData._id,
                rec_limit: 5000,
                data_limit: 0,
            };

            const repo = new MetadataRepo(getValidRepoData()).value;
            const rv = repo.createAllocation(paramsWithGroup);

            expect(rv.ok).to.be.true;
            expect(rv.value.result.subject).to.equal(groupData._id);
        });
    });

    describe("unit_repository_metadata: Permission checks", function () {
        it("should fail when client lacks admin permissions", function () {
            const repoData = getValidRawRepoData();
            const userData = getValidUserData();
            const params = getValidAllocationParams();

            g_db.repo.save(repoData);
            g_db.u.save(userData);

            const repo = new MetadataRepo(getValidRepoData()).value;
            const rv = repo.createAllocation(params);
            console.log("RV is");
            console.log(rv);
            expect(rv.error.code).to.equal(error.ERR_PERM_DENIED);
            expect(rv.error.message).to.include(
                "Allocation creation failed - Client, \'u/456\', does not have administrative repository permissions on repo/123",
            );
        });

        it("should succeed when client has admin permissions", function () {
            const repoData = getValidRawRepoData();
            const userData = getValidUserData();
            const params = getValidAllocationParams();

            g_db.repo.save(repoData);
            g_db.u.save(userData);
            g_db.admin.save({
                _from: repoData._id,
                _to: params.client._id,
            });

            const repo = new MetadataRepo(getValidRepoData()).value;
            const rv = repo.createAllocation(params);

            expect(rv.ok).to.be.true;
        });
    });

    describe("unit_repository_metadata: Duplicate allocation checks", function () {
        it("should fail when allocation already exists for subject-repo pair", function () {
            const repoData = getValidRawRepoData();
            const userData = getValidUserData();
            const params = getValidAllocationParams();

            g_db.repo.save(repoData);
            g_db.u.save(userData);
            g_db.admin.save({
                _from: repoData._id,
                _to: params.client._id,
            });

            // Create existing allocation
            g_db.alloc.save({
                _from: params.subject,
                _to: repoData._id,
                data_limit: 1000,
                rec_limit: 500,
            });

            const repo = new MetadataRepo(getValidRepoData()).value;
            const rv = repo.createAllocation(params);

            expect(rv.ok).to.be.false;
            expect(rv.error.code).to.equal(error.ERR_INVALID_PARAM);
            expect(rv.error.message).to.include("already has an allocation");
        });

        it("should allow allocation for same subject on different repo", function () {
            const repoData1 = getValidRawRepoData();
            const repoData2 = {
                _id: "repo/999",
                _key: "999",
                title: "Another Repository",
                capacity: 0,
            };

            const userData = getValidUserData();
            const params = getValidAllocationParams();

            // Setup both repos and user
            g_db.repo.save(repoData1);
            g_db.repo.save(repoData2);
            g_db.u.save(userData);

            // Admin permissions for both repos
            g_db.admin.save({
                _from: repoData1._id,
                _to: params.client._id,
            });
            g_db.admin.save({
                _from: repoData2._id,
                _to: params.client._id,
            });

            // Create allocation on second repo
            g_db.alloc.save({
                _from: params.subject,
                _to: repoData2._id,
                data_limit: 1000,
                rec_limit: 500,
            });

            // Try to create allocation on first repo - should succeed
            const repo = new MetadataRepo(getValidRepoData()).value;
            const rv = repo.createAllocation(params);

            expect(rv.ok).to.be.true;
            expect(rv.value.result.repo_id).to.equal(repoData1._id);
        });
    });

    describe("unit_repository_metadata: Successful allocation creation", function () {
        it("should create allocation with all required fields", function () {
            const repoData = getValidRawRepoData();
            const userData = getValidUserData();
            const params = getValidAllocationParams();

            g_db.repo.save(repoData);
            g_db.u.save(userData);
            g_db.admin.save({
                _from: repoData._id,
                _to: params.client._id,
            });

            const repo = new MetadataRepo(getValidRepoData()).value;
            const rv = repo.createAllocation(params);

            expect(rv.ok).to.be.true;
            expect(rv.value.execution_method).to.equal(ExecutionMethod.DIRECT);
            expect(rv.value.result).to.have.all.keys(["id", "repo_id", "subject", "rec_limit"]);
            expect(rv.value.result.repo_id).to.equal(repoData._id);
            expect(rv.value.result.subject).to.equal(params.subject);
            expect(rv.value.result.rec_limit).to.equal(params.rec_limit);

            // Verify allocation was saved in database
            const savedAlloc = g_db.alloc.firstExample({
                _from: params.subject,
                _to: repoData._id,
            });

            expect(savedAlloc).to.exist;
            expect(savedAlloc.data_limit).to.equal(params.data_limit);
            expect(savedAlloc.rec_limit).to.equal(params.rec_limit);
            expect(savedAlloc.rec_count).to.equal(0);
            expect(savedAlloc.data_size).to.equal(0);
            expect(savedAlloc.path).to.equal("/");
            expect(savedAlloc.type).to.equal("metadata");
        });

        it("should handle custom path parameter", function () {
            //            const repoData = getValidRepoData();
            const repoData = getValidRawRepoData();
            const userData = getValidUserData();
            const params = getValidAllocationParams();
            params.path = "/custom/path";

            g_db.repo.save(repoData);
            g_db.u.save(userData);
            g_db.admin.save({
                _from: repoData._id,
                _to: params.client._id,
            });

            const repo = new MetadataRepo(getValidRepoData()).value;
            const rv = repo.createAllocation(params);

            expect(rv.ok).to.be.true;

            // Note: The current implementation doesn't use the custom path,
            // it always sets path to "/". This test documents current behavior.
            const savedAlloc = g_db.alloc.firstExample({
                _from: params.subject,
                _to: repoData._id,
            });
            expect(savedAlloc.path).to.equal("/");
        });

        it("should handle different rec_limit values", function () {
            const repoData = getValidRawRepoData();
            const userData = getValidUserData();
            const params = getValidAllocationParams();
            params.rec_limit = 99999;

            g_db.repo.save(repoData);
            g_db.u.save(userData);
            g_db.admin.save({
                _from: repoData._id,
                _to: params.client._id,
            });

            const repo = new MetadataRepo(getValidRepoData()).value;
            const rv = repo.createAllocation(params);

            expect(rv.ok).to.be.true;
            expect(rv.value.result.rec_limit).to.equal(99999);
        });
    });

    describe("unit_repository_metadata: Parameter validation", function () {
        it("should reject null subject", function () {
            const repoData = getValidRawRepoData();
            const userData = getValidUserData();
            g_db.repo.save(repoData);
            g_db.u.save(userData);

            const repo = new MetadataRepo(getValidRepoData()).value;
            const rv = repo.deleteAllocation(userData, null);

            expect(rv.ok).to.be.false;
            expect(rv.error.code).to.equal(error.ERR_INVALID_PARAM);
            expect(rv.error.message).to.equal("Subject ID is required for allocation deletion");
        });

        it("should reject undefined subject", function () {
            const repoData = getValidRawRepoData();
            const userData = getValidUserData();
            g_db.repo.save(repoData);
            g_db.u.save(userData);
            const repo = new MetadataRepo(getValidRepoData()).value;
            const rv = repo.deleteAllocation(userData, undefined);

            expect(rv.ok).to.be.false;
            expect(rv.error.code).to.equal(error.ERR_INVALID_PARAM);
            expect(rv.error.message).to.equal("Subject ID is required for allocation deletion");
        });

        it("should reject empty string subject", function () {
            const repoData = getValidRawRepoData();
            const userData = getValidUserData();
            g_db.repo.save(repoData);
            g_db.u.save(userData);
            const repo = new MetadataRepo(getValidRepoData()).value;
            const rv = repo.deleteAllocation(userData, "");

            expect(rv.ok).to.be.false;
            expect(rv.error.code).to.equal(error.ERR_INVALID_PARAM);
            expect(rv.error.message).to.equal("Subject ID is required for allocation deletion");
        });

        it("should reject non-string subject", function () {
            const repoData = getValidRawRepoData();
            const userData = getValidUserData();
            g_db.repo.save(repoData);
            g_db.u.save(userData);
            const repo = new MetadataRepo(getValidRepoData()).value;
            const rv = repo.deleteAllocation(userData, 123);

            expect(rv.ok).to.be.false;
            expect(rv.error.code).to.equal(error.ERR_INVALID_PARAM);
            expect(rv.error.message).to.equal("Subject ID is required for allocation deletion");
        });

        it("should reject object as subject", function () {
            const repoData = getValidRepoData();
            const userData = getValidUserData();
            g_db.repo.save(repoData);
            g_db.u.save(userData);
            const repo = new MetadataRepo(getValidRepoData()).value;
            const rv = repo.deleteAllocation(userData, { id: "u/user" });

            expect(rv.ok).to.be.false;
            expect(rv.error.code).to.equal(error.ERR_INVALID_PARAM);
            expect(rv.error.message).to.equal("Subject ID is required for allocation deletion");
        });
    });

    describe("unit_repository_metadata:  Repository existence checks", function () {
        it("should fail when repository does not exist", function () {
            const repoData = getValidRawRepoData();
            const userData = getValidUserData();
            g_db.u.save(userData);

            const repo = new MetadataRepo(getValidRepoData()).value;
            const rv = repo.deleteAllocation(userData, userData._id);

            expect(rv.ok).to.be.false;
            expect(rv.error.code).to.equal(error.ERR_NOT_FOUND);
            expect(rv.error.message).to.include("Failed to delete metadata allocation: Repo");
            expect(rv.error.message).to.include(repoData._id);
            expect(rv.error.message).to.include("does not exist");
        });

        it("should fail when subject does not exist", function () {
            const repoData = getValidRawRepoData();
            const userData = getValidUserData();
            g_db.u.save(userData);
            g_db.repo.save(repoData);

            const repo = new MetadataRepo(getValidRepoData()).value;
            const rv = repo.deleteAllocation(userData, "u/ghost");
            expect(rv.ok).to.be.false;
            expect(rv.error.code).to.equal(error.ERR_NOT_FOUND);
            expect(rv.error.message).to.include("Failed to delete metadata allocation: Subject");
            expect(rv.error.message).to.include("u/ghost");
            expect(rv.error.message).to.include("does not exist");
        });
    });

    describe("unit_repository_metadata: Allocation existence checks", function () {
        it("should fail when allocation does not exist", function () {
            const repoData = getValidRawRepoData();
            const userData = getValidUserData();
            g_db.u.save(userData);
            g_db.repo.save(repoData);
            g_db.admin.save({
                _from: repoData._id,
                _to: userData._id,
            });

            const repo = new MetadataRepo(getValidRepoData()).value;
            const rv = repo.deleteAllocation(userData, userData._id);

            expect(rv.ok).to.be.false;
            expect(rv.error.code).to.equal(error.ERR_NOT_FOUND);
            expect(rv.error.message).to.include("Failed to delete metadata allocation: Subject");
            expect(rv.error.message).to.include(userData._id);
            expect(rv.error.message).to.include("has no allocation on");
            expect(rv.error.message).to.include(repoData._id);
        });

        it("should proceed when allocation exists", function () {
            const repoData = getValidRawRepoData();
            const userData = getValidUserData();
            g_db.u.save(userData);
            g_db.repo.save(repoData);
            const alloc = g_db.alloc.save({
                _from: userData._id,
                _to: repoData._id,
            });
            g_db.admin.save({
                _from: repoData._id,
                _to: userData._id,
            });

            const repo = new MetadataRepo(getValidRepoData()).value;
            const rv = repo.deleteAllocation(userData, userData._id);
            expect(g_db._exists(alloc._id)).to.be.false;
        });
    });
});
