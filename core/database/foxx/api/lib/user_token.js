"use strict";

const g_lib = require("../support.js");
const {UserModel} = require("../models/user");
const {GlobusCollectionModel} = require("../models/globus_collection");
const {GlobusTokenModel} = require("../models/globus_token");

/**
 * @property {string} [access] - Access token
 * @property {string} [refresh] - Refresh token
 * @property {number} [expiration] - Exact DataFed server time of expiration
 * @property {g_lib.AccessTokenType | number} [type] - Access token type, present when retrieving a collection token
 * @property {string} [dependent_scopes] - Access token scopes, present when retrieving a collection token
 */
class DataFedOAuthToken {
    access;
    refresh;
    expiration;
    type;
    dependent_scopes;
}

class UserToken {
    #user_model;
    user;
    /** @type {Readonly<GlobusCollection>} */
    globus_collection;
    /** @type {DataFedOAuthToken} */
    #working_token;
    constructor(kwargs = {}) {
        const { user_key, user_id, globus_collection_id } = kwargs;
        this.#user_model = new UserModel(user_id, user_key);
        this.user = this.#user_model.get();
        if (typeof globus_collection_id !== "undefined") {
            const globus_collection_model = new GlobusCollectionModel(globus_collection_id);
            this.globus_collection = globus_collection_model.get();

            if (globus_collection_model.exists()) {
                // TODO: this is currently handling the validation of required fields, and I want that to be more clear
                const globus_token_model = new GlobusTokenModel(this.user.id, this.globus_collection.id);
                this.#working_token = globus_token_model.get();
            }
        }
    }

    #fetch_token() {
        // TODO: follow a model
        if (!this.#working_token) {
            // TODO: does not guarantee token exists
            this.#working_token = this.#user_model.get_token();
        }
    }

    /** Gets token
     *
     * @returns {Readonly<DataFedOAuthToken>} The token in read only form
     */
    get_token() {
        this.#fetch_token();
        return Object.freeze(this.#working_token);
    }

    /** Validates minimum viable token attributes exist
     *
     * @returns {boolean} Whether the token has required attributes
     */
    exists() {
        this.#fetch_token();
        // check that required fields are not null
        return !!this.#working_token.access && !!this.#working_token.refresh && !!this.#working_token.expiration;
    }

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
     * @param {DataFedOAuthToken} token_document - Database document holding relevant token info
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

    static formatUserTokenForTransferTask(token_doc) {
        const exp_in = token_doc.expiration - Math.floor(Date.now() / 1000);
        return Object.freeze({
            acc_tok: token_doc.access,
            ref_tok: token_doc.refresh,
            acc_tok_exp_in: exp_in > 0 ? exp_in : 0,
        });
    }
}

module.exports = { UserToken };
