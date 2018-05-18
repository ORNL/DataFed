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
XfrMgr::newXfr( const XfrData & a_xfr, const std::string & a_uid )
{
    lock_guard<mutex> lock(m_xfr_mutex);

    if ( m_xfr_all.find( a_xfr.id() ) == m_xfr_all.end() )
    {
        XfrDataInfo * xfr_entry = new XfrDataInfo( a_xfr, a_uid );
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
        size_t  pos;
        DatabaseClient db_client( m_mgr.getDbURL(), m_mgr.getDbUser(), m_mgr.getDbPass() );
        GlobusTransferClient glob;

        db_client.setClient( "sdms" );

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
                        db_client.setClient( (*ixfr)->uid );

                        if ( !db_client.userGetAccessToken( (*ixfr)->token )) {
                            cout << "User " << (*ixfr)->uid << " has no access token\n";
                            ixfr = m_xfr_active.erase( ixfr );
                        }
                        else
                        {
                            // Get new submission ID
                            cout << "Sub ID: " << glob.getSubmissionID( (*ixfr)->token ) << "\n";

                            (*ixfr)->stage = 1;
                            (*ixfr)->poll = 10000;

                            ixfr++;
                        }

#if 0
                        if ( (*ixfr)->mode == XM_PUT )
                            cmd += (*ixfr)->local_path + " " + (*ixfr)->repo_path;
                        else
                            cmd += (*ixfr)->repo_path + " " + (*ixfr)->local_path;

                        // HACK Need err msg if things go wrong
                        cmd += " 2>&1";

                        result = exec( cmd.c_str() );

                        pos = result.find( "Task ID: " );

                        if ( pos != string::npos )
                        {
                            (*ixfr)->task_id = result.substr( pos + 9 );
                            (*ixfr)->task_id.erase(remove((*ixfr)->task_id.begin(), (*ixfr)->task_id.end(), '\n'), (*ixfr)->task_id.end());
                            //cout << "New task[" << (*ixfr)->task_id << "]\n";

                            cout << "Task " << (*ixfr)->task_id << " started\n";

                            // Update DB entry
                            db_client.xfrUpdate( (*ixfr)->id, 0, "", (*ixfr)->task_id.c_str() );
                            (*ixfr)->stage = 1;
                            (*ixfr)->poll = INIT_POLL_PERIOD;
                            ixfr++;
                        }
                        else
                        {
                            //cout << "Globus CLI Error\nResult:[" << result << "]";
                            for ( string::iterator c = result.begin(); c != result.end(); c++ )
                            {
                                if ( *c == '\n' )
                                    *c = '.';
                            }

                            status = XS_FAILED;
                            db_client.xfrUpdate( (*ixfr)->id, &status, result );
                            ixfr = m_xfr_active.erase( ixfr );
                        }
#endif
                    }
                    else
                    {
                        if ( --(*ixfr)->poll == 0 )
                        {
                            //cout << "poll (" << (*ixfr)->poll << ") xfr\n";

                            // Get current status
                            keyfile = m_mgr.getKeyPath() + (*ixfr)->uid + "-key";

                            //cmd = "ssh -i " + keyfile + " " + (*ixfr)->globus_id + "@cli.globusonline.org status -f status " + (*ixfr)->task_id;
                            cmd = "ssh -i " + keyfile + " " + (*ixfr)->uid + "@cli.globusonline.org events " + (*ixfr)->task_id + " -f code -O kv";
                            result = exec( cmd.c_str() );
                            if ( parseGlobusEvents( result, status, error_msg ))
                            {
                                // Cancel the xfr task
                                cmd = "ssh -i " + keyfile + " " + (*ixfr)->uid + "@cli.globusonline.org cancel " + (*ixfr)->task_id;
                                result = exec( cmd.c_str() );
                                cout << "Cancel result: " << result << "\n";
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
                                    //file_size = 0;

                                    // Update DB record with new file stats
                                    upd_req.set_id( (*ixfr)->data_id );
                                    //upd_req.set_data_size( file_size );
                                    upd_req.set_data_time( mod_time );
                                    upd_req.set_subject( (*ixfr)->uid );
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

#if 0

void
XfrMgr::xfrThreadFunc_old()
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
        size_t  pos;
        Auth::RepoDataGetSizeRequest sz_req;
        //MsgBuf::Message *            raw_msg;
        //Auth::RepoDataSizeReply *    sz_rep;
        //MsgBuf::Frame                frame;
        //string                       uid;
        //MsgComm  repo_comm( m_mgr.getrepo_address, ZMQ_DEALER, false, & m_mgr.getSecurityContext() );
        DatabaseClient db_client( m_mgr.getDbURL(), m_mgr.getDbUser(), m_mgr.getDbPass() );

        db_client.setClient( "sdms" );

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
                        cout << "start xfr\n";

                        keyfile = m_mgr.getKeyPath() + (*ixfr)->uid + "-key";

                        cmd = "ssh -i " + keyfile + " " + (*ixfr)->uid + "@cli.globusonline.org transfer -- ";
                        //cmd = "ssh globus transfer -- " + (*ixfr)->data_path + " " + (*ixfr)->dest_path;
                        //cmd = "ssh globus transfer -- ";

                        if ( (*ixfr)->mode == XM_PUT )
                            cmd += (*ixfr)->local_path + " " + (*ixfr)->repo_path;
                        else
                            cmd += (*ixfr)->repo_path + " " + (*ixfr)->local_path;

                        // HACK Need err msg if things go wrong
                        cmd += " 2>&1";

                        result = exec( cmd.c_str() );

                        pos = result.find( "Task ID: " );

                        if ( pos != string::npos )
                        {
                            (*ixfr)->task_id = result.substr( pos + 9 );
                            (*ixfr)->task_id.erase(remove((*ixfr)->task_id.begin(), (*ixfr)->task_id.end(), '\n'), (*ixfr)->task_id.end());
                            //cout << "New task[" << (*ixfr)->task_id << "]\n";

                            cout << "Task " << (*ixfr)->task_id << " started\n";

                            // Update DB entry
                            db_client.xfrUpdate( (*ixfr)->id, 0, "", (*ixfr)->task_id.c_str() );
                            (*ixfr)->stage = 1;
                            (*ixfr)->poll = INIT_POLL_PERIOD;
                            ixfr++;
                        }
                        else
                        {
                            //cout << "Globus CLI Error\nResult:[" << result << "]";
                            for ( string::iterator c = result.begin(); c != result.end(); c++ )
                            {
                                if ( *c == '\n' )
                                    *c = '.';
                            }

                            status = XS_FAILED;
                            db_client.xfrUpdate( (*ixfr)->id, &status, result );
                            ixfr = m_xfr_active.erase( ixfr );
                        }
                    }
                    else
                    {
                        if ( --(*ixfr)->poll == 0 )
                        {
                            //cout << "poll (" << (*ixfr)->poll << ") xfr\n";

                            // Get current status
                            keyfile = m_mgr.getKeyPath() + (*ixfr)->uid + "-key";

                            //cmd = "ssh -i " + keyfile + " " + (*ixfr)->globus_id + "@cli.globusonline.org status -f status " + (*ixfr)->task_id;
                            cmd = "ssh -i " + keyfile + " " + (*ixfr)->uid + "@cli.globusonline.org events " + (*ixfr)->task_id + " -f code -O kv";
                            result = exec( cmd.c_str() );
                            if ( parseGlobusEvents( result, status, error_msg ))
                            {
                                // Cancel the xfr task
                                cmd = "ssh -i " + keyfile + " " + (*ixfr)->uid + "@cli.globusonline.org cancel " + (*ixfr)->task_id;
                                result = exec( cmd.c_str() );
                                cout << "Cancel result: " << result << "\n";
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

                                    // TODO How to handle PUT errors?
                                    #if 0
                                    if ( (*ixfr)->status == XS_SUCCEEDED )
                                    {
                                        // TODO This should be done in another thread so xfr mon isn't blocked
                                        sz_req.set_id( (*ixfr)->data_id );
                                        repo_comm.send( sz_req );
                                        if ( !repo_comm.recv( raw_msg, uid, frame, 10000 ))
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
                                    #endif

                                    // Update DB record with new file stats
                                    upd_req.set_id( (*ixfr)->data_id );
                                    upd_req.set_data_size( file_size );
                                    upd_req.set_data_time( mod_time );
                                    upd_req.set_subject( (*ixfr)->uid );
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

#endif

bool
XfrMgr::parseGlobusEvents( const std::string & a_events, XfrStatus & status, std::string & a_err_msg )
{
    status = XS_INACTIVE;

    size_t p1 = 0;
    size_t p2 = a_events.find_first_of( "=", 0 );
    string tmp;
    size_t fault_count = 0;

    a_err_msg.clear();

    while ( p2 != string::npos )
    {
        tmp = a_events.substr( p1, p2 - p1 );
        if ( tmp != "code" )
            return XS_FAILED;

        p1 = p2 + 1;
        p2 = a_events.find_first_of( "\n", p1 );
        if ( p2 != string::npos )
            tmp = a_events.substr( p1, p2 - p1 );
        else
            tmp = a_events.substr( p1 );

        cout << "event: " << tmp << "\n";

        if ( tmp == "STARTED" || tmp == "PROGRESS" )
            status = XS_ACTIVE;
        else if ( tmp == "SUCCEEDED" )
            status = XS_SUCCEEDED;
        else if ( tmp == "CANCELED" )
        {
            status = XS_FAILED;
            a_err_msg = tmp;
        }
        else if ( tmp == "CONNECTION_RESET" )
        {
            status = XS_INIT;
            if ( ++fault_count > 10 )
            {
                status = XS_FAILED;
                a_err_msg = "Could not connect";
                return true;
            }
        }
        else
        {
            status = XS_FAILED;
            a_err_msg = tmp;
            return true;
        }

        // TODO There may be non-fatal error codes that should be checked for

        if ( p2 == string::npos )
            break;

        p1 = p2 + 1;
        p2 = a_events.find_first_of( "=", p1 );
    }

    return false;
}


}}
