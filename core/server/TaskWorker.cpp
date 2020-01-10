#include "TaskWorker.hpp"

namespace SDMS {
namespace Core {

TaskWorker::TaskWorker( ITaskMgr & a_mgr, uint32_t a_worker_id ) :
    m_mgr( a_mgr ),
    m_worker_id( a_worker_id ),
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
    uint32_t            task_type;
    bool                success, retry = false;
    string              msg;

    DL_DEBUG( "Task worker " << m_worker_id << " started." )

    while( 1 )
    {
        m_task = getNextTask();


        DL_DEBUG("Task worker " << m_worker_id << " handling new task " << m_task->task_id );

        try
        {
            // Dispatch task to handler method
            success = false;

            task_type = m_task->data["type"].asNumber();
            switch( task_type )
            {
                case TT_DATA_GET:
                    retry = handleDataGet();
                    break;
                case TT_DATA_PUT:
                    retry = handleDataPut();
                    break;
                case TT_DATA_CHG_ALLOC:
                    retry = handleDataChangeAlloc();
                    break;
                case TT_DATA_CHG_OWNER:
                    retry = handleDataChangeOwner();
                    break;
                case TT_DATA_DEL:
                    retry = handleDataDelete();
                    break;
                default:
                    retry = false;
                    msg = "Invalid task type";
                    DL_ERROR( "Invalid task type (" << task_type << ") for task ID '" << m_task->task_id << "'" );
                    break;
            }

            success = true;
        }
        catch( TraceException & e )
        {
            DL_ERROR( "Task handler error,  worker " << m_worker_id );
            msg = e.toString( );
        }
        catch( exception & e )
        {
            DL_ERROR( "Task handler error, worker " << m_worker_id );
            msg = e.what();
        }

        if ( retry )
        {
            try
            {
                DL_INFO("Do retry here");

                if ( m_mgr.retryTask( m_task ))
                {
                    DL_INFO("Retry time exceeded");
                    finalizeTask( false, "Maximum task retry period exceeded." );
                }
            }
            catch( ... )
            {
                DL_ERROR( "Exception in retry code" );
            }
        }
        else
        {
            finalizeTask( success, msg );
        }
    }
}

void
TaskWorker::finalizeTask( bool a_succeeded, const std::string & a_msg )
{
    DL_DEBUG("TaskWorker finalizeTask " << m_task->task_id );

    libjson::Value new_tasks;

    try
    {
        m_db.taskFinalize( m_task->task_id, a_succeeded, a_msg, new_tasks );

        DL_DEBUG("found " << new_tasks.size() << " new ready tasks." );

        lock_guard<mutex> lock(m_worker_mutex);

        libjson::Value::Array & tasks = new_tasks.getArray();
        for ( libjson::Value::ArrayIter t = tasks.begin(); t != tasks.end(); t++ )
        {
            m_tasks_ready.push_back( new Task( (*t)["id"].asString(), *t ));
        }
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


bool
TaskWorker::handleDataGet( )
{
    DL_INFO( "Starting task '" << m_task->task_id << "', type: DataGet" );

    string                      src_repo_ep;
    bool                        encrypted = false;
    GlobusAPI::EndpointInfo     ep_info;
    string                      uid = m_task->data["user"].asString();
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
    getUserAccessToken( worker, uid );

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
        monitorTransfer( worker );

        // Xfr SUCCEEDED
        upd_state.clear();
        state["xfr_status"] = xfr_status;
        upd_state["xfr_status"] = xfr_status;

        prog = 100.0*(repo_idx + 1)/repos.size();
        m_db.taskUpdate( m_task->task_id, 0, 0, &prog, &upd_state );

        repo_idx++;
        xfr_status = GlobusAPI::XS_INIT;
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
    string                      uid = m_task->data["user"].asString();
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
    getUserAccessToken( worker, uid );

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

    //sleep( 60 );

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
        monitorTransfer( worker );

        DL_INFO( "Upload completed!" );

        // SUCCEEDED
        upd_state.clear();
        state["xfr_status"] = GlobusAPI::XS_SUCCEEDED;
        upd_state["xfr_status"] = GlobusAPI::XS_SUCCEEDED;

        prog = 90.0;

        //DL_INFO( "Update task state & prog, " << state.toString() );

        m_db.taskUpdate( m_task->task_id, 0, 0, &prog, &upd_state );
    }

    DL_INFO( "Requesting file size" );

    // Request size from dst_repo
    if ( refreshDataSize( worker, repo["repo_id"].asString(), file.at( "id" ).asString(), file.at( "to" ).asString( ), src_ep + file.at( "from" ).asString( ), state["ext"] ))
        return true;

    prog = 100.0;
    m_db.taskUpdate( m_task->task_id, 0, 0, &prog, 0 );

    return false;
}


bool
TaskWorker::handleDataChangeAlloc()
{
    DL_INFO( "Starting task " << m_task->task_id << ", type: DataChangeAlloc" );

    EXCEPT( 1, "Operation not yet implemented" );

    return false;
}


bool
TaskWorker::handleDataChangeOwner()
{
    DL_INFO( "Starting task " << m_task->task_id << ", type: DataChangeOwner" );

    EXCEPT( 1, "Operation not yet implemented" );

    return false;
}


bool
TaskWorker::handleDataDelete()
{
    DL_INFO( "Starting task " << m_task->task_id << ", type: DataDelete" );

    string                      uid = m_task->data["user"].asString();
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
    string                              err_msg;
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

        for ( f = files.begin(); f != files.end(); f++ )
        {
            loc = del_req.add_loc();
            loc->set_id( (*f)["id"].asString() );
            loc->set_path( (*f)["from"].asString() );
        }

        if ( repoSendRecv( repo_id, del_req, reply ))
            return true;

        delete reply;

        repo_idx++;
        state["repo_idx"] = repo_idx;
        upd_state["repo_idx"] = repo_idx;

        prog = 100.0*repo_idx/repos.size();
        m_db.taskUpdate( m_task->task_id, 0, 0, &prog, &upd_state );
    }

    return false;
}

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
}


