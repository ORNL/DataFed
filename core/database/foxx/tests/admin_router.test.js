"use strict";

// Integration test of API
const { expect } = require("chai");
const request = require("@arangodb/request");
const { baseUrl } = module.context;
const { db } = require("@arangodb");

// router base path (same pattern as your tag example)
const admin_base_url = `${baseUrl}/admin`;

describe("unit_admin_router: the Foxx microservice admin_router /ping endpoint", () => {

    // Clean up any collections if needed (this router doesn't use any)
    after(function () {
        const collections = ["u","test_collection"];
        collections.forEach((name) => {
            let col = db._collection(name);
            if (col) col.truncate();
        });
    });

    beforeEach(() => {
        // no collections used, but keeping consistency with your example
        const collections = ["u", "test_collection"];
        collections.forEach((name) => {
            let col = db._collection(name);
            if (col) {
                col.truncate();
            } else {
                db._create(name);
            }
        });
    });

    it("should successfully run the ping route", () => {
        // arrange
        const request_string = `${admin_base_url}/ping`;

        // act
        const response = request.get(request_string);

        // assert
        expect(response.status).to.equal(200);

        // Response structure from router:
        // { status: 1 }
        const body = JSON.parse(response.body);
        expect(body).to.be.an("object");
        expect(body.status).to.equal(1);
    });

    it("should successfully run the test route", () => {
    //Create user document for the client
    db.u.save({
        _key: "testUser",
        name: "Test User",
        email: "testuser@example.com",
        is_admin: true
    });

    const doc = db.d.save({ value: "testValue" }); // 'd' collection is allowed
    const item = `d/${doc._key}`;

    // Build query params
    const client = "testUser";

        const request_string =
            `${admin_base_url}/test?client=${encodeURIComponent(client)}&item=${encodeURIComponent(item)}`;

        // Act
        const response = request.get(request_string);

        // Assert response code
        expect(response.status).to.equal(200);

        const body = JSON.parse(response.body);

        expect(body).to.be.an("object");
        expect(body).to.have.property("perm");
        expect(body).to.have.property("time");

        // perm should be boolean
        expect(body.perm).to.be.a("boolean");

        // time should be numeric (seconds)
        expect(body.time).to.be.a("number");
    });

        it("should successfully run the check route", () => {
        const request_string = `${admin_base_url}/check`;

        const response = request.get(request_string);

        expect(response.status).to.equal(200);
        const body = JSON.parse(response.body);

        // Basic structure checks
        expect(body).to.be.an("object");
        expect(body).to.have.property("edge_bad_count");
        expect(body).to.have.property("vertex_bad_count");

        // Each edge/vertex category should exist
        const expectedKeys = [
            "owner", "member", "item", "acl", "ident", "admin", "alias", "alloc",
            "loc", "top", "dep", "data_no_owner", "data_multi_owner", "data_no_loc",
            "data_multi_loc", "data_no_parent", "coll_no_owner", "coll_multi_owner",
            "coll_no_parent", "coll_multi_parent", "group_no_owner", "group_multi_owner",
            "alias_no_owner", "alias_multi_owner", "alias_no_alias", "alias_multi_alias",
            "proj_no_owner", "proj_multi_owner", "query_no_owner", "query_multi_owner",
            "topic_no_parent", "topic_multi_parent", "repo_no_admin"
        ];

        expectedKeys.forEach(key => {
            expect(body).to.have.property(key);
            expect(body[key]).to.be.an("array");
        });

        // Counts should be numeric
        expect(body.edge_bad_count).to.be.a("number");
        expect(body.vertex_bad_count).to.be.a("number");
    });
});


