"use strict";
// NOTE: completion of tests requires successful run of user_fixture.js script

// Need to pull enum from support
const g_lib = require("../api/support");

// Integration test of API
const { expect } = require("chai");
const request = require("@arangodb/request");
const { baseUrl } = module.context;
const { db } = require("@arangodb");

const qry_base_url = `${baseUrl}/qry`;

describe("unit_query_router: the Foxx microservice qry_router endpoints", () => {
    after(function () {
        const collections = ["u", "qry", "c", "note", "fake"];
        collections.forEach((name) => {
            let col = db._collection(name);
            if (col) col.truncate();
        });
    });

    beforeEach(() => {
        const collections = ["u", "qry", "c", "note", "fake"];
        collections.forEach((name) => {
            let col = db._collection(name);
            if (col) {
                col.truncate(); // truncate after ensuring collection exists
            } else {
                db._create(name); // create if it doesn’t exist
            }
        });
    });

    it("should successfully run the create route", () => {
        db.u.save({
            _key: "fakeUser",
            _id: "u/fakeUser",
            name: "fake user",
            name_first: "fake",
            name_last: "user",
            is_admin: true,
            max_coll: 50,
            max_proj: 10,
            max_sav_qry: 20,
            email: "fakeuser@gmail.com",
        });

        // Arrange
        const request_string = `${qry_base_url}/create?client=u/fakeUser`;

        const body = {
            title: "My Query",
            qry_begin: "FOR i IN something",
            qry_end: "RETURN i",
            qry_filter: "",
            params: {},
            limit: 10,
            query: {}, // adjust if necessary
        };

        const response = request.post(request_string, {
            json: true,
            body: body,
            headers: {
                "x-correlation-id": "test-correlation-id",
            },
        });

        // Assert
        expect(response.status).to.equal(200);
    });

    it("should fail running the create route", () => {
        db.u.save({
            _key: "fakeUser",
            _id: "u/fakeUser",
            name: "fake user",
            name_first: "fake",
            name_last: "user",
            is_admin: true,
            max_coll: 50,
            max_proj: 10,
            max_sav_qry: 20,
            email: "fakeuser@gmail.com",
        });

        // Arrange
        const request_string = `${qry_base_url}/create?client=u/wellthiswasunexpected`;

        const body = {
            title: "My Query",
            qry_begin: "FOR i IN something",
            qry_end: "RETURN i",
            qry_filter: "",
            params: {},
            limit: 10,
            query: {}, // adjust if necessary
        };

        const response = request.post(request_string, {
            json: true,
            body: body,
            headers: {
                "x-correlation-id": "test-correlation-id",
            },
        });

        // Assert
        expect(response.status).to.equal(400);
    });

    it("should return a list of saved queries for a valid user", () => {
        // arrange
        const fakeUser = {
            _key: "fakeUser",
            _id: "u/fakeUser",
            name: "Fake User",
            email: "fakeuser@datadev.org",
            is_admin: false,
            max_coll: 5,
            max_proj: 5,
            max_sav_qry: 10,
        };

        db.u.save(fakeUser);

        // Save the query and the edge between the query and the user
        var request_string = `${qry_base_url}/create?client=u/fakeUser`;

        var body = {
            title: "Test Query Title",
            qry_begin: "FOR i IN something",
            qry_end: "RETURN i",
            qry_filter: "",
            params: {},
            limit: 10,
            query: {}, // adjust if necessary
        };

        var response = request.post(request_string, {
            json: true,
            body: body,
            headers: {
                "x-correlation-id": "test-correlation-id",
            },
        });

        request_string = `${qry_base_url}/list?client=u/fakeUser`;

        // act
        response = request.get(request_string, {
            headers: {
                "x-correlation-id": "test-correlation-id",
            },
        });

        var parsed = JSON.parse(response.body);
        console.log("Response body:", response.body);
        // assert
        expect(response.status).to.equal(200);
        expect(parsed).to.be.an("array");
        expect(parsed.length).to.be.greaterThan(0);
    });

    it("should execute a query directly", () => {
        // arrange
        const fakeUser = {
            _key: "fakeUser",
            _id: "u/fakeUser",
            name: "Fake User",
            email: "fakeuser@datadev.org",
            is_admin: true,
            max_coll: 5,
            max_proj: 5,
            max_sav_qry: 10,
        };

        const fakeCol = {
            _key: "fakeCol",
            _id: "col/fakeCol",
            title: "fakeCol",
            desc: "This is a fake col",
        };

        db.u.save(fakeUser);

        // Save the query and the edge between the query and the user
        var request_string = `${qry_base_url}/exec/direct?client=u/fakeUser&owner=u/fakeUser&cols=c/fakeCol&cnt=1&off=0`;
        var body = {
            qry_begin: "FOR i in fake filter i.owner == @owner ",
            qry_end: " sort @off,@cnt RETURN distinct i",
            qry_filter: "",
            params: '{ "cnt": 1, "off": 0, "owner": "u/fakeUser"}',
            limit: 10,
            mode: 1,
            published: false,
        };

        // act
        var response = request.post(request_string, {
            json: true,
            body: body,
            headers: {
                "x-correlation-id": "test-correlation-id",
            },
        });

        // Assert
        expect(response.status).to.equal(200);
    });
});
