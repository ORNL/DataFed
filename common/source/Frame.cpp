// Local private includes
#include "Frame.hpp"

// Local public includes
#include "IMessage.hpp"
#include "ProtoBufMap.hpp"
#include "TraceException.hpp"

// Third party includes
#include <zmq.hpp>

// Standard includes
#include <arpa/inet.h>
#include <cstdint>


namespace SDMS {

  namespace g_constants = constants::message::google;

  /**
   * Must call msg_init before passing in .
   *
   * Recommend the call below because the frame is 8 bytes:
   *
   * zmq_msg_init_size( &zmq_msg, 8 );
   **/
  void FrameConverter::copy(CopyDirection direction, zmq_msg_t & zmq_msg, Frame & frame){
    if( direction == CopyDirection::FROM_FRAME){
      if ( zmq_msg_size( &zmq_msg ) != sizeof( Frame )) {

        EXCEPT_PARAM( 1, "Unable to copy frame to zmq_msg sizes are inconsistent Frame: " << sizeof( Frame ) << " zmq_msg " << zmq_msg_size( &zmq_msg ) );
      }
      unsigned char * msg_frame_allocation = (unsigned char *)zmq_msg_data( &zmq_msg );
      *((uint32_t*) msg_frame_allocation) = htonl( frame.size );
      *(msg_frame_allocation+4) = frame.proto_id;
      *(msg_frame_allocation+5) = frame.msg_id;
      std::cout << "FrameConverter::copy " << __LINE__ << " Copy from frame context is " << frame.context << " frame size " << frame.size << std::endl;
      *((uint16_t*)(msg_frame_allocation+6)) = htons( frame.context );
    } else { // TO_FRAME
      std::cout << "FrameConverter::size " << __LINE__ << " sizeof(Frame) " << sizeof(Frame) << std::endl;
      if ( zmq_msg_size( &zmq_msg ) != sizeof( Frame )) {
        EXCEPT_PARAM( 1, "Unable to copy zmq_msg to Frame sizes are inconsistent Frame: " << sizeof( Frame ) << " zmq_msg " << zmq_msg_size( &zmq_msg ) );
      }
      //std::cout << "FrameConverter::copy " << __LINE__ << std::endl;
      unsigned char * msg_frame_allocation = (unsigned char *)zmq_msg_data( &zmq_msg );
      //std::cout << "FrameConverter::copy " << __LINE__ << std::endl;
      frame.size = ntohl( *((uint32_t*) msg_frame_allocation) );
      //std::cout << "FrameConverter::copy " << __LINE__ << std::endl;
      frame.proto_id = *(msg_frame_allocation+4);
      //std::cout << "FrameConverter::copy " << __LINE__ << std::endl;
      frame.msg_id = *(msg_frame_allocation+5);
      //std::cout << "FrameConverter::copy " << __LINE__ << std::endl;
      frame.context = ntohs( *((uint16_t*)(msg_frame_allocation+6)));
      std::cout << "FrameConverter::copy " << __LINE__ << " Copy to frame context is " << frame.context << " frame size " << frame.size << std::endl;
    }
  }

  void FrameConverter::copy(
      CopyDirection direction,
      IMessage & msg,
      const Frame & frame) {
    if( direction == CopyDirection::FROM_FRAME ) {
//      std::cout << "FrameConverter::copy - " << __LINE__ << std::endl;
      msg.set(g_constants::FRAME_SIZE, frame.size);
 //     std::cout << "FrameConverter::copy - " << __LINE__ << std::endl;
      msg.set(g_constants::PROTO_ID, frame.proto_id);
  //    std::cout << "FrameConverter::copy - " << __LINE__ << std::endl;
      msg.set(g_constants::MSG_ID, frame.msg_id);
   //   std::cout << "FrameConverter::copy - " << __LINE__ << std::endl;
      msg.set(g_constants::MSG_TYPE, frame.getMsgType());
      std::cout << "FrameConverter::copy - " << __LINE__ << " Copy from frame context is " << frame.context << " frame size " << frame.size << std::endl;
      msg.set(g_constants::CONTEXT, frame.context);
    } else {
      EXCEPT(1, "Unsupported copy direction for FrameConverter working on IMessage instance");
    }
  }

  Frame FrameFactory::create(::google::protobuf::Message & a_msg, ProtoBufMap & proto_map ) {
    Frame frame; 
    auto msg_type = proto_map.getMessageType(a_msg);
    frame.proto_id = msg_type >> 8;
    frame.msg_id = msg_type & 0xFF;
    frame.size = a_msg.ByteSizeLong();
    return frame;
  }

  Frame FrameFactory::create(const IMessage & msg ) {
    Frame frame; 
    if(msg.exists(g_constants::FRAME_SIZE)) { 
      frame.size = std::get<uint32_t>(msg.get(g_constants::FRAME_SIZE));
    } else {
      EXCEPT_PARAM(1, "constant is not defined cannot create Frame from IMessage, missing: " << g_constants::FRAME_SIZE );
    }
    if(msg.exists(g_constants::PROTO_ID)) { 
      frame.proto_id = std::get<uint8_t>(msg.get(g_constants::PROTO_ID));
    } else {
      EXCEPT_PARAM(1, "constant is not defined cannot create Frame from IMessage, missing: " << g_constants::PROTO_ID );
    }
    if(msg.exists(g_constants::MSG_ID)) { 
      frame.msg_id = std::get<uint8_t>(msg.get(g_constants::MSG_ID));
    } else {
      EXCEPT_PARAM(1, "constant is not defined cannot create Frame from IMessage, missing: " << g_constants::MSG_ID );
    }
    if(msg.exists(g_constants::CONTEXT)) { 
      frame.context = std::get<uint16_t>(msg.get(g_constants::CONTEXT)); 
    } else {
      EXCEPT_PARAM(1, "constant is not defined cannot create Frame from IMessage, missing: " << g_constants::CONTEXT );
    }
    return frame;
  }

  Frame FrameFactory::create(zmq_msg_t & zmq_msg) {
    Frame frame;
    // No need for conversion if the message size is 0 just use default frame
    if( zmq_msg_size( &zmq_msg ) > 0 ) {
      FrameConverter converter;
      converter.copy(FrameConverter::CopyDirection::TO_FRAME, zmq_msg, frame);
    }
    return frame;
  }

}

