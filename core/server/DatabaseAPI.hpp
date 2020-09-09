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

    void serverPing();

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
    void userCreate( const Auth::UserCreateRequest & a_request, Anon::UserDataReply & a_reply );
    void userView( const Anon::UserViewRequest & a_request, Anon::UserDataReply & a_reply );
    void userUpdate( const Auth::UserUpdateRequest & a_request, Anon::UserDataReply & a_reply );
    void userListAll( const Auth::UserListAllRequest & a_request, Anon::UserDataReply & a_reply );
    void userListCollab( const Auth::UserListCollabRequest & a_request, Anon::UserDataReply & a_reply );
    void userFindByUUIDs( const Auth::UserFindByUUIDsRequest & a_request, Anon::UserDataReply & a_reply );
    void userFindByNameUID( const Auth::UserFindByNameUIDRequest & a_request, Anon::UserDataReply & a_reply );
    void userGetRecentEP( const Auth::UserGetRecentEPRequest & a_request, Auth::UserGetRecentEPReply & a_reply );
    void userSetRecentEP( const Auth::UserSetRecentEPRequest & a_request, Anon::AckReply & a_reply );

    void projCreate( const Auth::ProjectCreateRequest & a_request, Anon::ProjectDataReply & a_reply );
    void projUpdate( const Auth::ProjectUpdateRequest & a_request, Anon::ProjectDataReply & a_reply );
    void projView( const Anon::ProjectViewRequest & a_request, Anon::ProjectDataReply & a_reply );
    void projList( const Auth::ProjectListRequest & a_request, Anon::ListingReply & a_reply );
    void projSearch( const std::string & a_query, Anon::ProjectDataReply & a_reply );
    void projGetRole( const Auth::ProjectGetRoleRequest & a_request, Auth::ProjectGetRoleReply & a_reply );

    void recordView( const Anon::RecordViewRequest & a_request, Anon::RecordDataReply & a_reply );
    void recordCreate( const Auth::RecordCreateRequest & a_request, Anon::RecordDataReply & a_reply );
    void recordCreateBatch( const Auth::RecordCreateBatchRequest & a_request, Anon::RecordDataReply & a_reply );
    void recordUpdate( const Auth::RecordUpdateRequest & a_request, Anon::RecordDataReply & a_reply, libjson::Value & result );
    void recordUpdateBatch( const Auth::RecordUpdateBatchRequest & a_request, Anon::RecordDataReply & a_reply, libjson::Value & result );
    //void recordUpdatePostPut( const std::string & a_data_id, size_t a_file_size, time_t a_mod_time, const std::string & a_src_path, const std::string * a_ext = 0 );
    void recordUpdateSize( const Auth::RepoDataSizeReply & a_sizes );
    void recordExport( const Auth::RecordExportRequest & a_request, Auth::RecordExportReply & a_reply );
    void recordLock( const Auth::RecordLockRequest & a_request, Anon::ListingReply & a_reply );
    void recordSearch( const Auth::RecordSearchRequest & a_request, Anon::ListingReply & a_reply );
    void recordListByAlloc( const Auth::RecordListByAllocRequest & a_request, Anon::ListingReply & a_reply );
    //void recordGetDependencies( const Auth::RecordGetDependenciesRequest & a_request, Anon::ListingReply & a_reply );
    void recordGetDependencyGraph( const Auth::RecordGetDependencyGraphRequest & a_request, Anon::ListingReply & a_reply );
    //void recordUpdateDataMoveInit( const libjson::Value & a_rec_ids, const std::string & a_new_repo_id, const std::string & a_new_owner_id, const std::string & a_new_coll_id );
    //void recordUpdateDataMoveRevert( const libjson::Value & a_rec_ids );
    //void recordUpdateDataMoveFinalize( const libjson::Value & a_rec_ids );

    void doiView( const Anon::DOIViewRequest & a_request, Anon::RecordDataReply & a_reply );

    void dataPath( const Auth::DataPathRequest & a_request, Auth::DataPathReply & a_reply );

    void collList( const Auth::CollListRequest & a_request, Anon::CollDataReply & a_reply );
    void collListPublished( const Auth::CollListPublishedRequest & a_request, Anon::ListingReply & a_reply );
    void collCreate( const Auth::CollCreateRequest & a_request, Anon::CollDataReply & a_reply );
    void collUpdate( const Auth::CollUpdateRequest & a_request, Anon::CollDataReply & a_reply );
    void collView( const Anon::CollViewRequest & a_request, Anon::CollDataReply & a_reply );
    void collRead( const Anon::CollReadRequest & a_request, Anon::ListingReply & a_reply );
    void collWrite( const Auth::CollWriteRequest & a_request, Anon::ListingReply & a_reply );
    void collMove( const Auth::CollMoveRequest & a_request, Anon::AckReply & a_reply );
    void collGetParents( const Auth::CollGetParentsRequest & a_request, Auth::CollPathReply & a_reply );
    void collGetOffset( const Auth::CollGetOffsetRequest & a_request, Auth::CollGetOffsetReply & a_reply );

    void queryList( const Auth::QueryListRequest & a_request, Anon::ListingReply & a_reply );
    void queryCreate( const Auth::QueryCreateRequest & a_request, Auth::QueryDataReply & a_reply );
    void queryUpdate( const Auth::QueryUpdateRequest & a_request, Auth::QueryDataReply & a_reply );
    void queryDelete( const std::string & a_id );
    void queryView( const Auth::QueryViewRequest & a_request, Auth::QueryDataReply & a_reply );
    void queryExec( const Auth::QueryExecRequest & a_request, Anon::ListingReply & a_reply );

    void aclView( const Auth::ACLViewRequest & a_request, Auth::ACLDataReply & a_reply );
    void aclUpdate( const Auth::ACLUpdateRequest & a_request,  Auth::ACLDataReply & a_reply );

    void aclBySubject( const Auth::ACLBySubjectRequest & a_request,  Anon::ListingReply & a_reply );
    void aclListItemsBySubject( const Auth::ACLListItemsBySubjectRequest & a_request,  Anon::ListingReply & a_reply );

    //void aclByUser( const Auth::ACLByUserRequest & a_request,  Anon::UserDataReply & a_reply );
    //void aclByUserList( const Auth::ACLByUserListRequest & a_request,  Anon::ListingReply & a_reply );
    //void aclByProj( const Auth::ACLByProjRequest & a_request,  Auth::ProjectDataReply & a_reply );
    //void aclByProjList( const Auth::ACLByProjListRequest & a_request,  Anon::ListingReply & a_reply );

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
    void repoAllocationSetDefault( const Auth::RepoAllocationSetDefaultRequest & a_request, Anon::AckReply  & a_reply );
    void repoAuthz( const Auth::RepoAuthzRequest & a_request, Anon::AckReply  & a_reply );

    void topicListTopics( const Anon::TopicListTopicsRequest & a_request, Anon::ListingReply & a_reply );
    void topicListCollections( const Anon::TopicListCollectionsRequest & a_request, Anon::TopicListCollectionsReply & a_reply );
    void topicSearch( const Anon::TopicSearchRequest & a_request, Anon::ListingReply & a_reply );
    //void topicLink( const Auth::TopicLinkRequest & a_request, Anon::AckReply & a_reply );
    //void topicUnlink( const Auth::TopicUnlinkRequest & a_request, Anon::AckReply & a_reply );

    void annotationCreate( const Auth::AnnotationCreateRequest & a_request, Anon::AnnotationDataReply & a_reply );
    void annotationUpdate( const Auth::AnnotationUpdateRequest & a_request, Anon::AnnotationDataReply & a_reply );
    void annotationCommentEdit( const Auth::AnnotationCommentEditRequest & a_request, Anon::AnnotationDataReply & a_reply );
    void annotationView( const Anon::AnnotationViewRequest & a_request, Anon::AnnotationDataReply & a_reply );
    void annotationListBySubject( const Anon::AnnotationListBySubjectRequest & a_request, Anon::AnnotationDataReply & a_reply );
    void annotationPurge( uint32_t a_age_sec );

    void taskLoadReady( libjson::Value & a_result );
    void taskRun( const std::string & a_task_id, libjson::Value & a_task_reply, int * a_step = 0, std::string * a_err_msg = 0 );
    void taskAbort( const std::string & a_task_id, const std::string & a_msg, libjson::Value & a_task_reply );

    void taskInitDataGet( const Auth::DataGetRequest & a_request, Auth::DataGetReply & a_reply, libjson::Value & a_result );
    void taskInitDataPut( const Auth::DataPutRequest & a_request, Auth::DataPutReply & a_reply, libjson::Value & a_result );
    void taskInitRecordCollectionDelete( const std::vector<std::string> & a_ids, Auth::TaskDataReply & a_reply, libjson::Value & a_result );
    void taskInitRecordAllocChange( const Auth::RecordAllocChangeRequest & a_request, Auth::RecordAllocChangeReply & a_reply, libjson::Value & a_result );
    void taskInitRecordOwnerChange( const Auth::RecordOwnerChangeRequest & a_request, Auth::RecordOwnerChangeReply & a_reply, libjson::Value & a_result );
    void taskInitRepoAllocationCreate( const Auth::RepoAllocationCreateRequest & a_request, Auth::TaskDataReply & a_reply, libjson::Value & a_result );
    void taskInitRepoAllocationDelete( const Auth::RepoAllocationDeleteRequest & a_request, Auth::TaskDataReply & a_reply, libjson::Value & a_result );
    void taskInitProjectDelete( const Auth::ProjectDeleteRequest & a_request, Auth::TaskDataReply & a_reply, libjson::Value & a_result );
    void taskStart( const std::string & a_task_id, libjson::Value & a_result );
    void taskUpdate( const std::string & a_id, TaskStatus * a_status = 0, const std::string * a_message = 0, double * a_progress = 0, libjson::Value * a_state = 0 );
    void taskFinalize( const std::string & a_task_id, bool a_succeeded, const std::string & a_msg, libjson::Value & a_result );
    void taskList( const Auth::TaskListRequest & a_request, Auth::TaskDataReply & a_reply );
    void taskView( const Auth::TaskViewRequest & a_request, Auth::TaskDataReply & a_reply );
    void taskPurge( uint32_t a_age_sec );

    void tagSearch( const Anon::TagSearchRequest & a_request, Anon::TagDataReply & a_reply );
    void tagListByCount( const Anon::TagListByCountRequest & a_request, Anon::TagDataReply & a_reply );

