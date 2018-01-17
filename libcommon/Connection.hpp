#ifndef CONNECTION_HPP
#define CONNECTION_HPP

#include <string.h>
#include <string>
#include <map>
#include <stdint.h>
#include <zmq.h>


class Connection
{
public:
    enum Mode
    {
        Server,
        Client,
        Publisher,
        Subscriber,
        Worker
    };

    enum ErrorCode
    {
        EC_OK = 0,
        EC_SEND_FAILED,
        EC_TIMEOUT,
        EC_UNREGISTERED_REPLY_TYPE,
        EC_UNEXPECTED_REPLY_TYPE,
        EC_TOKEN_MISMATCH
    };

    struct MsgHeader
    {
        MsgHeader() :
            msg_type( 0 ), msg_size( sizeof( MsgHeader )), data_size(0)
            {}

        MsgHeader( uint16_t a_msg_type, uint16_t a_msg_size = 0, uint32_t a_data_size = 0 ) :
            msg_type( a_msg_type ), msg_size( a_msg_size?a_msg_size:sizeof( MsgHeader )), data_size( a_data_size )
            {}

        void reinit( uint16_t a_msg_type, uint16_t a_msg_size = 0, uint32_t a_data_size = 0 )
        {
            msg_type = a_msg_type;
            msg_size = a_msg_size?a_msg_size:sizeof( MsgHeader );
            data_size = a_data_size;
        }

        uint16_t    msg_type;
        uint16_t    msg_size;
        uint32_t    data_size;
    };

    class MsgBuffer
    {
    public:

        MsgBuffer() : m_size(0), m_offset(0), m_capacity(4096)
        {
            m_buffer = new char[m_capacity];
        }

        ~MsgBuffer()
        {
            delete[] m_buffer;
        }

        inline uint32_t size()
        {
            return m_size;
        }

        inline void setSize( uint32_t a_size )
        {
            m_size = a_size;
            ensureCapacity();
        }

        inline char * data()
        {
            return m_buffer + m_offset;
        }

        inline uint32_t cid()
        {
            return *(uint32_t*)(m_buffer+1);
        }

        void ensureCapacity()
        {
            if ( m_size + m_offset > m_capacity )
            {
                char *new_buffer = new char[m_size + m_offset];
                memcpy( new_buffer, m_buffer, m_offset );
                delete[] m_buffer;
                m_buffer = new_buffer;
                m_capacity = m_size + m_offset;
            }
        }

    private:

        uint32_t    m_size;
        uint32_t    m_offset;
        uint32_t    m_capacity;
        char *      m_buffer;

        friend class Connection;
    };

    //----- Constructors & Destructor -----

    Connection( const std::string & a_url, Mode a_mode = Client, void * a_context = 0 );
    Connection( const std::string & a_host, uint16_t a_port, Mode a_mode = Client, void * a_context = 0 );
    ~Connection();

    //----- Messaging API -----

    void            send( const MsgHeader & a_msg, const char * data = 0 );
    void            send( MsgBuffer & a_buffer );
    bool            recv( MsgBuffer & a_buffer, uint64_t a_timeout );

    std::string     getClientID( MsgBuffer & a_msg_buffer );

    //----- Utility Methods -----

    void *          getContext() { return m_context; }
    void *          getSocket() { return m_socket; }
    void            getPollInfo( zmq_pollitem_t  & a_poll_data );

private:

    void            setupSocketKeepAlive();
    void            init( const std::string & a_address );
    void            ensureCapacity( MsgBuffer &a_msg_buffer );

    void           *m_context;
    void           *m_socket;
    Mode            m_mode;
    bool            m_proc_addresses;
    zmq_pollitem_t  m_poll_item;
    bool            m_context_owner;
};

#endif // CONNECTION_HPP
