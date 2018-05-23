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
    //curl_easy_setopt( m_curl, CURLOPT_READFUNCTION, curlBodyReadCB );
    curl_easy_setopt( m_curl, CURLOPT_SSL_VERIFYPEER, 0 );
    curl_easy_setopt( m_curl, CURLOPT_TCP_NODELAY, 1 );
}

GlobusTransferClient::~GlobusTransferClient()
{
    curl_easy_cleanup( m_curl );
}

void
GlobusTransferClient::get( const char * a_url_path, const char * a_token, const vector<pair<string,string>> &a_params, rapidjson::Document & a_result )
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
    //curl_easy_setopt( m_curl, CURLOPT_READDATA, 0 );
    curl_easy_setopt( m_curl, CURLOPT_ERRORBUFFER, error );
    curl_easy_setopt( m_curl, CURLOPT_HTTPGET, 1 );

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

void
GlobusTransferClient::post( const char * a_url_path, const char * a_token, const std::vector<std::pair<std::string,std::string>> & a_params, const rapidjson::Document & a_body, rapidjson::Document & a_result )
{
    string  url;
    string  res_json;
    char    error[CURL_ERROR_SIZE];
    error[0] = 0;

    rapidjson::StringBuffer buffer;
    rapidjson::Writer<rapidjson::StringBuffer> writer(buffer);
    a_body.Accept(writer);
    //curlReadBuffer out_buf;
    //out_buf->ptr = buffer->GetString();
    //out_buf->size = buffer->GetSize();

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
    DL_DEBUG( "body: " << buffer.GetString() );

    curl_easy_setopt( m_curl, CURLOPT_URL, url.c_str() );
    curl_easy_setopt( m_curl, CURLOPT_WRITEDATA, &res_json );
    //curl_easy_setopt( m_curl, CURLOPT_READDATA, &out_buf );
    curl_easy_setopt( m_curl, CURLOPT_ERRORBUFFER, error );
    curl_easy_setopt( m_curl, CURLOPT_POST, 1 );
    curl_easy_setopt( m_curl, CURLOPT_POSTFIELDS, buffer.GetString());


    struct curl_slist *list = 0;

    if ( a_token )
    {
        string auth_hdr = "Authorization: Bearer ";
        auth_hdr += a_token;
        cout << a_token << "\n";
        list = curl_slist_append( list, auth_hdr.c_str() );
    }

    list = curl_slist_append( list, "Content-Type: application/json");
    curl_easy_setopt( m_curl, CURLOPT_HTTPHEADER, list );

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
    get( "submission_id", a_token.c_str(), {}, result );

    rapidjson::Value::MemberIterator imem = result.FindMember("value");
    
    if ( imem == result.MemberEnd() )
        EXCEPT( 1, "Value missing from JSON returned by Globus API" );

    return imem->value.GetString();
}

