"use strict";

const { RepositoryType, Result, createAllocationResult } = require("../types");
const { ExecutionMethod } = require("../../../lib/execution_types");
const { BaseRepository } = require("../base_repository.js");
const {
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

        const normalizedConfig = { ...config };
        if (config?.admin && !config?.admins) {
            normalizedConfig.admins = config.admin;
        }

        const result = super(normalizedConfig, globusConfig);
        if (result.ok == false) {
            return result;
        }
        this.repoData = result.value.repoData;

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
        console.log(validationGlobusResult);
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
            const task = g_tasks.taskInitAllocDelete({
                client,
                repo_id: this.repoData.id,
                subject: subject,
            });

            return Result.ok(
                createAllocationResult(ExecutionMethod.TASK, {
                    task_id: task.task_id,
                    status: task.status,
                    queue_time: task.queue_time,
                }),
            );
        } catch (e) {
            return Result.err({
                code: error.ERR_INTERNAL_FAULT,
                message: `Failed to create deletion task: ${e.message}`,
            });
        }
    }

    static validate(config) {
        const globusConfig = createGlobusConfig({
            endpoint: config.endpoint,
            path: config.path,
            pub_key: config.pub_key,
            address: config.address,
            exp_path: config.exp_path,
        });

        // For partial updates, we don't require all fields
        // Only validate the fields that are provided
        const errors = [];

        // Normalize admin/admins field for backward compatibility
        const normalizedConfig = { ...config };
        if (config?.admin && !config?.admins) {
            normalizedConfig.admins = config.admin;
        }

        // Validate provided fields
        if (normalizedConfig.title !== undefined) {
            const titleValidation = validateNonEmptyString(
                normalizedConfig.title,
                "Repository title",
            );
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
            const endpointValidation = validateNonEmptyString(
                normalizedConfig.endpoint,
                "Endpoint",
            );
            if (!endpointValidation.ok) {
                errors.push(endpointValidation.error.message);
            }
        }

        if (normalizedConfig.path !== undefined && normalizedConfig.key) {
            const pathResult = validateRepositoryPath(normalizedConfig.path, normalizedConfig.key);
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
                code: error.ERR_INVALID_PARAM,
                message: errors.join("; "),
            });
        }

        return Result.ok(true);
    }

    // Globus repositories support data operations
    supportsDataOperations() {
        return Result.ok(true);
    }

    // Get capacity information for Globus repository
    getCapacityInfo() {
        try {
            // For Globus repos, we'd typically query the actual filesystem
            // For now, return the configured capacity
            return Result.ok({
                total_capacity: this.repoData.capacity,
                used_capacity: 0, // Would be populated from actual usage
                available_capacity: this.repoData.capacity,
                supports_quotas: true,
            });
        } catch (e) {
            return Result.err({
                code: error.ERR_INTERNAL_FAULT,
                message: `Failed to get capacity info: ${e.message}`,
            });
        }
    }
}

module.exports = {
    GlobusRepo,
};
