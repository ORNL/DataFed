//Local Include
#include "common/CipherEngine.hpp"

// Local Public includes
#include "common/TraceException.hpp"
#include "common/DynaLog.hpp"
#include "common/libjson.hpp"

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
using namespace libjson;
namespace SDMS{

    void CipherEngine::handleErrors(void)
    {
        unsigned long err = ERR_get_error();
        char err_buf[256];
        ERR_error_string_n(err, err_buf, sizeof(err_buf));
        throw TraceException(__FILE__, __LINE__, 0, std::string("OpenSSL Error: ") + err_buf);
    }

    std::unique_ptr<char[]> CipherEngine::encode64(const unsigned char* input,const int length, LogContext log_context) const
    {
        // Calculate the padded length based on the input length:
        // (length + 2) / 3 gives the number of 3-byte blocks (rounded up), multiplied by 4 gives the number of base64 characters required.
        // Allocate memory for the output buffer; std::make_unique will throw std::bad_alloc if allocation fails.
        const int paddedLength = SDMS::CipherEngine::BASE64_ENCODED_BLOCK_SIZE*((length + (SDMS::CipherEngine::BASE64_INPUT_BLOCK_SIZE-1))/SDMS::CipherEngine::BASE64_INPUT_BLOCK_SIZE);
        auto output = std::make_unique<char[]>(paddedLength+SDMS::CipherEngine::NULL_TERMINATOR_SIZE);
        std::fill_n(output.get(), paddedLength + SDMS::CipherEngine::NULL_TERMINATOR_SIZE, 0);  // manually zero-initialize
        const int outputLength = EVP_EncodeBlock(reinterpret_cast<unsigned char*>(output.get()), input, length);
        if (paddedLength != outputLength)
        {
          std::ostringstream oss;
          oss << "Output Length (" << outputLength
              << ") and Predicted Padded Length (" << paddedLength
              << ") of encoded bytes not equal!";

          DL_ERROR(log_context, oss.str());
          EXCEPT_PARAM(1, oss.str());
        }
        return output;
    }

    std::unique_ptr<unsigned char[]> CipherEngine::decode64(const char* input,const int length, LogContext log_context) const {
        // Calculate the padded length, the number of original decoded bytes
        // (length / 4) gives the number of 4-byte blocks of base64 data, multiplied by 3 gives the decoded byte length
        // Allocate memory for the output buffer; std::make_unique will throw std::bad_alloc if allocation fails.
        const int paddedLength = ((length/SDMS::CipherEngine::BASE64_ENCODED_BLOCK_SIZE)*SDMS::CipherEngine::BASE64_INPUT_BLOCK_SIZE);
        auto output = std::make_unique<unsigned char[]>(paddedLength+SDMS::CipherEngine::NULL_TERMINATOR_SIZE);
        std::fill_n(output.get(), paddedLength+SDMS::CipherEngine::NULL_TERMINATOR_SIZE, 0);
        const int outputLength = EVP_DecodeBlock(output.get(), reinterpret_cast<const unsigned char*>(input), length);
        if (paddedLength != outputLength) {
          std::ostringstream oss;
          oss << "Output Length (" << outputLength
              << ") and Predicted Padded Length (" << paddedLength
              << ") of decoded bytes not equal!";

          DL_ERROR(log_context, oss.str());
          EXCEPT_PARAM(1, oss.str());
        }
        return output;
    }
    void CipherEngine::generateIV(unsigned char *iv)
    {
        if (RAND_bytes(iv, SDMS::CipherEngine::IV_LENGTH) != 1)
        {
            handleErrors();
        }
    }

    // Constructor to set the encryption key
    CipherEngine::CipherEngine(const unsigned char* inputKey)
    {
        memcpy(key, inputKey, SDMS::CipherEngine::KEY_LENGTH);
    }

