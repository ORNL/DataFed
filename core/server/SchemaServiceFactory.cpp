
#include "SchemaServiceFactory.hpp"
#include "common/TraceException.hpp"
#include "common/envelope.pb.h"

namespace SDMS {
namespace Core {

// ── Storage Registry ────────────────────────────────────────────────────────

void SchemaServiceFactory::setDefaultSchemaType(
    const std::string & a_engine) {

  if (m_storage.count(a_engine) == 0 || m_validators.count(a_engine) == 0) {
    EXCEPT_PARAM(INTERNAL_ERROR,
         "SchemaServiceFactory: no storage or validator available for '" << a_engine << "' both must be set, before it can be made the default.");
  }
  m_default_engine = a_engine;
}

void SchemaServiceFactory::registerStorage(
    const std::string &a_engine,
    std::shared_ptr<ISchemaStorage> a_storage) {
  m_storage[a_engine] = std::move(a_storage);
}

ISchemaStorage &
SchemaServiceFactory::getStorage(const std::string &a_engine) {
  return resolveStorage(a_engine);
}

// ── Validator Registry ──────────────────────────────────────────────────────

void SchemaServiceFactory::registerValidator(
    const std::string &a_engine,
    std::shared_ptr<ISchemaValidator> a_validator) {
  m_validators[a_engine] = std::move(a_validator);
}

ISchemaValidator &
SchemaServiceFactory::getValidator(const std::string &a_engine) {
  return resolveValidator(a_engine);
}

// ── Convenience ─────────────────────────────────────────────────────────────

bool SchemaServiceFactory::hasCustomStorage(
    const std::string &a_engine) const {
  return m_storage.find(a_engine) != m_storage.end();
}

bool SchemaServiceFactory::hasCustomValidator(
    const std::string &a_engine) const {
  return m_validators.find(a_engine) != m_validators.end();
}

// ── Resolution ──────────────────────────────────────────────────────────────

ISchemaStorage &SchemaServiceFactory::resolveStorage(
    const std::string &a_engine) const {

  // Empty or "native" → always use default
  if (!a_engine.empty() && a_engine != "native") {
    auto it = m_storage.find(a_engine);
    if (it != m_storage.end())
      return *(it->second);
  }

  if (!m_default_engine.empty()) {
    return *m_storage.at(m_default_engine);
  }
  EXCEPT_PARAM(INTERNAL_ERROR,
         "SchemaServiceFactory: no storage available for engine '" << a_engine << "' and no default storage set");
}

ISchemaValidator &SchemaServiceFactory::resolveValidator(
    const std::string &a_engine) const {

  if (!a_engine.empty() && a_engine != "native") {
    auto it = m_validators.find(a_engine);
    if (it != m_validators.end())
      return *(it->second);
  }

  if (!m_default_engine.empty()) {
    return *m_validators.at(m_default_engine);
  }

  EXCEPT_PARAM(INTERNAL_ERROR,
         "SchemaServiceFactory: no validator available for engine '" << a_engine << "' and no default validator set");
}

} // namespace Core
} // namespace SDMS
