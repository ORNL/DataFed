#ifndef GLOBUSAPICLIENT_HPP
#define GLOBUSAPICLIENT_HPP

#include <string>
#include <vector>
#include <curl/curl.h>
#include <rapidjson/document.h>
#include "SDMS.pb.h"

namespace SDMS {
namespace Core {

class GlobusAPIClient
{
public:
    struct EndpointInfo
    {
        bool        activated;
        bool        never_expires;
        uint32_t    expiration;
        bool        supports_encryption;
        bool        force_encryption;
    };

    GlobusAPIClient();
    ~GlobusAPIClient();

    std::string getSubmissionID( const std::string & a_acc_token );
    void        transfer( SDMS::XfrData & a_xfr, const std::string & a_acc_token );
    bool        checkTransferStatus( const std::string & a_acc_tok, const std::string & a_task_id, SDMS::XfrStatus & a_status, std::string & a_err_msg );
    void        cancelTask( const std::string & a_acc_tok, const std::string & a_task_id );
    void        getEndpointInfo( const std::string & a_ep_id, const std::string & a_acc_token, EndpointInfo & a_ep_info );
    void        refreshAccessToken( const std::string & a_ref_tok, std::string & a_new_acc_tok, uint32_t & a_expires_in );

private:
    long        get( const std::string & a_base_url, const std::string & a_url_path, const std::string & a_token, const std::vector<std::pair<std::string,std::string>> & a_params, std::string & a_result );
    long        post( const std::string & a_base_url, const std::string & a_url_path, const std::string & a_token, const std::vector<std::pair<std::string,std::string>> & a_params, const rapidjson::Document * a_body, std::string & a_result );
    bool        eventsHaveErrors( const std::vector<std::string> & a_events, SDMS::XfrStatus & status, std::string & a_err_msg );

    std::string m_auth_url;
    std::string m_xfr_url;
    std::string m_auth_id;
    std::string m_auth_secret;
    CURL *      m_curl;
};

}}

#endif