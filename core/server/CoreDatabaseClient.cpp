#include "DynaLog.hpp"
#include "TraceException.hpp"
#include "CoreDatabaseClient.hpp"

using namespace std;

namespace SDMS {
namespace Core {

using namespace SDMS::Auth;

size_t curlResponseWriteCB( char *ptr, size_t size, size_t nmemb, void *userdata )
{
    size_t len = size*nmemb;
    //strncat( userdata, ptr, len );
    ((string*)userdata)->append( ptr, len );
    return len;
}


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
    m_client = curl_easy_escape( m_curl, a_client.c_str(), 0 );
}

long
DatabaseClient::dbGet( const char * a_url_path, const vector<pair<string,string>> &a_params, rapidjson::Document & a_result )
{
    cout << "dbGet" << endl;

    string  url;
    string  res_json;
    char    error[CURL_ERROR_SIZE];
    cout << "dbGet 1.1" << endl;

    error[0] = 0;

    url.reserve( 512 );
    cout << "dbGet 1.2" << endl;

    // TODO Get URL base from ctor
    url.append( m_db_url );
    url.append( a_url_path );
    url.append( "?client=" );
    cout << "dbGet 1.3 " << endl;
    url.append( m_client );

    char * esc_txt;
    cout << "dbGet 2" << endl;

    for ( vector<pair<string,string>>::const_iterator iparam = a_params.begin(); iparam != a_params.end(); ++iparam )
    {
        cout << "dbGet 2.1" << endl;

        url.append( "&" );
        url.append( iparam->first.c_str() );
        url.append( "=" );
        esc_txt = curl_easy_escape( m_curl, iparam->second.c_str(), 0 );
        url.append( esc_txt );
        curl_free( esc_txt );
    }
    cout << "dbGet 3" << endl;

    DL_DEBUG( "url: " << url );

    curl_easy_setopt( m_curl, CURLOPT_URL, url.c_str() );
    curl_easy_setopt( m_curl, CURLOPT_WRITEDATA, &res_json );
    curl_easy_setopt( m_curl, CURLOPT_ERRORBUFFER, error );

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
                EXCEPT_PARAM( ID_BAD_REQUEST, "Bad request: " << a_result["errorMessage"].GetString() );
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

    rapidjson::Value::MemberIterator imem;

    // TODO Not sure if this check is needed
    if ( result.Size() != 1 )
        EXCEPT_PARAM( ID_BAD_REQUEST, "No such data record: " << a_data_id );

    rapidjson::Value & val = result[0];

    string id = val["id"].GetString();

    return string("/data/") + id.substr(2);
}

void
DatabaseClient::userView( const UserViewRequest & a_request, UserDataReply & a_reply )
{
    vector<pair<string,string>> params;
    params.push_back({"subject",a_request.uid()});
    if ( a_request.has_details() && a_request.details() )
        params.push_back({"details","true"});

    rapidjson::Document result;
    long http_code = dbGet( "usr/view", params, result );

    if ( http_code >= 200 && http_code < 300 )
    {
        setUserData( a_reply, result );
    }
}


void
DatabaseClient::userUpdate( const UserUpdateRequest & a_request, UserDataReply & a_reply )
{
    rapidjson::Document result;
    long http_code;

    vector<pair<string,string>> params;
    params.push_back({"subject",a_request.uid()});
    if ( a_request.has_name() )
        params.push_back({"name",a_request.name()});
    if ( a_request.has_email() )
        params.push_back({"email",a_request.email()});
    if ( a_request.has_globus_id() )
        params.push_back({"globus_id",a_request.globus_id()});

    http_code = dbGet( "usr/update", params, result );

    if ( http_code >= 200 && http_code < 300 )
    {
        setUserData( a_reply, result );
    }
}


void
DatabaseClient::userList( const UserListRequest & a_request, UserDataReply & a_reply )
{
    vector<pair<string,string>> params;
    if ( a_request.has_details() && a_request.details() )
        params.push_back({"details","true"});

    rapidjson::Document result;
    long http_code = dbGet( "usr/list", params, result );

    if ( http_code >= 200 && http_code < 300 )
    {
        setUserData( a_reply, result );
    }
}

void
DatabaseClient::userFindByUUIDs( const Auth::UserFindByUUIDsRequest & a_request, Auth::UserDataReply & a_reply )
{
    cout << "userFindByUUIDs" << endl;
    string uuids = "[";

    cout << "uuids: " << a_request.uuid_size() << endl;

    for ( int i = 0; i < a_request.uuid_size(); i++ )
    {
        cout << i << " " << a_request.uuid(i) << endl;
        if ( i )
            uuids += ",";
        uuids += "\"" + a_request.uuid(i) + "\"";
    }

    uuids += "]";
    cout << "uuids " << uuids << endl;

    rapidjson::Document result;
    long http_code = dbGet( "usr/find/by_uuids", {{"uuids",uuids}}, result );

    if ( http_code >= 200 && http_code < 300 )
    {
        setUserData( a_reply, result );
    }
}

void
DatabaseClient::setUserData( UserDataReply & a_reply, rapidjson::Document & a_result )
{
    if ( !a_result.IsArray() )
    {
        EXCEPT( ID_INTERNAL_ERROR, "Invalid JSON returned from DB service" );
    }

    UserData* user;
    rapidjson::Value::MemberIterator imem;

    for ( rapidjson::SizeType i = 0; i < a_result.Size(); i++ )
    {
        rapidjson::Value & val = a_result[i];

        user = a_reply.add_user();
        user->set_uid( val["uid"].GetString() );
        user->set_name( val["name"].GetString() );

        if (( imem = val.FindMember("globus_id")) != val.MemberEnd() )
            user->set_globus_id( imem->value.GetString() );

        if (( imem = val.FindMember("email")) != val.MemberEnd() )
            user->set_email( imem->value.GetString() );

        if (( imem = val.FindMember("is_admin")) != val.MemberEnd() )
            user->set_is_admin( imem->value.GetBool() );

        if (( imem = val.FindMember("is_project")) != val.MemberEnd() )
            user->set_is_project( imem->value.GetBool() );

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
    }
}

void
DatabaseClient::recordList( const RecordListRequest & a_request, RecordDataReply & a_reply )
{
    (void) a_request;

    rapidjson::Document result;

    dbGet( "dat/list", {}, result );

    setRecordData( a_reply, result );
}

void
DatabaseClient::recordView( const RecordViewRequest & a_request, RecordDataReply & a_reply )
{
    rapidjson::Document result;

    dbGet( "dat/view", {{"id",a_request.id()}}, result );

    setRecordData( a_reply, result );
}

void
DatabaseClient::recordFind( const RecordFindRequest & a_request, RecordDataReply & a_reply )
{
    rapidjson::Document result;

    dbGet( "dat/find", {{"query",a_request.query()}}, result );

    setRecordData( a_reply, result );
}

void
DatabaseClient::recordCreate( const Auth::RecordCreateRequest & a_request, Auth::RecordDataReply & a_reply )
{
    rapidjson::Document result;

    vector<pair<string,string>> params;
    params.push_back({"title",a_request.title()});
    if ( a_request.has_desc() )
        params.push_back({"desc",a_request.desc()});
    if ( a_request.has_alias() )
        params.push_back({"alias",a_request.alias()});
    if ( a_request.has_metadata() )
        params.push_back({"md",a_request.metadata()});
    if ( a_request.has_proj_id() )
        params.push_back({"proj",a_request.proj_id()});
    if ( a_request.has_coll_id() )
        params.push_back({"coll",a_request.coll_id()});

    dbGet( "dat/create", params, result );

    setRecordData( a_reply, result );
}

void
DatabaseClient::recordUpdate( const Auth::RecordUpdateRequest & a_request, Auth::RecordDataReply & a_reply )
{
    rapidjson::Document result;

    vector<pair<string,string>> params;
    params.push_back({"id",a_request.id()});
    if ( a_request.has_title() )
        params.push_back({"title",a_request.title()});
    if ( a_request.has_desc() )
        params.push_back({"desc",a_request.desc()});
    if ( a_request.has_alias() )
        params.push_back({"alias",a_request.alias()});
    if ( a_request.has_metadata() )
        params.push_back({"md",a_request.metadata()});
    if ( a_request.has_md_merge() )
        params.push_back({"md_merge",a_request.md_merge()?"true":"false"});
    if ( a_request.has_proj_id() )
        params.push_back({"proj",a_request.proj_id()});
    if ( a_request.has_data_size() )
        params.push_back({"data_size",to_string(a_request.data_size())});
    if ( a_request.has_data_time() )
        params.push_back({"data_time",to_string(a_request.data_time())});
    if ( a_request.has_subject() )
        params.push_back({"subject",a_request.subject()});

    dbGet( "dat/update", params, result );

    setRecordData( a_reply, result );
}

void
DatabaseClient::recordDelete( const Auth::RecordDeleteRequest & a_request, Auth::RecordDeleteReply & a_reply )
{
    (void)a_reply;
    rapidjson::Document result;

    dbGet( "dat/delete", {{"id",a_request.id()}}, result );

    if ( !result.IsArray() || result.Size() != 1 )
    {
        EXCEPT( ID_INTERNAL_ERROR, "Invalid JSON returned from DB service" );
    }

    rapidjson::Value & val = result[0];

    a_reply.set_id( val["id"].GetString() );
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

        rec = a_reply.add_record();
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

        if (( imem = val.FindMember("md")) != val.MemberEnd() )
        {
            rapidjson::StringBuffer buffer;
            rapidjson::PrettyWriter<rapidjson::StringBuffer> writer(buffer);
            imem->value.Accept(writer);
            rec->set_metadata( buffer.GetString() );
            //rec->set_metadata( imem->value.GetString() );
        }

        if (( imem = val.FindMember("data_path")) != val.MemberEnd() )
            rec->set_data_path( imem->value.GetString() );

        if (( imem = val.FindMember("data_size")) != val.MemberEnd() )
            rec->set_data_size( imem->value.GetInt() );

        if (( imem = val.FindMember("data_time")) != val.MemberEnd() )
            rec->set_data_time( imem->value.GetInt() );

        if (( imem = val.FindMember("rec_time")) != val.MemberEnd() )
            rec->set_rec_time( imem->value.GetInt() );
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

    vector<pair<string,string>> params;
    params.push_back({"title",a_request.title()});
    if ( a_request.has_desc() )
        params.push_back({"desc",a_request.desc()});
    if ( a_request.has_alias() )
        params.push_back({"alias",a_request.alias()});
    if ( a_request.has_proj_id() )
        params.push_back({"proj",a_request.proj_id()});
    if ( a_request.has_coll_id() )
        params.push_back({"coll",a_request.coll_id()});

    dbGet( "col/create", params, result );

    setCollData( a_reply, result );
}

void
DatabaseClient::collUpdate( const Auth::CollUpdateRequest & a_request, Auth::CollDataReply & a_reply )
{
    rapidjson::Document result;

    vector<pair<string,string>> params;
    params.push_back({"id",a_request.id()});
    if ( a_request.has_title() )
        params.push_back({"title",a_request.title()});
    if ( a_request.has_desc() )
        params.push_back({"desc",a_request.desc()});
    if ( a_request.has_alias() )
        params.push_back({"alias",a_request.alias()});
    if ( a_request.has_proj_id() )
        params.push_back({"proj",a_request.proj_id()});

    dbGet( "col/update", params, result );

    setCollData( a_reply, result );
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
        if ( a_request.mode() == CM_DATA )
            mode = "d";
        else if ( a_request.mode() == CM_COLL )
            mode = "c";
    }

