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

    Config():
        globus_collection_path("/mnt/datafed-repo/"),
        core_server( "tcp://datafed.ornl.gov:7512" ),
        cred_dir( "/etc/datafed/" ),
        port( 9000 ),
        timeout( 5 ),
        num_req_worker_threads( 4 )
    {}

    std::string     globus_collection_path;
    std::string     core_server;
    std::string     cred_dir;
    uint16_t        port;
    uint32_t        timeout;
    uint32_t        num_req_worker_threads;

    MsgComm::SecurityContext            sec_ctx;
};

}}

#endif
