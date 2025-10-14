"use strict";

const { expect } = require("chai");
const sinon = require("sinon");
const { Result } = require("../api/repository/types");
const { ExecutionMethod } = require("../api/lib/execution_types");
const metadata = require("../api/repository/metadata");
const g_tasks = require("../api/tasks");
const g_db = require("@arangodb").db;
const error = require("../api/lib/error_codes");

describe("unit_repository_metadata: Metadata Only Repository Operations", function () {
    beforeEach(() => {
        g_db.d.truncate();
        g_db.alloc.truncate();
        g_db.loc.truncate();
        g_db.repo.truncate();
        g_db.admin.truncate();
        g_db.u.truncate();
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
        }
    }

    function getValidAllocationParams() {
        return {
            client: { 
              _id: "u/456",
              is_admin: false
            },
            subject: "u/456",
            rec_limit: 10000, 
            data_limit: 0,
        };
    }

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
            expect(result.error.message).to.include("Failed to create metadata allocation: Repo, 'repo/123', does not exist.");
        });

        it("unit_repository_metadata: should create allocation with valid parameters", function () {
            const repoData = getValidRepoData();
            const userData = getValidUserData();
            const params = getValidAllocationParams();

            g_db.repo.save(repoData);
            g_db.u.save(userData);
            g_db.admin.save({
               _from: repoData._id,
               _to: params.client._id
            });

            console.log("repos");
            console.log(g_db.repo.toArray());
            console.log("users");
            console.log(g_db.u.toArray());
            console.log("Create Allocation!!!!");
            const rv = metadata.createAllocation(repoData, params);

            console.log("return value is ");
            console.log(rv);
            expect(rv.ok).to.be.true;
            expect(rv.value.result).to.have.property("id");
            expect(rv.value.result).to.have.property("repo_id", repoData._id);
            expect(rv.value.result).to.have.property("subject", params.subject);
            expect(rv.value.result).to.have.property("rec_limit", params.rec_limit);

        });
    });

});
