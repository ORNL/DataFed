#ifndef DATAFED_CORE_PROTOCOLS_HTTP_VALIDATOR_HPP
#define DATAFED_CORE_PROTOCOLS_HTTP_VALIDATOR_HPP
#pragma once

// Third party includes
#include <nlohmann/json-schema.hpp>

namespace datafed {

  /**
   * Class is designed to ensure that json objects of specific types have
   * certain keys
   **/
  class HTTPValidator {
      nlohmann::json_schema::json_validator request_validator;
      nlohmann::json_schema::json_validator response_validator;
    public:
      HTTPValidator();
  };

}
#endif // DATAFED_CORE_PROTOCOLS_HTTP_VALIDATOR_HPP
