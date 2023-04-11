
// Local private authz includes
#include "AuthzWorker.hpp"

// Common public includes
#include "CommunicatorFactory.hpp"
#include "CredentialFactory.hpp"
#include "ICommunicator.hpp"
#include "IMessage.hpp"
#include "MessageFactory.hpp"
#include "SocketOptions.hpp"
#include "TraceException.hpp"
#include "Util.hpp"
#define DEF_DYNALOG
#include "DynaLog.hpp"

// Protobuf includes
#include "SDMS.pb.h"
#include "SDMS_Anon.pb.h"
#include "SDMS_Auth.pb.h"
#include "Version.pb.h"

// Standard includes
#include <string>
#include <fstream>
#include <cstdlib>
#include <syslog.h>

//#include "MsgBuf.hpp"
//#include "MsgComm.hpp"

using namespace std;
using namespace SDMS::Anon;
using namespace SDMS::Auth;


namespace SDMS {

    string loadKeyFile( const std::string & filename ) {
        ifstream inf( filename.c_str() );
        if ( !inf.is_open() || !inf.good() )
            EXCEPT_PARAM( 1, "Could not open file: " << filename );
        string key;
        inf >> key;
        inf.close();
        return key;
    }

    void AuthzWorker::init() {
        const char * cfg_file = getenv( "DATAFED_AUTHZ_CFG_FILE" );

        AuthzWorker::m_timeout = 10000;

        if ( !cfg_file ) {
            DL_INFO("DATAFED_AUTHZ_CFG_FILE environment variable not set. Attempting to read from default location in /opt/datafed/authz/datafed-authz.cfg");
            cfg_file = "/opt/datafed/authz/datafed-authz.cfg";
        }
            
        DL_INFO( "Reading config file: " << cfg_file );

        ifstream configFile(cfg_file);

        if ( !configFile.is_open() )
            EXCEPT_PARAM( 1, "Could not open authz config file: " << cfg_file );

        string line,key,val;
        size_t eq, lc = 0;

        std::unordered_map<CredentialType, std::string> cred_options;

        while( getline( configFile, line ))
        {
            lc++;

            if ( line.length() == 0 || line.at(0) == '#')
                continue;

            eq = line.find_first_of("=");

            if ( eq == string::npos )
                EXCEPT_PARAM( 1, "Invalid syntax in config file at line " << lc );

            key = line.substr(0,eq);
            val = line.substr(eq+1);

            if (key == "repo_id") {
                m_repo_id = val;
            } else if (key == "server_address") {
                m_server_addr = val;
            } else if (key == "user") {
                m_user = val;
            } else if (key == "pub_key") {
                //m_pub_key = loadKeyFile( val );
                cred_options[CredentialType::PUBLIC_KEY] = loadKeyFile( val);
            } else if (key == "priv_key") {
                //m_priv_key = loadKeyFile( val );
                cred_options[CredentialType::PRIVATE_KEY] = loadKeyFile( val);
            } else if (key == "server_key") {
                //m_server_key = loadKeyFile( val );
                cred_options[CredentialType::SERVER_KEY] = loadKeyFile( val);
            } else if (key == "timeout") {
                m_timeout = stoi(val);
            }else if (key == "test_path" ) {
                m_test_path = val;
            } else {
                EXCEPT_PARAM( 1, "Invalid key \"" << key << "\"in config file at line " << lc );
            }
        }

        configFile.close();

        string miss;

        if ( !m_repo_id.size() )
            miss += " repo_id";
        if ( cred_options.count(CredentialType::SERVER_KEY) == 0 ) {
            miss += " server_address";
        } else {
            if(cred_options.at(CredentialType::SERVER_KEY).size() == 0 ){
              miss += " server_address";
            }
        }
        if ( cred_options.count(CredentialType::PUBLIC_KEY) == 0 ) {
            miss += " pub_key";
        } else {
            if(cred_options.at(CredentialType::PUBLIC_KEY).size() == 0 ){
              miss += " pub_key";
            }
        }
        if ( cred_options.count(CredentialType::PRIVATE_KEY) == 0 ) {
            miss += " priv_key";
        } else {
            if(cred_options.at(CredentialType::PRIVATE_KEY).size() == 0 ){
              miss += " priv_key";
            }
        }
        if ( miss.size() )
            EXCEPT_PARAM( 1, "Missing required configuration items:" << miss );

        CredentialFactory cred_factory;
        m_sec_ctx = cred_factory.create(ProtocolType::ZQTP, cred_options);


    }

  /*  AuthzWorker::AuthzWorker() 
    {
            //REG_PROTO( SDMS::Anon );
        //REG_PROTO( SDMS::Auth );
    }*/

    const char * AuthzWorker::user() { 
      return m_user.c_str();
    }

