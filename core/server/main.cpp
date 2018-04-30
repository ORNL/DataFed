#include <iostream>
#include <fstream>
#include <unistd.h>
#include <boost/program_options.hpp>
#define DEF_DYNALOG
#include "DynaLog.hpp"
#include "TraceException.hpp"
#include "CoreServer.hpp"

using namespace std;
using namespace SDMS;
namespace po = boost::program_options;

#define VERSION "0.1.0"

int main( int a_argc, char ** a_argv )
{
    try
    {
        DL_SET_ENABLED(true);
        DL_SET_LEVEL(DynaLog::DL_TRACE_LEV);
        DL_SET_CERR_ENABLED(true);
        DL_SET_SYSDL_ENABLED(false);

        DL_INFO( "SDMS core server starting" );

        uint16_t    port = 5800;
        int         timeout = 5;
        uint32_t    num_threads = 1;
        string      home = getenv("HOME");
        string      cred_path = home + "/.sdms-server/";
        //string      db_url = "https://sdms.ornl.gov:8529/_db/sdms/api/";
        string      db_url = "http://localhost:8529/_db/sdms/api/";
        string      db_user = "root";
        //string      db_pass = "sdms!";
        string      db_pass = "nopass";
        string      repo_addr = "tcp://localhost:9000";
        string      cfg_file;

        po::options_description opts( "Options" );

        opts.add_options()
            ("help,?", "Show help")
            ("version,v", "Show version number")
            ("cred-dir,c",po::value<string>( &cred_path ),"User credentials directory")
            ("port,p",po::value<uint16_t>( &port ),"Service port")
            ("db-url,u",po::value<string>( &db_url ),"DB url")
            ("db-user,U",po::value<string>( &db_user ),"DB user name")
            ("db-pass,P",po::value<string>( &db_pass ),"DB password")
            ("repo-addr,r",po::value<string>( &repo_addr ),"Data repository zmq address")
            ("threads,t",po::value<uint32_t>( &num_threads ),"Number of I/O threads")
            ("cfg",po::value<string>( &cfg_file ),"Use config file for options")
            ;

        try
        {
            po::variables_map opt_map;
            po::store( po::command_line_parser( a_argc, a_argv ).options( opts ).run(), opt_map );
            po::notify( opt_map );

            if ( opt_map.count( "help" ) )
            {
                cout << "SDMS Core Server, ver. " << VERSION << "\n";
                cout << "Usage: sdms-core [options]\n";
                cout << opts << endl;
                return 1;
            }

            if ( opt_map.count( "version" ))
            {
                cout << VERSION << endl;
                return 1;
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
        }
        catch( po::unknown_option & e )
        {
            DL_ERROR( "Options error: " << e.what() );
            return 1;
        }

        Core::Server server( port, cred_path, timeout, num_threads, db_url, db_user, db_pass, repo_addr );

        server.run( false );

        DL_INFO( "SDMS core server exiting" );
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

