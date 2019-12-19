#ifndef CONFIG_HPP
#define CONFIG_HPP

#include <string>
#include <stdint.h>

namespace SDMS {
namespace Core {

struct Config
{
    static Config & getInstance()
    {
        static Config inst;
        return inst;
    }

    Config():
        glob_oauth_url("https://auth.globus.org/v2/oauth2/"),
        glob_xfr_url("https://transfer.api.globusonline.org/v0.10/"),
        port(7512),
        timeout(5),
        num_client_worker_threads(4),
        num_task_worker_threads(10),
        task_purge_age(30*24*3600),
        task_purge_per(6*3600)
    {}

    std::string     cred_dir;
    std::string     db_url;
    std::string     db_user;
    std::string     db_pass;
    std::string     glob_oauth_url;
    std::string     glob_xfr_url;
    std::string     client_id;
    std::string     client_secret;
    uint32_t        port;
    uint32_t        timeout;
    uint32_t        num_client_worker_threads;
    uint32_t        num_task_worker_threads;
    size_t          task_purge_age;
    size_t          task_purge_per;

};

}}

#endif
