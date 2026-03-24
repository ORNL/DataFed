#ifndef LOCAL_JSON_ERROR_HANDLER_HPP
#define LOCAL_JSON_ERROR_HANDLER_HPP
#pragma once

// Third party includes
#include <nlohmann/json-schema.hpp>
#include <nlohmann/json.hpp>

// Standard includes
#include <string>

namespace SDMS {
namespace Core {

    class LocalJsonErrorHandler : public nlohmann::json_schema::basic_error_handler {
    public:
      void error(const nlohmann::json::json_pointer &ptr,
                 const nlohmann::json &instance,
                 const std::string &message) override {
        if (!m_errors.empty()) {
          m_errors += "\n";
        }
        m_errors += "At " + ptr.to_string() + ": " + message;
    
        nlohmann::json_schema::basic_error_handler::error(ptr, instance, message);
      }

      void appendError(const std::string &message) {
        if (!m_errors.empty()) {
          m_errors += "\n";
        }
        m_errors += message;
      }
    
      const std::string &errors() const { return m_errors; }
      bool hasErrors() const { return !m_errors.empty(); }
    
    private:
      std::string m_errors;
    };

}
}
#endif // LOCAL_JSON_ERROR_HANDLER_HPP
