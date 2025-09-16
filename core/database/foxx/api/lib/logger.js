"use strict";


function logRequestSuccess({
  client,
  correlationId,
  httpVerb,
  routePath,
  status,
  description,
  extra
}) {
  // helper to pad fields
  const pad = (label, value, length = 20) =>
    `${label}: ${value || "unknown"}`.padEnd(length, " ");
  
  console.info(
    pad("Client", client) + " | " +
    pad("Correlation_ID", correlationId) + " | " +
    pad("HTTP", httpVerb) + " | " +
    pad("Route", routePath) + " | " +
    pad("Status", status) + " | " +
    pad("Desc", description) + "|" +
    pad("Extra", typeof extra === 'object' ? JSON.stringify(extra) : extra)
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
  message,
  stack
}) {
  // helper to pad fields
  const pad = (label, value, length = 20) =>
    `${label}: ${value || "unknown"}`.padEnd(length, " ");
  console.error(
    pad("Client:", client) + " | " +
    pad("Correlation_ID:", correlationId) + " | " +
    pad("HTTP:", httpVerb) + " | " +
    pad("Route:", routePath) + " | " +
    pad("Status:", status) + " | " +
    pad("Desc:", description) + "|" +
    pad("Extra", typeof extra === 'object' ? JSON.stringify(extra) : extra) + "|" +
    pad("Err:", message) + "|" +
    pad("Stack:", stack)
  );
}


function logRequestStarted({
  client,
  correlationId,
  httpVerb,
  routePath,
  status,
  description
}) {
  // helper to pad fields
  const pad = (label, value, length = 20) =>
    `${label}: ${value || "unknown"}`.padEnd(length, " ");

  console.info(
    pad("Client:", client) + " | " +
    pad("Correlation_ID:", correlationId) + " | " +
    pad("HTTP:", httpVerb) + " | " +
    pad("Route:", routePath) + " | " +
    pad("Status:", status) + " | " +
    pad("Desc:", description)
  );
}

// Export the functions
module.exports = {
  logRequestSuccess,
  logRequestFailure,
  logRequestStarted
};
