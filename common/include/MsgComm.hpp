#ifndef MSGCOMM_HPP
#define MSGCOMM_HPP

#include <string>
#include <map>
#include <stdint.h>
#include <zmq.h>
#include "MsgBuf.hpp"

class MsgComm
{
public:
    enum Mode
    {
        Server,
        Client,
        Publisher,
        Subscriber,
        Push,
        Pull,
        Worker
    };

    //----- Constructors & Destructor -----

    MsgComm( const std::string & a_address, Mode a_mode = Client, void * a_context = 0 );
    MsgComm( const std::string & a_host, uint16_t a_port, Mode a_mode = Client, void * a_context = 0 );
    ~MsgComm();

    //----- Basic Messaging API -----
    void            send( MsgBuf::Message & a_msg, uint16_t a_context = 0 );
    void            send( MsgBuf & a_message );
    bool            recv( MsgBuf::Message *& a_msg, MsgBuf::Frame & a_frame, uint32_t a_timeout = 0 );
    bool            recv( MsgBuf & a_message, uint32_t a_timeout = 0 );

    //----- Advanced (server) Messaging API -----
/*
    bool            send( MessageType & a_message, const std::string &a_client_id );
    MessageID       recv( MessageType *& a_msg, uint32_t a_timeout, std::string & a_client_id );

    std::string     getClientID( MessageBuffer & a_msg_buffer );
*/
    //----- Utility Methods -----

    void *          getContext() { return m_context; }
    void *          getSocket() { return m_socket; }
    void            getPollInfo( zmq_pollitem_t  & a_poll_data );

private:

    void            setupSocketKeepAlive();
    void            init( const std::string & a_address );

    void           *m_context;
    void           *m_socket;
    Mode            m_mode;
    bool            m_proc_addresses;
    zmq_pollitem_t  m_poll_item;
    bool            m_context_owner;
};

#endif // CONNECTION_HPP
