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
    void newXfr( const XfrData & a_xfr, const std::string & a_uid );

private:
    void    xfrThreadFunc();
    bool    parseGlobusEvents( const std::string & a_events, XfrStatus & status, std::string & a_err_msg );

    struct XfrDataInfo
    {
        XfrDataInfo( const XfrData & a_xfr, const std::string & a_uid ) :
            id(a_xfr.id()),mode(a_xfr.mode()),status(a_xfr.status()),data_id(a_xfr.data_id()),repo_path(a_xfr.repo_path()),
            local_path(a_xfr.local_path()),uid(a_uid),stage(0),poll(0),backoff(0)
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
        std::string     uid;
        std::string     token;
        int             stage; // (0=not started,1=started,2=active)
        int             poll;
        int             backoff;
    };

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
