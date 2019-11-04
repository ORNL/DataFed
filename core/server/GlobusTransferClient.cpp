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

long
GlobusTransferClient::get( const char * a_url_path, const char * a_token, const vector<pair<string,string>> &a_params, string & a_result )
{
    string  url;
    //string  res_json;
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

    //DL_DEBUG( "url: " << url );

    curl_easy_setopt( m_curl, CURLOPT_URL, url.c_str() );
    curl_easy_setopt( m_curl, CURLOPT_WRITEDATA, &a_result );
    //curl_easy_setopt( m_curl, CURLOPT_READDATA, 0 );
    curl_easy_setopt( m_curl, CURLOPT_ERRORBUFFER, error );
    curl_easy_setopt( m_curl, CURLOPT_HTTPGET, 1 );

    struct curl_slist *list = 0;

    if ( a_token )
    {
        string auth_hdr = "Authorization: Bearer ";
        auth_hdr += a_token;
        list = curl_slist_append( list, auth_hdr.c_str() );
        curl_easy_setopt( m_curl, CURLOPT_HTTPHEADER, list );
    }

    CURLcode res = curl_easy_perform( m_curl );

    if ( list )
        curl_slist_free_all(list);

    long http_code = 0;
    curl_easy_getinfo( m_curl, CURLINFO_RESPONSE_CODE, &http_code );

    if ( res != CURLE_OK )
    {
        DL_ERROR( "GlobusTransferClient::get - CURL error [" << error << "], " << curl_easy_strerror( res ));
        EXCEPT_PARAM( 1, "Globus API call failed." );
    }

    return http_code;
}

long
GlobusTransferClient::post( const char * a_url_path, const char * a_token, const std::vector<std::pair<std::string,std::string>> & a_params, const rapidjson::Document * a_body, string & a_result )
{
    string  url;
    //string  res_json;
    char    error[CURL_ERROR_SIZE];
    error[0] = 0;

    rapidjson::StringBuffer buffer;
    rapidjson::Writer<rapidjson::StringBuffer> writer(buffer);
    if ( a_body )
        a_body->Accept(writer);

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

    //DL_DEBUG( "url: " << url );
    //DL_DEBUG( "body: " << buffer.GetString() );

    curl_easy_setopt( m_curl, CURLOPT_URL, url.c_str() );
    curl_easy_setopt( m_curl, CURLOPT_WRITEDATA, &a_result );
    //curl_easy_setopt( m_curl, CURLOPT_READDATA, &out_buf );
    curl_easy_setopt( m_curl, CURLOPT_ERRORBUFFER, error );
    curl_easy_setopt( m_curl, CURLOPT_POST, 1 );

    if ( a_body )
        curl_easy_setopt( m_curl, CURLOPT_POSTFIELDS, buffer.GetString());
    else
        curl_easy_setopt( m_curl, CURLOPT_POSTFIELDS, "");

    struct curl_slist *list = 0;

    if ( a_token )
    {
        string auth_hdr = "Authorization: Bearer ";
        auth_hdr += a_token;
        list = curl_slist_append( list, auth_hdr.c_str() );
    }

    if ( a_body )
    {
        list = curl_slist_append( list, "Content-Type: application/json");
    }

    curl_easy_setopt( m_curl, CURLOPT_HTTPHEADER, list );

    CURLcode res = curl_easy_perform( m_curl );

    if ( list )
        curl_slist_free_all(list);

    long http_code = 0;
    curl_easy_getinfo( m_curl, CURLINFO_RESPONSE_CODE, &http_code );

    if ( res != CURLE_OK )
    {
        DL_ERROR( "GlobusTransferClient::post - CURL error [" << error << "], " << curl_easy_strerror( res ));
        EXCEPT_PARAM( 1, "Globus API call failed." );
    }

    return http_code;
}

