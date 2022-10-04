#ifndef DATAFED_CORE_PROTOCOLS_HTTP_CLIENT_HPP
#define DATAFED_CORE_PROTOCOLS_HTTP_CLIENT_HPP
#pragma once

#include "../protocol.hpp"

// Third party includes
#include <boost/url.hpp>
#include <nlohmann/json.hpp>
#include <nlohmann/json-schema.hpp>

// Standard includes
#include <memory>

namespace datafed {

  enum class HTTP_ACTION {
    GET,
    POST,
    PUT,
    PATCH,
    DELETE
  };

  class Credential;

  class HTTPClient : public Protocol {
    protected: 
      virtual void request(HTTP_ACTION,  const boost::urls::url_view) = 0;
    public:
      virtual void add(const std::unique_ptr<Credential> &) = 0;
      virtual PROTOCOL_TYPE type() const = 0;
      virtual bool connected() = 0;
      virtual void connect() = 0;
      virtual nlohmann::json send(nlohmann::json) = 0;
//      virtual void encrypt() = 0;
//      virtual bool encrypted() const = 0;
  };

}

#endif // DATAFED_CORE_PROTOCOLS_HTTP_CLIENT_HPP
