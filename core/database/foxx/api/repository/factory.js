"use strict";

const { 
    RepositoryType, 
    Result, 
    createRepository,
    createRepositoryData,
    createGlobusConfig
} = require("./types");
const { validateGlobusConfig, validateMetadataConfig } = require("./validation");
const globusRepo = require("./globus");
const metadataRepo = require("./metadata");
const g_lib = require("../support");

/**
 * Repository factory using Rust-compatible patterns
 * Uses switch/case for type-based polymorphism instead of inheritance
 */

// Create repository based on type (similar to Rust match expression)
const createRepositoryByType = (config) => {
    // Validate common fields
    if (!config.id || !config.type || !config.title || !config.capacity || !config.admins) {
        return Result.err({
            code: g_lib.ERR_INVALID_PARAM,
            message: "Missing required repository fields"
        });
    }

    // Type-based creation using switch (Rust match pattern)
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
                domain: config.domain
            });

            const repoData = createRepositoryData({
                id: config.id,
                type: config.type,
                title: config.title,
                desc: config.desc,
                capacity: config.capacity,
                admins: config.admins,
                typeSpecific: globusConfig
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
                admins: config.admins
            });

            return Result.ok(createRepository(RepositoryType.METADATA_ONLY, repoData));
        }

        default:
            return Result.err({
                code: g_lib.ERR_INVALID_PARAM,
                message: `Unknown repository type: ${config.type}`
            });
    }
};

// Get repository implementation based on type
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

// Execute operation on repository using dynamic dispatch
const executeRepositoryOperation = (repository, operation, ...args) => {
    const impl = getRepositoryImplementation(repository.type);
    if (!impl) {
        return Result.err({
            code: g_lib.ERR_INVALID_PARAM,
            message: `No implementation for repository type: ${repository.type}`
        });
    }

    if (typeof impl[operation] !== 'function') {
        return Result.err({
            code: g_lib.ERR_NOT_IMPLEMENTED,
            message: `Operation '${operation}' not implemented for type: ${repository.type}`
        });
    }

    return impl[operation](repository.data, ...args);
};

module.exports = {
    createRepositoryByType,
    getRepositoryImplementation,
    executeRepositoryOperation
};