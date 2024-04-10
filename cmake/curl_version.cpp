#include <curl/curl.h>
#include <iostream>

/**
 * This script is used to show what vesion of curl is being used with the
 * rest of the build process and will print the version number of the curl
 * library.
 **/
int main() {
  std::cout << curl_version() << std::endl;
  return 0;
}
