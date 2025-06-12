#ifndef SOCKET_OPTIONS_HPP
#define SOCKET_OPTIONS_HPP
#pragma once

// Local public includes
#include "ProtocolTypes.hpp"

// Standard includes
#include <optional>
#include <string>
#include <cstdint>

namespace SDMS {

enum class SocketCommunicationType { ASYNCHRONOUS, SYNCHRONOUS };

/**
 * TRANSIENT connection comes and goes
 * PERSISTENT connection persists
 **/
enum class SocketConnectionLife { INTERMITTENT, PERSISTENT };

/**
 * CLIENT - makes/initiates requests
 * SERVER - responds to requests
 **/
enum class SocketClassType { CLIENT, SERVER };

enum class URIScheme { TCP, HTTPS, HTTP, INPROC };

enum class SocketDirectionalityType { UNIDIRECTIONAL, BIDIRECTIONAL };

enum class SocketConnectionSecurity { SECURE, INSECURE };

/**
 * Will deconstruct a string address into scheme, host and port
 *
 * :Example
 *
 * tcp://www.important.com:4234
 *
 * Sheme TCP
 * host www.important.com
 * port 4234
 **/
class AddressSplitter {
private:
  URIScheme m_scheme;
  std::string m_host;
  std::optional<uint16_t> m_port;

public:
  explicit AddressSplitter(const std::string &);
  std::string host() const { return m_host; }
  URIScheme scheme() const { return m_scheme; }
  std::optional<uint16_t> port() const { return m_port; }
};

/**
 * host and port represent the host and port the socket is connecting to
 * local_id is an optional identity which defines the machine/process/thread the
 * connections are being made from.
 **/
struct SocketOptions {
  URIScheme scheme = URIScheme::INPROC;
  SocketClassType class_type = SocketClassType::SERVER;
  SocketDirectionalityType direction_type =
      SocketDirectionalityType::BIDIRECTIONAL;
  SocketCommunicationType communication_type =
      SocketCommunicationType::ASYNCHRONOUS;
  SocketConnectionLife connection_life = SocketConnectionLife::PERSISTENT;
  SocketConnectionSecurity connection_security =
      SocketConnectionSecurity::INSECURE;
  ProtocolType protocol_type = ProtocolType::ZQTP;
  std::string host = "";
  std::optional<uint16_t> port;
  std::optional<std::string> local_id;
};

} // namespace SDMS

#endif // SOCKET_OPTIONS_HPP
