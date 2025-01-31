"use strict";

const g_lib = require("../support.js");

export class UserToken {
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
     */
    /**
     *
     * @param {boolean} is_collection_token
     * @param {object} token_document
     * @param {boolean} needs_consent
     * @returns {userTokenResponse}
     */
    static formatUserToken(is_collection_token, token_document, needs_consent) {
        let result_token = {
            needs_consent: needs_consent,
        }
        if (needs_consent) {    // short circuit when consent flow is required
            return result_token;
        }
        result_token.access = token_document.access;
        result_token.refresh = token_document.refresh;
        if (token_document.expiration) {
            const expires_in = token_document.expiration - Math.floor(Date.now() / 1000);
            result_token.expires_in = expires_in > 0 ? expires_in : 0;
        } else {
            result_token.expires_in = 0;
        }
        if (is_collection_token) {
            result_token.token_type = token_document.type;
            result_token.scopes = token_document.scope;
        } else {
            result_token.token_type = g_lib.AccessTokenType.GLOBUS_DEFAULT;
        }
        return result_token;
    }
}
