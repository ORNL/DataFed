"use strict";

const { GlobusTokenModel, GlobusToken } = require("../api/models/globus_token");

const { expect } = require("chai");
const { db } = require("@arangodb");
const { DataFedOAuthToken } = require("../api/models/DataFedOAuthToken");

// from fixture
const get_globus_token_model_user = "getGlobusTokenModelUser";
const get_globus_token_model_user_id = "u/" + get_globus_token_model_user;
const get_globus_token_model_collection = "a1067823-2598-4481-be95-712794ddd9e8";
const get_globus_token_model_collection_id = "globus_coll/" + get_globus_token_model_collection;

describe("unit_globus_token_model: Calling constructor", () => {
    it("should succeed when provided a user ID and Globus collection ID", () => {
        const globus_token_model = new GlobusTokenModel(
            get_globus_token_model_user_id,
            get_globus_token_model_collection_id,
        );
        expect(globus_token_model).to.be.instanceOf(GlobusTokenModel);
    });
    it("should throw an error when a user ID is not provided", () => {
        expect(() => new GlobusTokenModel(null, get_globus_token_model_collection_id)).to.throw(
            "User ID and Collection ID are required for Globus Tokens",
        );
    });
    it("should throw an error when a collection ID is not provided", () => {
        expect(() => new GlobusTokenModel(get_globus_token_model_user_id, null)).to.throw(
            "User ID and Collection ID are required for Globus Tokens",
        );
    });
    it("should throw an error when neither a user ID nor a collection ID are provided", () => {
        expect(() => new GlobusTokenModel(null, null)).to.throw(
            "User ID and Collection ID are required for Globus Tokens",
        );
    });
});

describe("unit_globus_token_model: Calling get", () => {
    it("should return a read only globus token object when the globus token exists", () => {
        const globus_token = new GlobusTokenModel(
            get_globus_token_model_user_id,
            get_globus_token_model_collection_id,
        ).get();

        // TODO: abstract DB layer
        const globus_token_db = db.globus_token.document({ _key: globus_token.key });

        expect(globus_token).to.be.instanceOf(GlobusToken);
        expect(globus_token).to.be.frozen;
        expect(globus_token).to.include({
            id: globus_token_db._id,
            key: globus_token_db._key,
            user_id: globus_token_db._from,
            globus_collection_id: globus_token_db._to,
            type: globus_token_db.type,
            dependent_scopes: globus_token_db.dependent_scopes,
            request_time: globus_token_db.request_time,
            last_used_time: globus_token_db.last_used,
            status: globus_token_db.status,
            access: globus_token_db.access,
            refresh: globus_token_db.refresh,
            expiration: globus_token_db.expiration,
        });
    });
    it("should return a read only empty globus token object with all fields undefined when the globus token does not exist", () => {
        const globus_token = new GlobusTokenModel("u/user_dne", "globus_coll/coll_dne").get();

        expect(globus_token).to.be.instanceOf(GlobusToken);
        expect(globus_token).to.be.frozen;
        Object.keys(GlobusToken).map((key) => {
            expect(globus_token).to.have.property(key, undefined);
        });
    });
});

describe("unit_globus_token_model: Calling get_oauth_token", () => {
    it("should return a read only DataFed OAuth token object when the globus token exists", () => {
        const globus_oauth_token = new GlobusTokenModel(
            get_globus_token_model_user_id,
            get_globus_token_model_collection_id,
        ).get_oauth_token();

        const globus_token = new GlobusTokenModel(
            get_globus_token_model_user_id,
            get_globus_token_model_collection_id,
        ).get();
        // TODO: abstract DB layer
        const globus_token_db = db.globus_token.document({ _key: globus_token.key });

        expect(globus_oauth_token).to.be.instanceOf(DataFedOAuthToken);
        expect(globus_oauth_token).to.be.frozen;
        Object.keys(DataFedOAuthToken).map((key) => {
            expect(globus_oauth_token).to.have.property(key, globus_token_db[key]);
        });
    });
    it("should return an empty read only DataFed OAuth token with all fields undefined object when the globus token does not exist", () => {
        const globus_oauth_token = new GlobusTokenModel(
            "u/user_dne",
            "globus_coll/coll_dne",
        ).get_oauth_token();

        expect(globus_oauth_token).to.be.instanceOf(DataFedOAuthToken);
        expect(globus_oauth_token).to.be.frozen;
        Object.keys(DataFedOAuthToken).map((key) => {
            expect(globus_oauth_token).to.have.property(key, undefined);
        });
    });
});
