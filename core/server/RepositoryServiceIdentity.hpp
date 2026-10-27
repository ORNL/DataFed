#pragma once

#include "common/envelope.pb.h"
#include <map>
#include <string>

namespace SDMS {
namespace Core {

// Several logical repositories may share one daemon and credential. The
// authenticated identity must still belong to that same service and collection.
inline bool repositoryServiceMayAuthorize(
    const std::map<std::string, RepoData> &repos,
    const std::string &authenticated_id, const std::string &origin_id) {
  const auto authenticated = repos.find(authenticated_id);
  const auto origin = repos.find(origin_id);
  if (authenticated == repos.end() || origin == repos.end()) {
    return false;
  }
  const auto &service = authenticated->second;
  const auto &requested = origin->second;
  return service.pub_key().size() == 40 &&
         service.endpoint().size() == 36 && !service.address().empty() &&
         service.pub_key() == requested.pub_key() &&
         service.address() == requested.address() &&
         service.endpoint() == requested.endpoint();
}

} // namespace Core
} // namespace SDMS
