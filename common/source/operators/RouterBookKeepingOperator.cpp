
// Local private includes
#include "RouterBookKeepingOperator.hpp"

// Local public includes
#include "common/TraceException.hpp"

// Standard includes
#include <any>
#include <iostream>

namespace SDMS {

RouterBookKeepingOperator::RouterBookKeepingOperator(std::any options) {
  try {
    m_client_socket_id = std::any_cast<std::string>(options);
    if (m_client_socket_id.size() == 0) {
      EXCEPT(1, "Cannot use a null identity for RouterBookKeepingOperator");
    }
  } catch (std::bad_cast &error) {
    std::cerr << "Caught bad any cast in RouterBookKeepingOperator constructor."
              << error.what() << std::endl;
  }
}

void RouterBookKeepingOperator::execute(IMessage &message) {
  message.getRoutes().push_front(m_client_socket_id);
}

} // namespace SDMS
