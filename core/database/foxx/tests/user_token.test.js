"use strict";

const g_lib = require("../api/support");
const { UserToken } = require("../api/lib/user_token");
const { DataFedOAuthToken } = require("../api/models/DataFedOAuthToken");

const { expect } = require("chai");

describe("unit_user_token: The user_token library module class UserToken evaluating static method validateRequestParams", () => {
    const valid_params = {
        // random ID
        collection_id: "ba873943-199d-4c9c-a998-10383329e5df",
        collection_type: "mapped",
    };
    it("Should throw an error when query_params collection_id is defined and collection_type is not", () => {
        const collection_id_params = {
            collection_id: valid_params.collection_id,
        };
        expect(() => UserToken.validateRequestParams(collection_id_params)).to.throw(
            "Requires 'collection_id' and 'collection_type' both if one is present",
        );
    });
    it("Should throw an error when query_params collection_type is defined and collection_id is not", () => {
        const collection_type_params = {
            collection_type: valid_params.collection_type,
        };
        expect(() => UserToken.validateRequestParams(collection_type_params)).to.throw(
            "Requires 'collection_id' and 'collection_type' both if one is present",
        );
    });
    it("Should return true when both expected query_params are present", () => {
        const is_collection_token = UserToken.validateRequestParams(valid_params);

        expect(is_collection_token).to.be.true;
    });
    it("Should return false when neither expected query_params is present", () => {
        const is_collection_token = UserToken.validateRequestParams({});

        expect(is_collection_token).to.be.false;
    });
});

describe("unit_user_token: The user_token library module class UserToken evaluating static method formatUserToken", () => {
    const valid_token_doc = {
        access: "fake access token",
        refresh: "fake refresh token",
        expiration: 123456789,
    };
    const valid_collection_token_doc = {
        ...valid_token_doc,
        type: g_lib.AccessTokenType.GLOBUS_TRANSFER,
        dependent_scopes: "fake token scope",
    };
    it("Should return an object with default values if needs_consent=true", () => {
        const default_values = {
            access: "",
            refresh: "",
            expires_in: 0,
            token_type: g_lib.AccessTokenType.ACCESS_SENTINEL,
            scopes: "",
        };
        const is_collection_token = true;
        const needs_consent = true;

        const response_token = UserToken.formatUserToken(
            is_collection_token,
            valid_collection_token_doc,
            needs_consent,
        );

        expect(response_token.needs_consent).to.be.true;
        expect(response_token).to.include(default_values);
    });

    it("Should return relevant information from a token document when needs_consent=false and is_collection_token=false", () => {
        const is_collection_token = false;
        const needs_consent = false;

        const token_document = valid_token_doc;

        const response_token = UserToken.formatUserToken(
            is_collection_token,
            token_document,
            needs_consent,
        );

        expect(response_token.needs_consent).to.be.false;
        expect(response_token.access).to.equal(token_document.access);
        expect(response_token.refresh).to.equal(token_document.refresh);
        expect(response_token.expires_in).to.exist;
        expect(response_token.token_type).to.equal(g_lib.AccessTokenType.GLOBUS_DEFAULT);
    });

    it("Should return relevant information from a token document when needs_consent=false and is_collection_token=true", () => {
        const is_collection_token = true;
        const needs_consent = false;

        const token_document = valid_collection_token_doc;

        const response_token = UserToken.formatUserToken(
            is_collection_token,
            token_document,
            needs_consent,
        );

        expect(response_token.needs_consent).to.be.false;
        expect(response_token.access).to.equal(token_document.access);
        expect(response_token.refresh).to.equal(token_document.refresh);
        expect(response_token.expires_in).to.exist;
        expect(response_token.token_type).to.equal(token_document.type);
        expect(response_token.scopes).to.equal(token_document.dependent_scopes);
    });

    it("Should flag needs_consent=true if token_document does not hold scope information for a collection_token", () => {
        const is_collection_token = true;
        const needs_consent = false;

        const token_document = { ...valid_collection_token_doc, dependent_scopes: undefined };

        const response_token = UserToken.formatUserToken(
            is_collection_token,
            token_document,
            needs_consent,
        );

        expect(response_token.needs_consent).to.be.true;
        // These following values should not matter
        expect(response_token.access).to.equal(token_document.access);
        expect(response_token.refresh).to.equal(token_document.refresh);
        expect(response_token.expires_in).to.exist;
        expect(response_token.token_type).to.equal(token_document.type);
        expect(response_token.scopes).to.equal(token_document.dependent_scopes);
    });

    it("Should flag needs_consent=true if token_document does not hold type information for a collection_token", () => {
        const is_collection_token = true;
        const needs_consent = false;

        const token_document = { ...valid_collection_token_doc, type: undefined };

        const response_token = UserToken.formatUserToken(
            is_collection_token,
            token_document,
            needs_consent,
        );

        expect(response_token.needs_consent).to.be.true;
        // The following values should not matter
        expect(response_token.access).to.equal(token_document.access);
        expect(response_token.refresh).to.equal(token_document.refresh);
        expect(response_token.expires_in).to.exist;
        expect(response_token.token_type).to.equal(token_document.type);
        expect(response_token.scopes).to.equal(token_document.dependent_scopes);
    });
});

