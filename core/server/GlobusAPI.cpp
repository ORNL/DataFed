#include <iostream>
#include <time.h>
#include "GlobusAPI.hpp"
#include "Util.hpp"
#include "TraceException.hpp"
#include "DynaLog.hpp"

using namespace std;

namespace SDMS {
namespace Core {

GlobusAPI::GlobusAPI():
    m_config( Config::getInstance() )
{
    m_curl = curl_easy_init();
    if ( !m_curl )
        EXCEPT( 1, "libcurl init failed" );

    curl_easy_setopt( m_curl, CURLOPT_HTTP_VERSION, CURL_HTTP_VERSION_1_1 );
    curl_easy_setopt( m_curl, CURLOPT_WRITEFUNCTION, curlResponseWriteCB );
    curl_easy_setopt( m_curl, CURLOPT_SSL_VERIFYPEER, 0 );
    curl_easy_setopt( m_curl, CURLOPT_TCP_NODELAY, 1 );
}

GlobusAPI::~GlobusAPI()
{
    curl_easy_cleanup( m_curl );
}

long
GlobusAPI::get( const std::string & a_base_url, const std::string & a_url_path, const std::string & a_token, const vector<pair<string,string>> &a_params, string & a_result )
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
        curl_easy_setopt( m_curl, CURLOPT_USERNAME, m_config.client_id.c_str() );
        curl_easy_setopt( m_curl, CURLOPT_PASSWORD, m_config.client_secret.c_str() );
    }

    CURLcode res = curl_easy_perform( m_curl );

    if ( list )
        curl_slist_free_all(list);

    long http_code = 0;
    curl_easy_getinfo( m_curl, CURLINFO_RESPONSE_CODE, &http_code );

    if ( res != CURLE_OK )
    {
        DL_ERROR( "GlobusAPI::get - CURL error [" << error << "], " << curl_easy_strerror( res ));
        EXCEPT_PARAM( 1, "Globus API call failed." );
    }

    return http_code;
}

long
GlobusAPI::post( const std::string & a_base_url, const std::string & a_url_path, const std::string & a_token, const std::vector<std::pair<std::string,std::string>> & a_params, const libjson::Value * a_body, string & a_result )
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

    //curl_easy_setopt( m_curl, CURLOPT_VERBOSE, 1 );
    curl_easy_setopt( m_curl, CURLOPT_URL, url.c_str() );
    curl_easy_setopt( m_curl, CURLOPT_WRITEDATA, &a_result );
    curl_easy_setopt( m_curl, CURLOPT_ERRORBUFFER, error );
    curl_easy_setopt( m_curl, CURLOPT_POST, 1 );

    string tmp;

    if ( a_body )
    {
        tmp = a_body->toString();
        DL_DEBUG( "POST BODY:[" << tmp << "]" );
        curl_easy_setopt( m_curl, CURLOPT_POSTFIELDS, tmp.c_str() );
    }
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
        curl_easy_setopt( m_curl, CURLOPT_USERNAME, m_config.client_id.c_str() );
        curl_easy_setopt( m_curl, CURLOPT_PASSWORD, m_config.client_secret.c_str() );
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
        DL_ERROR( "GlobusAPI::post - CURL error [" << error << "], " << curl_easy_strerror( res ));
        EXCEPT_PARAM( 1, "Globus API call failed." );
    }

    return http_code;
}


std::string
GlobusAPI::getSubmissionID( const std::string & a_acc_token )
{
    DL_DEBUG( "GlobusAPI::getSubmissionID" );

    string raw_result;
    long code = get( m_config.glob_xfr_url + "submission_id", "", a_acc_token, {}, raw_result );

    try
    {
        if ( !raw_result.size() )
            EXCEPT_PARAM( ID_SERVICE_ERROR, "Empty response. Code: " << code );

        libjson::Value result;

        result.fromString( raw_result );

        libjson::Value::Object & resp_obj = result.getObject();

        checkResponsCode( code, resp_obj );

        libjson::Value::ObjectIter i = result.find( "value" );
        
        if ( i == result.end() )
            EXCEPT( ID_SERVICE_ERROR, "Missing 'value' field from response." );

        return i->second.asString();
    }
    catch( libjson::ParseError & e )
    {
        DL_DEBUG("PARSE FAILED!");
        DL_DEBUG( raw_result );
        EXCEPT_PARAM( ID_SERVICE_ERROR, "Globus submission API call returned invalid JSON." );
    }
    catch( TraceException & e )
    {
        e.addContext( "Globus submission API call failed." );
        throw;
    }
    catch( ... )
    {
        DL_DEBUG("UNEXPECTED/MISSING JSON!");
        DL_DEBUG( raw_result );
        EXCEPT_PARAM( ID_SERVICE_ERROR, "Globus submission API call returned unexpected content" );
    }
}


