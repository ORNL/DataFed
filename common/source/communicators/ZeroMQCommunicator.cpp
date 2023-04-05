// Local private includes
#include "ZeroMQCommunicator.hpp"
#include "Frame.hpp"
#include "ProtoBufFactory.hpp"
#include "ProtoBufMap.hpp"
#include "support/zeromq/Context.hpp"
#include "support/zeromq/SocketTranslator.hpp"

// Local public includes
#include "IMessage.hpp"
#include "ISocket.hpp"
#include "SocketFactory.hpp"
#include "SocketOptions.hpp"

// Third party includes
#include <boost/range/adaptor/reversed.hpp>
#include <zmq.hpp>

// Standard includes
#include <arpa/inet.h>
#include <string>
#include <unordered_map>

using namespace zmq;
namespace proto = ::google::protobuf;

namespace SDMS {

  using namespace constants::message::google;

  /******************************************************************************
   * Local File Scoped Functions
   ******************************************************************************/
  namespace {


    void sendDelimiter(void * outgoing_zmq_socket) {
      // Send NULL delimiter
      zmq_msg_t zmq_msg;
      zmq_msg_init( &zmq_msg );
      int number_of_bytes = 0;
      if (( number_of_bytes = zmq_msg_send( &zmq_msg, outgoing_zmq_socket, ZMQ_SNDMORE )) < 0 ) {
        EXCEPT( 1, "zmq_msg_send (delimiter) failed." );
      }
      //std::cout << "sendDeliminter number of bytes" << number_of_bytes << std::endl;
      //std::cout << "null" << std::endl;
      zmq_msg_close( &zmq_msg );
    }

    void sendFinalDelimiter(void * outgoing_zmq_socket) {
      // Send NULL delimiter
      zmq_msg_t zmq_msg;
      zmq_msg_init( &zmq_msg );
      int number_of_bytes = 0;
      // INDICATES no more parts
      if (( number_of_bytes = zmq_msg_send( &zmq_msg, outgoing_zmq_socket, 0 )) < 0 ) {
        EXCEPT( 1, "zmq_msg_send (delimiter) failed." );
      }
      //std::cout << "sendDeliminter number of bytes" << number_of_bytes << std::endl;
      //std::cout << "null" << std::endl;
      zmq_msg_close( &zmq_msg );
    }
    /** Note exactly sure what information is in the route? Or even if this is being
     * used anywhere?
     *
     *  uint8_t max value is 255 min value is 0
     *  i.e.
     *
     * The first byte in the route is the number of items in the route
     * The second byte in the route is the number of characters in the following
     * item.
     *
     * Step 1 - When msg1 comes in: 
     *
     *    msg1 = bob where len = 3
     *
     *    bytes in route array
     *    array elem: [0] = 1       Address: 0000  '1'
     *    array elem: [1] = 3       Address: 0001  '3'
     *    array elem: [2] = "bob"   Address: 0002  'b'
     *                              Address: 0003  'o'
     *                              Address: 0004  'b'
     *
     **/
 /*   void receiveRoute(MsgBuf & a_msg_buf, void * incoming_zmq_socket) {
      uint8_t * route = a_msg_buf.getRouteBuffer();
      uint8_t * rptr = route + 1;

      // *route = 0;

      while ( 1 )
      {
        zmq_msg_t msg;
        zmq_msg_init( &msg );

        int number_of_bytes = 0;
        if (( number_of_bytes = zmq_msg_recv( &msg, incoming_zmq_socket, ZMQ_DONTWAIT )) < 0 ) {
          EXCEPT( 1, "zmq_msg_recv (route) failed." );
        }

        size_t len = zmq_msg_size( &msg );
        std::cout << "Len is " << len << std::endl;

        // Stop when delimiter is read
        if ( !len ) break;

        if ( len > 255 ) {
          EXCEPT( 1, "Message route segment max len exceeded." );
        }

        if ((( rptr + len ) - route ) > MAX_ROUTE_LEN ) {
          EXCEPT( 1, "Message route total max len exceeded." );
        }

        *rptr = (uint8_t) len;
        size_t str_len = reinterpret_cast<size_t>(len);
        std::string rec = std::string((char*) zmq_msg_data(&msg), zmq_msg_size(&msg));
        std::cout << "Data is of size " << zmq_msg_size(&msg) << std::endl;
        memcpy( rptr + 1, (char *)zmq_msg_data( &msg ), len );

        std::cout << __FILE__ << ":" << __LINE__ << std::endl;
        zmq_msg_close( &msg );
        //(*route)++;

        std::cout << __FILE__ << ":" << __LINE__ << std::endl;
        // Because *rptr is pointing to byte that indicates the number of 
        // chars that were used copied into the array i.e. in our bob example
        // above the below line would change to
        //
        // rptr with is an address
        //
        // 0001 = 0001 + 3 + 1
        // The new address would be 0005
        rptr += *rptr + 1;
        std::cout << __FILE__ << ":" << __LINE__ << std::endl;
      }
    }*/

