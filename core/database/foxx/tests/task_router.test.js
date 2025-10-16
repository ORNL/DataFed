"use strict";
// NOTE: completion of tests requires successful run of user_fixture.js script

// Need to pull enum from support
const g_lib = require("../api/support");

// Integration test of API
const { expect } = require("chai");
const request = require("@arangodb/request");
const { baseUrl } = module.context;
const { db } = require("@arangodb");

const task_base_url = `${baseUrl}/task`;

describe("unit_task_router: the Foxx microservice task_router list/ endpoint", () => {
    beforeEach(() => {
        const collections = [ "u", "task"];
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
        db.task.save({
            _key: "1",
            _id: "task/1",
            client: "u/fakeUser", // Add this so the query doesn't fail on client match
            ut: Date.now() / 1000,
            status: 1,
        });

        // arrange
        // TODO: make encoded query params less hard coded
        const request_string = `${task_base_url}/list?client=u/fakeUser&task_id=task/1`;
        // act
        const response = request.get(request_string);
        // assert
        expect(response.status).to.equal(200);
    });

    it("should raise an exception with invalid client", () => {
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

        // arrange
        // TODO: make encoded query params less hard coded
        const request_string = `${task_base_url}/list?client=u/BOOMPOWSHOUT`;
        // act
        const response = request.get(request_string);
        // assert
        expect(response.status).to.equal(400);
    });

});

// NOTE: describe block strings are compared against test specification during test call, not file name
describe("unit_task_router: the Foxx microservice task_router view/ endpoint", () => {
    it("should succeed running the view route", () => {
        db.task.save({
            _key: "2",
            _id: "task/2",
            client: "u/fakeUser", // Add this so the query doesn't fail on client match
            ut: Date.now() / 1000,
            status: 1,
        });
        // arrange
        // TODO: make encoded query params less hard coded
        const request_string = `${task_base_url}/view?client=u/fakeUser&task_id=task/2`;

        // act
        const response = request.get(request_string);
        // assert
        expect(response.status).to.equal(200);
    });

    it("should raise an exception with invalid task", () => {
        // arrange
        // TODO: make encoded query params less hard coded
        const request_string = `${task_base_url}/view?client=u/fakeUser&task_id=task/thisaintitchief`;

        // act
        const response = request.get(request_string);
        // assert
        expect(response.status).to.equal(400);
    });
});

describe("unit_task_router: the Foxx microservice task_router run/ endpoint", () => {
    it("should succeed the run route", () => {
        db.task.save({
            _key: "3",
            _id: "task/3",
            client: "u/fakeUser", // Add this so the query doesn't fail on client match
            ut: Date.now() / 1000,
            status: 1,
            type: g_lib.TT_DATA_GET,
        });

        // arrange
        // TODO: make encoded query params less hard coded
        const request_string = `${task_base_url}/run?client=u/fakeUser&task_id=task/3`;

        // act
        const response = request.get(request_string);

        // assert
        expect(response.status).to.equal(200);
    });
    it("should raise an exception with invalid task", () => {
        // arrange
        // TODO: make encoded query params less hard coded
        const request_string = `${task_base_url}/run?client=u/fakeUser&task_id=task/wow...Icantbelieveitdidntwork`;

        // act
        const response = request.get(request_string);

        // assert
        expect(response.status).to.equal(400);
    });

});
