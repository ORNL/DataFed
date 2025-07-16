"use strict";

const { Result } = require("./types");
const g_lib = require("../support");
const pathModule = require("../posix_path");

/**
 * Standalone validation functions following Rust patterns
 * Pure functions that return Result types for error handling
 */

// Validate common repository fields
const validateCommonFields = (config) => {
    const errors = [];

    if (!config.id || typeof config.id !== 'string' || config.id.trim() === '') {
        errors.push("Repository ID is required and must be a non-empty string");
    }

    if (!config.title || typeof config.title !== 'string' || config.title.trim() === '') {
        errors.push("Repository title is required and must be a non-empty string");
    }

    if (typeof config.capacity !== 'number' || config.capacity <= 0) {
        errors.push("Repository capacity must be a positive number");
    }

    if (!Array.isArray(config.admins) || config.admins.length === 0) {
        errors.push("Repository must have at least one admin");
    }

    if (errors.length > 0) {
        return Result.err({
            code: g_lib.ERR_INVALID_PARAM,
            message: errors.join("; ")
        });
    }

    return Result.ok(true);
};

// Validate POSIX path format
const validatePOSIXPath = (path, fieldName) => {
    if (!path || typeof path !== 'string') {
        return Result.err({
            code: g_lib.ERR_INVALID_PARAM,
            message: `${fieldName} must be a non-empty string`
        });
    }

    if (!path.startsWith("/")) {
        return Result.err({
            code: g_lib.ERR_INVALID_PARAM,
            message: `${fieldName} must be an absolute path (start with '/')`
        });
    }

    // Check for invalid characters in path
    if (path.includes("..") || path.includes("//")) {
        return Result.err({
            code: g_lib.ERR_INVALID_PARAM,
            message: `${fieldName} contains invalid path sequences`
        });
    }

    return Result.ok(true);
};

// Validate repository path ends with ID
const validateRepositoryPath = (path, repoId) => {
    const pathResult = validatePOSIXPath(path, "Repository path");
    if (!pathResult.ok) {
        return pathResult;
    }

    // Ensure path ends with /
    const normalizedPath = path.endsWith("/") ? path : path + "/";
    
    // Extract last component
    const idx = normalizedPath.lastIndexOf("/", normalizedPath.length - 2);
    const lastComponent = normalizedPath.substr(idx + 1, normalizedPath.length - idx - 2);
    
    if (lastComponent !== repoId) {
        return Result.err({
            code: g_lib.ERR_INVALID_PARAM,
            message: `Repository path must end with repository ID (${repoId})`
        });
    }

    return Result.ok(true);
};

// Validate Globus-specific configuration
const validateGlobusConfig = (config) => {
    const commonResult = validateCommonFields(config);
    if (!commonResult.ok) {
        return commonResult;
    }

    const errors = [];

    // Validate required Globus fields
    if (!config.pub_key || typeof config.pub_key !== 'string') {
        errors.push("Public key is required for Globus repositories");
    }

    if (!config.address || typeof config.address !== 'string') {
        errors.push("Address is required for Globus repositories");
    }

    if (!config.endpoint || typeof config.endpoint !== 'string') {
        errors.push("Endpoint is required for Globus repositories");
    }

    if (!config.domain || typeof config.domain !== 'string') {
        errors.push("Domain is required for Globus repositories");
    }

    if (errors.length > 0) {
        return Result.err({
            code: g_lib.ERR_INVALID_PARAM,
            message: errors.join("; ")
        });
    }

    // Validate repository path
    const pathResult = validateRepositoryPath(config.path, config.id);
    if (!pathResult.ok) {
        return pathResult;
    }

    // Validate export path if provided
    if (config.exp_path) {
        const expPathResult = validatePOSIXPath(config.exp_path, "Export path");
        if (!expPathResult.ok) {
            return expPathResult;
        }
    }

    return Result.ok(true);
};

// Validate metadata-only repository configuration
const validateMetadataConfig = (config) => {
    const commonResult = validateCommonFields(config);
    if (!commonResult.ok) {
        return commonResult;
    }

    // Metadata repositories don't need Globus-specific fields
    // But should not have them either
    const invalidFields = ['pub_key', 'address', 'endpoint', 'path', 'exp_path', 'domain'];
    const presentInvalidFields = invalidFields.filter(field => config[field] !== undefined);
    
    if (presentInvalidFields.length > 0) {
        return Result.err({
            code: g_lib.ERR_INVALID_PARAM,
            message: `Metadata-only repositories should not have: ${presentInvalidFields.join(", ")}`
        });
    }

    return Result.ok(true);
};

// Validate allocation parameters
const validateAllocationParams = (params) => {
    const errors = [];

    if (!params.subject || typeof params.subject !== 'string') {
        errors.push("Allocation subject is required");
    }

    if (typeof params.size !== 'number' || params.size <= 0) {
        errors.push("Allocation size must be a positive number");
    }

    if (params.path && typeof params.path !== 'string') {
        errors.push("Allocation path must be a string if provided");
    }

    if (errors.length > 0) {
        return Result.err({
            code: g_lib.ERR_INVALID_PARAM,
            message: errors.join("; ")
        });
    }

    return Result.ok(true);
};

module.exports = {
    validateCommonFields,
    validatePOSIXPath,
    validateRepositoryPath,
    validateGlobusConfig,
    validateMetadataConfig,
    validateAllocationParams
};