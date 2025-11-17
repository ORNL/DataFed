"use strict";

/**
 * Execution methods
 * A enum-like constant representing different execution strategies
 * @type {Readonly<{DEFERRED: string, DIRECT: string}>}
 */
const ExecutionMethod = Object.freeze({
    DEFERRED: "deferred",
    DIRECT: "direct",
});

module.exports = {
    ExecutionMethod,
};
