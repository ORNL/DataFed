#ifndef ITASKWORKER_HPP
#define ITASKWORKER_HPP
#pragma once

// Standard includes
#include <condition_variable>
#include <stdint.h>

namespace SDMS {
namespace Core {


/**
 * @brief Provides control structure per worker needed by TaskMgr
 * 
 * Next/prev attrib are for worker pool linked list. 'run' flag tells mgr if
 * the worker is in the pool or not (run == true means not in pool, run == 
 * false means a spurious wake).
 */
class ITaskWorker
{
public:
    ITaskWorker( uint32_t a_id, LogContext log_context ) :
        m_id( a_id ),
        m_run( false ),
        m_next( 0 ),
        m_log_context(log_context)
    {
    }

    virtual ~ITaskWorker()
    {}

    inline uint32_t id() const {
        return m_id;
    }

private:
    uint32_t                    m_id;
    bool                        m_run;
    ITaskWorker *               m_next;
    LogContext m_log_context;
    //ITaskWorker *               m_prev;
    std::condition_variable     m_cvar;

    friend class TaskMgr;
};

}}

#endif
