"use strict";

const { expect } = require("chai");
const request = require("@arangodb/request");
const { db } = require("@arangodb");
const { baseUrl } = module.context;

const proj_base_url = `${baseUrl}/prj`;

describe("unit_proj_router: test project create endpoint", () => {
    beforeEach(() => {
        const collections = [
            "u",
            "p",
            "repo",
            "admin",
            "owner",
            "c",
            "a",
            "g",
            "acl",
            "member",
            "ident",
            "alias",
            "uuid",
            "accn",
        ];

        collections.forEach((name) => {
            const col = db._collection(name);
            if (col) col.truncate();
            else db._create(name);
        });
    });

    after(() => {
        const collections = [
            "u",
            "p",
            "repo",
            "admin",
            "owner",
            "c",
            "a",
            "g",
            "acl",
            "member",
            "ident",
            "alias",
            "uuid",
            "accn",
        ];

        collections.forEach((name) => {
            const col = db._collection(name);
            if (col) col.truncate();
        });
    });

    it("should create a new project when client is a repo admin", () => {
        // ------------------------------------------------------------------
        // arrange
        // ------------------------------------------------------------------

        // create user
        db.u.save({
            _key: "proj_admin",
            _id: "u/proj_admin",
            is_admin: false,
            max_proj: -1,
        });

        // create repo
        db.repo.save({
            _key: "testrepo",
            title: "Test Repo",
            capacity: 0,
            type: "metadata",
        });

        // link user as repo admin (required by /prj/create)
        db.admin.save({
            _from: "repo/testrepo",
            _to: "u/proj_admin",
        });

        const url =
            `${proj_base_url}/create` +
            `?client=u/proj_admin` +
            `&id=myproject` +
            `&title=My+Project` +
            `&desc=Test+project+description`;

        // ------------------------------------------------------------------
        // act
        // ------------------------------------------------------------------

        const response = request.get(url, {
            headers: { "x-correlation-id": "test-proj-create" },
        });

        // ------------------------------------------------------------------
        // assert
        // ------------------------------------------------------------------

        expect(response.status).to.equal(200);

        const body = JSON.parse(response.body);
        expect(body).to.be.an("array").with.lengthOf(1);

        const project = body[0];

        // project fields
        expect(project).to.have.property("id");
        expect(project).to.have.property("title", "My Project");
        expect(project).to.have.property("desc", "Test project description");
        expect(project).to.have.property("owner", "u/proj_admin");

        // admins / members arrays initialized
        expect(project).to.have.property("admins").that.is.an("array");
        expect(project).to.have.property("members").that.is.an("array");

        const exists = db._exists(project.id);
        expect(exists).to.not.equal(null);

        // owner edge created
        const ownerEdge = db.owner.firstExample({
            _from: project.id,
            _to: "u/proj_admin",
        });
        expect(ownerEdge).to.exist;

        // root collection created
        const rootCollection = db.c.firstExample({
            owner: project.id,
            is_root: true,
        });
        expect(rootCollection).to.exist;

        // members group created
        const membersGroup = db.g.firstExample({
            uid: project.id,
            gid: "members",
        });
        expect(membersGroup).to.exist;
    });
    it("should update project metadata and membership when client is project admin", () => {
        // ------------------------------------------------------------------
        // arrange
        // ------------------------------------------------------------------

        // users
        db.u.save({ _key: "proj_admin", is_admin: false });
        db.u.save({ _key: "new_admin", is_admin: false });
        db.u.save({ _key: "member1", is_admin: false });

        // project
        db.p.save({
            _key: "myproject",
            title: "Old Title",
            desc: "Old description",
            ct: 1,
            ut: 1,
            owner: "u/proj_admin",
        });

        // owner edge
        db.owner.save({
            _from: "p/myproject",
            _to: "u/proj_admin",
        });

        // members group (MUST match create logic exactly)
        const memGrp = db.g.save({
            uid: "p/myproject",
            gid: "members",
            title: "Project Members",
            desc: "Use to set baseline project member permissions.",
        });

        // ownership edge: group -> project
        db.owner.save({
            _from: memGrp._id,
            _to: "p/myproject",
        });

        // existing admin edge
        db.admin.save({
            _from: "p/myproject",
            _to: "u/proj_admin",
        });

        const url =
            `${proj_base_url}/update` +
            `?client=u/proj_admin` +
            `&id=p/myproject` +
            `&title=New+Title` +
            `&desc=New+description`;

        // ------------------------------------------------------------------
        // act
        // ------------------------------------------------------------------

        const response = request.get(url, {
            headers: { "x-correlation-id": "test-proj-update" },
        });

        // ------------------------------------------------------------------
        // assert
        // ------------------------------------------------------------------

        expect(response.status).to.equal(200);

        const body = JSON.parse(response.body);
        expect(body).to.be.an("array").with.lengthOf(1);

        const proj = body[0];
        // core fields updated
        expect(proj).to.have.property("id", "p/myproject");
        expect(proj).to.have.property("title", "New Title");
        expect(proj).to.have.property("desc", "New description");

        // admins unchanged
        expect(proj.admins).to.have.members(["u/proj_admin"]);

        // members unchanged
        expect(proj.members).to.be.an("array").that.is.empty;

        // project document updated in DB
        const storedProj = db.p.document("p/myproject");
        expect(storedProj.title).to.equal("New Title");
        expect(storedProj.desc).to.equal("New description");
    });

    it("should return project info including admins and members", () => {
        // --- arrange ---
        // create users
        db.u.save({ _key: "proj_admin" });
        db.u.save({ _key: "member1" });

        // create project
        db.p.save({
            _key: "myproject",
            title: "Test Project",
            desc: "Test description",
            owner: "u/proj_admin",
        });

        // admin edge
        db.admin.save({ _from: "p/myproject", _to: "u/proj_admin" });

        // members group
        const memGrp = db.g.save({
            uid: "p/myproject",
            gid: "members",
            title: "Project Members",
            desc: "Use to set baseline project member permissions.",
        });

        // ownership edge: group -> project
        db.owner.save({
            _from: memGrp._id,
            _to: "p/myproject",
        });

        // member edge: group -> user
        db.member.save({
            _from: memGrp._id,
            _to: "u/member1",
        });

        // --- act ---
        const url = `${proj_base_url}/view?client=u/proj_admin&id=p/myproject`;
        const response = request.get(url, { headers: { "x-correlation-id": "test-proj-view" } });

        // --- assert ---
        expect(response.status).to.equal(200);

        const body = JSON.parse(response.body);
        expect(body).to.be.an("array").with.lengthOf(1);

        const proj = body[0];
        expect(proj).to.have.property("id", "p/myproject");
        expect(proj).to.have.property("title", "Test Project");
        expect(proj).to.have.property("desc", "Test description");

        // admins
        expect(proj.admins).to.be.an("array").that.includes("u/proj_admin");

        // members
        expect(proj.members).to.be.an("array").that.includes("u/member1");

        // allocs array should exist even if empty
        expect(proj).to.have.property("allocs").that.is.an("array");
    });

    it("should return a list of projects for a client including ownership, admin, and member roles", () => {
        // ------------------------------------------------------------------
        // Arrange: setup users and projects
        // ------------------------------------------------------------------
        db.u.save({ _key: "proj_owner", is_admin: false });
        db.u.save({ _key: "proj_admin", is_admin: false });
        db.u.save({ _key: "proj_member", is_admin: false });

        // Project 1: owned by proj_owner
        db.p.save({
            _key: "proj1",
            title: "Project One",
            desc: "First project",
            ct: 1,
            ut: 1,
            owner: "u/proj_owner",
        });
        db.owner.save({ _from: "p/proj1", _to: "u/proj_owner" });

        // Project 2: admin by proj_owner
        db.p.save({
            _key: "proj2",
            title: "Project Two",
            desc: "Second project",
            ct: 1,
            ut: 1,
            owner: "u/proj_admin",
        });
        db.admin.save({ _from: "p/proj2", _to: "u/proj_owner" });

        // Project 3: member role for proj_owner
        db.p.save({
            _key: "proj3",
            title: "Project Three",
            desc: "Third project",
            ct: 1,
            ut: 1,
            owner: "u/proj_admin",
        });

        const membersGroup = db.g.save({
            uid: "p/proj3",
            gid: "members",
            title: "Project Three Members",
            desc: "Member group for proj3",
        });

        db.owner.save({ _from: membersGroup._id, _to: "p/proj3" });
        db.member.save({ _from: membersGroup._id, _to: "u/proj_owner" });

        // ------------------------------------------------------------------
        // Act: call the /list route
        // ------------------------------------------------------------------
        const url =
            `${proj_base_url}/list` +
            `?client=u/proj_owner` +
            `&as_owner=true&as_admin=true&as_member=true`;

        const response = request.get(url, {
            headers: { "x-correlation-id": "test-proj-list" },
        });

        // ------------------------------------------------------------------
        // Assert
        // ------------------------------------------------------------------
        expect(response.status).to.equal(200);

        const body = JSON.parse(response.body);
        const ids = body.map((p) => p.id);

        expect(ids).to.include.members(["p/proj1", "p/proj2", "p/proj3"]);
    });

    it("should search projects using a provided AQL query", () => {
        // ------------------------------------------------------------------
        // Arrange
        // ------------------------------------------------------------------
        db.u.save({ _key: "search_user", is_admin: false });

        db.p.save({
            _key: "search_proj1",
            title: "Alpha Project",
            desc: "First searchable project",
            ct: 1,
            ut: 1,
            owner: "u/search_user",
        });

        db.p.save({
            _key: "search_proj2",
            title: "Beta Project",
            desc: "Second searchable project",
            ct: 1,
            ut: 1,
            owner: "u/search_user",
        });

        // AQL query passed directly to /search
        const aql = "FOR p IN p FILTER p.title LIKE '%Project%' RETURN p._id";

        const url =
            `${proj_base_url}/search` +
            `?client=u/search_user` +
            `&query=${encodeURIComponent(aql)}`;

        // ------------------------------------------------------------------
        // Act
        // ------------------------------------------------------------------
        const response = request.get(url, {
            headers: { "x-correlation-id": "test-proj-search" },
        });

        // ------------------------------------------------------------------
        // Assert
        // ------------------------------------------------------------------
        expect(response.status).to.equal(200);

        const body = JSON.parse(response.body);

        expect(body).to.be.an("array");
        expect(body).to.include.members(["p/search_proj1", "p/search_proj2"]);
    });

    it("should enqueue a project delete task when client is authorized", () => {
        // ------------------------------------------------------------------
        // Arrange
        // ------------------------------------------------------------------
        db.u.save({ _key: "delete_admin", is_admin: true });

        db.p.save({
            _key: "delete_proj1",
            title: "Delete Me",
            desc: "Project to be deleted",
            ct: 1,
            ut: 1,
            owner: "u/delete_admin",
        });

        db.owner.save({
            _from: "p/delete_proj1",
            _to: "u/delete_admin",
        });

        db.admin.save({
            _from: "p/delete_proj1",
            _to: "u/delete_admin",
        });

        const url = `${proj_base_url}/delete?client=u/delete_admin`;

        // ------------------------------------------------------------------
        // Act
        // ------------------------------------------------------------------
        const response = request.post(url, {
            headers: {
                "content-type": "application/json",
                "x-correlation-id": "test-proj-delete",
            },
            body: JSON.stringify({
                ids: ["p/delete_proj1"],
            }),
        });

        // ------------------------------------------------------------------
        // Assert
        // ------------------------------------------------------------------
        expect(response.status).to.equal(200);

        // Response body is allowed to be null
        const body = JSON.parse(response.body);
        expect(body).to.exist;
        expect(body).to.be.an("object");
        expect(body).to.have.property("task");

        // Delete is async — project still exists immediately
        expect(db.p.exists("p/delete_proj1")).to.exist;
    });

    it("should return the correct project role for client or subject", () => {
        // ------------------------------------------------------------------
        // arrange
        // ------------------------------------------------------------------

        db.u.save({ _key: "proj_owner", is_admin: false });
        db.u.save({ _key: "proj_admin", is_admin: false });
        db.u.save({ _key: "proj_member", is_admin: false });

        db.p.save({
            _key: "role_proj",
            title: "Role Test Project",
            owner: "u/proj_owner",
            ct: 1,
            ut: 1,
        });

        // owner edge
        db.owner.save({
            _from: "p/role_proj",
            _to: "u/proj_owner",
        });

        // admin edge
        db.admin.save({
            _from: "p/role_proj",
            _to: "u/proj_admin",
        });

        // members group
        const memGrp = db.g.save({
            uid: "p/role_proj",
            gid: "members",
            title: "Project Members",
            desc: "Members group",
        });

        db.owner.save({
            _from: memGrp._id,
            _to: "p/role_proj",
        });

        db.member.save({
            _from: memGrp._id,
            _to: "u/proj_member",
        });

        // ------------------------------------------------------------------
        // OWNER
        // ------------------------------------------------------------------

        let response = request.get(
            `${proj_base_url}/get_role` + `?client=u/proj_owner` + `&id=p/role_proj`,
            { headers: { "x-correlation-id": "test-proj-get-role-owner" } },
        );

        expect(response.status).to.equal(200);
        let body = JSON.parse(response.body);
        expect(body.role).to.equal(3); // owner

        // ------------------------------------------------------------------
        // ADMIN (subject)
        // ------------------------------------------------------------------

        response = request.get(
            `${proj_base_url}/get_role` +
                `?client=u/proj_owner` +
                `&subject=u/proj_admin` +
                `&id=p/role_proj`,
            { headers: { "x-correlation-id": "test-proj-get-role-admin" } },
        );

        expect(response.status).to.equal(200);
        body = JSON.parse(response.body);
        expect(body.role).to.equal(2); // admin

        // ------------------------------------------------------------------
        // MEMBER (subject)
        // ------------------------------------------------------------------

        response = request.get(
            `${proj_base_url}/get_role` +
                `?client=u/proj_owner` +
                `&subject=u/proj_member` +
                `&id=p/role_proj`,
            { headers: { "x-correlation-id": "test-proj-get-role-member" } },
        );

        expect(response.status).to.equal(200);
        body = JSON.parse(response.body);
        expect(body.role).to.equal(1); // member
    });


    it("should handle malformed AQL for /prj/search without crashing and return an error response", () => {
        // ------------------------------------------------------------------
        // Arrange
        // ------------------------------------------------------------------
        db.u.save({ _key: "search_user_malformed", is_admin: false });

        const client = "search_user_malformed";

        // Intentionally malformed AQL (missing RETURN and invalid syntax)
        const malformedBody = {
            client,
            aql: "FOR p IN p FILTER p.title == @title INVALID_SYNTAX",
            bindVars: {
                title: "Alpha Project",
            },
        };

        // ------------------------------------------------------------------
        // Act
        // ------------------------------------------------------------------
        const response = request.get("/prj/search", malformedBody);

        // ------------------------------------------------------------------
        // Assert
        // ------------------------------------------------------------------
        // Expect a 400-series error (bad request / invalid query) and a JSON error payload
        expect(response.status).to.be.within(400, 499);

        const body = JSON.parse(response.body);
        expect(body).to.have.property("error", true);
        expect(body).to.have.property("code");
        expect(body).to.have.property("errorMessage");
    });
});
