// Local private includes
#include "SocketTranslator.hpp"

// Local public includes
#include "ISocket.hpp"
#include "SocketOptions.hpp"
#include "TraceException.hpp"

// Standard includes
#include <unordered_map>

namespace SDMS {

	namespace {


    std::unordered_map<SocketClassType,
      std::unordered_map<SocketCommunicationType,
      std::unordered_map<SocketDirectionalityType, int>>> getCategorizer() {


        std::unordered_map<SocketClassType,
          std::unordered_map<SocketCommunicationType,
          std::unordered_map<SocketDirectionalityType, int>>> categorizer;
        categorizer[SocketClassType::CLIENT][SocketCommunicationType::SYNCHRONOUS][SocketDirectionalityType::BIDIRECTIONAL] = ZMQ_REQ;
        categorizer[SocketClassType::CLIENT][SocketCommunicationType::ASYNCHRONOUS][SocketDirectionalityType::UNIDIRECTIONAL] = ZMQ_SUB;
        categorizer[SocketClassType::CLIENT][SocketCommunicationType::ASYNCHRONOUS][SocketDirectionalityType::BIDIRECTIONAL]= ZMQ_DEALER;
        categorizer[SocketClassType::SERVER][SocketCommunicationType::SYNCHRONOUS][SocketDirectionalityType::BIDIRECTIONAL]= ZMQ_REP;
        categorizer[SocketClassType::SERVER][SocketCommunicationType::ASYNCHRONOUS][SocketDirectionalityType::UNIDIRECTIONAL]= ZMQ_PUB;
        categorizer[SocketClassType::SERVER][SocketCommunicationType::ASYNCHRONOUS][SocketDirectionalityType::BIDIRECTIONAL]= ZMQ_ROUTER;

        return categorizer;
      }
  }

	int translateToZMQSocket(ISocket * socket) {

	  const auto categorizer = getCategorizer();

		const auto class_type = socket->getSocketClassType();
		const auto communication_type = socket->getSocketCommunicationType();
		const auto direction_type = socket->getSocketDirectionalityType();

		if( categorizer.at(class_type).at(communication_type).count(direction_type) == 0){
			EXCEPT( 1, "Unsupported socket type specified.");
		}

		return categorizer.at(class_type).at(communication_type).at(direction_type);
	}

	int translateToZMQSocket(const SocketOptions & options) {

	  const auto categorizer = getCategorizer();
		if( categorizer.at(options.class_type).at(options.communication_type).count(options.direction_type) == 0){
			EXCEPT( 1, "Unsupported socket type specified.");
		}

		return categorizer.at(options.class_type).at(options.communication_type).at(options.direction_type);
	}

}
