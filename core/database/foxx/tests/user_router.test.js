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
    const test_params = {
        _key: "testUser0",  // TODO: use module export from user_fixture.js
        access: "asdf",
        refresh: "jkl",
    };

    const test_edge_params = {
        type: 4,  // transfer token
        other_token_data: "1cbaaee5-b938-4a4e-87a8-f1ec4d5d92f9",   // fake UUID
    };

    it("should accept a valid user's token and execute an update", () => {
        // arrange
        // NOTE: the get request has query params instead of a body
        const query_params = test_params;
        // TODO: make encoded query params less hard coded
        const request_string = `${usr_base_url}/token/set?client=${query_params._key}&access=${query_params.access}&refresh=${query_params.refresh}&expires_in=500000`;

        // act
        const response = request.get(request_string);

        // assert
        expect(response.status).to.equal(204);

        const user_token_data = db.u.document({_key: query_params._key});
        expect(user_token_data).to.include(test_params);
    });

    it("should update only a valid user's token when additionally provided type", () => {
        // arrange
        const query_params = {
          ...test_params,
          type: 4,
        };
        // TODO: make encoded query params less hard coded
        const request_string = `${usr_base_url}/token/set?client=${query_params._key}&access=${query_params.access}&refresh=${query_params.refresh}&expires_in=500000&type=${query_params.type}`;

        // act
        const response = request.get(request_string);

        // assert
        assert(response.status).to.equal(204);

        const user_token_data = db.u.document({_key: query_params._key});
        expect(user_token_data).to.include(test_params);    // TODO: this data should be the same from the first test, we should find a way to ensure it has been updated

        const user_token_edge = db.globus_token.outEdges(user_token_data._id);
        expect(user_token_edge).to.be.empty;    // TODO: this depends on run order and must run before the test inserting to edge
    });

    it("should update only a valid user's token when additionally provided other token data", () => {
        // arrange
        const query_params = {
            ...test_params,
            other_token_data: "1cbaaee5-b938-4a4e-87a8-f1ec4d5d92f9",
        };
        // TODO: make encoded query params less hard coded
        const request_string = `${usr_base_url}/token/set?client=${query_params._key}&access=${query_params.access}&refresh=${query_params.refresh}&expires_in=500000&other_token_data=${query_params.other_token_data}`;

        // act
        const response = request.get(request_string);

        // assert
        assert(response.status).to.equal(204);

        const user_token_data = db.u.document({_key: query_params._key});
        expect(user_token_data).to.include(test_params);    // TODO: this data should be the same from the first test, we should find a way to ensure it has been updated

        const user_token_edge = db.globus_token.outEdges(user_token_data._id);
        expect(user_token_edge).to.be.empty;    // TODO: this depends on run order and must run before the test inserting to edge
    });

    it("should accept a valid user's token with additional type and globus collection data and add it to globus_token edge", () => {
        // arrange
        const query_params = {
            user_key: test_params._key,
            access: test_params.refresh,
            refresh: test_params.access,
            ...test_edge_params,
        };

        const expected_doc_key = query_params.user_key + "_" + query_params.other_token_data + "_" + query_params.type;
        const expected = {
            ...query_params,
            _key: expected_doc_key,
            _from: "u/" + query_params.user_key,
            _to: "globus_coll/" + query_params.other_token_data,
        };
        delete expected.other_token_data;   // unwanted data
        delete expected.user_key;

        // TODO: make encoded query params less hard coded
        const request_string = `${usr_base_url}/token/set?client=${query_params.user_key}&access=${query_params.access}&refresh=${query_params.refresh}&expires_in=500000&type=${query_params.type}&other_token_data=${query_params.other_token_data}`;

        // act
        const response = request.get(request_string);

        // assert
        expect(response.status).to.equal(204);

        // TODO: better data expectation when doc is defined
        const globus_collection_data = db.globus_coll.exists({_key: query_params.other_token_data});
        expect(globus_collection_data).to.exist;

        const globus_token_data = db.globus_token.document({_key: expected_doc_key});
        expect(globus_token_data).to.include(expected);

        const user_data = db.u.document({_key: query_params.user_key});
        expect(user_data.access).to.not.equal(query_params.access); // should not update user doc
    });
});