/**
 * @file db_env.js
 * @description Shared environment configuration for arangosh scripts.
 *
 * Reads database name from the DATAFED_DATABASE_NAME environment variable,
 * falling back to "sdms" for backward compatibility with existing deployments
 * and CI pipelines that haven't been updated yet.
 *
 * The graph name follows the convention <dbname>g.
 *
 * Usage in arangosh scripts:
 * - const { DB_NAME, GRAPH_NAME } = require('./db_env');
 *
 * NOTE: This file is for arangosh scripts only, not Foxx services.
 * Foxx services use api/db_config.js which derives names from
 * the runtime database context.
 */

'use strict';

const internal = require('internal');

const DB_NAME = internal.env.DATAFED_DATABASE_NAME || 'sdms';
const GRAPH_NAME = DB_NAME + 'g';

exports.DB_NAME = DB_NAME;
exports.GRAPH_NAME = GRAPH_NAME;
