#ifndef DOUBLE_UINT32_T_HPP
#define DOUBLE_UINT32_T_HPP
#pragma once

// Local public includes
#include "common/CppTypes.hpp"
#include "common/ITypeConverter.hpp"

// Standard includes
#include <any>
#include <memory>
#include <string>

namespace SDMS {

class DoubleUint32T : public ITypeConverter {

public:
  virtual std::string to() const noexcept final {
    return cpp_enum_type_to_string[toType()];
  }
  virtual CppType toType() const noexcept final {
    return CppType::cpp_uint32_t;
  }

  virtual std::string from() const noexcept final {
    return cpp_enum_type_to_string[fromType()];
  }
  virtual CppType fromType() const noexcept final {
    return CppType::cpp_double;
  }

  std::any convert(std::any) final;

  static std::unique_ptr<ITypeConverter> create();
};

inline std::unique_ptr<ITypeConverter> DoubleUint32T::create() {
  return std::make_unique<DoubleUint32T>();
}

} // namespace SDMS

#endif // DOUBLE_UINT32_T_HPP
