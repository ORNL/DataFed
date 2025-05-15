#ifndef CIPHER_ENGINE_HPP
#define CIPHER_ENGINE_HPP
#pragma once

//Local include
#include <string>
#include <memory>

namespace SDMS{
class CipherEngine
{
    private:
        unsigned char key[32];

        static void handleErrors(void);
    public:
        static void generateEncryptionKey(unsigned char token_key[32]);
      
        static void generateIV(unsigned char iv[16]);
        
        // Constructor to set the encryption key
        CipherEngine(const unsigned char* inputKey);

        struct CipherBytes
        {
            unsigned char encrypted_msg[128];
            unsigned char iv[16];
            int encrypted_msg_len;
        };

        struct CipherString
        {
            std::unique_ptr<char[]> encrypted_msg;
            std::unique_ptr<char[]> iv;
            int encrypted_msg_len;
        };

        CipherString createCipherString();
        CipherString encrypt_algorithm(unsigned char *iv, const std::string& msg);
   
        
        //WE NEED TO RECREATE THIS
        CipherString encrypt(unsigned char *iv, const std::string& msg);
        CipherString encrypt(const std::string& msg); 
        std::string decrypt(const CipherString& encrypted_string);
        
};
}
#endif
