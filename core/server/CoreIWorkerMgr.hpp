#ifndef COREIWORKERMGR_HPP
#define COREIWORKERMGR_HPP

#include <string>
#include <vector>
#include "SDMS.pb.h"

namespace SDMS {
namespace Core {

class IWorkerMgr
{
public:
    virtual void                repoPathCreate( const std::string & a_repo_id, const std::string & a_id ) = 0;
    virtual void                repoPathDelete( const std::string & a_repo_id, const std::string & a_id ) = 0;
    virtual void                authorizeClient( const std::string & a_cert_uid, const std::string & a_uid ) = 0;
};

}}

#endif
