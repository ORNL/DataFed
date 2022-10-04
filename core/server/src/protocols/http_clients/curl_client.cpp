
// Local private includes
#include "curl_client.hpp"

// Third party includes
#include <curl/curl.h>

// Standard includes
#include <iostream>

namespace datafed {

/*
 * Below commented out code is pulled from Util.hpp
 *
 
std::string exec( const char* cmd );

struct curlReadBuffer
{
    char * ptr;
    size_t size;
};

size_t curlResponseWriteCB( char *ptr, size_t size, size_t nmemb, void *userdata );
size_t curlBodyReadCB( char *ptr, size_t size, size_t nitems, void *userdata );
void generateKeys( std::string & a_pub_key, std::string & a_priv_key );
void hexDump( const char * a_buffer, const char *a_buffer_end, std::ostream & a_out );
std::string escapeCSV( const std::string & a_value );
std::string escapeJSON( const std::string & a_value );
bool to_uint32( const char * a_str, uint32_t & a_out );

std::string exec( const char* cmd )
{
    std::array<char, 128>   buffer;
    std::string             result;
    std::shared_ptr<FILE>   pipe( popen( cmd, "r" ), pclose );

    if ( !pipe )
        EXCEPT_PARAM( 0, "exec(" << cmd << "): popen() failed!" );

    while ( !feof( pipe.get() ) )
    {
        if ( fgets( buffer.data(), 128, pipe.get() ) != 0 )
            result += buffer.data();
    }

    return result;
}

size_t curlResponseWriteCB( char *ptr, size_t size, size_t nmemb, void *userdata )
{
    if ( !userdata )
        return 0;

    size_t len = size*nmemb;
    //cout << "curl app:" << len << ", ptr: " <<  userdata << endl;

    ((string*)userdata)->append( ptr, len );

    //cout << "curl app OK" << endl;

    return len;
}

size_t curlBodyReadCB( char *ptr, size_t size, size_t nmemb, void *userdata )
{
    if ( !userdata )
        return 0;

    curlReadBuffer * buf = (curlReadBuffer*)userdata;

    size_t len = size*nmemb;
    len = len>buf->size?buf->size:len;

    memcpy( ptr, buf->ptr, len );

    buf->size -= len;
    buf->ptr += len;

    return len;
}

void generateKeys( std::string & a_pub_key, std::string & a_priv_key )
{
    char public_key[41];
    char secret_key[41];

    if ( zmq_curve_keypair( public_key, secret_key ) != 0 )
        EXCEPT_PARAM( 1, "Key generation failed: " << zmq_strerror( errno ));

    a_pub_key = public_key;
    a_priv_key = secret_key;
}


void hexDump( const char * a_buffer, const char *a_buffer_end, ostream & a_out )
{
    const unsigned char * p = (unsigned char *) a_buffer;
    const unsigned char * e = (unsigned char *) a_buffer_end;
    bool done = false;

    int l = 0, i = 0;
    while ( !done )
    {
        a_out << setw(4) << dec << l << ": ";

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

string escapeCSV( const string & a_value )
{
    string::size_type p1 = 0,p2;
    string result;
    result.reserve( a_value.size() + 20 );

    while ( 1 )
    {
        p2 = a_value.find( '"', p1 );
        if ( p2 == string::npos )
        {
            result.append( a_value, p1, p2 );
            break;
        }

        result.append( a_value, p1, p2 - p1 + 1 );
        result.append( "\"" );
        p1 = p2 + 1;
    }

    return result;
}

string escapeJSON( const std::string & a_value )
{
    static const char* values[] = {
        "\\u0000","\\u0001","\\u0002","\\u0003","\\u0004","\\u0005","\\u0006","\\u0007",
        "\\u0008","\\u0009","\\u000A","\\u000B","\\u000C","\\u000D","\\u000E","\\u000F",
        "\\u0010","\\u0011","\\u0012","\\u0013","\\u0014","\\u0015","\\u0016","\\u0017",
        "\\u0018","\\u0019","\\u001A","\\u001B","\\u001C","\\u001D","\\u001E","\\u001F"
    };

    string result;
    result.reserve( a_value.size()*2 );

    for ( auto c = a_value.cbegin(); c != a_value.cend(); c++ )
    {
        if ( *c == '"' )
            result.append( "\\\"" );
        else if ( *c == '\\' )
            result.append( "\\\\" );
        else if ( '\x00' <= *c && *c <= '\x1f')
            result.append( values[(size_t)*c] );
        else
            result.append( 1, *c );
    }

    return result;
}

bool to_uint32( const char * a_str, uint32_t & a_out )
{
    char *endptr;
    a_out = std::strtoul( a_str, &endptr, 10 );

    if ( endptr == a_str || *endptr != '\0' )
        return true;
    else
        return false;
}
 */

  /****************************************************************************
   * File local functions
   ****************************************************************************/
  size_t curlResponseWriteCB( char *ptr, size_t size, size_t nmemb, void *userdata )
  {
      if ( !userdata )
          return 0;

      size_t len = size*nmemb;

      ((string*)userdata)->append( ptr, len );

      return len;
  }

  /****************************************************************************
   * Class Methods 
   ****************************************************************************/
  CURLHTTPClient::CURLHTTPClient() {
    m_curl = curl_easy_init();

    curl_easy_setopt( m_curl, CURLOPT_HTTP_VERSION, CURL_HTTP_VERSION_1_1 );
    curl_easy_setopt( m_curl, CURLOPT_WRITEFUNCTION, curlResponseWriteCB );

    // This turns off verification with a CA, communication may still be
    // encrypted change this setting to 1 if communicating outside of ORNL
    curl_easy_setopt( m_curl, CURLOPT_SSL_VERIFYPEER, 0 );

    // Setting this value to one means curl will not batch messages but will
    // send immediately, this is better for local communication where latency
    // is low. If sending across the network you would possibly want to switch
    // this to 0.
    curl_easy_setopt( m_curl, CURLOPT_TCP_NODELAY, 1 );
  }

  void CURLHTTPClient::add(const std::unique_ptr<Credential> & cred) {
    m_credential = std::move(cred);
    curl_easy_setopt(
        m_curl,
        CURLOPT_USERNAME,
        m_credential.get(CredentialAttribute::USERNAME).c_str(),
        );

    curl_easy_setopt(
        m_curl,
        CURLOPT_PASSWORD,
        m_credential.get(CredentialAttribute::PASSWORD).c_str()
        );
  }

  void CURLHTTPClient::connect() {
    std::cout << "Connect" << std::endl;
  }

  nlohmann::json CURLHTTPClient::send(nlohmann::json) {
     
  }


  /**
   * Non thread safe initialization functions
   **/
  void CURLHTTPClient::init() {
    curl_global_init( CURL_GLOBAL_DEFAULT );
  }

  std::unique_ptr<HTTPClient> CURLHTTPClient::create(const PassKey<HTTPClientFactory> & key) {
    return std::make_unique<CURLHTTPClient>(key);
  }

  CURLHTTPClient::~CURLHTTPClient() {
    if( m_client ) {
      curl_free( m_client );
    }
    curl_easy_cleanup( m_curl );
  }
}
