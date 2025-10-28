"use strict";
// NOTE: completion of tests requires successful run of user_fixture.js script

// Need to pull enum from support
const g_lib = require("../api/support");

// Integration test of API
const { expect } = require("chai");
const request = require("@arangodb/request");
const { baseUrl } = module.context;
const { db } = require("@arangodb");

const tag_base_url = `${baseUrl}/tag`;

describe("unit_tag_router: the Foxx microservice topic_router /search endpoint", () => {
    after(function () {
        const collections = ["tag"];
        collections.forEach((name) => {
            let col = db._collection(name);
            if (col) col.truncate();
        });
    });

    beforeEach(() => {
        const collections = ["tag"];
        collections.forEach((name) => {
            let col = db._collection(name);
            if (col) {
                col.truncate(); // truncate after ensuring collection exists
            } else {
                db._create(name); // create if it doesn’t exist
            }
        });
    });

    it("should successfully run the search route", () => {
        db.tag.save({
            name: "testName",
        });

        // arrangesudo journalctl -u arangodb3.service -f
        // TODO: make encoded query params less hard coded
        const request_string = `${tag_base_url}/search?name=testName`;
        // act
        const response = request.post(request_string);
        // assert
        expect(response.status).to.equal(200);
    });

    it("should successfully run the list by count route", () => {
        db.tag.save({
            name: "testName",
        });

        // arrangesudo journalctl -u arangodb3.service -f
        // TODO: make encoded query params less hard coded
        const request_string = `${tag_base_url}/list/by_count`;
        // act
        const response = request.post(request_string);
        // assert
        expect(response.status).to.equal(200);
    });

});
