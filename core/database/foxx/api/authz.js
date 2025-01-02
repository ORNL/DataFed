"use strict";

const g_db = require("@arangodb").db;
const path = require("path");
const g_lib = require("./support");

module.exports = (function () {
    let obj = {};

    /**
     * @brief Will check to see if a client has the required permissions on a
     * record.
     *
     * @param {string} a_data_key - A datafed key associated with a record. Is not prepended with 'd/'
     * @param {obj} a_client - A user document, the user associated with the document is the one
     * who we are verifying if they have permissions to on the data record.
     *
     * e.g.
     *
     * a_client id
     *
     * Client will contain the following information
     * {
     *   "_key" : "bob",
     *   "_id" : "u/bob",
     *   "name" : "bob junior ",
     *   "name_first" : "bob",
     *   "name_last" : "jones",
     *   "is_admin" : true,
     *   "max_coll" : 50,
     *   "max_proj" : 10,
     *   "max_sav_qry" : 20,
     *   :
     *   "email" : "bobjones@gmail.com"
     * }
     *
     * @param - the permission type that is being checked i.e.
     *
     * PERM_CREATE
     * PERM_WR_DATA
     * PERM_RD_DATA
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

    return obj;
})();
