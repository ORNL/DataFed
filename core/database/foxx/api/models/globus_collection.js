"use strict";

const support = require("../support");

const database = require("@arangodb").db;
const globus_collection_collection = database.globus_coll;

class GlobusCollection {
    id;
    key;
    name;
    description;
    required_scopes;
    owner;
    creation_time;
    update_time;
    type;
    ha_enabled;
}

class GlobusCollectionModel {
    #globus_collection_uuid;
    #exists;
    #database_entry;
    #is_fetched = false;
    #globus_collection = new GlobusCollection();

    constructor(globus_collection_id) {
        if (!globus_collection_id) {
            throw [
                support.ERR_MISSING_REQ_PARAM,
                "A Globus Collection ID must be provided"
            ];
        }
        this.#globus_collection_uuid = globus_collection_id;
    }

    exists() {
        if (typeof this.#exists === "undefined") {
            const query = {_key: this.#globus_collection_uuid};
            this.#exists = !!globus_collection_collection.exists(query);
        }
        return this.#exists;
    }

    #get_database_entry() {
        if (typeof this.#database_entry !== "undefined") {
            return;
        }
        if (this.exists()) {
            const query = {_key: this.#globus_collection_uuid};
            this.#database_entry = globus_collection_collection.document(query);
        }
        else {
            this.#database_entry = {};
        }
    }

    #map_entry_to_globus_collection() {
        // TODO: abstract
        this.#globus_collection.id = this.#database_entry._id;
        this.#globus_collection.key = this.#database_entry._key;
        this.#globus_collection.name = this.#database_entry.name;
        this.#globus_collection.description = this.#database_entry.description;
        this.#globus_collection.required_scopes = this.#database_entry.required_scopes;
        this.#globus_collection.owner = this.#database_entry.owner;
        this.#globus_collection.creation_time = this.#database_entry.ct;
        this.#globus_collection.update_time = this.#database_entry.ut;
        this.#globus_collection.type = this.#database_entry.type;
        this.#globus_collection.host = this.#database_entry.ha_enabled;
    }

    #fetch_from_db() {
        if (!this.#is_fetched) {
            this.#get_database_entry();
            this.#map_entry_to_globus_collection();
            this.#is_fetched = true;
        }
    }

    get() {
        this.#fetch_from_db();
        return Object.freeze(this.#globus_collection);
    }
}

module.exports = { GlobusCollectionModel };