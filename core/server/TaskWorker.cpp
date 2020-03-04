#include "unistd.h"
#include "DynaLog.hpp"
#include "Config.hpp"
#include "ITaskMgr.hpp"
#include "TaskWorker.hpp"

using namespace std;

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
    bool                        retry = false;
    string                      err_msg;
    libjson::Value              task_cmd;
    libjson::Value::ObjectIter  iter;
    uint32_t                    cmd;
    int                         step;
    bool                        first;

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

                DL_DEBUG( "task reply: " << task_cmd.toString() );

                iter = task_cmd.find("cmd");
                if ( iter == task_cmd.end() )
                    EXCEPT(1,"Reply missing command value" );

                if ( !iter->second.isNumber() )
                    EXCEPT(1,"Reply command value has invalid type" );
                cmd = (uint32_t)iter->second.asNumber();

                iter = task_cmd.find("params");
                if ( iter == task_cmd.end() )
                    EXCEPT(1,"Reply missing params value" );

                libjson::Value & params = iter->second;

                iter = task_cmd.find("step");
                if ( iter != task_cmd.end() )
                    step = iter->second.asNumber();
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
                    iter = task_cmd.find("new_tasks");
                    if ( iter != task_cmd.end() )
                    {
                        DL_DEBUG("found " << iter->second.size() << " new ready tasks." );
                        m_mgr.newTasks( iter->second );
                    }
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
                //abortTask( msg );
            }
            catch( exception & e )
            {
                err_msg = e.what();
                DL_ERROR( "Task worker " << id() << " exception: " << err_msg );
                //abortTask( msg );
            }
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
TaskWorker::cmdRawDataTransfer( libjson::Value & a_task_params )
{
    DL_INFO( "Task " << m_task->task_id << " cmdRawDataTransfer" );
    DL_DEBUG( "params: " << a_task_params.toString() );

    string &                    uid = a_task_params["uid"].asString();
    TaskType                    type = (TaskType)a_task_params["type"].asNumber();
    Encryption                  encrypt = (Encryption)a_task_params["encrypt"].asNumber();
    string &                    src_ep = a_task_params["src_repo_ep"].asString();
    string &                    src_path = a_task_params["src_repo_path"].asString();
    string &                    dst_ep = a_task_params["dst_repo_ep"].asString();
    string &                    dst_path = a_task_params["dst_repo_path"].asString();
    libjson::Value::Array &     files = a_task_params["files"].getArray();
    string                      src_repo_id;
    string                      dst_repo_id;
    bool                        encrypted = true;
    GlobusAPI::EndpointInfo     ep_info;

    switch ( type )
    {
    case TT_DATA_GET:
        src_repo_id = a_task_params["src_repo_id"].asString();
        break;
    case TT_DATA_PUT:
        dst_repo_id = a_task_params["dst_repo_id"].asString();
        break;
    case TT_REC_CHG_ALLOC:
    case TT_REC_CHG_OWNER:
        src_repo_id = a_task_params["src_repo_id"].asString();
        dst_repo_id = a_task_params["dst_repo_id"].asString();
        break;
    default:
        EXCEPT_PARAM( 1, "Invalid task type for raw data transfer command: " << type );
        break;
    }

    string acc_tok = a_task_params["acc_tok"].asString();
    string ref_tok = a_task_params["ref_tok"].asString();
    uint32_t expires_in = a_task_params["acc_tok_exp_in"].asNumber();

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
        string & ep = (type == TT_DATA_GET)?dst_ep:src_ep;

        // Check destination endpoint
        m_glob.getEndpointInfo( ep, acc_tok, ep_info );
        if ( !ep_info.activated )
            EXCEPT_PARAM( 1, "Globus endpoint " << ep << " requires activation." );

        // TODO Notify if ep activation expiring soon

        // Calculate encryption state
        encrypted = checkEncryption( ep, encrypt, ep_info );
    }

    // Init Globus transfer

    vector<pair<string,string>> files_v;
    for ( libjson::Value::ArrayIter f = files.begin(); f != files.end(); f++ )
        files_v.push_back(make_pair( src_path + (*f)["from"].asString(), dst_path + (*f)["to"].asString() ));

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

    return false;
}


bool
TaskWorker::cmdRawDataDelete( libjson::Value & a_task_params )
{
    DL_INFO( "Task " << m_task->task_id << " cmdRawDataDelete" );
    DL_DEBUG( "params: " << a_task_params.toString() );

    Auth::RepoDataDeleteRequest     del_req;
    RecordDataLocation *            loc;
    MsgBuf::Message *               reply;
    //time_t                          mod_time;
    const string &                  repo_id = a_task_params["repo_id"].asString();
    const string &                  path = a_task_params["repo_path"].asString();
    libjson::Value::Array &         ids = a_task_params["ids"].getArray();
    libjson::Value::ArrayIter       id;

    for ( id = ids.begin(); id != ids.end(); id++ )
    {
        loc = del_req.add_loc();
        loc->set_id( id->asString() );
        loc->set_path( path + id->asString().substr(2) );
    }

    if ( repoSendRecv( repo_id, del_req, reply ))
        return true;

    delete reply;

/*
    mod_time = time(0);

    // Update DB record with new file stats
    for ( id = ids.begin(); id != ids.end(); id++ )
    {
        m_db.recordUpdatePostPut( id->asString(), 0, mod_time, "", 0 );
    }
*/

    return false;
}


