//Local Private Includes
#include "HTTPCommunicator.hpp"


// Local public includes
#include "common/DynaLog.hpp"
#include "common/IMessage.hpp"
#include "common/ISocket.hpp"
#include "common/SocketFactory.hpp"
#include "common/SocketOptions.hpp"
#include "common/Util.hpp"

#include "common/ProtoBufMap.hpp"
//Standard includes
#include <memory>
#include <string>
#include <unordered_map>
#include <curl/curl.h>
#include <list> // Include list header

namespace SDMS{

/******************************************************************************
 * Public Class Methods
 ******************************************************************************/

  //Created contructor for HTTPCommunicator
  HTTPCommunicator::HTTPCommunicator(const SocketOptions &socket_options,
                   const ICredentials &credentials,
                   uint32_t timeout_on_receive_milliseconds,
                   long timeout_on_poll_milliseconds,
                   const LogContext &log_context)
    : m_timeout_on_receive_milliseconds(timeout_on_receive_milliseconds),
      m_timeout_on_poll_milliseconds(timeout_on_poll_milliseconds){
    //Add the socket fact here
    m_log_context = log_context;
    auto socket_factory = SocketFactory();
    m_socket = socket_factory.create(socket_options, credentials);
    
    std::string id = m_socket->getID();
  if (id.size() > constants::communicator::MAX_COMMUNICATOR_IDENTITY_SIZE) {
    std::string error_msg = 
      "HTTP exceeds max number of characters allowed, allowed: ";
    error_msg +=
      std::to_string(constants::communicator::MAX_COMMUNICATOR_IDENTITY_SIZE);
    error_msg +=
        " number provided " + std::to_string(id.size()) + " identity: " + id;
    DL_ERROR(m_log_context, error_msg);
    //EXCEPT_PARAM(1, error_msg);
  }
}


  ICommunicator::Response 
  HTTPCommunicator::poll(const MessageType message_type){
    //Put send and recieve here and make sure response = response
    // Step 1: Create and send message
    std::unique_ptr<IMessage> message = m_msg_factory.create(message_type);
    send(*message);

    // Step 2: Receive response
    ICommunicator::Response response = receive(message_type);

    // Step 3: Process response
    LogContext log_context = m_log_context;
    if (!response.error && !response.time_out) {
        log_context.correlation_id = std::get<std::string>(message->get(MessageAttribute::CORRELATION_ID));

        std::cout << "Correlation ID Checker in Poll func"<< std::endl;
        std::cout << log_context.correlation_id << std::endl;
        std::string log_message = "Received message on communicator id: " + id();
        log_message += ", receiving from address: " + address();
        DL_TRACE(log_context, log_message);
    } else {
        if (response.error) {
            std::string error_message = "Error encountered for communicator id: " + id();
            error_message += ", error is: " + response.error_msg;
            error_message += ", receiving from address: " + address();
            DL_ERROR(log_context, error_message);
        } else if (response.time_out) {
            std::string error_message = "Timeout encountered for communicator id: " + id();
            error_message += ", timeout occurred after: " + std::to_string(m_timeout_on_poll_milliseconds);
            error_message += ", receiving from address: " + address();
            DL_TRACE(log_context, error_message);
        }
    }

    return response;
  }

  /**
      * This is technical debt in the future get rid of MsgBuf and replace with
      * IMessage
      **/
  void HTTPCommunicator::send(IMessage &message){
  std::cout << "Attempting to send" << std::endl;
  //add curl here
  //create a std list of type IComm::Response, to be our buffer that
    CURL *curl;
    CURLcode res;
    std::string readBuffer;
    // Initialize CURL session
    curl = curl_easy_init();
  
    if (curl) {
        std::string verb = std::get<std::string>(message.get(MessageAttribute::VERB));
        std::string endpoint = std::get<std::string>(message.get(MessageAttribute::ENDPOINT));
        //Parsing the message for the if statement below:
        // Variables to store the parsed values
        const std::string body = std::get<std::string>(message.getPayload());

        //Instead of parsing we need to use getAttribute to get the endpoint, verb, we dont need body as its just the payload
        std::cout << "Setting curl options" << std::endl;
        //Setting string buffer
        curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, curlResponseWriteCB);

        curl_easy_setopt(curl, CURLOPT_WRITEDATA, &readBuffer);
        // Set CURL options: URL, HTTP method, headers, body, etc.
        curl_easy_setopt(curl, CURLOPT_URL, endpoint.c_str()); // Set URL with localhost and port
        // Example: Set headers if needed
        struct curl_slist *headers = NULL;
        headers = curl_slist_append(headers, "Content-Type: application/json");
        curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);


        //Put a check here that breaks the message and if it is a post then do the below if not then do whatever it says to do:
        if(verb == "POST"){
          curl_easy_setopt(curl, CURLOPT_POST, 1);
          curl_easy_setopt(curl, CURLOPT_POSTFIELDS, body.c_str());
        }
        //Get Request
        else if(verb == "GET"){
          curl_easy_setopt(curl, CURLOPT_HTTPGET, 1);
        }

          // Perform the request
        res = curl_easy_perform(curl);
        
        // Check for errors
        if (res != CURLE_OK) {
            fprintf(stderr, "curl_easy_perform() failed: %s\n",
                    curl_easy_strerror(res));
        }
        
        // Cleanup
        curl_slist_free_all(headers); // Free headers list
        curl_easy_cleanup(curl);
        ICommunicator::Response response;
        MessageFactory msg_factory;
        response.message = msg_factory.create(MessageType::STRING);
        response.message->setPayload(readBuffer); //CHANGED . to ->
        auto correlation_id_value = std::get<std::string>(message.get(MessageAttribute::CORRELATION_ID));
       // std::cout << "Correlation ID: "<< correlation_id_value << std::endl;
        response.message->set(MessageAttribute::CORRELATION_ID, correlation_id_value); //changed . to ->
        // Store response in buffer
        responseBuffer.push_back(std::move(response)); // Assuming `response` is movable
    }
 
  }

  /* Ideally in the future get rid of MsgBuf and replace with IMessage
      **/
  ICommunicator::Response
  HTTPCommunicator::receive(const MessageType){
  //FIFO from send's (imaginary) buffer
    ICommunicator::Response response;

    if (!responseBuffer.empty()) {
        response = std::move(responseBuffer.front()); // Use move semantics if possible
        responseBuffer.pop_front(); // Remove response from buffer
    } else {
        // Handle case when buffer is empty
    }
    std::cout << "Successfully finished receiving" << std::endl;
    return response;
  }

  const std::string HTTPCommunicator::id() const noexcept{
    return std::string("ClientID");
  }
  
  const std::string HTTPCommunicator::address() const noexcept{
    return std::string("ClientAddress");
  }
}
