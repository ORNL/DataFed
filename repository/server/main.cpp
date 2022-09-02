#include <iostream>
#include <fstream>
#include <unistd.h>
#include <boost/program_options.hpp>
#define DEF_DYNALOG
#include "DynaLog.hpp"
#include "TraceException.hpp"
#include "Util.hpp"
#include "RepoServer.hpp"
#include "Version.pb.h"

using namespace std;
using namespace SDMS;
namespace po = boost::program_options;


int main( int a_argc, char ** a_argv )
{
    try
    {
        DL_SET_ENABLED(true);
        DL_SET_LEVEL(DynaLog::DL_TRACE_LEV);
        DL_SET_CERR_ENABLED(true);
        DL_SET_SYSDL_ENABLED(false);

        DL_INFO( "DataFed repo server starting, ver " << VER_MAJOR << "." << VER_MAPI_MAJOR << "." << VER_MAPI_MINOR << ":" << VER_REPO );

        Repo::Config &  config = Repo::Config::getInstance();
        string          cfg_file;
        bool            gen_keys = false;

        po::options_description opts( "Options" );

        opts.add_options()
            ("help,?", "Show help")
            ("version,v", "Show version number")
            ("cred-dir,c",po::value<string>( &config.cred_dir ),"Server credentials directory")
            ("port,p",po::value<uint16_t>( &config.port ),"Service port")
            ("server,s",po::value<string>( &config.core_server ),"Core server address")
            ("threads,t",po::value<uint32_t>( &config.num_req_worker_threads ),"Number of worker threads")
            ("cfg",po::value<string>( &cfg_file ),"Use config file for options")
            ("gen-keys",po::bool_switch( &gen_keys ),"Generate new server keys then exit")
            ;

            //("globus-collection-path,g",po::value<string>( &config.globus_collection_path ),"Path to Globus collection default value is /mnt/datafed-repo")
        try
        {
            po::variables_map opt_map;
            po::store( po::command_line_parser( a_argc, a_argv ).options( opts ).run(), opt_map );
            po::notify( opt_map );

            if ( opt_map.count( "help" ) )
            {
                cout << "DataFed Repo Server, ver. " << VER_MAJOR << "." << VER_MAPI_MAJOR << "." << VER_MAPI_MINOR << ":" << VER_REPO << "\n";
                cout << "Usage: datafed-repo [options]\n";
                cout << opts << endl;
                return 0;
            }

            if ( opt_map.count( "version" ))
            {
                cout << VER_MAJOR << "." << VER_MAPI_MAJOR << "." << VER_MAPI_MINOR << ":" << VER_REPO << endl;
                return 0;
            }

            if ( cfg_file.size() )
            {
                ifstream optfile( cfg_file.c_str() );
                if ( !optfile.is_open() )
                    EXCEPT_PARAM( 1, "Could not open config file: " << cfg_file );

                po::store( po::parse_config_file( optfile, opts, false ), opt_map );
                po::notify( opt_map );

                optfile.close();
            }

            if ( config.cred_dir.size() && config.cred_dir.back() != '/' ) {
                config.cred_dir += "/";
            }

            //if ( config.globus_collection_path.size() && config.globus_collection_path.back() != '/' ) {
            //    config.globus_collection_path += "/";
            //}

            if ( gen_keys )
            {
                string pub_key, priv_key;
                generateKeys( pub_key, priv_key );

                string fname = config.cred_dir + "datafed-repo-key.pub";
                ofstream outf( fname.c_str() );
                if ( !outf.is_open() || !outf.good() )
                    EXCEPT_PARAM( 1, "Could not open file: " << fname );
                outf << pub_key;
                outf.close();

                fname = config.cred_dir + "datafed-repo-key.priv";
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

        Repo::Server server;

        server.run();

        DL_INFO( "DataFed repo server exiting" );
    }
    catch( TraceException &e )
    {
        DL_ERROR( "Exception: " << e.toString() );
    }
    catch( exception &e )
    {
        DL_ERROR( "Exception: " << e.what() );
    }
    catch( ... )
    {
        DL_ERROR( "Unexpected/unknown exception" );
    }

    return 0;
}

