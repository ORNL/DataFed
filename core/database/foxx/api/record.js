"use strict";

const g_db = require("@arangodb").db;
const g_lib = require("./support");
const { errors } = require("@arangodb");

/**
 * @class Record
 * @brief Represents a record in the database and provides methods to manage it.
 */
class Record {
  // ERROR code
  #error = null;
  // Error message should be a string if defined
  #err_msg = null;
  // Boolean value that determines if the record exists in the database
  #exists = false;
  // location object, determines what the allocation the data item is associated with
  #loc = null;
  // Allocation object, determines what allocation data item is associated with
  #alloc = null;
  // The data key
  #key = null;
  // The data id simply the key prepended with 'd/'
  #data_id = null;

  /**
   * @brief Constructs a Record object and checks if the key exists in the database.
   * @param {string} a_key - The unique identifier for the record.
   */
  constructor(a_key) {
    // Define the collection
    const collection = g_db._collection("d");

    // This function is designed to check if the provided key exists in the
    // database as a record. Searches are only made in the 'd' collection
    //
    // Will return true if it does and false if it does not.
    this.#key = a_key;
    this.#data_id = "d/" + a_key;
    if (a_key) {
      // Check if the document exists
      try {
        if (collection.exists(this.#key)) {
          this.#exists = true;
        } else {
          this.#exists = false;
          this.#error = g_lib.ERR_NOT_FOUND;
          this.#err_msg = "Invalid key: (" + a_key + "). No record found.";
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
   * @brief will create the path to key as it should appear on the repository.
   **/
  _pathToRecord(basePath) {
    return basePath.endsWith("/")
      ? basePath + this.#key
      : basePath + "/" + this.#key;
  }

  /**
   * @brief Compares two paths and if an error is detected will save the error code and message.
   **/
  _comparePaths(storedPath, inputPath) {
    if (storedPath !== inputPath) {
      this.#error = g_lib.ERR_PERM_DENIED;
      this.#err_msg =
        "Record path is not consistent with repo expected path is: " +
        storedPath +
        " attempted path is " +
        inputPath;
      return false;
    }
    return true;
  }

  /**
   * @brief Checks if the record exists in the database.
   * @return {boolean} True if the record exists, otherwise false.
   */
  exists() {
    return this.#exists;
  }

  key() {
    return this.#key;
  }

  id() {
    return this.#data_id;
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
   * @brief Checks if the record is managed by DataFed.
   * @return {boolean} True if managed, otherwise false.
   */
  isManaged() {
    //{
    //    _from: data._id,
    //    _to: repo_alloc._to,
    //    uid: owner_id
    //};
    this.#loc = g_db.loc.firstExample({
      _from: this.#data_id,
    });

    if (!this.#loc) {
      this.#error = g_lib.ERR_PERM_DENIED;
      this.#err_msg =
        "Permission denied data is not managed by DataFed. This can happen if you try to do a transfer directly from Globus.";
      return false;
    }
    this.#alloc = g_db.alloc.firstExample({
      _from: this.#loc.uid,
      _to: this.#loc._to,
    });

    // If alloc is null then will return false if not null will return true.
    return !!this.#alloc;
  }

  /**
   * @brief Validates if the provided record path is consistent with the database.
   * @param {string} a_path - The path to validate.
   * @return {boolean} True if consistent, otherwise false.
   */
  isPathConsistent(a_path) {
    // This function will populate the this.#loc member and the this.#alloc
    // member
    if (!this.isManaged()) {
      return false;
    }

    // If path is missing the starting "/" add it back in
    if (!a_path.startsWith("/") && this.#alloc.path.startsWith("/")) {
      a_path = "/" + a_path;
    }

    // If there is a new repo we need to check the path there and use that
    if (this.#loc.new_repo) {
      // Below we get the allocation associated with data item by
      // 1. Checking if the data item is in flight, is in the process
      // of being moved to a new location or new owner and using that
      // oweners id.
      // 2. Using the loc.uid parameter if not inflight to get the owner
      // id.
      let new_alloc = g_db.alloc.firstExample({
        _from: this.#loc.new_owner ? this.#loc.new_owner : this.#loc.uid,
        _to: this.#loc.new_repo,
      });

      // If no allocation is found for the item thrown an error
      // if the paths do not align also thrown an error.
      if (!new_alloc) {
        this.#error = g_lib.ERR_PERM_DENIED;
        this.#err_msg =
          "Permission denied, '" +
          this.#key +
          "' is not part of an allocation '";
        return false;
      }

      let stored_path = this._pathToRecord(new_alloc.path);

      if (!this._comparePaths(stored_path, a_path)) { return false; }
    } else {
      let stored_path = this._pathToRecord(this.#alloc.path);

      // If there is no new repo check that the paths align
      if (!this._comparePaths(stored_path, a_path)) { return false; }
    }
    return true;
  }
}

module.exports = Record;