string
GlobusAPI::transfer( const std::string & a_src_ep, const std::string & a_dst_ep, const std::vector<std::pair<std::string,std::string>> & a_files, bool a_encrypt, const std::string & a_acc_token )
{
    DL_DEBUG( "GlobusAPI::transfer" );

    string sub_id = getSubmissionID( a_acc_token );

    DL_DEBUG( "Access Token: " << a_acc_token );
    DL_DEBUG( "Submission ID: " << sub_id );

    libjson::Value body;

    body.initObject();
    body["DATA_TYPE"] = "transfer";
    body["submission_id"] = sub_id;
    body["source_endpoint"] = a_src_ep;
    body["destination_endpoint"] = a_dst_ep;
    body["verify_checksum"] = true;
    body["notify_on_succeeded"] = false;
    body["encrypt_data"] = a_encrypt;

    libjson::Value::Array & xfr_list = body["DATA"].initArray();
    xfr_list.reserve( a_files.size() );

    for ( vector<pair<string,string>>::const_iterator f = a_files.begin(); f != a_files.end(); f++ )
    {
        DL_DEBUG( "  xfr from " << f->first << " to " << f->second );

        libjson::Value xfr_item;
        xfr_item.initObject();
        xfr_item["DATA_TYPE"] = "transfer_item";
        xfr_item["source_path"] = f->first;
        xfr_item["destination_path"] = f->second;
        xfr_item["recursive"] = false;
        xfr_list.push_back( move( xfr_item ));
    }

    string raw_result;
    long code = post( m_config.glob_xfr_url + "transfer", "", a_acc_token, {}, &body, raw_result );

    try
    {
        if ( !raw_result.size() )
            EXCEPT_PARAM( ID_SERVICE_ERROR, "Empty response. Code: " << code );

        libjson::Value result;

        result.fromString( raw_result );

        libjson::Value::Object & resp_obj = result.getObject();

        checkResponsCode( code, resp_obj );

        libjson::Value::ObjectIter i;

        i = resp_obj.find("code");
        if ( i == resp_obj.end() )
            EXCEPT( ID_SERVICE_ERROR, "Missing 'code' field" );

        if ( i->second.asString().compare( "Accepted" ) != 0 )
            EXCEPT_PARAM( ID_SERVICE_ERROR, "Request not accepted (" << i->second.asString() << ")" );

        i = resp_obj.find("task_id");
        if ( i == resp_obj.end() )
            EXCEPT( ID_SERVICE_ERROR, "Missing 'task_id' field" );

        return i->second.asString();
    }
    catch( libjson::ParseError & e )
    {
        DL_DEBUG("PARSE FAILED!");
        DL_DEBUG( raw_result );
        EXCEPT_PARAM( ID_SERVICE_ERROR, "Globus transfer API call returned invalid JSON." );
    }
    catch( TraceException & e )
    {
        e.addContext( "Globus transfer API call failed." );
        throw;
    }
    catch( ... )
    {
        DL_DEBUG("UNEXPECTED/MISSING JSON!");
        DL_DEBUG( raw_result );
        EXCEPT_PARAM( ID_SERVICE_ERROR, "Globus transfer API call returned unexpected content" );
    }
}


