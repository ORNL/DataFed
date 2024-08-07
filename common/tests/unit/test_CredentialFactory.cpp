#define BOOST_TEST_MAIN

#define BOOST_TEST_MODULE credential_factory
#include <boost/test/unit_test.hpp>
// Local public includes
#include "common/CredentialFactory.hpp"
#include "common/DynaLog.hpp"
#include "common/ICredentials.hpp"
#include "common/ProtocolTypes.hpp"

// Standard includes
#include <iostream>
#include <string>
#include <unordered_map>

using namespace SDMS;

BOOST_AUTO_TEST_SUITE(CredentialFactoryTest)

BOOST_AUTO_TEST_CASE(testing_CredentialFactory) {

  std::cout << "\n*****************************" << std::endl;
  std::cout << "Starting insecure test" << std::endl;
  CredentialFactory cred_factory;
  
  std::unordered_map<CredentialType, std::string> cred_options; 
  auto credentials = cred_factory.create(ProtocolType::HTTP, cred_options);
  BOOST_CHECK(credentials->getType() == ProtocolType::HTTP);

}

BOOST_AUTO_TEST_SUITE_END()

