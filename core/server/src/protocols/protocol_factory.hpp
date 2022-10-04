
#include "protocol.hpp"

// Standard includes
#include <memory>

namespace datafed {

  class ProtocolFactory {
    std::unique_ptr<Protocol> create(const PROTOCOL_TYPE);
  };
}
