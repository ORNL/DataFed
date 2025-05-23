"use strict";

const support = require("../support");
const { DataFedOAuthToken } = require("./DataFedOAuthToken");

const database = require("@arangodb").db;
const user_collection = database.u;

class User {
    static id;
    static key;
    static name;
    static first_name;
    static last_name;
    static is_admin;
    static maximum_collections;
    static maximum_projects;
    static maximum_saved_queries;
    static creation_time;
    static update_time;
    static password;
    static email;
    static options;
}
class UserModel {
    #user_id;
    #user_key;
    #exists;
    #database_entry;
    #is_fetched = false;
    /** @type {User} */
    #user;
    /** @type {DataFedOAuthToken} */
    #token;
    // mapping specific to DB
    #user_database_mapping = {
        id: "_id",
        key: "_key",
        name: "name",
        first_name: "first_name",
        last_name: "last_name",
        is_admin: "is_admin",
        maximum_collections: "max_coll",
        maximum_projects: "max_proj",
        maximum_saved_queries: "max_sav_qry",
        creation_time: "ct",
        update_time: "ut",
        password: "password",
        email: "email",
        options: "options",
    };

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
        let user = new User();
        Object.entries(this.#user_database_mapping).map(([key, value]) => {
            user[key] = this.#database_entry[value];
        });
        this.#user = user;
    }

    /** Maps database entry to token model
     */
    #map_entry_to_token() {
        // TODO: abstract database objects
        const { access, refresh, expiration } = this.#database_entry;
        let token = new DataFedOAuthToken();
        token.access = access;
        token.refresh = refresh;
        token.expiration = expiration;
        token.type = support.AccessTokenType.GLOBUS_DEFAULT;
        token.dependent_scopes = "";
        this.#token = token;
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

    /** Gets User information in read only state.
     * Note that the database object is retrieved only once and stored.
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

module.exports = { UserModel, User };
