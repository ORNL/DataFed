#include <iostream>
#include <iomanip>
#include "TraceException.hpp"
#include "MsgComm.hpp"

using namespace std;


#define MAX_ADDR_LEN 1000

void hexDump( const char * a_buffer, const char *a_buffer_end, ostream & a_out )
{
    const unsigned char * p = (unsigned char *) a_buffer;
    const unsigned char * e = (unsigned char *) a_buffer_end;
    bool done = false;

    int l = 0, i = 0;
    while ( !done )
    {
        a_out << setw(4) << setfill('0') << dec << l << ": ";

        for ( i = 0; i < 16; ++i )
        {
            if ( i == 8 )
                a_out << "  ";

            if ( p + i != e )
            {
                a_out << hex << setw(2) << setfill('0') << ((unsigned short)(*(p+i))) << " ";
            }
            else
            {
                done = true;

                for ( ; i < 16; ++i )
                    a_out << "   ";

                break;
            }
        }

        a_out << "  ";

        for ( i = 0; i < 16; ++i )
        {
            if ( p + i != e )
            {
                if ( isprint( *(p + i )))
                    a_out << *(p+i);
                else
                    a_out << ".";
            }
            else
                break;
        }

        a_out << "\n";

        p += 16;
        l += 16;
    }
}


void freeBuffer( void * a_data, void * a_hint )
{
    (void) a_hint;
    delete (char*) a_data;
}

MsgComm::MsgComm( const std::string & a_address, MsgComm::Mode a_mode, SecurityContext * a_sec_ctx, void * a_context )
    : m_context(a_context), m_socket(0), m_mode(a_mode), m_proc_addresses(false), m_context_owner(false)
{
    init( a_address, a_sec_ctx );
}

MsgComm::MsgComm( const std::string & a_host, uint16_t a_port, MsgComm::Mode a_mode, SecurityContext * a_sec_ctx, void * a_context )
    : m_context(a_context), m_socket(0), m_mode(a_mode), m_proc_addresses(false), m_context_owner(false)
{
    string address = string("tcp://") + a_host + ":" + to_string( a_port );
    init( address.c_str(), a_sec_ctx );
}

MsgComm::~MsgComm()
{
    zmq_close( m_socket );
    if ( m_context_owner )
        zmq_ctx_destroy( m_context );
}

void
MsgComm::send( MsgBuf::Message & a_msg, uint16_t a_context )
{
    MsgBuf buf;

    buf.getFrame().context = a_context;
    buf.serialize( a_msg );

    send( buf );
}

void
MsgComm::send( MsgBuf & a_msg_buf )
{
    zmq_msg_t msg;
    int rc;

    if ( m_proc_addresses )
    {
        cout << "send addr\n";
        cout << "Route addr:\n";
        hexDump( a_msg_buf.getRouteBuffer(), a_msg_buf.getRouteBuffer() + a_msg_buf.getRouteLen(), cout );

        zmq_msg_init_size( &msg, a_msg_buf.getRouteLen() );
        memcpy( zmq_msg_data( &msg ), a_msg_buf.getRouteBuffer(), a_msg_buf.getRouteLen() );

        if (( rc = zmq_msg_send( &msg, m_socket, ZMQ_SNDMORE )) < 0 )
            EXCEPT( 1, "zmq_msg_send (route) failed." );
    }

    zmq_msg_init_size( &msg, sizeof( MsgBuf::Frame ));
    memcpy( zmq_msg_data( &msg ), &a_msg_buf.getFrame(), sizeof( MsgBuf::Frame ));

    cout << "send frame\n";

    if (( rc = zmq_msg_send( &msg, m_socket, a_msg_buf.getFrame().size?ZMQ_SNDMORE:0 )) < 0 )
        EXCEPT( 1, "zmq_msg_send (frame) failed." );

    if ( a_msg_buf.getFrame().size )
    {
        cout << "send body\n";

        zmq_msg_init_data( &msg, a_msg_buf.acquireBuffer(), a_msg_buf.getFrame().size, freeBuffer, 0 );

        if (( rc = zmq_msg_send( &msg, m_socket, 0 )) < 0 )
            EXCEPT( 1, "zmq_msg_send (body) failed." );
    }
}

