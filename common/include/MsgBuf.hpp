#ifndef MSGBUF_HPP
#define MSGBUF_HPP

#include <string>
#include <map>
#include <stdint.h>
#include <google/protobuf/message.h>
#include <google/protobuf/descriptor.h>
#include "TraceException.hpp"

// TODO Need to add host-network conversions for buffer frame fields


#define REG_PROTO(ns) MsgBuf::registerProtocol( ns::Protocol_descriptor() )

class MsgBuf
{
public:
    typedef ::google::protobuf::Descriptor                  DescriptorType;
    typedef ::google::protobuf::FileDescriptor              FileDescriptorType;
    typedef ::google::protobuf::MessageFactory              Factory;
    typedef ::google::protobuf::Message                     Message;
    typedef std::map<uint8_t,const FileDescriptorType *>    DescriptorMap;

    enum ErrorCode
    {
        EC_OK = 0,
        EC_PROTO_INIT,
        EC_INVALID_PARAM,
        EC_INVALID_STATE,
        EC_SERIALIZE,
        EC_UNSERIALIZE
    };

    struct Frame
    {
        Frame() : size(0), proto_id(0), msg_id(0), context(0) {}

        void clear()
        { 
            size = 0;
            proto_id = 0;
            msg_id = 0;
            context = 0;
        }

        uint32_t    size;       // Size of buffer
        uint8_t     proto_id;
        uint8_t     msg_id;
        uint16_t    context;
    };


    MsgBuf( uint32_t a_capacity = 0 ) : m_buffer(0), m_capacity(0)
    {
        if ( a_capacity )
            ensureCapacity( a_capacity );
    }

    ~MsgBuf()
    {
        if ( m_buffer )
            delete[] m_buffer;
    }


    void clear()
    {
        m_frame.clear();

        if ( m_buffer )
        {
            delete[] m_buffer;
            m_buffer = 0;
            m_capacity = 0;
        }
    }


    inline Frame & getFrame()
    {
        return m_frame;
    }

    inline const Frame & getFrame() const
    {
        return m_frame;
    }

    inline uint16_t getMsgType() const
    {
        return ( ((uint16_t)m_frame.proto_id) << 8 ) | m_frame.msg_id;
    }

    inline char * getBuffer()
    {
        return m_buffer;
    }

    inline const char * getBuffer() const
    {
        return m_buffer;
    }

    char * acquireBuffer()
    {
        if ( !m_buffer )
            EXCEPT_PARAM( EC_INVALID_STATE, "Attempt to acquire empty/null buffer." );

        char * buffer = m_buffer;

        m_buffer = 0;
        m_capacity = 0;
        m_frame.clear();

        return buffer;
    }

    void ensureCapacity( uint32_t a_size )
    {
        if ( a_size > m_capacity )
        {
            char *new_buffer = new char[a_size];
            if ( m_buffer )
                delete[] m_buffer;
            m_buffer = new_buffer;
            m_capacity = a_size;
        }
    }

    static uint8_t registerProtocol( const ::google::protobuf::EnumDescriptor * a_enum_desc )
    {
        if ( a_enum_desc->name() != "Protocol" )
            EXCEPT( EC_PROTO_INIT, "Must register with Protocol EnumDescriptor." );

        const FileDescriptorType * file = a_enum_desc->file();
        if ( !file )
            EXCEPT( EC_PROTO_INIT, "Failed to acquire protocol buffer file descriptor." );

        const google::protobuf::EnumValueDescriptor * val_desc = a_enum_desc->FindValueByName("ID");
        if ( !val_desc )
            EXCEPT( EC_PROTO_INIT, "Protocol enum missing required ID field." );

        uint8_t id = val_desc->number();

        DescriptorMap::iterator iProto = getDescriptorMap().find( id );
        if ( iProto != getDescriptorMap().end() )
            EXCEPT_PARAM( EC_PROTO_INIT, "Protocol ID " << id << " has already been registered." );

        getDescriptorMap()[id] = file;

        return id;
    }


    static uint8_t findMessageType( uint8_t a_proto_id, const std::string & a_message_name )
    {
        DescriptorMap::iterator iProto = getDescriptorMap().find( a_proto_id );

        if ( iProto == getDescriptorMap().end() )
            EXCEPT_PARAM( EC_INVALID_PARAM, "Protocol ID " << a_proto_id << " has not been registered." );

        const DescriptorType *desc = iProto->second->FindMessageTypeByName( a_message_name );
        if ( !desc )
            EXCEPT_PARAM( EC_PROTO_INIT, "Could not find specified message: " << a_message_name );

        return (uint8_t)desc->index();
    }


    inline Message* unserialize() const
    {
        return unserialize( m_frame, m_buffer );
    }


    static Message* unserialize( const Frame & a_frame, const char * a_buffer )
    {
        //if ( !a_buffer )
        //    EXCEPT_PARAM( EC_UNSERIALIZE, "Attempt to unserialize empty/null buffer." );

        DescriptorMap::iterator iProto = getDescriptorMap().find( a_frame.proto_id );

        if ( iProto != getDescriptorMap().end() && a_frame.msg_id < (uint8_t)iProto->second->message_type_count())
        {
            //cout << "proto " << a_msg_buffer.a_frame.proto_id << "found" << endl;

            const DescriptorType * msg_descriptor = iProto->second->message_type( a_frame.msg_id );
            const Message * default_msg = getFactory().GetPrototype( msg_descriptor );

            Message * msg = default_msg->New();

            if ( msg )
            {
                // Some message types do not have any content and will not need to be parsed (and buffer may be null/empty)
                if ( msg->ParseFromArray( a_buffer, a_frame.size ))
                    return msg;
                else
                    delete msg;
            }
        }

        return 0;
    }


    void serialize( Message & a_msg )
    {
        const DescriptorType * desc = a_msg.GetDescriptor();
        const FileDescriptorType * file = desc->file();

        m_frame.proto_id = file->enum_type(0)->value(0)->number();
        m_frame.msg_id = desc->index();
        m_frame.size = a_msg.ByteSize();

        // Only serialize if message type has content
        if ( m_frame.size )
        {
            ensureCapacity( m_frame.size );

            // Serialize message - may fail if required fields are missing
            if ( !a_msg.SerializeToArray( m_buffer, m_frame.size ))
                EXCEPT( EC_SERIALIZE, "SerializeToArray for message failed." );
        }
    }

private:
    static google::protobuf::MessageFactory & getFactory()
    {
        static Factory * _factory = Factory::generated_factory();

        return *_factory;
    }

    static DescriptorMap & getDescriptorMap()
    {
        static DescriptorMap _descriptor_map;
        
        return _descriptor_map;
    }


    Frame       m_frame;
    char *      m_buffer;
    uint32_t    m_capacity;
};


#endif // MSGBUF_HPP
