"use strict";

const { expect } = require("chai");
const request = require("@arangodb/request");
const { db } = require("@arangodb");
const { baseUrl } = module.context;

const acl_base_url = `${baseUrl}/acl`;

describe("unit_acl_router: test /update route", () => {
    after(function () {
        const collections = ["member", "u", "c", "d", "acl", "owner", "g"];
        collections.forEach((name) => {
            let col = db._collection(name);
            if (col) col.truncate();
        });
    });

    beforeEach(() => {
        // Ensure necessary collections exist
        const collections = ["member", "u", "c", "d", "acl", "owner", "g"];
        collections.forEach((name) => {
            let col = db._collection(name);
            if (col) col.truncate();
            else db._create(name);
        });

        // Create a fake user
        db.u.save({
            _key: "fakeUser",
            _id: "u/fakeUser",
            name: "Fake User",
            is_admin: true,
        });

        // Create a fake collection
        db.c.save({
            _key: "coll1",
            _id: "c/coll1",
            name: "Fake Collection",
        });

        // Link owner
        db.owner.save({
            _from: "c/coll1",
            _to: "u/fakeUser",
        });
        db.acl.save({
            _from: "c/coll1",
            _to: "u/fakeUser",
            id: "u/fakeUser",
            grant: 1,
            inhgrant: 0,
        });

        db.u.save({
            _key: "otherUser",
            _id: "u/otherUser",
            name: "Other User",
            is_admin: false,
        });

        db.c.update("coll1", { owner: "u/fakeUser" });

        db.acl.save({
            _from: "c/coll1",
            _to: "u/otherUser",
            grant: 1,
            inhgrant: 0,
        });

        db.member.save({
            _from: "c/coll1",
            _to: "u/otherUser",
        });
        db.c.update("coll1", { owner: "u/fakeUser" });
    });

    it("should update ACL for a collection", () => {
        const rules = [
            {
                id: "u/fakeUser",
                grant: 1, // minimal permission for testing
                inhgrant: 0,
            },
        ];

        // Build query string
        const query = `client=u/fakeUser&id=c/coll1&rules=${encodeURIComponent(
            JSON.stringify(rules),
        )}`;

        // Act
        const response = request.get(`${acl_base_url}/update?${query}`);

        // Assert
        expect(response.status).to.equal(200);

        const body = JSON.parse(response.body);
        expect(body).to.be.an("array");
        expect(body[0]).to.have.property("id", "u/fakeUser");
        expect(body[0]).to.have.property("grant", 1);
    });

    it("should view ACLs for a collection", () => {
        const query = `client=u/fakeUser&id=c/coll1`;

        const response = request.get(`${baseUrl}/acl/view?${query}`);

        // Expect HTTP 200
        expect(response.status).to.equal(200);

        // Parse body
        const body = JSON.parse(response.body);
        expect(body).to.be.an("array");
        expect(body.length).to.equal(2);

        const ids = body.map((x) => x.id);
        expect(ids).to.include("u/fakeUser");
        expect(ids).to.include("u/otherUser");
    });

    it("should list users who have shared objects with the subject", () => {
        const query = "client=u/otherUser&inc_users=true&inc_projects=false";

        const response = request.get(`${baseUrl}/acl/shared/list?${query}`);

        db.member.save({ _from: "c/coll1", _to: "u/otherUser" });

        expect(response.status).to.equal(200);

        const body = JSON.parse(response.body);

        // Expect an array of users/projects that shared with otherUser
        expect(body).to.be.an("array");
        expect(body.length).to.equal(1);

        // Expect fakeUser to appear as the one who shared
        expect(body[0]).to.have.property("id", "u/fakeUser");
    });

    it("should list items shared by owner with the client", () => {
        const query = "client=u/otherUser&owner=u/fakeUser";

        const response = request.get(`${baseUrl}/acl/shared/list/items?${query}`);
        expect(response.status).to.equal(200);

        const body = JSON.parse(response.body);
        expect(body).to.be.an("array");

        // Should include the collection already shared
        const ids = body.map((item) => item.id);
        expect(ids).to.include("c/coll1"); // already exists
    });
});
