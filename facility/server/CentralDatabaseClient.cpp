#include <string>
#include <vector>
#include <curl/curl.h>
#include <rapidjson/document.h>
#include <rapidjson/stringbuffer.h>
#include <rapidjson/prettywriter.h>
#include "DynaLog.hpp"
#include "TraceException.hpp"
#include "CentralDatabaseClient.hpp"

using namespace std;

namespace SDMS {

using namespace SDMS::Auth;

size_t curlResponseWriteCB( char *ptr, size_t size, size_t nmemb, void *userdata )
{
    size_t len = size*nmemb;
    //strncat( userdata, ptr, len );
    ((string*)userdata)->append( ptr, len );
    return len;
}


class CentralDatabaseClientImpl
{
public:
    CentralDatabaseClientImpl() :
        m_client(0)
    {
        m_curl = curl_easy_init();
        if ( !m_curl )
            EXCEPT( ID_INTERNAL_ERROR, "libcurl init failed" );

        curl_easy_setopt( m_curl, CURLOPT_HTTP_VERSION, CURL_HTTP_VERSION_1_1 );
        curl_easy_setopt( m_curl, CURLOPT_USERNAME, "root" );
        curl_easy_setopt( m_curl, CURLOPT_PASSWORD, "nopass" );
        curl_easy_setopt( m_curl, CURLOPT_WRITEFUNCTION, curlResponseWriteCB );
        curl_easy_setopt( m_curl, CURLOPT_SSL_VERIFYPEER, 0 );
        curl_easy_setopt( m_curl, CURLOPT_TCP_NODELAY, 1 );
    }

    ~CentralDatabaseClientImpl()
    {
        if ( m_client )
            curl_free( m_client );

        curl_easy_cleanup( m_curl );
    }

    void setClient( const std::string & a_client )
    {
        m_client = curl_easy_escape( m_curl, a_client.c_str(), 0 );
    }

    long dbGet( const char * a_url_path, const vector<pair<string,string>> &a_params, rapidjson::Document & a_result )
    {
        string  url;
        string  res_json;
        char    error[CURL_ERROR_SIZE];

        error[0] = 0;

        url.reserve( 512 );

        // TODO Get URL base from ctor
        url.append( "https://localhost:8529/_db/sdms/api/" );
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

        CURLcode res = curl_easy_perform( m_curl );

        long http_code = 0;
        curl_easy_getinfo( m_curl, CURLINFO_RESPONSE_CODE, &http_code );

        if ( res == CURLE_OK )
        {
            if ( res_json.size() )
            {
                cout << "About to parse[" << res_json << "]" << endl;
                a_result.Parse( res_json.c_str() );
                //cout << "parse done" << endl;
            }

            if ( http_code >= 200 && http_code < 300 )
            {
                if ( a_result.HasParseError() )
                {
                    EXCEPT( ID_INTERNAL_ERROR, "Invalid JSON returned from DB service" );
                }

                return http_code;
            }
            else
            {
                if ( !a_result.HasParseError() && a_result.HasMember( "errorMessage" ))
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

    void checkPerms( const CheckPermsRequest & a_request, CheckPermsReply & a_reply )
    {
        rapidjson::Document result;

        dbGet( "authz/check", {{"id",a_request.id()},{"perms",to_string( a_request.perms()) }}, result );

        a_reply.set_granted( result["granted"].GetInt() );
    }

    uint16_t checkPerms( const string & a_id, uint16_t a_perms )
    {
        rapidjson::Document result;

        dbGet( "authz/check", {{"id",a_id},{"perms",to_string( a_perms )}}, result );

        return result["granted"].GetInt();
    }

    void userView( const UserViewRequest & a_request, UserDataReply & a_reply )
    {
        rapidjson::Document result;
        long http_code;

        if ( a_request.has_user() )
            http_code = dbGet( "usr/view", {{"subject",a_request.user()}}, result );
        else
            http_code = dbGet( "usr/view", {}, result );

        if ( http_code >= 200 && http_code < 300 )
        {
            setUserData( a_reply, result );
        }
    }

    void userList( const UserListRequest & a_request, UserDataReply & a_reply )
    {
        (void)a_request;

        rapidjson::Document result;

        long http_code = dbGet( "usr/list", {}, result );

        if ( http_code >= 200 && http_code < 300 )
        {
            setUserData( a_reply, result );
        }
    }

    void setUserData( UserDataReply & a_reply, rapidjson::Document & a_result )
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
            user->set_name_last( val["name_last"].GetString() );
            user->set_name_first( val["name_first"].GetString() );

            if (( imem = val.FindMember("globus_id")) != val.MemberEnd() )
                user->set_globus_id( imem->value.GetString() );

            if (( imem = val.FindMember("email")) != val.MemberEnd() )
                user->set_email( imem->value.GetString() );

            if (( imem = val.FindMember("is_admin")) != val.MemberEnd() )
                user->set_is_admin( imem->value.GetBool() );

            if (( imem = val.FindMember("is_project")) != val.MemberEnd() )
                user->set_is_project( imem->value.GetBool() );
        }
    }

    void recordView( const RecordViewRequest & a_request, RecordDataReply & a_reply )
    {
        rapidjson::Document result;

        dbGet( "dat/view", {{"id",a_request.id()}}, result );

        setRecordData( a_reply, result );
    }

    void recordFind( const RecordFindRequest & a_request, RecordDataReply & a_reply )
    {
        rapidjson::Document result;

        dbGet( "dat/find", {{"query",a_request.query()}}, result );

        setRecordData( a_reply, result );
    }

    void recordCreate( const Auth::RecordCreateRequest & a_request, Auth::RecordDataReply & a_reply )
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

    void recordUpdate( const Auth::RecordUpdateRequest & a_request, Auth::RecordDataReply & a_reply )
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

        dbGet( "dat/update", params, result );

        setRecordData( a_reply, result );
    }

