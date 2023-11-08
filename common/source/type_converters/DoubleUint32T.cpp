
// Local private includes
#include "DoubleUint32T.hpp"

// Local public includes
#include "common/TraceException.hpp"

// Third party includes
#include <boost/numeric/conversion/cast.hpp>
#include <boost/numeric/conversion/converter.hpp>

// Standard includes
#include <any>
#include <cmath>
#include <string>

namespace SDMS {

std::any DoubleUint32T::convert(std::any input) {
  double input_double;
  try {
    input_double = std::any_cast<double>(input);
  } catch (const std::bad_any_cast &e) {
    std::string error_msg = "Failed to cast from an any which is supposed ";
    error_msg += "to be a double.";
    EXCEPT(1, error_msg);
  }

  const double allowed_epsilon = 0.0001;
  if (input_double < allowed_epsilon * -1.0) {
    std::string error_msg = "Failed to convert double to uint32_t ";
    error_msg += "double is negative: " + std::to_string(input_double);
    error_msg += " and is larger in magnitude then the allowed epsilon ";
    error_msg += std::to_string(allowed_epsilon);
    EXCEPT_PARAM(1, error_msg << input_double);
  } else if (input_double < 0.0) {
    // If the input is negative but smaller then the epsilon assume it is 0
    return 0;
  }

  // Check to make sure that double is a whole number or else throw an error
  if (std::floor(input_double) != input_double) {

    // How small of a fraction is allowed in the rounding before triggering
    // an error. This is to account for how floating point operations affect
    // the pecision of the numbers stored in them. Note at this point we
    // know the double is positive
    double diff = input_double - std::floor(input_double);
    if (diff > allowed_epsilon) {
      std::string error_msg = "Failed to convert double to uint32_t ";
      error_msg += "double is not a whole number: ";
      error_msg += std::to_string(input_double);
      error_msg += " and is larger than allowed ellowed epsilon value of: ";
      error_msg += std::to_string(allowed_epsilon);
      EXCEPT(1, error_msg);
    }
  }

  uint32_t output;

  try {
    output = boost::numeric_cast<uint32_t>(std::floor(input_double));
    // Don't need to account for negative overflow because we don't have a
    // negative number at this point
  } catch (const boost::numeric::positive_overflow &e) {
    std::string error_msg = "Failed to convert double to uint32_t, ";
    error_msg += "positive overflow has occurred, the double is too large ";
    error_msg += "input is: " + std::to_string(std::floor(input_double));
    EXCEPT(1, error_msg);
  } catch (const boost::numeric::bad_numeric_cast &e) {
    std::string error_msg = "Failed to convert double to uint32_t, ";
    error_msg += "general conversion error: ";
    EXCEPT_PARAM(1, error_msg << e.what());
  }

  return output;
}

} // namespace SDMS