bool
MsgComm::recv( MsgBuf::Message *& a_msg, MsgBuf::Frame & a_frame, uint32_t a_timeout )
{
    MsgBuf buf;

    if ( recv( buf, a_timeout ))
    {
        a_frame = buf.getFrame();
        a_msg = buf.unserialize();
        return true;
    }

    return false;
}

bool
MsgComm::recv( MsgBuf & a_msg_buf, uint32_t a_timeout )
{
    zmq_msg_t msg;
    int rc;

    cout << "rcv poll\n";

    while (( rc = zmq_poll( &m_poll_item, 1, a_timeout?a_timeout:-1 )) < 1 )
    {
        if ( rc == 0 ) // Timeout
            return false;
    }

    if ( m_proc_addresses )
    {
        cout << "rcv route\n";

        zmq_msg_init( &msg );

        if (( rc = zmq_msg_recv( &msg, m_socket, ZMQ_DONTWAIT )) < 0 )
            EXCEPT( 1, "zmq_msg_recv (route) failed." );

        if ( zmq_msg_size( &msg ) >= MAX_ROUTE_LEN )
            EXCEPT( 1, "Invalid message route received." );

        a_msg_buf.setRoute( (char *)zmq_msg_data( &msg ), zmq_msg_size( &msg ));

        cout << "Route addr:\n";
        hexDump( (char *)zmq_msg_data( &msg ), ((char *)zmq_msg_data( &msg )) + zmq_msg_size( &msg ), cout );
        hexDump( a_msg_buf.getRouteBuffer(), a_msg_buf.getRouteBuffer() + a_msg_buf.getRouteLen(), cout );

        zmq_msg_close( &msg );
    }

    zmq_msg_init( &msg );

    cout << "rcv frame\n";

    if (( rc = zmq_msg_recv( &msg, m_socket, ZMQ_DONTWAIT )) < 0 )
        EXCEPT( 1, "zmq_msg_recv (frame) failed." );

    if ( zmq_msg_size( &msg ) != sizeof( MsgBuf::Frame ))
        EXCEPT( 1, "Invalid message frame received." );

    a_msg_buf.getFrame() = *((MsgBuf::Frame*) zmq_msg_data( &msg ));

    cout << "Frame[sz:" << a_msg_buf.getFrame().size << ",pid:" << (int)a_msg_buf.getFrame().proto_id << ",mid:" << (int)a_msg_buf.getFrame().msg_id<<",ctx:"<<a_msg_buf.getFrame().context << "]\n";;

    zmq_msg_close( &msg );

    if ( a_msg_buf.getFrame().size )
    {
        cout << "rcv body\n";

        zmq_msg_init( &msg );

        if (( rc = zmq_msg_recv( &msg, m_socket, ZMQ_DONTWAIT )) < 0 )
            EXCEPT( 1, "zmq_msg_recv (body) failed." );

        if ( zmq_msg_size( &msg ) != a_msg_buf.getFrame().size )
            EXCEPT_PARAM( 1, "Invalid message body received. Expected: " << a_msg_buf.getFrame().size << ", got: " << zmq_msg_size( &msg ) );

        a_msg_buf.ensureCapacity( a_msg_buf.getFrame().size );
        memcpy( a_msg_buf.getBuffer(), zmq_msg_data( &msg ), a_msg_buf.getFrame().size );

        cout << "Body:\n";
        hexDump( a_msg_buf.getBuffer(), a_msg_buf.getBuffer() + a_msg_buf.getFrame().size, cout );

        zmq_msg_close( &msg );
    }

    return true;
}

#if 0

bool
MsgComm::send( MessageType &a_message )
{
    serializeToBuffer( a_message, m_buffer );

    return send( m_buffer );
}


Connection::MessageID
Connection::recv( MessageType *&a_msg, uint32_t a_timeout )
{
    a_msg = 0;
    if ( recv( m_buffer, a_timeout ))
    {
        a_msg = unserializeFromBuffer( m_buffer );
        return m_buffer.frame.msg_id;
    }

    return MessageID();
}


// Just like send except client ID is sent along with serialized message
bool
Connection::send( MessageType &a_message, const std::string &a_client_id )
{
    // Place client ID in buffer and set msg_offset
    m_buffer.msg_offset = a_client_id.size();
    memcpy( m_buffer.buffer, a_client_id.data(), m_buffer.msg_offset );

    // Send message as usual
    return send( a_message );
}