    /**
     * The only time we can expect an additional prefixed message is if the
     * server is of the ROUTER type.
     **/
          // null
          // "BEGIN DATAFED" - String
          // 0 - number of routes
          // null
          // Frame starts here - function will not read
          //
          // If there was a route
          //
          // null
          // "BEGIN DATAFED" - String
          // 1 - number of routes
          // Route 1
          // null
          // Frame - function will not read
          //
          // Or
          //
          // null
          // "BEGIN DATAFED" - String
          // 2 - number of routes
          // Route 1
          // Route 2
          // null
          // Frame - function will not read
          //
          // Or
          //
          // Route 1
          // null
          // "BEGIN DATAFED" - String
          // - number of routes
          // Route 2
          // Route 3
          // null
          // Frame - function will not read
          //
          // Or
          //
          // Route 1
          // null
          // "BEGIN DATAFED" - String
          // 0 - number of routes
          // null
          // Frame - function will not read
    void receiveRoute(IMessage & msg, void * incoming_zmq_socket, const int zmq_socket_type) {

      // Number of delimiters in routing section
      //int number_of_delimiters = 0;
      //if( zmq_socket_type == ZMQ_ROUTER ) {
     //   number_of_delimiters = 1;
      //}
    
      // If the first frame is not empty assume it is a route that was provided by the internals of zmq
      std::string previous_route = "";
      bool zmq_provided_route_detected = false;
      std::string received_part = "";
      while ( received_part.compare("BEGIN_DATAFED")!=0 ){
        zmq_msg_t zmq_msg;
        zmq_msg_init( &zmq_msg );
        int number_of_bytes = 0;
        if (( number_of_bytes = zmq_msg_recv( &zmq_msg, incoming_zmq_socket, ZMQ_DONTWAIT )) < 0 ) {
          EXCEPT( 1, "receiveRoute zmq_msg_recv (route) failed." );
        }
        size_t len = zmq_msg_size( &zmq_msg );
        //std::cout << "Initial message part size " << len << std::endl;
        if(len) {
          if ( len > 255 ) {
            EXCEPT( 1, "Message route segment exceeds max allowed length." );
          }
          zmq_provided_route_detected = true;
          received_part = std::string((char*) zmq_msg_data(&zmq_msg), zmq_msg_size(&zmq_msg));
          if(received_part.compare("BEGIN_DATAFED") == 0 ) {
            //std::cout << "BEGIN_DATAFED" << std::endl;
            zmq_msg_close( &zmq_msg );
            break;
          } else {
            previous_route = received_part;
            std::cout << received_part << std::endl;
            msg.addRoute(received_part);
          }
        } else {
          //std::cout << "null" << std::endl;
        }
        zmq_msg_close( &zmq_msg );
      }

      // This will mean that the following message part should be a null frame
      /*if( zmq_provided_route_detected ){
        zmq_msg_t zmq_msg;
        zmq_msg_init( &zmq_msg );
        int number_of_bytes = 0;
        if (( number_of_bytes = zmq_msg_recv( &zmq_msg, incoming_zmq_socket, ZMQ_DONTWAIT )) < 0 ) {
          EXCEPT( 1, "receiveRoute zmq_msg_recv (route) failed." );
        }
        size_t len = zmq_msg_size( &zmq_msg );
        if(len != 0) {
            std::string val((char*) zmq_msg_data(&zmq_msg), zmq_msg_size(&zmq_msg));
            std::cout << "null" << " - should be null has size = " << len << " val is " << val << std::endl;
            EXCEPT( 1, "Expected a null frame following zmq_provided socket identifier." );
        } else {
          std::cout << "null" <<  std::endl;
        }
        zmq_msg_close( &zmq_msg );
      }*/

      // The next message should be a number indicating how many additional routes will follow
      //std::cout << "receiveRoute number of expected deliminters " << number_of_delimiters << std::endl;
      uint32_t number_of_routes = 0;
      {
        zmq_msg_t zmq_msg;
        zmq_msg_init( &zmq_msg );
        int number_of_bytes = 0;
        if (( number_of_bytes = zmq_msg_recv( &zmq_msg, incoming_zmq_socket, ZMQ_DONTWAIT )) < 0 ) {
          EXCEPT( 1, "receiveRoute zmq_msg_recv (route) failed." );
        }
        size_t len = zmq_msg_size( &zmq_msg );

        //std::cout << "Should be receiving a uint32_t " << len << " size of uint32_t shoudl be " << sizeof(uint32_t) << std::endl;
        if(len != sizeof(uint32_t)) {
            EXCEPT( 1, "Expected a number indicating the number of routes to follow but nothing was provided." );
        }

        unsigned char * msg_router_count_allocation = (unsigned char *)zmq_msg_data( &zmq_msg );
        number_of_routes = ntohl( *((uint32_t*) msg_router_count_allocation) );
        //std::cout << number_of_routes << std::endl; 
        zmq_msg_close( &zmq_msg );
      }
      //std::cout << "Number of routes is " << number_of_routes << std::endl;
      // Start a while loop for the number of routes that have been indicated
      for(uint32_t route_i = 0; route_i < number_of_routes; ++route_i) {
        zmq_msg_t zmq_msg;
        zmq_msg_init( &zmq_msg );
        
        int number_of_bytes = 0;
        if (( number_of_bytes = zmq_msg_recv( &zmq_msg, incoming_zmq_socket, ZMQ_DONTWAIT )) < 0 ) {
          EXCEPT( 1, "receiveRoute zmq_msg_recv (route) failed." );
        }
        size_t len = zmq_msg_size( &zmq_msg );
        //std::cout << "Len is " << len << std::endl;

        // Stop when delimiter is read
        if ( len == 0) {
          EXCEPT( 1, "Message route should not be an empty message." );
        }

        if ( len > 255 ) {
          EXCEPT( 1, "Message route segment exceeds max allowed length." );
        }
        
        std::string new_route((char*) zmq_msg_data(&zmq_msg), zmq_msg_size(&zmq_msg));
        // Only add the next route if it has a different name
        if ( previous_route.compare(new_route) != 0 ) {
          msg.addRoute(new_route);
          previous_route = new_route;
        }
        //std::cout << new_route << std::endl;
        zmq_msg_close( &zmq_msg );
       
      }

      // Finally read the final empty frame
      {
        zmq_msg_t zmq_msg;
        zmq_msg_init( &zmq_msg );
        int number_of_bytes = 0;
        if (( number_of_bytes = zmq_msg_recv( &zmq_msg, incoming_zmq_socket, ZMQ_DONTWAIT )) < 0 ) {
          EXCEPT( 1, "receiveRoute zmq_msg_recv (route) failed." );
        }
        size_t len = zmq_msg_size( &zmq_msg );
        if(len != 0) {
            EXCEPT( 1, "Expected a null frame following route section." );
        }
        //std::cout << "null" << std::endl;
        zmq_msg_close( &zmq_msg );

      }
/*      int count = 0;
      std::string previous_route = "";
      while ( 1 ) {
        zmq_msg_t zmq_msg;
        zmq_msg_init( &zmq_msg );
        
        int number_of_bytes = 0;
        if (( number_of_bytes = zmq_msg_recv( &zmq_msg, incoming_zmq_socket, ZMQ_DONTWAIT )) < 0 ) {
          EXCEPT( 1, "receiveRoute zmq_msg_recv (route) failed." );
        }
        size_t len = zmq_msg_size( &zmq_msg );
        std::cout << "Len is " << len << std::endl;

        // Stop when delimiter is read
        if ( len ) {
          if ( len > 255 ) {
            EXCEPT( 1, "Message route segment exceeds max allowed length." );
          }
          
          std::string new_route((char*) zmq_msg_data(&zmq_msg), zmq_msg_size(&zmq_msg));
          // Only add the next route if it has a different name
          if ( previous_route.compare(new_route) != 0 ) {
            msg.addRoute(new_route);
            previous_route = new_route;
          }
          std::cout << "receiveRoute number of bytes " << number_of_bytes << " route " << msg.getRoutes().back() << std::endl;
          zmq_msg_close( &zmq_msg );
        } else { // Ignore two empty lines and then exits

          if ( count == number_of_delimiters ) {
            zmq_msg_close( &zmq_msg );
            break;
          } else {
            ++count;
            zmq_msg_close( &zmq_msg );
          }
        }
      } */
    }

