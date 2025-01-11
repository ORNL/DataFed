import { expect } from "chai";
import { isObjEmpty, globusGetAuthorizeURL } from "../static/util.js";

describe("isObjEmpty", function () {
    it("should return true for an empty object", function () {
        const emptyObj = {};
        expect(isObjEmpty(emptyObj)).to.be.true;
    });

    it("should return false for an object with properties", function () {
        const objWithProps = { key: "value" };
        expect(isObjEmpty(objWithProps)).to.be.false;
    });

    it("should return true if a non-object is passed (like null)", function () {
        expect(isObjEmpty(null)).to.be.true;
    });

    it("should return true if a non-object is passed (like undefined)", function () {
        expect(isObjEmpty(undefined)).to.be.true;
    });
});

describe("globusGetAuthorizeURL", () => {
    const client_id = "39c655a9-a428-46fa-94bb-078feab6acb1";
    const redirect_uri = "https://fake.website.datafed/ui/authn";
    const requested_scopes = [
        "urn:globus:auth:scope:transfer.api.globus.org:all[*https://auth.globus.org/scopes/e8b9afc1-dabf-45e9-9743-d5eda7c914c9/data_access]",
        "urn:globus:auth:scope:transfer.api.globus.org:all[*https://auth.globus.org/scopes/5066556a-bcd6-4e00-8e3f-b45e0ec88b1a/data_access]",
    ];
    const state = "none";
    const refresh_tokens = true;
    const query_params = {};
    it("should return a valid URL", () => {
        expect(
            Boolean(
                new URL(
                    globusGetAuthorizeURL(
                        client_id,
                        redirect_uri,
                        requested_scopes,
                        state,
                        refresh_tokens,
                        query_params,
                    ),
                ),
            ),
        ).to.be.true;
    });

    it("should contain requested information", () => {
        const auth_url = globusGetAuthorizeURL(
            client_id,
            redirect_uri,
            requested_scopes,
            state,
            refresh_tokens,
            query_params,
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
        const auth_url = globusGetAuthorizeURL(
            client_id,
            redirect_uri,
            requested_scopes,
            state,
            refresh_tokens,
            specified_params,
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

    it("should create a valid URL when given minimal parameters", () => {
        const auth_url = globusGetAuthorizeURL(client_id, redirect_uri);
        expect(Boolean(new URL(auth_url))).to.be.true;
    });

    it("should throw an error when client_id is not provided", () => {
        expect(() => globusGetAuthorizeURL(null, redirect_uri)).to.throw(
            Error,
            "Missing required parameters, please provide client_id and redirect_uri",
        );
    });
    it("should throw an error when redirect_uri is not provided", () => {
        expect(() => globusGetAuthorizeURL(client_id, null)).to.throw(
            Error,
            "Missing required parameters, please provide client_id and redirect_uri",
        );
    });

    it("should provide default scopes when no scopes are provided", () => {
        const auth_url = globusGetAuthorizeURL(client_id, redirect_uri);
        const default_scopes = [
            "openid",
            "profile",
            "email",
            "urn:globus:auth:scope:transfer.api.globus.org:all",
        ];
        default_scopes.forEach((default_scope) => {
            expect(auth_url).to.have.string(encodeURIComponent(default_scope));
        });
    });

    it("should have encoded url params", () => {
        const auth_url_string = globusGetAuthorizeURL(
            client_id,
            redirect_uri,
            requested_scopes,
            state,
            refresh_tokens,
            query_params,
        );
        const decoded_url = decodeURIComponent(auth_url_string);

        // NOTE: encoding changed during URLSearchParams.toString from " " to "+"
        expect(decoded_url).to.have.string("scope=" + requested_scopes.join("+"));
    });
});