// "magic" values from fixture files
const user_token_user = "userTokenUser";
const user_collection_token_user = "userCollectionTokenUser";
const globus_collection_token_collection = "126a23d4-45ed-49fb-bde2-76b5f44d20d1";
const globus_collection_does_not_exist = "c8f55b3b-48ef-4075-b3ea-1b16ff5f956e"; // random fake UUID
describe("unit_user_token: calling constructor", () => {
    it("should create a user token object when provided a user_id", () => {
        const kwargs = { user_id: "u/" + user_token_user };
        const user_token = new UserToken(kwargs);

        expect(user_token).to.be.instanceOf(UserToken);
    });
    it("should create a user token object when provided a user_key", () => {
        const kwargs = { user_key: user_token_user };
        const user_token = new UserToken(kwargs);

        expect(user_token).to.be.instanceOf(UserToken);
    });
    it("should create a user token object when provided a user_id and globus_collection_id", () => {
        const kwargs = {
            user_id: "u/" + user_token_user,
            globus_collection_id: "9deac418-f96b-414e-a2c4-7278408c0766", // some fake UUID
        };
        const user_token = new UserToken(kwargs);

        expect(user_token).to.be.instanceOf(UserToken);
    });
    it("should create a user token object when provided a user_key and globus_collection_id", () => {
        const kwargs = {
            user_key: user_token_user,
            globus_collection_id: "9deac418-f96b-414e-a2c4-7278408c0766", // some fake UUID
        };
        const user_token = new UserToken(kwargs);

        expect(user_token).to.be.instanceOf(UserToken);
    });
    it("should throw an error when provided a user_id for a user that does not exist", () => {
        const kwargs = { user_id: "u/fake_user" };
        expect(() => new UserToken(kwargs)).to.throw("Specified user does not exist: ");
    });
    it("should throw an error when provided a user_key for a user that does not exist", () => {
        const kwargs = { user_key: "fake_user" };
        expect(() => new UserToken(kwargs)).to.throw("Specified user does not exist: ");
    });
    it("should throw an error when provided a user and globus_collection_id, and user does not exist", () => {
        const kwargs = {
            user_id: "u/fake_user",
            globus_collection_id: "9deac418-f96b-414e-a2c4-7278408c0766", // some fake UUID
        };
        expect(() => new UserToken(kwargs)).to.throw("Specified user does not exist: ");
    });
});

describe("unit_user_token: calling exists", () => {
    it("should return true when provided only user_id and user DB object has a token", () => {
        const user_token = new UserToken({ user_id: "u/" + user_token_user });
        const user_token_exists = user_token.exists();
        expect(user_token_exists).to.be.true;
    });
    it("should return true when provided only user_key and user DB object has a token", () => {
        const user_token = new UserToken({ user_key: user_token_user });
        const user_token_exists = user_token.exists();
        expect(user_token_exists).to.be.true;
    });
    // assuming no cases where user does not have a token, sign-up process should cover that
    it("should return true when user and collection are provided and DB object exists for token", () => {
        const user_token = new UserToken({
            user_id: "u/" + user_collection_token_user,
            globus_collection_id: globus_collection_token_collection,
        });
        const user_token_exists = user_token.exists();
        expect(user_token_exists).to.be.true;
    });
    it("should return false when user and collection are provided and DB object does not exist for token", () => {
        const user_token = new UserToken({
            user_id: "u/" + user_token_user,
            globus_collection_id: globus_collection_token_collection,
        });
        const user_token_exists = user_token.exists();
        expect(user_token_exists).to.be.false;
    });
    it("should return false when user and collection are provided and collection does not exist", () => {
        const user_token = new UserToken({
            user_id: "u/" + user_token_user,
            globus_collection_id: globus_collection_does_not_exist,
        });
        const user_token_exists = user_token.exists();
        expect(user_token_exists).to.be.false;
    });
});

