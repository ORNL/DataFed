#include <iostream>
#include <zlib.h>

int main() {
  std::cout << zlibVersion() << std::endl;
  return 0;
}
