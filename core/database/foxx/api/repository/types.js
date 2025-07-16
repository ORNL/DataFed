"use strict";

/**
 * Repository type system using Rust-compatible patterns
 * This module defines types as enum-like constants and data structures
 * following composition over inheritance principles
 */

// Repository type enum (similar to Rust enum)
const RepositoryType = Object.freeze({
    GLOBUS: "globus",
    METADATA_ONLY: "metadata_only"
});

// Result type for Rust-like error handling
const Result = {
    ok: (value) => ({ ok: true, value }),
    err: (error) => ({ ok: false, error })
};

// Repository structure using composition
const createRepositoryData = ({
    id,
    type,
    title,
    desc,
    capacity,
    admins,
    // Type-specific fields handled through composition
    typeSpecific = {}
}) => ({
    _key: id,
    _id: `repo/${id}`,
    type,
    title,
    desc,
    capacity,
    admins,
    ...typeSpecific
});

// Globus-specific configuration
const createGlobusConfig = ({
    endpoint,
    path,
    pub_key,
    address,
    exp_path,
    domain
}) => ({
    endpoint,
    path,
    pub_key,
    address,
    exp_path,
    domain
});

// Tagged union for repositories (type + data)
const createRepository = (type, data) => ({
    type,
    data
});

// Allocation execution methods
const ExecutionMethod = Object.freeze({
    TASK: "task",
    DIRECT: "direct"
});

// Allocation result structure
const createAllocationResult = (method, payload) => ({
    execution_method: method,
    ...(method === ExecutionMethod.TASK ? { task: payload } : { result: payload })
});

module.exports = {
    RepositoryType,
    Result,
    ExecutionMethod,
    createRepositoryData,
    createGlobusConfig,
    createRepository,
    createAllocationResult
};