"use strict";

const g_db = require("@arangodb").db;
const g_lib = require("./support");
const { errors } = require("@arangodb");
const error = require("./lib/error_codes");

/**
 * Represents a record in the database and provides methods to manage it.
 *
 * @class
 */
class Record {
    // ERROR code
    #error = null;
    // Error message should be a string if defined
    #err_msg = null;
    // Boolean value that determines if the record exists in the database
    #exists = false;
    // location object, determines what the allocation the data item is associated with
    #loc = null;
    // Allocation object, determines what allocation data item is associated with
    #alloc = null;
    // Determines what repo the data item is associated with
    #repo = null;
    // The data key
    #key = null;
    // The data id simply the key prepended with 'd/'
    #data_id = null;

    /**
     * Constructs a Record object and checks if the key exists in the database.
     *
     * @class
     * @param {string} a_key - The unique identifier for the record. Must be a valid key in the database.
     */
    constructor(a_key) {
        // Define the collection
        const collection = g_db._collection("d");

        // This function is designed to check if the provided key exists in the
        // database as a record. Searches are only made in the 'd' collection
        //
        // Will return true if it does and false if it does not.
        this.#key = a_key;
        this.#data_id = "d/" + a_key;
        if (a_key) {
            // Check if the document exists
            try {
                if (collection.exists(this.#key)) {
                    this.#exists = true;
                } else {
                    this.#exists = false;
                    this.#error = error.ERR_NOT_FOUND;
                    this.#err_msg = "Invalid key: (" + a_key + "). No record found.";
                }
            } catch (e) {
                this.#exists = false;
                this.#error = error.ERR_INTERNAL_FAULT;
                this.#err_msg = "Unknown error encountered.";
                console.log(e);
            }
        }
    }

    /**
     * Generates the full path to the record as it should appear in the repository.
     *
     * @param {string} uid - The owner uid (e.g. "u/bob" or "p/myproject")
     * @param {string} basePath - The base path of the repository.
     * @returns {string|null} - the path to the record or null if error
     */
    _pathToRecord(uid, basePath) {
        const path = basePath.endsWith("/") ? basePath : basePath + "/";
        if (uid.charAt(0) === "u") {
            return path + "user/" + uid.substr(2) + "/" + this.#key;
        } else if (uid.charAt(0) === "p") {
            return path + "project/" + uid.substr(2) + "/" + this.#key;
        } else {
            this.#error = error.ERR_INTERNAL_FAULT;
            this.#err_msg =
                "Provided uid does not fit within supported directory " +
                "structure for repository, no user or project folder has " +
                "been determined for the record. uid: " +
                uid;
            return null;
        }
    }

    /**
     * Compares two paths and if an error is detected will save the error code and message.
     *
     * @param {string} storedPath - the path stored in the database
     * @param {string} inputPath - the path being checked
     * @returns {boolean} - true if paths are equal false otherwise
     **/
    _comparePaths(storedPath, inputPath) {
        if (storedPath === null) {
            return false;
        }
        if (storedPath !== inputPath) {
            this.#error = error.ERR_PERM_DENIED;
            this.#err_msg =
                "Record path is not consistent with repo expected path is: " +
                storedPath +
                " attempted path is " +
                inputPath;
            return false;
        }
        return true;
    }

    /**
     * Checks if the record exists in the database.
     *
     * @returns {boolean} - True if the record exists, otherwise false.
     */
    exists() {
        return this.#exists;
    }

    key() {
        return this.#key;
    }

    id() {
        return this.#data_id;
    }
    /**
     * Will return error code of last run method.
     *
     * @returns {number} - error code
     **/
    error() {
        return this.#error;
    }

    /**
     * Retrieves the error code of the last run method.
     *
     * @returns {string|null} Error code or null if no error.
     */
    errorMessage() {
        return this.#err_msg;
    }

    /**
     * Checks if the record is managed by DataFed.
     *
     * @returns {boolean} True if managed, otherwise false.
     */
    isManaged() {
        //{
        //    _from: data._id,
        //    _to: repo_alloc._to,
        //    uid: owner_id
        //};
        this.#loc = g_db.loc.firstExample({
            _from: this.#data_id,
        });

        if (!this.#loc) {
            this.#error = error.ERR_PERM_DENIED;
            this.#err_msg =
                "Permission denied data is not managed by DataFed. This can happen if you try to do a transfer directly from Globus.";
            return false;
        }
        this.#alloc = g_db.alloc.firstExample({
            _from: this.#loc.uid,
            _to: this.#loc._to,
        });

        // If alloc is null then will return false if not null will return true.
        return !!this.#alloc;
    }

    isPathConsistent(a_path) {
        if (!this.isManaged()) {
            return false;
        }

        if (!a_path.startsWith("/")) {
            a_path = "/" + a_path;
        }

        // Check current location
        this.#repo = g_db._document(this.#loc._to);
        let current_path = this._pathToRecord(this.#loc.uid, this.#repo.path);

        if (current_path === a_path) {
            return true;
        }

        // If record is in flight, also check new location
        if (this.#loc.hasOwnProperty("new_repo") && this.#loc.new_repo) {
            const new_uid = this.#loc.new_owner ? this.#loc.new_owner : this.#loc.uid;
            const new_alloc = g_db.alloc.firstExample({
                _from: new_uid,
                _to: this.#loc.new_repo,
            });

            if (!new_alloc) {
                this.#error = error.ERR_PERM_DENIED;
                this.#err_msg =
                    "Permission denied, '" + this.#key + "' is not part of an allocation'";
                return false;
            }

            const new_repo = g_db._document(this.#loc.new_repo);
            if (!new_repo) {
                this.#error = error.ERR_INTERNAL_FAULT;
                this.#err_msg =
                    "Unable to find repo '" +
                    this.#loc.new_repo +
                    "' for record '" +
                    this.#data_id +
                    "'";
                return false;
            }

            let new_path = this._pathToRecord(new_uid, new_repo.path);
            if (new_path === a_path) {
                return true;
            }

            // Neither matched — include both expected paths in error
            this.#error = error.ERR_PERM_DENIED;
            this.#err_msg =
                "Record path is not consistent with repo. Expected: " +
                current_path +
                " or " +
                new_path +
                " but got: " +
                a_path;
            return false;
        }

        // No in-flight move, current path didn't match
        this.#error = error.ERR_PERM_DENIED;
        this.#err_msg =
            "Record path is not consistent with repo. Expected: " +
            current_path +
            " but got: " +
            a_path;
        return false;
    }
}

module.exports = Record;
