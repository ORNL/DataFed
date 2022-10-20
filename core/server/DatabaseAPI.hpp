#ifndef DATABASEAPI_HPP
#define DATABASEAPI_HPP

#include <memory>
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
    void userCreate( const Auth::UserCreateRequest & a_request, Auth::UserDataReply & a_reply );
    void userView( const Auth::UserViewRequest & a_request, Auth::UserDataReply & a_reply );
    void userUpdate( const Auth::UserUpdateRequest & a_request, Auth::UserDataReply & a_reply );
    void userListAll( const Auth::UserListAllRequest & a_request, Auth::UserDataReply & a_reply );
    void userListCollab( const Auth::UserListCollabRequest & a_request, Auth::UserDataReply & a_reply );
    void userFindByUUIDs( const Auth::UserFindByUUIDsRequest & a_request, Auth::UserDataReply & a_reply );
    void userFindByNameUID( const Auth::UserFindByNameUIDRequest & a_request, Auth::UserDataReply & a_reply );
    void userGetRecentEP( const Auth::UserGetRecentEPRequest & a_request, Auth::UserGetRecentEPReply & a_reply );
    void userSetRecentEP( const Auth::UserSetRecentEPRequest & a_request, Anon::AckReply & a_reply );

    void projCreate( const Auth::ProjectCreateRequest & a_request, Auth::ProjectDataReply & a_reply );
    void projUpdate( const Auth::ProjectUpdateRequest & a_request, Auth::ProjectDataReply & a_reply );
    void projView( const Auth::ProjectViewRequest & a_request, Auth::ProjectDataReply & a_reply );
    void projList( const Auth::ProjectListRequest & a_request, Auth::ListingReply & a_reply );
    void projSearch( const std::string & a_query, Auth::ProjectDataReply & a_reply );
    void projGetRole( const Auth::ProjectGetRoleRequest & a_request, Auth::ProjectGetRoleReply & a_reply );

    void recordView( const Auth::RecordViewRequest & a_request, Auth::RecordDataReply & a_reply );
    void recordCreate( const Auth::RecordCreateRequest & a_request, Auth::RecordDataReply & a_reply );
    void recordCreateBatch( const Auth::RecordCreateBatchRequest & a_request, Auth::RecordDataReply & a_reply );
    void recordUpdate( const Auth::RecordUpdateRequest & a_request, Auth::RecordDataReply & a_reply, libjson::Value & result );
    void recordUpdateBatch( const Auth::RecordUpdateBatchRequest & a_request, Auth::RecordDataReply & a_reply, libjson::Value & result );
    //void recordUpdatePostPut( const std::string & a_data_id, size_t a_file_size, time_t a_mod_time, const std::string & a_src_path, const std::string * a_ext = 0 );
    void recordUpdateSize( const Auth::RepoDataSizeReply & a_sizes );
    void recordUpdateSchemaError( const std::string & a_rec_id, const std::string & a_err_msg );
    void recordExport( const Auth::RecordExportRequest & a_request, Auth::RecordExportReply & a_reply );
    void recordLock( const Auth::RecordLockRequest & a_request, Auth::ListingReply & a_reply );
    //void recordSearch( const Auth::RecordSearchRequest & a_request, Auth::ListingReply & a_reply );
    //void recordSearchPublished( const Auth::RecordSearchPublishedRequest & a_request, Auth::ListingReply & a_reply );
    void recordListByAlloc( const Auth::RecordListByAllocRequest & a_request, Auth::ListingReply & a_reply );
    //void recordGetDependencies( const Auth::RecordGetDependenciesRequest & a_request, Auth::ListingReply & a_reply );
    void recordGetDependencyGraph( const Auth::RecordGetDependencyGraphRequest & a_request, Auth::ListingReply & a_reply );
    //void recordUpdateDataMoveInit( const libjson::Value & a_rec_ids, const std::string & a_new_repo_id, const std::string & a_new_owner_id, const std::string & a_new_coll_id );
    //void recordUpdateDataMoveRevert( const libjson::Value & a_rec_ids );
    //void recordUpdateDataMoveFinalize( const libjson::Value & a_rec_ids );

    void generalSearch( const Auth::SearchRequest & a_request, Auth::ListingReply & a_reply );

    //void doiView( const Auth::DOIViewRequest & a_request, Auth::RecordDataReply & a_reply );

    void dataPath( const Auth::DataPathRequest & a_request, Auth::DataPathReply & a_reply );

    void collListPublished( const Auth::CollListPublishedRequest & a_request, Auth::ListingReply & a_reply );
    void collCreate( const Auth::CollCreateRequest & a_request, Auth::CollDataReply & a_reply );
    void collUpdate( const Auth::CollUpdateRequest & a_request, Auth::CollDataReply & a_reply );
    void collView( const Auth::CollViewRequest & a_request, Auth::CollDataReply & a_reply );
    void collRead( const Auth::CollReadRequest & a_request, Auth::ListingReply & a_reply );
    void collWrite( const Auth::CollWriteRequest & a_request, Auth::ListingReply & a_reply );
    void collMove( const Auth::CollMoveRequest & a_request, Anon::AckReply & a_reply );
    void collGetParents( const Auth::CollGetParentsRequest & a_request, Auth::CollPathReply & a_reply );
    void collGetOffset( const Auth::CollGetOffsetRequest & a_request, Auth::CollGetOffsetReply & a_reply );

    //void catalogSearch( const Auth::CatalogSearchRequest & a_request, Auth::CatalogSearchReply & a_reply );

    void queryList( const Auth::QueryListRequest & a_request, Auth::ListingReply & a_reply );
    void queryCreate( const Auth::QueryCreateRequest & a_request, Auth::QueryDataReply & a_reply );
    void queryUpdate( const Auth::QueryUpdateRequest & a_request, Auth::QueryDataReply & a_reply );
    void queryDelete( const Auth::QueryDeleteRequest & a_request, Anon::AckReply & a_reply );
    //void queryDelete( const std::string & a_id );
    void queryView( const Auth::QueryViewRequest & a_request, Auth::QueryDataReply & a_reply );
    void queryExec( const Auth::QueryExecRequest & a_request, Auth::ListingReply & a_reply );

    void aclView( const Auth::ACLViewRequest & a_request, Auth::ACLDataReply & a_reply );
    void aclUpdate( const Auth::ACLUpdateRequest & a_request,  Auth::ACLDataReply & a_reply );
    void aclSharedList( const Auth::ACLSharedListRequest & a_request,  Auth::ListingReply & a_reply );
    void aclSharedListItems( const Auth::ACLSharedListItemsRequest & a_request,  Auth::ListingReply & a_reply );

    //void aclByUser( const Auth::ACLByUserRequest & a_request,  Auth::UserDataReply & a_reply );
    //void aclByUserList( const Auth::ACLByUserListRequest & a_request,  Auth::ListingReply & a_reply );
    //void aclByProj( const Auth::ACLByProjRequest & a_request,  Auth::ProjectDataReply & a_reply );
    //void aclByProjList( const Auth::ACLByProjListRequest & a_request,  Auth::ListingReply & a_reply );

    void groupCreate( const Auth::GroupCreateRequest & a_request, Auth::GroupDataReply & a_reply );
    void groupUpdate( const Auth::GroupUpdateRequest & a_request, Auth::GroupDataReply & a_reply );
    void groupDelete( const Auth::GroupDeleteRequest & a_request, Anon::AckReply & a_reply );
    void groupList( const Auth::GroupListRequest & a_request, Auth::GroupDataReply & a_reply );
    void groupView( const Auth::GroupViewRequest & a_request, Auth::GroupDataReply & a_reply );

    void repoList( std::vector<RepoData> & a_repos );
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

    void topicListTopics( const Auth::TopicListTopicsRequest & a_request, Auth::TopicDataReply & a_reply );
    void topicView( const Auth::TopicViewRequest  & a_request, Auth::TopicDataReply & a_reply );
    void topicSearch( const Auth::TopicSearchRequest & a_request, Auth::TopicDataReply & a_reply );
    //void topicListCollections( const Auth::TopicListCollectionsRequest & a_request, Auth::TopicListCollectionsReply & a_reply );
    //void topicLink( const Auth::TopicLinkRequest & a_request, Anon::AckReply & a_reply );
    //void topicUnlink( const Auth::TopicUnlinkRequest & a_request, Anon::AckReply & a_reply );

    void noteCreate( const Auth::NoteCreateRequest & a_request, Auth::NoteDataReply & a_reply );
    void noteUpdate( const Auth::NoteUpdateRequest & a_request, Auth::NoteDataReply & a_reply );
    void noteCommentEdit( const Auth::NoteCommentEditRequest & a_request, Auth::NoteDataReply & a_reply );
    void noteView( const Auth::NoteViewRequest & a_request, Auth::NoteDataReply & a_reply );
    void noteListBySubject( const Auth::NoteListBySubjectRequest & a_request, Auth::NoteDataReply & a_reply );
    void notePurge( uint32_t a_age_sec );

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

    void tagSearch( const Auth::TagSearchRequest & a_request, Auth::TagDataReply & a_reply );
    void tagListByCount( const Auth::TagListByCountRequest & a_request, Auth::TagDataReply & a_reply );

    void schemaSearch( const Auth::SchemaSearchRequest & a_request, Auth::SchemaDataReply & a_reply );
    void schemaView( const Auth::SchemaViewRequest & a_request, Auth::SchemaDataReply & a_reply );
    void schemaView( const std::string & a_id, libjson::Value & a_result );
    void schemaCreate( const Auth::SchemaCreateRequest & a_request );
    void schemaRevise( const Auth::SchemaReviseRequest & a_request );
    void schemaUpdate( const Auth::SchemaUpdateRequest & a_request );
    void schemaDelete( const Auth::SchemaDeleteRequest & a_request, Anon::AckReply & a_reply );

    void dailyMessage( const Anon::DailyMessageRequest & a_request, Anon::DailyMessageReply & a_reply );

    void metricsUpdateMsgCounts( uint32_t a_timestamp, uint32_t a_total, const std::map<std::string,std::map<uint16_t,uint32_t>> & a_metrics );
    void metricsPurge( uint32_t a_timestamp );

    bool getTestMode();

