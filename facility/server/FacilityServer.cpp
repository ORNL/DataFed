#include <iostream>
#include <stdexcept>

#include "unistd.h"
#include "sys/types.h"

#include <zmq.h>

extern "C"
{
    #include <gssapi.h>
    #include <globus_gss_assist.h>
}

#include "FacilityServer.hpp"

using namespace std;

namespace SDMS
{

// Static methods and attributes

bool FacilityServer::m_initialized = false;

void FacilityServer::startup()
{
    if ( globus_module_activate( GLOBUS_GSI_GSS_ASSIST_MODULE ) != GLOBUS_SUCCESS )
        throw runtime_error("failed to activate Globus GSI GSS assist module");

    m_initialized = true;
}

void FacilityServer::shutdown()
{
    globus_module_deactivate( GLOBUS_GSI_GSS_ASSIST_MODULE );
    m_initialized = false;
}

// Class ctor/dtor

FacilityServer::FacilityServer( const std::string & a_server_host, uint32_t a_server_port, uint32_t a_timeout )
: m_connection( a_server_host, a_server_port, Connection::Client ), m_timeout(a_timeout * 1000)
{
    if ( !m_initialized )
        startup();

    gss_buffer_desc buf;

    // Load GSI Proxy cert from /tmp/x509up_u<uid> where <uid> is the local process UID

    // Get uid
    uid_t uid = getuid();
    //cout << "uid = " << uid << "\n";

    string path = string("/tmp/x509up_u") + to_string( uid );

    buf.value = globus_common_create_string( "X509_USER_PROXY=%s", path.c_str() );
    buf.length = strlen((char*)buf.value);

    OM_uint32       min_stat;
    gss_cred_id_t   cred;

    OM_uint32 maj_stat = gss_import_cred( &min_stat, &cred, GSS_C_NO_OID, 1, &buf, 0, 0 );

    globus_free(buf.value);

    if( maj_stat != GSS_S_COMPLETE )
        throw runtime_error("Missing/invalid proxy credentials");

    gss_name_t          name;
    OM_uint32           lifetime;
    gss_cred_usage_t    cred_usage;
    gss_OID_set         mechanisms;

    //if ( gss_inquire_cred( &min_stat, cred_id, &name, &lifetime, &cred_usage, &mechanisms )!= GSS_S_COMPLETE )
    if ( gss_inquire_cred( &min_stat, cred, &name, 0, 0, 0 )!= GSS_S_COMPLETE )
        throw runtime_error("failed to inquire credentials");


    /*
    gss_buffer_desc     name_buf = GSS_C_EMPTY_BUFFER;
    gss_OID             name_type;

    maj_stat = gss_display_name( &min_stat, name, &name_buf, &name_type );
    if ( maj_stat == GSS_S_COMPLETE )
    {
        cout << "cred name: " << (char*)name_buf.value << "\n";
        gss_release_buffer( &min_stat, &name_buf );
    }
    */
}


FacilityServer::~FacilityServer()
{
}

// Methods

/**
 * @brief Client-server handshake and certificate exchange
 */
void
FacilityServer::hello()
{
    string msg = string("hello") + to_string( getpid() );
    cout << "sending " << msg << "\n";

    m_connection.send( msg.c_str(), msg.size() );

    Connection::MessageBuffer reply;
    if ( !m_connection.recv( reply, m_timeout ))
        throw runtime_error("Server did not reply.");

    if ( reply.msg_size != msg.size() || strncmp( reply.getMsg(), msg.c_str(), msg.size()) != 0 )
        throw runtime_error("Invalid reply from server.");
}


}
