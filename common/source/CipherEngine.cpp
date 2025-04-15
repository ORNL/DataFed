//Local Include
#include "common/CipherEngine.hpp"

// Third party includes
#include <openssl/conf.h>
#include <openssl/evp.h>
#include <openssl/rand.h>
#include <openssl/err.h>

// Standard includes
#include <iostream>
#include <memory>
#include <string.h>
#include <string>
#include <vector>
#include <fstream>

using namespace std;
namespace SDMS{

    void CipherEngine::handleErrors(void)
    {
        ERR_print_errors_fp(stderr);
        abort();
    }
    
    void CipherEngine::generateIV(unsigned char *iv)
    {
        if (RAND_bytes(iv, 16) != 1)
        {
            handleErrors();
        }
    }

    // Constructor to set the encryption key
    CipherEngine::CipherEngine(const unsigned char* inputKey)
    {
        memcpy(key, inputKey, 32);
    } 


    void CipherEngine::generateEncryptionKey(unsigned char token_key[32])
    { 
        if (RAND_bytes(token_key, 32) != 1)
        {
            handleErrors();
        }
    }


    CipherEngine::CipherString CipherEngine::encrypt_algorithm(unsigned char *iv, const string& msg)
    {
        //SET PLAINTEXT TO something related to unsigned char*
        EVP_CIPHER_CTX *ctx;
        CipherString result;
        int len;   
        
        //setting IV for the resulting obj:
        for(int i = 0; i < 16; i++)
        {
            result.iv[i] = iv[i];
        }
 

        //TODO:
        //      -Before encrypting we need to remove the null
        //          terminator and convert to an unsigned char*
        vector<unsigned char> msg_unsigned(msg.begin(), msg.end());

        /* Create and initialise the context */
        if(!(ctx = EVP_CIPHER_CTX_new()))
            handleErrors();

        /*
         * Initialise the encryption operation.
         * IMPORTANT - ensure you use a key
         * and IV size appropriate for your cipher
         * In this example we are using 256 bit AES
         * (i.e. a 256 bit key). The
         * IV size for *most* modes is the same
         * as the block size. For AES this
         * is 128 bits
         */
        if(1 != EVP_EncryptInit_ex(ctx, EVP_aes_256_cbc(), NULL, key, iv))
            handleErrors();

        /*
         * Provide the message to be encrypted, and obtain
         * the encrypted output.
         * EVP_EncryptUpdate can be called multiple times if necessary
         */
        if(1 != EVP_EncryptUpdate(ctx, result.encrypted_msg, &len, msg_unsigned.data(), msg_unsigned.size()))
            handleErrors();
        result.encrypted_msg_len = len;

        /*
         * Finalise the encryption. Further ciphertext bytes 
         * may be written at
         * this stage.
         */
        if(1 != EVP_EncryptFinal_ex(ctx, result.encrypted_msg + len, &len))
            handleErrors();
        result.encrypted_msg_len += len;

        /* Clean up */
        EVP_CIPHER_CTX_free(ctx);

        return result;

    }

    //WE NEED TO RECREATE THIS 
    CipherEngine::CipherString CipherEngine::encrypt(unsigned char *iv,const string& msg)
    { 
       CipherString result;

       result = encrypt_algorithm(iv, msg);

       return result;
    }


    CipherEngine::CipherString CipherEngine::encrypt(const string& msg)
    {
        unsigned char iv[16];
        generateIV(iv);
        
        CipherString result;

        result = encrypt_algorithm(iv, msg);
        
        return result;
    }

    //I can have this as either cipherString or as the 3 seperate bits
std::string CipherEngine::decrypt(unsigned char *ciphertext, 
                                  int ciphertext_len,
                                  unsigned char *iv)
{

    std::cout << key << std::endl;
    EVP_CIPHER_CTX *ctx;
    
    int len;
    unsigned char *plaintext; 
    int plaintext_len;


    /* Create and initialise the context */
    if(!(ctx = EVP_CIPHER_CTX_new()))
    {
        handleErrors();
    } 
    /* Initialise the decryption operation. IMPORTANT - ensure you use a key
     * and IV size appropriate for your cipher
     * In this example we are using 256 bit AES (i.e. a 256 bit key). The
     * IV size for *most* modes is the same as the block size. For AES this
     * is 128 bits
     */

    std::cout << "Flag 0" << std::endl;
    if(1 != EVP_DecryptInit_ex(ctx, EVP_aes_256_cbc(), NULL, key, iv))
    {
        handleErrors();
    }
   
    std::cout << "Flag 1" << std::endl;
    /*
     * Provide the message to be decrypted, and obtain the plaintext output.
     * EVP_DecryptUpdate can be called multiple times if necessary.
     */
    if(1 != EVP_DecryptUpdate(ctx, plaintext, &len, ciphertext, ciphertext_len))
    {
        handleErrors();
    }
     plaintext_len = len;

    std::cout << "Flag 2" << std::endl;
    /*
     * Finalise the decryption. Further plaintext bytes may be written at
     * this stage.
     */



     if(1 != EVP_DecryptFinal_ex(ctx, plaintext + len, &len))
     {
         handleErrors();
     }
    plaintext_len += len;

    std::cout << "Flag 3" << std::endl;
    /* Clean up */
    EVP_CIPHER_CTX_free(ctx);

    //Convert the plaintext back to string
    std::string result(reinterpret_cast<char const*>(plaintext), plaintext_len);
    
    return result;
    }
}
