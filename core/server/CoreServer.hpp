#ifndef CORESERVER_HPP
#define CORESERVER_HPP

#include <memory>
#include <string>
#include <map>
#include <thread>
#include <mutex>
#include <unordered_map>
#include <condition_variable>
#include <stdint.h>
#include <unistd.h>
#include <sys/types.h>
#include "Config.hpp"
#include "IIdentityMap.hpp"
#include "ICoreServer.hpp"


namespace SDMS {
namespace Core {

class ClientWorker;

/**
 * The CoreServer class creates and manages all core services.
 *
 * The CoreServer class initializes and manages all of the worker threads of the core service
 * and serves as a message router for all in-coming messages (both client and other distributed
 * services). The various threads run by the CoreServer include client authentication, message
 * routing, background task processing, and maintenance functions.
 *
 * Most DataFed client and server communication is based on message-passing using Google protobuf
 * messages over encrypted ZeroMQ connections. The communication from the web client to the
 * DataFed web service, and the communication between the DatabaseAPI and ArangoDB is based on
 * JSON over HTTP/S. The CoreServer handles all ZeroMQ messaging and delegates the HTTP/S to
 * the web server and DatabaseAPI class.
 *
 * There are two ZeroMQ interfaces exposed by the CoreServer at the configured port and
 * port + 1. The former is a secure interface used for all non-local communication, and the latter
 * is insecure for use by trusted local processes. Messages received from either interface are
 * routed to the same worker threads for processing.
 *
 * The ICoreServer interface class exposes an authenticateClient method to client workers for
 * manual (password) and token-based authentication.
 */
class Server : public ICoreServer, public IIdentityMap
{
public:
    /// CoreServer constructor (uses Config singleton)
    Server();

    /// CoreServer destructor
    virtual ~Server();

    /// Disallow instance copying
    Server& operator=( const Server & ) = delete;

    /// Start and run Core service interfaces. This method does not return.
    void    run();

private:

    /// Map of client key to DataFed ID and expiration time
    typedef std::map<std::string,std::pair<std::string,time_t>> trans_client_map_t;

    /// Message request metrics - maps message type to count per metrics period
    typedef std::map<uint16_t,uint32_t> MsgMetrics_t;

    // IIdentityMap methods
    virtual bool hasKey( const std::string & public_key ) const noexcept final;
    virtual std::string getId( const std::string & public_key ) const noexcept final;

    void waitForDB();
    void authenticateClient( const std::string & a_cert_uid, const std::string & a_uid );
    void metricsUpdateMsgCount( const std::string & a_uid, uint16_t a_msg_type );
    bool isClientAuthenticated( const std::string & a_client_key, std::string & a_uid );
    void loadKeys( const std::string & a_cred_dir );
    void loadRepositoryConfig();
    void msgRouter();
    void ioSecure();
    void ioInsecure();
    void zapHandler();
    void dbMaintenance();
    void metricsThread();

    Config &                        m_config;               ///< Ref to configuration singleton
    std::thread                    m_io_secure_thread;     ///< Secure I/O thread handle
    std::thread                    m_io_insecure_thread;   ///< Insecure I/O thread handle
    mutable std::mutex                      m_trans_client_mutex;   ///< Mutex for transient client data access
    std::string                     m_pub_key;              ///< Public key for secure interface
    std::string                     m_priv_key;             ///< Private key for secure interface
    std::thread                   m_zap_thread;           ///< ZeroMQ client authentication (ZAP) thread
    trans_client_map_t              m_trans_auth_clients;   ///< List of transient authenticated clients
    std::unordered_map<std::string,std::string> m_trans_auth_clients_to_key; ///< List of transient authenticated clients as a map key is the public key value is the uid
    std::thread                    m_msg_router_thread;    ///< Main message router thread handle
    std::vector<std::shared_ptr<ClientWorker>>      m_workers;              ///< List of ClientWorker instances
    std::thread                   m_db_maint_thread;      ///< DB maintenance thread handle
    std::thread                   m_metrics_thread;       ///< Metrics gathering thread handle
    std::map<std::string,MsgMetrics_t> m_msg_metrics;       ///< Map of UID to message request metrics
    std::mutex                      m_msg_metrics_mutex;    ///< Mutex for metrics updates
};


}}

#endif
