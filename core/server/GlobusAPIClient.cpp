#include <iostream>
#include <time.h>
#include <rapidjson/stringbuffer.h>
#include <rapidjson/prettywriter.h>
#include <rapidjson/error/en.h>
#include "GlobusAPIClient.hpp"
#include "Util.hpp"
#include "TraceException.hpp"
#include "DynaLog.hpp"

using namespace std;

namespace SDMS {
namespace Core {

GlobusAPIClient::GlobusAPIClient():
    m_auth_url("https://auth.globus.org/v2/oauth2/"),
    m_xfr_url("https://transfer.api.globusonline.org/v0.10/"),
    m_auth_id("7bc68d7b-4ad4-4991-8a49-ecbfcae1a454"), // TODO Must come from config
    m_auth_secret("FpqvBscUorqgNLXKzlBAV0EQTdLXtBTTnGpf0+YnKEQ=") // TODO Must come from config

{
    m_curl = curl_easy_init();
    if ( !m_curl )
        EXCEPT( 1, "libcurl init failed" );

    curl_easy_setopt( m_curl, CURLOPT_HTTP_VERSION, CURL_HTTP_VERSION_1_1 );
    curl_easy_setopt( m_curl, CURLOPT_WRITEFUNCTION, curlResponseWriteCB );
    curl_easy_setopt( m_curl, CURLOPT_SSL_VERIFYPEER, 0 );
    curl_easy_setopt( m_curl, CURLOPT_TCP_NODELAY, 1 );
}

GlobusAPIClient::~GlobusAPIClient()
{
    curl_easy_cleanup( m_curl );
}

long
GlobusAPIClient::get( const std::string & a_base_url, const std::string & a_url_path, const std::string & a_token, const vector<pair<string,string>> &a_params, string & a_result )
{
    string  url;
    char    error[CURL_ERROR_SIZE];
    char *  esc_txt;

    error[0] = 0;
    url.reserve( 512 );
    url.append( a_base_url );

    esc_txt = curl_easy_escape( m_curl, a_url_path.c_str(), 0 );
    url.append( esc_txt );
    curl_free( esc_txt );

    if ( a_params.size() > 0 )
        url.append( "?" );

    for ( vector<pair<string,string>>::const_iterator iparam = a_params.begin(); iparam != a_params.end(); ++iparam )
    {
        url.append( "&" );
        url.append( iparam->first.c_str() );
        url.append( "=" );
        esc_txt = curl_easy_escape( m_curl, iparam->second.c_str(), 0 );
        url.append( esc_txt );
        curl_free( esc_txt );
    }

    curl_easy_setopt( m_curl, CURLOPT_URL, url.c_str() );
    curl_easy_setopt( m_curl, CURLOPT_WRITEDATA, &a_result );
    curl_easy_setopt( m_curl, CURLOPT_ERRORBUFFER, error );
    curl_easy_setopt( m_curl, CURLOPT_HTTPGET, 1 );

    struct curl_slist *list = 0;

    if ( a_token.size() )
    {
        string auth_hdr = "Authorization: Bearer ";
        auth_hdr += a_token;
        list = curl_slist_append( list, auth_hdr.c_str() );
        curl_easy_setopt( m_curl, CURLOPT_HTTPHEADER, list );
    }
    else
    {
        curl_easy_setopt( m_curl, CURLOPT_HTTPAUTH, CURLAUTH_BASIC );
        curl_easy_setopt( m_curl, CURLOPT_USERNAME, m_auth_id.c_str() );
        curl_easy_setopt( m_curl, CURLOPT_PASSWORD, m_auth_secret.c_str() );
    }

    CURLcode res = curl_easy_perform( m_curl );

    if ( list )
        curl_slist_free_all(list);

    long http_code = 0;
    curl_easy_getinfo( m_curl, CURLINFO_RESPONSE_CODE, &http_code );

    if ( res != CURLE_OK )
    {
        DL_ERROR( "GlobusAPIClient::get - CURL error [" << error << "], " << curl_easy_strerror( res ));
        EXCEPT_PARAM( 1, "Globus API call failed." );
    }

    return http_code;
}

long
GlobusAPIClient::post( const std::string & a_base_url, const std::string & a_url_path, const std::string & a_token, const std::vector<std::pair<std::string,std::string>> & a_params, const rapidjson::Document * a_body, string & a_result )
{
    string  url;
    char    error[CURL_ERROR_SIZE];
    char *  esc_txt;

    error[0] = 0;
    url.reserve( 512 );
    url.append( a_base_url );

    esc_txt = curl_easy_escape( m_curl, a_url_path.c_str(), 0 );
    url.append( esc_txt );
    curl_free( esc_txt );

    if ( a_params.size() > 0 )
        url.append( "?" );

    for ( vector<pair<string,string>>::const_iterator iparam = a_params.begin(); iparam != a_params.end(); ++iparam )
    {
        url.append( "&" );
        url.append( iparam->first.c_str() );
        url.append( "=" );
        esc_txt = curl_easy_escape( m_curl, iparam->second.c_str(), 0 );
        url.append( esc_txt );
        curl_free( esc_txt );
    }

    rapidjson::StringBuffer buffer;
    rapidjson::Writer<rapidjson::StringBuffer> writer(buffer);
    if ( a_body )
        a_body->Accept(writer);

    //curl_easy_setopt( m_curl, CURLOPT_VERBOSE, 1 );
    curl_easy_setopt( m_curl, CURLOPT_URL, url.c_str() );
    curl_easy_setopt( m_curl, CURLOPT_WRITEDATA, &a_result );
    curl_easy_setopt( m_curl, CURLOPT_ERRORBUFFER, error );
    curl_easy_setopt( m_curl, CURLOPT_POST, 1 );

    if ( a_body )
        curl_easy_setopt( m_curl, CURLOPT_POSTFIELDS, buffer.GetString());
    else
        curl_easy_setopt( m_curl, CURLOPT_POSTFIELDS, "");

    struct curl_slist *list = 0;

    if ( a_token.size() )
    {
        string auth_hdr = "Authorization: Bearer ";
        auth_hdr += a_token;
        list = curl_slist_append( list, auth_hdr.c_str() );
    }
    else
    {
        curl_easy_setopt( m_curl, CURLOPT_HTTPAUTH, CURLAUTH_BASIC );
        curl_easy_setopt( m_curl, CURLOPT_USERNAME, m_auth_id.c_str() );
        curl_easy_setopt( m_curl, CURLOPT_PASSWORD, m_auth_secret.c_str() );
    }

    if ( a_body )
    {
        list = curl_slist_append( list, "Content-Type: application/json");
    }

    if ( list )
        curl_easy_setopt( m_curl, CURLOPT_HTTPHEADER, list );

    CURLcode res = curl_easy_perform( m_curl );

    if ( list )
        curl_slist_free_all(list);

    long http_code = 0;
    curl_easy_getinfo( m_curl, CURLINFO_RESPONSE_CODE, &http_code );

    if ( res != CURLE_OK )
    {
        DL_ERROR( "GlobusAPIClient::post - CURL error [" << error << "], " << curl_easy_strerror( res ));
        EXCEPT_PARAM( 1, "Globus API call failed." );
    }

    return http_code;
}


std::string
GlobusAPIClient::getSubmissionID( const std::string & a_acc_token )
{
    string raw_result;
    long code = get( m_xfr_url + "submission_id", "", a_acc_token, {}, raw_result );

    if ( code < 200 || code > 202 )
    {
        DL_ERROR( "getSubmissionID - REST call failed, code: " << code );
        EXCEPT_PARAM( 1, "Globus Task API request failed, code: " << code );
    }

    rapidjson::Document result;

    if ( !raw_result.size() )
    {
        DL_ERROR( "getSubmissionID - empty response from Globus" );
        EXCEPT_PARAM( 1, "Invalid response from Globus Task API." );
    }

    // Try to decode result as JSON - even if call failed
    result.Parse( raw_result.c_str() );

    if ( result.HasParseError() )
    {
        DL_ERROR( "getSubmissionID - invalid JSON from Globus" );
        EXCEPT_PARAM( 1, "Invalid response from Globus Task API." );
    }

    rapidjson::Value::MemberIterator imem = result.FindMember("value");
    
    if ( imem == result.MemberEnd() )
    {
        DL_ERROR( "getSubmissionID - missing content from Globus" );
        EXCEPT_PARAM( 1, "Invalid response from Globus Task API." );
    }

    return imem->value.GetString();
}

void
GlobusAPIClient::transfer( SDMS::XfrData & a_xfr, const std::string & a_acc_token )
{
    DL_DEBUG( "GlobusAPIClient::transfer, ID: " << a_xfr.id() << ", mode,  " << a_xfr.mode() << ", rem path: " << a_xfr.rem_path() );

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
    if ( a_xfr.encrypt() == XE_FORCE )
        body.AddMember( "encrypt_data", true, allocator );
    else if ( a_xfr.encrypt() == XE_NONE )
        body.AddMember( "encrypt_data", false, allocator );

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
    long code = post( m_xfr_url + "transfer", "", a_acc_token, {}, &body, raw_result );

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
            EXCEPT_PARAM( 1, "Globus Transfer API request failed, code: " << code );
        }
        else
        {
            DL_ERROR( "Globus Transfer API request failed, code: " << code << ", reason: " << imem->value.GetString() );
            EXCEPT_PARAM( 1, imem->value.GetString() );
        }
    }
    else
    {
        imem = result.FindMember("DATA_TYPE");
        if ( imem == result.MemberEnd() )
        {
            DL_ERROR( "Globus xfr req failed: invalid response from Globus." );
            EXCEPT( 1, "Invalid response from Globus Transfer API." );
        }

        imem = result.FindMember("code");
        if ( imem == result.MemberEnd() )
        {
            DL_ERROR( "Globus xfr req failed: invalid response from Globus." );
            EXCEPT( 1, "Invalid response from Globus Transfer API." );
        }

        if ( strcmp( imem->value.GetString(), "Accepted" ) != 0 )
        {
            imem = result.FindMember("message");
            if ( imem == result.MemberEnd() )
            {
                DL_ERROR( "Globus transfer request not accepted (no reason)." );
                EXCEPT( 1, "Globus transfer request failed, no reason given." );
            }
            else
            {
                DL_ERROR( "Globus xfr req not accepted: " << imem->value.GetString() );
                EXCEPT_PARAM( 1, imem->value.GetString() );
            }
        }

        imem = result.FindMember("task_id");
        if ( imem == result.MemberEnd() )
        {
            DL_ERROR( "Globus xfr req failed: invalid response from Globus." );
            EXCEPT( 1, "Invalid response from Globus Transfer API." );
        }

        a_xfr.set_task_id( imem->value.GetString() );
    }
}