std::string
GlobusTransferClient::getSubmissionID( const std::string & a_acc_token )
{
    string raw_result;
    long code = get( "submission_id", a_acc_token.c_str(), {}, raw_result );

    if ( code < 200 || code > 202 )
    {
        DL_ERROR( "getSubmissionID - REST call failed, code: " << code );
        EXCEPT_PARAM( 1, "Globus API call failed." );
    }

    rapidjson::Document result;

    if ( !raw_result.size() )
    {
        DL_ERROR( "getSubmissionID - empty response from Globus" );
        EXCEPT_PARAM( 1, "Globus API call failed." );
    }

    // Try to decode result as JSON - even if call failed
    result.Parse( raw_result.c_str() );

    if ( result.HasParseError() )
    {
        DL_ERROR( "getSubmissionID - invalid JSON from Globus" );
        EXCEPT_PARAM( 1, "Globus API call failed." );
    }

    rapidjson::Value::MemberIterator imem = result.FindMember("value");
    
    if ( imem == result.MemberEnd() )
    {
        DL_ERROR( "getSubmissionID - missing content from Globus" );
        EXCEPT_PARAM( 1, "Globus API call failed." );
    }

    return imem->value.GetString();
}

void
GlobusTransferClient::transfer( SDMS::XfrData & a_xfr, const std::string & a_acc_token )
{
    DL_DEBUG( "GlobusTransferClient::transfer, ID: " << a_xfr.id() << ", mode,  " << a_xfr.mode() << ", rem path: " << a_xfr.rem_path() );

    string sub_id = getSubmissionID( a_acc_token );

    DL_DEBUG( "  xfr ID: " << a_xfr.id() << ", sub ID: " << sub_id  );

    //if ( a_xfr.repo_size() > 1 )
    //    EXCEPT( 1, "Transfers involving multiple repositories not supported." );

    rapidjson::Document body;
    rapidjson::Document::AllocatorType& allocator = body.GetAllocator();

    string src_ep;
    string dst_ep;

    if ( a_xfr.mode() == XM_GET )
        dst_ep = a_xfr.rem_ep();
    else
        src_ep = a_xfr.rem_ep();

    const XfrRepo & repo = a_xfr.repo();

    if ( a_xfr.mode() == XM_GET )
        src_ep = repo.repo_ep();
    else
        dst_ep = repo.repo_ep();

    DL_DEBUG( "  xfr from EP " << src_ep << " to " << dst_ep );

    body.SetObject();
    body.AddMember( "DATA_TYPE", "transfer", allocator );
    body.AddMember( "submission_id", rapidjson::StringRef( sub_id.c_str() ), allocator );
    body.AddMember( "source_endpoint", rapidjson::StringRef( src_ep.c_str() ), allocator );
    body.AddMember( "destination_endpoint", rapidjson::StringRef( dst_ep.c_str() ), allocator );
    body.AddMember( "verify_checksum", true, allocator );
    body.AddMember( "notify_on_succeeded", false, allocator );

    rapidjson::Value xfr_list;
    xfr_list.SetArray();

    for ( int f = 0; f < repo.file_size(); f++ )
    {
        const XfrFile & file = repo.file(f);
        DL_DEBUG( "  xfr from " << file.from() << " to " << file.to() );

        rapidjson::Value xfr_item;
        xfr_item.SetObject();
        xfr_item.AddMember( "DATA_TYPE", "transfer_item", allocator );
        if ( a_xfr.mode() == XM_GET )
        {
            xfr_item.AddMember( "source_path", rapidjson::StringRef( file.from().c_str() ), allocator );
            xfr_item.AddMember( "destination_path", rapidjson::Value( (a_xfr.rem_path() + file.to()).c_str(), allocator ), allocator );
        }
        else
        {
            xfr_item.AddMember( "source_path", rapidjson::Value( ( a_xfr.rem_path() + file.from()).c_str(), allocator ), allocator );
            xfr_item.AddMember( "destination_path", rapidjson::StringRef( file.to().c_str() ), allocator );
        }
        xfr_item.AddMember( "recursive", false, allocator );
        xfr_list.PushBack( xfr_item, allocator );
    }

    body.AddMember( "DATA", xfr_list, allocator );

    cout << "XFR REQUEST BODY:\n";
    rapidjson::StringBuffer buffer;
    rapidjson::Writer<rapidjson::StringBuffer> writer(buffer);
    body.Accept(writer);

    // Output {"project":"rapidjson","stars":11}
    cout << buffer.GetString() << endl;

    string raw_result;
    long code = post( "transfer", a_acc_token.c_str(), {}, &body, raw_result );

    // Try to decode result as JSON - even if call failed

    rapidjson::Document result;

    if ( raw_result.size() )
    {
        result.Parse( raw_result.c_str() );

        if ( result.HasParseError() )
        {
            DL_ERROR( "Globus xfr call failed, returned invalid JSON." );
            EXCEPT( 1, "Globus API call failed." );
        }
    }

    rapidjson::Value::MemberIterator imem;

    if ( code < 200 || code > 202 )
    {
        imem = result.FindMember("message");
        if ( imem == result.MemberEnd() )
        {
            DL_ERROR( "Globus xfr call failed, code: " << code );
            EXCEPT( 1, "Globus API call failed." );
        }
        else
        {
            DL_ERROR( "Globus xfr call failed, code: " << code << ", reason: " << imem->value.GetString() );
            EXCEPT_PARAM( 1, "Globus xfr req failed: "  << imem->value.GetString() );
        }
    }
    else
    {
        imem = result.FindMember("DATA_TYPE");
        if ( imem == result.MemberEnd() )
        {
            DL_ERROR( "Globus xfr req failed: invalid response from Globus." );
            EXCEPT( 1, "Globus API call failed." );
        }

        imem = result.FindMember("code");
        if ( imem == result.MemberEnd() )
        {
            DL_ERROR( "Globus xfr req failed: invalid response from Globus." );
            EXCEPT( 1, "Invalid response from Globus" );
        }

        if ( strcmp( imem->value.GetString(), "Accepted" ) != 0 )
        {
            imem = result.FindMember("message");
            if ( imem == result.MemberEnd() )
            {
                DL_ERROR( "Globus xfr req not accepted (no reason)." );
                EXCEPT( 1, "Globus API call failed." );
            }
            else
            {
                DL_ERROR( "Globus xfr req not accepted: " << imem->value.GetString() );
                EXCEPT_PARAM( 1, "Globus xfr req failed: "  << imem->value.GetString() );
            }
        }

        imem = result.FindMember("task_id");
        if ( imem == result.MemberEnd() )
        {
            DL_ERROR( "Globus xfr req failed: invalid response from Globus." );
            EXCEPT( 1, "Globus API call failed." );
        }

        a_xfr.set_task_id( imem->value.GetString() );
    }
}


