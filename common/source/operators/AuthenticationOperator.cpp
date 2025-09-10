
// Local private includes
#include "AuthenticationOperator.hpp"

// Local public includes
#include "common/TraceException.hpp"

// Standard includes
#include <any>

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
  if (m_authentication_manager->hasKey(key)) {
    m_authentication_manager->incrementKeyAccessCounter(key);
    
    try {
      uid = m_authentication_manager->getUID(key);
    } catch (const std::exception& e) {
      // Keep uid as "anon" if we fail to get the actual UID
    }
  }
  
  message.set(MessageAttribute::ID, uid);
}

} // namespace SDMS