bool
GlobusAPIClient::checkTransferStatus( const std::string & a_acc_tok, const std::string & a_task_id, XfrStatus & a_status, std::string & a_err_msg )
{
    a_status = XS_INIT;
    a_err_msg.clear();
    string raw_result;

    long code = get( m_xfr_url + "task/", a_task_id + "/event_list", a_acc_tok, {}, raw_result );

    DL_INFO( "XFR STAT: " << raw_result );

    if ( code < 200 || code > 202 )
        EXCEPT( 1, "Unknown Globus event_list failure" );

    rapidjson::Document result;

    if ( !raw_result.size() )
        EXCEPT( 1, "Empty response from Globus for event_list" );

    // Try to decode result as JSON - even if call failed
    result.Parse( raw_result.c_str() );

    if ( result.HasParseError() )
        EXCEPT( 1, "Invalid response from Globus Task API." );


    rapidjson::Value::MemberIterator imem = result.FindMember("DATA_TYPE");
    if ( imem == result.MemberEnd() || strcmp( imem->value.GetString(), "event_list" ) != 0 )
        EXCEPT( 1, "Invalid response from Globus Task API." );

    imem = result.FindMember("length");
    if ( imem == result.MemberEnd() )
        EXCEPT( 1, "Invalid response from Globus Task API." );

    int len = imem->value.GetInt();
    if ( len )
    {
        imem = result.FindMember("DATA");
        if ( imem == result.MemberEnd() )
            EXCEPT( 1, "Invalid response from Globus Task API." );

        vector<string> events;

        for ( int i = 0; i < len; i++ )
        {
            if ( imem->value[i]["is_error"].GetBool() )
            {
                a_status = XS_FAILED;
                a_err_msg = imem->value[i]["details"].GetString();
                return true;
            }

            events.push_back( imem->value[i]["code"].GetString());
        }

        return eventsHaveErrors( events, a_status, a_err_msg );
    }

    return false;
}

