"use strict";

const g_db = require("@arangodb").db;
const g_lib = require("./support");
const { errors } = require("@arangodb");

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
                    this.#error = g_lib.ERR_NOT_FOUND;
                    this.#err_msg = "Invalid key: (" + a_key + "). No record found.";
                }
            } catch (e) {
                this.#exists = false;
                this.#error = g_lib.ERR_INTERNAL_FAULT;
                this.#err_msg = "Unknown error encountered.";
                console.log(e);
            }
        }
    }

    /**
     * Generates the full path to the record as it should appear in the repository.
     *
     * @param {object} loc - The location object which specifies the owner of the record.
     * @param {string} basePath - The base path where the record is stored.
     *
     * @returns {string} - the path to the record or null if error
     */
    _pathToRecord(loc, basePath) {
        const path = basePath.endsWith("/") ? basePath : basePath + "/";
        if (loc.uid.charAt(0) == "u") {
            return path + "user/" + loc.uid.substr(2) + "/" + this.#key;
        } else if (loc.uid.charAt(0) == "p") {
            return path + "project/" + loc.uid.substr(2) + "/" + this.#key;
        } else {
            this.#error = g_lib.ERR_INTERNAL_FAULT;
            this.#err_msg = "Provided path does not fit within supported directory ";
            this.#err_msg += "structure for repository, no user or project folder has";
            this.#err_msg += " been determined for the record.";
            console.log(e);
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
            this.#error = g_lib.ERR_PERM_DENIED;
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
            this.#error = g_lib.ERR_PERM_DENIED;
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

    /**
     * Validates if the provided record path is consistent with the database.
     *
     * @param {string} a_path - The path to validate.
     * @returns {boolean} True if consistent, otherwise false.
     */
    isPathConsistent(a_path) {
        // This function will populate the this.#loc member and the this.#alloc
        // member
        if (!this.isManaged()) {
            return false;
        }

        // If there is a new repo we need to check the path there and use that
        if (this.#loc.hasOwnProperty("new_repo") && this.#loc.new_repo) {
            // Below we get the allocation associated with data item by
            // 1. Checking if the data item is in flight, is in the process
            // of being moved to a new location or new owner and using that
            // oweners id.
            // 2. Using the loc.uid parameter if not inflight to get the owner
            // id.
            const new_alloc = g_db.alloc.firstExample({
                _from: this.#loc.new_owner ? this.#loc.new_owner : this.#loc.uid,
                _to: this.#loc.new_repo,
            });

            // If no allocation is found for the item throw an error
            // if the paths do not align also throw an error.
            if (!new_alloc) {
                this.#error = g_lib.ERR_PERM_DENIED;
                this.#err_msg =
                    "Permission denied, '" + this.#key + "' is not part of an allocation '";
                return false;
            }

            this.#repo = g_db._document(this.#loc.new_repo);

            if (!this.#repo) {
                this.#error = g_lib.ERR_INTERNAL_FAULT;
                this.#err_msg =
                    "Unable to find repo that record is meant to be allocated too, '" +
                    this.#loc.new_repo +
                    "' record '" +
                    this.#data_id;
                return false;
            }

            // If path is missing the starting "/" add it back in
            if (!a_path.startsWith("/") && this.#repo.path.startsWith("/")) {
                a_path = "/" + a_path;
            }

            let stored_path = this._pathToRecord(this.#loc, this.#repo.path);

            if (!this._comparePaths(stored_path, a_path)) {
                return false;
            }
        } else {
            this.#repo = g_db._document(this.#loc._to);

            if (!a_path.startsWith("/") && this.#repo.path.startsWith("/")) {
                a_path = "/" + a_path;
            }
            let stored_path = this._pathToRecord(this.#loc, this.#repo.path);

            // If there is no new repo check that the paths align
            if (!this._comparePaths(stored_path, a_path)) {
                return false;
            }
        }
        return true;
    }
}

module.exports = Record;
