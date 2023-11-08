#ifndef CPP_TYPES_HPP
#define CPP_TYPES_HPP
#pragma once

// Standard includes
#include <string>
#include <unordered_map>

namespace SDMS {


enum class CppType { 
cpp_double,
cpp_string,
cpp_uint32_t,
cpp_uint64_t,
cpp_char 
};
extern std::unordered_map<CppType, std::string> cpp_enum_type_to_string;

}

#endif // CPP_TYPES_HPP
