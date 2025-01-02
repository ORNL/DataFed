"use strict";

const chai = require("chai");
const {expect} = chai;
const { Repo, PathType } = require("../api/controllers/repo");
const g_db = require("@arangodb").db;
const g_lib = require("../api/support");
const arangodb = require("@arangodb");

describe("Testing Repo class", () => {

  beforeEach(() => {
    g_db.d.truncate();
    g_db.u.truncate();
    g_db.alloc.truncate();
    g_db.loc.truncate();
    g_db.repo.truncate();
    g_db.admin.truncate();
  });

  it("unit_repo: should throw an error if the repo does not exist", () => {
    const repo = new Repo("invalidKey");
    expect(repo.exists()).to.be.false;
    expect(repo.key()).to.equal("invalidKey");
    expect(repo.error()).to.equal(g_lib.ERR_NOT_FOUND);
  });

  it("unit_repo: should return REPO_ROOT_PATH for exact match with repo root", () => {
    const path = "/repo_root";
    g_db.repo.save({
       _id: "repo/foo",
       _key: "foo",
       path: path
    })
    const repo = new Repo("foo");
    expect(repo.pathType(path)).to.equal(PathType.REPO_ROOT_PATH);
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
    expect(repo.pathType("/repo_root/")).to.equal(PathType.REPO_ROOT_PATH);
  });

  it("unit_repo: should handle an unknown path that begins with project", () => {
    const path = "/repo_root";
    g_db.repo.save({
       _id: "repo/foo",
       _key: "foo",
       path: path
    })
    const repo = new Repo("foo");
    expect(repo.pathType("/random_string/project_bam")).to.equal(PathType.UNKNOWN);
  });

  it("unit_repo: should handle an repo base path", () => {
    const path = "/mnt/repo_root";
    g_db.repo.save({
       _id: "repo/foo",
       _key: "foo",
       path: path
    })
    const repo = new Repo("foo");
    expect(repo.pathType("/mnt")).to.equal(PathType.REPO_BASE_PATH);
  });

  it("unit_repo: should handle an repo base path with ending /", () => {
    const path = "/mnt/repo_root";
    g_db.repo.save({
       _id: "repo/foo",
       _key: "foo",
       path: path
    })
    const repo = new Repo("foo");
    expect(repo.pathType("/mnt/")).to.equal(PathType.REPO_BASE_PATH);
  });

  it("unit_repo: should handle an repo base path containing only /", () => {
    const path = "/mnt/repo_root";
    g_db.repo.save({
       _id: "repo/foo",
       _key: "foo",
       path: path
    })
    const repo = new Repo("foo");
    expect(repo.pathType("/")).to.equal(PathType.REPO_BASE_PATH);
  });

  it("unit_repo: should handle an repo base path and repo root path are the same and only containing only /", () => {
    const path = "/";
    g_db.repo.save({
       _id: "repo/foo",
       _key: "foo",
       path: path
    })
    const repo = new Repo("foo");
    expect(repo.pathType("/")).to.equal(PathType.REPO_ROOT_PATH);
  });

  it("unit_repo: should handle an repo base path containing only part of base.", () => {
    const path = "/mnt/repo_root";
    g_db.repo.save({
       _id: "repo/foo",
       _key: "foo",
       path: path
    })
    const repo = new Repo("foo");
    expect(repo.pathType("/m")).to.equal(PathType.UNKNOWN);
  });

  it("unit_repo: should handle an repo root path containing only part of root.", () => {
    const path = "/mnt/repo_root";
    g_db.repo.save({
       _id: "repo/foo",
       _key: "foo",
       path: path
    })
    const repo = new Repo("foo");
    expect(repo.pathType("/mnt/re")).to.equal(PathType.UNKNOWN);
  });

  it("unit_repo: should handle an repo path containing only part of project.", () => {
    const path = "/mnt/repo_root";
    g_db.repo.save({
       _id: "repo/foo",
       _key: "foo",
       path: path
    })
    const repo = new Repo("foo");
    expect(repo.pathType("/mnt/repo_root/pro")).to.equal(PathType.UNKNOWN);
  });

  it("unit_repo: should handle an repo path containing only part of user.", () => {
    const path = "/mnt/repo_root";
    g_db.repo.save({
       _id: "repo/foo",
       _key: "foo",
       path: path
    })
    const repo = new Repo("foo");
    expect(repo.pathType("/mnt/repo_root/us")).to.equal(PathType.UNKNOWN);
  });

  it("unit_repo: should handle a project record path.", () => {
    const path = "/mnt/repo_root";
    g_db.repo.save({
       _id: "repo/foo",
       _key: "foo",
       path: path
    })
    const repo = new Repo("foo");
    expect(repo.pathType("/mnt/repo_root/project/bam/4243")).to.equal(PathType.PROJECT_RECORD_PATH);
  });

  it("unit_repo: should handle a user record path.", () => {
    const path = "/mnt/repo_root";
    g_db.repo.save({
       _id: "repo/foo",
       _key: "foo",
       path: path
    })
    const repo = new Repo("foo");
    expect(repo.pathType("/mnt/repo_root/user/jane/4243")).to.equal(PathType.USER_RECORD_PATH);
  });

  it("unit_repo: testing isAdmin, for a user, with system admin access", () => {
    const path = "/mnt/repo_root";
    const repo_id = "repo/boom" 
    g_db.repo.save({
       _id: repo_id,
       _key: "boom",
       path: path
    })

    const user_id = "u/jim";
    g_db.u.save({
       _id: user_id,
       _key: "jim",
       is_admin: true
    });

    const repo = new Repo(repo_id);
    expect(repo.isAdmin(user_id)).to.be.true;
  });

  it("unit_repo: testing isAdmin, for a user, with repo admin access", () => {
    const path = "/mnt/repo_root";
    const repo_id = "repo/bam" 
    g_db.repo.save({
       _id: repo_id,
       _key: "bam",
       path: path
    }, { waitForSync: true })

    const user_id = "u/hone";
    g_db.u.save({
       _id: user_id,
       _key: "hone",
       is_admin: false
    }, { waitForSync: true });

    g_db.admin.save({
       _from: repo_id,
       _to: user_id
    }, { waitForSync: true });

    const repo = new Repo(repo_id);

    expect(repo.isAdmin(user_id)).to.be.true;
  });


  it("unit_repo: testing isAdmin, for a user, with no privileges", () => {
    const path = "/mnt/repo_root";
    const repo_id = "repo/bam" 
    g_db.repo.save({
       _id: repo_id,
       _key: "bam",
       path: path
    }, { waitForSync: true })

    const user_id = "u/hone";
    g_db.u.save({
       _id: user_id,
       _key: "hone",
       is_admin: false
    }, { waitForSync: true });

    const repo = new Repo(repo_id);

    expect(repo.isAdmin(user_id)).to.be.false;
  });

});
