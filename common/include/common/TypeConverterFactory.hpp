#ifndef TYPECONVERTER_FACTORY_HPP
#define TYPECONVERTER_FACTORY_HPP
#pragma once

// Local includes
#include "CppTypes.hpp"
#include "ITypeConverter.hpp"

// Standard includes
#include <any>
#include <memory>
#include <unordered_map>

namespace SDMS {

class TypeConverterFactory {
public:
  using ConverterCreateMethod = std::unique_ptr<ITypeConverter> (*)();

private:
  static std::unordered_map<CppType, 
    std::unordered_map<CppType, ConverterCreateMethod>>
      m_create_methods;

public:
  TypeConverterFactory();
  /**
   * To register an operator you need to run this command with the factory.
   *
   * ```C++
   * TypeConverterFactory factory;
   * factory.register<StringUint32T,CppType::cpp_string,CppType::cpp_uint32_t>();
   * ```
   **/
  template <class T, CppType from_type, CppType to_type> static bool registerTypeConverter() {
    if (m_create_methods.count(from_type) > 0) {
      if (m_create_methods[from_type].count(to_type) > 0) {
        return false;
      }
    } 
    m_create_methods[from_type][to_type] = T::create;
    
    return true;
  }

  std::unique_ptr<ITypeConverter> create(const CppType from_type,
                                    const CppType to_type) const;
};

} // namespace SDMS

#endif // TYPECONVERTER_FACTORY_HPP
