"use strict";

const { expect } = require("chai");
const request = require("@arangodb/request");
const { db } = require("@arangodb");
const { baseUrl } = module.context;

const group_base_url = `${baseUrl}/grp`;

describe("unit_group_router: test group router endpoints", () => {
    beforeEach(() => {
        const collections = ["u", "g", "owner", "member", "p", "uuid", "accn", "admin"];
        collections.forEach((name) => {
            let col = db._collection(name);
            if (col) col.truncate();
            else db._create(name);
        });
    });

    after(() => {
        const collections = ["u", "g", "owner", "member", "p", "uuid", "accn", "admin"];
        collections.forEach((name) => {
            let col = db._collection(name);
            if (col) col.truncate();
        });
    });

    // ====================================================================
    // /create
    // ====================================================================

    it("should create a new group", () => {
        db.u.save({
            _key: "fakeUser",
            _id: "u/fakeUser",
            name_first: "Fake",
            name_last: "User",
            is_admin: true,
            email: "fake@user.com"
        });

        const url = `${group_base_url}/create?client=u/fakeUser&gid=testgroup&title=Test+Group`;

        const response = request.get(url, {
            headers: { "x-correlation-id": "test-correlation-id" }
        });

        expect(response.status).to.equal(200);
        const body = JSON.parse(response.body);

        expect(body).to.be.an("array");
        expect(body[0]).to.have.property("gid", "testgroup");
        expect(body[0]).to.have.property("title", "Test Group");
        expect(body[0]).to.have.property("members");
        expect(body[0].members).to.be.an("array").that.is.empty;
    });
 
    // ====================================================================
    // /list
    // ====================================================================

    it("should list groups for the user", () => {
        db.u.save({ _key: "fakeUser", _id: "u/fakeUser", is_admin: true });

        request.get(`${group_base_url}/create?client=u/fakeUser&gid=a&title=A`);
        request.get(`${group_base_url}/create?client=u/fakeUser&gid=b&title=B`);

        const response = request.get(`${group_base_url}/list?client=u/fakeUser`);
        expect(response.status).to.equal(200);

        const list = JSON.parse(response.body);

        expect(list.length).to.equal(2);
        expect(list.map(g => g.gid)).to.have.members(["a", "b"]);
    });

    // ====================================================================
    // /delete
    // ====================================================================

    it("should delete a group", () => {
        db.u.save({ _key: "fakeUser", _id: "u/fakeUser", is_admin: true });

        request.get(`${group_base_url}/create?client=u/fakeUser&gid=testgroup&title=A`);
        
        const delUrl = `${group_base_url}/delete?client=u/fakeUser&gid=testgroup&title=A`;
        const response = request.get(delUrl);

        expect(response.status).to.equal(204);

        // Now verify it is actually deleted
        const list = request.get(`${group_base_url}/list?client=u/fakeUser`);
        const groups = JSON.parse(list.body);

        expect(groups).to.be.an("array").that.is.empty;
    });
    // ====================================================================
    // /view
    // ====================================================================

    it("should view an existing group", () => {
        db.u.save({ _key: "fakeUser", _id: "u/fakeUser", is_admin: true });

        request.get(`${group_base_url}/create?client=u/fakeUser&gid=viewtest&title=Viewer`);

        const response = request.get(`${group_base_url}/view?client=u/fakeUser&gid=viewtest`);
        expect(response.status).to.equal(200);

        const body = JSON.parse(response.body);

        expect(body[0]).to.include({
            gid: "viewtest",
            title: "Viewer"
        });
    });

    // ====================================================================
    // /update
    // ====================================================================
    it("should update an existing group", () => {
        db.u.save({ _key: "fakeUser", _id: "u/fakeUser", is_admin: true });

        db.g.save({
            uid: "u/fakeUser",
            gid: "updateMe",
            title: "OldTitle",
            desc: "Old description"
        });
        // Create
        request.get(`${group_base_url}/create?client=u/fakeUser&gid=updateMe&title=OldTitle`);
        
        // Update title via endpoint
        const response = request.get(
            `${group_base_url}/update?client=u/fakeUser&gid=updateMe&title=NewTitle`
        );

        expect(response.status).to.equal(200);

        const updated = JSON.parse(response.body)[0];
        expect(updated.title).to.equal("NewTitle");
    });
});
