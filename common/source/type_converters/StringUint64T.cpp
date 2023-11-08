
// Local private includes
#include "StringUint64T.hpp"

// Local public includes
#include "common/TraceException.hpp"

// Third party includes
#include <boost/lexical_cast.hpp>

// Standard includes
#include <any>
#include <string>

namespace SDMS {

std::any StringUint64T::convert(std::any input) {
  std::string input_str;
  try {
    input_str = std::any_cast<std::string>(input);
  } catch (const std::bad_any_cast &e) {
    std::string error_msg = "Failed to cast from an any which is supposed ";
    error_msg += "to be a string.";
    EXCEPT(1, error_msg);
  }

  // Sanitize the string

  uint32_t output;
  try {
    output = boost::lexical_cast<uint64_t>(input_str);
  } catch (const boost::bad_lexical_cast &e) {
    std::string error_msg = "Failed to cast from an any which is a string ";
    error_msg += "to a uint64_t. Boost error: ";
    error_msg += e.what();
    EXCEPT(1, error_msg);
  }
  return output;
}

} // namespace SDMS
