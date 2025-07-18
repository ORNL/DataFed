"use strict";

const { Result } = require("./types");
const { executeRepositoryOperation } = require("./factory");
const g_db = require("@arangodb").db;

/**
 * Trait-like repository operations following Rust patterns
 * All operations take repository as first parameter (like Rust &self)
 * Operations return Result types for error handling
 */

/**
 *
 * @type {{validate: (function(*): {ok: boolean, error: *}|*), createAllocation: (function(*, *): {ok: boolean, error: *}|*), deleteAllocation: (function(*, *): {ok: boolean, error: *}|*), supportsDataOperations: (function(*): {ok: boolean, error: *}|*), getCapacityInfo: (function(*): {ok: boolean, error: *}|*), save: ((function(*): ({ok: boolean, value: *}|undefined))|*), update: ((function(*, *): ({ok: boolean, value: *}|undefined))|*), find: ((function(*): ({ok: boolean, error: *}|{ok: boolean, value: *}))|*), list: ((function({}=): ({ok: boolean, value: *}|undefined))|*), checkPermission: ((function(*, *, *): ({ok: boolean, value: *}))|*)}}
 * @see https://doc.rust-lang.org/book/ch10-02-traits.html
 * Traits define shared behavior in an abstract way
 * @see https://doc.rust-lang.org/book/ch05-03-method-syntax.html
 * The first parameter acts like &self in Rust methods
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
     * @param repoId
     * @returns {{ok: boolean, error: *}|{ok: boolean, value: *}}
     * @see: https://doc.rust-lang.org/book/ch05-03-method-syntax.html#associated-functions
     */
    find: (repoId) => {
        try {
            const key = repoId.startsWith("repo/") ? repoId.slice(5) : repoId;
            const repo = g_db.repo.document(key);

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
