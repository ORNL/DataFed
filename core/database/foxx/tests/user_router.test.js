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
        const request_string = `${usr_base_url}/token/set?client=${query_params._key}&access=${query_params.access}&refresh=${query_params.refresh}&expires_in=500000`;

        // act
        const response = request.get(request_string);

        // assert
        expect(response.status).to.equal(204);  // should pass

        const user_token_data = db.u.document({_key: query_params._key});
        expect(user_token_data).to.include(query_params);
    });

    it("should accept a valid user's token with globus specification and add it to globus_token edge", () => {
        // arrange
        const query_params = {
            user_key: "testUser0",
            access: "asdf",
            refresh: "jkl",
            type: 4,  // transfer token
            other_token_data: "1cbaaee5-b938-4a4e-87a8-f1ec4d5d92f9",   // fake UUID
        };
        const expected_doc_key = query_params.user_key + "_" + query_params.other_token_data + "_" + query_params.type;
        const expected = {
            _key: expected_doc_key,
            _from: "u/" + query_params.user_key,
            _to: "globus_coll/" + query_params.other_token_data,
            ...query_params,
        };
        delete expected.other_token_data;   // unwanted data
        delete expected.user_key;
        // TODO: make encoded query params less hard coded
        const request_string = `${usr_base_url}/token/set?client=${query_params.user_key}&access=${query_params.access}&refresh=${query_params.refresh}&expires_in=500000&type=${query_params.type}&other_token_data=${query_params.other_token_data}`;

        // act
        const response = request.get(request_string);

        // assert
        expect(response.status).to.equal(204);

        const globus_token_data = db.globus_token.document({_key: expected_doc_key})
        expect(globus_token_data).to.include(expected)
    });
});