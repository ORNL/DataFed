"use strict";

const chai = require("chai");
const expect = chai.expect;
const Record = require("../api/models/record");
const g_db = require("@arangodb").db;
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

    if (!g_db._exists(repo_data._id)) {
        g_db.repo.save(repo_data);
    }

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
        g_db.u.truncate();
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
            _id: repo_id,
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

    it("unit_record: isManaged should initialize correctly, but show a record as not managed.", () => {
        const valid_key = "1121";
        const key_id = "d/" + valid_key;
        const owner_id = "u/jim";
        const repo_id = "repo/datafed-at-org";
        // Create nodes
        const repo_data = {
            _id: repo_id,
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

    it("unit_record: isManaged should initialize correctly, but without an allocation so should return false", () => {
        const valid_key = "1122";
        const key_id = "d/" + valid_key;
        const owner_id = "u/tom";
        const repo_id = "repo/datafed-banana-com";
        // Create nodes
        const repo_data = {
            _id: repo_id,
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

    it("unit_record: isManaged should initialize correctly, and with allocation show that record is managed.", () => {
        const valid_key = "1123";
        const key_id = "d/" + valid_key;
        const owner_id = "u/drake";
        const repo_id = "repo/datafed-best-com";
        // Create nodes
        const repo_data = {
            _id: repo_id,
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

    it("unit_record: isPathConsistent should return false because it is not managed.", () => {
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

    it("unit_record: isPathConsistent should return false paths are not consistent.", () => {
        const valid_key = "1125";
        const key_id = "d/" + valid_key;
        const owner_id = "u/red";
        const repo_id = "repo/datafed-fine-com";
        // Create nodes
        const repo_data = {
            _id: repo_id,
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

    it("unit_record: isPathConsistent should return true paths are consistent.", () => {
        const valid_key = "1126";
        const key_id = "d/" + valid_key;
        const owner_name = "karen";
        const owner_id = "u/" + owner_name;
        const repo_id = "repo/datafed-cool-com";
        // Create nodes
        const repo_data = {
            _id: repo_id,
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

    it("unit_record: isPathConsistent should return true, paths are inconsistent, but new path in new repo is valid.", () => {
        const valid_key = "1127";
        const key_id = "d/" + valid_key;
        const owner_id = "u/john";
        const repo_id = "repo/orange-at-com";
        const new_repo_id = "repo/watermelon-at-org";

        // Create nodes

        const repo_data = {
            _id: repo_id,
            _key: "orange-at-org",
            path: "/old/file/path",
        };
        const repo_data_new = {
            _id: "repo/watermelon-at-org",
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

    it("unit_record: isPathConsistent should return false paths are inconsistent in new and old repo.", () => {
        const valid_key = "1128";
        const key_id = "d/" + valid_key;
        const owner_id = "u/sherry";
        const repo_id = "repo/passionfruit";
        const new_repo_id = "repo/hamburger";
        // Create nodes
        const repo_data = {
            _id: "repo/passionfruit",
            _key: "passionfruit",
            path: "/old/file/path",
        };
        const repo_data_new = {
            _id: "repo/hamburger",
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
});
