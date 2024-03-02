#include <iostream>
#include <zlib.h>

int main() {
  std::cout << "zlib version: " << zlibVersion() << std::endl;
  return 0;
}
