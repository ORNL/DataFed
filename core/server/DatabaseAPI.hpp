#ifndef DATABASEAPI_HPP
#define DATABASEAPI_HPP


#include <string>
#include <vector>
#include <curl/curl.h>
#include "SDMS.pb.h"
#include "SDMS_Anon.pb.h"
#include "SDMS_Auth.pb.h"
#include "libjson.hpp"

namespace SDMS {
namespace Core {

class DatabaseAPI
{
public:
    struct UserTokenInfo
    {
        std::string uid;
        std::string access_token;
        std::string refresh_token;
        uint32_t    expiration;
    };

    DatabaseAPI( const std::string & a_db_url, const std::string & a_db_user, const std::string & a_db_pass );
    ~DatabaseAPI();

    void setClient( const std::string & a_client );
    void clientAuthenticateByPassword( const std::string & a_password, Anon::AuthStatusReply & a_reply );
    void clientAuthenticateByToken( const std::string & a_token, Anon::AuthStatusReply & a_reply );
    void clientLinkIdentity( const std::string & a_identity );
    bool uidByPubKey( const std::string & a_pub_key, std::string & a_uid );
    bool userGetKeys( std::string & a_pub_key, std::string & a_priv_key);
    void userSetKeys( const std::string & a_pub_key, const std::string & a_priv_key );
    void userClearKeys();
    void userSetAccessToken( const std::string & a_acc_tok, uint32_t a_expires_in, const std::string & a_ref_tok );
    void userGetAccessToken(  std::string & a_acc_tok, std::string & a_ref_tok, uint32_t & a_expires_in );
    void getExpiringAccessTokens( uint32_t a_expires_in, std::vector<UserTokenInfo> & a_expiring_tokens );
    void purgeTransferRecords( size_t age );
    void checkPerms( const Auth::CheckPermsRequest & a_request, Auth::CheckPermsReply & a_reply );
    void getPerms( const Auth::GetPermsRequest & a_request, Auth::GetPermsReply & a_reply );

    void userSetAccessToken( const Auth::UserSetAccessTokenRequest & a_request, Anon::AckReply & a_reply );
    void userCreate( const Auth::UserCreateRequest & a_request, Auth::UserDataReply & a_reply );
    void userView( const Auth::UserViewRequest & a_request, Auth::UserDataReply & a_reply );
    void userUpdate( const Auth::UserUpdateRequest & a_request, Auth::UserDataReply & a_reply );
    void userListAll( const Auth::UserListAllRequest & a_request, Auth::UserDataReply & a_reply );
    void userListCollab( const Auth::UserListCollabRequest & a_request, Auth::UserDataReply & a_reply );
    void userFindByUUIDs( const Auth::UserFindByUUIDsRequest & a_request, Auth::UserDataReply & a_reply );
    void userGetRecentEP( const Auth::UserGetRecentEPRequest & a_request, Auth::UserGetRecentEPReply & a_reply );
    void userSetRecentEP( const Auth::UserSetRecentEPRequest & a_request, Anon::AckReply & a_reply );

    void projCreate( const Auth::ProjectCreateRequest & a_request, Auth::ProjectDataReply & a_reply );
    void projUpdate( const Auth::ProjectUpdateRequest & a_request, Auth::ProjectDataReply & a_reply );
    void projView( const Auth::ProjectViewRequest & a_request, Auth::ProjectDataReply & a_reply );
    void projList( const Auth::ProjectListRequest & a_request, Auth::ListingReply & a_reply );
    void projSearch( const std::string & a_query, Auth::ProjectDataReply & a_reply );

