// Local private includes
#include "ProxyBasicZMQ.hpp"
#include "support/zeromq/Context.hpp"
#include "support/zeromq/SocketTranslator.hpp"

// Local public includes
#include "ICommunicator.hpp"
#include "IServer.hpp"
#include "SocketFactory.hpp"
#include "SocketOptions.hpp"
#include "TraceException.hpp"

// Standard includes
#include <chrono>
#include <iostream>
#include <memory>
#include <thread>
#include <unordered_map>

namespace SDMS {

    /// Convenience constructor
    ProxyBasicZMQ::ProxyBasicZMQ(
      const std::unordered_map<SocketRole, SocketOptions> & socket_options,
      const std::unordered_map<SocketRole, ICredentials *> & socket_credentials) {

      if( socket_options.count(SocketRole::CLIENT) == 0 ) {
        EXCEPT(1, "ProxyBasicZMQ must have socket options for Client"); 
      }

      if( socket_options.count(SocketRole::SERVER) == 0 ) {
        EXCEPT(1, "ProxyBasicZMQ must have socket options for SERVER"); 
      }
      
    	m_client_zmq_type = translateToZMQSocket(socket_options.at(SocketRole::CLIENT));
			if( m_client_zmq_type != ZMQ_DEALER){
				EXCEPT(1, "ProxyBasicZMQ frontend currently only supports DEALER type");
			}	

			m_server_zmq_type = translateToZMQSocket(socket_options.at(SocketRole::SERVER));
			if( m_server_zmq_type != ZMQ_ROUTER){
				EXCEPT(1, "ProxyBasicZMQ backend currently only supports ROUTER type");
			}

			if( socket_options.at(SocketRole::SERVER).protocol_type != ProtocolType::ZQTP ) {
				EXCEPT(1, "ProxyBasicZMQ server currently only supports ZQTP protocol");
			}	
				
			if( socket_options.at(SocketRole::CLIENT).protocol_type != ProtocolType::ZQTP ) {
				EXCEPT(1, "ProxyBasicZMQ client currently only supports ZQTP protocol");
			}	

			if( socket_options.at(SocketRole::SERVER).scheme != URIScheme::INPROC ) {
				EXCEPT(1, "ProxyBasicZMQ server currently only supports inproc scheme");
			}
		
			if( socket_options.at(SocketRole::CLIENT).scheme != URIScheme::INPROC ) {
				EXCEPT(1, "ProxyBasicZMQ client currently only supports inproc scheme");
			}

			if( socket_options.at(SocketRole::SERVER).connection_life != SocketConnectionLife::PERSISTENT ) {
				EXCEPT(1, "ProxyBasicZMQ server currently only supports persistent connections for server socket");
			}
			if( socket_options.at(SocketRole::CLIENT).connection_life != SocketConnectionLife::PERSISTENT ) {
				EXCEPT(1, "ProxyBasicZMQ server currently only supports persistent connections for client socket");
			}

      if( socket_options.size() > 2) {
				EXCEPT(1, "ProxyBasicZMQ currently only supports CLIENT and SERVER roles.");
      }
      SocketFactory sock_factory;
      m_client_socket = sock_factory.create(socket_options.at(SocketRole::CLIENT), *socket_credentials.at(SocketRole::CLIENT));
      m_server_socket = sock_factory.create(socket_options.at(SocketRole::SERVER), *socket_credentials.at(SocketRole::SERVER));

    }

    /**
     * By default will run forever you can specify a time to run the for instead
     * 
     * std::chrono::duration<double> duration = std::chrono::seconds(1);
     * setRunDuration(duration)
     **/
    void ProxyBasicZMQ::setRunDuration(std::chrono::duration<double> duration) {
      m_run_duration = duration;
			m_run_infinite_loop = false;
    }

