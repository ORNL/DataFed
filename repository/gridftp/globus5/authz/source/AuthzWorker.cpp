// Local private includes
#include "Config.h"
#include "Version.hpp"

// Common public includes
#include "common/CommunicatorFactory.hpp"
#include "common/CredentialFactory.hpp"
#include "common/DynaLog.hpp"
#include "common/ICommunicator.hpp"
#include "common/IMessage.hpp"
#include "common/MessageFactory.hpp"
#include "common/SocketOptions.hpp"
#include "common/TraceException.hpp"
#include "common/Util.hpp"
#include "common/DynaLog.hpp"

// Protobuf includes
#include "common/SDMS.pb.h"
#include "common/SDMS_Anon.pb.h"
#include "common/SDMS_Auth.pb.h"
#include "common/Version.pb.h"

// Standard includes
#include <cstdlib>
#include <fstream>
#include <random>
#include <string>
#include <syslog.h>

using namespace std;
using namespace SDMS::Anon;
using namespace SDMS::Auth;
//using namespace SDMS::authz::version;

namespace {
  std::string randomAlphaNumericCode() {
    std::string chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    std::mt19937 generator(time(nullptr));
    std::uniform_int_distribution<> distribution(0, chars.size() - 1);

    int length = 6; // set the desired length of the random string
    std::string random_string;
    for (int i = 0; i < length; ++i) {
      random_string += chars[distribution(generator)];
    }
    return random_string;
  }
}

namespace SDMS {

class AuthzWorker {
public:
    AuthzWorker( struct Config * a_config, LogContext log_context ) :
        m_config( a_config ),
        m_test_path_len( strlen( a_config->test_path )) {

        m_log_context = log_context;
        m_log_context.thread_name += "authz_worker";
        m_log_context.thread_id = 0;
    }

    ~AuthzWorker()
    {
    }

    AuthzWorker& operator=( const AuthzWorker & ) = delete;

    int checkAuth( char * client_id, char * path, char * action )
    {
        DL_DEBUG(m_log_context, "Checking auth for client: " << client_id);

        if ( m_test_path_len > 0 && strncmp( path, m_config->test_path, m_test_path_len ) == 0 ) {
            DL_INFO(m_log_context,"Allowing request within TEST PATH: " << m_config->test_path << " actual path: " << path);
            return 0;
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
            DL_ERROR(m_log_context,"Provided path is not properly formatted, should be prefixed with ftp:// but is: " << path);
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
            DL_ERROR(m_log_context,"Provided path is not properly formatted, should be prefixed with ftp://hostname but is: " << path);
            EXCEPT(1,"Format error detected in path");
				}

				// extract the substring after the third occurrence of the character
				local_path = local_path.substr(index);

        std::string local_globus_path_root = std::string(m_config->globus_collection_path); // + repo_id.substr(repo_prefix.length()-1);
        if(local_globus_path_root.length() > local_path.length() ) {;
            std::string err_message = "Provided path is not properly formatted, should be prefixed with globus_root_collection_path: ";
            err_message += local_globus_path_root + " but is: " + path;
            DL_ERROR(m_log_context, err_message);
            EXCEPT(1,"Path to data item is not within the collection");
        } 

        auto prefix = local_path.substr(0, local_globus_path_root.length());
        if( prefix.compare(local_globus_path_root) != 0 ) {
            std::string err_message = "Provided path is not properly formatted, should be prefixed with globus_root_collection_path: ";
            err_message += local_globus_path_root + " but is: " + path;
            DL_ERROR(m_log_context, err_message);
            EXCEPT(1,"Path to data item is not within the collection");
        }

        auto sanitized_path = local_path.substr(prefix.length());
        
    std::unique_ptr<SDMS::ICredentials>   m_sec_ctx;

    std::unordered_map<CredentialType, std::string> cred_options;
    cred_options[CredentialType::PUBLIC_KEY] = m_config->pub_key;
    cred_options[CredentialType::PRIVATE_KEY]  = m_config->priv_key;
    cred_options[CredentialType::SERVER_KEY] = m_config->server_key;
    CredentialFactory cred_factory;
    m_sec_ctx = cred_factory.create(ProtocolType::ZQTP, cred_options);

    // Need to attach a random number to the authz_client_socket so that
    // each authz client is distinct
    std::string authz_thread_id = "authz_client_socket-" + randomAlphaNumericCode();
    auto client = [&](
        const std::string & socket_id,
        const std::string & address,
        ICredentials & credentials
        ) {
      /// Creating input parameters for constructing Communication Instance
      DL_INFO(m_log_context, "Creating client with adress to server: " << address);
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

      uint32_t timeout_on_receive = 10000;
      long timeout_on_poll = 10000;

      CommunicatorFactory comm_factory(m_log_context);
      // When creating a communication channel with a server application we need
      // to locally have a client socket. So though we have specified a client
      // socket we will actually be communicating with the server.
      return comm_factory.create(
          socket_options,
          credentials,
          timeout_on_receive,
          timeout_on_poll);
  }(authz_thread_id, m_config->server_addr, *m_sec_ctx);

        auto auth_req = std::make_unique<Auth::RepoAuthzRequest>();//  auth_req;

        auth_req->set_repo(m_config->repo_id);
        auth_req->set_client(client_id);
        auth_req->set_file(sanitized_path);
        auth_req->set_action(action);

        MessageFactory msg_factory;
        auto message = msg_factory.create(MessageType::GOOGLE_PROTOCOL_BUFFER);
        message->set(MessageAttribute::KEY, cred_options[CredentialType::PUBLIC_KEY]);
        message->setPayload(std::move(auth_req));

        client->send(*message);
        LogContext log_context = m_log_context;
        log_context.correlation_id = std::get<std::string>(message->get(MessageAttribute::CORRELATION_ID)); 
        DL_INFO(log_context, "PUB KEY:  " << cred_options[CredentialType::PUBLIC_KEY]);
        DL_INFO(log_context, "PRIV KEY: " << cred_options[CredentialType::PRIVATE_KEY]);
        DL_INFO(log_context, "SERV KEY: " << cred_options[CredentialType::SERVER_KEY]);
        DL_INFO(log_context, "Sending request to core service at address." << client->address());

        auto response = client->receive(MessageType::GOOGLE_PROTOCOL_BUFFER);
        log_context.correlation_id = std::get<std::string>(response.message->get(MessageAttribute::CORRELATION_ID));
        if( response.time_out ) {
            DL_WARNING(log_context, "AuthWorker.cpp Core service did not respond within timeout.");
            EXCEPT(1,"Core service did not respond");
        } else if( response.error ) {
            DL_ERROR(log_context, "AuthWorker.cpp there was an error when communicating with the core service: " << response.error_msg);
        } else {
            auto payload = std::get<google::protobuf::Message*>(response.message->getPayload());
            Anon::NackReply * nack = dynamic_cast<Anon::NackReply*>( payload );
            if ( !nack ){
                return 0;
            }else{
                DL_DEBUG(log_context, "Received NACK reply");
            }
        }
        return 1;
    }

private:
    struct Config *     m_config;
    size_t              m_test_path_len;
    LogContext      m_log_context;
};

} // End namespace SDMS


