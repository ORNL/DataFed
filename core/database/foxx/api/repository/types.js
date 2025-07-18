"use strict";

/**
 * Repository type system using Rust-compatible patterns
 * This module defines types as enum-like constants and data structures
 * following composition over inheritance principles
 */

/**
 * Repository type enum (similar to Rust enum)
 * In Rust, enums are used to define a type that can be one of several variants
 * @type {Readonly<{GLOBUS: string, METADATA_ONLY: string}>}
 * @see: https://doc.rust-lang.org/book/ch06-01-defining-an-enum.html
 */
const RepositoryType = Object.freeze({
    GLOBUS: "globus",
    METADATA_ONLY: "metadata_only",
});

/**
 * Result type for Rust-like error handling
 * Rust's Result<T, E> type is used for recoverable errors
 * This pattern makes error handling explicit and composable
 * @type {{ok: (function(*): {ok: boolean, value: *}), err: (function(*): {ok: boolean, error: *})}}
 * @see: https://doc.rust-lang.org/book/ch09-02-recoverable-errors-with-result.html
 */
const Result = {
    ok: (value) => ({ ok: true, value }),
    err: (error) => ({ ok: false, error }),
};

/**
 * Repository structure using composition
 * Rust favors composition over inheritance - structs contain data, traits define behavior
 * @param id
 * @param type
 * @param title
 * @param desc
 * @param capacity
 * @param admins
 * @param typeSpecific
 * @returns {{_key, _id: string, type, title, desc, capacity, admins}}
 * @see: https://doc.rust-lang.org/book/ch05-01-defining-structs.html
 */
const createRepositoryData = ({
    id,
    type,
    title,
    desc,
    capacity,
    admins,
    // Type-specific fields handled through composition
    typeSpecific = {},
}) => ({
    _key: id,
    _id: `repo/${id}`,
    type,
    title,
    desc,
    capacity,
    admins,
    ...typeSpecific,
});

// Globus-specific configuration
const createGlobusConfig = ({ endpoint, path, pub_key, address, exp_path, domain }) => ({
    endpoint,
    path,
    pub_key,
    address,
    exp_path,
    domain,
});

/**
 * Tagged union for repositories (type + data)
 * Rust enums can contain data, creating tagged unions (also called algebraic data types)
 * This pattern enables type-safe polymorphism without inheritance
 * @param type
 * @param data
 * @returns {{type, data}}
 * @see: https://doc.rust-lang.org/book/ch06-01-defining-an-enum.html#enum-values
 */
const createRepository = (type, data) => ({
    type,
    data,
});

/**
 * Allocation execution methods
 * Another enum-like constant representing different execution strategies
 * @type {Readonly<{TASK: string, DIRECT: string}>}
 */
const ExecutionMethod = Object.freeze({
    TASK: "task",
    DIRECT: "direct",
});

// Allocation result structure
const createAllocationResult = (method, payload) => ({
    execution_method: method,
    ...(method === ExecutionMethod.TASK ? { task: payload } : { result: payload }),
});

module.exports = {
    RepositoryType,
    Result,
    ExecutionMethod,
    createRepositoryData,
    createGlobusConfig,
    createRepository,
    createAllocationResult,
};
