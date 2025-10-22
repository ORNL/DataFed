"use strict";

const { expect } = require("chai");
const { BaseRepository } = require("../api/models/repositories/base_repository");
const g_db = require("@arangodb").db;
const error = require("../api/lib/error_codes");
const permissions = require("../api/lib/permissions");

class TestRepo extends BaseRepository {
    constructor(config) {
        return super(config, {});
    }
}

describe("unit_base_repository: Base Repository tests", function () {
    beforeEach(() => {
        const collections = ["repo", "admin", "u"];
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
            title: "THE Repository",
            capacity: 0,
            desc: "A large description about the repository.",
        };
    }
    function getValidRawRepoData() {
        return {
            _id: "repo/123",
            _key: "123",
            title: "THE Repository",
            capacity: 0,
            desc: "A large description about the repository.",
        };
    }
    function getValidRepoDataNoIdKey() {
        return {
            title: "THE Repository",
            capacity: 0,
            desc: "A large description about the repository.",
        };
    }

    it("should save a repository successfully", function () {
        const repoConfig = getValidRepoDataNoIdKey();
        const result = new TestRepo(repoConfig);
        const repo = result.value;
        const save_result = repo.save();

        expect(save_result.ok).to.equal(true);
        const savedRepo = save_result.value;
        console.log("Saved repo");
        console.log(savedRepo);
        expect(savedRepo).to.have.property("_key");

        // verify it exists in DB
        expect(savedRepo.title).to.equal("THE Repository");
    });

    it("should update a repository successfully", function () {
        const repoConfig = getValidRepoDataNoIdKey();
        const result = new TestRepo(repoConfig);
        const repo = result.value;
        repo.save();

        const update_result = result.value.update({ title: "Updated Repo" });
        expect(update_result.ok).to.equal(true);
        const updated = update_result.value;

        expect(updated.title).to.equal("Updated Repo");
    });

    it("should return Result.err when updating non-existent repo", function () {
        const result = new TestRepo(getValidRepoDataNoIdKey());

        const update_result = result.value.update({ title: "Should Fail" });
        console.log("Update result is");
        console.log(update_result);
        expect(update_result.ok).to.be.false;
        expect(update_result.error.message).to.match(
            /Failed to update repository, repository document was not found \(repo\/undefined\)/,
        );
    });
    //
    //    it("should check permission for admin in admins array", function () {
    //        const repoConfig = getValidRepoDataNoIdKey();
    //        const result = new TestRepo(repoConfig);
    //        const repo = result.value;
    //        repo.save();
    //
    //        const check_result = result.value.checkPermission("u/awesome_admin", "admin");
    //        expect(check_result.ok).to.be.true;
    //        expect(check_result.value).to.be.true;
    //    });
    //
    //    it("should check permission for system admin", function () {
    //        // create a system admin user
    //        g_db.u.save({ _key: "system_admin", is_admin: true });
    //
    //        const repoConfig = getValidRepoDataNoIdKey();
    //        const result = new TestRepo(repoConfig);
    //        result.value.save();
    //
    //        const check_result = result.value.checkPermission("u/system_admin", "admin");
    //        expect(check_result.ok).to.be.true;
    //        expect(check_result.value).to.be.true;
    //    });
    //
    //    it("should deny permission for normal user", function () {
    //        g_db.u.save({ _key: "user2", is_admin: false });
    //
    //        const repoConfig = getValidRepoDataNoIdKey();
    //        const result = new TestRepo(repoConfig);
    //        const repo = result.value;
    //        const result_of_save = repo.save();
    //
    //        const check_result = repo.checkPermission("u/user2", "admin");
    //        expect(check_result.ok).to.be.true;
    //        expect(check_result.value).to.be.false;
    //    });

    it("should return error for unimplemented validate()", function () {
        const validate_result = TestRepo.validate({});
        expect(validate_result.ok).to.be.false;
        expect(validate_result.error.code).to.equal(error.ERR_INVALID_OPERATION);
    });
});
