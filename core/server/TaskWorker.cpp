
// Local private includes
#include "unistd.h"
#include "DynaLog.hpp"
#include "Config.hpp"
#include "ITaskMgr.hpp"
#include "TaskWorker.hpp"

// Common public includes
#include "CommunicatorFactory.hpp"
#include "CredentialFactory.hpp"
#include "ICommunicator.hpp"
#include "IMessage.hpp"
#include "MessageFactory.hpp"
#include "SocketOptions.hpp"

// Standard includes
#include <memory>
#include <sstream>

using namespace std;
using namespace libjson;

//#define TASK_DELAY sleep(60);
#define TASK_DELAY

namespace SDMS {
namespace Core {

TaskWorker::TaskWorker( ITaskMgr & a_mgr, uint32_t a_worker_id ) :
    ITaskWorker( a_worker_id ),
    m_mgr( a_mgr ),
    m_thread( 0 ),
    m_db( Config::getInstance().db_url , Config::getInstance().db_user, Config::getInstance().db_pass )
{
    m_thread = new thread( &TaskWorker::workerThread, this );

    m_execute[TC_RAW_DATA_TRANSFER] = &cmdRawDataTransfer;
    m_execute[TC_RAW_DATA_DELETE] = &cmdRawDataDelete;
    m_execute[TC_RAW_DATA_UPDATE_SIZE] = &cmdRawDataUpdateSize;
    m_execute[TC_ALLOC_CREATE] = &cmdAllocCreate;
    m_execute[TC_ALLOC_DELETE] = &cmdAllocDelete;
}

TaskWorker::~TaskWorker()
{
}

/**
 * @brief Thread method for TaskWorker task processing.
 *
 * Basic loop of getting a task from TaskMgr, processing, then reporting back to TaskMgr.
 * All steps of a task are processed unless a non-permanent failure occurs. Task control
 * objects (Task*) are released by the TaskMgr when either retryTask or getNextTask are
 * called.
 */
void
TaskWorker::workerThread()
{
    string             err_msg;
    Value              task_cmd;
    Value::ObjectIter  iter;
    uint32_t           cmd;
    int                step;
    bool               first;

    while( 1 )
    {
        m_task = m_mgr.getNextTask( this );

        err_msg.clear();
        first = true;

        while ( true )
        {
            try
            {
                if ( first ){
                    std::cout << "Calling taskRun: " << m_task->task_id << " running from start." << std::endl;
                    m_db.taskRun( m_task->task_id, task_cmd, 0 );
                    first = false;
                }
                else
                {
                    DL_TRACE( "Calling task run, step: " << step );
                    std::cout << "Calling taskRun: " << m_task->task_id << " at step: " << step << " err_msg is: " << err_msg << std::endl;

                    m_db.taskRun( m_task->task_id, task_cmd, err_msg.size()?0:&step, err_msg.size()?&err_msg:0 );
                }

                //DL_DEBUG( "task reply: " << task_cmd.toString() );

                const Value::Object & obj = task_cmd.asObject();

                cmd = (uint32_t)obj.getNumber( "cmd" );

                const Value & params = obj.getValue( "params" );

                if ( obj.has( "step" )) {
                    step = obj.asNumber();
                } else if ( cmd != TC_STOP )
                    EXCEPT(1,"Reply missing step value" );

                //bool retry = false;
                ICommunicator::Response response;
                if(m_execute.count(cmd)) {
                  DL_DEBUG( "TASK_ID: " << m_task->task_id << ", Step: " << step );
                  response = m_execute[cmd](*this, params);
                
                } else if( cmd == TC_STOP) {
                    m_mgr.newTasks( params );
                    break;
                } else {
                  EXCEPT_PARAM(1,"Invalid task command: " << cmd );
                }

                if ( response.error or response.time_out )
                {
                    if ( m_mgr.retryTask( m_task ))
                    {
                        err_msg = "Maximum task retry period exceeded.";
                        // We give up, exit inner while loop and delete task
                        break;
                    }
                    else
                    {
                        // Done for now - TaskMgr owns task, so clear ptr to prevent deletion, then exit inner while loop
                        m_task = 0;
                        break;
                    }
                }
            }
            catch( TraceException & e )
            {
                err_msg = e.toString();
                DL_ERROR( "Task worker " << id() << " exception: " << err_msg );
            }
            catch( exception & e )
            {
                err_msg = e.what();
                DL_ERROR( "Task worker " << id() << " exception: " << err_msg );
            }

            task_cmd.clear();
        } // End of inner while loop

        // Free task only if set
        if ( m_task )
        {
            delete m_task;
            m_task = 0;
        }

    } // End of outer while loop
}

ICommunicator::Response
TaskWorker::cmdRawDataTransfer(TaskWorker & me, const Value & a_task_params )
{

    const Value::Object & obj = a_task_params.asObject();

    const string &              uid = obj.getString( "uid" );
    TaskType                    type = (TaskType)obj.getNumber( "type" );
    Encryption                  encrypt = (Encryption)obj.getNumber( "encrypt" );
    const string &              src_ep = obj.getString( "src_repo_ep" );
    const string &              src_path = obj.getString( "src_repo_path" );
    const string &              dst_ep = obj.getString( "dst_repo_ep" );
    const string &              dst_path = obj.getString( "dst_repo_path" );
    const Value::Array &        files = obj.getArray( "files" );
    bool                        encrypted = true;
    GlobusAPI::EndpointInfo     ep_info;

    string acc_tok = obj.getString( "acc_tok" );
    string ref_tok = obj.getString( "ref_tok" );
    uint32_t expires_in = obj.getNumber( "acc_tok_exp_in" );

    DL_TRACE( ">>>> Token Expires in: " << expires_in );

    if ( expires_in < 3600 )
    {
        DL_DEBUG( "Refreshing access token for " << uid << " (expires in " << expires_in << ")" );

        me.m_glob.refreshAccessToken( ref_tok, acc_tok, expires_in );
        me.m_db.setClient( uid );
        me.m_db.userSetAccessToken( acc_tok, expires_in, ref_tok );
    }

    if ( type == TT_DATA_GET || type == TT_DATA_PUT )
    {
        const string & ep = (type == TT_DATA_GET)?dst_ep:src_ep;

        // Check destination endpoint
        me.m_glob.getEndpointInfo( ep, acc_tok, ep_info );
        if ( !ep_info.activated )
            EXCEPT_PARAM( 1, "Globus endpoint " << ep << " requires activation." );

        // TODO Notify if ep activation expiring soon

        // Calculate encryption state based on non-datafed endpoint
        encrypted = me.checkEncryption( ep_info, encrypt );

        // If data is external, also check the other endpoint for encryption state
        if ( type == TT_DATA_GET && obj.getValue( "src_repo_id" ).isNumber() )
        {
            GlobusAPI::EndpointInfo     ep_info2;

            me.m_glob.getEndpointInfo( src_ep, acc_tok, ep_info2 );
            if ( !ep_info.activated )
                EXCEPT_PARAM( 1, "Globus endpoint " << ep << " requires activation." );

            encrypted = me.checkEncryption( ep_info, ep_info2, encrypt );
        }
    }

    // Init Globus transfer
    DL_DEBUG( "Init globus transfer" );

    vector<pair<string,string>> files_v;
    for ( Value::ArrayConstIter f = files.begin(); f != files.end(); f++ )
    {
        const Value::Object & fobj = f->asObject();
        if ( type == TT_DATA_PUT || fobj.getNumber( "size" ) > 0 )
            files_v.push_back(make_pair( src_path + fobj.getString( "from" ), dst_path + fobj.getString( "to" )));
    }

    if ( files_v.size() )
    {
        DL_DEBUG( "Begin transfer of " << files_v.size() << " files" );
        std::cout << "Check transfer status of task: src_ep " << src_ep << " dest ep " << dst_ep << std::endl;
        string glob_task_id = me.m_glob.transfer( src_ep, dst_ep, files_v, encrypted, acc_tok );
        std::cout << "glob_task_id is " << glob_task_id << std::endl;
        // Monitor Globus transfer

        GlobusAPI::XfrStatus    xfr_status;
        string                  err_msg;

        do
        {
            std::cout << "Sleeping 5 seconds" << std::endl;
            sleep( 5 );
       
            std::cout << "\n!!!!!!!!!!!!!!!!!!!!!!!!! checkTransferStatus\n" << std::endl; 
            if ( me.m_glob.checkTransferStatus( glob_task_id, acc_tok, xfr_status, err_msg )){
                // Transfer task needs to be cancelled
              std::cout << "Cancel task " << glob_task_id << std::endl;
                me.m_glob.cancelTask( glob_task_id, acc_tok );
            }
        } while( xfr_status < GlobusAPI::XS_SUCCEEDED );

        if ( xfr_status == GlobusAPI::XS_FAILED ) {
            std::cout << "Failed!" << std::endl;
            EXCEPT( 1, err_msg );
        }
        std::cout << "maybe succeeded?" << std::endl;
    }
    else
    {
        DL_DEBUG( "No files to transfer" );
    }

    ICommunicator::Response response;
    response.time_out = false;
    return response;
}


ICommunicator::Response
TaskWorker::cmdRawDataDelete(TaskWorker & me, const  Value & a_task_params )
{

    const Value::Object & obj = a_task_params.asObject();

    //Auth::RepoDataDeleteRequest     del_req;
    //RecordDataLocation *            loc;
    //MsgBuf::Message *               reply;
    const string &                  repo_id = obj.getString( "repo_id" );
    const string &                  path = obj.getString( "repo_path" );
    const Value::Array &            ids = obj.getArray( "ids" );
    Value::ArrayConstIter           id = ids.begin();
    size_t                          i = 0, j, sz = ids.size();
    size_t                          chunk = Config::getInstance().repo_chunk_size;

    // Issue #603 - break large requests into chunks to reduce likelihood of timeouts
    MessageFactory msg_factory;
    ICommunicator::Response resp;

    while ( i < sz )
    {
        j = min( i + chunk, sz );

        auto message_req = msg_factory.create(MessageType::GOOGLE_PROTOCOL_BUFFER);

        auto del_req = std::make_unique<Auth::RepoDataDeleteRequest>();//     del_req;
        for ( ; i < j; i++, id++ )
        {
            RecordDataLocation * loc = del_req->add_loc();
            loc->set_id( id->asString() );
            loc->set_path( path + id->asString().substr(2) );
        }
        message_req->setPayload(std::move(del_req));

        resp = me.repoSendRecv( repo_id, std::move(message_req));
        if( resp.error or resp.time_out) {
            return resp;
        }

        //del_req.clear_loc();
    }
    return resp;
}


ICommunicator::Response
TaskWorker::cmdRawDataUpdateSize(TaskWorker & me, const  Value & a_task_params )
{

    const Value::Object & obj = a_task_params.asObject();

    const string &                  repo_id = obj.getString( "repo_id" );
    const string &                  path = obj.getString( "repo_path" );
    const Value::Array &            ids = obj.getArray( "ids" );
    auto size_req = std::make_unique<Auth::RepoDataGetSizeRequest>(); //   sz_req;
    //RecordDataLocation *            loc;

    MessageFactory msg_factory;
    auto message_req = msg_factory.create(MessageType::GOOGLE_PROTOCOL_BUFFER);

    for ( Value::ArrayConstIter id = ids.begin(); id != ids.end(); id++ ) {
        RecordDataLocation * loc = size_req->add_loc();
        loc->set_id( id->asString() );
        loc->set_path( path + id->asString().substr(2) );
    }

    message_req->setPayload(std::move(size_req));

    ICommunicator::Response response = me.repoSendRecv( repo_id, std::move(message_req) );
    //if( response.time_out == false and response.error == false ) {
    //  return response;
    //}
    //if ( repoSendRecv( repo_id, sz_req, reply ))
    //    return true;
    if( response.time_out == false and response.error == false ) {
      auto proto_msg = std::get<google::protobuf::Message*>(response.message->getPayload());
      auto size_reply = dynamic_cast<Auth::RepoDataSizeReply*>(proto_msg);
      if ( size_reply->size_size() != (int)ids.size() ) {
            EXCEPT_PARAM( 1, "Mismatched result size with RepoDataSizeReply from repo: " << repo_id );
      }

      me.m_db.recordUpdateSize( *size_reply );
    } else {
      EXCEPT_PARAM( 1, "Unexpected reply to RepoDataSizeReply from repo: " << repo_id );
    }

    return response;
}


ICommunicator::Response
TaskWorker::cmdAllocCreate(TaskWorker & me, const Value & a_task_params )
{
    const Value::Object & obj = a_task_params.asObject();

    const string & repo_id = obj.getString( "repo_id" );
    const string & path = obj.getString( "repo_path" );

    MessageFactory msg_factory;
    auto message = msg_factory.create(MessageType::GOOGLE_PROTOCOL_BUFFER);

    auto req = std::make_unique<Auth::RepoPathCreateRequest>();
    req->set_path( path );
    message->setPayload(std::move(req));
    return me.repoSendRecv( repo_id, std::move(message) );
}


ICommunicator::Response
TaskWorker::cmdAllocDelete(TaskWorker & me, const Value & a_task_params )
{

    const Value::Object & obj = a_task_params.asObject();

    const string & repo_id = obj.getString( "repo_id" );
    const string & path = obj.getString( "repo_path" );

    MessageFactory msg_factory;
    auto message = msg_factory.create(MessageType::GOOGLE_PROTOCOL_BUFFER);

    auto req = std::make_unique<Auth::RepoPathDeleteRequest>();
    req->set_path( path );
    message->setPayload(std::move(req));

    return me.repoSendRecv( repo_id, std::move(message) );
}


bool
TaskWorker::checkEncryption( const GlobusAPI::EndpointInfo & a_ep_info, Encryption a_encrypt )
{
    switch ( a_encrypt )
    {
        case ENCRYPT_NONE:
            if ( a_ep_info.force_encryption )
                EXCEPT_PARAM( 1, "Endpoint " << a_ep_info.id << " requires encryption.");
            return false;
        case ENCRYPT_AVAIL:
            if ( a_ep_info.supports_encryption )
                return true;
            else
                return false;
        case ENCRYPT_FORCE:
            if ( !a_ep_info.supports_encryption )
                EXCEPT_PARAM( 1, "Endpoint " << a_ep_info.id << " does not support encryption.");
            return true;
        default:
            EXCEPT_PARAM( 1, "Invalid transfer encryption value: " << a_encrypt );
    }

    // compiler warns, but can't get here
    return false;
}

bool
TaskWorker::checkEncryption( const GlobusAPI::EndpointInfo & a_ep_info1, const GlobusAPI::EndpointInfo & a_ep_info2, Encryption a_encrypt )
{
    switch ( a_encrypt )
    {
        case ENCRYPT_NONE:
            if ( a_ep_info1.force_encryption && a_ep_info1.force_encryption )
                EXCEPT_PARAM( 1, "Endpoints " << a_ep_info1.id << " and " << a_ep_info2.id << " require encryption.");
            else if ( a_ep_info1.force_encryption )
                EXCEPT_PARAM( 1, "Endpoint " << a_ep_info1.id << " requires encryption.");
            else if ( a_ep_info2.force_encryption )
                EXCEPT_PARAM( 1, "Endpoint " << a_ep_info2.id << " requires encryption.");
            return false;
        case ENCRYPT_AVAIL:
            if ( a_ep_info1.supports_encryption && a_ep_info2.supports_encryption )
                return true;
            else
                return false;
        case ENCRYPT_FORCE:
            if ( !a_ep_info1.supports_encryption && !a_ep_info1.supports_encryption )
                EXCEPT_PARAM( 1, "Endpoints " << a_ep_info1.id << " and " << a_ep_info1.id << " do not support encryption.");
            else if ( !a_ep_info1.supports_encryption )
                EXCEPT_PARAM( 1, "Endpoint " << a_ep_info1.id << " does not support encryption.");
            else if ( !a_ep_info2.supports_encryption )
                EXCEPT_PARAM( 1, "Endpoint " << a_ep_info2.id << " does not support encryption.");
            return true;
        default:
            EXCEPT_PARAM( 1, "Invalid transfer encryption value: " << a_encrypt );
    }

    // compiler warns, but can't get here
    return false;
}

ICommunicator::Response
TaskWorker::repoSendRecv( const string & a_repo_id, std::unique_ptr<IMessage> && a_msg)
{
    Config & config = Config::getInstance();

    std::string registered_repos = "";

    auto repos = config.getRepos();
    for ( auto & repo : repos ) {
      registered_repos =  repo.second.id() + " ";
    }

    if ( !repos.count(a_repo_id) ) {
        EXCEPT_PARAM( 1, "Task refers to non-existent repo server: " << a_repo_id << " Registered repos are: " << registered_repos );
    }

  // Need to be able to split repos into host and scheme and port
    std::cout << "ID is " << id() << std::endl;
      //const std::string client_id = "task_worker-" + id();
    const std::string client_id = [&]() {
      std::stringstream ss;
      ss << "task_worker-";
      ss << id();
      std::string str;
      ss >> str;
      return str;
    }();

  std::cout << "Client ID of task worker is: " << client_id << std::endl;
  auto client = [&](const std::string & repo_address,const std::string & repo_pub_key, const std::string & socket_id) {
    AddressSplitter splitter(repo_address);

    /// Creating input parameters for constructing Communication Instance
    SocketOptions socket_options;
    socket_options.scheme = splitter.scheme();
    socket_options.scheme = URIScheme::TCP;
    socket_options.class_type = SocketClassType::CLIENT; 
    socket_options.direction_type = SocketDirectionalityType::BIDIRECTIONAL; 
    socket_options.communication_type = SocketCommunicationType::ASYNCHRONOUS;
    socket_options.connection_life = SocketConnectionLife::INTERMITTENT;
    socket_options.connection_security = SocketConnectionSecurity::SECURE;
    socket_options.protocol_type = ProtocolType::ZQTP; 
    socket_options.host = splitter.host();
    socket_options.port = splitter.port();
    socket_options.local_id = socket_id;
    std::cout << "Setting local socket id to " << socket_id << std::endl;
    std::cout << "Setting local socket id to " << *socket_options.local_id << std::endl;

    CredentialFactory cred_factory;
   
    std::unordered_map<CredentialType, std::string> cred_options;
    cred_options[CredentialType::PUBLIC_KEY] = config.sec_ctx->get(CredentialType::PUBLIC_KEY);
    cred_options[CredentialType::PRIVATE_KEY] = config.sec_ctx->get(CredentialType::PRIVATE_KEY);
    // Cannot grab the public key from sec_ctx because we have several repos to pick from 
    //cred_options[CredentialType::SERVER_KEY] = config.sec_ctx->get(CredentialType::SERVER_KEY);
    std::cout << __LINE__ << "Grabbing server key from TaskWorker" << std::endl;
    cred_options[CredentialType::SERVER_KEY] = repo_pub_key;

    std::cout << "Core server Client to repo server public key " << cred_options[CredentialType::PUBLIC_KEY] << std::endl;
    std::cout << "Core server Client to repo server private key " << cred_options[CredentialType::PRIVATE_KEY] << std::endl;
    std::cout << "Core server Client to repo server Repo public key " << cred_options[CredentialType::SERVER_KEY] << std::endl;
    auto credentials = cred_factory.create(ProtocolType::ZQTP, cred_options);

    
    uint32_t timeout_on_receive = Config::getInstance().repo_timeout;
    long timeout_on_poll = Config::getInstance().repo_timeout;

    // When creating a communication channel with a server application we need
    // to locally have a client socket. So though we have specified a client
    // socket we will actually be communicating with the server.
    CommunicatorFactory communicator_factory;
    return communicator_factory.create(
        socket_options,
        *credentials,
        timeout_on_receive,
        timeout_on_poll);

  }(repos.at(a_repo_id).address(), repos.at(a_repo_id).pub_key(), client_id); // Pass the address into the lambda


    std::cout << "Client " << client->id() << " sending msg" << std::endl; 
    client->send( *a_msg );

    std::cout << "Client " << client->id() << " waiting to receive response msg" << std::endl; 
    ICommunicator::Response response = client->receive(MessageType::GOOGLE_PROTOCOL_BUFFER);
    if( response.time_out ) {
        DL_ERROR( "Timeout waiting for response from " << a_repo_id << " address " << client->address() );
        cerr.flush();
        return response;
    } else if(response.error) {
        DL_ERROR( "Error while waiting for response from " << a_repo_id << " " << response.error_msg );
        cerr.flush();
        return response;
    }

    auto proto_msg = std::get<google::protobuf::Message*>( response.message->getPayload() ); 
    auto nack = dynamic_cast<Anon::NackReply *>(proto_msg);
    if( nack != 0) {
      ErrorCode code = nack->err_code();
      string  msg = nack->has_err_msg()?nack->err_msg():"Unknown service error";
      EXCEPT( code, msg );
    }
    return response;
}

}}
