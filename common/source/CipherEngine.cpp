//Local Include
#include "common/CipherEngine.hpp"

// Local Public includes
#include "common/TraceException.hpp"
#include "common/DynaLog.hpp"

// Third party includes
#include <openssl/conf.h>
#include <openssl/evp.h>
#include <openssl/rand.h>
#include <openssl/err.h>

// Standard includes
#include <iostream>
#include <exception>
#include <memory>
#include <string.h>
#include <string>
#include <vector>
#include <fstream>
#include <iomanip>
using namespace std;
namespace SDMS{
    namespace
    {
       const int BASE64_ENCODED_BLOCK_SIZE = 4;
       const int BASE64_INPUT_BLOCK_SIZE = 3;
       const int NULL_TERMINATOR_SIZE = 1;

    }
    void CipherEngine::handleErrors(void)
    {
        ERR_print_errors_fp(stderr);
        abort();
    } 
    
    std::unique_ptr<char[]> encode64(const unsigned char* input, int length, LogContext log_context)
    {
        // Calculate the padded length based on the input length:
        // (length + 2) / 3 gives the number of 3-byte blocks (rounded up), multiplied by 4 gives the number of base64 characters required.
        const int paddedLength = BASE64_ENCODED_BLOCK_SIZE*((length + (BASE64_INPUT_BLOCK_SIZE-1))/BASE64_INPUT_BLOCK_SIZE);
        auto output = std::make_unique<char[]>(paddedLength+NULL_TERMINATOR_SIZE);
        std::fill_n(output.get(), paddedLength+NULL_TERMINATOR_SIZE, 0);  // manually zero-initialize 
        const int outputLength = EVP_EncodeBlock(reinterpret_cast<unsigned char*>(output.get()), input, length);
        if (paddedLength != outputLength) 
        {  DL_ERROR(log_context, "Output Length (" << outputLength <<") and Predicted Padded Length ("<< paddedLength <<" ) of encoded bytes not equal!"); } 
        return std::move(output);
    } 
 
    std::unique_ptr<unsigned char[]> decode64(const char *input, int length, LogContext log_context) {   
        // Calculate the padded length, the number of original decoded bytes
        // (length / 4) gives the number of 4-byte blocks of base64 data, multiplied by 3 gives the decoded byte length
        const int paddedLength = ((length/BASE64_ENCODED_BLOCK_SIZE)*BASE64_INPUT_BLOCK_SIZE);
        auto output = std::make_unique<unsigned char[]>(paddedLength+NULL_TERMINATOR_SIZE);
        std::fill_n(output.get(), paddedLength+NULL_TERMINATOR_SIZE, 0);
        const int outputLength = EVP_DecodeBlock(output.get(), reinterpret_cast<const unsigned char*>(input), length);
        if (paddedLength != outputLength) 
        { DL_ERROR(log_context, "Output Length (" << outputLength <<") and Predicted Padded Length ("<< paddedLength <<" ) of decoded bytes not equal!"); } 
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


    CipherEngine::CipherString CipherEngine::encryptAlgorithm(unsigned char *iv, const string& msg, LogContext log_context)
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
        encoded_string_result.encrypted_msg = encode64(bytes_result.encrypted_msg, bytes_result.encrypted_msg_len, log_context);
        encoded_string_result.iv = encode64(bytes_result.iv, 16, log_context); 
        encoded_string_result.encrypted_msg_len = bytes_result.encrypted_msg_len;
    
        return encoded_string_result;
    }

    CipherEngine::CipherString CipherEngine::encrypt(unsigned char *iv,const string& msg, LogContext log_context)
    {
       CipherString result; 

       result = encryptAlgorithm(iv, msg, log_context);

       return result;
    }


    CipherEngine::CipherString CipherEngine::encrypt(const string& msg, LogContext log_context)
    {
        unsigned char iv[16] = {};
        generateIV(iv);
        
        CipherString result;

        result = encryptAlgorithm(iv, msg, log_context);
        
        return result;
    }

    std::string CipherEngine::decrypt(const CipherString& encoded_encrypted_string, LogContext log_context)
    {
    
    EVP_CIPHER_CTX *ctx = nullptr;

    //unsigned char* ciphertext;
    int ciphertext_len = encoded_encrypted_string.encrypted_msg_len;
    //unsigned char* iv;

    int len;
    unsigned char plaintext[encoded_encrypted_string.encrypted_msg_len + EVP_MAX_BLOCK_LENGTH] = {};
    int plaintext_len;

    //converts the cipherstring back to a unsigned char
    std::unique_ptr<unsigned char[]> ciphertext = decode64(encoded_encrypted_string.encrypted_msg.get(), static_cast<int>(strlen(encoded_encrypted_string.encrypted_msg.get())), log_context);
    std::unique_ptr<unsigned char[]> iv = decode64(encoded_encrypted_string.iv.get(), static_cast<int>(strlen(encoded_encrypted_string.iv.get())), log_context);
   
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
