"use strict";

const support = require("../support");
const { DataFedOAuthToken } = require("./DataFedOAuthToken");

const database = require("@arangodb").db;
const globus_token_collection = database.globus_token;

class GlobusToken {
    static id;
    static key;
    static user_id;
    static globus_collection_id;
    static type;
    static dependent_scopes;
    static request_time;
    static last_used_time;
    static status;
    static access;
    static refresh;
    static expiration;
}

class GlobusTokenModel {
    #user_id;
    #collection_id;
    #is_fetched = false;
    #database_entry;
    /** @type {GlobusToken} */
    #globus_token;
    /** @type {DataFedOAuthToken} */
    #oauth_token;

    /** Validates necessary fields exist and creates GlobusTokenModel Object
     *
     * @param {string} user_id - _id field of user document
     * @param {string} globus_collection_id - _id field of globus collection document
     * @throws {Array} - When either any parameter is not provided
     */
    constructor(user_id, globus_collection_id) {
        if (!user_id || !globus_collection_id) {
            throw [
                support.ERR_MISSING_REQ_PARAM,
                "User ID and Collection ID are required for Globus Tokens",
            ];
        }
        this.#user_id = user_id;
        this.#collection_id = globus_collection_id;
    }

    /** Gets entry from database and stores in private member
     *
     * @throws {Array} - If there is more than one entry for user token on a collection
     */
    #get_database_entry() {
        if (typeof this.#database_entry !== "undefined") {
            return;
        }
        const token_matches = globus_token_collection
            .byExample({
                _from: this.#user_id,
                _to: this.#collection_id,
            })
            .toArray();

        if (token_matches.length > 0) {
            if (token_matches.length > 1) {
                throw [
                    support.ERR_INTERNAL_FAULT,
                    "Too many matching tokens for user: " +
                        this.#user_id +
                        " to collection: " +
                        this.#collection_id,
                ];
            }
            this.#database_entry = token_matches[0];
        } else {
            this.#database_entry = {};
        }
    }

    /** Maps database entry to working model
     */
    #map_entry_to_globus_token() {
        // TODO: abstract database objects
        let globus_token = new GlobusToken();
        globus_token.id = this.#database_entry._id;
        globus_token.key = this.#database_entry._key;
        globus_token.user_id = this.#database_entry._from;
        globus_token.globus_collection_id = this.#database_entry._to;
        globus_token.type = this.#database_entry.type;
        globus_token.dependent_scopes = this.#database_entry.dependent_scopes;
        globus_token.request_time = this.#database_entry.request_time;
        globus_token.last_used_time = this.#database_entry.last_used;
        globus_token.status = this.#database_entry.status;
        globus_token.access = this.#database_entry.access;
        globus_token.refresh = this.#database_entry.refresh;
        globus_token.expiration = this.#database_entry.expiration;
        this.#globus_token = globus_token;
    }

    /** Maps database entry to working OAuth token model
     */
    #map_entry_to_oauth_token() {
        let oauth_token = new DataFedOAuthToken();
        Object.keys(DataFedOAuthToken).map((key) => {
            console.log("mapping key ", key);
            oauth_token[key] = this.#database_entry[key]; // mapping is currently 1:1
        });
        this.#oauth_token = oauth_token;
    }

    /** Fetches database entry and maps to model(s) if not already present
     */
    #fetch_from_db() {
        if (!this.#is_fetched) {
            this.#get_database_entry();
            this.#map_entry_to_globus_token();
            this.#map_entry_to_oauth_token();
            this.#is_fetched = true;
        }
    }

    /** Gets Globus Token information in read only state.
     *
     * @returns {Readonly<GlobusToken>} Globus Token information
     */
    get() {
        this.#fetch_from_db();
        return Object.freeze(this.#globus_token);
    }

    /** Gets correctly typed token for usage with OAuth APIs
     *
     * @returns {Readonly<DataFedOAuthToken>} Formatted read only OAuth token
     */
    get_oauth_token() {
        this.#fetch_from_db();
        return Object.freeze(this.#oauth_token);
    }
}

module.exports = { GlobusTokenModel, GlobusToken };
