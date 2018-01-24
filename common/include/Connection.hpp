#ifndef CONNECTION_HPP
#define CONNECTION_HPP

#include <string>
#include <map>
#include <stdint.h>
#include <zmq.h>
#include <google/protobuf/message.h>
#include <google/protobuf/descriptor.h>
#include "TraceException.hpp"
#include "ErrorCodes.hpp"
#include "SDMS.pb.h"

// TODO Put context in msg frame, not in proto file. With it in the proto file it cant be checked until
// the msg is unserialized, which requires multiple checks when multiple msg types can be received.

namespace SDMS
{

typedef ::google::protobuf::Message         Message;

/*
struct MessageID
{
    MessageID() : proto_id(0), msg_idx(0) {}
    bool isNull() { return proto_id == 0; }

    uint16_t    proto_id;
    uint16_t    msg_idx;
};
*/

struct MsgFrame
{
    MsgFrame() : proto_id(0),msg_id(0),context(0),msg_size(0) {}

    //MessageID   msg_id;
    uint8_t     proto_id;
    uint8_t     msg_id;
    uint16_t    context;
    uint32_t    msg_size;
};

struct MsgBuffer
{
    MsgBuffer() : offset(0), capacity(4096)
    {
        buffer = new char[capacity];
    }

    ~MsgBuffer()
    {
        delete[] buffer;
    }

    // Return most-local connection identity as an unsigned 32-bit int
    uint32_t cid() const
    {
        return *(uint32_t*)(buffer+1);
    }

    MsgFrame    frame;
    uint32_t    offset;
    uint32_t    capacity;
    char *      buffer;
};


class Connection
{
public:
    typedef ::google::protobuf::Descriptor      DescriptorType;
    typedef ::google::protobuf::FileDescriptor  FileDescriptorType;

    enum Mode
    {
        Server,
        Client,
        Publisher,
        Subscriber,
        Worker
    };


    //----- Constructors & Destructor -----

    Connection( const std::string & a_address, Mode a_mode = Client, void * a_zmq_context = 0 );
    Connection( const std::string & a_host, uint16_t a_port, Mode a_mode = Client, void * a_zmq_context = 0 );
    ~Connection();

    //----- Registration Methods -----

    #define REG_API(conn,ns) (conn).registerAPI( ns::Protocol_descriptor() );

    uint8_t         registerAPI( const ::google::protobuf::EnumDescriptor * a_protocol );
    uint8_t         findMessageType( uint8_t a_proto_id, const std::string & a_message_name );

    //----- Basic Messaging API -----

    void            send( Message & a_message, uint16_t a_context = 0 );
    bool            recv( Message *& a_msg, MsgFrame** a_frame = 0, uint32_t a_timeout = 0 );

    //----- Advanced (server) Messaging API -----

    //void            send( Message & a_message, uint16_t a_context = 0, const std::string &a_client_id );
    //bool            recv( Message *& a_msg, MsgFrame* a_frame = 0, uint32_t a_timeout = 0, std::string** a_client_id = 0 );
    void            send( MsgBuffer & a_buffer );
    bool            recv( MsgBuffer & a_buffer, uint32_t a_timeout );
    Message *       unserializeFromBuffer( MsgBuffer &a_buffer );
    void            serializeToBuffer( Message & a_msg, MsgBuffer & a_msg_buffer );

    //----- Utility Methods -----

    void *          getContext() { return m_context; }
    void *          getSocket() { return m_socket; }
    void            getPollInfo( zmq_pollitem_t  & a_poll_data );

    enum ErrorCode
    {
        EC_OK = 0,
        EC_SEND_FAILED,
        EC_RCV_FAILED,
        EC_TIMEOUT,
        EC_UNREGISTERED_REPLY_TYPE,
        EC_UNEXPECTED_REPLY_TYPE,
        EC_TOKEN_MISMATCH
    };

    template<class T>
    void requestReply( Message& a_request, T*& a_reply, uint16_t a_context = 0, uint32_t a_timeout = 0 )
    {
        a_reply = 0;

        send( a_request, a_context );

        Message*  raw_reply = 0;
        MsgFrame* frame;

        if ( !recv( raw_reply, &frame, a_timeout ))
            EXCEPT( EC_TIMEOUT, "No response from server." );
        else if ( frame->context != a_context )
            EXCEPT( EC_TOKEN_MISMATCH, "Mismatched reply context from server." );
        else if ( !raw_reply )
            EXCEPT( EC_UNREGISTERED_REPLY_TYPE, "Unregistered reply type from server." );
        else
        {
            a_reply = dynamic_cast<T*>(raw_reply);
            if ( !a_reply )
            {
                delete raw_reply;
                EXCEPT( EC_UNEXPECTED_REPLY_TYPE, "Unexpected reply type from server." );
            }
        }
    }

private:

    void            setupSocketKeepAlive();
    void            init( const std::string & a_address );
    void            ensureCapacity( MsgBuffer &a_msg_buffer );

    void           *m_context;
    void           *m_socket;
    Mode            m_mode;
    bool            m_proc_addresses;
    zmq_pollitem_t  m_poll_item;
    MsgBuffer       m_buffer;
    google::protobuf::MessageFactory *              m_factory;
    std::map<uint8_t,const FileDescriptorType *>    m_descriptors;
    bool            m_context_owner;
};

}

#endif // CONNECTION_HPP
