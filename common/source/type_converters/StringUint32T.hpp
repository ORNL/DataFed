#ifndef STRING_UINT32_T_HPP
#define STRING_UINT32_T_HPP
#pragma once

// Local public includes
#include "common/CppTypes.hpp"
#include "common/ITypeConverter.hpp"

// Standard includes
#include <any>
#include <memory>
#include <string>

namespace SDMS {

  class StringUint32T : public ITypeConverter {


    public:

      virtual CppType toType() const noexcept final {
        return CppType::cpp_uint32_t;
      }

      virtual std::string to() const noexcept final {
        return cpp_enum_type_to_string[toType()];
      }

      virtual CppType fromType() const noexcept final {
        return CppType::cpp_string;
      }

      virtual std::string from() const noexcept final {
        return cpp_enum_type_to_string[fromType()];
      }

      std::any convert(std::any) final;

  
      static std::unique_ptr<ITypeConverter> create();
  };

  inline std::unique_ptr<ITypeConverter>
  StringUint32T::create() {
    return std::make_unique<StringUint32T>();
  }

}

#endif // STRING_UINT32_T_HPP 
