#ifndef ITASKWORKER_HPP
#define ITASKWORKER_HPP

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
    ITaskWorker( uint32_t a_id ) :
        m_id( a_id ),
        m_run( false ),
        m_next( 0 )
        //m_prev( 0 ),
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
    //ITaskWorker *               m_prev;
    std::condition_variable     m_cvar;

    friend class TaskMgr;
};

}}

#endif
