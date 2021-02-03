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
                    DL_DEBUG( "Calling task run (first)" );
                    m_db.taskRun( m_task->task_id, task_cmd, 0 );
                    first = false;
                }
                else
                {
                    DL_DEBUG( "Calling task run, step: " << step );
                    m_db.taskRun( m_task->task_id, task_cmd, err_msg.size()?0:&step, err_msg.size()?&err_msg:0 );
                }

                //DL_DEBUG( "task reply: " << task_cmd.toString() );

                const Value::Object & obj = task_cmd.asObject();

                cmd = (uint32_t)obj.getNumber( "cmd" );

                const Value & params = obj.getValue( "params" );

                if ( obj.has( "step" ))
                    step = obj.asNumber();
                else if ( cmd != TC_STOP )
                    EXCEPT(1,"Reply missing step value" );

                switch ( cmd )
                {
                case TC_RAW_DATA_TRANSFER:
                    retry = cmdRawDataTransfer( params );
                    break;
                case TC_RAW_DATA_DELETE:
                    retry = cmdRawDataDelete( params );
                    break;
                case TC_RAW_DATA_UPDATE_SIZE:
                    retry = cmdRawDataUpdateSize( params );
                    break;
                case TC_ALLOC_CREATE:
                    retry = cmdAllocCreate( params );
                    break;
                case TC_ALLOC_DELETE:
                    retry = cmdAllocDelete( params );
                    break;
                case TC_STOP:
                    DL_DEBUG("Task STOP. payload: " << params.toString() );
                    m_mgr.newTasks( params );
                    break;
                default:
                    EXCEPT_PARAM(1,"Invalid task command: " << cmd );
                }
                //DL_DEBUG("sleep");
                //sleep(10);

                if ( cmd == TC_STOP )
                    break;

                if ( retry )
                {
                    if ( m_mgr.retryTask( m_task ))
                    {
                        DL_DEBUG("Task worker " << id() << " aborting task " << m_task->task_id );
                        //abortTask( "Maximum task retry period exceeded." );
                        err_msg = "Maximum task retry period exceeded.";
                    }

                    break;
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
        }
    }
}


void
TaskWorker::abortTask( const std::string & a_msg )
{
    DL_DEBUG("Task worker " << id() << " aborting task " << m_task->task_id );

    try
    {
        libjson::Value reply;

        m_db.taskAbort( m_task->task_id, a_msg, reply );

        m_mgr.newTasks( reply );
    }
    catch( TraceException & e )
    {
        DL_ERROR("TaskWorker::abortTask - EXCEPTION: " << e.toString() );
    }
    catch( exception & e )
    {
        DL_ERROR("TaskWorker::abortTask - EXCEPTION: " << e.what() );
    }
    catch(...)
    {
        DL_ERROR("TaskWorker::abortTask - EXCEPTION!");
    }
}


bool
TaskWorker::cmdRawDataTransfer( const Value & a_task_params )
{
    DL_INFO( "Task " << m_task->task_id << " cmdRawDataTransfer" );
    //DL_DEBUG( "params: " << a_task_params.toString() );

    const Value::Object & obj = a_task_params.asObject();

    const string &              uid = obj.getString( "uid" );
    TaskType                    type = (TaskType)obj.getNumber( "type" );
    Encryption                  encrypt = (Encryption)obj.getNumber( "encrypt" );
    const string &              src_ep = obj.getString( "src_repo_ep" );
    const string &              src_path = obj.getString( "src_repo_path" );
    const string &              dst_ep = obj.getString( "dst_repo_ep" );
    const string &              dst_path = obj.getString( "dst_repo_path" );
    const Value::Array &        files = obj.getArray( "files" );
    string                      src_repo_id;
    string                      dst_repo_id;
    bool                        encrypted = true;
    GlobusAPI::EndpointInfo     ep_info;

    switch ( type )
    {
    case TT_DATA_GET:
        src_repo_id = obj.getString( "src_repo_id" );
        break;
    case TT_DATA_PUT:
        dst_repo_id = obj.getString( "dst_repo_id" );
        break;
    case TT_REC_CHG_ALLOC:
    case TT_REC_CHG_OWNER:
        src_repo_id = obj.getString( "src_repo_id" );
        dst_repo_id = obj.getString( "dst_repo_id" );
        break;
    default:
        EXCEPT_PARAM( 1, "Invalid task type for raw data transfer command: " << type );
        break;
    }

    string acc_tok = obj.getString( "acc_tok" );
    string ref_tok = obj.getString( "ref_tok" );
    uint32_t expires_in = obj.getNumber( "acc_tok_exp_in" );

    if ( expires_in < 300 )
    {
        DL_INFO( "Refreshing access token for " << uid );

        m_glob.refreshAccessToken( ref_tok, acc_tok, expires_in );
        m_db.setClient( uid );
        m_db.userSetAccessToken( acc_tok, expires_in, ref_tok );
    }

    //EXCEPT(1,"TEST ONLY EXCEPTION");

    if ( type == TT_DATA_GET || type == TT_DATA_PUT )
    {
        const string & ep = (type == TT_DATA_GET)?dst_ep:src_ep;

        // Check destination endpoint
        m_glob.getEndpointInfo( ep, acc_tok, ep_info );
        if ( !ep_info.activated )
            EXCEPT_PARAM( 1, "Globus endpoint " << ep << " requires activation." );

        // TODO Notify if ep activation expiring soon

        // Calculate encryption state
        encrypted = checkEncryption( ep, encrypt, ep_info );
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

            if ( m_glob.checkTransferStatus( glob_task_id, acc_tok, xfr_status, err_msg ))
            {
                // Transfer task needs to be cancelled
                m_glob.cancelTask( glob_task_id, acc_tok );
            }
        } while( xfr_status < GlobusAPI::XS_SUCCEEDED );

        if ( xfr_status == GlobusAPI::XS_FAILED )
            EXCEPT( 1, err_msg );
    }else
    {
        DL_DEBUG( "No files to transfer" );
    }

    return false;
}


bool
TaskWorker::cmdRawDataDelete( const  Value & a_task_params )
{
    DL_INFO( "Task " << m_task->task_id << " cmdRawDataDelete" );
    //DL_DEBUG( "params: " << a_task_params.toString() );

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
    DL_INFO( "Task " << m_task->task_id << " cmdRawDataUpdateSize" );
    //DL_DEBUG( "params: " << a_task_params.toString() );

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
    DL_INFO( "Task " << m_task->task_id << " cmdAllocCreate" );
    //DL_DEBUG( "params: " << a_task_params.toString() );

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
    DL_INFO( "Task " << m_task->task_id << " cmdAllocDelete" );
    //DL_DEBUG( "params: " << a_task_params.toString() );

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
TaskWorker::checkEncryption( const std::string & a_ep, Encryption a_encrypt, const GlobusAPI::EndpointInfo & a_ep_info )
{
    switch ( a_encrypt )
    {
        case ENCRYPT_NONE:
            if ( a_ep_info.force_encryption )
                EXCEPT_PARAM( 1, "Endpoint " << a_ep << " requires encryption.");
            return false;
        case ENCRYPT_AVAIL:
            if ( a_ep_info.supports_encryption )
                return true;
            else
                return false;
        case ENCRYPT_FORCE:
            if ( !a_ep_info.supports_encryption )
                EXCEPT_PARAM( 1, "Endpoint " << a_ep << " does not support encryption.");
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
        DL_ERROR( "Timeout waiting for size response from repo " << a_repo_id );
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
