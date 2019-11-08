#include <cctype>
#include <algorithm>
#include <zmq.h>
#include <unistd.h>
#include "Util.hpp"
#include "DynaLog.hpp"
#include "TraceException.hpp"
#include "CoreDatabaseClient.hpp"

using namespace std;

namespace SDMS {
namespace Core {

using namespace SDMS::Auth;

DatabaseClient::DatabaseClient( const std::string & a_db_url, const std::string & a_db_user, const std::string & a_db_pass ) :
    m_client(0), m_db_url(a_db_url), m_db_user(a_db_user), m_db_pass(a_db_pass)
{
    m_curl = curl_easy_init();
    if ( !m_curl )
        EXCEPT( ID_INTERNAL_ERROR, "libcurl init failed" );

    setClient("");

    curl_easy_setopt( m_curl, CURLOPT_HTTP_VERSION, CURL_HTTP_VERSION_1_1 );
    curl_easy_setopt( m_curl, CURLOPT_USERNAME, m_db_user.c_str() );
    curl_easy_setopt( m_curl, CURLOPT_PASSWORD, m_db_pass.c_str() );
    curl_easy_setopt( m_curl, CURLOPT_WRITEFUNCTION, curlResponseWriteCB );
    curl_easy_setopt( m_curl, CURLOPT_SSL_VERIFYPEER, 0 );
    curl_easy_setopt( m_curl, CURLOPT_TCP_NODELAY, 1 );
}

DatabaseClient::~DatabaseClient()
{
    if ( m_client )
        curl_free( m_client );

    curl_easy_cleanup( m_curl );
}

void
DatabaseClient::setClient( const std::string & a_client )
{
    m_client_uid = a_client.size()?(string("u/") + a_client):"";
    m_client = curl_easy_escape( m_curl, a_client.c_str(), 0 );
}

long
DatabaseClient::dbGet( const char * a_url_path, const vector<pair<string,string>> &a_params, rapidjson::Document & a_result, bool a_log )
{
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
            if ( a_log )
            {
                DL_DEBUG( "About to parse[" << res_json << "]" );
            }
            a_result.Parse( res_json.c_str() );
        }

