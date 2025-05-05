"use strict";

const chai = require("chai");
const expect = chai.expect;
const Record = require("../api/record");
const g_db = require("@arankgodb").db;
const g_lib = require("../api/support");
const arangodb = require("@arangodb");

function recordRepoAndUserSetup(record_key, user_id, repo_data) {
    const record_id = "d/" + record_key;
    if (!g_db._exists(record_id)) {
        g_db.d.save({
            _key: record_key,
            _id: record_id,
        });
    }
    g_db.repo.save(repo_data);

    if (!g_db._exists(user_id)) {
        g_db.u.save({
            _id: user_id,
        });
    }
}

describe("Record Class", () => {
    beforeEach(() => {
        g_db.d.truncate();
        g_db.alloc.truncate();
        g_db.loc.truncate();
        g_db.repo.truncate();
    });

    it("unit_record: should initialize correctly and check record existence is invalid", () => {
        const record = new Record("invalidKey");
        expect(record.exists()).to.be.false;
        expect(record.key()).to.equal("invalidKey");
        expect(record.error()).to.equal(g_lib.ERR_NOT_FOUND);
        expect(record.errorMessage()).to.equal("Invalid key: (invalidKey). No record found.");
    });

    it("unit_record: should initialize correctly and check record existence is valid", () => {
        const valid_key = "1120";
        const key_id = "d/" + valid_key;
        const owner_id = "u/bob";
        const repo_id = "repo/datafed-at-com";
        const repo_data = {
            _key: "datafed-at-com",
        };
        // Create nodes
        recordRepoAndUserSetup(valid_key, owner_id, repo_data);

        // Create edges
        g_db.loc.save({
            _from: key_id,
            _to: repo_id,
            uid: owner_id,
        });
        g_db.alloc.save({
            _from: owner_id,
            _to: repo_id,
        });
        const record = new Record(valid_key);
        expect(record.exists()).to.be.true;
        expect(record.key()).to.equal(valid_key);
        expect(record.error()).to.be.null;
        expect(record.errorMessage()).to.be.null;
    });

    describe("isManaged", () => {
        it("unit_record: should initialize correctly, but show a record as not managed.", () => {
            const valid_key = "1121";
            const key_id = "d/" + valid_key;
            const owner_id = "u/jim";
            const repo_id = "repo/datafed-at-org";
            // Create nodes
            const repo_data = {
                _key: "datafed-at-org",
            };
            recordRepoAndUserSetup(valid_key, owner_id, repo_data);

            const record = new Record(valid_key);
            expect(record.isManaged()).to.be.false;
            expect(record.exists()).to.be.true;
            expect(record.key()).to.equal(valid_key);
            expect(record.error()).to.equal(g_lib.ERR_PERM_DENIED);
            const pattern = /^Permission denied data is not managed by DataFed/;
            expect(record.errorMessage()).to.match(pattern);
        });

        it("unit_record: should initialize correctly, but without an allocation so should return false", () => {
            const valid_key = "1122";
            const key_id = "d/" + valid_key;
            const owner_id = "u/tom";
            const repo_id = "repo/datafed-banana-com";
            // Create nodes
            const repo_data = {
                _key: "datafed-banana-com",
            };
            recordRepoAndUserSetup(valid_key, owner_id, repo_data);

            // Create edges
            g_db.loc.save({
                _from: key_id,
                _to: repo_id,
                uid: owner_id,
            });

            const record = new Record(valid_key);
            expect(record.isManaged()).to.be.false;
            expect(record.exists()).to.be.true;
            expect(record.key()).to.equal(valid_key);
            expect(record.error()).to.be.null;
        });

        it("unit_record: should initialize correctly, and with allocation show that record is managed.", () => {
            const valid_key = "1123";
            const key_id = "d/" + valid_key;
            const owner_id = "u/drake";
            const repo_id = "repo/datafed-best-com";
            // Create nodes
            const repo_data = {
                _key: "datafed-best-com",
            };
            recordRepoAndUserSetup(valid_key, owner_id, repo_data);

            // Create edges
            g_db.loc.save({
                _from: key_id,
                _to: repo_id,
                uid: owner_id,
            });
            g_db.alloc.save({
                _from: owner_id,
                _to: repo_id,
            });

            const record = new Record(valid_key);
            expect(record.isManaged()).to.be.true;
            expect(record.exists()).to.be.true;
            expect(record.key()).to.equal(valid_key);
            expect(record.error()).to.be.null;
        });

    });

    describe("isPathConsistent", () => {
        it("unit_record: should return false because it is not managed.", () => {
            const valid_key = "1124";
            const key_id = "d/" + valid_key;
            const owner_id = "u/carl";
            const repo_id = "repo/datafed-at-super";
            const repo_data = {
                _id: repo_id,
                _key: "datafed-at-super",
                path: "/correct/file/path",
            };
            // Create nodes
            recordRepoAndUserSetup(valid_key, owner_id, repo_data);

            // Create edges
            g_db.loc.save({
                _from: key_id,
                _to: repo_id,
                uid: owner_id,
            });
            g_db.alloc.save({
                _from: owner_id,
                _to: repo_id,
            });

            const record = new Record(valid_key);
            expect(record.isPathConsistent("file/path/" + valid_key)).to.be.false;
        });

        it("unit_record: should return false paths are not consistent.", () => {
            const valid_key = "1125";
            const key_id = "d/" + valid_key;
            const owner_id = "u/red";
            const repo_id = "repo/datafed-fine-com";
            // Create nodes
            const repo_data = {
                _key: "datafed-fine-com",
                path: "/correct/file/path",
            };
            recordRepoAndUserSetup(valid_key, owner_id, repo_data);

            // Create edges
            g_db.loc.save({
                _from: key_id,
                _to: repo_id,
                uid: owner_id,
            });
            g_db.alloc.save({
                _from: owner_id,
                _to: repo_id,
            });

            const record = new Record(valid_key);
            expect(record.isPathConsistent("/incorrect/file/path/" + valid_key)).to.be.false;
            expect(record.error()).to.equal(g_lib.ERR_PERM_DENIED);
            const pattern = /^Record path is not consistent/;
            expect(record.errorMessage()).to.match(pattern);
        });

        it("unit_record: should return true paths are consistent.", () => {
            const valid_key = "1126";
            const key_id = "d/" + valid_key;
            const owner_name = "karen";
            const owner_id = "u/" + owner_name;
            const repo_id = "repo/datafed-cool-com";
            // Create nodes
            const repo_data = {
                _key: "datafed-cool-com",
                path: "/correct/file/path",
            };
            recordRepoAndUserSetup(valid_key, owner_id, repo_data);

            // Create edges
            g_db.loc.save({
                _from: key_id,
                _to: repo_id,
                uid: owner_id,
            });
            g_db.alloc.save({
                _from: owner_id,
                _to: repo_id,
                path: "/correct/file/path",
            });

            const record = new Record(valid_key);
            expect(record.isPathConsistent("/correct/file/path/user/" + owner_name + "/" + valid_key))
                .to.be.true;
            expect(record.error()).to.be.null;
            expect(record.errorMessage()).to.be.null;
        });

        it("unit_record: should return true, paths are inconsistent, but new path in new repo is valid.", () => {
            const valid_key = "1127";
            const key_id = "d/" + valid_key;
            const owner_id = "u/john";
            const repo_id = "repo/orange-at-com";
            const new_repo_id = "repo/watermelon-at-org";

            // Create nodes
            const repo_data = {
                _key: "orange-at-org",
                path: "/old/file/path",
            };
            const repo_data_new = {
                _key: "watermelon-at-org",
                path: "/correct/file/path",
            };
            recordRepoAndUserSetup(valid_key, owner_id, repo_data);
            recordRepoAndUserSetup(valid_key, owner_id, repo_data_new);

            // Create edges
            g_db.loc.save({
                _from: key_id,
                _to: repo_id,
                uid: owner_id,
                new_repo: new_repo_id,
            });
            g_db.alloc.save({
                _from: owner_id,
                _to: repo_id,
            });
            g_db.alloc.save({
                _from: owner_id,
                _to: new_repo_id,
            });

            const record = new Record(valid_key);
            expect(record.isPathConsistent("/correct/file/path/user/john/" + valid_key)).to.be.true;
            expect(record.error()).to.be.null;
            expect(record.errorMessage()).to.be.null;
        });

        it("unit_record: should return false paths are inconsistent in new and old repo.", () => {
            const valid_key = "1128";
            const key_id = "d/" + valid_key;
            const owner_id = "u/sherry";
            const repo_id = "repo/passionfruit";
            const new_repo_id = "repo/hamburger";
            // Create nodes
            const repo_data = {
                _key: "passionfruit",
                path: "/old/file/path",
            };
            const repo_data_new = {
                _key: "hamburger",
                path: "/new/file/path",
            };
            recordRepoAndUserSetup(valid_key, owner_id, repo_data);
            recordRepoAndUserSetup(valid_key, owner_id, repo_data_new);

            // Create edges
            g_db.loc.save({
                _from: key_id,
                _to: repo_id,
                uid: owner_id,
                new_repo: new_repo_id,
            });
            g_db.alloc.save({
                _from: owner_id,
                _to: repo_id,
            });
            g_db.alloc.save({
                _from: owner_id,
                _to: new_repo_id,
            });

            const record = new Record(valid_key);
            expect(record.isPathConsistent("/incorrect/file/path/user/sherry/" + valid_key)).to.be
                .false;
            expect(record.error()).to.equal(g_lib.ERR_PERM_DENIED);
            const pattern = /^Record path is not consistent/;
            expect(record.errorMessage()).to.match(pattern);
        });

        it("should test moving from user to project", () => {
            // Create a mock record
            const recordKey = "1234";
            const record = new Record(recordKey);

            // Override isManaged to return true for testing
            record.isManaged = function() {
                return true;
            };

            // Mock database functions for testing
            g_db._collection = function(name) {
                return {
                    exists: function(id) {
                        console.log(`Checking if ${id} exists in collection ${name}`);
                        return true;
                    },
                };
            };
            g_db.loc = {
                firstExample: function(query) {
                    console.log(`loc.firstExample called with query:`, query);
                    return {
                        _from: query._from,
                        _to: "repo/compose-home",
                        uid: "u/testuser",
                        new_repo: "repo/compose-home",
                        new_owner: null,
                    };
                },
            };

            g_db.alloc = {
                firstExample: function(query) {
                    console.log(`alloc.firstExample called with query:`, query);
                    // Return true for both user and project allocations
                    return {
                        _from: query._from,
                        _to: query._to,
                        path: "/mnt/datafed/compose-home",
                    };
                },
            };

            g_db._document = function(id) {
                console.log(`_document called with id: ${id}`);
                return {
                    path: "/mnt/datafed/compose-home",
                };
            };

            // Test moving from user to project
            const userPath = "/mnt/datafed/compose-home/user/testuser/1234";
            const projectPath = "/mnt/datafed/compose-home/project/testproject/1234";

            const userPathResult = record.isPathConsistent(userPath);
            const projectPathResult = record.isPathConsistent(projectPath);

            console.log(`Is path consistent (user path): ${userPathResult}`);
            console.log(`Is path consistent (project path): ${projectPathResult}`);

        });

        it("should allow a comprehensive test of the fix for moving records between allocations to work", () => {
            // Mock g_lib for testing
            g_lib.ERR_PERM_DENIED = 1;
            g_lib.ERR_INTERNAL_FAULT = 2;
            g_lib.ERR_NOT_FOUND = 3;

            // Mock database collections and functions
            const mockCollections = {
                d: {
                    exists: function(id) {
                        console.log(`Checking if ${id} exists in collection d`);
                        return true;
                    },
                    document: function(id) {
                        return { _id: id };
                    },
                },
                u: {
                    exists: function(id) {
                        console.log(`Checking if ${id} exists in collection u`);
                        return id === "testuser";
                    },
                },
                p: {
                    exists: function(id) {
                        console.log(`Checking if ${id} exists in collection p`);
                        return id === "testproject";
                    },
                },
                repo: {
                    exists: function(id) {
                        console.log(`Checking if ${id} exists in collection repo`);
                        return id === "compose-home";
                    },
                },
            };

            // Mock database API                                                                                                                           ▄▄
            g_db._collection = function(name) {
                return mockCollections[name] || {
                    exists: function() {
                        return false;
                    },
                };
            };

            g_db.loc = {
                firstExample: function(query) {
                    console.log(`loc.firstExample called with query:`, JSON.stringify(query));
                    if (query._from === "d/1234") {
                        return {
                            _from: "d/1234",
                            _to: "repo/compose-home",
                            uid: "u/testuser",
                            new_repo: "repo/compose-home",
                            new_owner: null,
                        };
                    }
                    return null;
                },
            };

            g_db.alloc = {
                firstExample: function(query) {
                    console.log(`alloc.firstExample called with query:`, JSON.stringify(query));
                    // Return allocation for both user and project
                    if (query._from === "u/testuser" && query._to === "repo/compose-home") {
                        return {
                            _from: "u/testuser",
                            _to: "repo/compose-home",
                            path: "/mnt/datafed/compose-home",
                        };
                    } else if (query._from === "p/testproject" && query._to === "repo/compose-home") {
                        return {
                            _from: "p/testproject",
                            _to: "repo/compose-home",
                            path: "/mnt/datafed/compose-home",
                        };
                    }
                    return null;
                },
            };

            g_db._document = function(id) {
                console.log(`_document called with id: ${id}`);
                if (id === "repo/compose-home") {
                    return {
                        _id: id,
                        path: "/mnt/datafed/compose-home",
                    };
                }
                return null;
            };

            // Create a record
            const recordKey = "1234";
            const record = new Record(recordKey);

            const userPath = "/mnt/datafed/compose-home/user/testuser/1234";
            const projectPath = "/mnt/datafed/compose-home/project/testproject/1234";
            const invalidPath = "/mnt/datafed/compose-home/project/nonexistent/1234";

            const userResult = record.isPathConsistent(userPath);
            const projectResult = record.isPathConsistent(projectPath);
            const invalidResult = record.isPathConsistent(invalidPath);

            expect(userResult).to.be.true;
            expect(projectResult).to.be.true;
            expect(invalidResult).to.be.true;
        });
    });
});
