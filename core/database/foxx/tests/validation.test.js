"use strict";

const { expect } = require("chai");
const { Result } = require("../api/repository/types");
const {
    validateNonEmptyString,
    validateCommonFields,
    validatePOSIXPath,
    validateRepositoryPath,
    validateGlobusConfig,
    validateMetadataConfig,
    validateAllocationParams,
} = require("../api/repository/validation");

describe("Repository Validation Tests", function () {
    describe("Result Type", function () {
        it("should create ok result", function () {
            const result = Result.ok("success");
            expect(result.ok).to.be.true;
            expect(result.value).to.equal("success");
            expect(result.error).to.be.undefined;
        });

        it("should create error result", function () {
            const result = Result.err({ code: 1, message: "error" });
            expect(result.ok).to.be.false;
            expect(result.error).to.deep.equal({ code: 1, message: "error" });
            expect(result.value).to.be.undefined;
        });
    });

    describe("validateNonEmptyString", function () {
        it("should accept valid non-empty strings", function () {
            const result = validateNonEmptyString("valid string", "Test field");
            expect(result.ok).to.be.true;
        });

        it("should reject null values", function () {
            const result = validateNonEmptyString(null, "Test field");
            expect(result.ok).to.be.false;
            expect(result.error.message).to.include("Test field is required");
        });

        it("should reject empty strings", function () {
            const result = validateNonEmptyString("", "Test field");
            expect(result.ok).to.be.false;
            expect(result.error.message).to.include("Test field is required");
        });

        it("should reject whitespace-only strings", function () {
            const result = validateNonEmptyString("   ", "Test field");
            expect(result.ok).to.be.false;
            expect(result.error.message).to.include("Test field is required");
        });

        it("should reject non-string values", function () {
            const result = validateNonEmptyString(123, "Test field");
            expect(result.ok).to.be.false;
            expect(result.error.message).to.include("Test field is required");
        });
    });

    describe("validateCommonFields", function () {
        it("should accept valid common fields", function () {
            const config = {
                id: "test-repo",
                title: "Test Repository",
                capacity: 1000000,
                admins: ["user1", "user2"],
            };
            const result = validateCommonFields(config);
            expect(result.ok).to.be.true;
        });

        it("should reject missing id", function () {
            const config = {
                title: "Test Repository",
                capacity: 1000000,
                admins: ["user1"],
            };
            const result = validateCommonFields(config);
            expect(result.ok).to.be.false;
            expect(result.error.message).to.include("Repository ID is required");
        });

        it("should reject missing title", function () {
            const config = {
                id: "test-repo",
                capacity: 1000000,
                admins: ["user1"],
            };
            const result = validateCommonFields(config);
            expect(result.ok).to.be.false;
            expect(result.error.message).to.include("Repository title is required");
        });

        it("should reject zero or negative capacity", function () {
            const config = {
                id: "test-repo",
                title: "Test Repository",
                capacity: 0,
                admins: ["user1"],
            };
            const result = validateCommonFields(config);
            expect(result.ok).to.be.false;
            expect(result.error.message).to.include(
                "Repository capacity must be a positive number",
            );
        });

        it("should reject empty admins array", function () {
            const config = {
                id: "test-repo",
                title: "Test Repository",
                capacity: 1000000,
                admins: [],
            };
            const result = validateCommonFields(config);
            expect(result.ok).to.be.false;
            expect(result.error.message).to.include("Repository must have at least one admin");
        });

        it("should reject non-array admins", function () {
            const config = {
                id: "test-repo",
                title: "Test Repository",
                capacity: 1000000,
                admins: "user1",
            };
            const result = validateCommonFields(config);
            expect(result.ok).to.be.false;
            expect(result.error.message).to.include("Repository must have at least one admin");
        });
    });

    describe("validatePOSIXPath", function () {
        it("should accept valid absolute paths", function () {
            const result = validatePOSIXPath("/valid/path", "Test path");
            expect(result.ok).to.be.true;
        });

        it("should reject relative paths", function () {
            const result = validatePOSIXPath("relative/path", "Test path");
            expect(result.ok).to.be.false;
            expect(result.error.message).to.include("must be an absolute path");
        });

        it("should reject paths with ..", function () {
            const result = validatePOSIXPath("/path/../other", "Test path");
            expect(result.ok).to.be.false;
            expect(result.error.message).to.include("contains invalid path sequences");
        });

        it("should reject paths with //", function () {
            const result = validatePOSIXPath("/path//other", "Test path");
            expect(result.ok).to.be.false;
            expect(result.error.message).to.include("contains invalid path sequences");
        });

        it("should reject empty paths", function () {
            const result = validatePOSIXPath("", "Test path");
            expect(result.ok).to.be.false;
            expect(result.error.message).to.include("must be a non-empty string");
        });
    });

    describe("validateRepositoryPath", function () {
        it("should accept path ending with repo ID", function () {
            const result = validateRepositoryPath("/data/repos/test-repo", "test-repo");
            expect(result.ok).to.be.true;
        });

        it("should accept path ending with repo ID and trailing slash", function () {
            const result = validateRepositoryPath("/data/repos/test-repo/", "test-repo");
            expect(result.ok).to.be.true;
        });

        it("should reject path not ending with repo ID", function () {
            const result = validateRepositoryPath("/data/repos/other-name", "test-repo");
            expect(result.ok).to.be.false;
            expect(result.error.message).to.include("must end with repository ID (test-repo)");
        });

        it("should inherit POSIX path validation", function () {
            const result = validateRepositoryPath("relative/path/test-repo", "test-repo");
            expect(result.ok).to.be.false;
            expect(result.error.message).to.include("must be an absolute path");
        });
    });

    describe("validateGlobusConfig", function () {
        function getValidGlobusConfig() {
            return {
                id: "test-repo",
                title: "Test Repository",
                capacity: 1000000,
                admins: ["user1"],
                pub_key: "ssh-rsa AAAAB3...",
                address: "server.example.com",
                endpoint: "endpoint-id",
                domain: "example.com",
                path: "/data/repos/test-repo",
            };
        }

        it("should accept valid Globus configuration", function () {
            const config = getValidGlobusConfig();
            const result = validateGlobusConfig(config);
            expect(result.ok).to.be.true;
        });

        it("should accept valid Globus configuration with export path", function () {
            const config = getValidGlobusConfig();
            config.exp_path = "/export/path";
            const result = validateGlobusConfig(config);
            expect(result.ok).to.be.true;
        });

        it("should reject missing public key", function () {
            const config = getValidGlobusConfig();
            delete config.pub_key;
            const result = validateGlobusConfig(config);
            expect(result.ok).to.be.false;
            expect(result.error.message).to.include("Public key is required");
        });

        it("should reject missing address", function () {
            const config = getValidGlobusConfig();
            delete config.address;
            const result = validateGlobusConfig(config);
            expect(result.ok).to.be.false;
            expect(result.error.message).to.include("Address is required");
        });

        it("should reject missing endpoint", function () {
            const config = getValidGlobusConfig();
            delete config.endpoint;
            const result = validateGlobusConfig(config);
            expect(result.ok).to.be.false;
            expect(result.error.message).to.include("Endpoint is required");
        });

        it("should reject missing domain", function () {
            const config = getValidGlobusConfig();
            delete config.domain;
            const result = validateGlobusConfig(config);
            expect(result.ok).to.be.false;
            expect(result.error.message).to.include("Domain is required");
        });

        it("should reject invalid repository path", function () {
            const config = getValidGlobusConfig();
            config.path = "/data/repos/wrong-name";
            const result = validateGlobusConfig(config);
            expect(result.ok).to.be.false;
            expect(result.error.message).to.include("must end with repository ID");
        });

        it("should reject invalid export path", function () {
            const config = getValidGlobusConfig();
            config.exp_path = "relative/path";
            const result = validateGlobusConfig(config);
            expect(result.ok).to.be.false;
            expect(result.error.message).to.include("Export path must be an absolute path");
        });
    });

    describe("validateMetadataConfig", function () {
        function getValidMetadataConfig() {
            return {
                id: "test-repo",
                title: "Test Metadata Repository",
                capacity: 1000000,
                admins: ["user1"],
            };
        }

        it("should accept valid metadata-only configuration", function () {
            const config = getValidMetadataConfig();
            const result = validateMetadataConfig(config);
            expect(result.ok).to.be.true;
        });

        it("should reject configuration with Globus fields", function () {
            const config = getValidMetadataConfig();
            config.pub_key = "ssh-rsa AAAAB3...";
            config.endpoint = "endpoint-id";
            const result = validateMetadataConfig(config);
            expect(result.ok).to.be.false;
            expect(result.error.message).to.include("should not have: pub_key, endpoint");
        });

        it("should reject configuration with path field", function () {
            const config = getValidMetadataConfig();
            config.path = "/data/repos/test-repo";
            const result = validateMetadataConfig(config);
            expect(result.ok).to.be.false;
            expect(result.error.message).to.include("should not have: path");
        });
    });

    describe("validateAllocationParams", function () {
        it("should accept valid allocation parameters", function () {
            const params = {
                subject: "user123",
                size: 1000000,
            };
            const result = validateAllocationParams(params);
            expect(result.ok).to.be.true;
        });

        it("should accept allocation with path", function () {
            const params = {
                subject: "user123",
                size: 1000000,
                path: "/custom/path",
            };
            const result = validateAllocationParams(params);
            expect(result.ok).to.be.true;
        });

        it("should reject missing subject", function () {
            const params = {
                size: 1000000,
            };
            const result = validateAllocationParams(params);
            expect(result.ok).to.be.false;
            expect(result.error.message).to.include("Allocation subject is required");
        });

        it("should reject zero or negative size", function () {
            const params = {
                subject: "user123",
                size: 0,
            };
            const result = validateAllocationParams(params);
            expect(result.ok).to.be.false;
            expect(result.error.message).to.include("Allocation size must be a positive number");
        });

        it("should reject non-string path", function () {
            const params = {
                subject: "user123",
                size: 1000000,
                path: 123,
            };
            const result = validateAllocationParams(params);
            expect(result.ok).to.be.false;
            expect(result.error.message).to.include("Allocation path must be a string");
        });
    });
});
