"use strict";

const support = require("../support");

const database = require("@arangodb").db;
const globus_collection_collection = database.globus_coll;

class GlobusCollection {
    static id;
    static key;
    static name;
    static description;
    static required_scopes;
    static owner;
    static creation_time;
    static update_time;
    static type;
    static ha_enabled;
}

class GlobusCollectionModel {
    #globus_collection_uuid;
    #exists;
    #database_entry;
    #is_fetched = false;
    /** @type {GlobusCollection} */
    #globus_collection;

    /** Builds model for operations on Globus Collections entity within DataFed Database
     *
     * @param {string} globus_collection_id - UUID of Globus Collection
     */
    constructor(globus_collection_id) {
        if (!globus_collection_id) {
            throw [support.ERR_MISSING_REQ_PARAM, "A Globus Collection ID must be provided"];
        }
        this.#globus_collection_uuid = globus_collection_id;
    }

    /**
     * @returns {boolean} - Whether database entry exists
     */
    exists() {
        if (typeof this.#exists === "undefined") {
            const query = { _key: this.#globus_collection_uuid };
            this.#exists = !!globus_collection_collection.exists(query);
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
            const query = { _key: this.#globus_collection_uuid };
            this.#database_entry = globus_collection_collection.document(query);
        } else {
            this.#database_entry = {};
        }
    }

    /** Maps database entry to working model
     */
    #map_entry_to_globus_collection() {
        // TODO: abstract
        let globus_collection = new GlobusCollection();
        globus_collection.id = this.#database_entry._id;
        globus_collection.key = this.#database_entry._key;
        globus_collection.name = this.#database_entry.name;
        globus_collection.description = this.#database_entry.description;
        globus_collection.required_scopes = this.#database_entry.required_scopes;
        globus_collection.owner = this.#database_entry.owner;
        globus_collection.creation_time = this.#database_entry.ct;
        globus_collection.update_time = this.#database_entry.ut;
        globus_collection.type = this.#database_entry.type;
        globus_collection.ha_enabled = this.#database_entry.ha_enabled;
        this.#globus_collection = globus_collection;
    }

    /** Fetches database entry and maps to model(s) if not already present
     */
    #fetch_from_db() {
        if (!this.#is_fetched) {
            this.#get_database_entry();
            this.#map_entry_to_globus_collection();
            this.#is_fetched = true;
        }
    }

    /** Gets Globus Collection information in read only state.
     * Information is cached and will not reflect updates.
     * @returns {Readonly<GlobusCollection>} Globus Collection information
     */
    get() {
        this.#fetch_from_db();
        return Object.freeze(this.#globus_collection);
    }
}

module.exports = { GlobusCollectionModel, GlobusCollection };
