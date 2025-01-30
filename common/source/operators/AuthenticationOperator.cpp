
// Local private includes
#include "AuthenticationOperator.hpp"

// Local public includes
#include "common/DynaLog.hpp"
#include "common/TraceException.hpp"

// Standard includes
#include <any>
#include <iostream>

namespace SDMS {

AuthenticationOperator::AuthenticationOperator(std::any &options) {
  try {
    m_authentication_manager = std::any_cast<IAuthenticationManager *>(options);
  } catch (std::bad_cast &error) {
    std::cerr << "Caught bad any cast in AuthenticationOperator constructor."
              << error.what() << std::endl;
  }
}

void AuthenticationOperator::execute(IMessage &message) {

  if (message.exists(MessageAttribute::KEY) == 0) {
    EXCEPT(1, "'KEY' attribute not defined.");
  }

  m_authentication_manager->purge();

  std::string key = std::get<std::string>(message.get(MessageAttribute::KEY));

  std::string uid = "anon";

  LogContext log_context;
  log_context.thread_name = "authentication_manager";
  log_context.thread_id = 0;
  log_context.correlation_id = std::get<std::string>(
            message.get(MessageAttribute::CORRELATION_ID));

  if (m_authentication_manager->hasKey(key)) {
    m_authentication_manager->incrementKeyAccessCounter(key);
    uid = m_authentication_manager->getUID(key);
  }
  DL_INFO(log_context, "Attempt to map key to " << key << " uid set to: " << uid );
  message.set(MessageAttribute::ID, uid);
}

} // namespace SDMS
