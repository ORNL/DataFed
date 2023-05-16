#define BOOST_TEST_MAIN

#define BOOST_TEST_MODULE socket_factory
#include <boost/test/unit_test.hpp>

// Local public includes
#include "common/CredentialFactory.hpp"
#include "common/ICredentials.hpp"
#include "common/ProtocolTypes.hpp"
#include "common/SocketFactory.hpp"
#include "common/SocketOptions.hpp"
#include "common/TraceException.hpp"

// Standard includes
#include <iostream>
#include <string>
#include <unordered_map>

using namespace SDMS;

const std::string public_key =
    "pF&3ZS3rd2HYesV&KbDEb7T@RaHhcZD@FDwqef9f";  // 40 chars
const std::string secret_key =
    "*XFVZrCnhPd5DrQTZ!V%zqZoPfs@8pcP23l3kfei";  // 40 chars
const std::string server_key =
    "Wce6y$B4vXjM$xnM^tRGJGP^ads5hxkDSULJWM&9";  // 40 chars

BOOST_AUTO_TEST_SUITE(SocketFactoryTest)

class DummyCredential : public ICredentials {
 public:
  DummyCredential(const std::string& pub_key) : m_pub_key(pub_key){};

 private:
  std::string m_pub_key = "";

  virtual ProtocolType getType() const noexcept final {
    return ProtocolType::ZQTP;
  }

  virtual std::string get(const CredentialType cred) const final {
    if (cred == CredentialType::PUBLIC_KEY) {
      // Because this is a const method m_pub_key will be const
      // need to make a copy that is non constant.
      std::string val = m_pub_key;
      return val;
    }
    return std::string("");
  }

  inline virtual bool has(CredentialType type) const noexcept final {
    if (type == CredentialType::PUBLIC_KEY) {
      return true;
    }
    return false;
  }
};

BOOST_AUTO_TEST_CASE(testing_SocketFactoryThrow) {

  SocketOptions socket_options;
  socket_options.scheme = URIScheme::TCP;
  socket_options.class_type = SocketClassType::SERVER;
  socket_options.direction_type = SocketDirectionalityType::BIDIRECTIONAL;
  socket_options.communication_type = SocketCommunicationType::ASYNCHRONOUS;
  socket_options.protocol_type = ProtocolType::ZQTP;
  socket_options.host = "localhost";
  socket_options.port = 1341;

  DummyCredential credentials(public_key);
  SocketFactory factory;

  // Should throw because non zmq credential type was used.
  BOOST_CHECK_THROW(factory.create(socket_options, credentials),
                    std::exception);
}

BOOST_AUTO_TEST_CASE(testing_SocketFactory) {

  SocketOptions socket_options;
  socket_options.scheme = URIScheme::TCP;
  socket_options.class_type = SocketClassType::SERVER;
  socket_options.direction_type = SocketDirectionalityType::BIDIRECTIONAL;
  socket_options.communication_type = SocketCommunicationType::ASYNCHRONOUS;
  socket_options.protocol_type = ProtocolType::ZQTP;
  socket_options.host = "localhost";
  socket_options.port = 1341;

  std::unordered_map<CredentialType, std::string> cred_options;
  cred_options[CredentialType::PUBLIC_KEY] = public_key;
  cred_options[CredentialType::PRIVATE_KEY] = secret_key;
  cred_options[CredentialType::SERVER_KEY] = server_key;

  CredentialFactory cred_factory;
  auto credentials = cred_factory.create(ProtocolType::ZQTP, cred_options);

  SocketFactory factory;
  std::unique_ptr<ISocket> socket =
      factory.create(socket_options, *credentials);

  BOOST_CHECK(socket->getAddress() == "tcp://" + socket_options.host + ":" +
                                          std::to_string(*socket_options.port));
  BOOST_CHECK(socket->getSocketClassType() == SocketClassType::SERVER);
  BOOST_CHECK(socket->getSocketDirectionalityType() ==
              SocketDirectionalityType::BIDIRECTIONAL);
  BOOST_CHECK(socket->getSocketCommunicationType() ==
              SocketCommunicationType::ASYNCHRONOUS);
  BOOST_CHECK(socket->getProtocolType() == ProtocolType::ZQTP);

  std::string cred_pub = socket->get(CredentialType::PUBLIC_KEY);
  std::string cred_priv = socket->get(CredentialType::PRIVATE_KEY);
  std::string cred_serv = socket->get(CredentialType::SERVER_KEY);

  BOOST_CHECK(cred_pub == public_key);
  BOOST_CHECK(cred_priv == secret_key);
  BOOST_CHECK(cred_serv == server_key);
}

BOOST_AUTO_TEST_CASE(testing_SocketFactory_NoServerKey) {

  SocketOptions socket_options;
  socket_options.scheme = URIScheme::TCP;
  socket_options.class_type = SocketClassType::SERVER;
  socket_options.direction_type = SocketDirectionalityType::BIDIRECTIONAL;
  socket_options.communication_type = SocketCommunicationType::ASYNCHRONOUS;
  socket_options.protocol_type = ProtocolType::ZQTP;
  socket_options.host = "localhost";
  socket_options.port = 1341;

  CredentialFactory cred_factory;

  std::unordered_map<CredentialType, std::string> cred_options;
  cred_options[CredentialType::PUBLIC_KEY] = public_key;
  cred_options[CredentialType::PRIVATE_KEY] = secret_key;

  auto credentials = cred_factory.create(ProtocolType::ZQTP, cred_options);

  SocketFactory factory;
  std::unique_ptr<ISocket> socket =
      factory.create(socket_options, *credentials);

  BOOST_CHECK(socket->getAddress() == "tcp://" + socket_options.host + ":" +
                                          std::to_string(*socket_options.port));
  BOOST_CHECK(socket->getSocketClassType() == SocketClassType::SERVER);
  BOOST_CHECK(socket->getSocketDirectionalityType() ==
              SocketDirectionalityType::BIDIRECTIONAL);
  BOOST_CHECK(socket->getSocketCommunicationType() ==
              SocketCommunicationType::ASYNCHRONOUS);
  BOOST_CHECK(socket->getProtocolType() == ProtocolType::ZQTP);

  std::string cred_pub = socket->get(CredentialType::PUBLIC_KEY);
  std::string cred_priv = socket->get(CredentialType::PRIVATE_KEY);
  BOOST_CHECK_THROW(
      std::string cred_serv = socket->get(CredentialType::SERVER_KEY),
      TraceException);

  BOOST_CHECK(cred_pub.compare(public_key) == 0);
  BOOST_CHECK(cred_priv.compare(secret_key) == 0);
}

BOOST_AUTO_TEST_CASE(testing_SocketFactory_NoCredentials) {

  SocketOptions socket_options;
  socket_options.scheme = URIScheme::TCP;
  socket_options.class_type = SocketClassType::SERVER;
  socket_options.direction_type = SocketDirectionalityType::BIDIRECTIONAL;
  socket_options.communication_type = SocketCommunicationType::ASYNCHRONOUS;
  socket_options.connection_security = SocketConnectionSecurity::SECURE;
  socket_options.protocol_type = ProtocolType::ZQTP;
  socket_options.host = "localhost";
  socket_options.port = 1341;

  CredentialFactory cred_factory;

  std::unordered_map<CredentialType, std::string> cred_options;
  auto credentials = cred_factory.create(ProtocolType::ZQTP, cred_options);

  SocketFactory factory;
  std::unique_ptr<ISocket> socket =
      factory.create(socket_options, *credentials);
  BOOST_CHECK(socket->hasCredentials() == false);
}

BOOST_AUTO_TEST_SUITE_END()
