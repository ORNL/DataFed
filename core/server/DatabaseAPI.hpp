#ifndef DATABASEAPI_HPP
#define DATABASEAPI_HPP
#pragma once

// Local public includes
#include "common/DynaLog.hpp"
#include "common/envelope.pb.h"
#include "common/libjson.hpp"

// Third party includes
#include <curl/curl.h>

// Standard includes
#include <memory>
#include <string>
#include <vector>

namespace SDMS {
namespace Core {

class DatabaseAPI {
public:
  struct UserTokenInfo {
    std::string uid;
    std::string access_token;
    std::string refresh_token;
    uint32_t expiration;
  };

  DatabaseAPI(const std::string &a_db_url, const std::string &a_db_user,
              const std::string &a_db_pass);
  ~DatabaseAPI();

  void serverPing(LogContext log_context);

  void setClient(const std::string &a_client);

  void clientAuthenticateByPassword(const std::string &a_password,
                                    SDMS::AuthStatusReply &a_reply,
                                    LogContext log_context);
  void clientAuthenticateByToken(const std::string &a_token,
                                 SDMS::AuthStatusReply &a_reply,
                                 LogContext log_context);
  void clientLinkIdentity(const std::string &a_identity,
                          LogContext log_context);
  bool uidByPubKey(const std::string &a_pub_key, std::string &a_uid, LogContext log_context);
  bool userGetKeys(std::string &a_pub_key, std::string &a_priv_key,
                   LogContext log_context);
  void userSetKeys(const std::string &a_pub_key, const std::string &a_priv_key,
                   LogContext log_context);
  void userClearKeys(LogContext log_context);
  void userSetAccessToken(const std::string &a_acc_tok,
                          const uint32_t a_expires_in,
                          const std::string &a_ref_tok,
                          const SDMS::AccessTokenType &token_type,
                          const std::string &other_token_data,
                          LogContext log_context);
  void userSetAccessToken(const std::string &a_access_token,
                          const uint32_t a_expires_in,
                          const std::string &a_refresh_token,
                          LogContext log_context);
  void userGetAccessToken(std::string &a_acc_tok, std::string &a_ref_tok,
                          uint32_t &a_expires_in,
                          const std::string collection_id,
                          const std::string collection_type,
                          bool &needs_consent,
                          int &token_type, // TODO: use underlying type?
                          std::string &scopes, LogContext log_context);
  void getExpiringAccessTokens(uint32_t a_expires_in,
                               std::vector<UserTokenInfo> &a_expiring_tokens,
                               LogContext log_context);
  void purgeTransferRecords(size_t age);
  void checkPerms(const SDMS::CheckPermsRequest &a_request,
                  SDMS::CheckPermsReply &a_reply, LogContext log_context);
  void getPerms(const SDMS::GetPermsRequest &a_request,
                SDMS::GetPermsReply &a_reply, LogContext log_context);
  void userSetAccessToken(const SDMS::UserSetAccessTokenRequest &a_request,
                          SDMS::AckReply &a_reply, LogContext log_context);
  void userCreate(const SDMS::UserCreateRequest &a_request,
                  SDMS::UserDataReply &a_reply, LogContext log_context);
  void userView(const SDMS::UserViewRequest &a_request,
                SDMS::UserDataReply &a_reply, LogContext log_context);
  void userUpdate(const SDMS::UserUpdateRequest &a_request,
                  SDMS::UserDataReply &a_reply, LogContext log_context);
  void userListAll(const SDMS::UserListAllRequest &a_request,
                   SDMS::UserDataReply &a_reply, LogContext log_context);
  void userListCollab(const SDMS::UserListCollabRequest &a_request,
                      SDMS::UserDataReply &a_reply, LogContext log_context);
  void userFindByUUIDs(const SDMS::UserFindByUUIDsRequest &a_request,
                       SDMS::UserDataReply &a_reply, LogContext log_context);
  void userFindByNameUID(const SDMS::UserFindByNameUIDRequest &a_request,
                         SDMS::UserDataReply &a_reply, LogContext log_context);
  void userGetRecentEP(const SDMS::UserGetRecentEPRequest &a_request,
                       SDMS::UserGetRecentEPReply &a_reply,
                       LogContext log_context);
  void userSetRecentEP(const SDMS::UserSetRecentEPRequest &a_request,
                       SDMS::AckReply &a_reply, LogContext log_context);