    void recordView( const Auth::RecordViewRequest & a_request, Auth::RecordDataReply & a_reply );
    void recordCreate( const Auth::RecordCreateRequest & a_request, Auth::RecordDataReply & a_reply );
    void recordCreateBatch( const Auth::RecordCreateBatchRequest & a_request, Auth::RecordDataReply & a_reply );
    void recordUpdate( const Auth::RecordUpdateRequest & a_request, Auth::RecordDataReply & a_reply, libjson::Value & result );
    void recordUpdateBatch( const Auth::RecordUpdateBatchRequest & a_request, Auth::RecordDataReply & a_reply, libjson::Value & result );
    void recordUpdatePostPut( const std::string & a_data_id, size_t a_file_size, time_t a_mod_time, const std::string & a_src_path, const std::string * a_ext = 0 );
    void recordLock( const Auth::RecordLockRequest & a_request, Auth::ListingReply & a_reply );
    void recordSearch( const Auth::RecordSearchRequest & a_request, Auth::ListingReply & a_reply );
    void recordListByAlloc( const Auth::RecordListByAllocRequest & a_request, Auth::ListingReply & a_reply );
    void recordGetDependencies( const Auth::RecordGetDependenciesRequest & a_request, Auth::ListingReply & a_reply );
    void recordGetDependencyGraph( const Auth::RecordGetDependencyGraphRequest & a_request, Auth::ListingReply & a_reply );
    void recordUpdateDataMoveInit( const libjson::Value & a_rec_ids, const std::string & a_new_repo_id, const std::string & a_new_owner_id, const std::string & a_new_coll_id );
    void recordUpdateDataMoveRevert( const libjson::Value & a_rec_ids );
    void recordUpdateDataMoveFinalize( const libjson::Value & a_rec_ids );

    void dataPath( const Auth::DataPathRequest & a_request, Auth::DataPathReply & a_reply );
    void dataGetPreproc( const Auth::DataGetPreprocRequest & a_request, Auth::ListingReply & a_reply );

    void collList( const Auth::CollListRequest & a_request, Auth::CollDataReply & a_reply );
    void collListPublished( const Auth::CollListPublishedRequest & a_request, Auth::ListingReply & a_reply );
    void collCreate( const Auth::CollCreateRequest & a_request, Auth::CollDataReply & a_reply );
    void collUpdate( const Auth::CollUpdateRequest & a_request, Auth::CollDataReply & a_reply );
    void collView( const Auth::CollViewRequest & a_request, Auth::CollDataReply & a_reply );
    void collRead( const Auth::CollReadRequest & a_request, Auth::ListingReply & a_reply );
    void collWrite( const Auth::CollWriteRequest & a_request, Auth::ListingReply & a_reply );
    void collMove( const Auth::CollMoveRequest & a_request, Anon::AckReply & a_reply );
    void collGetParents( const Auth::CollGetParentsRequest & a_request, Auth::CollPathReply & a_reply );
    void collGetOffset( const Auth::CollGetOffsetRequest & a_request, Auth::CollGetOffsetReply & a_reply );

    void queryList( const Auth::QueryListRequest & a_request, Auth::ListingReply & a_reply );
    void queryCreate( const Auth::QueryCreateRequest & a_request, Auth::QueryDataReply & a_reply );
    void queryUpdate( const Auth::QueryUpdateRequest & a_request, Auth::QueryDataReply & a_reply );
    void queryDelete( const std::string & a_id );
    void queryView( const Auth::QueryViewRequest & a_request, Auth::QueryDataReply & a_reply );
    void queryExec( const Auth::QueryExecRequest & a_request, Auth::ListingReply & a_reply );

/*
    void xfrView( const Auth::XfrViewRequest & a_request, Auth::XfrDataReply & a_reply );
    void xfrList( const Auth::XfrListRequest & a_request, Auth::XfrDataReply & a_reply );
    //void xfrInit( const std::string & a_id, const std::string & a_data_path, const std::string * a_ext, XfrMode a_mode, Auth::XfrDataReply & a_reply );
    //void xfrInit( const Auth::DataGetRequest & a_request, Auth::XfrDataReply & a_reply );
    void xfrInit( const std::vector<std::string> & a_ids, const std::string & a_path, const std::string * a_ext, XfrEncrypt a_encrypt, XfrMode a_mode, Auth::XfrDataReply & a_reply );
    void xfrUpdate( const std::string & a_xfr_id, XfrStatus * a_status = 0, const bool * a_encrypted = 0, const std::string & a_err_msg = "", const char * a_task_id = 0 );
*/

