#include "CommClient.hpp"

using namespace std;

namespace SDMS {



CommClient::CommClient( const std::string & a_host, uint32_t a_port, const std::string & a_host_cert, const std::string & a_client_cert, const std::string & a_client_key ) :
    m_host( a_host ),
    m_port( a_port ),
    m_resolver( m_io_service ),
    m_context( asio::ssl::context::tlsv12 ),
    m_socket( 0 ),
    m_io_thread( 0 ),
    m_ctx( 1 ),
    m_state(NOT_STARTED),
    m_no_delay_on(true),
    m_no_delay_off(false)
{
    //REG_PROTO( SDMS::Anon );
    //REG_PROTO( SDMS::Auth );

    m_context.load_verify_file( a_host_cert );
    m_context.use_certificate_file( a_client_cert, asio::ssl::context::pem );
    m_context.use_private_key_file( a_client_key , asio::ssl::context::pem );

    m_socket = new ssl_socket( m_io_service, m_context );

    m_socket->set_verify_mode( asio::ssl::verify_peer | asio::ssl::verify_fail_if_no_peer_cert );
    m_socket->set_verify_callback( bind( &CommClient::verifyCert, this, placeholders::_1, placeholders::_2 ));
}

CommClient::~CommClient()
{
    stop();

    delete m_socket;
}

// TODO m_io_thread is being leaked

void
CommClient::start()
{
    auto endpoint_iterator = m_resolver.resolve({ m_host, to_string( m_port ) });

    connect( endpoint_iterator );

    m_io_thread = new thread([this](){ m_io_service.run(); });
    
    // Wait for handshake to complete
    unique_lock<mutex> lock(m_mutex);
    while( m_state == NOT_STARTED )
        m_start_cvar.wait( lock );

    if ( m_state == FAILED )
        EXCEPT( 1, "Failed to connect to server" );

    cout << "CommClient started\n";
}


void
CommClient::stop()
{
    if ( m_state == STARTED )
    {
        error_code ec;
        m_socket->lowest_layer().cancel( ec );
        m_socket->shutdown( ec );
        m_state = NOT_STARTED;
    }
}


void
CommClient::connect( asio::ip::tcp::resolver::iterator endpoint_iterator )
{
    cout << "CommClient connect\n";
    
    asio::async_connect( m_socket->lowest_layer(), endpoint_iterator,
        [this]( error_code ec, asio::ip::tcp::resolver::iterator )
        {
            if (!ec)
            {
                asio::socket_base::keep_alive option(true);
                m_socket->lowest_layer().set_option(option);

                handShake();
            }
            else
            {
                cerr << "Connect failed: " << ec.message() << "\n";

                unique_lock<mutex> lock(m_mutex);
                m_state = FAILED;
                m_start_cvar.notify_all();
            }
        });
}


void
CommClient::handShake()
{
    m_socket->async_handshake( asio::ssl::stream_base::client,
        [this]( error_code ec )
        {
            unique_lock<mutex> lock(m_mutex);
            if ( !ec )
            {
                m_state = STARTED;
            }
            else
            {
                cerr << "Handshake failed: " << ec.message() << endl;
                m_state = FAILED;
            }

            m_start_cvar.notify_all();
        });
}


bool
CommClient::verifyCert( bool a_preverified, asio::ssl::verify_context & a_context )
{
    (void)a_context;
    // TODO What is the point of this funtions?

    /*
    (void)a_preverified;

    char subject_name[256];

    X509* cert = X509_STORE_CTX_get_current_cert( a_context.native_handle() );
    X509_NAME_oneline( X509_get_subject_name( cert ), subject_name, 256 );
    */

    return a_preverified;
}


}