  void projCreate(const SDMS::ProjectCreateRequest &a_request,
                  SDMS::ProjectDataReply &a_reply, LogContext log_context);
  void projUpdate(const SDMS::ProjectUpdateRequest &a_request,
                  SDMS::ProjectDataReply &a_reply, LogContext log_context);
  void projView(const SDMS::ProjectViewRequest &a_request,
                SDMS::ProjectDataReply &a_reply, LogContext log_context);
  void projList(const SDMS::ProjectListRequest &a_request,
                SDMS::ListingReply &a_reply, LogContext log_context);
  void projSearch(const std::string &a_query, SDMS::ProjectDataReply &a_reply,
                  LogContext log_context);
  void projGetRole(const SDMS::ProjectGetRoleRequest &a_request,
                   SDMS::ProjectGetRoleReply &a_reply, LogContext log_context);

  void recordView(const SDMS::RecordViewRequest &a_request,
                  SDMS::RecordDataReply &a_reply, LogContext log_context);
  void recordCreate(const SDMS::RecordCreateRequest &a_request,
                    SDMS::RecordDataReply &a_reply, LogContext log_context);
  void recordCreateBatch(const SDMS::RecordCreateBatchRequest &a_request,
                         SDMS::RecordDataReply &a_reply,
                         LogContext log_context);
  void recordUpdate(const SDMS::RecordUpdateRequest &a_request,
                    SDMS::RecordDataReply &a_reply, libjson::Value &result,
                    LogContext log_context);
  void recordUpdateBatch(const SDMS::RecordUpdateBatchRequest &a_request,
                         SDMS::RecordDataReply &a_reply, libjson::Value &result,
                         LogContext log_context);
  void recordUpdateSize(const SDMS::RepoDataSizeReply &a_sizes,
                        LogContext log_context);
  void recordUpdateSchemaError(const std::string &a_rec_id,
                               const std::string &a_err_msg,
                               LogContext log_context);
  void recordExport(const SDMS::RecordExportRequest &a_request,
                    SDMS::RecordExportReply &a_reply, LogContext log_context);
  void recordLock(const SDMS::RecordLockRequest &a_request,
                  SDMS::ListingReply &a_reply, LogContext log_context);
  void recordListByAlloc(const SDMS::RecordListByAllocRequest &a_request,
                         SDMS::ListingReply &a_reply, LogContext log_context);
  void recordGetDependencyGraph(
      const SDMS::RecordGetDependencyGraphRequest &a_request,
      SDMS::ListingReply &a_reply, LogContext log_context);

  void generalSearch(const SDMS::SearchRequest &a_request,
                     SDMS::ListingReply &a_reply, LogContext log_context);

  void dataPath(const SDMS::DataPathRequest &a_request,
                SDMS::DataPathReply &a_reply, LogContext log_context);

  void collListPublished(const SDMS::CollListPublishedRequest &a_request,
                         SDMS::ListingReply &a_reply, LogContext log_context);
  void collCreate(const SDMS::CollCreateRequest &a_request,
                  SDMS::CollDataReply &a_reply, LogContext log_context);
  void collUpdate(const SDMS::CollUpdateRequest &a_request,
                  SDMS::CollDataReply &a_reply, LogContext log_context);
  void collView(const SDMS::CollViewRequest &a_request,
                SDMS::CollDataReply &a_reply, LogContext log_context);
  void collRead(const SDMS::CollReadRequest &a_request,
                SDMS::ListingReply &a_reply, LogContext log_context);
  void collWrite(const SDMS::CollWriteRequest &a_request,
                 SDMS::ListingReply &a_reply, LogContext log_context);
  void collMove(const SDMS::CollMoveRequest &a_request, SDMS::AckReply &a_reply,
                LogContext log_context);
  void collGetParents(const SDMS::CollGetParentsRequest &a_request,
                      SDMS::CollPathReply &a_reply, LogContext log_context);
  void collGetOffset(const SDMS::CollGetOffsetRequest &a_request,
                     SDMS::CollGetOffsetReply &a_reply, LogContext log_context);

