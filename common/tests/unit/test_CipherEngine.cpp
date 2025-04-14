#define BOOST_TEST_MAIN

#define BOOST_TEST_MODULE keyEncryptionDecryption
#include <boost/filesystem.hpp>
#include <boost/test/unit_test.hpp>
//Local private includes
#include "../../include/common/CipherEngine.hpp"
#include "../../include/common/Util.hpp"

//Standard includes
#include <string.h>
#include <iostream>
#include <fstream>

using namespace std;
using namespace SDMS;

BOOST_AUTO_TEST_SUITE(KeyEncryptionDecryptionTest)

BOOST_AUTO_TEST_CASE(test_EncryptionDecryption)
{

    unsigned char key[32];
    generateEncryptionKey(key);

    //Construct
    CipherEngine testCipher(key);

    //Sets struct CipherString: which contains cipherText, cipherIV, cipherPaddedLen
    unsigned char iv[16];

    string msg = "Hello World";

    CipherEngine::generateIV(iv);

    //Here if parties would like to use their own IV GENERATOR
    CipherEngine::CipherString returnObj = testCipher.encrypt(iv, msg);
    
    CipherEngine::CipherString returnObj2 = testCipher.encrypt(msg);
 
    string encrypted_access_string(reinterpret_cast<char const*>(returnObj2.encrypted_msg), returnObj2.encrypted_msg_len);

/*
    std::cout << "Rough Test1:" << encrypted_access_string << std::endl; 
    std::string testString;

    std::memcpy(returnObj2.encrypted_msg, testString.c_str(), returnObj2.encrypted_msg_len);
    std::cout << "Rough Test2:" << testString << std::endl;    
*/
    std::cout << "Encrypted Message:" << string(reinterpret_cast<const char*>(returnObj2.encrypted_msg),returnObj2.encrypted_msg_len) << std::endl;
    std::cout << "IV:" << string(reinterpret_cast<const char*>(returnObj2.iv),16) << std::endl;    
    std::cout << "Encrypted Message Len:" << returnObj2.encrypted_msg_len << std::endl;

    //START OF ENCRYPTION
    std::string unencrypted_msg;
    unencrypted_msg = testCipher.decrypt(returnObj2.encrypted_msg, returnObj2.encrypted_msg_len, returnObj2.iv); 
    std::cout << "Unencrypted Message:" << unencrypted_msg << std::endl;

}

BOOST_AUTO_TEST_SUITE_END()  
