#include <cctype>
#include <algorithm>
#include <zmq.h>
#include <unistd.h>
#include "Util.hpp"
#include "DynaLog.hpp"
#include "TraceException.hpp"
#include "DatabaseAPI.hpp"

using namespace std;

namespace SDMS {
namespace Core {

using namespace SDMS::Auth;
using namespace libjson;

DatabaseAPI::DatabaseAPI( const std::string & a_db_url, const std::string & a_db_user, const std::string & a_db_pass ) :
    m_client(0), m_db_url(a_db_url)
{
    m_curl = curl_easy_init();
    if ( !m_curl )
        EXCEPT( ID_INTERNAL_ERROR, "libcurl init failed" );

    setClient("");

    curl_easy_setopt( m_curl, CURLOPT_HTTP_VERSION, CURL_HTTP_VERSION_1_1 );
    curl_easy_setopt( m_curl, CURLOPT_USERNAME, a_db_user.c_str() );
    curl_easy_setopt( m_curl, CURLOPT_PASSWORD, a_db_pass.c_str() );
    curl_easy_setopt( m_curl, CURLOPT_WRITEFUNCTION, curlResponseWriteCB );
    curl_easy_setopt( m_curl, CURLOPT_SSL_VERIFYPEER, 0 );
    curl_easy_setopt( m_curl, CURLOPT_TCP_NODELAY, 1 );
}

DatabaseAPI::~DatabaseAPI()
{
    if ( m_client )
        curl_free( m_client );

    curl_easy_cleanup( m_curl );
}

void
DatabaseAPI::setClient( const std::string & a_client )
{
    m_client_uid = a_client.size()?(string("u/") + a_client):"";
    if ( m_client )
        curl_free( m_client );

    m_client = curl_easy_escape( m_curl, a_client.c_str(), 0 );
}

long
DatabaseAPI::dbGet( const char * a_url_path, const vector<pair<string,string>> &a_params, libjson::Value & a_result, bool a_log )
{
    a_result.clear();

    string  url;
    string  res_json;
    char    error[CURL_ERROR_SIZE];

    error[0] = 0;

    url.reserve( 512 );

    // TODO Get URL base from ctor
    url.append( m_db_url );
    url.append( a_url_path );
    url.append( "?client=" );
    url.append( m_client );

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

    if ( a_log )
    {
        DL_DEBUG( "get url: " << url );
    }

    curl_easy_setopt( m_curl, CURLOPT_URL, url.c_str() );
    curl_easy_setopt( m_curl, CURLOPT_WRITEDATA, &res_json );
    curl_easy_setopt( m_curl, CURLOPT_ERRORBUFFER, error );
    curl_easy_setopt( m_curl, CURLOPT_HTTPGET, 1 );

    CURLcode res = curl_easy_perform( m_curl );

    long http_code = 0;
    curl_easy_getinfo( m_curl, CURLINFO_RESPONSE_CODE, &http_code );

    if ( res == CURLE_OK )
    {
        if ( res_json.size() )
        {
            try
            {
                a_result.fromString( res_json );
            }
            catch( libjson::ParseError & e )
            {
                DL_DEBUG( "PARSE [" << res_json << "]" );
                EXCEPT_PARAM( ID_SERVICE_ERROR, "Invalid JSON returned from DB: " << e.toString( ));
            }
        }

        if ( http_code >= 200 && http_code < 300 )
        {
            return http_code;
        }
        else
        {
            if ( res_json.size() && a_result.has( "errorMessage" ))
            {
                EXCEPT_PARAM( ID_BAD_REQUEST, a_result["errorMessage"].asString() );
            }
            else
            {
                EXCEPT_PARAM( ID_BAD_REQUEST, "SDMS DB service call failed. Code: " << http_code << ", err: " << error );
            }
        }
    }
    else
    {
        EXCEPT_PARAM( ID_SERVICE_ERROR, "SDMS DB interface failed. error: " << error << ", " << curl_easy_strerror( res ));
    }
}


bool
DatabaseAPI::dbGetRaw( const char * a_url_path, const vector<pair<string,string>> &a_params, string & a_result )
{
    a_result.clear();

    string  url;
    char    error[CURL_ERROR_SIZE];

    a_result.clear();
    error[0] = 0;

    url.reserve( 512 );

    // TODO Get URL base from ctor
    url.append( m_db_url );
    url.append( a_url_path );
    url.append( "?client=" );
    url.append( m_client );

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

    DL_TRACE( "get raw url: " << url );

    curl_easy_setopt( m_curl, CURLOPT_URL, url.c_str() );
    curl_easy_setopt( m_curl, CURLOPT_WRITEDATA, &a_result );
    curl_easy_setopt( m_curl, CURLOPT_ERRORBUFFER, error );
    curl_easy_setopt( m_curl, CURLOPT_HTTPGET, 1 );

    CURLcode res = curl_easy_perform( m_curl );

    long http_code = 0;
    curl_easy_getinfo( m_curl, CURLINFO_RESPONSE_CODE, &http_code );

    if ( res == CURLE_OK && ( http_code >= 200 && http_code < 300 ))
        return true;
    else
        return false;
}

long
DatabaseAPI::dbPost( const char * a_url_path, const vector<pair<string,string>> &a_params, const string * a_body, Value & a_result )
{
    //DL_DEBUG( "dbPost " << a_url_path << " [" << (a_body?*a_body:"") << "]" );

    a_result.clear();

    string  url;
    string  res_json;
    char    error[CURL_ERROR_SIZE];

    error[0] = 0;

    url.reserve( 512 );

    // TODO Get URL base from ctor
    url.append( m_db_url );
    url.append( a_url_path );
    url.append( "?client=" );
    url.append( m_client );

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

    DL_TRACE( "post url: " << url );

    curl_easy_setopt( m_curl, CURLOPT_URL, url.c_str() );
    curl_easy_setopt( m_curl, CURLOPT_WRITEDATA, &res_json );
    curl_easy_setopt( m_curl, CURLOPT_ERRORBUFFER, error );
    curl_easy_setopt( m_curl, CURLOPT_POST, 1 );
    if ( a_body )
        curl_easy_setopt( m_curl, CURLOPT_POSTFIELDS, a_body->c_str() );

    CURLcode res = curl_easy_perform( m_curl );

    long http_code = 0;
    curl_easy_getinfo( m_curl, CURLINFO_RESPONSE_CODE, &http_code );

    if ( res == CURLE_OK )
    {
        if ( res_json.size() )
        {
            try
            {
                a_result.fromString( res_json );
            }
            catch( libjson::ParseError & e )
            {
                DL_DEBUG( "PARSE [" << res_json << "]" );
                EXCEPT_PARAM( ID_SERVICE_ERROR, "Invalid JSON returned from DB: " << e.toString( ));
            }
        }

        if ( http_code >= 200 && http_code < 300 )
        {
            return http_code;
        }
        else
        {
            if ( res_json.size() && a_result.has( "errorMessage" ))
            {
                EXCEPT_PARAM( ID_BAD_REQUEST, a_result["errorMessage"].asString() );
            }
            else
            {
                EXCEPT_PARAM( ID_BAD_REQUEST, "SDMS DB service call failed. Code: " << http_code << ", err: " << error );
            }
        }
    }
    else
    {
        EXCEPT_PARAM( ID_SERVICE_ERROR, "SDMS DB interface failed. error: " << error << ", " << curl_easy_strerror( res ));
    }
}

void
DatabaseAPI::clientAuthenticateByPassword( const std::string & a_password, Anon::AuthStatusReply & a_reply )
{
    Value result;

    dbGet( "usr/authn/password", {{"pw",a_password}}, result );
    setAuthStatus( a_reply, result );
}

void
DatabaseAPI::clientAuthenticateByToken( const std::string & a_token, Anon::AuthStatusReply & a_reply )
{
    Value result;

    dbGet( "usr/authn/token", {{"token",a_token}}, result );
    setAuthStatus( a_reply, result );
}

void
DatabaseAPI::setAuthStatus( Anon::AuthStatusReply & a_reply, Value & a_result )
{
    a_reply.set_uid( a_result["uid"].asString() );
    a_reply.set_auth( a_result["authorized"].asBool());
}

void
DatabaseAPI::clientLinkIdentity( const std::string & a_identity )
{
    Value result;

    dbGet( "usr/ident/add", {{"ident",a_identity}}, result );
}

bool
DatabaseAPI::uidByPubKey( const std::string & a_pub_key, std::string & a_uid )
{
    return dbGetRaw( "usr/find/by_pub_key", {{"pub_key",a_pub_key}}, a_uid );
}

bool
DatabaseAPI::userGetKeys( std::string & a_pub_key, std::string & a_priv_key )
{
    Value result;

    dbGet( "usr/keys/get", {}, result );

    Value::Object & obj = result[0].getObject();

    Value::ObjectIter i = obj.find("pub_key");
    if ( i == obj.end() )
        return false;

    a_pub_key = i->second.asString();

    i = obj.find("priv_key");
    if ( i == obj.end() )
        return false;

    a_priv_key = i->second.asString();

    return true;
}

void
DatabaseAPI::userSetKeys( const std::string & a_pub_key, const std::string & a_priv_key )
{
    Value result;

    dbGet( "usr/keys/set", {{"pub_key",a_pub_key},{"priv_key",a_priv_key}}, result );
}

void
DatabaseAPI::userClearKeys()
{
    Value result;

    dbGet( "usr/keys/clear", {}, result );
}


void
DatabaseAPI::userGetAccessToken( std::string & a_acc_tok, std::string & a_ref_tok, uint32_t & a_expires_in )
{
    Value result;
    dbGet( "usr/token/get", {}, result );

    try
    {
        Value::Object & obj = result.getObject();

        a_acc_tok = obj.at("access").asString();
        a_ref_tok = obj.at("refresh").asString();
        a_expires_in = (uint32_t)obj.at("expires_in").asNumber();
    }
    catch(...)
    {
        EXCEPT( ID_INTERNAL_ERROR, "Invalid JSON returned from DB service" );
    }
}

/*
bool
DatabaseAPI::userGetAccessToken( std::string & a_acc_tok )
{
    return dbGetRaw( "usr/token/get/access", {}, a_acc_tok );
}
*/

void
DatabaseAPI::userSetAccessToken( const std::string & a_acc_tok, uint32_t a_expires_in, const std::string & a_ref_tok )
{
    string result;
    dbGetRaw( "usr/token/set", {{"access",a_acc_tok},{"refresh",a_ref_tok},{"expires_in",to_string(a_expires_in)}}, result );
}

void
DatabaseAPI::userSetAccessToken( const Auth::UserSetAccessTokenRequest & a_request, Anon::AckReply & a_reply )
{
    (void)a_reply;
    userSetAccessToken( a_request.access(), a_request.expires_in(), a_request.refresh() );
}

void
DatabaseAPI::getExpiringAccessTokens( uint32_t a_expires_in, vector<UserTokenInfo> & a_expiring_tokens )
{
    Value result;
    dbGet( "usr/token/get/expiring", {{"expires_in",to_string(a_expires_in)}}, result );

    UserTokenInfo info;
    a_expiring_tokens.clear();

    try
    {
        Value::Array & arr = result.getArray();

        for ( Value::ArrayIter i = arr.begin(); i != arr.end(); i++ )
        {
            Value::Object & obj = i->getObject();

            info.uid = obj.at("id").asString();
            info.access_token = obj.at("access").asString();
            info.refresh_token = obj.at("refresh").asString();
            info.expiration = (uint32_t)obj.at("expiration").asNumber();

            a_expiring_tokens.push_back( info );
        }
    }
    catch(...)
    {
        EXCEPT( ID_INTERNAL_ERROR, "Invalid JSON returned from DB service" );
    }
}

void
DatabaseAPI::purgeTransferRecords( size_t age )
{
    string result;
    dbGetRaw( "xfr/purge", {{"age",to_string(age)}}, result );
}

void
DatabaseAPI::userCreate( const Auth::UserCreateRequest & a_request, Auth::UserDataReply & a_reply )
{
    vector<pair<string,string>> params;
    params.push_back({"uid",a_request.uid()});
    params.push_back({"password",a_request.password()});
    params.push_back({"name",a_request.name()});
    params.push_back({"email",a_request.email()});
    if ( a_request.has_options() )
        params.push_back({"options",a_request.options()});
    string uuids = "[";
    for ( int i = 0; i < a_request.uuid_size(); i++ )
    {
        if ( i )
            uuids += ",";
        uuids += "\"" + a_request.uuid(i) + "\"";
    }
    uuids += "]";
    params.push_back({"uuids",uuids});

    Value result;
    dbGet( "usr/create", params, result );

    setUserData( a_reply, result );
}


void
DatabaseAPI::userView( const UserViewRequest & a_request, UserDataReply & a_reply )
{
    vector<pair<string,string>> params;
    params.push_back({"subject",a_request.uid()});
    if ( a_request.has_details() && a_request.details() )
        params.push_back({"details","true"});

    Value result;
    dbGet( "usr/view", params, result );

    setUserData( a_reply, result );
}


void
DatabaseAPI::userUpdate( const UserUpdateRequest & a_request, UserDataReply & a_reply )
{
    Value result;

    vector<pair<string,string>> params;
    params.push_back({"subject",a_request.uid()});
    if ( a_request.has_email() )
        params.push_back({"email",a_request.email()});
    if ( a_request.has_password() )
        params.push_back({"password",a_request.password()});
    if ( a_request.has_options() )
        params.push_back({"options",a_request.options()});

    dbGet( "usr/update", params, result );

    setUserData( a_reply, result );
}


void
DatabaseAPI::userListAll( const UserListAllRequest & a_request, UserDataReply & a_reply )
{
    vector<pair<string,string>> params;
    if ( a_request.has_offset() && a_request.has_count() )
    {
        params.push_back({"offset",to_string(a_request.offset())});
        params.push_back({"count",to_string(a_request.count())});
    }

    Value result;
    dbGet( "usr/list/all", params, result );

    setUserData( a_reply, result );
}

void
DatabaseAPI::userListCollab( const UserListCollabRequest & a_request, UserDataReply & a_reply )
{
    Value result;
    vector<pair<string,string>> params;
    if ( a_request.has_offset() && a_request.has_count() )
    {
        params.push_back({"offset",to_string(a_request.offset())});
        params.push_back({"count",to_string(a_request.count())});
    }
    dbGet( "usr/list/collab", params, result );

    setUserData( a_reply, result );
}

void
DatabaseAPI::userFindByUUIDs( const Auth::UserFindByUUIDsRequest & a_request, Auth::UserDataReply & a_reply )
{
    string uuids = "[";

    for ( int i = 0; i < a_request.uuid_size(); i++ )
    {
        if ( i )
            uuids += ",";
        uuids += "\"" + a_request.uuid(i) + "\"";
    }

    uuids += "]";

    Value result;
    dbGet( "usr/find/by_uuids", {{"uuids",uuids}}, result );

    setUserData( a_reply, result );
}

void
DatabaseAPI::userGetRecentEP( const Auth::UserGetRecentEPRequest & a_request, Auth::UserGetRecentEPReply & a_reply )
{
    (void)a_request;
    Value result;

    dbGet( "usr/ep/get", {}, result );

    try
    {
        Value::Array & arr = result.getArray();

        for ( Value::ArrayIter i = arr.begin(); i != arr.end(); i++ )
        {
            a_reply.add_ep( i->asString() );
        }
    }
    catch(...)
    {
        EXCEPT( ID_INTERNAL_ERROR, "Invalid JSON returned from DB service" );
    }
}

void
DatabaseAPI::userSetRecentEP( const Auth::UserSetRecentEPRequest & a_request, Anon::AckReply & a_reply )
{
    (void) a_reply;
    Value result;

    string eps = "[";
    for ( int i = 0; i < a_request.ep_size(); i++ )
    {
        if ( i )
            eps += ",";
        eps += "\"" + a_request.ep(i) + "\"";
    }
    eps += "]";

    dbGet( "usr/ep/set", {{"eps",eps}}, result );
}

void
DatabaseAPI::setUserData( UserDataReply & a_reply, Value & a_result )
{
    UserData*           user;
    Value::ObjectIter   j;

    try
    {
        Value::Array & arr = a_result.getArray();

        for ( Value::ArrayIter i = arr.begin(); i != arr.end(); i++ )
        {
            Value::Object & obj = i->getObject();

            if (( j = obj.find( "paging" )) != obj.end( ))
            {
                Value::Object & obj2 = j->second.getObject();

                a_reply.set_offset( obj2.at( "off" ).asNumber( ));
                a_reply.set_count( obj2.at( "cnt" ).asNumber( ));
                a_reply.set_total( obj2.at( "tot" ).asNumber( ));
            }
            else
            {
                user = a_reply.add_user();
                user->set_uid( obj.at( "uid" ).asString( ));
                user->set_name( obj.at( "name" ).asString( ));

                if (( j = obj.find( "email" )) != obj.end( ))
                    user->set_email( j->second.asString( ));

                if (( j = obj.find( "options" )) != obj.end( ))
                {
                    user->set_options( j->second.asString( ));
                }

                if (( j = obj.find( "is_admin" )) != obj.end( ))
                    user->set_is_admin( j->second.asBool( ));

                if (( j = obj.find( "is_repo_admin" )) != obj.end( ))
                    user->set_is_repo_admin( j->second.asBool( ));

                if (( j = obj.find( "idents" )) != obj.end( ))
                {
                    Value::Array & arr2 = j->second.getArray();

                    for ( Value::ArrayIter k = arr2.begin(); k != arr2.end(); k++ )
                    {
                        user->add_ident( k->asString( ));
                    }
                }

                if (( j = obj.find( "allocs" )) != obj.end( ))
                {
                    Value::Array & arr2 = j->second.getArray();

                    for ( Value::ArrayIter k = arr2.begin(); k != arr2.end(); k++ )
                    {
                        setAllocData( user->add_alloc(), k->getObject() );
                    }
                }
            }
        }
    }
    catch(...)
    {
        EXCEPT( ID_INTERNAL_ERROR, "Invalid JSON returned from DB service" );
    }
}

void
DatabaseAPI::projCreate( const Auth::ProjectCreateRequest & a_request, Auth::ProjectDataReply & a_reply )
{
    Value result;
    vector<pair<string,string>> params;

    params.push_back({"id",a_request.id()});
    params.push_back({"title",a_request.title()});

    if ( a_request.has_desc() )
        params.push_back({"desc",a_request.desc()});

    if ( a_request.admin_size() > 0 )
    {
        string members = "[";
        for ( int i = 0; i < a_request.admin_size(); ++i )
        {
            if ( i > 0 )
                members += ",";
            members += "\"" + a_request.admin(i) + "\"";
        }
        members += "]";
        params.push_back({"admins", members });
    }

    if ( a_request.member_size() > 0 )
    {
        string members = "[";
        for ( int i = 0; i < a_request.member_size(); ++i )
        {
            if ( i > 0 )
                members += ",";
            members += "\"" + a_request.member(i) + "\"";
        }
        members += "]";
        params.push_back({"members", members });
    }

    dbGet( "prj/create", params, result );

    setProjectData( a_reply, result );
}

void
DatabaseAPI::projUpdate( const Auth::ProjectUpdateRequest & a_request, Auth::ProjectDataReply & a_reply )
{
    Value result;
    vector<pair<string,string>> params;

    params.push_back({"id",a_request.id()});

    if ( a_request.has_title() )
        params.push_back({"title",a_request.title()});

    if ( a_request.has_desc() )
        params.push_back({"desc",a_request.desc()});

    if ( a_request.admin_set() )
    {
        string admins = "[";
        for ( int i = 0; i < a_request.admin_size(); ++i )
        {
            if ( i > 0 )
                admins += ",";
            admins += "\"" + a_request.admin(i) + "\"";
        }
        admins += "]";
        params.push_back({ "admins", admins });
    }

    if ( a_request.member_set() )
    {
        string members = "[";
        for ( int i = 0; i < a_request.member_size(); ++i )
        {
            if ( i > 0 )
                members += ",";
            members += "\"" + a_request.member(i) + "\"";
        }
        members += "]";
        params.push_back({ "members", members });
    }

    dbGet( "prj/update", params, result );

    setProjectData( a_reply, result );
}

void
DatabaseAPI::projView( const Auth::ProjectViewRequest & a_request, Auth::ProjectDataReply & a_reply )
{
    Value result;
    dbGet( "prj/view", {{"id",a_request.id()}}, result );

    setProjectData( a_reply, result );
}

void
DatabaseAPI::projList( const Auth::ProjectListRequest & a_request, Auth::ListingReply & a_reply )
{
    Value result;
    vector<pair<string,string>> params;
    if ( a_request.has_subject() )
        params.push_back({"subject",a_request.subject()});
    if ( a_request.has_as_owner() && a_request.as_owner() )
        params.push_back({"as_owner","true"});
    if ( a_request.has_as_admin() && a_request.as_admin() )
        params.push_back({"as_admin","true"});
    if ( a_request.has_as_member() && a_request.as_member() )
        params.push_back({"as_member","true"});
    if ( a_request.has_sort())
        params.push_back({"sort",to_string(a_request.sort())});
    if ( a_request.has_sort_rev() && a_request.sort_rev() )
        params.push_back({"sort_rev","true"});
    if ( a_request.has_offset())
        params.push_back({"offset",to_string(a_request.offset())});
    if ( a_request.has_count())
        params.push_back({"count",to_string(a_request.count())});

    dbGet( "prj/list", params, result );

    setListingDataReply( a_reply, result );
}

void
DatabaseAPI::projSearch( const std::string & a_query, Auth::ProjectDataReply & a_reply )
{
    Value result;

    dbGet( "prj/search", {{"query",a_query}}, result );

    setProjectData( a_reply, result );
}


void
DatabaseAPI::setProjectData( ProjectDataReply & a_reply, Value & a_result )
{
    ProjectData*        proj;
    Value::ObjectIter   j;
    Value::ArrayIter    k;

    try
    {
        Value::Array & arr = a_result.getArray();

        for ( Value::ArrayIter i = arr.begin(); i != arr.end(); i++ )
        {
            Value::Object & obj = i->getObject();

            proj = a_reply.add_proj();
            proj->set_id( obj.at( "id" ).asString( ));
            proj->set_title( obj.at( "title").asString() );

            if (( j = obj.find("desc")) != obj.end( ))
                proj->set_desc( j->second.asString( ));

            if (( j = obj.find("owner")) != obj.end( ))
                proj->set_owner( j->second.asString( ));

            if (( j = obj.find("ct")) != obj.end( ))
                proj->set_ct( j->second.asNumber( ));

            if (( j = obj.find("ut")) != obj.end( ))
                proj->set_ut( j->second.asNumber( ));

            if (( j = obj.find("admins")) != obj.end( ))
            {
                Value::Array & arr2 = j->second.getArray();

                for ( k = arr2.begin(); k != arr2.end(); k++ )
                {
                    proj->add_admin( k->asString( ));
                }
            }

            if (( j = obj.find("members")) != obj.end( ))
            {
                Value::Array & arr2 = j->second.getArray();

                for ( k = arr2.begin(); k != arr2.end(); k++ )
                {
                    proj->add_member( k->asString( ));
                }
            }

            if (( j = obj.find("allocs")) != obj.end( ))
            {
                Value::Array & arr2 = j->second.getArray();

                for ( k = arr2.begin(); k != arr2.end(); k++ )
                {
                    setAllocData( proj->add_alloc(), k->getObject() );
                }
            }
        }
    }
    catch(...)
    {
        EXCEPT( ID_INTERNAL_ERROR, "Invalid JSON returned from DB service" );
    }
}

void
DatabaseAPI::recordSearch( const RecordSearchRequest & a_request, ListingReply & a_reply )
{
    Value result;
    vector<pair<string,string>> params;
    params.push_back({"query",a_request.query()});
    params.push_back({"use_client",a_request.use_client()?"true":"false"});
    params.push_back({"use_shared_users",a_request.use_shared_users()?"true":"false"});
    params.push_back({"use_shared_projects",a_request.use_shared_projects()?"true":"false"});
    if ( a_request.has_offset())
        params.push_back({"offset",to_string(a_request.offset())});
    if ( a_request.has_count() )
        params.push_back({"count",to_string(a_request.count())});

    dbGet( "/dat/search", params, result );

    setListingDataReply( a_reply, result );
}

void
DatabaseAPI::recordListByAlloc( const Auth::RecordListByAllocRequest & a_request, Auth::ListingReply & a_reply )
{
    Value result;
    vector<pair<string,string>> params;
    params.push_back({"repo",a_request.repo()});
    params.push_back({"subject",a_request.subject()});
    if ( a_request.has_offset() )
        params.push_back({"offset",to_string(a_request.offset())});
    if ( a_request.has_count() )
        params.push_back({"count",to_string(a_request.count())});

    dbGet( "/dat/list/by_alloc", params, result );

    setListingDataReply( a_reply, result );
}

void
DatabaseAPI::recordView( const RecordViewRequest & a_request, RecordDataReply & a_reply )
{
    Value result;

    dbGet( "dat/view", {{"id",a_request.id()}}, result );

    setRecordData( a_reply, result );
}

void
DatabaseAPI::recordCreate( const Auth::RecordCreateRequest & a_request, Auth::RecordDataReply & a_reply )
{
    Value result;

    string body = "{\"title\":\"" + escapeJSON( a_request.title() ) + "\"";
    if ( a_request.has_desc() )
        body += ",\"desc\":\"" + escapeJSON( a_request.desc() ) + "\"";
    if ( a_request.has_keyw() )
        body += ",\"keyw\":\"" + escapeJSON( a_request.keyw() ) + "\"";
    if ( a_request.has_alias() )
        body += ",\"alias\":\"" + a_request.alias() + "\"";
    if ( a_request.has_metadata() )
        body += ",\"md\":" + a_request.metadata();
    if ( a_request.has_doi() )
        body += string(",\"doi\":\"") + a_request.doi() + "\"";
    if ( a_request.has_data_url() )
        body += string(",\"data_url\":\"") + a_request.data_url() + "\"";
    if ( a_request.has_parent_id() )
        body += ",\"parent\":\"" + a_request.parent_id() + "\"";
    if ( a_request.has_repo_id() )
        body += ",\"repo\":\"" + a_request.repo_id() + "\"";
    if ( a_request.deps_size() )
    {
        body += ",\"deps\":[";

        for ( int i = 0; i < a_request.deps_size(); i++ )
        {
            body += string(i>0?",":"")+"{\"id\":\"" + a_request.deps(i).id() + "\",\"type\":" + to_string(a_request.deps(i).type()) + "}";
        }
        body += "]";
    }
    body += "}";

    dbPost( "dat/create", {}, &body, result );

    setRecordData( a_reply, result );
}

void
DatabaseAPI::recordCreateBatch( const Auth::RecordCreateBatchRequest & a_request, Auth::RecordDataReply & a_reply )
{
    Value result;

    dbPost( "dat/create/batch", {}, &a_request.records(), result );

    setRecordData( a_reply, result );
}

void
DatabaseAPI::recordUpdate( const Auth::RecordUpdateRequest & a_request, Auth::RecordDataReply & a_reply, libjson::Value & result )
{
    string body = "{\"id\":\"" + a_request.id() + "\"";
    if ( a_request.has_title() )
        body += ",\"title\":\"" + escapeJSON( a_request.title() ) + "\"";
    if ( a_request.has_desc() )
        body += ",\"desc\":\"" + escapeJSON( a_request.desc() ) + "\"";
    if ( a_request.has_keyw() )
        body += ",\"keyw\":\"" + escapeJSON( a_request.keyw() ) + "\"";
    if ( a_request.has_alias() )
        body += ",\"alias\":\"" + a_request.alias() + "\"";
    if ( a_request.has_metadata() )
    {
        body += ",\"md\":" + (a_request.metadata().size()?a_request.metadata():"\"\"");
        if ( a_request.has_mdset() )
        {
            body += ",\"mdset\":";
            body += (a_request.mdset()?"true":"false");
        }
    }
    if ( a_request.has_ispublic() )
        body += string(",\"public\":") + (a_request.ispublic()?"true":"false");
    if ( a_request.has_doi() )
        body += string(",\"doi\":\"") + a_request.doi() + "\"";
    if ( a_request.has_data_url() )
        body += string(",\"data_url\":\"") + a_request.data_url() + "\"";
    if ( a_request.has_size() )
        body += ",\"size\":" + to_string(a_request.size());
    if ( a_request.has_source() )
        body += ",\"source\":\"" + a_request.source() + "\"";
    if ( a_request.has_ext() )
        body += ",\"ext\":\"" + a_request.ext() + "\"";
    if ( a_request.has_ext_auto() )
        body += string(",\"ext_auto\":") + (a_request.ext_auto()?"true":"false");
    if ( a_request.has_dt() )
        body += ",\"dt\":" + to_string(a_request.dt());

    if ( a_request.has_deps_clear() )
        body += string(",\"deps_clear\":") + (a_request.deps_clear()?"true":"false");

    if ( a_request.deps_add_size() )
    {
        body += ",\"deps_add\":[";
        for ( int i = 0; i < a_request.deps_add_size(); i++ )
        {
            body += string(i>0?",":"")+"{\"id\":\"" + a_request.deps_add(i).id() + "\",\"type\":" + to_string(a_request.deps_add(i).type()) + "}";
        }
        body += "]";
    }

    if ( a_request.deps_rem_size() )
    {
        body += ",\"deps_rem\":[";
        for ( int i = 0; i < a_request.deps_rem_size(); i++ )
        {
            body += string(i>0?",":"")+"{\"id\":\"" + a_request.deps_rem(i).id() + "\",\"type\":" + to_string(a_request.deps_rem(i).type()) + "}";
        }
        body += "]";
    }

    body += "}";

    dbPost( "dat/update", {}, &body, result );

    setRecordData( a_reply, result["data"] );
}


void
DatabaseAPI::recordUpdateBatch( const Auth::RecordUpdateBatchRequest & a_request, Auth::RecordDataReply & a_reply, libjson::Value & result )
{
    // "records" field is a JSON document - send directly to DB
    dbPost( "dat/update/batch", {}, &a_request.records(), result );

    setRecordData( a_reply, result["data"] );
}

void
DatabaseAPI::recordUpdatePostPut( const std::string & a_data_id, size_t a_file_size, time_t a_mod_time, const std::string & a_src_path, const std::string * a_ext )
{
    libjson::Value result;

    string body = "{\"id\":\"" + a_data_id + "\",\"size\":" + to_string(a_file_size) + ",\"source\":\"" + a_src_path + "\",\"dt\":" + to_string(a_mod_time);
    if ( a_ext )
        body += ",\"ext\":\"" + *a_ext + "\",\"ext_auto\":false";
    body += "}";

    dbPost( "dat/update/post_put", {}, &body, result );
}

void
DatabaseAPI::recordUpdateSize( const Auth::RepoDataSizeReply & a_size_rep )
{
    libjson::Value result;

    string body = "{\"records\":[";

    for ( int i = 0; i < a_size_rep.size_size(); i++ )
    {
        if ( i > 0 )
            body += ",";
        body += "{\"id\":\"" + a_size_rep.size(i).id() + "\",\"size\":" + to_string(a_size_rep.size(i).size()) + "}";
    }

    body += "]}";

    dbPost( "dat/update/size", {}, &body, result );
}

void
DatabaseAPI::recordLock( const Auth::RecordLockRequest & a_request, Auth::ListingReply & a_reply )
{
    Value result;
    string ids;

    if ( a_request.id_size() > 0 )
    {
        ids = "[";
        for ( int i = 0; i < a_request.id_size(); i++ )
        {
            if ( i > 0 )
                ids += ",";

            ids += "\"" + a_request.id(i) + "\"";
        }
        ids += "]";
    }
    else
        ids = "[]";

    dbGet( "dat/lock", {{"ids",ids},{"lock",a_request.lock()?"true":"false"}}, result );

    setListingDataReply( a_reply, result );
}

void
DatabaseAPI::recordGetDependencies( const Auth::RecordGetDependenciesRequest & a_request, Auth::ListingReply & a_reply )
{
    Value result;

    dbGet( "dat/dep/get", {{"id",a_request.id()}}, result );

    setListingDataReply( a_reply, result );
}


void
DatabaseAPI::recordGetDependencyGraph( const Auth::RecordGetDependencyGraphRequest & a_request, Auth::ListingReply & a_reply )
{
    Value result;

    dbGet( "dat/dep/graph/get", {{"id",a_request.id()}}, result );

    setListingDataReply( a_reply, result );
}

void
DatabaseAPI::recordUpdateDataMoveInit( const libjson::Value & a_rec_ids, const std::string & a_new_repo_id, const std::string & a_new_owner_id, const std::string & a_new_coll_id )
{
    string body = "{\"ids\":" + a_rec_ids.toString() + ",\"new_repo_id\":\"" + a_new_repo_id + "\",\"new_owner_id\":\"" + a_new_owner_id + "\",\"new_coll_id\":\"" + a_new_coll_id + "\"}";

    DL_DEBUG("recordUpdateDataMoveInit" << body);

    Value result;

    dbPost( "dat/update/move_init", {}, &body, result );
}

void
DatabaseAPI::recordUpdateDataMoveRevert( const libjson::Value & a_rec_ids )
{
    string body = "{\"ids\":" + a_rec_ids.toString() + "}";

    Value result;

    dbPost( "dat/update/move_revert", {}, &body, result );
}

void
DatabaseAPI::recordUpdateDataMoveFinalize( const libjson::Value & a_rec_ids )
{
    string body = "{\"ids\":" + a_rec_ids.toString() + "}";

    DL_DEBUG("recordUpdateDataMoveFinalize" << body);

    Value result;

    dbPost( "dat/update/move_fini", {}, &body, result );
}

void
DatabaseAPI::setRecordData( RecordDataReply & a_reply, Value & a_result )
{
    RecordData *        rec;
    DependencyData *    deps;
    Value::ObjectIter   j,m;
    Value::ArrayIter    k;

    try
    {
        Value::Array & arr = a_result.getArray();

        for ( Value::ArrayIter i = arr.begin(); i != arr.end(); i++ )
        {
            Value::Object & obj = i->getObject();

            rec = a_reply.add_data();
            rec->set_id( obj.at( "id" ).asString( ));
            rec->set_title( obj.at( "title" ).asString( ));

            if (( j = obj.find( "alias" )) != obj.end( ) && !j->second.isNull( ))
                rec->set_alias( j->second.asString( ));

            if (( j = obj.find( "owner" )) != obj.end( ))
                rec->set_owner( j->second.asString( ));

            if (( j = obj.find( "creator" )) != obj.end( ))
                rec->set_creator( j->second.asString( ));

            if (( j = obj.find( "desc" )) != obj.end( ))
                rec->set_desc( j->second.asString( ));

            if (( j = obj.find( "keyw" )) != obj.end( ))
                rec->set_keyw( j->second.asString( ));

            if (( j = obj.find( "public" )) != obj.end( ))
                rec->set_ispublic( j->second.asBool( ));

            if (( j = obj.find( "doi" )) != obj.end( ))
                rec->set_doi( j->second.asString( ));

            if (( j = obj.find( "data_url" )) != obj.end( ))
                rec->set_data_url( j->second.asString( ));

            if (( j = obj.find( "md" )) != obj.end( ))
                rec->set_metadata( j->second.toString( ));

            if (( j = obj.find( "repo_id" )) != obj.end( ))
                rec->set_repo_id( j->second.asString( ));

            if (( j = obj.find( "size" )) != obj.end( ))
                rec->set_size( j->second.asNumber( ));

            if (( j = obj.find( "source" )) != obj.end( ))
                rec->set_source( j->second.asString( ));

            if (( j = obj.find( "ext" )) != obj.end( ))
                rec->set_ext( j->second.asString( ));

            if (( j = obj.find( "ext_auto" )) != obj.end( ))
                rec->set_ext_auto( j->second.asBool( ));

            if (( j = obj.find( "ct" )) != obj.end( ))
                rec->set_ct( j->second.asNumber( ));

            if (( j = obj.find( "ut" )) != obj.end( ))
                rec->set_ut( j->second.asNumber( ));

            if (( j = obj.find( "dt" )) != obj.end( ))
                rec->set_dt( j->second.asNumber( ));

            if (( j = obj.find( "locked" )) != obj.end( ))
                rec->set_locked( j->second.asBool( ));

            if (( j = obj.find( "parent_id" )) != obj.end( ))
                rec->set_parent_id( j->second.asString( ));

            if (( j = obj.find( "deps" )) != obj.end( ))
            {
                Value::Array & arr2 = j->second.getArray();

                for ( k = arr2.begin(); k != arr2.end(); k++ )
                {
                    Value::Object & obj2 = k->getObject();

                    deps = rec->add_deps();
                    deps->set_id( obj2.at( "id" ).asString());
                    deps->set_type((DependencyType)(unsigned short) obj2.at( "type" ).asNumber());
                    deps->set_dir((DependencyDir)(unsigned short) obj2.at( "dir" ).asNumber());
                    if (( m = obj2.find( "alias" )) != obj2.end( ) && !m->second.isNull( ))
                        deps->set_alias( m->second.asString() );
                }
            }
        }
    }
    catch(...)
    {
        EXCEPT( ID_INTERNAL_ERROR, "Invalid JSON returned from DB service" );
    }
}


void
DatabaseAPI::dataPath( const Auth::DataPathRequest & a_request, Auth::DataPathReply & a_reply )
{
    Value result;

    dbGet( "dat/path", {{"id",a_request.id()},{"domain",a_request.domain()}}, result );

    a_reply.set_path( result["path"].asString() );
}


void
DatabaseAPI::collList( const CollListRequest & a_request, CollDataReply & a_reply )
{
    Value result;

    if ( a_request.has_user() )
        dbGet( "col/priv/list", {{"subject",a_request.user()}}, result );
    else
        dbGet( "col/priv/list", {}, result );

    setCollData( a_reply, result );
}

void
DatabaseAPI::collListPublished( const Auth::CollListPublishedRequest & a_request, Auth::ListingReply & a_reply )
{
    Value result;

    if ( a_request.has_subject() )
        dbGet( "col/published/list", {{"subject",a_request.subject()}}, result );
    else
        dbGet( "col/published/list", {}, result );

    setListingDataReply( a_reply, result );
}

void
DatabaseAPI::collCreate( const Auth::CollCreateRequest & a_request, Auth::CollDataReply & a_reply )
{
    Value result;

    string body = "{\"title\":\"" + escapeJSON( a_request.title() ) + "\"";
    if ( a_request.has_desc() )
        body += ",\"desc\":\"" + escapeJSON( a_request.desc() ) + "\"";
    if ( a_request.has_alias() )
        body += ",\"alias\":\"" + a_request.alias() + "\"";
    if ( a_request.has_parent_id() )
        body += ",\"parent\":\"" + a_request.parent_id() + "\"";
    if ( a_request.has_topic() )
        body += ",\"topic\":\"" + escapeJSON( a_request.topic() ) + "\"";
    body += "}";

    dbPost( "col/create", {}, &body, result );

    setCollData( a_reply, result );
}

void
DatabaseAPI::collUpdate( const Auth::CollUpdateRequest & a_request, Auth::CollDataReply & a_reply )
{
    Value result;

    string body = "{\"id\":\"" + a_request.id() + "\"";
    if ( a_request.has_title() )
        body += ",\"title\":\"" + escapeJSON( a_request.title() ) + "\"";
    if ( a_request.has_desc() )
        body += ",\"desc\":\"" + escapeJSON( a_request.desc() ) + "\"";
    if ( a_request.has_alias() )
        body += ",\"alias\":\"" + a_request.alias() + "\"";
    if ( a_request.has_topic() )
        body += ",\"topic\":\"" + escapeJSON( a_request.topic() ) + "\"";
    body += "}";

    dbPost( "col/update", {}, &body, result );

    setCollData( a_reply, result );
}


void
DatabaseAPI::collView( const Auth::CollViewRequest & a_request, Auth::CollDataReply & a_reply )
{
    Value result;

    dbGet( "col/view", {{"id",a_request.id()}}, result );

    setCollData( a_reply, result );
}

void
DatabaseAPI::collRead( const CollReadRequest & a_request, ListingReply & a_reply )
{
    Value result;
    vector<pair<string,string>> params;
    params.push_back({"id",a_request.id()});
    if ( a_request.has_offset() )
        params.push_back({"offset",to_string(a_request.offset())});
    if ( a_request.has_count() )
        params.push_back({"count",to_string(a_request.count())});

    dbGet( "col/read", params, result );

    setListingDataReply( a_reply, result );
}

void
DatabaseAPI::collWrite( const CollWriteRequest & a_request, Auth::ListingReply & a_reply )
{
    string add_list, rem_list;

    if ( a_request.add_size() > 0 )
    {
        add_list = "[";
        for ( int i = 0; i < a_request.add_size(); i++ )
        {
            if ( i > 0 )
                add_list += ",";

            add_list += "\"" + a_request.add(i) + "\"";
        }
        add_list += "]";
    }
    else
        add_list = "[]";

    if ( a_request.rem_size() > 0 )
    {
        rem_list = "[";
        for ( int i = 0; i < a_request.rem_size(); i++ )
        {
            if ( i > 0 )
                rem_list += ",";

            rem_list += "\"" + a_request.rem(i) + "\"";
        }
        rem_list += "]";
    }
    else
        rem_list = "[]";

    Value result;

    dbGet( "col/write", {{"id",a_request.id()},{"add",add_list},{"remove",rem_list}}, result );

    setListingDataReply( a_reply, result );
}

void
DatabaseAPI::collMove( const Auth::CollMoveRequest & a_request, Anon::AckReply & a_reply )
{
    (void) a_reply;

    if ( a_request.item_size() == 0 )
        return;

    string items = "[";

    for ( int i = 0; i < a_request.item_size(); i++ )
    {
        if ( i > 0 )
            items += ",";

        items += "\"" + a_request.item(i) + "\"";
    }
    items += "]";

    Value result;
    dbGet( "col/move", {{"source",a_request.src_id()},{"dest",a_request.dst_id()},{"items",items}}, result );
}

void
DatabaseAPI::collGetParents( const Auth::CollGetParentsRequest & a_request, Auth::CollPathReply & a_reply )
{
    Value result;
    vector<pair<string,string>> params;
    params.push_back({"id",a_request.id()});
    if ( a_request.has_inclusive() )
        params.push_back({"inclusive",a_request.inclusive()?"true":"false"});

    dbGet( "col/get_parents", params, result );

    setCollPathData( a_reply, result );
}

void
DatabaseAPI::collGetOffset( const Auth::CollGetOffsetRequest & a_request, Auth::CollGetOffsetReply & a_reply )
{
    Value result;

    dbGet( "col/get_offset", {{"id",a_request.id()},{"item",a_request.item()},{"page_sz",to_string(a_request.page_sz())}}, result );

    a_reply.set_id( a_request.id() );
    a_reply.set_item( a_request.item() );
    a_reply.set_offset( result["offset"].asNumber() );
}

void
DatabaseAPI::setCollData( CollDataReply & a_reply, libjson::Value & a_result )
{
    CollData* coll;
    Value::ObjectIter j;

    try
    {
        Value::Array & arr = a_result.getArray();

        for ( Value::ArrayIter i = arr.begin(); i != arr.end(); i++ )
        {
            Value::Object & obj = i->getObject();

            coll = a_reply.add_coll();
            coll->set_id( obj.at( "id" ).asString( ));
            coll->set_title( obj.at( "title" ).asString( ));

            if (( j = obj.find( "desc" )) != obj.end( ))
                coll->set_desc( j->second.asString( ));

            if (( j = obj.find( "public" )) != obj.end( ))
                coll->set_ispublic( j->second.asBool( ));

            if (( j = obj.find( "topic" )) != obj.end( ))
                coll->set_topic( j->second.asString( ));

            if (( j = obj.find( "alias" )) != obj.end( ) && !j->second.isNull( ))
                coll->set_alias( j->second.asString( ));

            if (( j = obj.find( "ct" )) != obj.end( ))
                coll->set_ct( j->second.asNumber( ));

            if (( j = obj.find( "ut" )) != obj.end( ))
                coll->set_ut( j->second.asNumber( ));

            if (( j = obj.find( "parent_id" )) != obj.end( ))
                coll->set_parent_id( j->second.asString( ));

            if (( j = obj.find( "owner" )) != obj.end( ))
                coll->set_owner( j->second.asString( ));
        }
    }
    catch(...)
    {
        EXCEPT( ID_INTERNAL_ERROR, "Invalid JSON returned from DB service" );
    }
}

void
DatabaseAPI::setCollPathData( CollPathReply & a_reply, libjson::Value & a_result )
{
    PathData *          path;
    ListingData *       item;
    Value::ArrayIter    j;
    Value::ObjectIter   k;

    try
    {
        Value::Array & arr = a_result.getArray();

        for ( Value::ArrayIter i = arr.begin(); i != arr.end(); i++ )
        {
            Value::Array & arr2 = i->getArray();

            path = a_reply.add_path();

            for ( j = arr2.begin(); j != arr2.end(); j++ )
            {
                Value::Object & obj = j->getObject();

                item = path->add_item();
                item->set_id( obj.at( "id" ).asString( ));
                item->set_title( obj.at( "title" ).asString( ));

                if (( k = obj.find( "alias" )) != obj.end() && !k->second.isNull( ))
                    item->set_alias( k->second.asString() );

                if (( k = obj.find( "owner" )) != obj.end( ))
                    item->set_owner( k->second.asString() );
            }
        }
    }
    catch(...)
    {
        EXCEPT( ID_INTERNAL_ERROR, "Invalid JSON returned from DB service" );
    }
}

void
DatabaseAPI::setListingDataReply( ListingReply & a_reply, libjson::Value & a_result )
{
    Value::ObjectIter   j;

    try
    {
        Value::Array & arr = a_result.getArray();

        for ( Value::ArrayIter i = arr.begin(); i != arr.end(); i++ )
        {
            Value::Object & obj = i->getObject();

            if (( j = obj.find( "paging" )) != obj.end( ))
            {
                Value::Object & obj2 = j->second.getObject();

                a_reply.set_offset( obj2.at( "off" ).asNumber( ));
                a_reply.set_count( obj2.at( "cnt" ).asNumber( ));
                a_reply.set_total( obj2.at( "tot" ).asNumber( ));
            }
            else
            {
                setListingData( a_reply.add_item(), obj );
            }
        }
    }
    catch( exception & e )
    {
        EXCEPT_PARAM( ID_INTERNAL_ERROR, "Invalid JSON returned from DB service. " << e.what( ));
    }
}

void
DatabaseAPI::setListingData( ListingData * a_item, Value::Object & a_obj )
{
    a_item->set_id( a_obj.at( "id" ).asString( ));
    a_item->set_title( a_obj.at( "title" ).asString( ));

    Value::ObjectIter   j;

    if (( j = a_obj.find( "alias" )) != a_obj.end( ) && !j->second.isNull( ))
        a_item->set_alias( j->second.asString( ));

    if (( j = a_obj.find( "owner" )) != a_obj.end( ) && !j->second.isNull( ))
        a_item->set_owner( j->second.asString( ));

    if (( j = a_obj.find( "creator" )) != a_obj.end( ) && !j->second.isNull( ))
        a_item->set_creator( j->second.asString( ));

    if (( j = a_obj.find( "doi" )) != a_obj.end( ) && !j->second.isNull( ))
        a_item->set_doi( j->second.asString( ));

    if (( j = a_obj.find( "url" )) != a_obj.end( ) && !j->second.isNull( ))
        a_item->set_url( j->second.asString( ));

    if (( j = a_obj.find( "size" )) != a_obj.end( ))
        a_item->set_size( j->second.asNumber( ));

    if (( j = a_obj.find( "locked" )) != a_obj.end( ) && !j->second.isNull( ))
        a_item->set_locked( j->second.asBool( ));

    if (( j = a_obj.find( "gen" )) != a_obj.end( ))
        a_item->set_gen( j->second.asNumber( ));

    if (( j = a_obj.find( "deps" )) != a_obj.end( ))
    {
        Value::ObjectIter   m;
        DependencyData *    dep;
        Value::Array &      arr2 = j->second.getArray();

        for ( Value::ArrayIter k = arr2.begin(); k != arr2.end(); k++ )
        {
            Value::Object & obj2 = k->getObject();

            dep = a_item->add_dep();
            dep->set_id( obj2.at( "id" ).asString());
            dep->set_type((DependencyType)(unsigned short) obj2.at( "type" ).asNumber());
            dep->set_dir((DependencyDir)(unsigned short) obj2.at( "dir" ).asNumber());
            if (( m = obj2.find( "alias" )) != obj2.end( ) && !m->second.isNull( ))
                dep->set_alias( m->second.asString() );
        }
    }
}

void
DatabaseAPI::queryList( const Auth::QueryListRequest & a_request, Auth::ListingReply & a_reply )
{
    Value result;
    vector<pair<string,string>> params;
    if ( a_request.has_offset() )
        params.push_back({"offset",to_string(a_request.offset())});
    if ( a_request.has_count() )
        params.push_back({"count",to_string(a_request.count())});

    dbGet( "qry/list", params, result );

    setListingDataReply( a_reply, result );
}

void
DatabaseAPI::queryCreate( const Auth::QueryCreateRequest & a_request, Auth::QueryDataReply & a_reply )
{
    Value result;
    vector<pair<string,string>> params;

    params.push_back({"title",a_request.title()});
    params.push_back({"query",a_request.query()});
    params.push_back({"query_comp",a_request.query_comp()});
    if ( a_request.has_use_owner() )
        params.push_back({"use_owner",a_request.use_owner()?"true":"false"});
    if ( a_request.has_use_sh_usr() )
        params.push_back({"use_sh_usr",a_request.use_sh_usr()?"true":"false"});
    if ( a_request.has_use_sh_prj() )
        params.push_back({"use_sh_prj",a_request.use_sh_prj()?"true":"false"});

    dbGet( "qry/create", params, result );

    setQueryData( a_reply, result );
}

void
DatabaseAPI::queryUpdate( const Auth::QueryUpdateRequest & a_request, Auth::QueryDataReply & a_reply )
{
    Value result;
    vector<pair<string,string>> params;

    params.push_back({"id",a_request.id()});
    if ( a_request.has_title() )
        params.push_back({"title",a_request.title()});
    if ( a_request.has_query() )
        params.push_back({"query",a_request.query()});
    if ( a_request.has_query_comp() )
        params.push_back({"query_comp",a_request.query_comp()});
    if ( a_request.has_use_owner() )
        params.push_back({"use_owner",a_request.use_owner()?"true":"false"});
    if ( a_request.has_use_sh_usr() )
        params.push_back({"use_sh_usr",a_request.use_sh_usr()?"true":"false"});
    if ( a_request.has_use_sh_prj() )
        params.push_back({"use_sh_prj",a_request.use_sh_prj()?"true":"false"});

    dbGet( "qry/update", params, result );

    setQueryData( a_reply, result );
}

void
DatabaseAPI::queryDelete( const std::string & a_id )
{
    Value result;

    dbGet( "qry/delete", {{"id",a_id}}, result );
}

void
DatabaseAPI::queryView( const Auth::QueryViewRequest & a_request, Auth::QueryDataReply & a_reply )
{
    Value result;

    dbGet( "qry/view", {{"id",a_request.id()}}, result );

    setQueryData( a_reply, result );
}

void
DatabaseAPI::queryExec( const Auth::QueryExecRequest & a_request, Auth::ListingReply & a_reply )
{
    Value result;
    vector<pair<string,string>> params;

    params.push_back({"id",a_request.id()});
    if ( a_request.has_offset())
        params.push_back({"offset",to_string(a_request.offset())});
    if ( a_request.has_count() )
        params.push_back({"count",to_string(a_request.count())});

    dbGet( "/qry/exec", params, result );

    setListingDataReply( a_reply, result );
}

void
DatabaseAPI::setQueryData( QueryDataReply & a_reply, libjson::Value & a_result )
{
    QueryData *         qry;
    Value::ObjectIter   j;

    try
    {
        Value::Array & arr = a_result.getArray();

        for ( Value::ArrayIter i = arr.begin(); i != arr.end(); i++ )
        {
            Value::Object & obj = i->getObject();

            qry = a_reply.add_query();
            qry->set_id( obj.at( "id" ).asString() );
            qry->set_title( obj.at( "title" ).asString() );
            qry->set_query( obj.at( "query" ).asString() );

            if (( j = obj.find( "owner" )) != obj.end( ))
                qry->set_owner( j->second.asString( ));

            if (( j = obj.find( "ct" )) != obj.end( ))
                qry->set_ct( j->second.asNumber( ));

            if (( j = obj.find( "ut" )) != obj.end( ))
                qry->set_ut( j->second.asNumber( ));

            if (( j = obj.find( "use_owner" )) != obj.end( ) && !j->second.isNull( ))
                qry->set_use_owner( j->second.asBool( ));

            if (( j = obj.find( "use_sh_usr" )) != obj.end( ) && !j->second.isNull( ))
                qry->set_use_sh_usr( j->second.asBool( ));

            if (( j = obj.find( "use_sh_prj" )) != obj.end( ) && !j->second.isNull( ))
                qry->set_use_sh_prj( j->second.asBool( ));
        }
    }
    catch(...)
    {
        EXCEPT( ID_INTERNAL_ERROR, "Invalid JSON returned from DB service" );
    }
}


void
DatabaseAPI::aclView( const Auth::ACLViewRequest & a_request, Auth::ACLDataReply & a_reply )
{
    libjson::Value result;

    dbGet( "acl/view", {{"id",a_request.id()}}, result );

    setACLData( a_reply, result );
}


void
DatabaseAPI::aclUpdate( const Auth::ACLUpdateRequest & a_request, Auth::ACLDataReply & a_reply )
{
    Value result;
    vector<pair<string,string>> params;
    params.push_back({"id",a_request.id()});
    if ( a_request.has_rules() )
        params.push_back({"rules",a_request.rules()});
    if ( a_request.has_ispublic() )
        params.push_back({"public",a_request.ispublic()?"true":"false"});

    dbGet( "acl/update", params, result );

    setACLData( a_reply, result );
}

void
DatabaseAPI::aclByUser( const Auth::ACLByUserRequest & a_request,  Auth::UserDataReply & a_reply )
{
    (void)a_request;
    Value result;

    dbGet( "acl/by_user", {}, result );

    setUserData( a_reply, result );
}

void
DatabaseAPI::aclByUserList( const Auth::ACLByUserListRequest & a_request,  Auth::ListingReply & a_reply )
{
    Value result;

    dbGet( "acl/by_user/list", {{"owner",a_request.owner()}}, result );

    setListingDataReply( a_reply, result );
}

void
DatabaseAPI::aclByProj( const Auth::ACLByProjRequest & a_request,  Auth::ProjectDataReply & a_reply )
{
    (void)a_request;
    Value result;

    dbGet( "acl/by_proj", {}, result );

    setProjectData( a_reply, result );
}

void
DatabaseAPI::aclByProjList( const Auth::ACLByProjListRequest & a_request,  Auth::ListingReply & a_reply )
{
    Value result;

    dbGet( "acl/by_proj/list", {{"owner",a_request.owner()}}, result );

    setListingDataReply( a_reply, result );
}

void
DatabaseAPI::setACLData( ACLDataReply & a_reply, libjson::Value & a_result )
{
    ACLRule *           rule;
    Value::ObjectIter   j;

    try
    {
        Value::Array & arr = a_result.getArray();

        for ( Value::ArrayIter i = arr.begin(); i != arr.end(); i++ )
        {
            Value::Object & obj = i->getObject();

            rule = a_reply.add_rule();
            rule->set_id( obj.at( "id" ).asString( ));

            if (( j = obj.find( "grant" )) != obj.end( ))
                rule->set_grant( j->second.asNumber( ));

            if (( j = obj.find( "inhgrant" )) != obj.end( ))
                rule->set_inhgrant( j->second.asNumber( ));
        }
    }
    catch(...)
    {
        EXCEPT( ID_INTERNAL_ERROR, "Invalid JSON returned from DB service" );
    }
}


void
DatabaseAPI::groupCreate( const Auth::GroupCreateRequest & a_request, Auth::GroupDataReply & a_reply )
{
    Value result;

    vector<pair<string,string>> params;
    params.push_back({"gid", a_request.group().gid()});
    if ( a_request.group().uid().compare( m_client_uid ) != 0 )
        params.push_back({"proj", a_request.group().uid()});
    if ( a_request.group().has_title() )
        params.push_back({"title", a_request.group().title()});
    if ( a_request.group().has_desc() )
        params.push_back({"desc", a_request.group().desc()});
    if ( a_request.group().member_size() > 0 )
    {
        string members = "[";
        for ( int i = 0; i < a_request.group().member_size(); ++i )
        {
            if ( i > 0 )
                members += ",";
            members += "\"" + a_request.group().member(i) + "\"";
        }
        members += "]";
        params.push_back({"members",  members });
    }

    dbGet( "grp/create", params, result );

    setGroupData( a_reply, result );
}

void
DatabaseAPI::groupUpdate( const Auth::GroupUpdateRequest & a_request, Auth::GroupDataReply & a_reply )
{
    Value result;

    vector<pair<string,string>> params;
    params.push_back({"gid", a_request.gid()});
    if ( a_request.uid().compare( m_client_uid ) != 0 )
        params.push_back({"proj", a_request.uid()});
    if ( a_request.has_title() )
        params.push_back({"title", a_request.title()});
    if ( a_request.has_desc() )
        params.push_back({"desc", a_request.desc()});
    if ( a_request.add_uid_size() > 0 )
    {
        string members = "[";
        for ( int i = 0; i < a_request.add_uid_size(); ++i )
        {
            if ( i > 0 )
                members += ",";
            members += "\"" + a_request.add_uid(i) + "\"";
        }
        members += "]";
        params.push_back({"add",  members });
    }
    if ( a_request.rem_uid_size() > 0 )
    {
        string members = "[";
        for ( int i = 0; i < a_request.rem_uid_size(); ++i )
        {
            if ( i > 0 )
                members += ",";
            members += "\"" + a_request.rem_uid(i) + "\"";
        }
        members += "]";
        params.push_back({"rem",  members });
    }

    dbGet( "grp/update", params, result );

    setGroupData( a_reply, result );
}

void
DatabaseAPI::groupDelete( const Auth::GroupDeleteRequest & a_request, Anon::AckReply & a_reply )
{
    (void) a_reply;
    Value result;

    vector<pair<string,string>> params;
    params.push_back({"gid", a_request.gid()});
    if ( a_request.uid().compare( m_client_uid ) != 0 )
        params.push_back({"proj", a_request.uid()});

    dbGet( "grp/delete", params, result );
}

void
DatabaseAPI::groupList( const Auth::GroupListRequest & a_request, Auth::GroupDataReply & a_reply )
{
    (void) a_request;

    Value result;
    vector<pair<string,string>> params;
    if ( a_request.uid().compare( m_client_uid ) != 0 )
        params.push_back({"proj", a_request.uid()});

    dbGet( "grp/list", params, result );

    setGroupData( a_reply, result );
}

void
DatabaseAPI::groupView( const Auth::GroupViewRequest & a_request, Auth::GroupDataReply & a_reply )
{
    Value result;
    vector<pair<string,string>> params;
    params.push_back({"gid", a_request.gid()});
    if ( a_request.uid().compare( m_client_uid ) != 0 )
        params.push_back({"proj", a_request.uid()});

    dbGet( "grp/view", params, result );

    setGroupData( a_reply, result );
}

void
DatabaseAPI::setGroupData( GroupDataReply & a_reply, libjson::Value & a_result )
{
    GroupData *         group;
    Value::ObjectIter   j;
    Value::ArrayIter    k;

    try
    {
        Value::Array & arr = a_result.getArray();

        for ( Value::ArrayIter i = arr.begin(); i != arr.end(); i++ )
        {
            Value::Object & obj = i->getObject();

            group = a_reply.add_group();
            group->set_gid( obj.at( "gid" ).asString( ));

            if (( j = obj.find( "uid" )) != obj.end() && !j->second.isNull( ))
                group->set_uid( j->second.asString( ));

            if (( j = obj.find( "title" )) != obj.end() && !j->second.isNull( ))
                group->set_title( j->second.asString( ));

            if (( j = obj.find( "desc" )) != obj.end() && !j->second.isNull( ))
                group->set_desc( j->second.asString( ));

            if (( j = obj.find( "members" )) != obj.end( ))
            {
                Value::Array & arr2 = j->second.getArray();

                for ( k = arr2.begin(); k != arr2.end(); k++ )
                {
                    group->add_member( k->asString( ));
                }
            }
        }
    }
    catch(...)
    {
        EXCEPT( ID_INTERNAL_ERROR, "Invalid JSON returned from DB service" );
    }
}

void
DatabaseAPI::repoList( const Auth::RepoListRequest & a_request, Auth::RepoDataReply  & a_reply )
{
    Value result;
    vector<pair<string,string>> params;
    if ( a_request.has_all() )
        params.push_back({"all", a_request.all()?"true":"false"});
    if ( a_request.has_details() )
        params.push_back({"details", a_request.details()?"true":"false"});

    dbGet( "repo/list", params, result );

    setRepoData( &a_reply, 0, result );
}

void
DatabaseAPI::repoList( std::vector<RepoData*> & a_repos )
{
    Value result;

    dbGet( "repo/list", {{"all","true"},{"details","true"}}, result );

    setRepoData( 0, &a_repos, result );
}

void
DatabaseAPI::repoView( const Auth::RepoViewRequest & a_request, Auth::RepoDataReply  & a_reply )
{
    Value result;

    dbGet( "repo/view", {{"id",a_request.id()}}, result );

    setRepoData( &a_reply, 0, result );
}

void
DatabaseAPI::repoCreate( const Auth::RepoCreateRequest & a_request, Auth::RepoDataReply  & a_reply )
{
    Value result;

    string body = "{\"id\":\"" + a_request.id() + "\"";
    body += ",\"title\":\"" + escapeJSON( a_request.title() ) + "\"";
    body += ",\"path\":\"" + escapeJSON( a_request.path() ) + "\"";
    body += ",\"pub_key\":\"" + escapeJSON( a_request.pub_key() ) + "\"";
    body += ",\"address\":\"" + a_request.address() + "\"";
    body += ",\"endpoint\":\"" + a_request.endpoint() + "\"";
    body += ",\"capacity\":\"" + to_string( a_request.capacity() )+ "\"";

    if ( a_request.has_desc() )
        body += ",\"desc\":\"" + escapeJSON( a_request.desc() ) + "\"";
    if ( a_request.has_domain() )
        body += ",\"domain\":\"" + a_request.domain() + "\"";
    if ( a_request.has_exp_path() )
        body += ",\"exp_path\":\"" + escapeJSON( a_request.exp_path() ) + "\"";

    if ( a_request.admin_size() > 0 )
    {
        body+=",\"admins\":[";
        for ( int i = 0; i < a_request.admin_size(); ++i )
        {
            if ( i > 0 )
                body += ",";
            body += "\"" + a_request.admin(i) + "\"";
        }
        body += "]";
    }
    body += "}";

    dbPost( "repo/create", {}, &body, result );

    setRepoData( &a_reply, 0, result );
}

void
DatabaseAPI::repoUpdate( const Auth::RepoUpdateRequest & a_request, Auth::RepoDataReply  & a_reply )
{
    Value result;

    string body = "{\"id\":\"" + a_request.id() + "\"";
    if ( a_request.has_title() )
        body += ",\"title\":\"" + escapeJSON( a_request.title() ) + "\"";
    if ( a_request.has_desc() )
        body += ",\"desc\":\"" + escapeJSON( a_request.desc() ) + "\"";
    if ( a_request.has_path() )
        body += ",\"path\":\"" + escapeJSON( a_request.path() ) + "\"";
    if ( a_request.has_exp_path() )
        body += ",\"exp_path\":\"" + escapeJSON( a_request.exp_path() ) + "\"";
    if ( a_request.has_domain() )
        body += ",\"domain\":\"" + a_request.domain() + "\"";
    if ( a_request.has_pub_key() )
        body += ",\"pub_key\":\"" + escapeJSON( a_request.pub_key() ) + "\"";
    if ( a_request.has_address() )
        body += ",\"address\":\"" + a_request.address() + "\"";
    if ( a_request.has_endpoint() )
        body += ",\"endpoint\":\"" + a_request.endpoint() + "\"";
    if ( a_request.has_capacity() )
        body += ",\"capacity\":\"" + to_string( a_request.capacity() )+ "\"";

    if ( a_request.admin_size() > 0 )
    {
        body+=",\"admins\":[";
        for ( int i = 0; i < a_request.admin_size(); ++i )
        {
            if ( i > 0 )
                body += ",";
            body += "\"" + a_request.admin(i) + "\"";
        }
        body += "]";
    }
    body += "}";

    dbPost( "repo/update", {}, &body, result );

    setRepoData( &a_reply, 0, result );
}

void
DatabaseAPI::repoDelete( const Auth::RepoDeleteRequest & a_request, Anon::AckReply  & a_reply )
{
    (void) a_reply;
    Value result;

    dbGet( "repo/delete", {{"id",a_request.id()}}, result );
}

void
DatabaseAPI::repoCalcSize( const Auth::RepoCalcSizeRequest & a_request, Auth::RepoCalcSizeReply  & a_reply )
{
    Value result;

    string items = "[";
    if ( a_request.item_size() > 0 )
    {
        for ( int i = 0; i < a_request.item_size(); ++i )
        {
            if ( i > 0 )
                items += ",";
            items += "\"" + a_request.item(i) + "\"";
        }
        items += "]";
    }

    dbGet( "repo/calc_size", {{"recurse",a_request.recurse()?"true":"false"},{"items",items}}, result );

    AllocStatsData * stats;

    try
    {
        Value::Array & arr = result.getArray();

        for ( Value::ArrayIter i = arr.begin(); i != arr.end(); i++ )
        {
            stats = a_reply.add_stats();
            setAllocStatsData( *i, *stats );
        }
    }
    catch(...)
    {
        EXCEPT( ID_INTERNAL_ERROR, "Invalid JSON returned from DB service" );
    }
}


void
DatabaseAPI::setRepoData( Auth::RepoDataReply * a_reply, std::vector<RepoData*> * a_repos, libjson::Value & a_result )
{
    if ( !a_reply && !a_repos )
        EXCEPT( ID_INTERNAL_ERROR, "Missing parameters" );

    RepoData *          repo;
    Value::ObjectIter   j;
    Value::ArrayIter    k;

    try
    {
        Value::Array & arr = a_result.getArray();

        for ( Value::ArrayIter i = arr.begin(); i != arr.end(); i++ )
        {
            Value::Object & obj = i->getObject();

            if ( a_reply )
                repo = a_reply->add_repo();
            else
                repo = new RepoData();

            repo->set_id( obj.at( "id" ).asString( ));

            if (( j = obj.find( "title" )) != obj.end( ))
                repo->set_title( j->second.asString( ));

            if (( j = obj.find( "desc" )) != obj.end( ))
                repo->set_desc( j->second.asString( ));

            if (( j = obj.find( "capacity" )) != obj.end( ))
                repo->set_capacity( j->second.asNumber( )); // TODO Needs to be 64 bit integer (string in JSON)

            if (( j = obj.find( "address" )) != obj.end( ))
                repo->set_address( j->second.asString( ));

            if (( j = obj.find( "endpoint" )) != obj.end( ))
                repo->set_endpoint( j->second.asString( ));

            if (( j = obj.find( "pub_key" )) != obj.end( ))
                repo->set_pub_key( j->second.asString( ));

            if (( j = obj.find( "path" )) != obj.end( ))
                repo->set_path( j->second.asString( ));

            if (( j = obj.find( "exp_path" )) != obj.end( ))
                repo->set_exp_path( j->second.asString( ));

            if (( j = obj.find( "domain" )) != obj.end() && !j->second.isNull( ))
                repo->set_domain( j->second.asString( ));

            if (( j = obj.find( "admins" )) != obj.end( ))
            {
                Value::Array & arr2 = j->second.getArray();

                for ( k = arr2.begin(); k != arr2.end(); k++ )
                {
                    repo->add_admin( k->asString( ));
                }
            }

            if ( a_repos )
                a_repos->push_back( repo );
        }
    }
    catch(...)
    {
        EXCEPT( ID_INTERNAL_ERROR, "Invalid JSON returned from DB service" );
    }
}

void
DatabaseAPI::repoListAllocations( const Auth::RepoListAllocationsRequest & a_request, Auth::RepoAllocationsReply  & a_reply )
{
    Value result;

    dbGet( "repo/alloc/list/by_repo", {{"repo",a_request.id()}}, result );

    setAllocData( a_reply, result );
}

void
DatabaseAPI::repoListSubjectAllocations( const Auth::RepoListSubjectAllocationsRequest & a_request, Auth::RepoAllocationsReply  & a_reply )
{
    Value result;
    vector<pair<string,string>> params;
    if ( a_request.has_subject() )
        params.push_back({"owner",a_request.subject()});
    else
        params.push_back({"owner",m_client_uid});
    if ( a_request.has_stats() )
        params.push_back({"stats",a_request.stats()?"true":"false"});

    dbGet( "repo/alloc/list/by_owner", params, result );

    setAllocData( a_reply, result );
}

void
DatabaseAPI::repoListObjectAllocations( const Auth::RepoListObjectAllocationsRequest & a_request, Auth::RepoAllocationsReply  & a_reply )
{
    Value result;

    dbGet( "repo/alloc/list/by_object", {{"object",a_request.id()}}, result );

    setAllocData( a_reply, result );
}


void
DatabaseAPI::setAllocData( Auth::RepoAllocationsReply & a_reply, libjson::Value & a_result )
{
    //Value::ArrayIter    k;

    try
    {
        Value::Array & arr = a_result.getArray();

        for ( Value::ArrayIter i = arr.begin(); i != arr.end(); i++ )
        {
            setAllocData( a_reply.add_alloc(), i->getObject() );
        }
    }
    catch(...)
    {
        EXCEPT( ID_INTERNAL_ERROR, "Invalid JSON returned from DB service" );
    }
}


void
DatabaseAPI::setAllocData( AllocData * a_alloc, libjson::Value::Object & a_obj )
{
    a_alloc->set_repo( a_obj.at( "repo" ).asString( ));
    a_alloc->set_data_limit( a_obj.at( "data_limit" ).asNumber( ));
    a_alloc->set_data_size( a_obj.at( "data_size" ).asNumber( ));
    a_alloc->set_rec_limit( a_obj.at( "rec_limit" ).asNumber( ));
    a_alloc->set_rec_count( a_obj.at( "rec_count" ).asNumber( ));
    a_alloc->set_path( a_obj.at( "path" ).asString( ));

    Value::ObjectIter j;

    if (( j = a_obj.find( "id" )) != a_obj.end( ))
        a_alloc->set_id( j->second.asString( ));

    if (( j = a_obj.find( "stats" )) != a_obj.end( ))
    {
        setAllocStatsData( j->second, *a_alloc->mutable_stats( ));
    }
}

void
DatabaseAPI::repoViewAllocation( const Auth::RepoViewAllocationRequest & a_request, Auth::RepoAllocationsReply & a_reply )
{
    Value result;
    vector<pair<string,string>> params;
    params.push_back({"repo",a_request.repo()});
    if ( a_request.has_subject() )
        params.push_back({"subject",a_request.subject()});

    dbGet( "repo/alloc/view", params, result );

    setAllocData( a_reply, result );
}

void
DatabaseAPI::repoAllocationStats( const Auth::RepoAllocationStatsRequest & a_request, Auth::RepoAllocationStatsReply  & a_reply )
{
    Value result;
    vector<pair<string,string>> params;
    params.push_back({"repo",a_request.repo()});
    if ( a_request.has_subject() )
        params.push_back({"subject",a_request.subject()});

    dbGet( "repo/alloc/stats", params, result );

    setAllocStatsData( a_reply, result );
}

void
DatabaseAPI::setAllocStatsData( Auth::RepoAllocationStatsReply & a_reply, libjson::Value & a_result )
{
    AllocStatsData * stats = a_reply.mutable_alloc();
    setAllocStatsData( a_result, *stats );
}

void
DatabaseAPI::setAllocStatsData( libjson::Value & a_value, AllocStatsData & a_stats )
{
    Value::Object & obj = a_value.getObject();

    a_stats.set_repo( obj.at( "repo" ).asString( ));
    a_stats.set_rec_count( obj.at( "rec_count" ).asNumber( ));
    a_stats.set_file_count( obj.at( "file_count" ).asNumber( ));
    a_stats.set_data_size( obj.at( "data_size" ).asNumber( ));

    Value::ObjectIter i = obj.find( "histogram" );
    if ( i != obj.end( ))
    {
        Value::Array & arr = i->second.getArray();

        for ( Value::ArrayIter j = arr.begin(); j != arr.end(); j++ )
        {
            a_stats.add_histogram( j->asNumber( ));
        }
    }
}

void
DatabaseAPI::repoAllocationSet( const Auth::RepoAllocationSetRequest & a_request, Anon::AckReply  & a_reply )
{
    (void)a_reply;
    Value result;

    dbGet( "repo/alloc/set", {{"repo",a_request.repo()},{"subject",a_request.subject()},{"data_limit",to_string(a_request.data_limit())},{"rec_limit",to_string(a_request.rec_limit())}}, result );
}

void
DatabaseAPI::checkPerms( const CheckPermsRequest & a_request, CheckPermsReply & a_reply )
{
    Value result;
    vector<pair<string,string>> params;
    params.push_back({ "id", a_request.id()});
    if ( a_request.has_perms() )
        params.push_back({ "perms", to_string( a_request.perms()) });

    dbGet( "authz/perm/check", params, result );

    a_reply.set_granted( result["granted"].asBool( ));
}

void
DatabaseAPI::getPerms( const GetPermsRequest & a_request, GetPermsReply & a_reply )
{
    Value result;
    vector<pair<string,string>> params;
    params.push_back({ "id", a_request.id()});
    if ( a_request.has_perms() )
        params.push_back({ "perms", to_string( a_request.perms()) });

    dbGet( "authz/perm/get", params, result );

    a_reply.set_granted( result["granted"].asNumber( ));
}

void
DatabaseAPI::repoAuthz( const Auth::RepoAuthzRequest & a_request, Anon::AckReply  & a_reply )
{
    (void)a_reply;
    Value result;

    dbGet( "authz/gridftp", {{"repo",a_request.repo()},{"file",a_request.file()},{"act",a_request.action()}}, result );
}

void
DatabaseAPI::topicList( const Auth::TopicListRequest & a_request, Auth::ListingReply  & a_reply )
{
    Value result;
    vector<pair<string,string>> params;
    if ( a_request.has_topic_id() )
        params.push_back({ "id", a_request.topic_id() });
    if ( a_request.has_data() )
        params.push_back({ "data", a_request.data()?"true":"false" });
    if ( a_request.has_offset() && a_request.has_count() )
    {
        params.push_back({ "offset", to_string( a_request.offset() )});
        params.push_back({ "count", to_string( a_request.count() )});
    }

    dbGet( "topic/list", params, result );

    setListingDataReply( a_reply, result );
}

/*
string parseTopic( const string & a_topic )
{
    string res = "[";
    string::const_iterator c = a_topic.begin(), p = c;

    for ( ; c != a_topic.end(); ++c )
    {
        // Check for valid chars
        if ( *c == '.' )
        {
            if ( c == p )
                EXCEPT( 1, "Invalid topic" );
            if ( p != a_topic.begin() )
                res.append(",\"");
            else
                res.append("\"");
            res.append( p, c );
            res.append("\"");
            p = c;
            p++;
        }
        else if ( !isalpha( *c ) && !isdigit( *c ) && *c != '-' )
            EXCEPT( 1, "Invalid topic" );
    }

    if ( c == p )
        EXCEPT( 1, "Invalid topic" );

    if ( p != a_topic.begin() )
        res.append(",\"");
    else
        res.append("\"");
    res.append( p, c );
    res.append("\"");

    res.append( "]" );
    std::transform(res.begin(), res.end(), res.begin(), ::tolower);
    DL_INFO("topic:" << res );
    return res;
}*/

void
DatabaseAPI::topicLink( const Auth::TopicLinkRequest & a_request, Anon::AckReply  & a_reply )
{
    (void) a_reply;
    Value result;

    dbGet( "topic/link", {{ "topic", a_request.topic() },{ "id", a_request.id() }}, result );
}

void
DatabaseAPI::topicUnlink( const Auth::TopicUnlinkRequest & a_request, Anon::AckReply  & a_reply )
{
    (void) a_reply;
    Value result;

    dbGet( "topic/unlink", {{ "topic", a_request.topic() },{ "id", a_request.id() }}, result );
}

/*
uint16_t
DatabaseAPI::checkPerms( const string & a_id, uint16_t a_perms )
{
    libjson::Value result;

    dbGet( "authz/check", {{"id",a_id},{"perms",to_string( a_perms )}}, result );

    return result["granted"].GetInt();
}
*/


void
DatabaseAPI::taskLoadReady( libjson::Value & a_result )
{
    dbGet( "task/reload", {}, a_result );
}


void
DatabaseAPI::taskRun( const std::string & a_task_id, libjson::Value & a_task_reply, int * a_step, std::string * a_err_msg )
{
    vector<pair<string,string>> params;
    params.push_back({"task_id",a_task_id});
    if ( a_step )
        params.push_back({ "step", to_string( *a_step )});
    if ( a_err_msg )
        params.push_back({ "err_msg", *a_err_msg });

    dbGet( "task/run", params, a_task_reply );
}


void
DatabaseAPI::taskAbort( const std::string & a_task_id, const std::string & a_msg, libjson::Value & a_task_reply )
{
    libjson::Value doc = a_msg;
    string body = doc.toString();

    dbPost( "task/abort", {{"task_id",a_task_id}}, &body, a_task_reply );
}


void
DatabaseAPI::taskInitDataGet( const Auth::DataGetRequest & a_request, Auth::DataGetPutReply & a_reply, libjson::Value & a_result )
{
    string body = "{\"id\":[";

    for ( int i = 0; i < a_request.id_size(); i++ )
    {
        if ( i > 0 )
            body += ",";

        body += "\"" + a_request.id(i) + "\"";
    }
    body += "]";

    if ( a_request.has_path() )
        body += ",\"path\":\"" + a_request.path() + "\"";

    if ( a_request.has_encrypt() )
        body += ",\"encrypt\":" + to_string( a_request.encrypt() );

    if ( a_request.has_check() && a_request.check() )
        body += ",\"check\":true";

    body += "}";

    dbPost( "dat/get", {}, &body, a_result );

    setDataGetSetReply( a_reply, a_result );
}


void
DatabaseAPI::taskInitDataPut( const Auth::DataPutRequest & a_request, Auth::DataGetPutReply & a_reply, libjson::Value & a_result )
{
    string body = "{\"id\":[\"" + a_request.id() + "\"]";

    if ( a_request.has_path() )
        body += ",\"path\":\"" + a_request.path() + "\"";

    if ( a_request.has_encrypt() )
        body += ",\"encrypt\":" + to_string( a_request.encrypt() );

    if ( a_request.has_check() && a_request.check() )
        body += ",\"check\":true";

    body += "}";

    dbPost( "dat/put", {}, &body, a_result );

    setDataGetSetReply( a_reply, a_result );
}

void
DatabaseAPI::setDataGetSetReply( Auth::DataGetPutReply & a_reply, libjson::Value & a_result )
{
    Value::ObjectIter   t;

    try
    {
        Value::Object &     obj = a_result.getObject();
        Value::ObjectIter   i;
        Value::ArrayIter    j;

        if (( i = obj.find("glob_data")) != obj.end() && i->second.size( ))
        {
            Value::Array & arr = i->second.getArray();

            for ( j = arr.begin(); j != arr.end(); j++ )
                setListingData( a_reply.add_item(), j->getObject() );
        }

        if (( i = obj.find("http_data")) != obj.end() && i->second.size( ))
        {
            Value::Array & arr = i->second.getArray();

            for ( j = arr.begin(); j != arr.end(); j++ )
                setListingData( a_reply.add_item(), j->getObject() );
        }

        if (( i = obj.find( "task" )) != obj.end( ))
        {
            setTaskData( a_reply.mutable_task(), i->second );
        }
    }
    catch ( exception & e )
    {
        DL_ERROR("JSON: " << a_result.toString());
        EXCEPT_PARAM( ID_INTERNAL_ERROR, "Invalid JSON returned from DB service: " << e.what( ));
    }
}

void
DatabaseAPI::taskInitRecordCollectionDelete( const std::vector<std::string> & a_ids, TaskDataReply & a_reply, libjson::Value & a_result )
{
    string body = "{\"ids\":[";

    for ( vector<string>::const_iterator i = a_ids.begin(); i != a_ids.end(); i++ )
    {
        if ( i != a_ids.begin() )
            body += ",";

        body += "\"" + *i + "\"";
    }
    body += "]}";

    dbPost( "dat/delete", {}, &body, a_result );

    setTaskDataReply( a_reply, a_result );
}


void
DatabaseAPI::taskInitRecordAllocChange( const Auth::RecordAllocChangeRequest & a_request, Auth::RecordAllocChangeReply & a_reply, libjson::Value & a_result )
{
    string body = "{\"ids\":[";

    for ( int i = 0; i < a_request.id_size(); i++ )
    {
        if ( i > 0 )
            body += ",";

        body += "\"" + a_request.id( i ) + "\"";
    }
    body += "],\"repo_id\":\"" + a_request.repo_id() + "\"";
    if ( a_request.has_proj_id() )
        body += string(",\"proj_id\":\"") + a_request.proj_id() + "\"";
    if ( a_request.has_check() )
        body += string(",\"check\":\"") + (a_request.check()?"true":"false") + "\"";
    body += "}";

    dbPost( "dat/alloc_chg", {}, &body, a_result );

    Value::Object & obj = a_result.getObject();
    a_reply.set_act_cnt( obj["act_cnt"].asNumber() );
    a_reply.set_act_size( obj["act_size"].asNumber() );
    a_reply.set_tot_cnt( obj["tot_cnt"].asNumber() );
    a_reply.set_data_limit( obj["data_limit"].asNumber() );
    a_reply.set_data_size( obj["data_size"].asNumber() );
    a_reply.set_rec_limit( obj["rec_limit"].asNumber() );
    a_reply.set_rec_count( obj["rec_count"].asNumber() );

    Value::ObjectIter t = obj.find( "task" );

    if ( t != obj.end( ))
    {
        TaskData * task = a_reply.mutable_task();
        setTaskData( task, t->second );
    }
}


void
DatabaseAPI::taskInitRecordOwnerChange( const Auth::RecordOwnerChangeRequest & a_request, Auth::RecordOwnerChangeReply & a_reply, libjson::Value & a_result )
{
    string body = "{\"ids\":[";

    for ( int i = 0; i < a_request.id_size(); i++ )
    {
        if ( i > 0 )
            body += ",";

        body += "\"" + a_request.id( i ) + "\"";
    }
    body += "],\"coll_id\":\"" + a_request.coll_id() + "\"";
    if ( a_request.has_repo_id() )
        body += ",\"repo_id\":\"" + a_request.repo_id() + "\"";
    if ( a_request.has_proj_id() )
        body += string(",\"proj_id\":\"") + a_request.proj_id() + "\"";
    if ( a_request.has_check() )
        body += string(",\"check\":\"") + (a_request.check()?"true":"false") + "\"";
    body += "}";

    dbPost( "dat/owner_chg", {}, &body, a_result );

    Value::Object & obj = a_result.getObject();
    a_reply.set_act_cnt( obj["act_cnt"].asNumber() );
    a_reply.set_act_size( obj["act_size"].asNumber() );
    a_reply.set_tot_cnt( obj["tot_cnt"].asNumber() );

    Value::ObjectIter allocs = a_result.find("allocs");
    if ( allocs != a_result.end() )
    {
        Value::Array & alloc_arr = allocs->second.getArray();
        for ( Value::ArrayIter a = alloc_arr.begin(); a != alloc_arr.end(); a++ )
        {
            setAllocData( a_reply.add_alloc(), a->getObject() );
        }
    }

    Value::ObjectIter t = obj.find( "task" );

    if ( t != obj.end( ))
    {
        //Value::Object & obj2 = t->second.getObject();

        TaskData * task = a_reply.mutable_task();
        setTaskData( task, t->second );
    }
}


void
DatabaseAPI::taskInitProjectDelete( const Auth::ProjectDeleteRequest & a_request, Auth::TaskDataReply & a_reply, libjson::Value & a_result )
{
    string body = "{\"ids\":[";

    for ( int i = 0; i < a_request.id_size(); i++ )
    {
        if ( i > 0 )
            body += ",";

        body += "\"" + a_request.id(i) + "\"";
    }
    body += "]}";

    dbPost( "prj/delete", {}, &body, a_result );

    setTaskDataReply( a_reply, a_result );
}


void
DatabaseAPI::taskInitRepoAllocationCreate( const Auth::RepoAllocationCreateRequest & a_request, Auth::TaskDataReply & a_reply, libjson::Value & a_result )
{
    dbGet( "repo/alloc/create", {{"subject",a_request.subject()},{"repo",a_request.repo()},
        {"data_limit",to_string(a_request.data_limit())},{"rec_limit",to_string(a_request.rec_limit())}}, a_result );

    setTaskDataReply( a_reply, a_result );
}


void
DatabaseAPI::taskInitRepoAllocationDelete( const Auth::RepoAllocationDeleteRequest & a_request, Auth::TaskDataReply & a_reply, libjson::Value & a_result )
{
    dbGet( "repo/alloc/delete", {{"subject",a_request.subject()},{"repo",a_request.repo()}}, a_result );

    setTaskDataReply( a_reply, a_result );
}


void
DatabaseAPI::setTaskData( TaskData * a_task, libjson::Value & a_task_json )
{
    try
    {
        Value::Object & obj = a_task_json.getObject();

        a_task->set_id( obj.at( "_id" ).asString( ));
        a_task->set_type((TaskType)obj.at( "type" ).asNumber( ));
        a_task->set_status((TaskStatus) obj.at( "status" ).asNumber() );
        a_task->set_client( obj.at( "client" ).asString( ));
        int step = obj.at( "step" ).asNumber( );
        a_task->set_step( step < 0?-step:step);
        a_task->set_steps( obj.at( "steps" ).asNumber( ));
        a_task->set_msg( obj.at( "msg" ).asString( ));
        a_task->set_ct( obj.at( "ct" ).asNumber( ));
        a_task->set_ut( obj.at( "ut" ).asNumber( ));
    }
    catch( exception & e )
    {
        DL_DEBUG("taskData:" << a_task_json.toString());
        EXCEPT_PARAM( 1, "setTaskData - " << e.what() );
    }
}


/**
 * @brief Sets TaskDataReply from JSON returned by a taskInit... call
 * @param a_reply 
 * @param a_result 
 *
 * JSON contains an object with a "task" field containing task fields. This
 * method removes tasks that are nor in READY status from the original JSON
 * input - this is to.
 */
void
DatabaseAPI::setTaskDataReply( Auth::TaskDataReply & a_reply, libjson::Value & a_result )
{
    Value::ObjectIter   t;

    try
    {
        Value::Object & obj = a_result.getObject();

        t = obj.find( "task" );
        if ( t != obj.end( ))
        {
            TaskData * task = a_reply.add_task();
            setTaskData( task, t->second );
        }
    }
    catch ( exception & e )
    {
        DL_ERROR("JSON: " << a_result.toString());
        EXCEPT_PARAM( ID_INTERNAL_ERROR, "Invalid JSON returned from DB service: " << e.what( ));
    }
}



/**
 * @brief Sets TaskDataReply from JSON returned by a task management call
 * @param a_reply 
 * @param a_result 
 *
 * JSON contains an array of task objects containing task fields.
 */
void
DatabaseAPI::setTaskDataReplyArray( Auth::TaskDataReply & a_reply, libjson::Value & a_result )
{
    Value::ObjectIter   t;

    //cerr << "TASK RES: " << a_result.toString() << endl;

    try
    {
        Value::Array & arr = a_result.getArray();
        for ( Value::ArrayIter i = arr.begin(); i != arr.end(); i++ )
        {
            TaskData * task = a_reply.add_task();
            setTaskData( task, *i );
        }
    }
    catch ( exception & e )
    {
        DL_ERROR("JSON: " << a_result.toString());
        EXCEPT_PARAM( ID_INTERNAL_ERROR, "Invalid JSON returned from DB service: " << e.what( ));
    }
}


void
DatabaseAPI::taskStart( const std::string & a_task_id, libjson::Value & a_result )
{
    dbGet( "task/start", {{"task_id",a_task_id}}, a_result );
}


void
DatabaseAPI::taskUpdate( const std::string & a_id, TaskStatus * a_status, const std::string * a_message, double * a_progress, libjson::Value * a_state )
{
    if ( !a_status && !a_progress && !a_state )
        return;

    string body = "{";
    string delim = "";

    if ( a_status )
    {
        body += "\"status\":" + to_string(*a_status);
        delim = ",";
    }

    if ( a_message )
    {
        body += delim + "\"message\":\"" + *a_message + "\"";
        if ( !delim.size( ))
            delim = ",";
    }

    if ( a_progress )
    {
        body += delim + "\"progress\":" + to_string(*a_progress);
        if ( !delim.size( ))
            delim = ",";
    }

    if ( a_state )
    {
        body += delim + "\"state\":" + a_state->toString();
    }

    body += "}";

    Value result;
    dbPost( "task/update", {{"task_id",a_id}}, &body, result );
}


void
DatabaseAPI::taskFinalize( const std::string & a_task_id, bool a_succeeded, const std::string & a_msg, libjson::Value & a_result )
{
    vector<pair<string,string>> params;
    params.push_back({ "task_id", a_task_id });
    params.push_back({ "succeeded", ( a_succeeded?"true":"false" )});
    if ( a_msg.size( ))
        params.push_back({ "message", a_msg });

    dbPost( "task/finalize", params, 0, a_result );
}


void
DatabaseAPI::taskList( const Auth::TaskListRequest & a_request, Auth::TaskDataReply & a_reply )
{
    vector<pair<string,string>> params;

    if ( a_request.has_proj_id( ))
        params.push_back({ "proj_id", a_request.proj_id() });
    if ( a_request.has_since( ))
        params.push_back({ "since", to_string( a_request.since() )});
    if ( a_request.has_from( ))
        params.push_back({ "from", to_string( a_request.from() )});
    if ( a_request.has_to( ))
        params.push_back({ "to", to_string( a_request.to() )});
    if ( a_request.has_offset( ))
        params.push_back({ "offset", to_string( a_request.offset() )});
    if ( a_request.has_count( ))
        params.push_back({ "count", to_string( a_request.count() )});
    if ( a_request.status_size() > 0 )
    {
        string stat = "[";
        for ( int i = 0; i < a_request.status_size(); ++i )
        {
            if ( i > 0 )
                stat += ",";
            stat += to_string(a_request.status(i));
        }
        stat += "]";
        params.push_back({ "status",stat});
    }

    libjson::Value result;

    dbGet( "task/list", params, result );

    setTaskDataReplyArray( a_reply, result );
}

void
DatabaseAPI::taskView( const Auth::TaskViewRequest & a_request, Auth::TaskDataReply & a_reply )
{
    libjson::Value result;

    dbGet( "task/view", {{"task_id",a_request.task_id()}}, result );

    setTaskDataReplyArray( a_reply, result );
}


}}
