
#ifndef CONDITION_HPP
#define CONDITION_HPP
#pragma once

// Local includes
#include "AuthMap.hpp"
#include "PublicKeyTypes.hpp"

// Standard includes
#include <any>

namespace SDMS {
namespace Core {

enum class ConditionType {
  PROMOTION_TO_SESSION_AND_PURGE_FROM_TRANSIENT,
  RESET_IF_ACCESSED_ELSE_PURGE,
};

class Condition {
public:
  virtual ConditionType type() const noexcept = 0;
  virtual void enforce(AuthMap &auth_map, const std::string &public_key) = 0;
  virtual ~Condition() {};
};

class Promote : public Condition {
private:
  size_t m_transient_to_session_count_threshold = 0;
  PublicKeyType m_promote_from;
  PublicKeyType m_promote_to;

public:
  Promote(const size_t access_attempts, const PublicKeyType promote_from,
          const PublicKeyType promote_to)
      : m_transient_to_session_count_threshold(access_attempts),
        m_promote_from(promote_from), m_promote_to(promote_to){};

  virtual ConditionType type() const noexcept final {
    return ConditionType::PROMOTION_TO_SESSION_AND_PURGE_FROM_TRANSIENT;
  }

  virtual void enforce(AuthMap &auth_map, const std::string &public_key) final;
  virtual ~Promote() {};
};

class Reset : public Condition {
private:
  size_t m_access_attempts = 0;
  PublicKeyType m_act_on_key_type;

public:
  Reset(const size_t access_attempts, const PublicKeyType key_type)
      : m_access_attempts(access_attempts), m_act_on_key_type(key_type){};

  virtual ConditionType type() const noexcept final {
    return ConditionType::RESET_IF_ACCESSED_ELSE_PURGE;
  }

  virtual void enforce(AuthMap &auth_map, const std::string &public_key) final;
  virtual ~Reset() {};
};

} // namespace Core
} // namespace SDMS
#endif // CONDITION_HPP
