"use strict";

const g_db = require("@arangodb").db;
const g_lib = require("./support");
const { errors } = require("@arangodb");
const pathModule = require("./posix_path");
const { RepositoryOps } = require("./repository/operations");
const { Result } = require("./repository/types");

/**
 * All DataFed repositories have the following path structure on a POSIX file system
 *
 * E.g.
 * /mnt/science/datafed/project/foo/904u42
 * /mnt/science/datafed/user/bob/352632
 *
 * In these cases
 *
 * PROJECT_PATH = /mnt/science/datafed/project/foo
 * USER_PATH = /mnt/science/datafed/user/bob
 *
 * USER_RECORD_PATH = /mnt/science/datafed/user/bob/352632
 * and
 * PROJECT_RECORD_PATH = /mnt/science/datafed/project/foo/904u42
 *
 * REPO_BASE_PATH = /mnt/science
 * REPO_ROOT_PATH = /mnt/science/datafed
 * REPO_PATH = /mnt/science/datafed/project
 * REPO_PATH = /mnt/science/datafed/user
 **/
const PathType = {
    USER_PATH: "USER_PATH",
    USER_RECORD_PATH: "USER_RECORD_PATH",
    PROJECT_PATH: "PROJECT_PATH",
    PROJECT_RECORD_PATH: "PROJECT_RECORD_PATH",
    REPO_BASE_PATH: "REPO_BASE_PATH",
    REPO_ROOT_PATH: "REPO_ROOT_PATH",
    REPO_PATH: "REPO_PATH",
    UNKNOWN: "UNKNOWN",
};

/**
 * Legacy Repo class for backward compatibility
 * Internally uses new repository patterns but maintains old API
 */
class Repo {
    // ERROR code
    #error = null;
    // Error message should be a string if defined
    #err_msg = null;
    // Boolean value that determines if the repo exists in the database
    #exists = false;
    // The repo id simply the key prepended with 'repo/'
    #repo_id = null;
    #repo_key = null;
    // New: store the repository object using new patterns
    #repository = null;

    /**
     * Constructs a Repo object and checks if the key exists in the database.
     *
     * @param {string} a_key or id - The unique identifier for the repo, of repo key.
     * e.g. can be either
     * repo/repo_name
     * or
     * repo_name
     */
    constructor(a_key) {
        // Define the collection
        const collection = g_db._collection("repo");

        // This function is designed to check if the provided key exists in the
        // database as a record. Searches are only made in the 'd' collection
        //
        // Will return true if it does and false if it does not.
        if (a_key && a_key !== "repo/") {
            if (a_key.startsWith("repo/")) {
                this.#repo_id = a_key;
                this.#repo_key = a_key.slice("repo/".length);
            } else {
                this.#repo_id = "repo/" + a_key;
                this.#repo_key = a_key;
            }

            // Use new repository operations to find the repo
            const findResult = RepositoryOps.find(this.#repo_id);
            
            if (findResult.ok) {
                this.#exists = true;
                this.#repository = findResult.value;
            } else {
                this.#exists = false;
                this.#error = findResult.error.code === 404 ? g_lib.ERR_NOT_FOUND : g_lib.ERR_INTERNAL_FAULT;
                this.#err_msg = findResult.error.message;
            }
        }
    }

    /**
     * Checks if the repo exists in the database.
     *
     * @returns {boolean} True if the repo exists, otherwise false.
     */
    exists() {
        return this.#exists;
    }

    key() {
        return this.#repo_key;
    }

    id() {
        return this.#repo_id;
    }

    /**
     * Will return error code of last run method.
     * @returns {number} - If no error code, will return null
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
     * Get the underlying repository object (new pattern)
     * @returns {object|null} Repository object or null if not exists
     */
    getRepository() {
        return this.#repository;
    }

    /**
     * Detect what kind of POSIX path has been provided
     *
     * @param {string} a_path - the POSIX path that is supposed to exist on the repo
     * @returns {string} - posix path type
     **/
    pathType(a_path) {
        // Ensure the repo exists
        if (!this.#exists) {
            throw [g_lib.ERR_PERM_DENIED, "Repo does not exist " + this.#repo_id];
        }

        const repoData = this.#repository.data;
        if (!repoData.path) {
            // Metadata-only repos don't have paths
            if (repoData.type === 'metadata_only') {
                return PathType.UNKNOWN;
            }
            throw [g_lib.ERR_INTERNAL_FAULT, "Repo document is missing path: " + this.#repo_id];
        }

        // Get and sanitize the repo root path by removing the trailing slash if one exists
        let repo_root_path = repoData.path.replace(/\/$/, "");
        let sanitized_path = a_path.replace(/\/$/, "");

        // Check if the sanitized path is exactly the repo root path
        if (sanitized_path === repo_root_path) {
            return PathType.REPO_ROOT_PATH;
        }

        // Check if the sanitized path is a valid base path
        if (
            sanitized_path.length < repo_root_path.length &&
            repo_root_path.startsWith(sanitized_path + "/")
        ) {
            return PathType.REPO_BASE_PATH;
        }

        // Ensure the sanitized path starts with the repo root path
        if (!sanitized_path.startsWith(repo_root_path + "/")) {
            return PathType.UNKNOWN;
        }

        // Get the relative path and its components
        const relative_path = sanitized_path.substr(repo_root_path.length);
        const relative_path_components = pathModule.splitPOSIXPath(relative_path);

        // Map the first component to its corresponding PathType
        const pathMapping = {
            project: [PathType.REPO_PATH, PathType.PROJECT_PATH, PathType.PROJECT_RECORD_PATH],
            user: [PathType.REPO_PATH, PathType.USER_PATH, PathType.USER_RECORD_PATH],
        };

        const firstComponent = relative_path_components[0];
        if (pathMapping[firstComponent]) {
            return (
                pathMapping[firstComponent][relative_path_components.length - 1] || PathType.UNKNOWN
            );
        }

        return PathType.UNKNOWN;
    }
}

module.exports = { Repo, PathType };