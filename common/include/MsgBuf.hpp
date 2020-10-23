#ifndef MSGBUF_HPP
#define MSGBUF_HPP

#include <iostream>
#include <string>
#include <map>
#include <stdint.h>
#include <google/protobuf/message.h>
#include <google/protobuf/descriptor.h>
#include "TraceException.hpp"


/// Max zeromq routing address length
#define MAX_ROUTE_LEN   50

/// Max UID length
#define MAX_UID_LEN     100

/// Macro to make protocol registration easier
#define REG_PROTO(ns) MsgBuf::registerProtocol( ns::Protocol_descriptor() )

/**
 * @brief The MsgBuf class encapsulates a protobuf message with framing
 * 
 * The MsgBuf class is used in conjunction with the MsgComm class to send and
 * receive protobuf messages over zeromq. The MsgBuf class provides automatic
 * serialization and unserialization by utilizing a message registry built
 * from user-specified protobuf (.proto) files. When a message is serialized,
 * message framing information is created automatically, and, similarly, when
 * a message is received, the framing is used to automatically unserialize the
 * message.
 */
class MsgBuf
{
public:
    typedef ::google::protobuf::Descriptor                  DescriptorType;
    typedef ::google::protobuf::FileDescriptor              FileDescriptorType;
    typedef ::google::protobuf::MessageFactory              Factory;
    typedef ::google::protobuf::Message                     Message;
    typedef std::map<uint8_t,const FileDescriptorType *>    FileDescriptorMap;
    typedef std::map<uint16_t,const DescriptorType *>       DescriptorMap;
    typedef std::map<const DescriptorType *,uint16_t>       MsgTypeMap;

    /// Error codes used in TraceExceptions
    enum ErrorCode
    {
        EC_OK = 0,
        EC_PROTO_INIT,
        EC_INVALID_PARAM,
        EC_INVALID_STATE,
        EC_SERIALIZE,
        EC_UNSERIALIZE
    };

    /// Framing structure that wraps a serialized message
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

        /// Message type is 16 bits with protocol ID as the upper 8 bits and message ID as the lower 8 bits
        inline uint16_t getMsgType() const
        {
            return ( ((uint16_t)proto_id) << 8 ) | msg_id;
        }