  void queryList(const SDMS::QueryListRequest &a_request,
                 SDMS::ListingReply &a_reply, LogContext log_context);
  void queryCreate(const SDMS::QueryCreateRequest &a_request,
                   SDMS::QueryDataReply &a_reply, LogContext log_context);
  void queryUpdate(const SDMS::QueryUpdateRequest &a_request,
                   SDMS::QueryDataReply &a_reply, LogContext log_context);
  void queryDelete(const SDMS::QueryDeleteRequest &a_request,
                   SDMS::AckReply &a_reply, LogContext log_context);
  void queryView(const SDMS::QueryViewRequest &a_request,
                 SDMS::QueryDataReply &a_reply, LogContext log_context);
  void queryExec(const SDMS::QueryExecRequest &a_request,
                 SDMS::ListingReply &a_reply, LogContext log_context);

  void aclView(const SDMS::ACLViewRequest &a_request,
               SDMS::ACLDataReply &a_reply, LogContext log_context);
  void aclUpdate(const SDMS::ACLUpdateRequest &a_request,
                 SDMS::ACLDataReply &a_reply, LogContext log_context);
  void aclSharedList(const SDMS::ACLSharedListRequest &a_request,
                     SDMS::ListingReply &a_reply, LogContext log_context);
  void aclSharedListItems(const SDMS::ACLSharedListItemsRequest &a_request,
                          SDMS::ListingReply &a_reply, LogContext log_context);

  void groupCreate(const SDMS::GroupCreateRequest &a_request,
                   SDMS::GroupDataReply &a_reply, LogContext log_context);
  void groupUpdate(const SDMS::GroupUpdateRequest &a_request,
                   SDMS::GroupDataReply &a_reply, LogContext log_context);
  void groupDelete(const SDMS::GroupDeleteRequest &a_request,
                   SDMS::AckReply &a_reply, LogContext log_context);
  void groupList(const SDMS::GroupListRequest &a_request,
                 SDMS::GroupDataReply &a_reply, LogContext log_context);
  void groupView(const SDMS::GroupViewRequest &a_request,
                 SDMS::GroupDataReply &a_reply, LogContext log_context);

  void repoList(std::vector<RepoData> &a_repos, LogContext log_context);
  void repoList(const SDMS::RepoListRequest &a_request,
                SDMS::RepoDataReply &a_reply, LogContext log_context);
  void repoView(std::vector<RepoData> &a_repos, LogContext log_context);
  void repoView(const SDMS::RepoViewRequest &a_request,
                SDMS::RepoDataReply &a_reply, LogContext log_context);
  void repoCreate(const SDMS::RepoCreateRequest &a_request,
                  SDMS::RepoDataReply &a_reply, LogContext log_context);
  void repoUpdate(const SDMS::RepoUpdateRequest &a_request,
                  SDMS::RepoDataReply &a_reply, LogContext log_context);
  void repoDelete(const SDMS::RepoDeleteRequest &a_request,
                  SDMS::AckReply &a_reply, LogContext log_context);
  void repoCalcSize(const SDMS::RepoCalcSizeRequest &a_request,
                    SDMS::RepoCalcSizeReply &a_reply, LogContext log_context);
  void repoListAllocations(const SDMS::RepoListAllocationsRequest &a_request,
                           SDMS::RepoAllocationsReply &a_reply,
                           LogContext log_context);
  void repoListSubjectAllocations(
      const SDMS::RepoListSubjectAllocationsRequest &a_request,
      SDMS::RepoAllocationsReply &a_reply, LogContext log_context);
  void repoListObjectAllocations(
      const SDMS::RepoListObjectAllocationsRequest &a_request,
      SDMS::RepoAllocationsReply &a_reply, LogContext log_context);
  void repoViewAllocation(const SDMS::RepoViewAllocationRequest &a_request,
                          SDMS::RepoAllocationsReply &a_reply,
                          LogContext log_context);
  void repoAllocationStats(const SDMS::RepoAllocationStatsRequest &a_request,
                           SDMS::RepoAllocationStatsReply &a_reply,
                           LogContext log_context);
  void repoAllocationSet(const SDMS::RepoAllocationSetRequest &a_request,
                         SDMS::AckReply &a_reply, LogContext log_context);
  void repoAllocationSetDefault(
      const SDMS::RepoAllocationSetDefaultRequest &a_request,
      SDMS::AckReply &a_reply, LogContext log_context);
  void repoAuthz(const SDMS::RepoAuthzRequest &a_request,
                 SDMS::AckReply &a_reply, LogContext log_context);

