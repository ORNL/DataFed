#include <iostream>
#include <fstream>
#include <unistd.h>
#include <boost/program_options.hpp>
#define DEF_DYNALOG
#include "DynaLog.hpp"
#include "TraceException.hpp"
#include "Util.hpp"
#include "CoreServer.hpp"

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

        DL_INFO( "DataFed core server starting, ver " << VER_MAJOR << "." << VER_MINOR << "." << VER_BUILD );

        uint16_t    port = 7512;
        int         timeout = 5;
        uint32_t    num_threads = 1;
        string      cred_dir = "/etc/datafed/";
        string      db_url = "http://sdms.ornl.gov:8529/_db/sdms/api/";
        string      db_user = "root";
        string      db_pass = "sdms!";
        string      cfg_file;
        bool        gen_keys = false;
        size_t      tr_purge_age = 30*24*3600;
        size_t      tr_purge_per = 6*3600;

        po::options_description opts( "Options" );

        opts.add_options()
            ("help,?", "Show help")
            ("version,v", "Show version number")
            ("cred-dir,c",po::value<string>( &cred_dir ),"Server credentials directory")
            ("port,p",po::value<uint16_t>( &port ),"Service port")
            ("db-url,u",po::value<string>( &db_url ),"DB url")
            ("db-user,U",po::value<string>( &db_user ),"DB user name")
            ("db-pass,P",po::value<string>( &db_pass ),"DB password")
            ("xfr-purge-age",po::value<size_t>( &tr_purge_age ),"Transfer purge age (seconds)")
            ("xfr-purge-per",po::value<size_t>( &tr_purge_per ),"Transfer purge period (seconds)")
            ("threads,t",po::value<uint32_t>( &num_threads ),"Number of I/O threads")
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
                cout << "DataFed Core Server, ver. " << VER_MAJOR << "." << VER_MINOR << "." << VER_BUILD << "\n";
                cout << "Usage: sdms-core [options]\n";
                cout << opts << endl;
                return 0;
            }

            if ( opt_map.count( "version" ))
            {
                cout << VER_MAJOR << "." << VER_MINOR << "." << VER_BUILD << endl;
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

            if ( cred_dir.size() && cred_dir.back() != '/' )
                cred_dir += "/";

            if ( gen_keys )
            {
                string pub_key, priv_key;
                generateKeys( pub_key, priv_key );

                string fname = cred_dir + "datafed-core-key.pub";
                ofstream outf( fname.c_str() );
                if ( !outf.is_open() || !outf.good() )
                    EXCEPT_PARAM( 1, "Could not open file: " << fname );
                outf << pub_key;
                outf.close();

                fname = cred_dir + "datafed-core-key.priv";
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

        Core::Server server( port, cred_dir, timeout, num_threads, db_url, db_user, db_pass, tr_purge_age, tr_purge_per );

        server.run( false );

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

