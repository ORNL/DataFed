"use strict";

const { Result } = require("./types");
const g_lib = require("../support");

/**
 * Standalone validation functions following Rust patterns
 * Pure functions that return Result types for error handling
 *
 * See: https://doc.rust-lang.org/book/ch03-03-how-functions-work.html
 * Functions in Rust are expressions that can return values
 *
 * See: https://doc.rust-lang.org/book/ch09-00-error-handling.html
 * Rust emphasizes explicit error handling through Result types
 */

// Validate that a value is a non-empty string
// Reusable helper following DRY principle
const validateNonEmptyString = (value, fieldName) => {
    if (!value || typeof value !== "string" || value.trim() === "") {
        return Result.err({
            code: g_lib.ERR_INVALID_PARAM,
            message: `${fieldName} is required and must be a non-empty string`,
        });
    }
    return Result.ok(true);
};

// Validate common repository fields
// Pure function - no side effects, deterministic output
const validateCommonFields = (config) => {
    const errors = [];

    const idValidation = validateNonEmptyString(config.id, "Repository ID");
    if (!idValidation.ok) {
        errors.push(idValidation.error.message);
    }

    const titleValidation = validateNonEmptyString(config.title, "Repository title");
    if (!titleValidation.ok) {
        errors.push(titleValidation.error.message);
    }

    if (typeof config.capacity !== "number" || config.capacity <= 0) {
        errors.push("Repository capacity must be a positive number");
    }

    if (!Array.isArray(config.admins) || config.admins.length === 0) {
        errors.push("Repository must have at least one admin");
    }

    if (errors.length > 0) {
        // See: https://doc.rust-lang.org/book/ch09-02-recoverable-errors-with-result.html#propagating-errors
        // Early return with error - similar to Rust's ? operator
        return Result.err({
            code: g_lib.ERR_INVALID_PARAM,
            message: errors.join("; "),
        });
    }

    return Result.ok(true);
};

// Validate POSIX path format
const validatePOSIXPath = (path, fieldName) => {
    if (!path || typeof path !== "string") {
        return Result.err({
            code: g_lib.ERR_INVALID_PARAM,
            message: `${fieldName} must be a non-empty string`,
        });
    }

    if (!path.startsWith("/")) {
        return Result.err({
            code: g_lib.ERR_INVALID_PARAM,
            message: `${fieldName} must be an absolute path (start with '/')`,
        });
    }

    // Check for invalid characters in path
    if (path.includes("..") || path.includes("//")) {
        return Result.err({
            code: g_lib.ERR_INVALID_PARAM,
            message: `${fieldName} contains invalid path sequences`,
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
    const lastComponent = normalizedPath.slice(idx + 1, normalizedPath.length - 1);

    if (lastComponent !== repoId) {
        return Result.err({
            code: g_lib.ERR_INVALID_PARAM,
            message: `Repository path must end with repository ID (${repoId})`,
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
    const pubKeyValidation = validateNonEmptyString(config.pub_key, "Public key");
    if (!pubKeyValidation.ok) {
        errors.push(pubKeyValidation.error.message);
    }

    const addressValidation = validateNonEmptyString(config.address, "Address");
    if (!addressValidation.ok) {
        errors.push(addressValidation.error.message);
    }

    const endpointValidation = validateNonEmptyString(config.endpoint, "Endpoint");
    if (!endpointValidation.ok) {
        errors.push(endpointValidation.error.message);
    }

    const domainValidation = validateNonEmptyString(config.domain, "Domain");
    if (!domainValidation.ok) {
        errors.push(domainValidation.error.message);
    }

    if (errors.length > 0) {
        return Result.err({
            code: g_lib.ERR_INVALID_PARAM,
            message: errors.join("; "),
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
    const invalidFields = ["pub_key", "address", "endpoint", "path", "exp_path", "domain"];
    const presentInvalidFields = invalidFields.filter((field) => config[field] !== undefined);

    if (presentInvalidFields.length > 0) {
        return Result.err({
            code: g_lib.ERR_INVALID_PARAM,
            message: `Metadata-only repositories should not have: ${presentInvalidFields.join(", ")}`,
        });
    }

    return Result.ok(true);
};

// Validate allocation parameters
const validateAllocationParams = (params) => {
    const errors = [];

    const subjectValidation = validateNonEmptyString(params.subject, "Allocation subject");
    if (!subjectValidation.ok) {
        errors.push(subjectValidation.error.message);
    }

    if (typeof params.size !== "number" || params.size <= 0) {
        errors.push("Allocation size must be a positive number");
    }

    if (params.path && typeof params.path !== "string") {
        errors.push("Allocation path must be a string if provided");
    }

    if (errors.length > 0) {
        return Result.err({
            code: g_lib.ERR_INVALID_PARAM,
            message: errors.join("; "),
        });
    }

    return Result.ok(true);
};

// Validate partial Globus configuration for updates
const validatePartialGlobusConfig = (config, repoId) => {
    const errors = [];

    // Validate individual fields if provided
    if (config.title !== undefined) {
        const titleValidation = validateNonEmptyString(config.title, "Repository title");
        if (!titleValidation.ok) {
            errors.push(titleValidation.error.message);
        }
    }

    if (config.capacity !== undefined) {
        if (typeof config.capacity !== "number" || config.capacity <= 0) {
            errors.push("Repository capacity must be a positive number");
        }
    }

    if (config.pub_key !== undefined) {
        const pubKeyValidation = validateNonEmptyString(config.pub_key, "Public key");
        if (!pubKeyValidation.ok) {
            errors.push(pubKeyValidation.error.message);
        }
    }

    if (config.address !== undefined) {
        const addressValidation = validateNonEmptyString(config.address, "Address");
        if (!addressValidation.ok) {
            errors.push(addressValidation.error.message);
        }
    }

    if (config.endpoint !== undefined) {
        const endpointValidation = validateNonEmptyString(config.endpoint, "Endpoint");
        if (!endpointValidation.ok) {
            errors.push(endpointValidation.error.message);
        }
    }

    if (config.domain !== undefined) {
        const domainValidation = validateNonEmptyString(config.domain, "Domain");
        if (!domainValidation.ok) {
            errors.push(domainValidation.error.message);
        }
    }

    if (config.path !== undefined) {
        const pathResult = validateRepositoryPath(config.path, repoId);
        if (!pathResult.ok) {
            return pathResult;
        }
    }

    if (config.exp_path !== undefined) {
        const expPathResult = validatePOSIXPath(config.exp_path, "Export path");
        if (!expPathResult.ok) {
            return expPathResult;
        }
    }

    if (config.admins !== undefined) {
        if (!Array.isArray(config.admins) || config.admins.length === 0) {
            errors.push("Repository must have at least one admin");
        }
    }

    if (errors.length > 0) {
        return Result.err({
            code: g_lib.ERR_INVALID_PARAM,
            message: errors.join("; "),
        });
    }

    return Result.ok(true);
};

module.exports = {
    validateNonEmptyString,
    validateCommonFields,
    validatePOSIXPath,
    validateRepositoryPath,
    validateGlobusConfig,
    validateMetadataConfig,
    validateAllocationParams,
    validatePartialGlobusConfig,
};
