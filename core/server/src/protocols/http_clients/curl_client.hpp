
#ifndef DATAFED_CORE_HTTP_CLIENT_HPP
#define DATAFED_CORE_HTTP_CLIENT_HPP
#pragma once

// Local private DataFed includes
#include "http_client.hpp"
#include "../../authenticators/authenticator.hpp"

// Public DataFed includes
#include <passkey.hpp>
#include <test.hpp>

// Third party includes
#include <boost/url.hpp>
#include <curl/curl.h>
#include <nlohmann/json.hpp>

// Standard includes
#include <memory>

namespace datafed {

  class HTTPClientFactory;

  class Credential;

  class CURLHTTPClient : public HTTPClient {
    private:
      virtual void request(HTTP_ACTION, const boost::urls::url_view) final;

      std::unique_ptr<Credential> m_credential = nullptr;
      CURL * m_curl = nullptr;
      CURLHTTPClient();
    public:

      // Protected public constructor
      explicit CURLHTTPClient(const PassKey<HTTPClientFactory> &) : CURLHTTPClient() {};
      explicit CURLHTTPClient(const PassKey<Test> &) : CURLHTTPClient(){};

      virtual void add(const Authenticator &) final;
      virtual PROTOCOL_TYPE type() const final { return PROTOCOL_TYPE::HTTP; }
      virtual bool connected() final;
      virtual void connect() final;
      virtual nlohmann::json send(nlohmann::json) final;

      // Non thread safe initialization
      static void init();

      // Factory method
      static std::unique_ptr<HTTPClient> create(const PassKey<HTTPClientFactory> & key);

      ~CURLHTTPClient();
  };

}

#endif // DATAFED_CORE_HTTP_CLIENT_HPP
