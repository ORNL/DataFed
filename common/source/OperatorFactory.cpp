
// Local private includes
#include "operators/AuthenticationOperator.hpp"
#include "operators/RouterBookKeepingOperator.hpp"

// Local public includes
#include "OperatorFactory.hpp"

// Standard includes
#include <any>
#include <memory>

namespace SDMS {

std::unordered_map<OperatorType,OperatorFactory::OperatorCreateMethod>
    OperatorFactory::m_create_methods;

	OperatorFactory::OperatorFactory() {
		registerOperator<AuthenticationOperator,OperatorType::Authenticator>();	
		registerOperator<RouterBookKeepingOperator,OperatorType::RouterBookKeeping>();	
	}

  std::unique_ptr<IOperator> OperatorFactory::create(const OperatorType type, std::any & options ) const {
		if( m_create_methods.count(type) ){
			return m_create_methods[type](options);
		}
    return std::unique_ptr<IOperator>();
  }

} // namespace SDMS
