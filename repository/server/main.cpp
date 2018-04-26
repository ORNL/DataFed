#include <iostream>
#include <fstream>
#include <unistd.h>
#include <boost/program_options.hpp>
#define DEF_DYNALOG
#include "DynaLog.hpp"
#include "TraceException.hpp"
#include "RepoServer.hpp"

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

        DL_INFO( "SDMS repo server starting" );

        uint16_t    port = 5800;
        uint32_t    num_threads = 1;
        string      cfg_file;
        string      home = getenv("HOME");
        string      cred_path = home + "/.sdms-server/";

        po::options_description opts( "Options" );

        opts.add_options()
            ("help,?", "Show help")
            ("version,v", "Show version number")
            ("port,p",po::value<uint16_t>( &port ),"Service port")
            ("threads,t",po::value<uint32_t>( &num_threads ),"Number of I/O threads")
            ("cred-dir,c",po::value<string>( &cred_path ),"Server credentials directory")
            ("cfg",po::value<string>( &cfg_file ),"Use config file for options")
            ;

        try
        {
            po::variables_map opt_map;
            po::store( po::command_line_parser( a_argc, a_argv ).options( opts ).run(), opt_map );
            po::notify( opt_map );

            if ( opt_map.count( "help" ) )
            {
                cout << "SDMS Repo Server, ver. " << VERSION << "\n";
                cout << "Usage: sdms-repo [options]\n";
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

        Repo::Server server( port, cred_path, num_threads );

        server.run( false );

        DL_INFO( "SDMS repo server exiting" );
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

