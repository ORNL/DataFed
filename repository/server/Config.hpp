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
        core_server( "tcp://datafed.ornl.gov:7512" ),
        cred_dir( "/opt/datafed/keys" ),
        port( 9000 ),
        timeout( 5 ),
        num_req_worker_threads( 4 )
    {}

    //globus_collection_path("/mnt/datafed-repo/"),
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
