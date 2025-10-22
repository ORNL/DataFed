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
});
