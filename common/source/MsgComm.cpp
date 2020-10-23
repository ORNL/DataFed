#include <iostream>
#include <iomanip>
#include <arpa/inet.h>
#include "TraceException.hpp"
#include "MsgComm.hpp"
#include "Util.hpp"

using namespace std;


#define MAX_ADDR_LEN 1000


void freeBuffer( void * a_data, void * a_hint )
{
    (void) a_hint;
    delete (char*) a_data;
}


MsgComm::MsgComm( const std::string & a_address, SockType a_sock_type, bool a_bind, const SecurityContext * a_sec_ctx, void * a_zmq_ctx )
    : m_socket(0), m_bound(a_bind), m_address(a_address)
{
    init( a_sock_type, a_sec_ctx, a_zmq_ctx );
}


MsgComm::MsgComm( const std::string & a_host, uint16_t a_port, SockType a_sock_type, bool a_bind, const SecurityContext * a_sec_ctx, void * a_zmq_ctx )
    : m_socket(0), m_bound(a_bind)
{
    m_address = string("tcp://") + a_host + ":" + to_string( a_port );
    init( a_sock_type, a_sec_ctx, a_zmq_ctx );
}

MsgComm::~MsgComm()
{
    zmq_close( m_socket );
}

void
MsgComm::send( MsgBuf::Message & a_msg, uint16_t a_context )
{
    MsgBuf buf( "", a_context, 0 );

    buf.serialize( a_msg );

    send( buf, false );
}

void
MsgComm::send( MsgBuf::Message & a_msg, const std::string & a_uid, uint16_t a_context )
{
    MsgBuf buf( a_uid, a_context, 0 );

    buf.serialize( a_msg );

    send( buf, true );
}

