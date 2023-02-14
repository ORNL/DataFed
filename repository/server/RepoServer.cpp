#include <fstream>
#include <time.h>
#include "DynaLog.hpp"
#include "RepoServer.hpp"
#include "Util.hpp"

#include "Version.pb.h"
#include "SDMS.pb.h"
#include "SDMS_Anon.pb.h"
#include "SDMS_Auth.pb.h"


#define timerDef() struct timespec _T0 = {0,0}, _T1 = {0,0}
#define timerStart() clock_gettime(CLOCK_REALTIME,&_T0)
#define timerStop() clock_gettime(CLOCK_REALTIME,&_T1)
#define timerElapsed() ((_T1.tv_sec - _T0.tv_sec) + ((_T1.tv_nsec - _T0.tv_nsec)/1.0e9))


using namespace std;
using namespace SDMS::Anon;
using namespace SDMS::Auth;

namespace SDMS {
namespace Repo {

#define SET_MSG_HANDLER(proto_id,msg,func)  m_msg_handlers[MsgBuf::findMessageType( proto_id, #msg )] = func


Server::Server() :
    m_config(Config::getInstance())
{
    // Register use of anon MAPI (for version check)
    REG_PROTO( SDMS::Anon );

    // Load keys from credential directory
    loadKeys();

    // Setup ZMQ security context
    m_config.sec_ctx.is_server = false;
    m_config.sec_ctx.public_key = m_pub_key;
    m_config.sec_ctx.private_key = m_priv_key;
    m_config.sec_ctx.server_key = m_core_key;
}


Server::~Server()
{
}

void
Server::run()
{
    checkServerVersion();

    DL_INFO( "Public/private MAPI starting on port " << m_config.port )

    // Create worker threads
    for ( uint16_t t = 0; t < m_config.num_req_worker_threads; ++t )
        m_req_workers.push_back( new RequestWorker( t+1 ));

    // Create secure interface and run message pump
    // NOTE: Normally ioSecure will not return
    ioSecure();

    // Clean-up workers
    vector<RequestWorker*>::iterator iwrk;

    for ( iwrk = m_req_workers.begin(); iwrk != m_req_workers.end(); ++iwrk )
        (*iwrk)->stop();

    for ( iwrk = m_req_workers.begin(); iwrk != m_req_workers.end(); ++iwrk )
        delete *iwrk;
}


void
Server::checkServerVersion()
{
    DL_INFO( "Checking core server connection and version" );

    VersionRequest      msg;
    MsgBuf::Message *   reply;
    MsgComm::SecurityContext sec_ctx;

    // Generate random security keys for anon version request to core server

    char pub_key[41];
    char priv_key[41];

    sec_ctx.is_server = false;
    sec_ctx.server_key = m_core_key;

    if ( zmq_curve_keypair( pub_key, priv_key ) != 0 )
        EXCEPT_PARAM( 1, "Temp security key generation failed: " << zmq_strerror( errno ));

    sec_ctx.public_key = pub_key;
    sec_ctx.private_key = priv_key;

    for( int i = 0; i < 10; i++ )
    {
        MsgComm comm( m_config.core_server, MsgComm::DEALER, false, &sec_ctx );

        MsgBuf send_request;
        send_request.serialize(msg);
        send_request.setUID(pub_key);

        MsgBuf buffer;

        //comm.send( msg );
        comm.send( send_request, true );

        if ( !comm.recv( buffer, false, 20000 ))
        {
            DL_ERROR( "Timeout waiting for response from core server: " << m_config.core_server );
            cerr.flush();
        }
        else
        {
            reply = buffer.unserialize();

            VersionReply * ver_reply = dynamic_cast<VersionReply*>( reply );
            if ( ver_reply == 0 )
            {
                EXCEPT_PARAM( 1, "Invalid response from core server: " << m_config.core_server );
            }
            
            if ( ver_reply->major() != VER_MAJOR || ver_reply->mapi_major() != VER_MAPI_MAJOR ||
                VER_MAPI_MINOR > (int)ver_reply->mapi_minor() || ver_reply->mapi_minor() > VER_MAPI_MINOR + 9 )
            {
                EXCEPT_PARAM( 1, "Incompatible server version (" << ver_reply->major() << "." << ver_reply->mapi_major() << "." << ver_reply->mapi_minor() << ")" );
            }
            else if ( ver_reply->repo() > VER_REPO )
            {
                DL_WARN( "A newer repository server version is available (" << ver_reply->major() << "." << ver_reply->mapi_major() << "." << ver_reply->mapi_minor() << ":" << ver_reply->repo() << ")" );
            }

            DL_INFO( "Core server connection OK." );
            return;
        }
    }

    EXCEPT_PARAM( 1, "Could not connect with core server: " << m_config.core_server );
}



void
Server::loadKeys()
{
    string fname =  m_config.cred_dir + "datafed-repo-key.pub";
    ifstream inf( fname.c_str() );
    if ( !inf.is_open() || !inf.good() )
        EXCEPT_PARAM( 1, "Could not open file: " << fname );
    inf >> m_pub_key;
    inf.close();

    fname = m_config.cred_dir + "datafed-repo-key.priv";
    inf.open( fname.c_str() );
    if ( !inf.is_open() || !inf.good() )
        EXCEPT_PARAM( 1, "Could not open file: " << fname );
    inf >> m_priv_key;
    inf.close();

    fname = m_config.cred_dir + "datafed-core-key.pub";
    inf.open( fname.c_str() );
    if ( !inf.is_open() || !inf.good() )
        EXCEPT_PARAM( 1, "Could not open file: " << fname );
    inf >> m_core_key;
    inf.close();
}


void
Server::ioSecure()
{
    try
    {
        MsgComm frontend( "tcp://*:" + to_string(m_config.port), MsgComm::ROUTER, true, &m_config.sec_ctx );
        MsgComm backend( "inproc://workers", MsgComm::DEALER, true );

        frontend.proxy( backend );
    }
    catch( exception & e)
    {
        DL_ERROR( "Exception in secure interface: " << e.what() )
    }
}

}}
