
#ifndef PUBLICKEYTYPES_HPP
#define PUBLICKEYTYPES_HPP
#pragma once

// Standard includes
#include <cstddef>

namespace SDMS {
namespace MockCore {

enum class PublicKeyType { TRANSIENT, SESSION, PERSISTENT };

struct PublicKeyTypesClassHash {
  template <typename T> std::size_t operator()(T t) const {
    return static_cast<std::size_t>(t);
  }
};

} // namespace MockCore
} // namespace SDMS
#endif // PUBLICKEYTYPES
