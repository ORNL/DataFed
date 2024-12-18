"use strict";

const chai = require("chai");
const expect = chai.expect;
const Record = require("../api/record");
const g_db = require("@arangodb").db;
const g_lib = require("../api/support");
//const sinon = require('sinon');
//const proxyquire = require('proxyquire');
const arangodb = require("@arangodb");

describe("Record Class", () => {
  let count = 0;

  beforeEach(() => {
    console.log("Clearing database collections.");
    console.log("Count is " + count);
    count = count + 1;
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
    expect(record.errorMessage()).to.equal(
      "Invalid key: (invalidKey). No record found.",
    );
  });

  it("unit_record: should initialize correctly and check record existence is valid", () => {
    const valid_key = "1111";
    const key_id = "d/1111";
    const owner_id = "u/bob";
    const repo_id = "repo/datafed-at-com";
    // Create nodes
    g_db.d.save({
      _key: valid_key,
      _id: key_id,
    });
    g_db.repo.save({
      _id: repo_id,
    });
    g_db.u.save({
      _id: owner_id,
    });

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
    const valid_key = "1111";
    const key_id = "d/1111";
    const owner_id = "u/bob";
    const repo_id = "repo/datafed-at-com";
    // Create nodes
    g_db.d.save({
      _key: valid_key,
      _id: key_id,
    });
    g_db.repo.save({
      _id: repo_id,
    });
    g_db.u.save({
      _id: owner_id,
    });

    const record = new Record(valid_key);
    expect(record.isManaged()).to.be.false;
    expect(record.exists()).to.be.true;
    expect(record.key()).to.equal(valid_key);
    expect(record.error()).to.equal(g_lib.ERR_PERM_DENIED);
    const pattern = /^Permission denied data is not managed by DataFed/;
    expect(record.errorMessage()).to.match(pattern);
  });

  it("unit_record: isManaged should initialize correctly, but without an allocation so should return false", () => {
    const valid_key = "1111";
    const key_id = "d/1111";
    const owner_id = "u/bob";
    const repo_id = "repo/datafed-at-com";
    // Create nodes
    g_db.d.save({
      _key: valid_key,
      _id: key_id,
    });
    g_db.repo.save({
      _id: repo_id,
    });
    g_db.u.save({
      _id: owner_id,
    });

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
    const valid_key = "1111";
    const key_id = "d/1111";
    const owner_id = "u/bob";
    const repo_id = "repo/datafed-at-com";
    // Create nodes
    g_db.d.save({
      _key: valid_key,
      _id: key_id,
    });
    g_db.repo.save({
      _id: repo_id,
    });
    g_db.u.save({
      _id: owner_id,
    });

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
    const valid_key = "1111";
    const key_id = "d/1111";
    const owner_id = "u/bob";
    const repo_id = "repo/datafed-at-com";
    // Create nodes
    g_db.d.save({
      _key: valid_key,
      _id: key_id,
    });
    g_db.repo.save({
      _id: repo_id,
    });
    g_db.u.save({
      _id: owner_id,
    });

    // Create edges
    g_db.loc.save({
      _from: key_id,
      _to: repo_id,
      uid: owner_id,
    });

    const record = new Record(valid_key);
    expect(record.isPathConsistent("file/path/" + valid_key)).to.be.false;
  });

  it("unit_record: isPathConsistent should return false paths are not consistent.", () => {
    const valid_key = "1111";
    const key_id = "d/1111";
    const owner_id = "u/bob";
    const repo_id = "repo/datafed-at-com";
    // Create nodes
    g_db.d.save({
      _key: valid_key,
      _id: key_id,
    });
    g_db.repo.save({
      _id: repo_id,
    });
    g_db.u.save({
      _id: owner_id,
    });

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
    expect(record.isPathConsistent("/incorrect/file/path/" + valid_key)).to.be
      .false;
    expect(record.error()).to.equal(g_lib.ERR_PERM_DENIED);
    const pattern = /^Record path is not consistent/;
    expect(record.errorMessage()).to.match(pattern);
  });

  it("unit_record: isPathConsistent should return true paths are consistent.", () => {
    const valid_key = "1111";
    const key_id = "d/1111";
    const owner_id = "u/bob";
    const repo_id = "repo/datafed-at-com";
    // Create nodes
    g_db.d.save({
      _key: valid_key,
      _id: key_id,
    });
    g_db.repo.save({
      _id: repo_id,
    });
    g_db.u.save({
      _id: owner_id,
    });

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
    expect(record.isPathConsistent("/correct/file/path/" + valid_key)).to.be
      .true;
    expect(record.error()).to.be.null;
    expect(record.errorMessage()).to.be.null;
  });

  it("unit_record: isPathConsistent should return true paths are inconsistent, but new path in new alloc is valid.", () => {
    const valid_key = "1111";
    const key_id = "d/1111";
    const owner_id = "u/bob";
    const repo_id = "repo/datafed-at-com";
    const new_repo_id = "repo/datafed-at-org";
    // Create nodes
    g_db.d.save({
      _key: valid_key,
      _id: key_id,
    });
    g_db.repo.save({
      _id: repo_id,
    });
    g_db.u.save({
      _id: owner_id,
    });

    // Create edges
    g_db.loc.save({
      _from: key_id,
      _to: repo_id,
      uid: owner_id,
      new_repo: "repo/datafed-at-org",
    });
    g_db.alloc.save({
      _from: owner_id,
      _to: repo_id,
      path: "/old/file/path",
    });
    g_db.alloc.save({
      _from: owner_id,
      _to: new_repo_id,
      path: "/correct/file/path",
    });

    const record = new Record(valid_key);
    expect(record.isPathConsistent("/correct/file/path/" + valid_key)).to.be
      .true;
    expect(record.error()).to.be.null;
    expect(record.errorMessage()).to.be.null;
  });

  it("unit_record: isPathConsistent should return false paths are inconsistent in new and old alloc.", () => {
    const valid_key = "1111";
    const key_id = "d/1111";
    const owner_id = "u/bob";
    const repo_id = "repo/datafed-at-com";
    const new_repo_id = "repo/datafed-at-org";
    // Create nodes
    g_db.d.save({
      _key: valid_key,
      _id: key_id,
    });
    g_db.repo.save({
      _id: repo_id,
    });
    g_db.u.save({
      _id: owner_id,
    });

    // Create edges
    g_db.loc.save({
      _from: key_id,
      _to: repo_id,
      uid: owner_id,
      new_repo: "repo/datafed-at-org",
    });
    g_db.alloc.save({
      _from: owner_id,
      _to: repo_id,
      path: "/old/file/path",
    });
    g_db.alloc.save({
      _from: owner_id,
      _to: new_repo_id,
      path: "/incorrect/file/path",
    });

    const record = new Record(valid_key);
    expect(record.isPathConsistent("/correct/file/path/" + valid_key)).to.be
      .false;
    expect(record.error()).to.equal(g_lib.ERR_PERM_DENIED);
    const pattern = /^Record path is not consistent/;
    expect(record.errorMessage()).to.match(pattern);
  });
});
