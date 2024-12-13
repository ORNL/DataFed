'use strict';

const g_db = require('@arangodb').db;
const path = require('path');
const g_lib = require('./support');

module.exports = (function() {
  var obj = {}


  obj.isRecordActionAuthorized = function(a_client, a_data_key, a_perm) {
    const data_id = "d/" + a_data_key;
    // If the user is not an admin of the object we will need
    // to check if the user has the write authorization
    if (g_lib.hasAdminPermObject(a_client, data_id)) {
      return true;
    }
    var data = g_db.d.document(data_id);
    // Grab the data item
    if (g_lib.hasPermissions(a_client, data, a_perm)) {
      return true;
    }
    return false;
  };
  return obj;
})();
