"use strict";

const g_db = require("@arangodb").db;
const path = require("path");
const g_lib = require("./support");

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

    return obj;
})();
