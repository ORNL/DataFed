// Local private includes
#include "RepoServer.hpp"
#include "Version.hpp"

// Common public includes
#include "common/CommunicatorFactory.hpp"
#include "common/CredentialFactory.hpp"
#include "common/DynaLog.hpp"
#include "common/IServer.hpp"
#include "common/KeyGenerator.hpp"
#include "common/MessageFactory.hpp"
#include "common/OperatorFactory.hpp"
#include "common/ServerFactory.hpp"
#include "common/TraceException.hpp"
#include "common/Util.hpp"

// Proto includes
#include "common/SDMS.pb.h"
#include "common/SDMS_Anon.pb.h"
#include "common/SDMS_Auth.pb.h"
#include "common/Version.pb.h"

// Standard includes
#include <any>
#include <fstream>
#include <time.h>

#define timerDef() struct timespec _T0 = {0,0}, _T1 = {0,0}
#define timerStart() clock_gettime(CLOCK_REALTIME,&_T0)
#define timerStop() clock_gettime(CLOCK_REALTIME,&_T1)
#define timerElapsed() ((_T1.tv_sec - _T0.tv_sec) + ((_T1.tv_nsec - _T0.tv_nsec)/1.0e9))


using namespace std;
using namespace SDMS::Anon;
using namespace SDMS::Auth;

namespace SDMS {
namespace Repo {

//#define SET_MSG_HANDLER(proto_id,msg,func)  m_msg_handlers[m_msg_mapper->getMessageType( proto_id, #msg )] = func
//#define SET_MSG_HANDLER(proto_id,msg,func)  m_msg_handlers[MsgBuf::findMessageType( proto_id, #msg )] = func


Server::Server() :
    m_config(Config::getInstance())
{
    // Register use of anon MAPI (for version check)
    //REG_PROTO( SDMS::Anon );
    //uint8_t proto_id = m_msg_mapper->getProtocolID(MessageProtocol::GOOGLE_ANONONYMOUS);

    // Load keys from credential directory
    loadKeys();

    // Setup ZMQ security context
    //m_config.sec_ctx.is_server = false;

    std::unordered_map<CredentialType, std::string> keys;
    keys[CredentialType::PUBLIC_KEY] = m_pub_key;
    keys[CredentialType::PRIVATE_KEY] = m_priv_key;
    keys[CredentialType::SERVER_KEY] = m_core_key;

    CredentialFactory cred_factory;
    m_config.sec_ctx = cred_factory.create(ProtocolType::ZQTP, keys);
    //m_config.sec_ctx.public_key = m_pub_key;
    //m_config.sec_ctx.private_key = m_priv_key;
    //m_config.sec_ctx.server_key = m_core_key;
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
    for ( uint16_t t = 0; t < m_config.num_req_worker_threads; ++t ) {
        std::cout << "Creating worker " << t << " out of " << m_config.num_req_worker_threads << std::endl;
        m_req_workers.push_back( new RequestWorker( t+1 ));
    }

    std::cout << __LINE__ << std::endl;
    // Create secure interface and run message pump
    // NOTE: Normally ioSecure will not return
    ioSecure();

    std::cout << __LINE__ << std::endl;
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

    auto msg = std::make_unique<VersionRequest>();//      msg;
    //MsgBuf::Message *   reply;
    //MsgComm::SecurityContext sec_ctx;

    // Generate random security keys for anon version request to core server

    //char pub_key[41];
    //char priv_key[41];

    //sec_ctx.is_server = false;
    //sec_ctx.server_key = m_core_key;

    // This is leaking implementation details ... 
    //if ( zmq_curve_keypair( pub_key, priv_key ) != 0 )
    //    EXCEPT_PARAM( 1, "Temp security key generation failed: " << zmq_strerror( errno ));
    KeyGenerator generator;
    auto local_keys = generator.generate(ProtocolType::ZQTP, KeyType::PUBLIC_PRIVATE);
    local_keys[CredentialType::SERVER_KEY] = m_core_key; 

    CredentialFactory cred_factory;
    auto local_sec_ctx = cred_factory.create(ProtocolType::ZQTP, local_keys);
    //sec_ctx.public_key = pub_key;
    //sec_ctx.private_key = priv_key;

    std::string repo_thread_id = "repository_main_socket_client";
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

      CommunicatorFactory factory;
      // When creating a communication channel with a server application we need
      // to locally have a client socket. So though we have specified a client
      // socket we will actually be communicating with the server.
      return factory.create(
          socket_options,
          credentials,
          timeout_on_receive,
          timeout_on_poll);
  }(repo_thread_id, m_config.core_server, *local_sec_ctx);