bool
GlobusAPI::checkTransferStatus( const std::string & a_task_id, const std::string & a_acc_tok, XfrStatus & a_status, std::string & a_err_msg )
{
    DL_DEBUG( "GlobusAPI::checkTransferStatus" );

    a_status = XS_INIT;
    a_err_msg.clear();
    string raw_result;

    long code = get( m_config.glob_xfr_url + "task/", a_task_id + "/event_list", a_acc_tok, {}, raw_result );

    try
    {
        if ( !raw_result.size() )
            EXCEPT_PARAM( ID_SERVICE_ERROR, "Empty response. Code: " << code );

        libjson::Value result;

        result.fromString( raw_result );

        libjson::Value::Object & resp_obj = result.getObject();

        checkResponsCode( code, resp_obj );

        libjson::Value::ObjectIter i = resp_obj.find("DATA_TYPE");
        if ( i == resp_obj.end() || i->second.asString().compare( "event_list" ) != 0 )
            EXCEPT( ID_SERVICE_ERROR, "Missing or invalid DATA_TYPE field." );

        vector<string> events;

        libjson::Value::Array & arr = resp_obj["DATA"].getArray();

        for ( libjson::Value::ArrayIter i = arr.begin(); i != arr.end(); i++ )
        {
            if ( (*i)["is_error"].asBool() )
            {
                a_status = XS_FAILED;
                a_err_msg = (*i)["description"].asString();
                return true;
            }

            events.push_back( (*i)["code"].asString());
        }

        // Look for certain transient error events that should be treated as permanent errors
        return eventsHaveErrors( events, a_status, a_err_msg );
    }
    catch( libjson::ParseError & e )
    {
        DL_DEBUG("PARSE FAILED!");
        DL_DEBUG( raw_result );
        EXCEPT_PARAM( ID_SERVICE_ERROR, "Globus task event list API call returned invalid JSON." );
    }
    catch( TraceException & e )
    {
        e.addContext( "Globus task event list API call failed." );
        throw;
    }
    catch( ... )
    {
        DL_DEBUG("UNEXPECTED/MISSING JSON!");
        DL_DEBUG( raw_result );
        EXCEPT_PARAM( ID_SERVICE_ERROR, "Globus task event list API call returned unexpected content" );
    }
}

void
GlobusAPI::cancelTask( const std::string & a_task_id, const std::string & a_acc_tok )
{
    DL_DEBUG( "GlobusAPI::cancelTask" );

    string raw_result;

    long code = post( m_config.glob_xfr_url + "task/", a_task_id + "/cancel", a_acc_tok, {}, 0, raw_result );

    try
    {
        if ( !raw_result.size() )
            EXCEPT_PARAM( ID_SERVICE_ERROR, "Empty response. Code: " << code );

        libjson::Value result;

        result.fromString( raw_result );

        libjson::Value::Object & resp_obj = result.getObject();

        checkResponsCode( code, resp_obj );

        libjson::Value::ObjectIter i = resp_obj.find("code");
        if ( i == resp_obj.end() )
            EXCEPT( ID_SERVICE_ERROR, "Missing 'code' field" );

        if ( i->second.asString() != "Canceled" )
            EXCEPT_PARAM( ID_SERVICE_ERROR, "Unexpected 'code' value returned: " << i->second.asString() );
    }
    catch( libjson::ParseError & e )
    {
        DL_DEBUG("PARSE FAILED!");
        DL_DEBUG( raw_result );
        EXCEPT_PARAM( ID_SERVICE_ERROR, "Globus cancel task API call returned invalid JSON." );
    }
    catch( TraceException & e )
    {
        e.addContext( "Globus cancel task API call failed." );
        throw;
    }
    catch( ... )
    {
        DL_DEBUG("UNEXPECTED/MISSING JSON!");
        DL_DEBUG( raw_result );
        EXCEPT_PARAM( ID_SERVICE_ERROR, "Globus cancel task API call returned unexpected content" );
    }
}

/**
 * @return True if task has errors and needs to be cancelled, false otherwise
 */
