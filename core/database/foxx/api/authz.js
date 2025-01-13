"use strict";

const g_db = require("@arangodb").db;
const path = require("path");
const pathModule = require("./posix_path");
const g_lib = require("./support");
const { Repo, PathType } = require("./repo");

module.exports = (function () {
    let obj = {};

    /**
     * Checks if a client has the required permissions on a record.
     *
     * @param {string} a_data_key - A DataFed key associated with a record (not prepended with 'd/').
     * @param {Object} a_client - A user document representing the client whose permissions are being verified.
     *                            The client document contains the following properties:
     *                            - `_key` (string): The client's unique key.
     *                            - `_id` (string): The client's unique identifier.
     *                            - `name` (string): The full name of the client.
     *                            - `name_first` (string): The first name of the client.
     *                            - `name_last` (string): The last name of the client.
     *                            - `is_admin` (boolean): Indicates if the client has admin privileges.
     *                            - `max_coll` (number): Maximum collections allowed.
     *                            - `max_proj` (number): Maximum projects allowed.
     *                            - `max_sav_qry` (number): Maximum saved queries allowed.
     *                            - `email` (string): The client's email address.
     * @param {string} a_perm - The permission type to check
     *
     * @see support#obj - for permission options i.e.PERM_CREATE, PERM_WR_DATA, PERM_RD_DATA`
     */

    obj.isRecordActionAuthorized = function (a_client, a_data_key, a_perm) {
        const data_id = "d/" + a_data_key;
        // If the user is not an admin of the object we will need
        // to check if the user has the write authorization
        if (g_lib.hasAdminPermObject(a_client, data_id)) {
            return true;
        }
        let data = g_db.d.document(data_id);
        // Grab the data item
        if (g_lib.hasPermissions(a_client, data, a_perm)) {
            return true;
        }
        return false;
    };

    obj.readRecord = function (client, path) {
        const permission = g_lib.PERM_RD_DATA;
        // Will split a posix path into an array
        // E.g.
        // Will split a posix path into an array
        // E.g.
        // path = "/usr/local/bin"
        // const path_components = pathModule.splitPOSIXPath(path);
        //
        // Path components will be
        // ["usr", "local", "bin"]
        const path_components = pathModule.splitPOSIXPath(path);
        const data_key = path_components.at(-1);
        let record = new Record(data_key);
        if (!record.exists()) {
            // Return not found error for non-existent records
            console.log("AUTHZ act: read client: " + client._id + " path " + path + " NOT_FOUND");
            throw [g_lib.ERR_NOT_FOUND, "Record not found: " + path];
        }
        
        // Special case - allow unknown client to read a publicly accessible record
        // if record exists and if it is a public record
        if (!client) {
            if (!g_lib.hasPublicRead(record.id())) {
                console.log("AUTHZ act: read" + " unknown client " + " path " + path + " FAILED");
                throw [
                    g_lib.ERR_PERM_DENIED,
                    "Unknown client does not have read permissions on " + path,
                ];
            }
        } else if (!obj.isRecordActionAuthorized(client, data_key, permission)) {
            console.log("AUTHZ act: read" + " client: " + client._id + " path " + path + " FAILED");
            throw [
                g_lib.ERR_PERM_DENIED,
                "Client " + client._id + " does not have read permissions on " + path,
            ];
        }

        if (!record.isPathConsistent(path)) {
            console.log("AUTHZ act: read client: " + client._id + " path " + path + " FAILED");
            throw [record.error(), record.errorMessage()];
        }
    };

    obj.none = function (client, path) {
        const permission = g_lib.PERM_NONE;
    };

    obj.denied = function (client, path) {
        throw g_lib.ERR_PERM_DENIED;
    };

    obj.createRecord = function (client, path) {
        const permission = g_lib.PERM_WR_DATA;

        // Will split a posix path into an array
        // E.g.
        // Will split a posix path into an array
        // E.g.
        // path = "/usr/local/bin"
        // const path_components = pathModule.splitPOSIXPath(path);
        //
        // Path components will be
        // ["usr", "local", "bin"]
        const path_components = pathModule.splitPOSIXPath(path);
        const data_key = path_components.at(-1);
        let record = new Record(data_key);

        // This does not mean the record exsts in the repo it checks if an entry
        // exists in the database.
        if (!record.exists()) {
            // If the record does not exist then the path would noe be consistent.
            console.log("AUTHZ act: create client: " + client._id + " path " + path + " FAILED");
            throw [g_lib.ERR_PERM_DENIED, "Invalid record specified: " + path];
        }

        if (!client) {
            console.log(
                "AUTHZ act: create" + " client: " + client._id + " path " + path + " FAILED",
            );
            throw [
                g_lib.ERR_PERM_DENIED,
                "Unknown client does not have create permissions on " + path,
            ];
        } else if (!obj.isRecordActionAuthorized(client, data_key, permission)) {
            console.log(
                "AUTHZ act: create" + " client: " + client._id + " path " + path + " FAILED",
            );
            throw [
                g_lib.ERR_PERM_DENIED,
                "Client " + client._id + " does not have create permissions on " + path,
            ];
        }

        // This will tell us if the proposed path is consistent with what we expect
        // GridFTP will fail if the posix file path does not exist.
        if (!record.isPathConsistent(path)) {
            console.log("AUTHZ act: create client: " + client._id + " path " + path + " FAILED");
            throw [record.error(), record.errorMessage()];
        }
    };

    obj.authz_strategy = {
        read: {
            [PathType.USER_PATH]: obj.none,
            [PathType.USER_RECORD_PATH]: obj.readRecord,
            [PathType.PROJECT_PATH]: obj.none,
            [PathType.PROJECT_RECORD_PATH]: obj.readRecord,
            [PathType.REPO_BASE_PATH]: obj.none,
            [PathType.REPO_ROOT_PATH]: obj.none,
            [PathType.REPO_PATH]: obj.none,
        },
        write: {
            [PathType.USER_PATH]: obj.none,
            [PathType.USER_RECORD_PATH]: obj.none,
            [PathType.PROJECT_PATH]: obj.none,
            [PathType.PROJECT_RECORD_PATH]: obj.none,
            [PathType.REPO_BASE_PATH]: obj.none,
            [PathType.REPO_ROOT_PATH]: obj.none,
            [PathType.REPO_PATH]: obj.none,
        },
        create: {
            [PathType.USER_PATH]: obj.none,
            [PathType.USER_RECORD_PATH]: obj.createRecord,
            [PathType.PROJECT_PATH]: obj.none,
            [PathType.PROJECT_RECORD_PATH]: obj.createRecord,
            [PathType.REPO_BASE_PATH]: obj.none,
            [PathType.REPO_ROOT_PATH]: obj.none,
            [PathType.REPO_PATH]: obj.none,
        },
        delete: {
            [PathType.USER_PATH]: obj.denied,
            [PathType.USER_RECORD_PATH]: obj.denied,
            [PathType.PROJECT_PATH]: obj.denied,
            [PathType.PROJECT_RECORD_PATH]: obj.denied,
            [PathType.REPO_BASE_PATH]: obj.denied,
            [PathType.REPO_ROOT_PATH]: obj.denied,
            [PathType.REPO_PATH]: obj.denied,
        },
        chdir: {
            [PathType.USER_PATH]: obj.none,
            [PathType.USER_RECORD_PATH]: obj.none,
            [PathType.PROJECT_PATH]: obj.none,
            [PathType.PROJECT_RECORD_PATH]: obj.none,
            [PathType.REPO_BASE_PATH]: obj.none,
            [PathType.REPO_ROOT_PATH]: obj.none,
            [PathType.REPO_PATH]: obj.none,
        },
        lookup: {
            [PathType.USER_PATH]: obj.none,
            [PathType.USER_RECORD_PATH]: obj.none,
            [PathType.PROJECT_PATH]: obj.none,
            [PathType.PROJECT_RECORD_PATH]: obj.none,
            [PathType.REPO_BASE_PATH]: obj.none,
            [PathType.REPO_ROOT_PATH]: obj.none,
            [PathType.REPO_PATH]: obj.none,
        },
    };

    return obj;
})();
