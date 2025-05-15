#define BOOST_TEST_MAIN

#define BOOST_TEST_MODULE keyEncryptionDecryption
#include <boost/filesystem.hpp>
#include <boost/test/unit_test.hpp>
//Local private includes
#include "../../include/common/CipherEngine.hpp"
#include "../../include/common/Util.hpp"

#include "common/libjson.hpp"

//Standard includes
#include <string.h>
#include <iostream>
#include <fstream>

using namespace std;
using namespace SDMS;

BOOST_AUTO_TEST_SUITE(KeyEncryptionDecryptionTest)

BOOST_AUTO_TEST_CASE(test_EncryptionDecryption)
{

    std::cout << "THIS IS A NEW FLAG" << std::endl;
    unsigned char key[32];
    //CipherEngine::generateEncryptionKey(key);
    readFile("../../build/core/server/datafed-token-key.txt", 32, key);
    
    //Construct
    CipherEngine encryptCipher(key);

    //Sets struct CipherString: which contains cipherText, cipherIV, cipherPaddedLen
    string msg = "1234567890yoDa56Bx5yobvJYEjdGr2YpGYJybE7x4Bq42pQ3zuXCb8YQyn0EqEB7vjPx3GlNlKwkEsMn1234567890";

    //string msg = "Hello World";
    //CipherEngine::generateIV(iv);

    //Here if parties would like to use their own IV GENERATOR
    //CipherEngine::CipherString returnObj = testCipher.encrypt(iv, msg);
    
    CipherEngine::CipherString returnObj2 = encryptCipher.encrypt(msg);
 
/*
    std::cout << "Rough Test1:" << encrypted_access_string << std::endl; 
    std::string testString;

    std::memcpy(returnObj2.encrypted_msg, testString.c_str(), returnObj2.encrypted_msg_len);
    std::cout << "Rough Test2:" << testString << std::endl;    
*/
    std::cout << "Encrypted Message:\n" << returnObj2.encrypted_msg.get() << std::endl;
    std::cout << "IV:\n" << returnObj2.iv.get() << std::endl;    
    std::cout << "Encrypted Message Len:\n" << returnObj2.encrypted_msg_len << std::endl;


    //WRITE CODE TO MOCK PUTTING IT IN A DB




    CipherEngine decryptCipher(key);

    //START OF ENCRYPTION
    std::string unencrypted_msg;
    unencrypted_msg = decryptCipher.decrypt(returnObj2); 
    std::cout << "Unencrypted Message:" << unencrypted_msg << std::endl;
    BOOST_CHECK(msg.compare(unencrypted_msg) == 0);
}


BOOST_AUTO_TEST_CASE(test_EncryptionDecryptionJSONValue)
{

    std::cout << "THIS IS A NEW FLAG" << std::endl;
    unsigned char key[32];
    //CipherEngine::generateEncryptionKey(key);
    readFile("../../build/core/server/datafed-token-key.txt", 32, key);
    
    //Construct
    CipherEngine testCipher(key);

    //Sets struct CipherString: which contains cipherText, cipherIV, cipherPaddedLen
    string msg = "1234567890yoDa56Bx5yobvJYEjdGr2YpGYJybE7x4Bq42pQ3zuXCb8YQyn0EqEB7vjPx3GlNlKwkEsMn1234567890";

    //string msg = "Hello World";
    //CipherEngine::generateIV(iv);

    //Here if parties would like to use their own IV GENERATOR
    //CipherEngine::CipherString returnObj = testCipher.encrypt(iv, msg);
    
    CipherEngine::CipherString returnObj2 = testCipher.encrypt(msg);
 
    std::cout << "Encrypted Message:\n" << returnObj2.encrypted_msg.get() << std::endl;
    std::cout << "IV:\n" << returnObj2.iv.get() << std::endl;    
    std::cout << "Encrypted Message Len:\n" << returnObj2.encrypted_msg_len << std::endl;

    libjson::Value value;
    std::string json_document = std::string("{ \"access\": \"") + std::string(returnObj2.encrypted_msg.get()) + "\", \"access_len\": 96, \"access_iv\": \"" + std::string(returnObj2.iv.get()) + "\"}";

    value.fromString(json_document);
    libjson::Value::Object &obj = value.asObject();
    //START OF ENCRYPTION
    //
    //
    CipherEngine testCipher2(key);
    CipherEngine::CipherString encoded_access_obj = testCipher2.createCipherString();
    encoded_access_obj.encrypted_msg_len = obj.getNumber("access_len");
    encoded_access_obj.encrypted_msg = std::make_unique<char[]>(129); // add 1 for null terminator

    std::string access = obj.getString("access");
    memcpy(encoded_access_obj.encrypted_msg.get(), access.c_str(), 128);
    encoded_access_obj.encrypted_msg[128] = '\0'; // null terminate
  
  // Do the same for IV
    std::string access_iv = obj.getString("access_iv");
    encoded_access_obj.iv = std::make_unique<char[]>(25);
    memcpy(encoded_access_obj.iv.get(), access_iv.c_str(), 24);
    encoded_access_obj.iv[24] = '\0';

    std::string unencrypted_msg;
    unencrypted_msg = testCipher.decrypt(encoded_access_obj); 
    std::cout << "Unencrypted Message:" << unencrypted_msg << std::endl;
    BOOST_CHECK(msg.compare(unencrypted_msg) == 0);
}

BOOST_AUTO_TEST_CASE(testing_KeyGeneration)
{
    unsigned char token_key[32];
    unsigned char keyArray[32];
    unsigned char finalArray[32];
    CipherEngine::generateEncryptionKey(token_key);

    std::string fname = "datafed-token-key.txt";
    //std::ofstream  outf(fname.c_str());   
    //outf << token_key;
    
    std::ofstream outf(fname, std::ios::binary);
    outf.write(reinterpret_cast<const char*>(token_key), 32);
    outf.close();

    //Grabbing key
    std::ifstream keyFile("datafed-token-key.txt", std::ios::binary);

    keyFile.read(reinterpret_cast<char*>(keyArray),32);
    for (int lv = 0; lv < 32; lv++)
    {
            finalArray[lv] = keyArray[lv];
    } 
    BOOST_CHECK(sizeof(finalArray)==32);
}
BOOST_AUTO_TEST_SUITE_END()  