void
MsgComm::send( MsgBuf & a_msg_buf, bool a_proc_uid )
{
    zmq_msg_t msg;
    int rc;

    uint8_t * route = a_msg_buf.getRouteBuffer();
    if ( *route )
    {
        //cout << "route parts: " << (int)*route << "\n";
        uint8_t * rptr = route + 1;

        for ( uint8_t i = 0; i < *route; i++, rptr += ( *rptr + 1 ))
        {
            //cout << "part " << (int)i << " sz: " << (int) *rptr << "\n";
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
    // Convert host binary to network (big-endian)
    zmq_msg_init_size( &msg, 8 );
    unsigned char * dest = (unsigned char *)zmq_msg_data( &msg );
    MsgBuf::Frame & frame = a_msg_buf.getFrame();
    *((uint32_t*)dest) = htonl( frame.size );
    *(dest+4) = frame.proto_id;
    *(dest+5) = frame.msg_id;
    *((uint16_t*)(dest+6)) = htons( frame.context );

    //zmq_msg_init_size( &msg, sizeof( MsgBuf::Frame ));
    //memcpy( zmq_msg_data( &msg ), &a_msg_buf.getFrame(), sizeof( MsgBuf::Frame ));

    if (( rc = zmq_msg_send( &msg, m_socket, (a_msg_buf.getFrame().size || a_proc_uid )?ZMQ_SNDMORE:0 )) < 0 )
        EXCEPT( 1, "zmq_msg_send (frame) failed." );

    if ( a_msg_buf.getFrame().size )
    {
        //cout << "send body\n";

        zmq_msg_init_data( &msg, a_msg_buf.acquireBuffer(), a_msg_buf.getFrame().size, freeBuffer, 0 );

        if (( rc = zmq_msg_send( &msg, m_socket, a_proc_uid?ZMQ_SNDMORE:0 )) < 0 )
            EXCEPT( 1, "zmq_msg_send (body) failed." );
    }

    if ( a_proc_uid )
    {
        // Send message UID (if set, null otherwise)
        if ( a_msg_buf.getUID().size() )
        {
            zmq_msg_init_size( &msg, a_msg_buf.getUID().size() );
            memcpy( zmq_msg_data( &msg ), a_msg_buf.getUID().c_str(), a_msg_buf.getUID().size() );
        }
        else
        {
            zmq_msg_init( &msg );
        }

        if (( rc = zmq_msg_send( &msg, m_socket, 0 )) < 0 )
            EXCEPT( 1, "zmq_msg_send (uid) failed." );
    }
}


bool
MsgComm::recv( MsgBuf::Message *& a_msg, MsgBuf::Frame & a_frame, uint32_t a_timeout )
{
    MsgBuf buf;

    if ( recv( buf, false, a_timeout ))
    {
        a_frame = buf.getFrame();
        a_msg = buf.unserialize();
        return true;
    }

    return false;
}

bool
MsgComm::recv( MsgBuf::Message *& a_msg, MsgBuf::Frame & a_frame, std::string & a_uid, uint32_t a_timeout )
{
    MsgBuf buf;

    if ( recv( buf, true, a_timeout ))
    {
        a_frame = buf.getFrame();
        a_msg = buf.unserialize();
        a_uid = buf.getUID();
        return true;
    }

    return false;
}

bool
MsgComm::recv( MsgBuf & a_msg_buf, bool a_proc_uid, uint32_t a_timeout )
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

        *rptr = (uint8_t) len;
        memcpy( rptr + 1, (char *)zmq_msg_data( &msg ), len );

        zmq_msg_close( &msg );
        (*route)++;
        rptr += *rptr + 1;
    }

    zmq_msg_init( &msg );

    //cout << "rcv frame\n";

    if (( rc = zmq_msg_recv( &msg, m_socket, ZMQ_DONTWAIT )) < 0 )
        EXCEPT_PARAM( 1, "RCV zmq_msg_recv (frame) failed: " << zmq_strerror(errno) );

    if ( zmq_msg_size( &msg ) != sizeof( MsgBuf::Frame ))
    {
        //hexDump( (char *)zmq_msg_data( &msg ), ((char *)zmq_msg_data( &msg )) + zmq_msg_size( &msg ), cout );
        EXCEPT_PARAM( 1, "RCV Invalid message frame received. Expected " << sizeof( MsgBuf::Frame ) << " got " << zmq_msg_size( &msg ) );
    }

    unsigned char * src = (unsigned char *)zmq_msg_data( &msg );
    MsgBuf::Frame & frame = a_msg_buf.getFrame();

    frame.size = ntohl( *((uint32_t*) src ));
    frame.proto_id = *(src+4);
    frame.msg_id = *(src+5);
    frame.context = ntohs( *((uint16_t*)( src + 6 )));

    //a_msg_buf.getFrame() = *((MsgBuf::Frame*) zmq_msg_data( &msg ));

    //cout << "RCV frame[sz:" << a_msg_buf.getFrame().size << ",pid:" << (int)a_msg_buf.getFrame().proto_id << ",mid:" << (int)a_msg_buf.getFrame().msg_id<<",ctx:"<<a_msg_buf.getFrame().context << "]\n";

    zmq_msg_close( &msg );

    if ( a_msg_buf.getFrame().size )
    {
        //cout << "rcv body\n";

        zmq_msg_init( &msg );

        if (( rc = zmq_msg_recv( &msg, m_socket, ZMQ_DONTWAIT )) < 0 )
            EXCEPT( 1, "RCV zmq_msg_recv (body) failed." );

        if ( zmq_msg_size( &msg ) != a_msg_buf.getFrame().size )
            EXCEPT_PARAM( 1, "RCV Invalid message body received. Expected: " << a_msg_buf.getFrame().size << ", got: " << zmq_msg_size( &msg ) );

        a_msg_buf.ensureCapacity( a_msg_buf.getFrame().size );
        memcpy( a_msg_buf.getBuffer(), zmq_msg_data( &msg ), a_msg_buf.getFrame().size );

        //cout << "Body:\n";
        //hexDump( a_msg_buf.getBuffer(), a_msg_buf.getBuffer() + a_msg_buf.getFrame().size, cout );

        zmq_msg_close( &msg );
    }

    // Only servers recv client UID
    if ( a_proc_uid )
    {
        // If the UID metadata is set, use is; otherwise get the UID from the message
        const char * uid = zmq_msg_gets( &msg, "User-Id");
        //std::cout << "UID (meta): " << (uid?uid:"null") << "\n";
        if ( uid )
            a_msg_buf.setUID( uid, strlen( uid ));
        else
        {
            zmq_msg_init( &msg );

            if (( rc = zmq_msg_recv( &msg, m_socket, ZMQ_DONTWAIT )) < 0 )
                EXCEPT( 1, "RCV zmq_msg_recv (uid) failed." );

            if ( zmq_msg_size( &msg ))
            {
                //std::cout << "UID (msg): " << (char*)zmq_msg_data( &msg ) << "\n";
                a_msg_buf.setUID( (char*) zmq_msg_data( &msg ), zmq_msg_size( &msg ));
            }
            else
                a_msg_buf.clearUID();

            zmq_msg_close( &msg );
        }
    }

    return true;
}

