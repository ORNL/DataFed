#ifndef CONFIG_HPP
#define CONFIG_HPP

#include <string>
#include <map>
#include <stdint.h>
#include "SDMS.pb.h"
#include "MsgComm.hpp"

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

    MsgComm::SecurityContext            sec_ctx;
};

}}

#endif
