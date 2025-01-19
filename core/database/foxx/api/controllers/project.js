"use strict";

const g_db = require("@arangodb").db;
const g_lib = require("../support");

class Project {
    // ERROR code
    #error = null;
    // Error message should be a string if defined
    #err_msg = null;
    // Boolean value that determines if the project exists in the database
    #exists = false;
    // The project id simply the key prepended with 'p/'
    #project_id = null;
    #project_key = null;

    /**
     * Project document
     *
     * Should contain the following fields
     *
     * _id
     * _key
     * title:
     * owner:
     * creator:
     * desc:
     * admins: [<user_ids>]  e.g ['u/tim','u/manny']
     * members: [<user_ids>]
     **/
    #project = null;

    /**
     * Constructs a Project object and checks if the key exists in the database.
     * @param {string} a_key or id - The unique identifier for the project, of project key.
     * e.g. can be either
     * p/project_name
     * or
     * project_name
     */
    constructor(a_key) {
        // Define the collection
        const collection = g_db._collection("p");

        // This function is designed to check if the provided key exists in the
        // database. Searches are only made in the 'p' collection
        //
        // Will return true if it does and false if it does not.
        if (a_key && a_key !== "p/") {
            if (a_key.startsWith("p/")) {
                this.#project_id = a_key;
                this.#project_key = a_key.slice("p/".length);
            } else {
                this.#project_id = "p/" + a_key;
                this.#project_key = a_key;
            }

            // Check if the project document exists
            try {
                if (collection.exists(this.#project_key)) {
                    this.#project = collection.document(this.#project_id);
                    this.#exists = true;
                } else {
                    this.#exists = false;
                    this.#error = g_lib.ERR_NOT_FOUND;
                    this.#err_msg = "Invalid key: (" + a_key + "). No project found.";
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
     * Checks if the project exists in the database.
     *
     * @returns {boolean} True if the project exists, otherwise false.
     */
    exists() {
        return this.#exists;
    }

    key() {
        return this.#project_key;
    }

    id() {
        return this.#project_id;
    }

    /**
     * Get the allocations associated with the project
     *
     * @returns {Array} allocations linked to the project
     **/
    getAllocations() {
        const allocs = g_db.alloc
            .byExample({
                _from: this.#project_id,
            })
            .toArray();
        return allocs;
    }

    /**
     * Get the members associated with the project
     *
     * @returns {Array} project members attached to the project
     **/
    getMembers() {
        this.#project.members;
    }

    /**
     * Determines if a client is a member of the project
     *
     * @param {string} a_client_id - a client id string
     * @returns {boolean} true or false depending on if the client is a member of the project or not
     **/
    isMember(a_client_id) {
        if (a_client_id.substring(0, 2) !== "u/") {
            this.#error = g_lib.ERR_INVALID_PARAMETER;
            this.#err_msg = "isMember method expects user id i.e. 'u/bob'.";
            return false;
        }
        // Check if the user is a member or admin
        if (this.#project.members.includes(a_client_id)) {
            return true;
        }
        return false;
    }

    /**
     * Determines if a client is an admin of the project
     *
     * @param {string} a_client_id - unique identifier for a client
     * @returns {boolean} true if client is an admin of the project false otherwise
     **/
    isAdmin(a_client_id) {
        if (a_client_id.substring(0, 2) !== "u/") {
            this.#error = g_lib.ERR_INVALID_PARAMETER;
            this.#err_msg = "isMember method expects user id i.e. 'u/bob'.";
            return false;
        }
        // Check if the user is a member or admin
        if (this.#project.admins.includes(a_client_id)) {
            return true;
        }
        return false;
    }

    hasAccess(a_client_id) {
        // Check if the user is a member or admin
        if (this.isMember(a_client_id)) {
            return true;
        }
        if (this.isAdmin(a_client_id)) {
            return true;
        }
        return false;
    }
    /**
     * Get the ids of the repositories the project has allocations on
     *
     * @returns {set} a set of repo ids.
     **/
    getRepositoryIds() {
        const allocs = this.getAllocations();
        return [...new Set(allocs.map((obj) => obj._to))];
    }

    /**
     * Check if project has allocation on repo
     *
     * @param {string} a_repo_id - globally unique repository id
     * @returns {boolean} true if repository has allocations on project.
     **/
    hasAllocationOnRepo(a_repo_id) {
        if (a_repo_id.substring(0, 5) !== "repo/") {
            this.#error = g_lib.ERR_INVALID_PARAMETER;
            this.#err_msg = "hasAllocationOnRepo method expects repo id i.e. 'repo/materials'.";
            return false;
        }
        const repo_ids = this.getRepositoryIds();
        return repo_ids.has(a_repo_id);
    }

    /**
     * Will return error code of last run method.
     *
     * @returns {number} If no error code, will return null
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
     * Will return what role a client has on the project
     *
     * Possible roles include
     * - PROJ_MEMBER
     * - PROJ_NO_ROLE
     * - PROJ_MANAGER
     *
     * @param {string} a_client_id - globally unique identifier
     * @returns {number} associated with project role.
     **/
    getProjectRole(a_client_id) {
        return g_lib.getProjectRole(a_client_id, this.#project_id);
    }
}

module.exports = Project;