    void sendRoute(IMessage & msg, void * outgoing_zmq_socket, const int zmq_socket_type) {


      // If this is a response then we need to attach the identity of the server that the response needs to be sent to
      auto routes = msg.getRoutes();

      // The ZMQ ROUTER always needs to know who to send too. 
      if( std::get<MessageState>(msg.get(MessageAttribute::STATE)) == MessageState::RESPONSE or zmq_socket_type == ZMQ_ROUTER) {
         // zmq_socket_type != ZMQ_ROUTER) {
        while(routes.size() != 0 ) {
            //          EXCEPT( 1, "Cannot generate response identity of client socket is unknown." );
            //        }

          auto route = routes.front();
          zmq_msg_t zmq_msg;
          zmq_msg_init_size( &zmq_msg, route.size() );

          //std::cout << route << std::endl;
          //std::cout << "sendRoute: attempting to send identity: " << route << " string size is " << route.size() << std::endl;
          memcpy( zmq_msg_data( &zmq_msg ), route.data(), route.size() );
          int number_of_bytes = 0;
          if (( number_of_bytes = zmq_msg_send( &zmq_msg, outgoing_zmq_socket, ZMQ_SNDMORE )) < 0 ) {
            EXCEPT( 1, "sendRoute zmq_msg_send (route) failed." );
          }
          //std::cout << "sendRoute number of bytes " << number_of_bytes << " route: " << route << std::endl;
          //std::cout << route << std::endl;

          zmq_msg_close( &zmq_msg );
          routes.pop_front();
        }
      }
      
      //std::cout << "Sending delimiter" << std::endl;
      sendDelimiter(outgoing_zmq_socket);
      { // Send header
        zmq_msg_t zmq_msg;
        std::string header = "BEGIN_DATAFED";
        zmq_msg_init_size( &zmq_msg, header.size() );
        memcpy( zmq_msg_data( &zmq_msg ), header.data(), header.size() );
        int number_of_bytes = 0;
        if (( number_of_bytes = zmq_msg_send( &zmq_msg, outgoing_zmq_socket, ZMQ_SNDMORE )) < 0 ) {
          EXCEPT( 1, "sendRoute count zmq_msg_send (route) failed." );
        }
        zmq_msg_close( &zmq_msg );
        //std::cout << header << std::endl;
      }

      {// Send number of routes
        uint32_t number_of_routes = routes.size();
        zmq_msg_t zmq_msg;
        zmq_msg_init_size( &zmq_msg, sizeof(uint32_t) );
        unsigned char * msg_route_count_allocation = (unsigned char *)zmq_msg_data( &zmq_msg );
        *((uint32_t*) msg_route_count_allocation) = htonl( number_of_routes );
        
        //std::cout << number_of_routes << " - number of routes" << std::endl;
        int number_of_bytes = 0;
        if (( number_of_bytes = zmq_msg_send( &zmq_msg, outgoing_zmq_socket, ZMQ_SNDMORE )) < 0 ) {
          EXCEPT( 1, "sendRoute count zmq_msg_send (route) failed." );
        }
        zmq_msg_close( &zmq_msg );
      }

      //     for (; route_index < routes.size(); ++route_index ) { //auto & route : msg.getRoutes() ) { 
      for( auto & route : routes ) {
        //        auto route = routes.at(route_index);

        if( route.size() == 0) {
          EXCEPT( 1, "sendRoute zmq_msg_send (route) failed. Cannot send a route of size 0" );
        }

        zmq_msg_t zmq_msg;
        zmq_msg_init_size( &zmq_msg, route.size() );

        //std::cout << "sendRoute: attempting to send identity: " << route << " string size is " << route.size() << std::endl;
        memcpy( zmq_msg_data( &zmq_msg ), route.data(), route.size() );
        int number_of_bytes = 0;
        if (( number_of_bytes = zmq_msg_send( &zmq_msg, outgoing_zmq_socket, ZMQ_SNDMORE )) < 0 ) {
          EXCEPT( 1, "sendRoute zmq_msg_send (route) failed." );
        }
        //std::cout << "sendRoute number of bytes " << number_of_bytes << " route: " << route << std::endl;
        //std::cout << route << std::endl;

        zmq_msg_close( &zmq_msg );
      } 

      sendDelimiter(outgoing_zmq_socket);
      //if( msg.getRoutes().size() == 0) {
        //std::cout << "No routes detected in message" << std::endl;
      //}
/*      if( msg.getRoutes().size() == 0) {
        sendDelimiter(outgoing_zmq_socket);
        
        sendDelimiter(outgoing_zmq_socket);
      } else {
        if( std::get<MessageState>(msg.get(MessageAttribute::STATE)) == MessageState::REQUEST and
            zmq_socket_type != ZMQ_ROUTER
            ) {
          sendDelimiter(outgoing_zmq_socket);
        }
//        for (auto & route : boost::adaptors::reverse(msg.getRoutes())) {
        for (auto & route : msg.getRoutes() ) { 

          if( route.size() == 0) {
            EXCEPT( 1, "sendRoute zmq_msg_send (route) failed. Cannot send a route of size 0" );
          }

          zmq_msg_t zmq_msg;
          zmq_msg_init_size( &zmq_msg, route.size() );

          //std::cout << "sendRoute: attempting to send identity: " << route << " string size is " << route.size() << std::endl;
          memcpy( zmq_msg_data( &zmq_msg ), route.data(), route.size() );
          int number_of_bytes = 0;
          if (( number_of_bytes = zmq_msg_send( &zmq_msg, outgoing_zmq_socket, ZMQ_SNDMORE )) < 0 ) {
            EXCEPT( 1, "sendRoute zmq_msg_send (route) failed." );
          }
          //std::cout << "sendRoute number of bytes " << number_of_bytes << " route: " << route << std::endl;
          //std::cout << route << std::endl;

          zmq_msg_close( &zmq_msg );
        } 
        sendDelimiter(outgoing_zmq_socket);
      }*/
    }

