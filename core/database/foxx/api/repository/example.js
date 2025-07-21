"use strict";

/**
 * Example usage of the new repository type system
 * Demonstrates Rust-compatible patterns in JavaScript
 */

const { RepositoryType, Result } = require("./types");
const { createRepositoryByType } = require("./factory");
const { RepositoryOps } = require("./operations");

/**
 * Example 1: Creating repositories using factory pattern
 * Factory pattern is common in Rust for complex object construction
 * @returns {Promise<{globus: *, metadata: *}>} Object containing created repositories
 * @see https://doc.rust-lang.org/book/ch17-03-oo-design-patterns.html
 */
async function createRepositoryExample() {
    // Create a Globus repository
    const globusConfig = {
        id: "science_data_repo",
        type: RepositoryType.GLOBUS,
        title: "Science Data Repository",
        desc: "Repository for scientific datasets",
        capacity: 10000000000, // 10GB
        admins: ["u/scientist1", "u/scientist2"],
        pub_key: "123ABC...",
        address: "data.science.org",
        endpoint: "endpoint-abc123",
        path: "/mnt/storage/repos/science_data_repo",
        domain: "science.org",
    };

    const globusResult = createRepositoryByType(globusConfig);
    if (!globusResult.ok) {
        console.error("Failed to create Globus repo:", globusResult.error);
        return;
    }

    // Create a metadata-only repository
    const metadataConfig = {
        id: "metadata_catalog",
        type: RepositoryType.METADATA_ONLY,
        title: "Metadata Catalog",
        desc: "Repository for metadata records only",
        capacity: 1000000, // Logical limit for records
        admins: ["u/cataloger1"],
    };

    const metadataResult = createRepositoryByType(metadataConfig);
    if (!metadataResult.ok) {
        console.error("Failed to create metadata repo:", metadataResult.error);
        return;
    }

    return { globus: globusResult.value, metadata: metadataResult.value };
}

/**
 * Example 2: Using trait-like operations
 * Using traits allows polymorphic behavior without knowing concrete types
 * @returns {Promise<*>} Allocation result
 * @see https://doc.rust-lang.org/book/ch10-02-traits.html#traits-as-parameters
 */
async function useRepositoryOperations() {
    // Find a repository
    const findResult = RepositoryOps.find("repo/science_data_repo");
    if (!findResult.ok) {
        console.error("Repository not found:", findResult.error);
        return;
    }

    const repository = findResult.value;

    // Check if it supports data operations
    const supportsDataResult = RepositoryOps.supportsDataOperations(repository);
    if (supportsDataResult.ok && supportsDataResult.value) {
        console.log("Repository supports data operations");
    }

    // Create an allocation
    const allocResult = RepositoryOps.createAllocation(repository, {
        subject: "d/dataset_001",
        size: 1000000000, // 1GB
        path: "/datasets/2024/dataset_001",
        metadata: {
            project: "Climate Research",
            created_by: "Dr. Smith",
        },
    });

    if (!allocResult.ok) {
        console.error("Allocation failed:", allocResult.error);
        return;
    }

    // Handle result based on execution method
    const allocation = allocResult.value;
    if (allocation.execution_method === "task") {
        console.log("Allocation queued as task:", allocation.task.task_id);
        // Would monitor task progress...
    } else {
        console.log("Allocation completed directly:", allocation.result);
    }

    return allocation;
}

/**
 * Example 3: Pattern matching on repository types
 * Pattern matching is fundamental in Rust for handling enum variants
 * @param {Object} repository - Repository object with type and data fields
 * @returns {{ok: boolean, error?: *, value?: *}} Result of handling repository
 * @see https://doc.rust-lang.org/book/ch06-02-match.html
 */
function handleRepositoryByType(repository) {
    // Similar to Rust match expression
    switch (repository.type) {
        case RepositoryType.GLOBUS:
            return handleGlobusRepository(repository.data);

        case RepositoryType.METADATA_ONLY:
            return handleMetadataRepository(repository.data);

        default:
            return Result.err({
                code: 400,
                message: `Unknown repository type: ${repository.type}`,
            });
    }
}

function handleGlobusRepository(repoData) {
    console.log(`Globus repository at ${repoData.endpoint}`);
    // Globus-specific logic...
    return Result.ok({
        type: "globus",
        endpoint: repoData.endpoint,
        path: repoData.path,
    });
}

function handleMetadataRepository(repoData) {
    console.log(`Metadata-only repository: ${repoData.title}`);
    // Metadata-specific logic...
    return Result.ok({
        type: "metadata",
        record_limit: repoData.capacity,
    });
}

/**
 * Example 4: Error handling with Result pattern
 * Early returns emulate Rust's ? operator for error propagation
 * @returns {Promise<{ok: boolean, value?: *, error?: *}>} Result of operations
 * @see https://doc.rust-lang.org/book/ch09-02-recoverable-errors-with-result.html#a-shortcut-for-propagating-errors-the--operator
 */
async function robustRepositoryOperation() {
    // Chain operations with early return on error
    const findResult = RepositoryOps.find("repo/test_repo");
    if (!findResult.ok) {
        return findResult; // Propagate error - like ? in Rust
    }

    const repository = findResult.value;

    const validateResult = RepositoryOps.validate(repository);
    if (!validateResult.ok) {
        return validateResult; // Propagate error
    }

    const capacityResult = RepositoryOps.getCapacityInfo(repository);
    if (!capacityResult.ok) {
        return capacityResult; // Propagate error
    }

    // All operations succeeded
    return Result.ok({
        repository: repository,
        capacity: capacityResult.value,
    });
}

/**
 * Example 5: Composition over inheritance
 * Rust doesn't have inheritance - prefer composition of behaviors
 * @type {Object}
 * @property {function(Object, string): void} logAccess - Log repository access
 * @property {function(Object, number): {ok: boolean, error?: *, value?: *}} checkQuota - Check repository quota
 * @property {function(Object, Object): Promise<{ok: boolean, error?: *, value?: *}>} allocateWithQuotaCheck - Allocate with quota check
 * @see https://doc.rust-lang.org/book/ch17-03-oo-design-patterns.html
 */
const RepositoryBehaviors = {
    // Shared behaviors as standalone functions
    logAccess: (repository, userId) => {
        console.log(`User ${userId} accessed repository ${repository.data._id}`);
    },

    checkQuota: (repository, requestedSize) => {
        const capacityResult = RepositoryOps.getCapacityInfo(repository);
        if (!capacityResult.ok) return capacityResult;

        const capacity = capacityResult.value;
        if (capacity.available_capacity < requestedSize) {
            return Result.err({
                code: 507,
                message: "Insufficient storage capacity",
            });
        }
        return Result.ok(true);
    },

    // Type-specific behaviors composed from shared ones
    allocateWithQuotaCheck: async (repository, params) => {
        // Compose behaviors
        const quotaResult = RepositoryBehaviors.checkQuota(repository, params.size);
        if (!quotaResult.ok) return quotaResult;

        RepositoryBehaviors.logAccess(repository, params.requested_by);

        return RepositoryOps.createAllocation(repository, params);
    },
};

module.exports = {
    createRepositoryExample,
    useRepositoryOperations,
    handleRepositoryByType,
    robustRepositoryOperation,
    RepositoryBehaviors,
};