extern "C"
{
    // The same
    const char * getVersion()
    {
        static std::string ver_str = std::to_string(SDMS::authz::version::MAJOR) + "." + std::to_string(SDMS::authz::version::MINOR) + "." + std::to_string(SDMS::authz::version::PATCH);

        return ver_str.c_str();
    }

    const char * getAPIVersion()
    {
        static std::string ver_str = std::to_string(DATAFED_COMMON_PROTOCOL_API_MAJOR) + "." + std::to_string(DATAFED_COMMON_PROTOCOL_API_MINOR) + "." + std::to_string(DATAFED_COMMON_PROTOCOL_API_PATCH);

        return ver_str.c_str();
    }

    const char * getReleaseVersion()
    {
        static std::string ver_str = std::to_string(DATAFED_RELEASE_YEAR) + "." + std::to_string(DATAFED_RELEASE_MONTH) + "." + std::to_string(DATAFED_RELEASE_DAY) + "." + std::to_string(DATAFED_RELEASE_HOUR) + "." + std::to_string(DATAFED_RELEASE_MINUTE);

        return ver_str.c_str();
    }


    // The same
    int checkAuthorization( char * client_id, char * object, char * action, struct Config * config )
    {
        SDMS::global_logger.setSysLog(true);
        SDMS::global_logger.addStream(std::cerr);

        SDMS::LogContext log_context;
        log_context.thread_name = "authz_check";
        log_context.thread_id = 0;
        DL_DEBUG(log_context, "AuthzWorker checkAuthorization " << client_id << ", " << object << ", " << action );

        int result = -1;

        try
        {
            SDMS::AuthzWorker worker( config, log_context );
            result = worker.checkAuth( client_id, object, action );
        }
        catch( TraceException &e )
        {
            DL_ERROR(log_context, "AuthzWorker exception: " << e.toString() );
        }
        catch( exception &e )
        {
            DL_ERROR(log_context, "AuthzWorker exception: " << e.what() );
        }

        return result;
    }
}

