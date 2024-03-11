#include <curl/curl.h>
#include <iostream>

int main() {
  std::cout << curl_version() << std::endl;
  return 0;
}
