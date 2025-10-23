"use strict";
// NOTE: completion of tests requires successful run of user_fixture.js script

// Need to pull enum from support
const g_lib = require("../api/support");

// Integration test of API
const { expect } = require("chai");
const request = require("@arangodb/request");
const { baseUrl } = module.context;
const { db } = require("@arangodb");

const topic_base_url = `${baseUrl}/topic`;

describe("unit_topic_router: the Foxx microservice topic_router /view endpoint", () => {
    beforeEach(() => {
        const collections = ["u", "t"];
        collections.forEach((name) => {
            let col = db._collection(name);
            if (col) {
                col.truncate(); // truncate after ensuring collection exists
            } else {
                db._create(name); // create if it doesn’t exist
            }
        });
    });

    it("should successfully run the list route", () => {
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

        db.t.save({
        _key: "12110",
        });

        // arrange
        // TODO: make encoded query params less hard coded
        const request_string = `${topic_base_url}/view?client=u/fakeUser&id=10`;
        // act
        const response = request.get(request_string);
        // assert
        expect(response.status).to.equal(400);
    });

    it("should successfully run the list route", () => {
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

        db.t.save({
        _key: "10",
        });

        // arrange
        // TODO: make encoded query params less hard coded
        const request_string = `${topic_base_url}/view?client=u/fakeUser&id=10`;
        // act
        const response = request.get(request_string);
        // assert
        expect(response.status).to.equal(200);
    });

});
