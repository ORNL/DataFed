"use strict";
const g_lib=require("../support")

function logRequestSuccess({
    client,
    correlationId,
    httpVerb,
    routePath,
    status,
    description,
    extra,
}) {
    // helper to pad fields
    const pad = (label, value, length = 20) =>
        `${label}: ${value || "unknown"}`.padEnd(length, " ");

    console.info(
        pad("Client", client) +
            " | " +
            pad("Correlation_ID", correlationId) +
            " | " +
            pad("HTTP", httpVerb) +
            " | " +
            pad("Route", routePath) +
            " | " +
            pad("Status", status) +
            " | " +
            pad("Desc", description) +
            " | " +
            pad("Extra", typeof extra === "object" ? JSON.stringify(extra) : extra),
    );
}

function logRequestFailure({
    client,
    correlationId,
    httpVerb,
    routePath,
    status,
    description,
    extra,
    error
}) {
    // helper to pad fields
    const pad = (label, value, length = 20) =>
        `${label}: ${value || "unknown"}`.padEnd(length, " ");
    //PUT IF STATEMENT
    if(g_lib.isInteger(error) || Array.isArray(error)){
        console.error(
            pad("Client", client) +
            " | " +
            pad("Correlation_ID", correlationId) +
            " | " +
            pad("HTTP", httpVerb) +
            " | " +
            pad("Route", routePath) +
            " | " +
            pad("Status", status) +
            " | " +
            pad("Desc", description) +
            " | " +
            pad("Extra", typeof extra === "object" ? JSON.stringify(extra) : extra) +
            " | " +
            pad("Error", error) +
        );
    }
    else{
        console.error(
            pad("Client", client) +
            " | " +
            pad("Correlation_ID", correlationId) +
            " | " +
            pad("HTTP", httpVerb) +
            " | " +
            pad("Route", routePath) +
            " | " +
            pad("Status", status) +
            " | " +
            pad("Desc", description) +
            " | " +
            pad("Extra", typeof extra === "object" ? JSON.stringify(extra) : extra) +
            " | " +
            pad("Error", error.message) +
            " | " +
            pad("Stack", error.stack)
        );
    }
}

function logRequestStarted({ client, correlationId, httpVerb, routePath, status, description }) {
    // helper to pad fields
    const pad = (label, value, length = 20) =>
        `${label}: ${value || "unknown"}`.padEnd(length, " ");

    console.info(
        pad("Client", client) +
            " | " +
            pad("Correlation_ID", correlationId) +
            " | " +
            pad("HTTP", httpVerb) +
            " | " +
            pad("Route", routePath) +
            " | " +
            pad("Status", status) +
            " | " +
            pad("Desc", description),
    );
}

// Export the functions
module.exports = {
    logRequestSuccess,
    logRequestFailure,
    logRequestStarted,
};
