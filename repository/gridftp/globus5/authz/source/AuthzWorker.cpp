// Local private includes
#include "Config.h"

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

using namespace std;
using namespace SDMS::Anon;
using namespace SDMS::Auth;


namespace SDMS {

class AuthzWorker {
public:
    AuthzWorker( struct Config * a_config ) :
        m_config( a_config ),
        m_globus_collection_path_len(strlen(a_config->globus_collection_path)),
        m_test_path_len( strlen( a_config->test_path )) {
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

				DL_INFO("provided path is: " << path << " expected globus root POSIX path is: " << m_config->globus_collection_path );
        if ( m_test_path_len > 0 && strncmp( path, m_config->test_path, m_test_path_len ) == 0 ) {
            DL_INFO("Allowing request within TEST PATH");
            return 0;
        }

        if( m_globus_collection_path_len == 0 ) {
            DL_INFO("AuthWorker.cpp globus-collection-path is not defined, must be defined.");
            EXCEPT(1,"Globus collection path is not defined");
        }

        // This should point to the root of the globus collection on the POSIX system
        // It must be stripped from the path
        // Expecting a path with the following form
        // ftp://hostname/globus_collection_root_path
        
        // Start by making sure the format is as expected  
      
        std::string scheme = "ftp://"; 
        //std::string local_globus_path_root = "ftp://";
        std::string local_path = path;
        if( local_path.substr(0,scheme.length()).compare(scheme) != 0 ) {
            DL_INFO("AuthWorker.cpp provided path is not prefixed by expected ftp:// prefix.");
            EXCEPT(1,"Format error detected in path");
        }

        // 2 grab substr after third backslash (and including backslash) should remove ftp://hostname

        char backslash = '/';
        int count = 0;
        size_t index = 0;

				for (size_t i = 0; i < local_path.length(); i++) {
					if (local_path[i] == backslash) {
						count++;
						if (count == 3) {
							index = i;
							break;
						}
					}
				}

				if(count != 3 ) {
            DL_INFO("AuthWorker.cpp provided path is not prefixed by expected ftp://hostname/ prefix.");
						DL_INFO("Local path is " << local_path );
            DL_INFO("count is " << count);
            EXCEPT(1,"Format error detected in path");
				}

				// extract the substring after the third occurrence of the character
				local_path = local_path.substr(index);

				//std::string repo_prefix = "repo/";
				//std::string repo_id = m_config->repo_id;
        std::string local_globus_path_root = std::string(m_config->globus_collection_path); // + repo_id.substr(repo_prefix.length()-1);
        if(local_globus_path_root.length() > local_path.length() ) {
            DL_INFO("AuthWorker.cpp provided path is not prefixed by globus_root_collection_path.");
            DL_INFO("Provided path is: " << local_path << " root of globus collection is " << local_globus_path_root);
            EXCEPT(1,"Path to data item is not within the collection");
        } 

        auto prefix = local_path.substr(0, local_globus_path_root.length());
        if( prefix.compare(local_globus_path_root) != 0 ) {
            DL_INFO("AuthWorker.cpp provided path is not prefixed by globus_root_collection_path.");
            DL_INFO("Provided path is: " << local_path << " root of globus collection is " << local_globus_path_root);
            EXCEPT(1,"Path to data item is not within the collection");
        }

        auto sanitized_path = local_path.substr(prefix.length());
        int result = 1;
        

        //MsgComm::SecurityContext sec_ctx;
        //sec_ctx.is_server = false;
        //sec_ctx.public_key = m_config->pub_key;
        //sec_ctx.private_key = m_config->priv_key;
        //sec_ctx.server_key = m_config->server_key;

    std::unique_ptr<SDMS::ICredentials>   m_sec_ctx;

    std::unordered_map<CredentialType, std::string> cred_options;
    cred_options[CredentialType::PUBLIC_KEY] = m_config->pub_key;
    cred_options[CredentialType::PRIVATE_KEY]  = m_config->priv_key;
    cred_options[CredentialType::SERVER_KEY] = m_config->server_key;
    CredentialFactory cred_factory;
    m_sec_ctx = cred_factory.create(ProtocolType::ZQTP, cred_options);


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
  }(authz_thread_id, m_config->server_addr, *m_sec_ctx);





//        Auth::RepoAuthzRequest  auth_req;
//        MsgBuf::Message *       reply;
 //       MsgBuf::Frame           frame;

//        MsgComm authzcomm(m_config->server_addr, MsgComm::DEALER, false, &sec_ctx );

        auto auth_req = std::make_unique<Auth::RepoAuthzRequest>();//  auth_req;
       	string val1 = string("m_repo_id is ") + m_config->repo_id;	
	      string val2 = string("path is") + sanitized_path;
        DL_INFO(val1);
        DL_INFO(val2);
 

        auth_req->set_repo(m_config->repo_id);
        auth_req->set_client(client_id);
        auth_req->set_file(sanitized_path);
        auth_req->set_action(action);

        MessageFactory msg_factory;
        auto message = msg_factory.create(MessageType::GOOGLE_PROTOCOL_BUFFER);
        message->set(MessageAttribute::KEY, cred_options[CredentialType::PUBLIC_KEY]);
        message->setPayload(std::move(auth_req));

        DL_INFO("SendingRepoAuthzRequest");
        client->send(*message);
        DL_INFO("PUB KEY:  " << cred_options[CredentialType::PUBLIC_KEY]);
        DL_INFO("PRIV KEY: " << cred_options[CredentialType::PRIVATE_KEY]);
        DL_INFO("SERV KEY: " << cred_options[CredentialType::SERVER_KEY]);
        DL_INFO("Sending request to core service at address." << client->address());

        auto response = client->receive(MessageType::GOOGLE_PROTOCOL_BUFFER);
        if( response.time_out ) {
            DL_INFO("AuthWorker.cpp Core service did not respond within timeout.");
            EXCEPT(1,"Core service did not respond");
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
        //return result;
    }

private:
    struct Config *     m_config;
    size_t              m_test_path_len;
    size_t              m_globus_collection_path_len;
};

} // End namespace SDMS


extern "C"
{
    // The same
    const char * getVersion()
    {
        static std::string ver_str = std::to_string(VER_MAJOR) + "." + std::to_string(VER_MAPI_MAJOR) + "." + std::to_string(VER_MAPI_MINOR) + ":" + std::to_string(VER_REPO);

        return ver_str.c_str();
    }

    // The same
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

