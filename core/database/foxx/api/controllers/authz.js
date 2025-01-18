"use strict";

const g_db = require("@arangodb").db;
const path = require("path");
const pathModule = require("./../utils/posix_path");
const Record = require("./record");
const g_lib = require("../support");
const { Repo, PathType } = require("./repo");
const { Project } = require("./project");

module.exports = (function () {
    let obj = {};

    /**
     * Checks if a client has the required permissions on a record.
     *
     * @param {object} a_client - A user document representing the client being verified.
     * The client object should have the following structure:
     *
     * "_key": "bob",
     * "_id": "u/bob",
     * "name": "bob junior",
     * "name_first": "bob",
     * "name_last": "jones",
     * "is_admin": true,
     * "max_coll": 50,
     * "max_proj": 10,
     * "max_sav_qry": 20,
     * "email": "bobjones@gmail.com"
     *
     * @param {string} a_data_key - A DataFed key associated with a record (not prepended with 'd/').
     * @param {string} a_perm - The permission type to check (e.g., `PERM_CREATE`, `PERM_WR_DATA`, `PERM_RD_DATA`).
     *
     * @returns {boolean} True if the client has the required permissions, otherwise false.
     *
     * @see support#obj - for permission options i.e.PERM_CREATE, PERM_WR_DATA, PERM_RD_DATA`
     **/
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

    /****************************************************************************
     * Strategy Methods
     ***************************************************************************
     * Description
     * -----------
     *
     * The following section contains authorization stategy methods, that are
     * used to determine if a GridFTP action is authorized by a given client.
     *
     * Authorization is granted based on the action that is being run on
     * a particial file path. The strategy methods are triggered based on
     * the categorization of the file path. The types of categorization
     * of a file path is shown below.
     *
     * DataFed Repo Project Path Categorization
     * ----------------------------------------
     *
     * As an example consider the following path is the root of the datafed repo project
     *
     * /mnt/large/data/
     *
     * And it contains the following subfolders with folders for users and projects in
     * each respectively
     *
     * /mnt/large/data/project
     * /mnt/large/data/user
     *
     * /mnt                                    - REPO_BASE_PATH
     * /mnt/large                              - REPO_BASE_PATH
     * /mnt/large/data                         - REPO_ROOT_PATH
     * /mnt/large/data/project                 - REPO_PATH
     * /mnt/large/data/user                    - REPO_PATH
     * /mnt/large/data/project/physics         - PROJECT_PATH
     * /mnt/large/data/user/tim                - USER_PATH
     * /mnt/large/data/project/physics/849384  - PROJECT_RECORD_PATH
     * /mnt/large/data/user/tim/598035         - USER_RECORD_PATH
     */

    /* Checks if a Client has read access to a Record
     *
     * This method assumes that the categorization is either
     * - USER_RECORD_PATH
     * - PROJECT_RECORD_PATH
     *
     * From the examples shown in the top description this would be have a form
     * similar to:
     *
     * /mnt/large/data/project/physics/849384  - PROJECT_RECORD_PATH
     * /mnt/large/data/user/tim/598035         - USER_RECORD_PATH
     *
     * @param {object} client - the client who is being checked to see if they have authorization.
     * @param {string} path - the POSIX file path being checked to ensure the user has authorization on it.
     * @param {object} a_repo - the repo where the path is located.
     * @returns {boolean} True if the client has the required permissions, otherwise false.
     **/
    obj.readRecord = function (client, path, a_repo) {
        const permission = g_lib.PERM_RD_DATA;
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
        return true;
    };

    /* Placeholder strategy method
     *
     * This method grants authorization and does not do anything.
     *
     * @param {object} client - the client who is being checked to see if they have authorization.
     * @param {string} path - the POSIX file path being checked to ensure the user has authorization on it.
     * @param {object} a_repo - the repo where the path is located.
     * @returns {boolean} True if the client has the required permissions, otherwise false.
     **/
    obj.none = function (client, path, a_repo) {
        const permission = g_lib.PERM_NONE;
        return true;
    };

    /* This method denies access to a GridFTP action
     *
     * @param {object} client - the client who is being checked to see if they have authorization.
     * @param {string} path - the POSIX file path being checked to ensure the user has authorization on it.
     * @param {object} a_repo - the repo where the path is located.
     * @returns {boolean} True if the client has the required permissions, otherwise false.
     **/
    obj.denied = function (client, path, a_repo) {
        throw [
            g_lib.ERR_PERM_DENIED,
            "Permissions denied for client " + client._id + " on path: " + path,
        ];
        return true;
    };

    /**
     * This method will check if a user has write permissions
     *
     * This strategy method applies to paths of the type:
     * - USER_RECORD_PATH
     * - PROJECT_RECORD_PATH
     *
     * Example:
     *
     * /mnt/large/data/project/physics/849384  - PROJECT_RECORD_PATH
     * /mnt/large/data/user/tim/598035         - USER_RECORD_PATH
     *
     * @param {object} client - the client who is being checked to see if they have authorization.
     * @param {string} path - the POSIX file path being checked to ensure the user has authorization on it.
     * @param {object} a_repo - the repo where the path is located.
     * @returns {boolean} True if the client has the required permissions, otherwise false.
     */
    obj.createRecord = function (client, path, a_repo) {
        const permission = g_lib.PERM_WR_DATA;

        const path_components = pathModule.splitPOSIXPath(path);
        const data_key = path_components.at(-1);
        let record = new Record(data_key);

        // This does not mean the record exsts in the repo it checks if an entry
        // exists in the database.
        if (!record.exists()) {
            // If the record does not exist then the path would not be consistent.
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
        return true;
    };

    /**
     * This method will check if a user has lookup ability on a Record
     *
     * This strategy method applies to paths of the type:
     * - USER_RECORD_PATH
     * - PROJECT_RECORD_PATH
     *
     * Example:
     *
     * /mnt/large/data/project/physics/849384  - PROJECT_RECORD_PATH
     * /mnt/large/data/user/tim/598035         - USER_RECORD_PATH
     *
     * NOTE: Lookup grants a user the ability to see the path content from the
     * Globus service.
     *
     * @param {object} client - the client who is being checked to see if they have authorization.
     * @param {string} path - the POSIX file path being checked to ensure the user has authorization on it.
     * @param {object} a_repo - the repo where the path is located.
     * @returns {boolean} True if the client has the required permissions, otherwise false.
     */
    obj.lookupRecord = function (client, path, a_repo) {
        const permission = g_lib.PERM_RD_DATA;
        const path_components = pathModule.splitPOSIXPath(path);
        const data_key = path_components.at(-1);
        let record = new Record(data_key);
        if (!record.exists()) {
            // If the record does not exist then the path would not be consistent.
            console.log("AUTHZ act: lookup client: " + client._id + " path " + path + " FAILED");
            throw [g_lib.ERR_PERM_DENIED, "Invalid record specified: " + path];
        }
        // Special case - allow unknown client to lookup a publicly accessible record
        // if record exists and if it is a public record
        if (!client) {
            if (!g_lib.hasPublicRead(record.id())) {
                console.log("AUTHZ act: lookup" + " unknown client " + " path " + path + " FAILED");
                throw [
                    g_lib.ERR_PERM_DENIED,
                    "Unknown client does not have lookup permissions on " + path,
                ];
            }
        } else if (!obj.isRecordActionAuthorized(client, data_key, permission)) {
            console.log(
                "AUTHZ act: lookup" + " client: " + client._id + " path " + path + " FAILED",
            );
            throw [
                g_lib.ERR_PERM_DENIED,
                "Client " + client._id + " does not have lookup permissions on " + path,
            ];
        }

        if (!record.isPathConsistent(path)) {
            console.log("AUTHZ act: lookup client: " + client._id + " path " + path + " FAILED");
            throw [record.error(), record.errorMessage()];
        }
        return true;
    };

    /**
     * This method will check if a user has lookup ability on a Project
     *
     * This strategy method applies to paths of the type:
     * - PROJECT_PATH
     *
     * Example:
     *
     * /mnt/large/data/project/physics         - PROJECT_PATH
     *
     * NOTE: Lookup grants a user the ability to see the path content from the
     * Globus service.
     *
     * @param {object} client - the client who is being checked to see if they have authorization.
     * @param {string} path - the POSIX file path being checked to ensure the user has authorization on it.
     * @param {object} a_repo - the repo where the path is located.
     * @returns {boolean} True if the client has the required permissions, otherwise false.
     */
    obj.lookupProject = function (client, path, a_repo) {
        const path_components = pathModule.splitPOSIXPath(path);
        const project_id = "p/" + path_components.at(-1);
        const project = new Project(project_id);
        if (!a_repo.exists()) {
            // Repo does not exist
            console.log("AUTHZ act: lookup client: " + client._id + " path " + path + " DENIED");
            throw [
                g_lib.ERR_PERM_DENIED,
                "Client " + client._id + " does not have lookup permissions on " + path,
            ];
        } else if (!project.exists()) {
            // Project does not exist
            console.log("AUTHZ act: lookup client: " + client._id + " path " + path + " DENIED");
            throw [
                g_lib.ERR_PERM_DENIED,
                "Client " + client._id + " does not have lookup permissions on " + path,
            ];
        }

        // Project does not exist on repo, i.e. no allocation on repo
        const repo_ids = project.getRepositoryIds();
        if (!repo_ids.has(repo.id())) {
            console.log("AUTHZ act: lookup client: " + client._id + " path " + path + " DENIED");
            throw [
                g_lib.ERR_PERM_DENIED,
                "Client " + client._id + " does not have lookup permissions on " + path,
            ];
        }

        // Client does not have access to the project
        if (!project.hasAccess(client._id)) {
            console.log("AUTHZ act: lookup client: " + client._id + " path " + path + " DENIED");
            throw [
                g_lib.ERR_PERM_DENIED,
                "Client " + client._id + " does not have lookup permissions on " + path,
            ];
        }
        return true;
    };

    /**
     * This method will check if a user has lookup ability on a user folder
     *
     * This strategy method applies to paths of the type:
     * - USER_PATH
     *
     * Example:
     *
     * /mnt/large/data/user/tim                - USER_PATH
     *
     * NOTE: Lookup grants a user the ability to see the path content from the
     * Globus service.
     *
     * @param {object} client - the client who is being checked to see if they have authorization.
     * @param {string} path - the POSIX file path being checked to ensure the user has authorization on it.
     * @param {object} a_repo - the repo where the path is located.
     * @returns {boolean} True if the client has the required permissions, otherwise false.
     */
    obj.lookupUser = function (client, path, a_repo) {
        const path_components = pathModule.splitPOSIXPath(path);
        const username = path_components.at(-1);

        if (client._key !== username) {
            throw [
                g_lib.ERR_PERM_DENIED,
                "Client " + client._id + " does not have lookup permissions on " + path,
            ];
        }
        return true;
    };

    /**
     * This method will check if a user has lookup ability on the Repo folder
     *
     * This lookup is a little expensive because only users with accounts on the
     * repo should be approved to see anything in it we need to know what users
     * are approved for the repo.
     *
     * This strategy method applies to paths of the type:
     * - REPO_BASE_PATH
     * - REPO_ROOT_PATH
     * - REPO_PATH
     *
     * Example:
     *
     * /mnt/large/data                         - REPO_ROOT_PATH
     * /mnt/large/data/project                 - REPO_PATH
     * /mnt/large/data/user                    - REPO_PATH
     * /mnt                                    - REPO_BASE_PATH
     * /mnt/large                              - REPO_BASE_PATH
     *
     * @param {object} client - the client who is being checked to see if they have authorization.
     * @param {string} path - the POSIX file path being checked to ensure the user has authorization on it.
     * @param {object} a_repo - the repo where the path is located.
     * @returns {boolean} True if the client has the required permissions, otherwise false.
     */
    obj.lookupRepo = function (client, path, a_repo) {
        if (a_repo.hasAccess(client._id)) {
            return true;
        }

        throw [obj.ERR_NO_ALLOCATION, "Client " + client._id + " has no allocation on repo."];
    };

    /****************************************************************************
     * End of Strategy Methods
     ***************************************************************************/

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
            [PathType.USER_PATH]: obj.lookupUser,
            [PathType.USER_RECORD_PATH]: obj.createRecord,
            [PathType.PROJECT_PATH]: obj.lookupProject,
            [PathType.PROJECT_RECORD_PATH]: obj.createRecord,
            [PathType.REPO_BASE_PATH]: obj.lookupRepo,
            [PathType.REPO_ROOT_PATH]: obj.lookupRepo,
            [PathType.REPO_PATH]: obj.lookupRepo,
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
            [PathType.USER_PATH]: obj.lookupUser,
            [PathType.USER_RECORD_PATH]: obj.lookupRecord,
            [PathType.PROJECT_PATH]: obj.lookupProject,
            [PathType.PROJECT_RECORD_PATH]: obj.lookupRecord,
            [PathType.REPO_BASE_PATH]: obj.lookupRepo,
            [PathType.REPO_ROOT_PATH]: obj.lookupRepo,
            [PathType.REPO_PATH]: obj.lookupRepo,
        },
    };

    return obj;
})();
