"use strict";
// NOTE: completion of tests requires successful run of user_fixture.js script

// Need to pull enum from support
const g_lib = require("../api/support");

// Integration test of API
const { expect } = require("chai");
const request = require("@arangodb/request");
const { baseUrl } = module.context;
const { db } = require("@arangodb");

const usr_base_url = `${baseUrl}/usr`;

// NOTE: describe block strings are compared against test specification during test call, not file name
describe("unit_user_router: the Foxx microservice user_router token/set endpoint", () => {
    const test_param_indexes = [0, 1, 2, 3, 4];
    const test_params = test_param_indexes.map((param_index) => {
        return {
            _key: "testUser" + param_index,
            access: "access_token" + param_index,
            refresh: "refresh_token" + param_index,
            access_len: 96,
            access_iv: "access_iv" + param_index,
            refresh_len: 96,
            refresh_iv: "refresh_iv" + param_index,
        };
    });
    const test_uuid = "1cbaaee5-b938-4a4e-87a8-f1ec4d5d92f9"; // fake UUID
    const test_scope = "urn:globus:auth:scope:transfer.api.globus.org:all";
    const test_edge_params = {
        type: g_lib.AccessTokenType.GLOBUS_TRANSFER,
        other_token_data: test_uuid + "%7C" + test_scope, // URL encoded | character
    };

    it("should accept a valid user's token and execute an update", () => {
        // arrange
        // NOTE: the get request has query params instead of a body
        const query_params = test_params[0];
        // TODO: make encoded query params less hard coded
        const request_string = `${usr_base_url}/token/set?client=${query_params._key}&access=${query_params.access}&refresh=${query_params.refresh}&expires_in=500000&access_len=${query_params.access_len}&access_iv=${query_params.access_iv}&refresh_len=${query_params.refresh_len}&refresh_iv=${query_params.refresh_iv}`;

        // act
        const response = request.get(request_string);

        // assert
        expect(response.status).to.equal(204);

        const user_token_data = db.u.document({ _key: query_params._key });
        expect(user_token_data).to.include(query_params);
    });

    it("should error when only additionally provided type", () => {
        // arrange
        const local_test_params = test_params[1];
        const query_params = {
            ...local_test_params,
            type: test_edge_params.type,
        };
        // TODO: make encoded query params less hard coded
        const request_string = `${usr_base_url}/token/set?client=${query_params._key}&access=${query_params.access}&refresh=${query_params.refresh}&expires_in=500000&type=${query_params.type}&access_len=${query_params.access_len}&access_iv=${query_params.access_iv}&refresh_len=${query_params.refresh_len}&refresh_iv=${query_params.refresh_iv}`;

        // act
        const response = request.get(request_string);

        // assert
        expect(response.status).to.equal(400);
        expect(response.body).to.include("type and other_token_data depend on one another");

        const user_token_data = db.u.document({ _key: query_params._key });
        const user_token_edge = db.globus_token.outEdges(user_token_data._id);
        expect(user_token_edge).to.be.empty;
    });

    it("should error when only additionally provided other token data", () => {
        // arrange
        const local_test_params = test_params[2];
        const query_params = {
            ...local_test_params,
            other_token_data: test_edge_params.other_token_data,
        };
        // TODO: make encoded query params less hard coded
        const request_string = `${usr_base_url}/token/set?client=${query_params._key}&access=${query_params.access}&refresh=${query_params.refresh}&expires_in=500000&access_len=${query_params.access_len}&access_iv=${query_params.access_iv}&refresh_len=${query_params.refresh_len}&refresh_iv=${query_params.refresh_iv}&other_token_data=${query_params.other_token_data}`;

        // act
        const response = request.get(request_string);

        // assert
        expect(response.status).to.equal(400);
        expect(response.body).to.include("the default action cannot process other_token_data");

        const user_token_data = db.u.document({ _key: query_params._key });
        const user_token_edge = db.globus_token.outEdges(user_token_data._id);
        expect(user_token_edge).to.be.empty;
    });

    it("should error when additionally provided the default type and other token data", () => {
        // arrange
        const local_test_params = test_params[2];
        const query_params = {
            ...local_test_params,
            type: g_lib.AccessTokenType.GLOBUS_DEFAULT,
            other_token_data: test_edge_params.other_token_data,
        };
        // TODO: make encoded query params less hard coded
        const request_string = `${usr_base_url}/token/set?client=${query_params._key}&access=${query_params.access}&refresh=${query_params.refresh}&expires_in=500000&access_len=${query_params.access_len}&access_iv=${query_params.access_iv}&refresh_len=${query_params.refresh_len}&refresh_iv=${query_params.refresh_iv}&type=${query_params.type}&other_token_data=${query_params.other_token_data}`;

        // act
        const response = request.get(request_string);

        // assert
        expect(response.status).to.equal(400);
        expect(response.body).to.include("the default action cannot process other_token_data");

        const user_token_data = db.u.document({ _key: query_params._key });
        const user_token_edge = db.globus_token.outEdges(user_token_data._id);
        expect(user_token_edge).to.be.empty;
    });

    it("should accept a valid user's token with additional type and globus collection data and add it to globus_token edge", () => {
        // arrange
        const local_test_params = test_params[3];
        const query_params = {
            user_key: local_test_params._key,
            access: local_test_params.access,
            refresh: local_test_params.refresh,
            access_len: local_test_params.access_len,
            access_iv: local_test_params.access_iv,
            refresh_len: local_test_params.refresh_len,
            refresh_iv: local_test_params.refresh_iv,
            ...test_edge_params,
        };

        const expected_doc_key = test_uuid + "_" + query_params.type + "_" + query_params.user_key;
        const expected = {
            ...query_params,
            _key: expected_doc_key,
            _from: "u/" + query_params.user_key,
            _to: "globus_coll/" + test_uuid,
        };
        delete expected.other_token_data; // unwanted data
        delete expected.user_key;

        // TODO: make encoded query params less hard coded
        const request_string = `${usr_base_url}/token/set?client=${query_params.user_key}&access=${query_params.access}&refresh=${query_params.refresh}&expires_in=500000&type=${query_params.type}&access_len=${query_params.access_len}&access_iv=${query_params.access_iv}&refresh_len=${query_params.refresh_len}&refresh_iv=${query_params.refresh_iv}&other_token_data=${query_params.other_token_data}`;

        // act
        const response = request.get(request_string);

        // assert
        expect(response.status).to.equal(204);

        // TODO: better data expectation when doc is defined
        const globus_collection_data = db.globus_coll.exists({ _key: test_uuid });
        expect(globus_collection_data).to.exist;

        const globus_token_data = db.globus_token.document({
            _key: expected_doc_key,
        });
        expect(globus_token_data).to.include(expected);

        const user_data = db.u.document({ _key: query_params.user_key });
        expect(user_data.access).to.not.equal(query_params.access); // should not update user doc
    });
});
describe("unit_user_router: the Foxx microservice user_router token/get endpoint", () => {
    const test_uuid = "b68ef5fb-f511-4e98-b8a3-dbc6acbcb6f2"; // fake UUID
    const test_scope = "urn:globus:auth:scope:transfer.api.globus.org:all";
    const get_token_test_user = "getTokenUser";
    const test_access_token = "test_access_token";
    const test_refresh_token = "test_refresh_token";
    const test_access_len = "96";
    const test_access_iv = "test_access_iv";
    const test_refresh_len = "96";
    const test_refresh_iv = "test_refresh_iv";
    const test_globus_access_token = "test_globus_access_token";
    const test_globus_refresh_token = "test_globus_refresh_token";
    const test_globus_token_type = g_lib.AccessTokenType.GLOBUS_TRANSFER;
    const test_other_token_data = test_uuid + "%7C" + test_scope;
    const test_expires_in = "12345689";
    before(() => {
        // One time set up of some test user data
        const default_token_query_string = `${usr_base_url}/token/set?client=${get_token_test_user}&access=${test_access_token}&refresh=${test_refresh_token}&expires_in=${test_expires_in}&access_len=${test_access_len}&access_iv=${test_access_iv}&refresh_len=${test_refresh_len}&refresh_iv=${test_refresh_iv}`;
        const default_token_response = request.get(default_token_query_string);
        expect(default_token_response.status).to.equal(204);

        const collection_token_query_string = `${usr_base_url}/token/set?client=${get_token_test_user}&access=${test_globus_access_token}&refresh=${test_globus_refresh_token}&expires_in=500000&access_len=${test_access_len}&access_iv=${test_access_iv}&refresh_len=${test_refresh_len}&refresh_iv=${test_refresh_iv}&type=${test_globus_token_type}&other_token_data=${test_other_token_data}`;
        const collection_token_response = request.get(collection_token_query_string);
        expect(collection_token_response.status).to.equal(204);
    });

    const token_get_test_user_base_url = `${usr_base_url}/token/get?client=${get_token_test_user}`;
    it("Should reject the optional collection_id param if it is not a valid GUID", () => {
        const invalid_guid = "invalid_guid";
        const invalid_guid_url = `${token_get_test_user_base_url}&collection_id=${invalid_guid}`;

        const response = request.get(invalid_guid_url);

        expect(response.status).to.equal(400);
        expect(response.body).to.include(
            'query parameter \\"collection_id\\" must be a valid GUID',
        );
    });

    it("Should reject optional collection_type param if it is not of value `mapped`", () => {
        const not_mapped = "not_mapped";
        const invalid_type_url = `${token_get_test_user_base_url}&collection_type=${not_mapped}`;

        const response = request.get(invalid_type_url);

        expect(response.status).to.equal(400);
        expect(response.body).to.include(
            'query parameter \\"collection_type\\" must be one of [mapped]',
        );
    });

    it("Should retrieve the default token when optional params are not provided", () => {
        const response = request.get(token_get_test_user_base_url);

        expect(response.status).to.equal(200);

        const json_body = JSON.parse(response.body);
        expect(json_body).to.include({ needs_consent: false });
        expect(json_body).to.include({ access: test_access_token, refresh: test_refresh_token });
        expect(response.body).to.include("expires_in");
        expect(json_body).to.include({ token_type: g_lib.AccessTokenType.GLOBUS_DEFAULT });
    });

    it("Should retrieve specified collection token when optional params are provided", () => {
        const collection_url = `${token_get_test_user_base_url}&collection_id=${test_uuid}&collection_type=mapped`;

        const response = request.get(collection_url);

        expect(response.status).to.equal(200);

        const json_body = JSON.parse(response.body);
        expect(json_body).to.include({ needs_consent: false });
        expect(json_body).to.include({
            access: test_globus_access_token,
            refresh: test_globus_refresh_token,
        });
        expect(response.body).to.include("expires_in");
        expect(json_body).to.include({ token_type: test_globus_token_type });
        expect(json_body).to.include({ scopes: test_scope });
    });

    it("Should indicate consent flow is needed when a token is not found for a specified collection", () => {
        const collection_not_related_uuid = "94445318-2097-4ed8-8550-f73cd292b11f"; // TODO: pull from globus_collection_fixture.js
        const collection_not_related_url = `${token_get_test_user_base_url}&collection_id=${collection_not_related_uuid}&collection_type=mapped`;

        const response = request.get(collection_not_related_url);

        expect(response.status).to.equal(200);
        expect(JSON.parse(response.body)).to.include({ needs_consent: true });
    });

    it("Should indicate consent flow is needed when a specified collection cannot be found", () => {
        const collection_not_exists_uuid = "d08c40c6-b778-427d-9963-255ce2bbbd2e"; // Fake UUID
        const collection_not_exists_url = `${token_get_test_user_base_url}&collection_id=${collection_not_exists_uuid}&collection_type=mapped`;

        const response = request.get(collection_not_exists_url);

        expect(response.status).to.equal(200);
        expect(JSON.parse(response.body)).to.include({ needs_consent: true });
    });
});
