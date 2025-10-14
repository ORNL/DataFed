"use strict";

const { expect } = require("chai");
const sinon = require("sinon");
const { Result } = require("../api/repository/types");
const { ExecutionMethod } = require("../api/lib/execution_types");
const globus = require("../api/repository/globus");
const g_tasks = require("../api/tasks");
const error = require("../api/lib/error_codes");
const g_db = require("@arangodb").db;

describe("unit_repository_globus: Globus Repository Operations", function () {
    let taskStub;
    let deleteTaskStub;

    beforeEach(function () {
        const collections = ["d", "alloc", "loc", "repo", "admin", "task", "g", "p", "u"];
        collections.forEach((name) => {
            let col = g_db._collection(name);
            if (col) {
                col.truncate(); // truncate after ensuring collection exists
            } else {
                g_db._create(name); // create if it doesn’t exist
            }
        });

        // Reset stubs before each test
        if (taskStub) taskStub.restore();
        if (deleteTaskStub) deleteTaskStub.restore();
    });

    afterEach(function () {
        // Clean up stubs after each test
        sinon.restore();
    });

    // The pub key is a test key
    function getValidRepoData() {
        return {
            _id: "repo/123",
            _key: "123",
            title: "Test Globus Repository",
            capacity: 5000000000,
            pub_key: "{Yys%Fr7VBct5AilOs$SnW%k$Qm[DBwvGeS0MQ46",
            address: "burning-fast-repo.org",
            endpoint: "8b7f1c4e-3d4a-4d6a-9a76-9e4b3e95b7b8",
            domain: "fire",
            path: "/one/repo/to/rule/them/all",
        };
    }

    function getValidAllocationParams() {
        return {
            subject: "u/456",
            data_limit: 1000000000,
            rec_limit: 1000000,
        };
    }

    describe("unit_repository_globus: validate", function () {
        it("unit_repository_globus: should always return ok for valid repository data", function () {
            const repoData = getValidRepoData();
            const result = globus.validate(repoData);
            expect(result.ok).to.be.true;
            expect(result.value).to.be.true;
        });

        it("unit_repository_globus: should return ok even for incomplete repository data", function () {
            const repoData = { _id: "repo/123" };
            const result = globus.validate(repoData);
            expect(result.ok).to.be.true;
        });

        it("unit_repository_globus: should return ok for null repository data", function () {
            const result = globus.validate(null);
            expect(result.ok).to.be.true;
        });
    });

    describe("unit_repository_globus: createAllocation", function () {
        it("unit_repository_globus: should create allocation with valid parameters", function () {
            const repoData = getValidRepoData();
            const params = getValidAllocationParams();

            // Mock task creation
            taskStub = sinon.stub(g_tasks, "taskInitAllocCreate").returns({
                task: {
                    _id: "task/789",
                    status: "pending",
                    state: "queued",
                    ct: 1234567890000,
                },
            });

            const result = globus.createAllocation(repoData, params);

            expect(result.ok).to.be.true;
            expect(result.value).to.have.property("id");
            expect(result.value).to.have.property("repo_id", repoData._id);
            expect(result.value).to.have.property("subject", params.subject);
            expect(result.value).to.have.property("task_id", "task/789");
            expect(result.value).to.have.property("status", "pending");
            expect(result.value).to.have.property("state", "queued");
            expect(result.value).to.have.property("queue_time");

            // Verify task was created with correct parameters
            expect(taskStub.calledOnce).to.be.true;
            const call = taskStub.getCall(0);
            expect(call.args[1]).to.equal(repoData._id);
            expect(call.args[2]).to.equal(params.subject);
            expect(call.args[3]).to.equal(params.data_limit);
        });

        it("unit_repository_globus: should handle data_limit parameter name", function () {
            const repoData = getValidRepoData();
            const params = {
                subject: "u/456",
                data_limit: 2000000000,
                rec_limit: 1000,
            };

            taskStub = sinon.stub(g_tasks, "taskInitAllocCreate").returns({
                task: {
                    _id: "task/789",
                    status: "pending",
                    state: "queued",
                    ct: 1234567890000,
                },
            });

            const result = globus.createAllocation(repoData, params);
            expect(result.ok).to.be.true;
            expect(taskStub.calledOnce).to.be.true;
            expect(taskStub.getCall(0).args[3]).to.equal(params.data_limit);
        });

        it("unit_repository_globus: should use default rec_limit if not specified", function () {
            const repoData = getValidRepoData();
            const params = getValidAllocationParams();

            taskStub = sinon.stub(g_tasks, "taskInitAllocCreate").returns({
                task: {
                    _id: "task/789",
                    status: "pending",
                    state: "queued",
                    ct: 1234567890000,
                },
            });

            const result = globus.createAllocation(repoData, params);

            expect(result.ok).to.be.true;
            expect(taskStub.getCall(0).args[4]).to.equal(1000000);
        });

        it("unit_repository_globus: should use provided rec_limit", function () {
            const repoData = getValidRepoData();
            const params = {
                ...getValidAllocationParams(),
                rec_limit: 5000000,
            };

            taskStub = sinon.stub(g_tasks, "taskInitAllocCreate").returns({
                task: {
                    _id: "task/789",
                    status: "pending",
                    state: "queued",
                    ct: 1234567890000,
                },
            });

            const result = globus.createAllocation(repoData, params);

            expect(result.ok).to.be.true;
            expect(taskStub.getCall(0).args[4]).to.equal(5000000);
        });

        it("unit_repository_globus: should reject allocation with missing subject", function () {
            const repoData = getValidRepoData();
            const params = {
                data_limit: 1000000000,
                rec_limit: 10000,
            };

            const result = globus.createAllocation(repoData, params);

            expect(result.ok).to.be.false;
            expect(result.error.message).to.include("Allocation subject is required");
        });

        it("unit_repository_globus: should reject allocation with invalid data_limit", function () {
            const repoData = getValidRepoData();
            const params = {
                subject: "u/456",
                data_limit: 0,
                rec_limit: 10000,
            };

            const result = globus.createAllocation(repoData, params);

            expect(result.ok).to.be.false;
            expect(result.error.message).to.include(
                "Allocation data_limit must be a positive number",
            );
        });

        it("unit_repository_globus: should reject allocation with negative data_limit", function () {
            const repoData = getValidRepoData();
            g_db.repo.save(repoData);
            g_db.u.save({ _id: "u/456", _key: "456", is_admin: true });
            const params = {
                client: { _id: "u/456", _key: "456", is_admin: true },
                subject: "u/456",
                data_limit: -1000,
                rec_limit: 10000,
            };

            const result = globus.createAllocation(repoData, params);

            expect(result.ok).to.be.false;
            expect(result.error.message).to.include(
                "Allocation data_limit must be a positive number data_limit: -1000",
            );
        });

        it("unit_repository_globus: should handle task creation error with Error object", function () {
            const repoData = getValidRepoData();
            const params = getValidAllocationParams();

            taskStub = sinon
                .stub(g_tasks, "taskInitAllocCreate")
                .throws(new Error("Task creation failed"));

            const result = globus.createAllocation(repoData, params);

            expect(result.ok).to.be.false;
            expect(result.error.code).to.equal(error.ERR_INTERNAL_FAULT);
            expect(result.error.message).to.include("Failed to create allocation task");
            expect(result.error.message).to.include("Task creation failed");
        });

        it("unit_repository_globus: should handle task creation error with array-style error", function () {
            const repoData = getValidRepoData();
            const params = getValidAllocationParams();

            taskStub = sinon
                .stub(g_tasks, "taskInitAllocCreate")
                .throws([error.ERR_INTERNAL_FAULT, "Array error message"]);

            const result = globus.createAllocation(repoData, params);

            expect(result.ok).to.be.false;
            expect(result.error.code).to.equal(error.ERR_INTERNAL_FAULT);
            expect(result.error.message).to.include("Failed to create allocation task");
        });

        it("unit_repository_globus: should handle task creation error with string", function () {
            const repoData = getValidRepoData();
            const params = getValidAllocationParams();

            taskStub = sinon.stub(g_tasks, "taskInitAllocCreate").throws("String error message");

            const result = globus.createAllocation(repoData, params);

            expect(result.ok).to.be.false;
            expect(result.error.code).to.equal(error.ERR_INTERNAL_FAULT);
            expect(result.error.message).to.include("Failed to create allocation task");
        });
    });

    describe("unit_repository_globus: deleteAllocation", function () {
        it("unit_repository_globus: should delete allocation with valid subject ID", function () {
            const repoData = getValidRepoData();
            const client = { _id: "u/456", is_admin: true };
            const subjectId = "u/456";

            deleteTaskStub = sinon.stub(g_tasks, "taskInitAllocDelete").returns({
                task_id: "task/123",
                status: "pending",
                queue_time: 1234567890000,
            });

            const result = globus.deleteAllocation(client, repoData, subjectId);

            expect(result.ok).to.be.true;
            expect(result.value).to.have.property("execution_method", ExecutionMethod.TASK);
            expect(result.value.task).to.have.property("task_id", "task/123");
            expect(result.value.task).to.have.property("status", "pending");
            expect(result.value.task).to.have.property("queue_time");

            // Verify task was created with correct parameters
            expect(deleteTaskStub.calledOnce).to.be.true;
            const call = deleteTaskStub.getCall(0);
            expect(call.args[0]).to.deep.equal({
                client: client,
                repo_id: repoData._id,
                subject: subjectId,
            });
        });

        it("unit_repository_globus: should reject deletion with null subject ID", function () {
            const client = { _id: "u/456", is_admin: true };
            const repoData = getValidRepoData();

            const result = globus.deleteAllocation(client, repoData, null);

            expect(result.ok).to.be.false;
            expect(result.error.code).to.equal(error.ERR_INVALID_PARAM);
            expect(result.error.message).to.include(
                "Subject ID is required for allocation deletion",
            );
        });

        it("unit_repository_globus: should reject deletion with undefined subject ID", function () {
            const client = { _id: "u/456", is_admin: true };
            const repoData = getValidRepoData();

            const result = globus.deleteAllocation(client, repoData, undefined);

            expect(result.ok).to.be.false;
            expect(result.error.code).to.equal(error.ERR_INVALID_PARAM);
            expect(result.error.message).to.include(
                "Subject ID is required for allocation deletion",
            );
        });

        it("unit_repository_globus: should reject deletion with empty string subject ID", function () {
            const client = { _id: "u/456", is_admin: true };
            const repoData = getValidRepoData();

            const result = globus.deleteAllocation(client, repoData, "");

            expect(result.ok).to.be.false;
            expect(result.error.code).to.equal(error.ERR_INVALID_PARAM);
            expect(result.error.message).to.include(
                "Subject ID is required for allocation deletion",
            );
        });

        it("unit_repository_globus: should reject deletion with non-string subject ID", function () {
            const client = { _id: "u/456", is_admin: true };
            const repoData = getValidRepoData();

            const result = globus.deleteAllocation(client, repoData, 12345);

            expect(result.ok).to.be.false;
            expect(result.error.code).to.equal(error.ERR_INVALID_PARAM);
            expect(result.error.message).to.include(
                "Subject ID is required for allocation deletion",
            );
        });
    });

    describe("unit_repository_globus: supportsDataOperations", function () {
        it("unit_repository_globus: should always return true for Globus repositories", function () {
            const repoData = getValidRepoData();
            const result = globus.supportsDataOperations(repoData);
            expect(result.ok).to.be.true;
            expect(result.value).to.be.true;
        });

        it("unit_repository_globus: should return true even for incomplete repository data", function () {
            const repoData = { _id: "repo/123" };
            const result = globus.supportsDataOperations(repoData);
            expect(result.ok).to.be.true;
            expect(result.value).to.be.true;
        });
    });

    describe("unit_repository_globus: getCapacityInfo", function () {
        it("unit_repository_globus: should return capacity information for repository", function () {
            const repoData = getValidRepoData();
            const result = globus.getCapacityInfo(repoData);

            expect(result.ok).to.be.true;
            expect(result.value).to.have.property("total_capacity", repoData.capacity);
            expect(result.value).to.have.property("used_capacity", 0);
            expect(result.value).to.have.property("available_capacity", repoData.capacity);
            expect(result.value).to.have.property("supports_quotas", true);
        });

        it("unit_repository_globus: should handle repository without capacity field", function () {
            const repoData = {
                _id: "repo/123",
                title: "Test Repository",
            };
            const result = globus.getCapacityInfo(repoData);

            expect(result.ok).to.be.true;
            expect(result.value).to.have.property("total_capacity", undefined);
            expect(result.value).to.have.property("available_capacity", undefined);
        });

        it("unit_repository_globus: should handle error during capacity retrieval", function () {
            // Create a repository object that will throw when accessing capacity
            const repoData = {};
            Object.defineProperty(repoData, "capacity", {
                get() {
                    throw new Error("Capacity access failed");
                },
            });

            const result = globus.getCapacityInfo(repoData);

            expect(result.ok).to.be.false;
            expect(result.error.code).to.equal(error.ERR_INTERNAL_FAULT);
            expect(result.error.message).to.include("Failed to get capacity info");
            expect(result.error.message).to.include("Capacity access failed");
        });
    });
});
