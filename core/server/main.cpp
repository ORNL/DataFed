#include <iostream>
#include <fstream>
#include <unistd.h>
#include <boost/program_options.hpp>
#define DEF_DYNALOG
#include "DynaLog.hpp"
#include "TraceException.hpp"
#include "Util.hpp"
#include "CoreServer.hpp"
#include "Config.hpp"
#include "Version.pb.h"

using namespace std;
using namespace SDMS;
namespace po = boost::program_options;


/** @brief Entry point for Core Server
 *
 * Parses command line options then creates and runs a CoreServer instance.
 */
int main( int a_argc, char ** a_argv )
{
    try
    {
        DL_SET_ENABLED(true);
        DL_SET_LEVEL(DynaLog::DL_TRACE_LEV);
        DL_SET_CERR_ENABLED(true);
        DL_SET_SYSDL_ENABLED(false);

        DL_INFO( "DataFed core server starting, ver " << VER_MAJOR << "." << VER_MAPI_MAJOR << "." << VER_MAPI_MINOR << ":" << VER_CORE );

        Core::Config &  config = Core::Config::getInstance();
        string          cfg_file;
        bool            gen_keys = false;

        po::options_description opts( "Options" );

        opts.add_options()
            ("help,?", "Show help")
            ("version,v", "Show version number")
            ("cred-dir,c",po::value<string>( &config.cred_dir ),"Server credentials directory")
            ("port,p",po::value<uint32_t>( &config.port ),"Service port")
            ("db-url,u",po::value<string>( &config.db_url ),"DB url")
            ("db-user,U",po::value<string>( &config.db_user ),"DB user name")
            ("db-pass,P",po::value<string>( &config.db_pass ),"DB password")
            ("glob-oauth-url",po::value<string>( &config.glob_oauth_url ),"Globus authorization API base URL")
            ("glob-xfr-url",po::value<string>( &config.glob_xfr_url ),"Globus transfer API base URL")
            ("client-id",po::value<string>( &config.client_id ),"Client ID")
            ("client-secret",po::value<string>( &config.client_secret ),"Client secret")
            ("task-purge-age",po::value<uint32_t>( &config.task_purge_age ),"Task purge age (seconds)")
            ("task-purge-per",po::value<uint32_t>( &config.task_purge_period ),"Task purge period (seconds)")
            ("metrics-per",po::value<uint32_t>( &config.metrics_period ),"Metrics update period (seconds)")
            ("metrics-purge-per",po::value<uint32_t>( &config.metrics_purge_period ),"Metrics purge period (seconds)")
            ("metrics-purge-age",po::value<uint32_t>( &config.metrics_purge_age ),"Metrics purge age (seconds)")
            ("client-threads",po::value<uint32_t>( &config.num_client_worker_threads ),"Number of client worker threads")
            ("task-threads",po::value<uint32_t>( &config.num_task_worker_threads ),"Number of task worker threads")
            ("cfg",po::value<string>( &cfg_file ),"Use config file for options")
            ("gen-keys",po::bool_switch( &gen_keys ),"Generate new server keys then exit")
            ;

        try
        {
            po::variables_map opt_map;
            po::store( po::command_line_parser( a_argc, a_argv ).options( opts ).run(), opt_map );
            po::notify( opt_map );

            if ( opt_map.count( "help" ) )
            {
                cout << "DataFed Core Server, ver. " << VER_MAJOR << "." << VER_MAPI_MAJOR << "." << VER_MAPI_MINOR << ":" << VER_CORE << "\n";
                cout << "Usage: datafed-core [options]\n";
                cout << opts << endl;
                return 0;
            }

            if ( opt_map.count( "version" ))
            {
                cout << VER_MAJOR << "." << VER_MAPI_MAJOR << "." << VER_MAPI_MINOR << ":" << VER_CORE << endl;
                return 0;
            }

            if ( cfg_file.size() )
            {
                ifstream optfile( cfg_file.c_str() );
                if ( !optfile.is_open() )
                    EXCEPT_PARAM( ID_CLIENT_ERROR, "Could not open config file: " << cfg_file );

                po::store( po::parse_config_file( optfile, opts, false ), opt_map );
                po::notify( opt_map );

                optfile.close();
            }

            if ( config.cred_dir.size() && config.cred_dir.back() != '/' )
                config.cred_dir += "/";

            if ( gen_keys )
            {
                string pub_key, priv_key;
                generateKeys( pub_key, priv_key );

                string fname = config.cred_dir + "datafed-core-key.pub";
                ofstream outf( fname.c_str() );
                if ( !outf.is_open() || !outf.good() )
                    EXCEPT_PARAM( 1, "Could not open file: " << fname );
                outf << pub_key;
                outf.close();

                fname = config.cred_dir + "datafed-core-key.priv";
                outf.open( fname.c_str() );
                if ( !outf.is_open() || !outf.good() )
                    EXCEPT_PARAM( 1, "Could not open file: " << fname );
                outf << priv_key;
                outf.close();

                return 0;
            }
        }
        catch( po::unknown_option & e )
        {
            DL_ERROR( "Options error: " << e.what() );
            return 1;
        }

        // Create and run CoreServer instance. Configuration is held in Config singleton

        Core::Server server;
        server.run();

        DL_INFO( "DataFed core server exiting" );
    }
    catch( TraceException &e )
    {
        DL_ERROR( "Exception: " << e.toString() );
    }
    catch( exception &e )
    {
        DL_ERROR( "Exception: " << e.what() );
    }

    return 0;
}

