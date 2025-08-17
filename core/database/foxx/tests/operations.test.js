"use strict";

const { expect } = require("chai");
const { RepositoryOps } = require("../api/repository/operations");
const { RepositoryType } = require("../api/repository/types");
const g_db = require("@arangodb").db;

describe("RepositoryOps lazy migration", function () {
    beforeEach(function () {
        g_db.repo.truncate();
    });

    it("should default type to 'globus' when finding repo without type field", function () {
        g_db.repo.save({
            _key: "test-legacy",
            title: "Legacy Repository",
            capacity: 1000000,
            pub_key: "test-key",
            address: "test-address",
            endpoint: "test-endpoint",
            path: "/data/repos/test-legacy",
            domain: "example.com",
        });

        const result = RepositoryOps.find("test-legacy");

        expect(result.ok).to.be.true;
        expect(result.value.type).to.equal(RepositoryType.GLOBUS);
        expect(result.value.data._key).to.equal("test-legacy");
    });

    it("should preserve existing type when updating repository", function () {
        g_db.repo.save({
            _key: "test-typed",
            type: RepositoryType.GLOBUS,
            title: "Typed Repository",
            capacity: 1000000,
        });

        const findResult = RepositoryOps.find("test-typed");
        expect(findResult.ok).to.be.true;

        const updateResult = RepositoryOps.update(findResult.value, {
            title: "Updated Title",
        });

        expect(updateResult.ok).to.be.true;
        expect(updateResult.value.type).to.equal(RepositoryType.GLOBUS);
        expect(updateResult.value.title).to.equal("Updated Title");
    });

    it("should add type field during update if missing", function () {
        g_db.repo.save({
            _key: "test-migration",
            title: "Repository for Migration",
            capacity: 500000,
        });

        const beforeUpdate = g_db.repo.document("test-migration");
        expect(beforeUpdate.type).to.be.undefined;

        const findResult = RepositoryOps.find("test-migration");
        const updateResult = RepositoryOps.update(findResult.value, {
            capacity: 600000,
        });

        expect(updateResult.ok).to.be.true;

        const afterUpdate = g_db.repo.document("test-migration");
        expect(afterUpdate.type).to.equal(RepositoryType.GLOBUS);
        expect(afterUpdate.capacity).to.equal(600000);
    });

    it("should handle repository ID with or without 'repo/' prefix", function () {
        g_db.repo.save({
            _key: "test-prefix",
            title: "Prefix Test Repository",
            capacity: 1000000,
        });

        const result1 = RepositoryOps.find("test-prefix");
        expect(result1.ok).to.be.true;
        expect(result1.value.data._key).to.equal("test-prefix");

        const result2 = RepositoryOps.find("repo/test-prefix");
        expect(result2.ok).to.be.true;
        expect(result2.value.data._key).to.equal("test-prefix");
    });

    it("should return error for non-existent repository", function () {
        const result = RepositoryOps.find("non-existent-repo");

        expect(result.ok).to.be.false;
        expect(result.error).to.exist;
        expect(result.error.code).to.equal(404);
        expect(result.error.message).to.include("Repository not found");
    });

    it("should handle database errors gracefully", function () {
        const result = RepositoryOps.find("");

        expect(result.ok).to.be.false;
        expect(result.error).to.exist;
        expect(result.error.code).to.be.a("number");
    });

    it("should preserve explicitly provided type during update", function () {
        // Create repo without type
        g_db.repo.save({
            _key: "test-explicit",
            title: "Test Explicit Type",
            capacity: 100000,
        });

        const findResult = RepositoryOps.find("test-explicit");
        expect(findResult.ok).to.be.true;

        const updateResult = RepositoryOps.update(findResult.value, {
            type: "metadata_only",
            capacity: 200000,
        });

        expect(updateResult.ok).to.be.true;

        const updated = g_db.repo.document("test-explicit");
        expect(updated.type).to.equal("metadata_only");
        expect(updated.capacity).to.equal(200000);
    });
});
