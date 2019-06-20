#ifndef COREXFRMGR_HPP
#define COREXFRMGR_HPP

#include <string>
#include <map>
#include <deque>
#include <list>
#include <thread>
#include <mutex>
#include "CoreIWorkerMgr.hpp"
#include "SDMS.pb.h"


namespace SDMS {
namespace Core {

class XfrMgr
{
public:
    XfrMgr( IWorkerMgr & a_mgr );
    ~XfrMgr();

    void start();
    void stop( bool a_wait );
    void newXfr( const XfrData & a_xfr );

private:
    struct XfrDataInfo
    {
        XfrDataInfo( const XfrData & a_xfr ) : xfr(a_xfr), stage(0),poll(0),backoff(0),fail_count(0)
        {
        }

        XfrData         xfr;
        std::string     token;
        int             stage; // (0=not started,1=started,2=active)
        int             poll;
        int             backoff;
        int             fail_count;
    };

    void    xfrThreadFunc();
    void    xfrBackOffPolling( const std::list<XfrDataInfo*>::iterator & ixfr );

    IWorkerMgr &                        m_mgr;
    bool                                m_run;
    std::thread *                       m_mgr_thread;
    std::mutex                          m_xfr_mutex;
    std::deque<std::string>             m_xfr_pending;
    std::list<XfrDataInfo*>             m_xfr_active;
    std::map<std::string,XfrDataInfo*>  m_xfr_all;
};

}}

#endif
