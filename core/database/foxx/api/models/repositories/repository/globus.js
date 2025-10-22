"use strict";

const Joi = require("joi");
const { RepositoryType, Result, createAllocationResult } = require("../types");
const { ExecutionMethod } = require("../../../lib/execution_types");
const { BaseRepository } = require("../base_repository");
const {
    validateCommonFields,
    validateAllocationParams,
    validateNonEmptyString,
    validateRepositoryPath,
    validatePOSIXPath,
} = require("../validation");
const g_tasks = require("../../../tasks");
const error = require("../../../lib/error_codes");

/**
 * Globus-specific configuration
 * @param {object} config - Globus configuration object
 * @param {string} config.endpoint - Globus endpoint identifier
 * @param {string} config.path - Repository path on filesystem
 * @param {string} config.pub_key - Public key for ZeroMQ CURVE authentication
 * @param {string} config.address - Network address
 * @param {string} [config.exp_path] - Export path
 * @returns {{endpoint: string, path: string, pub_key: string, address: string, exp_path: string }} Globus configuration object
 */
const createGlobusConfig = ({ endpoint, path, pub_key, address, exp_path }) => ({
    endpoint,
    path,
    pub_key,
    address,
    exp_path,
});

/**
 * @module globus
 * Globus repository implementation
 * Implements repository operations specific to Globus-backed repositories
 **/

const validatePartialGlobusAllocationParams = (params) => {
    if (params.data_limit <= 0) {
        return Result.err({
            code: error.ERR_INVALID_PARAM,
            message:
                "Allocation data_limit must be a positive number data_limit: " + params.data_limit,
        });
    }
    return Result.ok(true);
};

// Create allocation in Globus repository (async via task)
//
// Expectation
//
// params = {
//   "client": {
//     "_id": "u/bob",
//     "is_admin": false
//   },
//   "subject": "u/tim",
//   "data_limit": 100000,
//   "rec_limit": 20000,
//
// }
//
class GlobusRepo extends BaseRepository {
    constructor(config) {
        const config_result = GlobusRepo.validate(config);
        if (config_result.ok == false) {
            return config_result;
        }

        const globusConfig = createGlobusConfig({
            endpoint: config.endpoint,
            path: config.path,
            pub_key: config.pub_key,
            address: config.address,
            exp_path: config.exp_path,
        });

        const result = super(config, globusConfig);
        if (result.ok == false) {
            return result;
        }
        this.repoData = result.value.repoData;

        console.log("repoData after calling super");
        console.log(this.repoData);
        return Result.ok(this.value);
    }

    type() {
        return RepositoryType.GLOBUS;
    }

    createAllocation(params) {
        // Validate allocation parameters
        const validationResult = validateAllocationParams(params);
        if (!validationResult.ok) {
            return validationResult;
        }

        const validationGlobusResult = validatePartialGlobusAllocationParams(params);
        if (!validationGlobusResult.ok) {
            return validationGlobusResult;
        }

        try {
            // Create task for async Globus allocation
            // Note: taskInitAllocCreate expects (client, repo_id, subject_id, data_limit, rec_limit)

            // params.client must contain _id, and is_admin members
            const taskResult = g_tasks.taskInitAllocCreate(
                params.client,
                this.repoData.id,
                params.subject,
                params.size || params.data_limit, // Handle both parameter names
                params.rec_limit || 1000000, // Default to 1M records if not specified
            );

            // The taskResult contains { task: taskObject }
            // We need to return the task properties that the web service expects
            const task = taskResult.task;

            // Return a structure that matches what the original API expects
            // The web service needs properties like state, task_id, status, etc.
            return Result.ok({
                id: `alloc/${Date.now()}`, // Temporary allocation ID format
                repo_id: this.repoData.id,
                subject: params.subject,
                task_id: task._id,
                status: task.status,
                state: task.state, // Important: include the state property
                queue_time: task.ct || Date.now(),
            });
        } catch (e) {
            // Handle both Error objects and array-style errors
            const errorMessage = e.message || (Array.isArray(e) && e[1]) || String(e);
            return Result.err({
                code: error.ERR_INTERNAL_FAULT,
                message: `Failed to create allocation task: ${errorMessage}`,
            });
        }
    }

    // Delete allocation from Globus repository (async via task)
    deleteAllocation(client, subject) {
        if (!subject || typeof subject !== "string") {
            return Result.err({
                code: error.ERR_INVALID_PARAM,
                message: "Subject ID is required for allocation deletion",
            });
        }

        try {
            // Create task for async Globus allocation deletion
            const task_result = g_tasks.taskInitAllocDelete(client, this.repoData.id, subject);

            return Result.ok(createAllocationResult(ExecutionMethod.DEFERRED, task_result.task));
        } catch (e) {
            const errorMessage = e.message || (Array.isArray(e) && e[1]) || String(e);
            return Result.err({
                code: error.ERR_INTERNAL_FAULT,
                message: `Failed to create allocation task: ${errorMessage}`,
            });
        }
    }

    static validate(config) {
        if (config == null) {
            return Result.err({
                code: error.ERR_INVALID_PARAM,
                message: "Unable to validate globus repo config 'null' config provided.",
            });
        }
        // For partial updates, we don't require all fields
        // Only validate the fields that are provided
        const errors = [];

        const commonResult = validateCommonFields(config);
        if (!commonResult.ok) {
            return commonResult;
        }

        // Define Joi schema using old-style .error() message customization
        const schema = Joi.object()
            .keys({
                pub_key: Joi.string()
                    .min(1)
                    .error((errors) => {
                        errors.forEach((err) => {
                            switch (err.type) {
                                case "string.base":
                                    err.message = "Public key must be a string";
                                    break;
                                case "string.min":
                                case "any.empty":
                                    err.message = "Public key cannot be empty";
                                    break;
                            }
                        });
                        return errors;
                    }),

                address: Joi.string()
                    .min(1)
                    .error((errors) => {
                        errors.forEach((err) => {
                            switch (err.type) {
                                case "string.base":
                                    err.message = "Address must be a string";
                                    break;
                                case "string.min":
                                case "any.empty":
                                    err.message = "Address cannot be empty";
                                    break;
                            }
                        });
                        return errors;
                    }),

                endpoint: Joi.string()
                    .min(1)
                    .error((errors) => {
                        errors.forEach((err) => {
                            switch (err.type) {
                                case "string.base":
                                    err.message = "Endpoint must be a string";
                                    break;
                                case "string.min":
                                case "any.empty":
                                    err.message = "Endpoint cannot be empty";
                                    break;
                            }
                        });
                        return errors;
                    }),

                path: Joi.string().optional(),
                exp_path: Joi.string().optional(),
            })
            .unknown(true); // allow extra fields not explicitly validated

        // Validate
        const { error: joiError, value } = Joi.validate(config, schema, {
            abortEarly: false, // collect all errors
        });

        if (joiError) {
            return Result.err({
                code: error.ERR_INVALID_PARAM,
                message: joiError.details.map((d) => d.message).join("; "),
            });
        }

        // Perform additional custom validations (that require multiple fields)
        if (config.path !== undefined && config.key) {
            const pathResult = validateRepositoryPath(config.path, config.key);
            if (!pathResult.ok) {
                return pathResult;
            }
        }

        return Result.ok(true);
    }

    // Globus repositories support data operations
    supportsDataOperations() {
        return Result.ok(true);
    }
}

module.exports = {
    GlobusRepo,
};