bool
TaskWorker::checkEncryption( Encryption a_encrypt, const GlobusAPI::EndpointInfo & a_ep_info )
{
    switch ( a_encrypt )
    {
        case ENCRYPT_NONE:
            if ( a_ep_info.force_encryption )
                EXCEPT(1,"Remote endpoint requires encryption.");
            return false;
        case ENCRYPT_AVAIL:
            if ( a_ep_info.supports_encryption )
                return true;
            else
                return false;
        case ENCRYPT_FORCE:
            if ( !a_ep_info.supports_encryption )
                EXCEPT(1,"Remote endpoint does not support encryption.");
            return true;
        default:
            EXCEPT(1,"Invalid transfer encryption value.");
    }

    // compiler warns, but can't get here
    return false;
}


void
TaskWorker::monitorTransfer()
{
    GlobusAPI::XfrStatus    xfr_status;
    string                  err_msg;

    while( 1 )
    {
        sleep( 5 );

        if ( m_glob.checkTransferStatus( m_glob_task_id, m_access_token, xfr_status, err_msg ))
        {
            // Transfer task needs to be cancelled
            m_glob.cancelTask( m_glob_task_id, m_access_token );
        }

        if ( xfr_status == GlobusAPI::XS_FAILED )
        {
            // err_msg will be set by checkTransferStatus on failure
            EXCEPT( 1, err_msg );
        }
        else if ( xfr_status == GlobusAPI::XS_SUCCEEDED )
        {
            break;
        }
    }
}


bool
TaskWorker::repoSendRecv( const string & a_repo_id, MsgBuf::Message & a_msg, MsgBuf::Message *& a_reply )
{
    map<string,RepoData*>::iterator rd = m_config.repos.find( a_repo_id );
    if ( rd == m_config.repos.end() )
        EXCEPT_PARAM( 1, "Task refers to non-existent repo server: " << a_repo_id );

    MsgComm comm( rd->second->address(), MsgComm::DEALER, false, &m_config.sec_ctx );

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
