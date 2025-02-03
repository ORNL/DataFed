"use strict";

const g_lib = require("../api/support");
const { UserToken } = require("../api/lib/user_token");

const { expect } = require("chai");

describe("The user_token library module class UserToken evaluating static method validateRequestParams", () => {
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

describe("The user_token library module class UserToken evaluating static method formatUserToken", () => {
    const valid_token_doc = {
        access: "fake access token",
        refresh: "fake refresh token",
        expiration: 123456789,
    };
    const valid_collection_token_doc = {
        ...valid_token_doc,
        type: g_lib.AccessTokenType.GLOBUS_TRANSFER,
        scope: "fake token scope",
    };
    it("Should return an object with only needs_consent if needs_consent=true", () => {
        const is_collection_token = true;
        const needs_consent = true;

        const response_token = UserToken.formatUserToken(is_collection_token, valid_collection_token_doc, needs_consent);

        expect(Object.keys(response_token).length).to.equal(1);
        expect(response_token.needs_consent).to.be.true;
    });

    it("Should return relevant information from a token document when needs_consent=false and is_collection_token=false", () => {
        const is_collection_token = false;
        const needs_consent = false;

        const token_document = valid_token_doc;

        const response_token = UserToken.formatUserToken(is_collection_token, token_document, needs_consent);

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

        const response_token = UserToken.formatUserToken(is_collection_token, token_document, needs_consent);

        expect(response_token.needs_consent).to.be.false;
        expect(response_token.access).to.equal(token_document.access);
        expect(response_token.refresh).to.equal(token_document.refresh);
        expect(response_token.expires_in).to.exist;
        expect(response_token.token_type).to.equal(token_document.type);
        expect(response_token.scopes).to.equal(token_document.scope);
    });

    it("Should flag needs_consent=true if token_document does not hold scope information for a collection_token", () => {
        const is_collection_token = true;
        const needs_consent = false;

        const token_document = { ...valid_collection_token_doc, scope: undefined };

        const response_token = UserToken.formatUserToken(is_collection_token, token_document, needs_consent);

        expect(response_token.needs_consent).to.be.true;
        // These following values should not matter
        expect(response_token.access).to.equal(token_document.access);
        expect(response_token.refresh).to.equal(token_document.refresh);
        expect(response_token.expires_in).to.exist;
        expect(response_token.token_type).to.equal(token_document.type);
        expect(response_token.scopes).to.equal(token_document.scope);
    });

    it("Should flag needs_consent=true if token_document does not hold type information for a collection_token", () => {
        const is_collection_token = true;
        const needs_consent = false;

        const token_document = { ...valid_collection_token_doc, type: undefined };

        const response_token = UserToken.formatUserToken(is_collection_token, token_document, needs_consent);

        expect(response_token.needs_consent).to.be.true;
        // The following values should not matter
        expect(response_token.access).to.equal(token_document.access);
        expect(response_token.refresh).to.equal(token_document.refresh);
        expect(response_token.expires_in).to.exist;
        expect(response_token.token_type).to.equal(token_document.type);
        expect(response_token.scopes).to.equal(token_document.scope);
    });
});