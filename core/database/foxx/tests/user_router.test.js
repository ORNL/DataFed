"use strict"

// Integration test of API
const { expect } = require("chai");
const request = require("@arangodb/request");
const { baseUrl } = module.context;
const { db } = require("@arangodb");

// this will not be needed for the required integration test
const user_router = require("../api/user_router");

const usr_base_url = `${baseUrl}/usr`


// NOTE: describe block strings are compared against test specification during test call, not file name
describe("user_router: the Foxx microservice user_router token/set endpoint", () => {
    it("should not pass this test test", () => {
        expect(false).to.be.true;
    });

    // TODO: in order for this test to function we need to first at least create a user
    //  to achieve this I am going to user a script to create a user fixture, this will be in the test dir
    it("should accept a valid user's token and execute an update", () => {
        // NOTE: the get request has query params instead of a body

        const query_params = {
            _key: "testUser0",
            access: "asdf",
            refresh: "jkl",
        };
        // TODO: make encoded query params less hard coded
        const request_string = `${usr_base_url}/token/set?client=${query_params._key}&access=${query_params.access}&refresh=${query_params.refresh}&expires_in=500000`
        const response = request.get(request_string);
        expect(response.status).to.equal(204);  // should pass

        const user_token_data = db.u.document({_key: query_params._key});
        expect(user_token_data).to.include(query_params);
    });
});