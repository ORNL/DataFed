
// Local public includes
#include "ProtoBufMap.hpp"
#include "TraceException.hpp"
#include <SDMS_Anon.pb.h>
#include <SDMS_Auth.pb.h>

// Third party includes
#include <google/protobuf/message.h>
#include <google/protobuf/descriptor.h>

namespace proto = ::google::protobuf;

namespace SDMS {
 
  ProtoBufMap::ProtoBufMap() {
    // These two code blocks should be templatized to make them DRY
    {
      auto a_enum_desc = Anon::Protocol_descriptor();
      if ( a_enum_desc->name() != "Protocol" )
        EXCEPT( EC_PROTO_INIT, "Must register with Protocol EnumDescriptor." );

      const proto::FileDescriptor * file = a_enum_desc->file();
      if ( !file )
        EXCEPT( EC_PROTO_INIT, "Failed to acquire protocol buffer file descriptor." );

      const proto::EnumValueDescriptor * val_desc = a_enum_desc->FindValueByName("ID");
      if ( !val_desc )
        EXCEPT( EC_PROTO_INIT, "Protocol enum missing required ID field." );

      uint16_t id = val_desc->number();
      m_file_descriptor_map[id] = file;

      int                     count = file->message_type_count();
      uint16_t                msg_type = id << 8;

      for ( int i = 0; i < count; i++, msg_type++ )
      {
        const proto::Descriptor * desc = file->message_type(i);
        m_descriptor_map[msg_type] = desc;
        m_msg_type_map[desc] = msg_type;

      }
      m_protocol_ids[MessageProtocol::GOOGLE_ANONONYMOUS] = id;
    }
    {
      auto a_enum_desc = Auth::Protocol_descriptor();
      if ( a_enum_desc->name() != "Protocol" )
        EXCEPT( EC_PROTO_INIT, "Must register with Protocol EnumDescriptor." );

      const proto::FileDescriptor * file = a_enum_desc->file();
      if ( !file )
        EXCEPT( EC_PROTO_INIT, "Failed to acquire protocol buffer file descriptor." );

      const proto::EnumValueDescriptor * val_desc = a_enum_desc->FindValueByName("ID");
      if ( !val_desc )
        EXCEPT( EC_PROTO_INIT, "Protocol enum missing required ID field." );

      uint16_t id = val_desc->number();
      m_file_descriptor_map[id] = file;

      int                     count = file->message_type_count();
      uint16_t                msg_type = id << 8;

      for ( int i = 0; i < count; i++, msg_type++ )
      {
        const proto::Descriptor * desc = file->message_type(i);
        m_descriptor_map[msg_type] = desc;
        m_msg_type_map[desc] = msg_type;

      }
      m_protocol_ids[MessageProtocol::GOOGLE_AUTHORIZED] = id;
    }
  }


  uint16_t ProtoBufMap::getMessageType(proto::Message & a_msg) {
    const proto::Descriptor * desc = a_msg.GetDescriptor();
    if ( m_msg_type_map.count(desc) == 0 ) {
      EXCEPT_PARAM( EC_INVALID_PARAM, "Unknown descriptor encountered: " << desc->name() );
    }
    return m_msg_type_map.at(desc);
  }

  uint16_t ProtoBufMap::getMessageType(uint8_t a_proto_id, const std::string & a_message_name) {

        if( m_file_descriptor_map.count( a_proto_id ) == 0 ) {
            EXCEPT_PARAM( EC_INVALID_PARAM, "Protocol ID " << a_proto_id << " has not been registered." );
        }

        const proto::Descriptor *desc = m_file_descriptor_map.at(a_proto_id)->FindMessageTypeByName( a_message_name );
        if ( !desc )
            EXCEPT_PARAM( EC_PROTO_INIT, "Could not find specified message: " << a_message_name << " for protocol: " << (unsigned int)a_proto_id );

        if( m_msg_type_map.count( desc ) == 0 ) {
            EXCEPT_PARAM( EC_INVALID_PARAM, "Message name \"" << a_message_name << "\" is not registered with protocol " << a_proto_id );
        }

        return m_msg_type_map.at( desc );
  }


  const proto::Descriptor * ProtoBufMap::getDescriptorType(uint16_t message_type) const {
    if( m_descriptor_map.count(message_type) ) {
      return m_descriptor_map.at(message_type);
    } else {
      EXCEPT_PARAM( EC_PROTO_INIT, "Descriptor type mapping failed, unregistered message type " << message_type);
    }
  }

  uint8_t ProtoBufMap::getProtocolID(MessageProtocol msg_protocol) const {
    if( m_protocol_ids.count(msg_protocol) ) {
      return m_protocol_ids.at(msg_protocol);
    } else {
      EXCEPT(1, "Unsupported MessageProtocol specified, cannot map to a protocol id");
    }
  }
}