void
GlobusAPIClient::cancelTask( const std::string & a_acc_tok, const std::string & a_task_id )
{
    string raw_result;

    //string url = string("task/")+a_task_id+"/cancel";
    long code = post( m_xfr_url + "task/", a_task_id + "/cancel", a_acc_tok, {}, 0, raw_result );

    if ( code < 200 || code > 202 )
        EXCEPT_PARAM( 1, "Globus cancel task API error, code: " << code );

    rapidjson::Document result;

    if ( !raw_result.size() )
        EXCEPT( 1, "Invalid response from Globus Task API." );

    // Try to decode result as JSON - even if call failed

    result.Parse( raw_result.c_str() );

    if ( result.HasParseError() )
        EXCEPT( 1, "Invalid response from Globus Task API." );

    rapidjson::Value::MemberIterator imem = result.FindMember("DATA_TYPE");
    if ( imem == result.MemberEnd() )
        EXCEPT( 1, "Invalid response from Globus Task API." );

    imem = result.FindMember("code");
    if ( imem == result.MemberEnd() )
        EXCEPT( 1, "Invalid response from Globus Task API." );
}

/**
 * @return True if task has errors and needs to be cancelled, false otherwise
 */
bool
GlobusAPIClient::eventsHaveErrors( const vector<string> & a_events, XfrStatus & a_status, std::string & a_err_msg )
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



