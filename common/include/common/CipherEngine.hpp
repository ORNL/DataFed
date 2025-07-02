#ifndef CIPHER_ENGINE_HPP
#define CIPHER_ENGINE_HPP
#pragma once

//Local public includes
#include "DynaLog.hpp"

//Local include
#include <string>
#include <memory>

namespace SDMS{

/**
 * @class CipherEngine
 * @brief Provides symmetric encryption and decryption functoinalities using a 256-bit key.
 */
class CipherEngine
{
    protected:
        /**
         * @brief Base64 encodes an input of a specified length and returns the output
         * @param input Pointer to input bytes to encode
         * @param length Number of bytes in input
         * @param log_context Context for logging
         * @return Base64 encoded null-terminated char array
         */
        std::unique_ptr<char[]> encode64(const unsigned char* input, const int length, LogContext log_context);

        /**
         * @brief Base64 decodes an input of a specified length and returns the output
         * @param input Pointer to Base64 encoded input chars
         * @param length Number of bytes in input
         * @param log_context Context for logging
         * @return Decoded bytes
         */
        std::unique_ptr<unsigned char[]> decode64(const char* input, const int length, LogContext log_context);

    public:
        /** Base64 encoded block size (always 4) */
        static const int BASE64_ENCODED_BLOCK_SIZE = 4;

        /** Base64 input block size (always 3) */
        static const int BASE64_INPUT_BLOCK_SIZE = 3;

        /** Null terminator size */
        static const int NULL_TERMINATOR_SIZE = 1;

        /** Initialization vector length in bytes */
        static const int IV_LENGTH = 16;

        /** Encryption key length in bytes (256-bit) */
        static const int KEY_LENGTH = 32;

        /** Maximum message length in bytes */
        static const int MAX_MSG_LENGTH = 128;

        /** Base64 encoded IV length */
        static const int ENCODED_IV_LENGTH = 24;

        /** Base64 encoded encrypted message length */
        static const int ENCODED_MSG_LENGTH = 128;

        /**
         * @brief Generates a random encryption key.
         * @param token_key Buffer to store the generated key (must be KEY_LENGTH bytes).
         */
        static void generateEncryptionKey(unsigned char token_key[KEY_LENGTH]);

        /**
         * @brief Generates a random initialization vector (IV).
         * @param iv Buffer to store the generated IV (must be IV_LENGTH bytes).
         */
        static void generateIV(unsigned char iv[IV_LENGTH]);

        /**
         * @brief Constructs the CipherEngine with the specified key.
         * @param inputKey Pointer to encryption key bytes (KEY_LENGTH bytes).
         */
        explicit CipherEngine(const unsigned char* inputKey);

        /**
         * @struct CipherBytes
         * @brief Holds encrypted message bytes, IV, and message length.
         */
        struct CipherBytes
        {
            unsigned char encrypted_msg[MAX_MSG_LENGTH]; /**< Encrypted message bytes */
            unsigned char iv[IV_LENGTH];                  /**< Initialization vector bytes */
            int encrypted_msg_len;                         /**< Length of encrypted message */
        };

        /**
         * @struct CipherString
         * @brief Holds Base64 encoded encrypted message, IV, and message length.
         */
        struct CipherString
        {
            std::unique_ptr<char[]> encrypted_msg; /**< Base64 encoded encrypted message */
            std::unique_ptr<char[]> iv;            /**< Base64 encoded IV */
            int encrypted_msg_len;                  /**< Length of encrypted message */
        };

        /**
         * @brief Encrypts the message using the given IV.
         * @param iv Initialization vector to use for encryption.
         * @param msg Plaintext message to encrypt.
         * @param log_context Context for logging.
         * @return CipherBytes struct with raw encrypted bytes.
         */
        CipherBytes encryptAlgorithm(unsigned char* iv, const std::string& msg, LogContext log_context);

        /**
         * @brief Encodes CipherBytes into Base64 strings.
         * @param unencoded_bytes CipherBytes to encode.
         * @param log_context Context for logging.
         * @return CipherString with Base64 encoded encrypted message and IV.
         */
        CipherString encodeBytes(CipherBytes unencoded_bytes, LogContext log_context);

        /**
         * @brief Encrypts a message using the specified IV and returns Base64 encoded output.
         * @param iv Initialization vector to use.
         * @param msg Plaintext message.
         * @param log_context Context for logging.
         * @return CipherString with Base64 encoded encrypted data.
         */
        CipherString encrypt(unsigned char *iv, const std::string& msg, LogContext log_context);

        /**
         * @brief Encrypts a message, generating a random IV automatically.
         * @param msg Plaintext message.
         * @param log_context Context for logging.
         * @return CipherString with Base64 encoded encrypted data.
         */
        CipherString encrypt(const std::string& msg, LogContext log_context);

        /**
         * @brief Decrypts a Base64 encoded encrypted string.
         * @param encrypted_string CipherString with encrypted message and IV.
         * @param log_context Context for logging.
         * @return Decrypted plaintext string.
         */
        std::string decrypt(const CipherString& encrypted_string, LogContext log_context);

    private:
        unsigned char key[KEY_LENGTH]; /**< Encryption key bytes */

        /**
         * @brief Handles errors during encryption/decryption.
         */
        static void handleErrors(void);

};
} // namespace SDMS
#endif