    void setRecordData( RecordDataReply & a_reply, rapidjson::Document & a_result )
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
                rec->set_alias( imem->value.GetString() );

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
        }
        //cout << "SetRecordData done" << endl;
    }


    void collList( const CollListRequest & a_request, CollDataReply & a_reply )
    {
        rapidjson::Document result;

        if ( a_request.has_user() )
            dbGet( "col/priv/list", {{"subject",a_request.user()}}, result );
        else
             dbGet( "col/priv/list", {}, result );

        setCollData( a_reply, result );
    }

    void collRead( const CollReadRequest & a_request, CollDataReply & a_reply )
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

    void collWrite( const CollWriteRequest & a_request, Anon::AckReply & a_reply )
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

    void setCollData( CollDataReply & a_reply, rapidjson::Document & a_result )
    {
        if ( !a_result.IsArray() )
        {
            EXCEPT( ID_INTERNAL_ERROR, "Invalid JSON returned from DB service" );
        }

        CollData* coll;

        for ( rapidjson::SizeType i = 0; i < a_result.Size(); i++ )
        {
            rapidjson::Value & val = a_result[i];

            coll = a_reply.add_coll();
            coll->set_id( val["id"].GetString() );
            coll->set_title( val["title"].GetString() );
        }
    }

    void xfrView( const Auth::XfrViewRequest & a_request, Auth::XfrDataReply & a_reply )
    {
        rapidjson::Document result;

        dbGet( "xfr/view", {{"xfr_id",a_request.xfr_id()}}, result );

        setXfrData( a_reply, result );
    }

    void setXfrData( XfrDataReply & a_reply, rapidjson::Document & a_result )
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
        }
    }

    void xfrInit( const std::string & a_id, const std::string & a_data_path, XfrMode a_mode, Auth::XfrDataReply & a_reply )
    {
        rapidjson::Document result;

        dbGet( "xfr/init", {{"id",a_id},{"path",a_data_path},{"mode",to_string(a_mode)}}, result );

        setXfrData( a_reply, result );
    }

    void xfrUpdate( const std::string & a_xfr_id, XfrStatus * a_status, const char * a_task_id )
    {
        rapidjson::Document result;

        vector<pair<string,string>> params;
        params.push_back({"xfr_id",a_xfr_id});
        if ( a_status )
            params.push_back({"status",to_string(*a_status)});
        if ( a_task_id )
            params.push_back({"task_id", string(a_task_id)});

        dbGet( "xfr/update", params, result );
    }

    void aclView( const Auth::ACLViewRequest & a_request, Auth::ACLDataReply & a_reply )
    {
        rapidjson::Document result;

        dbGet( "acl/view", {{"id",a_request.id()}}, result );

        setACLData( a_reply, result );
    }

    void aclUpdate( const Auth::ACLUpdateRequest & a_request, Anon::AckReply & a_reply )
    {
        (void) a_reply;

        rapidjson::Document result;
/*
        string rules = "{";
        bool comma = false;

        for ( int i = 0; i < a_request.rule_size(); ++i )
        {
            const ACLRuleStr & rule = a_request.rule(i);

            if ( i > 0 )
                rules += ",";

            rules += "{\"" + rule.id() + "\":{";
            comma = false;

            if ( rule.has_grant() )
            {
                rules += "\"grant\":\"" + rule.grant() + "\"";
                comma = true;
            }

            if ( rule.has_deny() )
            {
                if ( comma )
                    rules += ",";

                rules += "\"deny\":\"" + rule.deny() + "\"";
                comma = true;
            }

            if ( rule.has_inh_grant() )
            {
                if ( comma )
                    rules += ",";

                rules += "\"inh_grant\":\"" + rule.inh_grant() + "\"";
                comma = true;
            }

            if ( rule.has_inh_deny() )
            {
                if ( comma )
                    rules += ",";

                rules += "\"inh_deny\":\"" + rule.inh_deny() + "\"";
                comma = true;
            }
            rules += "}";
        }
        rules += "}";

        cout << rules << "\n";
*/
        dbGet( "acl/update", {{"id",a_request.id()},{"rules",a_request.rules()}}, result );
    }

    void setACLData( ACLDataReply & a_reply, rapidjson::Document & a_result )
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

    void groupCreate( const Auth::GroupCreateRequest & a_request, Auth::GroupDataReply & a_reply )
    {
        rapidjson::Document result;

        dbGet( "grp/create", {{"id",a_request.group().id()}}, result );

        setGroupData( a_reply, result );
    }

    void groupUpdate( const Auth::GroupUpdateRequest & a_request, Auth::GroupDataReply & a_reply )
    {
        rapidjson::Document result;

        dbGet( "grp/update", {{"id",a_request.group().id()}}, result );

        setGroupData( a_reply, result );
    }

    void groupDelete( const Auth::GroupDeleteRequest & a_request, Anon::AckReply & a_reply )
    {
    }

    void groupList( const Auth::GroupListRequest & a_request, Auth::GroupDataReply & a_reply )
    {
        rapidjson::Document result;

        dbGet( "grp/list", {}, result );

        setGroupData( a_reply, result );
    }

    void groupView( const Auth::GroupViewRequest & a_request, Auth::GroupDataReply & a_reply )
    {
        rapidjson::Document result;

        dbGet( "grp/view", {{"id",a_request.id()}}, result );

        setGroupData( a_reply, result );
    }

    void setGroupData( GroupDataReply & a_reply, rapidjson::Document & a_result )
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
            group->set_id( val["id"].GetString() );

            imem = val.FindMember("title");
            if ( imem != val.MemberEnd() )
                group->set_title( imem->value.GetString() );
            imem = val.FindMember("desc");
            if ( imem != val.MemberEnd() )
                group->set_desc( imem->value.GetString() );
        }
    }

    CURL * m_curl;
    char * m_client;
};


