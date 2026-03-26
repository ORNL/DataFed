/**
 * @module db_config
 * @description Shared database configuration for Foxx services.
 *
 * Derives the graph name from the current database name using the convention
 * <dbname>g (e.g. "sdms" -> "sdmsg", "sdms_test" -> "sdms_testg").
 *
 * Usage in routers:
 *
 * const { GRAPH_NAME, getGraph } = require('./db_config');
 *
 * // If you need just the name (e.g. for AQL):
 * const aql = require('@arangodb').aql;
 * const result = db._query(aql`FOR v IN 1..1 OUTBOUND ${startId} GRAPH ${GRAPH_NAME} ...`);
 *
 * // If you need the graph object:
 * const graph = getGraph();
 */

"use strict";

const db = require("@arangodb").db;
const generalGraph = require("@arangodb/general-graph");

/** Graph name derived from the current database: <dbname>g */
const GRAPH_NAME = db._name() + "g";

/**
 * Get the named graph object.
 *
 * This is a function rather than a module-level constant so that callers
 * in request-scoped code get a fresh handle. For module-scope usage
 * (e.g. `const g_graph = getGraph()`) the behavior is identical to
 * the old `_graph("sdmsg")` pattern.
 *
 * @returns {object} ArangoDB general-graph instance
 */
function getGraph() {
    return generalGraph._graph(GRAPH_NAME);
}

module.exports = {
    GRAPH_NAME,
    getGraph,
};
