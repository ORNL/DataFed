"use strict";

const g_lib = require("../api/support");
const { expect } = require("chai");
const request = require("@arangodb/request");
const { baseUrl } = module.context;
const { db } = require("@arangodb");

const metrics_base_url = `${baseUrl}/metrics`;

describe("unit_metrics_router: /users/active endpoint", () => {
    beforeEach(() => {
        const collections = ["metrics"];
        collections.forEach((name) => {
            let col = db._collection(name);
            if (col) {
                col.truncate();
            } else {
                db._create(name);
            }
        });
    });

    it("should return active users within the default 15 minutes", () => {
        const now = Math.floor(Date.now() / 1000);

        db.metrics.save([
            {
                _key: "m1",
                type: "msgcnt_user",
                uid: "u/fakeUser",
                total: 5,
                timestamp: now - 60 * 5, // 5 minutes ago
            },
            {
                _key: "m2",
                type: "msgcnt_user",
                uid: "u/otherUser",
                total: 10,
                timestamp: now - 60 * 20, // 20 minutes ago
            },
        ]);

        const request_string = `${metrics_base_url}/users/active`;
        const response = request.get(request_string);

        expect(response.status).to.equal(200);

        const body = JSON.parse(response.body);

        // u/fakeUser should appear, u/otherUser should not
        expect(body).to.have.property("u/fakeUser");
        expect(body["u/fakeUser"]).to.equal(5);
        expect(body).to.not.have.property("u/otherUser");
    });

    it("should respect the 'since' query parameter", () => {
        const now = Math.floor(Date.now() / 1000);

        db.metrics.save([
            {
                _key: "m3",
                type: "msgcnt_user",
                uid: "u/fakeUser",
                total: 7,
                timestamp: now - 60 * 30, // 30 minutes ago
            },
        ]);

        // since=45 → include 30-min-old record
        let response = request.get(`${metrics_base_url}/users/active?since=45`);
        expect(response.status).to.equal(200);
        let body = JSON.parse(response.body);
        expect(body).to.have.property("u/fakeUser");

        // since=15 → exclude 30-min-old record
        response = request.get(`${metrics_base_url}/users/active?since=15`);
        expect(response.status).to.equal(200);
        body = JSON.parse(response.body);
        expect(body).to.not.have.property("u/fakeUser");
    });

    it("should return an empty object if no users are active", () => {
        const response = request.get(`${metrics_base_url}/users/active`);
        expect(response.status).to.equal(200);
        const body = JSON.parse(response.body);
        expect(body).to.deep.equal({});
    });
});

