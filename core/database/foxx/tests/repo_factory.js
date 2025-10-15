"use strict";

const { expect } = require("chai");
const {
    RepositoryType,
    Result,
    createRepository,
    createRepositoryData,
    createGlobusConfig,
} = require("../api/repository/types");
const {
    createRepositoryByType,
    getRepositoryImplementation,
    executeRepositoryOperation,
} = require("../api/repository/factory");
const validation = require("../api/repository/validation");
const globusRepo = require("../api/repository/globus");
const metadataRepo = require("../api/repository/metadata");
const error = require("../api/lib/error_codes");
const g_db = require("@arangodb").db;

describe("unit_factory_repository: Repository Factory Tests", function () {
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
    });

    describe("unit_factory_repository: createRepositoryByType", function () {
        describe("unit_factory_repository: Common validation", function () {
            it("should reject missing id", function () {
                const config = {
                    type: RepositoryType.GLOBUS,
                    title: "Test Repository",
                    capacity: 1000000,
                    admins: ["u/user1"],
                };
                const result = createRepositoryByType(config);
                expect(result.ok).to.be.false;
                expect(result.error.code).to.equal(error.ERR_INVALID_PARAM);
                expect(result.error.message).to.include("Missing required repository fields: id");
            });

            it("should reject missing type", function () {
                const config = {
                    id: "test-repo",
                    title: "Test Repository",
                    capacity: 1000000,
                    admins: ["user1"],
                };
                const result = createRepositoryByType(config);
                expect(result.ok).to.be.false;
                expect(result.error.code).to.equal(error.ERR_INVALID_PARAM);
                expect(result.error.message).to.include("Missing required repository fields: type");
            });

            it("should reject missing title", function () {
                const config = {
                    id: "test-repo",
                    type: RepositoryType.GLOBUS,
                    capacity: 1000000,
                    admins: ["user1"],
                };
                const result = createRepositoryByType(config);
                expect(result.ok).to.be.false;
                expect(result.error.code).to.equal(error.ERR_INVALID_PARAM);
                expect(result.error.message).to.include(
                    "Missing required repository fields: title",
                );
            });

            it("should reject missing capacity", function () {
                const config = {
                    id: "test-repo",
                    type: RepositoryType.GLOBUS,
                    title: "Test Repository",
                    admins: ["user1"],
                };
                const result = createRepositoryByType(config);
                expect(result.ok).to.be.false;
                expect(result.error.code).to.equal(error.ERR_INVALID_PARAM);
                expect(result.error.message).to.include(
                    "Missing required repository fields: capacity",
                );
            });

            it("should reject missing admins", function () {
                const config = {
                    id: "test-repo",
                    type: RepositoryType.GLOBUS,
                    title: "Test Repository",
                    capacity: 1000000,
                };
                const result = createRepositoryByType(config);
                expect(result.ok).to.be.false;
                expect(result.error.code).to.equal(error.ERR_INVALID_PARAM);
                expect(result.error.message).to.include(
                    "Missing required repository fields: admins",
                );
            });

            it("should reject multiple missing fields", function () {
                const config = {
                    type: RepositoryType.GLOBUS,
                    title: "Test Repository",
                };
                const result = createRepositoryByType(config);
                expect(result.ok).to.be.false;
                expect(result.error.code).to.equal(error.ERR_INVALID_PARAM);
                expect(result.error.message).to.include("id");
                expect(result.error.message).to.include("capacity");
                expect(result.error.message).to.include("admins");
            });

            it("should reject unknown repository type", function () {
                const config = {
                    id: "test-repo",
                    type: "UNKNOWN_TYPE",
                    title: "Test Repository",
                    capacity: 1000000,
                    admins: ["user1"],
                };
                const result = createRepositoryByType(config);
                expect(result.ok).to.be.false;
                expect(result.error.code).to.equal(error.ERR_INVALID_PARAM);
                expect(result.error.message).to.include("Unknown repository type: UNKNOWN_TYPE");
            });
        });

        describe("unit_factory_repository: GLOBUS type creation", function () {
            it("should create GLOBUS repository with valid config", function () {
                const config = {
                    id: "test-globus-repo",
                    type: RepositoryType.GLOBUS,
                    title: "Test Globus Repository",
                    desc: "Test description",
                    capacity: 1000000,
                    admins: ["u/harold", "u/marcus"],
                    endpoint: "test-endpoint",
                    path: "/test/path/test-globus-repo",
                    pub_key: "test-key",
                    address: "tcp://localhost:5555",
                    exp_path: "/export/path",
                };

                g_db.u.save({
                    _id: "u/harold",
                    _key: "harold",
                });
                g_db.u.save({
                    _id: "u/marcus",
                    _key: "marcus",
                });

                const result = createRepositoryByType(config);
                console.log(result);
                expect(result.ok).to.be.true;
                expect(result.value).to.exist;
                expect(result.value.type).to.equal(RepositoryType.GLOBUS);
                expect(result.value.data._id).to.equal("repo/test-globus-repo");
                expect(result.value.data.title).to.equal("Test Globus Repository");
                expect(result.value.data.desc).to.equal("Test description");
                expect(result.value.data.capacity).to.equal(1000000);
                expect(result.value.data.admins).to.deep.equal(["u/harold", "u/marcus"]);
                expect(result.value.data.endpoint).to.equal("test-endpoint");
                expect(result.value.data.path).to.equal("/test/path/test-globus-repo");
                expect(result.value.data.pub_key).to.equal("test-key");
                expect(result.value.data.address).to.equal("tcp://localhost:5555");
                expect(result.value.data.exp_path).to.equal("/export/path");
            });

            it("should create GLOBUS repository without optional fields", function () {
                const config = {
                    id: "test-globus-repo",
                    type: RepositoryType.GLOBUS,
                    title: "Test Globus Repository",
                    capacity: 1000000,
                    admins: ["u/harold"],
                    endpoint: "test-endpoint",
                    path: "/test/path/test-globus-repo",
                    pub_key: "test-key",
                    address: "tcp://localhost:5555",
                };

                g_db.u.save({
                    _id: "u/harold",
                    _key: "harold",
                });

                const result = createRepositoryByType(config);

                expect(result.ok).to.be.true;
                expect(result.value).to.exist;
                expect(result.value.type).to.equal(RepositoryType.GLOBUS);
                expect(result.value.data.desc).to.be.undefined;
                expect(result.value.data.exp_path).to.be.undefined;
            });

            it("should fail when GLOBUS validation fails", function () {
                // Mock validation failure
                const validationError = Result.err({
                    code: error.ERR_INVALID_PARAM,
                    message: "Invalid Globus configuration",
                });

                const config = {
                    id: "repo/test-globus-repo",
                    type: RepositoryType.GLOBUS,
                    title: "Test Globus Repository",
                    capacity: -1,
                    admins: ["u/user1"],
                };

                const result = createRepositoryByType(config);

                expect(result.ok).to.be.false;
            });
        });

        describe("unit_factory_repository: METADATA_ONLY type creation", function () {
            it("should create METADATA_ONLY repository with valid config", function () {
                const config = {
                    id: "test-metadata-repo",
                    type: RepositoryType.METADATA_ONLY,
                    title: "Test Metadata Repository",
                    desc: "Test metadata description",
                    capacity: 0,
                    admins: ["u/rob", "u/cody", "u/alex"],
                };

                g_db.u.save({
                    _id: "u/rob",
                    _key: "rob",
                });
                g_db.u.save({
                    _id: "u/cody",
                    _key: "cody",
                });
                g_db.u.save({
                    _id: "u/alex",
                    _key: "alex",
                });
                const result = createRepositoryByType(config);
                console.log(result);
                expect(result.ok).to.be.true;
                expect(result.value).to.exist;
                expect(result.value.type).to.equal(RepositoryType.METADATA_ONLY);
                expect(result.value.data._id).to.equal("repo/test-metadata-repo");
                expect(result.value.data.title).to.equal("Test Metadata Repository");
                expect(result.value.data.desc).to.equal("Test metadata description");
                expect(result.value.data.capacity).to.equal(0);
                expect(result.value.data.admins).to.deep.equal(["u/rob", "u/cody", "u/alex"]);
            });

            it("should create METADATA_ONLY repository without optional description", function () {
                const config = {
                    id: "test-metadata-repo",
                    type: RepositoryType.METADATA_ONLY,
                    title: "Test Metadata Repository",
                    capacity: 0,
                    admins: ["u/david"],
                };

                g_db.u.save({
                    _id: "u/david",
                    _key: "david",
                });

                const result = createRepositoryByType(config);

                expect(result.ok).to.be.true;
                expect(result.value).to.exist;
                expect(result.value.type).to.equal(RepositoryType.METADATA_ONLY);
                expect(result.value.data.desc).to.be.undefined;
            });

            it("should fail when METADATA_ONLY validation fails", function () {
                const config = {
                    id: "test-metadata-repo",
                    type: RepositoryType.METADATA_ONLY,
                    title: "Test Metadata Repository",
                    capacity: 500000,
                    admins: ["u/george"],
                };

                g_db.u.save({
                    _id: "u/george",
                    _key: "george",
                });

                const result = createRepositoryByType(config);

                expect(result.ok).to.be.false;
            });


            it("should reject negative capacity for METADATA_ONLY repository", function () {
                const config = {
                    id: "test-metadata-negative-capacity",
                    type: RepositoryType.METADATA_ONLY,
                    title: "Test Metadata Repository Negative Capacity",
                    capacity: -100,
                    admins: ["u/george"],
                };

                g_db.u.save({
                    _id: "u/george",
                    _key: "george",
                });

                const result = createRepositoryByType(config);
                expect(result.ok).to.be.false;
            });

            it("should reject non-zero positive capacity for METADATA_ONLY repository", function () {
                const config = {
                    id: "test-metadata-nonzero-capacity",
                    type: RepositoryType.METADATA_ONLY,
                    title: "Test Metadata Repository Nonzero Capacity",
                    capacity: 1,
                    admins: ["u/george"],
                };

                g_db.u.save({
                    _id: "u/george",
                    _key: "george",
                });

                const result = createRepositoryByType(config);
                expect(result.ok).to.be.false;
            });
        });
    });

    describe("unit_factory_repository: getRepositoryImplementation", function () {
        it("should return globus implementation for GLOBUS type", function () {
            const impl = getRepositoryImplementation(RepositoryType.GLOBUS);
            expect(impl).to.equal(globusRepo);
        });

        it("should return metadata implementation for METADATA_ONLY type", function () {
            const impl = getRepositoryImplementation(RepositoryType.METADATA_ONLY);
            expect(impl).to.equal(metadataRepo);
        });

        it("should return null for unknown type", function () {
            const impl = getRepositoryImplementation("UNKNOWN_TYPE");
            expect(impl).to.be.null;
        });

        it("should return null for undefined type", function () {
            const impl = getRepositoryImplementation(undefined);
            expect(impl).to.be.null;
        });

        it("should return null for null type", function () {
            const impl = getRepositoryImplementation(null);
            expect(impl).to.be.null;
        });
    });
});