#if 0
void
GlobusTransferClient::transfer( const string & a_acc_tok, const string & a_sub_id, const string & a_src_path, const string & a_dst_path, string & a_task_id )
{
    DL_DEBUG( "GlobusTransferClient::transfer, dst_path " << a_dst_path );

    rapidjson::Document body;
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

    DL_DEBUG( "Requesting Globus xfr " << src_ep << " " << src_path << " : " << dst_ep << " " << dst_path );

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

    string raw_result;
    long code = post( "transfer", a_acc_tok.c_str(), {}, &body, raw_result );



    // Try to decode result as JSON - even if call failed

    rapidjson::Document result;

    if ( raw_result.size() )
    {
        result.Parse( raw_result.c_str() );

        if ( result.HasParseError() )
        {
            DL_ERROR( "Globus xfr call failed, returned invalid JSON." );
            EXCEPT( 1, "Globus API call failed." );
        }
    }

    rapidjson::Value::MemberIterator imem;

    if ( code < 200 || code > 202 )
    {
        imem = result.FindMember("message");
        if ( imem == result.MemberEnd() )
        {
            DL_ERROR( "Globus xfr call failed, code: " << code );
            EXCEPT( 1, "Globus API call failed." );
        }
        else
        {
            DL_ERROR( "Globus xfr call failed, code: " << code << ", reason: " << imem->value.GetString() );
            EXCEPT_PARAM( 1, "Globus xfr req failed: "  << imem->value.GetString() );
        }
    }
    else
    {
        imem = result.FindMember("DATA_TYPE");
        if ( imem == result.MemberEnd() )
        {
            DL_ERROR( "Globus xfr req failed: invalid response from Globus." );
            EXCEPT( 1, "Globus API call failed." );
        }

        imem = result.FindMember("code");
        if ( imem == result.MemberEnd() )
        {
            DL_ERROR( "Globus xfr req failed: invalid response from Globus." );
            EXCEPT( 1, "Invalid response from Globus" );
        }

        if ( strcmp( imem->value.GetString(), "Accepted" ) != 0 )
        {
            imem = result.FindMember("message");
            if ( imem == result.MemberEnd() )
            {
                DL_ERROR( "Globus xfr req not accepted (no reason)." );
                EXCEPT( 1, "Globus API call failed." );
            }
            else
            {
                DL_ERROR( "Globus xfr req not accepted: " << imem->value.GetString() );
                EXCEPT_PARAM( 1, "Globus xfr req failed: "  << imem->value.GetString() );
            }
        }

        imem = result.FindMember("task_id");
        if ( imem == result.MemberEnd() )
        {
            DL_ERROR( "Globus xfr req failed: invalid response from Globus." );
            EXCEPT( 1, "Globus API call failed." );
        }

        a_task_id = imem->value.GetString();
    }
}
#endif

