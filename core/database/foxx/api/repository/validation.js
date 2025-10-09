"use strict";

const { Result } = require("./types");
const error = require("../lib/error_codes");

// Define error code constant if not available from g_lib
const ERR_INVALID_PARAM = error.ERR_INVALID_PARAM !== undefined ? error.ERR_INVALID_PARAM : 2;
const ERR_INVALID_OPERATION =
    error.ERR_INVALID_OPERATION !== undefined ? error.ERR_INVALID_OPERATION : 400;

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
            code: ERR_INVALID_PARAM,
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

    // Check for both 'admin' and 'admins' fields for backward compatibility
    const adminField = config.admins || config.admin;
    if (!Array.isArray(adminField) || adminField.length === 0) {
        errors.push("Repository must have at least one admin");
    }

    if (errors.length > 0) {
        // See: https://doc.rust-lang.org/book/ch09-02-recoverable-errors-with-result.html#propagating-errors
        // Early return with error - similar to Rust's ? operator
        return Result.err({
            code: ERR_INVALID_PARAM,
            message: errors.join("; "),
        });
    }

    return Result.ok(true);
};

// Validate POSIX path format
const validatePOSIXPath = (path, fieldName) => {
    if (!path || typeof path !== "string") {
        return Result.err({
            code: ERR_INVALID_PARAM,
            message: `${fieldName} must be a non-empty string`,
        });
    }

    if (!path.startsWith("/")) {
        return Result.err({
            code: ERR_INVALID_PARAM,
            message: `${fieldName} must be an absolute path (start with '/')`,
        });
    }

    // Check for invalid characters in path
    if (path.includes("..") || path.includes("//")) {
        return Result.err({
            code: ERR_INVALID_PARAM,
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
            code: ERR_INVALID_PARAM,
            message: `Repository path must end with repository ID (${repoId})`,
        });
    }

    return Result.ok(true);
};

// Validate Globus-specific configuration
const validateGlobusConfig = (config) => {
    // Normalize admin/admins field for backward compatibility
    const normalizedConfig = { ...config };
    if (config.admin && !config.admins) {
        normalizedConfig.admins = config.admin;
    }

    const commonResult = validateCommonFields(normalizedConfig);
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

    if (errors.length > 0) {
        return Result.err({
            code: ERR_INVALID_PARAM,
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
    // Normalize admin/admins field for backward compatibility
    const normalizedConfig = { ...config };
    if (config.admin && !config.admins) {
        normalizedConfig.admins = config.admin;
    }

    const commonResult = validateCommonFields(normalizedConfig);
    if (!commonResult.ok) {
        return commonResult;
    }

    // Metadata repositories don't need Globus-specific fields
    // But should not have them either
    const invalidFields = ["pub_key", "address", "endpoint", "path", "exp_path"];
    const presentInvalidFields = invalidFields.filter((field) => config[field] !== undefined);

    if (presentInvalidFields.length > 0) {
        return Result.err({
            code: ERR_INVALID_PARAM,
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
            code: ERR_INVALID_PARAM,
            message: errors.join("; "),
        });
    }

    return Result.ok(true);
};

// Validate partial Globus configuration (for updates)
const validatePartialGlobusConfig = (config, repoId) => {
    // For partial updates, we don't require all fields
    // Only validate the fields that are provided
    const errors = [];

    // Normalize admin/admins field for backward compatibility
    const normalizedConfig = { ...config };
    if (config.admin && !config.admins) {
        normalizedConfig.admins = config.admin;
    }

    // Validate provided fields
    if (normalizedConfig.title !== undefined) {
        const titleValidation = validateNonEmptyString(normalizedConfig.title, "Repository title");
        if (!titleValidation.ok) {
            errors.push(titleValidation.error.message);
        }
    }

    if (normalizedConfig.capacity !== undefined) {
        if (typeof normalizedConfig.capacity !== "number" || normalizedConfig.capacity <= 0) {
            errors.push("Repository capacity must be a positive number");
        }
    }

    if (normalizedConfig.admins !== undefined) {
        if (!Array.isArray(normalizedConfig.admins) || normalizedConfig.admins.length === 0) {
            errors.push("Repository must have at least one admin");
        }
    }

    if (normalizedConfig.pub_key !== undefined) {
        const pubKeyValidation = validateNonEmptyString(normalizedConfig.pub_key, "Public key");
        if (!pubKeyValidation.ok) {
            errors.push(pubKeyValidation.error.message);
        }
    }

    if (normalizedConfig.address !== undefined) {
        const addressValidation = validateNonEmptyString(normalizedConfig.address, "Address");
        if (!addressValidation.ok) {
            errors.push(addressValidation.error.message);
        }
    }

    if (normalizedConfig.endpoint !== undefined) {
        const endpointValidation = validateNonEmptyString(normalizedConfig.endpoint, "Endpoint");
        if (!endpointValidation.ok) {
            errors.push(endpointValidation.error.message);
        }
    }

    if (normalizedConfig.path !== undefined && repoId) {
        const pathResult = validateRepositoryPath(normalizedConfig.path, repoId);
        if (!pathResult.ok) {
            return pathResult;
        }
    }

    if (normalizedConfig.exp_path !== undefined) {
        const expPathResult = validatePOSIXPath(normalizedConfig.exp_path, "Export path");
        if (!expPathResult.ok) {
            return expPathResult;
        }
    }

    if (errors.length > 0) {
        return Result.err({
            code: ERR_INVALID_PARAM,
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
    validatePartialGlobusConfig,
    validateMetadataConfig,
    validateAllocationParams,
};
