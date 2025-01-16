#ifndef DATABASEAPI_HPP
#define DATABASEAPI_HPP
#pragma once

// Local public includes
#include "common/DynaLog.hpp"
#include "common/SDMS.pb.h"
#include "common/SDMS_Anon.pb.h"
#include "common/SDMS_Auth.pb.h"
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
                                    Anon::AuthStatusReply &a_reply,
                                    LogContext log_context);
  void clientAuthenticateByToken(const std::string &a_token,
                                 Anon::AuthStatusReply &a_reply,
                                 LogContext log_context);
  void clientLinkIdentity(const std::string &a_identity,
                          LogContext log_context);
  bool uidByPubKey(const std::string &a_pub_key, std::string &a_uid);
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
                          uint32_t &a_expires_in, LogContext log_context);
  void getExpiringAccessTokens(uint32_t a_expires_in,
                               std::vector<UserTokenInfo> &a_expiring_tokens,
                               LogContext log_context);
  void purgeTransferRecords(size_t age);
  void checkPerms(const Auth::CheckPermsRequest &a_request,
                  Auth::CheckPermsReply &a_reply, LogContext log_context);
  void getPerms(const Auth::GetPermsRequest &a_request,
                Auth::GetPermsReply &a_reply, LogContext log_context);

  void userSetAccessToken(const Auth::UserSetAccessTokenRequest &a_request,
                          Anon::AckReply &a_reply, LogContext log_context);
  void userCreate(const Auth::UserCreateRequest &a_request,
                  Auth::UserDataReply &a_reply, LogContext log_context);
  void userView(const Auth::UserViewRequest &a_request,
                Auth::UserDataReply &a_reply, LogContext log_context);
  void userUpdate(const Auth::UserUpdateRequest &a_request,
                  Auth::UserDataReply &a_reply, LogContext log_context);
  void userListAll(const Auth::UserListAllRequest &a_request,
                   Auth::UserDataReply &a_reply, LogContext log_context);
  void userListCollab(const Auth::UserListCollabRequest &a_request,
                      Auth::UserDataReply &a_reply, LogContext log_context);
  void userFindByUUIDs(const Auth::UserFindByUUIDsRequest &a_request,
                       Auth::UserDataReply &a_reply, LogContext log_context);
  void userFindByNameUID(const Auth::UserFindByNameUIDRequest &a_request,
                         Auth::UserDataReply &a_reply, LogContext log_context);
  void userGetRecentEP(const Auth::UserGetRecentEPRequest &a_request,
                       Auth::UserGetRecentEPReply &a_reply,
                       LogContext log_context);
  void userSetRecentEP(const Auth::UserSetRecentEPRequest &a_request,
                       Anon::AckReply &a_reply, LogContext log_context);

  void projCreate(const Auth::ProjectCreateRequest &a_request,
                  Auth::ProjectDataReply &a_reply, LogContext log_context);
  void projUpdate(const Auth::ProjectUpdateRequest &a_request,
                  Auth::ProjectDataReply &a_reply, LogContext log_context);
  void projView(const Auth::ProjectViewRequest &a_request,
                Auth::ProjectDataReply &a_reply, LogContext log_context);
  void projList(const Auth::ProjectListRequest &a_request,
                Auth::ListingReply &a_reply, LogContext log_context);
  void projSearch(const std::string &a_query, Auth::ProjectDataReply &a_reply,
                  LogContext log_context);
  void projGetRole(const Auth::ProjectGetRoleRequest &a_request,
                   Auth::ProjectGetRoleReply &a_reply, LogContext log_context);

  void recordView(const Auth::RecordViewRequest &a_request,
                  Auth::RecordDataReply &a_reply, LogContext log_context);
  void recordCreate(const Auth::RecordCreateRequest &a_request,
                    Auth::RecordDataReply &a_reply, LogContext log_context);
  void recordCreateBatch(const Auth::RecordCreateBatchRequest &a_request,
                         Auth::RecordDataReply &a_reply,
                         LogContext log_context);
  void recordUpdate(const Auth::RecordUpdateRequest &a_request,
                    Auth::RecordDataReply &a_reply, libjson::Value &result,
                    LogContext log_context);
  void recordUpdateBatch(const Auth::RecordUpdateBatchRequest &a_request,
                         Auth::RecordDataReply &a_reply, libjson::Value &result,
                         LogContext log_context);
  void recordUpdateSize(const Auth::RepoDataSizeReply &a_sizes,
                        LogContext log_context);
  void recordUpdateSchemaError(const std::string &a_rec_id,
                               const std::string &a_err_msg,
                               LogContext log_context);
  void recordExport(const Auth::RecordExportRequest &a_request,
                    Auth::RecordExportReply &a_reply, LogContext log_context);
  void recordLock(const Auth::RecordLockRequest &a_request,
                  Auth::ListingReply &a_reply, LogContext log_context);
  void recordListByAlloc(const Auth::RecordListByAllocRequest &a_request,
                         Auth::ListingReply &a_reply, LogContext log_context);
  void recordGetDependencyGraph(
      const Auth::RecordGetDependencyGraphRequest &a_request,
      Auth::ListingReply &a_reply, LogContext log_context);

  void generalSearch(const Auth::SearchRequest &a_request,
                     Auth::ListingReply &a_reply, LogContext log_context);

  void dataPath(const Auth::DataPathRequest &a_request,
                Auth::DataPathReply &a_reply, LogContext log_context);

  void collListPublished(const Auth::CollListPublishedRequest &a_request,
                         Auth::ListingReply &a_reply, LogContext log_context);
  void collCreate(const Auth::CollCreateRequest &a_request,
                  Auth::CollDataReply &a_reply, LogContext log_context);
  void collUpdate(const Auth::CollUpdateRequest &a_request,
                  Auth::CollDataReply &a_reply, LogContext log_context);
  void collView(const Auth::CollViewRequest &a_request,
                Auth::CollDataReply &a_reply, LogContext log_context);
  void collRead(const Auth::CollReadRequest &a_request,
                Auth::ListingReply &a_reply, LogContext log_context);
  void collWrite(const Auth::CollWriteRequest &a_request,
                 Auth::ListingReply &a_reply, LogContext log_context);
  void collMove(const Auth::CollMoveRequest &a_request, Anon::AckReply &a_reply,
                LogContext log_context);
  void collGetParents(const Auth::CollGetParentsRequest &a_request,
                      Auth::CollPathReply &a_reply, LogContext log_context);
  void collGetOffset(const Auth::CollGetOffsetRequest &a_request,
                     Auth::CollGetOffsetReply &a_reply, LogContext log_context);

  void queryList(const Auth::QueryListRequest &a_request,
                 Auth::ListingReply &a_reply, LogContext log_context);
  void queryCreate(const Auth::QueryCreateRequest &a_request,
                   Auth::QueryDataReply &a_reply, LogContext log_context);
  void queryUpdate(const Auth::QueryUpdateRequest &a_request,
                   Auth::QueryDataReply &a_reply, LogContext log_context);
  void queryDelete(const Auth::QueryDeleteRequest &a_request,
                   Anon::AckReply &a_reply, LogContext log_context);
  void queryView(const Auth::QueryViewRequest &a_request,
                 Auth::QueryDataReply &a_reply, LogContext log_context);
  void queryExec(const Auth::QueryExecRequest &a_request,
                 Auth::ListingReply &a_reply, LogContext log_context);

  void aclView(const Auth::ACLViewRequest &a_request,
               Auth::ACLDataReply &a_reply, LogContext log_context);
  void aclUpdate(const Auth::ACLUpdateRequest &a_request,
                 Auth::ACLDataReply &a_reply, LogContext log_context);
  void aclSharedList(const Auth::ACLSharedListRequest &a_request,
                     Auth::ListingReply &a_reply, LogContext log_context);
  void aclSharedListItems(const Auth::ACLSharedListItemsRequest &a_request,
                          Auth::ListingReply &a_reply, LogContext log_context);

  void groupCreate(const Auth::GroupCreateRequest &a_request,
                   Auth::GroupDataReply &a_reply, LogContext log_context);
  void groupUpdate(const Auth::GroupUpdateRequest &a_request,
                   Auth::GroupDataReply &a_reply, LogContext log_context);
  void groupDelete(const Auth::GroupDeleteRequest &a_request,
                   Anon::AckReply &a_reply, LogContext log_context);
  void groupList(const Auth::GroupListRequest &a_request,
                 Auth::GroupDataReply &a_reply, LogContext log_context);
  void groupView(const Auth::GroupViewRequest &a_request,
                 Auth::GroupDataReply &a_reply, LogContext log_context);

  void repoList(std::vector<RepoData> &a_repos, LogContext log_context);
  void repoList(const Auth::RepoListRequest &a_request,
                Auth::RepoDataReply &a_reply, LogContext log_context);
  void repoView(std::vector<RepoData> &a_repos, LogContext log_context);
  void repoView(const Auth::RepoViewRequest &a_request,
                Auth::RepoDataReply &a_reply, LogContext log_context);
  void repoCreate(const Auth::RepoCreateRequest &a_request,
                  Auth::RepoDataReply &a_reply, LogContext log_context);
  void repoUpdate(const Auth::RepoUpdateRequest &a_request,
                  Auth::RepoDataReply &a_reply, LogContext log_context);
  void repoDelete(const Auth::RepoDeleteRequest &a_request,
                  Anon::AckReply &a_reply, LogContext log_context);
  void repoCalcSize(const Auth::RepoCalcSizeRequest &a_request,
                    Auth::RepoCalcSizeReply &a_reply, LogContext log_context);
  void repoListAllocations(const Auth::RepoListAllocationsRequest &a_request,
                           Auth::RepoAllocationsReply &a_reply,
                           LogContext log_context);
  void repoListSubjectAllocations(
      const Auth::RepoListSubjectAllocationsRequest &a_request,
      Auth::RepoAllocationsReply &a_reply, LogContext log_context);
  void repoListObjectAllocations(
      const Auth::RepoListObjectAllocationsRequest &a_request,
      Auth::RepoAllocationsReply &a_reply, LogContext log_context);
  void repoViewAllocation(const Auth::RepoViewAllocationRequest &a_request,
                          Auth::RepoAllocationsReply &a_reply,
                          LogContext log_context);
  void repoAllocationStats(const Auth::RepoAllocationStatsRequest &a_request,
                           Auth::RepoAllocationStatsReply &a_reply,
                           LogContext log_context);
  void repoAllocationSet(const Auth::RepoAllocationSetRequest &a_request,
                         Anon::AckReply &a_reply, LogContext log_context);
  void repoAllocationSetDefault(
      const Auth::RepoAllocationSetDefaultRequest &a_request,
      Anon::AckReply &a_reply, LogContext log_context);
  void repoAuthz(const Auth::RepoAuthzRequest &a_request,
                 Anon::AckReply &a_reply, LogContext log_context);

  void topicListTopics(const Auth::TopicListTopicsRequest &a_request,
                       Auth::TopicDataReply &a_reply, LogContext log_context);
  void topicView(const Auth::TopicViewRequest &a_request,
                 Auth::TopicDataReply &a_reply, LogContext log_context);
  void topicSearch(const Auth::TopicSearchRequest &a_request,
                   Auth::TopicDataReply &a_reply, LogContext log_context);

  void noteCreate(const Auth::NoteCreateRequest &a_request,
                  Auth::NoteDataReply &a_reply, LogContext log_context);
  void noteUpdate(const Auth::NoteUpdateRequest &a_request,
                  Auth::NoteDataReply &a_reply, LogContext log_context);
  void noteCommentEdit(const Auth::NoteCommentEditRequest &a_request,
                       Auth::NoteDataReply &a_reply, LogContext log_context);
  void noteView(const Auth::NoteViewRequest &a_request,
                Auth::NoteDataReply &a_reply, LogContext log_context);
  void noteListBySubject(const Auth::NoteListBySubjectRequest &a_request,
                         Auth::NoteDataReply &a_reply, LogContext log_context);
  void notePurge(uint32_t a_age_sec, LogContext log_context);

  void taskLoadReady(libjson::Value &a_result, LogContext log_context);
  void taskRun(const std::string &a_task_id, libjson::Value &a_task_reply,
               LogContext log_context, int *a_step = 0,
               std::string *a_err_msg = 0);
  void taskAbort(const std::string &a_task_id, const std::string &a_msg,
                 libjson::Value &a_task_reply, LogContext log_context);

  void taskInitDataGet(const Auth::DataGetRequest &a_request,
                       Auth::DataGetReply &a_reply, libjson::Value &a_result,
                       LogContext log_context);
  void taskInitDataPut(const Auth::DataPutRequest &a_request,
                       Auth::DataPutReply &a_reply, libjson::Value &a_result,
                       LogContext log_context);
  void taskInitRecordCollectionDelete(const std::vector<std::string> &a_ids,
                                      Auth::TaskDataReply &a_reply,
                                      libjson::Value &a_result,
                                      LogContext log_context);
  void
  taskInitRecordAllocChange(const Auth::RecordAllocChangeRequest &a_request,
                            Auth::RecordAllocChangeReply &a_reply,
                            libjson::Value &a_result, LogContext log_context);
  void
  taskInitRecordOwnerChange(const Auth::RecordOwnerChangeRequest &a_request,
                            Auth::RecordOwnerChangeReply &a_reply,
                            libjson::Value &a_result, LogContext log_context);
  void taskInitRepoAllocationCreate(
      const Auth::RepoAllocationCreateRequest &a_request,
      Auth::TaskDataReply &a_reply, libjson::Value &a_result,
      LogContext log_context);
  void taskInitRepoAllocationDelete(
      const Auth::RepoAllocationDeleteRequest &a_request,
      Auth::TaskDataReply &a_reply, libjson::Value &a_result,
      LogContext log_context);
  void taskInitProjectDelete(const Auth::ProjectDeleteRequest &a_request,
                             Auth::TaskDataReply &a_reply,
                             libjson::Value &a_result, LogContext log_context);
  void taskStart(const std::string &a_task_id, libjson::Value &a_result,
                 LogContext log_context);
  void taskUpdate(const std::string &a_id, LogContext log_context,
                  TaskStatus *a_status = 0, const std::string *a_message = 0,
                  double *a_progress = 0, libjson::Value *a_state = 0);
  void taskFinalize(const std::string &a_task_id, bool a_succeeded,
                    const std::string &a_msg, libjson::Value &a_result,
                    LogContext log_context);
  void taskList(const Auth::TaskListRequest &a_request,
                Auth::TaskDataReply &a_reply, LogContext log_context);
  void taskView(const Auth::TaskViewRequest &a_request,
                Auth::TaskDataReply &a_reply, LogContext log_context);
  void taskPurge(uint32_t a_age_sec, LogContext log_context);

  void tagSearch(const Auth::TagSearchRequest &a_request,
                 Auth::TagDataReply &a_reply, LogContext log_context);
  void tagListByCount(const Auth::TagListByCountRequest &a_request,
                      Auth::TagDataReply &a_reply, LogContext log_context);

  void schemaSearch(const Auth::SchemaSearchRequest &a_request,
                    Auth::SchemaDataReply &a_reply, LogContext log_context);
  void schemaView(const Auth::SchemaViewRequest &a_request,
                  Auth::SchemaDataReply &a_reply, LogContext log_context);
  void schemaView(const std::string &a_id, libjson::Value &a_result,
                  LogContext log_context);
  void schemaCreate(const Auth::SchemaCreateRequest &a_request,
                    LogContext log_context);
  void schemaRevise(const Auth::SchemaReviseRequest &a_request,
                    LogContext log_context);
  void schemaUpdate(const Auth::SchemaUpdateRequest &a_request,
                    LogContext log_context);
  void schemaDelete(const Auth::SchemaDeleteRequest &a_request,
                    Anon::AckReply &a_reply, LogContext log_context);

  void dailyMessage(const Anon::DailyMessageRequest &a_request,
                    Anon::DailyMessageReply &a_reply, LogContext log_context);

  void metricsUpdateMsgCounts(
      uint32_t a_timestamp, uint32_t a_total,
      const std::map<std::string, std::map<uint16_t, uint32_t>> &a_metrics,
      LogContext);
  void metricsPurge(uint32_t a_timestamp, LogContext);

