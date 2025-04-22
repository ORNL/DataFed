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
    
    CipherEngine::CipherString CipherEngine::createCipherString()
    {
        CipherString cs;
        return cs;
    }

    char* base64_encrypt(const unsigned char* input, int length) {
        const auto pl = 4*((length+2)/3);
        auto output = reinterpret_cast<char *>(calloc(pl+1, 1)); //+1 for the terminating null that EVP_EncodeBlock adds on
        const auto ol = EVP_EncodeBlock(reinterpret_cast<unsigned char *>(output), input, length);
        if (pl != ol) { std::cerr << "Whoops, encode predicted " << pl << " but we got " << ol << "\n"; }
        
        return output;
    }

    unsigned char* decode64(const char *input, int length) {
        const auto pl = 3*length/4;
        auto output = reinterpret_cast<unsigned char *>(calloc(pl+1, 1));
        const auto ol = EVP_DecodeBlock(output, reinterpret_cast<const unsigned char *>(input), length);
        if (pl != ol) { std::cerr << "Whoops, decode predicted " << pl << " but we got " << ol << "\n"; }
        
        return output;
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
        CipherString string_result;
        CipherBytes bytes_result;
        int len;   
        
        //setting IV for the resulting obj:
        for(int i = 0; i < 16; i++)
        {
            bytes_result.iv[i] = iv[i];
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
        if(1 != EVP_EncryptUpdate(ctx, bytes_result.encrypted_msg, &len, msg_unsigned.data(), msg_unsigned.size()))
            handleErrors();
        bytes_result.encrypted_msg_len = len;

        /*
         * Finalise the encryption. Further ciphertext bytes 
         * may be written at
         * this stage.
         */
        if(1 != EVP_EncryptFinal_ex(ctx, bytes_result.encrypted_msg + len, &len))
            handleErrors();
        bytes_result.encrypted_msg_len += len;

        /* Clean up */
        EVP_CIPHER_CTX_free(ctx);
        /* Do something useful with the ciphertext here */
        /*
        printf("Ciphertext is:\n");
        BIO_dump_fp (stdout, (const char *)result.encrypted_msg, result.encrypted_msg_len);
        printf("Key is:\n");
        BIO_dump_fp (stdout, (const char *)key, 32);
        printf("IV is:\n");
        BIO_dump_fp (stdout, (const char *)result.iv, 16);
        */
        //std::cout << "Key:" << std::hex << key << std::endl;
        //std::cout << "IV:" << std::hex << result.iv << std::endl; 
        //std::cout << "Cipher Text:" << std::hex << result.encrypted_msg << std::endl;
        //std::cout << "Cipher Msg Len:" << result.encrypted_msg_len << std::endl;

        printf("SetAccess Byte Code:\n");
        std::cout << bytes_result.encrypted_msg << std::endl;
        
        string_result.encrypted_msg = base64_encrypt(bytes_result.encrypted_msg, bytes_result.encrypted_msg_len);
        string_result.iv = base64_encrypt(bytes_result.iv, 16); 
        string_result.encrypted_msg_len = bytes_result.encrypted_msg_len;

        printf("SetAccess Base64:\n");
        std::cout << string_result.encrypted_msg << std::endl;

        return string_result;
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
std::string CipherEngine::decrypt(CipherString encrypted_string)
{
/*
 *
 *unsigned char *ciphertext, 
                                  int ciphertext_len,
                                  unsigned char *iv)
{

    std::cout << "Key:" << std::hex << key << std::endl;
    std::cout << "CipherText:" << std::hex << ciphertext << std::endl; 
    std::cout << "CipherText Len:" << ciphertext_len << std::endl;
    std::cout << "IV:" << std::hex << iv << std::endl;
*/
 /*
    printf("Ciphertext is:\n");
    BIO_dump_fp (stdout, (const char *)ciphertext, ciphertext_len);
    printf("Key is:\n");
    BIO_dump_fp (stdout, (const char *)key, 32);
    printf("IV is:\n");
    BIO_dump_fp (stdout, (const char *)iv, 16);
   */ 
    EVP_CIPHER_CTX *ctx;

    unsigned char* ciphertext;
    int ciphertext_len = encrypted_string.encrypted_msg_len;
    unsigned char* iv;

    int len;
    unsigned char plaintext[encrypted_string.encrypted_msg_len];
    int plaintext_len;

    //converts the cipherstring back to a unsigned char
    ciphertext = decode64(encrypted_string.encrypted_msg, encrypted_string.encrypted_msg_len);
    iv = decode64(encrypted_string.iv, 16);

    printf("GetAccess Byte Code:\n");
    std::cout << ciphertext << std::endl;

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

    std::cout << "Plaintext + len: " << plaintext + len << std::endl;
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
    delete[] plaintext;
    return result;
    }
}