        uint32_t    size;       ///< Size of buffer in bytes
        uint8_t     proto_id;   ///< Protocol ID (defined by Protocol enum in proto file)
        uint8_t     msg_id;     ///< Message ID (defined by alphabetical order of message names in proto file)
        uint16_t    context;    ///< Optional context value
    };

    /**
     * @brief Construct a new MsgBuf object with optional capacity
     * 
     * @param a_capacity - Buffer capacity in bytes
     */
    MsgBuf( uint32_t a_capacity = 0 ) : m_buffer(0), m_capacity(0)
    {
        m_route[0] = 0;

        if ( a_capacity )
            ensureCapacity( a_capacity );
    }

    /**
     * @brief Construct a new MsgBuf object with UID, context, and capacity
     * 
     * @param a_uid - User ID
     * @param a_context - Context value
     * @param a_capacity - Buffer capacity in bytes
     *
     * This constructor version is used by trusted agents that need to send/
     * recv messages on behalf of a user specified by UID.
     */
    MsgBuf( const std::string & a_uid, uint16_t a_context = 0, uint32_t a_capacity = 0 ) : m_buffer(0), m_capacity(0), m_uid(a_uid)
    {
        m_frame.context = a_context;
        m_route[0] = 0;

        if ( a_capacity )
            ensureCapacity( a_capacity );
    }

    /**
     * @brief Destroys the MsgBuf object
     */
    ~MsgBuf()
    {
        if ( m_buffer )
            delete[] m_buffer;
    }

    /**
     * @brief Frees memory used by MsgBuf
     */
    void clear()
    {
        m_route[0] = 0;
        m_uid.clear();
        m_frame.clear();

        if ( m_buffer )
        {
            delete[] m_buffer;
            m_buffer = 0;
            m_capacity = 0;
        }
    }

    /**
     * @brief Get a modifiable Frame reference from the MsgBuf instance
     * 
     * @return Frame&
     */
    inline Frame & getFrame()
    {
        return m_frame;
    }

    /**
     * @brief Get a const Frame reference from the MsgBuf instance
     * 
     * @return Frame&
     */
    inline const Frame & getFrame() const
    {
        return m_frame;
    }

    /**
     * @brief Get the Message Type of a message in the MsgBuf instance
     * 
     * @return uint16_t 
     */
    inline uint16_t getMsgType() const
    {
        return ( ((uint16_t)m_frame.proto_id) << 8 ) | m_frame.msg_id;
    }

    /**
     * @brief Get the Buffer pointer of the MsgBuf instance
     * 
     * @return char*
     */
    inline char * getBuffer()
    {
        return m_buffer;
    }

    /**
     * @brief Get a const Buffer pointer of the MsgBuf instance
     * 
     * @return char*
     */
    inline const char * getBuffer() const
    {
        return m_buffer;
    }

    /**
     * @brief Get a const Route Buffer of the MsgBuf instance
     * 
     * @return const uint8_t* 
     */
    inline const uint8_t * getRouteBuffer() const
    {
        return m_route;
    }

    /**
     * @brief Get the Route Buffer of the MsgBuf instance
     * 
     * @return const uint8_t* 
     */
    inline uint8_t * getRouteBuffer()
    {
        return m_route;
    }

    /**
     * @brief Get the maximum length for route addresses
     * 
     * @return uint8_t 
     */
    inline uint8_t getRouteMaxLen() const
    {
        return MAX_ROUTE_LEN;
    }

    /// Get UID as string
    inline const std::string & getUID() const
    {
        return m_uid;
    }

    /// Set UID from char buffer
    inline void setUID( const char * a_uid, size_t a_len = 0 )
    {
        if ( a_len )
            m_uid.assign( a_uid, a_len );
        else
            m_uid = a_uid; // Null-term str
    }

    /// Set UID from string
    inline void setUID( const std::string & a_uid )
    {
        m_uid = a_uid;
    }

    /// Clear the UID
    inline void clearUID()
    {
        m_uid.clear();
    }

    /// Acquire (take ownership of) contained buffer
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

    /// Ensure buffer is at least given size, in bytes
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

    /**
     * @brief Registers a protobuf file with MsgBuf class for auto serialize/unserialize
     * 
     * @param a_enum_desc - Protobuf protocol enum descriptor (from namespace::Protocol_descriptor() in generated code)
     * @return uint8_t - Protocol ID from Protocol enum in proto file
     */
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

        uint16_t id = val_desc->number();
        getFileDescriptorMap()[id] = file;

        int                     count = file->message_type_count();
        const DescriptorType *  desc;
        DescriptorMap &         desc_map = getDescriptorMap();
        MsgTypeMap &            mt_map = getMsgTypeMap();
        uint16_t                msg_type = id << 8;

        //std::map<std::string,const DescriptorType*> msg_types;

        for ( int i = 0; i < count; i++, msg_type++ )
        {
            desc = file->message_type(i);
            desc_map[msg_type] = desc;
            mt_map[desc] = msg_type;

            //msg_types[desc->name()] = desc;
        }

        /*for ( std::map<std::string,const DescriptorType*>::iterator m = msg_types.begin(); m != msg_types.end(); m++, msg_type++ )
        {
            //std::cout << "MT: " << msg_type << " = " << m->second->name() << "\n";
            desc_map[msg_type] = m->second;
            mt_map[m->second] = msg_type;
        }*/

        return id;
    }

    /**
     * @brief Find message type of given message name and protocol ID
     * 
     * @param a_proto_id - Protocol ID (from Protocol enum in proto file)
     * @param a_message_name - Name of message
     * @return uint16_t - Message ID
     */
    static uint16_t findMessageType( uint8_t a_proto_id, const std::string & a_message_name )
    {
        FileDescriptorMap::iterator iProto = getFileDescriptorMap().find( a_proto_id );

        if ( iProto == getFileDescriptorMap().end() )
            EXCEPT_PARAM( EC_INVALID_PARAM, "Protocol ID " << a_proto_id << " has not been registered." );

        const DescriptorType *desc = iProto->second->FindMessageTypeByName( a_message_name );
        if ( !desc )
            EXCEPT_PARAM( EC_PROTO_INIT, "Could not find specified message: " << a_message_name << " for protocol: " << (unsigned int)a_proto_id );

        MsgTypeMap & mt_map = getMsgTypeMap();
        MsgTypeMap::iterator i_mt = mt_map.find( desc );
        if ( i_mt == mt_map.end() )
            EXCEPT_PARAM( EC_INVALID_PARAM, "Message name \"" << a_message_name << "\" is not registered with protocol " << a_proto_id );

        return i_mt->second;
    }

    /**
     * @brief Unserialize and return a contained message
     * 
     * @return Message* - message from buffer (receiver must free)
     */
    inline Message* unserialize() const
    {
        return unserialize( m_frame, m_buffer );
    }

    /**
     * @brief Unserialize and return a message contained  in specified buffer
     * 
     * @param a_frame - Framing information
     * @param a_buffer - MsgBuf instance to unserialize
     * @return Message* - message from buffer (receiver must free)
     */
    static Message* unserialize( const Frame & a_frame, const char * a_buffer )
    {
        DescriptorMap::iterator iDesc = getDescriptorMap().find( a_frame.getMsgType() );
        if ( iDesc != getDescriptorMap().end() )
        {
            const DescriptorType * msg_descriptor = iDesc->second;
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
        else
        {
            EXCEPT_PARAM( EC_PROTO_INIT, "Unserialize failed: unregistered message type " << a_frame.getMsgType());
        }

        return 0;
    }

    /**
     * @brief Serialize a message into the MsgBuf
     * 
     * @param a_msg - Message instance to serialize
     *
     * Framing information is initialized from Message
     */
    void serialize( Message & a_msg )
    {
        if ( !a_msg.IsInitialized() )
            EXCEPT( EC_SERIALIZE, "Message is missing required fields" );

        const DescriptorType * desc = a_msg.GetDescriptor();
        MsgTypeMap & mt_map = getMsgTypeMap();
        MsgTypeMap::iterator i_mt = mt_map.find( desc );
        if ( i_mt == mt_map.end() )
            EXCEPT_PARAM( EC_SERIALIZE, "Attempt to serialize unregistered message type: " << desc->name() );

        //std::cout << "serialize msg type: " << i_mt->second << ", " << desc->name() << "\n";

        m_frame.proto_id = i_mt->second >> 8;
        m_frame.msg_id = i_mt->second & 0xFF;
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

    static FileDescriptorMap & getFileDescriptorMap()
    {
        static FileDescriptorMap _descriptor_map;
        
        return _descriptor_map;
    }

    static DescriptorMap & getDescriptorMap()
    {
        static DescriptorMap _descriptor_map;
        
        return _descriptor_map;
    }

    static MsgTypeMap & getMsgTypeMap()
    {
        static MsgTypeMap _msg_type_map;
        
        return _msg_type_map;
    }


    Frame       m_frame;
    char *      m_buffer;
    uint32_t    m_capacity;
    uint8_t     m_route[MAX_ROUTE_LEN]; // Byte 0 = length
    std::string m_uid;
};


#endif // MSGBUF_HPP
