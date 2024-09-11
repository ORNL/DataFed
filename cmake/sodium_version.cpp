#include <iostream>
#include <sodium.h>

int main() {
  if (sodium_init() == -1) {
    std::cerr << "sodium_init() failed" << std::endl;
    return 1;
  }

  std::cout << sodium_version_string() << std::endl;

  return 0;
}
