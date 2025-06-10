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
#include "common/Util.hpp"


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

    static std::string prepToken(const libjson::Value::Object &obj, const std::string &token, const std::string &cipher_key_path, bool needs_update, SDMS::LogContext log_context) {
        return TaskWorker::prepToken(obj, token, cipher_key_path, needs_update, log_context);
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

BOOST_AUTO_TEST_CASE(testing_encrypted_token)
{
    SDMS::LogContext log_context;
    bool needs_update = false;

    
    unsigned char token_key[SDMS::CipherEngine::KEY_LENGTH];
    unsigned char key[SDMS::CipherEngine::KEY_LENGTH];
    
    //Generate key
    SDMS::CipherEngine::generateEncryptionKey(token_key);


    std::string fname = "datafed-token-key.txt";
    
    //Create key file
    std::ofstream outf(fname, std::ios::binary);
    outf.write(reinterpret_cast<const char*>(token_key), SDMS::CipherEngine::KEY_LENGTH);
    outf.close();

    //Grabbing key
    readFile("datafed-token-key.txt", SDMS::CipherEngine::KEY_LENGTH, key);


    //setting up test params
    libjson::Value test_params;
    std::string cipher_key_path = "";
    std::string test_token = "1234567890yoDa56Bx5yobvJYEjdGr2YpGYJybE7x4Bq42pQ3zuXCb8YQyn0EqEB7vjPx3GlNlKwkEsMn1234567890";
    SDMS::CipherEngine testCipher(key);
    
    SDMS::CipherEngine::CipherString returnObj = testCipher.encrypt(test_token, log_context);

    test_params.fromString("{\"acc_tok\":\"" + std::string(returnObj.encrypted_msg.get()) + "\",\"acc_tok_iv\":\"" + std::string(returnObj.iv.get()) + "\",\"acc_tok_len\":96}");
    const libjson::Value::Object &obj = test_params.asObject();

    needs_update = TaskWorkerTestAccess::tokenNeedsUpdate(obj);
    std::string acc_tok = TaskWorkerTestAccess::prepToken(obj, "acc_tok", cipher_key_path, needs_update, log_context);

    BOOST_CHECK(acc_tok == "1234567890yoDa56Bx5yobvJYEjdGr2YpGYJybE7x4Bq42pQ3zuXCb8YQyn0EqEB7vjPx3GlNlKwkEsMn1234567890" && needs_update ==false);
}

BOOST_AUTO_TEST_CASE(testing_unencrypted_token)
{
    SDMS::LogContext log_context;
    bool needs_update = false;

    //setting up test params
    libjson::Value test_params;
    test_params.fromString("{\"acc_tok\":\"unencrypted\",\"acc_tok_iv\":\"\",\"acc_tok_len\":0}");
    const libjson::Value::Object &obj = test_params.asObject();
    std::string cipher_key_path = "";

    needs_update = TaskWorkerTestAccess::tokenNeedsUpdate(obj);
    std::string acc_tok = TaskWorkerTestAccess::prepToken(obj, "acc_tok", cipher_key_path, needs_update, log_context);


    BOOST_CHECK(needs_update == true);

}
BOOST_AUTO_TEST_SUITE_END()