    /**
     * Will load the frame of the message.
     **/
    void receiveFrame(IMessage & msg, void * incoming_zmq_socket) {
      //std::cout << "Receiving frame size should be " << zmq_msg_size( &zmq_msg ) << std::endl;
      int number_of_bytes = 0;
      while( number_of_bytes == 0) {
        zmq_msg_t zmq_msg;
        zmq_msg_init_size( &zmq_msg, 8 );
        //zmq_msg_init( &zmq_msg );
        if (( number_of_bytes = zmq_msg_recv( &zmq_msg, incoming_zmq_socket, ZMQ_DONTWAIT )) < 0 ) {
          EXCEPT_PARAM( 1, "RCV zmq_msg_recv (frame) failed: " << zmq_strerror(zmq_errno()) );
        } else if ( number_of_bytes == 8 ){
          //std::cout << "receiveFrame bytes " << number_of_bytes << std::endl;
          FrameFactory frame_factory;
          //std::cout << "recieveFrame:: create" << std::endl;
          Frame frame = frame_factory.create(zmq_msg); // THIS IS THE ERROR
          FrameConverter converter;
          //std::cout << "recieveFrame:: convert from frame to msg" << std::endl;
          converter.copy(FrameConverter::CopyDirection::FROM_FRAME, msg, frame);
          std::cout << "Context after copying to message is " << std::get<uint16_t>(msg.get(constants::message::google::CONTEXT)) << std::endl;
          //std::cout << "recieveFrame:: complete" << std::endl;
          zmq_msg_close( &zmq_msg );
          //std::cout << "receiveFrame context is : " << frame.context << std::endl;
          // Break out of loop after reading in frame
          break;
        } else if(zmq_msg_more(&zmq_msg) == 0 ) {
          zmq_msg_close( &zmq_msg );
          EXCEPT(1, "Multipart message is malformed, no frame was attached");
          break;
        } else {
          zmq_msg_close( &zmq_msg );
        }
        // Skip any leading 0s and contiue 
        
      }
    }

