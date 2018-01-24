#include <iostream>
#include <boost/lexical_cast.hpp>
#include "ErrorCodes.hpp"
#include "TraceException.hpp"
#include "Connection.hpp"

using namespace std;

namespace SDMS
{

#define MAX_ADDR_LEN 1000

Connection::Connection( const std::string & a_address, Connection::Mode a_mode, void * a_context )
    : m_context(a_context), m_socket(0), m_mode(a_mode), m_proc_addresses(false), m_context_owner(false)
{
    init( a_address );
    REG_API(*this,SDMS)
}

Connection::Connection( const std::string & a_host, uint16_t a_port, Connection::Mode a_mode, void * a_context )
    : m_context(a_context), m_socket(0), m_mode(a_mode), m_proc_addresses(false), m_context_owner(false)
{
    string address = string("tcp://") + a_host + ":" + boost::lexical_cast<string>(a_port);
    init( address.c_str() );
    REG_API(*this,SDMS)
}



Connection::~Connection()
{
    zmq_close( m_socket );
    if ( m_context_owner )
        zmq_ctx_destroy( m_context );
}

uint8_t
Connection::registerAPI( const ::google::protobuf::EnumDescriptor * a_enum_desc )
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

    std::map<uint8_t,const FileDescriptorType *>::iterator iProto = m_descriptors.find( id );
    if ( iProto != m_descriptors.end() )
        EXCEPT_PARAM( EC_PROTO_INIT, "Protocol ID " << id << " has already been registered." );

    m_descriptors[id] = file;

    return id;
}

uint8_t
Connection::findMessageType( uint8_t a_proto_id, const string & a_message_name )
{
    map<uint8_t,const FileDescriptorType *>::iterator iProto = m_descriptors.find( a_proto_id );
    if ( iProto == m_descriptors.end() )
        EXCEPT_PARAM( EC_INVALID_PARAM, "Protocol ID " << a_proto_id << " has not been registered." );

    const DescriptorType *desc = iProto->second->FindMessageTypeByName( a_message_name );
    if ( !desc )
        EXCEPT_PARAM( EC_PROTO_INIT, "Could not find specified message: " << a_message_name );

    return (uint8_t)desc->index();
}


void
Connection::send( Message &a_message, uint16_t a_context )
{
    serializeToBuffer( a_message, m_buffer );
    m_buffer.frame.context = a_context;

    send( m_buffer );
}


bool
Connection::recv( Message *&a_msg, MsgFrame** a_frame, uint32_t a_timeout )
{
    a_msg = 0;
    if ( recv( m_buffer, a_timeout ))
    {
        a_msg = unserializeFromBuffer( m_buffer );
        if ( !a_msg )
            EXCEPT( EC_UNREGISTERED_REPLY_TYPE, "Recv unregistered reply type." );

        if ( a_frame )
            *a_frame = &m_buffer.frame;

        return true;
    }

    return false;
}


// Just like send except client ID is sent along with serialized message
#if 0
void
Connection::send( Message &a_message, const std::string &a_client_id )
{
    // Place client ID in buffer and set offset
    m_buffer.offset = a_client_id.size();
    memcpy( m_buffer.buffer, a_client_id.data(), m_buffer.offset );

    // Send message as usual
    send( a_message );
}


// Just like recv except client ID is extracted from recv buffer
MsgFrame
Connection::recv( Message *&a_msg, uint32_t a_timeout, std::string &a_client_id )
{
    // Recv message as usual
    MsgFrame frame = recv( a_msg, a_timeout );

    // Get client ID from buffer
    if ( m_buffer.offset > 0 )
        a_client_id.assign( m_buffer.buffer, m_buffer.offset );

    return frame;
}
#endif


void
Connection::send( MsgBuffer &a_msg_buffer )
{
    // For servers, send client ID
    if ( m_proc_addresses )
    {
        if ( zmq_send( m_socket, a_msg_buffer.buffer, a_msg_buffer.offset, ZMQ_SNDMORE ) != (int)a_msg_buffer.offset )
            EXCEPT( EC_SEND_FAILED, "Send of routing address failed." );
    }

    // Send Message frame
    if ( zmq_send( m_socket, &a_msg_buffer.frame, sizeof( MsgFrame ), ZMQ_SNDMORE ) != sizeof( MsgFrame ))
        EXCEPT( EC_SEND_FAILED, "Send of message frame failed." );

    // Send message payload
    if ( zmq_send( m_socket, a_msg_buffer.buffer + a_msg_buffer.offset, a_msg_buffer.frame.msg_size, 0 ) != (int)a_msg_buffer.frame.msg_size )
        EXCEPT( EC_SEND_FAILED, "Send of message payload failed." );
}