describe("unit_user_token: calling get_token", () => {
    it("should return readonly DataFedOAuthToken object when provided only user_id and user DB object has a token", () => {
        const user_token = new UserToken({ user_id: "u/" + user_token_user });
        const user_token_oauth_token = user_token.get_token();

        expect(user_token_oauth_token).to.be.instanceOf(DataFedOAuthToken);
        expect(user_token_oauth_token).to.be.frozen;
        expect(user_token_oauth_token)
            .to.have.property("access")
            .that.includes("access for " + user_token_user);
        expect(user_token_oauth_token)
            .to.have.property("refresh")
            .that.includes("refresh for " + user_token_user);
        expect(user_token_oauth_token).to.have.property("expiration").that.is.a("number");
        expect(user_token_oauth_token).to.include({
            type: g_lib.AccessTokenType.GLOBUS_DEFAULT,
            dependent_scopes: "",
        });
    });
    it("should return readonly DataFedOAuthToken object when provided only user_key and user DB object has a token", () => {
        const user_token = new UserToken({ user_key: user_token_user });
        const user_token_oauth_token = user_token.get_token();

        expect(user_token_oauth_token).to.be.instanceOf(DataFedOAuthToken);
        expect(user_token_oauth_token).to.be.frozen;
        expect(user_token_oauth_token)
            .to.have.property("access")
            .that.includes("access for " + user_token_user);
        expect(user_token_oauth_token)
            .to.have.property("refresh")
            .that.includes("refresh for " + user_token_user);
        expect(user_token_oauth_token).to.have.property("expiration").that.is.a("number");
        expect(user_token_oauth_token).to.include({
            type: g_lib.AccessTokenType.GLOBUS_DEFAULT,
            dependent_scopes: "",
        });
    });
    // assuming no cases where user does not have a token, sign-up process should cover that
    it("should return readonly DataFedOAuthToken object when user and collection are provided and DB object exists for token", () => {
        const user_token = new UserToken({
            user_id: "u/" + user_collection_token_user,
            globus_collection_id: globus_collection_token_collection,
        });
        const user_token_oauth_token = user_token.get_token();

        expect(user_token_oauth_token).to.be.instanceOf(DataFedOAuthToken);
        expect(user_token_oauth_token).to.be.frozen;
        expect(user_token_oauth_token)
        .to.have.property("access")
        .that.includes("globus token access for ");
        expect(user_token_oauth_token)
        .to.have.property("refresh")
        .that.includes("globus token refresh for ");
        expect(user_token_oauth_token).to.have.property("expiration").that.is.a("number");
        expect(user_token_oauth_token).to.include({
            type: g_lib.AccessTokenType.GLOBUS_TRANSFER,
            dependent_scopes: "some fake scopes",   // from fixture
        });
    });
    it("should return empty readonly DataFedOAuthToken object when user and collection are provided and DB object does not exist for token", () => {
        const user_token = new UserToken({
            user_id: "u/" + user_token_user,
            globus_collection_id: globus_collection_token_collection,
        });
        const user_token_oauth_token = user_token.get_token();

        expect(user_token_oauth_token).to.be.instanceOf(DataFedOAuthToken);
        expect(user_token_oauth_token).to.be.frozen;
        expect(user_token_oauth_token).to.include({
            access: undefined,
            refresh: undefined,
            expiration: undefined,
            type: undefined,
            dependent_scopes: undefined,
        });
    });
    it("should return empty readonly DataFedOAuthToken object when user and collection are provided and collection does not exist", () => {
        const user_token = new UserToken({
            user_id: "u/" + user_token_user,
            globus_collection_id: globus_collection_does_not_exist,
        });
        const user_token_oauth_token = user_token.get_token();

        expect(user_token_oauth_token).to.be.instanceOf(DataFedOAuthToken);
        expect(user_token_oauth_token).to.be.frozen;
        expect(user_token_oauth_token).to.be.empty;
    });
});