    dbGet( "col/read", {{"id",a_request.id()},{"mode",mode}}, result );

    setCollData( a_reply, result );
}

void
DatabaseClient::collWrite( const CollWriteRequest & a_request, Anon::AckReply & a_reply )
{
    (void) a_reply;

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

        if (( imem = val.FindMember("alias")) != val.MemberEnd() )
        {
            if ( !imem->value.IsNull() )
                coll->set_alias( imem->value.GetString() );
        }

        if (( imem = val.FindMember("owner")) != val.MemberEnd() )
            coll->set_owner( imem->value.GetString() );
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
        xfr->set_globus_id( val["globus_id"].GetString() );
        xfr->set_updated( val["updated"].GetInt() );

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
    (void) a_reply;

    rapidjson::Document result;

    dbGet( "acl/update", {{"id",a_request.id()},{"rules",a_request.rules()}}, result );

    setACLData( a_reply, result );
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
        imem = val.FindMember("inh_grant");
        if ( imem != val.MemberEnd() )
            rule->set_inh_grant( imem->value.GetInt() );
        imem = val.FindMember("inh_deny");
        if ( imem != val.MemberEnd() )
            rule->set_inh_deny( imem->value.GetInt() );
    }
}

void
DatabaseClient::groupCreate( const Auth::GroupCreateRequest & a_request, Auth::GroupDataReply & a_reply )
{
    rapidjson::Document result;

    vector<pair<string,string>> params;
    params.push_back({"id", a_request.group().gid()});
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
    params.push_back({"id", a_request.gid()});
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

    dbGet( "grp/delete", {{"id",a_request.gid()}}, result );
}

