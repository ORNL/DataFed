#ifndef CIPHER_ENGINE_HPP
#define CIPHER_ENGINE_HPP
#pragma once

//Local public includes
#include "DynaLog.hpp"

//Local include
#include <string>
#include <memory>

namespace SDMS{

class CipherEngine
{
    protected:
        std::unique_ptr<char[]> encode64(const unsigned char* input, const int length, LogContext log_context);
        std::unique_ptr<unsigned char[]> decode64(const char* input, const int length, LogContext log_context);
     
    public:
        static const int BASE64_ENCODED_BLOCK_SIZE = 4;
        static const int BASE64_INPUT_BLOCK_SIZE = 3;
        static const int NULL_TERMINATOR_SIZE = 1;
        static const int IV_LENGTH = 16;
        static const int KEY_LENGTH = 32;
        static const int MAX_MSG_LENGTH = 128;
        static const int ENCODED_IV_LENGTH = 24;
        static const int ENCODED_MSG_LENGTH = 32;

        static void generateEncryptionKey(unsigned char token_key[KEY_LENGTH]);
      
        static void generateIV(unsigned char iv[IV_LENGTH]);
        
        // Constructor to set the encryption key
        explicit CipherEngine(const unsigned char* inputKey);

        struct CipherBytes
        {
            unsigned char encrypted_msg[MAX_MSG_LENGTH];
            unsigned char iv[IV_LENGTH];
            int encrypted_msg_len;
        };

        struct CipherString
        {
            std::unique_ptr<char[]> encrypted_msg;
            std::unique_ptr<char[]> iv;
            int encrypted_msg_len;
        };

        CipherBytes encryptAlgorithm(unsigned char *iv, const std::string& msg, LogContext log_context);
   
        CipherString encodeBytes(CipherBytes unencoded_bytes, LogContext log_context);
        CipherString encrypt(unsigned char *iv, const std::string& msg, LogContext log_context);
        CipherString encrypt(const std::string& msg, LogContext log_context); 
        std::string decrypt(const CipherString& encrypted_string, LogContext log_context);
        

    private:
        unsigned char key[KEY_LENGTH];

        static void handleErrors(void);
       
};
}
#endif