CentralDatabaseClient::CentralDatabaseClient() :
    m_impl(0)
{
    m_impl = new CentralDatabaseClientImpl();
}


CentralDatabaseClient::~CentralDatabaseClient()
{
    delete m_impl;
}

void CentralDatabaseClient::setClient( const std::string & a_client )
{
    m_impl->setClient( a_client );
}

#define DEF_IMPL( meth, req, rep ) void CentralDatabaseClient::meth( const req & a_request, rep & a_reply ) \
{ m_impl->meth( a_request, a_reply ); }



//DEF_IMPL( checkPerms, CheckPermsRequest, CheckPermsReply )
DEF_IMPL( userView, UserViewRequest, UserDataReply )
DEF_IMPL( userList, UserListRequest, UserDataReply )
DEF_IMPL( recordView, RecordViewRequest, RecordDataReply )
DEF_IMPL( recordFind, RecordFindRequest, RecordDataReply )
DEF_IMPL( recordCreate, RecordCreateRequest, RecordDataReply )
DEF_IMPL( recordUpdate, RecordUpdateRequest, RecordDataReply )
DEF_IMPL( collList, CollListRequest, CollDataReply )
DEF_IMPL( collRead, CollReadRequest, CollDataReply )
DEF_IMPL( collWrite, CollWriteRequest, Anon::AckReply )
DEF_IMPL( xfrView, XfrViewRequest, XfrDataReply )
DEF_IMPL( aclView, ACLViewRequest, ACLDataReply )
DEF_IMPL( aclUpdate, ACLUpdateRequest, Anon::AckReply )
DEF_IMPL( groupCreate, GroupCreateRequest, Auth::GroupDataReply )
DEF_IMPL( groupUpdate, GroupUpdateRequest, Auth::GroupDataReply )
DEF_IMPL( groupDelete, GroupDeleteRequest, Anon::AckReply )
DEF_IMPL( groupList, GroupListRequest, Auth::GroupDataReply )
DEF_IMPL( groupView, GroupViewRequest, Auth::GroupDataReply )


void CentralDatabaseClient::xfrInit( const std::string & a_data_id, const std::string & a_data_path, XfrMode a_mode, Auth::XfrDataReply & a_reply )
{
    m_impl->xfrInit( a_data_id, a_data_path, a_mode, a_reply );
}

void CentralDatabaseClient::xfrUpdate( const std::string & a_xfr_id, XfrStatus * a_status, const char * a_task_id )
{
    m_impl->xfrUpdate( a_xfr_id, a_status, a_task_id );
}

}