    void sendFrame(IMessage & msg, void * outgoing_zmq_socket) {
      zmq_msg_t zmq_msg;
      zmq_msg_init_size( &zmq_msg, 8 );
      // WARNING do not call zmq_msg_init it is called in copy method
      // this is a code smell and should be fixed in the future
      FrameFactory factory;
      Frame frame = factory.create(msg);
      //std::cout << "sendFrame context is : " << frame.context << std::endl;
      FrameConverter converter;
      // Will call zmq_msg_init and create space for 8 bytes
      // Convert host binary to network (endian) format
      converter.copy(FrameConverter::CopyDirection::FROM_FRAME, zmq_msg, frame);

      int number_of_bytes = 0;

      //std::cout << "sendFrame:: message size " <<  zmq_msg_size( &zmq_msg ) << std::endl;
      // Should always be sending a key
      if (( number_of_bytes = zmq_msg_send( &zmq_msg, outgoing_zmq_socket, ZMQ_SNDMORE)) < 0 ) {
        EXCEPT( 1, "zmq_msg_send (frame) failed." );
      }
      //std::cout << "sendFrame bytes " << number_of_bytes << std::endl;
      zmq_msg_close( &zmq_msg );
    }

    /**
     * Will load the body of the message if there is one. Or else it will do
     * nothing.
     **/
    void receiveBody(
        IMessage & msg,
        Buffer & buffer,
        ProtoBufFactory & factory,
        void * incoming_zmq_socket) {

      //std::cout << "Receiving body msg.exists(FRame_SIZE) " << msg.exists(FRAME_SIZE) << std::endl;
      if( msg.exists(FRAME_SIZE) ) {
        uint32_t frame_size = std::get<uint32_t>(msg.get(FRAME_SIZE)); 

        //std::cout << "receiveBody:: frame size is " << frame_size << std::endl;
        zmq_msg_t zmq_msg;
        zmq_msg_init( &zmq_msg );
  
        int number_of_bytes = 0;
        if (( number_of_bytes = zmq_msg_recv( &zmq_msg, incoming_zmq_socket, ZMQ_DONTWAIT )) < 0 ) {
          EXCEPT( 1, "RCV zmq_msg_recv (body) failed." );
        }
        //std::cout << "receiveBody bytes " << number_of_bytes << std::endl;

        if ( zmq_msg_size( &zmq_msg ) != frame_size ) {
          EXCEPT_PARAM( 1, "RCV Invalid message body received. Expected: " << frame_size << ", got: " << zmq_msg_size( &zmq_msg ) );
        }
      
        // Only set payload if there is a payload
        if( frame_size > 0 ) {
          copyToBuffer( buffer, zmq_msg_data(&zmq_msg), frame_size );
          uint16_t desc_type = std::get<uint16_t>(msg.get(MSG_TYPE));
          //std::cout << "Desc type is " << desc_type << std::endl;
          std::unique_ptr<proto::Message> payload = factory.create( desc_type );
          if( payload == nullptr ) {
            EXCEPT(1, "No payload was assigned something is wrong");
          }
          copyFromBuffer(payload.get(), buffer);
          msg.setPayload(std::move(payload));
        } else {

          // Even if the frame has 0 size it does not mean it is not a legitimate
          // message some messages have zero size but are still legitimate such
          // as a NACK 
          uint16_t msg_type = std::get<uint16_t>(msg.get(MSG_TYPE));

          ProtoBufMap proto_map;
          if( proto_map.exists(msg_type) ) {
            std::cout << "poll received message of type: " << proto_map.toString(msg_type) << std::endl;
            std::cout << "Desc type is " << msg_type << std::endl;
            std::unique_ptr<proto::Message> payload = factory.create( msg_type );
            msg.setPayload(std::move(payload));
          } else {
            EXCEPT(1, "Unrecognized message type specified unable to identify message body/payload");
          }

          //std::cout << "Frame of size 0 so no body" << std::endl;
        }

        if( zmq_msg_more(&zmq_msg) ) {
          EXCEPT( 1, "There should not be additional messages after the body has been sent but there are...!" );
        }
        zmq_msg_close( &zmq_msg );
      }

    }

    void sendBody(IMessage & msg, Buffer & buffer, void * outgoing_zmq_socket) {
      
      if( msg.exists(FRAME_SIZE) ) {

        uint32_t frame_size = std::get<uint32_t>(msg.get(FRAME_SIZE)); 
        if( frame_size > 0 ) {
          zmq_msg_t zmq_msg;

          zmq_msg_init_size( &zmq_msg, frame_size );

          //std::cout << "sendBody getPayload" << std::endl;
          proto::Message * payload;
          try {
            payload = std::get<proto::Message *>(msg.getPayload());
          } catch ( std::bad_variant_access const & ex)  {
            EXCEPT( 1, ex.what() );
          }

          //if( payload == nullptr ) {
          //  EXCEPT( 1, "Payload is empty");
          //}
          //std::cout << "sendBody ByteSizeLong" << std::endl;
          //std::cout << "Frame size is " << frame_size << std::endl;
          if( payload  ) {
            auto size = payload->ByteSizeLong();
            //std::cout << "Sending payload of size " << size << std::endl;
            if( size != frame_size ) {
              EXCEPT_PARAM( 1, "Frame and message sizes differ message size: " << size << " frame size: " << frame_size );
            }

            copyToBuffer<proto::Message *>(buffer, payload, size);
            copyFromBuffer<void *>(zmq_msg_data( &zmq_msg ), buffer);
            //std::cout << "Copy to zmq_msg success " << std::endl;
            int number_of_bytes = 0;
            if (( number_of_bytes = zmq_msg_send( &zmq_msg, outgoing_zmq_socket, 0 )) < 0 ) {
              EXCEPT( 1, "zmq_msg_send (body) failed." );
            }
            std::cout << "sendBody number of bytes " << number_of_bytes << std::endl;
          } else {
            EXCEPT(1,"Payload not defined... something went wrong");
          }

          zmq_msg_close( &zmq_msg );
        }  else {

          sendFinalDelimiter(outgoing_zmq_socket);
        }
      } else {
        sendFinalDelimiter(outgoing_zmq_socket);
      }
    }