void
GlobusAPIClient::getEndpointInfo( const std::string & a_ep_id, const std::string & a_acc_token, EndpointInfo & a_ep_info )
{
    string raw_result;
    long code = get( m_xfr_url + "endpoint/", a_ep_id, a_acc_token, {}, raw_result );
    DL_ERROR("EP result: " << raw_result );



    if ( !raw_result.size() )
        EXCEPT( 1, "1 Invalid response from Globus Endpoint API." );

    rapidjson::Document result;
    result.Parse( raw_result.c_str() );

    if ( result.HasParseError() )
    {
        DL_ERROR( "Globus endpoint call failed, returned invalid JSON." );
        EXCEPT( 1, "2 Invalid response from Globus Endpoint API." );
    }

    rapidjson::Value::MemberIterator imem;

    if ( code < 200 || code > 202 )
    {
        imem = result.FindMember("message");
        if ( imem == result.MemberEnd() )
            EXCEPT_PARAM( 1, "Globus Endpoint API call failed, code: " << code );
        else
            EXCEPT( 1, imem->value.GetString() );
    }

    if (( imem = result.FindMember("activated")) == result.MemberEnd() )
        EXCEPT( 1, "3 Invalid response from Globus Endpoint API." );

    a_ep_info.activated = imem->value.GetBool();

    if (( imem = result.FindMember("expires_in")) == result.MemberEnd() )
        EXCEPT( 1, "4 Invalid response from Globus Endpoint API." );

    int64_t exp = imem->value.GetInt();
    if ( exp < 0 )
    {
        a_ep_info.activated = true;
        a_ep_info.never_expires = true;
        a_ep_info.expiration = 0;
    }
    else
    {
        a_ep_info.never_expires = false;
        a_ep_info.expiration = time(0) + exp;
    }

    if (( imem = result.FindMember("force_encryption")) == result.MemberEnd() )
        EXCEPT( 1, "5 Invalid response from Globus Endpoint API." );

    a_ep_info.force_encryption = imem->value.GetBool();
    if ( a_ep_info.force_encryption )
        a_ep_info.supports_encryption = true;
    else
    {
        // Look at DATA[0].scheme to see if it's gsiftp
        if (( imem = result.FindMember("DATA")) == result.MemberEnd() )
            EXCEPT( 1, "6 Invalid response from Globus Endpoint API." );

        rapidjson::Value & val = imem->value[0];

        if (( imem = val.FindMember("scheme")) == val.MemberEnd() )
            EXCEPT( 1, "7 Invalid response from Globus Endpoint API." );

        a_ep_info.supports_encryption = ( strcmp( imem->value.GetString(), "gsiftp" ) == 0 );
    }
}


void
GlobusAPIClient::refreshAccessToken( const std::string & a_ref_tok, std::string & a_new_acc_tok, uint32_t & a_expires_in )
{
    /*
    rapidjson::Document body;
    rapidjson::Document::AllocatorType& allocator = body.GetAllocator();

    body.SetObject();
    body.AddMember( "refresh_token", rapidjson::StringRef( a_ref_tok.c_str() ), allocator );
    body.AddMember( "grant_type", "refresh_token", allocator );

    cout << "REFRESH REQUEST BODY:\n";
    rapidjson::StringBuffer buffer;
    rapidjson::Writer<rapidjson::StringBuffer> writer(buffer);
    body.Accept(writer);
    cout << buffer.GetString() << endl;
    */
    string raw_result;
    long code = post( m_auth_url + "token", "", "", {{"refresh_token",a_ref_tok},{"grant_type","refresh_token"}}, 0, raw_result );

    // Try to decode result as JSON - even if call failed

    DL_ERROR("Refresh result: " << raw_result );

    rapidjson::Document result;

    if ( raw_result.size() )
    {
        result.Parse( raw_result.c_str() );

        if ( result.HasParseError() )
        {
            DL_ERROR( "Globus refresh call failed, returned invalid JSON." );
            EXCEPT( 1, "Globus refresh API call failed." );
        }
    }

    rapidjson::Value::MemberIterator imem;

    if ( code < 200 || code > 202 )
    {
        imem = result.FindMember("message");
        if ( imem == result.MemberEnd() )
        {
            DL_ERROR( "Globus refresh call failed, code: " << code );
            EXCEPT( 1, "Globus API call failed." );
        }
        else
        {
            DL_ERROR( "Globus refresh call failed, code: " << code << ", reason: " << imem->value.GetString() );
            EXCEPT_PARAM( 1, imem->value.GetString() );
        }
    }

    imem = result.FindMember("access_token");
    rapidjson::Value::MemberIterator imem2 = result.FindMember("expires_in");

    if ( imem == result.MemberEnd() || imem2 == result.MemberEnd())
    {
        DL_ERROR( "Globus refresh req failed: invalid response from Globus." );
        EXCEPT( 1, "Invalid refresh response from Globus." );
    }

    a_new_acc_tok = imem->value.GetString();
    a_expires_in = imem2->value.GetUint();
}



}}