bool
GlobusAPI::eventsHaveErrors( const vector<string> & a_events, XfrStatus & a_status, std::string & a_err_msg )
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
GlobusAPI::getEndpointInfo( const std::string & a_ep_id, const std::string & a_acc_token, EndpointInfo & a_ep_info )
{
    DL_DEBUG( "GlobusAPI::getEndpointInfo" );

    string raw_result;
    long code = get( m_config.glob_xfr_url + "endpoint/", a_ep_id, a_acc_token, {}, raw_result );

    try
    {
        if ( !raw_result.size() )
            EXCEPT_PARAM( ID_SERVICE_ERROR, "Empty response. Code: " << code );

        libjson::Value result;

        result.fromString( raw_result );

        libjson::Value::Object & resp_obj = result.getObject();

        checkResponsCode( code,resp_obj );

        libjson::Value::ObjectIter i = resp_obj.find("activated");
        if ( i == resp_obj.end() )
            EXCEPT( ID_SERVICE_ERROR, "Missing 'activated' field" );

        a_ep_info.activated = i->second.asBool();

        i = resp_obj.find("expires_in");
        if ( i == resp_obj.end() )
            EXCEPT( ID_SERVICE_ERROR, "Missing 'expires_in' field" );

        int64_t exp = i->second.asNumber();
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

        i = resp_obj.find("force_encryption");
        if ( i == resp_obj.end() )
            EXCEPT( ID_SERVICE_ERROR, "Missing 'force_encryption' field" );


        a_ep_info.supports_encryption = false;

        a_ep_info.force_encryption = i->second.asBool();
        if ( a_ep_info.force_encryption )
            a_ep_info.supports_encryption = true;
        else
        {
            // Look at DATA[0].scheme to see if it's gsiftp
            if (( i = resp_obj.find("DATA")) == resp_obj.end() )
                EXCEPT( ID_SERVICE_ERROR, "Missing 'DATA' field" );

            libjson::Value::Object & server_obj = i->second[0].getObject();

            i = server_obj.find("scheme");
            if ( i == resp_obj.end() )
                EXCEPT( ID_SERVICE_ERROR, "Missing 'scheme' field" );

            if ( i->second.isNull() )
                a_ep_info.supports_encryption = true;
            else if ( i->second.isString() )
                a_ep_info.supports_encryption = ( i->second.asString().compare( "gsiftp" ) == 0 );
        }
    }
    catch( libjson::ParseError & e )
    {
        DL_DEBUG("PARSE FAILED!");
        DL_DEBUG( raw_result );
        EXCEPT_PARAM( ID_SERVICE_ERROR, "Globus endpoint API call returned invalid JSON." );
    }
    catch( TraceException & e )
    {
        e.addContext( "Globus endpoint API call failed." );
        throw;
    }
    catch( exception & e )
    {
        DL_DEBUG("UNEXPECTED/MISSING JSON!");
        DL_DEBUG( raw_result );
        EXCEPT_PARAM( ID_SERVICE_ERROR, "Globus endpoint API call returned unexpected content" );
    }
}


void
GlobusAPI::refreshAccessToken( const std::string & a_ref_tok, std::string & a_new_acc_tok, uint32_t & a_expires_in )
{
    DL_DEBUG( "GlobusAPI::refreshAccessToken" );

    string raw_result;
    long code = post( m_config.glob_oauth_url + "token", "", "", {{"refresh_token",a_ref_tok},{"grant_type","refresh_token"}}, 0, raw_result );

    if ( !raw_result.size() )
        EXCEPT_PARAM( ID_SERVICE_ERROR, "Globus token API call returned empty response. Code: " << code );

    try
    {
        libjson::Value result;

        result.fromString( raw_result );

        libjson::Value::Object & resp_obj = result.getObject();

        checkResponsCode( code, resp_obj );

        libjson::Value::ObjectIter i = resp_obj.find("access_token");
        if ( i == resp_obj.end() )
            EXCEPT( ID_SERVICE_ERROR, "Missing 'access_token' field" );

        a_new_acc_tok = i->second.asString();

        i = resp_obj.find("expires_in");
        if ( i == resp_obj.end() )
            EXCEPT( ID_SERVICE_ERROR, "Missing 'expires_in' field" );

        a_expires_in = (uint32_t)i->second.asNumber();
    }
    catch( libjson::ParseError & e )
    {
        DL_DEBUG("PARSE FAILED!");
        DL_DEBUG( raw_result );
        EXCEPT_PARAM( ID_SERVICE_ERROR, "Globus token API call returned invalid JSON." );
    }
    catch( TraceException & e )
    {
        e.addContext( "Globus token API call failed." );
        throw;
    }
    catch( exception & e )
    {
        DL_DEBUG("UNEXPECTED/MISSING JSON!");
        DL_DEBUG( raw_result );
        EXCEPT_PARAM( ID_SERVICE_ERROR, "Globus token API call returned unexpected content" );
    }
}

void
GlobusAPI::checkResponsCode( long a_code, libjson::Value::Object & a_body ) const
{
    if ( a_code < 200 || a_code > 202 )
    {
        libjson::Value::ObjectIter i = a_body.find("message");
        if ( i == a_body.end() )
            EXCEPT_PARAM( ID_SERVICE_ERROR, "Request failed, code: " << a_code );
        else
            EXCEPT_PARAM( ID_SERVICE_ERROR, "Request failed, code: " << a_code << ", reason: " << i->second.asString() );
    }
}


}}


