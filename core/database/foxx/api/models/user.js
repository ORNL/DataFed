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
    // ERROR code
    #error = null;
    // Error message should be a string if defined
    #err_msg = null;
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
        } else if (typeof id !== "undefined" && typeof key !== "undefined") {
          if( id !== "u/" + key ) {
          // If both values are provided for some reason they must be equivalent.
            throw [support.ERR_INTERNAL_FAULT, "Both id and key provided to user model, but they have conflicting values. id must equal 'u/' + key"];
          } else {
            this.#user_id = id;
            this.#user_key = key;
          }
        } else if ( typeof id === "undefined" ) {
          this.#user_id = "u/" + key;
          this.#user_key = key;
        } else if ( typeof key == "undefined" ) {
          this.#user_id = id;
          this.#user_key = id.slice("u/".length);
        }
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

    getGroupIds() {
        const qry = "FOR edge IN mem FILTER edge._to == @user_id RETURN edge._from";
        const cursor = database._query(qry, { user_id: this.#user_id });
        return cursor.toArray();
    }

    getProjectIds() {
        const group_ids = this.getGroupIds();
        const qry = "FOR group IN g FILTER group._id IN @group_ids RETURN DISTINCT group.uid";
        const cursor = database._query(qry, { group_ids: group_ids });
        return cursor.toArray();
    }

    /**
     * Get all the repos the user has access too.
     *
     * @returns {Set} of all repo ids associated with the user.
     **/
    getRepos() {
        // Grab all projects associated with the user
        const project_ids = getProjectIds();
        const qry = "FOR edge IN alloc FILTER edge._from IN @project_ids RETURN DISTINCT edge._to";
        const cursor = database._query(qry, { group_ids: group_ids });
        const project_repos = cursor.toArray();

        // Grab the allocations that the user has access too
        const user_allocs = database.alloc
            .byExample({
                _from: this.#user_id,
            })
            .toArray();

        const repo_ids = [...new Set(user_allocs.map((obj) => obj._to))];

        project_repos.forEach((repo) => repo_ids.add(item));
        return repo_ids;
    }

    // TODO: setters
}

module.exports = { UserModel, User };
