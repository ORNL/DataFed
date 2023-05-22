// Local private includes
#include "RepoServer.hpp"
// Repo server version
#include "Version.hpp"

// Local public includes
#define DEF_DYNALOG
#include "common/DynaLog.hpp"
#include "common/TraceException.hpp"
#include "common/Util.hpp"

// Protocol includes 
#include "common/Version.pb.h"

// Third party includes
#include <boost/program_options.hpp>

// Standard includes
#include <iostream>
#include <fstream>
#include <unistd.h>

using namespace std;
using namespace SDMS;
namespace po = boost::program_options;


int main( int a_argc, char ** a_argv )
{

    global_logger.setSysLog(true);
    global_logger.addStream(std::cerr);

    LogContext log_context;
    log_context.thread_name = "repo_server";
    log_context.thread_id = 0;

    try
    {
        DL_INFO(log_context, "DataFed repo server starting, ver " << repository::version::MAJOR << "." << repository::version::MINOR << "." << repository::version::PATCH );

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
            ("globus-collection-path,g",po::value<string>( &config.globus_collection_path ),"Path to Globus collection default value is /mnt/datafed-repo")
            ("threads,t",po::value<uint32_t>( &config.num_req_worker_threads ),"Number of worker threads")
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
                cout << "DataFed Repo Server, ver. " << repository::version::MAJOR << "." << repository::version::MINOR << "." << repository::version::PATCH << "\n";
                cout << "Usage: datafed-repo [options]\n";
                cout << opts << endl;
                return 0;
            }

            if ( opt_map.count( "version" ))
            {
                cout << "Release Version: " << DATAFED_RELEASE_YEAR << "." << DATAFED_RELEASE_MONTH << "." << DATAFED_RELEASE_DAY << "." << DATAFED_RELEASE_HOUR << "." << DATAFED_RELEASE_MINUTE << std::endl;
                cout << "Messaging API: " << DATAFED_COMMON_PROTOCOL_API_MAJOR << "." << DATAFED_COMMON_PROTOCOL_API_MINOR << "." << DATAFED_COMMON_PROTOCOL_API_PATCH << endl;
                cout << "Repo Server: " << repository::version::MAJOR << "." << repository::version::MINOR << "." << repository::version::PATCH << endl;
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

            if ( config.globus_collection_path.size() && config.globus_collection_path.back() != '/' ) {
                config.globus_collection_path += "/";
            }

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


            while ( ! config.globus_collection_path.empty() ) {
              if ( config.globus_collection_path.back() == '/' ) {
                config.globus_collection_path.pop_back();
              } else {
                break;
              }
            }


        }
        catch( po::unknown_option & e )
        {
            DL_ERROR(log_context, "Options error: " << e.what() );
            return 1;
        }

        Repo::Server server(log_context);

        server.run();

        DL_INFO(log_context, "DataFed repo server exiting" );
    }
    catch( TraceException &e )
    {
        DL_ERROR(log_context, "Exception: " << e.toString() );
    }
    catch( exception &e )
    {
        DL_ERROR(log_context, "Exception: " << e.what() );
    }
    catch( ... )
    {
        DL_ERROR(log_context, "Unexpected/unknown exception" );
    }

    return 0;
}

