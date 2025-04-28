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

    std::cout << "THIS IS A NEW FLAG" << std::endl;
    unsigned char key[32];
    //CipherEngine::generateEncryptionKey(key);
    readFile("../../build/core/server/datafed-token-key.txt", 32, key);
    
    //Construct
    CipherEngine testCipher(key);

    //Sets struct CipherString: which contains cipherText, cipherIV, cipherPaddedLen
    unsigned char iv[16];

    string msg = "AgdzegjlPyyoDa56Bx5yobvJYEjdGr2YpGYJybE7x4Bq42pQ3zuXCb8YQyn0EqEB7vjPx3GlNlKwkEsMnNokqfxq926";
    //string msg = "Hello World";
    //CipherEngine::generateIV(iv);

    //Here if parties would like to use their own IV GENERATOR
    //CipherEngine::CipherString returnObj = testCipher.encrypt(iv, msg);
    
    CipherEngine::CipherString returnObj2 = testCipher.encrypt(msg);
 
/*
    std::cout << "Rough Test1:" << encrypted_access_string << std::endl; 
    std::string testString;

    std::memcpy(returnObj2.encrypted_msg, testString.c_str(), returnObj2.encrypted_msg_len);
    std::cout << "Rough Test2:" << testString << std::endl;    
*/
    std::cout << "Encrypted Message:\n" << returnObj2.encrypted_msg << std::endl;
    std::cout << "IV:\n" << returnObj2.iv << std::endl;    
    std::cout << "Encrypted Message Len:\n" << returnObj2.encrypted_msg_len << std::endl;

    //START OF ENCRYPTION
    std::string unencrypted_msg;
    unencrypted_msg = testCipher.decrypt(returnObj2); 
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
    std::ofstream  outf(fname.c_str());   
    outf << token_key;
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