bool
Connection::recv( MsgBuffer & a_msg_buffer, uint32_t a_timeout )
{
    int rc;

    //cout << "recv buf cap:" << a_msg_buffer.buffer_capacity << ", buf: " << hex << (void*)a_msg_buffer.buffer << endl;

    // Note: There is a BUG in the current version of ZeroMQ where the value returned by
    // getsockopt() for ZMQ_RCVMORE is wrong. It will incorrectly indicate that more
    // parts are available event when there isn't, and the subsequent call to recv() will
    // block. Do NOT use ZMQ_RCVMORE. Instead, simply use non-blocking receievs and check
    // error codes. According to the ZeroMQ docs, all parts of a message should be
    // delivered atomically, so this approach should work for normal cases, and detect
    // mal-formed, or partial messages.

    // Wait up to timeout for a message to arrive
    while (( rc = zmq_poll( &m_poll_item, 1, a_timeout )) < 1 )
    {
        // Timeout - nothing else to do, return failure
        if ( rc == 0 )
            return false;
    }

    // If this is a server (router), receive address of sender
    if ( m_proc_addresses )
    {
        if (( rc = zmq_recv( m_socket, a_msg_buffer.buffer, a_msg_buffer.capacity, ZMQ_DONTWAIT )) < 0 || rc > MAX_ADDR_LEN )
            EXCEPT( EC_RCV_FAILED, "Recv of routing address failed." );

        a_msg_buffer.offset = rc;

        //string cid;
        //cid.assign( a_msg_buffer.buffer, a_msg_buffer.msg_offset );
        //cout << "rcv id: " << cid << endl;
    }
    else
    {
        a_msg_buffer.offset = 0;
    }

    // Receive our message frame (type and size)
    if (( rc = zmq_recv( m_socket, &a_msg_buffer.frame, sizeof( MsgFrame ), ZMQ_DONTWAIT )) < 0 || (size_t)rc != sizeof( MsgFrame ))
        EXCEPT( EC_RCV_FAILED, "Rcv of message frame failed." );

    //cout << "inbound msg size: " << a_msg_buffer.frame.msg_size << endl;

    // Resize buffer if too small
    ensureCapacity( a_msg_buffer );


    // Receieve message (binary serialized protobuf)
    if (( rc = zmq_recv( m_socket, a_msg_buffer.buffer + a_msg_buffer.offset, a_msg_buffer.frame.msg_size, ZMQ_DONTWAIT )) < 0 || (uint32_t)rc != a_msg_buffer.frame.msg_size )
        EXCEPT( EC_RCV_FAILED, "Rcv of message payload failed." );

    return true;
}


void
Connection::getPollInfo( zmq_pollitem_t  & a_poll_data )
{
    a_poll_data.socket = m_socket;
    a_poll_data.events = ZMQ_POLLIN;
}


Message*
Connection::unserializeFromBuffer( MsgBuffer & a_msg_buffer )
{
    map<uint8_t,const FileDescriptorType *>::iterator iProto = m_descriptors.find( a_msg_buffer.frame.proto_id );
    if ( iProto != m_descriptors.end() && a_msg_buffer.frame.msg_id < (uint8_t)iProto->second->message_type_count())
    {
        //cout << "proto " << a_msg_buffer.frame.msg_id.proto_id << "found" << endl;

        // Get the default class via descriptor to construct new message instance
        const DescriptorType * msg_descriptor = iProto->second->message_type( a_msg_buffer.frame.msg_id );
        const Message * default_msg = m_factory->GetPrototype( msg_descriptor );

        Message * msg = default_msg->New();

        if ( msg )
        {
            if ( msg->ParseFromArray( a_msg_buffer.buffer + a_msg_buffer.offset, a_msg_buffer.frame.msg_size ))
                return msg;
            else
                delete msg;
        }
    }

    return 0;
}


// Serialize reply into buffer
void
Connection::serializeToBuffer( Message &a_msg, MsgBuffer & a_msg_buffer )
{
    const DescriptorType * desc = a_msg.GetDescriptor();
    const FileDescriptorType * file = desc->file();

    a_msg_buffer.frame.proto_id = file->enum_type(0)->value(0)->number();
    a_msg_buffer.frame.msg_id = desc->index();
    a_msg_buffer.frame.msg_size = a_msg.ByteSize();

    // Make sure buffer is big enough
    ensureCapacity( a_msg_buffer );

    // Serialize message - may fail if required fields are missing
    if ( !a_msg.SerializeToArray( a_msg_buffer.buffer + a_msg_buffer.offset, a_msg_buffer.frame.msg_size ))
        EXCEPT( EC_PROTO_SERIALIZE, "SerializeToArray for message failed." );
}


