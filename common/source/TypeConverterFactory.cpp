
// Local private includes
#include "type_converters/DoubleUint32T.hpp"
#include "type_converters/StringUint32T.hpp"
#include "type_converters/StringUint64T.hpp"

// Local public includes
#include "common/CppTypes.hpp"
#include "common/TraceException.hpp"
#include "common/TypeConverterFactory.hpp"

// Standard includes
#include <any>
#include <memory>

namespace SDMS {

std::unordered_map<
    CppType,
    std::unordered_map<CppType, TypeConverterFactory::ConverterCreateMethod>>
    TypeConverterFactory::m_create_methods;

TypeConverterFactory::TypeConverterFactory() {
  registerTypeConverter<StringUint32T, CppType::cpp_string,
                        CppType::cpp_uint32_t>();
  registerTypeConverter<StringUint64T, CppType::cpp_string,
                        CppType::cpp_uint64_t>();
  registerTypeConverter<DoubleUint32T, CppType::cpp_double,
                        CppType::cpp_uint32_t>();
}

std::unique_ptr<ITypeConverter>
TypeConverterFactory::create(const CppType from_type,
                             const CppType to_type) const {

  if (m_create_methods.count(from_type)) {
    if (m_create_methods[from_type].count(to_type)) {
      return m_create_methods[from_type][to_type]();
    }
  }

  std::string error_msg = "There are no registered type converters for the ";
  error_msg += "requested types and conversion direction.";
  error_msg += "\nFrom " + cpp_enum_type_to_string[from_type] + " -> To: ";
  error_msg += cpp_enum_type_to_string[to_type];
  EXCEPT(1, error_msg);

  return std::unique_ptr<ITypeConverter>();
}

} // namespace SDMS
