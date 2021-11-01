#include "unistd.h"
#include "DynaLog.hpp"
#include "Config.hpp"
#include "ITaskMgr.hpp"
#include "TaskWorker.hpp"

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
    bool               retry = false;
    string             err_msg;
    Value              task_cmd;
    Value::ObjectIter  iter;
    uint32_t           cmd;
    int                step;
    bool               first;

    DL_DEBUG( "Task worker " << id() << " started." )

    while( 1 )
    {
        m_task = m_mgr.getNextTask( this );

        DL_DEBUG("Task worker " << id() << " handling new task " << m_task->task_id );

        err_msg.clear();
        first = true;

        while ( true )
        {
            try
            {
                if ( first ){
                    DL_TRACE( "Calling task run (first)" );
                    DL_DEBUG( "Calling task run (first)" << __FILE__ << ":" << __LINE__  );
                    m_db.taskRun( m_task->task_id, task_cmd, 0 );
                    DL_DEBUG( "Calling task run (first)" << __FILE__ << ":" << __LINE__ );
                    first = false;
                }
                else
                {
                    DL_TRACE( "Calling task run, step: " << step );
                    DL_DEBUG( "Calling task run, step: " << step  << " "<< __FILE__ << ":" << __LINE__ );
                    m_db.taskRun( m_task->task_id, task_cmd, err_msg.size()?0:&step, err_msg.size()?&err_msg:0 );
                    DL_DEBUG( "Calling task run, step: " << step  << " "<< __FILE__ << ":" << __LINE__ );
                }

                //DL_DEBUG( "task reply: " << task_cmd.toString() );

                const Value::Object & obj = task_cmd.asObject();

                DL_DEBUG( "getNumber" );
                cmd = (uint32_t)obj.getNumber( "cmd" );

                DL_DEBUG( "getValue params" );
                const Value & params = obj.getValue( "params" );

                if ( obj.has( "step" )) {
                    DL_DEBUG( "asNumber" );
                    step = obj.asNumber();
                } else if ( cmd != TC_STOP )
                    EXCEPT(1,"Reply missing step value" );

                switch ( cmd )
                {
                case TC_RAW_DATA_TRANSFER:
                    DL_DEBUG( "cmdRawDataTransfer" << __FILE__ << ":" << __LINE__ );
                    retry = cmdRawDataTransfer( params );
                    DL_DEBUG( "cmdRawDataTransfer" << __FILE__ << ":" << __LINE__ );
                    break;
                case TC_RAW_DATA_DELETE:
                    DL_DEBUG( "cmdRawDataDelete" << __FILE__ << ":" << __LINE__ );
                    retry = cmdRawDataDelete( params );
                    DL_DEBUG( "cmdRawDataDelete" << __FILE__ << ":" << __LINE__ );
                    break;
                case TC_RAW_DATA_UPDATE_SIZE:
                    DL_DEBUG( "cmdRawDataUpdateSize" << __FILE__ << ":" << __LINE__ );
                    retry = cmdRawDataUpdateSize( params );
                    DL_DEBUG( "cmdRawDataUpdateSize" << __FILE__ << ":" << __LINE__ );
                    break;
                case TC_ALLOC_CREATE:
                    DL_DEBUG( "cmdAllocCreate" << __FILE__ << ":" << __LINE__ );
                    retry = cmdAllocCreate( params );
                    DL_DEBUG( "cmdAllocCreate" << __FILE__ << ":" << __LINE__ );
                    break;
                case TC_ALLOC_DELETE:
                    DL_DEBUG( "cmdAllocDelete" << __FILE__ << ":" << __LINE__ );
                    retry = cmdAllocDelete( params );
                    DL_DEBUG( "cmdAllocDelete" << __FILE__ << ":" << __LINE__ );
                    break;
                case TC_STOP:
                    DL_DEBUG( "Task STOP." );
                    m_mgr.newTasks( params );
                    DL_DEBUG( "Task STOP" << __FILE__ << ":" << __LINE__ );
                    break;
                default:
                    EXCEPT_PARAM(1,"Invalid task command: " << cmd );
                }

                // Done processing - exit inner while loop
                if ( cmd == TC_STOP )
                    break;

                if ( retry )
                {
                    if ( m_mgr.retryTask( m_task ))
                    {
                        DL_DEBUG("Task worker " << id() << " aborting task " << m_task->task_id );
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


bool
TaskWorker::cmdRawDataTransfer( const Value & a_task_params )
{
    DL_DEBUG( "Task " << m_task->task_id << " cmdRawDataTransfer" );

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
    DL_DEBUG( ">>>> Token Expires in: " << expires_in );

    if ( expires_in < 3600 )
    {
        DL_DEBUG( "Refreshing access token for " << uid << " (expires in " << expires_in << ")" );

        m_glob.refreshAccessToken( ref_tok, acc_tok, expires_in );
        m_db.setClient( uid );
        m_db.userSetAccessToken( acc_tok, expires_in, ref_tok );
    }

    if ( type == TT_DATA_GET || type == TT_DATA_PUT )
    {
        const string & ep = (type == TT_DATA_GET)?dst_ep:src_ep;

        // Check destination endpoint
        m_glob.getEndpointInfo( ep, acc_tok, ep_info );
        if ( !ep_info.activated )
            EXCEPT_PARAM( 1, "Globus endpoint " << ep << " requires activation." );

        // TODO Notify if ep activation expiring soon

        // Calculate encryption state based on non-datafed endpoint
        encrypted = checkEncryption( ep_info, encrypt );

        // If data is external, also check the other endpoint for encryption state
        if ( type == TT_DATA_GET && obj.getValue( "src_repo_id" ).isNumber() )
        {
            DL_DEBUG( "Download involves external data" );
            GlobusAPI::EndpointInfo     ep_info2;

            m_glob.getEndpointInfo( src_ep, acc_tok, ep_info2 );
            if ( !ep_info.activated )
                EXCEPT_PARAM( 1, "Globus endpoint " << ep << " requires activation." );

            encrypted = checkEncryption( ep_info, ep_info2, encrypt );
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

        string glob_task_id = m_glob.transfer( src_ep, dst_ep, files_v, encrypted, acc_tok );

        // Monitor Globus transfer

        GlobusAPI::XfrStatus    xfr_status;
        string                  err_msg;

        do
        {
            sleep( 5 );
        
            DL_DEBUG( "checking transfer status" << __FILE__ << ":" << __LINE__ );

            if ( m_glob.checkTransferStatus( glob_task_id, acc_tok, xfr_status, err_msg ))
            {
                // Transfer task needs to be cancelled
                m_glob.cancelTask( glob_task_id, acc_tok );
                DL_DEBUG( "task canceled" << __FILE__ << ":" << __LINE__ );
            }
        } while( xfr_status < GlobusAPI::XS_SUCCEEDED );

        DL_DEBUG( "xft_status >= GlobusAPI:XS_SUCCEEDED" << __FILE__ << ":" << __LINE__ );
        if ( xfr_status == GlobusAPI::XS_FAILED ) {
            DL_DEBUG( "XS_FAILED" << __FILE__ << ":" << __LINE__ );
            EXCEPT( 1, err_msg );
        }
    }
    else
    {
        DL_DEBUG( "No files to transfer" );
    }

    return false;
}


bool
TaskWorker::cmdRawDataDelete( const  Value & a_task_params )
{
    DL_DEBUG( "Task " << m_task->task_id << " cmdRawDataDelete" );

    const Value::Object & obj = a_task_params.asObject();

    Auth::RepoDataDeleteRequest     del_req;
    RecordDataLocation *            loc;
    MsgBuf::Message *               reply;
    const string &                  repo_id = obj.getString( "repo_id" );
    const string &                  path = obj.getString( "repo_path" );
    const Value::Array &            ids = obj.getArray( "ids" );
    Value::ArrayConstIter           id = ids.begin();
    size_t                          i = 0, j, sz = ids.size();
    size_t                          chunk = Config::getInstance().repo_chunk_size;

    // Issue #603 - break large requests into chunks to reduce likelihood of timeouts


    while ( i < sz )
    {
        j = min( i + chunk, sz );

        for ( ; i < j; i++, id++ )
        {
            loc = del_req.add_loc();
            loc->set_id( id->asString() );
            loc->set_path( path + id->asString().substr(2) );
        }

        if ( repoSendRecv( repo_id, del_req, reply ))
        {
            return true;
        }

        delete reply;
        del_req.clear_loc();
    }

    return false;
}


bool
TaskWorker::cmdRawDataUpdateSize( const  Value & a_task_params )
{
    DL_DEBUG( "Task " << m_task->task_id << " cmdRawDataUpdateSize" );

    const Value::Object & obj = a_task_params.asObject();

    const string &                  repo_id = obj.getString( "repo_id" );
    const string &                  path = obj.getString( "repo_path" );
    const Value::Array &            ids = obj.getArray( "ids" );
    Auth::RepoDataGetSizeRequest    sz_req;
    Auth::RepoDataSizeReply *       sz_rep;
    RecordDataLocation *            loc;
    MsgBuf::Message *               reply;

    for ( Value::ArrayConstIter id = ids.begin(); id != ids.end(); id++ )
    {
        loc = sz_req.add_loc();
        loc->set_id( id->asString() );
        loc->set_path( path + id->asString().substr(2) );
    }

    if ( repoSendRecv( repo_id, sz_req, reply ))
        return true;

    if (( sz_rep = dynamic_cast<Auth::RepoDataSizeReply*>( reply )) != 0 )
    {
        if ( sz_rep->size_size() != (int)ids.size() )
            EXCEPT_PARAM( 1, "Mismatched result size with RepoDataSizeReply from repo: " << repo_id );

        m_db.recordUpdateSize( *sz_rep );

        delete reply;
    }
    else
    {
        delete reply;
        EXCEPT_PARAM( 1, "Unexpected reply to RepoDataSizeReply from repo: " << repo_id );
    }

    return false;
}


bool
TaskWorker::cmdAllocCreate( const Value & a_task_params )
{
    DL_DEBUG( "Task " << m_task->task_id << " cmdAllocCreate" );

    const Value::Object & obj = a_task_params.asObject();

    const string & repo_id = obj.getString( "repo_id" );
    const string & path = obj.getString( "repo_path" );

    Auth::RepoPathCreateRequest     req;
    MsgBuf::Message *               reply;

    req.set_path( path );

    if ( repoSendRecv( repo_id, req, reply ))
        return true;

    delete reply;

    return false;
}


bool
TaskWorker::cmdAllocDelete( const Value & a_task_params )
{
    DL_DEBUG( "Task " << m_task->task_id << " cmdAllocDelete" );

    const Value::Object & obj = a_task_params.asObject();

    const string & repo_id = obj.getString( "repo_id" );
    const string & path = obj.getString( "repo_path" );

    Auth::RepoPathDeleteRequest         req;
    MsgBuf::Message *                   reply;

    req.set_path( path );

    if ( repoSendRecv( repo_id, req, reply ))
        return true;

    delete reply;

    return false;
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

bool
TaskWorker::repoSendRecv( const string & a_repo_id, MsgBuf::Message & a_msg, MsgBuf::Message *& a_reply )
{
    Config & config = Config::getInstance();

    map<string,RepoData*>::iterator rd = config.repos.find( a_repo_id );
    if ( rd == config.repos.end() )
        EXCEPT_PARAM( 1, "Task refers to non-existent repo server: " << a_repo_id );

    MsgComm comm( rd->second->address(), MsgComm::DEALER, false, &config.sec_ctx );

    comm.send( a_msg );

    MsgBuf buffer;

    if ( !comm.recv( buffer, false, config.repo_timeout ))
    {
        DL_ERROR( "Timeout waiting for response from " << a_repo_id );
        cerr.flush();
        return true;
    }
    else
    {
        // Check for NACK
        a_reply = buffer.unserialize();

        Anon::NackReply * nack = dynamic_cast<Anon::NackReply*>( a_reply );
        if ( nack != 0 )
        {
            ErrorCode code = nack->err_code();
            string  msg = nack->has_err_msg()?nack->err_msg():"Unknown service error";

            delete a_reply;

            EXCEPT( code, msg );
        }

        return false;
    }
}

}}