private:
    long dbGet( const char * a_url_path, const std::vector<std::pair<std::string,std::string>> &a_params, libjson::Value & a_result, bool a_log = true );
    bool dbGetRaw( const char * a_url_path, const std::vector<std::pair<std::string,std::string>> &a_params, std::string & a_result );
    long dbPost( const char * a_url_path, const std::vector<std::pair<std::string,std::string>> &a_params, const std::string * a_body, libjson::Value & a_result );
    void setAuthStatus( Anon::AuthStatusReply & a_reply, const libjson::Value & a_result );
    void setUserData( Anon::UserDataReply & a_reply, const libjson::Value & a_result );
    void setProjectData( Anon::ProjectDataReply & a_reply, const libjson::Value & a_result );
    void setRecordData( Anon::RecordDataReply & a_reply, const libjson::Value & a_result );
    void setCollData( Anon::CollDataReply & a_reply, const libjson::Value & a_result );
    void setCollPathData( Auth::CollPathReply & a_reply, const libjson::Value & a_result );
    void setQueryData( Auth::QueryDataReply & a_reply, const libjson::Value & a_result );
    void setListingDataReply( Anon::ListingReply & a_reply, const libjson::Value & a_result );
    void setListingData( ListingData * a_item, const libjson::Value::Object & a_obj );
    void setGroupData( Auth::GroupDataReply & a_reply, const libjson::Value & a_result );
    void setACLData( Auth::ACLDataReply & a_reply, const libjson::Value & a_result );
    void setAllocData( Auth::RepoAllocationsReply & a_reply, const libjson::Value & a_result );
    void setAllocData( AllocData * a_alloc, const libjson::Value::Object & a_obj );
    void setRepoData( Auth::RepoDataReply * a_reply, std::vector<RepoData*> * a_repos, const libjson::Value & a_result );
    void setAllocStatsData( AllocStatsData & a_stats, const libjson::Value::Object & a_object );
    void setNoteDataReply( Anon::AnnotationDataReply & a_reply, const libjson::Value & a_result );
    void setNoteData( NoteData * a_item, const libjson::Value::Object & a_obj );
    void setTaskDataReply( Auth::TaskDataReply & a_reply, const libjson::Value & a_result );
    void setTaskDataReplyArray( Auth::TaskDataReply & a_reply, const libjson::Value & a_result );
    void setTaskData( TaskData * a_task, const libjson::Value & a_task_json );
    void setDataGetReply( Auth::DataGetReply & a_reply, const libjson::Value & a_result );
    void setDataPutReply( Auth::DataPutReply & a_reply, const libjson::Value & a_result );
    void setTopicListCollectionsReply( Anon::TopicListCollectionsReply & a_reply, const libjson::Value & result );
    void setCollInfoData( CollInfoData * a_item, const libjson::Value::Object & a_obj );
    void setTagDataReply( Anon::TagDataReply & a_reply, const libjson::Value & a_result );
    void setTagData( TagData * a_tag, const libjson::Value::Object & a_obj );

    CURL *      m_curl;
    char *      m_client;
    std::string m_client_uid;
    std::string m_db_url;
};

}}

#endif
