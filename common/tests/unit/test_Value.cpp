#define BOOST_TEST_MAIN

#define BOOST_TEST_MODULE libjson
#include <boost/filesystem.hpp>
#include <boost/test/unit_test.hpp>

// Local public includes
#include "common/DynaLog.hpp"
#include "common/TraceException.hpp"
#include "common/libjson.hpp"

// Standard includes
#include <iostream>
#include <string>

// using namespace SDMS;

BOOST_AUTO_TEST_SUITE(LibJSONTest)

BOOST_AUTO_TEST_CASE(testing_object) {

  std::string raw_result = "{\n";
  raw_result += "  \"DATA\": [],\n";
  raw_result += "  \"DATA_TYPE\": \"endpoint\",\n";
  raw_result += "  \"acl_available\": true,\n";
  raw_result += "  \"acl_editable\": false,\n";
  raw_result += "  \"activated\": false,\n";
  raw_result += "  \"authentication_assurance_timeout\": null,\n";
  raw_result += "  \"authentication_policy_id\": null,\n";
  raw_result += "  \"authentication_timeout_mins\": null,\n";
  raw_result += "  \"canonical_name\": "
                "\"u_t2uyxwqjgvapzmwlfahbi5l4mq#11bc8bd6-6b22-11eb-8287-"
                "0275e0cda761\",\n";
  raw_result += "  \"contact_email\": \"researchcomputing@mara.edu\",\n";
  raw_result += "  \"contact_info\": null,\n";
  raw_result += "  \"default_directory\": \"/{server_default}/\",\n";
  raw_result += "  \"department\": \"Research Computing\",\n";
  raw_result += "  \"description\": \"Library Published Data\",\n";
  raw_result += "  \"disable_anonymous_writes\": false,\n";
  raw_result += "  \"disable_verify\": false,\n";
  raw_result += "  \"display_name\": \"New Anonymous Endpoint\",\n";
  raw_result += "  \"entity_type\": \"GCSv5_guest_collection\",\n";
  raw_result += "  \"expire_time\": null,\n";
  raw_result += "  \"expires_in\": -1,\n";
  raw_result += "  \"force_encryption\": false,\n";
  raw_result += "  \"force_verify\": false,\n";
  raw_result += "  \"french_english_bilingual\": false,\n";
  raw_result += "  \"gcp_connected\": null,\n";
  raw_result += "  \"gcp_paused\": null,\n";
  raw_result +=
      "  \"gcs_manager_url\": \"https://e878b.bd7c.data.globus.org\",\n";
  raw_result += "  \"gcs_version\": \"5.4.67\",\n";
  raw_result += "  \"globus_connect_setup_key\": null,\n";
  raw_result += "  \"high_assurance\": false,\n";
  raw_result += "  \"host_endpoint\": "
                "\"u_t2uyxwqjglapzmwbfahbi5l4mq#3b3f5c6c-5b6a-11eb-87bf-"
                "02187389bd35\",\n";
  raw_result += "  \"host_endpoint_display_name\": \"net01\",\n";
  raw_result +=
      "  \"host_endpoint_id\": \"9ea98bda-0135-40fc-b2c1-280e14757c64\",\n";
  raw_result += "  \"host_path\": null,\n";
  raw_result +=
      "  \"https_server\": \"https://g-f09197.e778b.bd7c.data.globus.org\",\n";
  raw_result += "  \"id\": \"e1d2afd2-ce11-4482-b127-b4cceef666f6\",\n";
  raw_result += "  \"in_use\": false,\n";
  raw_result += "  \"info_link\": null,\n";
  raw_result += "  \"is_globus_connect\": false,\n";
  raw_result += "  \"is_go_storage\": false,\n";
  raw_result += "  \"keywords\": \"Uni,State,Top\",\n";
  raw_result += "  \"last_accessed_time\": \"2023-10-23T00:00:00+00:00\",\n";
  raw_result += "  \"local_user_info_available\": true,\n";
  raw_result += "  \"location\": null,\n";
  raw_result +=
      "  \"mapped_collection_display_name\": \"New Published Data\",\n";
  raw_result +=
      "  \"mapped_collection_id\": \"5b52029b-9a3e-4490-abcf-649dd2f4fd6c\",\n";
  raw_result += "  \"max_concurrency\": null,\n";
  raw_result += "  \"max_parallelism\": null,\n";
  raw_result += "  \"mfa_required\": false,\n";
  raw_result += "  \"my_effective_roles\": [],\n";
  raw_result += "  \"myproxy_dn\": null,\n";
  raw_result += "  \"myproxy_server\": \"myproxy.globusonline.org\",\n";
  raw_result += "  \"name\": \"11bc8bd6-6b22-11eb-8287-0275e0cda761\",\n";
  raw_result += "  \"network_use\": null,\n";
  raw_result += "  \"non_functional\": false,\n";
  raw_result += "  \"non_functional_endpoint_display_name\": \"net01\",\n";
  raw_result += "  \"non_functional_endpoint_id\": "
                "\"9ea98bda-0935-40fc-b2c1-280e14757c64\",\n";
  raw_result += "  \"oauth_server\": null,\n";
  raw_result += "  \"organization\": \"The new University\",\n";
  raw_result += "  \"owner_id\": \"9ea98bda-0935-40fc-b2c1-280e14757c64\",\n";
  raw_result +=
      "  \"owner_string\": "
      "\"9ea98bda-0935-40fc-b2c1-210e14757c64@clients.auth.globus.org\",\n";
  raw_result += "  \"preferred_concurrency\": null,\n";
  raw_result += "  \"preferred_parallelism\": null,\n";
  raw_result += "  \"public\": true,\n";
  raw_result += "  \"requester_pays\": false,\n";
  raw_result += "  \"s3_owner_activated\": false,\n";
  raw_result += "  \"s3_url\": null,\n";
  raw_result += "  \"shareable\": false,\n";
  raw_result += "  \"sharing_target_endpoint\": "
                "\"u_t2uyxw0jgkapzmwbfahbi5l4mq#3b3f5c6c-5b6a-11eb-87bf-"
                "02187389bd35\",\n";
  raw_result += "  \"sharing_target_root_path\": null,\n";
  raw_result += "  \"storage_type\": null,\n";
  raw_result +=
      "  \"subscription_id\": \"3ba26681-e247-11e6-9d43-22000a1e3b52\",\n";
  raw_result += "  \"tlsftp_server\": "
                "\"tlsftp://g-f09277.e778b.bd7c.data.globus.org:443\",\n";
  raw_result += "  \"user_message\": null,\n";
  raw_result += "  \"user_message_link\": null,\n";
  raw_result += "  \"username\": \"u_t2uyxwqjgvapzmwbfbhbi5l4mq\"\n";
  raw_result += "}";

  std::cout << "raw result" << std::endl;
  // std::cout << raw_result << std::endl;
  SDMS::global_logger.setSysLog(false);
  SDMS::global_logger.addStream(std::cerr);
  SDMS::global_logger.setLevel(SDMS::LogLevel::DEBUG);
  SDMS::LogContext log_context;
  DL_DEBUG(log_context, raw_result);

  libjson::Value result;
  result.fromString(raw_result);
  std::cout << "Type of value: " << result.getTypeString() << std::endl;
  libjson::Value::Object &resp_obj = result.asObject();

  libjson::Value::Array &data = resp_obj.getArray("DATA");

  BOOST_CHECK(data.size() == 0);
}

BOOST_AUTO_TEST_SUITE_END()
