
#include "SchemaServiceFactory.hpp"
#include "common/TraceException.hpp"
#include "common/envelope.pb.h"

namespace SDMS {
namespace Core {

// ── Storage Registry ────────────────────────────────────────────────────────

void SchemaServiceFactory::setDefaultStorage(
    std::shared_ptr<ISchemaStorage> a_storage) {
  m_default_storage = std::move(a_storage);
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

void SchemaServiceFactory::setDefaultValidator(
    std::shared_ptr<ISchemaValidator> a_validator) {
  m_default_validator = std::move(a_validator);
}

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

  if (m_default_storage)
    return *m_default_storage;

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

  if (m_default_validator)
    return *m_default_validator;

  EXCEPT_PARAM(INTERNAL_ERROR,
         "SchemaServiceFactory: no validator available for engine '" << a_engine << "' and no default validator set");
}

} // namespace Core
} // namespace SDMS
