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
    
    std::unique_ptr<char[]> encode64(const unsigned char* input, int length)
    {
        const int pl = 4*((length+2)/3);
        auto output = std::make_unique<char[]>(pl+1);
        std::fill_n(output.get(), pl+1, 0);  // manually zero-initialize 
        //char* output = reinterpret_cast<char *>(calloc(pl+1, 1)); //+1 for the terminating null that EVP_EncodeBlock adds on
        const int ol = EVP_EncodeBlock(reinterpret_cast<unsigned char*>(output.get()), input, length);
        if (pl != ol) { std::cerr << "Whoops, encode predicted " << pl << " but we got " << ol << "\n"; } 
        return std::move(output);
    } 
 
    std::unique_ptr<unsigned char[]> decode64(const char *input, int length) {
        const int pl = ((length/4)*3);
        auto output = std::make_unique<unsigned char[]>(pl+1);
        std::fill_n(output.get(), pl+1, 0);
        //unsigned char* output = reinterpret_cast<unsigned char *>(calloc(pl+1, 1));
        const int ol = EVP_DecodeBlock(output.get(), reinterpret_cast<const unsigned char*>(input), length);
        if (pl != ol) { std::cerr << "Whoops, decode predicted " << pl << " but we got " << ol << "\n"; } 
        return std::move(output);
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
        EVP_CIPHER_CTX *ctx = nullptr;
        CipherString encoded_string_result = {};
        CipherBytes bytes_result = {};
        
        int len;   
        
        //setting IV for the resulting obj:
        for(int i = 0; i < 16; i++)
        {
            bytes_result.iv[i] = iv[i];
        }
 

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


        //Assigning values to encoded_string_result
        encoded_string_result.encrypted_msg = encode64(bytes_result.encrypted_msg, bytes_result.encrypted_msg_len);
        encoded_string_result.iv = encode64(bytes_result.iv, 16); 
        encoded_string_result.encrypted_msg_len = bytes_result.encrypted_msg_len;
    
        return encoded_string_result;
    }

    CipherEngine::CipherString CipherEngine::encrypt(unsigned char *iv,const string& msg)
    { 
       CipherString result; 

       result = encrypt_algorithm(iv, msg);

       return result;
    }


    CipherEngine::CipherString CipherEngine::encrypt(const string& msg)
    {
        unsigned char iv[16] = {};
        generateIV(iv);
        
        CipherString result;

        result = encrypt_algorithm(iv, msg);
        
        return result;
    }

    std::string CipherEngine::decrypt(const CipherString& encoded_encrypted_string)
    {
    
    EVP_CIPHER_CTX *ctx = nullptr;

    //unsigned char* ciphertext;
    int ciphertext_len = encoded_encrypted_string.encrypted_msg_len;
    //unsigned char* iv;

    int len;
    unsigned char plaintext[encoded_encrypted_string.encrypted_msg_len + EVP_MAX_BLOCK_LENGTH] = {};
    int plaintext_len;

    //converts the cipherstring back to a unsigned char
    std::unique_ptr<unsigned char[]> ciphertext = decode64(encoded_encrypted_string.encrypted_msg.get(), static_cast<int>(strlen(encoded_encrypted_string.encrypted_msg.get())));
    std::unique_ptr<unsigned char[]> iv = decode64(encoded_encrypted_string.iv.get(), static_cast<int>(strlen(encoded_encrypted_string.iv.get())));
   
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

    if(1 != EVP_DecryptInit_ex(ctx, EVP_aes_256_cbc(), NULL, key, iv.get()))
    {
        handleErrors();
    }
    
    /*
     * Provide the message to be decrypted, and obtain the plaintext output.
     * EVP_DecryptUpdate can be called multiple times if necessary.
     */
    if(1 != EVP_DecryptUpdate(ctx, plaintext, &len, ciphertext.get(), ciphertext_len))
    {
        handleErrors();
    }
    plaintext_len = len;


    /*
     * Finalise the decryption. Further plaintext bytes may be written at
     * this stage.
     */

    if(1 != EVP_DecryptFinal_ex(ctx, plaintext + len, &len))
    {
        handleErrors();
    }
    plaintext_len += len;

    /* Clean up */
    EVP_CIPHER_CTX_free(ctx);

    //Convert the plaintext back to string
    std::string result(reinterpret_cast<char const*>(plaintext), plaintext_len);
       
    return result;
    }
}
