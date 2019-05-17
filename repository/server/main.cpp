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

        DL_INFO( "SDMS repo server starting, ver " << VER_MAJOR << "." << VER_MINOR << "." << VER_BUILD );

        uint16_t    port = 9000;
        string      cfg_file;
        bool        gen_keys = false;
        string      cred_dir = "/etc/sdms/";

        po::options_description opts( "Options" );

        opts.add_options()
            ("help,?", "Show help")
            ("version,v", "Show version number")
            ("cred-dir,c",po::value<string>( &cred_dir ),"Server credentials directory")
            ("port,p",po::value<uint16_t>( &port ),"Service port")
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
                cout << "SDMS Repo Server, ver. " << VER_MAJOR << "." << VER_MINOR << "." << VER_BUILD << "\n";
                cout << "Usage: sdms-repo [options]\n";
                cout << opts << endl;
                return 0;
            }

            if ( opt_map.count( "version" ))
            {
                cout << VER_MAJOR << "." << VER_MINOR << "." << VER_BUILD << endl;
                return 0;
            }

            if ( gen_keys )
            {
                string pub_key, priv_key;
                generateKeys( pub_key, priv_key );

                string fname = cred_dir + "sdms-repo-key.pub";
                ofstream outf( fname.c_str() );
                if ( !outf.is_open() || !outf.good() )
                    EXCEPT_PARAM( 1, "Could not open file: " << fname );
                outf << pub_key;
                outf.close();

                fname = cred_dir + "sdms-repo-key.priv";
                outf.open( fname.c_str() );
                if ( !outf.is_open() || !outf.good() )
                    EXCEPT_PARAM( 1, "Could not open file: " << fname );
                outf << priv_key;
                outf.close();

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
        }
        catch( po::unknown_option & e )
        {
            DL_ERROR( "Options error: " << e.what() );
            return 1;
        }

        Repo::Server server( cred_dir, port );

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