  void topicListTopics(const SDMS::TopicListTopicsRequest &a_request,
                       SDMS::TopicDataReply &a_reply, LogContext log_context);
  void topicView(const SDMS::TopicViewRequest &a_request,
                 SDMS::TopicDataReply &a_reply, LogContext log_context);
  void topicSearch(const SDMS::TopicSearchRequest &a_request,
                   SDMS::TopicDataReply &a_reply, LogContext log_context);

  void noteCreate(const SDMS::NoteCreateRequest &a_request,
                  SDMS::NoteDataReply &a_reply, LogContext log_context);
  void noteUpdate(const SDMS::NoteUpdateRequest &a_request,
                  SDMS::NoteDataReply &a_reply, LogContext log_context);
  void noteCommentEdit(const SDMS::NoteCommentEditRequest &a_request,
                       SDMS::NoteDataReply &a_reply, LogContext log_context);
  void noteView(const SDMS::NoteViewRequest &a_request,
                SDMS::NoteDataReply &a_reply, LogContext log_context);
  void noteListBySubject(const SDMS::NoteListBySubjectRequest &a_request,
                         SDMS::NoteDataReply &a_reply, LogContext log_context);
  void notePurge(uint32_t a_age_sec, LogContext log_context);

  void taskLoadReady(libjson::Value &a_result, LogContext log_context);
  void taskRun(const std::string &a_task_id, libjson::Value &a_task_reply,
               LogContext log_context, int *a_step = 0,
               std::string *a_err_msg = 0);
  void taskAbort(const std::string &a_task_id, const std::string &a_msg,
                 libjson::Value &a_task_reply, LogContext log_context);

  void taskInitDataGet(const SDMS::DataGetRequest &a_request,
                       SDMS::DataGetReply &a_reply, libjson::Value &a_result,
                       LogContext log_context);
  void taskInitDataPut(const SDMS::DataPutRequest &a_request,
                       SDMS::DataPutReply &a_reply, libjson::Value &a_result,
                       LogContext log_context);
  void taskInitRecordCollectionDelete(const std::vector<std::string> &a_ids,
                                      SDMS::TaskDataReply &a_reply,
                                      libjson::Value &a_result,
                                      LogContext log_context);
  void
  taskInitRecordAllocChange(const SDMS::RecordAllocChangeRequest &a_request,
                            SDMS::RecordAllocChangeReply &a_reply,
                            libjson::Value &a_result, LogContext log_context);
  void
  taskInitRecordOwnerChange(const SDMS::RecordOwnerChangeRequest &a_request,
                            SDMS::RecordOwnerChangeReply &a_reply,
                            libjson::Value &a_result, LogContext log_context);
  void taskInitRepoAllocationCreate(
      const SDMS::RepoAllocationCreateRequest &a_request,
      SDMS::TaskDataReply &a_reply, libjson::Value &a_result,
      LogContext log_context);
  void taskInitRepoAllocationDelete(
      const SDMS::RepoAllocationDeleteRequest &a_request,
      SDMS::TaskDataReply &a_reply, libjson::Value &a_result,
      LogContext log_context);
  void taskInitProjectDelete(const SDMS::ProjectDeleteRequest &a_request,
                             SDMS::TaskDataReply &a_reply,
                             libjson::Value &a_result, LogContext log_context);
  void taskStart(const std::string &a_task_id, libjson::Value &a_result,
                 LogContext log_context);
  void taskUpdate(const std::string &a_id, LogContext log_context,
                  TaskStatus *a_status = 0, const std::string *a_message = 0,
                  double *a_progress = 0, libjson::Value *a_state = 0);
  void taskFinalize(const std::string &a_task_id, bool a_succeeded,
                    const std::string &a_msg, libjson::Value &a_result,
                    LogContext log_context);
  void taskList(const SDMS::TaskListRequest &a_request,
                SDMS::TaskDataReply &a_reply, LogContext log_context);
  void taskView(const SDMS::TaskViewRequest &a_request,
                SDMS::TaskDataReply &a_reply, LogContext log_context);
  void taskPurge(uint32_t a_age_sec, LogContext log_context);

