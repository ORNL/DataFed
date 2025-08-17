"use strict";

const { Result, RepositoryType } = require("./types");
const { executeRepositoryOperation } = require("./factory");
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
const RepositoryOps = {
    // Validate repository configuration
    validate: (repository) => {
        return executeRepositoryOperation(repository, "validate");
    },

    // Create allocation for repository
    createAllocation: (repository, allocationParams) => {
        return executeRepositoryOperation(repository, "createAllocation", allocationParams);
    },

    // Delete allocation from repository
    deleteAllocation: (repository, subjectId) => {
        return executeRepositoryOperation(repository, "deleteAllocation", subjectId);
    },

    // Check if repository supports data operations
    supportsDataOperations: (repository) => {
        return executeRepositoryOperation(repository, "supportsDataOperations");
    },

    // Get repository capacity information
    getCapacityInfo: (repository) => {
        return executeRepositoryOperation(repository, "getCapacityInfo");
    },

    // Save repository to database
    save: (repository) => {
        try {
            const saved = g_db.repo.save(repository.data, { returnNew: true });
            return Result.ok(saved.new);
        } catch (e) {
            return Result.err({
                code: e.errorNum || 500,
                message: e.errorMessage || "Failed to save repository",
            });
        }
    },

    // Update repository in database
    update: (repository, updates) => {
        try {
            // Lazy migration: ensure type field exists when updating
            // If the repository doesn't have a type, add it based on current state
            if (!repository.data.type && !updates.type) {
                updates.type = repository.data.type || RepositoryType.GLOBUS;
            }

            const updated = g_db.repo.update(repository.data._key, updates, { returnNew: true });
            return Result.ok(updated.new);
        } catch (e) {
            return Result.err({
                code: e.errorNum || 500,
                message: e.errorMessage || "Failed to update repository",
            });
        }
    },

    /**
     * Find repository by ID
     * This is an associated function (doesn't take self)
     * @param {string} repoId - Repository ID (with or without "repo/" prefix)
     * @returns {{ok: boolean, error?: *, value?: *}} Result containing repository or error
     * @see https://doc.rust-lang.org/book/ch05-03-method-syntax.html#associated-functions
     */
    find: (repoId) => {
        try {
            const key = repoId.startsWith("repo/") ? repoId.slice(5) : repoId;
            const repo = g_db.repo.document(key);

            // Default to GLOBUS type if missing (backward compatibility)
            // This handles legacy repositories that don't have a type field
            if (!repo.type) {
                repo.type = RepositoryType.GLOBUS;
            }

            // Return as tagged union based on type
            return Result.ok({
                type: repo.type,
                data: repo,
            });
        } catch (e) {
            if (e.errorNum === 1202) {
                // Document not found
                return Result.err({
                    code: 404,
                    message: `Repository not found: ${repoId}`,
                });
            }
            return Result.err({
                code: e.errorNum || 500,
                message: e.errorMessage || "Failed to find repository",
            });
        }
    },

    // List repositories with optional filter
    list: (filter = {}) => {
        try {
            let query = "FOR r IN repo";
            const bindVars = {};

            if (filter.type) {
                query += " FILTER r.type == @type";
                bindVars.type = filter.type;
            }

            if (filter.admin) {
                query += " FILTER @admin IN r.admins";
                bindVars.admin = filter.admin;
            }

            query += " RETURN r";

            const results = g_db._query(query, bindVars).toArray();
            return Result.ok(
                results.map((repo) => ({
                    type: repo.type,
                    data: repo,
                })),
            );
        } catch (e) {
            return Result.err({
                code: e.errorNum || 500,
                message: e.errorMessage || "Failed to list repositories",
            });
        }
    },

    // Check repository permissions
    checkPermission: (repository, userId, permission) => {
        // Simple admin check for now - can be extended
        if (repository.data.admins && repository.data.admins.includes(userId)) {
            return Result.ok(true);
        }
        return Result.ok(false);
    },
};

module.exports = { RepositoryOps };