private:
    long dbGet( const char * a_url_path, const std::vector<std::pair<std::string,std::string>> &a_params, libjson::Value & a_result, bool a_log = true );
    bool dbGetRaw( const char * a_url_path, const std::vector<std::pair<std::string,std::string>> &a_params, std::string & a_result );
    long dbPost( const char * a_url_path, const std::vector<std::pair<std::string,std::string>> &a_params, const std::string * a_body, libjson::Value & a_result );

    void setAuthStatus( Anon::AuthStatusReply & a_reply, const libjson::Value & a_result );
    void setUserData( Auth::UserDataReply & a_reply, const libjson::Value & a_result );
    void setProjectData( Auth::ProjectDataReply & a_reply, const libjson::Value & a_result );
    void setRecordData( Auth::RecordDataReply & a_reply, const libjson::Value & a_result );
    void setCollData( Auth::CollDataReply & a_reply, const libjson::Value & a_result );
    void setCollPathData( Auth::CollPathReply & a_reply, const libjson::Value & a_result );
    void setQueryData( Auth::QueryDataReply & a_reply, const libjson::Value & a_result );
    void setListingDataReply( Auth::ListingReply & a_reply, const libjson::Value & a_result );
    void setListingData( ListingData * a_item, const libjson::Value::Object & a_obj );
    void setGroupData( Auth::GroupDataReply & a_reply, const libjson::Value & a_result );
    void setACLData( Auth::ACLDataReply & a_reply, const libjson::Value & a_result );
    void setAllocData( Auth::RepoAllocationsReply & a_reply, const libjson::Value & a_result );
    void setAllocData( AllocData * a_alloc, const libjson::Value::Object & a_obj );
    void setRepoData( Auth::RepoDataReply * a_reply, std::vector<RepoData> & a_repos, const libjson::Value & a_result );
    void setAllocStatsData( AllocStatsData & a_stats, const libjson::Value::Object & a_object );
    void setNoteDataReply( Auth::NoteDataReply & a_reply, const libjson::Value & a_result );
    void setNoteData( NoteData * a_item, const libjson::Value::Object & a_obj );
    void setTaskDataReply( Auth::TaskDataReply & a_reply, const libjson::Value & a_result );
    void setTaskDataReplyArray( Auth::TaskDataReply & a_reply, const libjson::Value & a_result );
    void setTaskData( TaskData * a_task, const libjson::Value & a_task_json );
    void setDataGetReply( Auth::DataGetReply & a_reply, const libjson::Value & a_result );
    void setDataPutReply( Auth::DataPutReply & a_reply, const libjson::Value & a_result );
    //void setCatalogSearchReply( Auth::CatalogSearchReply & a_reply, const libjson::Value & a_result );
    //void setCatItemInfoData( CatItemInfoData * a_item, const libjson::Value::Object & a_obj );
    void setTagDataReply( Auth::TagDataReply & a_reply, const libjson::Value & a_result );
    void setTagData( TagData * a_tag, const libjson::Value::Object & a_obj );
    void setTopicDataReply( Auth::TopicDataReply & a_reply, const libjson::Value & a_result );
    void setSchemaDataReply( Auth::SchemaDataReply & a_reply, const libjson::Value & a_result );
    void setSchemaData( SchemaData * a_schema, const libjson::Value::Object & a_obj );

    //uint32_t parseCatalogSearchRequest( const Auth::CatalogSearchRequest & a_request, std::string & a_query, std::string & a_params, bool a_partial = false );
    //void parseRecordSearchPublishedRequest( const Auth::RecordSearchPublishedRequest & a_request, std::string & a_query, std::string & a_params );
    uint32_t    parseSearchRequest( const Auth::SearchRequest & a_request, std::string & a_qry_begin, std::string & a_qry_end, std::string & a_filter, std::string & a_params );
    std::string parseSearchTextPhrase( const std::string & a_phrase, const std::string & a_iter );
    std::string parseSearchTerms( const std::string & a_key, const std::vector<std::string> & a_terms, const std::string & a_iter );
    std::string parseSearchMetadata( const std::string & a_query, const std::string & a_iter = "i" );
    std::string parseSearchIdAlias( const std::string & a_query, const std::string & a_iter );

    CURL *      m_curl;
    char *      m_client;
    std::string m_client_uid;
    std::string m_db_url;
};

}}

#endif
