#ifndef TASKMGR_HPP
#define TASKMGR_HPP

#include <string>
#include <vector>
#include <deque>
#include <thread>
#include <mutex>
#include <condition_variable>
#include "SDMS.pb.h"

namespace SDMS {
namespace CORE {

class TaskMgr
{
public:
    static TaskMgr & getInstance();

    void    getData( const std::vector<std::string> & a_ids, const std::string & a_path, XfrEncrypt a_encrypt );
    void    putData( const std::string& a_id, const std::string & a_path, XfrEncrypt a_encrypt, const std::string * a_ext = 0 );
    void    moveData( const std::vector<std::string> & a_ids, const std::string & a_repo, XfrEncrypt a_encrypt );
    void    deleteData( const std::vector<std::string> & a_ids );

private:
    TaskMgr();
    ~TaskMgr();

    void    xfrMonitor();

    class Task;

    std::deque<Task*>           m_q_ready;
    std::mutex                  m_q_mutex;
    std::condition_variable     m_q_condvar;
    std::vector<std::thread*>   m_workers;
    std::thread*                m_xfr_mon_thread;
};

}}

#endif
