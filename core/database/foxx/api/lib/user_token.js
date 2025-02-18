"use strict";

const g_lib = require("../support.js");

class UserToken {
    constructor() {}

    /**
     * Validates request parameter object has all necessary pieces and determines whether the requested token is a collection token
     * @param {object} query_params - Raw query parameters passed to endpoint logic after JOI parse.
     * @param {string} [query_params.collection_id] - Globus collection ID associated with token.
     * @param {string} [query_params.collection_type] - Type of Globus collection from ["mapped", "ha"].
     * @returns {boolean} - True if the token should be related to a specific Globus collection.
     * @throws {Array} - When an invalid combination of `collection_id` and `collection_type` are provided.
     */
    static validateRequestParams(query_params) {
        const { collection_id, collection_type } = query_params;
        let collection_token = false;
        if (collection_id || collection_type) {
            if (collection_id && collection_type) {
                collection_token = true;
            } else {
                throw [
                    g_lib.ERR_INVALID_PARAM,
                    "/token/get Requires 'collection_id' and 'collection_type' both if one is present, received " +
                        "collection_id: " +
                        collection_id +
                        " collection_type: " +
                        collection_type,
                ];
            }
        }
        return collection_token;
    }

    /**
     * @typedef userTokenResponse
     * @property {boolean} needs_consent - True if consent flow needs to be triggered, in which case other fields will be undefined
     * @property {string} access - Access token
     * @property {string} refresh - Refresh token
     * @property {number} expires_in - Time until token expiry
     * @property {g_lib.AccessTokenType | number} token_type - Type of token retrieved, useful when refreshing tokens
     * @property {string} scopes - Scope associated with token, useful when refreshing tokens
     */
    /**
     * Build response object
     * @param {boolean} is_collection_token - Whether the token relates to a collection
     * @param {object} token_document - Database document holding relevant token info
     * @param {string} [token_document.access] - Access token
     * @param {string} [token_document.refresh] - Refresh token
     * @param {number} [token_document.expiration] - Expiration time of access token
     * @param {g_lib.AccessTokenType | number} [token_document.type] - Access token type, present when retrieving a collection token
     * @param {string} [token_document.dependent_scopes] - Access token scopes, present when retrieving a collection token
     * @param {boolean} needs_consent - Whether consent is required
     * @returns {userTokenResponse} - Object containing token information, or whether consent flow should start
     */
    static formatUserToken(is_collection_token, token_document, needs_consent) {
        let result_token = {
            needs_consent: needs_consent,
            access: "",
            refresh: "",
            expires_in: 0,
            token_type: g_lib.AccessTokenType.ACCESS_SENTINEL,
            scopes: "",
        };
        if (needs_consent) {
            // short circuit when consent flow is required
            return result_token;
        }
        result_token.access = token_document.access;
        result_token.refresh = token_document.refresh;
        if (token_document.expiration) {
            const expires_in = token_document.expiration - Math.floor(Date.now() / 1000);
            result_token.expires_in = expires_in > 0 ? expires_in : 0;
        }
        if (is_collection_token) {
            // NOTE: this is only necessary in case of refresh
            result_token.token_type = token_document.type;
            result_token.scopes = token_document.dependent_scopes;
            // NOTE: force consent flow if proper refresh variables are unavailable
            result_token.needs_consent = !result_token.token_type || !result_token.scopes;
        } else {
            result_token.token_type = g_lib.AccessTokenType.GLOBUS_DEFAULT;
        }
        return result_token;
    }
}

module.exports = { UserToken };
