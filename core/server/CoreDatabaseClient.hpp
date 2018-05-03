#ifndef CENTRALDBCLIENT_HPP
#define CENTRALDBCLIENT_HPP

#include <string>
#include <vector>
#include <rapidjson/document.h>
#include <rapidjson/stringbuffer.h>
#include <rapidjson/prettywriter.h>
#include <rapidjson/error/en.h>
#include <curl/curl.h>
#include "SDMS.pb.h"
#include "SDMS_Anon.pb.h"
#include "SDMS_Auth.pb.h"

namespace SDMS {
namespace Core {

class DatabaseClient
{
public:
    DatabaseClient( const std::string & a_db_url, const std::string & a_db_user, const std::string & a_db_pass );
    ~DatabaseClient();

    void setClient( const std::string & a_client );
    void clientAuthenticate( const std::string & a_password );
    void clientLinkIdentity( const std::string & a_identity );
    std::string getDataStorageLocation( const std::string & a_data_id );

    //void checkPerms( const Auth::CheckPermsRequest & a_request, Auth::CheckPermsReply & a_reply );
    //uint16_t checkPerms( const string & a_id, uint16_t a_perms );
    void userView( const Auth::UserViewRequest & a_request, Auth::UserDataReply & a_reply );
    void userUpdate( const Auth::UserUpdateRequest & a_request, Auth::UserDataReply & a_reply );
    void userList( const Auth::UserListRequest & a_request, Auth::UserDataReply & a_reply );
    void userFindByUUIDs( const Auth::UserFindByUUIDsRequest & a_request, Auth::UserDataReply & a_reply );

    void recordList( const Auth::RecordListRequest & a_request, Auth::RecordDataReply & a_reply );
    void recordView( const Auth::RecordViewRequest & a_request, Auth::RecordDataReply & a_reply );
    void recordFind( const Auth::RecordFindRequest & a_request, Auth::RecordDataReply & a_reply );
    void recordCreate( const Auth::RecordCreateRequest & a_request, Auth::RecordDataReply & a_reply );
    void recordUpdate( const Auth::RecordUpdateRequest & a_request, Auth::RecordDataReply & a_reply );
    void recordDelete( const Auth::RecordDeleteRequest & a_request, Auth::RecordDeleteReply & a_reply );

    void collList( const Auth::CollListRequest & a_request, Auth::CollDataReply & a_reply );
    void collCreate( const Auth::CollCreateRequest & a_request, Auth::CollDataReply & a_reply );
    void collUpdate( const Auth::CollUpdateRequest & a_request, Auth::CollDataReply & a_reply );
    void collView( const Auth::CollViewRequest & a_request, Auth::CollDataReply & a_reply );
    void collRead( const Auth::CollReadRequest & a_request, Auth::CollDataReply & a_reply );
    void collWrite( const Auth::CollWriteRequest & a_request, Anon::AckReply & a_reply );

    void xfrView( const Auth::XfrViewRequest & a_request, Auth::XfrDataReply & a_reply );
    void xfrList( const Auth::XfrListRequest & a_request, Auth::XfrDataReply & a_reply );
    void xfrInit( const std::string & a_id, const std::string & a_data_path, XfrMode a_mode, Auth::XfrDataReply & a_reply );
    void xfrUpdate( const std::string & a_xfr_id, XfrStatus * a_status = 0, const std::string & a_err_msg = "", const char * a_task_id = 0 );

    void aclView( const Auth::ACLViewRequest & a_request, Auth::ACLDataReply & a_reply );
    void aclUpdate( const Auth::ACLUpdateRequest & a_request,  Auth::ACLDataReply & a_reply );

    void groupCreate( const Auth::GroupCreateRequest & a_request, Auth::GroupDataReply & a_reply );
    void groupUpdate( const Auth::GroupUpdateRequest & a_request, Auth::GroupDataReply & a_reply );
    void groupDelete( const Auth::GroupDeleteRequest & a_request, Anon::AckReply & a_reply );
    void groupList( const Auth::GroupListRequest & a_request, Auth::GroupDataReply & a_reply );
    void groupView( const Auth::GroupViewRequest & a_request, Auth::GroupDataReply & a_reply );

private:
    long dbGet( const char * a_url_path, const std::vector<std::pair<std::string,std::string>> &a_params, rapidjson::Document & a_result );
    void setUserData( Auth::UserDataReply & a_reply, rapidjson::Document & a_result );
    void setRecordData( Auth::RecordDataReply & a_reply, rapidjson::Document & a_result );
    void setCollData( Auth::CollDataReply & a_reply, rapidjson::Document & a_result );
    void setGroupData( Auth::GroupDataReply & a_reply, rapidjson::Document & a_result );
    void setXfrData( Auth::XfrDataReply & a_reply, rapidjson::Document & a_result );
    void setACLData( Auth::ACLDataReply & a_reply, rapidjson::Document & a_result );

    CURL *      m_curl;
    char *      m_client;
    std::string m_db_url;
    std::string m_db_user;
    std::string m_db_pass;
};

}}

#endif
