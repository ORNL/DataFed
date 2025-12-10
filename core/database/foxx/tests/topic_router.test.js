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
    after(function () {
        const collections = ["u", "t"];
        collections.forEach((name) => {
            let col = db._collection(name);
            if (col) col.truncate();
        });
    });

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
    it("should successfully run the search route", () => {
        // Create user
        db.u.save({
            _key: "fakeUser",
            is_admin: true,
        });

        // Create ArangoSearch View (if missing)
        if (!db._view("topicview")) {
            db._createView("topicview", "arangosearch", {
                links: {
                    t: {
                        includeAllFields: true,
                    },
                },
            });
        }

        // Insert topic
        db.t.save({
            _key: "s1",
            title: "Sample Topic",
        });

        // Force view to update (ArangoSearch is async)
        db._query("FOR d IN topicview SEARCH d.title == 'nothing' RETURN d");

        const request_string = `${topic_base_url}/search?client=fakeUser&phrase=Sample`;

        const response = request.get(request_string);

        expect(response.status).to.equal(200);
    });

    it("should list only top-level topics", () => {
        db.u.save({
            _key: "fakeUser",
            is_admin: true,
        });

        db.t.save({
            _key: "t1",
            title: "Alpha",
            top: true,
            admin: false,
            coll_cnt: 1,
        });

        db.t.save({
            _key: "t2",
            title: "Beta",
            top: true,
            admin: true,
            coll_cnt: 5,
        });

        db.t.save({
            _key: "child1",
            title: "Child Should Not Appear",
            top: false,
        });

        const url = `${topic_base_url}/list/topics?client=u/fakeUser`;

        const response = request.get(url);

        expect(response.status).to.equal(200);

        const body = JSON.parse(response.body);

        // last item is paging metadata
        const paging = body[body.length - 1].paging;

        expect(paging.tot).to.equal(2); // only Alpha + Beta

        const ids = body.slice(0, -1).map((x) => x._id);

        expect(ids).to.include("t/t1");
        expect(ids).to.include("t/t2");
        expect(ids).to.not.include("t/child1");
    });
});
