#include <string>
#include <curl/curl.h>
#include <rapidjson/document.h>
#include "DynaLog.hpp"
#include "TraceException.hpp"
#include "CentralDatabaseClient.hpp"

using namespace std;

namespace SDMS {


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
            EXCEPT( 1, "libcurl init failed" );

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

    void userView( const UserViewRequest & a_request, UserDataReply & a_reply )
    {
        char url[1024];
        string resp;
        char error[CURL_ERROR_SIZE];

        url[0] = error[0] = 0;

        char * esc_user = curl_easy_escape( m_curl, a_request.user().c_str(), 0 );

        strcpy( url, "https://localhost:8529/_db/sdms/api/usr/view?uid=" );
        strcat( url, esc_user );
        
        curl_free( esc_user );

        //DL_DEBUG( "url: " << url );

        curl_easy_setopt( m_curl, CURLOPT_URL, url );
        curl_easy_setopt( m_curl, CURLOPT_WRITEDATA, &resp );
        curl_easy_setopt( m_curl, CURLOPT_ERRORBUFFER, error );

        CURLcode res = curl_easy_perform( m_curl );

        long http_code = 0;
        curl_easy_getinfo( m_curl, CURLINFO_RESPONSE_CODE, &http_code );

        if ( res == CURLE_OK )
        {
            if ( http_code >= 200 && http_code < 300 )
            {
                setUserData( a_reply, resp.c_str() );
            }
            else
            {
                DL_ERROR( "arangodb call failed, server code " << http_code );
            }
        }
        else
        {
            DL_ERROR( "db call error: " << error );
            DL_ERROR( "curl call failed: " << curl_easy_strerror( res ));
        }
    }

    void userList( const UserListRequest & a_request, UserDataReply & a_reply )
    {
        (void)a_request;

#if 0
        static const char * fake_res =
        "["
        "{\"uid\":\"user1\",\"name_first\":\"user1\",\"name_last\":\"one\"},"
        "{\"uid\":\"user2\",\"name_first\":\"user2\",\"name_last\":\"two\"},"
        "{\"uid\":\"user3\",\"name_first\":\"user3\",\"name_last\":\"three\"},"
        "{\"uid\":\"user4\",\"name_first\":\"user4\",\"name_last\":\"four\"},"
        "{\"uid\":\"user5\",\"name_first\":\"user5\",\"name_last\":\"five\"}"
        "]";

        //cout << fake_res << "\n";

        rapidjson::Document doc;
        doc.Parse( fake_res );

        if ( doc.HasParseError() || !doc.IsArray() )
        {
            DL_ERROR( "Invalid JSON returned from DB service" );
        }
        else
        {
            UserData* user;

            for ( rapidjson::SizeType i = 0; i < doc.Size(); i++ )
            {
                rapidjson::Value & val = doc[i];

                user = a_reply.add_user();
                user->set_uid( val["uid"].GetString() );
                user->set_name_last( val["name_last"].GetString() );
                user->set_name_first( val["name_first"].GetString() );
            }
        }

#else

        char url[1024];
        string resp;
        char error[CURL_ERROR_SIZE];

        url[0] = error[0] = 0;

        strcpy( url, "https://localhost:8529/_db/sdms/api/usr/list" );

        //DL_DEBUG( "url: " << url );

        curl_easy_setopt( m_curl, CURLOPT_URL, url );
        curl_easy_setopt( m_curl, CURLOPT_WRITEDATA, &resp );
        curl_easy_setopt( m_curl, CURLOPT_ERRORBUFFER, error );

        CURLcode res = curl_easy_perform( m_curl );

        long http_code = 0;
        curl_easy_getinfo( m_curl, CURLINFO_RESPONSE_CODE, &http_code );


        if ( res == CURLE_OK )
        {
            if ( http_code >= 200 && http_code < 300 )
            {
                setUserData( a_reply, resp.c_str() );
            }
            else
            {
                DL_ERROR( "arangodb call failed, server code " << http_code );
            }
        }
        else
        {
            DL_ERROR( "db call error: " << error );
            DL_ERROR( "curl call failed: " << curl_easy_strerror( res ));
        }

#endif
    }


    void setUserData( UserDataReply & a_reply, const char * a_json )
    {
        rapidjson::Document doc;
        doc.Parse( a_json );

        if ( doc.HasParseError() || !doc.IsArray() )
        {
            DL_ERROR( "Invalid JSON returned from DB service" );
        }
        else
        {
            UserData* user;

            for ( rapidjson::SizeType i = 0; i < doc.Size(); i++ )
            {
                rapidjson::Value & val = doc[i];

                user = a_reply.add_user();
                user->set_uid( val["uid"].GetString() );
                user->set_name_last( val["name_last"].GetString() );
                user->set_name_first( val["name_first"].GetString() );
            }
        }
    }

    void collList( const CollListRequest & a_request, CollDataReply & a_reply )
    {
        char url[1024];
        string resp;
        char error[CURL_ERROR_SIZE];

        url[0] = error[0] = 0;

        
        strcpy( url, "https://localhost:8529/_db/sdms/api/col/list?client=" );
        strcat( url, m_client );
        if ( a_request.has_user() )
        {
            strcat( url, "&subject=" );

            char * esc_txt = curl_easy_escape( m_curl, a_request.user().c_str(), 0 );
            strcat( url, esc_txt );
            curl_free( esc_txt );
        }

        //DL_DEBUG( "url: " << url );

        curl_easy_setopt( m_curl, CURLOPT_URL, url );
        curl_easy_setopt( m_curl, CURLOPT_WRITEDATA, &resp );
        curl_easy_setopt( m_curl, CURLOPT_ERRORBUFFER, error );

        CURLcode res = curl_easy_perform( m_curl );

        long http_code = 0;
        curl_easy_getinfo( m_curl, CURLINFO_RESPONSE_CODE, &http_code );


        if ( res == CURLE_OK )
        {
            if ( http_code >= 200 && http_code < 300 )
            {
                setCollData( a_reply, resp.c_str() );
            }
            else
            {
                DL_ERROR( "arangodb call failed, server code " << http_code );
            }
        }
        else
        {
            DL_ERROR( "db call error: " << error );
            DL_ERROR( "curl call failed: " << curl_easy_strerror( res ));
        }
    }

    void setCollData( CollDataReply & a_reply, const char * a_json )
    {
        rapidjson::Document doc;
        doc.Parse( a_json );

        if ( doc.HasParseError() || !doc.IsArray() )
        {
            DL_ERROR( "Invalid JSON returned from DB service" );
        }
        else
        {
            CollData* coll;

            //cout << "coll data: " << a_json << "\n";

            for ( rapidjson::SizeType i = 0; i < doc.Size(); i++ )
            {
                rapidjson::Value & val = doc[i];

                coll = a_reply.add_coll();
                coll->set_id( val["id"].GetString() );
                coll->set_title( val["title"].GetString() );
            }
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

DEF_IMPL( userView, UserViewRequest, UserDataReply )
DEF_IMPL( userList, UserListRequest, UserDataReply )
DEF_IMPL( collList, CollListRequest, CollDataReply )

/*
void
CentralDatabaseClient::userView( const UserViewRequest & a_request, UserDataReply & a_reply )
{
    m_impl->userView( a_request, a_reply );
}

void
CentralDatabaseClient::userList( const UserListRequest & a_request, UserDataReply & a_reply )
{
    m_impl->userList( a_request, a_reply );
}

void
CentralDatabaseClient::collList( const CollListRequest & a_request, CollDataReply & a_reply )
{
    m_impl->userList( a_request, a_reply );
}
*/

}