import { expect } from "chai";
import OAuthTokenHandler, { AccessTokenType } from "../services/auth/TokenHandler.js";

describe("OAuthTokenHandler provided unsupported resource server", () => {
    let test_token;
    beforeEach(() => {
        test_token = {
            data: {
                resource_server: "test.resource.server",
                other_tokens: [],
                access_token: "test.access_token",
                refresh_token: "test.refresh_token",
                expires_in: 123456789,
                scope: "test email",
            },
        };
    });
    it("should throw an error during construction", () => {
        expect(() => {
            const token_handler = new OAuthTokenHandler(test_token);
        }).to.throw("Unsupported token");
    });
});

describe("OAuthTokenHandler provided with Globus auth resource server", () => {
    let test_token;
    let first_other_token;
    let second_other_token;
    beforeEach(() => {
        first_other_token = {
            resource_server: "transfer.api.globus.org",
            other_tokens: [],
            access_token: "first_other.access_token",
            refresh_token: "first_other.refresh_token",
            expires_in: 123456789,
            scope: "test::urn::transfer.globus.org::all",
        };
        second_other_token = {
            access_token: "second_other.access_token",
            refresh_token: "second_other.access_token",
        };
        test_token = {
            data: {
                resource_server: "auth.globus.org",
                other_tokens: [first_other_token, second_other_token],
                access_token: "test.access_token",
                refresh_token: "test.refresh_token",
                expires_in: 123456789,
                scope: "test email",
            },
        };
    });
    it("should throw an error during construction when other_tokens is empty", () => {
        test_token.data.other_tokens = [];
        expect(() => {
            const token_handler = new OAuthTokenHandler(test_token);
        }).to.throw("Unsupported token");
    });
    it("should return GLOBUS_DEFAULT token type from getTokenType when other_tokens field has valid contents", () => {
        const token_handler = new OAuthTokenHandler(test_token);
        expect(token_handler.getTokenType()).to.equal(AccessTokenType.GLOBUS_DEFAULT);
    });
    it("should return first token in other_tokens from extractTransferToken when other_tokens field has valid contents", () => {
        const token_handler = new OAuthTokenHandler(test_token);
        expect(token_handler.extractTransferToken()).to.deep.equal(first_other_token);
    });
    it("should return an object with only the token type from constructOptionalData when other_tokens field has valid contents", () => {
        const token_handler = new OAuthTokenHandler(test_token);
        const token_context = { scope: first_other_token.scope };
        expect(token_handler.constructOptionalData(token_context)).to.deep.equal({
            type: AccessTokenType.GLOBUS_DEFAULT,
        });
    });
});

describe("OAuthTokenHandler provided with Globus transfer resource server", () => {
    let test_token;
    let first_other_token;
    beforeEach(() => {
        first_other_token = {
            // This token should be ignored
            resource_server: "transfer.api.globus.org",
            other_tokens: [],
            access_token: "first_other.access_token",
            refresh_token: "first_other.refresh_token",
            expires_in: 123456789,
            scope: "test::urn::transfer.globus.org::all",
        };
        test_token = {
            data: {
                resource_server: "transfer.api.globus.org",
                other_tokens: [first_other_token],
                access_token: "test.access_token",
                refresh_token: "test.refresh_token",
                expires_in: 123456789,
                scope: "test::urn::transfer.globus.org::all",
            },
        };
    });
    it("should return GLOBUS_TRANSFER token type from getTokenType", () => {
        const token_handler = new OAuthTokenHandler(test_token);
        expect(token_handler.getTokenType()).to.equal(AccessTokenType.GLOBUS_TRANSFER);
    });
    it("should return the data property of the passed token from extractTransferToken", () => {
        const token_handler = new OAuthTokenHandler(test_token);
        expect(token_handler.extractTransferToken()).to.deep.equal(test_token.data);
    });
    it("should throw an error during constructOptionalData when a collection_id is not provided in context", () => {
        const token_handler = new OAuthTokenHandler(test_token);
        const token_context = { scope: test_token.data.scope };
        expect(() => {
            const optional_data = token_handler.constructOptionalData(token_context);
        }).to.throw("Transfer token received without collection context");
    });
    it("should throw an error during constructOptionalData when a scope is not provided in context", () => {
        const token_handler = new OAuthTokenHandler(test_token);
        const token_context = { collection_id: "mock id" };
        expect(() => {
            const optional_data = token_handler.constructOptionalData(token_context);
        }).to.throw("Transfer token received without scope context");
    });
    it("should return appropriate optional data from constructOptionalData when necessary context is provided", () => {
        const test_collection_id = "test_collection_id";
        const expected_other_field = test_collection_id + "|" + test_token.data.scope;

        const token_handler = new OAuthTokenHandler(test_token);
        const token_context = { scope: test_token.data.scope, collection_id: test_collection_id };
        const optional_data = token_handler.constructOptionalData(token_context);

        expect(optional_data.other).to.equal(expected_other_field);
        expect(optional_data.type).to.equal(AccessTokenType.GLOBUS_TRANSFER);
    });
});
