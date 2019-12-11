#include <rapidjson/document.h>
#include <curl/curl.h>
#include "TraceException.hpp"
#include "DynaLog.hpp"
#include "TaskMgr.hpp"
#include "Config.hpp"
#include "SDMS.pb.h"

using namespace std;

namespace SDMS {
namespace CORE {

class TaskMgr::Task
{
public:
    Task() : curl(0), list(0)
    {}

    ~Task()
    {}

    CURL *              curl;
    struct curl_slist * list;
    std::String         result;
};

class TaskMgr::TaskXfr : public TaskMgr::Task
{
public:
    TaskXfr( const XfrData & a_xfr_data ) : xfr_data( a_xfr_data )
    {}

    XfrData     xfr_data;
}

TaskMgr::TaskMgr():
    m_config(Config::getInstance()),
    m_main_thread(0)
{
    m_main_thread = new thread( &TaskMgr::mainThread, this );

}

TaskMgr::~TaskMgr()
{
}

TaskMgr &
TaskMgr::getInstance()
{
    static TaskMgr * mgr = new TaskMgr();

    return *mgr;
}


void
TaskMgr::transferData( XfrDataReply & a_reply )
{
    for ( int i = 0; i < a_reply.xfr_size(); i++ )
    {
        Task * task = new TaskXfr( a_reply.xfr( i ));
        lock_guard<mutex> lock(m_mutex);
        m_q_ready.push_front( task );
    }
}



void
TaskMgr::deleteData( const std::vector<std::string> & a_ids )
{
}


void
TaskMgr::mainThread()
{
    CURLM * curlm = curl_multi_init();

    while( 1 )
    {

    }

    curl_multi_cleanup( curlm );
}



void
TaskMgr::httpInit( Task & a_task, bool a_post, const std::string & a_url_base, const std::string & a_url_path, const std::string & a_token, const url_params_t & a_params, const rapidjson::Document * a_body )
{
    a_task.curl = curl_easy_init();

    if ( !a_task.curl )
        EXCEPT( 1, "curl_easy_init failed" );

    curl_easy_setopt( a_task.curl, CURLOPT_HTTP_VERSION, CURL_HTTP_VERSION_1_1 );
    curl_easy_setopt( a_task.curl, CURLOPT_WRITEFUNCTION, curlResponseWriteCB );
    curl_easy_setopt( a_task.curl, CURLOPT_SSL_VERIFYPEER, 0 );
    curl_easy_setopt( a_task.curl, CURLOPT_TCP_NODELAY, 1 );

    string  url;
    char *  esc_txt;
    char    error[CURL_ERROR_SIZE];
    error[0] = 0;

    url.reserve( 512 );
    url.append( a_base_url );

    esc_txt = curl_easy_escape( a_task.curl, a_url_path.c_str(), 0 );
    url.append( esc_txt );
    curl_free( esc_txt );

    for ( vector<pair<string,string>>::const_iterator iparam = a_params.begin(); iparam != a_params.end(); ++iparam )
    {
        if ( iparam == a_params.begin())
            url.append( "?" );
        else
            url.append( "&" );
        url.append( iparam->first.c_str() );
        url.append( "=" );
        esc_txt = curl_easy_escape( a_task.curl, iparam->second.c_str(), 0 );
        url.append( esc_txt );
        curl_free( esc_txt );
    }

    //curl_easy_setopt( a_task.curl, CURLOPT_VERBOSE, 1 );
    curl_easy_setopt( a_task.curl, CURLOPT_URL, url.c_str() );
    curl_easy_setopt( a_task.curl, CURLOPT_WRITEDATA, &a_task.result );
    curl_easy_setopt( a_task.curl, CURLOPT_ERRORBUFFER, error );

    if ( a_post )
        curl_easy_setopt( a_task.curl, CURLOPT_POST, 1 );
    else
        curl_easy_setopt( a_task.curl, CURLOPT_HTTPGET, 1 );

    if ( a_body )
    {
        rapidjson::StringBuffer buffer;
        rapidjson::Writer<rapidjson::StringBuffer> writer(buffer);
        a_body->Accept(writer);
        curl_easy_setopt( a_task.curl, CURLOPT_POSTFIELDS, buffer.GetString( ));
    }
    else
        curl_easy_setopt( a_task.curl, CURLOPT_POSTFIELDS, "" );

    a_task.list = 0;

    if ( a_token.size() )
    {
        string auth_hdr = "Authorization: Bearer ";
        auth_hdr += a_token;
        a_task.list = curl_slist_append( a_task.list, auth_hdr.c_str( ));
    }
    else
    {
        curl_easy_setopt( a_task.curl, CURLOPT_HTTPAUTH, CURLAUTH_BASIC );
        curl_easy_setopt( a_task.curl, CURLOPT_USERNAME, m_config.client_id.c_str() );
        curl_easy_setopt( a_task.curl, CURLOPT_PASSWORD, m_config.client_secret.c_str() );
    }

    if ( a_body )
    {
        a_task.list = curl_slist_append( a_task.list, "Content-Type: application/json");
    }

    if ( a_task.list )
        curl_easy_setopt( a_task.curl, CURLOPT_HTTPHEADER, a_task.list );

    //CURLcode res = curl_easy_perform( m_curl );

    //if ( list )
    //    curl_slist_free_all(list);
}


}}
