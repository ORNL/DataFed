"use strict";

// Integration test of API
const chai = require("chai");
const should = chai.should();
const expect = chai.expect;
const assert = chai.assert;
const g_lib = require("../api/support");

describe("the Foxx microservice support module evaluating isUUID.", () => {
    it("unit_support: should return true if string is a UUID.", () => {
        var uuid = "XXXXYYYY-XXXX-YYYY-XXXX-YYYYXXXXYYYY";
        expect(g_lib.isUUID(uuid)).to.be.true;
    });
});

describe("the Foxx microservice support module evaluating isUUIDList.", () => {
    it("unit_support: should return true if string is a UUID List.", () => {
        var uuids = "XXXXYYYY-XXXX-YYYY-XXXX-YYYYXXXXYYYY,XXXXYYYY-XXXX-YYYY-XXXX-YYYYXXXXYYYY";
        expect(g_lib.isUUIDList(uuids)).to.be.true;
    });
    it("unit_support: should return false because one of the provided items is not a uuid", () => {
        var uuids = "XXXXYYYY-XXXX-YYYY-XXXX-YYYYXXXXYYYY,132";
        expect(g_lib.isUUIDList(uuids)).to.be.false;
    });
});

describe("unit_support: the Foxx microservice support module evaluating parseOtherTokenData.", () => {
    const test_uuid = "1cbaaee5-b938-4a4e-87a8-f1ec4d5d92f9"; // fake UUID
    const test_scopes = "urn:globus:auth:scope:transfer.api.globus.org:all+email";
    it("should yield parsed data for a GLOBUS_TRANSFER token when provided a UUID and scopes in order", () => {
        // arrange
        const test_str = test_uuid + "|" + test_scopes;

        // act
        const result_object = g_lib.parseOtherTokenData(
            g_lib.AccessTokenType.GLOBUS_TRANSFER,
            test_str,
        );

        // assert
        expect(result_object.uuid).to.equal(test_uuid);
        expect(result_object.scopes).to.equal(test_scopes);
    });

    it("should error for GLOBUS_TRANSFER token if given UUID and scopes with incorrect separator.", () => {
        const test_str = test_uuid + "!" + test_scopes;
        const err_fn = () =>
            g_lib.parseOtherTokenData(g_lib.AccessTokenType.GLOBUS_TRANSFER, test_str);

        expect(err_fn).to.throw("Unexpected count of additional token data provided");
    });

    it("should error for GLOBUS_TRANSFER token if given UUID but no scopes.", () => {
        const err_fn = () =>
            g_lib.parseOtherTokenData(g_lib.AccessTokenType.GLOBUS_TRANSFER, test_uuid);

        expect(err_fn).to.throw("Unexpected count of additional token data provided");
    });

    it("should error for GLOBUS_TRANSFER token if given scopes but no UUID.", () => {
        const err_fn = () =>
            g_lib.parseOtherTokenData(g_lib.AccessTokenType.GLOBUS_TRANSFER, test_scopes);

        expect(err_fn).to.throw("Unexpected count of additional token data provided");
    });

    it("should error for GLOBUS_TRANSFER token if given UUID and scopes in incorrect order.", () => {
        // arrange
        const test_str = test_scopes + "|" + test_uuid;
        const err_fn = () =>
            g_lib.parseOtherTokenData(g_lib.AccessTokenType.GLOBUS_TRANSFER, test_str);

        expect(err_fn).to.throw("Provided other_token_data does not follow format");
    });

    it("should do nothing and return an empty object for unspecified token_type values", () => {
        // arrange
        const test_str = test_uuid + "|" + test_scopes;
        const sentinel_token_type = -1; // TODO: provide for better sentinel values

        // act
        const result_object = g_lib.parseOtherTokenData(sentinel_token_type, test_str);

        // assert
        expect(result_object).to.be.empty;
    });
});
