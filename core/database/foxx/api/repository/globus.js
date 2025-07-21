"use strict";

const { Result, ExecutionMethod, createAllocationResult } = require("./types");
const { validateAllocationParams } = require("./validation");
const g_tasks = require("../tasks");
const g_lib = require("../support");

/**
 * @module globus
 * Globus repository implementation
 * Implements repository operations specific to Globus-backed repositories
 */

/**
 * This module acts like a trait implementation for the Globus repository type
 * Each function implements a trait method for this specific type
 * @see https://doc.rust-lang.org/book/ch10-02-traits.html#implementing-a-trait-on-a-type
 */

// Validate Globus repository (already validated in factory)
const validate = (repoData) => {
    return Result.ok(true);
};

// Create allocation in Globus repository (async via task)
const createAllocation = (repoData, params) => {
    // Validate allocation parameters
    const validationResult = validateAllocationParams(params);
    if (!validationResult.ok) {
        return validationResult;
    }

    try {
        // Create task for async Globus allocation
        const task = g_tasks.repoAllocationCreateTask({
            repo_id: repoData._id,
            subject: params.subject,
            size: params.size,
            path: params.path || null,
            metadata: params.metadata || {},
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
            code: g_lib.ERR_INTERNAL_FAULT,
            message: `Failed to create allocation task: ${e.message}`,
        });
    }
};

// Delete allocation from Globus repository (async via task)
const deleteAllocation = (repoData, subjectId) => {
    if (!subjectId || typeof subjectId !== "string") {
        return Result.err({
            code: g_lib.ERR_INVALID_PARAM,
            message: "Subject ID is required for allocation deletion",
        });
    }

    try {
        // Create task for async Globus allocation deletion
        const task = g_tasks.repoAllocationDeleteTask({
            repo_id: repoData._id,
            subject: subjectId,
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
            code: g_lib.ERR_INTERNAL_FAULT,
            message: `Failed to create deletion task: ${e.message}`,
        });
    }
};

// Globus repositories support data operations
const supportsDataOperations = (repoData) => {
    return Result.ok(true);
};

// Get capacity information for Globus repository
const getCapacityInfo = (repoData) => {
    try {
        // For Globus repos, we'd typically query the actual filesystem
        // For now, return the configured capacity
        return Result.ok({
            total_capacity: repoData.capacity,
            used_capacity: 0, // Would be populated from actual usage
            available_capacity: repoData.capacity,
            supports_quotas: true,
        });
    } catch (e) {
        return Result.err({
            code: g_lib.ERR_INTERNAL_FAULT,
            message: `Failed to get capacity info: ${e.message}`,
        });
    }
};

/**
 * Export all operations (trait implementation)
 * These exports define the trait implementation for Globus repository type
 * allowing polymorphic behavior through dynamic dispatch
 * @type {Object}
 * @property {function(Object): {ok: boolean, value: boolean}} validate - Validate Globus repository
 * @property {function(Object, Object): {ok: boolean, error?: *, value?: *}} createAllocation - Create allocation in Globus repository
 * @property {function(Object, string): {ok: boolean, error?: *, value?: *}} deleteAllocation - Delete allocation from Globus repository
 * @property {function(Object): {ok: boolean, value: boolean}} supportsDataOperations - Check if supports data operations
 * @property {function(Object): {ok: boolean, error?: *, value?: *}} getCapacityInfo - Get capacity information
 * @see https://doc.rust-lang.org/book/ch17-02-trait-objects.html
 */
module.exports = {
    validate,
    createAllocation,
    deleteAllocation,
    supportsDataOperations,
    getCapacityInfo,
};
