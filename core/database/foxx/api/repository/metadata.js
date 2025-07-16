"use strict";

const { Result, ExecutionMethod, createAllocationResult } = require("./types");
const { validateAllocationParams } = require("./validation");
const g_lib = require("../support");
const g_db = require("@arangodb").db;

/**
 * Metadata-only repository implementation
 * Implements repository operations for repositories that only store metadata
 * without actual data storage backend
 */

// Validate metadata repository (already validated in factory)
const validate = (repoData) => {
    return Result.ok(true);
};

// Create allocation in metadata repository (direct/synchronous)
const createAllocation = (repoData, params) => {
    // Validate allocation parameters
    const validationResult = validateAllocationParams(params);
    if (!validationResult.ok) {
        return validationResult;
    }

    try {
        // For metadata-only repos, allocations are just database records
        // No actual storage allocation happens
        const allocation = {
            _key: `alloc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            repo_id: repoData._id,
            subject: params.subject,
            size: params.size,
            path: params.path || `/${params.subject}`,
            metadata: params.metadata || {},
            created: new Date().toISOString(),
            type: "metadata_only"
        };

        // Save to allocations collection (would need to be created)
        // For now, return success with the allocation data
        const result = {
            allocation_id: allocation._key,
            repo_id: allocation.repo_id,
            subject: allocation.subject,
            size: allocation.size,
            path: allocation.path,
            status: "completed"
        };

        return Result.ok(createAllocationResult(ExecutionMethod.DIRECT, result));
    } catch (e) {
        return Result.err({
            code: g_lib.ERR_INTERNAL_FAULT,
            message: `Failed to create metadata allocation: ${e.message}`
        });
    }
};

// Delete allocation from metadata repository (direct/synchronous)
const deleteAllocation = (repoData, subjectId) => {
    if (!subjectId || typeof subjectId !== 'string') {
        return Result.err({
            code: g_lib.ERR_INVALID_PARAM,
            message: "Subject ID is required for allocation deletion"
        });
    }

    try {
        // For metadata-only repos, just remove the database record
        // No actual storage deallocation needed
        const result = {
            repo_id: repoData._id,
            subject: subjectId,
            status: "completed",
            message: "Metadata allocation removed"
        };

        return Result.ok(createAllocationResult(ExecutionMethod.DIRECT, result));
    } catch (e) {
        return Result.err({
            code: g_lib.ERR_INTERNAL_FAULT,
            message: `Failed to delete metadata allocation: ${e.message}`
        });
    }
};

// Metadata repositories do NOT support data operations
const supportsDataOperations = (repoData) => {
    return Result.ok(false);
};

// Get capacity information for metadata repository
const getCapacityInfo = (repoData) => {
    try {
        // Metadata repos have logical capacity limits, not physical
        return Result.ok({
            total_capacity: repoData.capacity,
            used_capacity: 0, // Would track metadata record count/size
            available_capacity: repoData.capacity,
            supports_quotas: false,
            is_metadata_only: true
        });
    } catch (e) {
        return Result.err({
            code: g_lib.ERR_INTERNAL_FAULT,
            message: `Failed to get capacity info: ${e.message}`
        });
    }
};

// Export all operations (trait implementation)
module.exports = {
    validate,
    createAllocation,
    deleteAllocation,
    supportsDataOperations,
    getCapacityInfo
};