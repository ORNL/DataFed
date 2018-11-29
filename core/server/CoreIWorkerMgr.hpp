#ifndef COREIWORKERMGR_HPP
#define COREIWORKERMGR_HPP

#include <string>
#include "SDMS.pb.h"

namespace SDMS {
namespace Core {

class IWorkerMgr
{
public:
    virtual const std::string & getDbURL() = 0;
    virtual const std::string & getDbUser() = 0;
    virtual const std::string & getDbPass() = 0;
    virtual const std::string * getRepoAddress( const std::string & a_repo_id ) = 0;
    virtual void                repoPathCreate( const std::string & a_repo_id, const std::string & a_id ) = 0;
    virtual void                repoPathDelete( const std::string & a_repo_id, const std::string & a_id ) = 0;
    virtual const MsgComm::SecurityContext & getSecurityContext() = 0;
    virtual void                dataDelete( const std::string & a_repo_id, const std::string & a_data_path ) = 0;
    virtual void                authorizeClient( const std::string & a_cert_uid, const std::string & a_uid ) = 0;
    virtual void                handleNewXfr( const XfrData & a_xfr ) = 0;
    virtual size_t              getXfrPurgeAge() = 0;
    virtual size_t              getXfrPurgePeriod() = 0;
};

}}

#endif
