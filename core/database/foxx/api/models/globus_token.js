"use strict";

const support = require("../support");

const database = require("@arangodb").db;
const globus_token_collection = database.globus_token;

class GlobusToken {
    id;
    key;
    user_id;
    globus_collection_id;
    type;
    dependent_scopes;
    request_time;
    last_used_time;
    status;
    access;
    refresh;
    expiration;
}

class GlobusTokenModel {
    #user_id;
    #collection_id;
    #is_fetched = false;
    #database_entry;
    #globus_token = new GlobusToken();

    constructor(user_id, globus_collection_id) {
        if (!user_id || !globus_collection_id) {
            throw [
                support.ERR_MISSING_REQ_PARAM,
                "User ID and Collection ID are required for Globus Tokens"
            ];
        }
        this.#user_id = user_id;
        this.#collection_id = globus_collection_id;
    }

    #get_database_entry() {
        if (typeof this.#database_entry === "undefined") {
            const token_matches = globus_token_collection.byExample({
               _from: this.#user_id,
               _to: this.#collection_id,
            }).toArray();

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
            }
        }
    }

    #map_entry_to_globus_token() {
        // TODO: abstract database objects
        this.#globus_token.id = this.#database_entry._id;
        this.#globus_token.key = this.#database_entry._key;
        this.#globus_token.user_id = this.#database_entry._from;
        this.#globus_token.globus_collection_id = this.#database_entry._to;
        this.#globus_token.type = this.#database_entry.type;
        this.#globus_token.dependent_scopes = this.#database_entry.dependent_scopes;
        this.#globus_token.request_time = this.#database_entry.request_time;
        this.#globus_token.last_used_time = this.#database_entry.last_used;
        this.#globus_token.status = this.#database_entry.status;
        this.#globus_token.access = this.#database_entry.access;
        this.#globus_token.refresh = this.#database_entry.refresh;
        this.#globus_token.expiration = this.#database_entry.expiration;
    }

    #fetch_from_db() {
        // TODO: it looks like this is trying to pull an _id when a collection does not exist during testing
        if (!this.#is_fetched) {
            this.#get_database_entry();
            // TODO: verify exists in each
            if (this.#database_entry !== "undefined") {
                this.#map_entry_to_globus_token();
            }
            this.#is_fetched = true;
        }
    }

    get() {
        this.#fetch_from_db();
        return Object.freeze(this.#globus_token);
    }
}

module.exports = { GlobusTokenModel };