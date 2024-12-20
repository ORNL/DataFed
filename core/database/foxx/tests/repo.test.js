"use strict";

const chai = require("chai");
const expect = chai.expect;
const { Repo, PathType } = require("../api/repo");
const g_db = require("@arangodb").db;
const g_lib = require("../api/support");
const arangodb = require("@arangodb");

describe("Testing Repo class", () => {

  beforeEach(() => {
    g_db.d.truncate();
    g_db.alloc.truncate();
    g_db.loc.truncate();
    g_db.repo.truncate();
  });

  it("unit_repo: should throw an error if the repo does not exist", () => {
    const repo = new Repo("invalidKey");
    expect(repo.exists()).to.be.false;
    expect(repo.key()).to.equal("invalidKey");
    expect(repo.error()).to.equal(g_lib.ERR_NOT_FOUND);
  });

  it("unit_repo: should return REPO_PATH for exact match with repo root", () => {
    const path = "/repo_root";
    g_db.repo.save({
       _id: "repo/foo",
       _key: "foo",
       path: path
    })
    const repo = new Repo("foo");
    expect(repo.pathType(path)).to.equal(PathType.REPO_PATH);
  });

  it("unit_repo: should return UNKNOWN for invalid path not matching repo root", () => {
    const path = "/repo_root";
    g_db.repo.save({
       _id: "repo/foo",
       _key: "foo",
       path: path
    })
    const repo = new Repo("foo");
    expect(repo.pathType("/invalid_path")).to.equal(PathType.UNKNOWN);
  });

  it("unit_repo: should return PROJECT_PATH for valid project paths", () => {
    const path = "/repo_root";
    g_db.repo.save({
       _id: "repo/foo",
       _key: "foo",
       path: path
    })
    const repo = new Repo("foo");
    expect(repo.pathType("/repo_root/project/bam")).to.equal(PathType.PROJECT_PATH);
  });

  it("unit_repo: should return USER_PATH for valid user paths", () => {
    const path = "/repo_root";
    g_db.repo.save({
       _id: "repo/foo",
       _key: "foo",
       path: path
    })
    const repo = new Repo("foo");
    expect(repo.pathType("/repo_root/user/george")).to.equal(PathType.USER_PATH);
  });

  it("unit_repo: should return UNKNOWN for a path that does not start with repo root", () => {
    const path = "/repo_root";
    g_db.repo.save({
       _id: "repo/foo",
       _key: "foo",
       path: path
    })
    const repo = new Repo("foo");
    expect(repo.pathType("/randome_string/user/george/id")).to.equal(PathType.UNKNOWN);
  });

  it("unit_repo: should trim trailing slashes from repo root path and input path", () => {
    const path = "/repo_root";
    g_db.repo.save({
       _id: "repo/foo",
       _key: "foo",
       path: path
    })
    const repo = new Repo("foo");
    expect(repo.pathType("/repo_root/user/")).to.equal(PathType.REPO_PATH);
  });

  it("unit_repo: should handle an empty relative path correctly", () => {
    const path = "/repo_root";
    g_db.repo.save({
       _id: "repo/foo",
       _key: "foo",
       path: path
    })
    const repo = new Repo("foo");
    expect(repo.pathType("/repo_root/")).to.equal(PathType.REPO_PATH);
  });

  it("unit_repo: should handle an unknown path that begins with project", () => {
    const path = "/repo_root";
    g_db.repo.save({
       _id: "repo/foo",
       _key: "foo",
       path: path
    })
    const repo = new Repo("foo");
    expect(repo.pathType("/randome_string/project_bam")).to.equal(PathType.UNKNOWN);
  });
});