// Just like recv except client ID is extracted from recv buffer
Connection::MessageID
Connection::recv( MessageType *&a_msg, uint32_t a_timeout, std::string &a_client_id )
{
    // Recv message as usual
    MessageID msg_id = recv( a_msg, a_timeout );

    // Get client ID from buffer
    if ( msg_id.msg_idx > 0 )
        a_client_id.assign( m_buffer.buffer, m_buffer.msg_offset );

    return msg_id;
}


bool
Connection::send( Connection::MessageBuffer &a_msg_buffer )
{
    // For servers, send client ID
    if ( m_proc_addresses )
    {
        if ( zmq_send( m_socket, a_msg_buffer.buffer, a_msg_buffer.msg_offset, ZMQ_SNDMORE ) != (int)a_msg_buffer.msg_offset )
            return false;
    }

    // Send Message frame
    if ( zmq_send( m_socket, &a_msg_buffer.frame, sizeof( MessageFrame ), ZMQ_SNDMORE ) != sizeof( MessageFrame ))
        return false;

    // Send message payload
    if ( zmq_send( m_socket, a_msg_buffer.buffer + a_msg_buffer.msg_offset, a_msg_buffer.frame.msg_size, 0 ) != (int)a_msg_buffer.frame.msg_size )
        return false;

    return true;
}


bool
Connection::recv( MessageBuffer & a_msg_buffer, uint32_t a_timeout )
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
        if (( rc = zmq_recv( m_socket, a_msg_buffer.buffer, a_msg_buffer.buffer_capacity, ZMQ_DONTWAIT )) < 0 || rc > MAX_ADDR_LEN )
        {
            return false;
        }
        a_msg_buffer.msg_offset = rc;

        //string cid;
        //cid.assign( a_msg_buffer.buffer, a_msg_buffer.msg_offset );
        //cout << "rcv id: " << cid << endl;
    }
    else
    {
        a_msg_buffer.msg_offset = 0;
    }

    // Receive our message frame (type and size)
    if (( rc = zmq_recv( m_socket, &a_msg_buffer.frame, sizeof( MessageFrame ), ZMQ_DONTWAIT )) < 0 || (size_t)rc != sizeof( MessageFrame ))
    {
        // Malformed message!
        return false;
    }

    //cout << "inbound msg size: " << a_msg_buffer.frame.msg_size << endl;

    // Resize buffer if too small
    ensureCapacity( a_msg_buffer );


    // Receieve message (binary serialized protobuf)
    if (( rc = zmq_recv( m_socket, a_msg_buffer.buffer + a_msg_buffer.msg_offset, a_msg_buffer.frame.msg_size, ZMQ_DONTWAIT )) < 0 || (uint32_t)rc != a_msg_buffer.frame.msg_size )
    {
        // Malformed message!
        return false;
    }
    //cout << "msg_id: " << a_msg_buffer.frame.msg_id.proto_id << ":" << a_msg_buffer.frame.msg_id.msg_idx << endl;

    return true;
}
#endif

void
MsgComm::getPollInfo( zmq_pollitem_t  & a_poll_data )
{
    a_poll_data.socket = m_socket;
    a_poll_data.events = ZMQ_POLLIN;
}

/*
string
MsgComm::getClientID( MessageBuffer & a_msg_buffer )
{
    string id;
    id.assign( a_msg_buffer.buffer, a_msg_buffer.msg_offset );

    return id;
}
*/


