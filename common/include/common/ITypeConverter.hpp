#ifndef ITYPE_CONVERTER_HPP
#define ITYPE_CONVERTER_HPP
#pragma once

// Local public includes
#include "CppTypes.hpp"

// Standard includes
#include <any>
#include <string>

namespace SDMS {

/**
 * Convert between any two C++ types throw an error if there is a problem
 **/
class ITypeConverter {

public:
  // The name of the type we are converting to
  virtual std::string to() const noexcept = 0;
  virtual CppType toType() const noexcept = 0;

  // The name of the type we will convert from
  virtual std::string from() const noexcept = 0;
  virtual CppType fromType() const noexcept = 0;

  virtual std::any convert(std::any) = 0;
};
} // namespace SDMS

#endif // ITYPE_CONVERTER_HPP
