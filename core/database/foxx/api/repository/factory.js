"use strict";

const {
    RepositoryType,
    Result,
    createRepository,
    createRepositoryData,
    createGlobusConfig,
} = require("./types");
const { validateGlobusConfig, validateMetadataConfig } = require("./validation");
const globusRepo = require("./globus");
const metadataRepo = require("./metadata");
const g_lib = require("../support");

/**
 * Repository factory using Rust-compatible patterns
 * Uses switch/case for type-based polymorphism instead of inheritance
 */

/**
 * Create repository based on type (similar to Rust match expression)
 * Rust's match expression provides exhaustive pattern matching
 * JavaScript's switch is used here to emulate this pattern
 * @param config
 * @returns {{ok: boolean, error: *}|{ok: boolean, value: *}}
 * @see: https://doc.rust-lang.org/book/ch06-02-match.html
 */
const createRepositoryByType = (config) => {
    // Validate common fields
    if (!config.id || !config.type || !config.title || !config.capacity || !config.admins) {
        return Result.err({
            code: g_lib.ERR_INVALID_PARAM,
            message: "Missing required repository fields",
        });
    }

    /**
     * Type-based creation using switch (Rust match pattern)
     * Each case is like a match arm in Rust, handling a specific variant
     * @see: https://doc.rust-lang.org/book/ch18-03-pattern-syntax.html
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
                domain: config.domain,
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
             * @see: https://doc.rust-lang.org/book/ch06-02-match.html#matching-with-option-t
             */
            return Result.err({
                code: g_lib.ERR_INVALID_PARAM,
                message: `Unknown repository type: ${config.type}`,
            });
    }
};

/**
 * Get repository implementation based on type
 * This emulates Rust's trait object dynamic dispatch
 * @param repositoryType
 * @see: https://doc.rust-lang.org/book/ch17-02-trait-objects.html
 */
const getRepositoryImplementation = (repositoryType) => {
    switch (repositoryType) {
        case RepositoryType.GLOBUS:
            return globusRepo;
        case RepositoryType.METADATA_ONLY:
            return metadataRepo;
        default:
            return null;
    }
};

/**
 * Execute operation on repository using dynamic dispatch
 * This pattern emulates Rust's trait method dispatch
 * @param repository
 * @param operation
 * @param args
 * @returns {{ok: boolean, error: *}|*}
 * @see: https://doc.rust-lang.org/book/ch17-02-trait-objects.html#trait-objects-perform-dynamic-dispatch
 */
const executeRepositoryOperation = (repository, operation, ...args) => {
    const impl = getRepositoryImplementation(repository.type);
    if (!impl) {
        return Result.err({
            code: g_lib.ERR_INVALID_PARAM,
            message: `No implementation for repository type: ${repository.type}`,
        });
    }

    if (typeof impl[operation] !== "function") {
        return Result.err({
            code: g_lib.ERR_NOT_IMPLEMENTED,
            message: `Operation '${operation}' not implemented for type: ${repository.type}`,
        });
    }

    return impl[operation](repository.data, ...args);
};

module.exports = {
    createRepositoryByType,
    getRepositoryImplementation,
    executeRepositoryOperation,
};
