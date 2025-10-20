"use strict";

const { expect } = require("chai");
const { Result } = require("../api/models/repositories/types");
const {
    validateNonEmptyString,
    validateCommonFields,
    validatePOSIXPath,
    validateRepositoryPath,
} = require("../api/models/repositories/validation");

describe("unit_validation_repository: Repository Validation Tests", function () {
    describe("unit_validation_repository: validateNonEmptyString", function () {
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

    describe("unit_validation_repository: validateCommonFields", function () {
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

    describe("unit_validation_repository: validatePOSIXPath", function () {
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

    describe("unit_validation_repository: validateRepositoryPath", function () {
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
});
