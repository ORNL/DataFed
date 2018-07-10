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
    bool uidByPubKey( const std::string & a_pub_key, std::string & a_uid );
    bool userGetKeys( std::string & a_pub_key, std::string & a_priv_key);
    void userSetKeys( const std::string & a_pub_key, const std::string & a_priv_key );
    void userSetTokens( const std::string & a_acc_tok, const std::string & a_ref_tok );
    bool userGetTokens( std::string & a_acc_tok, std::string & a_ref_tok );
    bool userGetAccessToken( std::string & a_token );
    void repoList( std::vector<RepoData*> & a_repos );

    //void checkPerms( const Auth::CheckPermsRequest & a_request, Auth::CheckPermsReply & a_reply );
    //uint16_t checkPerms( const string & a_id, uint16_t a_perms );
    void userSaveTokens( const Auth::UserSaveTokensRequest & a_request, Anon::AckReply & a_reply );
    void userCreate( const Auth::UserCreateRequest & a_request, Auth::UserDataReply & a_reply );
    void userView( const Auth::UserViewRequest & a_request, Auth::UserDataReply & a_reply );
    void userUpdate( const Auth::UserUpdateRequest & a_request, Auth::UserDataReply & a_reply );
    void userListAll( const Auth::UserListAllRequest & a_request, Auth::UserDataReply & a_reply );
    void userListCollab( const Auth::UserListCollabRequest & a_request, Auth::UserDataReply & a_reply );
    void userFindByUUIDs( const Auth::UserFindByUUIDsRequest & a_request, Auth::UserDataReply & a_reply );

    void projCreate( const Auth::ProjectCreateRequest & a_request, Auth::ProjectDataReply & a_reply );
    void projUpdate( const Auth::ProjectUpdateRequest & a_request, Auth::ProjectDataReply & a_reply );
    void projDelete( const Auth::ProjectDeleteRequest & a_request, Anon::AckReply & a_reply );
    void projView( const Auth::ProjectViewRequest & a_request, Auth::ProjectDataReply & a_reply );
    void projList( const Auth::ProjectListRequest & a_request, Auth::ProjectDataReply & a_reply );

    void recordList( const Auth::RecordListRequest & a_request, Auth::RecordDataReply & a_reply );
    void recordView( const Auth::RecordViewRequest & a_request, Auth::RecordDataReply & a_reply );
    void recordFind( const Auth::RecordFindRequest & a_request, Auth::RecordDataReply & a_reply );
    void recordCreate( const Auth::RecordCreateRequest & a_request, Auth::RecordDataReply & a_reply );
    void recordUpdate( const Auth::RecordUpdateRequest & a_request, Auth::RecordDataReply & a_reply );
    void recordDelete( const Auth::RecordDeleteRequest & a_request, Auth::RecordDataLocationReply & a_reply );
    void recordGetDataLocation( const Auth::RecordGetDataLocationRequest & a_request, Auth::RecordDataLocationReply & a_reply );

    void collList( const Auth::CollListRequest & a_request, Auth::CollDataReply & a_reply );
    void collCreate( const Auth::CollCreateRequest & a_request, Auth::CollDataReply & a_reply );
    void collUpdate( const Auth::CollUpdateRequest & a_request, Auth::CollDataReply & a_reply );
    void collDelete( const Auth::CollDeleteRequest & a_request, Anon::AckReply & a_reply );
    void collView( const Auth::CollViewRequest & a_request, Auth::CollDataReply & a_reply );
    void collRead( const Auth::CollReadRequest & a_request, Auth::CollDataReply & a_reply );
    void collWrite( const Auth::CollWriteRequest & a_request, Auth::CollWriteReply & a_reply );
    void collGetParents( const Auth::CollGetParentsRequest & a_request, Auth::CollDataReply & a_reply );

    void xfrView( const Auth::XfrViewRequest & a_request, Auth::XfrDataReply & a_reply );
    void xfrList( const Auth::XfrListRequest & a_request, Auth::XfrDataReply & a_reply );
    void xfrInit( const std::string & a_id, const std::string & a_data_path, XfrMode a_mode, Auth::XfrDataReply & a_reply );
    void xfrUpdate( const std::string & a_xfr_id, XfrStatus * a_status = 0, const std::string & a_err_msg = "", const char * a_task_id = 0 );

    void aclView( const Auth::ACLViewRequest & a_request, Auth::ACLDataReply & a_reply );
    void aclUpdate( const Auth::ACLUpdateRequest & a_request,  Auth::ACLDataReply & a_reply );
    void aclByUser( const Auth::ACLByUserRequest & a_request,  Auth::UserDataReply & a_reply );
    void aclByUserList( const Auth::ACLByUserListRequest & a_request,  Auth::CollDataReply & a_reply );

    void groupCreate( const Auth::GroupCreateRequest & a_request, Auth::GroupDataReply & a_reply );
    void groupUpdate( const Auth::GroupUpdateRequest & a_request, Auth::GroupDataReply & a_reply );
    void groupDelete( const Auth::GroupDeleteRequest & a_request, Anon::AckReply & a_reply );
    void groupList( const Auth::GroupListRequest & a_request, Auth::GroupDataReply & a_reply );
    void groupView( const Auth::GroupViewRequest & a_request, Auth::GroupDataReply & a_reply );


private:
    long dbGet( const char * a_url_path, const std::vector<std::pair<std::string,std::string>> &a_params, rapidjson::Document & a_result );
    bool dbGetRaw( const char * a_url_path, const std::vector<std::pair<std::string,std::string>> &a_params, std::string & a_result );
    void setUserData( Auth::UserDataReply & a_reply, rapidjson::Document & a_result );
    void setProjectData( Auth::ProjectDataReply & a_reply, rapidjson::Document & a_result );
    void setRecordData( Auth::RecordDataReply & a_reply, rapidjson::Document & a_result );
    void setCollData( Auth::CollDataReply & a_reply, rapidjson::Document & a_result );
    void setGroupData( Auth::GroupDataReply & a_reply, rapidjson::Document & a_result );
    void setXfrData( Auth::XfrDataReply & a_reply, rapidjson::Document & a_result );
    void setACLData( Auth::ACLDataReply & a_reply, rapidjson::Document & a_result );

    CURL *      m_curl;
    char *      m_client;
    std::string m_client_uid;
    std::string m_db_url;
    std::string m_db_user;
    std::string m_db_pass;
};

}}

#endif
