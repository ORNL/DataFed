#ifndef DATAFED_COMMON_TEST_HPP
#define DATAFED_COMMON_TEST_HPP
#pragma once

#include "passkey.hpp"
/**
 * Simple class simply for testing using passkey
 **/
namespace datafed {
  class Test {
    public:
      inline const PassKey<Test> key() const { return PassKey<Test>(); }
  };
}

#endif // DATAFED_COMMON_TEST_HPP
