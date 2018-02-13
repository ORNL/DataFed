#ifndef SDMS_CLIENT_HPP
#define SDMS_CLIENT_HPP

#include <memory>
#include <stdint.h>
#include "SDMS.pb.h"

#define Check(Var,Src,Cls) Cls * Var = dynamic_cast<Cls*>(Src)

namespace SDMS {
namespace Facility {

typedef std::shared_ptr<UserDataReply> spUserDataReply;
typedef std::shared_ptr<RecordDataReply> spRecordDataReply;
typedef std::shared_ptr<CollDataReply> spCollDataReply;


enum DestFlags : uint16_t
{
    CREATE_PATH     = 0x01,
    BACKUP          = 0x02,
    OVERWRITE       = 0x04
};


/**
 * @class Client
 * @author Dale V. Stansberry
 * @date 16/01/18
 * @brief Provides client-side (facility) C++ API to SDMS functions
 * 
 * The Client class provides a simple API for client-side programs to utilize
 * SDMS administrative functions provided by the specified facility SDMS server.
 * The API includes data management methods but does not include any data access
 * methods - data acces is provided by gridftp (or globus_url_copy).
 * 
 * The API presented by the Client class is low-level and not intended for
 * direct use by most end-users (advanced users may write their own SDMS
 * clients/tools using this API). This API is used by both the SDMS command-line
 * tools and the Python wrapper library.
 * 
 * On construction, a Client class instance loads client X.509 proxy certificate
 * from the specified path (default /tmp) and uses this certificate to log-in
 * to the facility SDMS server. After successful log-in, the API methods may be
 * used as needed for the durration of the session. The session ends when the
 * client logs-out, or the connection is lost.
 */
class Client
{
public:

    Client( const std::string & a_host, uint32_t a_port, uint32_t a_timeout = 30 );
    Client( const Client & ) = delete;
    ~Client();

    Client& operator=( const Client & ) = delete;

    void                start();

    bool                test( size_t a_iter );
    std::string         text( const std::string & a_message );

    ServiceStatus       status();
    void                ping();
    spUserDataReply     userView( const std::string & a_user = "" );
    spUserDataReply     userList( bool a_details = false, uint32_t a_offset = 0, uint32_t a_count = 0 );
    spRecordDataReply   recordView( const std::string & a_id );
    spCollDataReply     collList( const std::string & a_user = std::string(), bool a_details = false, uint32_t a_offset = 0, uint32_t a_count = 0 );

    std::string         getData( const std::string & a_data_id, const std::string & a_dest_path, uint16_t a_dest_flags = 0 );
    TransferStatus      getDataTransferStatus( const std::string & a_transfer_id );

private:
    class ClientImpl;

    ClientImpl * m_impl;
};

}}

#endif
