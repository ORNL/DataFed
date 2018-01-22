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

struct MessageID
{
    MessageID() : proto_id(0), msg_idx(0) {}
    bool isNull() { return proto_id == 0; }

    uint16_t    proto_id;
    uint16_t    msg_idx;
};

struct MessageFrame
{
    MessageFrame() : msg_size(0) {}

    MessageID   msg_id;
    uint32_t    msg_size;
};

struct MessageBuffer
{
    MessageBuffer() : msg_offset(0), buffer_capacity(4096)
    {
        buffer = new char[buffer_capacity];
    }

    ~MessageBuffer()
    {
        delete[] buffer;
    }

    // Return most-local connection identity as an unsigned 32-bit int
    uint32_t cid() const
    {
        return *(uint32_t*)(buffer+1);
    }

    MessageFrame    frame;
    uint32_t        msg_offset;
    uint32_t        buffer_capacity;
    char        *   buffer;
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

    Connection( const std::string & a_address, Mode a_mode = Client, void * a_context = 0 );
    Connection( const std::string & a_host, uint16_t a_port, Mode a_mode = Client, void * a_context = 0 );
    ~Connection();

    //----- Registration Methods -----

    #define REG_API(conn,ns) (conn).registerAPI( ns::Protocol_descriptor() );

    uint16_t        registerAPI( const ::google::protobuf::EnumDescriptor * a_protocol );
    uint16_t        findMessageType( uint16_t a_proto_id, const std::string & a_message_name );

    //----- Basic Messaging API -----

    void            send( Message & a_message );
    MessageID       recv( Message *& a_msg, uint32_t a_timeout );

    //----- Advanced (server) Messaging API -----

    void            send( Message & a_message, const std::string &a_client_id );
    MessageID       recv( Message *& a_msg, uint32_t a_timeout, std::string & a_client_id );
    void            send( MessageBuffer & a_buffer );
    bool            recv( MessageBuffer & a_buffer, uint32_t a_timeout );
    Message *       unserializeFromBuffer( MessageBuffer &a_buffer );
    void            serializeToBuffer( Message & a_msg, MessageBuffer & a_msg_buffer );
    std::string     getClientID( MessageBuffer & a_msg_buffer );

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
    ErrorCode requestReply( Message& a_request, T*& a_reply, uint32_t a_context, uint32_t a_timeout )
    {
        a_reply = 0;

        send( a_request );

        Message*  raw_reply = 0;
        MessageID msg_id = recv( raw_reply, a_timeout );

        if ( !msg_id.msg_idx )
            EXCEPT( EC_TIMEOUT, "No response from server." );
        else if ( !raw_reply )
            EXCEPT( EC_UNREGISTERED_REPLY_TYPE, "Unregistered reply type from server." );
        else
        {
            a_reply = dynamic_cast<T*>(raw_reply);
            if ( a_reply )
            {
                if ( a_reply->header().context() != a_context )
                {
                    delete raw_reply;
                    a_reply = 0;
                    EXCEPT( EC_TOKEN_MISMATCH, "Mismatched reply context from server." );
                }
            }
            else
            {
                delete raw_reply;
                EXCEPT( EC_UNEXPECTED_REPLY_TYPE, "Unexpected reply type from server." );
            }
        }
    }

private:

    void            setupSocketKeepAlive();
    void            init( const std::string & a_address );
    void            ensureCapacity( MessageBuffer &a_msg_buffer );

    void           *m_context;
    void           *m_socket;
    Mode            m_mode;
    bool            m_proc_addresses;
    zmq_pollitem_t  m_poll_item;
    MessageBuffer   m_buffer;
    google::protobuf::MessageFactory *              m_factory;
    std::map<uint16_t,const FileDescriptorType *>   m_descriptors;
    bool            m_context_owner;
};

}

#endif // CONNECTION_HPP