        if ( http_code >= 200 && http_code < 300 )
        {
            if ( a_result.HasParseError() )
            {
                DL_INFO( "HAS PARSE ERROR" );

                rapidjson::ParseErrorCode ec = a_result.GetParseError();
                EXCEPT_PARAM( ID_INTERNAL_ERROR, "Invalid JSON returned from DB service: " << rapidjson::GetParseError_En( ec ));
            }

            return http_code;
        }
        else
        {
            if ( res_json.size() && !a_result.HasParseError() && a_result.HasMember( "errorMessage" ))
            {
                EXCEPT_PARAM( ID_BAD_REQUEST, a_result["errorMessage"].GetString() );
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
DatabaseClient::dbGetRaw( const char * a_url_path, const vector<pair<string,string>> &a_params, string & a_result )
{
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
DatabaseClient::dbPost( const char * a_url_path, const vector<pair<string,string>> &a_params, const string * a_body, rapidjson::Document & a_result )
{
    DL_DEBUG( "dbPost " << a_url_path << " [" << *a_body << "]" );

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
            DL_TRACE( "About to parse[" << res_json << "]" );
            a_result.Parse( res_json.c_str() );
        }

        if ( http_code >= 200 && http_code < 300 )
        {
            if ( a_result.HasParseError() )
            {
                rapidjson::ParseErrorCode ec = a_result.GetParseError();
                EXCEPT_PARAM( ID_INTERNAL_ERROR, "Invalid JSON returned from DB service: " << rapidjson::GetParseError_En( ec ));
            }

            return http_code;
        }
        else
        {
            if ( res_json.size() && !a_result.HasParseError() && a_result.HasMember( "errorMessage" ))
            {
                EXCEPT_PARAM( ID_BAD_REQUEST, a_result["errorMessage"].GetString() );
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
DatabaseClient::clientAuthenticateByPassword( const std::string & a_password, Anon::AuthStatusReply & a_reply )
{
    rapidjson::Document result;

    dbGet( "usr/authn/password", {{"pw",a_password}}, result );
    setAuthStatus( a_reply, result );
}

void
DatabaseClient::clientAuthenticateByToken( const std::string & a_token, Anon::AuthStatusReply & a_reply )
{
    rapidjson::Document result;

    dbGet( "usr/authn/token", {{"token",a_token}}, result );
    setAuthStatus( a_reply, result );
}

void
DatabaseClient::setAuthStatus( Anon::AuthStatusReply & a_reply, rapidjson::Document & a_result )
{
    a_reply.set_uid( a_result["uid"].GetString() );
    a_reply.set_auth( a_result["authorized"].GetInt() == 1 );
}

void
DatabaseClient::clientLinkIdentity( const std::string & a_identity )
{
    rapidjson::Document result;

    dbGet( "usr/ident/add", {{"ident",a_identity}}, result );
}

std::string
DatabaseClient::getDataStorageLocation( const std::string & a_data_id )
{
    rapidjson::Document result;

    // TODO This need to be done correctly without assuming storage location
    dbGet( "dat/view", {{"id",a_data_id}}, result );

    // TODO Not sure if this check is needed
    if ( result.Size() != 1 )
        EXCEPT_PARAM( ID_BAD_REQUEST, "No such data record: " << a_data_id );

    rapidjson::Value & val = result[0];

    string id = val["id"].GetString();

    return string("/data/") + id.substr(2);
}


bool
DatabaseClient::uidByPubKey( const std::string & a_pub_key, std::string & a_uid )
{
    return dbGetRaw( "usr/find/by_pub_key", {{"pub_key",a_pub_key}}, a_uid );
}

bool
DatabaseClient::userGetKeys( std::string & a_pub_key, std::string & a_priv_key )
{
    rapidjson::Document result;

    dbGet( "usr/keys/get", {}, result );

    rapidjson::Value & val = result[0];

    rapidjson::Value::MemberIterator imem = val.FindMember("pub_key");
    if ( imem == val.MemberEnd() )
        return false;
    a_pub_key = imem->value.GetString();

    imem = val.FindMember("priv_key");
    if ( imem == val.MemberEnd() )
        return false;
    a_priv_key = imem->value.GetString();

    return true;
}

void
DatabaseClient::userSetKeys( const std::string & a_pub_key, const std::string & a_priv_key )
{
    rapidjson::Document result;

    dbGet( "usr/keys/set", {{"pub_key",a_pub_key},{"priv_key",a_priv_key}}, result );
}

void
DatabaseClient::userClearKeys()
{
    rapidjson::Document result;

    dbGet( "usr/keys/clear", {}, result );
}

void
DatabaseClient::userSetTokens( const std::string & a_acc_tok, const std::string & a_ref_tok )
{
    string result;
    dbGetRaw( "usr/token/set", {{"access",a_acc_tok},{"refresh",a_ref_tok}}, result );
}

bool
DatabaseClient::userGetTokens( std::string & a_acc_tok, std::string & a_ref_tok )
{
    rapidjson::Document result;

    dbGet( "usr/token/get", {}, result );

    rapidjson::Value & val = result[0];

    rapidjson::Value::MemberIterator imem = val.FindMember("access");
    if ( imem == val.MemberEnd() )
        return false;
    a_acc_tok = imem->value.GetString();

    imem = val.FindMember("refresh");
    if ( imem == val.MemberEnd() )
        return false;
    a_ref_tok = imem->value.GetString();

    return true;
}

bool
DatabaseClient::userGetAccessToken( std::string & a_acc_tok )
{
    return dbGetRaw( "usr/token/get/access", {}, a_acc_tok );
}

void
DatabaseClient::userSaveTokens( const Auth::UserSaveTokensRequest & a_request, Anon::AckReply & a_reply )
{
    (void)a_reply;
    userSetTokens( a_request.access(), a_request.refresh() );
}

void
DatabaseClient::purgeTransferRecords( size_t age )
{
    string result;
    dbGetRaw( "xfr/purge", {{"age",to_string(age)}}, result );
}

void
DatabaseClient::userCreate( const Auth::UserCreateRequest & a_request, Auth::UserDataReply & a_reply )
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

    rapidjson::Document result;
    dbGet( "usr/create", params, result );

    setUserData( a_reply, result );
}


void
DatabaseClient::userView( const UserViewRequest & a_request, UserDataReply & a_reply )
{
    cout << "UserViewRequest" << endl;

    vector<pair<string,string>> params;
    params.push_back({"subject",a_request.uid()});
    if ( a_request.has_details() && a_request.details() )
        params.push_back({"details","true"});

    rapidjson::Document result;
    dbGet( "usr/view", params, result );

    setUserData( a_reply, result );
}


void
DatabaseClient::userUpdate( const UserUpdateRequest & a_request, UserDataReply & a_reply )
{
    rapidjson::Document result;

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
DatabaseClient::userListAll( const UserListAllRequest & a_request, UserDataReply & a_reply )
{
    vector<pair<string,string>> params;
    if ( a_request.has_offset() && a_request.has_count() )
    {
        params.push_back({"offset",to_string(a_request.offset())});
        params.push_back({"count",to_string(a_request.count())});
    }

    rapidjson::Document result;
    dbGet( "usr/list/all", params, result );

    setUserData( a_reply, result );
}

void
DatabaseClient::userListCollab( const UserListCollabRequest & a_request, UserDataReply & a_reply )
{
    (void)a_request;
    rapidjson::Document result;
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
DatabaseClient::userFindByUUIDs( const Auth::UserFindByUUIDsRequest & a_request, Auth::UserDataReply & a_reply )
{
    string uuids = "[";

    for ( int i = 0; i < a_request.uuid_size(); i++ )
    {
        if ( i )
            uuids += ",";
        uuids += "\"" + a_request.uuid(i) + "\"";
    }

    uuids += "]";

    rapidjson::Document result;
    dbGet( "usr/find/by_uuids", {{"uuids",uuids}}, result );

    setUserData( a_reply, result );
}

void
DatabaseClient::userGetRecentEP( const Auth::UserGetRecentEPRequest & a_request, Auth::UserGetRecentEPReply & a_reply )
{
    (void)a_request;
    rapidjson::Document result;

    dbGet( "usr/ep/get", {}, result );

    for ( rapidjson::SizeType i = 0; i < result.Size(); i++ )
    {
        a_reply.add_ep( result[i].GetString() );
    }
}

void
DatabaseClient::userSetRecentEP( const Auth::UserSetRecentEPRequest & a_request, Anon::AckReply & a_reply )
{
    (void) a_reply;
    rapidjson::Document result;

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
DatabaseClient::setUserData( UserDataReply & a_reply, rapidjson::Document & a_result )
{
    if ( !a_result.IsArray() )
    {
        EXCEPT( ID_INTERNAL_ERROR, "Invalid JSON returned from DB service" );
    }

    UserData* user;
    AllocData* alloc;
    rapidjson::Value::MemberIterator imem;

    for ( rapidjson::SizeType i = 0; i < a_result.Size(); i++ )
    {
        rapidjson::Value & val = a_result[i];

        if (( imem = val.FindMember("paging")) != val.MemberEnd())
        {
            a_reply.set_offset( imem->value["off"].GetUint() );
            a_reply.set_count( imem->value["cnt"].GetUint() );
            a_reply.set_total( imem->value["tot"].GetUint() );
        }
        else
        {
            user = a_reply.add_user();
            user->set_uid( val["uid"].GetString() );
            user->set_name( val["name"].GetString() );

            if (( imem = val.FindMember("email")) != val.MemberEnd() )
                user->set_email( imem->value.GetString() );

            if (( imem = val.FindMember("options")) != val.MemberEnd() )
                user->set_options( imem->value.GetString() );

            if (( imem = val.FindMember("is_admin")) != val.MemberEnd() )
                user->set_is_admin( imem->value.GetBool() );

            if (( imem = val.FindMember("is_repo_admin")) != val.MemberEnd() )
                user->set_is_repo_admin( imem->value.GetBool() );

            if (( imem = val.FindMember("idents")) != val.MemberEnd() )
            {
                for ( rapidjson::SizeType j = 0; j < imem->value.Size(); j++ )
                    user->add_ident( imem->value[j].GetString() );
            }

            if (( imem = val.FindMember("allocs")) != val.MemberEnd() )
            {
                for ( rapidjson::SizeType j = 0; j < imem->value.Size(); j++ )
                {
                    rapidjson::Value & alloc_val = imem->value[j];
                    alloc = user->add_alloc();
                    alloc->set_repo(alloc_val["repo"].GetString());
                    alloc->set_max_size(alloc_val["max_size"].GetUint64());
                    alloc->set_tot_size(alloc_val["tot_size"].GetUint64());
                    alloc->set_max_count(alloc_val["max_count"].GetUint());
                    alloc->set_path(alloc_val["path"].GetString());
                }
            }
        }
    }
}

void
DatabaseClient::projCreate( const Auth::ProjectCreateRequest & a_request, Auth::ProjectDataReply & a_reply )
{
    rapidjson::Document result;
    vector<pair<string,string>> params;

    params.push_back({"id",a_request.id()});
    params.push_back({"title",a_request.title()});

    if ( a_request.has_desc() )
        params.push_back({"desc",a_request.desc()});

    if ( a_request.has_sub_repo() )
        params.push_back({"sub_repo",a_request.sub_repo()});

    if ( a_request.has_sub_alloc() )
        params.push_back({"sub_alloc",to_string(a_request.sub_alloc())});

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
DatabaseClient::projUpdate( const Auth::ProjectUpdateRequest & a_request, Auth::ProjectDataReply & a_reply )
{
    rapidjson::Document result;
    vector<pair<string,string>> params;

    params.push_back({"id",a_request.id()});

    if ( a_request.has_title() )
        params.push_back({"title",a_request.title()});

    if ( a_request.has_desc() )
        params.push_back({"desc",a_request.desc()});

    if ( a_request.has_sub_repo() )
        params.push_back({"sub_repo",a_request.sub_repo()});

    if ( a_request.has_sub_alloc() )
        params.push_back({"sub_alloc",to_string(a_request.sub_alloc())});

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
DatabaseClient::projDelete( const std::string & a_id, std::vector<RepoRecordDataLocations> & a_locs, bool & a_suballoc )
{
    rapidjson::Document result;

    dbGet( "prj/delete", {{"id",a_id}}, result );

    if ( !result.IsObject() )
        EXCEPT( ID_INTERNAL_ERROR, "Invalid JSON returned from DB service" );

    rapidjson::Value::MemberIterator imem;

    if (( imem = result.FindMember("suballoc")) != result.MemberEnd() )
        a_suballoc = imem->value.GetBool();
    else
        a_suballoc = false;

    if (( imem = result.FindMember("locs")) != result.MemberEnd() )
        setRepoRecordDataLocations( a_locs, imem->value );
}

void
DatabaseClient::projView( const Auth::ProjectViewRequest & a_request, Auth::ProjectDataReply & a_reply )
{
    rapidjson::Document result;
    dbGet( "prj/view", {{"id",a_request.id()}}, result );

    setProjectData( a_reply, result );
}

void
DatabaseClient::projList( const Auth::ProjectListRequest & a_request, Auth::ListingReply & a_reply )
{
    rapidjson::Document result;
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

    setListingData( a_reply, result );
}

void
DatabaseClient::projSearch( const std::string & a_query, Auth::ProjectDataReply & a_reply )
{
    rapidjson::Document result;

    dbGet( "prj/search", {{"query",a_query}}, result );

    setProjectData( a_reply, result );
}

void
DatabaseClient::setProjectData( ProjectDataReply & a_reply, rapidjson::Document & a_result )
{
    if ( !a_result.IsArray() )
        EXCEPT( ID_INTERNAL_ERROR, "Invalid JSON returned from DB service" );

    ProjectData* proj;
    AllocData* alloc;
    rapidjson::Value::MemberIterator imem;

    for ( rapidjson::SizeType i = 0; i < a_result.Size(); i++ )
    {
        rapidjson::Value & val = a_result[i];

        proj = a_reply.add_proj();
        proj->set_id( val["id"].GetString() );
        proj->set_title( val["title"].GetString() );

        if (( imem = val.FindMember("desc")) != val.MemberEnd() )
            proj->set_desc( imem->value.GetString() );

        if (( imem = val.FindMember("sub_repo")) != val.MemberEnd() )
            proj->set_sub_repo( imem->value.GetString() );

        if (( imem = val.FindMember("sub_alloc")) != val.MemberEnd() )
            proj->set_sub_alloc( imem->value.GetUint64() );

        if (( imem = val.FindMember("sub_usage")) != val.MemberEnd() )
            proj->set_sub_usage( imem->value.GetUint64() );

        if (( imem = val.FindMember("owner")) != val.MemberEnd() )
            proj->set_owner( imem->value.GetString() );

        if (( imem = val.FindMember("ct")) != val.MemberEnd() )
            proj->set_ct( imem->value.GetUint() );

        if (( imem = val.FindMember("ut")) != val.MemberEnd() )
            proj->set_ut( imem->value.GetUint() );

        if (( imem = val.FindMember("admins")) != val.MemberEnd() )
        {
            for ( rapidjson::SizeType j = 0; j < imem->value.Size(); j++ )
                proj->add_admin( imem->value[j].GetString() );
        }

        if (( imem = val.FindMember("members")) != val.MemberEnd() )
        {
            for ( rapidjson::SizeType j = 0; j < imem->value.Size(); j++ )
                proj->add_member( imem->value[j].GetString() );
        }

        if (( imem = val.FindMember("allocs")) != val.MemberEnd() )
        {
            for ( rapidjson::SizeType j = 0; j < imem->value.Size(); j++ )
            {
                rapidjson::Value & alloc_val = imem->value[j];

                alloc = proj->add_alloc();
                alloc->set_repo(alloc_val["repo"].GetString());
                alloc->set_max_size(alloc_val["max_size"].GetUint64());
                alloc->set_tot_size(alloc_val["tot_size"].GetUint64());
                alloc->set_max_count(alloc_val["max_count"].GetUint());
                alloc->set_path(alloc_val["path"].GetString());
            }
        }
    }
}

void
DatabaseClient::recordSearch( const RecordSearchRequest & a_request, ListingReply & a_reply )
{
    rapidjson::Document result;
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

    setListingData( a_reply, result );
}

void
DatabaseClient::recordListByAlloc( const Auth::RecordListByAllocRequest & a_request, Auth::ListingReply & a_reply )
{
    rapidjson::Document result;
    vector<pair<string,string>> params;
    params.push_back({"repo",a_request.repo()});
    params.push_back({"subject",a_request.subject()});
    if ( a_request.has_offset() )
        params.push_back({"offset",to_string(a_request.offset())});
    if ( a_request.has_count() )
        params.push_back({"count",to_string(a_request.count())});

    dbGet( "/dat/list/by_alloc", params, result );

    setListingData( a_reply, result );
}

void
DatabaseClient::recordView( const RecordViewRequest & a_request, RecordDataReply & a_reply )
{
    rapidjson::Document result;

    dbGet( "dat/view", {{"id",a_request.id()}}, result );

    setRecordData( a_reply, result );
}

void
DatabaseClient::recordCreate( const Auth::RecordCreateRequest & a_request, Auth::RecordDataReply & a_reply )
{
    rapidjson::Document result;

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
DatabaseClient::recordCreateBatch( const Auth::RecordCreateBatchRequest & a_request, Auth::RecordDataReply & a_reply )
{
    rapidjson::Document result;

    dbPost( "dat/create/batch", {}, &a_request.records(), result );

    setRecordData( a_reply, result );
}

void
DatabaseClient::recordUpdate( const Auth::RecordUpdateRequest & a_request, Auth::RecordDataReply & a_reply, std::vector<RepoRecordDataLocations> & a_locs )
{
    rapidjson::Document result;

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

    setRecordData( a_reply, result, &a_locs );
}

void
DatabaseClient::recordUpdateBatch( const Auth::RecordUpdateBatchRequest & a_request, Auth::RecordDataReply & a_reply, std::vector<RepoRecordDataLocations> & a_locs )
{
    rapidjson::Document result;

    dbPost( "dat/update/batch", {}, &a_request.records(), result );

    setRecordData( a_reply, result, &a_locs );
}

void
//DatabaseClient::recordDelete( const std::string & a_id, RepoRecordDataLocations & a_loc )
DatabaseClient::recordDelete( const std::vector<std::string> & a_ids, std::vector<RepoRecordDataLocations> & a_locs )
{
    rapidjson::Document result;
    string ids = "[";

    for ( vector<string>::const_iterator i = a_ids.begin(); i != a_ids.end(); i++ )
    {
        if ( i != a_ids.begin() )
            ids += ",";

        ids += "\"" + *i + "\"";
    }
    ids += "]";

    dbGet( "dat/delete", {{"ids",ids}}, result );

    setRepoRecordDataLocations( a_locs, result );
}

void
DatabaseClient::recordLock( const Auth::RecordLockRequest & a_request, Auth::ListingReply & a_reply )
{
    rapidjson::Document result;
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

    setListingData( a_reply, result );
}

void
//DatabaseClient::recordGetDataLocation( const std::string & a_id, RepoRecordDataLocations & a_loc )
DatabaseClient::recordGetDataLocation( const std::vector<std::string> & a_ids, std::vector<RepoRecordDataLocations> & a_locs )
{
    rapidjson::Document result;
    string ids = "[";

    for ( vector<string>::const_iterator i = a_ids.begin(); i != a_ids.end(); i++ )
    {
        if ( i != a_ids.begin() )
            ids += ",";

        ids += "\"" + *i + "\"";
    }
    ids += "]";

    dbGet( "dat/loc", {{"ids",ids}}, result );

    setRepoRecordDataLocations( a_locs, result );
}

void
DatabaseClient::setRepoRecordDataLocations( std::vector<RepoRecordDataLocations> & a_locs, rapidjson::Value & a_result )
{
    if ( !a_result.IsObject() )
        EXCEPT( ID_INTERNAL_ERROR, "Invalid JSON returned from DB (repo data not an object)" );

    rapidjson::Value::ConstMemberIterator   imem;
    RecordDataLocation *                    loc;
    rapidjson::SizeType                     i;

    a_locs.clear();
    a_locs.reserve( a_result.MemberCount() );

    for ( rapidjson::Value::ConstMemberIterator iter = a_result.MemberBegin(); iter != a_result.MemberEnd(); ++iter )
    {
        if ( !iter->value.IsArray() )
            EXCEPT( ID_INTERNAL_ERROR, "Invalid JSON returned from DB (repo field not an array)" );

        RepoRecordDataLocations repo_locs;

        repo_locs.set_repo_id( iter->name.GetString() );

        for ( i = 0; i < iter->value.Size(); i++ )
        {
            loc = repo_locs.add_loc();
            loc->set_id( iter->value[i]["id"].GetString() );
            loc->set_path( iter->value[i]["path"].GetString() );
        }

        a_locs.push_back( repo_locs );
    }
}

void
DatabaseClient::recordGetDependencies( const Auth::RecordGetDependenciesRequest & a_request, Auth::ListingReply & a_reply )
{
    rapidjson::Document result;

    dbGet( "dat/dep/get", {{"id",a_request.id()}}, result );

    setListingData( a_reply, result );
}

void
DatabaseClient::recordGetDependencyGraph( const Auth::RecordGetDependencyGraphRequest & a_request, Auth::ListingReply & a_reply )
{
    rapidjson::Document result;

    dbGet( "dat/dep/graph/get", {{"id",a_request.id()}}, result );

    setListingData( a_reply, result );
}

void
DatabaseClient::setRecordData( RecordDataReply & a_reply, rapidjson::Document & a_result, std::vector<RepoRecordDataLocations> * a_locs )
{
    if ( !a_result.IsArray() )
        EXCEPT( ID_INTERNAL_ERROR, "Invalid JSON returned from DB service" );

    RecordData* rec;
    DependencyData *deps;
    rapidjson::Value::MemberIterator imem,imem2;

    for ( rapidjson::SizeType i = 0; i < a_result.Size(); i++ )
    {
        rapidjson::Value & val = a_result[i];

        if (( imem = val.FindMember("deletions")) != val.MemberEnd() )
        {
            if ( a_locs )
                setRepoRecordDataLocations( *a_locs, imem->value );
            continue;
        }

        rec = a_reply.add_data();
        rec->set_id( val["id"].GetString() );
        rec->set_title( val["title"].GetString() );

        if (( imem = val.FindMember("alias")) != val.MemberEnd() )
        {
            if ( !imem->value.IsNull() )
                rec->set_alias( imem->value.GetString() );
        }

        if (( imem = val.FindMember("owner")) != val.MemberEnd() )
            rec->set_owner( imem->value.GetString() );

        if (( imem = val.FindMember("creator")) != val.MemberEnd() )
            rec->set_creator( imem->value.GetString() );

        if (( imem = val.FindMember("desc")) != val.MemberEnd() )
            rec->set_desc( imem->value.GetString() );

        if (( imem = val.FindMember("keyw")) != val.MemberEnd() )
            rec->set_keyw( imem->value.GetString() );

        if (( imem = val.FindMember("public")) != val.MemberEnd() )
            rec->set_ispublic( imem->value.GetBool() );

        if (( imem = val.FindMember("doi")) != val.MemberEnd() )
            rec->set_doi( imem->value.GetString() );

        if (( imem = val.FindMember("data_url")) != val.MemberEnd() )
            rec->set_data_url( imem->value.GetString() );

        if (( imem = val.FindMember("md")) != val.MemberEnd() )
        {
            rapidjson::StringBuffer buffer;
            rapidjson::PrettyWriter<rapidjson::StringBuffer> writer(buffer);
            //rapidjson::Writer<rapidjson::StringBuffer> writer(buffer);
            imem->value.Accept(writer);
            rec->set_metadata( buffer.GetString() );
            //rec->set_metadata( imem->value.GetString() );
        }

        //if (( imem = val.FindMember("data_path")) != val.MemberEnd() )
        //    rec->set_data_path( imem->value.GetString() );
        if (( imem = val.FindMember("repo_id")) != val.MemberEnd() )
            rec->set_repo_id( imem->value.GetString() );

        if (( imem = val.FindMember("size")) != val.MemberEnd() )
            rec->set_size( imem->value.GetUint64() );

        if (( imem = val.FindMember("source")) != val.MemberEnd() )
            rec->set_source( imem->value.GetString() );

        if (( imem = val.FindMember("ext")) != val.MemberEnd() )
            rec->set_ext( imem->value.GetString() );

        if (( imem = val.FindMember("ext_auto")) != val.MemberEnd() )
            rec->set_ext_auto( imem->value.GetBool() );

        if (( imem = val.FindMember("ct")) != val.MemberEnd() )
            rec->set_ct( imem->value.GetUint() );

        if (( imem = val.FindMember("ut")) != val.MemberEnd() )
            rec->set_ut( imem->value.GetUint() );

        if (( imem = val.FindMember("dt")) != val.MemberEnd() )
            rec->set_dt( imem->value.GetUint() );

        if (( imem = val.FindMember("locked")) != val.MemberEnd() )
            rec->set_locked( imem->value.GetBool() );

        if (( imem = val.FindMember("parent_id")) != val.MemberEnd() )
            rec->set_parent_id( imem->value.GetString() );

        if (( imem = val.FindMember("deps")) != val.MemberEnd() )
        {
            if ( !imem->value.IsArray() )
            {
                EXCEPT( ID_INTERNAL_ERROR, "Deps not an array!" );
            }

            for ( rapidjson::SizeType j = 0; j < imem->value.Size(); j++ )
            {
                rapidjson::Value & val2 = imem->value[j];

                deps = rec->add_deps();
                deps->set_id(val2["id"].GetString());
                deps->set_type((DependencyType)val2["type"].GetInt());
                deps->set_dir((DependencyDir)val2["dir"].GetInt());
                if (( imem2 = val2.FindMember("alias")) != val2.MemberEnd() && !imem2->value.IsNull() )
                    deps->set_alias( imem2->value.GetString() );
            }
        }
    }
}


void
DatabaseClient::dataPath( const Auth::DataPathRequest & a_request, Auth::DataPathReply & a_reply )
{
    rapidjson::Document result;

    dbGet( "dat/path", {{"id",a_request.id()},{"domain",a_request.domain()}}, result );

    a_reply.set_path( result["path"].GetString() );
}

void
DatabaseClient::dataGetPreproc( const Auth::DataGetPreprocRequest & a_request, Auth::ListingReply & a_reply )
{
    rapidjson::Document result;
    vector<pair<string,string>> params;
    string ids = "[";
    for ( int i = 0; i < a_request.id_size(); i++ )
    {
        if ( i > 0 )
            ids += ",";

        ids += "\"" + a_request.id(i) + "\"";
    }
    ids += "]";
    params.push_back({"ids",ids});

    dbGet( "dat/get/preproc", params, result );

    setListingData( a_reply, result );
}

void
DatabaseClient::collList( const CollListRequest & a_request, CollDataReply & a_reply )
{
    rapidjson::Document result;

    if ( a_request.has_user() )
        dbGet( "col/priv/list", {{"subject",a_request.user()}}, result );
    else
        dbGet( "col/priv/list", {}, result );

    setCollData( a_reply, result );
}

void
DatabaseClient::collListPublished( const Auth::CollListPublishedRequest & a_request, Auth::ListingReply & a_reply )
{
    rapidjson::Document result;

    if ( a_request.has_subject() )
        dbGet( "col/published/list", {{"subject",a_request.subject()}}, result );
    else
        dbGet( "col/published/list", {}, result );

    setListingData( a_reply, result );
}

void
DatabaseClient::collCreate( const Auth::CollCreateRequest & a_request, Auth::CollDataReply & a_reply )
{
    rapidjson::Document result;

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
DatabaseClient::collUpdate( const Auth::CollUpdateRequest & a_request, Auth::CollDataReply & a_reply )
{
    rapidjson::Document result;

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

// TODO collDelete should take list of coll IDs
void
DatabaseClient::collDelete( const std::string & a_id, std::vector<RepoRecordDataLocations> & a_locs )
{
    rapidjson::Document result;

    dbGet( "col/delete", {{"id",a_id}}, result );

    setRepoRecordDataLocations( a_locs, result );
}

void
DatabaseClient::collView( const Auth::CollViewRequest & a_request, Auth::CollDataReply & a_reply )
{
    rapidjson::Document result;

    dbGet( "col/view", {{"id",a_request.id()}}, result );

    setCollData( a_reply, result );
}

void
DatabaseClient::collRead( const CollReadRequest & a_request, ListingReply & a_reply )
{
    rapidjson::Document result;
    vector<pair<string,string>> params;
    params.push_back({"id",a_request.id()});
    if ( a_request.has_offset() )
        params.push_back({"offset",to_string(a_request.offset())});
    if ( a_request.has_count() )
        params.push_back({"count",to_string(a_request.count())});

    dbGet( "col/read", params, result );

    setListingData( a_reply, result );
}

void
DatabaseClient::collWrite( const CollWriteRequest & a_request, Auth::ListingReply & a_reply )
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

    rapidjson::Document result;

    dbGet( "col/write", {{"id",a_request.id()},{"add",add_list},{"remove",rem_list}}, result );

    setListingData( a_reply, result );
}

void
DatabaseClient::collMove( const Auth::CollMoveRequest & a_request, Anon::AckReply & a_reply )
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

    rapidjson::Document result;
    dbGet( "col/move", {{"source",a_request.src_id()},{"dest",a_request.dst_id()},{"items",items}}, result );
}

void
DatabaseClient::collGetParents( const Auth::CollGetParentsRequest & a_request, Auth::CollPathReply & a_reply )
{
    rapidjson::Document result;
    vector<pair<string,string>> params;
    params.push_back({"id",a_request.id()});
    if ( a_request.has_inclusive() )
        params.push_back({"inclusive",a_request.inclusive()?"true":"false"});

    dbGet( "col/get_parents", params, result );

    setCollPathData( a_reply, result );
}

void
DatabaseClient::collGetOffset( const Auth::CollGetOffsetRequest & a_request, Auth::CollGetOffsetReply & a_reply )
{
    rapidjson::Document result;

    dbGet( "col/get_offset", {{"id",a_request.id()},{"item",a_request.item()},{"page_sz",to_string(a_request.page_sz())}}, result );

    a_reply.set_id( a_request.id() );
    a_reply.set_item( a_request.item() );
    a_reply.set_offset( result["offset"].GetUint() );
}

void
DatabaseClient::setCollData( CollDataReply & a_reply, rapidjson::Document & a_result )
{
    if ( !a_result.IsArray() )
    {
        EXCEPT( ID_INTERNAL_ERROR, "Invalid JSON returned from DB service" );
    }

    CollData* coll;
    rapidjson::Value::MemberIterator imem;

    for ( rapidjson::SizeType i = 0; i < a_result.Size(); i++ )
    {
        rapidjson::Value & val = a_result[i];

        coll = a_reply.add_coll();
        coll->set_id( val["id"].GetString() );
        coll->set_title( val["title"].GetString() );

        if (( imem = val.FindMember("desc")) != val.MemberEnd() )
            coll->set_desc( imem->value.GetString() );
        if (( imem = val.FindMember("public")) != val.MemberEnd() )
            coll->set_ispublic( imem->value.GetBool() );
        if (( imem = val.FindMember("topic")) != val.MemberEnd() )
            coll->set_topic( imem->value.GetString() );

        if (( imem = val.FindMember("alias")) != val.MemberEnd() )
        {
            if ( !imem->value.IsNull() )
            {
                coll->set_alias( imem->value.GetString() );
            }
        }

        if (( imem = val.FindMember("ct")) != val.MemberEnd() )
            coll->set_ct( imem->value.GetUint() );

        if (( imem = val.FindMember("ut")) != val.MemberEnd() )
            coll->set_ut( imem->value.GetUint() );

        if (( imem = val.FindMember("parent_id")) != val.MemberEnd() )
            coll->set_parent_id( imem->value.GetString() );

        if (( imem = val.FindMember("owner")) != val.MemberEnd() )
            coll->set_owner( imem->value.GetString() );
    }
}

void
DatabaseClient::setCollPathData( CollPathReply & a_reply, rapidjson::Document & a_result )
{
    if ( !a_result.IsArray() )
    {
        EXCEPT( ID_INTERNAL_ERROR, "Invalid JSON returned from DB service" );
    }

    PathData* path;
    ListingData* item;
    rapidjson::Value::MemberIterator imem;

    for ( rapidjson::SizeType p = 0; p < a_result.Size(); p++ )
    {
        rapidjson::Value & path_val = a_result[p];
        path = a_reply.add_path();

        for ( rapidjson::SizeType i = 0; i < path_val.Size(); i++ )
        {
            rapidjson::Value & val = path_val[i];

            item = path->add_item();
            item->set_id( val["id"].GetString() );
            item->set_title( val["title"].GetString() );

            if (( imem = val.FindMember("alias")) != val.MemberEnd() && !imem->value.IsNull() )
                item->set_alias( imem->value.GetString() );

            if (( imem = val.FindMember("owner")) != val.MemberEnd() )
                item->set_owner( imem->value.GetString() );
        }
    }
}

void
DatabaseClient::setListingData( ListingReply & a_reply, rapidjson::Document & a_result )
{
    if ( !a_result.IsArray() )
    {
        EXCEPT( ID_INTERNAL_ERROR, "Invalid JSON returned from DB service" );
    }

    ListingData* item;
    rapidjson::Value::MemberIterator imem,imem2;
    rapidjson::SizeType i,j;
    DependencyData *dep;

    for ( i = 0; i < a_result.Size(); i++ )
    {
        rapidjson::Value & val = a_result[i];

        if (( imem = val.FindMember("paging")) != val.MemberEnd())
        {
            a_reply.set_offset( imem->value["off"].GetUint() );
            a_reply.set_count( imem->value["cnt"].GetUint() );
            a_reply.set_total( imem->value["tot"].GetUint() );
            DL_INFO( "Paged, tot:" << imem->value["tot"].GetUint() );
        }
        else
        {
            item = a_reply.add_item();
            item->set_id( val["id"].GetString() );
            item->set_title( val["title"].GetString() );
            if (( imem = val.FindMember("alias")) != val.MemberEnd() && !imem->value.IsNull() )
                item->set_alias( imem->value.GetString() );
            if (( imem = val.FindMember("locked")) != val.MemberEnd() && !imem->value.IsNull() )
                item->set_locked( imem->value.GetBool() );
            if (( imem = val.FindMember("owner")) != val.MemberEnd() && !imem->value.IsNull() )
                item->set_owner( imem->value.GetString() );
            if (( imem = val.FindMember("size")) != val.MemberEnd() )
                item->set_size( imem->value.GetUint() );
            if (( imem = val.FindMember("gen")) != val.MemberEnd() )
                item->set_gen( imem->value.GetInt() );
            if (( imem = val.FindMember("doi")) != val.MemberEnd() && !imem->value.IsNull() )
                item->set_doi( imem->value.GetString() );
            if (( imem = val.FindMember("url")) != val.MemberEnd() && !imem->value.IsNull() )
                item->set_url( imem->value.GetString() );
            if (( imem = val.FindMember("deps")) != val.MemberEnd() )
            {
                for ( j = 0; j < imem->value.Size(); j++ )
                {
                    rapidjson::Value & val2 = imem->value[j];

                    dep = item->add_dep();
                    dep->set_id( val2["id"].GetString());
                    dep->set_type((DependencyType)val2["type"].GetInt());
                    dep->set_dir((DependencyDir)val2["dir"].GetInt());
                    if (( imem2 = val2.FindMember("alias")) != val2.MemberEnd() && !imem2->value.IsNull() )
                        dep->set_alias( imem2->value.GetString() );
                }
            }
        }
    }
}

void
DatabaseClient::queryList( const Auth::QueryListRequest & a_request, Auth::ListingReply & a_reply )
{
    rapidjson::Document result;
    vector<pair<string,string>> params;
    if ( a_request.has_offset() )
        params.push_back({"offset",to_string(a_request.offset())});
    if ( a_request.has_count() )
        params.push_back({"count",to_string(a_request.count())});

    dbGet( "qry/list", params, result );

    setListingData( a_reply, result );
}

void
DatabaseClient::queryCreate( const Auth::QueryCreateRequest & a_request, Auth::QueryDataReply & a_reply )
{
    rapidjson::Document result;
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
DatabaseClient::queryUpdate( const Auth::QueryUpdateRequest & a_request, Auth::QueryDataReply & a_reply )
{
    rapidjson::Document result;
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
DatabaseClient::queryDelete( const std::string & a_id )
{
    rapidjson::Document result;

    dbGet( "qry/delete", {{"id",a_id}}, result );
}

void
DatabaseClient::queryView( const Auth::QueryViewRequest & a_request, Auth::QueryDataReply & a_reply )
{
    rapidjson::Document result;

    dbGet( "qry/view", {{"id",a_request.id()}}, result );

    setQueryData( a_reply, result );
}

void
DatabaseClient::queryExec( const Auth::QueryExecRequest & a_request, Auth::ListingReply & a_reply )
{
    rapidjson::Document result;
    vector<pair<string,string>> params;

    params.push_back({"id",a_request.id()});
    if ( a_request.has_offset())
        params.push_back({"offset",to_string(a_request.offset())});
    if ( a_request.has_count() )
        params.push_back({"count",to_string(a_request.count())});

    dbGet( "/qry/exec", params, result );

    setListingData( a_reply, result );
}

void
DatabaseClient::setQueryData( QueryDataReply & a_reply, rapidjson::Document & a_result )
{
    if ( !a_result.IsArray() )
    {
        EXCEPT( ID_INTERNAL_ERROR, "Invalid JSON returned from DB service" );
    }

    QueryData* qry;
    rapidjson::Value::MemberIterator imem;

    for ( rapidjson::SizeType i = 0; i < a_result.Size(); i++ )
    {
        rapidjson::Value & val = a_result[i];

        qry = a_reply.add_query();
        qry->set_id( val["id"].GetString() );
        qry->set_title( val["title"].GetString() );
        qry->set_query( val["query"].GetString() );

        if (( imem = val.FindMember("owner")) != val.MemberEnd() )
            qry->set_owner( imem->value.GetString() );
        if (( imem = val.FindMember("ct")) != val.MemberEnd() )
            qry->set_ct( imem->value.GetUint() );
        if (( imem = val.FindMember("ut")) != val.MemberEnd() )
            qry->set_ut( imem->value.GetUint() );
        if (( imem = val.FindMember("use_owner")) != val.MemberEnd() && !imem->value.IsNull() )
            qry->set_use_owner( imem->value.GetBool() );
        if (( imem = val.FindMember("use_sh_usr")) != val.MemberEnd() && !imem->value.IsNull() )
            qry->set_use_sh_usr( imem->value.GetBool() );
        if (( imem = val.FindMember("use_sh_prj")) != val.MemberEnd() && !imem->value.IsNull() )
            qry->set_use_sh_prj( imem->value.GetBool() );
    }
}

void
DatabaseClient::xfrView( const Auth::XfrViewRequest & a_request, Auth::XfrDataReply & a_reply )
{
    rapidjson::Document result;

    dbGet( "xfr/view", {{"xfr_id",a_request.xfr_id()}}, result );

    setXfrData( a_reply, result );
}

void
DatabaseClient::xfrList( const Auth::XfrListRequest & a_request, Auth::XfrDataReply & a_reply )
{
    rapidjson::Document result;

    vector<pair<string,string>> params;

    if ( a_request.has_since() )
        params.push_back({"since",to_string(a_request.since())});
    if ( a_request.has_from() )
        params.push_back({"from",to_string(a_request.from())});
    if ( a_request.has_to() )
        params.push_back({"to",to_string(a_request.to())});
    if ( a_request.has_status() )
        params.push_back({"status",to_string((unsigned int)a_request.status())});
    if ( a_request.has_limit() )
        params.push_back({"limit",to_string(a_request.limit())});

    dbGet( "xfr/list", params, result, false );

    setXfrData( a_reply, result );
}

/*
void
DatabaseClient::setXfrData( XfrDataReply & a_reply, rapidjson::Document & a_result )
{
    if ( !a_result.IsArray() )
    {
        EXCEPT( ID_INTERNAL_ERROR, "Invalid JSON returned from DB service" );
    }

    XfrData* xfr;
    rapidjson::Value::MemberIterator imem;

    for ( rapidjson::SizeType i = 0; i < a_result.Size(); i++ )
    {
        rapidjson::Value & val = a_result[i];

        xfr = a_reply.add_xfr();
        xfr->set_id( val["_id"].GetString() );
        xfr->set_mode( (XfrMode)val["mode"].GetInt() );
        xfr->set_status( (XfrStatus)val["status"].GetInt() );
        xfr->set_data_id( val["data_id"].GetString() );
        xfr->set_repo_path( val["repo_path"].GetString() );
        xfr->set_local_path( val["local_path"].GetString() );
        xfr->set_user_id( val["user_id"].GetString() );
        xfr->set_repo_id( val["repo_id"].GetString() );
        xfr->set_started( val["started"].GetUint() );
        xfr->set_updated( val["updated"].GetUint() );

        imem = val.FindMember("ext");
        if ( imem != val.MemberEnd() )
            xfr->set_ext( imem->value.GetString() );

        imem = val.FindMember("task_id");
        if ( imem != val.MemberEnd() )
            xfr->set_task_id( imem->value.GetString() );

        imem = val.FindMember("err_msg");
        if ( imem != val.MemberEnd() )
            xfr->set_err_msg( imem->value.GetString() );
    }
}*/

/*
void
DatabaseClient::xfrInit( const std::string & a_id, const std::string & a_data_path, const std::string * a_ext, XfrMode a_mode, Auth::XfrDataReply & a_reply )
{
    rapidjson::Document result;
    vector<pair<string,string>> params;
    params.push_back({"id",a_id});
    params.push_back({"path",a_data_path});
    params.push_back({"mode",to_string(a_mode)});
    if ( a_ext )
        params.push_back({"ext",*a_ext});

    dbGet( "xfr/init", params, result );

    setXfrData( a_reply, result );
}*/

void
DatabaseClient::xfrInit( const std::vector<std::string> & a_ids, const std::string & a_path, const std::string * a_ext, XfrMode a_mode, Auth::XfrDataReply & a_reply )
{
    rapidjson::Document result;
    vector<pair<string,string>> params;
    string ids = "[";
    for ( vector<string>::const_iterator i = a_ids.begin(); i != a_ids.end(); i++ )
    {
        if ( i != a_ids.begin() )
            ids += ",";

        ids += "\"" + *i + "\"";
    }
    ids += "]";
    params.push_back({"ids",ids});
    params.push_back({"path",a_path});
    params.push_back({"mode",to_string(a_mode)});
    if ( a_ext )
        params.push_back({"ext",*a_ext});

    dbGet( "xfr/init2", params, result );

    setXfrData( a_reply, result );
}

void
DatabaseClient::setXfrData( XfrDataReply & a_reply, rapidjson::Document & a_result )
{
    if ( !a_result.IsArray() )
    {
        EXCEPT( ID_INTERNAL_ERROR, "Invalid JSON returned from DB service" );
    }

    XfrData*    xfr;
    XfrRepo*    repo;
    XfrFile*    file;
    rapidjson::Value::MemberIterator imem, imem2;

    for ( rapidjson::SizeType i = 0; i < a_result.Size(); i++ )
    {
        rapidjson::Value & val = a_result[i];

        xfr = a_reply.add_xfr();
        xfr->set_id( val["_id"].GetString() );
        xfr->set_mode( (XfrMode)val["mode"].GetInt() );
        xfr->set_status( (XfrStatus)val["status"].GetInt() );
        xfr->set_rem_ep( val["rem_ep"].GetString() );
        xfr->set_rem_path( val["rem_path"].GetString() );
        xfr->set_user_id( val["user_id"].GetString() );
        xfr->set_started( val["started"].GetUint() );
        xfr->set_updated( val["updated"].GetUint() );

        imem = val.FindMember("ext");
        if ( imem != val.MemberEnd() )
            xfr->set_ext( val["ext"].GetString() );

        imem = val.FindMember("repo");
        if ( imem != val.MemberEnd() )
        {
            repo = xfr->mutable_repo();
            //repo->set_repo_id( imem2->name.GetString() );
            repo->set_repo_id( imem->value["repo_id"].GetString() );
            repo->set_repo_ep( imem->value["repo_ep"].GetString() );
            const rapidjson::Value & fval = imem->value["files"];
            for ( rapidjson::SizeType f = 0; f < fval.Size(); f++ )
            {
                file = repo->add_file();
                file->set_id( fval[f]["id"].GetString() );
                file->set_from( fval[f]["from"].GetString() );
                file->set_to( fval[f]["to"].GetString() );
            }
        }

        imem = val.FindMember("task_id");
        if ( imem != val.MemberEnd() )
            xfr->set_task_id( imem->value.GetString() );

        imem = val.FindMember("err_msg");
        if ( imem != val.MemberEnd() )
            xfr->set_err_msg( imem->value.GetString() );
    }
}

void
DatabaseClient::xfrUpdate( const std::string & a_xfr_id, XfrStatus * a_status, const std::string & a_err_msg, const char * a_task_id )
{
    rapidjson::Document result;

    vector<pair<string,string>> params;
    params.push_back({"xfr_id",a_xfr_id});
    if ( a_status )
        params.push_back({"status",to_string(*a_status)});
    if ( a_task_id )
        params.push_back({"task_id", string(a_task_id)});
    if ( a_err_msg.size() )
        params.push_back({"err_msg", a_err_msg});

    dbGet( "xfr/update", params, result );
}

void
DatabaseClient::aclView( const Auth::ACLViewRequest & a_request, Auth::ACLDataReply & a_reply )
{
    rapidjson::Document result;

    dbGet( "acl/view", {{"id",a_request.id()}}, result );

    setACLData( a_reply, result );
}

void
DatabaseClient::aclUpdate( const Auth::ACLUpdateRequest & a_request, Auth::ACLDataReply & a_reply )
{
    rapidjson::Document result;
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
DatabaseClient::aclByUser( const Auth::ACLByUserRequest & a_request,  Auth::UserDataReply & a_reply )
{
    (void)a_request;
    rapidjson::Document result;

    dbGet( "acl/by_user", {}, result );

    setUserData( a_reply, result );
}

void
DatabaseClient::aclByUserList( const Auth::ACLByUserListRequest & a_request,  Auth::ListingReply & a_reply )
{
    rapidjson::Document result;

    dbGet( "acl/by_user/list", {{"owner",a_request.owner()}}, result );

    setListingData( a_reply, result );
}

void
DatabaseClient::aclByProj( const Auth::ACLByProjRequest & a_request,  Auth::ProjectDataReply & a_reply )
{
    (void)a_request;
    rapidjson::Document result;

    dbGet( "acl/by_proj", {}, result );

    setProjectData( a_reply, result );
}

void
DatabaseClient::aclByProjList( const Auth::ACLByProjListRequest & a_request,  Auth::ListingReply & a_reply )
{
    rapidjson::Document result;

    dbGet( "acl/by_proj/list", {{"owner",a_request.owner()}}, result );

    setListingData( a_reply, result );
}

void
DatabaseClient::setACLData( ACLDataReply & a_reply, rapidjson::Document & a_result )
{
    if ( !a_result.IsArray() )
    {
        EXCEPT( ID_INTERNAL_ERROR, "Invalid JSON returned from DB service" );
    }

    ACLRule* rule;
    rapidjson::Value::MemberIterator imem;

    for ( rapidjson::SizeType i = 0; i < a_result.Size(); i++ )
    {
        rapidjson::Value & val = a_result[i];

        rule = a_reply.add_rule();

        rule->set_id( val["id"].GetString() );

        imem = val.FindMember("grant");
        if ( imem != val.MemberEnd() )
            rule->set_grant( imem->value.GetInt() );
        imem = val.FindMember("deny");
        if ( imem != val.MemberEnd() )
            rule->set_deny( imem->value.GetInt() );
        imem = val.FindMember("inhgrant");
        if ( imem != val.MemberEnd() )
            rule->set_inhgrant( imem->value.GetInt() );
        imem = val.FindMember("inhdeny");
        if ( imem != val.MemberEnd() )
            rule->set_inhdeny( imem->value.GetInt() );
    }
}

void
DatabaseClient::groupCreate( const Auth::GroupCreateRequest & a_request, Auth::GroupDataReply & a_reply )
{
    rapidjson::Document result;

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
DatabaseClient::groupUpdate( const Auth::GroupUpdateRequest & a_request, Auth::GroupDataReply & a_reply )
{
    rapidjson::Document result;

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
DatabaseClient::groupDelete( const Auth::GroupDeleteRequest & a_request, Anon::AckReply & a_reply )
{
    (void) a_reply;
    rapidjson::Document result;

    vector<pair<string,string>> params;
    params.push_back({"gid", a_request.gid()});
    if ( a_request.uid().compare( m_client_uid ) != 0 )
        params.push_back({"proj", a_request.uid()});

    dbGet( "grp/delete", params, result );
}

void
DatabaseClient::groupList( const Auth::GroupListRequest & a_request, Auth::GroupDataReply & a_reply )
{
    (void) a_request;

    rapidjson::Document result;
    vector<pair<string,string>> params;
    if ( a_request.uid().compare( m_client_uid ) != 0 )
        params.push_back({"proj", a_request.uid()});

    dbGet( "grp/list", params, result );

    setGroupData( a_reply, result );
}

void
DatabaseClient::groupView( const Auth::GroupViewRequest & a_request, Auth::GroupDataReply & a_reply )
{
    rapidjson::Document result;
    vector<pair<string,string>> params;
    params.push_back({"gid", a_request.gid()});
    if ( a_request.uid().compare( m_client_uid ) != 0 )
        params.push_back({"proj", a_request.uid()});

    dbGet( "grp/view", params, result );

    setGroupData( a_reply, result );
}

void
DatabaseClient::setGroupData( GroupDataReply & a_reply, rapidjson::Document & a_result )
{
    if ( !a_result.IsArray() )
    {
        EXCEPT( ID_INTERNAL_ERROR, "Invalid JSON returned from DB service" );
    }

    GroupData * group;
    rapidjson::Value::MemberIterator imem;

    for ( rapidjson::SizeType i = 0; i < a_result.Size(); i++ )
    {
        rapidjson::Value & val = a_result[i];

        group = a_reply.add_group();
        group->set_gid( val["gid"].GetString() );

        imem = val.FindMember("uid");
        if ( imem != val.MemberEnd() && !imem->value.IsNull() )
            group->set_uid( val["uid"].GetString() );
        imem = val.FindMember("title");
        if ( imem != val.MemberEnd() && !imem->value.IsNull() )
            group->set_title( imem->value.GetString() );
        imem = val.FindMember("desc");
        if ( imem != val.MemberEnd() && !imem->value.IsNull() )
            group->set_desc( imem->value.GetString() );
        imem = val.FindMember("members");
        if ( imem != val.MemberEnd() )
        {
            for ( rapidjson::SizeType m = 0; m < imem->value.Size(); m++ )
                group->add_member( imem->value[m].GetString() );
        }
    }
}

void
DatabaseClient::repoList( const Auth::RepoListRequest & a_request, Auth::RepoDataReply  & a_reply )
{
    rapidjson::Document result;
    vector<pair<string,string>> params;
    if ( a_request.has_all() )
        params.push_back({"all", a_request.all()?"true":"false"});
    if ( a_request.has_details() )
        params.push_back({"details", a_request.details()?"true":"false"});

    dbGet( "repo/list", params, result );

    setRepoData( &a_reply, 0, result );
}

void
DatabaseClient::repoList( std::vector<RepoData*> & a_repos )
{
    rapidjson::Document result;

    dbGet( "repo/list", {{"all","true"},{"details","true"}}, result );

    setRepoData( 0, &a_repos, result );
}

void
DatabaseClient::repoView( const Auth::RepoViewRequest & a_request, Auth::RepoDataReply  & a_reply )
{
    rapidjson::Document result;

    dbGet( "repo/view", {{"id",a_request.id()}}, result );

    setRepoData( &a_reply, 0, result );
}

void
DatabaseClient::repoCreate( const Auth::RepoCreateRequest & a_request, Auth::RepoDataReply  & a_reply )
{
    rapidjson::Document result;

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
DatabaseClient::repoUpdate( const Auth::RepoUpdateRequest & a_request, Auth::RepoDataReply  & a_reply )
{
    rapidjson::Document result;

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
DatabaseClient::repoDelete( const Auth::RepoDeleteRequest & a_request, Anon::AckReply  & a_reply )
{
    (void) a_reply;
    rapidjson::Document result;

    dbGet( "repo/delete", {{"id",a_request.id()}}, result );
}

void
DatabaseClient::repoCalcSize( const Auth::RepoCalcSizeRequest & a_request, Auth::RepoCalcSizeReply  & a_reply )
{
    rapidjson::Document result;

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

    for ( rapidjson::SizeType i = 0; i < result.Size(); i++ )
    {
        rapidjson::Value & val = result[i];
        stats = a_reply.add_stats();
        setAllocStatsData( val, *stats );
    }
}

void
DatabaseClient::setRepoData( Auth::RepoDataReply * a_reply, std::vector<RepoData*> * a_repos, rapidjson::Document & a_result )
{
    if ( !a_reply && !a_repos )
        EXCEPT( ID_INTERNAL_ERROR, "Missing parameters" );

    if ( !a_result.IsArray() )
        EXCEPT( ID_INTERNAL_ERROR, "Invalid JSON returned from DB service (not an array)" );

    RepoData* repo;
    rapidjson::Value::MemberIterator imem;

    for ( rapidjson::SizeType i = 0; i < a_result.Size(); i++ )
    {
        rapidjson::Value & val = a_result[i];

        if ( a_reply )
            repo = a_reply->add_repo();
        else
            repo = new RepoData();

        repo->set_id( val["id"].GetString() );
        if (( imem = val.FindMember("title")) != val.MemberEnd() )
            repo->set_title( imem->value.GetString() );
        if (( imem = val.FindMember("desc")) != val.MemberEnd() )
            repo->set_desc( imem->value.GetString() );
        if (( imem = val.FindMember("capacity")) != val.MemberEnd() )
            repo->set_capacity( imem->value.GetUint64() );
        if (( imem = val.FindMember("address")) != val.MemberEnd() )
            repo->set_address( imem->value.GetString() );
        if (( imem = val.FindMember("endpoint")) != val.MemberEnd() )
            repo->set_endpoint( imem->value.GetString() );
        if (( imem = val.FindMember("pub_key")) != val.MemberEnd() )
            repo->set_pub_key( imem->value.GetString() );
        if (( imem = val.FindMember("path")) != val.MemberEnd() )
            repo->set_path( imem->value.GetString() );
        if (( imem = val.FindMember("domain")) != val.MemberEnd() && !imem->value.IsNull() )
            repo->set_domain( imem->value.GetString() );
        if (( imem = val.FindMember("exp_path")) != val.MemberEnd() )
            repo->set_exp_path( imem->value.GetString() );

        if (( imem = val.FindMember("admins")) != val.MemberEnd() )
        {
            for ( rapidjson::SizeType j = 0; j < imem->value.Size(); j++ )
                repo->add_admin( imem->value[j].GetString() );
        }

        if ( a_repos )
            a_repos->push_back( repo );

    }
}

void
DatabaseClient::repoListAllocations( const Auth::RepoListAllocationsRequest & a_request, Auth::RepoAllocationsReply  & a_reply )
{
    rapidjson::Document result;

    dbGet( "repo/alloc/list/by_repo", {{"repo",a_request.id()}}, result );

    setAllocData( a_reply, result );
}

void
DatabaseClient::repoListSubjectAllocations( const Auth::RepoListSubjectAllocationsRequest & a_request, Auth::RepoAllocationsReply  & a_reply )
{
    rapidjson::Document result;
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
DatabaseClient::repoListObjectAllocations( const Auth::RepoListObjectAllocationsRequest & a_request, Auth::RepoAllocationsReply  & a_reply )
{
    rapidjson::Document result;

    dbGet( "repo/alloc/list/by_object", {{"object",a_request.id()}}, result );

    setAllocData( a_reply, result );
}


void
DatabaseClient::setAllocData( Auth::RepoAllocationsReply & a_reply, rapidjson::Document & a_result )
{
    if ( !a_result.IsArray() )
    {
        EXCEPT( ID_INTERNAL_ERROR, "Invalid JSON returned from DB service" );
    }

    AllocData * alloc;
    rapidjson::Value::MemberIterator imem,imem2;

    for ( rapidjson::SizeType i = 0; i < a_result.Size(); i++ )
    {
        rapidjson::Value & val = a_result[i];

        alloc = a_reply.add_alloc();
        alloc->set_repo(val["repo"].GetString());
        alloc->set_max_size(val["max_size"].GetUint64());
        alloc->set_tot_size(val["tot_size"].GetUint64());
        alloc->set_max_count(val["max_count"].GetUint());
        alloc->set_path(val["path"].GetString());
        if (( imem = val.FindMember("id")) != val.MemberEnd() )
            alloc->set_id( imem->value.GetString() );
        if (( imem = val.FindMember("sub_alloc")) != val.MemberEnd() )
            alloc->set_sub_alloc( imem->value.GetBool() );
        if (( imem = val.FindMember("stats")) != val.MemberEnd() )
        {
            setAllocStatsData( imem->value, *alloc->mutable_stats() );
/*
            alloc->mutable_stats()->set_repo(imem->value["repo"].GetString());
            alloc->mutable_stats()->set_records(imem->value["records"].GetUint());
            alloc->mutable_stats()->set_files(imem->value["files"].GetUint());
            alloc->mutable_stats()->set_total_sz(imem->value["total_sz"].GetUint64());

            imem2 = imem->value.FindMember("histogram");
            for ( rapidjson::SizeType i = 0; i < imem2->value.Size(); i++ )
                alloc->mutable_stats()->add_histogram(imem2->value[i].GetUint());
*/
        }
    }
}

void
DatabaseClient::repoViewAllocation( const Auth::RepoViewAllocationRequest & a_request, Auth::RepoAllocationsReply & a_reply )
{
    rapidjson::Document result;
    vector<pair<string,string>> params;
    params.push_back({"repo",a_request.repo()});
    if ( a_request.has_subject() )
        params.push_back({"subject",a_request.subject()});

    dbGet( "repo/alloc/view", params, result );

    setAllocData( a_reply, result );
}

void
DatabaseClient::repoAllocationStats( const Auth::RepoAllocationStatsRequest & a_request, Auth::RepoAllocationStatsReply  & a_reply )
{
    rapidjson::Document result;
    vector<pair<string,string>> params;
    params.push_back({"repo",a_request.repo()});
    if ( a_request.has_subject() )
        params.push_back({"subject",a_request.subject()});

    dbGet( "repo/alloc/stats", params, result );

    setAllocStatsData( a_reply, result );
}

void
DatabaseClient::setAllocStatsData( Auth::RepoAllocationStatsReply & a_reply, rapidjson::Document & a_result )
{
    AllocStatsData * stats = a_reply.mutable_alloc();
    setAllocStatsData( a_result, *stats );
    /*
    stats->set_repo(a_result["repo"].GetString());
    stats->set_records(a_result["records"].GetUint());
    stats->set_files(a_result["files"].GetUint());
    stats->set_total_sz(a_result["total_sz"].GetUint64());

    rapidjson::Value::MemberIterator imem = a_result.FindMember("histogram");
    for ( rapidjson::SizeType i = 0; i < imem->value.Size(); i++ )
        stats->add_histogram(imem->value[i].GetDouble());
    */
}

void
DatabaseClient::setAllocStatsData( rapidjson::Value & a_value, AllocStatsData & a_stats )
{
    a_stats.set_repo(a_value["repo"].GetString());
    a_stats.set_records(a_value["records"].GetUint());
    a_stats.set_files(a_value["files"].GetUint());
    a_stats.set_total_sz(a_value["total_sz"].GetUint64());

    rapidjson::Value::MemberIterator imem = a_value.FindMember("histogram");
    if ( imem != a_value.MemberEnd() )
    {
        for ( rapidjson::SizeType i = 0; i < imem->value.Size(); i++ )
            a_stats.add_histogram(imem->value[i].GetDouble());
    }
}

void
DatabaseClient::repoAllocationSet( const Auth::RepoAllocationSetRequest & a_request, Anon::AckReply  & a_reply )
{
    (void)a_reply;
    rapidjson::Document result;

    dbGet( "repo/alloc/set", {{"repo",a_request.repo()},{"subject",a_request.subject()},{"max_size",to_string(a_request.max_size())},{"max_count",to_string(a_request.max_count())}}, result );
}

void
DatabaseClient::checkPerms( const CheckPermsRequest & a_request, CheckPermsReply & a_reply )
{
    rapidjson::Document result;
    vector<pair<string,string>> params;
    params.push_back({ "id", a_request.id()});
    if ( a_request.has_perms() )
        params.push_back({ "perms", to_string( a_request.perms()) });

    dbGet( "authz/perm/check", params, result );

    a_reply.set_granted( result["granted"].GetBool() );
}

void
DatabaseClient::getPerms( const GetPermsRequest & a_request, GetPermsReply & a_reply )
{
    rapidjson::Document result;
    vector<pair<string,string>> params;
    params.push_back({ "id", a_request.id()});
    if ( a_request.has_perms() )
        params.push_back({ "perms", to_string( a_request.perms()) });

    dbGet( "authz/perm/get", params, result );

    a_reply.set_granted( result["granted"].GetInt() );
}

void
DatabaseClient::repoAuthz( const Auth::RepoAuthzRequest & a_request, Anon::AckReply  & a_reply )
{
    (void)a_reply;
    rapidjson::Document result;

    dbGet( "authz/gridftp", {{"repo",a_request.repo()},{"file",a_request.file()},{"act",a_request.action()}}, result );
}

void
DatabaseClient::topicList( const Auth::TopicListRequest & a_request, Auth::ListingReply  & a_reply )
{
    rapidjson::Document result;
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

    setListingData( a_reply, result );
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
DatabaseClient::topicLink( const Auth::TopicLinkRequest & a_request, Anon::AckReply  & a_reply )
{
    (void) a_reply;
    rapidjson::Document result;

    dbGet( "topic/link", {{ "topic", a_request.topic() },{ "id", a_request.id() }}, result );
}

void
DatabaseClient::topicUnlink( const Auth::TopicUnlinkRequest & a_request, Anon::AckReply  & a_reply )
{
    (void) a_reply;
    rapidjson::Document result;

    dbGet( "topic/unlink", {{ "topic", a_request.topic() },{ "id", a_request.id() }}, result );
}

/*
uint16_t
DatabaseClient::checkPerms( const string & a_id, uint16_t a_perms )
{
    rapidjson::Document result;

    dbGet( "authz/check", {{"id",a_id},{"perms",to_string( a_perms )}}, result );

    return result["granted"].GetInt();
}
*/

}}
