#ifndef OPERATOR_FACTORY_HPP
#define OPERATOR_FACTORY_HPP
#pragma once

// Local includes
#include "IOperator.hpp"
#include "OperatorTypes.hpp"

// Standard includes
#include <any>
#include <memory>
#include <unordered_map>

namespace SDMS {

class OperatorFactory {
public:
  using OperatorCreateMethod = std::unique_ptr<IOperator> (*)(std::any);

private:
  static std::unordered_map<OperatorType, OperatorCreateMethod>
      m_create_methods;

public:
  OperatorFactory();
  /**
   * To register an operator you need to run this command with the factory.
   *
   * ```C++
   * OperatorFactory factory;
   * factory.register<RouterBookKeepingOperator,OperatorType::RouterBookKeeping>();
   * ```
   **/
  template <class T, OperatorType oper_type> static bool registerOperator() {
    if (m_create_methods.count(oper_type) > 0) {
      return false;
    } else {
      m_create_methods[oper_type] = T::create;
    }
    return true;
  }

  std::unique_ptr<IOperator> create(const OperatorType,
                                    std::any &arguments) const;
};

} // namespace SDMS

#endif // OPERATOR_FACTORY_HPP
