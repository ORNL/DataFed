#ifndef SDMS_CLIENT_HPP
#define SDMS_CLIENT_HPP

#include <memory>
#include <stdint.h>
#include "SDMS.pb.h"
#include "SDMS_Anon.pb.h"
#include "SDMS_Auth.pb.h"

#define Check(Var,Src,Cls) Cls * Var = dynamic_cast<Cls*>(Src)

namespace SDMS {
namespace Facility {

typedef std::shared_ptr<Auth::UserDataReply> spUserDataReply;
typedef std::shared_ptr<Auth::RecordDataReply> spRecordDataReply;
typedef std::shared_ptr<Auth::CollDataReply> spCollDataReply;
typedef std::shared_ptr<Auth::XfrDataReply> spXfrDataReply;
typedef std::shared_ptr<Auth::ACLDataReply> spACLDataReply;
typedef std::shared_ptr<Auth::GroupDataReply> spGroupDataReply;

enum DestFlags : uint16_t
{
    CREATE_PATH     = 0x01,
    BACKUP          = 0x02,
    OVERWRITE       = 0x04
};

enum GenFlags
{
    GEN_X509    = 0x01,
    GEN_SSH     = 0x02
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

    Client( const std::string & a_host, uint32_t a_port, uint32_t a_timeout, const std::string & a_cred_path, const std::string & a_unit, bool a_load_certs );
    Client( const Client & ) = delete;
    ~Client();

    Client& operator=( const Client & ) = delete;

    void                start();
    void                stop();

    bool                test( size_t a_iter );

    void                authenticate( const std::string & a_password );
    void                generateCredentials();
    void                generateKeys( const std::string & a_outfile );
    void                getPublicKey( const std::string & a_outfile );

    void                setup();

    ServiceStatus       status();
    spUserDataReply     userView( const std::string & a_user = "" );
    spUserDataReply     userList( bool a_details = false, uint32_t a_offset = 0, uint32_t a_count = 0 );
    spRecordDataReply   recordCreate( const std::string & a_title, const char * a_desc = 0, const char * a_alias = 0, const char * a_metadata = 0, const char * a_proj_id = 0, const char * a_coll_id = 0 );
    spRecordDataReply   recordUpdate( const std::string & a_id, const char * a_title = 0, const char * a_desc = 0, const char * a_alias = 0, const char * a_metadata = 0, bool a_md_merge = true, const char * a_proj_id = 0 );
    spRecordDataReply   recordView( const std::string & a_id );
    spRecordDataReply   recordFind( const std::string & a_query );
    spCollDataReply     collList( const std::string & a_user = std::string(), bool a_details = false, uint32_t a_offset = 0, uint32_t a_count = 0 );
    spCollDataReply     collRead( const std::string & a_coll_id, CollMode a_mode = CM_ALL, bool a_details = false, uint32_t a_offset = 0, uint32_t a_count = 0 );

    spXfrDataReply      pullData( const std::string & a_data_id, const std::string & a_local_path );
    spXfrDataReply      pushData( const std::string & a_data_id, const std::string & a_local_path );
    //spXfrDataReply      pushData( const std::string & a_local_path, std::string & a_data_id, const char * a_title, const char * a_desc = 0, const char * a_alias = 0, const char * a_metadata = 0, const char * a_proj_id = 0, const char * a_coll_id = 0 );
    spXfrDataReply      xfrView( const std::string & a_transfer_id );
    spACLDataReply      aclView( const std::string & a_id );
    void                aclUpdate( const std::string & a_id, const std::string & a_rules );

    spGroupDataReply    groupCreate( const std::string & a_group_id, const char * a_title = 0, const char * a_desc = 0 );
    spGroupDataReply    groupUpdate( const std::string & a_group_id, const char * a_title = 0, const char * a_desc = 0 );
    void                groupDelete( const std::string & a_group_id );
    spGroupDataReply    groupList();
    spGroupDataReply    groupView( const std::string & a_group_id );
    spGroupDataReply    groupAdd( const std::string & a_group_id, const std::vector<std::string> & a_uids );
    spGroupDataReply    groupRemove( const std::string & a_group_id, const std::vector<std::string> & a_uids );

    void                collectionAdd( const std::string & a_coll_id, const std::string & a_item_id );
    void                collectionRemove( const std::string & a_coll_id, const std::string & a_item_id );

private:
    class ClientImpl;

    ClientImpl * m_impl;
};

}}

#endif