void
DatabaseClient::groupList( const Auth::GroupListRequest & a_request, Auth::GroupDataReply & a_reply )
{
    (void) a_request;

    rapidjson::Document result;

    dbGet( "grp/list", {}, result );

    setGroupData( a_reply, result );
}

void
DatabaseClient::groupView( const Auth::GroupViewRequest & a_request, Auth::GroupDataReply & a_reply )
{
    rapidjson::Document result;

    dbGet( "grp/view", {{"id",a_request.gid()}}, result );

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
        if ( imem != val.MemberEnd() )
            group->set_uid( val["uid"].GetString() );
        imem = val.FindMember("title");
        if ( imem != val.MemberEnd() )
            group->set_title( imem->value.GetString() );
        imem = val.FindMember("desc");
        if ( imem != val.MemberEnd() )
            group->set_desc( imem->value.GetString() );
        imem = val.FindMember("members");
        if ( imem != val.MemberEnd() )
        {
            for ( rapidjson::SizeType m = 0; m < imem->value.Size(); m++ )
                group->add_member( imem->value[m].GetString() );
        }
    }
}


/*
void
DatabaseClient::checkPerms( const CheckPermsRequest & a_request, CheckPermsReply & a_reply )
{
    rapidjson::Document result;

    dbGet( "authz/check", {{"id",a_request.id()},{"perms",to_string( a_request.perms()) }}, result );

    a_reply.set_granted( result["granted"].GetInt() );
}

uint16_t
DatabaseClient::checkPerms( const string & a_id, uint16_t a_perms )
{
    rapidjson::Document result;

    dbGet( "authz/check", {{"id",a_id},{"perms",to_string( a_perms )}}, result );

    return result["granted"].GetInt();
}
*/

}}
