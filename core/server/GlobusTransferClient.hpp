#ifndef GLOBUSTRANSFERCLIENT_HPP
#define GLOBUSTRANSFERCLIENT_HPP

#include <string>
#include <vector>
#include <curl/curl.h>
#include <rapidjson/document.h>
#include "SDMS.pb.h"

namespace SDMS {
namespace Core {

class GlobusTransferClient
{
public:
    GlobusTransferClient();
    ~GlobusTransferClient();

    std::string getSubmissionID( std::string & a_token );
    bool        transfer( const std::string & a_acc_tok, const std::string & a_sub_id, const std::string & a_src_path, const std::string & a_dest_path, std::string & a_task_id );
    bool        checkTransferStatus( const std::string & a_acc_tok, const std::string & a_task_id, SDMS::XfrStatus & a_status, std::string & a_err_msg );
    bool        cancelTask( const std::string & a_acc_tok, const std::string & a_task_id );

private:
    void get( const char * a_url_path, const char * a_token, const std::vector<std::pair<std::string,std::string>> & a_params, rapidjson::Document & a_result );
    void post( const char * a_url_path, const char * a_token, const std::vector<std::pair<std::string,std::string>> & a_params, const rapidjson::Document * a_body, rapidjson::Document & a_result );
    bool eventsHaveErrors( const std::vector<std::string> & a_events, SDMS::XfrStatus & status, std::string & a_err_msg );

    std::string m_base_url;
    CURL *      m_curl;
};

}}

#endif