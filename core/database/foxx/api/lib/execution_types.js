"use strict";

/**
 * Execution methods
 * A enum-like constant representing different execution strategies
 * @type {Readonly<{TASK: string, DIRECT: string}>}
 */
const ExecutionMethod = Object.freeze({
    TASK: "task",
    DIRECT: "direct",
});

module.exports = {
    ExecutionMethod,
};