  void tagSearch(const SDMS::TagSearchRequest &a_request,
                 SDMS::TagDataReply &a_reply, LogContext log_context);
  void tagListByCount(const SDMS::TagListByCountRequest &a_request,
                      SDMS::TagDataReply &a_reply, LogContext log_context);

  void schemaSearch(const SDMS::SchemaSearchRequest &a_request,
                    SDMS::SchemaDataReply &a_reply, LogContext log_context);
  void schemaView(const SDMS::SchemaViewRequest &a_request,
                  SDMS::SchemaDataReply &a_reply, LogContext log_context);
  void schemaView(const std::string &a_id, libjson::Value &a_result,
                  LogContext log_context);
  void schemaCreate(const SDMS::SchemaCreateRequest &a_request,
                    LogContext log_context);
  void schemaRevise(const SDMS::SchemaReviseRequest &a_request,
                    LogContext log_context);
  void schemaUpdate(const SDMS::SchemaUpdateRequest &a_request,
                    LogContext log_context);
  void schemaDelete(const SDMS::SchemaDeleteRequest &a_request,
                    SDMS::AckReply &a_reply, LogContext log_context);

  void dailyMessage(const SDMS::DailyMessageRequest &a_request,
                    SDMS::DailyMessageReply &a_reply, LogContext log_context);

  void metricsUpdateMsgCounts(
      uint32_t a_timestamp, uint32_t a_total,
      const std::map<std::string, std::map<uint16_t, uint32_t>> &a_metrics,
      LogContext);
  void metricsPurge(uint32_t a_timestamp, LogContext);

protected:
  long dbGet(const char *a_url_path,
             const std::vector<std::pair<std::string, std::string>> &a_params,
             libjson::Value &a_result, LogContext, bool a_log = true);
  bool dbGetRaw(const std::string url, std::string &a_result, LogContext log_context);
  long dbPost(const char *a_url_path,
              const std::vector<std::pair<std::string, std::string>> &a_params,
              const std::string *a_body, libjson::Value &a_result, LogContext);

