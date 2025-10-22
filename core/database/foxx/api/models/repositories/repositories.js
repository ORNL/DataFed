"use strict";

const {
    RepositoryType,
    createRepository,
    createRepositoryData,
    createGlobusConfig,
} = require("./types");
const { GlobusRepo } = require("./repository/globus");
const { MetadataRepo } = require("./repository/metadata");
const error = require("../../lib/error_codes");
const { Result } = require("../../lib/result");

/**
 * Create repository based on type
 *
 * @param {object} config - Repository configuration object
 * @param {string} config.id - Repository ID
 * @param {string} config.type - Repository type (from RepositoryType enum)
 * @param {string} config.title - Repository title
 * @param {string} config.desc - Repository description
 * @param {number} config.capacity - Storage capacity in bytes
 * @param {string} config.endpoint - Globus endpoint (required for GLOBUS type)
 * @param {string} config.path - File path (required for GLOBUS type)
 * @param {string} config.pub_key - Public key for ZeroMQ CURVE authentication (required for GLOBUS type)
 * @param {string} config.address - Network address (required for GLOBUS type)
 * @param {string} config.exp_path - Export path (optional for GLOBUS type)
 * @returns {{ok: boolean, error: *}|{ok: boolean, value: *}} Result object containing repository or error
 */
class Repositories {
    static createRepositoryByType = (config) => {
        const missingFields = [];
        if (!("type" in config)) missingFields.push("type");
        if (!("title" in config)) missingFields.push("title");
        if (!("capacity" in config)) missingFields.push("capacity");

        if (missingFields.length > 0) {
            return Result.err({
                code: error.ERR_INVALID_PARAM,
                message: `Missing required repository fields: ${missingFields.join(", ")}`,
            });
        }
        console.log("Creating by type 1");
        /**
         * Type-based creation using switch (Rust match pattern)
         */
        switch (config.type) {
            case RepositoryType.GLOBUS: {
                console.log("Creating by type GLOBUS");
                return new GlobusRepo(config);
            }

            case RepositoryType.METADATA: {
                console.log("Creating by type METADATA");
                return new MetadataRepo(config);
            }

            default:
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
     */
    static find(repoId) {
        try {
            const key = repoId.startsWith("repo/") ? repoId.slice(5) : repoId;
            const repo = g_db.repo.document(key);

            // Default to GLOBUS type if missing (backward compatibility)
            // This handles legacy repositories that don't have a type field
            repo.type ??= RepositoryType.GLOBUS;

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
    }

    // List repositories with optional filter
    static list(filter = {}) {
        try {
            let query = "FOR r IN repo";
            const bindVars = {};

            if (filter.type) {
                query += " FILTER r.type == @type";
                bindVars.type = filter.type;
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
    }
}

module.exports = {
    Repositories,
};
