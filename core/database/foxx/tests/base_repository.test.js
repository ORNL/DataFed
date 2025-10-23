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

    it("should return error for unimplemented validate()", function () {
        const validate_result = TestRepo.validate({});
        expect(validate_result.ok).to.be.false;
        expect(validate_result.error.code).to.equal(error.ERR_INVALID_OPERATION);
    });
});