  void setAuthStatus(SDMS::AuthStatusReply &a_reply,
                     const libjson::Value &a_result);
  void setUserData(SDMS::UserDataReply &a_reply, const libjson::Value &a_result,
                   LogContext log_context);
  void setProjectData(SDMS::ProjectDataReply &a_reply,
                      const libjson::Value &a_result, LogContext log_context);
  void setRecordData(SDMS::RecordDataReply &a_reply,
                     const libjson::Value &a_result, LogContext log_context);
  void setCollData(SDMS::CollDataReply &a_reply, const libjson::Value &a_result,
                   LogContext log_context);
  void setCollPathData(SDMS::CollPathReply &a_reply,
                       const libjson::Value &a_result, LogContext log_context);
  void setQueryData(SDMS::QueryDataReply &a_reply,
                    const libjson::Value &a_result, LogContext log_context);
  void setListingDataReply(SDMS::ListingReply &a_reply,
                           const libjson::Value &a_result,
                           LogContext log_context);
  void setListingData(ListingData *a_item, const libjson::Value::Object &a_obj,
                      LogContext log_context);
  void setGroupData(SDMS::GroupDataReply &a_reply,
                    const libjson::Value &a_result, LogContext log_context);
  void setACLData(SDMS::ACLDataReply &a_reply, const libjson::Value &a_result,
                  LogContext log_context);
  void setAllocData(SDMS::RepoAllocationsReply &a_reply,
                    const libjson::Value &a_result, LogContext log_context);
  void setAllocData(AllocData *a_alloc, const libjson::Value::Object &a_obj,
                    LogContext log_context);
  void setRepoData(SDMS::RepoDataReply *a_reply, std::vector<RepoData> &a_repos,
                   const libjson::Value &a_result, LogContext log_context);
  void setAllocStatsData(AllocStatsData &a_stats,
                         const libjson::Value::Object &a_object,
                         LogContext log_context);
  void setNoteDataReply(SDMS::NoteDataReply &a_reply,
                        const libjson::Value &a_result, LogContext log_context);
  void setNoteData(NoteData *a_item, const libjson::Value::Object &a_obj,
                   LogContext log_context);
  void setTaskDataReply(SDMS::TaskDataReply &a_reply,
                        const libjson::Value &a_result, LogContext log_context);
  void setTaskDataReplyArray(SDMS::TaskDataReply &a_reply,
                             const libjson::Value &a_result,
                             LogContext log_context);
  void setTaskData(TaskData *a_task, const libjson::Value &a_task_json,
                   LogContext log_context);
  void setDataGetReply(SDMS::DataGetReply &a_reply,
                       const libjson::Value &a_result, LogContext log_context);
  void setDataPutReply(SDMS::DataPutReply &a_reply,
                       const libjson::Value &a_result, LogContext log_context);
  void setTagDataReply(SDMS::TagDataReply &a_reply,
                       const libjson::Value &a_result, LogContext log_context);
  void setTagData(TagData *a_tag, const libjson::Value::Object &a_obj,
                  LogContext log_context);
  void setTopicDataReply(SDMS::TopicDataReply &a_reply,
                         const libjson::Value &a_result,
                         LogContext log_context);
  void setSchemaDataReply(SDMS::SchemaDataReply &a_reply,
                          const libjson::Value &a_result,
                          LogContext log_context);
  void setSchemaData(SchemaData *a_schema, const libjson::Value::Object &a_obj);

  uint32_t parseSearchRequest(const SDMS::SearchRequest &a_request,
                              std::string &a_qry_begin, std::string &a_qry_end,
                              std::string &a_filter, std::string &a_params,
                              LogContext log_context);
  std::string parseSearchTextPhrase(const std::string &a_phrase,
                                    const std::string &a_iter);
  std::string parseSearchTerms(const std::string &a_key,
                               const std::vector<std::string> &a_terms,
                               const std::string &a_iter);
  std::string parseSearchMetadata(const std::string &a_query,
                                  LogContext log_context,
                                  const std::string &a_iter = "i");
  std::string parseSearchIdAlias(const std::string &a_query,
                                 const std::string &a_iter);

  const std::string buildSearchParamURL(
      const char *endpoint_path,
      const std::vector<std::pair<std::string, std::string>> &param_vec);

  std::string newJsonMetricParse(
      uint32_t a_timestamp, uint32_t a_total,
      const std::map<std::string, std::map<uint16_t, uint32_t>> &a_metrics);

  std::string oldJsonMetricParse(
      uint32_t a_timestamp, uint32_t a_total,
      const std::map<std::string, std::map<uint16_t, uint32_t>> &a_metrics);

  CURL *m_curl;
  char *m_client;
  std::string m_client_uid;
  std::string m_db_url;
};

} // namespace Core
} // namespace SDMS

#endif
