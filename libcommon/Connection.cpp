#include <iostream>
#include "Connection.hpp"

using namespace std;


#define MAX_ADDR_LEN 1000

Connection::Connection( const std::string & a_url, Mode a_mode, void * a_context )
    : m_context(a_context), m_socket(0), m_mode(a_mode), m_proc_addresses(false), m_context_owner(false)
{
    init( a_url.c_str() );
}

Connection::Connection( const std::string & a_host, uint16_t a_port, Connection::Mode a_mode, void * a_context )
    : m_context(a_context), m_socket(0), m_mode(a_mode), m_proc_addresses(false), m_context_owner(false)
{
    string address = string("tcp://") + a_host + ":" + to_string( a_port );
    init( address.c_str() );
}


Connection::~Connection()
{
    zmq_close( m_socket );
    if ( m_context_owner )
        zmq_ctx_destroy( m_context );
}


void
Connection::send( const MsgHeader & a_msg, const char * a_data )
{
    if ( a_msg.data_size )
    {
        if ( !a_data )
            throw runtime_error( "Send failed due to data payload pointer." );

        uint32_t size = a_msg.msg_size + a_msg.data_size;

        cout << "sending " << size << "\n";

        // Send total size
        if ( zmq_send( m_socket, &size, sizeof( uint32_t ), ZMQ_SNDMORE ) != sizeof( uint32_t ))
            throw runtime_error( "Send message size failed." );

        cout << "sending msg_size " << a_msg.msg_size << "\n";

        // Send message
        if ( zmq_send( m_socket, &a_msg, a_msg.msg_size, ZMQ_SNDMORE ) != a_msg.msg_size )
            throw runtime_error( "Send message failed." );

        cout << "sending data_size " << a_msg.data_size << "\n";

        // Send data
        if ( zmq_send( m_socket, a_data, a_msg.data_size, 0 ) != a_msg.data_size )
            throw runtime_error( "Send data failed." );
    }
    else
    {
        // Send total size
        if ( zmq_send( m_socket, &a_msg.msg_size, sizeof( uint32_t ), ZMQ_SNDMORE ) != sizeof( uint32_t ))
            throw runtime_error( "Send message size failed." );

        // Send message
        if ( zmq_send( m_socket, &a_msg, a_msg.msg_size, 0 ) != a_msg.msg_size )
            throw runtime_error( "Send message failed." );
    }
}


void
Connection::send( MsgBuffer &a_msg_buffer )
{
    // For servers, send client ID
    if ( m_proc_addresses )
    {
        if ( zmq_send( m_socket, a_msg_buffer.m_buffer, a_msg_buffer.m_offset, ZMQ_SNDMORE ) != (int)a_msg_buffer.m_offset )
            throw runtime_error( "Send client ID failed." );
    }

    // Send message size
    if ( zmq_send( m_socket, &a_msg_buffer.m_size, sizeof( a_msg_buffer.m_size ), ZMQ_SNDMORE ) != sizeof( a_msg_buffer.m_size ))
        throw runtime_error( "Send message size failed." );

    // Send message payload
    if ( zmq_send( m_socket, a_msg_buffer.m_buffer + a_msg_buffer.m_offset, a_msg_buffer.m_size, 0 ) != (int)a_msg_buffer.m_size )
        throw runtime_error( "Send message payload failed." );
}


