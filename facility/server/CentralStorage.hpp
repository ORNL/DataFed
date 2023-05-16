#ifndef CENTRALSTORAGE_HPP
#define CENTRALSTORAGE_HPP

#include <string>

namespace SDMS {

class CentralStorage {
 public:
  CentralStorage();
  ~CentralStorage();

  void dataDelete(const std::string& a_filename);
  bool dataGetSize(const std::string& a_filename, size_t& a_size);
};

}  // namespace SDMS

#endif
