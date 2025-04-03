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
    

    std::cout << string(reinterpret_cast<const char*>(returnObj2.encrypted_msg),returnObj2.encrypted_msg_len) << std::endl;
    std::cout << string(reinterpret_cast<const char*>(returnObj2.iv),16) << std::endl;
    std::cout << returnObj2.encrypted_msg_len << std::endl;



    //START OF ENCRYPTION
    std::string unencrypted_msg;
    
    unencrypted_msg = testCipher.decrypt(returnObj2.encrypted_msg, returnObj2.encrypted_msg_len, returnObj2.iv);
    
    std::cout << unencrypted_msg << std::endl;

}

BOOST_AUTO_TEST_SUITE_END()










 
/*    
BOOST_AUTO_TEST_CASE(testing_EncryptionDecryption)
{
    unsigned char token_key[32];
    unsigned char iv[16];
    unsigned char ciphertext[128];
    int ciphertext_len;

    //generate the encryption/decryption key 
    generateEncryptionKey(token_key); 
    std::cout << "Token Key:" << token_key << std::endl;

    //generate the IV
    generateIV(iv);
    std::cout << "IV:" << iv << std::endl;
    
    //creating custom  message
    unsigned char *originalMsg = (unsigned char *)"This is a test, beware"; 
    std::cout << "Message:" << originalMsg << std::endl;
    
    //Encrypting the message and setting ciphertext_len
    ciphertext_len = encrypt(originalMsg, strlen((char *)originalMsg), token_key, iv, ciphertext);
    std::cout << "Cipher Text:" << ciphertext << std::endl;
    
    //Decrypting
    unsigned char decryptedtext[128];
    int decryptedtext_len;

    decryptedtext_len = decrypt(ciphertext, ciphertext_len, token_key, iv, decryptedtext);

    // Add a NULL terminator. We are expecting printable text
    decryptedtext[decryptedtext_len] = '\0';
    std::cout << "Decrypted Message:" << decryptedtext << std::endl;

    BOOST_CHECK(memcmp(decryptedtext,originalMsg, sizeof(decryptedtext)));

}
*/   
