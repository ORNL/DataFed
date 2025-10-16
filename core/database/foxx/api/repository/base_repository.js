"use strict";

const { Result, RepositoryType } = require("./types");
const g_db = require("@arangodb").db;

/**
 * Trait-like repository operations following Rust patterns
 * All operations take repository as first parameter (like Rust &self)
 * Operations return Result types for error handling
 */

/**
 * Repository operations following Rust trait patterns
 * @type {object}
 * @property {function(object): {ok: boolean, error?: *, value?: *}} validate - Validate repository configuration
 * @property {function(object, object): {ok: boolean, error?: *, value?: *}} createAllocation - Create allocation for repository
 * @property {function(object, string): {ok: boolean, error?: *, value?: *}} deleteAllocation - Delete allocation from repository
 * @property {function(object): {ok: boolean, error?: *, value?: *}} supportsDataOperations - Check if repository supports data operations
 * @property {function(object): {ok: boolean, error?: *, value?: *}} getCapacityInfo - Get repository capacity information
 * @property {function(object): {ok: boolean, error?: *, value?: *}} save - Save repository to database
 * @property {function(object, object): {ok: boolean, error?: *, value?: *}} update - Update repository in database
 * @property {function(string): {ok: boolean, error?: *, value?: *}} find - Find repository by ID
 * @property {function(object=): {ok: boolean, error?: *, value?: *}} list - List repositories with optional filter
 * @property {function(object, string, string): {ok: boolean, value: boolean}} checkPermission - Check repository permissions
 * @see https://doc.rust-lang.org/book/ch10-02-traits.html
 * @description Traits define shared behavior in an abstract way
 * @see https://doc.rust-lang.org/book/ch05-03-method-syntax.html
 * @description The first parameter acts like &self in Rust methods
 */
const BaseRepository = {

    constructor(config, typeSpecificConfig) {
      this.repoData = createRepositoryData({
          id: config.id,
          type: config.type,
          title: config.title,
          desc: config.desc,
          capacity: config.capacity,
          admins: config.admins,
          typeSpecific: typeSpecificConfig,
      });
    },
    // Validate repository configuration
    validate: () => {
        return Result.err({
                code: error.ERR_INTERNAL_FAULT,
                message: `BaseRepository - unimplemented validation method called.`,
        });
    },

    // Create allocation for repository
    createAllocation: (allocationParams) => {
        return Result.err({
                code: error.ERR_INTERNAL_FAULT,
                message: `BaseRepository - unimplemented createAllocation method called.`,
        });
    },

    // Delete allocation from repository
    deleteAllocation: (subjectId) => {
        return Result.err({
                code: error.ERR_INTERNAL_FAULT,
                message: `BaseRepository - unimplemented deleteAllocation method called.`,
        });
    },

    // Check if repository supports data operations
    supportsDataOperations: () => {
        return Result.err({
                code: error.ERR_INTERNAL_FAULT,
                message: `BaseRepository - unimplemented supportsDataOperations method called.`,
        });
    },

   // Check if repository supports data operations
    type: () => {
        return Result.err({
                code: error.ERR_INTERNAL_FAULT,
                message: `BaseRepository - unimplemented type method called.`,
        });
    },

    // Get repository capacity information
    getCapacityInfo: () => {
        return Result.err({
                code: error.ERR_INTERNAL_FAULT,
                message: `BaseRepository - unimplemented getCapacity method called.`,
        });
    },

    // Save repository to database
    save: () => {
        try {
            const saved = g_db.repo.save(this.repoData, { returnNew: true });
            return Result.ok(saved.new);
        } catch (e) {
            return Result.err({
                code: e.errorNum || 500,
                message: e.errorMessage || "Failed to save repository",
            });
        }
    },

    // Update repository in database
    update: (updates) => {
        try {
            // Lazy migration: ensure type field exists when updating
            // If the repository doesn't have a type, add it based on current state
            if (!this.repoData.type && !updates.type) {
                updates.type = this.repoData.type || RepositoryType.GLOBUS;
            }

            const updated = g_db.repo.update(this.repoData._key, updates, { returnNew: true });
            return Result.ok(updated.new);
        } catch (e) {
            return Result.err({
                code: e.errorNum || 500,
                message: e.errorMessage || "Failed to update repository",
            });
        }
    },

    // Check repository permissions
    checkPermission: (userId, permission) => {
        console.log("\nINFO - ===== RepositoryOps.checkPermission =====");
        console.log("INFO - Repository ID:", this.repoData.id);
        console.log("INFO - User ID:", userId);
        console.log("INFO - Permission type:", permission);
        console.log("INFO - Repository data.admins:", this.repoData.admins);

        // Check if user is in admins array (if it exists)
        if (this.repoData.admins && this.repoData.admins.includes(userId)) {
            console.log("INFO - User found in repository.data.admins array");
            console.log("INFO - ===== checkPermission: GRANTED (admins array) =====");
            return Result.ok(true);
        }

        // Check for admin edge in the database
        const g_db = require("@arangodb").db;
        const adminEdge = g_db.admin.firstExample({
            _from: this.repoData.id,
            _to: userId,
        });

        if (adminEdge) {
            console.log("INFO - Admin edge found from", this.repoData.id, "to", userId);
            console.log("INFO - ===== checkPermission: GRANTED (admin edge) =====");
            return Result.ok(true);
        }

        // Check if user is system admin
        const userDoc = g_db._document(userId);
        if (userDoc && userDoc.is_admin) {
            console.log("INFO - User is system admin (is_admin: true)");
            console.log("INFO - ===== checkPermission: GRANTED (system admin) =====");
            return Result.ok(true);
        }

        console.log("INFO - No permission found - not in admins array, no admin edge, not system admin");
        console.log("INFO - ===== checkPermission: DENIED =====");
        return Result.ok(false);
    },
};

module.exports = { BaseRepository };
