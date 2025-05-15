#define BOOST_TEST_MAIN

#define BOOST_TEST_MODULE taskworker
#include <boost/filesystem.hpp>
#include <boost/test/unit_test.hpp>
// Local private includes
#include "TaskWorker.hpp"
#include "Config.hpp"
#include "ITaskMgr.hpp"

// Common public includes
#include "common/CipherEngine.hpp"
#include "DatabaseAPI.hpp"
#include "common/DynaLog.hpp"

// Standard includes
#include "common/TraceException.hpp"
#include "unistd.h"
#include <memory>
#include <sstream>

using namespace SDMS::Core;

class TaskWorkerTestAccess : public TaskWorker {
public:
    static bool tokenNeedsUpdate(const libjson::Value::Object &obj) {
        return TaskWorker::tokenNeedsUpdate(obj);
    }

    static std::string prepToken(const libjson::Value::Object &obj, const std::string &token, bool needs_update, SDMS::LogContext log_context) {
        return TaskWorker::prepToken(obj, token, needs_update, log_context);
    }

};
struct GlobalProtobufTeardown {
    ~GlobalProtobufTeardown() {
        // This is the teardown function that runs once at the end
        google::protobuf::ShutdownProtobufLibrary();
    }
};

// Declare a global fixture instance
BOOST_GLOBAL_FIXTURE(GlobalProtobufTeardown);




BOOST_AUTO_TEST_SUITE(TaskWorkerTest)

BOOST_AUTO_TEST_CASE(testing_unencrypted_token)
{
    SDMS::LogContext log_context;
    bool needs_update = false;

    //setting up test params
    libjson::Value test_params;

    test_params.fromString("{\"acc_tok\":\"V4X1XamiOcgmJQQYJn6f00UNFxiPFVsltndKamXuQ15HkbcGAXS1EXReSCKcU+7IubXcblajGRKsvsmBIeg2npLbNFCjRukffbgpfIvXW1ofHRORLhs7JVKRSh/SA1uI\",\"acc_tok_iv\":\"BU6pwgToglmdI4W/eIVaiQ==\",\"acc_tok_len\":96}");
    const libjson::Value::Object &obj = test_params.asObject();


    needs_update = TaskWorkerTestAccess::tokenNeedsUpdate(obj);
    std::string acc_tok = TaskWorkerTestAccess::prepToken(obj, "acc_tok", needs_update, log_context);

    BOOST_CHECK(acc_tok == "1234567890yoDa56Bx5yobvJYEjdGr2YpGYJybE7x4Bq42pQ3zuXCb8YQyn0EqEB7vjPx3GlNlKwkEsMn1234567890");
}

BOOST_AUTO_TEST_CASE(testing_encrypted_token)
{
    SDMS::LogContext log_context;
    bool needs_update = false;

    //setting up test params
    libjson::Value test_params;
    test_params.fromString("{\"acc_tok\":\"unencrypted\",\"acc_tok_iv\":\"\",\"acc_tok_len\":0}");
    const libjson::Value::Object &obj = test_params.asObject();


    needs_update = TaskWorkerTestAccess::tokenNeedsUpdate(obj);
    std::string acc_tok = TaskWorkerTestAccess::prepToken(obj, "acc_tok", needs_update, log_context);


    BOOST_CHECK(needs_update == true);

}

BOOST_AUTO_TEST_SUITE_END()
