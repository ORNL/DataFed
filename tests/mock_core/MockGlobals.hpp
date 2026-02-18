#ifndef MOCK_GLOBALS_H
#define MOCK_GLOBALS_H
#pragma once

// Standard includes
#include <stdint.h>

namespace MockGlobals {
extern const char *pub_repo_key;
extern const char *repo_listen_address;
extern const char *repo_id;
extern const char *repo_title;
extern const uint64_t repo_capacity;
extern const char *repo_desc;
extern const char *repo_globus_uuid;
extern const char *repo_path;
extern const uint32_t repo_port;
} // namespace MockGlobals
#endif // MOCK_GLOBALS_H
