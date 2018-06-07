#include <iostream>
#include <algorithm>
#include <unistd.h>
#include "MsgComm.hpp"
#include "CoreXfrMgr.hpp"
#include "CoreDatabaseClient.hpp"
#include "GlobusTransferClient.hpp"
#include "TraceException.hpp"
#include "DynaLog.hpp"
#include "Util.hpp"
#include "SDMS_Anon.pb.h"
#include "SDMS_Auth.pb.h"

using namespace std;

#define INIT_POLL_PERIOD 1
#define MAX_BACKOFF 10

namespace SDMS {
namespace Core {

XfrMgr::XfrMgr( IWorkerMgr & a_mgr ) :
    m_mgr(a_mgr), m_run(false), m_mgr_thread(0)
{
}

XfrMgr::~XfrMgr()
{
    stop( true );
}

void
XfrMgr::start()
{
    if ( !m_run && !m_mgr_thread )
    {
        m_run = true;
        m_mgr_thread = new thread( &XfrMgr::xfrThreadFunc, this );
    }
}

void
XfrMgr::stop( bool a_wait )
{
    m_run = false;
    if ( a_wait && m_mgr_thread )
    {
        m_mgr_thread->join();
        delete m_mgr_thread;
        m_mgr_thread = 0;
    }
}


void
XfrMgr::newXfr( const XfrData & a_xfr )
{
    lock_guard<mutex> lock(m_xfr_mutex);

    if ( m_xfr_all.find( a_xfr.id() ) == m_xfr_all.end() )
    {
        XfrDataInfo * xfr_entry = new XfrDataInfo( a_xfr );
        m_xfr_all[a_xfr.id()] = xfr_entry;
        m_xfr_pending.push_back( a_xfr.id() );
    }
}


void
XfrMgr::xfrThreadFunc()
{
    DL_DEBUG( "Xfr thread started" );

    try
    {
        list<XfrDataInfo*>::iterator ixfr;
        XfrDataInfo * xfr_entry;
        string keyfile;
        string cmd;
        string result;
        XfrStatus status;
        size_t file_size;
        time_t mod_time;
        Auth::RecordUpdateRequest upd_req;
        Auth::RecordDataReply  reply;
        string error_msg;
        DatabaseClient db_client( m_mgr.getDbURL(), m_mgr.getDbUser(), m_mgr.getDbPass() );
        GlobusTransferClient glob;
        bool res;
        vector<string> events;

        db_client.setClient( "sdms" );

        MsgBuf::Message *            raw_msg;
        Auth::RepoDataGetSizeRequest sz_req;
        Auth::RepoDataSizeReply *    sz_rep;
        MsgBuf::Frame                frame;
        string                       uid;

        map<string,MsgComm*>    repo_comm;
        map<string,MsgComm*>::iterator comm;

        // TODO - This is just for demo, must use core server to communicate with repos
        //MsgComm  repo_comm( "tcp://localhost:9000", MsgComm::DEALER, false, & m_mgr.getSecurityContext() );

        while( m_run )
        {
            sleep( 1 );

            {
                lock_guard<mutex> lock( m_xfr_mutex );
                while ( m_xfr_pending.size() )
                {
                    xfr_entry = m_xfr_all[m_xfr_pending.front()];
                    m_xfr_active.push_front(xfr_entry);
                    m_xfr_pending.pop_front();
                }
            }

            for ( ixfr = m_xfr_active.begin(); ixfr != m_xfr_active.end(); )
            {
                try
                {
                    //cout << "poll: " << (*ixfr)->poll << "\n";

                    if ( (*ixfr)->stage == 0 )
                    {
                        // Start xfr, get task ID, update DB
                        // Use Legacy Globus CLI to start transfer
                        cout << "start new xfr:" << (*ixfr)->id << "\n";

                        // Get user's access token
                        db_client.setClient( (*ixfr)->user_id );

                        if ( !db_client.userGetAccessToken( (*ixfr)->token )) {
                            cout << "User " << (*ixfr)->user_id << " has no access token\n";
                            ixfr = m_xfr_active.erase( ixfr );
                        }
                        else
                        {
                            // Get new submission ID
                            string sub_id = glob.getSubmissionID( (*ixfr)->token );

                            // True = ok, false = temp failure, exception = perm failure
                            if ( (*ixfr)->mode == XM_PUT )
                                res = glob.transfer( (*ixfr)->token, sub_id, (*ixfr)->local_path, (*ixfr)->repo_path, (*ixfr)->task_id );
                            else
                                res = glob.transfer( (*ixfr)->token, sub_id, (*ixfr)->repo_path, (*ixfr)->local_path, (*ixfr)->task_id );

                            if ( res )
                            {
                                cout << "xfr running with task id: " << (*ixfr)->task_id << "\n";
                                // Update DB entry
                                db_client.xfrUpdate( (*ixfr)->id, 0, "", (*ixfr)->task_id.c_str() );
                                (*ixfr)->stage = 1;
                                (*ixfr)->poll = INIT_POLL_PERIOD;
                            }

                            ixfr++;
                        }

                        /*
                            status = XS_FAILED;
                            db_client.xfrUpdate( (*ixfr)->id, &status, result );
                            ixfr = m_xfr_active.erase( ixfr );
                        */
                    }
                    else
                    {
                        if ( --(*ixfr)->poll == 0 )
                        {
                            //cout << "poll (" << (*ixfr)->poll << ") xfr\n";
                            if ( glob.checkTransferStatus( (*ixfr)->token, (*ixfr)->task_id, status, error_msg ))
                            {
                                cout << "TODO - cancel failed task!\n";
                                //glob.cancelTask( (*ixfr)->token, (*ixfr)->task_id );
                            }
                            cout << "Task " << (*ixfr)->task_id << " status: " << status << "\n";

                            if ( (*ixfr)->status != status )
                            {
                                (*ixfr)->status = status;

                                // Update DB entry
                                db_client.xfrUpdate( (*ixfr)->id, &(*ixfr)->status, error_msg );

                                if ( (*ixfr)->mode == XM_PUT )
                                {
                                    mod_time = time(0);
                                    file_size = 0;

                                    if ( (*ixfr)->status == XS_SUCCEEDED )
                                    {
                                        // TODO This should be done in another thread so xfr mon isn't blocked
                                        comm = repo_comm.find( (*ixfr)->repo_id );
                                        if ( comm == repo_comm.end())
                                        {
                                            const string * addr = m_mgr.getRepoAddress( (*ixfr)->repo_id );
                                            // This could happen if a repo server is decommissioned while transfers are active
                                            if ( !addr )
                                                EXCEPT_PARAM( 1, "Transfer refers to non-existent repo server: " << (*ixfr)->repo_id );

                                            repo_comm[(*ixfr)->repo_id] = new MsgComm( *addr, MsgComm::DEALER, false, & m_mgr.getSecurityContext() );
                                            comm = repo_comm.find( (*ixfr)->repo_id );
                                        }

                                        sz_req.set_id( (*ixfr)->data_id );
                                        comm->second->send( sz_req );
                                        if ( !comm->second->recv( raw_msg, uid, frame, 10000 ))
                                            cout << "No response from repo server!\n";
                                        else
                                        {
                                            if (( sz_rep = dynamic_cast<Auth::RepoDataSizeReply*>( raw_msg )) != 0 )
                                            {
                                                file_size = sz_rep->size();
                                            }
                                            delete sz_rep;
                                        }
                                    }

                                    // Update DB record with new file stats
                                    upd_req.set_id( (*ixfr)->data_id );
                                    upd_req.set_data_size( file_size );
                                    upd_req.set_data_time( mod_time );
                                    upd_req.set_subject( (*ixfr)->user_id );
                                    reply.Clear();

                                    db_client.recordUpdate( upd_req, reply );
                                }
                            }

                            // Remove from active list
                            if ( (*ixfr)->status > XS_INACTIVE )
                            {
                                ixfr = m_xfr_active.erase( ixfr );
                            }
                            else
                            {
                                // Backoff increments each poll interval, but time waited only increments
                                // every two poll intervals. This allows polling to better match size of
                                // file being transferred.
                                if ( (*ixfr)->backoff < MAX_BACKOFF )
                                    (*ixfr)->backoff++;

                                (*ixfr)->poll = INIT_POLL_PERIOD*(1<<((*ixfr)->backoff >> 1));
                                ++ixfr;
                            }
                        }
                        else
                            ++ixfr;
                    }
                }
                catch( TraceException & e )
                {
                    cout << "XFR thread exception: " << e.toString() << "\n";
                    ixfr = m_xfr_active.erase( ixfr );
                }
                catch(...)
                {
                    cout << "XFR thread exception!\n";
                    ixfr = m_xfr_active.erase( ixfr );
                }
            }
        }
    }
    catch( TraceException & e )
    {
        DL_ERROR( "Maint thread: " << e.toString( true ) );
    }
    catch( exception & e )
    {
        DL_ERROR( "Maint thread: " << e.what() );
    }
    catch( ... )
    {
        DL_ERROR( "Maint thread: unkown exception " );
    }

    DL_DEBUG( "Xfr thread stopped" );
}


}}
