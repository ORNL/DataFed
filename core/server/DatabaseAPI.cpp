
// Local private includes
#include "DatabaseAPI.hpp"

// Local public includes
#include "common/DynaLog.hpp"
#include "common/SDMS.pb.h"
#include "common/TraceException.hpp"
#include "common/Util.hpp"
#include "common/CipherEngine.hpp"

// Third party includes
#include <boost/algorithm/string.hpp>
#include <boost/tokenizer.hpp>
#include <google/protobuf/util/json_util.h>
#include <nlohmann/json.hpp>
#include <zmq.h>
#include <openssl/bio.h>
// Standard includes
#include <typeinfo>
#include <algorithm>
#include <cctype>
#include <memory>
#include <unistd.h>
#include <vector>

using namespace std;

namespace SDMS {
namespace Core {

using namespace SDMS::Auth;
using namespace libjson;

#define TRANSLATE_BEGIN() try {
#define TRANSLATE_END(json, log_context)                                       \
  }                                                                            \
  catch (TraceException & e) {                                                 \
    DL_ERROR(log_context, "INVALID JSON FROM DB: " << json.toString());        \
    EXCEPT_CONTEXT(e, "Invalid response from DB");                             \
    throw;                                                                     \
  }

DatabaseAPI::DatabaseAPI(const std::string &a_db_url,
                         const std::string &a_db_user,
                         const std::string &a_db_pass,
                         const std::string &cipher_key_file_path)
    : cipher_key_file_path(cipher_key_file_path), m_client(0), m_db_url(a_db_url) {
  m_curl = curl_easy_init();
  if (!m_curl)
    EXCEPT(ID_INTERNAL_ERROR, "libcurl init failed");

  setClient("");

  curl_easy_setopt(m_curl, CURLOPT_HTTP_VERSION, CURL_HTTP_VERSION_1_1);
  curl_easy_setopt(m_curl, CURLOPT_USERNAME, a_db_user.c_str());
  curl_easy_setopt(m_curl, CURLOPT_PASSWORD, a_db_pass.c_str());
  curl_easy_setopt(m_curl, CURLOPT_WRITEFUNCTION, curlResponseWriteCB);
  curl_easy_setopt(m_curl, CURLOPT_SSL_VERIFYPEER, 0);
  curl_easy_setopt(m_curl, CURLOPT_TCP_NODELAY, 1);
}

DatabaseAPI::~DatabaseAPI() {
  if (m_client)
    curl_free(m_client);

  curl_easy_cleanup(m_curl);
}

void DatabaseAPI::setClient(const std::string &a_client) {
  if (a_client.size())
    m_client_uid =
        (a_client.compare(0, 2, "u/") == 0 ? a_client
                                           : (string("u/") + a_client));
  else
    m_client_uid = "";

  if (m_client)
    curl_free(m_client);

  m_client = curl_easy_escape(m_curl, a_client.c_str(), 0);
}

const std::string DatabaseAPI::buildSearchParamURL(
    const char *endpoint_path,
    const std::vector<std::pair<std::string, std::string>> &param_vec) {
  string url;

  url.reserve(512);

  // TODO Get URL base from ctor
  url.append(m_db_url);
  url.append(endpoint_path);
  url.append("?client=");
  url.append(m_client);

  char *esc_txt;

  for (vector<pair<string, string>>::const_iterator iparam = param_vec.begin();
       iparam != param_vec.end(); ++iparam) {
    url.append("&");
    url.append(iparam->first.c_str());
    url.append("=");
    esc_txt = curl_easy_escape(m_curl, iparam->second.c_str(), 0);
    url.append(esc_txt);
    curl_free(esc_txt);
  }

  return url;
}

long DatabaseAPI::dbGet(const char *a_url_path,
                        const vector<pair<string, string>> &a_params,
                        libjson::Value &a_result, LogContext log_context,
                        bool a_log) {
  (void)a_log;

  a_result.clear();

  string res_json;
  char error[CURL_ERROR_SIZE];

  error[0] = 0;

  // TODO: construct URL outside of function
  const string url = buildSearchParamURL(a_url_path, a_params);

  DL_DEBUG(log_context, "get url: " << url);
  curl_easy_setopt(m_curl, CURLOPT_URL, url.c_str());
  curl_easy_setopt(m_curl, CURLOPT_WRITEDATA, &res_json);
  curl_easy_setopt(m_curl, CURLOPT_ERRORBUFFER, error);
  curl_easy_setopt(m_curl, CURLOPT_HTTPGET, 1);

  CURLcode res = curl_easy_perform(m_curl);

  long http_code = 0;
  curl_easy_getinfo(m_curl, CURLINFO_RESPONSE_CODE, &http_code);

  if (res == CURLE_OK) {
    if (res_json.size()) {
      try {
        a_result.fromString(res_json);
      } catch (libjson::ParseError &e) {
        DL_DEBUG(log_context, "PARSE [" << res_json << "]");
        EXCEPT_PARAM(ID_SERVICE_ERROR,
                     "Invalid JSON returned from DB: " << e.toString());
      }
    }

    if (http_code >= 200 && http_code < 300) {
      return http_code;
    } else {
      if (res_json.size() && a_result.asObject().has("errorMessage")) {
        EXCEPT_PARAM(ID_BAD_REQUEST, a_result.asObject().asString());
      } else {
        EXCEPT_PARAM(ID_BAD_REQUEST, "SDMS DB service call failed. Code: "
                                         << http_code << ", err: " << error);
      }
    }
  } else {
    EXCEPT_PARAM(ID_SERVICE_ERROR, "SDMS DB interface failed. error: "
                                       << error << ", "
                                       << curl_easy_strerror(res));
  }
}

bool DatabaseAPI::dbGetRaw(const std::string url, string &a_result) {
  a_result.clear();

  char error[CURL_ERROR_SIZE];

  a_result.clear();
  error[0] = 0;

  curl_easy_setopt(m_curl, CURLOPT_URL, url.c_str());
  curl_easy_setopt(m_curl, CURLOPT_WRITEDATA, &a_result);
  curl_easy_setopt(m_curl, CURLOPT_ERRORBUFFER, error);
  curl_easy_setopt(m_curl, CURLOPT_HTTPGET, 1);

  CURLcode res = curl_easy_perform(m_curl);

  long http_code = 0;
  curl_easy_getinfo(m_curl, CURLINFO_RESPONSE_CODE, &http_code);
  if (res == CURLE_OK && (http_code >= 200 && http_code < 300))
    return true;
  else
    return false;
}

long DatabaseAPI::dbPost(const char *a_url_path,
                         const vector<pair<string, string>> &a_params,
                         const string *a_body, Value &a_result,
                         LogContext log_context) {
  static const char *empty_body = "";

  a_result.clear();

  string res_json;
  char error[CURL_ERROR_SIZE];

  error[0] = 0;

  // TODO: construct URL outside of function
  const string url = buildSearchParamURL(a_url_path, a_params);

  curl_easy_setopt(m_curl, CURLOPT_URL, url.c_str());
  curl_easy_setopt(m_curl, CURLOPT_WRITEDATA, &res_json);
  curl_easy_setopt(m_curl, CURLOPT_ERRORBUFFER, error);
  curl_easy_setopt(m_curl, CURLOPT_POST, 1);

  // libcurl seems to no longer work with POSTs without a body, so must set body
  // to an empty string
  curl_easy_setopt(m_curl, CURLOPT_POSTFIELDS,
                   a_body ? a_body->c_str() : empty_body);

  CURLcode res = curl_easy_perform(m_curl);

  long http_code = 0;
  curl_easy_getinfo(m_curl, CURLINFO_RESPONSE_CODE, &http_code);

  if (res == CURLE_OK) {
    if (res_json.size()) {
      try {
        a_result.fromString(res_json);
      } catch (libjson::ParseError &e) {
        DL_DEBUG(log_context, "PARSE [" << res_json << "]");
        EXCEPT_PARAM(ID_SERVICE_ERROR,
                     "Invalid JSON returned from DB: " << e.toString());
      }
    }

    if (http_code >= 200 && http_code < 300) {
      return http_code;
    } else {
      if (res_json.size() && a_result.asObject().has("errorMessage")) {
        DL_DEBUG(log_context, "dbPost FAILED " << url << " ["
                                               << (a_body ? *a_body : "")
                                               << "]");

        EXCEPT_PARAM(ID_BAD_REQUEST, a_result.asObject().asString());
      } else {
        EXCEPT_PARAM(ID_BAD_REQUEST, "SDMS DB service call failed. Code: "
                                         << http_code << ", err: " << error);
      }
    }
  } else {
    EXCEPT_PARAM(ID_SERVICE_ERROR, "SDMS DB interface failed. error: "
                                       << error << ", "
                                       << curl_easy_strerror(res));
  }
}

void DatabaseAPI::serverPing(LogContext log_context) {
  Value result;

  dbGet("admin/ping", {}, result, log_context);
}

void DatabaseAPI::clientAuthenticateByPassword(const std::string &a_password,
                                               Anon::AuthStatusReply &a_reply,
                                               LogContext log_context) {
  Value result;

  dbGet("usr/authn/password", {{"pw", a_password}}, result, log_context);
  setAuthStatus(a_reply, result);
}

void DatabaseAPI::clientAuthenticateByToken(const std::string &a_token,
                                            Anon::AuthStatusReply &a_reply,
                                            LogContext log_context) {
  Value result;

  dbGet("usr/authn/token", {{"token", a_token}}, result, log_context);
  setAuthStatus(a_reply, result);
}

void DatabaseAPI::setAuthStatus(Anon::AuthStatusReply &a_reply,
                                const Value &a_result) {
  const Value::Object &obj = a_result.asObject();
  a_reply.set_uid(obj.getString("uid"));
  a_reply.set_auth(obj.getBool("authorized"));
}

void DatabaseAPI::clientLinkIdentity(const std::string &a_identity,
                                     LogContext log_context) {
  Value result;

  dbGet("usr/ident/add", {{"ident", a_identity}}, result, log_context);
}

bool DatabaseAPI::uidByPubKey(const std::string &a_pub_key,
                              std::string &a_uid) {
  const string url =
      buildSearchParamURL("usr/find/by_pub_key", {{"pub_key", a_pub_key}});
  return dbGetRaw(url, a_uid);
}

bool DatabaseAPI::userGetKeys(std::string &a_pub_key, std::string &a_priv_key,
                              LogContext log_context) {
  Value result;

  dbGet("usr/keys/get", {}, result, log_context);

  const Value::Object &obj = result.asArray()[0].asObject();

  if (!obj.has("pub_key"))
    return false;

  a_pub_key = obj.asString();

  if (!obj.has("priv_key"))
    return false;

  a_priv_key = obj.asString();

  return true;
}

void DatabaseAPI::userSetKeys(const std::string &a_pub_key,
                              const std::string &a_priv_key,
                              LogContext log_context) {
  Value result;

  dbGet("usr/keys/set", {{"pub_key", a_pub_key}, {"priv_key", a_priv_key}},
        result, log_context);
}

void DatabaseAPI::userClearKeys(LogContext log_context) {
  Value result;

  dbGet("usr/keys/clear", {}, result, log_context);
}

void DatabaseAPI::userGetAccessToken(
    std::string &a_acc_tok, std::string &a_ref_tok, uint32_t &a_expires_in,
    const std::string collection_id, const std::string collection_type,
    bool &needs_consent, int &token_type, // TODO: use underlying type?
    std::string &scopes, bool &needs_encrypted, LogContext log_context) {

  DL_DEBUG(log_context, "User Get Access Token");

  Value result;
  std::vector<std::pair<std::string, std::string>> params = {};
  if (!collection_id.empty()) {
    params.push_back({"collection_id", collection_id});
  }
  if (!collection_type.empty()) {
    params.push_back({"collection_type", collection_type});
  }
  dbGet("usr/token/get", params, result, log_context);

  TRANSLATE_BEGIN()
  unsigned char token_key[CipherEngine::KEY_LENGTH];

  DL_DEBUG(log_context, "Attempting to grab token key");
  //grab the token_key
  readFile(cipher_key_file_path + "datafed-token-key.txt", CipherEngine::KEY_LENGTH, token_key);

  CipherEngine cipher(token_key);

  CipherEngine::CipherString encoded_refresh_obj;
  CipherEngine::CipherString encoded_access_obj;

  const Value::Object &obj = result.asObject();

  std::string access = obj.getString("access");
  std::string refresh = obj.getString("refresh");
  
  a_expires_in = (uint32_t)obj.getNumber("expires_in");
  needs_consent = obj.getBool("needs_consent");
  token_type = (int)obj.getNumber("token_type");
  // NOTE: scopes will be a blank string for token_type=GLOBUS_DEFAULT
  scopes = obj.getString("scopes");
 
  //ADD A NEEDS ENCRYPTED HERE (make into a function after getting working)
  if(!obj.has("access_len") or !obj.has("refresh_len") or !obj.has("access_iv") or !obj.has("refresh_iv"))
  {

    std::cout << "REFRESH TOK" << std::endl;
    needs_encrypted = true;
    return;
  }

  encoded_access_obj.encrypted_msg_len = obj.getNumber("access_len");
  encoded_refresh_obj.encrypted_msg_len = obj.getNumber("refresh_len");

  // Allocate and copy to char*
  encoded_access_obj.encrypted_msg = std::make_unique<char[]>(CipherEngine::ENCODED_MSG_LENGTH + 1); // add 1 for null terminator
  memcpy(encoded_access_obj.encrypted_msg.get(), access.c_str(), CipherEngine::ENCODED_MSG_LENGTH);
  encoded_access_obj.encrypted_msg[CipherEngine::ENCODED_MSG_LENGTH] = '\0'; // null terminate

  // Do the same for IV
  std::string access_iv = obj.getString("access_iv");
  encoded_access_obj.iv = std::make_unique<char[]>(CipherEngine::ENCODED_IV_LENGTH+1); // add 1 for null terminator
  memcpy(encoded_access_obj.iv.get(), access_iv.c_str(), CipherEngine::ENCODED_IV_LENGTH);
  encoded_access_obj.iv[CipherEngine::ENCODED_IV_LENGTH] = '\0'; //null terminate

  // Allocate and copy to char*
  encoded_refresh_obj.encrypted_msg = std::make_unique<char[]>(CipherEngine::ENCODED_MSG_LENGTH+1); // add 1 for null terminator
  memcpy(encoded_refresh_obj.encrypted_msg.get(), refresh.c_str(), CipherEngine::ENCODED_MSG_LENGTH);
  encoded_refresh_obj.encrypted_msg[CipherEngine::ENCODED_MSG_LENGTH] = '\0'; // null terminate

  // Do the same for IV
  std::string refresh_iv = obj.getString("refresh_iv");
  encoded_refresh_obj.iv = std::make_unique<char[]>(CipherEngine::ENCODED_IV_LENGTH + 1); //add 1 for null terminator
  memcpy(encoded_refresh_obj.iv.get(), refresh_iv.c_str(), CipherEngine::ENCODED_IV_LENGTH);
  encoded_refresh_obj.iv[CipherEngine::ENCODED_IV_LENGTH] = '\0'; // null terminate

  //Decryption for acc token and ref token
  a_acc_tok = cipher.decrypt(encoded_access_obj, log_context);
  a_ref_tok = cipher.decrypt(encoded_refresh_obj, log_context);

  TRANSLATE_END(result, log_context)
}

void DatabaseAPI::userSetAccessToken(const std::string &a_acc_tok,
                                     const uint32_t a_expires_in,
                                     const std::string &a_ref_tok,
                                     const SDMS::AccessTokenType &token_type,
                                     const std::string &other_token_data,
                                     LogContext log_context) {
  string result;

  unsigned char token_key[CipherEngine::KEY_LENGTH];

  std::cout << "SETTING ACCESS TOKEN" << std::endl;
  DL_DEBUG(log_context, "Setting Access Token");
  //grab the token_key
  readFile(cipher_key_file_path + "datafed-token-key.txt", CipherEngine::KEY_LENGTH, token_key);
  CipherEngine cipher(token_key);

  //encrypting the access token
  CipherEngine::CipherString access_obj = cipher.encrypt(a_acc_tok, log_context);

  CipherEngine::CipherString refresh_obj = cipher.encrypt(a_ref_tok, log_context);

  std::vector<pair<string, string>> params = {
      {"access", std::string(access_obj.encrypted_msg.get())}, //a_acc_tok shift to encrypted_access_string
      {"refresh", std::string(refresh_obj.encrypted_msg.get())}, //a_ref_tok shift to encrypted_refresh_string
      {"expires_in", to_string(a_expires_in)},
      {"access_iv", std::string(access_obj.iv.get())},
      {"access_len",to_string(access_obj.encrypted_msg_len)},
      {"refresh_iv", std::string(refresh_obj.iv.get())},
      {"refresh_len", to_string(refresh_obj.encrypted_msg_len)}
  };


  if (token_type != SDMS::AccessTokenType::ACCESS_SENTINEL) {
    params.push_back({"type", to_string(token_type)});
  }
  if (!other_token_data.empty()) {
    params.push_back({"other_token_data", other_token_data});
  }
  const string url = buildSearchParamURL("usr/token/set", params);
  dbGetRaw(url, result);
  DL_TRACE(log_context, "token expires in: " << to_string(a_expires_in));
}

void DatabaseAPI::userSetAccessToken(const std::string &a_access_token,
                                     const uint32_t a_expires_in,
                                     const std::string &a_refresh_token,
                                     LogContext log_context) {
  userSetAccessToken(a_access_token, a_expires_in, a_refresh_token,
                     SDMS::AccessTokenType::GLOBUS_DEFAULT, "", log_context);
}

void DatabaseAPI::userSetAccessToken(
    const Auth::UserSetAccessTokenRequest &a_request, Anon::AckReply &a_reply,
    LogContext log_context) {
  (void)a_reply;
  userSetAccessToken(a_request.access(), a_request.expires_in(),
                     a_request.refresh(), a_request.type(), a_request.other(),
                     log_context);
}

void DatabaseAPI::getExpiringAccessTokens(
    uint32_t a_expires_in, vector<UserTokenInfo> &a_expiring_tokens,
    LogContext log_context) {
  Value result;
  dbGet("usr/token/get/expiring", {{"expires_in", to_string(a_expires_in)}},
        result, log_context);

  UserTokenInfo info;
  a_expiring_tokens.clear();

  TRANSLATE_BEGIN()

  const Value::Array &arr = result.asArray();

  a_expiring_tokens.reserve(arr.size());

  for (Value::ArrayConstIter i = arr.begin(); i != arr.end(); i++) {
    const Value::Object &obj = i->asObject();

    info.uid = obj.getString("id");
    info.access_token = obj.getString("access");
    info.refresh_token = obj.getString("refresh");
    info.expiration = (uint32_t)obj.getNumber("expiration");

    a_expiring_tokens.push_back(info);
  }

  TRANSLATE_END(result, log_context)
}

void DatabaseAPI::purgeTransferRecords(size_t age) {
  string result;
  const string url =
      buildSearchParamURL("xfr/purge", {{"age", to_string(age)}});
  dbGetRaw(url, result);
}

void DatabaseAPI::userCreate(const Auth::UserCreateRequest &a_request,
                             Auth::UserDataReply &a_reply,
                             LogContext log_context) {
  DL_DEBUG(log_context,
           "DataFed user create - uid: " << a_request.uid()
                                         << ", name: " << a_request.name());

  vector<pair<string, string>> params;
  params.push_back({"secret", a_request.secret()});
  params.push_back({"uid", a_request.uid()});
  params.push_back({"name", a_request.name()});
  params.push_back({"email", a_request.email()});
  if (a_request.has_password())
    params.push_back({"password", a_request.password()});
  if (a_request.has_options())
    params.push_back({"options", a_request.options()});
  string uuids = "[";
  for (int i = 0; i < a_request.uuid_size(); i++) {
    if (i)
      uuids += ",";
    uuids += "\"" + a_request.uuid(i) + "\"";
  }
  uuids += "]";
  params.push_back({"uuids", uuids});

  Value result;

  // Catch and log any trace exception
  try {
    dbGet("usr/create", params, result, log_context);
  } catch (TraceException &e) {
    DL_ERROR(log_context, e.toString());
    throw;
  }

  setUserData(a_reply, result, log_context);
}

void DatabaseAPI::userView(const Auth::UserViewRequest &a_request,
                           Auth::UserDataReply &a_reply,
                           LogContext log_context) {
  vector<pair<string, string>> params;
  params.push_back({"subject", a_request.uid()});
  if (a_request.has_details() && a_request.details())
    params.push_back({"details", "true"});

  Value result;
  dbGet("usr/view", params, result, log_context);

  setUserData(a_reply, result, log_context);
}

void DatabaseAPI::userUpdate(const UserUpdateRequest &a_request,
                             Auth::UserDataReply &a_reply,
                             LogContext log_context) {
  Value result;

  vector<pair<string, string>> params;
  params.push_back({"subject", a_request.uid()});
  if (a_request.has_email())
    params.push_back({"email", a_request.email()});
  if (a_request.has_password())
    params.push_back({"password", a_request.password()});
  if (a_request.has_options())
    params.push_back({"options", a_request.options()});

  dbGet("usr/update", params, result, log_context);

  setUserData(a_reply, result, log_context);
}

void DatabaseAPI::userListAll(const UserListAllRequest &a_request,
                              Auth::UserDataReply &a_reply,
                              LogContext log_context) {
  vector<pair<string, string>> params;
  if (a_request.has_offset() && a_request.has_count()) {
    params.push_back({"offset", to_string(a_request.offset())});
    params.push_back({"count", to_string(a_request.count())});
  }

  Value result;
  dbGet("usr/list/all", params, result, log_context);

  setUserData(a_reply, result, log_context);
}

void DatabaseAPI::userListCollab(const UserListCollabRequest &a_request,
                                 Auth::UserDataReply &a_reply,
                                 LogContext log_context) {
  Value result;
  vector<pair<string, string>> params;
  if (a_request.has_offset() && a_request.has_count()) {
    params.push_back({"offset", to_string(a_request.offset())});
    params.push_back({"count", to_string(a_request.count())});
  }
  dbGet("usr/list/collab", params, result, log_context);

  setUserData(a_reply, result, log_context);
}

void DatabaseAPI::userFindByUUIDs(const Auth::UserFindByUUIDsRequest &a_request,
                                  Auth::UserDataReply &a_reply,
                                  LogContext log_context) {
  string uuids = "[";

  for (int i = 0; i < a_request.uuid_size(); i++) {
    if (i)
      uuids += ",";
    uuids += "\"" + a_request.uuid(i) + "\"";
  }

  uuids += "]";

  Value result;
  dbGet("usr/find/by_uuids", {{"uuids", uuids}}, result, log_context);

  setUserData(a_reply, result, log_context);
}

void DatabaseAPI::userFindByNameUID(
    const Auth::UserFindByNameUIDRequest &a_request,
    Auth::UserDataReply &a_reply, LogContext log_context) {
  Value result;
  vector<pair<string, string>> params;
  params.push_back({"name_uid", a_request.name_uid()});
  if (a_request.has_offset() && a_request.has_count()) {
    params.push_back({"offset", to_string(a_request.offset())});
    params.push_back({"count", to_string(a_request.count())});
  }

  dbGet("usr/find/by_name_uid", params, result, log_context);

  setUserData(a_reply, result, log_context);
}

void DatabaseAPI::userGetRecentEP(const Auth::UserGetRecentEPRequest &a_request,
                                  Auth::UserGetRecentEPReply &a_reply,
                                  LogContext log_context) {
  (void)a_request;
  Value result;

  dbGet("usr/ep/get", {}, result, log_context);

  TRANSLATE_BEGIN()

  const Value::Array &arr = result.asArray();

  for (Value::ArrayConstIter i = arr.begin(); i != arr.end(); i++) {
    a_reply.add_ep(i->asString());
  }

  TRANSLATE_END(result, log_context)
}

void DatabaseAPI::userSetRecentEP(const Auth::UserSetRecentEPRequest &a_request,
                                  Anon::AckReply &a_reply,
                                  LogContext log_context) {
  (void)a_reply;
  Value result;

  string eps = "[";
  for (int i = 0; i < a_request.ep_size(); i++) {
    if (i)
      eps += ",";
    eps += "\"" + a_request.ep(i) + "\"";
  }
  eps += "]";

  dbGet("usr/ep/set", {{"eps", eps}}, result, log_context);
}

void DatabaseAPI::setUserData(Auth::UserDataReply &a_reply,
                              const Value &a_result, LogContext log_context) {
  UserData *user;
  Value::ArrayConstIter k;

  TRANSLATE_BEGIN()

  const Value::Array &arr = a_result.asArray();

  for (Value::ArrayConstIter i = arr.begin(); i != arr.end(); i++) {
    const Value::Object &obj = i->asObject();

    if (obj.has("paging")) {
      const Value::Object &obj2 = obj.asObject();

      a_reply.set_offset(obj2.getNumber("off"));
      a_reply.set_count(obj2.getNumber("cnt"));
      a_reply.set_total(obj2.getNumber("tot"));
    } else {
      user = a_reply.add_user();
      user->set_uid(obj.getString("uid"));
      user->set_name_last(obj.getString("name_last"));
      user->set_name_first(obj.getString("name_first"));

      if (obj.has("email"))
        user->set_email(obj.asString());

      if (obj.has("options"))
        user->set_options(obj.asString());

      if (obj.has("is_admin"))
        user->set_is_admin(obj.asBool());

      if (obj.has("is_repo_admin"))
        user->set_is_repo_admin(obj.asBool());

      if (obj.has("idents")) {
        const Value::Array &arr2 = obj.asArray();

        for (k = arr2.begin(); k != arr2.end(); k++)
          user->add_ident(k->asString());
      }

      if (obj.has("allocs")) {
        const Value::Array &arr2 = obj.asArray();

        for (k = arr2.begin(); k != arr2.end(); k++)
          setAllocData(user->add_alloc(), k->asObject(), log_context);
      }
    }
  }

  TRANSLATE_END(a_result, log_context)
}

void DatabaseAPI::projCreate(const Auth::ProjectCreateRequest &a_request,
                             Auth::ProjectDataReply &a_reply,
                             LogContext log_context) {
  Value result;
  vector<pair<string, string>> params;

  params.push_back({"id", a_request.id()});
  params.push_back({"title", a_request.title()});

  if (a_request.has_desc())
    params.push_back({"desc", a_request.desc()});

  if (a_request.admin_size() > 0) {
    string members = "[";
    for (int i = 0; i < a_request.admin_size(); ++i) {
      if (i > 0)
        members += ",";
      members += "\"" + a_request.admin(i) + "\"";
    }
    members += "]";
    params.push_back({"admins", members});
  }

  if (a_request.member_size() > 0) {
    string members = "[";
    for (int i = 0; i < a_request.member_size(); ++i) {
      if (i > 0)
        members += ",";
      members += "\"" + a_request.member(i) + "\"";
    }
    members += "]";
    params.push_back({"members", members});
  }

  dbGet("prj/create", params, result, log_context);

  setProjectData(a_reply, result, log_context);
}

void DatabaseAPI::projUpdate(const Auth::ProjectUpdateRequest &a_request,
                             Auth::ProjectDataReply &a_reply,
                             LogContext log_context) {
  Value result;
  vector<pair<string, string>> params;

  params.push_back({"id", a_request.id()});

  if (a_request.has_title())
    params.push_back({"title", a_request.title()});

  if (a_request.has_desc())
    params.push_back({"desc", a_request.desc()});

  if (a_request.admin_set()) {
    string admins = "[";
    for (int i = 0; i < a_request.admin_size(); ++i) {
      if (i > 0)
        admins += ",";
      admins += "\"" + a_request.admin(i) + "\"";
    }
    admins += "]";
    params.push_back({"admins", admins});
  }

  if (a_request.member_set()) {
    string members = "[";
    for (int i = 0; i < a_request.member_size(); ++i) {
      if (i > 0)
        members += ",";
      members += "\"" + a_request.member(i) + "\"";
    }
    members += "]";
    params.push_back({"members", members});
  }

  dbGet("prj/update", params, result, log_context);

  setProjectData(a_reply, result, log_context);
}

void DatabaseAPI::projView(const Auth::ProjectViewRequest &a_request,
                           Auth::ProjectDataReply &a_reply,
                           LogContext log_context) {
  Value result;
  dbGet("prj/view", {{"id", a_request.id()}}, result, log_context);

  setProjectData(a_reply, result, log_context);
}

void DatabaseAPI::projList(const Auth::ProjectListRequest &a_request,
                           Auth::ListingReply &a_reply,
                           LogContext log_context) {
  Value result;
  vector<pair<string, string>> params;
  if (a_request.has_subject())
    params.push_back({"subject", a_request.subject()});
  if (a_request.has_as_owner() && a_request.as_owner())
    params.push_back({"as_owner", "true"});
  if (a_request.has_as_admin() && a_request.as_admin())
    params.push_back({"as_admin", "true"});
  if (a_request.has_as_member() && a_request.as_member())
    params.push_back({"as_member", "true"});
  if (a_request.has_sort())
    params.push_back({"sort", to_string(a_request.sort())});
  if (a_request.has_sort_rev() && a_request.sort_rev())
    params.push_back({"sort_rev", "true"});
  if (a_request.has_offset())
    params.push_back({"offset", to_string(a_request.offset())});
  if (a_request.has_count())
    params.push_back({"count", to_string(a_request.count())});

  dbGet("prj/list", params, result, log_context);

  setListingDataReply(a_reply, result, log_context);
}

void DatabaseAPI::projGetRole(const Auth::ProjectGetRoleRequest &a_request,
                              Auth::ProjectGetRoleReply &a_reply,
                              LogContext log_context) {
  Value result;
  vector<pair<string, string>> params;
  params.push_back({"id", a_request.id()});
  if (a_request.has_subject())
    params.push_back({"subject", a_request.subject()});

  dbGet("prj/get_role", params, result, log_context);

  const Value::Object &obj = result.asObject();
  a_reply.set_role((ProjectRole)(unsigned short)obj.getNumber("role"));
}

void DatabaseAPI::projSearch(const std::string &a_query,
                             Auth::ProjectDataReply &a_reply,
                             LogContext log_context) {
  Value result;

  dbGet("prj/search", {{"query", a_query}}, result, log_context);

  setProjectData(a_reply, result, log_context);
}

void DatabaseAPI::setProjectData(Auth::ProjectDataReply &a_reply,
                                 const Value &a_result,
                                 LogContext log_context) {
  ProjectData *proj;
  Value::ArrayConstIter k;

  TRANSLATE_BEGIN()

  const Value::Array &arr = a_result.asArray();

  for (Value::ArrayConstIter i = arr.begin(); i != arr.end(); i++) {
    const Value::Object &obj = i->asObject();

    proj = a_reply.add_proj();
    proj->set_id(obj.getString("id"));
    proj->set_title(obj.getString("title"));

    if (obj.has("desc"))
      proj->set_desc(obj.asString());

    if (obj.has("owner"))
      proj->set_owner(obj.asString());

    if (obj.has("ct"))
      proj->set_ct(obj.asNumber());

    if (obj.has("ut"))
      proj->set_ut(obj.asNumber());

    if (obj.has("admins")) {
      const Value::Array &arr2 = obj.asArray();

      for (k = arr2.begin(); k != arr2.end(); k++)
        proj->add_admin(k->asString());
    }

    if (obj.has("members")) {
      const Value::Array &arr2 = obj.asArray();

      for (k = arr2.begin(); k != arr2.end(); k++)
        proj->add_member(k->asString());
    }

    if (obj.has("allocs")) {
      const Value::Array &arr2 = obj.asArray();

      for (k = arr2.begin(); k != arr2.end(); k++)
        setAllocData(proj->add_alloc(), k->asObject(), log_context);
    }
  }

  TRANSLATE_END(a_result, log_context)
}

void DatabaseAPI::recordListByAlloc(
    const Auth::RecordListByAllocRequest &a_request,
    Auth::ListingReply &a_reply, LogContext log_context) {
  Value result;
  vector<pair<string, string>> params;
  params.push_back({"repo", a_request.repo()});
  params.push_back({"subject", a_request.subject()});
  if (a_request.has_offset())
    params.push_back({"offset", to_string(a_request.offset())});
  if (a_request.has_count())
    params.push_back({"count", to_string(a_request.count())});

  dbGet("/dat/list/by_alloc", params, result, log_context);

  setListingDataReply(a_reply, result, log_context);
}

void DatabaseAPI::recordView(const Auth::RecordViewRequest &a_request,
                             Auth::RecordDataReply &a_reply,
                             LogContext log_context) {
  Value result;

  dbGet("dat/view", {{"id", a_request.id()}}, result, log_context);

  setRecordData(a_reply, result, log_context);
}

void DatabaseAPI::recordCreate(const Auth::RecordCreateRequest &a_request,
                               Auth::RecordDataReply &a_reply,
                               LogContext log_context) {
  Value result;
  nlohmann::json payload;

  payload["title"] = a_request.title();

  if (a_request.has_desc()) {
    payload["desc"] = a_request.desc();
  }

  if (a_request.has_alias()) {
    payload["alias"] = a_request.alias();
  }

  if (a_request.tags_size()) {
    nlohmann::json tags = nlohmann::json::array();
    for (int i = 0; i < a_request.tags_size(); i++) {
      tags.push_back(a_request.tags(i));
    }
    payload["tags"] = tags;
  }

  if (a_request.has_metadata()) {
    payload["md"] = a_request.metadata();
  }
  if (a_request.has_sch_id()) {
    payload["sch_id"] = a_request.sch_id();
  }
  if (a_request.has_parent_id()) {
    payload["parent"] = a_request.parent_id();
  }
  if (a_request.has_external()) {
    payload["external"] = a_request.external();
  } else {
    if (a_request.has_ext()) {
      payload["ext"] = a_request.ext();
    }
    if (a_request.has_ext_auto()) {
      payload["ext_auto"] = a_request.ext_auto();
    }
  }
  if (a_request.has_source()) {
    payload["source"] = a_request.source();
  }
  if (a_request.has_repo_id()) {
    payload["repo"] = a_request.repo_id();
  }
  if (a_request.deps_size()) {
    nlohmann::json deps = nlohmann::json::array();

    for (int i = 0; i < a_request.deps_size(); i++) {
      nlohmann::json dep_entry;
      dep_entry["id"] = a_request.deps(i).id();
      dep_entry["type"] = to_string(a_request.deps(i).type());
      deps.push_back(dep_entry);
    }
    payload["deps"] = deps;
  }
  string body = payload.dump(-1, ' ', true);

  DL_DEBUG(log_context, "dat create: " << body);

  dbPost("dat/create", {}, &body, result, log_context);

  setRecordData(a_reply, result, log_context);
}

void DatabaseAPI::recordCreateBatch(
    const Auth::RecordCreateBatchRequest &a_request,
    Auth::RecordDataReply &a_reply, LogContext log_context) {
  Value result;

  dbPost("dat/create/batch", {}, &a_request.records(), result, log_context);

  setRecordData(a_reply, result, log_context);
}

void DatabaseAPI::recordUpdate(const Auth::RecordUpdateRequest &a_request,
                               Auth::RecordDataReply &a_reply,
                               libjson::Value &result, LogContext log_context) {
  nlohmann::json payload;
  payload["id"] = a_request.id();
  if (a_request.has_title()) {
    payload["title"] = a_request.title();
  }
  if (a_request.has_desc()) {
    payload["desc"] = a_request.desc();
  }
  if (a_request.has_alias()) {
    payload["alias"] = a_request.alias();
  }

  if (a_request.has_tags_clear() && a_request.tags_clear()) {
    payload["tags_clear"] = a_request.tags_clear();
  } else if (a_request.tags_size()) {
    nlohmann::json tags = nlohmann::json::array();
    for (int i = 0; i < a_request.tags_size(); i++) {
      tags.push_back(a_request.tags(i));
    }
    payload["tags"] = tags;
  }

  if (a_request.has_metadata()) {
    payload["md"] = a_request.metadata();
    if (a_request.has_mdset()) {
      payload["mdset"] = a_request.mdset();
    }
  }
  if (a_request.has_sch_id()) {
    payload["sch_id"] = a_request.sch_id();
  }
  if (a_request.has_source()) {
    payload["source"] = a_request.source();
  }
  if (a_request.has_ext()) {
    payload["ext"] = a_request.ext();
  }
  if (a_request.has_ext_auto()) {
    payload["ext_auto"] = a_request.ext_auto();
  }

  if (a_request.dep_add_size()) {
    nlohmann::json dep_add = nlohmann::json::array();
    for (int i = 0; i < a_request.dep_add_size(); i++) {
      nlohmann::json dep_add_entry;
      dep_add_entry["id"] = a_request.dep_add(i).id();
      dep_add_entry["type"] = to_string(a_request.dep_add(i).type());
      dep_add.push_back(dep_add_entry);
    }
    payload["dep_add"] = dep_add;
  }

  if (a_request.dep_rem_size()) {
    nlohmann::json dep_rem = nlohmann::json::array();
    for (int i = 0; i < a_request.dep_rem_size(); i++) {
      nlohmann::json dep_rem_entry;
      dep_rem_entry["id"] = a_request.dep_rem(i).id();
      dep_rem_entry["type"] = to_string(a_request.dep_rem(i).type());
      dep_rem.push_back(dep_rem_entry);
    }
    payload["dep_rem"] = dep_rem;
  }

  string body = payload.dump(-1, ' ', true);

  dbPost("dat/update", {}, &body, result, log_context);

  setRecordData(a_reply, result, log_context);
}

void DatabaseAPI::recordUpdateBatch(
    const Auth::RecordUpdateBatchRequest &a_request,
    Auth::RecordDataReply &a_reply, libjson::Value &result,
    LogContext log_context) {
  // "records" field is a JSON document - send directly to DB
  dbPost("dat/update/batch", {}, &a_request.records(), result, log_context);

  setRecordData(a_reply, result, log_context);
}

void DatabaseAPI::recordUpdateSize(const Auth::RepoDataSizeReply &a_size_rep,
                                   LogContext log_context) {
  libjson::Value result;

  nlohmann::json payload;

  nlohmann::json records = nlohmann::json::array();
  for (int i = 0; i < a_size_rep.size_size(); i++) { // size size :D
    nlohmann::json record_entry;
    record_entry["id"] = a_size_rep.size(i).id();
    record_entry["size"] =
        to_string(a_size_rep.size(i).size()); // size size size!! :D
    // TODO: the word size has lost all meaning
    records.push_back(record_entry);
  }
  payload["records"] = records;

  string body = payload.dump(-1, ' ', true);

  dbPost("dat/update/size", {}, &body, result, log_context);
}

void DatabaseAPI::recordUpdateSchemaError(const std::string &a_rec_id,
                                          const std::string &a_err_msg,
                                          LogContext log_context) {
  libjson::Value result;

  dbPost("dat/update/md_err_msg", {{"id", a_rec_id}}, &a_err_msg, result,
         log_context);
}

void DatabaseAPI::recordExport(const Auth::RecordExportRequest &a_request,
                               Auth::RecordExportReply &a_reply,
                               LogContext log_context) {
  Value result;

  nlohmann::json payload;
  nlohmann::json ids = nlohmann::json::array();
  for (int i = 0; i < a_request.id_size(); i++) {
    ids.push_back(a_request.id(i));
  }
  payload["id"] = ids;

  string body = payload.dump(-1, ' ', true);

  dbPost("dat/export", {}, &body, result, log_context);

  TRANSLATE_BEGIN()

  const Value::Array &arr = result.asArray();

  for (Value::ArrayConstIter i = arr.begin(); i != arr.end(); i++)
    a_reply.add_record(i->asString());

  TRANSLATE_END(result, log_context)
}

void DatabaseAPI::recordLock(const Auth::RecordLockRequest &a_request,
                             Auth::ListingReply &a_reply,
                             LogContext log_context) {
  Value result;
  string ids;

  if (a_request.id_size() > 0) {
    ids = "[";
    for (int i = 0; i < a_request.id_size(); i++) {
      if (i > 0)
        ids += ",";

      ids += "\"" + a_request.id(i) + "\"";
    }
    ids += "]";
  } else
    ids = "[]";

  dbGet("dat/lock",
        {{"ids", ids}, {"lock", a_request.lock() ? "true" : "false"}}, result,
        log_context);

  setListingDataReply(a_reply, result, log_context);
}

void DatabaseAPI::recordGetDependencyGraph(
    const Auth::RecordGetDependencyGraphRequest &a_request,
    Auth::ListingReply &a_reply, LogContext log_context) {
  Value result;

  dbGet("dat/dep/graph/get", {{"id", a_request.id()}}, result, log_context);

  setListingDataReply(a_reply, result, log_context);
}

void DatabaseAPI::setRecordData(Auth::RecordDataReply &a_reply,
                                const Value &a_result, LogContext log_context) {
  RecordData *rec;
  DependencyData *deps;
  Value::ObjectConstIter j, m;
  Value::ArrayConstIter i, k;

  TRANSLATE_BEGIN()

  const Value::Object &res_obj = a_result.asObject();

  if (res_obj.has("results")) {
    const Value::Array &arr = res_obj.asArray();

    for (i = arr.begin(); i != arr.end(); i++) {
      const Value::Object &obj = i->asObject();

      rec = a_reply.add_data();
      rec->set_id(obj.getString("id"));
      rec->set_title(obj.getString("title"));

      if (obj.has("alias") && !obj.value().isNull())
        rec->set_alias(obj.asString());

      if (obj.has("owner"))
        rec->set_owner(obj.asString());

      if (obj.has("creator"))
        rec->set_creator(obj.asString());

      if (obj.has("desc"))
        rec->set_desc(obj.asString());

      if (obj.has("tags")) {
        const Value::Array &arr2 = obj.asArray();

        for (k = arr2.begin(); k != arr2.end(); k++) {
          rec->add_tags(k->asString());
        }
      }

      if (obj.has("md"))
        rec->set_metadata(obj.value().toString());

      if (obj.has("md_err_msg"))
        rec->set_md_err_msg(obj.asString());

      if (obj.has("sch_id"))
        rec->set_sch_id(obj.asString());

      if (obj.has("external"))
        rec->set_external(obj.asBool());

      if (obj.has("repo_id"))
        rec->set_repo_id(obj.asString());

      if (obj.has("size"))
        rec->set_size(obj.asNumber());

      if (obj.has("source"))
        rec->set_source(obj.asString());

      if (obj.has("ext"))
        rec->set_ext(obj.asString());

      if (obj.has("ext_auto"))
        rec->set_ext_auto(obj.asBool());

      if (obj.has("ct"))
        rec->set_ct(obj.asNumber());

      if (obj.has("ut"))
        rec->set_ut(obj.asNumber());

      if (obj.has("dt"))
        rec->set_dt(obj.asNumber());

      if (obj.has("locked"))
        rec->set_locked(obj.asBool());

      if (obj.has("parent_id"))
        rec->set_parent_id(obj.asString());

      if (obj.has("notes"))
        rec->set_notes(obj.asNumber());

      if (obj.has("deps")) {
        const Value::Array &arr2 = obj.asArray();

        for (k = arr2.begin(); k != arr2.end(); k++) {
          const Value::Object &obj2 = k->asObject();

          deps = rec->add_deps();

          deps->set_id(obj2.getString("id"));
          deps->set_type(
              (DependencyType)(unsigned short)obj2.getNumber("type"));
          deps->set_dir((DependencyDir)(unsigned short)obj2.getNumber("dir"));

          if (obj2.has("alias") && !obj2.value().isNull())
            deps->set_alias(obj2.asString());
        }
      }
    }
  }

  if (res_obj.has("updates")) {
    const Value::Array &arr = res_obj.asArray();

    for (i = arr.begin(); i != arr.end(); i++)
      setListingData(a_reply.add_update(), i->asObject(), log_context);
  }

  TRANSLATE_END(a_result, log_context)
}

void DatabaseAPI::dataPath(const Auth::DataPathRequest &a_request,
                           Auth::DataPathReply &a_reply,
                           LogContext log_context) {
  Value result;

  dbGet("dat/path", {{"id", a_request.id()}, {"domain", a_request.domain()}},
        result, log_context);

  const Value::Object &obj = result.asObject();

  a_reply.set_path(obj.getString("path"));
}

/**
 * @brief Search for private or public data or collections
 *
 * This is the entry point for all data/collection searches across all search
 * scopes. It supports searching private data (personal, project, shared) and
 * public (catalog). The SearchRequest message contains search parameters that
 * apply conditionally based on scope and other search options. The search
 * message is parsed and a query is composed and then sent to the database.
 * While the query syntax is stable, the main query is prefixed differently
 * depending on scope. The DB relies on either tha "dataview" or "collview"
 * Arango search views for execution of the query.
 */
void DatabaseAPI::generalSearch(const Auth::SearchRequest &a_request,
                                Auth::ListingReply &a_reply,
                                LogContext log_context) {
  Value result;
  string qry_begin, qry_end, qry_filter, params;

  uint32_t cnt = parseSearchRequest(a_request, qry_begin, qry_end, qry_filter,
                                    params, log_context);

  nlohmann::json payload;
  payload["mode"] = to_string(a_request.mode());
  payload["published"] = a_request.has_published() && a_request.published();
  payload["qry_begin"] = qry_begin;
  payload["qry_end"] = qry_end;
  payload["qry_filter"] = qry_filter;
  payload["params"] = "{" + params + "}";
  payload["limit"] = to_string(cnt);

  string body = payload.dump(-1, ' ', true);

  DL_DEBUG(log_context, "Query: [" << body << "]");

  dbPost("qry/exec/direct", {}, &body, result, log_context);

  setListingDataReply(a_reply, result, log_context);
}

void DatabaseAPI::collListPublished(
    const Auth::CollListPublishedRequest &a_request,
    Auth::ListingReply &a_reply, LogContext log_context) {
  Value result;
  vector<pair<string, string>> params;

  if (a_request.has_subject())
    params.push_back({"subject", a_request.subject()});
  if (a_request.has_offset())
    params.push_back({"offset", to_string(a_request.offset())});
  if (a_request.has_count())
    params.push_back({"count", to_string(a_request.count())});

  dbGet("col/published/list", params, result, log_context);

  setListingDataReply(a_reply, result, log_context);
}

void DatabaseAPI::collCreate(const Auth::CollCreateRequest &a_request,
                             Auth::CollDataReply &a_reply,
                             LogContext log_context) {
  Value result;
  nlohmann::json payload;

  payload["title"] = a_request.title();

  if (a_request.has_desc()) {
    payload["desc"] = a_request.desc();
  }

  if (a_request.has_alias()) {
    payload["alias"] = a_request.alias();
  }

  if (a_request.has_parent_id()) {
    payload["parent"] = a_request.parent_id();
  }

  if (a_request.has_topic()) {
    payload["topic"] = a_request.topic();
  }

  if (a_request.tags_size()) {
    nlohmann::json tags = nlohmann::json::array();
    for (int i = 0; i < a_request.tags_size(); i++) {
      tags.push_back(a_request.tags(i));
    }
    payload["tags"] = tags;
  }

  string body = payload.dump(-1, ' ', true);
  dbPost("col/create", {}, &body, result, log_context);

  setCollData(a_reply, result, log_context);
}

void DatabaseAPI::collUpdate(const Auth::CollUpdateRequest &a_request,
                             Auth::CollDataReply &a_reply,
                             LogContext log_context) {
  Value result;
  nlohmann::json payload;
  payload["id"] = a_request.id();
  if (a_request.has_title()) {
    payload["title"] = a_request.title();
  }

  if (a_request.has_desc()) {
    payload["desc"] = a_request.desc();
  }

  if (a_request.has_alias()) {
    payload["alias"] = a_request.alias();
  }

  if (a_request.has_topic()) {
    payload["topic"] = a_request.topic();
  }

  if (a_request.has_tags_clear() && a_request.tags_clear()) {
    payload["tags_clear"] = a_request.tags_clear();
  } else if (a_request.tags_size()) {
    nlohmann::json tags = nlohmann::json::array();
    for (int i = 0; i < a_request.tags_size(); i++) {
      tags.push_back(a_request.tags(i));
    }
    payload["tags"] = tags;
  }

  string body = payload.dump(-1, ' ', true);
  dbPost("col/update", {}, &body, result, log_context);

  setCollData(a_reply, result, log_context);
}

void DatabaseAPI::collView(const Auth::CollViewRequest &a_request,
                           Auth::CollDataReply &a_reply,
                           LogContext log_context) {
  Value result;

  dbGet("col/view", {{"id", a_request.id()}}, result, log_context);

  setCollData(a_reply, result, log_context);
}

void DatabaseAPI::collRead(const Auth::CollReadRequest &a_request,
                           Auth::ListingReply &a_reply,
                           LogContext log_context) {
  Value result;
  vector<pair<string, string>> params;
  params.push_back({"id", a_request.id()});
  if (a_request.has_offset())
    params.push_back({"offset", to_string(a_request.offset())});
  if (a_request.has_count())
    params.push_back({"count", to_string(a_request.count())});

  dbGet("col/read", params, result, log_context);

  setListingDataReply(a_reply, result, log_context);
}

void DatabaseAPI::collWrite(const Auth::CollWriteRequest &a_request,
                            Auth::ListingReply &a_reply,
                            LogContext log_context) {
  string add_list, rem_list;
  vector<pair<string, string>> params;

  params.push_back({"id", a_request.id()});

  if (a_request.add_size() > 0) {
    add_list = "[";
    for (int i = 0; i < a_request.add_size(); i++) {
      if (i > 0)
        add_list += ",";

      add_list += "\"" + a_request.add(i) + "\"";
    }
    add_list += "]";
    params.push_back({"add", add_list});
  }

  if (a_request.rem_size() > 0) {
    rem_list = "[";
    for (int i = 0; i < a_request.rem_size(); i++) {
      if (i > 0)
        rem_list += ",";

      rem_list += "\"" + a_request.rem(i) + "\"";
    }
    rem_list += "]";
    params.push_back({"remove", rem_list});
  }

  Value result;

  dbGet("col/write", params, result, log_context);

  setListingDataReply(a_reply, result, log_context);
}

void DatabaseAPI::collMove(const Auth::CollMoveRequest &a_request,
                           Anon::AckReply &a_reply, LogContext log_context) {
  (void)a_reply;

  if (a_request.item_size() == 0)
    return;

  string items = "[";

  for (int i = 0; i < a_request.item_size(); i++) {
    if (i > 0)
      items += ",";

    items += "\"" + a_request.item(i) + "\"";
  }
  items += "]";

  Value result;
  dbGet("col/move",
        {{"source", a_request.src_id()},
         {"dest", a_request.dst_id()},
         {"items", items}},
        result, log_context);
}

void DatabaseAPI::collGetParents(const Auth::CollGetParentsRequest &a_request,
                                 Auth::CollPathReply &a_reply,
                                 LogContext log_context) {
  Value result;
  vector<pair<string, string>> params;
  params.push_back({"id", a_request.id()});
  if (a_request.has_inclusive())
    params.push_back({"inclusive", a_request.inclusive() ? "true" : "false"});

  dbGet("col/get_parents", params, result, log_context);

  setCollPathData(a_reply, result, log_context);
}

void DatabaseAPI::collGetOffset(const Auth::CollGetOffsetRequest &a_request,
                                Auth::CollGetOffsetReply &a_reply,
                                LogContext log_context) {
  Value result;

  dbGet("col/get_offset",
        {{"id", a_request.id()},
         {"item", a_request.item()},
         {"page_sz", to_string(a_request.page_sz())}},
        result, log_context);

  a_reply.set_id(a_request.id());
  a_reply.set_item(a_request.item());
  a_reply.set_offset(result.asObject().getNumber("offset"));
}

void DatabaseAPI::setCollData(Auth::CollDataReply &a_reply,
                              const libjson::Value &a_result,
                              LogContext log_context) {
  CollData *coll;
  Value::ObjectConstIter j;

  TRANSLATE_BEGIN()

  const Value::Object &res_obj = a_result.asObject();
  Value::ArrayConstIter i, k;

  if (res_obj.has("results")) {
    const Value::Array &arr = res_obj.asArray();

    for (i = arr.begin(); i != arr.end(); i++) {
      const Value::Object &obj = i->asObject();

      coll = a_reply.add_coll();
      coll->set_id(obj.getString("id"));
      coll->set_title(obj.getString("title"));

      if (obj.has("desc"))
        coll->set_desc(obj.asString());

      if (obj.has("topic"))
        coll->set_topic(obj.asString());

      if (obj.has("alias") && !obj.value().isNull())
        coll->set_alias(obj.asString());

      if (obj.has("tags")) {
        const Value::Array &arr2 = obj.asArray();

        for (k = arr2.begin(); k != arr2.end(); k++) {
          coll->add_tags(k->asString());
        }
      }

      if (obj.has("ct"))
        coll->set_ct(obj.asNumber());

      if (obj.has("ut"))
        coll->set_ut(obj.asNumber());

      if (obj.has("parent_id"))
        coll->set_parent_id(obj.asString());

      if (obj.has("owner"))
        coll->set_owner(obj.asString());

      if (obj.has("creator"))
        coll->set_creator(obj.asString());

      if (obj.has("notes"))
        coll->set_notes(obj.asNumber());
    }
  }

  if (res_obj.has("updates")) {
    const Value::Array &arr = res_obj.asArray();

    for (i = arr.begin(); i != arr.end(); i++)
      setListingData(a_reply.add_update(), i->asObject(), log_context);
  }

  TRANSLATE_END(a_result, log_context)
}

void DatabaseAPI::setCollPathData(CollPathReply &a_reply,
                                  const libjson::Value &a_result,
                                  LogContext log_context) {
  PathData *path;
  ListingData *item;
  Value::ArrayConstIter j;
  Value::ObjectConstIter k;

  TRANSLATE_BEGIN()

  const Value::Array &arr = a_result.asArray();

  for (Value::ArrayConstIter i = arr.begin(); i != arr.end(); i++) {
    const Value::Array &arr2 = i->asArray();

    path = a_reply.add_path();

    for (j = arr2.begin(); j != arr2.end(); j++) {
      const Value::Object &obj = j->asObject();

      item = path->add_item();
      item->set_id(obj.getString("id"));
      item->set_title(obj.getString("title"));

      if (obj.has("alias") && !obj.value().isNull())
        item->set_alias(obj.asString());

      if (obj.has("owner"))
        item->set_owner(obj.asString());
    }
  }

  TRANSLATE_END(a_result, log_context)
}

void DatabaseAPI::setListingDataReply(Auth::ListingReply &a_reply,
                                      const libjson::Value &a_result,
                                      LogContext log_context) {
  Value::ObjectConstIter j;

  TRANSLATE_BEGIN()

  const Value::Array &arr = a_result.asArray();

  for (Value::ArrayConstIter i = arr.begin(); i != arr.end(); i++) {
    const Value::Object &obj = i->asObject();

    if (obj.has("paging")) {
      const Value::Object &obj2 = obj.asObject();

      a_reply.set_offset(obj2.getNumber("off"));
      a_reply.set_count(obj2.getNumber("cnt"));
      a_reply.set_total(obj2.getNumber("tot"));
    } else {
      setListingData(a_reply.add_item(), obj, log_context);
    }
  }

  TRANSLATE_END(a_result, log_context)
}

void DatabaseAPI::setListingData(ListingData *a_item,
                                 const Value::Object &a_obj,
                                 LogContext log_context) {
  if (a_obj.has("id")) {
    DL_TRACE(log_context, a_obj.asString());
    a_item->set_id(a_obj.asString());
  } else if (a_obj.has("_id")) {
    a_item->set_id(a_obj.asString());
    DL_TRACE(log_context, a_obj.asString());
  }

  DL_TRACE(log_context, a_obj.getString("title"));
  a_item->set_title(a_obj.getString("title"));

  if (a_obj.has("alias") && !a_obj.value().isNull())
    a_item->set_alias(a_obj.asString());

  if (a_obj.has("owner") && !a_obj.value().isNull())
    a_item->set_owner(a_obj.asString());

  if (a_obj.has("owner_name") && !a_obj.value().isNull())
    a_item->set_owner_name(a_obj.asString());

  if (a_obj.has("creator") && !a_obj.value().isNull())
    a_item->set_creator(a_obj.asString());

  if (a_obj.has("desc") && !a_obj.value().isNull())
    a_item->set_desc(a_obj.asString());

  if (a_obj.has("size") && !a_obj.value().isNull())
    a_item->set_size(a_obj.asNumber());

  if (a_obj.has("external") && !a_obj.value().isNull())
    a_item->set_external(a_obj.asBool());

  if (a_obj.has("notes"))
    a_item->set_notes(a_obj.asNumber());

  if (a_obj.has("locked") && !a_obj.value().isNull())
    a_item->set_locked(a_obj.asBool());

  if (a_obj.has("gen"))
    a_item->set_gen(a_obj.asNumber());

  if (a_obj.has("deps")) {
    const Value::Array &arr2 = a_obj.asArray();
    DependencyData *dep;

    a_item->set_deps_avail(true);

    for (Value::ArrayConstIter i = arr2.begin(); i != arr2.end(); i++) {
      const Value::Object &obj2 = i->asObject();

      dep = a_item->add_dep();
      dep->set_id(obj2.getString("id"));
      dep->set_type((DependencyType)(unsigned short)obj2.getNumber("type"));
      dep->set_dir((DependencyDir)(unsigned short)obj2.getNumber("dir"));

      if (obj2.has("alias") && !obj2.value().isNull())
        dep->set_alias(obj2.asString());

      if (obj2.has("notes"))
        dep->set_notes(obj2.asNumber());
    }
  }
}

void DatabaseAPI::queryList(const Auth::QueryListRequest &a_request,
                            Auth::ListingReply &a_reply,
                            LogContext log_context) {
  Value result;
  vector<pair<string, string>> params;
  if (a_request.has_offset())
    params.push_back({"offset", to_string(a_request.offset())});
  if (a_request.has_count())
    params.push_back({"count", to_string(a_request.count())});

  dbGet("qry/list", params, result, log_context);

  setListingDataReply(a_reply, result, log_context);
}

void DatabaseAPI::queryCreate(const Auth::QueryCreateRequest &a_request,
                              Auth::QueryDataReply &a_reply,
                              LogContext log_context) {
  Value result;
  // vector<pair<string,string>> params;

  string qry_begin, qry_end, qry_filter, params;

  uint32_t cnt = parseSearchRequest(a_request.query(), qry_begin, qry_end,
                                    qry_filter, params, log_context);

  google::protobuf::util::JsonPrintOptions options;
  string query_json;

  options.always_print_enums_as_ints = true;
  options.preserve_proto_field_names = true;

  auto stat = google::protobuf::util::MessageToJsonString(a_request.query(),
                                                          &query_json, options);
  if (!stat.ok()) {
    EXCEPT(1, "Invalid search request");
  }

  nlohmann::json payload;
  payload["qry_begin"] = qry_begin;
  payload["qry_end"] = qry_end;
  payload["qry_filter"] = qry_filter;
  payload["params"] = params;
  payload["limit"] = to_string(cnt);
  payload["title"] = a_request.title();
  payload["query"] = nlohmann::json::parse(query_json);

  string body = payload.dump(-1, ' ', true);
  dbPost("qry/create", {}, &body, result, log_context);

  setQueryData(a_reply, result, log_context);
}

void DatabaseAPI::queryUpdate(const Auth::QueryUpdateRequest &a_request,
                              Auth::QueryDataReply &a_reply,
                              LogContext log_context) {
  Value result;
  nlohmann::json payload;
  payload["id"] = a_request.id();

  if (a_request.has_title()) {
    payload["title"] = a_request.title();
  }

  if (a_request.has_query()) {
    string qry_begin, qry_end, qry_filter, params;

    uint32_t cnt = parseSearchRequest(a_request.query(), qry_begin, qry_end,
                                      qry_filter, params, log_context);

    google::protobuf::util::JsonPrintOptions options;
    string query_json;

    options.always_print_enums_as_ints = true;
    options.preserve_proto_field_names = true;

    auto stat = google::protobuf::util::MessageToJsonString(
        a_request.query(), &query_json, options);
    if (!stat.ok()) {
      EXCEPT(1, "Invalid search request");
    }

    payload["qry_begin"] = qry_begin;
    payload["qry_end"] = qry_end;
    payload["qry_filter"] = qry_filter;
    payload["params"] = params;
    payload["limit"] = to_string(cnt);
    payload["query"] = nlohmann::json::parse(query_json);
  }

  string body = payload.dump(-1, ' ', true);
  dbPost("qry/update", {}, &body, result, log_context);

  setQueryData(a_reply, result, log_context);
}

// DatabaseAPI::queryDelete( const std::string & a_id )
void DatabaseAPI::queryDelete(const Auth::QueryDeleteRequest &a_request,
                              Anon::AckReply &a_reply, LogContext log_context) {
  (void)a_reply;
  Value result;
  string ids = "[";

  for (int i = 0; i < a_request.id_size(); i++) {
    if (i)
      ids += ",";

    ids += "\"" + a_request.id(i) + "\"";
  }
  ids += "]";

  dbGet("qry/delete", {{"ids", ids}}, result, log_context);
}

void DatabaseAPI::queryView(const Auth::QueryViewRequest &a_request,
                            Auth::QueryDataReply &a_reply,
                            LogContext log_context) {
  Value result;

  dbGet("qry/view", {{"id", a_request.id()}}, result, log_context);

  setQueryData(a_reply, result, log_context);
}

void DatabaseAPI::queryExec(const Auth::QueryExecRequest &a_request,
                            Auth::ListingReply &a_reply,
                            LogContext log_context) {
  Value result;
  vector<pair<string, string>> params;

  params.push_back({"id", a_request.id()});
  if (a_request.has_offset())
    params.push_back({"offset", to_string(a_request.offset())});
  if (a_request.has_count())
    params.push_back({"count", to_string(a_request.count())});

  dbGet("/qry/exec", params, result, log_context);

  setListingDataReply(a_reply, result, log_context);
}

void DatabaseAPI::setQueryData(QueryDataReply &a_reply,
                               const libjson::Value &a_result,
                               LogContext log_context) {
  TRANSLATE_BEGIN()

  const Value::Object &obj = a_result.asObject();

  a_reply.set_id(obj.getString("id"));
  a_reply.set_title(obj.getString("title"));
  a_reply.set_owner(obj.getString("owner"));
  a_reply.set_ct(obj.getNumber("ct"));
  a_reply.set_ut(obj.getNumber("ut"));

  auto stat = google::protobuf::util::JsonStringToMessage(
      obj.getValue("query").toString(), a_reply.mutable_query());
  if (!stat.ok()) {
    EXCEPT(1, "Query data reply parse error!");
  }

  TRANSLATE_END(a_result, log_context)
}

void DatabaseAPI::aclView(const Auth::ACLViewRequest &a_request,
                          Auth::ACLDataReply &a_reply, LogContext log_context) {
  libjson::Value result;

  dbGet("acl/view", {{"id", a_request.id()}}, result, log_context);

  setACLData(a_reply, result, log_context);
}

void DatabaseAPI::aclUpdate(const Auth::ACLUpdateRequest &a_request,
                            Auth::ACLDataReply &a_reply,
                            LogContext log_context) {
  Value result;
  vector<pair<string, string>> params;
  params.push_back({"id", a_request.id()});
  if (a_request.has_rules())
    params.push_back({"rules", a_request.rules()});

  dbGet("acl/update", params, result, log_context);

  setACLData(a_reply, result, log_context);
}

void DatabaseAPI::aclSharedList(const Auth::ACLSharedListRequest &a_request,
                                Auth::ListingReply &a_reply,
                                LogContext log_context) {
  Value result;
  vector<pair<string, string>> params;

  if (a_request.has_inc_users())
    params.push_back({"inc_users", a_request.inc_users() ? "true" : "false"});
  if (a_request.has_inc_projects())
    params.push_back(
        {"inc_projects", a_request.inc_projects() ? "true" : "false"});

  dbGet("acl/shared/list", params, result, log_context);

  setListingDataReply(a_reply, result, log_context);
}

void DatabaseAPI::aclSharedListItems(
    const Auth::ACLSharedListItemsRequest &a_request,
    Auth::ListingReply &a_reply, LogContext log_context) {
  Value result;
  vector<pair<string, string>> params;

  params.push_back({"owner", a_request.owner()});

  dbGet("acl/shared/list/items", params, result, log_context);

  setListingDataReply(a_reply, result, log_context);
}

void DatabaseAPI::setACLData(ACLDataReply &a_reply,
                             const libjson::Value &a_result,
                             LogContext log_context) {
  ACLRule *rule;

  TRANSLATE_BEGIN()

  const Value::Array &arr = a_result.asArray();

  for (Value::ArrayConstIter i = arr.begin(); i != arr.end(); i++) {
    const Value::Object &obj = i->asObject();

    rule = a_reply.add_rule();
    rule->set_id(obj.getString("id"));

    if (obj.has("grant"))
      rule->set_grant(obj.asNumber());

    if (obj.has("inhgrant"))
      rule->set_inhgrant(obj.asNumber());
  }

  TRANSLATE_END(a_result, log_context)
}

void DatabaseAPI::groupCreate(const Auth::GroupCreateRequest &a_request,
                              Auth::GroupDataReply &a_reply,
                              LogContext log_context) {
  Value result;

  vector<pair<string, string>> params;
  params.push_back({"gid", a_request.group().gid()});
  if (a_request.group().uid().compare(m_client_uid) != 0)
    params.push_back({"proj", a_request.group().uid()});
  if (a_request.group().has_title())
    params.push_back({"title", a_request.group().title()});
  if (a_request.group().has_desc())
    params.push_back({"desc", a_request.group().desc()});
  if (a_request.group().member_size() > 0) {
    string members = "[";
    for (int i = 0; i < a_request.group().member_size(); ++i) {
      if (i > 0)
        members += ",";
      members += "\"" + a_request.group().member(i) + "\"";
    }
    members += "]";
    params.push_back({"members", members});
  }

  dbGet("grp/create", params, result, log_context);

  setGroupData(a_reply, result, log_context);
}

void DatabaseAPI::groupUpdate(const Auth::GroupUpdateRequest &a_request,
                              Auth::GroupDataReply &a_reply,
                              LogContext log_context) {
  Value result;

  vector<pair<string, string>> params;
  params.push_back({"gid", a_request.gid()});
  if (a_request.uid().compare(m_client_uid) != 0)
    params.push_back({"proj", a_request.uid()});
  if (a_request.has_title())
    params.push_back({"title", a_request.title()});
  if (a_request.has_desc())
    params.push_back({"desc", a_request.desc()});
  if (a_request.add_uid_size() > 0) {
    string members = "[";
    for (int i = 0; i < a_request.add_uid_size(); ++i) {
      if (i > 0)
        members += ",";
      members += "\"" + a_request.add_uid(i) + "\"";
    }
    members += "]";
    params.push_back({"add", members});
  }
  if (a_request.rem_uid_size() > 0) {
    string members = "[";
    for (int i = 0; i < a_request.rem_uid_size(); ++i) {
      if (i > 0)
        members += ",";
      members += "\"" + a_request.rem_uid(i) + "\"";
    }
    members += "]";
    params.push_back({"rem", members});
  }

  dbGet("grp/update", params, result, log_context);

  setGroupData(a_reply, result, log_context);
}

void DatabaseAPI::groupDelete(const Auth::GroupDeleteRequest &a_request,
                              Anon::AckReply &a_reply, LogContext log_context) {
  (void)a_reply;
  Value result;

  vector<pair<string, string>> params;
  params.push_back({"gid", a_request.gid()});
  if (a_request.uid().compare(m_client_uid) != 0)
    params.push_back({"proj", a_request.uid()});

  dbGet("grp/delete", params, result, log_context);
}

void DatabaseAPI::groupList(const Auth::GroupListRequest &a_request,
                            Auth::GroupDataReply &a_reply,
                            LogContext log_context) {
  (void)a_request;

  Value result;
  vector<pair<string, string>> params;
  if (a_request.uid().compare(m_client_uid) != 0)
    params.push_back({"proj", a_request.uid()});

  dbGet("grp/list", params, result, log_context);

  setGroupData(a_reply, result, log_context);
}

void DatabaseAPI::groupView(const Auth::GroupViewRequest &a_request,
                            Auth::GroupDataReply &a_reply,
                            LogContext log_context) {
  Value result;
  vector<pair<string, string>> params;
  params.push_back({"gid", a_request.gid()});
  if (a_request.uid().compare(m_client_uid) != 0)
    params.push_back({"proj", a_request.uid()});

  dbGet("grp/view", params, result, log_context);

  setGroupData(a_reply, result, log_context);
}

void DatabaseAPI::setGroupData(GroupDataReply &a_reply,
                               const libjson::Value &a_result,
                               LogContext log_context) {
  GroupData *group;
  Value::ArrayConstIter j;

  TRANSLATE_BEGIN()

  const Value::Array &arr = a_result.asArray();

  for (Value::ArrayConstIter i = arr.begin(); i != arr.end(); i++) {
    const Value::Object &obj = i->asObject();

    group = a_reply.add_group();
    group->set_gid(obj.getString("gid"));

    if (obj.has("uid") && !obj.value().isNull())
      group->set_uid(obj.asString());

    if (obj.has("title") && !obj.value().isNull())
      group->set_title(obj.asString());

    if (obj.has("desc") && !obj.value().isNull())
      group->set_desc(obj.asString());

    if (obj.has("members")) {
      const Value::Array &arr2 = obj.asArray();

      for (j = arr2.begin(); j != arr2.end(); j++)
        group->add_member(j->asString());
    }
  }

  TRANSLATE_END(a_result, log_context)
}

void DatabaseAPI::repoList(const Auth::RepoListRequest &a_request,
                           Auth::RepoDataReply &a_reply,
                           LogContext log_context) {
  Value result;

  DL_DEBUG(log_context, "Calling repoList.");
  vector<pair<string, string>> params;
  if (a_request.has_all())
    params.push_back({"all", a_request.all() ? "true" : "false"});
  if (a_request.has_details())
    params.push_back({"details", a_request.details() ? "true" : "false"});

  dbGet("repo/list", params, result, log_context);

  std::vector<RepoData> temp;
  setRepoData(&a_reply, temp, result, log_context);
}

void DatabaseAPI::repoList(std::vector<RepoData> &a_repos,
                           LogContext log_context) {
  Value result;

  dbGet("repo/list", {{"all", "true"}, {"details", "true"}}, result,
        log_context);

  setRepoData(0, a_repos, result, log_context);
}

void DatabaseAPI::repoView(std::vector<RepoData> &a_repos,
                           LogContext log_context) {
  const std::vector<RepoData> copy = a_repos;
  a_repos.clear();
  for (const RepoData &r : copy) {
    Value result;

    dbGet("repo/view", {{"id", r.id()}}, result, log_context);

    setRepoData(0, a_repos, result, log_context);
  }
}

void DatabaseAPI::repoView(const Auth::RepoViewRequest &a_request,
                           Auth::RepoDataReply &a_reply,
                           LogContext log_context) {
  Value result;

  dbGet("repo/view", {{"id", a_request.id()}}, result, log_context);

  std::vector<RepoData> temp;
  setRepoData(&a_reply, temp, result, log_context);
}

void DatabaseAPI::repoCreate(const Auth::RepoCreateRequest &a_request,
                             Auth::RepoDataReply &a_reply,
                             LogContext log_context) {
  Value result;

  nlohmann::json payload;
  payload["id"] = a_request.id();
  payload["title"] = a_request.title();
  payload["path"] = a_request.path();
  payload["pub_key"] = a_request.pub_key();
  payload["address"] = a_request.address();
  payload["endpoint"] = a_request.endpoint();
  payload["capacity"] = to_string(a_request.capacity());

  if (a_request.has_desc()) {
    payload["desc"] = a_request.desc();
  }
  if (a_request.has_domain()) {
    payload["domain"] = a_request.domain();
  }
  if (a_request.has_exp_path()) {
    payload["exp_path"] = a_request.exp_path();
  }
  if (a_request.admin_size() > 0) {
    nlohmann::json admins = nlohmann::json::array();
    for (int i = 0; i < a_request.admin_size(); ++i) {
      admins.push_back(a_request.admin(i));
    }
    payload["admins"] = admins;
  }

  string body = payload.dump(-1, ' ', true);
  dbPost("repo/create", {}, &body, result, log_context);

  std::vector<RepoData> temp;
  setRepoData(&a_reply, temp, result, log_context);
}

void DatabaseAPI::repoUpdate(const Auth::RepoUpdateRequest &a_request,
                             Auth::RepoDataReply &a_reply,
                             LogContext log_context) {
  Value result;
  nlohmann::json payload;
  payload["id"] = a_request.id();

  if (a_request.has_title()) {
    payload["title"] = a_request.title();
  }
  if (a_request.has_desc()) {
    payload["desc"] = a_request.desc();
  }
  if (a_request.has_path()) {
    payload["path"] = a_request.path();
  }
  if (a_request.has_exp_path()) {
    payload["exp_path"] = a_request.exp_path();
  }
  if (a_request.has_domain()) {
    payload["domain"] = a_request.domain();
  }
  if (a_request.has_pub_key()) {
    payload["pub_key"] = a_request.pub_key();
  }
  if (a_request.has_address()) {
    payload["address"] = a_request.address();
  }
  if (a_request.has_endpoint()) {
    payload["endpoint"] = a_request.endpoint();
  }
  if (a_request.has_capacity()) {
    payload["capacity"] = to_string(a_request.capacity());
  }
  if (a_request.admin_size() > 0) {
    nlohmann::json admins = nlohmann::json::array();
    for (int i = 0; i < a_request.admin_size(); ++i) {
      admins.push_back(a_request.admin(i));
    }
    payload["admins"] = admins;
  }
  string body = payload.dump(-1, ' ', true);
  dbPost("repo/update", {}, &body, result, log_context);

  std::vector<RepoData> temp;
  setRepoData(&a_reply, temp, result, log_context);
}

void DatabaseAPI::repoDelete(const Auth::RepoDeleteRequest &a_request,
                             Anon::AckReply &a_reply, LogContext log_context) {
  (void)a_reply;
  Value result;

  dbGet("repo/delete", {{"id", a_request.id()}}, result, log_context);
}

void DatabaseAPI::repoCalcSize(const Auth::RepoCalcSizeRequest &a_request,
                               Auth::RepoCalcSizeReply &a_reply,
                               LogContext log_context) {
  Value result;

  string items = "[";
  if (a_request.item_size() > 0) {
    for (int i = 0; i < a_request.item_size(); ++i) {
      if (i > 0)
        items += ",";
      items += "\"" + a_request.item(i) + "\"";
    }
    items += "]";
  }

  dbGet("repo/calc_size",
        {{"recurse", a_request.recurse() ? "true" : "false"}, {"items", items}},
        result, log_context);

  TRANSLATE_BEGIN()

  const Value::Array &arr = result.asArray();

  for (Value::ArrayConstIter i = arr.begin(); i != arr.end(); i++) {
    setAllocStatsData(*a_reply.add_stats(), i->asObject(), log_context);
  }

  TRANSLATE_END(result, log_context)
}

void DatabaseAPI::setRepoData(Auth::RepoDataReply *a_reply,
                              std::vector<RepoData> &a_repos,
                              const libjson::Value &a_result,
                              LogContext log_context) {

  DL_DEBUG(log_context, "Calling setRepoData.");
  Value::ArrayConstIter k;

  TRANSLATE_BEGIN()

  const Value::Array &arr = a_result.asArray();

  for (Value::ArrayConstIter i = arr.begin(); i != arr.end(); i++) {
    const Value::Object &obj = i->asObject();

    a_repos.emplace_back();

    a_repos.back().set_id(obj.getString("id"));

    if (obj.has("title")) {
      a_repos.back().set_title(obj.asString());
    }
    if (obj.has("desc")) {
      a_repos.back().set_desc(obj.asString());
    }

    if (obj.has("capacity")) {
      a_repos.back().set_capacity(
          obj.asNumber()); // TODO Needs to be 64 bit integer (string in JSON)
    }

    if (obj.has("address")) {
      a_repos.back().set_address(obj.asString());
    }

    if (obj.has("endpoint")) {
      a_repos.back().set_endpoint(obj.asString());
    }

    if (obj.has("pub_key")) {
      a_repos.back().set_pub_key(obj.asString());
    }

    if (obj.has("path")) {
      a_repos.back().set_path(obj.asString());
    }

    if (obj.has("exp_path")) {
      a_repos.back().set_exp_path(obj.asString());
    }

    if (obj.has("domain") && !obj.value().isNull()) {
      a_repos.back().set_domain(obj.asString());
    }

    if (obj.has("admins")) {
      const Value::Array &arr2 = obj.asArray();

      for (k = arr2.begin(); k != arr2.end(); k++) {
        a_repos.back().add_admin(k->asString());
      }
    }

    if (a_reply) {
      RepoData *repo = a_reply->add_repo();
      *repo = (a_repos.back());
    }
  }

  TRANSLATE_END(a_result, log_context)
}

void DatabaseAPI::repoListAllocations(
    const Auth::RepoListAllocationsRequest &a_request,
    Auth::RepoAllocationsReply &a_reply, LogContext log_context) {
  Value result;

  dbGet("repo/alloc/list/by_repo", {{"repo", a_request.id()}}, result,
        log_context);

  setAllocData(a_reply, result, log_context);
}

void DatabaseAPI::repoListSubjectAllocations(
    const Auth::RepoListSubjectAllocationsRequest &a_request,
    Auth::RepoAllocationsReply &a_reply, LogContext log_context) {
  Value result;
  vector<pair<string, string>> params;
  if (a_request.has_subject())
    params.push_back({"owner", a_request.subject()});
  else
    params.push_back({"owner", m_client_uid});
  if (a_request.has_stats())
    params.push_back({"stats", a_request.stats() ? "true" : "false"});

  dbGet("repo/alloc/list/by_owner", params, result, log_context);

  setAllocData(a_reply, result, log_context);
}

void DatabaseAPI::repoListObjectAllocations(
    const Auth::RepoListObjectAllocationsRequest &a_request,
    Auth::RepoAllocationsReply &a_reply, LogContext log_context) {
  Value result;

  dbGet("repo/alloc/list/by_object", {{"object", a_request.id()}}, result,
        log_context);

  setAllocData(a_reply, result, log_context);
}

void DatabaseAPI::setAllocData(Auth::RepoAllocationsReply &a_reply,
                               const libjson::Value &a_result,
                               LogContext log_context) {
  TRANSLATE_BEGIN()

  const Value::Array &arr = a_result.asArray();

  for (Value::ArrayConstIter i = arr.begin(); i != arr.end(); i++) {
    setAllocData(a_reply.add_alloc(), i->asObject(), log_context);
  }

  TRANSLATE_END(a_result, log_context)
}

void DatabaseAPI::setAllocData(AllocData *a_alloc,
                               const libjson::Value::Object &a_obj,
                               LogContext log_context) {
  a_alloc->set_repo(a_obj.getString("repo"));
  a_alloc->set_data_limit(a_obj.getNumber("data_limit"));
  a_alloc->set_data_size(a_obj.getNumber("data_size"));
  a_alloc->set_rec_limit(a_obj.getNumber("rec_limit"));
  a_alloc->set_rec_count(a_obj.getNumber("rec_count"));
  a_alloc->set_path(a_obj.getString("path"));

  if (a_obj.has("is_def"))
    a_alloc->set_is_def(a_obj.asBool());

  if (a_obj.has("id"))
    a_alloc->set_id(a_obj.asString());

  if (a_obj.has("stats"))
    setAllocStatsData(*a_alloc->mutable_stats(), a_obj, log_context);
}

void DatabaseAPI::repoViewAllocation(
    const Auth::RepoViewAllocationRequest &a_request,
    Auth::RepoAllocationsReply &a_reply, LogContext log_context) {
  Value result;
  vector<pair<string, string>> params;
  params.push_back({"repo", a_request.repo()});
  if (a_request.has_subject())
    params.push_back({"subject", a_request.subject()});

  dbGet("repo/alloc/view", params, result, log_context);

  setAllocData(a_reply, result, log_context);
}

void DatabaseAPI::repoAllocationStats(
    const Auth::RepoAllocationStatsRequest &a_request,
    Auth::RepoAllocationStatsReply &a_reply, LogContext log_context) {
  Value result;
  vector<pair<string, string>> params;
  params.push_back({"repo", a_request.repo()});
  if (a_request.has_subject())
    params.push_back({"subject", a_request.subject()});

  dbGet("repo/alloc/stats", params, result, log_context);

  TRANSLATE_BEGIN()

  setAllocStatsData(*a_reply.mutable_alloc(), result.asObject(), log_context);

  TRANSLATE_END(result, log_context)
}

void DatabaseAPI::setAllocStatsData(AllocStatsData &a_stats,
                                    const libjson::Value::Object &a_obj,
                                    LogContext log_context) {
  DL_TRACE(log_context, a_obj.getString("repo")
                            << " " << a_obj.getNumber("rec_count")
                            << a_obj.getNumber("file_count")
                            << a_obj.getNumber("data_size"));
  a_stats.set_repo(a_obj.getString("repo"));
  a_stats.set_rec_count(a_obj.getNumber("rec_count"));
  a_stats.set_file_count(a_obj.getNumber("file_count"));
  a_stats.set_data_size(a_obj.getNumber("data_size"));

  if (a_obj.has("histogram")) {
    const Value::Array &arr = a_obj.asArray();

    for (Value::ArrayConstIter j = arr.begin(); j != arr.end(); j++)
      a_stats.add_histogram(j->asNumber());
  }
}

void DatabaseAPI::repoAllocationSet(
    const Auth::RepoAllocationSetRequest &a_request, Anon::AckReply &a_reply,
    LogContext log_context) {
  (void)a_reply;
  Value result;

  dbGet("repo/alloc/set",
        {{"repo", a_request.repo()},
         {"subject", a_request.subject()},
         {"data_limit", to_string(a_request.data_limit())},
         {"rec_limit", to_string(a_request.rec_limit())}},
        result, log_context);
}

void DatabaseAPI::repoAllocationSetDefault(
    const Auth::RepoAllocationSetDefaultRequest &a_request,
    Anon::AckReply &a_reply, LogContext log_context) {
  (void)a_reply;

  Value result;
  vector<pair<string, string>> params;

  params.push_back({"repo", a_request.repo()});
  if (a_request.has_subject())
    params.push_back({"subject", a_request.subject()});

  dbGet("repo/alloc/set/default", params, result, log_context);
}

void DatabaseAPI::checkPerms(const CheckPermsRequest &a_request,
                             CheckPermsReply &a_reply, LogContext log_context) {
  Value result;

  dbGet("authz/perm/check",
        {{"id", a_request.id()}, {"perms", to_string(a_request.perms())}},
        result, log_context);

  TRANSLATE_BEGIN()

  a_reply.set_granted(result.asObject().getBool("granted"));

  TRANSLATE_END(result, log_context)
}

void DatabaseAPI::getPerms(const GetPermsRequest &a_request,
                           GetPermsReply &a_reply, LogContext log_context) {
  Value result;
  vector<pair<string, string>> params;
  params.push_back({"id", a_request.id()});
  if (a_request.has_perms())
    params.push_back({"perms", to_string(a_request.perms())});

  dbGet("authz/perm/get", params, result, log_context);

  TRANSLATE_BEGIN()

  a_reply.set_granted(result.asObject().getNumber("granted"));

  TRANSLATE_END(result, log_context)
}

void DatabaseAPI::repoAuthz(const Auth::RepoAuthzRequest &a_request,
                            Anon::AckReply &a_reply, LogContext log_context) {
  (void)a_reply;
  Value result;

  DL_INFO(log_context, "authz/gridftp repo: " << a_request.repo() << " file "
                                              << a_request.file() << " act "
                                              << a_request.action());
  dbGet("authz/gridftp",
        {{"repo", a_request.repo()},
         {"file", a_request.file()},
         {"act", a_request.action()}},
        result, log_context);
}

void DatabaseAPI::topicListTopics(const Auth::TopicListTopicsRequest &a_request,
                                  Auth::TopicDataReply &a_reply,
                                  LogContext log_context) {
  Value result;
  vector<pair<string, string>> params;
  if (a_request.has_topic_id())
    params.push_back({"id", a_request.topic_id()});
  if (a_request.has_offset() && a_request.has_count()) {
    params.push_back({"offset", to_string(a_request.offset())});
    params.push_back({"count", to_string(a_request.count())});
  }

  dbGet("topic/list/topics", params, result, log_context);

  setTopicDataReply(a_reply, result, log_context);
}

void DatabaseAPI::topicView(const Auth::TopicViewRequest &a_request,
                            Auth::TopicDataReply &a_reply,
                            LogContext log_context) {
  Value result;

  dbGet("topic/view", {{"id", a_request.id()}}, result, log_context);

  setTopicDataReply(a_reply, result, log_context);
}

void DatabaseAPI::topicSearch(const Auth::TopicSearchRequest &a_request,
                              Auth::TopicDataReply &a_reply,
                              LogContext log_context) {
  Value result;

  dbGet("topic/search", {{"phrase", a_request.phrase()}}, result, log_context);

  setTopicDataReply(a_reply, result, log_context);
}

void DatabaseAPI::setTopicDataReply(Auth::TopicDataReply &a_reply,
                                    const libjson::Value &a_result,
                                    LogContext log_context) {
  TRANSLATE_BEGIN()

  Value::ArrayConstIter j;
  const Value::Array &arr = a_result.asArray();

  for (Value::ArrayConstIter i = arr.begin(); i != arr.end(); i++) {
    const Value::Object &obj = i->asObject();

    if (obj.has("paging")) {
      const Value::Object &obj2 = obj.asObject();

      a_reply.set_offset(obj2.getNumber("off"));
      a_reply.set_count(obj2.getNumber("cnt"));
      a_reply.set_total(obj2.getNumber("tot"));
    } else {
      TopicData *topic2, *topic = a_reply.add_topic();

      topic->set_id(obj.getString("_id"));
      topic->set_title(obj.getString("title"));
      topic->set_coll_cnt(obj.getNumber("coll_cnt"));

      if (obj.has("desc"))
        topic->set_desc(obj.asString());

      if (obj.has("creator"))
        topic->set_creator(obj.asString());

      if (obj.has("admin") && !obj.value().isNull())
        topic->set_admin(obj.asBool());

      if (obj.has("path")) {
        const Value::Array &arr2 = obj.asArray();
        for (j = arr2.begin(); j != arr2.end(); j++) {
          const Value::Object &obj2 = j->asObject();

          topic2 = topic->add_path();
          topic2->set_id(obj2.getString("_id"));
          topic2->set_title(obj2.getString("title"));
          topic2->set_coll_cnt(0);
        }
      }
    }
  }

  TRANSLATE_END(a_result, log_context)
}

void DatabaseAPI::noteCreate(const NoteCreateRequest &a_request,
                             Auth::NoteDataReply &a_reply,
                             LogContext log_context) {
  DL_DEBUG(log_context, "NoteCreate");

  Value result;
  vector<pair<string, string>> params;
  params.push_back({"type", to_string(a_request.type())});
  params.push_back({"subject", a_request.subject()});
  params.push_back({"title", a_request.title()});
  params.push_back({"comment", a_request.comment()});
  params.push_back({"activate", a_request.activate() ? "true" : "false"});

  dbPost("note/create", params, 0, result, log_context);

  setNoteDataReply(a_reply, result, log_context);
}

void DatabaseAPI::noteUpdate(const NoteUpdateRequest &a_request,
                             Auth::NoteDataReply &a_reply,
                             LogContext log_context) {
  DL_DEBUG(log_context, "NoteUpdate");

  Value result;
  vector<pair<string, string>> params;
  params.push_back({"id", a_request.id()});
  params.push_back({"comment", a_request.comment()});
  if (a_request.has_new_type())
    params.push_back({"new_type", to_string(a_request.new_type())});
  if (a_request.has_new_state())
    params.push_back({"new_state", to_string(a_request.new_state())});
  if (a_request.has_new_title())
    params.push_back({"new_title", a_request.new_title()});

  dbPost("note/update", params, 0, result, log_context);

  setNoteDataReply(a_reply, result, log_context);
}

void DatabaseAPI::noteCommentEdit(const Auth::NoteCommentEditRequest &a_request,
                                  Auth::NoteDataReply &a_reply,
                                  LogContext log_context) {
  Value result;
  vector<pair<string, string>> params;
  params.push_back({"id", a_request.id()});
  params.push_back({"comment", a_request.comment()});
  params.push_back({"comment_idx", to_string(a_request.comment_idx())});

  dbPost("note/comment/edit", params, 0, result, log_context);

  setNoteDataReply(a_reply, result, log_context);
}

void DatabaseAPI::noteView(const Auth::NoteViewRequest &a_request,
                           Auth::NoteDataReply &a_reply,
                           LogContext log_context) {
  Value result;

  dbGet("note/view", {{"id", a_request.id()}}, result, log_context);

  setNoteDataReply(a_reply, result, log_context);
}

void DatabaseAPI::noteListBySubject(
    const Auth::NoteListBySubjectRequest &a_request,
    Auth::NoteDataReply &a_reply, LogContext log_context) {
  Value result;

  dbGet("note/list/by_subject", {{"subject", a_request.subject()}}, result,
        log_context);

  setNoteDataReply(a_reply, result, log_context);
}

void DatabaseAPI::notePurge(uint32_t a_age_sec, LogContext log_context) {
  Value result;

  dbGet("note/purge", {{"age_sec", to_string(a_age_sec)}}, result, log_context);
}

void DatabaseAPI::setNoteDataReply(Auth::NoteDataReply &a_reply,
                                   const libjson::Value &a_result,
                                   LogContext log_context) {
  Value::ArrayConstIter i;

  TRANSLATE_BEGIN()

  const Value::Object &res_obj = a_result.asObject();

  if (res_obj.has("results")) {
    const Value::Array &arr = res_obj.asArray();

    for (i = arr.begin(); i != arr.end(); i++)
      setNoteData(a_reply.add_note(), i->asObject(), log_context);
  }

  if (res_obj.has("updates")) {
    const Value::Array &arr = res_obj.asArray();

    for (i = arr.begin(); i != arr.end(); i++)
      setListingData(a_reply.add_update(), i->asObject(), log_context);
  }

  TRANSLATE_END(a_result, log_context)
}

void DatabaseAPI::setNoteData(NoteData *a_note,
                              const libjson::Value::Object &a_obj,
                              LogContext log_context) {
  DL_TRACE(log_context, a_obj.getString("_id"));
  a_note->set_id(a_obj.getString("_id"));
  a_note->set_type((NoteType)a_obj.getNumber("type"));
  a_note->set_state((NoteState)a_obj.getNumber("state"));
  a_note->set_subject_id(a_obj.getString("subject_id"));
  a_note->set_title(a_obj.getString("title"));
  a_note->set_ct(a_obj.getNumber("ct"));
  a_note->set_ut(a_obj.getNumber("ut"));

  if (a_obj.has("parent_id") && !a_obj.value().isNull())
    a_note->set_parent_id(a_obj.asString());

  if (a_obj.has("has_child"))
    a_note->set_has_child(a_obj.asBool());

  if (a_obj.has("comments")) {
    const Value::Array &arr = a_obj.asArray();
    Value::ObjectIter m;
    NoteComment *comment;

    for (Value::ArrayConstIter k = arr.begin(); k != arr.end(); k++) {
      const Value::Object &obj = k->asObject();

      comment = a_note->add_comment();
      comment->set_user(obj.getString("user"));
      comment->set_time(obj.getNumber("time"));
      comment->set_comment(obj.getString("comment"));

      if (obj.has("new_type") && !obj.value().isNull())
        comment->set_type((NoteType)obj.asNumber());
      if (obj.has("new_state") && !obj.value().isNull())
        comment->set_state((NoteState)obj.asNumber());
    }
  }
}

void DatabaseAPI::tagSearch(const Auth::TagSearchRequest &a_request,
                            Auth::TagDataReply &a_reply,
                            LogContext log_context) {
  Value result;
  vector<pair<string, string>> params;

  params.push_back({"name", a_request.name()});

  if (a_request.has_offset() && a_request.has_count()) {
    params.push_back({"offset", to_string(a_request.offset())});
    params.push_back({"count", to_string(a_request.count())});
  }

  dbPost("tag/search", params, 0, result, log_context);

  setTagDataReply(a_reply, result, log_context);
}

void DatabaseAPI::tagListByCount(const Auth::TagListByCountRequest &a_request,
                                 Auth::TagDataReply &a_reply,
                                 LogContext log_context) {
  Value result;
  vector<pair<string, string>> params;

  if (a_request.has_offset() && a_request.has_count()) {
    params.push_back({"offset", to_string(a_request.offset())});
    params.push_back({"count", to_string(a_request.count())});
  }

  dbPost("tag/list/by_count", params, 0, result, log_context);

  setTagDataReply(a_reply, result, log_context);
}

void DatabaseAPI::setTagDataReply(Auth::TagDataReply &a_reply,
                                  const Value &a_result,
                                  LogContext log_context) {
  Value::ObjectConstIter j;

  TRANSLATE_BEGIN()

  const Value::Array &arr = a_result.asArray();

  for (Value::ArrayConstIter i = arr.begin(); i != arr.end(); i++) {
    const Value::Object &obj = i->asObject();

    if (obj.has("paging")) {
      const Value::Object &obj2 = obj.asObject();

      a_reply.set_offset(obj2.getNumber("off"));
      a_reply.set_count(obj2.getNumber("cnt"));
      a_reply.set_total(obj2.getNumber("tot"));
    } else {
      setTagData(a_reply.add_tag(), obj, log_context);
    }
  }

  TRANSLATE_END(a_result, log_context)
}

void DatabaseAPI::setTagData(TagData *a_tag,
                             const libjson::Value::Object &a_obj,
                             LogContext log_context) {
  DL_TRACE(log_context, "name: " << a_obj.getString("name"));
  a_tag->set_name(a_obj.getString("name"));
  a_tag->set_count(a_obj.getNumber("count"));
}

void DatabaseAPI::schemaSearch(const Auth::SchemaSearchRequest &a_request,
                               Auth::SchemaDataReply &a_reply,
                               LogContext log_context) {
  libjson::Value result;
  vector<pair<string, string>> params;

  if (a_request.has_id())
    params.push_back({"id", a_request.id()});
  if (a_request.has_text())
    params.push_back({"text", a_request.text()});
  if (a_request.has_owner())
    params.push_back({"owner", a_request.owner()});
  if (a_request.has_sort())
    params.push_back({"sort", to_string(a_request.sort())});
  if (a_request.has_sort_rev())
    params.push_back({"sort_rev", a_request.sort_rev() ? "true" : "false"});
  if (a_request.has_offset())
    params.push_back({"offset", to_string(a_request.offset())});
  if (a_request.has_count())
    params.push_back({"count", to_string(a_request.count())});

  dbGet("schema/search", params, result, log_context);
  setSchemaDataReply(a_reply, result, log_context);
}

void DatabaseAPI::schemaView(const Auth::SchemaViewRequest &a_request,
                             Auth::SchemaDataReply &a_reply,
                             LogContext log_context) {
  libjson::Value result;
  vector<pair<string, string>> params;

  params.push_back({"id", a_request.id()});
  if (a_request.has_resolve() && a_request.resolve())
    params.push_back({"resolve", "true"});

  dbGet("schema/view", params, result, log_context);
  setSchemaDataReply(a_reply, result, log_context);
}

void DatabaseAPI::schemaCreate(const Auth::SchemaCreateRequest &a_request,
                               LogContext log_context) {
  libjson::Value result;

  nlohmann::json payload;

  payload["id"] = a_request.id();
  payload["desc"] = a_request.desc();
  payload["pub"] = a_request.pub();
  payload["sys"] = a_request.sys();
  payload["def"] = a_request.def();
  string body = payload.dump(-1, ' ', true);

  dbPost("schema/create", {}, &body, result, log_context);
}

void DatabaseAPI::schemaRevise(const Auth::SchemaReviseRequest &a_request,
                               LogContext log_context) {
  libjson::Value result;

  nlohmann::json payload;

  if (a_request.has_desc()) {
    payload["desc"] = a_request.desc();
  }

  if (a_request.has_pub()) {
    payload["pub"] = a_request.pub();
  }

  if (a_request.has_sys()) {
    payload["sys"] = a_request.sys();
  }

  if (a_request.has_def()) {
    payload["def"] = a_request.def();
  }
  string body = payload.dump(-1, ' ', true);

  dbPost("schema/revise", {{"id", a_request.id()}}, &body, result, log_context);
}

void DatabaseAPI::schemaUpdate(const Auth::SchemaUpdateRequest &a_request,
                               LogContext log_context) {
  libjson::Value result;

  nlohmann::json payload;
  if (a_request.has_id_new()) {
    payload["id"] = a_request.id_new();
  }

  if (a_request.has_desc()) {
    payload["desc"] = a_request.desc();
  }

  if (a_request.has_pub()) {
    payload["pub"] = a_request.pub();
  }

  if (a_request.has_sys()) {
    payload["sys"] = a_request.sys();
  }

  if (a_request.has_def()) {
    payload["def"] = a_request.def();
  }
  string body = payload.dump(-1, ' ', true);

  dbPost("schema/update", {{"id", a_request.id()}}, &body, result, log_context);
}

void DatabaseAPI::schemaDelete(const Auth::SchemaDeleteRequest &a_request,
                               Anon::AckReply &a_reply,
                               LogContext log_context) {
  (void)a_reply;
  libjson::Value result;

  dbPost("schema/delete", {{"id", a_request.id()}}, 0, result, log_context);
}

void DatabaseAPI::setSchemaDataReply(Auth::SchemaDataReply &a_reply,
                                     const libjson::Value &a_result,
                                     LogContext log_context) {
  Value::ObjectConstIter j;

  TRANSLATE_BEGIN()

  const Value::Array &arr = a_result.asArray();

  for (Value::ArrayConstIter i = arr.begin(); i != arr.end(); i++) {
    const Value::Object &obj = i->asObject();

    if (obj.has("paging")) {
      const Value::Object &obj2 = obj.asObject();

      a_reply.set_offset(obj2.getNumber("off"));
      a_reply.set_count(obj2.getNumber("cnt"));
      a_reply.set_total(obj2.getNumber("tot"));
    } else {
      setSchemaData(a_reply.add_schema(), obj);
    }
  }

  TRANSLATE_END(a_result, log_context)
}

void DatabaseAPI::setSchemaData(SchemaData *a_schema,
                                const libjson::Value::Object &a_obj) {
  a_schema->set_id(a_obj.getString("id"));
  a_schema->set_ver(a_obj.getNumber("ver"));

  if (a_obj.has("cnt"))
    a_schema->set_cnt(a_obj.asNumber());

  if (a_obj.has("own_id") && !a_obj.value().isNull())
    a_schema->set_own_id(a_obj.asString());

  if (a_obj.has("own_nm") && !a_obj.value().isNull())
    a_schema->set_own_nm(a_obj.asString());

  if (a_obj.has("desc"))
    a_schema->set_desc(a_obj.asString());

  if (a_obj.has("pub"))
    a_schema->set_pub(a_obj.asBool());

  if (a_obj.has("depr"))
    a_schema->set_depr(a_obj.asBool());

  if (a_obj.has("ref"))
    a_schema->set_ref(a_obj.asBool());

  if (a_obj.has("def"))
    a_schema->set_def(a_obj.value().toString());

  Value::ArrayConstIter j;
  SchemaData *dep;

  if (a_obj.has("uses") && a_obj.value().size()) {
    const Value::Array &arr = a_obj.asArray();

    for (j = arr.begin(); j != arr.end(); j++) {
      const Value::Object &obj = j->asObject();
      dep = a_schema->add_uses();

      dep->set_id(obj.getString("id"));
      dep->set_ver(obj.getNumber("ver"));
    }
  }

  if (a_obj.has("used_by") && a_obj.value().size()) {
    const Value::Array &arr = a_obj.asArray();

    for (j = arr.begin(); j != arr.end(); j++) {
      const Value::Object &obj = j->asObject();
      dep = a_schema->add_used_by();

      dep->set_id(obj.getString("id"));
      dep->set_ver(obj.getNumber("ver"));
    }
  }
}

void DatabaseAPI::schemaView(const std::string &a_id, libjson::Value &a_result,
                             LogContext log_context) {
  dbGet("schema/view", {{"id", a_id}}, a_result, log_context);
}

void DatabaseAPI::dailyMessage(const Anon::DailyMessageRequest &a_request,
                               Anon::DailyMessageReply &a_reply,
                               LogContext log_context) {
  (void)a_request; // Not used
  libjson::Value result;

  dbGet("config/msg/daily", {}, result, log_context);

  TRANSLATE_BEGIN()

  const Value::Object &obj = result.asObject();

  if (obj.has("msg") && !obj.value().isNull())
    a_reply.set_message(obj.asString());

  TRANSLATE_END(result, log_context)
}

void DatabaseAPI::taskLoadReady(libjson::Value &a_result,
                                LogContext log_context) {
  dbGet("task/reload", {}, a_result, log_context);
}

void DatabaseAPI::taskRun(const std::string &a_task_id,
                          libjson::Value &a_task_reply, LogContext log_context,
                          int *a_step, std::string *a_err_msg) {
  vector<pair<string, string>> params;
  params.push_back({"task_id", a_task_id});
  DL_DEBUG(log_context,
           "Calling taskRun from DatabaseAPI task id: " << a_task_id);
  if (a_err_msg) {
    params.push_back({"err_msg", *a_err_msg});
    DL_DEBUG(log_context, "Err_msg is: " << a_err_msg);
  } else if (a_step) {
    params.push_back({"step", to_string(*a_step)});
  }
  dbGet("task/run", params, a_task_reply, log_context);
}

void DatabaseAPI::taskAbort(const std::string &a_task_id,
                            const std::string &a_msg,
                            libjson::Value &a_task_reply,
                            LogContext log_context) {
  libjson::Value doc(a_msg);
  // TODO: json serialization --FLAG CHECK ON THIS LATER
  string body = doc.toString();

  dbPost("task/abort", {{"task_id", a_task_id}}, &body, a_task_reply,
         log_context);
}

void DatabaseAPI::taskInitDataGet(const Auth::DataGetRequest &a_request,
                                  Auth::DataGetReply &a_reply,
                                  libjson::Value &a_result,
                                  LogContext log_context) {
  nlohmann::json payload;

  nlohmann::json ids = nlohmann::json::array();
  for (int i = 0; i < a_request.id_size(); i++) {
    ids.push_back(a_request.id(i));
  }
  payload["id"] = ids;

  if (a_request.has_path()) {
    payload["path"] = a_request.path();
  }

  if (a_request.has_encrypt()) {
    payload["encrypt"] = to_string(a_request.encrypt());
  }

  if (a_request.has_orig_fname() && a_request.orig_fname()) {
    payload["orig_fname"] = a_request.orig_fname();
  }

  if (a_request.has_check() && a_request.check()) {
    payload["check"] = a_request.check();
  }

  if (a_request.has_collection_id()) {
    payload["collection_id"] = a_request.collection_id();
  }

  if (a_request.has_collection_type()) {
    payload["collection_type"] = a_request.collection_type();
  }

  string body = payload.dump(-1, ' ', true);

  dbPost("dat/get", {}, &body, a_result, log_context);

  setDataGetReply(a_reply, a_result, log_context);
}

void DatabaseAPI::setDataGetReply(Auth::DataGetReply &a_reply,
                                  const libjson::Value &a_result,
                                  LogContext log_context) {
  Value::ObjectIter t;

  TRANSLATE_BEGIN()

  const Value::Object &obj = a_result.asObject();
  Value::ObjectIter i;
  Value::ArrayConstIter j;

  if (obj.has("glob_data") && obj.value().size()) {
    const Value::Array &arr = obj.asArray();

    for (j = arr.begin(); j != arr.end(); j++)
      setListingData(a_reply.add_item(), j->asObject(), log_context);
  }

  if (obj.has("ext_data") && obj.value().size()) {
    const Value::Array &arr = obj.asArray();

    for (j = arr.begin(); j != arr.end(); j++)
      setListingData(a_reply.add_item(), j->asObject(), log_context);
  }

  if (obj.has("task"))
    setTaskData(a_reply.mutable_task(), obj.value(), log_context);

  TRANSLATE_END(a_result, log_context)
}

void DatabaseAPI::taskInitDataPut(const Auth::DataPutRequest &a_request,
                                  Auth::DataPutReply &a_reply,
                                  libjson::Value &a_result,
                                  LogContext log_context) {
  nlohmann::json payload;
  payload["id"] =
      nlohmann::json::array({a_request.id()}); // why is this an array?

  if (a_request.has_path()) {
    payload["path"] = a_request.path();
  }

  if (a_request.has_encrypt()) {
    payload["encrypt"] = to_string(a_request.encrypt());
  }

  if (a_request.has_ext()) {
    payload["ext"] = a_request.ext();
  }

  if (a_request.has_check() && a_request.check()) {
    payload["check"] = a_request.check();
  }

  if (a_request.has_collection_id()) {
    payload["collection_id"] = a_request.collection_id();
  }
  if (a_request.has_collection_type()) {
    payload["collection_type"] = a_request.collection_type();
  }

  string body = payload.dump(-1, ' ', true);
  dbPost("dat/put", {}, &body, a_result, log_context);

  setDataPutReply(a_reply, a_result, log_context);
}

void DatabaseAPI::setDataPutReply(Auth::DataPutReply &a_reply,
                                  const libjson::Value &a_result,
                                  LogContext log_context) {
  Value::ObjectIter t;

  TRANSLATE_BEGIN()

  const Value::Object &obj = a_result.asObject();
  Value::ObjectIter i;
  Value::ArrayConstIter j;

  if (!obj.has("glob_data") || obj.value().size() != 1)
    EXCEPT_PARAM(ID_BAD_REQUEST, "Invalid or missing upload target");

  const Value::Array &arr = obj.asArray();
  const Value::Object &rec = arr.begin()->asObject();
  RecordData *item = a_reply.mutable_item();

  item->set_id(rec.getString("_id"));
  item->set_title(rec.getString("title"));

  if (rec.has("owner") && !rec.value().isNull())
    item->set_owner(rec.asString());

  if (rec.has("size") && !rec.value().isNull())
    item->set_size(rec.asNumber());

  if (rec.has("source") && !rec.value().isNull())
    item->set_source(rec.asString());

  if (obj.has("task"))
    setTaskData(a_reply.mutable_task(), obj.value(), log_context);

  TRANSLATE_END(a_result, log_context)
}

void DatabaseAPI::taskInitRecordCollectionDelete(
    const std::vector<std::string> &a_ids, TaskDataReply &a_reply,
    libjson::Value &a_result, LogContext log_context) {
  nlohmann::json payload;
  payload["ids"] = a_ids;
  string body = payload.dump(-1, ' ', true);

  dbPost("dat/delete", {}, &body, a_result, log_context);

  setTaskDataReply(a_reply, a_result, log_context);
}

void DatabaseAPI::taskInitRecordAllocChange(
    const Auth::RecordAllocChangeRequest &a_request,
    Auth::RecordAllocChangeReply &a_reply, libjson::Value &a_result,
    LogContext log_context) {
  nlohmann::json payload;
  nlohmann::json ids = nlohmann::json::array();
  for (int i = 0; i < a_request.id_size(); i++) {
    ids.push_back(a_request.id(i));
  }
  payload["ids"] = ids;

  payload["repo_id"] = a_request.repo_id();
  if (a_request.has_proj_id()) {
    payload["proj_id"] = a_request.proj_id();
  }
  if (a_request.has_check()) {
    payload["check"] = a_request.check();
  }
  string body = payload.dump(-1, ' ', true);

  dbPost("dat/alloc_chg", {}, &body, a_result, log_context);

  TRANSLATE_BEGIN()

  const Value::Object &obj = a_result.asObject();

  a_reply.set_act_cnt(obj.getNumber("act_cnt"));
  a_reply.set_act_size(obj.getNumber("act_size"));
  a_reply.set_tot_cnt(obj.getNumber("tot_cnt"));
  a_reply.set_data_limit(obj.getNumber("data_limit"));
  a_reply.set_data_size(obj.getNumber("data_size"));
  a_reply.set_rec_limit(obj.getNumber("rec_limit"));
  a_reply.set_rec_count(obj.getNumber("rec_count"));

  if (obj.has("task"))
    setTaskData(a_reply.mutable_task(), obj.value(), log_context);

  TRANSLATE_END(a_result, log_context)
}

void DatabaseAPI::taskInitRecordOwnerChange(
    const Auth::RecordOwnerChangeRequest &a_request,
    Auth::RecordOwnerChangeReply &a_reply, libjson::Value &a_result,
    LogContext log_context) {
  nlohmann::json payload;
  nlohmann::json ids = nlohmann::json::array();
  for (int i = 0; i < a_request.id_size(); i++) {
    ids.push_back(a_request.id(i));
  }
  payload["ids"] = ids;
  payload["coll_id"] = a_request.coll_id();
  if (a_request.has_repo_id()) {
    payload["repo_id"] = a_request.repo_id();
  }
  // if ( a_request.has_proj_id() )
  //    body += string(",\"proj_id\":\"") + a_request.proj_id() + "\"";
  if (a_request.has_check()) {
    payload["check"] = a_request.check();
  }
  string body = payload.dump(-1, ' ', true);

  dbPost("dat/owner_chg", {}, &body, a_result, log_context);

  TRANSLATE_BEGIN()

  const Value::Object &obj = a_result.asObject();

  a_reply.set_act_cnt(obj.getNumber("act_cnt"));
  a_reply.set_act_size(obj.getNumber("act_size"));
  a_reply.set_tot_cnt(obj.getNumber("tot_cnt"));

  if (obj.has("allocs")) {
    const Value::Array &arr = obj.asArray();

    for (Value::ArrayConstIter a = arr.begin(); a != arr.end(); a++) {
      setAllocData(a_reply.add_alloc(), a->asObject(), log_context);
    }
  }

  if (obj.has("task"))
    setTaskData(a_reply.mutable_task(), obj.value(), log_context);

  TRANSLATE_END(a_result, log_context)
}

void DatabaseAPI::taskInitProjectDelete(
    const Auth::ProjectDeleteRequest &a_request, Auth::TaskDataReply &a_reply,
    libjson::Value &a_result, LogContext log_context) {
  nlohmann::json payload;
  nlohmann::json ids = nlohmann::json::array();

  for (int i = 0; i < a_request.id_size(); i++) {
    ids.push_back(a_request.id(i));
  }
  payload["ids"] = ids;

  string body = payload.dump(-1, ' ', true);

  dbPost("prj/delete", {}, &body, a_result, log_context);

  setTaskDataReply(a_reply, a_result, log_context);
}

void DatabaseAPI::taskInitRepoAllocationCreate(
    const Auth::RepoAllocationCreateRequest &a_request,
    Auth::TaskDataReply &a_reply, libjson::Value &a_result,
    LogContext log_context) {
  dbGet("repo/alloc/create",
        {{"subject", a_request.subject()},
         {"repo", a_request.repo()},
         {"data_limit", to_string(a_request.data_limit())},
         {"rec_limit", to_string(a_request.rec_limit())}},
        a_result, log_context);

  setTaskDataReply(a_reply, a_result, log_context);
}

void DatabaseAPI::taskInitRepoAllocationDelete(
    const Auth::RepoAllocationDeleteRequest &a_request,
    Auth::TaskDataReply &a_reply, libjson::Value &a_result,
    LogContext log_context) {
  dbGet("repo/alloc/delete",
        {{"subject", a_request.subject()}, {"repo", a_request.repo()}},
        a_result, log_context);

  setTaskDataReply(a_reply, a_result, log_context);
}

void DatabaseAPI::setTaskData(TaskData *a_task,
                              const libjson::Value &a_task_json,
                              LogContext log_context) {
  const Value::Object &obj = a_task_json.asObject();
  const Value::Object &state = obj.getObject("state");
  TaskType type = (TaskType)obj.getNumber("type");

  a_task->set_id(obj.getString("_id"));
  a_task->set_type(type);
  a_task->set_status((TaskStatus)obj.getNumber("status"));
  a_task->set_client(obj.getString("client"));
  int step = obj.getNumber("step");
  a_task->set_step(step < 0 ? -step : step);
  a_task->set_steps(obj.getNumber("steps"));
  a_task->set_msg(obj.getString("msg"));
  a_task->set_ct(obj.getNumber("ct"));
  a_task->set_ut(obj.getNumber("ut"));

  switch (type) {
  case TT_DATA_GET:
    DL_TRACE(log_context, "TT_DATA_GET");
    if (state.has("glob_data")) {
      const Value::Array &arr = state.asArray();
      string src = "";
      for (size_t i = 0; i < arr.size(); i++) {
        if (i > 0)
          src += ", ";

        src += arr[i].asObject().getString("id");
        if (i == 4) {
          src += ", ...";
          break;
        }
      }
      a_task->set_source(src);
    }
    a_task->set_dest(state.getString("path"));
    break;
  case TT_DATA_PUT:
    DL_TRACE(log_context, "TT_DATA_PUT");
    a_task->set_source(state.getString("path"));
    if (state.has("glob_data")) {
      const Value::Array &arr = state.asArray();
      a_task->set_dest(arr[0].asObject().getString("id"));
    }
    break;
  case TT_REC_CHG_ALLOC:
    DL_TRACE(log_context, "TT_REC_CHG_ALLOC");
    if (state.has("xfr")) {
      const Value::Array &arr = state.asArray();
      string src = "", repo;
      set<string> repos;

      for (size_t i = 0; i < arr.size(); i++) {
        repo = arr[i].asObject().getString("src_repo_id");
        if (repos.find(repo) == repos.end()) {
          if (src.size() > 0)
            src += ", ";

          repos.insert(repo);
          src += repo;

          if (repos.size() == 5) {
            src += ", ...";
            break;
          }
        }
      }

      a_task->set_source(src);
    }

    a_task->set_dest(state.getString("dst_repo_id"));
    break;
  case TT_REC_CHG_OWNER:
    DL_TRACE(log_context, "TT_REC_CHG_OWNER");
    if (state.has("glob_data")) {
      const Value::Array &arr = state.asArray();
      if (arr.size()) {
        a_task->set_source(arr[0].asObject().getString("owner"));
      }
    }
    a_task->set_dest(state.getString("owner_id") + ", " +
                     state.getString("dst_coll_id") + ", " +
                     state.getString("dst_repo_id"));
    break;
  default:
    break;
  }
}

/**
 * @brief Sets TaskDataReply from JSON returned by a taskInit... call
 * @param a_reply
 * @param a_result
 *
 * JSON contains an object with a "task" field containing task fields. This
 * method removes tasks that are nor in READY status from the original JSON
 * input - this is to.
 */
void DatabaseAPI::setTaskDataReply(Auth::TaskDataReply &a_reply,
                                   const libjson::Value &a_result,
                                   LogContext log_context) {
  TRANSLATE_BEGIN()

  const Value::Object &obj = a_result.asObject();

  if (obj.has("task"))
    setTaskData(a_reply.add_task(), obj.value(), log_context);

  TRANSLATE_END(a_result, log_context)
}

/**
 * @brief Sets TaskDataReply from JSON returned by a task management call
 * @param a_reply
 * @param a_result
 *
 * JSON contains an array of task objects containing task fields.
 */
void DatabaseAPI::setTaskDataReplyArray(Auth::TaskDataReply &a_reply,
                                        const libjson::Value &a_result,
                                        LogContext log_context) {
  TRANSLATE_BEGIN()

  const Value::Array &arr = a_result.asArray();
  for (Value::ArrayConstIter i = arr.begin(); i != arr.end(); i++) {
    setTaskData(a_reply.add_task(), *i, log_context);
  }

  TRANSLATE_END(a_result, log_context)
}

void DatabaseAPI::taskStart(const std::string &a_task_id,
                            libjson::Value &a_result, LogContext log_context) {
  dbGet("task/start", {{"task_id", a_task_id}}, a_result, log_context);
}

void DatabaseAPI::taskUpdate(const std::string &a_id, LogContext log_context,
                             TaskStatus *a_status, const std::string *a_message,
                             double *a_progress, libjson::Value *a_state) {
  if (!a_status && !a_progress && !a_state)
    return;

  nlohmann::json payload;

  if (a_status) {
    payload["status"] = to_string(*a_status);
  }

  if (a_message) {
    payload["message"] = *a_message;
  }

  if (a_progress) {
    payload["progress"] = to_string(*a_progress);
  }

  if (a_state) {
    payload["state"] = a_state->toString();
  }
  string body = payload.dump(-1, ' ', true);

  Value result;
  dbPost("task/update", {{"task_id", a_id}}, &body, result, log_context);
}

void DatabaseAPI::taskFinalize(const std::string &a_task_id, bool a_succeeded,
                               const std::string &a_msg,
                               libjson::Value &a_result,
                               LogContext log_context) {
  vector<pair<string, string>> params;
  params.push_back({"task_id", a_task_id});
  params.push_back({"succeeded", (a_succeeded ? "true" : "false")});
  if (a_msg.size())
    params.push_back({"message", a_msg});

  dbPost("task/finalize", params, 0, a_result, log_context);
}

void DatabaseAPI::taskList(const Auth::TaskListRequest &a_request,
                           Auth::TaskDataReply &a_reply,
                           LogContext log_context) {
  vector<pair<string, string>> params;

  if (a_request.has_since())
    params.push_back({"since", to_string(a_request.since())});
  if (a_request.has_from())
    params.push_back({"from", to_string(a_request.from())});
  if (a_request.has_to())
    params.push_back({"to", to_string(a_request.to())});
  if (a_request.has_offset())
    params.push_back({"offset", to_string(a_request.offset())});
  if (a_request.has_count())
    params.push_back({"count", to_string(a_request.count())});
  if (a_request.status_size() > 0) {
    string stat = "[";
    for (int i = 0; i < a_request.status_size(); ++i) {
      if (i > 0)
        stat += ",";
      stat += to_string(a_request.status(i));
    }
    stat += "]";
    params.push_back({"status", stat});
  }

  libjson::Value result;

  dbGet("task/list", params, result, log_context, false);

  setTaskDataReplyArray(a_reply, result, log_context);
}

void DatabaseAPI::taskView(const Auth::TaskViewRequest &a_request,
                           Auth::TaskDataReply &a_reply,
                           LogContext log_context) {
  libjson::Value result;

  dbGet("task/view", {{"task_id", a_request.task_id()}}, result, log_context);

  setTaskDataReplyArray(a_reply, result, log_context);
}

void DatabaseAPI::taskPurge(uint32_t a_age_sec, LogContext log_context) {
  libjson::Value result;

  dbGet("task/purge", {{"age_sec", to_string(a_age_sec)}}, result, log_context);
}

/* TODO: verify formatting
  old format:
      {
        timestamp: ..,
        total: ..,
        uids: {
          first_of_tuple[0]: {
            tot: second_of_tuple[0],
            msg: {
              second_of_tuple[0]_tuple_0: second_of_tuple[0]_tuple_1,
              second_of_tuple[1]_tuple_0: second_of_tuple[1]_tuple_1,
              ...
            }
          }
          first_of_tuple[1]: ...
        }
      }
    new format:
      {
        timestamp: ..,
        total: ..,
        uids: {
          first_of_tuple[0]: {
            tot: second_of_tuple[0],
            msg: {
              second_of_tuple[0]_tuple_0: second_of_tuple[0]_tuple_1,
              second_of_tuple[1]_tuple_0: second_of_tuple[1]_tuple_1,
            }
          }
        }
      }
  */

std::string DatabaseAPI::newJsonMetricParse(
    uint32_t a_timestamp, uint32_t a_total,
    const std::map<std::string, std::map<uint16_t, uint32_t>> &a_metrics) {
  map<string, std::map<uint16_t, uint32_t>>::const_iterator u;
  map<uint16_t, uint32_t>::const_iterator m;
  nlohmann::json payload;
  payload["timestamp"] = to_string(a_timestamp);
  payload["total"] = to_string(a_total);

  nlohmann::json uids;
  for (u = a_metrics.begin(); u != a_metrics.end(); ++u) {
    nlohmann::json uid_body;
    uid_body["tot"] = to_string(u->second.at(0));
    nlohmann::json uid_msg;
    for (m = u->second.begin(); m != u->second.end(); ++m) {
      if (m->first != 0) {
        uid_msg[to_string(m->first)] = to_string(m->second);
      }
    }
    uid_body["msg"] = uid_msg;

    uids[u->first] = uid_body;
  }

  payload["uids"] = uids;
  string body = payload.dump(-1, ' ', true);
  return body;
}

// TODO: verify and remove
std::string DatabaseAPI::oldJsonMetricParse(
    uint32_t a_timestamp, uint32_t a_total,
    const std::map<std::string, std::map<uint16_t, uint32_t>> &a_metrics) {
  map<string, std::map<uint16_t, uint32_t>>::const_iterator u;
  map<uint16_t, uint32_t>::const_iterator m;
  string body = "{\"timestamp\":" + to_string(a_timestamp) +
                ",\"total\":" + to_string(a_total) + ",\"uids\":{";
  bool c = false, cc;

  for (u = a_metrics.begin(); u != a_metrics.end(); ++u) {
    if (c)
      body += ",";
    else
      c = true;

    body += "\"" + u->first + "\":{\"tot\":" + to_string(u->second.at(0)) +
            ",\"msg\":{";

    for (cc = false, m = u->second.begin(); m != u->second.end(); ++m) {
      if (m->first != 0) {
        if (cc)
          body += ",";
        else
          cc = true;

        body += "\"" + to_string(m->first) + "\":" + to_string(m->second);
      }
    }
    body += "}}";
  }

  body += "}}";
  return body;
}

void DatabaseAPI::metricsUpdateMsgCounts(
    uint32_t a_timestamp, uint32_t a_total,
    const std::map<std::string, std::map<uint16_t, uint32_t>> &a_metrics,
    LogContext log_context) {

  string body;
  string new_body = newJsonMetricParse(a_timestamp, a_total, a_metrics);
  string old_body = oldJsonMetricParse(a_timestamp, a_total, a_metrics);

  if (new_body == old_body) {
    // on match use safer serialization
    body = new_body;
  } else {
    body = old_body;
    DL_WARNING(
        log_context,
        "Serialized metric bodies did not match, new serialization yielded:\n"
            << new_body << "\n old serialization yielded:\n"
            << old_body);
  }

  libjson::Value result;

  dbPost("metrics/msg_count/update", {}, &body, result, log_context);
}

void DatabaseAPI::metricsPurge(uint32_t a_timestamp, LogContext log_context) {
  libjson::Value result;

  dbPost("metrics/purge", {{"timestamp", to_string(a_timestamp)}}, 0, result,
         log_context);
}

uint32_t DatabaseAPI::parseSearchRequest(const Auth::SearchRequest &a_request,
                                         std::string &a_qry_begin,
                                         std::string &a_qry_end,
                                         std::string &a_qry_filter,
                                         std::string &a_params,
                                         LogContext log_context) {
  string view = (a_request.mode() == SM_DATA ? "dataview" : "collview");

  if (a_request.has_published() && a_request.published()) {
    a_qry_begin = string("for i in ") + view + " search i.public == true";
    if (a_request.has_owner()) {
      a_qry_begin += " and i.owner == @owner";
      a_params += ",\"owner\":\"" + a_request.owner() + "\"";
    }
  } else {
    a_qry_begin = string("for i in ") + view + " search i.owner == @owner";
    a_params += ",\"owner\":\"" +
                (a_request.has_owner() ? a_request.owner() : m_client_uid) +
                "\"";
  }

  if (a_request.has_text() > 0) {
    a_qry_begin += " and analyzer(" +
                   parseSearchTextPhrase(a_request.text(), "i") + ",'text_en')";
  }

  if (a_request.cat_tags_size() > 0) {
    a_qry_begin += " and @ctags all in i.cat_tags";

    a_params += ",\"ctags\":[";
    for (int i = 0; i < a_request.cat_tags_size(); ++i) {
      if (i > 0)
        a_params += ",";
      a_params += "\"" + a_request.cat_tags(i) + "\"";
    }
    a_params += "]";
  }

  if (a_request.tags_size() > 0) {
    a_qry_begin += " and @tags all in i.tags";

    a_params += ",\"tags\":[";
    for (int i = 0; i < a_request.tags_size(); ++i) {
      if (i > 0)
        a_params += ",";
      a_params += "\"" + a_request.tags(i) + "\"";
    }
    a_params += "]";
  }

  if (a_request.has_id()) {
    a_qry_begin += " and " + parseSearchIdAlias(a_request.id(), "i");
  }

  if (a_request.has_creator()) {
    a_qry_begin += " and i.creator == @creator";
    a_params += ",\"creator\":\"" + a_request.creator() + "\"";
  }

  if (a_request.has_from()) {
    a_qry_begin += " and i.ut >= @utfr";
    a_params += ",\"utfr\":" + to_string(a_request.from());
  }

  if (a_request.has_to()) {
    a_qry_begin += " and i.ut <= @utto";
    a_params += ",\"utto\":" + to_string(a_request.to());
  }

  // Data-only search options
  if (a_request.mode() == SM_DATA) {
    if (a_request.has_sch_id() > 0) {
      a_qry_begin += " and i.sch_id == @sch";
      a_params += ",\"sch_id\":\"" + a_request.sch_id() + "\"";
    }

    if (a_request.has_meta_err()) {
      a_qry_begin += " and i.md_err == true";
    }

    if (a_request.has_meta()) {
      a_qry_filter = parseSearchMetadata(a_request.meta(), log_context);
    }
  }

  if (a_request.coll_size() > 0) {
    a_params += ",\"cols\":[";
    for (int i = 0; i < a_request.coll_size(); i++) {
      if (i > 0)
        a_params += ",";
      a_params += "\"" + a_request.coll(i) + "\"";
    }
    a_params += "]";
  }

  bool sort_relevance = false;

  a_qry_end += " let name = (for j in u filter j._id == i.owner return "
               "concat(j.name_last,', ', j.name_first)) sort ";

  if (a_request.has_sort()) {
    switch (a_request.sort()) {
    case SORT_OWNER:
      a_qry_end += "i.name";
      break;
    case SORT_TIME_CREATE:
      a_qry_end += "i.ct";
      break;
    case SORT_TIME_UPDATE:
      a_qry_end += "i.ut";
      break;
    case SORT_RELEVANCE:
      if (a_request.has_text()) {
        a_qry_end += "BM25(i) DESC";
        sort_relevance = true;
      } else {
        a_qry_end += "i.title";
      }
      break;
    case SORT_TITLE:
    default:
      a_qry_end += "i.title";
      break;
    }

    if (a_request.has_sort_rev() && a_request.sort_rev() && !sort_relevance) {
      a_qry_end += " DESC";
    }
  } else {
    a_qry_end += " i.title";
  }

  a_qry_end += " limit @off,@cnt";

  uint32_t cnt = a_request.has_count() ? a_request.count() : 50,
           off = a_request.has_offset() ? a_request.offset() : 0;

  a_params += ",\"off\":" + to_string(off);
  a_params += ",\"cnt\":" + to_string(cnt);

  // Get rid of leading delimiter
  a_params[0] = ' ';

  a_qry_end +=
      string(" return distinct "
             "{_id:i._id,title:i.title,'desc':i['desc'],owner:i.owner,owner_"
             "name:name,alias:i.alias") +
      (a_request.mode() == SM_DATA ? ",size:i.size,md_err:i.md_err" : "") + "}";

  a_qry_begin = a_qry_begin;
  a_qry_end = a_qry_end;
  a_qry_filter = a_qry_filter;

  return cnt;
}

string DatabaseAPI::parseSearchTextPhrase(const string &a_phrase,
                                          const string &a_iter) {
  /* This function parses category logic (if present) around full-
  text queries. Text queries are typed into the text input and are
  simpler than advanced queries.Categories are title, description, and
  keywords. Categories may be specified just before query terms:

      title: fusion simulation keywords: -experiment

  If no categories are specified, all categories are searched and the
  default operator is OR for both categories and terms.

  If one or more categories are specified, the default operator for categories
  is AND but for terms it is still OR.

  Operator may be specified by prefixing category or term with:
      +   AND
      -   AND NOT

  There is no NOR operator since this would produce low-specificity queryies.

  If terms are included before a category is specified, these terms apply to
  all categories (as if they were copied as-is into each category phrase)

  Categories may only be specified once.

  Phrases are specified with single or double quotations.
  All punctuation is ignored.

  The order of categories and terms does not matter, they are grouped by
  operator in an expression such as:

      (term1 or term2 or term3) and term4 and term5 and not term6 and not
  term7 OR terms                        AND terms           NAND terms
  */
  static map<string, int> cat_map = {{"t:", 1},     {"title:", 1},
                                     {"d:", 2},     {"desc:", 2},
                                     {"descr:", 2}, {"description:", 2}};

  string separator1("");     // dont let quoted arguments escape themselves
  string separator2(" ");    // split on spaces
  string separator3("\"\'"); // let it have quoted arguments

  boost::escaped_list_separator<char> els(separator1, separator2, separator3);
  boost::tokenizer<boost::escaped_list_separator<char>> tok(a_phrase, els);

  string result;
  vector<string> title, desc;
  size_t pos;
  int op = 0;
  int ops[5] = {0, 0, 0, 0, 0};
  int cat = 7;
  int count_or = 0;
  int count_other = 0;
  string op_str, extra;

  map<string, int>::const_iterator c;

  for (boost::tokenizer<boost::escaped_list_separator<char>>::iterator t =
           tok.begin();
       t != tok.end(); ++t) {
    pos = (*t).find_first_of(':');
    if (pos != string::npos) {
      if (pos < (*t).size() - 1) {
        op_str = (*t).substr(0, pos + 1);
        extra = (*t).substr(pos + 1);
      } else {
        op_str = *t;
        extra.clear();
      }

      if (op_str[0] == '+') {
        c = cat_map.find(op_str.substr(1));
        op = 2; // AND
        count_other++;
      } else if (op_str[0] == '-') {
        c = cat_map.find(op_str.substr(1));
        op = 3; // NAND
        count_other++;
      } else {
        c = cat_map.find(op_str);
        op = 1; // OR
        count_or++;
      }

      if (c == cat_map.end())
        EXCEPT_PARAM(1, "Invalid query scope '" << op_str << "'");

      cat = c->second;

      if (ops[cat] != 0)
        EXCEPT_PARAM(1,
                     "Invalid query - categories may only be specified once.");

      ops[cat] = op;

      if (extra.size()) {
        if (cat & 1)
          title.push_back(extra);
        if (cat & 2)
          desc.push_back(extra);
      }
    } else {
      if (cat & 1)
        title.push_back(*t);
      if (cat & 2)
        desc.push_back(*t);
    }
  }

  // Apply default operator for unspecified categories, check for empty
  // categories
  if (ops[1] == 0) {
    if (title.size()) {
      ops[1] = 1;
      count_or++;
    }
  } else if (!title.size())
    EXCEPT(1, "Title category specified without search terms");

  if (ops[2] == 0) {
    if (desc.size()) {
      ops[2] = 1;
      count_or++;
    }
  } else if (!desc.size())
    EXCEPT(1, "Description category specified without search terms");

  // Build OR phrase
  if (count_or > 1 && count_other > 0)
    result += "(";

  if (ops[1] == 1)
    result += parseSearchTerms("title", title, a_iter);

  if (ops[2] == 1)
    result +=
        (result.size() ? " or " : "") + parseSearchTerms("desc", desc, a_iter);

  if (count_or > 1 && count_other > 0)
    result += ")";

  // Build AND phrase
  if (ops[1] == 2)
    result += (result.size() ? " and " : "") +
              parseSearchTerms("title", title, a_iter);

  if (ops[2] == 2)
    result +=
        (result.size() ? " and " : "") + parseSearchTerms("desc", desc, a_iter);

  // Build NAND phrase
  if (ops[1] == 3)
    result += (result.size() ? " and not (" : "not (") +
              parseSearchTerms("title", title, a_iter) + ")";

  if (ops[2] == 3)
    result += (result.size() ? " and not (" : "not (") +
              parseSearchTerms("desc", desc, a_iter) + ")";

  return result;
}

std::string
DatabaseAPI::parseSearchTerms(const std::string &a_key,
                              const std::vector<std::string> &a_terms,
                              const std::string &a_iter) {
  vector<string> and_terms;
  vector<string> nand_terms;
  vector<string> or_terms;

  for (vector<string>::const_iterator t = a_terms.begin(); t != a_terms.end();
       ++t) {
    switch ((*t)[0]) {
    case '+':
      and_terms.push_back((*t).substr(1));
      break;
    case '-':
      nand_terms.push_back((*t).substr(1));
      break;
    default:
      or_terms.push_back(*t);
      break;
    }
  }

  string result;
  vector<string>::iterator i;

  if (or_terms.size() > 1)
    result += "(";

  for (i = or_terms.begin(); i != or_terms.end(); ++i) {
    if (i != or_terms.begin())
      result += " or ";

    result += "phrase(" + a_iter + "['" + a_key + "'],'" + *i + "')";
  }

  if (or_terms.size() > 1)
    result += ")";

  for (i = and_terms.begin(); i != and_terms.end(); ++i) {
    if (result.size())
      result += " and ";

    result += "phrase(" + a_iter + "['" + a_key + "'],'" + *i + "')";
  }

  for (i = nand_terms.begin(); i != nand_terms.end(); ++i) {
    if (result.size())
      result += " and ";

    result += "not phrase(" + a_iter + "['" + a_key + "'],'" + *i + "')";
  }

  return "(" + result + ")";
}

std::string DatabaseAPI::parseSearchMetadata(const std::string &a_query,
                                             LogContext log_context,
                                             const std::string &a_iter) {
  // Process single and double quotes (treat everything inside as part of
  // string, until a non-escaped matching quote is found) Identify supported
  // functions as "xxx("  (allow spaces between function name and parenthesis)
  static set<string> terms = {"title", "desc",    "alias", "external",
                              "owner", "creator", "ct",    "ut",
                              "size",  "source",  "ext"};
  static set<string> funcs = {
      "abs", "acos", "asin", "atan", "atan2", "average", "avg", "ceil", "cos",
      "degrees", "exp", "exp2", "floor", "log", "log2", "log10", "max",
      "median", "min", "percentile", "pi", "pow", "radians", "round", "sin",
      "sqrt", "stddev_population", "stddev_sample", "sum", "tan",
      "variance_population", "variance_sample", "length", "lower", "upper",
      "distance", "is_in_polygon",
      // AQL Array functions
      "append", "contains_array", "count", "count_distinct", "count_unique",
      "first", "flatten", "interleave", "intersection", "jaccard", "last",
      "length", "minus", "nth", "outersection", "pop", "position", "push",
      "remove_nth", "replace_nth", "remove_value", "remove_values", "reverse",
      "shift", "slice", "sorted", "sorted_unique", "union", "union_distinct",
      "unique", "unshift"};

  static set<string> date_funcs = {"date_now", "date_timestamp"};
  static set<string> other = {"like", "true", "false", "null", "in"};
  static const char *deftmp = "=<>!~|&+-/*^()0123456789. ";
  static set<char> defchar(deftmp, deftmp + strlen(deftmp));

  struct Var {
    Var() : start(0), len(0) {}
    void reset() {
      start = 0;
      len = 0;
    }

    size_t start;
    size_t len;
  };

  enum ParseState {
    PS_DEFAULT = 0,
    PS_SINGLE_QUOTE,
    PS_DOUBLE_QUOTE,
    PS_TOKEN,
    PS_STOP
  };

  ParseState state = PS_DEFAULT;
  Var v;
  string result, tmp;
  char next_nws = 0;
  string::const_iterator c2;
  bool val_token, last_char = false;
  int back_cnt = 0; // Counts contiguous backslashes inside quoted strings

  for (string::const_iterator c = a_query.begin(); c != a_query.end(); ++c) {
    next_nws = 0;
    for (c2 = c + 1; c2 != a_query.end(); ++c2) {
      if (!isspace(*c2)) {
        next_nws = *c2;
        break;
      }
    }

    DL_DEBUG(log_context, "c[" << *c << "]");

    switch (state) {
    case PS_SINGLE_QUOTE: // Single quote (not escaped)
      // Must account for escaped quotes (\') and preceeding escaped
      // backslashes
      // (\\) For example: 'abc\'' - quote is escaped 'abc\\'' - backslash is
      // escaped, not quote 'abc\\\''  - backslash and quote are escaped
      // 'abc\\\\''  - two backslashes are escaped, and quote
      // The rule is: if the number of preceeding contiguous backslashes is
      // even, then the quote is NOT escaped This applies to double quotes in
      // the subsequent case as well

      if (*c == '\\') {
        back_cnt++;
      } else {
        // If this is NOT an escaped quote, go back to default state
        if (*c == '\'' && (back_cnt % 2 == 0)) {
          state = PS_DEFAULT;
        } else {
          back_cnt = 0;
        }
      }

      break;
    case PS_DOUBLE_QUOTE: // Double quote (not escaped)
      // See comments in PS_SINGLE_QUOTE case above
      if (*c == '\\') {
        back_cnt++;
      } else {
        // If this is NOT an escaped quote, go back to default state
        if (*c == '\"' && (back_cnt % 2 == 0)) {
          state = PS_DEFAULT;
        } else {
          back_cnt = 0;
        }
      }

      break;
    case PS_DEFAULT:  // Not quoted, not an identifier
      if (*c == '\'') // Start of single-quoted string
      {
        state = PS_SINGLE_QUOTE;
        back_cnt = 0;

        break;               // Avoid token processing
      } else if (*c == '\"') // Start of double-quoted string
      {
        state = PS_DOUBLE_QUOTE;
        back_cnt = 0;

        break; // Avoid token processing
      } else if (*c == '/' && (*(c + 1) == '/' ||
                               *(c + 1) == '*')) // Start of comment /* or //
      {
        EXCEPT(1, "In-line metadata expression comments are not permitted.");
      } else if (defchar.find(*c) !=
                 defchar.end()) // Check for other allowed characters
      {
        // Includes numeric values, operators, and parenthesis
        break;                 // Avoid token processing
      } else if (!isalpha(*c)) // Tokens must start with a-z, A-Z
      {
        EXCEPT(1, "Metadata expression contains invalid character(s).");
      }

      // Detected start of a token
      v.start = c - a_query.begin();
      v.len = 0;
      state = PS_TOKEN;
      // FALL-THROUGH to token processing
      [[gnu::fallthrough]];
    case PS_TOKEN: // Token
      // Tokens may only contain a-z, A-Z, 0-9, '.', and '_'
      // Tokens must start with a-z, A-Z

      val_token = isalnum(*c) || *c == '.' || *c == '_';
      last_char = ((c + 1) == a_query.end());

      if (!val_token || last_char) {
        if (!val_token) {
          tmp = a_query.substr(v.start, v.len);
          if (*c == '\'')
            state = PS_SINGLE_QUOTE;
          else if (*c == '\"')
            state = PS_DOUBLE_QUOTE;
          else
            state = PS_DEFAULT;
        } else {
          tmp = a_query.substr(v.start, v.len + 1);
          state = PS_STOP;
        }

        // Determine if identifier needs to be prefixed with iterator by
        // testing against allowed identifiers
        if (tmp == "desc") {
          result.append(a_iter);
          result.append("['desc']");
        } else if (other.find(tmp) != other.end() ||
                   (funcs.find(tmp) != funcs.end() &&
                    (*c == '(' || (isspace(*c) && next_nws == '('))))
          result.append(tmp);
        else if (date_funcs.find(tmp) != date_funcs.end() &&
                 (*c == '(' || (isspace(*c) && next_nws == '('))) {
          result.append("0.001*");
          result.append(tmp);
        } else if (tmp == "id") {
          result.append(a_iter);
          result.append("._id");
        } else if (terms.find(tmp) != terms.end()) {
          result.append(a_iter);
          result.append(".");
          result.append(tmp);
        } else {
          if (boost::iequals(tmp, "def")) {
            result.append("!= null");
          } else if (boost::iequals(tmp, "undef")) {
            result.append("== null");
          } else {
            result.append(a_iter);

            if (tmp == "md" || tmp.compare(0, 3, "md.") == 0)
              result.append(".");
            else
              result.append(".md.");
            result.append(tmp);
          }
        }

        v.reset();
      } else {
        v.len++;
      }
      break;
    default:
      break;
    }

    if (state == PS_STOP) {
      break;
    } else if (state == PS_DEFAULT) {
      result += *c;
    } else if (state != PS_TOKEN) {
      result += *c;
    }
  }

  if (state == PS_SINGLE_QUOTE || state == PS_DOUBLE_QUOTE) {
    EXCEPT(1, "Mismatched quotation marks in query");
  }
  DL_TRACE(log_context, result);
  return result;
}

std::string DatabaseAPI::parseSearchIdAlias(const std::string &a_query,
                                            const std::string &a_iter) {
  string val;
  val.resize(a_query.size());
  std::transform(a_query.begin(), a_query.end(), val.begin(), ::tolower);

  bool id_ok = true;
  bool alias_ok = true;
  size_t p;

  if ((p = val.find_first_of("/")) !=
      string::npos) // Aliases cannot contain "/"
  {
    if (p == 0 || (p == 1 && val[0] == 'd')) {
      // Minimum len of key (numbers) is 2
      if (val.size() >= p + 3) {
        for (string::const_iterator c = val.begin() + p + 1; c != val.end();
             ++c) {
          if (!isdigit(*c)) {
            id_ok = false;
            break;
          }
        }

        if (id_ok)
          return a_iter + "._id like 'd/" + val.substr(p + 1) + "%'";
      }
    }

    EXCEPT(1, "Invalid ID/Alias query value.");
  }

  for (string::const_iterator c = val.begin(); c != val.end(); ++c) {
    // ids (keys) are only digits
    // alias are alphanum plus "_-."
    if (!isdigit(*c)) {
      id_ok = false;
      if (!isalpha(*c) && *c != '_' && *c != '-' && *c != '.') {
        alias_ok = false;
        break;
      }
    }
  }

  if (id_ok && alias_ok)
    return string("(") + a_iter + "._id like '%" + val + "%' || " + a_iter +
           ".alias like '%" + val + "%')";
  else if (id_ok)
    return a_iter + "._id like '%" + val + "%'";
  else if (alias_ok)
    return a_iter + ".alias like '%" + val + "%'";
  else
    EXCEPT(1, "Invalid ID/Alias query value.");
}

} // namespace Core
} // namespace SDMS
