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
            data: {
                resource_server: "transfer.api.globus.org",
                other_tokens: [],
                access_token: "first_other.access_token",
                refresh_token: "first_other.refresh_token",
                expires_in: 123456789,
                scope: "test::urn::transfer.globus.org::all",
            },
        };
        second_other_token = {
            data: {
                access_token: "second_other.access_token",
                refresh_token: "second_other.access_token",
            },
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
        const token_context = { scope: first_other_token.data.scope };
        expect(token_handler.constructOptionalData(token_context)).to.deep.equal({
            type: AccessTokenType.GLOBUS_DEFAULT,
        });
    });
});
