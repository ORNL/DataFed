#include <unistd.h>
#include <fstream>
#include <time.h>
#include <boost/filesystem.hpp>
#include "DynaLog.hpp"
#include "AuthzWorker.hpp"
#include "Util.hpp"

#include "SDMS.pb.h"
#include "SDMS_Anon.pb.h"
#include "SDMS_Auth.pb.h"

using namespace std;
using namespace SDMS::Anon;
using namespace SDMS::Auth;

namespace SDMS {

//#define SET_MSG_HANDLER(proto_id,msg,func)  m_msg_handlers[(proto_id << 8 ) | MsgBuf::findMessageType( proto_id, #msg )] = func

AuthzWorker::AuthzWorker( const std::string & a_config_file )
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

AuthzWorker::~AuthzWorker()
{
}

int 
AuthzWorker::run(char * client_id, char * path, char * action)
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

void
AuthzWorker::loadKeys( const std::string & a_cred_dir )
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

#if 0

#define PROC_MSG_BEGIN( msgclass, replyclass ) \
msgclass *request = 0; \
::google::protobuf::Message *base_msg = m_msg_buf.unserialize(); \
if ( base_msg ) \
{ \
    request = dynamic_cast<msgclass*>( base_msg ); \
    if ( request ) \
    { \
        DL_TRACE( "Rcvd: " << request->DebugString()); \
        replyclass reply; \
        try \
        {

#define PROC_MSG_END \
            m_msg_buf.serialize( reply ); \
        } \
        catch( TraceException &e ) \
        { \
            DL_WARN( e.toString() ); \
            NackReply nack; \
            nack.set_err_code( (ErrorCode) e.getErrorCode() ); \
            nack.set_err_msg( e.toString() ); \
            m_msg_buf.serialize( nack ); \
        } \
        catch( exception &e ) \
        { \
            DL_WARN( e.what() ); \
            NackReply nack; \
            nack.set_err_code( ID_INTERNAL_ERROR ); \
            nack.set_err_msg( e.what() ); \
            m_msg_buf.serialize( nack ); \
        } \
        catch(...) \
        { \
            DL_WARN( "unkown exception while processing message!" ); \
            NackReply nack; \
            nack.set_err_code( ID_INTERNAL_ERROR ); \
            nack.set_err_msg( "Unknown exception type" ); \
            m_msg_buf.serialize( nack ); \
        } \
    } \
    else { \
        DL_ERROR( "dynamic cast of msg buffer failed!" );\
    } \
    delete base_msg; \
} \
else { \
    DL_ERROR( "buffer parse failed due to unregistered msg type." ); \
}


void
AuthzWorker::procStatusRequest()
{
    PROC_MSG_BEGIN( Anon::StatusRequest, Anon::StatusReply )

    //cout << "Repo: status request\n";

    reply.set_status( SS_NORMAL );

    PROC_MSG_END
}
#endif

}
