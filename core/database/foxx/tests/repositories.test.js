"use strict";

const { expect } = require("chai");
const { Repositories } = require("../api/models/repositories/repositories"); // adjust path if needed
const { RepositoryType, Result } = require("../api/models/repositories/types");
const error = require("../api/lib/error_codes");
const g_db = require("@arangodb").db;

// Mock imports if needed (adjust to your actual repo)
const { createRepository } = require("../api/models/repositories/types");
const { GlobusRepo } = require("../api/models/repositories/repository/globus");
const { MetadataRepo } = require("../api/models/repositories/repository/metadata");

describe("integration_repositories: Repository Factory and Operations", function () {
    const repositories = new Repositories();

    beforeEach(() => {
        const collections = ["repo", "d", "alloc", "loc", "admin", "g", "p", "u"];
        collections.forEach((name) => {
            let col = g_db._collection(name);
            if (col) {
                col.truncate();
            } else {
                g_db._create(name);
            }
        });
    });

    function getValidGlobusConfig() {
        return {
            id: "repo/123",
            type: RepositoryType.GLOBUS,
            title: "Globus Repo",
            desc: "Valid globus repo",
            capacity: 1000,
            admins: ["u/admin"],
            endpoint: "XXXXYYYY-XXXX-YYYY-XXXX-YYYYXXXXYYYY",
            path: "/data/123",
            pub_key: "ABC123",
            address: "tcp://localhost:5555",
            exp_path: "/export",
        };
    }

    function getValidMetadataConfig() {
        return {
            id: "repo/456",
            type: RepositoryType.METADATA,
            title: "Metadata Repo",
            desc: "Valid metadata repo",
            capacity: 0,
            admins: ["u/bob"],
        };
    }

    describe("integration_repositories: createRepositoryByType()", function () {
        it("should create a valid GLOBUS repository", function () {
            const result = Repositories.createRepositoryByType(getValidGlobusConfig());
            console.log("result is");
            console.log(result);
            expect(result.ok).to.be.true;
            expect(result.value).to.exist;
            expect(result.value.type()).to.equal("globus");
        });

        it("should create a valid METADATA repository", function () {
            const result = Repositories.createRepositoryByType(getValidMetadataConfig());
            expect(result.ok).to.be.true;
            expect(result.value).to.exist;
            expect(result.value.type()).to.equal("metadata");
        });

        it("should fail if required fields are missing", function () {
            const invalid = { type: RepositoryType.GLOBUS };
            const result = Repositories.createRepositoryByType(invalid);
            expect(result.ok).to.be.false;
            expect(result.error.code).to.equal(error.ERR_INVALID_PARAM);
            expect(result.error.message).to.include("Missing required repository fields");
        });

        it("should fail for unknown repository type", function () {
            const invalid = {
                id: "repo/999",
                type: "UNKNOWN_TYPE",
                title: "Invalid Repo",
                capacity: 1000,
                admins: ["u/admin"],
            };
            const result = Repositories.createRepositoryByType(invalid);
            expect(result.ok).to.be.false;
            expect(result.error.message).to.include("Unknown repository type");
        });
    });

    //    describe("unit_repository_factory: find()", function () {
    //        it("should return repository by id", function () {
    //            const repoData = {
    //                _id: "repo/123",
    //                _key: "123",
    //                type: RepositoryType.GLOBUS,
    //                title: "Test Globus",
    //            };
    //            g_db.repo.save(repoData);
    //
    //            const result = repositories.find("repo/123");
    //            expect(result.ok).to.be.true;
    //            expect(result.value.type).to.equal(RepositoryType.GLOBUS);
    //            expect(result.value.data._id).to.equal("repo/123");
    //        });
    //
    //        it("should handle missing repository", function () {
    //            const result = repositories.find("repo/missing");
    //            expect(result.ok).to.be.false;
    //            expect(result.error.code).to.equal(404);
    //            expect(result.error.message).to.include("Repository not found");
    //        });
    //    });
    //
    //    describe("unit_repository_factory: list()", function () {
    //        beforeEach(() => {
    //            g_db.repo.save({
    //                _id: "repo/1",
    //                _key: "1",
    //                type: RepositoryType.GLOBUS,
    //                admins: ["u/admin"],
    //            });
    //            g_db.repo.save({
    //                _id: "repo/2",
    //                _key: "2",
    //                type: RepositoryType.METADATA,
    //                admins: ["u/bob"],
    //            });
    //        });
    //
    //        it("should list all repositories when no filter is provided", function () {
    //            const result = repositories.list();
    //            expect(result.ok).to.be.true;
    //            expect(result.value).to.have.lengthOf(2);
    //        });
    //
    //        it("should filter repositories by type", function () {
    //            const result = repositories.list({ type: RepositoryType.METADATA });
    //            expect(result.ok).to.be.true;
    //            expect(result.value).to.have.lengthOf(1);
    //            expect(result.value[0].type).to.equal(RepositoryType.METADATA);
    //        });
    //
    //        it("should filter repositories by admin", function () {
    //            const result = repositories.list({ admin: "u/admin" });
    //            expect(result.ok).to.be.true;
    //            expect(result.value).to.have.lengthOf(1);
    //            expect(result.value[0].data.admins).to.include("u/admin");
    //        });
    //
    //        it("should return error if query fails", function () {
    //            // Simulate an error by mocking _query
    //            const origQuery = g_db._query;
    //            g_db._query = () => { throw { errorNum: 500, errorMessage: "Query failed" }; };
    //
    //            const result = repositories.list();
    //            expect(result.ok).to.be.false;
    //            expect(result.error.message).to.include("Query failed");
    //
    //            g_db._query = origQuery; // restore
    //        });
    //    });
});
