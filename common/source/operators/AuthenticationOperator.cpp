
// Local private includes
#include "AuthenticationOperator.hpp"

// Local public includes
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
  if (m_authentication_manager->hasKey(key)) {
    m_authentication_manager->incrementKeyAccessCounter(key);
    uid = m_authentication_manager->getUID(key);
  }
  std::cout << "AuthenticationOperator: uid is anon if not found " << uid
            << " key is " << key << std::endl;
  message.set(MessageAttribute::ID, uid);
}

} // namespace SDMS
