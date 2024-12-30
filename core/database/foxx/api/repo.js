"use strict";

const g_db = require("@arangodb").db;
const g_lib = require("./support");
const { errors } = require("@arangodb");
const pathModule = require("./posix_path");

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
  UNKNOWN: "UNKNOWN"
}

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
   * @brief Constructs a Repo object and checks if the key exists in the database.
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
    if (a_key && a_key !== "repo/" ) {
      if ( a_key.startsWith("repo/") ) {
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
          this.#err_msg = "Invalid repo: (" + a_key + "). No record found.";
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
   * @brief Checks if the repo exists in the database.
   * @return {boolean} True if the repo exists, otherwise false.
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
   * @brief Will return error code of last run method.
   *
   * If no error code, will return null
   **/
  error() {
    return this.#error;
  }

  /**
   * @brief Retrieves the error code of the last run method.
   * @return {string|null} Error code or null if no error.
   */
  errorMessage() {
    return this.#err_msg;
  }


  /**
   * @brief Detect what kind of POSIX path has been provided
   **/
  pathType(a_path) {
    if ( !this.#exists ) {
      // Should throw an error because the repo is not valid
      throw [g_lib.ERR_PERM_DENIED, "Record does not exist " + this.#repo_id]
    }
    let repo = g_db._document(this.#repo_id);

    let repo_root_path = repo.path;
    if ( repo_root_path.endsWith("/")) {
      repo_root_path = repo_root_path.slice(0, -1);
    }

    let sanitized_path = a_path;
    if( sanitized_path.endsWith("/")) {
      sanitized_path = sanitized_path.slice(0, -1);
    }

    // Make sure that the provided path begins with the repo root path
    // path/repo_root       Valid
    // path/repo_root/foo   Valid 
    // path/repo_root_bar   Invalid
    if( sanitized_path.length === repo_root_path.length )  {
      if( sanitized_path !== repo_root_path) {
        return PathType.UNKNOWN;
      } else {
        return PathType.REPO_ROOT_PATH;
      }
    } else if ( sanitized_path.length < repo_root_path.length ) {
      if ( repo_root_path.startsWith( sanitized_path + "/" )) {
         return PathType.REPO_BASE_PATH;
      } else {
         return PathType.UNKNOWN;
      }
    } else if( ! sanitized_path.startsWith(repo_root_path + "/")) {
      return PathType.UNKNOWN;
    }

    const relative_path = sanitized_path.substr(repo_root_path.length); 

    const relative_path_components = pathModule.splitPOSIXPath(relative_path);

    // Check if is valid project
    if ( relative_path_components[0] === "project" ) {
      if (relative_path_components.length === 1) {
        // REPO_PATH , PROJECT_PATH is reserved to project/<project_name>/<id>
        return PathType.REPO_PATH;
      }else if (relative_path_components.length === 2) {
        return PathType.PROJECT_PATH;
      } else if (relative_path_components.length === 3) {
        return PathType.PROJECT_RECORD_PATH;
      }
    } else if( relative_path_components[0] === "user" ) {
      // Check if valid user
      if (relative_path_components.length === 1) {
        // REPO_PATH , PROJECT_PATH is reserved to project/<project_name>/<id>
        return PathType.REPO_PATH;
      }else if (relative_path_components.length === 2) {
        return PathType.USER_PATH;
      }else if (relative_path_components.length === 3) {
        return PathType.USER_RECORD_PATH;
      } 
    }

    return PathType.UNKNOWN;
  }

}


module.exports = { Repo, PathType };
