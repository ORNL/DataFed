#ifndef MSGCOMM_HPP
#define MSGCOMM_HPP

#include <string>
#include <vector>
#include <stdint.h>
#include <zmq.h>
#include "MsgBuf.hpp"

/**
 * @brief Message communicator class wrapping protobuf and zeromq
 * 
 * This class provides a communicator end-point that aggregates the
 * functionality of protobuf messages sent via zeromq. This class must be used
 * in conjunction with the MsgBuf class with perform message serialization
 * and framing. MsgComm supports all zeromq socket types and also supports
 * curvemq encryption.
 */
class MsgComm
{
public:
    /// Optional structure for defining common security settings
    struct SecurityContext
    {
        bool                        is_server;      ///< Enable server security handshaking
        std::string                 public_key;     ///< Local public key
        std::string                 private_key;    ///< Local private key
        std::string                 server_key;     ///< Remote server public key (used by clients only)
    };

    /// Wrapper for zeromq socket types
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

    /**
     * @brief Construct a new Msg Comm object from a zeromq address
     * 
     * @param a_address - zeromq address (i.e. tcp://foo.com:8000)
     * @param a_sock_type - zeromq socket type
     * @param a_bind - Bind socket if true; otherwise connect
     * @param a_sec_ctx - Optional security settings
     * @param a_zmq_cxt - Optional zeromq context (uses shared context if omitted)
     */
    MsgComm( const std::string & a_address, SockType a_sock_type, bool a_bind, const SecurityContext * a_sec_ctx = 0, void * a_zmq_cxt = 0 );

    /**
     * @brief Construct a new Msg Comm object from host and port
     * 
     * @param a_host - Host name or IP address
     * @param a_port - Port number
     * @param a_sock_type - zeromq socket type
     * @param a_bind - Bind socket if true; otherwise connect
     * @param a_sec_ctx - Optional security settings
     * @param a_zmq_cxt - Optional zeromq context (uses shared context if omitted)
     */
    MsgComm( const std::string & a_host, uint16_t a_port, SockType a_sock_type, bool a_bind, const SecurityContext * a_sec_ctx = 0, void * a_zmq_cxt = 0 );

    /**
     * @brief Destroy the Msg Comm object
     * 
     * Note: does not free the zeromq context.
     */
    ~MsgComm();

    /**
    * @brief Disconnects then reconnects
    */
    void            reset();

    /**
     * @brief Send a message with optional context
     * 
     * @param a_msg - Message to send
     * @param a_context - Optional context value
     *
     * Serializes, then sends the message.
     */
    void            send( MsgBuf::Message & a_msg, uint16_t a_context = 0 );

    /**
     * @brief Send a message with UID and optional context
     * 
     * @param a_msg Message to send
     * @param a_uid - User identity string
     * @param a_context - Optional context value
     *
     * Serializes, then sends the message. This version of send is useful for
     * trusted agents that need to send messages an behalf of a user. The UID
     * is included in the message frame, but it is up to the receiver to decide
     * if the included UID will be used.
     */
    void            send( MsgBuf::Message & a_msg, const std::string & a_uid, uint16_t a_context = 0 );

    /**
     * @brief Sends a message buffer containing a pre-serialized message
     * 
     * @param a_message - Message buffer to send
     * @param a_proc_uid - Include UID in framing if true; otherwise omit UID
     *
     * This is a low-level send that accepts a message buffer that is already
     * serialized. The proc_uid param controls whether the UID field is sent
     * or not (this is typically only used by trusted agents).
     */
    void            send( MsgBuf & a_message, bool a_proc_uid = false );

    /**
     * @brief Receive a message and frame with optional timeout
     * 
     * @param a_msg - Message pointer to receive payload
     * @param a_frame - Frame instance to receive message frame
     * @param a_timeout - Optional timeout in milliseconds (0 = wait forever)
     * @return true if message received
     * @return false if timeout expires
     * 
     * Receive a message with framing information and optional timeout.
     * Malformed incoming messages or communication errors may throw
     * TraceExceptions. The receiver is responsible for freeing the memory
     * associated with the received message.
     */
    bool            recv( MsgBuf::Message *& a_msg, MsgBuf::Frame & a_frame, uint32_t a_timeout = 0 );

    /**
     * @brief Receive a message, frame, and UID with optional timeout
     * 
     * @param a_msg - Message pointer to receive payload
     * @param a_frame - Frame instance to receive message frame
     * @param a_uid - String to receive incoming UID
     * @param a_timeout - Optional timeout in milliseconds (0 = wait forever)
     * @return true if message received
     * @return false if timeout expires
     * 
     * Receive a message with framing information, UID, and optional timeout.
     * Malformed incoming messages or communication errors may throw
     * TraceExceptions. The receiver is responsible for freeing the memory
     * associated with the received message.
     */
    bool            recv( MsgBuf::Message *& a_msg, MsgBuf::Frame & a_frame, std::string & a_uid, uint32_t a_timeout = 0 );

    /**
     * @brief Receive a message into a MsgBuf instance with optional timeout
     * 
     * @param a_message - MsgBuf instance to receive message
     * @param a_proc_uid - If true, attempt to receive UID frame
     * @param a_timeout - Optional timeout in milliseconds (0 = wait forever)
     * @return true if message received
     * @return false if timeout expires
     *
     * Receive a message with framing information and optional UID into
     * specified MsgBuf instance. The received message is not unserialized.
     * Malformed incoming messages or communication errors may throw
     * TraceExceptions.
     */
    bool            recv( MsgBuf & a_message, bool a_proc_uid = false, uint32_t a_timeout = 0 );

    /**
     * @brief Starts a frontend to backend proxy router
     * 
     * @param a_backend - A MsgComm instance to serve as the backend connection
     *
     * This method is very similar to the built-in zeromq function "zmq_proxy";
     * however, this method is aware of ZAP handler injected User-ID metadata
     * and will extract and insert the UID (if found) into the framing of the
     * message sent to the backend connection.
     */
    void            proxy( MsgComm & a_backend );

    /**
     * @brief Get the Socket object
     * 
     * @return The underlying zeromq socket (void*)
     */
    void *          getSocket() { return m_socket; }

    /**
     * @brief Get the Poll Info object
     * 
     * @param a_poll_data - Poll structure to receive polling information for this connection
     *
     * Allows clients to perform their own polling outside of the recv method.
     */
    void            getPollInfo( zmq_pollitem_t  & a_poll_data );

    /**
     * @brief Get the class-chared zeromq context object
     * 
     * @return The zeromq context (void *)
     */
    static void *   getContext();

private:
    void            setupSecurityContext( const SecurityContext * a_sec_ctx );
    void            init( SockType a_sock_type, const SecurityContext * a_sec_ctx, void * a_zmq_cxt );

    void           *m_socket;
    bool            m_bound;
    std::string     m_address;
    zmq_pollitem_t  m_poll_item;
};

#endif // MSGCOMM_HPP