void
Connection::setupSocketKeepAlive()
{
    int value = 1;
    zmq_setsockopt( m_socket, ZMQ_TCP_KEEPALIVE, &value, sizeof( int ));
    value = 20;
    zmq_setsockopt( m_socket, ZMQ_TCP_KEEPALIVE_CNT, &value, sizeof( int ));
    value = 540;
    zmq_setsockopt( m_socket, ZMQ_TCP_KEEPALIVE_IDLE, &value, sizeof( int ));
    value = 5;
    zmq_setsockopt( m_socket, ZMQ_TCP_KEEPALIVE_INTVL, &value, sizeof( int ));
}

void
Connection::init( const string & a_address )
{
    int rc;

    cout << "Connection addr: " << a_address << endl;

    m_factory = google::protobuf::MessageFactory::generated_factory();

    // Setup ZeroMQ
    if ( !m_context )
    {
        m_context = zmq_ctx_new();
        m_context_owner = true;
    }

    m_proc_addresses = false;

    switch ( m_mode )
    {
        case Server:
            m_proc_addresses = true;
            m_socket = zmq_socket( m_context, ZMQ_ROUTER );
            setupSocketKeepAlive();
            rc = zmq_bind ( m_socket, a_address.c_str() );
            if ( rc == -1 )
                EXCEPT_PARAM( EC_ZMQ_ERROR, "ZeroMQ bind to address " << a_address << " failed." );
            break;

        case Worker:
            m_proc_addresses = true;
            m_socket = zmq_socket( m_context, ZMQ_DEALER );
            setupSocketKeepAlive();
            rc = zmq_connect( m_socket, a_address.c_str() );
            if ( rc == -1 )
                EXCEPT_PARAM( EC_ZMQ_ERROR, "ZeroMQ connect to address " << a_address << " failed." );
            break;

        case Client:
            m_socket = zmq_socket( m_context, ZMQ_DEALER );
            setupSocketKeepAlive();
            rc = zmq_connect( m_socket, a_address.c_str() );
            if ( rc == -1 )
                EXCEPT_PARAM( EC_ZMQ_ERROR, "ZeroMQ connect to address " << a_address << " failed." );
            break;

        case Publisher:
            m_socket = zmq_socket( m_context, ZMQ_PUB );
            setupSocketKeepAlive();
            rc = zmq_bind ( m_socket, a_address.c_str() );
            if ( rc == -1 )
                EXCEPT_PARAM( EC_ZMQ_ERROR, "ZeroMQ bind to address " << a_address << " failed." );
            break;

        case Subscriber:
            m_socket = zmq_socket( m_context, ZMQ_SUB );
            setupSocketKeepAlive();
            rc = zmq_connect( m_socket, a_address.c_str() );
            if ( rc == -1 )
                EXCEPT_PARAM( EC_ZMQ_ERROR, "ZeroMQ connect to address " << a_address << " failed." );
            rc = zmq_setsockopt( m_socket, ZMQ_SUBSCRIBE, "", 0 );
            if ( rc == -1 )
                EXCEPT_PARAM( EC_ZMQ_ERROR, "ZeroMQ subscribe for address " << a_address << " failed." );
            break;
    }

    int linger = 100;
    zmq_setsockopt( m_socket, ZMQ_LINGER, &linger, sizeof( int ));

    m_poll_item.socket = m_socket;
    m_poll_item.events = ZMQ_POLLIN;
}


void
Connection::ensureCapacity( MsgBuffer & a_msg_buffer )
{
    if ( a_msg_buffer.frame.msg_size + a_msg_buffer.offset > a_msg_buffer.capacity )
    {
        //cout << "buf resize" << endl;

        char *new_buffer = new char[a_msg_buffer.frame.msg_size + a_msg_buffer.offset];
        memcpy( new_buffer, a_msg_buffer.buffer, a_msg_buffer.offset );
        delete[] a_msg_buffer.buffer;
        a_msg_buffer.buffer = new_buffer;
        a_msg_buffer.capacity = a_msg_buffer.frame.msg_size + a_msg_buffer.offset;

        //cout << "recv buf cap:" << a_msg_buffer.buffer_capacity << ", buf: " << hex << a_msg_buffer.buffer << endl;
    }
}

}