    void receiveKey(IMessage & msg, void * incoming_zmq_socket) {
      // If the UID metadata is set, use is; otherwise get the UID from the message
      zmq_msg_t zmq_msg;
      zmq_msg_init( &zmq_msg );
      int number_of_bytes = 0;
      if (( number_of_bytes = zmq_msg_recv( &zmq_msg, incoming_zmq_socket, ZMQ_DONTWAIT )) < 0 ) {
        EXCEPT( 1, "RCV zmq_msg_recv (key) failed." );
      }
      //std::cout << "receiveKey number of bytes " << number_of_bytes << std::endl;

      if ( zmq_msg_size( &zmq_msg )) {
        std::string key = std::string((char*) zmq_msg_data( &zmq_msg ), zmq_msg_size( &zmq_msg ));
        //std::cout << "Key is " << key << std::endl;
        msg.set(MessageAttribute::KEY, key);
      }

      // Check to see if there are more parts if there are we are not currently set
      // up to handle it so you should throw an error
      if( !zmq_msg_more(&zmq_msg) ) {
        EXCEPT( 1, "Should be receiving messages after key. The user ID should follow but is not." );
      }
      zmq_msg_close( &zmq_msg );
    }

    void sendKey(IMessage & msg, void * outgoing_zmq_socket) {
      // Send message Key (if set, null otherwise)
      zmq_msg_t zmq_msg;
      if ( msg.exists(MessageAttribute::KEY) ){
        const std::string key = std::get<std::string>(msg.get(MessageAttribute::KEY));
        zmq_msg_init_size( &zmq_msg, key.size() );
        memcpy( zmq_msg_data( &zmq_msg ), key.c_str(), key.size() );
      } else {
        //std::cout << "Sending empty key" << std::endl;
        std::string no_key("no key");
        zmq_msg_init_size( &zmq_msg, no_key.size() );
        memcpy( zmq_msg_data( &zmq_msg ), no_key.c_str(), no_key.size() );
      }

      int number_of_bytes = 0;
      if (( number_of_bytes = zmq_msg_send( &zmq_msg, outgoing_zmq_socket, ZMQ_SNDMORE)) < 0 ) {
        EXCEPT( 1, "zmq_msg_send (uid) failed." );
      }

      //std::cout << "sendKey number of bytes " << number_of_bytes << std::endl;
      zmq_msg_close( &zmq_msg );
    }

    void receiveID(IMessage & msg, void * incoming_zmq_socket) {
      // If the UID metadata is set, use is; otherwise get the UID from the message
      zmq_msg_t zmq_msg;
      zmq_msg_init( &zmq_msg );
      int number_of_bytes = 0;
      if (( number_of_bytes = zmq_msg_recv( &zmq_msg, incoming_zmq_socket, ZMQ_DONTWAIT )) < 0 ) {
        EXCEPT( 1, "RCV zmq_msg_recv (uid) failed." );
      }
      //std::cout << "receiveId::  number of bytes " << number_of_bytes << std::endl;
      //std::cout << "receiveID:: message size " <<zmq_msg_size( &zmq_msg )<< std::endl;

      if ( zmq_msg_size( &zmq_msg )) {
        std::string id = std::string((char*) zmq_msg_data( &zmq_msg ), zmq_msg_size( &zmq_msg ));
        //std::cout << "receiveID:: id is = " << id << std::endl;
        msg.set(MessageAttribute::ID, id);
      }

      // Check to see if there are more parts if there are we are not currently set
      // up to handle it so you should throw an error
      //std::cout << "receiveID:: more" << std::endl;
      //
      if( !zmq_msg_more(&zmq_msg) ) {
        EXCEPT( 1, "Should be receiving messages after id. The frame should follow but is not." );
      }
      //std::cout << "receiveID:: calling close " << std::endl;
      zmq_msg_close( &zmq_msg );
      //std::cout << "receiveID:: done" << std::endl;
    }

    void sendID(IMessage & msg, void * outgoing_zmq_socket) {
      // Send message Key (if set, null otherwise)
      zmq_msg_t zmq_msg;
      if ( msg.exists(MessageAttribute::ID) ){
        const std::string id = std::get<std::string>(msg.get(MessageAttribute::ID));
        zmq_msg_init_size( &zmq_msg, id.size() );
        memcpy( zmq_msg_data( &zmq_msg ), id.c_str(), id.size() );
      } else {
        //std::cout << "Sending empty key" << std::endl;
        std::string no_id("no id");
        zmq_msg_init_size( &zmq_msg, no_id.size() );
        memcpy( zmq_msg_data( &zmq_msg ), no_id.c_str(), no_id.size() );
      }

      int number_of_bytes = 0;
      if (( number_of_bytes = zmq_msg_send( &zmq_msg, outgoing_zmq_socket,ZMQ_SNDMORE )) < 0 ) {
        EXCEPT( 1, "zmq_msg_send (uid) failed." );
      }
      //std::cout << "sendId number of bytes " << number_of_bytes << std::endl;
      zmq_msg_close( &zmq_msg );
    }


  } // namespace

  /******************************************************************************
   * Private Class Methods
   ******************************************************************************/

