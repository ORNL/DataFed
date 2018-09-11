#include <zmq.h>
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
DatabaseClient::dbGet( const char * a_url_path, const vector<pair<string,string>> &a_params, rapidjson::Document & a_result )
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

    DL_DEBUG( "url: " << url );

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
            cout << "About to parse[" << res_json << "]" << endl;
            a_result.Parse( res_json.c_str() );
        }

        if ( http_code >= 200 && http_code < 300 )
        {
            if ( a_result.HasParseError() )
            {
                rapidjson::ParseErrorCode ec = a_result.GetParseError();
                cerr << "Parse error: " << rapidjson::GetParseError_En( ec ) << endl;
                EXCEPT( ID_INTERNAL_ERROR, "Invalid JSON returned from DB service" );
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

    DL_DEBUG( "url: " << url );

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
    cout << "dbPost " << a_url_path << " [" << *a_body << "]" << endl;

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

    DL_DEBUG( "url: " << url );

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
            cout << "About to parse[" << res_json << "]" << endl;
            a_result.Parse( res_json.c_str() );
        }

        if ( http_code >= 200 && http_code < 300 )
        {
            if ( a_result.HasParseError() )
            {
                rapidjson::ParseErrorCode ec = a_result.GetParseError();
                cerr << "Parse error: " << rapidjson::GetParseError_En( ec ) << endl;
                EXCEPT( ID_INTERNAL_ERROR, "Invalid JSON returned from DB service" );
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
DatabaseClient::clientAuthenticate( const std::string & a_password )
{
    rapidjson::Document result;

    dbGet( "usr/authn", {{"pw",a_password}}, result );
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
DatabaseClient::userCreate( const Auth::UserCreateRequest & a_request, Auth::UserDataReply & a_reply )
{
    vector<pair<string,string>> params;
    params.push_back({"uid",a_request.uid()});
    params.push_back({"password",a_request.password()});
    params.push_back({"name",a_request.name()});
    params.push_back({"email",a_request.email()});
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

    dbGet( "usr/update", params, result );

    setUserData( a_reply, result );
}


void
DatabaseClient::userListAll( const UserListAllRequest & a_request, UserDataReply & a_reply )
{
    vector<pair<string,string>> params;
    if ( a_request.has_details() && a_request.details() )
        params.push_back({"details","true"});

    rapidjson::Document result;
    dbGet( "usr/list/all", params, result );

    setUserData( a_reply, result );
}

void
DatabaseClient::userListCollab( const UserListCollabRequest & a_request, UserDataReply & a_reply )
{
    (void)a_request;
    rapidjson::Document result;
    dbGet( "usr/list/collab", {}, result );

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

        user = a_reply.add_user();
        user->set_uid( val["uid"].GetString() );
        user->set_name( val["name"].GetString() );

        if (( imem = val.FindMember("email")) != val.MemberEnd() )
            user->set_email( imem->value.GetString() );

        if (( imem = val.FindMember("is_admin")) != val.MemberEnd() )
            user->set_is_admin( imem->value.GetBool() );

        if (( imem = val.FindMember("is_repo_admin")) != val.MemberEnd() )
            user->set_is_repo_admin( imem->value.GetBool() );

        if (( imem = val.FindMember("admins")) != val.MemberEnd() )
        {
            for ( rapidjson::SizeType j = 0; j < imem->value.Size(); j++ )
                user->add_admin( imem->value[j].GetString() );
        }

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
                alloc->set_alloc(alloc_val["alloc"].GetUint64());
                alloc->set_usage(alloc_val["usage"].GetUint64());
                alloc->set_path(alloc_val["path"].GetString());
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
    params.push_back({"domain",a_request.domain()});

    if ( a_request.has_desc() )
        params.push_back({"desc",a_request.desc()});

    if ( a_request.has_repo() )
        params.push_back({"repo",a_request.repo()});

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

    if ( a_request.has_domain() )
        params.push_back({"domain",a_request.domain()});

    if ( a_request.has_desc() )
        params.push_back({"desc",a_request.desc()});

    string members = "[";
    for ( int i = 0; i < a_request.admin_size(); ++i )
    {
        if ( i > 0 )
            members += ",";
        members += "\"" + a_request.admin(i) + "\"";
    }
    members += "]";
    params.push_back({"admins", members });

    members = "[";
    for ( int i = 0; i < a_request.member_size(); ++i )
    {
        if ( i > 0 )
            members += ",";
        members += "\"" + a_request.member(i) + "\"";
    }
    members += "]";
    params.push_back({"members", members });

    dbGet( "prj/update", params, result );

    setProjectData( a_reply, result );
}

void
DatabaseClient::projDelete( const Auth::ProjectDeleteRequest & a_request, Anon::AckReply & a_reply )
{
    (void)a_reply;
    rapidjson::Document result;
    dbGet( "prj/delete", {{"id",a_request.id()}}, result );
}

void
DatabaseClient::projView( const Auth::ProjectViewRequest & a_request, Auth::ProjectDataReply & a_reply )
{
    rapidjson::Document result;
    dbGet( "prj/view", {{"id",a_request.id()}}, result );

    setProjectData( a_reply, result );
}

void
DatabaseClient::projList( const Auth::ProjectListRequest & a_request, Auth::ProjectDataReply & a_reply )
{
    rapidjson::Document result;
    vector<pair<string,string>> params;
    if ( a_request.has_by_owner() && a_request.by_owner() )
        params.push_back({"by_owner","true"});
    if ( a_request.has_by_admin() && a_request.by_admin() )
        params.push_back({"by_admin","true"});
    if ( a_request.has_by_member() && a_request.by_member() )
        params.push_back({"by_member","true"});

    dbGet( "prj/list", params, result );

    setProjectData( a_reply, result );
}

void
DatabaseClient::setProjectData( ProjectDataReply & a_reply, rapidjson::Document & a_result )
{
    if ( !a_result.IsArray() )
    {
        EXCEPT( ID_INTERNAL_ERROR, "Invalid JSON returned from DB service" );
    }

    ProjectData* proj;
    AllocData* alloc;
    rapidjson::Value::MemberIterator imem;

    for ( rapidjson::SizeType i = 0; i < a_result.Size(); i++ )
    {
        rapidjson::Value & val = a_result[i];

        proj = a_reply.add_proj();
        proj->set_id( val["id"].GetString() );
        proj->set_title( val["title"].GetString() );

        if (( imem = val.FindMember("domain")) != val.MemberEnd() )
            proj->set_domain( imem->value.GetString() );

        if (( imem = val.FindMember("desc")) != val.MemberEnd() )
            proj->set_desc( imem->value.GetString() );

        if (( imem = val.FindMember("owner")) != val.MemberEnd() )
            proj->set_owner( imem->value.GetString() );

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
                alloc->set_alloc(alloc_val["alloc"].GetUint64());
                alloc->set_usage(alloc_val["usage"].GetUint64());
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
    if ( a_request.has_scope() )
        params.push_back({"scope",to_string(a_request.scope())});

    dbGet( "/dat/search", params, result );

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

    string body = "{\"title\":\"" + a_request.title() + "\"";
    if ( a_request.has_desc() )
        body += ",\"desc\":\"" + a_request.desc() + "\"";
    if ( a_request.has_alias() )
        body += ",\"alias\":\"" + a_request.alias() + "\"";
    if ( a_request.has_metadata() )
        body += ",\"md\":" + a_request.metadata();
    if ( a_request.has_parent_id() )
        body += ",\"parent\":\"" + a_request.parent_id() + "\"";
    if ( a_request.has_repo_id() )
        body += ",\"repo\":\"" + a_request.repo_id() + "\"";
    body += "}";

    dbPost( "dat/create", {}, &body, result );

    setRecordData( a_reply, result );
}

void
DatabaseClient::recordUpdate( const Auth::RecordUpdateRequest & a_request, Auth::RecordDataReply & a_reply )
{
    rapidjson::Document result;

    string body = "{\"id\":\"" + a_request.id() + "\"";
    if ( a_request.has_title() )
        body += ",\"title\":\"" + a_request.title() + "\"";
    if ( a_request.has_desc() )
        body += ",\"desc\":\"" + a_request.desc() + "\"";
    if ( a_request.has_alias() )
        body += ",\"alias\":\"" + a_request.alias() + "\"";
    if ( a_request.has_metadata() )
    {
        body += ",\"md\":" + a_request.metadata();
        if ( a_request.has_mdset() )
            body += ",\"mdset\":" + a_request.mdset()?"true":"false";
    }
    if ( a_request.has_ispublic() )
        body += ",\"public\":" + a_request.ispublic()?"true":"false";
    if ( a_request.has_data_size() )
        body += ",\"data_size\":" + to_string(a_request.data_size());
    if ( a_request.has_data_time() )
        body += ",\"data_time\":" + to_string(a_request.data_time());
    body += "}";

    dbPost( "dat/update", {}, &body, result );

    setRecordData( a_reply, result );
}

void
DatabaseClient::recordDelete( const Auth::RecordDeleteRequest & a_request, Auth::RecordDataLocationReply & a_reply )
{
    rapidjson::Document result;

    dbGet( "dat/delete", {{"id",a_request.id()}}, result );

    setRecordLocationData( a_reply, result );
}

void
DatabaseClient::recordGetDataLocation( const Auth::RecordGetDataLocationRequest & a_request, Auth::RecordDataLocationReply & a_reply )
{
    rapidjson::Document result;

    dbGet( "dat/loc", {{"id",a_request.id()}}, result );

    setRecordLocationData( a_reply, result );
}

void
DatabaseClient::setRecordLocationData( RecordDataLocationReply & a_reply, rapidjson::Document & a_result )
{
    if ( !a_result.IsArray() )
    {
        EXCEPT( ID_INTERNAL_ERROR, "Invalid JSON returned from DB service" );
    }

    RecordDataLocation* loc;

    for ( rapidjson::SizeType i = 0; i < a_result.Size(); i++ )
    {
        rapidjson::Value & val = a_result[i];

        loc = a_reply.add_location();
        loc->set_id( val["id"].GetString() );
        loc->set_repo_id( val["repo_id"].GetString() );
        loc->set_path( val["path"].GetString() );
    }
}

void
DatabaseClient::setRecordData( RecordDataReply & a_reply, rapidjson::Document & a_result )
{
    //cout << "SetRecordData" << endl;

    if ( !a_result.IsArray() )
    {
        EXCEPT( ID_INTERNAL_ERROR, "Invalid JSON returned from DB service" );
    }

    RecordData* rec;
    rapidjson::Value::MemberIterator imem;

    for ( rapidjson::SizeType i = 0; i < a_result.Size(); i++ )
    {
        rapidjson::Value & val = a_result[i];

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

        if (( imem = val.FindMember("desc")) != val.MemberEnd() )
            rec->set_desc( imem->value.GetString() );

        if (( imem = val.FindMember("public")) != val.MemberEnd() )
            rec->set_ispublic( imem->value.GetBool() );

        if (( imem = val.FindMember("md")) != val.MemberEnd() )
        {
            rapidjson::StringBuffer buffer;
            rapidjson::PrettyWriter<rapidjson::StringBuffer> writer(buffer);
            imem->value.Accept(writer);
            rec->set_metadata( buffer.GetString() );
            //rec->set_metadata( imem->value.GetString() );
        }

        //if (( imem = val.FindMember("data_path")) != val.MemberEnd() )
        //    rec->set_data_path( imem->value.GetString() );
        if (( imem = val.FindMember("repo_id")) != val.MemberEnd() )
            rec->set_repo_id( imem->value.GetString() );

        if (( imem = val.FindMember("data_size")) != val.MemberEnd() )
            rec->set_data_size( imem->value.GetUint64() );

        if (( imem = val.FindMember("data_time")) != val.MemberEnd() )
            rec->set_data_time( imem->value.GetUint() );

        if (( imem = val.FindMember("rec_time")) != val.MemberEnd() )
            rec->set_rec_time( imem->value.GetUint() );
    }
    //cout << "SetRecordData done" << endl;
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
DatabaseClient::collCreate( const Auth::CollCreateRequest & a_request, Auth::CollDataReply & a_reply )
{
    rapidjson::Document result;

    string body = "{\"title\":\"" + a_request.title() + "\"";
    if ( a_request.has_desc() )
        body += ",\"desc\":\"" + a_request.desc() + "\"";
    if ( a_request.has_alias() )
        body += ",\"alias\":\"" + a_request.alias() + "\"";
    if ( a_request.has_parent_id() )
        body += ",\"parent\":\"" + a_request.parent_id() + "\"";
    if ( a_request.has_ispublic() )
        body += ",\"public\":" + a_request.ispublic()?"true":"false";
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
        body += ",\"title\":\"" + a_request.title() + "\"";
    if ( a_request.has_desc() )
        body += ",\"desc\":\"" + a_request.desc() + "\"";
    if ( a_request.has_alias() )
        body += ",\"alias\":\"" + a_request.alias() + "\"";
    if ( a_request.has_ispublic() )
        body += ",\"public\":" + a_request.ispublic()?"true":"false";
    body += "}";

    dbPost( "col/update", {}, &body, result );

    setCollData( a_reply, result );
}

void
DatabaseClient::collDelete( const Auth::CollDeleteRequest & a_request, Auth::RecordDataLocationReply & a_reply )
{
    (void)a_reply;
    rapidjson::Document result;

    const char * mode;
    if ( a_request.mode() == CDM_ALL )
        mode = "all";
    else
        mode = "owned";

    dbGet( "col/delete", {{"id",a_request.id()},{"mode",mode}}, result );

    setRecordLocationData( a_reply, result );
}

void
DatabaseClient::collView( const Auth::CollViewRequest & a_request, Auth::CollDataReply & a_reply )
{
    rapidjson::Document result;

    dbGet( "col/view", {{"id",a_request.id()}}, result );

    setCollData( a_reply, result );
}

void
DatabaseClient::collRead( const CollReadRequest & a_request, CollDataReply & a_reply )
{
    rapidjson::Document result;
    const char * mode = "a";
    if ( a_request.has_mode() )
    {
        if ( a_request.mode() == CRM_DATA )
            mode = "d";
        else if ( a_request.mode() == CRM_COLL )
            mode = "c";
    }

    dbGet( "col/read", {{"id",a_request.id()},{"mode",mode}}, result );

    setCollData( a_reply, result );
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
DatabaseClient::collGetParents( const Auth::CollGetParentsRequest & a_request, Auth::CollDataReply & a_reply )
{
    rapidjson::Document result;

    dbGet( "col/get_parents", {{"id",a_request.id()}}, result );

    setCollData( a_reply, result );
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

        coll = a_reply.add_data();
        coll->set_id( val["id"].GetString() );
        coll->set_title( val["title"].GetString() );

        if (( imem = val.FindMember("desc")) != val.MemberEnd() )
            coll->set_desc( imem->value.GetString() );
        if (( imem = val.FindMember("public")) != val.MemberEnd() )
            coll->set_ispublic( imem->value.GetBool() );

        if (( imem = val.FindMember("alias")) != val.MemberEnd() )
        {
            if ( !imem->value.IsNull() )
            {
                coll->set_alias( imem->value.GetString() );
            }
        }


        if (( imem = val.FindMember("owner")) != val.MemberEnd() )
            coll->set_owner( imem->value.GetString() );
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
    rapidjson::Value::MemberIterator imem;

    for ( rapidjson::SizeType i = 0; i < a_result.Size(); i++ )
    {
        rapidjson::Value & val = a_result[i];

        item = a_reply.add_item();
        item->set_id( val["id"].GetString() );
        item->set_title( val["title"].GetString() );
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

    dbGet( "xfr/list", params, result );

    setXfrData( a_reply, result );
}

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

        imem = val.FindMember("task_id");
        if ( imem != val.MemberEnd() )
            xfr->set_task_id( imem->value.GetString() );

        imem = val.FindMember("err_msg");
        if ( imem != val.MemberEnd() )
            xfr->set_err_msg( imem->value.GetString() );
    }
}

void
DatabaseClient::xfrInit( const std::string & a_id, const std::string & a_data_path, XfrMode a_mode, Auth::XfrDataReply & a_reply )
{
    rapidjson::Document result;

    dbGet( "xfr/init", {{"id",a_id},{"path",a_data_path},{"mode",to_string(a_mode)}}, result );

    setXfrData( a_reply, result );
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
        cout << "Adding group members: ";
        string members = "[";
        for ( int i = 0; i < a_request.add_uid_size(); ++i )
        {
            if ( i > 0 )
                members += ",";
            members += "\"" + a_request.add_uid(i) + "\"";
            cout << " " << a_request.add_uid(i);
        }
        members += "]";
        params.push_back({"add",  members });
        cout << endl;
    }
    if ( a_request.rem_uid_size() > 0 )
    {
        cout << "Removing group members: ";
        string members = "[";
        for ( int i = 0; i < a_request.rem_uid_size(); ++i )
        {
            if ( i > 0 )
                members += ",";
            members += "\"" + a_request.rem_uid(i) + "\"";
            cout << " " << a_request.rem_uid(i);
        }
        members += "]";
        params.push_back({"rem",  members });
        cout << endl;
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
    if ( a_request.has_admin() )
        params.push_back({"admin", a_request.admin()});
    if ( a_request.has_details() )
        params.push_back({"details", a_request.details()?"true":"false"});

    dbGet( "repo/list", params, result );

    setRepoData( &a_reply, 0, result );
}

void
DatabaseClient::repoList( std::vector<RepoData*> & a_repos )
{
    rapidjson::Document result;

    dbGet( "repo/list", {{"details","true"}}, result );

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
DatabaseClient::repoUpdate( const Auth::RepoUpdateRequest & a_request, Anon::AckReply  & a_reply )
{
    (void) a_reply;

    rapidjson::Document result;
    vector<pair<string,string>> params;
    params.push_back({"id", a_request.id()});
    if ( a_request.has_title() )
        params.push_back({"title", a_request.title()});
    if ( a_request.has_desc() )
        params.push_back({"desc", a_request.desc()});
    if ( a_request.has_capacity() )
        params.push_back({"capacity", to_string( a_request.capacity() )});
    if ( a_request.admin_size() > 0 )
    {
        string admins = "[";
        for ( int i = 0; i < a_request.admin_size(); ++i )
        {
            if ( i > 0 )
                admins += ",";
            admins += "\"" + a_request.admin(i) + "\"";
        }
        admins += "]";
        params.push_back({"admins", admins });
    }

    dbGet( "repo/update", params, result );
}

void
DatabaseClient::setRepoData( Auth::RepoDataReply * a_reply, std::vector<RepoData*> * a_repos, rapidjson::Document & a_result )
{
    if ( !a_reply && !a_repos )
        EXCEPT( ID_INTERNAL_ERROR, "Missing parameters" );

    if ( !a_result.IsArray() )
        EXCEPT( ID_INTERNAL_ERROR, "Invalid JSON returned from DB service" );

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
DatabaseClient::repoListUserAllocations( const Auth::RepoListUserAllocationsRequest & a_request, Auth::RepoAllocationsReply  & a_reply )
{
    (void)a_request;

    rapidjson::Document result;

    dbGet( "repo/alloc/list/by_owner", {{"owner",m_client_uid}}, result );

    setAllocData( a_reply, result );
}


void
DatabaseClient::repoListProjectAllocations( const Auth::RepoListProjectAllocationsRequest & a_request, Auth::RepoAllocationsReply  & a_reply )
{
    rapidjson::Document result;

    dbGet( "repo/alloc/list/by_owner", {{"owner",a_request.id()}}, result );

    setAllocData( a_reply, result );
}

void
DatabaseClient::repoListOwnerAllocations( const Auth::RepoListOwnerAllocationsRequest & a_request, Auth::RepoAllocationsReply  & a_reply )
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
    rapidjson::Value::MemberIterator imem;

    for ( rapidjson::SizeType i = 0; i < a_result.Size(); i++ )
    {
        rapidjson::Value & val = a_result[i];

        alloc = a_reply.add_alloc();
        alloc->set_repo(val["repo"].GetString());
        alloc->set_alloc(val["alloc"].GetUint64());
        alloc->set_usage(val["usage"].GetUint64());
        alloc->set_path(val["path"].GetString());
        if (( imem = val.FindMember("id")) != val.MemberEnd() )
            alloc->set_id( imem->value.GetString() );
        if (( imem = val.FindMember("name")) != val.MemberEnd() )
            alloc->set_name( imem->value.GetString() );
    }
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
    AllocStatsData * stats;

    stats = a_reply.mutable_alloc();
    stats->set_records(a_result["records"].GetUint());
    stats->set_files(a_result["files"].GetUint());
    stats->set_total_sz(a_result["total_sz"].GetUint64());

    rapidjson::Value::MemberIterator imem = a_result.FindMember("histogram");
    for ( rapidjson::SizeType i = 0; i < imem->value.Size(); i++ )
        stats->add_histogram(imem->value[i].GetDouble());
}

void
DatabaseClient::repoAllocationSet( const Auth::RepoAllocationSetRequest & a_request, Anon::AckReply  & a_reply )
{
    (void)a_reply;
    rapidjson::Document result;

    dbGet( "repo/alloc/set", {{"repo",a_request.repo()},{"subject",a_request.subject()},{"alloc",to_string(a_request.alloc())}}, result );
}

void
DatabaseClient::checkPerms( const CheckPermsRequest & a_request, CheckPermsReply & a_reply )
{
    rapidjson::Document result;

    dbGet( "authz/check", {{"id",a_request.id()},{"perms",to_string( a_request.perms()) }}, result );

    a_reply.set_granted( result["granted"].GetInt() );
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
