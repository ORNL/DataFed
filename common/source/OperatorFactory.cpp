
// Local private includes
#include "operators/AuthenticationOperator.hpp"
#include "operators/RouterBookKeepingOperator.hpp"

// Local public includes
#include "OperatorFactory.hpp"

// Standard includes
#include <any>
#include <memory>

namespace SDMS {

  std::unique_ptr<IOperator> OperatorFactory::create(const OperatorType type, std::any & options ) const {

    if( type == OperatorType::Authenticator ) {
      return std::make_unique<AuthenticationOperator>(options); 
    } else if(type == OperatorType::RouterBookKeeping ) {
      return std::make_unique<RouterBookKeepingOperator>(options); 
    }
    return std::unique_ptr<IOperator>();
  }

} // namespace SDMS