  ICommunicator::Response ZeroMQCommunicator::m_poll(uint32_t timeout_milliseconds) {
    zmq_pollitem_t  items[] = {{ m_zmq_socket, 0, ZMQ_POLLIN, 0}};
    const int num_items_in_array = 1;
    int events_detected = 0;
    events_detected = zmq_poll( items, num_items_in_array, timeout_milliseconds );
    //std::cout << "Events detected " << events_detected << std::endl;;
    Response response;
    if ( events_detected == -1 ) {
      response.error = true;
      response.error_msg = "ZMQ error number: " + std::to_string(zmq_errno());
      response.error_msg += " msg: " + std::string(zmq_strerror(zmq_errno()));
      return response;
    } else if ( events_detected == 0) {
      response.time_out = true;
      std::string error_msg = std::string(zmq_strerror(zmq_errno()));
      if(error_msg.size()){
        response.error_msg += " msg: " + error_msg;
      }
      return response;
    } else {
      response.events = events_detected;
    }
    return response;
  }

  /******************************************************************************
   * Public Class Methods
   ******************************************************************************/
  ZeroMQCommunicator::ZeroMQCommunicator(
      const SocketOptions & socket_options,
      const ICredentials & credentials,
      uint32_t timeout_on_receive_milliseconds,
      long timeout_on_poll_milliseconds) :
        m_timeout_on_receive_milliseconds(timeout_on_receive_milliseconds),
        m_timeout_on_poll_milliseconds(timeout_on_poll_milliseconds) {


    auto socket_factory = SocketFactory();
    m_socket = socket_factory.create(socket_options, credentials);
    m_zmq_ctx = getContext();
    m_zmq_socket_type = translateToZMQSocket(m_socket.get());
    m_zmq_socket = zmq_socket( m_zmq_ctx, m_zmq_socket_type);

    // -1 - Leave to OS
    // Not sure what 0 and 1 do other than mean you are going to overide 
    // the defaults
    const int keep_alive = 1;
    const int keep_alive_cnt = 20;
    const int keep_alive_idle = 540;
    const int keep_alive_intvl = 5;
    const int reconnect_ivl = 500;
    const int reconnect_ivl_max = 4000;
    const int linger_milliseconds = 100;

    zmq_setsockopt( m_zmq_socket, ZMQ_TCP_KEEPALIVE, &keep_alive, sizeof( const int ));
    zmq_setsockopt( m_zmq_socket, ZMQ_TCP_KEEPALIVE_CNT, &keep_alive_cnt, sizeof(const int ));
    zmq_setsockopt( m_zmq_socket, ZMQ_TCP_KEEPALIVE_IDLE, &keep_alive_idle, sizeof(const int ));
    zmq_setsockopt( m_zmq_socket, ZMQ_TCP_KEEPALIVE_INTVL, &keep_alive_intvl, sizeof(const int ));
    zmq_setsockopt( m_zmq_socket, ZMQ_RECONNECT_IVL, &reconnect_ivl, sizeof(const int ));
    zmq_setsockopt( m_zmq_socket, ZMQ_RECONNECT_IVL_MAX, &reconnect_ivl_max, sizeof(const int ));
    zmq_setsockopt( m_zmq_socket, ZMQ_LINGER, &linger_milliseconds, sizeof(const int ));

    std::string id = m_socket->getID();  

    if( id.size() > constants::communicator::MAX_COMMUNICATOR_IDENTITY_SIZE ){
      EXCEPT_PARAM( 1, "ZeroMQ exceeds max number of characters allowed, allowed: " << constants::communicator::MAX_COMMUNICATOR_IDENTITY_SIZE << " number provided " << id.size() << " identity: " << id );
    }

    zmq_setsockopt( m_zmq_socket, ZMQ_IDENTITY, id.c_str(), id.size());

    if( m_socket->getSocketConnectionLife() == SocketConnectionLife::PERSISTENT ){
      bool failure = zmq_bind( m_zmq_socket, m_socket->getAddress().c_str()) != 0;
      if ( failure ) {
        EXCEPT_PARAM( 1, "ZeroMQ bind to address '" << m_socket->getAddress() << "' failed. Be aware if using TCP it you must pick a recognized name for the domain... i.e. '127.0.0.1'.\n zmq error msg: " << zmq_strerror(zmq_errno()) );
      }
    } else {
      bool failure = zmq_connect( m_zmq_socket, m_socket->getAddress().c_str()) != 0;
      if ( failure ) {
        EXCEPT_PARAM( 1, "ZeroMQ connect to address '" << m_socket->getAddress() << "' failed. zmq error msg: " << zmq_strerror(zmq_errno())  );
      }
    }
    if ( m_zmq_socket_type == ZMQ_SUB ){
      //std::cout << "Subscribing " << id << " " << m_socket->getAddress() << std::endl;
      bool failure = zmq_setsockopt( m_zmq_socket, ZMQ_SUBSCRIBE, "", 0) != 0;
      if ( failure ) {
        EXCEPT_PARAM( 1, "ZeroMQ connect to address '" << m_socket->getAddress() << "' failed." );
      }
    }
  }

  ZeroMQCommunicator::~ZeroMQCommunicator() {
    //std::cout << "Closing zmq communicator socket" << std::endl;
    int rc = zmq_close(m_zmq_socket);
    if( rc ) {
      std::cout << "Problem closing socket: " << m_socket->getAddress().c_str() << std::endl;;
    }
  }