    void aclView( const Auth::ACLViewRequest & a_request, Auth::ACLDataReply & a_reply );
    void aclUpdate( const Auth::ACLUpdateRequest & a_request,  Auth::ACLDataReply & a_reply );
    void aclByUser( const Auth::ACLByUserRequest & a_request,  Auth::UserDataReply & a_reply );
    void aclByUserList( const Auth::ACLByUserListRequest & a_request,  Auth::ListingReply & a_reply );
    void aclByProj( const Auth::ACLByProjRequest & a_request,  Auth::ProjectDataReply & a_reply );
    void aclByProjList( const Auth::ACLByProjListRequest & a_request,  Auth::ListingReply & a_reply );

    void groupCreate( const Auth::GroupCreateRequest & a_request, Auth::GroupDataReply & a_reply );
    void groupUpdate( const Auth::GroupUpdateRequest & a_request, Auth::GroupDataReply & a_reply );
    void groupDelete( const Auth::GroupDeleteRequest & a_request, Anon::AckReply & a_reply );
    void groupList( const Auth::GroupListRequest & a_request, Auth::GroupDataReply & a_reply );
    void groupView( const Auth::GroupViewRequest & a_request, Auth::GroupDataReply & a_reply );

    void repoList( std::vector<RepoData*> & a_repos );
    void repoList( const Auth::RepoListRequest & a_request, Auth::RepoDataReply  & a_reply );
    void repoView( const Auth::RepoViewRequest & a_request, Auth::RepoDataReply  & a_reply );
    void repoCreate( const Auth::RepoCreateRequest & a_request, Auth::RepoDataReply  & a_reply );
    void repoUpdate( const Auth::RepoUpdateRequest & a_request, Auth::RepoDataReply  & a_reply );
    void repoDelete( const Auth::RepoDeleteRequest & a_request, Anon::AckReply  & a_reply );
    void repoCalcSize( const Auth::RepoCalcSizeRequest & a_request, Auth::RepoCalcSizeReply  & a_reply );
    void repoListAllocations( const Auth::RepoListAllocationsRequest & a_request, Auth::RepoAllocationsReply  & a_reply );
    void repoListSubjectAllocations( const Auth::RepoListSubjectAllocationsRequest & a_request, Auth::RepoAllocationsReply  & a_reply );
    void repoListObjectAllocations( const Auth::RepoListObjectAllocationsRequest & a_request, Auth::RepoAllocationsReply  & a_reply );
    void repoViewAllocation( const Auth::RepoViewAllocationRequest & a_request, Auth::RepoAllocationsReply & a_reply );
    void repoAllocationStats( const Auth::RepoAllocationStatsRequest & a_request, Auth::RepoAllocationStatsReply  & a_reply );
    void repoAllocationSet( const Auth::RepoAllocationSetRequest & a_request, Anon::AckReply  & a_reply );
    void repoAuthz( const Auth::RepoAuthzRequest & a_request, Anon::AckReply  & a_reply );

    void topicList( const Auth::TopicListRequest & a_request, Auth::ListingReply  & a_reply );
    void topicLink( const Auth::TopicLinkRequest & a_request, Anon::AckReply  & a_reply );
    void topicUnlink( const Auth::TopicUnlinkRequest & a_request, Anon::AckReply  & a_reply );


