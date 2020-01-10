#ifndef ITASKMGR_HPP
#define ITASKMGR_HPP

#include <string>
#include "libjson.hpp"

namespace SDMS {
namespace Core {

class ITaskMgr
{
public:
    typedef std::chrono::system_clock::time_point   timepoint_t;
    typedef std::chrono::system_clock::duration     duration_t;

    struct Task
    {
        Task( const std::string & a_id, libjson::Value & a_data ) :
            task_id( a_id ), data( std::move( a_data )), cancel(false), retry_count(0)
        {}

        ~Task()
        {}

        std::string         task_id;
        libjson::Value      data;
        bool                cancel;
        uint32_t            retry_count;
        timepoint_t         retry_time;
        timepoint_t         retry_fail_time;
    };

    virtual Task *      getNextTask() = 0;
    virtual bool        retryTask() = 0;
    virtual void        newTasks( libjson::Value & a_tasks );

};

}}

#endif