void
MsgComm::setupSocketKeepAlive()
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
MsgComm::setupSecurityContext( SecurityContext * a_sec_ctx )
{
    if ( !a_sec_ctx )
        return;

    uint8_t private_key[32];
    uint8_t public_key[32];
    int rc;

    if ( !zmq_z85_decode( private_key, a_sec_ctx->private_key.c_str() ))
        EXCEPT( 1, "Decode private key failed." );

    if ( !zmq_z85_decode( public_key, a_sec_ctx->public_key.c_str() ))
        EXCEPT( 1, "Decode public key failed." );

    if (( rc = zmq_setsockopt( m_socket, ZMQ_CURVE_SECRETKEY, private_key, 32 )) == -1 )
        EXCEPT( 1, "Set ZMQ_CURVE_SECRETKEY failed." );

    if (( rc = zmq_setsockopt( m_socket, ZMQ_CURVE_PUBLICKEY, public_key, 32 )) == -1 )
        EXCEPT( 1, "Set ZMQ_CURVE_PUBLICKEY failed." );

    if ( a_sec_ctx->is_server )
    {
        int curve_server = 1;

        if (( rc = zmq_setsockopt( m_socket, ZMQ_CURVE_SERVER, &curve_server, sizeof(curve_server))) == -1 )
            EXCEPT( 1, "Set ZMQ_CURVE_SERVER failed." );
    }
    else
    {
        if ( a_sec_ctx->server_key.size() != 40 )
            EXCEPT( 1, "Invalid server public key." );

        if (( rc = zmq_setsockopt( m_socket, ZMQ_CURVE_SERVERKEY, a_sec_ctx->server_key.c_str(), 40 )) == -1 )
            EXCEPT( 1, "Set ZMQ_CURVE_SERVERKEY failed." );
    }

/*
    rc = zmq_setsockopt( m_socket, ZMQ_ZAP_DOMAIN, "global", 0 );
    if ( rc == -1 )
    {
        cout << "Set ZMQ_CURVE_SERVER failed.\n";
        return 1;
    }
*/
}

void
MsgComm::init( const string & a_address, SecurityContext * a_sec_ctx )
{
    int rc;

    cout << "Connection addr: " << a_address << endl;

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
            setupSecurityContext( a_sec_ctx );
            setupSocketKeepAlive();
            if (( rc = zmq_bind( m_socket, a_address.c_str() )) == -1 )
                EXCEPT_PARAM( 1, "ZeroMQ bind to address " << a_address << " failed." );
            break;

        case Worker:
            m_proc_addresses = true;
            m_socket = zmq_socket( m_context, ZMQ_DEALER );
            setupSecurityContext( a_sec_ctx );
            setupSocketKeepAlive();
            if (( rc = zmq_connect( m_socket, a_address.c_str() )) == -1 )
                EXCEPT_PARAM( 1, "ZeroMQ connect to address " << a_address << " failed." );
            break;

        case Client:
            m_socket = zmq_socket( m_context, ZMQ_DEALER );
            setupSecurityContext( a_sec_ctx );
            setupSocketKeepAlive();
            if (( rc = zmq_connect( m_socket, a_address.c_str() )) == -1 )
                EXCEPT_PARAM( 1, "ZeroMQ connect to address " << a_address << " failed." );
            break;

        case Push:
            m_socket = zmq_socket( m_context, ZMQ_PUSH );
            setupSecurityContext( a_sec_ctx );
            setupSocketKeepAlive();
            if (( rc = zmq_connect( m_socket, a_address.c_str() )) == -1 )
                EXCEPT_PARAM( 1, "ZeroMQ connect to address " << a_address << " failed." );
            break;

        case Pull:
            m_socket = zmq_socket( m_context, ZMQ_PULL );
            setupSecurityContext( a_sec_ctx );
            setupSocketKeepAlive();
            if (( rc = zmq_bind( m_socket, a_address.c_str() )) == -1 )
                EXCEPT_PARAM( 1, "ZeroMQ bind to address " << a_address << " failed." );
            break;

        case Publisher:
            m_socket = zmq_socket( m_context, ZMQ_PUB );
            setupSecurityContext( a_sec_ctx );
            setupSocketKeepAlive();
            if (( rc = zmq_bind( m_socket, a_address.c_str() )) == -1 )
                EXCEPT_PARAM( 1, "ZeroMQ bind to address " << a_address << " failed." );
            break;

        case Subscriber:
            m_socket = zmq_socket( m_context, ZMQ_SUB );
            setupSecurityContext( a_sec_ctx );
            setupSocketKeepAlive();
            if (( rc = zmq_connect( m_socket, a_address.c_str() )) == -1 )
                EXCEPT_PARAM( 1, "ZeroMQ connect to address " << a_address << " failed." );
            if (( rc = zmq_setsockopt( m_socket, ZMQ_SUBSCRIBE, "", 0 )) == -1 )
                EXCEPT_PARAM( 1, "ZeroMQ subscribe for address " << a_address << " failed." );
            break;
    }

    int linger = 100;
    zmq_setsockopt( m_socket, ZMQ_LINGER, &linger, sizeof( int ));

    m_poll_item.socket = m_socket;
    m_poll_item.events = ZMQ_POLLIN;
}
