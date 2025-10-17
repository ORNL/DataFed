"use strict";

const {
    RepositoryType,
    Result,
    createRepository,
    createRepositoryData,
    createGlobusConfig,
} = require("./types");
const { validateGlobusConfig, validateMetadataConfig } = require("./validation");
const globusRepo = require("./repository/globus");
const metadataRepo = require("./repository/metadata");
const error = require("../lib/error_codes");

/**
 * Repository factory using Rust-compatible patterns
 * Uses switch/case for type-based polymorphism instead of inheritance
 */

/**
 * Create repository based on type (similar to Rust match expression)
 * Rust's match expression provides exhaustive pattern matching
 * JavaScript's switch is used here to emulate this pattern
 * @param {object} config - Repository configuration object
 * @param {string} config.id - Repository ID
 * @param {string} config.type - Repository type (from RepositoryType enum)
 * @param {string} config.title - Repository title
 * @param {string} [config.desc] - Repository description
 * @param {number} config.capacity - Storage capacity in bytes
 * @param {string[]} config.admins - Array of admin user IDs
 * @param {string} [config.endpoint] - Globus endpoint (required for GLOBUS type)
 * @param {string} [config.path] - File path (required for GLOBUS type)
 * @param {string} [config.pub_key] - Public key for ZeroMQ CURVE authentication (required for GLOBUS type)
 * @param {string} [config.address] - Network address (required for GLOBUS type)
 * @param {string} [config.exp_path] - Export path (optional for GLOBUS type)
 * @returns {{ok: boolean, error: *}|{ok: boolean, value: *}} Result object containing repository or error
 * @see https://doc.rust-lang.org/book/ch06-02-match.html
 */
class Repositories {

  createRepositoryByType = (config) => {
    const missingFields = [];
    console.log(config);
    if (!("id" in config)) missingFields.push("id");
    if (!("type" in config)) missingFields.push("type");
    if (!("title" in config)) missingFields.push("title");
    if (!("capacity" in config)) missingFields.push("capacity");
    if (!("admins" in config)) missingFields.push("admins");

    if (missingFields.length > 0) {
        return Result.err({
            code: error.ERR_INVALID_PARAM,
            message: `Missing required repository fields: ${missingFields.join(", ")}`,
        });
    }
    /**
     * Type-based creation using switch (Rust match pattern)
     * Each case is like a match arm in Rust, handling a specific variant
     * @see https://doc.rust-lang.org/book/ch18-03-pattern-syntax.html
     */
    switch (config.type) {
        case RepositoryType.GLOBUS: {
            const validationResult = validateGlobusConfig(config);
            if (!validationResult.ok) {
                return validationResult;
            }

            const globusConfig = createGlobusConfig({
                endpoint: config.endpoint,
                path: config.path,
                pub_key: config.pub_key,
                address: config.address,
                exp_path: config.exp_path,
            });

            const repoData = createRepositoryData({
                id: config.id,
                type: config.type,
                title: config.title,
                desc: config.desc,
                capacity: config.capacity,
                admins: config.admins,
                typeSpecific: globusConfig,
            });

            return Result.ok(createRepository(RepositoryType.GLOBUS, repoData));
        }

        case RepositoryType.METADATA_ONLY: {
            const validationResult = validateMetadataConfig(config);
            if (!validationResult.ok) {
                return validationResult;
            }

            const repoData = createRepositoryData({
                id: config.id,
                type: config.type,
                title: config.title,
                desc: config.desc,
                capacity: config.capacity,
                admins: config.admins,
            });

            return Result.ok(createRepository(RepositoryType.METADATA_ONLY, repoData));
        }

        default:
            /**
             * In Rust, match must be exhaustive - all cases must be handled
             * The default case ensures we handle unknown variants
             * @see https://doc.rust-lang.org/book/ch06-02-match.html#matching-with-option-t
             */
            return Result.err({
                code: error.ERR_INVALID_PARAM,
                message: `Unknown repository type: ${config.type}`,
            });
    }
};


    /**
     * Find repository by ID
     * This is an associated function (doesn't take self)
     * @param {string} repoId - Repository ID (with or without "repo/" prefix)
     * @returns {{ok: boolean, error?: *, value?: *}} Result containing repository or error
     * @see https://doc.rust-lang.org/book/ch05-03-method-syntax.html#associated-functions
     */
const find = (repoId) => {
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
                id: repo._id, // Add id at top level for easy access
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
const list = (filter = {}) => {
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

}

/**
 * Get repository implementation based on type
 * This emulates Rust's trait object dynamic dispatch
 * @param {string} repositoryType - Repository type from RepositoryType enum
 * @returns {object|null} Repository implementation object or null if not found
 * @see https://doc.rust-lang.org/book/ch17-02-trait-objects.html
 */
//const getRepositoryImplementation = (repositoryType) => {
//    switch (repositoryType) {
//        case RepositoryType.GLOBUS:
//            return globusRepo;
//        case RepositoryType.METADATA_ONLY:
//            return metadataRepo;
//        default:
//            return null;
//    }
//};
//}
/**
 * Execute operation on repository using dynamic dispatch
 * This pattern emulates Rust's trait method dispatch
 * @param {object} repository - Repository object with type and data fields
 * @param {string} operation - Operation name to execute
 * @param {...*} args - Additional arguments to pass to the operation
 * @returns {{ok: boolean, error: *}|*} Result of the operation
 * @see https://doc.rust-lang.org/book/ch17-02-trait-objects.html#trait-objects-perform-dynamic-dispatch
 */
//const executeRepositoryOperation = (repository, operation, ...args) => {
//    const impl = getRepositoryImplementation(repository.type);
//    if (!impl) {
//        return Result.err({
//            code: error.ERR_INVALID_PARAM,
//            message: `No implementation for repository type: ${repository.type}`,
//        });
//    }
//
//    if (typeof impl[operation] !== "function") {
//        return Result.err({
//            code: error.ERR_NOT_IMPLEMENTED,
//            message: `Operation '${operation}' not implemented for type: ${repository.type}`,
//        });
//    }
//
//    return impl[operation](repository.data, ...args);
//};

module.exports = {
    Repositories
};