/**
 * @param a_backend - MsgComm instance to route to/from
 *
 * Provides a proxy to a backend MsgComm connection and routes messages bi-
 * directionally. This method is equivalent to zmq_proxy except that the
 * User-Id metadata set by the ZAP handler is forwarded to the backend
 * connection as an additional message frame. This is needed because zeromq
 * does not forward metadata itself. Note that no message introspection or
 * validation is performed by this method.
 *
 * TODO: provide an external loop-control flag for clean shutdown.
 * TODO: provide callback for error handling? (currently logs errors)
 */
void
MsgComm::proxy( MsgComm & a_backend )
{
    const size_t    max_parts = 20;
    zmq_msg_t       out_msg;
    zmq_msg_t       uid_msg;
    zmq_msg_t       in_msg[max_parts+1];
    zmq_msg_t *     p_msg;
    size_t          i,nparts;
    int             rc;
    size_t          len;
    const char *    uid;
    //uint32_t        msg_size;
    void *          out_sock = a_backend.m_socket;
    zmq_pollitem_t  items[] = {{ m_socket, 0, ZMQ_POLLIN, 0}, { out_sock, 0, ZMQ_POLLIN, 0 }};
    bool            bad_msg;

    while ( 1 )
    {
        try
        {
            while ( 1 )
            {
                //cout << "rcv poll\n";

                while (( rc = zmq_poll( items, 2, 1000 )) < 1 )
                {
                    if ( rc == 0 ) // Timeout - TODO check exit condition
                        continue;
                }

                if ( items[1].revents )
                {
                    //cout << "OUT msg ready\n";

                    while ( 1 )
                    {
                        zmq_msg_init( &out_msg );

                        do {
                            rc = zmq_msg_recv( &out_msg, out_sock, ZMQ_DONTWAIT );
                        } while ( rc < 0 && errno == EAGAIN );

                        if ( rc < 0 )
                        {
                            cerr << "MsgComm::proxy - recv error from worker: " << errno << "\n";
                            zmq_msg_close( &out_msg );
                            break;
                        }

                        //cout << "  out send\n";

                        // Stop when no more parts
                        if ( zmq_msg_more( &out_msg ) == 0 )
                        {
                            zmq_msg_send( &out_msg, m_socket, 0 );
                            break;
                        }
                        else
                        {
                            zmq_msg_send( &out_msg, m_socket, ZMQ_SNDMORE );
                        }
                    }
                }

                if ( items[0].revents )
                {
                    //cout << "IN msg ready\n";

                    // Handle Route and Delimiter Parts
                    nparts = 0;
                    p_msg = in_msg;
                    bad_msg = false;

                    do
                    {
                        if ( nparts == max_parts )
                        {
                            cerr << "In-bound message has too many parts\n";
                            bad_msg = true;
                            // Flush any remaining, pending parts
                            while ( zmq_msg_more( p_msg ) &&  ( rc = zmq_msg_recv( p_msg, m_socket, ZMQ_DONTWAIT )) >= 0 )
                                zmq_msg_close( p_msg );
                            break;
                        }

                        zmq_msg_init( p_msg );

                        do {
                            rc = zmq_msg_recv( p_msg, m_socket, ZMQ_DONTWAIT );
                        } while ( rc < 0 && errno == EAGAIN );

                        if ( rc < 0 )
                        {
                            cerr << "Failed to read in-bound message\n";
                            bad_msg = true;
                            break;
                        }

                        nparts++;
                    } while ( zmq_msg_more( p_msg++ ));

                    if ( bad_msg )
                    {
                        // Clean-up all buffered message parts
                        for ( i = 0, p_msg = in_msg; i < nparts; i++, p_msg++ )
                            zmq_msg_close( p_msg );
                    }
                    else
                    {
                        // Must get ZAP user-id from non-routing msg parts - last part (p_msg-1) is always safe
                        uid = zmq_msg_gets( p_msg-1, "User-Id");
                        //cout << "proxy uid [" << (uid?uid:"NULL") << "]\n";

                        // Send all received message parts
                        for ( i = 0, p_msg = in_msg; i < nparts; i++, p_msg++ )
                            zmq_msg_send( p_msg, out_sock, ZMQ_SNDMORE );

                        // Send UID frame, or empty frame if no UID set
                        if ( uid && ((len = strlen(uid)) > 0 ))
                        {
                            zmq_msg_init_size( &uid_msg, len );
                            memcpy( zmq_msg_data( &uid_msg ), uid, len );
                        }
                        else
                        {
                            zmq_msg_init( &uid_msg );
                        }
                        zmq_msg_send( &uid_msg, out_sock, 0 );

                        //std::cerr << "Sent " << nparts << " parts\n";
                    }
                }
            }
        }
        catch( TraceException & e )
        {
            std::cerr << "MsgComm::proxy - " << e.toString() << "\n";
        }
        catch( exception & e )
        {
            std::cerr << "MsgComm::proxy - " << e.what() << "\n";
        }
        catch( ... )
        {
            std::cerr << "MsgComm::proxy - unknown exception" << "\n";
        }
    }
}


