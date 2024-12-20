"use strict"
// NOTE: completion of tests requires successful run of user_fixture.js script

// Integration test of API
const { expect } = require("chai");
const request = require("@arangodb/request");
const { baseUrl } = module.context;
const { db } = require("@arangodb");

const usr_base_url = `${baseUrl}/usr`


// NOTE: describe block strings are compared against test specification during test call, not file name
describe("user_router: the Foxx microservice user_router token/set endpoint", () => {
    it("should accept a valid user's token and execute an update", () => {
        // arrange
        // NOTE: the get request has query params instead of a body
        const query_params = {
            _key: "testUser0",
            access: "asdf",
            refresh: "jkl",
        };
        // TODO: make encoded query params less hard coded
        const request_string = `${usr_base_url}/token/set?client=${query_params._key}&access=${query_params.access}&refresh=${query_params.refresh}&expires_in=500000`

        // act
        const response = request.get(request_string);

        // assert
        expect(response.status).to.equal(204);  // should pass

        const user_token_data = db.u.document({_key: query_params._key});
        expect(user_token_data).to.include(query_params);
    });
});