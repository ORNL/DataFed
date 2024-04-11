#include <iostream>
#include <zlib.h>

/**
 * This little file is used to make sure that we are compiling with the version
 * of a library that we think we are. This one when run will print the zlib
 * version numbers.
 **/
int main() {
  std::cout << zlibVersion() << std::endl;
  return 0;
}