bool
TaskWorker::cmdRawDataUpdateSize( libjson::Value & a_task_params )
{
    DL_INFO( "Task " << m_task->task_id << " cmdRawDataUpdateSize" );
    DL_DEBUG( "params: " << a_task_params.toString() );

    const string &                  repo_id = a_task_params["repo_id"].asString();
    const string &                  path = a_task_params["repo_path"].asString();
    libjson::Value::Array &         ids = a_task_params["ids"].getArray();
    Auth::RepoDataGetSizeRequest    sz_req;
    Auth::RepoDataSizeReply *       sz_rep;
    RecordDataLocation *            loc;
    MsgBuf::Message *               reply;

    for ( libjson::Value::ArrayIter id = ids.begin(); id != ids.end(); id++ )
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
TaskWorker::cmdAllocCreate( libjson::Value & a_task_params )
{
    DL_INFO( "Task " << m_task->task_id << " cmdAllocCreate" );
    DL_DEBUG( "params: " << a_task_params.toString() );

    string & repo_id = a_task_params["repo_id"].asString();
    string & path = a_task_params["repo_path"].asString();

    Auth::RepoPathCreateRequest     req;
    MsgBuf::Message *               reply;

    req.set_path( path );

    if ( repoSendRecv( repo_id, req, reply ))
        return true;

    delete reply;

    return false;
}


bool
TaskWorker::cmdAllocDelete( libjson::Value & a_task_params )
{
    DL_INFO( "Task " << m_task->task_id << " cmdAllocDelete" );
    DL_DEBUG( "params: " << a_task_params.toString() );

    string & repo_id = a_task_params["repo_id"].asString();
    string & path = a_task_params["repo_path"].asString();

    Auth::RepoPathDeleteRequest         req;
    MsgBuf::Message *                   reply;

    req.set_path( path );

    if ( repoSendRecv( repo_id, req, reply ))
        return true;

    delete reply;

    return false;
}

/*
void
TaskWorker::finalizeTask( bool a_succeeded, const std::string & a_msg )
{
    DL_DEBUG( "TaskWorker finalizeTask " << m_task->task_id );

    libjson::Value new_tasks;

    try
    {
        m_db.taskFinalize( m_task->task_id, a_succeeded, a_msg, new_tasks );

        DL_DEBUG("found " << new_tasks.size() << " new ready tasks." );
        m_mgr.newTasks( new_tasks );
    }
    catch( TraceException & e )
    {
        DL_ERROR("Exception in finalizeTask " << m_task->task_id << ": " << e.toString() );
    }
    catch( exception & e )
    {
        DL_ERROR("Exception in finalizeTask " << m_task->task_id << ": " << e.what() );
    }
    catch( ... )
    {
        DL_ERROR("Unknown exception in finalizeTask " << m_task->task_id );
    }

    //m_tasks_running.erase( m_task->task_id );
    delete m_task;
    m_task = 0;
}
*/

#if 0

bool
TaskWorker::handleDataGet( )
{
    DL_INFO( "Starting task '" << m_task->task_id << "', type: DataGet" );

    string                      src_repo_ep;
    bool                        encrypted = false;
    GlobusAPI::EndpointInfo     ep_info;
    string                      uid = m_task->data["client"].asString();
    TaskStatus                  status = (TaskStatus) m_task->data["status"].asNumber();
    GlobusAPI::XfrStatus        xfr_status;
    double                      prog = 0;
    libjson::Value &            state = m_task->data["state"];
    Encryption                  encrypt = (Encryption)state["encrypt"].asNumber();
    libjson::Value::Array  &    repos = state["repos"].getArray();
    libjson::Value              upd_state;
    size_t                      repo_idx = 0;
    string                      dst_ep = state["dst_ep"].asString();
    string                      dst_path = state["dst_path"].asString();

    // DEBUG OUTPUT
    DL_DEBUG( "state: " << state.toString() );

    m_db.setClient( uid );
    getUserAccessToken( uid );

    // Check destination endpoint
    m_glob.getEndpointInfo( dst_ep, m_access_token, ep_info );
    if ( !ep_info.activated )
        EXCEPT_PARAM( 1, "Remote endpoint " << dst_ep << " requires activation." );

    // TODO Notify if dst ep activation expiring soon

    upd_state.initObject();

    if ( status == TS_READY )
    {
        // Initialize state
        status = TS_RUNNING;
        m_task->data["status"] = status;

        state["repo_idx"] = 0;
        upd_state["repo_idx"] = 0;

        xfr_status = GlobusAPI::XS_INIT;
        state["xfr_status"] = GlobusAPI::XS_INIT;
        upd_state["xfr_status"] = GlobusAPI::XS_INIT;

        // TODO Limit number of records transferred per globus request

        // Calculate encryption state
        encrypted = checkEncryption( encrypt, ep_info );
        state["encrypted"] = encrypted;
        upd_state["encrypted"] = encrypted;

        string msg = "Running";
        m_db.taskUpdate( m_task->task_id, &status, &msg, 0, &upd_state );

        TASK_DELAY
    }
    else if ( status == TS_RUNNING )
    {
        // Load previous state

        repo_idx = state["repo_idx"].asNumber();
        encrypted = state["encrypted"].asBool();
        xfr_status = (GlobusAPI::XfrStatus) state["xfr_status"].asNumber();
        if ( xfr_status > GlobusAPI::XS_INIT )
            m_glob_task_id = state["glob_task_id"].asString();
    }
    else
    {
        EXCEPT_PARAM( 1, "Task '" << m_task->task_id << "' has invalid status: " << status );
    }

    if ( repo_idx >= repos.size() )
        EXCEPT_PARAM( 1, "Task repo_idx (" << repo_idx << ") out of range (max: " << repos.size() << ")" );

    libjson::Value::ArrayIter   f, r;
    vector<pair<string,string>> files_v;
    string                      err_msg;

    for ( r = repos.begin() + repo_idx; r != repos.end(); r++ )
    {
        libjson::Value::Object & repo = r->getObject();

        // Initialize Globus transfer
        if ( xfr_status == GlobusAPI::XS_INIT )
        {
            libjson::Value::Array & files = repo["files"].getArray();

            upd_state.clear();
            files_v.clear();

            for ( f = files.begin(); f != files.end(); f++ )
            {
                files_v.push_back(make_pair( (*f)["from"].asString( ), dst_path + (*f)["to"].asString() ));
            }

            src_repo_ep = repo["repo_ep"].asString();

            DL_INFO( "src_repo_ep: " << src_repo_ep );

            m_glob_task_id = m_glob.transfer( src_repo_ep, dst_ep, files_v, encrypted, m_access_token );
            state["glob_task_id"] = m_glob_task_id;
            upd_state["glob_task_id"] = m_glob_task_id;

            xfr_status = GlobusAPI::XS_ACTIVE;
            state["xfr_status"] = xfr_status;
            upd_state["xfr_status"] = xfr_status;

            prog = 100.0*(repo_idx + .5)/repos.size();

            m_db.taskUpdate( m_task->task_id, 0, 0, &prog, &upd_state );
        }

        // Monitor Globus transfer
        xfr_status = monitorTransfer( err_msg );

        if ( xfr_status == GlobusAPI::XS_FAILED )
            EXCEPT( 1, err_msg );

        // Xfr SUCCEEDED, go to next
        upd_state.clear();
        xfr_status = GlobusAPI::XS_INIT;
        state["xfr_status"] = xfr_status;
        upd_state["xfr_status"] = xfr_status;
        repo_idx++;
        state["repo_idx"] = repo_idx;
        upd_state["repo_idx"] = repo_idx;

        prog = 100.0*repo_idx/repos.size();
        m_db.taskUpdate( m_task->task_id, 0, 0, &prog, &upd_state );
    }

    return false;
}


bool
TaskWorker::handleDataPut()
{
    DL_INFO( "Starting task " << m_task->task_id << ", type: DataPut" );

    string                      dst_ep;
    bool                        encrypted = false;
    GlobusAPI::EndpointInfo     ep_info;
    string                      uid = m_task->data["client"].asString();
    TaskStatus                  status = (TaskStatus) m_task->data["status"].asNumber();
    GlobusAPI::XfrStatus        xfr_status;
    double                      prog = 0;
    libjson::Value &            state = m_task->data["state"];
    Encryption                  encrypt = (Encryption)state["encrypt"].asNumber();
    libjson::Value::Array  &    repos = state["repos"].getArray();
    libjson::Value              upd_state;
    string                      src_ep = state["src_ep"].asString();
    string                      src_path = state["src_path"].asString();

    // DEBUG OUTPUT
    DL_DEBUG( "status: " << status << ", state: " << state.toString() );

    m_db.setClient( uid );
    getUserAccessToken( uid );

    // Check destination endpoint
    m_glob.getEndpointInfo( src_ep, m_access_token, ep_info );
    if ( !ep_info.activated )
        EXCEPT_PARAM( 1, "Remote endpoint " << dst_ep << " requires activation." );

    // TODO Notify if dst ep activation expiring soon

    upd_state.initObject();

    if ( status == TS_READY )
    {
        status = TS_RUNNING;
        m_task->data["status"] = status;

        xfr_status = GlobusAPI::XS_INIT;
        state["xfr_status"] = xfr_status;
        upd_state["xfr_status"] = xfr_status;

        // Calculate encryption state
        encrypted = checkEncryption( encrypt, ep_info );
        state["encrypted"] = encrypted;
        upd_state["encrypted"] = encrypted;
        string msg = "Running";

        //DL_DEBUG( "Update task for running" );

        m_db.taskUpdate( m_task->task_id, &status, &msg, 0, &upd_state );

        TASK_DELAY
    }
    else if ( status == TS_RUNNING )
    {
        //DL_DEBUG( "Read state for already running task" );

        encrypted = state["encrypted"].asBool();
        xfr_status = (GlobusAPI::XfrStatus) state["xfr_status"].asNumber();
        if ( xfr_status > GlobusAPI::XS_INIT )
            m_glob_task_id = state["glob_task_id"].asString();
    }
    else
    {
        EXCEPT_PARAM( 1, "Task '" << m_task->task_id << "' has invalid status: " << status );
    }


    if ( repos.size() != 1 )
        EXCEPT_PARAM( 1, "Task repo list size != 1, size: " << repos.size() );

    libjson::Value::ArrayIter   f;
    vector<pair<string,string>> files_v;
    string                      err_msg;

    libjson::Value::Object & repo = repos[0].getObject();
    libjson::Value::Array & files = repo["files"].getArray();
    libjson::Value::Object & file = files[0].getObject();

    if ( files.size() != 1 )
        EXCEPT_PARAM( 1, "Task file list size != 1, size: " << files.size() );

    // Initialize Globus transfer
    if ( xfr_status == GlobusAPI::XS_INIT )
    {
        upd_state.clear();

        files_v.push_back(make_pair( file.at( "from" ).asString( ), file.at( "to" ).asString() ));
        dst_ep = repo["repo_ep"].asString();

        DL_INFO( "dst_ep: " << dst_ep );

        m_glob_task_id = m_glob.transfer( src_ep, dst_ep, files_v, encrypted, m_access_token );
        state["glob_task_id"] = m_glob_task_id;
        upd_state["glob_task_id"] = m_glob_task_id;

        xfr_status = GlobusAPI::XS_ACTIVE;
        state["xfr_status"] = xfr_status;
        upd_state["xfr_status"] = xfr_status;

        prog = 10.0;

        m_db.taskUpdate( m_task->task_id, 0, 0, &prog, &upd_state );
    }

    if ( xfr_status < GlobusAPI::XS_SUCCEEDED )
    {
        // Monitor Globus transfer, throws on failure, kills task
        xfr_status = monitorTransfer( err_msg );

        if ( xfr_status == GlobusAPI::XS_SUCCEEDED )
        {
            DL_INFO( "Upload completed!" );

            // SUCCEEDED
            upd_state.clear();
            state["xfr_status"] = GlobusAPI::XS_SUCCEEDED;
            upd_state["xfr_status"] = GlobusAPI::XS_SUCCEEDED;

            prog = 90.0;

            //DL_INFO( "Update task state & prog, " << state.toString() );

            m_db.taskUpdate( m_task->task_id, 0, 0, &prog, &upd_state );
        }
    }

    DL_INFO( "Requesting file size" );

    // Request size from dst_repo (even if transfer failed)
    if ( refreshDataSize( repo["repo_id"].asString(), file.at( "id" ).asString(), file.at( "to" ).asString( ), src_ep + file.at( "from" ).asString( ), state["ext"] ))
        return true;

    if ( xfr_status == GlobusAPI::XS_FAILED )
        EXCEPT( 1, err_msg );

    prog = 100.0;
    m_db.taskUpdate( m_task->task_id, 0, 0, &prog, 0 );

    return false;
}

bool
TaskWorker::handleDataDelete()
{
    DL_INFO( "Starting task " << m_task->task_id << ", type: DataDelete" );

    string                      uid = m_task->data["client"].asString();
    TaskStatus                  status = (TaskStatus) m_task->data["status"].asNumber();
    double                      prog = 0;
    int                         repo_idx = 0;
    libjson::Value &            state = m_task->data["state"];
    libjson::Value::Array  &    repos = state["repos"].getArray();
    libjson::Value              upd_state;

    // DEBUG OUTPUT
    DL_DEBUG( "state: " << state.toString() );

    m_db.setClient( uid );

    upd_state.initObject();

    if ( status == TS_READY )
    {
        state["repo_idx"] = 0;
        upd_state["repo_idx"] = 0;

        status = TS_RUNNING;
        m_task->data["status"] = status;

        string msg = "Running";
        m_db.taskUpdate( m_task->task_id, &status, &msg, 0, &upd_state );
        upd_state.clear();

        TASK_DELAY
    }
    else if ( status == TS_RUNNING )
    {
        repo_idx = state["repo_idx"].asNumber();
    }
    else
    {
        EXCEPT_PARAM( 1, "Task '" << m_task->task_id << "' has invalid status: " << status );
    }

    libjson::Value::ArrayIter           id, r;
    Auth::RepoDataDeleteRequest         del_req;
    RecordDataLocation *                loc;
    MsgBuf::Message *                   reply;
    time_t                              mod_time;

    for ( r = repos.begin() + repo_idx; r != repos.end(); r++ )
    {
        libjson::Value::Object & repo = r->getObject();
        libjson::Value::Array & ids = repo["ids"].getArray();
        const string & repo_id = repo["repo_id"].asString();
        const string & path = repo["path"].asString();

        upd_state.clear();
        del_req.clear_loc();

        // Ask associated repo server to delete raw files

        for ( id = ids.begin(); id != ids.end(); id++ )
        {
            loc = del_req.add_loc();
            loc->set_id( id->asString() );
            loc->set_path( path + id->asString().substr(2) );
        }

        if ( repoSendRecv( repo_id, del_req, reply ))
            return true;

        delete reply;

        mod_time = time(0);

        // Update DB record with new file stats
        for ( id = ids.begin(); id != ids.end(); id++ )
        {
            m_db.recordUpdatePostPut( id->asString(), 0, mod_time, "", 0 );
        }

        // Checkpoint deletion task

        repo_idx++;
        state["repo_idx"] = repo_idx;
        upd_state["repo_idx"] = repo_idx;

        prog = 100.0*repo_idx/repos.size();
        m_db.taskUpdate( m_task->task_id, 0, 0, &prog, &upd_state );
    }

    return false;
}


bool
TaskWorker::handleRecordChangeAlloc()
{
    DL_INFO( "Starting task " << m_task->task_id << ", type: RecordChangeAlloc" );

    string                      client_id = m_task->data["client"].asString();
    TaskStatus                  status = (TaskStatus) m_task->data["status"].asNumber();

    m_db.setClient( client_id );
    getUserAccessToken( client_id );

    if ( status == TS_READY )
    {
        // Initialize state
        m_db.taskStart( m_task->task_id, m_task->data );
    }

    libjson::Value &            state = m_task->data["state"];

    // DEBUG OUTPUT
    DL_DEBUG( "state: " << state.toString() );

    string                      owner_id = state["owner_id"].asString();
    libjson::Value::Array  &    steps = state["steps"].getArray();
    size_t                      step = state["step"].asNumber();

    if ( step >= steps.size() )
        EXCEPT_PARAM( 1, "Task step (" << step << ") out of range (max: " << steps.size() << ")" );

    string                      dst_repo_ep = state["dst_repo_ep"].asString();
    string                      dst_repo_path = state["dst_repo_path"].asString();
    string                      dst_repo_id = state["dst_repo_id"].asString();
    size_t                      substep = state["substep"].asNumber();
    double                      prog = 0;
    libjson::Value              upd_state;
    GlobusAPI::XfrStatus        xfr_status = (GlobusAPI::XfrStatus) state["xfr_status"].asNumber();
    libjson::Value::ArrayIter   f;
    vector<pair<string,string>> files_v;
    string                      err_msg;
    size_t                      size;
    Auth::RepoViewAllocationRequest  alloc_req;
    Auth::RepoAllocationsReply  alloc_rep;

    if ( xfr_status > GlobusAPI::XS_INIT )
        m_glob_task_id = state["glob_task_id"].asString();

    upd_state.initObject();

    alloc_req.set_repo( dst_repo_id );
    if ( owner_id != client_id )
        alloc_req.set_subject( owner_id );

    for ( libjson::Value::ArrayIter s = steps.begin() + step; s != steps.end(); s++ )
    {
        DL_DEBUG( "TW." << id() << ".REC_ALLOC_CHG - Begin Step " << step << " of " << steps.size() );

        libjson::Value &                rec_ids = (*s)["rec_ids"];
        libjson::Value::ObjectIter      t = s->find("xfr");

        if ( substep == 0 )
        {
            DL_DEBUG( "TW." << id() << ".REC_ALLOC_CHG - Check allocation for " << size << " free" );

            alloc_rep.Clear();
            m_db.repoViewAllocation( alloc_req, alloc_rep );

            if ( alloc_rep.alloc_size() != 1 )
                EXCEPT_PARAM( 1, "Allocation for " << owner_id << " on " << dst_repo_id << " not found." );

            const AllocData & alloc = alloc_rep.alloc(0);

            size = (*s)["size"].asNumber();

            if ( alloc.data_size() + size > alloc.data_limit() )
                EXCEPT_PARAM( 1, "Allocation for " << owner_id << " on " << dst_repo_id << " data size limit exceeded (" << alloc.data_limit() << ")." );

            if ( alloc.rec_count() + rec_ids.size() > alloc.rec_limit() )
                EXCEPT_PARAM( 1, "Allocation for " << owner_id << " on " << dst_repo_id << " record limit exceeded (" << alloc.rec_limit() << ")." );

            DL_DEBUG( "TW." << id() << ".REC_ALLOC_CHG - Record update: data move init" );
            m_db.recordUpdateDataMoveInit( rec_ids, dst_repo_id, "", "" );

            upd_state.clear();
            state["substep"] = ++substep;
            upd_state["substep"] = substep;
            m_db.taskUpdate( m_task->task_id, 0, 0, 0, &upd_state );
        }

        if ( substep == 1 )
        {
            if ( t != s->end() )
            {
                libjson::Value::Object &    xfr = t->second.getObject();
                const string &              src_repo_ep = xfr["src_repo_ep"].asString();
                libjson::Value::Array &     files = xfr["files"].getArray();

                DL_DEBUG( "TW." << id() << ".REC_ALLOC_CHG - Request globus transfer" );

                if ( xfr_status == GlobusAPI::XS_INIT )
                {
                    files_v.clear();
                    for ( f = files.begin(); f != files.end(); f++ )
                        files_v.push_back(make_pair( (*f)["from"].asString(), dst_repo_path + (*f)["to"].asString() ));

                    m_glob_task_id = m_glob.transfer( src_repo_ep, dst_repo_ep, files_v, true, m_access_token );

                    upd_state.clear();
                    state["glob_task_id"] = m_glob_task_id;
                    upd_state["glob_task_id"] = m_glob_task_id;
                    xfr_status = GlobusAPI::XS_ACTIVE;
                    state["xfr_status"] = xfr_status;
                    upd_state["xfr_status"] = xfr_status;
                    m_db.taskUpdate( m_task->task_id, 0, 0, &prog, &upd_state );
                }

                xfr_status = monitorTransfer( err_msg );

                if ( xfr_status == GlobusAPI::XS_FAILED )
                {
                    DL_DEBUG( "TW." << id() << ".REC_ALLOC_CHG - Globus transfer FAILED, reverting" );

                    m_db.recordUpdateDataMoveRevert( rec_ids );
                    // TODO An error here should cause a retry until clean-up finishes
                    deleteNewRawFiles( dst_repo_id, dst_repo_path, files );

                    EXCEPT( 1, err_msg );
                }

                DL_DEBUG( "TW." << id() << ".REC_ALLOC_CHG - Globus transfer SUCCEEDED" );
            }


            upd_state.clear();
            xfr_status = GlobusAPI::XS_INIT;
            state["xfr_status"] = xfr_status;
            upd_state["xfr_status"] = xfr_status;
            state["substep"] = ++substep;
            upd_state["substep"] = substep;
            m_db.taskUpdate( m_task->task_id, 0, 0, 0, &upd_state );
        }

        if ( substep == 2 )
        {
            if ( t != s->end() )
            {
                DL_DEBUG( "TW." << id() << ".REC_ALLOC_CHG - Deleting old raw data files" );

                libjson::Value::Object &    xfr = t->second.getObject();
                const string &              src_repo_id = xfr["src_repo_id"].asString();
                libjson::Value::Array &     files = xfr["files"].getArray();

                if ( deleteOldRawFiles( src_repo_id, files ))
                    return true;
            }

            upd_state.clear();
            state["substep"] = ++substep;
            upd_state["substep"] = substep;
            m_db.taskUpdate( m_task->task_id, 0, 0, 0, &upd_state );
        }


        if ( substep == 3 )
        {
            DL_DEBUG( "TW." << id() << ".REC_ALLOC_CHG - Record update: data move finalize");

            // TODO Next call may not be idempotent
            m_db.recordUpdateDataMoveFinalize( rec_ids );
        }

        upd_state.clear();
        substep = 0;
        state["substep"] = substep;
        upd_state["substep"] = substep;
        state["step"] = ++step;
        upd_state["step"] = step;
        prog = floor(100.0*step/steps.size());
        m_db.taskUpdate( m_task->task_id, 0, 0, &prog, &upd_state );
    }

    return false;
}


bool
TaskWorker::deleteOldRawFiles( const std::string & a_dst_repo_id, libjson::Value::Array & a_files )
{
    Auth::RepoDataDeleteRequest del_req;
    MsgBuf::Message *           reply;
    RecordDataLocation *        loc;

    for ( libjson::Value::ArrayIter f = a_files.begin(); f != a_files.end(); f++ )
    {
        loc = del_req.add_loc();
        loc->set_id( (*f)["id"].asString() );
        loc->set_path( (*f)["from"].asString() );
    }

    DL_DEBUG( "TW." << id() << " Sending delete req to " << a_dst_repo_id );

    // TODO Must catch exception here and revert

    if ( repoSendRecv( a_dst_repo_id, del_req, reply ))
    {
        DL_DEBUG( "TW." << id() << " - Timeout sending to " << a_dst_repo_id );
        return true;
    }

    delete reply;

    return false;
}

bool
TaskWorker::deleteNewRawFiles( const std::string & a_dst_repo_id, const std::string & a_dst_repo_path, libjson::Value::Array & a_files )
{
    Auth::RepoDataDeleteRequest del_req;
    MsgBuf::Message *           reply;
    RecordDataLocation *        loc;

    for ( libjson::Value::ArrayIter f = a_files.begin(); f != a_files.end(); f++ )
    {
        loc = del_req.add_loc();
        loc->set_id( (*f)["id"].asString() );
        loc->set_path( a_dst_repo_path + (*f)["to"].asString() );
    }

    DL_DEBUG( "TW." << id() << " Sending delete req to " << a_dst_repo_id );

    // TODO Must catch exception here and revert

    if ( repoSendRecv( a_dst_repo_id, del_req, reply ))
    {
        DL_DEBUG( "TW." << id() << " - Timeout sending to " << a_dst_repo_id );
        return true;
    }

    delete reply;

    return false;
}


bool
TaskWorker::handleRecordChangeOwner()
{
    DL_INFO( "Starting task " << m_task->task_id << ", type: RecordChangeOwner" );

    string                      client_id = m_task->data["client"].asString();
    TaskStatus                  status = (TaskStatus) m_task->data["status"].asNumber();

    m_db.setClient( client_id );
    getUserAccessToken( client_id );

    if ( status == TS_READY )
    {
        // Initialize state
        m_db.taskStart( m_task->task_id, m_task->data );
    }

    libjson::Value &            state = m_task->data["state"];

    // DEBUG OUTPUT
    DL_DEBUG( "state: " << state.toString() );

    string                      new_owner_id = state["new_owner_id"].asString();
    libjson::Value::Array  &    steps = state["steps"].getArray();
    size_t                      step = state["step"].asNumber();

    if ( step >= steps.size() )
        EXCEPT_PARAM( 1, "Task step (" << step << ") out of range (max: " << steps.size() << ")" );

    string                      dst_repo_ep = state["dst_repo_ep"].asString();
    string                      dst_repo_path = state["dst_repo_path"].asString();
    string                      dst_repo_id = state["dst_repo_id"].asString();
    string                      coll_id = state["dst_coll_id"].asString();
    size_t                      substep = state["substep"].asNumber();
    double                      prog = 0;
    libjson::Value              upd_state;
    GlobusAPI::XfrStatus        xfr_status = (GlobusAPI::XfrStatus) state["xfr_status"].asNumber();
    libjson::Value::ArrayIter   f;
    vector<pair<string,string>> files_v;
    string                      err_msg;
    size_t                      size;
    Auth::RepoViewAllocationRequest  alloc_req;
    Auth::RepoAllocationsReply  alloc_rep;

    if ( xfr_status > GlobusAPI::XS_INIT )
        m_glob_task_id = state["glob_task_id"].asString();

    upd_state.initObject();

    alloc_req.set_repo( dst_repo_id );
    alloc_req.set_subject( new_owner_id );

    for ( libjson::Value::ArrayIter s = steps.begin() + step; s != steps.end(); s++ )
    {
        DL_DEBUG( "TW." << id() << ".REC_OWNER_CHG - Begin Step " << step << " of " << steps.size() );

        libjson::Value &                rec_ids = (*s)["rec_ids"];
        libjson::Value::ObjectIter      t = s->find("xfr");

        if ( substep == 0 )
        {
            DL_DEBUG( "TW." << id() << ".REC_OWNER_CHG - Check allocation for " << size << " free" );

            alloc_rep.Clear();
            m_db.repoViewAllocation( alloc_req, alloc_rep );

            if ( alloc_rep.alloc_size() != 1 )
                EXCEPT_PARAM( 1, "Allocation for " << new_owner_id << " on " << dst_repo_id << " not found." );

            const AllocData & alloc = alloc_rep.alloc(0);

            size = (*s)["size"].asNumber();

            if ( alloc.data_size() + size > alloc.data_limit() )
                EXCEPT_PARAM( 1, "Allocation for " << new_owner_id << " on " << dst_repo_id << " data size limit exceeded (" << alloc.data_limit() << ")." );

            if ( alloc.rec_count() + rec_ids.size() > alloc.rec_limit() )
                EXCEPT_PARAM( 1, "Allocation for " << new_owner_id << " on " << dst_repo_id << " record limit exceeded (" << alloc.rec_limit() << ")." );

            DL_DEBUG( "TW." << id() << ".REC_OWNER_CHG - Record update: data move init" );
            m_db.recordUpdateDataMoveInit( rec_ids, dst_repo_id, new_owner_id, coll_id );

            upd_state.clear();
            state["substep"] = ++substep;
            upd_state["substep"] = substep;
            m_db.taskUpdate( m_task->task_id, 0, 0, 0, &upd_state );
        }

        if ( substep == 1 )
        {
            if ( t != s->end() )
            {
                libjson::Value::Object &    xfr = t->second.getObject();
                const string &              src_repo_ep = xfr["src_repo_ep"].asString();
                libjson::Value::Array &     files = xfr["files"].getArray();

                DL_DEBUG( "TW." << id() << ".REC_OWNER_CHG - Request globus transfer" );

                if ( xfr_status == GlobusAPI::XS_INIT )
                {
                    files_v.clear();
                    for ( f = files.begin(); f != files.end(); f++ )
                        files_v.push_back(make_pair( (*f)["from"].asString(), dst_repo_path + (*f)["to"].asString() ));

                    m_glob_task_id = m_glob.transfer( src_repo_ep, dst_repo_ep, files_v, true, m_access_token );

                    upd_state.clear();
                    state["glob_task_id"] = m_glob_task_id;
                    upd_state["glob_task_id"] = m_glob_task_id;
                    xfr_status = GlobusAPI::XS_ACTIVE;
                    state["xfr_status"] = xfr_status;
                    upd_state["xfr_status"] = xfr_status;
                    m_db.taskUpdate( m_task->task_id, 0, 0, &prog, &upd_state );
                }

                xfr_status = monitorTransfer( err_msg );

                if ( xfr_status == GlobusAPI::XS_FAILED )
                {
                    DL_DEBUG( "TW." << id() << ".REC_OWNER_CHG - Globus transfer FAILED, reverting" );

                    m_db.recordUpdateDataMoveRevert( rec_ids );
                    // TODO An error here should cause a retry until clean-up finishes
                    deleteNewRawFiles( dst_repo_id, dst_repo_path, files );

                    EXCEPT( 1, err_msg );
                }

                DL_DEBUG( "TW." << id() << ".REC_OWNER_CHG - Globus transfer SUCCEEDED" );
            }


            upd_state.clear();
            xfr_status = GlobusAPI::XS_INIT;
            state["xfr_status"] = xfr_status;
            upd_state["xfr_status"] = xfr_status;
            state["substep"] = ++substep;
            upd_state["substep"] = substep;
            m_db.taskUpdate( m_task->task_id, 0, 0, 0, &upd_state );
        }

        if ( substep == 2 )
        {
            if ( t != s->end() )
            {
                DL_DEBUG( "TW." << id() << ".REC_OWNER_CHG - Deleting old raw data files" );

                libjson::Value::Object &    xfr = t->second.getObject();
                const string &              src_repo_id = xfr["src_repo_id"].asString();
                libjson::Value::Array &     files = xfr["files"].getArray();

                if ( deleteOldRawFiles( src_repo_id, files ))
                    return true;
            }

            upd_state.clear();
            state["substep"] = ++substep;
            upd_state["substep"] = substep;
            m_db.taskUpdate( m_task->task_id, 0, 0, 0, &upd_state );
        }


        if ( substep == 3 )
        {
            DL_DEBUG( "TW." << id() << ".REC_OWNER_CHG - Record update: data move finalize");

            // TODO Next call may not be idempotent
            m_db.recordUpdateDataMoveFinalize( rec_ids );
        }

        upd_state.clear();
        substep = 0;
        state["substep"] = substep;
        upd_state["substep"] = substep;
        state["step"] = ++step;
        upd_state["step"] = step;
        prog = floor(100.0*step/steps.size());
        m_db.taskUpdate( m_task->task_id, 0, 0, &prog, &upd_state );
    }

    return false;
}

/**
 * @brief Handle record deletion tasks
 * @return true 
 *
 * Record deletion tasks are generated when a user deletes one or more data
 * records that have associated raw data. A task must be started to coordinate
 * and ensure that the raw data files are deleted from their respective data
 * repositories.
 */
bool
TaskWorker::handleRecordDelete()
{
    /* Process:
    1.  In DB init, records without data re immediately deleted, those with raw
        data are marked for deletion and unlinked from all collections.
    2.  When task runs, marked data records are deleted in DB and allocations are
        adjusted.
    3.  Each associated repo server is told to delete the associated raw data
        files. On failures, these steps are retried until limit is reached, then
        admins will be notified (repo is out of sync with DB).
    */
    DL_INFO( "Starting task " << m_task->task_id << ", type: RecordDelete" );

    string                      uid = m_task->data["client"].asString();
    TaskStatus                  status = (TaskStatus) m_task->data["status"].asNumber();
    double                      prog = 0;
    int                         repo_idx = 0;
    libjson::Value &            state = m_task->data["state"];
    libjson::Value::Array  &    repos = state["repos"].getArray();
    libjson::Value              upd_state;

    // DEBUG OUTPUT
    DL_DEBUG( "state: " << state.toString() );

    m_db.setClient( uid );

    upd_state.initObject();

    if ( status == TS_READY )
    {
        state["repo_idx"] = 0;
        upd_state["repo_idx"] = 0;

        status = TS_RUNNING;
        m_task->data["status"] = status;

        string msg = "Running";
        m_db.taskUpdate( m_task->task_id, &status, &msg, 0, &upd_state );
        upd_state.clear();

        TASK_DELAY
    }
    else if ( status == TS_RUNNING )
    {
        repo_idx = state["repo_idx"].asNumber();
    }
    else
    {
        EXCEPT_PARAM( 1, "Task '" << m_task->task_id << "' has invalid status: " << status );
    }

    libjson::Value::ArrayIter           f, r;
    Auth::RepoDataDeleteRequest         del_req;
    RecordDataLocation *                loc;
    MsgBuf::Message *                   reply;

    for ( r = repos.begin() + repo_idx; r != repos.end(); r++ )
    {
        libjson::Value::Object & repo = r->getObject();
        libjson::Value::Array & files = repo["files"].getArray();
        const string & repo_id = repo["repo_id"].asString();

        upd_state.clear();
        del_req.clear_loc();

        // Ask associated repo server to delete raw files

        for ( f = files.begin(); f != files.end(); f++ )
        {
            loc = del_req.add_loc();
            loc->set_id( (*f)["id"].asString() );
            loc->set_path( (*f)["from"].asString() );
        }

        if ( repoSendRecv( repo_id, del_req, reply ))
            return true;

        delete reply;

        // Checkpoint deletion task

        repo_idx++;
        state["repo_idx"] = repo_idx;
        upd_state["repo_idx"] = repo_idx;

        prog = 100.0*repo_idx/repos.size();
        m_db.taskUpdate( m_task->task_id, 0, 0, &prog, &upd_state );
    }

    return false;
}


/**
 * @brief Handle project deletion tasks
 * @return true 
 *
 * Project deletion tasks are generated when a user deletes one or more
 * projects that have allocations. A task must be started to coordinate
 * and ensure that the raw data files and repo directories are deleted
 * from their respective data repositories.
 */
bool
TaskWorker::handleProjectDelete()
{
    DL_INFO( "Starting task " << m_task->task_id << ", type: ProjectDelete" );

    string                      uid = m_task->data["client"].asString();
    TaskStatus                  status = (TaskStatus) m_task->data["status"].asNumber();
    double                      prog = 0;
    int                         alloc_idx = 0;
    libjson::Value &            state = m_task->data["state"];
    libjson::Value::Array  &    allocs = state["allocs"].getArray();
    libjson::Value              upd_state;

    // DEBUG OUTPUT
    DL_DEBUG( "state: " << state.toString() );

    m_db.setClient( uid );

    upd_state.initObject();

    if ( status == TS_READY )
    {
        state["alloc_idx"] = 0;
        upd_state["alloc_idx"] = 0;

        status = TS_RUNNING;
        m_task->data["status"] = status;

        string msg = "Running";
        m_db.taskUpdate( m_task->task_id, &status, &msg, 0, &upd_state );
        upd_state.clear();

        TASK_DELAY
    }
    else if ( status == TS_RUNNING )
    {
        alloc_idx = state["alloc_idx"].asNumber();
    }
    else
    {
        EXCEPT_PARAM( 1, "Task '" << m_task->task_id << "' has invalid status: " << status );
    }

    libjson::Value::ArrayIter a;

    Auth::RepoPathDeleteRequest         req;
    MsgBuf::Message *                   reply;

    for ( a = allocs.begin() + alloc_idx; a != allocs.end(); a++ )
    {
        libjson::Value::Object & alloc = a->getObject();

        string & repo_id = alloc["repo_id"].asString();
        string & path = alloc["path"].asString();

        upd_state.clear();
        req.set_path( path );

        if ( repoSendRecv( repo_id, req, reply ))
            return true;

        delete reply;

        // Checkpoint deletion task

        alloc_idx++;
        state["alloc_idx"] = alloc_idx;
        upd_state["alloc_idx"] = alloc_idx;

        prog = 100.0*alloc_idx/allocs.size();
        m_db.taskUpdate( m_task->task_id, 0, 0, &prog, &upd_state );
    }

    return false;
}


/**
 * @brief Handle allocation creation tasks
 * @return true 
 *
 * Allocation creation tasks are generated when a repo admin creates an
 * allocation for a particular user or project. A task must be started to
 * create directories for raw data on the associated repository.
 */
bool
TaskWorker::handleAllocCreate()
{
    DL_INFO( "Starting task " << m_task->task_id << ", type: AllocCreate" );

    string                      uid = m_task->data["client"].asString();
    TaskStatus                  status = (TaskStatus) m_task->data["status"].asNumber();
    double                      prog = 0;
    libjson::Value &            state = m_task->data["state"];

    // DEBUG OUTPUT
    DL_DEBUG( "state: " << state.toString() );

    m_db.setClient( uid );

    if ( status == TS_READY )
    {
        status = TS_RUNNING;
        m_task->data["status"] = status;

        string msg = "Running";
        m_db.taskUpdate( m_task->task_id, &status, &msg, 0, 0 );
    }
    else if ( status != TS_RUNNING )
    {
        EXCEPT_PARAM( 1, "Task '" << m_task->task_id << "' has invalid status: " << status );
    }

    string & repo_id = state["repo"].asString();
    string & path = state["path"].asString();

    Auth::RepoPathCreateRequest         req;
    MsgBuf::Message *                   reply;

    req.set_path( path );

    if ( repoSendRecv( repo_id, req, reply ))
        return true;

    delete reply;

    prog = 100.0;
    m_db.taskUpdate( m_task->task_id, 0, 0, &prog, 0 );

    return false;
}


/**
 * @brief Handle allocation creation tasks
 * @return true 
 *
 * Allocation delete tasks are generated when a repo admin deletes an
 * allocation for a particular user or project. A task must be started to
 * delete directories for raw data on the associated repository.
 */
bool
TaskWorker::handleAllocDelete()
{
    DL_INFO( "Starting task " << m_task->task_id << ", type: AllocDelete" );

    string                      uid = m_task->data["client"].asString();
    TaskStatus                  status = (TaskStatus) m_task->data["status"].asNumber();
    double                      prog = 0;
    libjson::Value &            state = m_task->data["state"];

    // DEBUG OUTPUT
    DL_DEBUG( "state: " << state.toString() );

    m_db.setClient( uid );

    if ( status == TS_READY )
    {
        status = TS_RUNNING;
        m_task->data["status"] = status;

        string msg = "Running";
        m_db.taskUpdate( m_task->task_id, &status, &msg, 0, 0 );
    }
    else if ( status != TS_RUNNING )
    {
        EXCEPT_PARAM( 1, "Task '" << m_task->task_id << "' has invalid status: " << status );
    }

    string & repo_id = state["repo"].asString();
    string & path = state["path"].asString();

    Auth::RepoPathDeleteRequest         req;
    MsgBuf::Message *                   reply;

    req.set_path( path );

    if ( repoSendRecv( repo_id, req, reply ))
        return true;

    delete reply;

    prog = 100.0;
    m_db.taskUpdate( m_task->task_id, 0, 0, &prog, 0 );

    return false;
}

#endif

/*
void
TaskWorker::getUserAccessToken( const std::string & a_uid )
{
    string      ref_tok;
    uint32_t    expires_in;

    m_db.userGetAccessToken( m_access_token, ref_tok, expires_in );

    if ( expires_in < 300 )
    {
        DL_INFO( "Refreshing access token for " << a_uid );

        m_glob.refreshAccessToken( ref_tok, m_access_token, expires_in );
        m_db.userSetAccessToken( m_access_token, expires_in, ref_tok );
    }
}*/


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

/*
GlobusAPI::XfrStatus
TaskWorker::monitorTransfer( const std::string & a_acc_tok, const std::string & a_glob_task_id, std::string & a_err_msg )
{
    GlobusAPI::XfrStatus xfr_status;

    do
    {
        sleep( 5 );

        if ( m_glob.checkTransferStatus( a_glob_task_id, a_acc_tok, xfr_status, a_err_msg ))
        {
            // Transfer task needs to be cancelled
            m_glob.cancelTask( a_glob_task_id, a_acc_tok );
        }
    } while( xfr_status < GlobusAPI::XS_SUCCEEDED );

    return xfr_status;
}
*/


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

    if ( !comm.recv( buffer, false, 10000 ))
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

bool
TaskWorker::refreshDataSize( const std::string & a_repo_id, const std::string & a_data_id, const std::string & a_data_path, const std::string & a_src_path, const libjson::Value & a_ext )
{
    time_t mod_time = time(0);
    size_t file_size = 1;

    Auth::RepoDataGetSizeRequest    sz_req;
    Auth::RepoDataSizeReply *       sz_rep;
    RecordDataLocation *            loc;
    MsgBuf::Message *               raw_msg;

    loc = sz_req.add_loc();
    loc->set_id( a_data_id );
    loc->set_path( a_data_path );

    DL_INFO( "SendRecv msg to " << a_repo_id );

    if ( repoSendRecv( a_repo_id, sz_req, raw_msg ))
    {
        DL_INFO( "SendRecv failed, must retry" );

        return true;
    }

    DL_INFO( "SendRecv OK" );

    if (( sz_rep = dynamic_cast<Auth::RepoDataSizeReply*>( raw_msg )) != 0 )
    {
        if ( sz_rep->size_size() == 1 )
            file_size = sz_rep->size(0).size();

        delete raw_msg;
    }
    else
    {
        delete raw_msg;
        EXCEPT_PARAM( 1, "Unexpected reply type from repo service: " << a_repo_id );
    }


    // Update DB record with new file stats
    m_db.recordUpdatePostPut( a_data_id, file_size, mod_time, a_src_path, a_ext.isString()?&a_ext.asString():0 );

    return false;
}


}}
