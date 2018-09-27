#ifndef AUTHZWORKER_HPP
#define AUTHZWORKER_HPP

#include <string>
#include <map>
#include <thread>
#include <mutex>
#include <condition_variable>
#include <stdint.h>
#include <unistd.h>

#include "MsgBuf.hpp"
#include "MsgComm.hpp"

namespace SDMS {

class AuthzWorker
{
public:
    AuthzWorker( const std::string & a_cred_dir, const std::string & a_authz_file );
    virtual ~AuthzWorker();

    AuthzWorker& operator=( const AuthzWorker & ) = delete;

    int run(char * client_id, char * object, char * action);

private:
    void loadKeys( const std::string & a_cred_dir );

    void procStatusRequest();

    typedef void (AuthzWorker::*msg_fun_t)();

    MsgBuf                          m_msg_buf;
    std::string                     m_pub_key;
    std::string                     m_priv_key;
    std::string                     m_core_key;
    
    std::string                     m_repo;
    std::string                     m_url;

    std::map<uint16_t,msg_fun_t>    m_msg_handlers;
};


}

#endif
