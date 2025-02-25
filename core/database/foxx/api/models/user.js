"use strict";

const support = require("../support");

const database = require("@arangodb").db;
const user_collection = database.u;

class User {
    id;
    key;
    name;
    first_name;
    last_name;
    is_admin;
    maximum_collections;
    maximum_projects;
    maximum_saved_queries;
    creation_time;
    update_time;
    password;
    email;
    options;
}
class UserModel {
    #user_id;
    #user_key;
    #exists;
    #database_entry;
    #is_fetched = false;
    #user = new User();
    /** @type {DataFedOAuthToken} */
    #token;

    constructor(id, key) {
        if (!id && !key) {
            throw [support.ERR_MISSING_REQ_PARAM, "User ID or Key must be provided"];
        }
        this.#user_id = id;
        this.#user_key = key;
    }

    /** Checks database for existence of user
     *
     * @returns {boolean} Whether or not user exists on database
     */
    exists() {
        if (typeof this.#exists === "undefined") {
            let query = { _id: this.#user_id };
            if (this.#user_key) {
                query = { _key: this.#user_key };
            }
            this.#exists = !!user_collection.exists(query);
        }
        return this.#exists;
    }

    /** Gets entry from database and stores in private member
     */
    #get_database_entry() {
        if (typeof this.#database_entry !== "undefined") {
            return;
        }
        if (this.exists()) {
            // TODO: abstract database interactions
            let query = { _id: this.#user_id };
            if (this.#user_key) {
                query = { _key: this.#user_key };
            }
            this.#database_entry = user_collection.document(query);
        } else {
            this.#database_entry = {};
        }
    }

    /** Maps database entry to working model
     */
    #map_entry_to_user() {
        // TODO: abstract database objects
        // NOTE: this is specific to current Arango setup
        this.#user = {
            id: this.#database_entry._id,
            key: this.#database_entry._key,
            name: this.#database_entry.name,
            first_name: this.#database_entry.first_name,
            last_name: this.#database_entry.last_name,
            is_admin: this.#database_entry.is_admin,
            maximum_collections: this.#database_entry.max_coll,
            maximum_projects: this.#database_entry.max_proj,
            maximum_saved_queries: this.#database_entry.max_sav_qry,
            creation_time: this.#database_entry.ct,
            update_time: this.#database_entry.ut,
            password: this.#database_entry.password,
            email: this.#database_entry.email,
            options: this.#database_entry.options,
        };
    }

    /** Maps database entry to token model
     */
    #map_entry_to_token() {
        // TODO: abstract database objects
        const { access, refresh, expiration } = this.#database_entry;
        this.#token = {
            access: access,
            refresh: refresh,
            expiration: expiration,
            type: support.AccessTokenType.GLOBUS_DEFAULT,
            dependent_scopes: null,
        };
    }

    /** Fetches database entry and maps to model(s) if not already present
     */
    #fetch_from_db() {
        if (!this.#is_fetched) {
            this.#get_database_entry();
            this.#map_entry_to_user();
            this.#map_entry_to_token();
            this.#is_fetched = true;
        }
    }

    /** Gets User information in read only state
     *
     * @returns {Readonly<User>} User information
     */
    get() {
        if (!this.#is_fetched) {
            this.#fetch_from_db();
        }
        return Object.freeze(this.#user);
    }

    /** Gets correctly typed token for usage with OAuth APIs
     *
     * @returns {Readonly<DataFedOAuthToken>} Formatted read only OAuth token
     */
    get_token() {
        if (!this.#is_fetched) {
            this.#fetch_from_db();
        }
        return Object.freeze(this.#token);
    }

    // TODO: setters
}

module.exports = { UserModel };