  ICommunicator::Response ZeroMQCommunicator::poll(const MessageType message_type) {
    //std::cout << __FILE__ << ":" << __LINE__ << std::endl;
    //std::cout << id() << " polling " << address() << std::endl;
    Response response = m_poll(m_timeout_on_poll_milliseconds);
    if( response.error == false and response.time_out == false) {
      response.message = m_msg_factory.create(message_type);
      //std::cout << id() << " receiveRoute address: " << address() << std::endl;
      receiveRoute(*response.message, m_zmq_socket, m_zmq_socket_type);
      //std::cout << id() << " receiveKey address: " << address() << std::endl;
      receiveKey(*response.message, m_zmq_socket);
      //std::cout << id() << " receiveID address: " << address() << std::endl;
      receiveID(*response.message, m_zmq_socket);
      //std::cout << id() << " receiveFrame address: " << address() << std::endl;
      receiveFrame(*response.message, m_zmq_socket);
      //std::cout << id() << " receiveBody address: " << address() << std::endl;

      receiveBody(
        *response.message,
        m_buffer,
        m_protocol_factory,
        m_zmq_socket);

      uint16_t msg_type = std::get<uint16_t>(response.message->get(constants::message::google::MSG_TYPE));
      ProtoBufMap proto_map;
    
      std::cout << "poll received message of type: " << proto_map.toString(msg_type);
      std::cout << " Frame context is " << std::get<uint16_t>(response.message->get(constants::message::google::CONTEXT));
      std::cout << " Frame size is " << std::get<uint32_t>(response.message->get(constants::message::google::FRAME_SIZE)) << std::endl;;
      //std::cout << "poll received message of type: " << proto_map.toString(msg_type) << std::endl;
    } else {
      if( response.error ) {
        //std::cout << id() << " Error msg: " << response.error_msg << std::endl;
      } else if (response.time_out){
        //std::cout << id() << " Timeout after milliseconds: " << m_timeout_on_poll_milliseconds << std::endl;
      }
    }


    return response;
  }

  void ZeroMQCommunicator::send(IMessage & message) {
    //std::cout << id() << " Sending route address: " << address() << std::endl;
    sendRoute(message, m_zmq_socket, m_zmq_socket_type);
    //std::cout << id() << " Sending Key address: " << address() << std::endl;
    sendKey(message, m_zmq_socket);
    //std::cout << id() << " Sending ID address: " << address() << std::endl;
    sendID(message, m_zmq_socket);
    //std::cout << id() << " Sending Frame address: " << address() << std::endl;
    sendFrame(message, m_zmq_socket);
    //std::cout << id() << " Sending Body address: " << address() << std::endl;
    sendBody(message, m_buffer, m_zmq_socket);

    uint16_t msg_type = std::get<uint16_t>(message.get(constants::message::google::MSG_TYPE));
    ProtoBufMap proto_map;
    std::cout << "send message of type: " << proto_map.toString(msg_type);
    std::cout << " Frame context is " << std::get<uint16_t>(message.get(constants::message::google::CONTEXT));
    std::cout << " Frame size is " << std::get<uint32_t>(message.get(constants::message::google::FRAME_SIZE)) << std::endl;
  }

  ICommunicator::Response ZeroMQCommunicator::receive(const MessageType message_type) {

    //std::cout << id() << " polling " << address() << std::endl;
    Response response = m_poll(m_timeout_on_receive_milliseconds);
    if( response.error == false and response.time_out == false) {
      response.message = m_msg_factory.create(message_type);
      //std::cout << id() << " receiveRoute address: " << address() << std::endl;
      receiveRoute(*response.message, m_zmq_socket, m_zmq_socket_type);
      //std::cout << id() << " receiveKey address: " << address() << std::endl;
      receiveKey(*response.message, m_zmq_socket);
      //std::cout << id() << " receiveID address: " << address() << std::endl;
      receiveID(*response.message, m_zmq_socket);
      //std::cout << id() << " receiveFrame address: " << address() << std::endl;
      receiveFrame(*response.message, m_zmq_socket);
      //std::cout << id() << " receiveBody address: " << address() << std::endl;
      receiveBody(
        *response.message,
        m_buffer,
        m_protocol_factory,
        m_zmq_socket);

      uint16_t msg_type = std::get<uint16_t>(response.message->get(constants::message::google::MSG_TYPE));
      ProtoBufMap proto_map;
      //std::cout << "received message of type: " << proto_map.toString(msg_type) << std::endl;
      std::cout << "received message of type: " << proto_map.toString(msg_type);
      std::cout << " Frame context is " << std::get<uint16_t>(response.message->get(constants::message::google::CONTEXT));
      std::cout << " Frame size is " << std::get<uint32_t>(response.message->get(constants::message::google::FRAME_SIZE)) << std::endl;;
    } else {
      //std::cout << "Message received" << std::endl;
    }
    //std::cout << "Done!!!" << std::endl;
    return response;
  }

  const std::string ZeroMQCommunicator::id() const noexcept {
    char id_buffer [constants::communicator::MAX_COMMUNICATOR_IDENTITY_SIZE];
    size_t id_size = constants::communicator::MAX_COMMUNICATOR_IDENTITY_SIZE;
    zmq_getsockopt( m_zmq_socket, ZMQ_IDENTITY, id_buffer, &id_size);
    return std::string(id_buffer, id_size);
  }

  const std::string ZeroMQCommunicator::address() const noexcept {
    if( m_socket ) {
      return m_socket->getAddress();
    }
    return std::string("");
  }
} // namespace SDMS 
