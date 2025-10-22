"use strict";

const Joi = require("joi");
const { Result } = require("./types");
const error = require("../../lib/error_codes");

// Define error code constant if not available from g_lib
const ERR_INVALID_PARAM = error.ERR_INVALID_PARAM !== undefined ? error.ERR_INVALID_PARAM : 2;
const ERR_INVALID_OPERATION =
    error.ERR_INVALID_OPERATION !== undefined ? error.ERR_INVALID_OPERATION : 400;

/**
 * Pure functions that return Result types for error handling
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
    const schema = Joi.object()
        .keys({
            id: Joi.string()
                .min(1)
                .error((errors) => {
                    errors.forEach((err) => {
                        switch (err.type) {
                            case "string.base":
                                err.message = "Repository ID must be a non-empty string";
                                break;
                        }
                    });
                    return errors;
                }),
             
            title: Joi.string()
                .min(1)
                .error((errors) => {
                    errors.forEach((err) => {
                        switch (err.type) {
                            case "string.base":
                                err.message = "Repository title must be a string";
                                break;
                            case "string.min":
                            case "any.empty":
                                err.message = "Repository title cannot be empty";
                                break;
                        }
                    });
                    return errors;
                }),

            key: Joi.string()
                .max(40)
                .lowercase()
                .regex(/^[a-z0-9_.-]+$/)
                .error((errors) => {
                    errors.forEach((err) => {
                        switch (err.type) {
                            case "string.base":
                                err.message = "Repository key must be a string";
                                break;
                            case "string.empty":
                                err.message = "Repository key is empty";
                                break;
                            case "string.max":
                                err.message = "Repository key cannot be longer than 40 characters";
                                break;
                            case "string.pattern.base":
                                err.message = "Repository key may only contain lowercase letters, numbers, underscores, hyphens and periods.";
                                break;
                        }
                    });
                    return errors;
                }),

            capacity: Joi.number()
                .min(0)
                .error((errors) => {
                    errors.forEach((err) => {
                        switch (err.type) {
                            case "number.base":
                                err.message = "Repository capacity must be a number";
                                break;
                            case "number.min":
                                err.message = "Repository capacity cannot be negative";
                                break;
                        }
                    });
                    return errors;
                }),

            key: Joi.string().optional(),
        })
        .unknown(true); // allow extra fields not explicitly validated

    const { error: joiError, value } = Joi.validate(config, schema, {
        abortEarly: false, // collect all errors
    });

    if (joiError) {
        return Result.err({
            code: error.ERR_INVALID_PARAM,
            message: joiError.details.map((d) => d.message).join("; "),
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

const validateRepoData = (repoData) => {
    if (typeof repoData === "undefined") {
        return Result.err({
            code: ERR_INVALID_PARAM,
            message: "Repo data is undefined.",
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

    if (typeof params.data_limit !== "number") {
        errors.push(
            "Allocation data_limit must be a number, type: " +
                typeof params.data_limit +
                " data_limit: " +
                params.data_limit,
        );
    }

    if (typeof params.rec_limit !== "number") {
        errors.push(
            "Allocation rec_limit must be a number, type: " +
                typeof params.rec_limit +
                " rec_limit: " +
                params.rec_limit,
        );
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

module.exports = {
    validateNonEmptyString,
    validateCommonFields,
    validatePOSIXPath,
    validateRepositoryPath,
    validateAllocationParams,
    validateRepoData,
};
