"use strict";

// Integration test of API
const { expect } = require("chai");
const request = require("@arangodb/request");
const { baseUrl } = module.context;
const { db } = require("@arangodb");

const usr_base_url = `${baseUrl}/usr`;

// NOTE: describe block strings are compared against test specification during test call, not file name
describe("authz_router: the Foxx microservice authz_router /gridftp endpoint", () => {
    //    const test_param_indexes = [0, 1, 2, 3, 4];
    //    const test_params = test_param_indexes.map((param_index) => {
    //        return {
    //            _key: "testUser" + param_index,
    //            access: "access_token" + param_index,
    //            refresh: "refresh_token" + param_index,
    //        };
    //    });
    //    const test_uuid = "1cbaaee5-b938-4a4e-87a8-f1ec4d5d92f9"; // fake UUID
    //    const test_scope = "urn:globus:auth:scope:transfer.api.globus.org:all";
    //    const test_edge_params = {
    //        type: g_lib.AccessTokenType.GLOBUS_TRANSFER,
    //        other_token_data: test_uuid + "%7C" + test_scope, // URL encoded | character
    //    };
    beforeEach(() => {
        g_db.d.truncate();
        g_db.alloc.truncate();
        g_db.loc.truncate();
        g_db.repo.truncate();
        g_db.u.truncate();
        g_db.owner.truncate();
        g_db.p.truncate();
        g_db.admin.truncate();
    });

    it("should accept a valid user's token and execute an update", () => {
        g_db.d.save({
            _key: data_key,
            _id: data_id,
            creator: "u/george",
        });

        let owner_id = "u/not_bob";
        g_db.u.save({
            _key: "not_bob",
            _id: owner_id,
            is_admin: false,
        });

        let client = {
            _key: "bob",
            _id: "u/bob",
            is_admin: true,
        };

        g_db.u.save(client);

        g_db.owner.save({
            _from: data_id,
            _to: owner_id,
        });

        // arrange
        // NOTE: the get request has query params instead of a body
        const query_params = test_params[0];
        // TODO: make encoded query params less hard coded
        const request_string = `${usr_base_url}/token/set?client=${query_params._key}&access=${query_params.access}&refresh=${query_params.refresh}&expires_in=500000`;

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
        const request_string = `${usr_base_url}/token/set?client=${query_params._key}&access=${query_params.access}&refresh=${query_params.refresh}&expires_in=500000&type=${query_params.type}`;

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
        const request_string = `${usr_base_url}/token/set?client=${query_params._key}&access=${query_params.access}&refresh=${query_params.refresh}&expires_in=500000&other_token_data=${query_params.other_token_data}`;

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
        const request_string = `${usr_base_url}/token/set?client=${query_params._key}&access=${query_params.access}&refresh=${query_params.refresh}&expires_in=500000&type=${query_params.type}&other_token_data=${query_params.other_token_data}`;

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
        const request_string = `${usr_base_url}/token/set?client=${query_params.user_key}&access=${query_params.access}&refresh=${query_params.refresh}&expires_in=500000&type=${query_params.type}&other_token_data=${query_params.other_token_data}`;

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
