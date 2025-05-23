#ifndef IOPERATOR_HPP
#define IOPERATOR_HPP
#pragma once

// Local includes
#include "OperatorTypes.hpp"

namespace SDMS {

class IMessage;

class IOperator {
public:

  virtual ~IOperator() {};
  virtual OperatorType type() const noexcept = 0;
  virtual void execute(IMessage &message) = 0;
};

} // namespace SDMS

#endif // IOPERATOR_HPP
