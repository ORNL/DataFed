"use strict";

const chai = require("chai");
const expect = chai.expect;
const Project = require("../api/controllers/project");
const g_db = require("@arangodb").db;
const g_lib = require("../api/support");
const arangodb = require("@arangodb");

describe("Project", () => {
    beforeEach(() => {
        g_db.p.truncate();
        g_db.alloc.truncate();
        g_db.loc.truncate();
        g_db.repo.truncate();
    });

    it("unit_project: should initialize correctly and check project existence is invalid", () => {
        const project = new Project("invalidKey");
        expect(project.exists()).to.be.false;
        expect(project.key()).to.equal("invalidKey");
        expect(project.error()).to.equal(g_lib.ERR_NOT_FOUND);
        expect(project.errorMessage()).to.equal("Invalid key: (invalidKey). No project found.");
    });

    it("unit_project: should initialize correctly and check project existence is invalid", () => {
        const bob_id = "u/bob";
        const tim_id = "u/tim";

        const project_key = "hot_potato";
        const project_id = "p/" + project_key;
        const repo_id = "repo/datafed-at-com";

        // Create nodes
        g_db.p.save({
            _key: project_key,
            _id: project_id,
            title: "Love potatoes",
            desc: "Potatoes are the best when fried.",
            admins: [tim_id],
            members: [bob_id],
        });

        const project = new Project(project_key);
        expect(project.exists()).to.be.true;
        expect(project.key()).to.equal(project_key);
        expect(project.error()).to.be.null;
        expect(project.hasAccess(bob_id)).to.be.true;
        expect(project.hasAccess(tim_id)).to.be.true;
    });

    it("unit_project: should be able to determine what allocations have been set on the project.", () => {
        const bob_id = "u/bob";
        const tim_id = "u/tim";

        const project_key = "hot_potato";
        const project_id = "p/" + project_key;

        const repo_key = "datafed-at-com";
        const repo_id = "repo/" + repo_key;

        // Create nodes
        g_db.p.save({
            _key: project_key,
            _id: project_id,
            title: "Love potatoes",
            desc: "Potatoes are the best when fried.",
            admins: [tim_id],
            members: [bob_id],
        });

        g_db.repo.save({
            _key: repo_key,
            _id: repo_id,
        });

        g_db.alloc.save({
            _from: project_id,
            _to: repo_id,
        });

        const project = new Project(project_key);
        expect(project.exists()).to.be.true;
        expect(project.getAllocations().length).to.equal(1);

        const exists = project.getAllocations().some((obj) => obj._to === repo_id);
        expect(exists).to.be.true;
    });
});
