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
        XfrDataInfo( const XfrData & a_xfr ) :
            id(a_xfr.id()),mode(a_xfr.mode()),status(a_xfr.status()),data_id(a_xfr.data_id()),repo_path(a_xfr.repo_path()),
            local_path(a_xfr.local_path()),user_id(a_xfr.user_id()),repo_id(a_xfr.repo_id()),ext(a_xfr.ext()),stage(0),poll(0),backoff(0),fail_count(0)
        {
            if ( a_xfr.has_task_id() )
                task_id = a_xfr.task_id();
        }

        std::string     id;
        XfrMode         mode;
        XfrStatus       status;
        std::string     data_id;
        std::string     repo_path;
        std::string     local_path;
        std::string     task_id;
        std::string     user_id;
        std::string     repo_id;
        std::string     ext;
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
