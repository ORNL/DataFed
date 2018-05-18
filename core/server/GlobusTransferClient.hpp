#ifndef GLOBUSTRANSFERCLIENT_HPP
#define GLOBUSTRANSFERCLIENT_HPP

#include <string>
#include <vector>
#include <curl/curl.h>
#include <rapidjson/document.h>

namespace SDMS {
namespace Core {

class GlobusTransferClient
{
public:
    GlobusTransferClient();
    ~GlobusTransferClient();

    std::string getSubmissionID( std::string & a_token );

private:
    void dbGet( const char * a_url_path, const char * a_token, const std::vector<std::pair<std::string,std::string>> & a_params, rapidjson::Document & a_result );

    std::string m_base_url;
    CURL *      m_curl;
};

}}

#endif