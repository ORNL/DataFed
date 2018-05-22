#ifndef MSGCOMM_HPP
#define MSGCOMM_HPP

#include <string>
#include <vector>
#include <stdint.h>
#include <zmq.h>
#include "MsgBuf.hpp"

class MsgComm
{
public:
    struct SecurityContext
    {
        bool                        is_server;
        std::string                 domain;
        std::string                 public_key;
        std::string                 private_key;
        std::string                 server_key;     // Clients only
    };

    enum SockType
    {
        PAIR = ZMQ_PAIR,
        PUB = ZMQ_PUB,
        SUB = ZMQ_SUB,
        REQ = ZMQ_REQ,
        REP = ZMQ_REP,
        DEALER = ZMQ_DEALER,
        ROUTER = ZMQ_ROUTER,
        PULL = ZMQ_PULL,
        PUSH = ZMQ_PUSH,
        XPUB = ZMQ_XPUB,
        XSUB = ZMQ_XSUB,
        STREAM =ZMQ_STREAM
    };

    MsgComm( const std::string & a_address, SockType a_sock_type, bool a_bind, const SecurityContext * a_sec_ctx = 0, void * a_zmq_cxt = 0 );
    MsgComm( const std::string & a_host, uint16_t a_port, SockType a_sock_type, bool a_bind, const SecurityContext * a_sec_ctx = 0, void * a_zmq_cxt = 0 );
    ~MsgComm();

    void            reset();
    void            send( MsgBuf::Message & a_msg, const std::string & a_uid = "", uint16_t a_context = 0 );
    void            send( MsgBuf & a_message );
    bool            recv( MsgBuf::Message *& a_msg, std::string & a_uid, MsgBuf::Frame & a_frame, uint32_t a_timeout = 0 );
    bool            recv( MsgBuf & a_message, uint32_t a_timeout = 0 );
    void            proxy( MsgComm & a_backend, bool a_uid_from_wire = false );
    void *          getSocket() { return m_socket; }
    void            getPollInfo( zmq_pollitem_t  & a_poll_data );
    static void *   getContext();

private:
    void            setupSecurityContext( const SecurityContext * a_sec_ctx );
    void            init( SockType a_sock_type, const SecurityContext * a_sec_ctx, void * a_zmq_cxt );

    void           *m_socket;
    bool            m_bound;
    std::string     m_address;
    zmq_pollitem_t  m_poll_item;
};

#endif // CONNECTION_HPP
