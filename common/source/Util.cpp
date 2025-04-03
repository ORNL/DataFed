// Local public includes
#include "common/Util.hpp"
#include "common/SDMS.pb.h"
#include "common/TraceException.hpp"

// Third party includes
#include <zmq.h>
#include <openssl/conf.h>
#include <openssl/evp.h>
#include <openssl/rand.h>
#include <openssl/err.h>

// Standard includes
#include <array>
#include <cstdio>
#include <iomanip>
#include <iostream>
#include <memory>
#include <set>
#include <string.h>
#include <string>
#include <fstream>

using namespace std;

std::string exec(const char *cmd) {
  std::array<char, 128> buffer;
  std::string result;
  std::shared_ptr<FILE> pipe(popen(cmd, "r"), pclose);

  if (!pipe)
    EXCEPT_PARAM(0, "exec(" << cmd << "): popen() failed!");

  while (!feof(pipe.get())) {
    if (fgets(buffer.data(), 128, pipe.get()) != 0)
      result += buffer.data();
  }

  return result;
}

size_t curlResponseWriteCB(char *ptr, size_t size, size_t nmemb,
                           void *userdata) {
  if (!userdata)
    return 0;

  size_t len = size * nmemb;

  ((string *)userdata)->append(ptr, len);

  return len;
}

size_t curlBodyReadCB(char *ptr, size_t size, size_t nmemb, void *userdata) {
  if (!userdata)
    return 0;

  curlReadBuffer *buf = (curlReadBuffer *)userdata;

  size_t len = size * nmemb;
  len = len > buf->size ? buf->size : len;

  memcpy(ptr, buf->ptr, len);

  buf->size -= len;
  buf->ptr += len;

  return len;
}
void handleErrors(void)
{
    ERR_print_errors_fp(stderr);
    abort();
}

int readFile(std::string fileName, int arraySize, unsigned char* array)
{
    //Converting Key for encryption funct
    unsigned char keyChar[arraySize];
    //Grabbing key
    std::ifstream keyFile(fileName, std::ios::binary);

    keyFile.read(reinterpret_cast<char*>(keyChar),arraySize);
    
    for (int lv = 0; lv < arraySize; lv++)
    {
        array[lv] = keyChar[lv];    
    }
return 1;
}

void generateEncryptionKey(unsigned char token_key[32])
{ 
    if (RAND_bytes(token_key, 32) != 1)
    {
        handleErrors();
    }
}

void generateZMQKeys(std::string &a_pub_key, std::string &a_priv_key)
{
    char public_key[41];
    char secret_key[41];

    if (zmq_curve_keypair(public_key, secret_key) != 0)
        EXCEPT_PARAM(1, "Key generation failed: " << zmq_strerror(errno));

    a_pub_key = public_key;
    a_priv_key = secret_key;   
}

void generateKeys(std::string &a_pub_key, std::string &a_priv_key)
{
    generateZMQKeys(a_pub_key, a_priv_key);
}

