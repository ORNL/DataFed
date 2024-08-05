// Local public includes
#include "common/Util.hpp"
#include "common/SDMS.pb.h"
#include "common/TraceException.hpp"

// Third party includes
#include <zmq.h>

// Standard includes
#include <array>
#include <cstdio>
#include <iomanip>
#include <iostream>
#include <memory>
#include <set>
#include <string.h>
#include <string>

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

void generateKeys(std::string &a_pub_key, std::string &a_priv_key) {
  char public_key[41];
  char secret_key[41];

  if (zmq_curve_keypair(public_key, secret_key) != 0)
    EXCEPT_PARAM(1, "Key generation failed: " << zmq_strerror(errno));

  a_pub_key = public_key;
  a_priv_key = secret_key;
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

// Function to split a string by a delimiter and return the parts
std::vector<std::string> splitCurlMessage(const std::string& s, char delimiter) {
    std::vector<std::string> tokens;
    std::stringstream ss(s);
    std::string item;

    while (std::getline(ss, item, delimiter)) {
        tokens.push_back(item);
    }

    return tokens;
}

// Function to trim whitespace from both ends of a string
std::string trimCurlMessage(const std::string& str) {
    const std::string whitespace = " \t";
    const auto str_begin = str.find_first_not_of(whitespace);
    if (str_begin == std::string::npos) return ""; // No content

    const auto str_end = str.find_last_not_of(whitespace);
    const auto str_range = str_end - str_begin + 1;

    return str.substr(str_begin, str_range);
}

// Function to parse the formatted string and assign to variables
void parseCurlMessage(const std::string& input, std::string& endpoint, std::string& verb, std::string& body) {
    std::vector<std::string> parts = splitCurlMessage(input, ',');
    for (const std::string& part : parts) {
        size_t colon_pos = part.find(':');
        if (colon_pos != std::string::npos) {
            std::string label = part.substr(0, colon_pos);
            std::string value = part.substr(colon_pos + 1);

            // Trim leading and trailing whitespace from the value and label
            label = trimCurlMessage(label);
            //if statement to prevent editting whitespace in body
            if (label != "Body"){
              value = trimCurlMessage(value);
            }
            //Change the single quote to double quotes for the body as single quotes return errors
            else{
              value = replaceSingleQuotes(value);
            }
           
            if (label == "Endpoint") {
                endpoint = value;
            } else if (label == "Verb") {
                verb = value;
            } else if (label == "Body") {
                body = value;
            }
        }
    }
}

std::string replaceSingleQuotes(const std::string& input) {
    std::string result = input; // Copy input to result
    for (char& c : result) {    // Iterate through each character in the string
        if (c == '\'') {        // Check if the character is a single quote
            c = '\"';           // Replace single quote with double quote
        }
    }
    return result;              // Return the modified string
}
