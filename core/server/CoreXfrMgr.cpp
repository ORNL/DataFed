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

    // Note: this try/catch block is meant to catch setup/configuration errors
    // that are fatal to the program.

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
        vector<string> events;

        db_client.setClient( "sdms" );

        MsgBuf::Message *            raw_msg;
        Auth::RepoDataGetSizeRequest sz_req;
        Auth::RepoDataSizeReply *    sz_rep;
        MsgBuf::Frame                frame;
        //string                       uid;
        size_t                       pos;
        map<string,MsgComm*>    repo_comm;
        map<string,MsgComm*>::iterator comm;
        size_t                      purge_timer = 10;

        while( m_run )
        {
            sleep( 1 );

            if ( --purge_timer == 0 )
            {
                DL_INFO( "Purging old transfer records" );
                db_client.purgeTransferRecords( m_mgr.getXfrPurgeAge() );
                purge_timer = m_mgr.getXfrPurgePeriod();
            }

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
                // Note: this try/catch block is meant to catch tranient errors and will simply log
                // ther error without removing the offending transfer entry. Fatal errors must be
                // handled by additional try/catch blocks within this loop.

                try
                {
                    if ( (*ixfr)->stage == 0 )
                    {
                        // Start xfr, get task ID, update DB
                        DL_DEBUG( "Configure new xfr: " << (*ixfr)->id );

                        // Get user's access token
                        db_client.setClient( (*ixfr)->user_id );

                        try
                        {
                            // TODO - This code currently treats ALL errors as permanent, need to handle transient errors differently

                            if ( !db_client.userGetAccessToken( (*ixfr)->token ))
                                EXCEPT_PARAM( 1, "No access token. Re-login required." );

                            // Get new submission ID, if this fails, an exception will be thrown
                            string sub_id = glob.getSubmissionID( (*ixfr)->token );

                            // True = ok, false = temp failure, exception = perm failure
                            if ( (*ixfr)->mode == XM_GET )
                                glob.transfer( (*ixfr)->token, sub_id, (*ixfr)->repo_path, (*ixfr)->local_path, (*ixfr)->task_id );
                            else
                                glob.transfer( (*ixfr)->token, sub_id, (*ixfr)->local_path, (*ixfr)->repo_path, (*ixfr)->task_id );

                            DL_DEBUG( "Started xfr with task id: " << (*ixfr)->task_id );

                            // Update DB entry
                            db_client.xfrUpdate( (*ixfr)->id, 0, "", (*ixfr)->task_id.c_str() );
                            (*ixfr)->stage = 1;
                            (*ixfr)->poll = INIT_POLL_PERIOD;

                            ixfr++;
                        }
                        catch( TraceException & e )
                        {
                            // Permanent failure, e.what()
                            (*ixfr)->status = XS_FAILED;
                            db_client.xfrUpdate( (*ixfr)->id, &(*ixfr)->status, e.toString() );
                            ixfr = m_xfr_active.erase( ixfr );
                        }
                        catch( ... )
                        {
                            // Permanent failure, e.what()
                            (*ixfr)->status = XS_FAILED;
                            db_client.xfrUpdate( (*ixfr)->id, &(*ixfr)->status, "Unknown exception" );
                            ixfr = m_xfr_active.erase( ixfr );
                        }
                    }
                    else
                    {
                        if ( --(*ixfr)->poll == 0 )
                        {
                            try
                            {
                                if ( glob.checkTransferStatus( (*ixfr)->token, (*ixfr)->task_id, status, error_msg ))
                                {
                                    DL_INFO( "Globus xfr failed. Cancelling task " << (*ixfr)->task_id );
                                    glob.cancelTask( (*ixfr)->token, (*ixfr)->task_id );
                                }

                                DL_DEBUG( "Xfr task " << (*ixfr)->task_id << " status: " << status );

                                if ( (*ixfr)->status != status )
                                {
                                    // Update DB entry
                                    db_client.xfrUpdate( (*ixfr)->id, &status, error_msg );
                                    (*ixfr)->status = status;

                                    if (( (*ixfr)->mode == XM_PUT || (*ixfr)->mode == XM_COPY ) && (*ixfr)->status == XS_SUCCEEDED )
                                    {
                                        mod_time = time(0);
                                        file_size = 0;

                                        // TODO This should be done in another thread so xfr mon isn't blocked

                                        comm = repo_comm.find( (*ixfr)->repo_id );
                                        if ( comm == repo_comm.end())
                                        {
                                            const string * addr = m_mgr.getRepoAddress( (*ixfr)->repo_id );
                                            // This could happen if a repo server is decommissioned while transfers are active
                                            if ( !addr )
                                                EXCEPT_PARAM( 1, "Xfr refers to non-existent repo server: " << (*ixfr)->repo_id );

                                            repo_comm[(*ixfr)->repo_id] = new MsgComm( *addr, MsgComm::DEALER, false, & m_mgr.getSecurityContext() );
                                            comm = repo_comm.find( (*ixfr)->repo_id );
                                        }

                                        sz_req.set_id( (*ixfr)->data_id );
                                        pos = (*ixfr)->repo_path.find_first_of("/");
                                        if ( pos != string::npos )
                                            sz_req.set_path( (*ixfr)->repo_path.substr( pos ));
                                        else
                                            sz_req.set_path( (*ixfr)->repo_path );
                                        comm->second->send( sz_req );
                                        if ( !comm->second->recv( raw_msg, frame, 10000 ))
                                        {
                                            DL_ERROR( "Timeout waiting for response from " << (*ixfr)->repo_id );
                                        }
                                        else
                                        {
                                            if (( sz_rep = dynamic_cast<Auth::RepoDataSizeReply*>( raw_msg )) != 0 )
                                            {
                                                file_size = sz_rep->size();
                                            }
                                            delete sz_rep;
                                        }

                                        DL_DEBUG( "Xfr updating record " << (*ixfr)->data_id << ",  size: " << file_size );

                                        // Update DB record with new file stats
                                        upd_req.set_id( (*ixfr)->data_id );
                                        upd_req.set_size( file_size );
                                        upd_req.set_source( (*ixfr)->local_path );
                                        if ( (*ixfr)->ext.size() )
                                        {
                                            upd_req.set_ext( (*ixfr)->ext );
                                            upd_req.set_ext_auto( false );
                                        }

                                        /*pos = (*ixfr)->local_path.find_first_of("/");
                                        if ( pos != string::npos )
                                        {
                                            pos = (*ixfr)->local_path.find_first_of(".",pos);
                                            if ( pos != string::npos )
                                            {
                                                upd_req.set_ext( (*ixfr)->local_path.substr( pos + 1 ));
                                            }
                                        }*/
                                        upd_req.set_dt( mod_time );
                                        reply.Clear();

                                        db_client.recordUpdate( upd_req, reply );
                                    }
                                }

                                // Remove from active list
                                if ( (*ixfr)->status > XS_INACTIVE )
                                    ixfr = m_xfr_active.erase( ixfr );
                                else
                                    xfrBackOffPolling( ixfr++ );
                            }
                            catch( TraceException & e )
                            {
                                // Permanent failure, e.what()
                                (*ixfr)->status = XS_FAILED;
                                db_client.xfrUpdate( (*ixfr)->id, &(*ixfr)->status, e.toString() );
                                ixfr = m_xfr_active.erase( ixfr );
                            }
                            catch( ... )
                            {
                                // Permanent failure, e.what()
                                (*ixfr)->status = XS_FAILED;
                                db_client.xfrUpdate( (*ixfr)->id, &(*ixfr)->status, "Unknown exception" );
                                ixfr = m_xfr_active.erase( ixfr );
                            }
                        }
                        else
                            ++ixfr;
                    }
                }
                catch( TraceException & e )
                {
                    DL_ERROR( "XFR loop exception: " << e.toString() << ", entry " << (*ixfr)->id );
                    xfrBackOffPolling( ixfr++ );
                }
                catch(...)
                {
                    DL_ERROR( "XFR loop unknown exception, entry " << (*ixfr)->id );
                    xfrBackOffPolling( ixfr++ );
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

    // TODO Notify main class that if thread is exiting unexpectedly.

    DL_DEBUG( "Xfr thread stopped" );
}

void
XfrMgr::xfrBackOffPolling( const list<XfrDataInfo*>::iterator & ixfr )
{
    // Backoff increments each poll interval, but time waited only increments
    // every two poll intervals. This allows polling to better match size of
    // file being transferred.

    if ( (*ixfr)->backoff < MAX_BACKOFF )
        (*ixfr)->backoff++;

    (*ixfr)->poll = INIT_POLL_PERIOD*(1<<((*ixfr)->backoff >> 1));
}

}}