    int AuthzWorker::checkAuth( char * client_id, char * path, char * action )
    {
        DL_DEBUG("AuthWorker.cpp Checking auth for " << client_id << " in " << path );

        if ( m_test_path.size() > 0 && strncmp( path, m_test_path.c_str(), m_test_path.size() ) == 0 )
        {
            DL_INFO("AuthWorker.cpp Allowing request within TEST PATH");
            return 0;
        }

        //int result = 1;

        //MsgComm::SecurityContext sec_ctx;
        //sec_ctx.is_server = false;
        
        //MsgBuf::Message *       reply;
        //MsgBuf::Frame           frame;

        DL_INFO("AuthWorker.cpp Sending authzcomm");


    //sec_ctx.public_key = pub_key;
    //sec_ctx.private_key = priv_key;

    std::string authz_thread_id = "authz_client_socket";
    auto client = [&](
        const std::string & socket_id,
        const std::string & address,
        ICredentials & credentials
        ) {
      /// Creating input parameters for constructing Communication Instance
      AddressSplitter splitter(address);
      SocketOptions socket_options;
      socket_options.scheme = splitter.scheme();
      socket_options.class_type = SocketClassType::CLIENT; 
      socket_options.direction_type = SocketDirectionalityType::BIDIRECTIONAL; 
      socket_options.communication_type = SocketCommunicationType::ASYNCHRONOUS;
      socket_options.connection_life = SocketConnectionLife::INTERMITTENT;
      socket_options.protocol_type = ProtocolType::ZQTP; 
      socket_options.connection_security = SocketConnectionSecurity::SECURE;
      socket_options.host = splitter.host();
      socket_options.port = splitter.port();
      //socket_options.port = 1341;
      socket_options.local_id = socket_id;

      //auto credentials = cred_factory.create(ProtocolType::ZQTP, cred_options);

      uint32_t timeout_on_receive = 20000;
      long timeout_on_poll = 20000;

      CommunicatorFactory comm_factory;
      // When creating a communication channel with a server application we need
      // to locally have a client socket. So though we have specified a client
      // socket we will actually be communicating with the server.
      return comm_factory.create(
          socket_options,
          credentials,
          timeout_on_receive,
          timeout_on_poll);
  }(authz_thread_id, m_server_addr, *m_sec_ctx);



        //MsgComm authzcomm(m_server_addr, MsgComm::DEALER, false, &sec_ctx );
 
        auto auth_req = std::make_unique<Auth::RepoAuthzRequest>();//  auth_req;
       	string val1 = string("m_repo_id is ") + m_repo_id;	
	      string val2 = string("path is") + path;
        DL_INFO(val1);
        DL_INFO(val2);
        auth_req->set_repo(m_repo_id);
        auth_req->set_client(client_id);
        auth_req->set_file(path);
        auth_req->set_action(action);
        
        DL_INFO("AuthWorker.cpp Sending message");

        MessageFactory msg_factory;
        auto message = msg_factory.create(MessageType::GOOGLE_PROTOCOL_BUFFER);
        message->set(MessageAttribute::KEY, m_pub_key);
        message->setPayload(std::move(auth_req));
        //MsgBuf send_request;
        //send_request.serialize(auth_req);
        //send_request.setUID(m_pub_key);

        //authzcomm.send(auth_req);
        client->send(*message);

        auto response = client->receive(MessageType::GOOGLE_PROTOCOL_BUFFER);
        if( response.time_out ) {
            DL_INFO("AuthWorker.cpp Core service did not respond.");
            EXCEPT(1,"Core service did no respond");
        } else if( response.error ) {
            DL_INFO("AuthWorker.cpp there was an error when communicating with the core service.");
        } else {
            auto payload = std::get<google::protobuf::Message*>(response.message->getPayload());
            Anon::NackReply * nack = dynamic_cast<Anon::NackReply*>( payload );
            if ( !nack ){
                return 0;
            }else{
                DL_DEBUG("Got NACK reply");
            }
        }
        return 1;
    }
        /*if ( !authzcomm.recv( reply, frame, m_timeout ))
        {
            DL_INFO("AuthWorker.cpp Core service did not respond.");
            EXCEPT(1,"Core service did no respond");
        }
        else
        {
            DL_DEBUG( "Got response, msg type: " << frame.getMsgType() );
*/
/*            Anon::NackReply * nack = dynamic_cast<Anon::NackReply*>( reply );
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
        //return result;
    //}


} // End namespace SDMS

extern "C"
{
    const char * getVersion()
    {
        static std::string ver_str = std::to_string(VER_MAJOR) + "." + std::to_string(VER_MAPI_MAJOR) + "." + std::to_string(VER_MAPI_MINOR) + ":" + std::to_string(VER_REPO);

        return ver_str.c_str();
    }

    int initAuthzConfig() {
      try {
        SDMS::AuthzWorker::init();
        return 0;
      } catch (...) {
        return 1;
      }
    }

    const char * getLocalUserName() {
      return SDMS::AuthzWorker::user();
    }

    int checkAuthorization( char * client_id, char * object, char * action )
    {
        DL_SET_LEVEL( DynaLog::DL_INFO_LEV );
        DL_SET_CERR_ENABLED(false);
        DL_SET_SYSDL_ENABLED(true);

	      string val1 = string("AuthzWorker checkAuthorization ") + string(client_id) + string(", ") + object +  string(", ") + string( action);
        DL_INFO(val1);

        int result = -1;

        try
        {
            SDMS::AuthzWorker worker;
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

