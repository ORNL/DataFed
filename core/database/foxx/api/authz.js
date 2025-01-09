"use strict";

const g_db = require("@arangodb").db;
const path = require("path");
const g_lib = require("./support");

module.exports = (function () {
    let obj = {};

		/**
		 * Checks if a client has the required permissions on a record.
		 *
		 * @param {object} a_client - A user document representing the client being verified.
		 * @param {string} a_data_key - A DataFed key associated with a record (not prepended with 'd/').
		 * The client object should have the following structure:
		 * {
		 *   "_key": "bob",
		 *   "_id": "u/bob",
		 *   "name": "bob junior",
		 *   "name_first": "bob",
		 *   "name_last": "jones",
		 *   "is_admin": true,
		 *   "max_coll": 50,
		 *   "max_proj": 10,
		 *   "max_sav_qry": 20,
		 *   "email": "bobjones@gmail.com"
		 * }
		 * @param {string} a_perm - The permission type to check (e.g., `PERM_CREATE`, `PERM_WR_DATA`, `PERM_RD_DATA`).
		 * 
		 * @returns {boolean} True if the client has the required permissions, otherwise false.
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

    return obj;
})();