    MessageFactory msg_factory;

    for( int i = 0; i < 10; i++ )
    {
        //MsgComm comm( m_config.core_server, MsgComm::DEALER, false, &sec_ctx );

        auto message = msg_factory.create(MessageType::GOOGLE_PROTOCOL_BUFFER);
        //MsgBuf send_request;
        message->setPayload(std::move(msg));
        message->set(MessageAttribute::KEY, local_sec_ctx->get(CredentialType::PUBLIC_KEY));
        //send_request.serialize(msg);
        //send_request.setUID(pub_key);

        //MsgBuf buffer;

        //comm.send( msg );
        client->send(*message);
        //comm.send( send_request, true );
        
        auto response = client->receive(MessageType::GOOGLE_PROTOCOL_BUFFER);

        //if ( !comm.recv( buffer, false, 20000 ))
        //{
        if( response.time_out ) {
            DL_ERROR( "Timeout waiting for response from core server: " << m_config.core_server );
            cerr.flush();
        } else {
            //reply = buffer.unserialize();
            auto payload = std::get<google::protobuf::Message*>(response.message->getPayload()); 
            VersionReply * ver_reply = dynamic_cast<VersionReply*>( payload );
            if ( ver_reply == 0 )
            {
                EXCEPT_PARAM( 1, "Invalid response from core server: " << m_config.core_server );
            }
           
            if ( ver_reply->api_major() != SDMS::repository::version::MAJOR ) {
              EXCEPT_PARAM( 1, "Incompatible messaging api detected major backwards breaking changes detected version (" << ver_reply->api_major() << "." << ver_reply->api_minor() << "." << ver_reply->api_patch() << ")" );
            }
            if ( ver_reply->api_minor() + 9 > SDMS::repository::version::MINOR) {
              DL_WARN( "Significant changes in message api detected (" << ver_reply->api_major() << "." << ver_reply->api_minor() << "." << ver_reply->api_patch() << ")" );
            }
            bool new_release_available = false;
            if ( ver_reply->release_year() > Version::DATAFED_RELEASE_YEAR) {
              new_release_available = true;
            } else if ( ver_reply->release_year() == Version::DATAFED_RELEASE_YEAR ) {
              if( ver_reply->release_month() > Version::DATAFED_RELEASE_MONTH ) {
                new_release_available = true;
              } else if(ver_reply->release_month() == Version::DATAFED_RELEASE_MONTH ) {
                if( ver_reply->release_day() > Version::DATAFED_RELEASE_DAY ) {
                  new_release_available = true;
                } else if(ver_reply->release_day() == Version::DATAFED_RELEASE_DAY ) {
                  if( ver_reply->release_hour() > Version::DATAFED_RELEASE_HOUR ) {
                    new_release_available = true;
                  } else if(ver_reply->release_hour() == Version::DATAFED_RELEASE_HOUR ) {
                    if( ver_reply->release_minute() > Version::DATAFED_RELEASE_MINUTE ) {
                      new_release_available = true;
                    }
                  }
                }
              }
            }

            if(new_release_available) {
              DL_INFO( "Newer releases for the repo server may be available." );
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
    std::cout << __LINE__ << std::endl;
    try
    {

    std::cout << __LINE__ << std::endl;
        std::unordered_map<SocketRole, SocketOptions> socket_options;
        std::unordered_map<SocketRole, ICredentials *> socket_credentials;

        //const std::string channel_between_proxy_and_backend = "channeltobackend";
        //const std::string channel_between_proxy_and_frontend = "channeltofrontend";
        // Credentials are allocated on the heap, to ensure they last until the end of
        // the test they must be defined outside of the scope block below
        std::unique_ptr<ICredentials> client_credentials;

        std::string client_id = "main_repository_server_interal_facing_socket";
        { // Proxy Client Credentials and Socket Options - these options are used
        // to define the client socket that the proxy will use to communicate with
        // the backend. The proxy acts like a client to the backend
        SocketOptions client_socket_options;
        client_socket_options.scheme = URIScheme::INPROC;
        client_socket_options.class_type = SocketClassType::CLIENT; 
        client_socket_options.direction_type = SocketDirectionalityType::BIDIRECTIONAL; 
        client_socket_options.communication_type = SocketCommunicationType::ASYNCHRONOUS;
        client_socket_options.connection_life = SocketConnectionLife::PERSISTENT;
        client_socket_options.protocol_type = ProtocolType::ZQTP; 
        client_socket_options.host = "workers";
        client_socket_options.local_id = client_id;
        socket_options[SocketRole::CLIENT] = client_socket_options;

        CredentialFactory cred_factory;
        std::unordered_map<CredentialType, std::string> cred_options;

        client_credentials = cred_factory.create(ProtocolType::ZQTP, cred_options);
        socket_credentials[SocketRole::CLIENT] = client_credentials.get();
        }

    std::cout << __LINE__ << std::endl;
        // Credentials are allocated on the heap, to ensure they last until the end of
        // the test they must be defined outside of the scope block below
        std::unique_ptr<ICredentials> server_credentials;

        { // Proxy Server Credentials and Socket Options - these options are used
          // to define the server socket that the proxy will use to communicate with
          // the frontend. The proxy acts like a server to the frontend
          SocketOptions server_socket_options;
          server_socket_options.scheme = URIScheme::TCP;
          server_socket_options.class_type = SocketClassType::SERVER; 
          server_socket_options.direction_type = SocketDirectionalityType::BIDIRECTIONAL; 
          server_socket_options.communication_type = SocketCommunicationType::ASYNCHRONOUS;
          server_socket_options.connection_life = SocketConnectionLife::PERSISTENT;
          server_socket_options.connection_security = SocketConnectionSecurity::SECURE;
          server_socket_options.protocol_type = ProtocolType::ZQTP; 
          server_socket_options.host = "*";
          server_socket_options.port = m_config.port;
          server_socket_options.local_id = "main_repository_server_external_facing_socket";
          socket_options[SocketRole::SERVER] = server_socket_options;

          CredentialFactory cred_factory;
          std::unordered_map<CredentialType, std::string> cred_options;
          cred_options[CredentialType::PUBLIC_KEY] = m_config.sec_ctx->get(CredentialType::PUBLIC_KEY);
          cred_options[CredentialType::PRIVATE_KEY] = m_config.sec_ctx->get(CredentialType::PRIVATE_KEY);
          cred_options[CredentialType::SERVER_KEY] = m_config.sec_ctx->get(CredentialType::SERVER_KEY);

          std::cout << "PRIVATE KEY for repo secure connection to core server " << cred_options[CredentialType::PRIVATE_KEY] << std::endl;
          server_credentials = cred_factory.create(ProtocolType::ZQTP, cred_options);
          socket_credentials[SocketRole::SERVER] = server_credentials.get();

        }

        // Because the (NON-Proxy) server will not be a ROUTER we need to add
        // an operator so the proxy server will be added as a router in the 
        // routing part of the message
        //
        // Will add
        //
        // "MiddleMan_client_socket" as a prepended message on its way to the 
        // backend server, I think this is only necessary because we have
        // specifiedt that the Server is connecting Synchronously with the proxy


        //OperatorFactory oper_factory;
        //std::any router_id_to_add = proxy_client_id;

        //OperatorFactory oper_factory;
        //std::any router_id_to_add = client_id;
        //std::vector<std::unique_ptr<IOperator>> incoming_operators;
        //incoming_operators.push_back( oper_factory.create(OperatorType::RouterBookKeeping, router_id_to_add) );
    std::cout << __LINE__ << std::endl;
        ServerFactory server_factory;
        auto proxy = server_factory.create(ServerType::PROXY_CUSTOM ,socket_options, socket_credentials);
        //auto proxy = server_factory.create(ServerType::PROXY_CUSTOM ,socket_options, socket_credentials, std::move(incoming_operators));
    std::cout << __LINE__ << " Created proxy target addresses are:" << std::endl;

        for( auto & addr : proxy->getAddresses() ) {
          std::cout << addr.second << std::endl;
        }

        //std::chrono::duration<double> duration = std::chrono::milliseconds(30);
        //proxy.setRunDuration(duration);
    std::cout << __LINE__ << " running secure proxy..." << std::endl;
        proxy->run();

    std::cout << __LINE__ << std::endl;

        
        //MsgComm frontend( "tcp://*:" + to_string(m_config.port), MsgComm::ROUTER, true, &m_config.sec_ctx );
        //MsgComm backend( "inproc://workers", MsgComm::DEALER, true );

        //frontend.proxy( backend );
    }
    catch( exception & e)
    {
        DL_ERROR( "Exception in secure interface: " << e.what() )
    }
}

}}
