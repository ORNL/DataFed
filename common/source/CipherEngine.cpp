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
#include <iomanip>
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
   char* encode64(const unsigned char* input, int length) {
        const int pl = 4*((length+2)/3);
        char* output = reinterpret_cast<char *>(calloc(pl+1, 1)); //+1 for the terminating null that EVP_EncodeBlock adds on
        const int ol = EVP_EncodeBlock(reinterpret_cast<unsigned char *>(output), input, length);
        if (pl != ol) { std::cerr << "Whoops, encode predicted " << pl << " but we got " << ol << "\n"; } 
        return output;
    } 
 
    unsigned char* decode64(const char *input, int length) {
        printf("HELLO WORLD");

        std::cout << "Length within decode64:" << length << std::endl;
        const int pl = ((length/4)*3);
        std::cout << "PL:" << pl << std::endl;
        unsigned char* output = reinterpret_cast<unsigned char *>(calloc(pl+1, 1));
        const int ol = EVP_DecodeBlock(output, reinterpret_cast<const unsigned char *>(input), length);
        std::cout << "OL:" << ol << std::endl;
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
        CipherString encoded_string_result;
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


        //printf("Encrypted Msg Len:");
        //std::cout << bytes_result.encrypted_msg_len << std::endl;
        
        //printf("Encoded base64 Cipher Text within the encrypt:\n");
        //std::cout << std::hex << bytes_result.encrypted_msg << std::endl;
        //std::cout << "IV Len before encode:" << static_cast<int>(strlen(bytes_result.iv)) << std::endl;
       

       
        //std::cout << "Encoded Ciphertext:" << bytes_result.encrypted_msg << std::endl;

        encoded_string_result.encrypted_msg = encode64(bytes_result.encrypted_msg, bytes_result.encrypted_msg_len);
        encoded_string_result.iv = encode64(bytes_result.iv, 16); 
        encoded_string_result.encrypted_msg_len = bytes_result.encrypted_msg_len;


        //printf("After Encoded Base64 Len: (should be greater then 96)");
        //std::cout << strlen(encoded_string_result.encrypted_msg) << std::endl;
        //printf("SetAccess Base64:\n");
        //std::cout << string_result.encrypted_msg << std::endl;

        return encoded_string_result;
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
        
        std::string debug_str = decrypt(result);

        std::cout << "DEBUG DECRYPT BEFORE PLACED IN DB:" << debug_str << std::endl;

        return result;
    }

    //I can have this as either cipherString or as the 3 seperate bits
std::string CipherEngine::decrypt(CipherString encoded_encrypted_string)
{
    
    EVP_CIPHER_CTX *ctx;

    unsigned char* ciphertext;
    int ciphertext_len = encoded_encrypted_string.encrypted_msg_len;
    unsigned char* iv;

    int len;
    //unsigned char plaintext[encrypted_string.encrypted_msg_len];
    unsigned char* plaintext = new unsigned char[encoded_encrypted_string.encrypted_msg_len + EVP_MAX_BLOCK_LENGTH]();
    int plaintext_len;

    //std::cout << "ENCODED CIPHERTEXT:" << encoded_encrypted_string.encrypted_msg << std::endl;
    //std::cout << "Len for the encoded msg... THIS SHOULD NOT BE 96: " << strlen(encoded_encrypted_string.encrypted_msg) << std::endl;

    //std::cout << "Decode Base64 Len:" << strlen(encrypted_string.encrypted_msg) << std::endl;
    
    //std::cout << "Len going into the decode func:" << strlen(encoded_encrypted_string.encrypted_msg) << std::endl; 
    //converts the cipherstring back to a unsigned char
    ciphertext = decode64(encoded_encrypted_string.encrypted_msg, static_cast<int>(strlen(encoded_encrypted_string.encrypted_msg)));
    iv = decode64(encoded_encrypted_string.iv, static_cast<int>(strlen(encoded_encrypted_string.iv)));
   
    //std::cout << "Decoded Ciphertext:" << ciphertext << std::endl;
    
    printf("Msg Len, should be 96:\n");
    std::cout << encoded_encrypted_string.encrypted_msg_len << std::endl;

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
    
    //std::cout << i

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

    //printf("2nd Msg Len, should be 96i:\n");
    //std::cout << encoded_encrypted_string.encrypted_msg_len << std::endl;
    /*
     * Finalise the decryption. Further plaintext bytes may be written at
     * this stage.
     */

    printf("START OF DEBUG\n");
    printf("Plaintext:");
    std::cout << plaintext << std::endl;
    printf("\nPlaintext + len:");
    std::cout << plaintext + len << std::endl;
    
    printf("Len:");
    std::cout << len << std::endl;

    //std::cout << "Plaintext + len: " << plaintext + len << std::endl;
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