    void ProxyBasicZMQ::run() {


      void * ctx = getContext();
			void *router_frontend_socket = zmq_socket (ctx, ZMQ_ROUTER);
			assert (router_frontend_socket);
			int rc = zmq_bind (router_frontend_socket, "inproc://frontend");
			assert (rc == 0);

			// Backend socket talks to workers over inproc
			void *dealer_backend_socket = zmq_socket (ctx, ZMQ_DEALER);
			assert (dealer_backend_socket);
			rc = zmq_bind (dealer_backend_socket, "inproc://backend");
			assert (rc == 0);

			// Control socket receives terminate command from main over inproc
			void *control_socket = zmq_socket (ctx, ZMQ_SUB);
			assert (control_socket);
			rc = zmq_setsockopt (control_socket, ZMQ_SUBSCRIBE, "", 0);
			assert (rc == 0);
			rc = zmq_connect (control_socket, "inproc://control");
			assert (rc == 0);


			// Control socket receives terminate command from main over inproc
			void *capture_socket = zmq_socket (ctx, ZMQ_PUB);
			assert (capture_socket);
			assert (rc == 0);
			rc = zmq_connect (capture_socket, "inproc://capture");
			assert (rc == 0);


			// Launch pool of worker threads, precise number is not critical
			auto terminate_call = [](){
      	void * context = getContext();
				auto control_local = zmq_socket(context, ZMQ_PUB);
				int rc_local = zmq_bind( control_local, "inproc://control");
        std::this_thread::sleep_for (std::chrono::milliseconds(500));
				std::string command = "TERMINATE";
				auto return_val = zmq_send(control_local, command.c_str(), command.size(), 0);
			};


      /**
       * Thread is for debugging purposes mostly, for logging the messages
       * that are sent through the steerable proxy.
       **/
			auto proxy_log_call = [](){
      	void * context = getContext();
				auto capture_local = zmq_socket(context, ZMQ_SUB);
				int rc_local = zmq_bind( capture_local, "inproc://capture");
			  zmq_setsockopt (capture_local, ZMQ_SUBSCRIBE, "", 0);
        zmq_pollitem_t  items[] = {{ capture_local, 0, ZMQ_POLLIN, 0}};
        const int num_items_in_array = 1;
        int events_detected = 0;
        uint32_t timeout_milliseconds = 50;

        bool terminate = false;
        while( true ) {
          events_detected = zmq_poll( items, num_items_in_array, timeout_milliseconds );

          if ( events_detected > 0) {

            zmq_msg_t zmq_msg;
            zmq_msg_init( &zmq_msg );

            while( zmq_msg_more(&zmq_msg) or events_detected > 0 ) {
              // Reset events_detected
              events_detected = 0;
              int number_of_bytes = 0;
              if (( number_of_bytes = zmq_msg_recv( &zmq_msg, capture_local, ZMQ_DONTWAIT )) < 0 ) {
                EXCEPT( 1, "zmq_msg_recv (route) failed." );
              }

              // Stop when delimiter is read
              std::string new_msg((char*) zmq_msg_data(&zmq_msg), zmq_msg_size(&zmq_msg));
              std::cout << "CAPTURE: msg is = " << new_msg << std::endl;
              if( new_msg.compare("TERMINATE") == 0){
                terminate = true;
              }
            }
            zmq_msg_close( &zmq_msg );
            if( terminate ) { break; }
          }
        } 
			};

			std::thread control_thread(terminate_call);
			std::thread capture_thread(proxy_log_call);
			// Connect backend to frontend via a proxy
			zmq_proxy_steerable (router_frontend_socket, dealer_backend_socket, capture_socket, control_socket);

      // Give the threads a chance to finish what they are doing
      std::this_thread::sleep_for (std::chrono::milliseconds(100));
      capture_thread.join();
			control_thread.join();

			rc = zmq_close (router_frontend_socket);
			assert (rc == 0);
			rc = zmq_close (dealer_backend_socket);
			assert (rc == 0);
			rc = zmq_close (control_socket);
			assert (rc == 0);
			rc = zmq_close (capture_socket);
			assert (rc == 0);

      
    }

} // namespace SDMS

