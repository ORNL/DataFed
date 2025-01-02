"use strict";

const g_db = require("@arangodb").db;
const g_lib = require("../support");

class User {
  // ERROR code
  #error = null;
  // Error message should be a string if defined
  #err_msg = null;
  // Boolean value that determines if the user exists in the database
  #exists = false;
  // The user id simply the key prepended with 'u/'
  #user_id = null;
  #user_key = null;

  /**
   * User document
   *
   **/
  #user = null;

  /**
   * @brief Constructs a User object and checks if the key exists in the database.
   * @param {string} a_key or id - The unique identifier for the project, of project key.
   * e.g. can be either
   * u/user_name
   * or
   * user_name
   */
  constructor(a_key) {
    // Define the collection
    const collection = g_db._collection("u");

    // This function is designed to check if the provided key exists in the
    // database. Searches are only made in the 'u' collection
    //
    // Will return true if it does and false if it does not.
    if (a_key && a_key !== "u/" ) {
      if ( a_key.startsWith("u/") ) {
        this.#user_id = a_key;
        this.#user_key = a_key.slice("u/".length);
      } else {user
        this.#user_id = "u/" + a_key;
        this.#user_key = a_key;
      }

      // Check if the user document exists
      try {
        if (collection.exists(this.#user_key)) {
          this.#user = collection.document(this.#user_id);
          this.#exists = true;
        } else {
          this.#exists = false;
          this.#error = g_lib.ERR_NOT_FOUND;
          this.#err_msg = "Invalid key: (" + a_key + "). No user found.";
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
   * @brief Checks if the project exists in the database.
   * @return {boolean} True if the project exists, otherwise false.
   */
  exists() {
    return this.#exists;
  }

  key() {
    return this.#user_key;
  }

  id() {
    return this.#user_id;
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

  getGroupIds() {
    const qry = "FOR edge IN mem FILTER edge._to == @user_id RETURN edge._from"
    const cursor = g_db._query(qry, { user_id: this.#user_id });
    return cursor.toArray();
  }

  getProjectIds() {
    const group_ids = this.getGroupIds();
    const qry = "FOR group IN g FILTER group._id IN @group_ids RETURN DISTINCT group.uid";
    const cursor = g_db._query(qry, { group_ids: group_ids });
    return cursor.toArray();
  }
 
  /**
   * Get all the repos the user has access too.
   **/
  getRepos() { 

    // Grab all projects associated with the user
    const project_ids = getProjectIds();
    const qry = "FOR edge IN alloc FILTER edge._from IN @project_ids RETURN DISTINCT edge._to"
    const cursor = g_db._query(qry, { group_ids: group_ids });
    const project_repos = cursor.toArray();
     
    // Grab the allocations that the user has access too
    const user_allocs = g_db.alloc.byExample({
        _from: this.#user_id
    }).toArray();

    const repo_ids =  [...new Set(allocs.map(obj => obj._to))];
    
    project_repos.forEach(repo => repo_ids.add(item));
    return repo_ids;
  }

}

module.exports = User;


