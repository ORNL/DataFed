#ifndef OPERATOR_FACTORY_HPP
#define OPERATOR_FACTORY_HPP
#pragma once

// Local includes
#include "IOperator.hpp"
#include "OperatorTypes.hpp"

// Standard includes
#include <any>
#include <memory>

namespace SDMS {

class OperatorFactory {
  public:
    std::unique_ptr<IOperator> create(const OperatorType, std::any & arguments) const;
};

} // namespace SDMS

#endif // OPERATOR_FACTORY_HPP
