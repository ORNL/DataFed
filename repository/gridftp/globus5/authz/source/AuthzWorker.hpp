#ifndef AUTHZWORKER_HPP
#define AUTHZWORKER_HPP
#pragma once

// Common public includes
#include "ICredentials.hpp"

// Protobuf includes
#include "SDMS.pb.h"
#include "SDMS_Anon.pb.h"
#include "SDMS_Auth.pb.h"
#include "Version.pb.h"

// Standard includes
#include <cstdlib>
#include <fstream>
#include <memory>
#include <string>
#include <syslog.h>


//#include "MsgBuf.hpp"
//#include "MsgComm.hpp"
//#include "Util.hpp"
//#define DEF_DYNALOG
//#include "DynaLog.hpp"

namespace SDMS {

class AuthzWorker {
  public:
    //AuthzWorker();

    AuthzWorker& operator=( const AuthzWorker & ) = delete;

    int checkAuth( char * client_id, char * path, char * action );
    static void init();
    static const char * user();

  private:
    static std::string              m_user;
    static std::string                     m_pub_key;
    static std::string                     m_priv_key;
    static std::string                     m_server_key;
    static std::string                     m_repo_id;
    static std::string                     m_server_addr;
    static std::string                     m_test_path;
    static uint32_t                        m_timeout;
    static std::unique_ptr<ICredentials>   m_sec_ctx;
};

} // End namespace SDMS

#endif // AUTHZWORKER_HPP
