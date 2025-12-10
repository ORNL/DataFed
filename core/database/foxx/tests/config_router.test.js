"use strict";
// NOTE: completion of tests requires successful run of user_fixture.js script

// Need to pull enum from support
const g_lib = require("../api/support");

// Integration test of API
const { expect } = require("chai");
const request = require("@arangodb/request");
const { baseUrl } = module.context;
const { db } = require("@arangodb");

const config_base_url = `${baseUrl}/config`;

describe("unit_config_router: test /msg/daily route", () => {
    after(function () {
        const col = db._collection("config");
        if (col) col.truncate();
    });

    beforeEach(() => {
        let col = db._collection("config");
        if (col) {
            col.truncate();
        } else {
            db._create("config");
        }
    });

    it("should return an empty object when no daily message exists", () => {
        // arrange
        const url = `${config_base_url}/msg/daily`;

        // act
        const response = request.get(url);

        // assert
        expect(response.status).to.equal(200);

        const body = JSON.parse(response.body);
        expect(body).to.deep.equal({}); // empty object expected
    });

    it("should return the daily message when it exists", () => {
        // arrange: insert a config entry
        db.config.save({
            _key: "msg_daily",
            message: "Hello world!",
            customFlag: true
        });

        const url = `${config_base_url}/msg/daily`;

        // act
        const response = request.get(url);

        // assert
        expect(response.status).to.equal(200);

        const body = JSON.parse(response.body);

        // The route strips _id, _key, _rev
        expect(body).to.deep.equal({
            message: "Hello world!",
            customFlag: true
        });
    });
});

