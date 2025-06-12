#ifndef ROUTERBOOKKEEPING_OPERATOR_HPP
#define ROUTERBOOKKEEPING_OPERATOR_HPP
#pragma once

// Local includes
#include "common/IMessage.hpp"
#include "common/IOperator.hpp"
#include "common/OperatorTypes.hpp"

// Standard includes
#include <any>

namespace SDMS {

class RouterBookKeepingOperator : public IOperator {
  /**
   * Because ZMQ does some things differently depending on whether communication
   * is between a ROUTER DEALER vs some other combination this operator is
   * needed, to add the router identity in cases where the ROUTER dealer
   * combination is not being used
   **/
public:

  virtual ~RouterBookKeepingOperator(){};

  explicit RouterBookKeepingOperator(std::any options);

  static std::unique_ptr<IOperator> create(std::any options);

private:
  std::string m_client_socket_id;

  virtual OperatorType type() const noexcept final {
    return OperatorType::RouterBookKeeping;
  }

  virtual void execute(IMessage &message) final;
};

inline std::unique_ptr<IOperator>
RouterBookKeepingOperator::create(std::any options) {
  return std::make_unique<RouterBookKeepingOperator>(options);
}

} // namespace SDMS

#endif // ROUTERBOOKKEEPING_OPERATOR_HPP
