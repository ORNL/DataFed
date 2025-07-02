#define BOOST_TEST_MAIN

#define BOOST_TEST_MODULE keyEncryptionDecryption
#include <boost/filesystem.hpp>
#include <boost/test/unit_test.hpp>
//Local private includes
#include "../../include/common/CipherEngine.hpp"
#include "../../include/common/Util.hpp"
#include "../../include/common/DynaLog.hpp"

#include "common/libjson.hpp"

//Standard includes
#include <string.h>
#include <iostream>
#include <fstream>
#include <iomanip>
using namespace std;
using namespace SDMS;

BOOST_AUTO_TEST_SUITE(KeyEncryptionDecryptionTest)

BOOST_AUTO_TEST_CASE(testing_KeyGeneration)
{
    unsigned char token_key[SDMS::CipherEngine::KEY_LENGTH];
    unsigned char keyArray[SDMS::CipherEngine::KEY_LENGTH];
    unsigned char finalArray[SDMS::CipherEngine::KEY_LENGTH];
    CipherEngine::generateEncryptionKey(token_key);
    std::string fname = "datafed-token-key.txt";

    std::ofstream outf(fname, std::ios::binary);
    outf.write(reinterpret_cast<const char*>(token_key), SDMS::CipherEngine::KEY_LENGTH);
    outf.close();

    //Grabbing key
    std::ifstream keyFile("datafed-token-key.txt", std::ios::binary);

    keyFile.read(reinterpret_cast<char*>(keyArray),SDMS::CipherEngine::KEY_LENGTH);
    for (int lv = 0; lv < SDMS::CipherEngine::KEY_LENGTH; lv++)
    {
            finalArray[lv] = keyArray[lv];
    }
    BOOST_CHECK(sizeof(finalArray)==SDMS::CipherEngine::KEY_LENGTH);
}

BOOST_AUTO_TEST_CASE(test_EncryptionDecryption)
{
    LogContext log_context;
    unsigned char key[SDMS::CipherEngine::KEY_LENGTH];

    readFile("datafed-token-key.txt", SDMS::CipherEngine::KEY_LENGTH, key);

    //Instance only used for encrypting
    CipherEngine encryptCipher(key);

    //Sets struct CipherString: which contains cipherText, cipherIV, cipherPaddedLen
    //Mimicing a globus token
    const string msg = "1234567890yoDa56Bx5yobvJYEjdGr2YpGYJybE7x4Bq42pQ3zuXCb8YQyn0EqEB7vjPx3GlNlKwkEsMn1234567890";

    CipherEngine::CipherString encoded_encrypted_packet = encryptCipher.encrypt(msg,log_context);

    //Instance only used for decrypting (we dont want to use the encrypt instance as this is how the code is oriented from going in and coming out the database)
    CipherEngine decryptCipher(key);

    //START OF ENCRYPTION
    std::string unencrypted_msg;
    unencrypted_msg = decryptCipher.decrypt(encoded_encrypted_packet, log_context);
    BOOST_CHECK(msg.compare(unencrypted_msg) == 0);
}

BOOST_AUTO_TEST_CASE(test_EncryptionDecryption_KeyGen)
{

    LogContext log_context;
    unsigned char key[SDMS::CipherEngine::KEY_LENGTH];
    CipherEngine::generateEncryptionKey(key);

    //Instance only used for encrypting
    CipherEngine encryptCipher(key);
    //Sets struct CipherString: which contains cipherText, cipherIV, cipherPaddedLen
    //Mimicing a globus token
    const string msg = "1234567890yoDa56Bx5yobvJYEjdGr2YpGYJybE7x4Bq42pQ3zuXCb8YQyn0EqEB7vjPx3GlNlKwkEsMn1234567890";

    //Start of Encryption
    CipherEngine::CipherString encoded_encrypted_packet = encryptCipher.encrypt(msg,log_context);

    //Instance only used for decrypting (we dont want to use the encrypt instance as this is how the code is oriented from going in and coming out the database)
    CipherEngine decryptCipher(key);

    //START OF DECRYPTION
    std::string unencrypted_msg;
    unencrypted_msg = decryptCipher.decrypt(encoded_encrypted_packet, log_context);
    BOOST_CHECK(msg.compare(unencrypted_msg) == 0);
}

