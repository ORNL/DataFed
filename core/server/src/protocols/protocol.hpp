#ifndef DATAFED_CORE_PROTOCOL_HPP
#define DATAFED_CORE_PROTOCOL_HPP
#pragma once

// Local private DataFed includes
#include "../credentials/credential.hpp"

// Third party includes
#include <nlohmann/json.hpp>

// Standard includes
#include <memory>

namespace datafed {
  class Credential;

  enum class PROTOCOL_TYPE {
    HTTP,
    ZEROMQ
  };

  class Protocol {
    public:

      /**
       * Protocol becomes owner of credential once it is passed in, this
       * means that the unique_ptr becomes invalid after passing in the
       * Credential.
       **/
      virtual void add(const std::unqiue_ptr<Credential> &) = 0;
      virtual const Credential & getCredential() const = 0;
      virtual PROTOCOL_TYPE type() const = 0;
      virtual bool connected() = 0;
      virtual void connect() = 0;
      virtual nlohmann::json send(nlohmann::json) = 0;
//      virtual void encrypt() = 0;
//      virtual bool encrypted() const = 0;
  };
}

#endif // DATAFED_CORE_PROTOCOL_HPP
