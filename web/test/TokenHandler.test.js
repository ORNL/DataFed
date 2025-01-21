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
