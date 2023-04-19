#ifndef CONFIG_HPP
#define CONFIG_HPP
#pragma once

// Common public includes
#include "common/ICredentials.hpp"

// Proto includes
#include "common/SDMS.pb.h"

// Standard includes
#include <map>
#include <stdint.h>
#include <string>

namespace SDMS {
namespace Repo {


struct Config
{
    static Config & getInstance()
    {
        static Config inst;
        return inst;
    }

    Config() {}

    std::string     globus_collection_path;
    std::string     core_server = "tcp://datafed.ornl.gov:7512";
    std::string     cred_dir = "/opt/datafed/keys";
    uint16_t        port = 9000;
    uint32_t        timeout = 5;
    uint32_t        num_req_worker_threads = 4;

    std::unique_ptr<ICredentials> sec_ctx;
    //MsgComm::SecurityContext            sec_ctx;
};

}}

#endif
