"use strict";

const { Result, createAllocationResult } = require("./types");
const { ExecutionMethod } = require("../lib/execution_types");
const { validateAllocationParams, validateRepoData } = require("./validation");
const error = require("../lib/error_codes");
const permissions = require("../lib/permissions");
const g_db = require("@arangodb").db;

/**
 * @module metadata
 * @description Metadata-only repository implementation
 * Implements repository operations for repositories that only store metadata without actual data storage backend
 */

/**
 * This module provides a different trait implementation for metadata repositories
 * demonstrating how the same trait can have different implementations per type
 * @see https://doc.rust-lang.org/book/ch10-02-traits.html#implementing-a-trait-on-a-type
 */

// Validate metadata repository (already validated in factory)
const validate = (repoData) => {
    return Result.ok(true);
};

// Create allocation in metadata repository (direct/synchronous)
// NOTE: We do not need a transaction here, we are assuming the transaction 
// declared in the router covers all arango documents and collections used here
const createAllocation = (repoData, params) => {
    // Validate allocation parameters
    const validationResult = validateAllocationParams(params);
    if (!validationResult.ok) {
        return validationResult;
    }
    const validationResultRepo = validateRepoData(repoData);
    if (!validationResultRepo.ok) {
        return validationResultRepo;
    }

    try {
        // For metadata-only repos, allocations are just database records
        // No actual storage allocation happens
        // 
        // Unlike the Globus Allocation creation process, we do not need to
        // touch the block collection because, we have not created a task.
        // blocks documents are needed to track what tasks are blocked
        //
        // The transaction needs to include the subect document and the repo document
        // to avoid the case where the nodes no longer exist.

         if (!g_db.repo.exists(repoData._key)) {
             return Result.err({
                 code: error.ERR_NOT_FOUND,
                 message: "Failed to create metadata allocation: Repo, '" + repoData._id + "', does not exist.",
             });
         }
        
         if (!g_db._exists(params.subject)) {
             return Result.err({
                 code: error.ERR_NOT_FOUND,
                 message: "Failed to create metadata allocation: Subject, '" + params.subject + "', does not exist.",
             });
         }
        
         // Check for proper permissions
         try {
           permissions.ensureAdminPermRepo(params.client, repoData._id);
         } catch (e) {
           if (e == error.ERR_PERM_DENIED) {
             return Result.err({
                 code: error.ERR_PERM_DENIED,
                 message: "Failed to create metadata allocation: client, '" + params.client._id + "', does not have permissions to create an allocation on " + repoData._id,
             });
           }
         }
         // Check if there is already a matching allocation
         var alloc = g_db.alloc.firstExample({
             _from: params.subject,
             _to: repoData._id,
         });
         if (alloc) {
             return Result.err({
                 code: error.ERR_INVALID_PARAM,
                 message: "Failed to create metadata allocation: Subject, '" + params.subject + "', already has an allocation on " + repoData._id,
             });
         }

         const allocation = g_db.alloc.save({
           _from: params.subject,
           _to: repoData._id,
           data_limit: params.data_limit, 
           rec_limit: params.rec_limit,
           rec_count: 0,
           data_size: 0,
           path: "/",
           type: "metadata_only"
         });

         // Save to allocations collection (would need to be created)
         // For now, return success with the allocation data
         const result = {
             id: allocation._id,
             repo_id: repoData._id,
             subject: params.subject,
             rec_limit: params.rec_limit,
         };

         return Result.ok(createAllocationResult(ExecutionMethod.DIRECT, result));
    } catch (e) {
         return Result.err({
             code: error.ERR_INTERNAL_FAULT,
             message: `Failed to create metadata allocation: ${e.message}`,
         });
    }
};

// Delete allocation from metadata repository (direct/synchronous)
const deleteAllocation = (client, repoData, subjectId) => {
    if (!subjectId || typeof subjectId !== "string") {
        return Result.err({
            code: error.ERR_INVALID_PARAM,
            message: "Subject ID is required for allocation deletion",
        });
    }

    try {

        if (!g_db._exists(repoData._id)) {
            return Result.err({
                code: error.ERR_NOT_FOUND,
                message: "Failed to delete metadata allocation: Repo, '" + repoData._id + "', does not exist ",
            });
        }
        
        if (!g_db._exists(params.subject)) {
            return Result.err({
                code: error.ERR_NOT_FOUND,
                message: "Failed to delete metadata allocation: Subject, '" + params.subject + "', does not exist ",
            });
        }

        var repo = g_db.repo.document(repoData._id);

        permissions.ensureAdminPermRepo(client, repoData._id);

        var alloc = g_db.alloc.firstExample({
            _from: params.subject,
            _to: repoData._id,
        });
        if (!alloc) {
            return Result.err({
                code: error.ERR_NOT_FOUND,
                message: "Failed to delete metadata allocation: Subject, '" + params.subject + "', has no allocation on " + repoData._id,
            });
        }


        var count = g_db
            ._query(
                "return length(for v, e in 1..1 inbound @repo loc filter e.uid == @subj return 1)",
                {
                    repo: a_repo_id,
                    subj: a_subject_id,
                },
            )
            .next();
        if (count) {
            return Result.err({
                code: error.ERR_IN_USE,
                message: "Failed to delete metadata allocation: " + count + " records found on the allocaition ",
            });
        }


        g_db.alloc.removeByExample({
          _from: params.subject,
          _to: repoData._id,
        });
        // For metadata-only repos, just remove the database record
        // No actual storage deallocation needed
        const result = {
            repo_id: repoData._id,
            subject: subjectId,
            status: "completed",
            message: "Metadata allocation removed",
        };

        return Result.ok(createAllocationResult(ExecutionMethod.DIRECT, result));
    } catch (e) {
        return Result.err({
            code: error.ERR_INTERNAL_FAULT,
            message: `Failed to delete metadata location: ${e.message}`,
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
            is_metadata_only: true,
        });
    } catch (e) {
        return Result.err({
            code: error.ERR_INTERNAL_FAULT,
            message: `Failed to get capacity info: ${e.message}`,
        });
    }
};

/**
 * Export all operations (trait implementation)
 * These exports define the trait implementation for metadata repository type
 * Note how the same interface has different behavior than Globus implementation
 * @type {object}
 * @property {function(object): {ok: boolean, value: boolean}} validate - Validate metadata repository
 * @property {function(object, object): {ok: boolean, error?: *, value?: *}} createAllocation - Create allocation in metadata repository
 * @property {function(object, string): {ok: boolean, error?: *, value?: *}} deleteAllocation - Delete allocation from metadata repository
 * @property {function(object): {ok: boolean, value: boolean}} supportsDataOperations - Check if supports data operations
 * @property {function(object): {ok: boolean, error?: *, value?: *}} getCapacityInfo - Get capacity information
 * @see https://doc.rust-lang.org/book/ch17-02-trait-objects.html
 */
module.exports = {
    validate,
    createAllocation,
    deleteAllocation,
    supportsDataOperations,
    getCapacityInfo,
};