bool
Connection::recv( MsgBuffer & a_msg_buffer, uint64_t a_timeout )
{
    int rc;

    //cout << "RCV\n";

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
        // Timeout - nothing else to do, return timeout (false)
        if ( rc == 0 )
            return false;
    }

    // If this is a server (router), receive address of sender
    if ( m_proc_addresses )
    {
        if (( rc = zmq_recv( m_socket, a_msg_buffer.m_buffer, a_msg_buffer.m_capacity, ZMQ_DONTWAIT )) < 0 || rc > MAX_ADDR_LEN )
            throw runtime_error( "Recv client ID failed." );

        a_msg_buffer.m_offset = rc;
        
        // Debug ONLY
        cout << "CID";
        for ( int i = 0; i < rc; ++i )
            cout << " " << (int)(unsigned char)a_msg_buffer.m_buffer[i];
        cout << "\n";
    }
    else
    {
        a_msg_buffer.m_offset = 0;
    }

    // Receive message size
    if (( rc = zmq_recv( m_socket, &a_msg_buffer.m_size, sizeof( a_msg_buffer.m_size ), ZMQ_DONTWAIT )) < 0 || (size_t)rc != sizeof( a_msg_buffer.m_size ))
        throw runtime_error( "Recv buffer size failed." );

    //cout << "rcv size: " << a_msg_buffer.m_size << endl;

    // Resize buffer if too small
    a_msg_buffer.ensureCapacity();

    // Note: message may be in one or two parts depending on how it was sent

    // Receieve message (and maybe payload)
    if (( rc = zmq_recv( m_socket, a_msg_buffer.m_buffer + a_msg_buffer.m_offset, a_msg_buffer.m_size, ZMQ_DONTWAIT )) < 0 )
        throw runtime_error( "Recv message failed." );

    uint32_t p1sz = (uint32_t)rc;

    //cout << "rcv p1sz size: " << p1sz << endl;

    if ( p1sz < a_msg_buffer.m_size )
    {
        cout << "need more data...\n";

        // Check if there is another msg part
        int more = 0;
        size_t more_sz = sizeof( more );
        if ( zmq_getsockopt( m_socket, ZMQ_RCVMORE, &more, &more_sz ) < 0 || more != 1 )
            throw runtime_error( "Malformed message received." );

        cout << "more data!\n";

        if (( rc = zmq_recv( m_socket, a_msg_buffer.m_buffer + a_msg_buffer.m_offset + p1sz, a_msg_buffer.m_size - p1sz, ZMQ_DONTWAIT )) < 0 )
            throw runtime_error( "Recv data payload failed." );

        if ( ((uint32_t)rc) + p1sz != a_msg_buffer.m_size )
        {
            cout << "Got " << ((uint32_t)rc) + p1sz << " bytes, expected " << a_msg_buffer.m_size << "\n";
            throw runtime_error( "Recv wrong payload size." );
        }
    }

    return true;
}


void
Connection::getPollInfo( zmq_pollitem_t & a_poll_data )
{
    a_poll_data.socket = m_socket;
    a_poll_data.events = ZMQ_POLLIN;
}


string
Connection::getClientID( MsgBuffer & a_msg_buffer )
{
    string id;
    id.assign( a_msg_buffer.m_buffer, a_msg_buffer.m_offset );

    return id;
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

    // Setup ZeroMQ
    if ( !m_context )
    {
        m_context = zmq_ctx_new();
        m_context_owner = true;
    }

    m_proc_addresses = false;

    cout << "init addr: " << a_address << "\n";

    switch ( m_mode )
    {
        case Server:
            m_proc_addresses = true;
            m_socket = zmq_socket( m_context, ZMQ_ROUTER );
            setupSocketKeepAlive();
            rc = zmq_bind ( m_socket, a_address.c_str() );
            if ( rc == -1 )
            {
                cout << "Error: " << zmq_strerror(errno) << "\n";
                throw runtime_error( "ZeroMQ bind to address failed." );
            }
            break;

        case Worker:
            m_proc_addresses = true;
            m_socket = zmq_socket( m_context, ZMQ_DEALER );
            setupSocketKeepAlive();
            rc = zmq_connect( m_socket, a_address.c_str() );
            if ( rc == -1 )
                throw runtime_error( "ZeroMQ connect to address failed." );
            break;

        case Client:
            m_socket = zmq_socket( m_context, ZMQ_DEALER );
            setupSocketKeepAlive();
            rc = zmq_connect( m_socket, a_address.c_str() );
            if ( rc == -1 )
                throw runtime_error( "ZeroMQ connect to address failed." );
            break;

        case Publisher:
            m_socket = zmq_socket( m_context, ZMQ_PUB );
            setupSocketKeepAlive();
            rc = zmq_bind ( m_socket, a_address.c_str() );
            if ( rc == -1 )
                throw runtime_error( "ZeroMQ bind to address failed." );
            break;

        case Subscriber:
            m_socket = zmq_socket( m_context, ZMQ_SUB );
            setupSocketKeepAlive();
            rc = zmq_connect( m_socket, a_address.c_str() );
            if ( rc == -1 )
                throw runtime_error( "ZeroMQ connect to address failed." );
            rc = zmq_setsockopt( m_socket, ZMQ_SUBSCRIBE, "", 0 );
            if ( rc == -1 )
                throw runtime_error( "ZeroMQ subscribe to address failed." );
            break;
    }

    int linger = 100;
    zmq_setsockopt( m_socket, ZMQ_LINGER, &linger, sizeof( int ));

    m_poll_item.socket = m_socket;
    m_poll_item.events = ZMQ_POLLIN;
}