int encrypt(unsigned char *plaintext,
            int plaintext_len,
            unsigned char *key,
            unsigned char *iv,
            unsigned char *ciphertext)
{
    EVP_CIPHER_CTX *ctx;

    int len;

    int ciphertext_len;

    /* Create and initialise the context */
    if(!(ctx = EVP_CIPHER_CTX_new()))
        handleErrors();

    /*
     * Initialise the encryption operation. IMPORTANT - ensure you use a key
     * and IV size appropriate for your cipher
     * In this example we are using 256 bit AES (i.e. a 256 bit key). The
     * IV size for *most* modes is the same as the block size. For AES this
     * is 128 bits
     */
    if(1 != EVP_EncryptInit_ex(ctx, EVP_aes_256_cbc(), NULL, key, iv))
        handleErrors();

    /*
     * Provide the message to be encrypted, and obtain the encrypted output.
     * EVP_EncryptUpdate can be called multiple times if necessary
     */
    if(1 != EVP_EncryptUpdate(ctx, ciphertext, &len, plaintext, plaintext_len))
        handleErrors();
    ciphertext_len = len;

    /*
     * Finalise the encryption. Further ciphertext bytes may be written at
     * this stage.
     */
    if(1 != EVP_EncryptFinal_ex(ctx, ciphertext + len, &len))
        handleErrors();
    ciphertext_len += len;

    /* Clean up */
    EVP_CIPHER_CTX_free(ctx);

    return ciphertext_len;
}
int decrypt(unsigned char *ciphertext,
            int ciphertext_len,
            unsigned char *key,
            unsigned char *iv,
            unsigned char *plaintext)
{

    EVP_CIPHER_CTX *ctx;

    int len;

    int plaintext_len;

    /* Create and initialise the context */
    if(!(ctx = EVP_CIPHER_CTX_new()))
        handleErrors();

    /*
     * Initialise the decryption operation. IMPORTANT - ensure you use a key
     * and IV size appropriate for your cipher
     * In this example we are using 256 bit AES (i.e. a 256 bit key). The
     * IV size for *most* modes is the same as the block size. For AES this
     * is 128 bits
     */
    if(1 != EVP_DecryptInit_ex(ctx, EVP_aes_256_cbc(), NULL, key, iv))
        handleErrors();

    /*
     * Provide the message to be decrypted, and obtain the plaintext output.
     * EVP_DecryptUpdate can be called multiple times if necessary.
     */
    if(1 != EVP_DecryptUpdate(ctx, plaintext, &len, ciphertext, ciphertext_len))
        handleErrors();
    plaintext_len = len;

    /*
     * Finalise the decryption. Further plaintext bytes may be written at
     * this stage.
     */

    if(1 != EVP_DecryptFinal_ex(ctx, plaintext + len, &len))
        handleErrors();
    plaintext_len += len;

    /* Clean up */
    EVP_CIPHER_CTX_free(ctx);

    return plaintext_len;
}

void hexDump(const char *a_buffer, const char *a_buffer_end, ostream &a_out) {
  const unsigned char *p = (unsigned char *)a_buffer;
  const unsigned char *e = (unsigned char *)a_buffer_end;
  bool done = false;

  int l = 0;
  while (!done) {
    a_out << setw(4) << dec << l << ": ";

    for (int i = 0; i < 16; ++i) {
      if (i == 8)
        a_out << "  ";

      if (p + i != e) {
        a_out << hex << setw(2) << setfill('0') << ((unsigned short)(*(p + i)))
              << " ";
      } else {
        done = true;

        for (; i < 16; ++i)
          a_out << "   ";

        break;
      }
    }

    a_out << "  ";

    for (int i = 0; i < 16; ++i) {
      if (p + i != e) {
        if (isprint(*(p + i)))
          a_out << *(p + i);
        else
          a_out << ".";
      } else
        break;
    }

    a_out << "\n";

    p += 16;
    l += 16;
  }
}

string escapeCSV(const string &a_value) {
  string::size_type p1 = 0, p2;
  string result;
  result.reserve(a_value.size() + 20);

  while (1) {
    p2 = a_value.find('"', p1);
    if (p2 == string::npos) {
      result.append(a_value, p1, p2);
      break;
    }

    result.append(a_value, p1, p2 - p1 + 1);
    result.append("\"");
    p1 = p2 + 1;
  }

  return result;
}

string escapeJSON(const std::string &a_value) {
  static const char *values[] = {
      "\\u0000", "\\u0001", "\\u0002", "\\u0003", "\\u0004", "\\u0005",
      "\\u0006", "\\u0007", "\\u0008", "\\u0009", "\\u000A", "\\u000B",
      "\\u000C", "\\u000D", "\\u000E", "\\u000F", "\\u0010", "\\u0011",
      "\\u0012", "\\u0013", "\\u0014", "\\u0015", "\\u0016", "\\u0017",
      "\\u0018", "\\u0019", "\\u001A", "\\u001B", "\\u001C", "\\u001D",
      "\\u001E", "\\u001F"};

  string result;
  result.reserve(a_value.size() * 2);

  for (auto c = a_value.cbegin(); c != a_value.cend(); c++) {
    if (*c == '"')
      result.append("\\\"");
    else if (*c == '\\')
      result.append("\\\\");
    else if ('\x00' <= *c && *c <= '\x1f')
      result.append(values[(size_t)*c]);
    else
      result.append(1, *c);
  }

  return result;
}

bool to_uint32(const char *a_str, uint32_t &a_out) {
  char *endptr;
  a_out = std::strtoul(a_str, &endptr, 10);

  if (endptr == a_str || *endptr != '\0')
    return true;
  else
    return false;
}
