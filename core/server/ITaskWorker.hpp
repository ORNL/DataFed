#ifndef ITASKWORKER_HPP
#define ITASKWORKER_HPP

namespace SDMS {
namespace Core {

//class TaskMgr;

class ITaskWorker
{
public:
    ITaskWorker() : m_next(0), m_prev(0), m_woke(false)
    {}

    ~ITaskWorker()
    {}

private:
    ITaskWorker *   m_next;
    ITaskWorker *   m_prev;
    bool            m_woke;

    friend class TaskMgr;
};

}}

#endif