    void taskLoadReady( libjson::Value & a_result );
    void taskInitDataGet( const std::vector<std::string> & a_ids, const std::string & a_path, Encryption a_encrypt, Auth::TaskDataReply & a_reply, libjson::Value & a_result );
    void taskInitDataPut( const std::string & a_id, const std::string & a_path, Encryption a_encrypt, Auth::TaskDataReply & a_reply, libjson::Value & a_result );
    void taskInitRecordCollectionDelete( const std::vector<std::string> & a_ids, libjson::Value & a_result );
    void taskInitRecordAllocChange( const Auth::RecordAllocChangeRequest & a_request, Auth::RecordAllocChangeReply & a_reply, libjson::Value & a_result );
    void taskInitRecordOwnerChange( const Auth::RecordOwnerChangeRequest & a_request, Auth::RecordOwnerChangeReply & a_reply, libjson::Value & a_result );
    void taskInitRepoAllocationCreate( const Auth::RepoAllocationCreateRequest & a_request, Auth::TaskDataReply & a_reply, libjson::Value & a_result );
    void taskInitRepoAllocationDelete( const Auth::RepoAllocationDeleteRequest & a_request, Auth::TaskDataReply & a_reply, libjson::Value & a_result );
    void taskInitProjectDelete( const std::vector<std::string> & a_ids, libjson::Value & a_result );
    void taskUpdate( const std::string & a_id, TaskStatus * a_status = 0, const std::string * a_message = 0, double * a_progress = 0, libjson::Value * a_state = 0 );
    void taskFinalize( const std::string & a_task_id, bool a_succeeded, const std::string & a_msg, libjson::Value & a_result );
    void taskList( const Auth::TaskListRequest & a_request, Auth::TaskDataReply & a_reply );
    void taskView( const Auth::TaskViewRequest & a_request, Auth::TaskDataReply & a_reply );

    // TODO Project Delete

private:
    long dbGet( const char * a_url_path, const std::vector<std::pair<std::string,std::string>> &a_params, libjson::Value & a_result, bool a_log = true );
    bool dbGetRaw( const char * a_url_path, const std::vector<std::pair<std::string,std::string>> &a_params, std::string & a_result );
    long dbPost( const char * a_url_path, const std::vector<std::pair<std::string,std::string>> &a_params, const std::string * a_body, libjson::Value & a_result );
    void setAuthStatus( Anon::AuthStatusReply & a_reply, libjson::Value & a_result );
    void setUserData( Auth::UserDataReply & a_reply, libjson::Value & a_result );
    void setProjectData( Auth::ProjectDataReply & a_reply, libjson::Value & a_result );
    void setRecordData( Auth::RecordDataReply & a_reply, libjson::Value & a_result );
    void setCollData( Auth::CollDataReply & a_reply, libjson::Value & a_result );
    void setCollPathData( Auth::CollPathReply & a_reply, libjson::Value & a_result );
    void setQueryData( Auth::QueryDataReply & a_reply, libjson::Value & a_result );
    void setListingData( Auth::ListingReply & a_reply, libjson::Value & a_result );
    void setGroupData( Auth::GroupDataReply & a_reply, libjson::Value & a_result );
    void setACLData( Auth::ACLDataReply & a_reply, libjson::Value & a_result );
    void setAllocData( Auth::RepoAllocationsReply & a_reply, libjson::Value & a_result );
    void setRepoData( Auth::RepoDataReply * a_reply, std::vector<RepoData*> * a_repos, libjson::Value & a_result );
    void setAllocStatsData( Auth::RepoAllocationStatsReply & a_reply, libjson::Value & a_result );
    void setAllocStatsData( libjson::Value & a_value, AllocStatsData & a_stats );
    void setTaskDataFromTaskInit( Auth::TaskDataReply & a_reply, libjson::Value & a_result );
    void setTaskDataFromList( Auth::TaskDataReply & a_reply, libjson::Value & a_result );
    void setTaskData( TaskData * a_task, libjson::Value & a_task_json );

    CURL *      m_curl;
    char *      m_client;
    std::string m_client_uid;
    std::string m_db_url;
};

}}

#endif
