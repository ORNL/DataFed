"use strict";

const g_db = require("@arangodb").db;
const path = require("path");
const Record = require("./record");
const pathModule = require("./posix_path");
const g_lib = require("./support");
const error = require("./lib/error_codes");
const permissions = require("./lib/permissions");
const { Repo, PathType } = require("./repo");

module.exports = (function () {
    let obj = {};

    /**
     * Throws a permission-denied error that carries a reason, so the NACK
     * returned to the GridFTP authz callout says why access was refused.
     */
    function deny(client, action, path) {
        throw [
            error.ERR_PERM_DENIED,
            "Client " + (client?._id ?? "unknown") + " denied " + action + " on " + path,
        ];
    }

    /**
     * True if the client holds read or write permission on at least one record
     * owned by a_owner_id (u/... or p/...) that is stored in this repo. Lets
     * ACL-shared records be reached through their owner's folder.
     *
     * SCHEMA ASSUMPTIONS (verify): 'owner' edges run d -> u|p, 'loc' edges
     * run d -> repo. Cost grows with the owner's record count in the repo;
     * acceptable once per folder hop, not per file.
     */
    function hasAnySharedRecordAccess(client, a_owner_id, repo) {
        const records = g_db
            ._query(
                `FOR o IN owner
                   FILTER o._to == @owner
                   FOR l IN loc
                     FILTER l._from == o._from AND l._to == @repo
                     RETURN DOCUMENT(o._from)`,
                { owner: a_owner_id, repo: repo.id() },
            )
            .toArray();

        return records.some(
            (d) =>
                permissions.hasPermissions(client, d, permissions.PERM_RD_DATA) ||
                permissions.hasPermissions(client, d, permissions.PERM_WR_DATA),
        );
    }

    /**
     * Checks if a client has the required permissions on a record.
     *
     * @param {object} a_client - A user document representing the client being verified.
     * @param {string} a_data_key - A DataFed key associated with a record (not prepended with 'd/').
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
     * @param {string} a_perm - The permission type to check (e.g., `PERM_CREATE`, `PERM_WR_DATA`, `PERM_RD_DATA`).
     *
     * @returns {boolean} True if the client has the required permissions, otherwise false.
     */
    obj.isRecordActionAuthorized = function (a_client, a_data_key, a_perm) {
        const data_id = "d/" + a_data_key;
        // If the user is not an admin of the object we will need
        // to check if the user has the write authorization
        if (permissions.hasAdminPermObject(a_client, data_id)) {
            return true;
        }
        let data = g_db.d.document(data_id);
        // Grab the data item
        if (permissions.hasPermissions(a_client, data, a_perm)) {
            return true;
        }
        return false;
    };

    /**
     * True if the client may use the repository at all: DataFed admin, repo
     * admin, or holder of an allocation on the repo, directly or through a
     * project in which the client has any role.
     *
     * SCHEMA ASSUMPTIONS (verify): 'admin' edges run repo -> u, 'alloc' edges
     * run u|p -> repo. Prefer an existing permissions/g_lib helper if one
     * covers this.
     */
    obj.hasRepoAccess = function (client, repo) {
        if (!client) {
            return false;
        }
        if (client.is_admin) {
            return true;
        }

        const repo_id = repo.id();

        if (g_db.admin.firstExample({ _from: repo_id, _to: client._id })) {
            return true;
        }

        if (g_db.alloc.firstExample({ _from: client._id, _to: repo_id })) {
            return true;
        }

        const project_ids = g_db
            ._query(
                `FOR a IN alloc
                   FILTER a._to == @repo AND STARTS_WITH(a._from, 'p/')
                   RETURN a._from`,
                { repo: repo_id },
            )
            .toArray();

        return project_ids.some(
            (p) => g_lib.getProjectRole(client._id, p) !== g_lib.PROJ_NO_ROLE,
        );
    };

    obj.readRecord = function (client, path) {
        const permission = permissions.PERM_RD_DATA;
        const path_components = pathModule.splitPOSIXPath(path);
        const data_key = path_components.at(-1);
        let record = new Record(data_key);
        if (!record.exists()) {
            // Return not found error for non-existent records
            throw [error.ERR_NOT_FOUND, "Record not found: " + path];
        }

        // Special case - allow unknown client to read a publicly accessible record
        // if record exists and if it is a public record
        if (!client) {
            if (!g_lib.hasPublicRead(record.id())) {
                throw [
                    error.ERR_PERM_DENIED,
                    "Unknown client does not have read permissions on " + path,
                ];
            }
        } else if (!obj.isRecordActionAuthorized(client, data_key, permission)) {
            throw [
                error.ERR_PERM_DENIED,
                "Client " + client._id + " does not have read permissions on " + path,
            ];
        }

        if (!record.isPathConsistent(path)) {
            throw [record.error(), record.errorMessage()];
        }
    };

    /**
     * Authorizes lookup (stat) on a record file.
     *
     * GridFTP stats the file both before a download (read) and before an
     * upload (write/create), so either permission suffices. The check is
     * against the database record, so it also works before an upload's file
     * exists on disk.
     */
    obj.lookupRecord = function (client, path, repo) {
        if (!client) {
            deny(client, "lookup", path);
        }
        const data_key = pathModule.splitPOSIXPath(path).at(-1);
        const record = new Record(data_key);

        if (!record.exists()) {
            throw [error.ERR_NOT_FOUND, "Record not found: " + path];
        }

        if (
            !obj.isRecordActionAuthorized(client, data_key, permissions.PERM_RD_DATA) &&
            !obj.isRecordActionAuthorized(client, data_key, permissions.PERM_WR_DATA)
        ) {
            deny(client, "lookup", path);
        }

        if (!record.isPathConsistent(path)) {
            throw [record.error(), record.errorMessage()];
        }
    };

    obj.none = function (client, path) {
        const permission = permissions.PERM_NONE;
    };

    /**
     * Authorizes traversal (lookup/chdir) of the directories from the
     * collection down to <repo>/user and <repo>/project. They hold only
     * structure, no data. Requires a known client with access to this repo.
     */
    obj.traverseRepo = function (client, path, repo) {
        if (!client || !obj.hasRepoAccess(client, repo)) {
            deny(client, "traverse", path);
        }
    };

    /**
     * Authorizes access to a user's repository folder.
     *
     * User folders are private to their owner, except for DataFed administrators.
     */
    obj.readUserFolder = function (client, path) {
        const path_components = pathModule.splitPOSIXPath(path);
        const user_id = "u/" + path_components.at(-1);

        if (!client || !permissions.hasAdminPermUser(client, user_id)) {
            throw [
                error.ERR_PERM_DENIED,
                "Client " + client?._id + " does not have read permissions on " + path,
            ];
        }
    };

    /**
     * Authorizes traversal (lookup/chdir) of a user's repository folder.
     *
     * Allowed for the owner and DataFed administrators, and for any client
     * holding read/write permission on at least one of the user's records in
     * this repo, so that records shared via ACL remain reachable.
     */
    obj.traverseUserFolder = function (client, path, repo) {
        if (!client) {
            deny(client, "traverse", path);
        }
        const user_id = "u/" + pathModule.splitPOSIXPath(path).at(-1);

        if (permissions.hasAdminPermUser(client, user_id)) {
            return;
        }
        if (hasAnySharedRecordAccess(client, user_id, repo)) {
            return;
        }
        deny(client, "traverse", path);
    };

    /**
     * Authorizes access to a project's repository folder.
     *
     * Any project member, manager, owner, or DataFed administrator may see the
     * folder. Non-members must not be able to discover project contents through
     * the repository even if they have a valid Globus identity.
     */
    obj.readProjectFolder = function (client, path) {
        const path_components = pathModule.splitPOSIXPath(path);
        const project_id = "p/" + path_components.at(-1);

        if (
            !client ||
            (!client.is_admin &&
                g_lib.getProjectRole(client._id, project_id) === g_lib.PROJ_NO_ROLE)
        ) {
            throw [
                error.ERR_PERM_DENIED,
                "Client " + client?._id + " does not have read permissions on " + path,
            ];
        }
    };

    /**
     * Authorizes traversal (lookup/chdir) of a project's repository folder.
     *
     * Allowed for DataFed administrators and anyone with a role in the
     * project, and for any client holding read/write permission on at least
     * one of the project's records in this repo (ACL sharing).
     */
    obj.traverseProjectFolder = function (client, path, repo) {
        if (!client) {
            deny(client, "traverse", path);
        }
        const project_id = "p/" + pathModule.splitPOSIXPath(path).at(-1);

        if (client.is_admin) {
            return;
        }
        if (g_lib.getProjectRole(client._id, project_id) !== g_lib.PROJ_NO_ROLE) {
            return;
        }
        if (hasAnySharedRecordAccess(client, project_id, repo)) {
            return;
        }
        deny(client, "traverse", path);
    };

    obj.denied = function (client, path) {
        deny(client, "action", path);
    };

    obj.createRecord = function (client, path) {
        const permission = permissions.PERM_WR_DATA;
        const path_components = pathModule.splitPOSIXPath(path);
        const data_key = path_components.at(-1);

        if (!client) {
            throw [
                error.ERR_PERM_DENIED,
                "Unknown client does not have create permissions on " + path,
            ];
        } else if (!obj.isRecordActionAuthorized(client, data_key, permission)) {
            throw [
                error.ERR_PERM_DENIED,
                "Client " + client._id + " does not have create permissions on " + path,
            ];
        }

        let record = new Record(data_key);
        // This does not mean the record exsts in the repo it checks if an entry
        // exists in the database.
        if (!record.exists()) {
            // If the record does not exist then the path would not be consistent.
            throw [error.ERR_PERM_DENIED, "Invalid record specified: " + path];
        }

        // This will tell us if the proposed path is consistent with what we expect
        // GridFTP will fail if the posix file path does not exist.
        if (!record.isPathConsistent(path)) {
            throw [record.error(), record.errorMessage()];
        }
    };

    obj.writeRecord = function (client, path) {
        const permission = permissions.PERM_WR_DATA;
        const path_components = pathModule.splitPOSIXPath(path);
        const data_key = path_components.at(-1);

        if (!client) {
            throw [
                error.ERR_PERM_DENIED,
                "Unknown client does not have write permissions on " + path,
            ];
        } else if (!obj.isRecordActionAuthorized(client, data_key, permission)) {
            throw [
                error.ERR_PERM_DENIED,
                "Client " + client._id + " does not have write permissions on " + path,
            ];
        }

        let record = new Record(data_key);
        // This does not mean the record exists in the repo it checks if an entry
        // exists in the database.
        if (!record.exists()) {
            // If the record does not exist then the path would not be consistent.
            throw [error.ERR_PERM_DENIED, "Invalid record specified: " + path];
        }

        // This will tell us if the proposed path is consistent with what we expect
        // GridFTP will fail if the posix file path does not exist.
        if (!record.isPathConsistent(path)) {
            throw [record.error(), record.errorMessage()];
        }
    };

    obj.authz_strategy = {
        read: {
            [PathType.USER_PATH]: obj.readUserFolder,
            [PathType.USER_RECORD_PATH]: obj.readRecord,
            [PathType.PROJECT_PATH]: obj.readProjectFolder,
            [PathType.PROJECT_RECORD_PATH]: obj.readRecord,
            [PathType.REPO_BASE_PATH]: obj.denied,
            [PathType.REPO_ROOT_PATH]: obj.denied,
            [PathType.REPO_PATH]: obj.denied,
        },
        write: {
            [PathType.USER_PATH]: obj.denied,
            [PathType.USER_RECORD_PATH]: obj.writeRecord,
            [PathType.PROJECT_PATH]: obj.denied,
            [PathType.PROJECT_RECORD_PATH]: obj.writeRecord,
            [PathType.REPO_BASE_PATH]: obj.denied,
            [PathType.REPO_ROOT_PATH]: obj.denied,
            [PathType.REPO_PATH]: obj.denied,
        },
        create: {
            [PathType.USER_PATH]: obj.denied,
            [PathType.USER_RECORD_PATH]: obj.createRecord,
            [PathType.PROJECT_PATH]: obj.denied,
            [PathType.PROJECT_RECORD_PATH]: obj.createRecord,
            [PathType.REPO_BASE_PATH]: obj.denied,
            [PathType.REPO_ROOT_PATH]: obj.denied,
            [PathType.REPO_PATH]: obj.denied,
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
            [PathType.USER_PATH]: obj.traverseUserFolder,
            [PathType.USER_RECORD_PATH]: obj.denied,
            [PathType.PROJECT_PATH]: obj.traverseProjectFolder,
            [PathType.PROJECT_RECORD_PATH]: obj.denied,
            [PathType.REPO_BASE_PATH]: obj.traverseRepo,
            [PathType.REPO_ROOT_PATH]: obj.traverseRepo,
            [PathType.REPO_PATH]: obj.traverseRepo,
        },
        lookup: {
            [PathType.USER_PATH]: obj.traverseUserFolder,
            [PathType.USER_RECORD_PATH]: obj.lookupRecord,
            [PathType.PROJECT_PATH]: obj.traverseProjectFolder,
            [PathType.PROJECT_RECORD_PATH]: obj.lookupRecord,
            [PathType.REPO_BASE_PATH]: obj.traverseRepo,
            [PathType.REPO_ROOT_PATH]: obj.traverseRepo,
            [PathType.REPO_PATH]: obj.traverseRepo,
        },
    };

    return obj;
})();
