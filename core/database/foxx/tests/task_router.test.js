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

// NOTE: describe block strings are compared against test specification during test call, not file name
describe("unit_task_router: the Foxx microservice task_router view/ endpoint", () => {
    it("should raise an exception with invalid task", () => {
        // arrange
        // TODO: make encoded query params less hard coded
        const request_string = `${task_base_url}/view?task_id=task/1`;

        // act
        const response = request.get(request_string);
        // assert
        //expect(response.status).to.equal(400);

        console.log(response.status);
        //const user_token_data = db.u.document({ _key: query_params._key });
        //expect(user_token_data).to.include(query_params);
    });
});

describe("unit_task_router: the Foxx microservice task_router run/ endpoint", () => {
    it("should raise an exception with invalid task", () => {
        // arrange
        // TODO: make encoded query params less hard coded
        const request_string = `${task_base_url}/run?task_id=task/1`;

        // act
        const response = request.get(request_string);
        // assert
        //expect(response.status).to.equal(204);
        console.log(response.status);
        //const user_token_data = db.u.document({ _key: query_params._key });
        //expect(user_token_data).to.include(query_params);
    });
});
