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


MsgComm::MsgComm( const std::string & a_address, size_t a_sock_type, bool a_bind, SecurityContext * a_sec_ctx, void * a_zmq_ctx )
    : m_socket(0)
{
    init( a_address, a_sock_type, a_bind, a_sec_ctx, a_zmq_ctx );
}

MsgComm::MsgComm( const std::string & a_host, uint16_t a_port, size_t a_sock_type, bool a_bind, SecurityContext * a_sec_ctx, void * a_zmq_ctx )
    : m_socket(0)
{
    string address = string("tcp://") + a_host + ":" + to_string( a_port );
    init( address.c_str(), a_sock_type, a_bind, a_sec_ctx, a_zmq_ctx );
}

MsgComm::~MsgComm()
{
    zmq_close( m_socket );
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

    uint8_t * route = a_msg_buf.getRouteBuffer();
    if ( *route )
    {
        cout << "route parts: " << (int)*route << "\n";
        uint8_t * rptr = route + 1;

        for ( uint8_t i = 0; i < *route; i++, rptr += ( *rptr + 1 ))
        {
            cout << "part " << (int)i << " sz: " << (int) *rptr << "\n";
            //cout << "Route addr:\n";
            //hexDump( a_msg_buf.getRouteBuffer(), a_msg_buf.getRouteBuffer() + a_msg_buf.getRouteLen(), cout );

            zmq_msg_init_size( &msg, *rptr );
            memcpy( zmq_msg_data( &msg ), rptr + 1, *rptr );

            if (( rc = zmq_msg_send( &msg, m_socket, ZMQ_SNDMORE )) < 0 )
                EXCEPT( 1, "zmq_msg_send (route) failed." );
        }
    }

    // Send NULL delimiter

    zmq_msg_init( &msg );
    if (( rc = zmq_msg_send( &msg, m_socket, ZMQ_SNDMORE )) < 0 )
        EXCEPT( 1, "zmq_msg_send (delimiter) failed." );

    // Send message Frame

    zmq_msg_init_size( &msg, sizeof( MsgBuf::Frame ));
    memcpy( zmq_msg_data( &msg ), &a_msg_buf.getFrame(), sizeof( MsgBuf::Frame ));
    if (( rc = zmq_msg_send( &msg, m_socket, a_msg_buf.getFrame().size?ZMQ_SNDMORE:0 )) < 0 )
        EXCEPT( 1, "zmq_msg_send (frame) failed." );

    if ( a_msg_buf.getFrame().size )
    {
        //cout << "send body\n";

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
    size_t len;

    //cout << "rcv poll\n";

    while (( rc = zmq_poll( &m_poll_item, 1, a_timeout?a_timeout:-1 )) < 1 )
    {
        if ( rc == 0 ) // Timeout
            return false;
    }

    //cout << "rcv route\n";

    uint8_t * route = a_msg_buf.getRouteBuffer();
    uint8_t * rptr = route + 1;
    size_t tot_len = 1;

    *route = 0;

    while ( 1 )
    {
        zmq_msg_init( &msg );

        if (( rc = zmq_msg_recv( &msg, m_socket, ZMQ_DONTWAIT )) < 0 )
            EXCEPT( 1, "zmq_msg_recv (route) failed." );

        len = zmq_msg_size( &msg );

        // Stop when delimiter is read
        if ( !len )
            break;

        if ( len > 255 )
            EXCEPT( 1, "Message route segment max len exceeded." );

        if ((( rptr + len ) - route ) > MAX_ROUTE_LEN )
            EXCEPT( 1, "Message route total max len exceeded." );

        tot_len += len + 1;

        *rptr = (uint8_t) len;
        memcpy( rptr + 1, (char *)zmq_msg_data( &msg ), len );

        //cout << "Route addr ("<< zmq_msg_size( &msg ) << "):\n";
        //hexDump( (char *)zmq_msg_data( &msg ), ((char *)zmq_msg_data( &msg )) + zmq_msg_size( &msg ), cout );

        zmq_msg_close( &msg );
        (*route)++;
        rptr += *rptr + 1;
    }

    if ( tot_len > 1 )
    {
        cout << "Route addr ("<< tot_len << "):\n";
        hexDump( (char*)route, (char*)(route + tot_len), cout );
    }

    zmq_msg_init( &msg );

    //cout << "rcv frame\n";

    if (( rc = zmq_msg_recv( &msg, m_socket, ZMQ_DONTWAIT )) < 0 )
        EXCEPT( 1, "zmq_msg_recv (frame) failed." );

    if ( zmq_msg_size( &msg ) != sizeof( MsgBuf::Frame ))
    {
        hexDump( (char *)zmq_msg_data( &msg ), ((char *)zmq_msg_data( &msg )) + zmq_msg_size( &msg ), cout );
        EXCEPT_PARAM( 1, "Invalid message frame received. Expected " << sizeof( MsgBuf::Frame ) << " got " << zmq_msg_size( &msg ) );
    }

    a_msg_buf.getFrame() = *((MsgBuf::Frame*) zmq_msg_data( &msg ));

    cout << "Frame[sz:" << a_msg_buf.getFrame().size << ",pid:" << (int)a_msg_buf.getFrame().proto_id << ",mid:" << (int)a_msg_buf.getFrame().msg_id<<",ctx:"<<a_msg_buf.getFrame().context << "]\n";

    zmq_msg_close( &msg );

    if ( a_msg_buf.getFrame().size )
    {
        //cout << "rcv body\n";

        zmq_msg_init( &msg );

        if (( rc = zmq_msg_recv( &msg, m_socket, ZMQ_DONTWAIT )) < 0 )
            EXCEPT( 1, "zmq_msg_recv (body) failed." );

        if ( zmq_msg_size( &msg ) != a_msg_buf.getFrame().size )
            EXCEPT_PARAM( 1, "Invalid message body received. Expected: " << a_msg_buf.getFrame().size << ", got: " << zmq_msg_size( &msg ) );

        a_msg_buf.ensureCapacity( a_msg_buf.getFrame().size );
        memcpy( a_msg_buf.getBuffer(), zmq_msg_data( &msg ), a_msg_buf.getFrame().size );

        //cout << "Body:\n";
        //hexDump( a_msg_buf.getBuffer(), a_msg_buf.getBuffer() + a_msg_buf.getFrame().size, cout );

        zmq_msg_close( &msg );
    }

    return true;
}


void
MsgComm::getPollInfo( zmq_pollitem_t  & a_poll_data )
{
    a_poll_data.socket = m_socket;
    a_poll_data.events = ZMQ_POLLIN;
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
MsgComm::init( const string & a_address, size_t a_sock_type, bool a_bind, SecurityContext * a_sec_ctx, void * a_zmq_ctx )
{
    int rc;
    void * ctx = a_zmq_ctx?a_zmq_ctx:getContext();

    m_socket = zmq_socket( ctx, a_sock_type );
    if ( !m_socket )
    {
        cerr << "sock failed: " << zmq_strerror(errno) << ", ctx: " << ctx << endl;
        EXCEPT( 1, "zmq_socket failed." );
    }

    setupSecurityContext( a_sec_ctx );

    int value = 1;
    zmq_setsockopt( m_socket, ZMQ_TCP_KEEPALIVE, &value, sizeof( int ));
    value = 20;
    zmq_setsockopt( m_socket, ZMQ_TCP_KEEPALIVE_CNT, &value, sizeof( int ));
    value = 540;
    zmq_setsockopt( m_socket, ZMQ_TCP_KEEPALIVE_IDLE, &value, sizeof( int ));
    value = 5;
    zmq_setsockopt( m_socket, ZMQ_TCP_KEEPALIVE_INTVL, &value, sizeof( int ));

    if ( a_bind )
    {
        if (( rc = zmq_bind( m_socket, a_address.c_str() )) == -1 )
            EXCEPT_PARAM( 1, "ZeroMQ bind to address " << a_address << " failed." );
    }
    else
    {
        if (( rc = zmq_connect( m_socket, a_address.c_str() )) == -1 )
            EXCEPT_PARAM( 1, "ZeroMQ connect to address " << a_address << " failed." );
    }

    if ( a_sock_type == ZMQ_SUB )
    {
        if (( rc = zmq_setsockopt( m_socket, ZMQ_SUBSCRIBE, "", 0 )) == -1 )
            EXCEPT_PARAM( 1, "ZeroMQ subscribe for address " << a_address << " failed." );
    }

    value = 100;
    zmq_setsockopt( m_socket, ZMQ_LINGER, &value, sizeof( int ));

    m_poll_item.socket = m_socket;
    m_poll_item.events = ZMQ_POLLIN;
}

void *
MsgComm::getContext()
{
    static void * zmq_ctx = zmq_ctx_new();

    return zmq_ctx;
}