private:
  long dbGet(const char *a_url_path,
             const std::vector<std::pair<std::string, std::string>> &a_params,
             libjson::Value &a_result, LogContext, bool a_log = true);
  bool dbGetRaw(const std::string url, std::string &a_result);
  long dbPost(const char *a_url_path,
              const std::vector<std::pair<std::string, std::string>> &a_params,
              const std::string *a_body, libjson::Value &a_result, LogContext);

  void setAuthStatus(Anon::AuthStatusReply &a_reply,
                     const libjson::Value &a_result);
  void setUserData(Auth::UserDataReply &a_reply, const libjson::Value &a_result,
                   LogContext log_context);
  void setProjectData(Auth::ProjectDataReply &a_reply,
                      const libjson::Value &a_result, LogContext log_context);
  void setRecordData(Auth::RecordDataReply &a_reply,
                     const libjson::Value &a_result, LogContext log_context);
  void setCollData(Auth::CollDataReply &a_reply, const libjson::Value &a_result,
                   LogContext log_context);
  void setCollPathData(Auth::CollPathReply &a_reply,
                       const libjson::Value &a_result, LogContext log_context);
  void setQueryData(Auth::QueryDataReply &a_reply,
                    const libjson::Value &a_result, LogContext log_context);
  void setListingDataReply(Auth::ListingReply &a_reply,
                           const libjson::Value &a_result,
                           LogContext log_context);
  void setListingData(ListingData *a_item, const libjson::Value::Object &a_obj,
                      LogContext log_context);
  void setGroupData(Auth::GroupDataReply &a_reply,
                    const libjson::Value &a_result, LogContext log_context);
  void setACLData(Auth::ACLDataReply &a_reply, const libjson::Value &a_result,
                  LogContext log_context);
  void setAllocData(Auth::RepoAllocationsReply &a_reply,
                    const libjson::Value &a_result, LogContext log_context);
  void setAllocData(AllocData *a_alloc, const libjson::Value::Object &a_obj,
                    LogContext log_context);
  void setRepoData(Auth::RepoDataReply *a_reply, std::vector<RepoData> &a_repos,
                   const libjson::Value &a_result, LogContext log_context);
  void setAllocStatsData(AllocStatsData &a_stats,
                         const libjson::Value::Object &a_object,
                         LogContext log_context);
  void setNoteDataReply(Auth::NoteDataReply &a_reply,
                        const libjson::Value &a_result, LogContext log_context);
  void setNoteData(NoteData *a_item, const libjson::Value::Object &a_obj,
                   LogContext log_context);
  void setTaskDataReply(Auth::TaskDataReply &a_reply,
                        const libjson::Value &a_result, LogContext log_context);
  void setTaskDataReplyArray(Auth::TaskDataReply &a_reply,
                             const libjson::Value &a_result,
                             LogContext log_context);
  void setTaskData(TaskData *a_task, const libjson::Value &a_task_json,
                   LogContext log_context);
  void setDataGetReply(Auth::DataGetReply &a_reply,
                       const libjson::Value &a_result, LogContext log_context);
  void setDataPutReply(Auth::DataPutReply &a_reply,
                       const libjson::Value &a_result, LogContext log_context);
  void setTagDataReply(Auth::TagDataReply &a_reply,
                       const libjson::Value &a_result, LogContext log_context);
  void setTagData(TagData *a_tag, const libjson::Value::Object &a_obj,
                  LogContext log_context);
  void setTopicDataReply(Auth::TopicDataReply &a_reply,
                         const libjson::Value &a_result,
                         LogContext log_context);
  void setSchemaDataReply(Auth::SchemaDataReply &a_reply,
                          const libjson::Value &a_result,
                          LogContext log_context);
  void setSchemaData(SchemaData *a_schema, const libjson::Value::Object &a_obj);

  uint32_t parseSearchRequest(const Auth::SearchRequest &a_request,
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

  CURL *m_curl;
  char *m_client;
  std::string m_client_uid;
  std::string m_db_url;
};

} // namespace Core
} // namespace SDMS

#endif
