#include <string>
#include <vector>
#include <curl/curl.h>
#include <rapidjson/document.h>
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
            a_result.Parse( res_json.c_str() );

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
                if ( http_code == 400 && !a_result.HasParseError() && a_result.HasMember( "errorMessage" ))
                {
                    EXCEPT_PARAM( ID_BAD_REQUEST, "Bad request: " << a_result["errorMessage"].GetString() );
                }
                else
                {
                    EXCEPT_PARAM( ID_BAD_REQUEST, "SDMS DB service call failed. Code: " << http_code );
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

    void setRecordData( RecordDataReply & a_reply, rapidjson::Document & a_result )
    {
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

            if (( imem = val.FindMember("desc")) != val.MemberEnd() )
                rec->set_desc( imem->value.GetString() );

            if (( imem = val.FindMember("metadata")) != val.MemberEnd() )
                rec->set_metadata( imem->value.GetString() );

            if (( imem = val.FindMember("data_path")) != val.MemberEnd() )
                rec->set_data_path( imem->value.GetString() );
        }
    }


    void collList( const CollListRequest & a_request, CollDataReply & a_reply )
    {
        rapidjson::Document result;

        if ( a_request.has_user() )
            dbGet( "col/list", {{"subject",a_request.user()}}, result );
        else
             dbGet( "col/list", {}, result );

        setCollData( a_reply, result );
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
            xfr->set_data_path( val["data_path"].GetString() );
            xfr->set_dest_path( val["dest_path"].GetString() );
            xfr->set_globus_id( val["globus_id"].GetString() );

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

    void xfrUpdate( const std::string & a_xfr_id, XfrStatus a_status, const std::string & a_task_id )
    {
        rapidjson::Document result;

        if ( a_task_id.size() )
            dbGet( "xfr/update", {{"xfr_id",a_xfr_id},{"status",to_string(a_status)},{"task_id",a_task_id}}, result );
        else
            dbGet( "xfr/update", {{"xfr_id",a_xfr_id},{"status",to_string(a_status)}}, result );
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
DEF_IMPL( collList, CollListRequest, CollDataReply )
DEF_IMPL( xfrView, XfrViewRequest, XfrDataReply )

void CentralDatabaseClient::xfrInit( const std::string & a_data_id, const std::string & a_data_path, XfrMode a_mode, Auth::XfrDataReply & a_reply )
{
    m_impl->xfrInit( a_data_id, a_data_path, a_mode, a_reply );
}

void CentralDatabaseClient::xfrUpdate( const std::string & a_xfr_id, XfrStatus a_status, const std::string & a_task_id )
{
    m_impl->xfrUpdate( a_xfr_id, a_status, a_task_id );
}

}