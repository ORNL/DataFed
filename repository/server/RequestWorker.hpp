#ifndef REQUESTWORKER_HPP
#define REQUESTWORKER_HPP

#include <string>
#include <vector>
#include <thread>
#include <algorithm>
#include <zmq.h>
#include "MsgComm.hpp"
#include "Config.hpp"

namespace SDMS {
namespace Repo {


class RequestWorker
{
public:
    RequestWorker( size_t a_tid );
    ~RequestWorker();

    void stop();
    void wait();

private:
    void        setupMsgHandlers();
    void        workerThread();
    void        procStatusRequest();
    void        procVersionRequest();
    void        procDataDeleteRequest();
    void        procDataGetSizeRequest();
    void        procPathCreateRequest();
    void        procPathDeleteRequest();


    Config &            m_config;
    size_t              m_tid;
    std::thread *       m_worker_thread;
    bool                m_run;

    MsgBuf              m_msg_buf;

    typedef void (RequestWorker::*msg_fun_t)();
    static std::map<uint16_t,msg_fun_t> m_msg_handlers;
};

}}

#endif
