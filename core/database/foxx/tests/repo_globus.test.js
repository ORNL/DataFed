"use strict";

const { expect } = require("chai");
const { Result } = require("../api/models/repositories/types");
const { ExecutionMethod } = require("../api/lib/execution_types");
const { GlobusRepo } = require("../api/models/repositories/repository/globus");
const g_tasks = require("../api/tasks");
const error = require("../api/lib/error_codes");
const g_lib = require("../api/support");
const g_db = require("@arangodb").db;

describe("unit_repository_globus: Globus Repository Operations", function () {
    beforeEach(function () {
        const collections = [
            "d",
            "block",
            "alloc",
            "loc",
            "lock",
            "repo",
            "admin",
            "task",
            "g",
            "p",
            "u",
        ];
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
    function getValidRawRepoData() {
        return {
            _id: "repo/123",
            _key: "123",
            title: "Test Globus Repository",
            capacity: 5000000000,
            pub_key: "{Yys%Fr7VBct5AilOs$SnW%k$Qm[DBwvGeS0MQ46",
            address: "burning-fast-repo.org",
            endpoint: "8b7f1c4e-3d4a-4d6a-9a76-9e4b3e95b7b8",
            domain: "fire",
            path: "/one/repo/to/rule/them/all/123",
        };
    }

    function getRawAllocationCreateTask() {
        return {
            _id: "task/43",
            _key: "43",
            status: 0,
            msg: "Running",
            client: "u456",
            type: g_lib.TT_ALLOC_CREATE,
        };
    }

    function getRawDataPutTask() {
        return {
            _id: "task/43",
            _key: "43",
            status: 0,
            msg: "Running",
            client: "u456",
            type: g_lib.TT_DATA_PUT,
        };
    }

    function getRawBlockingAllocationLock() {
        return {
            _id: "lock/31",
            _key: "31",
            _from: "task/43",
            _to: "repo/123",
            level: 1,
            context: "u/456",
        };
    }

    function getValidRepoData() {
        return {
            id: "repo/123",
            key: "123",
            title: "Test Globus Repository",
            capacity: 5000000000,
            pub_key: "{Yys%Fr7VBct5AilOs$SnW%k$Qm[DBwvGeS0MQ46",
            address: "burning-fast-repo.org",
            endpoint: "8b7f1c4e-3d4a-4d6a-9a76-9e4b3e95b7b8",
            domain: "fire",
            path: "/one/repo/to/rule/them/all/123",
        };
    }

    function getValidRawUserData() {
        return {
            _id: "u/456",
            _key: "456",
            name: "Bobby",
        };
    }

    function getValidRawAllocationData() {
        return {
            _id: "alloc/989",
            _key: "989",
            _from: "u/456",
            _to: "repo/123",
            subject: "u/456",
            data_limit: 1000000000,
            rec_limit: 1000000,
        };
    }

    function getValidAllocationParams() {
        return {
            client: {
                _id: "u/456",
                is_admin: false,
            },
            subject: "u/456",
            data_limit: 1000000000,
            rec_limit: 1000000,
        };
    }

    describe("unit_repository_globus: validate", function () {
        it("unit_repository_globus: should always return ok for valid repository data", function () {
            const result = GlobusRepo.validate(getValidRepoData());
            expect(result.ok).to.be.true;
            expect(result.value).to.be.true;
        });

        it("unit_repository_globus: should return ok even for incomplete repository data", function () {
            const repoData = { _id: "repo/123" };
            const result = GlobusRepo.validate(repoData);
            expect(result.ok).to.be.true;
        });

        it("unit_repository_globus: should return ok for null repository data", function () {
            const result = GlobusRepo.validate(null);
            expect(result.ok).to.be.true;
        });
    });

    describe("unit_repository_globus: createAllocation", function () {
        it("unit_repository_globus: should fail to create allocation without admin role", function () {
            const repoData = getValidRepoData();
            const params = getValidAllocationParams();
            const repoRawData = getValidRawRepoData();
            g_db.repo.save(repoRawData);
            g_db.u.save(getValidRawUserData());

            const globus_repo = new GlobusRepo(repoData).value;
            const result = globus_repo.createAllocation(params);

            expect(result.ok).to.be.false;
            expect(result.error.message).to.include(
                "Client, 'u/456', does not have administrative repository permissions on repo/123",
            );
        });

        it("unit_repository_globus: should fail to create allocation if a duplicate task is found", function () {
            const repoData = getValidRepoData();
            const params = getValidAllocationParams();
            const repoRawData = getValidRawRepoData();
            g_db.repo.save(repoRawData);
            g_db.u.save(getValidRawUserData());
            g_db.admin.save({
                _from: repoRawData._id,
                _to: params.client._id,
            });
            g_db.task.save(getRawAllocationCreateTask());
            g_db.lock.save(getRawBlockingAllocationLock());
            const globus_repo = new GlobusRepo(repoData).value;
            const result = globus_repo.createAllocation(params);

            expect(result.ok).to.be.false;
            expect(result.error.message).to.include(
                "A duplicate allocation create task was found: task/43",
            );
        });

        it("unit_repository_globus: should be blocked by previous Data put task", function () {
            const repoData = getValidRepoData();
            const params = getValidAllocationParams();
            const repoRawData = getValidRawRepoData();
            g_db.repo.save(repoRawData);
            g_db.u.save(getValidRawUserData());
            g_db.admin.save({
                _from: repoRawData._id,
                _to: params.client._id,
            });
            g_db.task.save(getRawDataPutTask());
            g_db.lock.save(getRawBlockingAllocationLock());
            const globus_repo = new GlobusRepo(repoData).value;
            const result = globus_repo.createAllocation(params);

            expect(result.ok).to.be.true;
            expect(result.value).to.have.property("id");
            expect(result.value).to.have.property("repo_id", repoData.id);
            expect(result.value).to.have.property("subject", params.subject);
            expect(result.value).to.have.property("task_id");
            expect(result.value).to.have.property("status", g_lib.TS_BLOCKED);
            expect(result.value).to.have.property("state");
            expect(result.value).to.have.property("queue_time");
        });

        it("unit_repository_globus: should create allocation with valid parameters", function () {
            const repoData = getValidRepoData();
            const params = getValidAllocationParams();
            const repoRawData = getValidRawRepoData();
            g_db.repo.save(repoRawData);
            g_db.u.save(getValidRawUserData());

            g_db.admin.save({
                _from: repoRawData._id,
                _to: params.client._id,
            });

            const globus_repo = new GlobusRepo(repoData).value;
            const result = globus_repo.createAllocation(params);

            expect(result.ok).to.be.true;
            expect(result.value).to.have.property("id");
            expect(result.value).to.have.property("repo_id", repoData.id);
            expect(result.value).to.have.property("subject", params.subject);
            expect(result.value).to.have.property("task_id");
            expect(result.value).to.have.property("status", g_lib.TS_READY);
            expect(result.value).to.have.property("state");
            expect(result.value).to.have.property("queue_time");
        });

        it("unit_repository_globus: missing rec_limit should throw.", function () {
            const repoData = getValidRepoData();
            const params = getValidAllocationParams();
            delete params.rec_limit;
            const repoRawData = getValidRawRepoData();
            g_db.repo.save(repoRawData);
            g_db.u.save(getValidRawUserData());

            g_db.admin.save({
                _from: repoRawData._id,
                _to: params.client._id,
            });

            const globus_repo = new GlobusRepo(repoData).value;
            const result = globus_repo.createAllocation(params);
            expect(result.ok).to.be.false;
            expect(result.error.message).to.include("Allocation rec_limit must be a number");
        });

        it("unit_repository_globus: should reject allocation with missing subject", function () {
            const repoData = getValidRepoData();
            const params = getValidAllocationParams();
            delete params.subject;
            const repoRawData = getValidRawRepoData();
            g_db.repo.save(repoRawData);
            g_db.u.save(getValidRawUserData());

            g_db.admin.save({
                _from: repoRawData._id,
                _to: params.client._id,
            });

            const globus_repo = new GlobusRepo(repoData).value;
            const result = globus_repo.createAllocation(params);

            expect(result.ok).to.be.false;
            expect(result.error.message).to.include("Allocation subject is required");
        });
    });

    describe("unit_repository_globus: deleteAllocation", function () {
        it("unit_repository_globus: should delete allocation with valid subject ID", function () {
            const repoData = getValidRepoData();
            const repoRawData = getValidRawRepoData();
            const userRawData = getValidRawUserData();
            g_db.repo.save(repoRawData);
            g_db.u.save(userRawData);

            g_db.admin.save({
                _from: repoRawData._id,
                _to: userRawData._id,
            });
            g_db.alloc.save(getValidRawAllocationData());

            const globus_repo = new GlobusRepo(repoData).value;

            const result = globus_repo.deleteAllocation(
                { _id: userRawData._id, is_admin: false },
                userRawData._id,
            );

            expect(result.ok).to.be.true;
            expect(result.value).to.have.property("execution_method", ExecutionMethod.DEFERRED);
            expect(result.value.task).to.have.property("_id");
            expect(result.value.task).to.have.property("msg", "Pending");
            expect(result.value.task).to.have.property("type", g_lib.TT_ALLOC_DEL);
            expect(result.value.task).to.have.property("ct");
            expect(result.value.task).to.have.property("ut");
            expect(result.value.task).to.have.property("status", g_lib.TS_READY);
            expect(result.value.task).to.have.property("step", 0);
            expect(result.value.task).to.have.property("steps", 2);
        });

        it("unit_repository_globus: should delete allocation with valid system level admin permissions.", function () {
            const repoData = getValidRepoData();
            const repoRawData = getValidRawRepoData();
            const userRawData = getValidRawUserData();
            g_db.repo.save(repoRawData);
            g_db.u.save(userRawData);

            g_db.alloc.save(getValidRawAllocationData());

            const globus_repo = new GlobusRepo(repoData).value;

            const result = globus_repo.deleteAllocation(
                { _id: userRawData._id, is_admin: true },
                userRawData._id,
            );

            expect(result.ok).to.be.true;
            expect(result.value).to.have.property("execution_method", ExecutionMethod.DEFERRED);
            expect(result.value.task).to.have.property("_id");
            expect(result.value.task).to.have.property("msg", "Pending");
            expect(result.value.task).to.have.property("type", g_lib.TT_ALLOC_DEL);
            expect(result.value.task).to.have.property("ct");
            expect(result.value.task).to.have.property("ut");
            expect(result.value.task).to.have.property("status", g_lib.TS_READY);
            expect(result.value.task).to.have.property("step", 0);
            expect(result.value.task).to.have.property("steps", 2);
        });

        it("unit_repository_globus: should reject deletion with null subject ID", function () {
            const repoData = getValidRepoData();
            const repoRawData = getValidRawRepoData();
            const userRawData = getValidRawUserData();
            g_db.repo.save(repoRawData);
            g_db.u.save(userRawData);

            g_db.admin.save({
                _from: repoRawData._id,
                _to: userRawData._id,
            });
            g_db.alloc.save(getValidRawAllocationData());

            const globus_repo = new GlobusRepo(repoData).value;

            const result = globus_repo.deleteAllocation(
                { _id: userRawData._id, is_admin: false },
                null,
            );

            expect(result.ok).to.be.false;

            expect(result.error.message).to.include(
                "Subject ID is required for allocation deletion",
            );
        });

        it("unit_repository_globus: should reject deletion if client does not have permissions", function () {
            const repoData = getValidRepoData();
            const repoRawData = getValidRawRepoData();
            const userRawData = getValidRawUserData();
            g_db.repo.save(repoRawData);
            g_db.u.save(userRawData);

            g_db.alloc.save(getValidRawAllocationData());

            const globus_repo = new GlobusRepo(repoData).value;

            const result = globus_repo.deleteAllocation(
                { _id: userRawData._id, is_admin: false },
                userRawData._id,
            );

            expect(result.ok).to.be.false;
            expect(result.error.message).to.include(
                "Failed to create allocation task: Client, 'u/456', does not have administrative repository permissions on repo/123",
            );
        });

        it("unit_repository_globus: should reject allocation deletion when allocation does not exist", function () {
            const repoData = getValidRepoData();
            const repoRawData = getValidRawRepoData();
            const userRawData = getValidRawUserData();
            g_db.repo.save(repoRawData);
            g_db.u.save(userRawData);

            g_db.admin.save({
                _from: repoRawData._id,
                _to: userRawData._id,
            });

            const globus_repo = new GlobusRepo(repoData).value;

            const result = globus_repo.deleteAllocation(
                { _id: userRawData._id, is_admin: false },
                userRawData._id,
            );

            expect(result.ok).to.be.false;
            expect(result.error.message).to.include(
                "Failed to create allocation task: Subject, \'u/456\', has no allocation on repo/123",
            );
        });

        it("unit_repository_globus: should reject duplicate allocation deletion.", function () {
            const repoData = getValidRepoData();
            const repoRawData = getValidRawRepoData();
            const userRawData = getValidRawUserData();
            g_db.repo.save(repoRawData);
            g_db.u.save(userRawData);

            g_db.alloc.save(getValidRawAllocationData());
            g_db.admin.save({
                _from: repoRawData._id,
                _to: userRawData._id,
            });

            const globus_repo = new GlobusRepo(repoData).value;

            globus_repo.deleteAllocation(
                { _id: userRawData._id, is_admin: false },
                userRawData._id,
            );
            const result = globus_repo.deleteAllocation(
                { _id: userRawData._id, is_admin: false },
                userRawData._id,
            );

            expect(result.ok).to.be.false;
            expect(result.error.message).to.include(
                "Failed to create allocation task: A duplicate allocation delete task was found: task/",
            );
        });
    });

    describe("unit_repository_globus: supportsDataOperations", function () {
        it("unit_repository_globus: should always return true for Globus repositories", function () {
            const repoData = getValidRepoData();
            const globus_repo = new GlobusRepo(repoData).value;
            const result = globus_repo.supportsDataOperations(repoData);
            expect(result.ok).to.be.true;
            expect(result.value).to.be.true;
        });

        it("unit_repository_globus: should return true even for incomplete repository data", function () {
            const repoData = { _id: "repo/123" };
            const globus_repo = new GlobusRepo(repoData).value;
            const result = globus_repo.supportsDataOperations(repoData);
            expect(result.ok).to.be.true;
            expect(result.value).to.be.true;
        });
    });

    describe("unit_repository_globus: getCapacityInfo", function () {
        it("unit_repository_globus: should return capacity information for repository", function () {
            const repoData = getValidRepoData();
            const globus_repo = new GlobusRepo(repoData).value;
            const result = globus_repo.getCapacityInfo(repoData);

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
            const globus_repo = new GlobusRepo(repoData).value;
            const result = globus_repo.getCapacityInfo(repoData);

            expect(result.ok).to.be.true;
            expect(result.value).to.have.property("total_capacity", undefined);
            expect(result.value).to.have.property("available_capacity", undefined);
        });
    });
});
