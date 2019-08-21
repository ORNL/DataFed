#include <string>
#include <map>
#include <thread>
#include <mutex>
#include <condition_variable>
#include <stdint.h>
#include <unistd.h>

#include "MsgBuf.hpp"
#include "MsgComm.hpp"

#include <unistd.h>
#include <fstream>
#include <time.h>
#include <boost/filesystem.hpp>
#include "DynaLog.hpp"
#include "Util.hpp"

#include "SDMS.pb.h"
#include "SDMS_Anon.pb.h"
#include "SDMS_Auth.pb.h"
#include "Version.pb.h"

using namespace std;
using namespace SDMS::Anon;
using namespace SDMS::Auth;

#include "libsdms_gsi_authz.h"

namespace SDMS
{

class AuthzWorker
{
public:
    AuthzWorker( const std::string & a_config_file )
    {
        string cred_dir = "/home/cades/.sdms/";
        m_timeout = 5000;

        if ( a_config_file.size() )
        {
            ifstream configFile(a_config_file);
            string line,key,val;

            if ( !configFile.is_open() )
                EXCEPT_PARAM(0,"Could not open config file: " << a_config_file );

            while( getline( configFile, line ))
            {
                if ( line.length() < 4 || line.at(0) == '#')
                    continue;

                istringstream iss(line);

                iss >> key >> val;

                if (key == "repo")
                    m_repo = val;
                else if (key == "url")
                    m_url = val;
                else if (key == "cred_dir")
                    cred_dir = val;
                else if (key == "timeout")
                    m_timeout = stoi(val);
                else if (key == "test_path" )
                    m_test_path = val;
            }
            configFile.close();
        }

        loadKeys( cred_dir );

        REG_PROTO( SDMS::Anon );
        REG_PROTO( SDMS::Auth );
    }

    ~AuthzWorker()
    {
    }

    AuthzWorker& operator=( const AuthzWorker & ) = delete;

    int run( char * client_id, char * path, char * action )
    {
        DL_INFO("Checking auth for " << client_id << " in " << path );
        if ( m_test_path.size() > 0 && strncmp( path, m_test_path.c_str(), m_test_path.size() ) == 0 )
        {
            DL_INFO("Auto-passing request for test-path");
            return 0;
        }

        int result = 1;

        MsgComm::SecurityContext sec_ctx;
        sec_ctx.is_server = false;
        sec_ctx.public_key = m_pub_key; //"B8Bf9bleT89>9oR/EO#&j^6<F6g)JcXj0.<tMc9[";
        sec_ctx.private_key = m_priv_key; //"k*m3JEK{Ga@+8yDZcJavA*=[<rEa7>x2I>3HD84U";
        sec_ctx.server_key = m_core_key; //"B8Bf9bleT89>9oR/EO#&j^6<F6g)JcXj0.<tMc9[";
        
        Auth::RepoAuthzRequest  auth_req;
        MsgBuf::Message *       reply;
        MsgBuf::Frame           frame;

        MsgComm authzcomm(m_url, MsgComm::DEALER, false, &sec_ctx );

        auth_req.set_repo(m_repo);
        auth_req.set_client(client_id);
        auth_req.set_file(path);
        auth_req.set_action(action);
        
        authzcomm.send(auth_req);

        if ( !authzcomm.recv( reply, frame, m_timeout ))
        {
            EXCEPT(0,"Core service did no respond");
        }
        else
        {
            DL_INFO("Got response, msg type: " << frame.getMsgType() );
            Anon::NackReply * nack = dynamic_cast<Anon::NackReply*>( reply );
            if ( !nack )
            {
                DL_INFO("Not a nack!");
                result = 0;
            }
            else
            {
                DL_INFO("NACK!");
            }

            delete reply;
        }
        return result;
    }

private:
    void loadKeys( const std::string & a_cred_dir )
    {
        string fname = a_cred_dir + "sdms-repo-key.pub";
        ifstream inf( fname.c_str() );
        if ( !inf.is_open() || !inf.good() )
            EXCEPT_PARAM( 1, "Could not open file: " << fname );
        inf >> m_pub_key;
        inf.close();

        fname = a_cred_dir + "sdms-repo-key.priv";
        inf.open( fname.c_str() );
        if ( !inf.is_open() || !inf.good() )
            EXCEPT_PARAM( 1, "Could not open file: " << fname );
        inf >> m_priv_key;
        inf.close();

        fname = a_cred_dir + "sdms-core-key.pub";
        inf.open( fname.c_str() );
        if ( !inf.is_open() || !inf.good() )
            EXCEPT_PARAM( 1, "Could not open file: " << fname );
        inf >> m_core_key;
        inf.close();
    }


    MsgBuf                          m_msg_buf;
    std::string                     m_pub_key;
    std::string                     m_priv_key;
    std::string                     m_core_key;
    std::string                     m_repo;
    std::string                     m_url;
    std::string                     m_test_path;
    uint32_t                        m_timeout;
};

} // End namespace SDMS

extern "C"
{
    const char * getVersion()
    {
        static std::string ver_str = std::to_string(VER_MAJOR) + "." + std::to_string(VER_MINOR) + "." + std::to_string(VER_BUILD);

        DL_ERROR( "AuthzWorker getVersion" );

        return ver_str.c_str();
    }

    int authzdb(char * client_id, char * object, char * action)
    {
        DL_ERROR( "AuthzWorker authzdb" );

        int result = -1;

        DL_SET_LEVEL(DynaLog::DL_DEBUG_LEV);
        DL_SET_CERR_ENABLED(false);
        DL_SET_SYSDL_ENABLED(true);

        try
        {
            SDMS::AuthzWorker server( "/etc/datafed/datafed-authz.conf" );
            result = server.run(client_id, object, action);
        }
        catch( TraceException &e )
        {
            DL_ERROR( "AuthzWorker exception: " << e.toString() );
            //cout << "Exception 1" << e.toString() << endl;
        }
        catch( exception &e )
        {
            DL_ERROR( "AuthzWorker exception: " << e.what() );
            //cout << "Exception 2" << e.what() << endl;
        }
        return result;
    }
}

