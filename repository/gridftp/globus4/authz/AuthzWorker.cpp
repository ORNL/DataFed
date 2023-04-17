#include <string>
#include <fstream>
#include <cstdlib>

//#include "MsgBuf.hpp"
//#include "MsgComm.hpp"
#include "TraceException.hpp"
#include "Util.hpp"
#define DEF_DYNALOG
#include "DynaLog.hpp"

#include "SDMS.pb.h"
#include "SDMS_Anon.pb.h"
#include "SDMS_Auth.pb.h"
#include "Version.pb.h"

#include "Config.h"

using namespace std;
using namespace SDMS::Anon;
using namespace SDMS::Auth;


namespace SDMS
{

class AuthzWorker
{
public:
    AuthzWorker( struct Config * a_config ) :
        m_config( a_config ), m_test_path_len( strlen( a_config->test_path ))
    {
        //REG_PROTO( SDMS::Anon );
        //REG_PROTO( SDMS::Auth );
    }

    ~AuthzWorker()
    {
    }

    AuthzWorker& operator=( const AuthzWorker & ) = delete;

    int checkAuth( char * client_id, char * path, char * action )
    {
        DL_DEBUG("Checking auth for " << client_id << " in " << path );

        if ( m_test_path_len > 0 && strncmp( path, m_config->test_path, m_test_path_len ) == 0 )
        {
            DL_INFO("Allowing request within TEST PATH");
            return 0;
        }

        int result = 1;

        //MsgComm::SecurityContext sec_ctx;
        //sec_ctx.is_server = false;
        //sec_ctx.public_key = m_config->pub_key;
        //sec_ctx.private_key = m_config->priv_key;
        //sec_ctx.server_key = m_config->server_key;

        Auth::RepoAuthzRequest  auth_req;
//        MsgBuf::Message *       reply;
 //       MsgBuf::Frame           frame;

//        MsgComm authzcomm(m_config->server_addr, MsgComm::DEALER, false, &sec_ctx );

        auth_req.set_repo(m_config->repo_id);
        auth_req.set_client(client_id);
        auth_req.set_file(path);
        auth_req.set_action(action);

        //authzcomm.send(auth_req);

/*        if ( !authzcomm.recv( reply, frame, m_config->timeout ))
        {
            EXCEPT(1,"Core service did no respond");
        }
        else
        {
            DL_DEBUG( "Got response, msg type: " << frame.getMsgType() );

            Anon::NackReply * nack = dynamic_cast<Anon::NackReply*>( reply );
            if ( !nack )
            {
                result = 0;
            }
            else
            {
                DL_DEBUG("Got NACK reply");
            }

            delete reply;
        }*/
        return result;
    }

private:
    struct Config *     m_config;
    size_t              m_test_path_len;
};

} // End namespace SDMS


extern "C"
{
    const char * getVersion()
    {
        static std::string ver_str = std::to_string(VER_MAJOR) + "." + std::to_string(VER_MAPI_MAJOR) + "." + std::to_string(VER_MAPI_MINOR) + ":" + std::to_string(VER_REPO);

        return ver_str.c_str();
    }

    int checkAuthorization( char * client_id, char * object, char * action, struct Config * config )
    {
        DL_SET_LEVEL( DynaLog::DL_INFO_LEV );
        DL_SET_CERR_ENABLED(false);
        DL_SET_SYSDL_ENABLED(true);

        DL_DEBUG( "AuthzWorker checkAuthorization " << client_id << ", " << object << ", " << action );

        int result = -1;

        try
        {
            SDMS::AuthzWorker worker( config );
            result = worker.checkAuth( client_id, object, action );
        }
        catch( TraceException &e )
        {
            DL_ERROR( "AuthzWorker exception: " << e.toString() );
        }
        catch( exception &e )
        {
            DL_ERROR( "AuthzWorker exception: " << e.what() );
        }

        return result;
    }
}