    void CipherEngine::generateEncryptionKey(unsigned char token_key[SDMS::CipherEngine::KEY_LENGTH])
    {
        if (RAND_bytes(token_key, SDMS::CipherEngine::KEY_LENGTH) != 1)
        {
            handleErrors();
        }
    }

bool CipherEngine::tokenNeedsUpdate(const Value::Object &obj)
    {
    //checking for existance
    if(!obj.has("access_iv") ||
       !obj.has("access_len") ||
       !obj.has("refresh_iv") ||
       !obj.has("refresh_len"))
    {
      return true;
    }

    //Checking if it does exist that it isnt empty
    if(obj.getValue("refresh").asString().length() == 0 ||
       obj.getValue("access").asString().length() == 0 ||
       obj.getValue("access_iv").asString().length() == 0 ||
       obj.getNumber("access_len") == 0 ||
       obj.getValue("refresh_iv").asString().length() == 0 ||
       obj.getNumber("refresh_len") == 0)
    {
        return true;
    }

    return false;
    }
    CipherEngine::CipherBytes CipherEngine::encryptAlgorithm(unsigned char *iv, const std::string& msg, LogContext log_context)
    {
        if (msg.length() > MAX_MSG_LENGTH) {
            EXCEPT_PARAM(0, std::string("Message too long for encryption"));
        }
        EVP_CIPHER_CTX *ctx = nullptr;
        CipherBytes bytes_result = {};

        //setting IV for the resulting obj:
        for(int i = 0; i < SDMS::CipherEngine::IV_LENGTH; i++)
        {
            bytes_result.iv[i] = iv[i];
        }

        std::vector<unsigned char> msg_unsigned(msg.begin(), msg.end());

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

        int len;
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

        return bytes_result;
    }

    CipherEngine::CipherString CipherEngine::encodeBytes(CipherEngine::CipherBytes unencoded_bytes, LogContext log_context)
    {
        CipherString encoded_string_result;

        //Assigning values to encoded_string_result
        encoded_string_result.encrypted_msg = encode64(unencoded_bytes.encrypted_msg, unencoded_bytes.encrypted_msg_len, log_context);
        encoded_string_result.iv = encode64(unencoded_bytes.iv, SDMS::CipherEngine::IV_LENGTH, log_context);
        encoded_string_result.encrypted_msg_len = unencoded_bytes.encrypted_msg_len;

        return encoded_string_result;
    }

    CipherEngine::CipherString CipherEngine::encrypt(unsigned char *iv,const std::string& msg, LogContext log_context)
    {
        CipherEngine::CipherBytes unencoded_bytes;
        unencoded_bytes = encryptAlgorithm(iv, msg, log_context);
        return encodeBytes(unencoded_bytes, log_context);
    }

    CipherEngine::CipherString CipherEngine::encrypt(const std::string& msg, LogContext log_context)
    {
        unsigned char iv[SDMS::CipherEngine::IV_LENGTH] = {};
        generateIV(iv);
        CipherEngine::CipherBytes unencoded_bytes;
        unencoded_bytes = encryptAlgorithm(iv, msg, log_context);
        return encodeBytes(unencoded_bytes, log_context);

    }

    std::string CipherEngine::decrypt(const CipherString& encoded_encrypted_string, LogContext log_context)
    {
    EVP_CIPHER_CTX *ctx = nullptr;

    //converts the cipherstring back to a unsigned char
    std::unique_ptr<unsigned char[]> ciphertext = decode64(encoded_encrypted_string.encrypted_msg.get(), static_cast<int>(strlen(encoded_encrypted_string.encrypted_msg.get())), log_context);
    std::unique_ptr<unsigned char[]> iv = decode64(encoded_encrypted_string.iv.get(), static_cast<int>(strlen(encoded_encrypted_string.iv.get())),log_context);
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
    int plaintext_len = 0;
    unsigned char plaintext[encoded_encrypted_string.encrypted_msg_len + EVP_MAX_BLOCK_LENGTH] = {};
    const int ciphertext_len = encoded_encrypted_string.encrypted_msg_len;
    int len = 0;
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
    return std::string(reinterpret_cast<char const*>(plaintext), plaintext_len);
    }
}
