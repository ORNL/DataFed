#include <iostream>
#include <stdexcept>

extern "C"
{
    #include <gssapi.h>
    #include <globus_gss_assist.h>
}

#include "sdmsclient.hpp"

using namespace std;

namespace SDMS
{

// Static methods and attributes

bool Client::m_initialized = false;

void Client::startup()
{
    if ( globus_module_activate( GLOBUS_GSI_GSS_ASSIST_MODULE ) != GLOBUS_SUCCESS )
        throw runtime_error("failed to activate Globus GSI GSS assist module");

    m_initialized = true;
}

void Client::shutdown()
{
    globus_module_deactivate( GLOBUS_GSI_GSS_ASSIST_MODULE );
    m_initialized = false;
}

// Class ctor/dtor

Client::Client( const std::string & a_server_host, uint32_t a_server_port )
: m_server_host(a_server_host), m_server_port(a_server_port)
{
    if ( !m_initialized )
        startup();

    //string          buf = "X509_USER_PROXY=/home/d3s/.globus/usercert.pem";
    //buf.value = globus_common_create_string("X509_USER_PROXY=", path);
    
    gss_buffer_desc buf;

    //buf.value = "X509_USER_PROXY=/home/d3s/.globus/usercert.pem";
    buf.value = globus_common_create_string("X509_USER_PROXY=%s", "/tmp/x509up_u4823" );
    buf.length = strlen((char*)buf.value);

    OM_uint32       min_stat;
    gss_cred_id_t   cred;

    OM_uint32 maj_stat = gss_import_cred(
        &min_stat,
        &cred,
        GSS_C_NO_OID,
        1, /* GSS_IMPEXP_MECH_SPECIFIC */
        &buf,
        0,
        NULL);

    globus_free(buf.value);

    if( maj_stat != GSS_S_COMPLETE )
    {
        throw runtime_error("failed to import credentials");
    }


    gss_name_t          name;
    OM_uint32           lifetime;
    gss_cred_usage_t    cred_usage;
    gss_OID_set         mechanisms;

    //if ( gss_inquire_cred( &min_stat, cred_id, &name, &lifetime, &cred_usage, &mechanisms )!= GSS_S_COMPLETE )
    if ( gss_inquire_cred( &min_stat, cred, &name, 0, 0, 0 )!= GSS_S_COMPLETE )
        throw runtime_error("failed to inquire credentials");

    gss_buffer_desc     name_buf = GSS_C_EMPTY_BUFFER;
    gss_OID             name_type;

    maj_stat = gss_display_name( &min_stat, name, &name_buf, &name_type );
    if ( maj_stat == GSS_S_COMPLETE )
    {
        cout << "cred name: " << (char*)name_buf.value << "\n";
        gss_release_buffer( &min_stat, &name_buf );
    }
}


Client::~Client()
{
}

// Methods

void
Client::doSomething()
{
    cout << "doing something\n";
}

}
