#ifndef SCHEMAAPICONFIG_HPP
#define SCHEMAAPICONFIG_HPP
#pragma once

#include <string>

namespace SDMS {
namespace Core {

/**
 * @brief Configuration for external Schema API connection.
 *
 * Typically loaded from server config file with sensitive values
 * (bearer_token) from environment variables.
 *
 * Example config file (YAML):
 * @code
 * schema_api:
 *   base_url: "https://schema-api.example.com/v1"
 *   verify_ssl: true
 *   ca_cert_path: "/etc/ssl/certs/internal-ca.crt"
 *   connect_timeout_sec: 10
 *   request_timeout_sec: 30
 * @endcode
 *
 * Token from environment:
 * @code
 * export DATAFED_SCHEMA_API_TOKEN="your-bearer-token"
 * @endcode
 */
struct SchemaAPIConfig {
  /// Base URL for the schema API (e.g., "https://schema-api.example.com/v1")
  std::string base_url;

  /// Bearer token for Authorization header. Empty = no auth.
  /// Recommend loading from environment variable, not config file.
  std::string bearer_token;

  std::string api_key;
  // ── TLS Options ───────────────────────────────────────────────────────

  /// Verify server certificate. Should be true in production.
  bool verify_ssl = true;

  /// Path to CA certificate bundle. Empty = use system default.
  std::string ca_cert_path;

  /// Path to client certificate for mTLS. Empty = no client cert.
  std::string client_cert_path;

  /// Path to client private key for mTLS. Required if client_cert_path is set.
  std::string client_key_path;

  // ── Timeouts ──────────────────────────────────────────────────────────

  /// Connection timeout in seconds
  long connect_timeout_sec = 10;

  /// Total request timeout in seconds (includes transfer time)
  long request_timeout_sec = 30;

  // ── Helpers ───────────────────────────────────────────────────────────

  /// Returns true if base_url is set (minimum required config)
  bool isConfigured() const { return !base_url.empty(); }

  /// Returns true if bearer_token is set, or api_key is set
  bool hasAuth() const { return !bearer_token.empty() || !api_key.empty(); }
};

} // namespace Core
} // namespace SDMS

#endif
