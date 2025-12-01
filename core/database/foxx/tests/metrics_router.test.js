"use strict";

const g_lib = require("../api/support");
const { expect } = require("chai");
const request = require("@arangodb/request");
const { baseUrl } = module.context;
const { db } = require("@arangodb");

const metrics_base_url = `${baseUrl}/metrics`;

describe("unit_metrics_router: /users/active endpoint", () => {
    after(function () {
        const collections = ["metrics", "u"];
        collections.forEach((name) => {
            let col = db._collection(name);
            if (col) col.truncate();
        });
    });
    beforeEach(() => {
        const collections = ["metrics", "u"];
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
    
    it("POST /msg_count/update should succeed and write metrics", () => {
    // create user explicitly
    db.u.save({
      _key: "fakeUser",
      _id: "u/fakeUser",
      name: "Fake",
      email: "fake@example.com",
      is_admin: true
    });

    const payload = {
      timestamp: Math.floor(Date.now() / 1000),
      total: 99,
      uids: {
        a: { tot: 5, msg: "hello" },
        b: { tot: 7, msg: "yo" }
      }
    };

    const res = request.post(
      `${metrics_base_url}/msg_count/update?client=u/fakeUser`,
      { body: payload, json: true }
    );

    expect(res.status).to.equal(204);

    const docs = db.metrics.toArray();
    expect(docs.length).to.equal(3); // total + 2 users
  });

      it("GET /msg_count should return items within default 60 minutes", () => {
    // create user explicitly
    db.u.save({
      _key: "fakeUser",
      _id: "u/fakeUser",
      name: "Fake",
      email: "fake@example.com",
      is_admin: true
    });

    const now = Math.floor(Date.now() / 1000);

    // recent item (should return)
    db.metrics.save({
      timestamp: now,
      type: "msgcnt_total",
      total: 1
    });

    // old item (should NOT return)
    db.metrics.save({
      timestamp: now - (60 * 60 * 2), // older than 60 min
      type: "msgcnt_total",
      total: 999
    });

    const res = request.get(
      `${metrics_base_url}/msg_count?client=u/fakeUser`
    );

    expect(res.status).to.equal(200);

    const arr = JSON.parse(res.body);
    expect(arr.length).to.equal(1);
    expect(arr[0].total).to.equal(1);
  });

    it("GET /msg_count should filter by type and uid", () => {
    // create user explicitly
    db.u.save({
      _key: "fakeUser",
      _id: "u/fakeUser",
      name: "Fake",
      email: "fake@example.com",
      is_admin: true
    });

    const ts = Math.floor(Date.now() / 1000);

    db.metrics.save({
      timestamp: ts,
      type: "msgcnt_user",
      uid: "u1",
      total: 10
    });

    db.metrics.save({
      timestamp: ts,
      type: "msgcnt_user",
      uid: "u2",
      total: 20
    });

    const res = request.get(
      `${metrics_base_url}/msg_count?client=u/fakeUser&type=msgcnt_user&uid=u2`
    );

    expect(res.status).to.equal(200);

    const arr = JSON.parse(res.body);
    expect(arr.length).to.equal(1);
    expect(arr[0].uid).to.equal("u2");
  });

   it("POST /purge should remove metrics older than timestamp", () => {
  const now = Math.floor(Date.now() / 1000);

  db.metrics.save([
    { timestamp: now - 1000, type: "msgcnt_total", total: 1 }, // should be removed
    { timestamp: now, type: "msgcnt_total", total: 2 },        // should stay
  ]);

  const ts = now - 500;
  const res = request.post(`${metrics_base_url}/purge?timestamp=${ts}`);

  expect(res.status).to.equal(204);

  const docs = db.metrics.toArray();
  //Equals 2 due to writing the purge doc
  expect(docs.length).to.equal(2);
  expect(docs[0].total).to.equal(2);
}); 
});
