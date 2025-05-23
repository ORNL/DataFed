"use strict";

const chai = require("chai");
const { expect } = chai;
const { Repo, PathType } = require("../api/models/repo");
const g_db = require("@arangodb").db;
const g_lib = require("../api/support");
const arangodb = require("@arangodb");

describe("Testing Repo class", () => {
    beforeEach(() => {
        g_db.d.truncate();
        g_db.u.truncate();
        g_db.p.truncate();
        g_db.g.truncate();
        g_db.member.truncate();
        g_db.owner.truncate();
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
            path: path,
        });
        const repo = new Repo("foo");
        expect(repo.pathType(path)).to.equal(PathType.REPO_ROOT_PATH);
    });

    it("unit_repo: should return UNKNOWN for invalid path not matching repo root", () => {
        const path = "/repo_root";
        g_db.repo.save({
            _id: "repo/foo",
            _key: "foo",
            path: path,
        });
        const repo = new Repo("foo");
        expect(repo.pathType("/invalid_path")).to.equal(PathType.UNKNOWN);
    });

    it("unit_repo: should return PROJECT_PATH for valid project paths", () => {
        const path = "/repo_root";
        g_db.repo.save({
            _id: "repo/foo",
            _key: "foo",
            path: path,
        });
        const repo = new Repo("foo");
        expect(repo.pathType("/repo_root/project/bam")).to.equal(PathType.PROJECT_PATH);
    });

    it("unit_repo: should return USER_PATH for valid user paths", () => {
        const path = "/repo_root";
        g_db.repo.save({
            _id: "repo/foo",
            _key: "foo",
            path: path,
        });
        const repo = new Repo("foo");
        expect(repo.pathType("/repo_root/user/george")).to.equal(PathType.USER_PATH);
    });

    it("unit_repo: should return UNKNOWN for a path that does not start with repo root", () => {
        const path = "/repo_root";
        g_db.repo.save({
            _id: "repo/foo",
            _key: "foo",
            path: path,
        });
        const repo = new Repo("foo");
        expect(repo.pathType("/randome_string/user/george/id")).to.equal(PathType.UNKNOWN);
    });

    it("unit_repo: should trim trailing slashes from repo root path and input path", () => {
        const path = "/repo_root";
        g_db.repo.save({
            _id: "repo/foo",
            _key: "foo",
            path: path,
        });
        const repo = new Repo("foo");
        expect(repo.pathType("/repo_root/user/")).to.equal(PathType.REPO_PATH);
    });

    it("unit_repo: should handle an empty relative path correctly", () => {
        const path = "/repo_root";
        g_db.repo.save({
            _id: "repo/foo",
            _key: "foo",
            path: path,
        });
        const repo = new Repo("foo");
        expect(repo.pathType("/repo_root/")).to.equal(PathType.REPO_ROOT_PATH);
    });

    it("unit_repo: should handle an unknown path that begins with project", () => {
        const path = "/repo_root";
        g_db.repo.save({
            _id: "repo/foo",
            _key: "foo",
            path: path,
        });
        const repo = new Repo("foo");
        expect(repo.pathType("/random_string/project_bam")).to.equal(PathType.UNKNOWN);
    });

    it("unit_repo: should handle an repo base path", () => {
        const path = "/mnt/repo_root";
        g_db.repo.save({
            _id: "repo/foo",
            _key: "foo",
            path: path,
        });
        const repo = new Repo("foo");
        expect(repo.pathType("/mnt")).to.equal(PathType.REPO_BASE_PATH);
    });

    it("unit_repo: should handle an repo base path with ending /", () => {
        const path = "/mnt/repo_root";
        g_db.repo.save({
            _id: "repo/foo",
            _key: "foo",
            path: path,
        });
        const repo = new Repo("foo");
        expect(repo.pathType("/mnt/")).to.equal(PathType.REPO_BASE_PATH);
    });

    it("unit_repo: should handle an repo base path containing only /", () => {
        const path = "/mnt/repo_root";
        g_db.repo.save({
            _id: "repo/foo",
            _key: "foo",
            path: path,
        });
        const repo = new Repo("foo");
        expect(repo.pathType("/")).to.equal(PathType.REPO_BASE_PATH);
    });

    it("unit_repo: should handle an repo base path and repo root path are the same and only containing only /", () => {
        const path = "/";
        g_db.repo.save({
            _id: "repo/foo",
            _key: "foo",
            path: path,
        });
        const repo = new Repo("foo");
        expect(repo.pathType("/")).to.equal(PathType.REPO_ROOT_PATH);
    });

    it("unit_repo: should handle an repo base path containing only part of base.", () => {
        const path = "/mnt/repo_root";
        g_db.repo.save({
            _id: "repo/foo",
            _key: "foo",
            path: path,
        });
        const repo = new Repo("foo");
        expect(repo.pathType("/m")).to.equal(PathType.UNKNOWN);
    });

    it("unit_repo: should handle an repo root path containing only part of root.", () => {
        const path = "/mnt/repo_root";
        g_db.repo.save({
            _id: "repo/foo",
            _key: "foo",
            path: path,
        });
        const repo = new Repo("foo");
        expect(repo.pathType("/mnt/re")).to.equal(PathType.UNKNOWN);
    });

    it("unit_repo: should handle an repo path containing only part of project.", () => {
        const path = "/mnt/repo_root";
        g_db.repo.save({
            _id: "repo/foo",
            _key: "foo",
            path: path,
        });
        const repo = new Repo("foo");
        expect(repo.pathType("/mnt/repo_root/pro")).to.equal(PathType.UNKNOWN);
    });

    it("unit_repo: should handle an repo path containing only part of user.", () => {
        const path = "/mnt/repo_root";
        g_db.repo.save({
            _id: "repo/foo",
            _key: "foo",
            path: path,
        });
        const repo = new Repo("foo");
        expect(repo.pathType("/mnt/repo_root/us")).to.equal(PathType.UNKNOWN);
    });

    it("unit_repo: should handle a project record path.", () => {
        const path = "/mnt/repo_root";
        g_db.repo.save({
            _id: "repo/foo",
            _key: "foo",
            path: path,
        });
        const repo = new Repo("foo");
        expect(repo.pathType("/mnt/repo_root/project/bam/4243")).to.equal(
            PathType.PROJECT_RECORD_PATH,
        );
    });
    it("unit_repo: should handle a user record path.", () => {
        const path = "/mnt/repo_root";
        g_db.repo.save({
            _id: "repo/foo",
            _key: "foo",
            path: path,
        });
        const repo = new Repo("foo");
        expect(repo.pathType("/mnt/repo_root/user/jane/4243")).to.equal(PathType.USER_RECORD_PATH);
    });

    it("unit_repo: testing isAdmin, for a user, with system admin access", () => {
        const path = "/mnt/repo_root";
        const repo_id = "repo/boom";
        g_db.repo.save({
            _id: repo_id,
            _key: "boom",
            path: path,
        });

        const user_id = "u/jim";
        g_db.u.save({
            _id: user_id,
            _key: "jim",
            is_admin: true,
        });

        const repo = new Repo(repo_id);
        expect(repo.isAdmin(user_id)).to.be.true;
    });

    it("unit_repo: testing isAdmin, for a user, with repo admin access", () => {
        const path = "/mnt/repo_root";
        const repo_id = "repo/bam";
        g_db.repo.save({
            _id: repo_id,
            _key: "bam",
            path: path,
        });

        const user_id = "u/hone";
        g_db.u.save({
            _id: user_id,
            _key: "hone",
            is_admin: false,
        });

        g_db.admin.save({
            _from: repo_id,
            _to: user_id,
        });

        const repo = new Repo(repo_id);

        expect(repo.isAdmin(user_id)).to.be.true;
    });

    it("unit_repo: testing isAdmin, for a user, with no privileges", () => {
        const path = "/mnt/repo_root";
        const repo_id = "repo/bam";
        g_db.repo.save({
            _id: repo_id,
            _key: "bam",
            path: path,
        });

        const user_id = "u/hone";
        g_db.u.save({
            _id: user_id,
            _key: "hone",
            is_admin: false,
        });

        const repo = new Repo(repo_id);

        expect(repo.isAdmin(user_id)).to.be.false;
    });

    it("unit_repo: testing getProjectIds, for a repo with both a project and user allocation associated with it.", () => {
        // Create Repo
        const path = "/mnt/lair";
        const repo_key = "paper";
        const repo_id = "repo/" + repo_key;
        g_db.repo.save({
            _id: repo_id,
            _key: repo_key,
            path: path,
        });

        // Create user
        const user_key = "randy";
        const user_id = "u/randy";
        g_db.u.save({
            _id: user_id,
            _key: user_key,
            is_admin: false,
        });

        // Create project
        const project_key = "bigthing";
        const project_id = "p/" + project_key;
        g_db.p.save({
            _id: project_id,
            _key: project_key,
        });

        // Create allocation connecting repo to project
        g_db.alloc.save({
            _from: user_id,
            _to: repo_id,
        });
        // Create allocation edge connection repo to user
        g_db.alloc.save({
            _from: project_id,
            _to: repo_id,
        });

        const repo = new Repo(repo_id);
        expect(repo.exists()).to.be.true;
        expect(repo.getProjectIds().length).to.equal(1);
        expect(repo.getProjectIds()[0]).to.equal(project_id);
    });

    it("unit_repo: testing getProjectIds for a repo with no allocations", () => {
        // Create a repo with no allocations
        const repo_key = "emptyrepo";
        const repo_id = "repo/" + repo_key;
        g_db.repo.save({ _id: repo_id, _key: repo_key, path: "/mnt/empty" });

        const repo = new Repo(repo_id);
        expect(repo.exists()).to.be.true;
        expect(repo.getProjectIds().length).to.equal(0); // No projects linked
    });

    it("unit_repo: testing getProjectIds for a repo with multiple projects", () => {
        // Create repo
        const repo_key = "multiproject";
        const repo_id = "repo/" + repo_key;
        g_db.repo.save({ _id: repo_id, _key: repo_key, path: "/mnt/multi" });

        // Create multiple projects
        const project_keys = ["proj1", "proj2", "proj3"];
        const project_ids = project_keys.map((key) => `p/${key}`);
        project_ids.forEach((project_id) => {
            g_db.p.save({ _id: project_id, _key: project_id.split("/")[1] });
            g_db.alloc.save({ _from: project_id, _to: repo_id });
        });

        const repo = new Repo(repo_id);
        expect(repo.exists()).to.be.true;
        expect(repo.getProjectIds().length).to.equal(project_ids.length);
        expect(repo.getProjectIds()).to.have.members(project_ids);
    });

    it("unit_repo: testing getProjectIds for invalid allocations (not projects)", () => {
        // Create repo
        const repo_key = "invalidalloc";
        const repo_id = "repo/" + repo_key;
        g_db.repo.save({ _id: repo_id, _key: repo_key, path: "/mnt/invalid" });

        // Create invalid allocations (e.g., user to repo)
        const user_key = "invaliduser";
        const user_id = "u/" + user_key;
        g_db.u.save({ _id: user_id, _key: user_key });
        g_db.alloc.save({ _from: user_id, _to: repo_id });

        const repo = new Repo(repo_id);
        expect(repo.exists()).to.be.true;
        expect(repo.getProjectIds().length).to.equal(0); // No valid project allocations
    });

    it("unit_repo: testing getProjectIds for multiple repos with overlapping projects", () => {
        // Create two repositories
        const repo1_key = "repo1";
        const repo1_id = "repo/" + repo1_key;
        const repo2_key = "repo2";
        const repo2_id = "repo/" + repo2_key;

        g_db.repo.save({ _id: repo1_id, _key: repo1_key, path: "/mnt/repo1" });
        g_db.repo.save({ _id: repo2_id, _key: repo2_key, path: "/mnt/repo2" });

        // Create projects
        const project1_key = "project1";
        const project2_key = "project2";
        const project3_key = "project3";

        const project1_id = "p/" + project1_key;
        const project2_id = "p/" + project2_key;
        const project3_id = "p/" + project3_key;

        g_db.p.save({ _id: project1_id, _key: project1_key });
        g_db.p.save({ _id: project2_id, _key: project2_key });
        g_db.p.save({ _id: project3_id, _key: project3_key });

        // Allocate projects to repos
        g_db.alloc.save({ _from: project1_id, _to: repo1_id });
        g_db.alloc.save({ _from: project2_id, _to: repo1_id });
        g_db.alloc.save({ _from: project3_id, _to: repo2_id });
        g_db.alloc.save({ _from: project1_id, _to: repo2_id }); // Overlapping project

        // Test repo1
        const repo1 = new Repo(repo1_id);
        expect(repo1.exists()).to.be.true;
        const repo1Projects = repo1.getProjectIds();
        expect(repo1Projects.length).to.equal(2); // Only project1 and project2 should be linked to repo1
        expect(repo1Projects).to.have.members([project1_id, project2_id]);

        // Test repo2
        const repo2 = new Repo(repo2_id);
        expect(repo2.exists()).to.be.true;
        const repo2Projects = repo2.getProjectIds();
        expect(repo2Projects.length).to.equal(2); // Only project1 and project3 should be linked to repo2
        expect(repo2Projects).to.have.members([project1_id, project3_id]);
    });

    it("unit_repo: testing hasAccess for a user that is a member of a project with an allocation.", () => {
        // Create two repositories
        const repo_key = "fine_wine";
        const repo_id = "repo/" + repo_key;

        g_db.repo.save({ _id: repo_id, _key: repo_key, path: "/mnt/white" });

        // Create projects
        const project_key = "zinfandel";
        const project_id = "p/" + project_key;

        g_db.p.save({ _id: project_id, _key: project_key });

        // Allocate projects to repos
        g_db.alloc.save({ _from: project_id, _to: repo_id });

        const mark_key = "mark";
        const mark_id = "u/" + mark_key;
        g_db.u.save({
            _id: mark_id,
            _key: mark_key,
        });

        const group_id = "g/vip";
        g_db.g.save({
            _id: group_id,
        });

        // Create edges
        g_db.owner.save({
            _to: project_id,
            _from: group_id,
        });

        g_db.member.save({
            _to: mark_id,
            _from: group_id,
        });

        g_db.p.save({
            _to: repo_id,
            _from: project_id,
        });
        // Test repo
        const repo = new Repo(repo_id);
        expect(repo.exists()).to.be.true;
        expect(repo.hasAccess(mark_id)).to.be.true;
    });

    it("unit_repo: testing hasAccess for a user with a direct allocation", () => {
        // Create a repository
        const repo_key = "direct_alloc_repo";
        const repo_id = "repo/" + repo_key;
        g_db.repo.save({ _id: repo_id, _key: repo_key, path: "/mnt/direct_alloc" });

        // Create a user
        const user_key = "alice";
        const user_id = "u/" + user_key;
        g_db.u.save({ _id: user_id, _key: user_key });

        // Direct allocation from user to repo
        g_db.alloc.save({ _from: user_id, _to: repo_id });

        // Test repo
        const repo = new Repo(repo_id);
        expect(repo.exists()).to.be.true;
        expect(repo.hasAccess(user_id)).to.be.true; // should return true due to direct allocation
    });

    it("unit_repo: testing hasAccess for a user with no allocation", () => {
        // Create a repository
        const repo_key = "no_alloc_repo";
        const repo_id = "repo/" + repo_key;
        g_db.repo.save({ _id: repo_id, _key: repo_key, path: "/mnt/no_alloc" });

        // Create a user
        const user_key = "charlie";
        const user_id = "u/" + user_key;
        g_db.u.save({ _id: user_id, _key: user_key });

        // Test repo
        const repo = new Repo(repo_id);
        expect(repo.exists()).to.be.true;
        expect(repo.hasAccess(user_id)).to.be.false; // should return false, no allocation exists
    });

    it("unit_repo: testing hasAccess for a user with allocation to a different repo", () => {
        // Create two repositories
        const repo_key_1 = "other_repo";
        const repo_id_1 = "repo/" + repo_key_1;
        const repo_key_2 = "different_repo";
        const repo_id_2 = "repo/" + repo_key_2;

        g_db.repo.save({ _id: repo_id_1, _key: repo_key_1, path: "/mnt/other" });
        g_db.repo.save({ _id: repo_id_2, _key: repo_key_2, path: "/mnt/different" });

        // Create a user
        const user_key = "dave";
        const user_id = "u/" + user_key;
        g_db.u.save({ _id: user_id, _key: user_key });

        // Create allocation to a different repo
        g_db.alloc.save({ _from: user_id, _to: repo_id_1 }); // Allocating user to repo 1

        // Test repo 2 (should return false)
        const repo2 = new Repo(repo_id_2);
        expect(repo2.exists()).to.be.true;
        expect(repo2.hasAccess(user_id)).to.be.false; // should return false, no allocation to this repo
    });
    it("unit_repo: should handle a user record path.", () => {
        const path = "/mnt/datafed/compose-home/";
        g_db.repo.save({
            _id: "repo/foo",
            _key: "foo",
            path: path,
        });
        const repo = new Repo("foo");
        expect(repo.pathType("/mnt/datafed/compose-home/user/tim/1135")).to.equal(
            PathType.USER_RECORD_PATH,
        );
    });
});
