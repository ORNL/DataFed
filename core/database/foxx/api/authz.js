'use strict';

const g_db = require('@arangodb').db;
const path = require('path');
const pathModule = require("./posix_path");
const g_lib = require('./support');
const { Repo, PathType } = require("./repo");

module.exports = (function() {
  var obj = {}

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
  obj.isRecordActionAuthorized = function(a_client, a_data_key, a_perm) {
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


  obj.readRecord = function(client, path) {

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
      // If the record does not exist then the path would noe be consistent.
      console.log(
          "AUTHZ act: read client: " + client._id + " path " + path + " FAILED"
          );
      throw [g_lib.ERR_PERM_DENIED, "Invalid record specified: " + path];
    }
    // Special case - allow unknown client to read a publicly accessible record
    // if record exists and if it is a public record
    if (!client) {
      if (!g_lib.hasPublicRead(record.id())) {
        console.log(
            "AUTHZ act: read" +
            " client: " + client._id +
            " path " + path +
            " FAILED"
            );
        throw g_lib.ERR_PERM_DENIED;
      }
    } else {
      // This will tell us if the action on the record is authorized
      // we still do not know if the path is correct.
      if (! obj.isRecordActionAuthorized(client, data_key, permission)) {
        console.log(
            "AUTHZ act: read" +
            " client: " + client._id +
            " path " + path +
            " FAILED"
            );
        throw g_lib.ERR_PERM_DENIED;
      }
    }

    if (!record.isPathConsistent(path)) {
      console.log(
          "AUTHZ act: read client: " + client._id + " path " + path + " FAILED"
          );
      throw [record.error(), record.errorMessage()];
    }
  }

  obj.none = function(client, path) {
    const permission = g_lib.PERM_NONE;
  }

  obj.denied = function(client, path) {
    throw g_lib.ERR_PERM_DENIED;
  }

  obj.createRecord = function(client, path) {
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
      console.log(
          "AUTHZ act: create client: " + client._id + " path " + path + " FAILED"
          );
      throw [g_lib.ERR_PERM_DENIED, "Invalid record specified: " + path];
    }

    if (!client) {
      console.log(
          "AUTHZ act: create" +
          " client: " + client._id +
          " path " + path +
          " FAILED"
          );
      throw g_lib.ERR_PERM_DENIED;
    } else {
      // This will tell us if the object has been registered with the database
      // not if the folder structure has been correctly created
      if (! obj.isRecordActionAuthorized(client, data_key, permission)) {
        console.log(
            "AUTHZ act: create" +
            " client: " + client._id +
            " path " + path +
            " FAILED"
            );
        throw g_lib.ERR_PERM_DENIED;
      }
    }

    // This will tell us if the proposed path is consistent with what we expect
    // GridFTP will fail if the posix file path does not exist.
    if (!record.isPathConsistent(path)) {
      console.log(
          "AUTHZ act: create client: " + client._id + " path " + path + " FAILED"
          );
      throw [record.error(), record.errorMessage()];
    }
  }

  obj.authz_strategy = {
    "read": {
          [PathType.USER_PATH]:           obj.none,
          [PathType.USER_RECORD_PATH]:    obj.readRecord,
          [PathType.PROJECT_PATH]:        obj.none,
          [PathType.PROJECT_RECORD_PATH]: obj.readRecord,
          [PathType.REPO_BASE_PATH]:      obj.none,
          [PathType.REPO_ROOT_PATH]:      obj.none,
          [PathType.REPO_PATH]:           obj.none,
      },
    "write": {
          [PathType.USER_PATH]:           obj.none,
          [PathType.USER_RECORD_PATH]:    obj.none,
          [PathType.PROJECT_PATH]:        obj.none,
          [PathType.PROJECT_RECORD_PATH]: obj.none,
          [PathType.REPO_BASE_PATH]:      obj.none,
          [PathType.REPO_ROOT_PATH]:      obj.none,
          [PathType.REPO_PATH]:           obj.none,
       },
    "create": {
          [PathType.USER_PATH]:           obj.none,
          [PathType.USER_RECORD_PATH]:    obj.createRecord,
          [PathType.PROJECT_PATH]:        obj.none,
          [PathType.PROJECT_RECORD_PATH]: obj.createRecord,
          [PathType.REPO_BASE_PATH]:      obj.none,
          [PathType.REPO_ROOT_PATH]:      obj.none,
          [PathType.REPO_PATH]:           obj.none,
        },
    "delete": {
          [PathType.USER_PATH]:           obj.denied,
          [PathType.USER_RECORD_PATH]:    obj.denied,
          [PathType.PROJECT_PATH]:        obj.denied,
          [PathType.PROJECT_RECORD_PATH]: obj.denied,
          [PathType.REPO_BASE_PATH]:      obj.denied,
          [PathType.REPO_ROOT_PATH]:      obj.denied,
          [PathType.REPO_PATH]:           obj.denied,
        },
    "chdir": {
          [PathType.USER_PATH]:           obj.none,
          [PathType.USER_RECORD_PATH]:    obj.none,
          [PathType.PROJECT_PATH]:        obj.none,
          [PathType.PROJECT_RECORD_PATH]: obj.none,
          [PathType.REPO_BASE_PATH]:      obj.none,
          [PathType.REPO_ROOT_PATH]:      obj.none,
          [PathType.REPO_PATH]:           obj.none,
       },
    "lookup": {
          [PathType.USER_PATH]:           obj. none,
          [PathType.USER_RECORD_PATH]:    obj. none,
          [PathType.PROJECT_PATH]:        obj. none,
          [PathType.PROJECT_RECORD_PATH]: obj. none,
          [PathType.REPO_BASE_PATH]:      obj. none,
          [PathType.REPO_ROOT_PATH]:      obj. none,
          [PathType.REPO_PATH]:           obj. none,
        }
  };

  return obj;
})();
