// Local pubic includes
#include "common/CppTypes.hpp"

// Standard includes
#include <string>
#include <unordered_map>

namespace SDMS {

std::unordered_map<CppType, std::string> cpp_enum_type_to_string = {
    {CppType::cpp_double, "double"},
    {CppType::cpp_string, "string"},
    {CppType::cpp_uint32_t, "uint32_t"},
    {CppType::cpp_uint64_t, "uint64_t"},
    {CppType::cpp_char, "char"}};

}
