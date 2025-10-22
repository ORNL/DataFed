"use strict";

const { ExecutionMethod } = require("../../lib/execution_types");

const RepositoryType = Object.freeze({
    GLOBUS: "globus",
    METADATA: "metadata",
});

/**
 * Result type for Rust-like error handling
 * Rust's Result<T, E> type is used for recoverable errors
 * This pattern makes error handling explicit and composable
 * @type {{ok: (function(*): {ok: boolean, value: *}), err: (function(*): {ok: boolean, error: *})}}
 */
const Result = {
    ok: (value) => ({ ok: true, value }),
    err: (error) => ({ ok: false, error }),
};

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
 * @param {string} method - Execution method (DEFERRED or DIRECT)
 * @param {object} payload - Result payload (task info or direct result)
 * @returns {{execution_method: string, task?: object, result?: object}} Allocation result with execution method and appropriate payload
 */
const createAllocationResult = (method, payload) => ({
    execution_method: method,
    ...(method === ExecutionMethod.DEFERRED ? { task: payload } : { result: payload }),
});

module.exports = {
    RepositoryType,
    Result,
    createRepository,
    createAllocationResult,
};