BOOST_AUTO_TEST_CASE(test_EncryptionDecryption_IVGen)
{
    LogContext log_context;
    unsigned char key[SDMS::CipherEngine::KEY_LENGTH];
    readFile("datafed-token-key.txt", SDMS::CipherEngine::KEY_LENGTH, key);

    //Instance only used for encrypting
    CipherEngine encryptCipher(key);

    //Sets struct CipherString: which contains cipherText, cipherIV, cipherPaddedLen
    //Mimicing a globus token
    const string msg = "1234567890yoDa56Bx5yobvJYEjdGr2YpGYJybE7x4Bq42pQ3zuXCb8YQyn0EqEB7vjPx3GlNlKwkEsMn1234567890";

    unsigned char iv[SDMS::CipherEngine::IV_LENGTH] = {};
    CipherEngine::generateIV(iv);

    //Start of Encryption
    CipherEngine::CipherString encoded_encrypted_packet = encryptCipher.encrypt(iv, msg, log_context);

     //Instance only used for decrypting (we dont want to use the encrypt instance as this is how the code is oriented from going in and coming out the database)
    CipherEngine decryptCipher(key);

    //START OF DECRYPTION
    std::string unencrypted_msg;
    unencrypted_msg = decryptCipher.decrypt(encoded_encrypted_packet, log_context);
    BOOST_CHECK(msg.compare(unencrypted_msg) == 0);
}



BOOST_AUTO_TEST_CASE(test_EncryptionDecryptionJSONValue)
{

    LogContext log_context;
    unsigned char key[SDMS::CipherEngine::KEY_LENGTH];
    readFile("datafed-token-key.txt", SDMS::CipherEngine::KEY_LENGTH, key);

    //Instance only used for encrypting
    CipherEngine testCipher(key);

    //Sets struct CipherString: which contains cipherText, cipherIV, cipherPaddedLen
    //Mimicing a globus token
    const string msg = "1234567890yoDa56Bx5yobvJYEjdGr2YpGYJybE7x4Bq42pQ3zuXCb8YQyn0EqEB7vjPx3GlNlKwkEsMn1234567890";

    //Start of Encryption
    CipherEngine::CipherString encoded_encrypted_packet = testCipher.encrypt(msg, log_context);

    libjson::Value value;
    std::string json_document = std::string("{ \"access\": \"") + std::string(encoded_encrypted_packet.encrypted_msg.get()) + "\", \"access_len\": 96, \"access_iv\": \"" + std::string(encoded_encrypted_packet.iv.get()) + "\"}";

    value.fromString(json_document);
    libjson::Value::Object &obj = value.asObject();

    //Start of Decryption
    CipherEngine testCipher2(key);
    CipherEngine::CipherString encoded_access_obj;
    encoded_access_obj.encrypted_msg_len = obj.getNumber("access_len");
    encoded_access_obj.encrypted_msg = std::make_unique<char[]>(SDMS::CipherEngine::MAX_MSG_LENGTH + 1); // add 1 for null terminator

    std::string access = obj.getString("access");
    memcpy(encoded_access_obj.encrypted_msg.get(), access.c_str(), SDMS::CipherEngine::MAX_MSG_LENGTH);
    encoded_access_obj.encrypted_msg[SDMS::CipherEngine::MAX_MSG_LENGTH] = '\0'; // null terminate

    // Do the same for IV
    std::string access_iv = obj.getString("access_iv");
    encoded_access_obj.iv = std::make_unique<char[]>(SDMS::CipherEngine::ENCODED_IV_LENGTH + 1);
    memcpy(encoded_access_obj.iv.get(), access_iv.c_str(), SDMS::CipherEngine::ENCODED_IV_LENGTH);
    encoded_access_obj.iv[SDMS::CipherEngine::ENCODED_IV_LENGTH] = '\0';

    std::string unencrypted_msg;
    unencrypted_msg = testCipher.decrypt(encoded_access_obj, log_context);
    BOOST_CHECK(msg.compare(unencrypted_msg) == 0);
}

BOOST_AUTO_TEST_SUITE_END()
