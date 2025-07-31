"use strict";

const g_db = require("@arangodb").db;
const g_lib = require("../support");
const { errors } = require("@arangodb");
const pathModule = require("./../utils/posix_path");

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
        // database. Searches are only made in the 'repo' collection
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

            // Check if the repo document exists
            try {
                if (collection.exists(this.#repo_key)) {
                    this.#exists = true;
                } else {
                    this.#exists = false;
                    this.#error = g_lib.ERR_NOT_FOUND;
                    this.#err_msg = "Invalid repo: (" + a_key + "). No repo found.";
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
     *
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
     * Detect what kind of POSIX path has been provided
     *
     * @param {string} a_path - the POSIX path that is supposed to exist on the repo
     * @returns {string} - posix path type
     **/
    pathType(a_path) {
        // Ensure the repo exists
        if (!this.#exists) {
            throw [g_lib.ERR_NOT_FOUND, "Repo does not exist " + this.#repo_id];
        }

        let repo = g_db._document(this.#repo_id);
        if (!repo.path) {
            throw [g_lib.ERR_INTERNAL_FAULT, "Repo document is missing path: " + this.#repo_id];
        }

        // Get and sanitize the repo root path by removing the trailing slash if one exists
        let repo_root_path = repo.path.replace(/\/$/, "");
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

    /**
     * Determine if client is an admin of a repository.
     *
     * @param {string} a_client_id - globally unique client id
     * @returns {boolean} - true if admin false otherwise
     **/
    isAdmin(a_client_id) {
        if (!g_db.u.exists(a_client_id)) {
            return false;
        }
        const a_client = g_db.u.document(a_client_id);
        return g_lib.hasAdminPermRepo(a_client, this.#repo_id);
    }

    /**
     * Determine if a client has access to the repo
     *
     * This could be either a user allocation on a project allocation that the user is a part of,
     * or the user could be an admin.
     *
     * @param {string} a_client_id - globally unique client id
     * @returns {boolean} true if client has access false otherwise.
     **/
    hasAccess(a_client_id) {
        if (a_client_id[0] !== "u") {
            throw [g_lib.ERR_INVALID_PARAM, "hasAllocation accepts user ids only."];
        }
        // Verify that this is a user id.
        if (!g_lib.db._exists(a_client_id)) {
            throw [g_lib.ERR_INVALID_PARAM, "Unknown user id provided " + a_client_id];
        }

        let alloc = g_db.alloc.firstExample({
            _from: a_client_id,
            _to: this.#repo_id,
        });

        if (alloc) {
            return true;
        }

        // The maximum number of edges connecting a user to a repo is 3
        // user <- g -> p -> repo
        // We only need to verify one path exists
        let qry = "FOR v, e, p IN 1..3 ANY @user_id admin, member, owner, alloc";
        qry += " OPTIONS { bfs: true, uniqueEdges: 'path' }";
        qry += " FILTER v._id == @repo_id LIMIT 1";
        qry += " RETURN p.edges";
        const cursor = g_db._query(qry, { repo_id: this.#repo_id, user_id: a_client_id });

        if (cursor.toArray().length === 1) {
            return true;
        }
        return false;
    }

    /**
     * Get list of projects associated with the repository
     *
     * @returns {Array} - projects ids associated with the repository.
     */
    getProjectIds() {
        const qry =
            "WITH p, repo FOR v, e IN INBOUND @repo_id alloc FILTER PARSE_IDENTIFIER(e._from).collection == 'p' RETURN e._from";
        // This should not exceed the memory
        const cursor = g_db._query(qry, { repo_id: this.#repo_id });
        return cursor.toArray();
    }
}

module.exports = { Repo, PathType };