bool
GlobusTransferClient::checkTransferStatus( const std::string & a_acc_tok, const std::string & a_task_id, XfrStatus & a_status, std::string & a_err_msg )
{
    a_status = XS_INIT;
    a_err_msg.clear();

    string raw_result;
    string url = "task/";
    url.append( a_task_id );
    url.append( "/event_list" );

    long code = get( url.c_str(), a_acc_tok.c_str(), {}, raw_result );

    if ( code < 200 || code > 202 )
        EXCEPT( 1, "Unknown Globus event_list failure" );

    rapidjson::Document result;

    if ( !raw_result.size() )
        EXCEPT( 1, "Empty response from Globus for event_list" );

    // Try to decode result as JSON - even if call failed
    //DL_DEBUG( "About to parse[" << raw_result << "]" );
    result.Parse( raw_result.c_str() );

    if ( result.HasParseError() )
        EXCEPT( 1, "Invalid response from Globus" );


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

void
GlobusTransferClient::cancelTask( const std::string & a_acc_tok, const std::string & a_task_id )
{
    string raw_result;

    string url = string("task/")+a_task_id+"/cancel";
    long code = post( url.c_str(), a_acc_tok.c_str(), {}, 0, raw_result );

    if ( code < 200 || code > 202 )
        EXCEPT_PARAM( 1, "Globus cancel task API error, code: " << code );

    rapidjson::Document result;

    if ( !raw_result.size() )
        EXCEPT( 1, "Empty response from Globus" );

    // Try to decode result as JSON - even if call failed
    //DL_DEBUG( "About to parse[" << raw_result << "]" );

    result.Parse( raw_result.c_str() );

    if ( result.HasParseError() )
        EXCEPT( 1, "Invalid response from Globus" );

    rapidjson::Value::MemberIterator imem = result.FindMember("DATA_TYPE");
    if ( imem == result.MemberEnd() )
        EXCEPT( 1, "Invalid response from Globus Xfer API" );

    imem = result.FindMember("code");
    if ( imem == result.MemberEnd() )
        EXCEPT( 1, "Invalid response from Globus Xfer API" );
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
