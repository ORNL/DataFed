import { expect } from "chai";
import { generateConsentURL } from "../services/auth/ConsentHandler.js";
import { AUTH_URL } from "../services/auth/constants.js";

describe("generateConsentURL", () => {
    const client_id = "39c655a9-a428-46fa-94bb-078feab6acb1";
    const redirect_uri = "https://fake.website.datafed/ui/authn";
    const requested_scopes = [
        `urn:globus:auth:scope:transfer.api.globus.org:all[*${AUTH_URL}/scopes/e8b9afc1-dabf-45e9-9743-d5eda7c914c9/data_access]`,
        `urn:globus:auth:scope:transfer.api.globus.org:all[*${AUTH_URL}/scopes/5066556a-bcd6-4e00-8e3f-b45e0ec88b1a/data_access]`,
    ];
    const state = "none";
    const refresh_tokens = true;
    const query_params = {};
    it("should return a valid URL", () => {
        expect(
            Boolean(
                new URL(
                    generateConsentURL(
                        client_id,
                        redirect_uri,
                        refresh_tokens,
                        requested_scopes,
                        query_params,
                        state,
                    ),
                ),
            ),
        ).to.be.true;
    });

    it("should contain requested information", () => {
        const auth_url = generateConsentURL(
            client_id,
            redirect_uri,
            refresh_tokens,
            requested_scopes,
            query_params,
            state,
        );
        expect(auth_url).to.have.string(client_id);
        expect(auth_url).to.have.string(encodeURIComponent(redirect_uri));
        requested_scopes.forEach((scope_str) => {
            expect(auth_url).to.have.string(encodeURIComponent(scope_str));
        });
        expect(auth_url).to.have.string(state);
        expect(auth_url).to.have.string(refresh_tokens ? "offline" : "online");
        expect(auth_url).to.have.string(refresh_tokens ? "offline_access" : "");
    });

    it("should contain additional specified query parameters", () => {
        const clean_param = { other: "params" };
        const unsafe_value_param = { that: "we/" };
        const unsafe_key_param = { "may || not": "see" };
        const no_value_param = { empty: "" };
        const specified_params = {
            ...clean_param,
            ...unsafe_value_param,
            ...unsafe_key_param,
            ...no_value_param,
        };
        const auth_url = generateConsentURL(
            client_id,
            redirect_uri,
            refresh_tokens,
            requested_scopes,
            specified_params,
            state,
        );

        // clean params
        const clean_key = Object.keys(clean_param)[0];
        const clean_value = Object.values(clean_param)[0];
        expect(auth_url).to.have.string(clean_key + "=" + clean_value);

        // unsafe values
        const unsafe_value_key = Object.keys(unsafe_value_param)[0];
        const unsafe_value_value = Object.values(unsafe_value_param)[0];
        expect(auth_url).to.have.string(unsafe_value_key + "=");
        expect(auth_url).to.not.have.string(unsafe_value_value);

        //unsafe keys
        const unsafe_key_key = Object.keys(unsafe_key_param)[0];
        const unsafe_key_value = Object.values(unsafe_key_param)[0];
        expect(auth_url).to.not.have.string(unsafe_key_key);
        expect(auth_url).to.have.string(unsafe_key_value);

        //no values
        const no_value_key = Object.keys(no_value_param)[0];
        expect(auth_url).to.not.have.string(no_value_key);
    });

    it("should have encoded url params", () => {
        const auth_url_string = generateConsentURL(
            client_id,
            redirect_uri,
            refresh_tokens,
            requested_scopes,
            query_params,
            state,
        );
        const decoded_url = decodeURIComponent(auth_url_string);

        // NOTE: encoding changed during URLSearchParams.toString from " " to "+"
        expect(decoded_url).to.have.string("scope=" + requested_scopes.join("+"));
    });
});
