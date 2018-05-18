#include <iostream>
#include <rapidjson/stringbuffer.h>
#include <rapidjson/prettywriter.h>
#include <rapidjson/error/en.h>
#include "GlobusTransferClient.hpp"
#include "Util.hpp"
#include "TraceException.hpp"
#include "DynaLog.hpp"

using namespace std;

namespace SDMS {
namespace Core {

GlobusTransferClient::GlobusTransferClient():
    m_base_url("https://transfer.api.globusonline.org/v0.10/")
{
    m_curl = curl_easy_init();
    if ( !m_curl )
        EXCEPT( 1, "libcurl init failed" );

    curl_easy_setopt( m_curl, CURLOPT_HTTP_VERSION, CURL_HTTP_VERSION_1_1 );
    curl_easy_setopt( m_curl, CURLOPT_WRITEFUNCTION, curlResponseWriteCB );
    curl_easy_setopt( m_curl, CURLOPT_SSL_VERIFYPEER, 0 );
    curl_easy_setopt( m_curl, CURLOPT_TCP_NODELAY, 1 );
}

GlobusTransferClient::~GlobusTransferClient()
{
    curl_easy_cleanup( m_curl );
}

void
GlobusTransferClient::dbGet( const char * a_url_path, const char * a_token, const vector<pair<string,string>> &a_params, rapidjson::Document & a_result )
{
    string  url;
    string  res_json;
    char    error[CURL_ERROR_SIZE];

    error[0] = 0;

    url.reserve( 512 );

    // TODO Get URL base from ctor
    url.append( m_base_url );
    url.append( a_url_path );
    if ( a_params.size() > 0 )
        url.append( "?" );

    char * esc_txt;

    for ( vector<pair<string,string>>::const_iterator iparam = a_params.begin(); iparam != a_params.end(); ++iparam )
    {
        url.append( "&" );
        url.append( iparam->first.c_str() );
        url.append( "=" );
        esc_txt = curl_easy_escape( m_curl, iparam->second.c_str(), 0 );
        url.append( esc_txt );
        curl_free( esc_txt );
    }

    DL_DEBUG( "url: " << url );

    curl_easy_setopt( m_curl, CURLOPT_URL, url.c_str() );
    curl_easy_setopt( m_curl, CURLOPT_WRITEDATA, &res_json );
    curl_easy_setopt( m_curl, CURLOPT_ERRORBUFFER, error );

    struct curl_slist *list = 0;

    if ( a_token )
    {
        string auth_hdr = "Authorization: Bearer ";
        auth_hdr += a_token;
        cout << a_token << "\n";
        list = curl_slist_append( list, auth_hdr.c_str() );
        curl_easy_setopt( m_curl, CURLOPT_HTTPHEADER, list );
    }

    CURLcode res = curl_easy_perform( m_curl );

    if ( list )
        curl_slist_free_all(list);

    long http_code = 0;
    curl_easy_getinfo( m_curl, CURLINFO_RESPONSE_CODE, &http_code );

    if ( res != CURLE_OK )
        EXCEPT_PARAM( 1, "Globus API failed. error: " << error << ", " << curl_easy_strerror( res ));


    if ( http_code < 200 || http_code > 299 )
        EXCEPT_PARAM( 1, "Globus API failed. Code: " << http_code << ", err: " << error << ", res: " << res_json );

    if ( res_json.size() )
    {
        cout << "About to parse[" << res_json << "]" << endl;
        a_result.Parse( res_json.c_str() );

        if ( a_result.HasParseError() )
        {
            rapidjson::ParseErrorCode ec = a_result.GetParseError();
            cerr << "Parse error: " << rapidjson::GetParseError_En( ec ) << endl;
            EXCEPT( 1, "Invalid JSON returned from Globus API" );
        }
    }
}

std::string
GlobusTransferClient::getSubmissionID( std::string & a_token )
{
    rapidjson::Document result;
    dbGet( "submission_id", a_token.c_str(), {}, result );

    rapidjson::Value::MemberIterator imem = result.FindMember("value");
    
    if ( imem == result.MemberEnd() )
        EXCEPT( 1, "Value missing from JSON returned by Globus API" );

    return imem->value.GetString();
}

}}
