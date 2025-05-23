#ifndef AUTHENTICATION_OPERATOR_HPP
#define AUTHENTICATION_OPERATOR_HPP
#pragma once

// Local includes
#include "common/IAuthenticationManager.hpp"
#include "common/IMessage.hpp"
#include "common/IOperator.hpp"
#include "common/OperatorTypes.hpp"

// Standard includes
#include <any>
#include <memory>

namespace SDMS {

class AuthenticationOperator : public IOperator {
  /**
   * Authentication Operator
   *
   * This class is designed to look at a msg buffer instance when the execute
   * command is called. It will check to see if the msg buffer is associated
   * with an authenticated user. It does this by:
   *
   * 1. Assuming that the UID stored in the MsgBuf is actually a public key.
   * 2. Comparing the public key in the MsgBuf with known keys in the Operator
   * 3. If the key is validated as an authenticated user then the UID of the
   * MsgBuf instance is updated with the user id.
   * If the key is not valid, or a uid instead of a public key is passed in,
   * then it is is prefixed with anon_ and elsewhere in the code an anonymous
   * authentication flow is run.
   *
   * In addition to checking the public key and mapping it to a user id the
   * operator will count the number of times the key is accessed (If it is
   * known).
   **/
public:
  explicit AuthenticationOperator(std::any &options);
  explicit AuthenticationOperator(IAuthenticationManager &auth_manager)
      : m_authentication_manager(&auth_manager){};
  static std::unique_ptr<IOperator> create(std::any options);

  virtual ~AuthenticationOperator() {};
private:
  IAuthenticationManager *m_authentication_manager;

  virtual OperatorType type() const noexcept final {
    return OperatorType::Authenticator;
  }

  virtual void execute(IMessage &message) final;
};

inline std::unique_ptr<IOperator>
AuthenticationOperator::create(std::any options) {
  return std::make_unique<AuthenticationOperator>(options);
}
} // namespace SDMS

#endif // AUTHENTICATION_OPERATOR_HPP
