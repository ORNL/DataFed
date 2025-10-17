"use strict";

const { ExecutionMethod } = require("../lib/execution_types");
/**
 * Repository type system using Rust-compatible patterns
 * This module defines types as enum-like constants and data structures
 * following composition over inheritance principles
 */

/**
 * Repository type enum (similar to Rust enum)
 * In Rust, enums are used to define a type that can be one of several variants
 * @type {Readonly<{GLOBUS: string, METADATA_ONLY: string}>}
 * @see https://doc.rust-lang.org/book/ch06-01-defining-an-enum.html
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
 * @see https://doc.rust-lang.org/book/ch09-02-recoverable-errors-with-result.html
 */
const Result = {
    ok: (value) => ({ ok: true, value }),
    err: (error) => ({ ok: false, error }),
};

/**
 * Repository structure using composition
 * Rust favors composition over inheritance - structs contain data, traits define behavior
 * @param {object} config - Configuration object
 * @param {string} config.id - Repository ID
 * @param {string} config.type - Repository type (globus or metadata_only)
 * @param {string} config.title - Repository title
 * @param {string} [config.desc] - Repository description
 * @param {number} config.capacity - Storage capacity in bytes
 * @param {string[]} config.admins - Array of admin user IDs
 * @param {object} [config.typeSpecific={}] - Type-specific configuration fields
 * @returns {{_key: string, _id: string, type: string, title: string, desc: string, capacity: number, admins: string[]}} Repository data object with ArangoDB fields
 * @see https://doc.rust-lang.org/book/ch05-01-defining-structs.html
 */
//const createRepositoryData = ({
//    id,
//    type,
//    title,
//    desc,
//    capacity,
//    admins,
//    // Type-specific fields handled through composition
//    typeSpecific = {},
//}) => ({
//    _key: id,
//    _id: `repo/${id}`,
//    type,
//    title,
//    desc,
//    capacity,
//    admins,
//    ...typeSpecific,
//});


/**
 * Tagged union for repositories (type + data)
 * Rust enums can contain data, creating tagged unions (also called algebraic data types)
 * This pattern enables type-safe polymorphism without inheritance
 * @param {string} type - Repository type (from RepositoryType enum)
 * @param {object} data - Repository data object
 * @returns {{type: string, data: object}} Tagged union with type and data fields
 * @see https://doc.rust-lang.org/book/ch06-01-defining-an-enum.html#enum-values
 */
const createRepository = (type, data) => ({
    type,
    data,
});

/**
 * Allocation result structure
 * @param {string} method - Execution method (TASK or DIRECT)
 * @param {object} payload - Result payload (task info or direct result)
 * @returns {{execution_method: string, task?: object, result?: object}} Allocation result with execution method and appropriate payload
 */
const createAllocationResult = (method, payload) => ({
    execution_method: method,
    ...(method === ExecutionMethod.TASK ? { task: payload } : { result: payload }),
});

//    createRepositoryData,
module.exports = {
    RepositoryType,
    Result,
    createGlobusConfig,
    createRepository,
    createAllocationResult,
};
