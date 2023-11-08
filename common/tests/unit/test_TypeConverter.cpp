#define BOOST_TEST_MAIN

#define BOOST_TEST_MODULE buffer
#include <boost/test/unit_test.hpp>

// Local public includes
#include "common/ITypeConverter.hpp"
#include "common/TraceException.hpp"
#include "common/TypeConverterFactory.hpp"

// Standard includes
#include <iostream>
#include <limits>

using namespace SDMS;

BOOST_AUTO_TEST_SUITE(TypeConverterTest)

BOOST_AUTO_TEST_CASE(testing_double_to_uint32_t) {
  TypeConverterFactory factory;
  auto converter = factory.create(CppType::cpp_double, CppType::cpp_uint32_t);
  std::any output_any;
  { // Should pass
    double input = 0.0;
    BOOST_CHECK_NO_THROW(output_any = converter->convert(input));
    uint32_t output = std::any_cast<uint32_t>(output_any);
    BOOST_CHECK(output == 0);
  }
  { // Should pass
    double input = 4294967295.0;
    BOOST_CHECK_NO_THROW(output_any = converter->convert(input));
    uint32_t output = std::any_cast<uint32_t>(output_any);
    BOOST_CHECK(output == 4294967295);
  }
  { // Should throw
    double input = 4294967295.0 + 1;
    BOOST_CHECK_THROW(converter->convert(input), TraceException);
  }
  { // Should throw
    double input = -0.1;
    BOOST_CHECK_THROW(converter->convert(input), TraceException);
  }
}

BOOST_AUTO_TEST_SUITE_END()