bool
GlobusTransferClient::transfer( const string & a_acc_tok, const string & a_sub_id, const string & a_src_path, const string & a_dst_path, string & a_task_id )
{
    rapidjson::Document body;
    rapidjson::Document result;
    string src_ep, src_path;
    string dst_ep, dst_path;

    size_t pos = a_src_path.find_first_of( "/" );
    if ( pos == string::npos )
        EXCEPT( 1, "Invalid source path" );

    src_ep = a_src_path.substr( 0, pos );
    src_path = a_src_path.substr( pos );

    pos = a_dst_path.find_first_of( "/" );
    if ( pos == string::npos )
        EXCEPT( 1, "Invalid destination path" );

    dst_ep = a_dst_path.substr( 0, pos );
    dst_path = a_dst_path.substr( pos );

    cout << "transfer " << src_ep << " " << src_path << " : " << dst_ep << " " << dst_path << "\n";

    rapidjson::Document::AllocatorType& allocator = body.GetAllocator();

    body.SetObject();
    body.AddMember( "DATA_TYPE", "transfer", allocator );
    body.AddMember( "submission_id", rapidjson::StringRef( a_sub_id.c_str() ), allocator );
    body.AddMember( "source_endpoint", rapidjson::StringRef( src_ep.c_str() ), allocator );
    body.AddMember( "destination_endpoint", rapidjson::StringRef( dst_ep.c_str() ), allocator );
    body.AddMember( "verify_checksum", true, allocator );
    rapidjson::Value xfr_item;
    xfr_item.SetObject();
    xfr_item.AddMember( "DATA_TYPE", "transfer_item", allocator );
    xfr_item.AddMember( "source_path", rapidjson::StringRef( src_path.c_str() ), allocator );
    xfr_item.AddMember( "destination_path", rapidjson::StringRef( dst_path.c_str() ), allocator );
    xfr_item.AddMember( "recursive", false, allocator );
    rapidjson::Value xfr_list;
    xfr_list.SetArray();
    xfr_list.PushBack( xfr_item, allocator );
    body.AddMember( "DATA", xfr_list, allocator );

    post( "transfer", a_acc_tok.c_str(), {}, body, result );

    rapidjson::Value::MemberIterator imem = result.FindMember("DATA_TYPE");
    if ( imem == result.MemberEnd() )
        EXCEPT( 1, "Invalid response from Globus Xfer API" );

    imem = result.FindMember("code");
    if ( imem == result.MemberEnd() )
        EXCEPT( 1, "Invalid response from Globus Xfer API" );

    if ( strcmp( imem->value.GetString(), "Accepted" ) != 0 )
    {
        imem = result.FindMember("message");
        if ( imem == result.MemberEnd() )
            cout << "Xfr NOT accepted (no reason)\n";
        else
            cout << "Xfr NOT accepted: " <<  imem->value.GetString() << "\n";
        return false;
    }

    imem = result.FindMember("task_id");
    if ( imem == result.MemberEnd() )
        EXCEPT( 1, "Invalid response from Globus Xfer API" );

    a_task_id = imem->value.GetString();

    return true;
}

bool
GlobusTransferClient::checkTransferStatus( const std::string & a_acc_tok, const std::string & a_task_id, XfrStatus & a_status, std::string & a_err_msg )
{
    a_status = XS_INIT;
    a_err_msg.clear();

    rapidjson::Document result;

    string url = "task/";
    url.append( a_task_id );
    url.append( "/event_list" );

    get( url.c_str(), a_acc_tok.c_str(), {}, result );

    rapidjson::Value::MemberIterator imem = result.FindMember("DATA_TYPE");
    if ( imem == result.MemberEnd() || strcmp( imem->value.GetString(), "event_list" ) != 0 )
        EXCEPT( 1, "Invalid response from Globus Xfer API" );

    imem = result.FindMember("length");
    if ( imem == result.MemberEnd() )
        EXCEPT( 1, "Invalid response from Globus Xfer API" );

    int len = imem->value.GetInt();
    if ( len )
    {
        imem = result.FindMember("DATA");
        if ( imem == result.MemberEnd() )
            EXCEPT( 1, "Invalid response from Globus Xfer API" );

        vector<string> events;

        for ( int i = 0; i < len; i++ )
        {
            events.push_back( imem->value[i]["code"].GetString());
        }

        return eventsHaveErrors( events, a_status, a_err_msg );
    }

    return false;
}

/**
 * @return True if task has errors and needs to be cancelled, false otherwise
 */
bool
GlobusTransferClient::eventsHaveErrors( const vector<string> & a_events, XfrStatus & a_status, std::string & a_err_msg )
{
    a_status = XS_INIT;
    size_t fault_count = 0;

    // Processing events in order of oldest first
    for ( vector<string>::const_reverse_iterator istat = a_events.rbegin(); istat != a_events.rend(); ++istat )
    {
        cout << "event: " << *istat << "\n";

        if ( *istat == "STARTED" || *istat == "PROGRESS" )
            a_status = XS_ACTIVE;
        else if ( *istat == "SUCCEEDED" )
        {
            a_status = XS_SUCCEEDED;
            break;
        }
        else if ( *istat == "CANCELED" )
        {
            a_status = XS_FAILED;
            a_err_msg = *istat;
            break;
        }
        else if ( *istat == "CONNECTION_RESET" )
        {
            a_status = XS_INIT;
            if ( ++fault_count > 10 )
            {
                a_status = XS_FAILED;
                a_err_msg = "Could not connect";
                return true;
            }
        }
        else
        {
            a_status = XS_FAILED;
            a_err_msg = *istat;
            return true;
        }
    }

    return false;
}

}}
