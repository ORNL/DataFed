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

#define SET_MSG_HANDLER(proto_id,msg,func)  m_msg_handlers[(proto_id << 8 ) | MsgBuf::findMessageType( proto_id, #msg )] = func

AuthzWorker::AuthzWorker( const std::string & a_authz_file )
{
    string line;
    
    string cred_dir = "home/cades/.sdms/";
    m_timeout = 5000;
    
    ifstream configFile(a_authz_file);
    if(configFile.is_open()) {
        while(getline(configFile,line)) {
            if (line.length() < 4 || line.at(0) == '#') continue;
            else {
                istringstream iss(line);
                string token;
                iss >> token;
                if (token == "repo") {
                    iss >> token;
                    m_repo = token;
                }
                if (token == "url") {
                    iss >> token;
                    m_url = token;
                }
                if (token == "cred_dir") {
                    iss >> token;
                    cred_dir = token;
                }
                if (token == "timeout") {
                    iss >> token;
                    m_timeout = stoi(token);
                }
            }
        }
        configFile.close();
    }
    else {
        //cout << "Error opening file.\n";
    }

    loadKeys( cred_dir );

    uint8_t proto_id = REG_PROTO( SDMS::Anon );

    SET_MSG_HANDLER( proto_id, StatusRequest, &AuthzWorker::procStatusRequest );

}

AuthzWorker::~AuthzWorker()
{
}

int 
AuthzWorker::run(char * client_id, char * object, char * action)
{
    int result = 1;

    MsgComm::SecurityContext sec_ctx;
    sec_ctx.is_server = false;
    sec_ctx.public_key = m_pub_key; //"B8Bf9bleT89>9oR/EO#&j^6<F6g)JcXj0.<tMc9[";
    sec_ctx.private_key = m_priv_key; //"k*m3JEK{Ga@+8yDZcJavA*=[<rEa7>x2I>3HD84U";
    sec_ctx.server_key = m_core_key; //"B8Bf9bleT89>9oR/EO#&j^6<F6g)JcXj0.<tMc9[";
    
    Auth::RepoAuthzRequest  auth_req;
    MsgBuf::Message *       reply;
    MsgBuf::Frame           frame;
    string                  uid;

    MsgComm authzcomm(m_url, MsgComm::DEALER, false, &sec_ctx );

    auth_req.set_repo(m_repo);
    auth_req.set_client(client_id);
    auth_req.set_file(object);
    auth_req.set_action(action);
    
    authzcomm.send(auth_req);

    if ( !authzcomm.recv( reply, uid, frame, m_timeout ))
    {
        //cout << "Core AuthzWorker did not respond\n";
    }
    else
    {
        Anon::NackReply * nack = dynamic_cast<Anon::NackReply*>( reply );
        if ( !nack )
            result = 0;
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



}
