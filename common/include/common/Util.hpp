#ifndef UTIL_HPP
#define UTIL_HPP

#include <string>
#include <vector>
#include <cstdint>

std::string exec(const char *cmd);

struct curlReadBuffer {
  char *ptr;
  size_t size;
};

const static int IV_LENGTH = 16;
const static int KEY_LENGTH = 32;
size_t curlResponseWriteCB(char *ptr, size_t size, size_t nmemb,
                           void *userdata);
size_t curlBodyReadCB(char *ptr, size_t size, size_t nitems, void *userdata);

int decrypt(unsigned char *ciphertext, int ciphertext_len, unsigned char *key, unsigned char *iv, unsigned char *plaintext);

int encrypt(unsigned char *plaintext, int plaintext_len, unsigned char *key, unsigned char *iv, unsigned char *ciphertext);

void generateIV(unsigned char iv[IV_LENGTH]);
void generateKeys(std::string &a_pub_key, std::string &a_priv_key);
void generateEncryptionKey(unsigned char token_key[KEY_LENGTH]);
void generateZMQKeys(std::string &a_pub_key, std::string &a_priv_key);
void hexDump(const char *a_buffer, const char *a_buffer_end,
             std::ostream &a_out);
void handleErrors(void);
std::string escapeCSV(const std::string &a_value);
std::string escapeJSON(const std::string &a_value);
bool to_uint32(const char *a_str, uint32_t &a_out);
void readFile(const std::string fileName,const int arraySize, unsigned char* array);

// std::vector<std::string> smartTokenize( const std::string & a_text, const
// std::string & a_delim );

// std::string parseQuery( const std::string & a_query, bool & use_client, bool
// & use_shared_users, bool & use_shared_projects );

#endif