void
MsgComm::getPollInfo( zmq_pollitem_t  & a_poll_data )
{
    a_poll_data.socket = m_socket;
    a_poll_data.events = ZMQ_POLLIN;
}


void
MsgComm::setupSecurityContext( const SecurityContext * a_sec_ctx )
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
}

void
MsgComm::reset()
{
    int rc;

    if ( m_bound )
    {
        if (( rc = zmq_unbind( m_socket, m_address.c_str() )) == -1 )
            EXCEPT_PARAM( 1, "ZeroMQ unbind from address " << m_address << " failed." );

        if (( rc = zmq_bind( m_socket, m_address.c_str() )) == -1 )
            EXCEPT_PARAM( 1, "ZeroMQ bind to address " << m_address << " failed." );
    }
    else
    {
        if (( rc = zmq_disconnect( m_socket, m_address.c_str() )) == -1 )
            EXCEPT_PARAM( 1, "ZeroMQ disconnect from address " << m_address << " failed." );

        if (( rc = zmq_connect( m_socket, m_address.c_str() )) == -1 )
            EXCEPT_PARAM( 1, "ZeroMQ connect to address " << m_address << " failed." );
    }
}

void
MsgComm::init( SockType a_sock_type, const SecurityContext * a_sec_ctx, void * a_zmq_ctx )
{
    //cout << "Init conn to " << m_address << "\n";

    //cerr << "init 1" << endl;

    int rc;
    void * ctx = a_zmq_ctx?a_zmq_ctx:getContext();

    //cerr << "init 2" << endl;

    m_socket = zmq_socket( ctx, a_sock_type );
    if ( !m_socket )
    {
        cerr << "sock failed: " << zmq_strerror(errno) << ", ctx: " << ctx << endl;
        EXCEPT( 1, "zmq_socket failed." );
    }

    //cerr << "init 3" << endl;

    setupSecurityContext( a_sec_ctx );

    //cerr << "init 4" << endl;

    int value = 1;
    zmq_setsockopt( m_socket, ZMQ_TCP_KEEPALIVE, &value, sizeof( int ));
    value = 20;
    zmq_setsockopt( m_socket, ZMQ_TCP_KEEPALIVE_CNT, &value, sizeof( int ));
    value = 540;
    zmq_setsockopt( m_socket, ZMQ_TCP_KEEPALIVE_IDLE, &value, sizeof( int ));
    value = 5;
    zmq_setsockopt( m_socket, ZMQ_TCP_KEEPALIVE_INTVL, &value, sizeof( int ));
    value = 500;
    zmq_setsockopt( m_socket, ZMQ_RECONNECT_IVL, &value, sizeof( int ));
    value = 4000;
    zmq_setsockopt( m_socket, ZMQ_RECONNECT_IVL_MAX, &value, sizeof( int ));

    //cerr << "init 5" << endl;

    if ( m_bound )
    {
        if (( rc = zmq_bind( m_socket, m_address.c_str() )) == -1 )
            EXCEPT_PARAM( 1, "ZeroMQ bind to address '" << m_address << "' failed." );
    }
    else
    {
        if (( rc = zmq_connect( m_socket, m_address.c_str() )) == -1 )
            EXCEPT_PARAM( 1, "ZeroMQ connect to address '" << m_address << "' failed." );
    }

    if ( a_sock_type == ZMQ_SUB )
    {
        if (( rc = zmq_setsockopt( m_socket, ZMQ_SUBSCRIBE, "", 0 )) == -1 )
            EXCEPT_PARAM( 1, "ZeroMQ subscribe for address '" << m_address << "' failed." );
    }

    //cerr << "init 6" << endl;

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

