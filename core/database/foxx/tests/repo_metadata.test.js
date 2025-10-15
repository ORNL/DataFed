"use strict";

const { expect } = require("chai");
const { Result } = require("../api/repository/types");
const { ExecutionMethod } = require("../api/lib/execution_types");
const metadata = require("../api/repository/metadata");
const g_tasks = require("../api/tasks");
const g_db = require("@arangodb").db;
const error = require("../api/lib/error_codes");
const permissions = require("../api/lib/permissions");

describe("unit_repository_metadata: Metadata Only Repository Operations", function () {
    beforeEach(() => {
        const collections = ["d", "alloc", "loc", "repo", "admin", "g", "p", "u"];
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
            _id: "repo/123",
            _key: "123",
            title: "Test Metadata Repository",
            capacity: 0,
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

    describe("unit_repository_metadata: Validation failures", function () {
        it("unit_repository_metadata: should fail when subject is missing", function () {
            const repoData = getValidRepoData();
            const params = getValidAllocationParams();
            delete params.subject;

            const result = metadata.createAllocation(repoData, params);

            expect(result.ok).to.be.false;
            expect(result.error.code).to.equal(error.ERR_INVALID_PARAM);
            expect(result.error.message).to.include("Allocation subject");
        });

        it("unit_repository_metadata: should fail when subject is empty string", function () {
            const repoData = getValidRepoData();
            const params = getValidAllocationParams();
            params.subject = "";

            const result = metadata.createAllocation(repoData, params);

            expect(result.ok).to.be.false;
            expect(result.error.code).to.equal(error.ERR_INVALID_PARAM);
            expect(result.error.message).to.include("Allocation subject");
        });

        it("unit_repository_metadata: should fail when data_limit is not a number", function () {
            const repoData = getValidRepoData();
            const params = getValidAllocationParams();
            params.data_limit = "not-a-number";

            const result = metadata.createAllocation(repoData, params);

            expect(result.ok).to.be.false;
            expect(result.error.code).to.equal(error.ERR_INVALID_PARAM);
            expect(result.error.message).to.include("data_limit must be a number");
        });

        it("unit_repository_metadata: should fail when rec_limit is not a number", function () {
            const repoData = getValidRepoData();
            const params = getValidAllocationParams();
            params.rec_limit = "invalid";

            const result = metadata.createAllocation(repoData, params);

            expect(result.ok).to.be.false;
            expect(result.error.code).to.equal(error.ERR_INVALID_PARAM);
        });

        it("unit_repository_metadata: should fail when path is provided but not a string", function () {
            const repoData = getValidRepoData();
            const params = getValidAllocationParams();
            params.path = 123;

            const result = metadata.createAllocation(repoData, params);

            expect(result.ok).to.be.false;
            expect(result.error.code).to.equal(error.ERR_INVALID_PARAM);
            expect(result.error.message).to.include("path must be a string");
        });
    });

    describe("unit_repository_metadata: validate", function () {
        it("unit_repository_metadata: should always return ok for valid repository data", function () {
            const repoData = getValidRepoData();
            const result = metadata.validate(repoData);
            expect(result.ok).to.be.true;
            expect(result.value).to.be.true;
        });

        it("unit_repository_metadata: should return ok even for incomplete repository data", function () {
            const repoData = { _id: "repo/123" };
            const result = metadata.validate(repoData);
            expect(result.ok).to.be.true;
        });

        it("unit_repository_metadata: should return ok for null repository data", function () {
            const result = metadata.validate(null);
            expect(result.ok).to.be.true;
        });
    });

    describe("unit_repository_metadata: createAllocation", function () {
        it("unit_repository_metadata: should fail to create allocation with non existent repo.", function () {
            const repoData = getValidRepoData();
            const params = getValidAllocationParams();
            const result = metadata.createAllocation(repoData, params);

            expect(result.ok).to.be.false;
            expect(result.error.message).to.include(
                "Failed to create metadata allocation: Repo, 'repo/123', does not exist.",
            );
        });

        it("unit_repository_metadata: should create allocation with valid parameters", function () {
            const repoData = getValidRepoData();
            const userData = getValidUserData();
            const params = getValidAllocationParams();

            g_db.repo.save(repoData);
            g_db.u.save(userData);
            g_db.admin.save({
                _from: repoData._id,
                _to: params.client._id,
            });

            const rv = metadata.createAllocation(repoData, params);

            expect(rv.ok).to.be.true;
            expect(rv.value.result).to.have.property("id");
            expect(rv.value.result).to.have.property("repo_id", repoData._id);
            expect(rv.value.result).to.have.property("subject", params.subject);
            expect(rv.value.result).to.have.property("rec_limit", params.rec_limit);
        });
    });
    describe("unit_repository_metadata: Repository and subject existence checks", function () {
        it("should fail when repository does not exist", function () {
            const repoData = getValidRepoData();
            const params = getValidAllocationParams();

            // Subject exists but repo doesn't
            g_db.u.save(getValidUserData());

            const result = metadata.createAllocation(repoData, params);

            expect(result.ok).to.be.false;
            expect(result.error.code).to.equal(error.ERR_NOT_FOUND);
            expect(result.error.message).to.equal(
                "Failed to create metadata allocation: Repo, 'repo/123', does not exist.",
            );
        });

        it("should fail when subject does not exist", function () {
            const repoData = getValidRepoData();
            const params = getValidAllocationParams();

            // Repo exists but subject doesn't
            g_db.repo.save(repoData);

            const result = metadata.createAllocation(repoData, params);

            expect(result.ok).to.be.false;
            expect(result.error.code).to.equal(error.ERR_NOT_FOUND);
            expect(result.error.message).to.equal(
                "Failed to create metadata allocation: Subject, 'u/456', does not exist.",
            );
        });

        it("should work with different subject types (user, group, project)", function () {
            const repoData = getValidRepoData();
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

            const result = metadata.createAllocation(repoData, paramsWithGroup);

            expect(result.ok).to.be.true;
            expect(result.value.result.subject).to.equal(groupData._id);
        });
    });

    describe("unit_repository_metadata: Permission checks", function () {
        it("should fail when client lacks admin permissions", function () {
            const repoData = getValidRepoData();
            const userData = getValidUserData();
            const params = getValidAllocationParams();

            g_db.repo.save(repoData);
            g_db.u.save(userData);

            const rv = metadata.createAllocation(repoData, params);

            expect(rv.error.code).to.equal(error.ERR_PERM_DENIED);
            expect(rv.error.message).to.include(
                "Failed to create metadata allocation: client, 'u/456', does not have permissions to create an allocation on repo/123",
            );
        });

        it("should succeed when client has admin permissions", function () {
            const repoData = getValidRepoData();
            const userData = getValidUserData();
            const params = getValidAllocationParams();

            g_db.repo.save(repoData);
            g_db.u.save(userData);
            g_db.admin.save({
                _from: repoData._id,
                _to: params.client._id,
            });

            const result = metadata.createAllocation(repoData, params);

            expect(result.ok).to.be.true;
        });
    });

    describe("unit_repository_metadata: Duplicate allocation checks", function () {
        it("should fail when allocation already exists for subject-repo pair", function () {
            const repoData = getValidRepoData();
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

            const result = metadata.createAllocation(repoData, params);

            expect(result.ok).to.be.false;
            expect(result.error.code).to.equal(error.ERR_INVALID_PARAM);
            expect(result.error.message).to.include("already has an allocation");
        });

        it("should allow allocation for same subject on different repo", function () {
            const repoData1 = getValidRepoData();
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

            // Create allocation on first repo
            g_db.alloc.save({
                _from: params.subject,
                _to: repoData1._id,
                data_limit: 1000,
                rec_limit: 500,
            });

            // Try to create allocation on second repo - should succeed
            const result = metadata.createAllocation(repoData2, params);

            expect(result.ok).to.be.true;
            expect(result.value.result.repo_id).to.equal(repoData2._id);
        });
    });

    describe("unit_repository_metadata: Successful allocation creation", function () {
        it("should create allocation with all required fields", function () {
            const repoData = getValidRepoData();
            const userData = getValidUserData();
            const params = getValidAllocationParams();

            g_db.repo.save(repoData);
            g_db.u.save(userData);
            g_db.admin.save({
                _from: repoData._id,
                _to: params.client._id,
            });

            const rv = metadata.createAllocation(repoData, params);

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
            expect(savedAlloc.type).to.equal("metadata_only");
        });

        it("should handle custom path parameter", function () {
            const repoData = getValidRepoData();
            const userData = getValidUserData();
            const params = getValidAllocationParams();
            params.path = "/custom/path";

            g_db.repo.save(repoData);
            g_db.u.save(userData);
            g_db.admin.save({
                _from: repoData._id,
                _to: params.client._id,
            });

            const result = metadata.createAllocation(repoData, params);

            expect(result.ok).to.be.true;

            // Note: The current implementation doesn't use the custom path,
            // it always sets path to "/". This test documents current behavior.
            const savedAlloc = g_db.alloc.firstExample({
                _from: params.subject,
                _to: repoData._id,
            });
            expect(savedAlloc.path).to.equal("/");
        });

        it("should handle different rec_limit values", function () {
            const repoData = getValidRepoData();
            const userData = getValidUserData();
            const params = getValidAllocationParams();
            params.rec_limit = 99999;

            g_db.repo.save(repoData);
            g_db.u.save(userData);
            g_db.admin.save({
                _from: repoData._id,
                _to: params.client._id,
            });

            const result = metadata.createAllocation(repoData, params);

            expect(result.ok).to.be.true;
            expect(result.value.result.rec_limit).to.equal(99999);
        });
    });
});
