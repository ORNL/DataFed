#include <iostream>
#include <fstream>
#include <vector>
#include <map>
#include <unistd.h>
#include <time.h>
#include <boost/program_options.hpp>
#include "TraceException.hpp"
#include "Client.hpp"

#define timerDef() struct timespec _T0 = {0,0}, _T1 = {0,0}
#define timerStart() clock_gettime(CLOCK_REALTIME,&_T0)
#define timerStop() clock_gettime(CLOCK_REALTIME,&_T1)
#define timerElapsed() ((_T1.tv_sec - _T0.tv_sec) + ((_T1.tv_nsec - _T0.tv_nsec)/1.0e9))


using namespace std;
using namespace SDMS;
using namespace SDMS::Facility;

#define VERSION "1.0.0"

Client * g_client = 0;

const char * StatusText[] = { "INITIAL", "ACTIVE", "INACTIVE", "SUCCEEDED", "FAILED" };

bool g_wait = false;

string g_title;
string g_desc;
string g_alias;
string g_meta;
string g_meta_file;

int do_test( vector<string>& a_args )
{
    cout << "Testing:";
    for ( vector<string>::iterator a = a_args.begin(); a != a_args.end(); ++a )
        cout << " [" << *a << "]";
    cout << "\n";
    return 0;
}

int create_data( vector<string>& a_args )
{
    (void)a_args;
    spRecordDataReply rep;

    if ( !g_title.size() )
        EXCEPT_PARAM( 1, "Title option is required for create command" );

    if ( g_meta_file.size() )
    {
        if ( g_meta.size() )
            EXCEPT_PARAM( 1, "Options meta and meta-file are mutually exclusive" );

        ifstream inf( g_meta_file.c_str() );
        if ( !inf.is_open() )
            EXCEPT_PARAM( 1, "Could not open metadata file: " << g_meta_file );

        string metadata(( istreambuf_iterator<char>(inf)), istreambuf_iterator<char>());

        inf.close();
        rep = g_client->recordCreate( g_title, g_desc.size()?g_desc.c_str():0, g_alias.size()?g_alias.c_str():0, metadata.c_str() );
    }
    else
    {
        rep = g_client->recordCreate( g_title, g_desc.size()?g_desc.c_str():0, g_alias.size()>2?g_alias.c_str():0, g_meta.size()?g_meta.c_str():0 );
    }

    cout << rep->record(0).id() << "\n";

    return 0;
}

int get_data( vector<string>& a_args )
{
    if ( a_args.size() != 2 )
        return -1;

    spXfrDataReply xfrs = g_client->getData( a_args[0], a_args[1] );

    if ( g_wait )
    {
        const string & xfr_id = xfrs->xfr(0).id();
        spXfrDataReply xfr_stat;

        xfr_stat = g_client->xfrView( xfr_id );
        XfrStatus status = xfr_stat->xfr(0).status();

        while ( status < 3 )
        {
            sleep( 5 );
            xfr_stat = g_client->xfrView( xfr_id );
            status = xfr_stat->xfr(0).status();
        }

        cout << StatusText[status] << "\n";

        if ( status != 3 )
            return 1;
    }
    else
    {
        cout << xfrs->xfr(0).id() << "\n";
    }

    return 0;
}


int put_data( vector<string>& a_args )
{
    if ( a_args.size() != 2 )
        return -1;

    spXfrDataReply xfrs = g_client->putData( a_args[0], a_args[1] );

    if ( g_wait )
    {
        const string & xfr_id = xfrs->xfr(0).id();
        spXfrDataReply xfr_stat;

        xfr_stat = g_client->xfrView( xfr_id );
        XfrStatus status = xfr_stat->xfr(0).status();

        while ( status < 3 )
        {
            sleep( 5 );
            xfr_stat = g_client->xfrView( xfr_id );
            status = xfr_stat->xfr(0).status();
        }

        cout << StatusText[status] << "\n";

        if ( status != 3 )
            return 1;
    }
    else
    {
        cout << xfrs->xfr(0).id() << "\n";
    }

    return 0;
}


int xfr_status( vector<string>& a_args )
{
    if ( a_args.size() != 1 )
        return -1;

    spXfrDataReply xfr = g_client->xfrView( a_args[0] );
    cout << StatusText[xfr->xfr(0).status()] << "\n";

    return 0;
}

int gen_ssh( vector<string>& a_args )
{
    if ( a_args.size() != 1 )
        return -1;

    g_client->generateKeys( a_args[0] );
    cout << "SUCCESS\n";

    return 0;
}

int get_ssh( vector<string>& a_args )
{
    if ( a_args.size() != 1 )
        return -1;

    g_client->getPublicKey( a_args[0] );
    cout << "SUCCESS\n";

    return 0;
}

int main( int a_argc, char ** a_argv )
{
    typedef map<string,pair<string,int (*)(vector<string>&)>> cmd_t;

    try
    {
        string      host = "127.0.0.1";
        uint16_t    port = 5800;
        uint32_t    timeout = 5;
        string      cred_path = "/home/d3s/.sdms/";
        string      unit = "CCS";
        //bool        gen_cred = false;
        //bool        gen_ssh = false;
        string      cfg_file;
        string      cmd;
        vector<string>  args;

        cmd_t commands = {
            { "test", { "test [arg [arg...]]\n\nPerforms cmd line interface testing", do_test }},
            { "create", { "create -t title [-d desc] [-a alias] [-m metadata |-f meta-file]\n\nCreate a new data record using supplied options. Returns new data ID on success.", create_data }},
            { "get", { "get id dest\n\nTransfer raw data associated with identifier (or alias) 'id' from repository to destination directory 'dest'. Destination path may include a globus end-point prefix. If no end-point is specified, the default end-point associated with the local environment is used.", get_data }},
            { "put", { "put id src\n\nTransfer raw data associated with identifier (or alias) 'id' from source file 'dest' to repository. Source path may include a globus end-point prefix. If no end-point is specified, the default end-point associated with the local environment is used.", put_data }},
            { "status", { "status xfr_id\n\nGet status of specified data transfer.", xfr_status }},
            { "gen-cred", { "gen-cred\n\nGenerate new user credentials (X509) for the local environment.", 0 }},
            { "gen-ssh", { "gen-ssh out-file\n\nGenerate new SSH keys for the local environment. The resulting public key is written to the specified output file and must be subsequently installed in the user's Globus ID account (see https://docs.globus.org/cli/legacy).", gen_ssh }},
            { "get-ssh", { "get-ssh out-file\n\nGet current SSH public key for the local environment. The public key is written to the specified output file.", get_ssh }}
        };

        namespace po = boost::program_options;
        po::options_description visible( "Program options" );
        visible.add_options()
            ("help,?", "Show help")
            ("version,v", "Show version number")
            ("cred-dir,c",po::value<string>( &cred_path ),"User credentials directory")
            //("gen-cred,x",po::bool_switch( &gen_cred ),"Generate new user credentials for this environment")
            //("gen-ssh,s",po::bool_switch( &gen_ssh ),"Generate new globus SSH keys for this environment")
            ("wait,w",po::bool_switch( &g_wait ),"Block until command completes")
            ("title,t",po::value<string>( &g_title ),"Specify title for create/update commands")
            ("desc,d",po::value<string>( &g_desc ),"Specify description for create/update commands")
            ("alias,a",po::value<string>( &g_alias ),"Specify alias for create/update commands")
            ("meta,m",po::value<string>( &g_meta ),"Specify metadata (JSON format) for create/update commands")
            ("meta-file,f",po::value<string>( &g_meta_file ),"Specify filename to read metadata from (JSON format) for create/update commands")
            ("host,h",po::value<string>( &host ),"Service hostname/IP")
            ("port,p",po::value<uint16_t>( &port ),"Service port")
            //("timeout,t",po::value<uint32_t>( &timeout ),"Service timeout")
            ("cfg",po::value<string>( &cfg_file ),"Use config file for options")
            ;

        po::options_description hidden( "Hidden options" );
        hidden.add_options()
            ("cmd",po::value<string>( &cmd ),"Command to run")
            ("arg",po::value<vector<string>>( &args ),"Command argument(s)")
            ;
            
        po::options_description options("All options");
        options.add(visible).add(hidden);

        po::positional_options_description pops;
        pops.add( "cmd", 1 );
        pops.add( "arg", -1 );

        try
        {
            po::variables_map opt_map;
            po::store( po::command_line_parser( a_argc, a_argv ).options( options ).positional( pops ).run(), opt_map );
            po::notify( opt_map );

            if ( opt_map.count( "help" ) || cmd.size() == 0 )
            {
                cout << "SDMS CLI Client, ver. " << VERSION << "\n";
                if ( cmd.size() )
                {
                    if ( cmd == "all" )
                    {
                        cout << "Available commands:\n\n";
                        for ( cmd_t::iterator icmd = commands.begin(); icmd != commands.end(); ++icmd )
                        {
                            cout << "    " << icmd->first << "\n";
                        }
                        cout << "\n";
                    }
                    else
                    {
                        cmd_t::iterator icmd = commands.find( cmd );
                        if ( icmd == commands.end() )
                            cout << "Unknown command '" << cmd << "'\n";
                        else
                            cout << "Help for command '" << cmd << "':\n\n    Usage: " << icmd->second.first << "\n\n";
                    }
                }
                else
                {
                    cout << "Usage: sdms [options] command [args]\n";
                    cout << "      \"--help all\" to list all commands\n";
                    cout << "      \"--help [command]\" for command-specific help\n\n";
                    cout << visible << endl;
                }
                return 1;
            }
            else if ( opt_map.count( "version" ))
            {
                cout << VERSION << endl;
                return 1;
            }

            if ( cfg_file.size() )
            {
                ifstream optfile( cfg_file.c_str() );
                if ( !optfile.is_open() )
                    EXCEPT_PARAM( ID_CLIENT_ERROR, "Could not open config file: " << cfg_file );

                po::store( po::parse_config_file( optfile, options, false ), opt_map );
                po::notify( opt_map );

                optfile.close();
            }
        }
        catch( po::unknown_option & e )
        {
            cout << e.what() << endl;
            cout << options << endl;
            return 1;
        }

        //cout << "Starting client (" << unit << ")" << endl;
        //cout << cred_path << ", " << gen_cred << endl;

        bool load_cred = true;

        // Must process "gen-cred" command before client init

        if ( cmd == "gen-cred" )
        {
            if ( args.size() != 0 )
            {
                cout << "ERROR\n";
                cerr << "Invalid arguments for command '" << cmd << "'.\n    Usage: " << commands["gen-cred"].first << "\n\n";
                return 1;
            }

            load_cred = false;
        }

        Client client( host, port, timeout, cred_path, unit, load_cred );
        client.start();

        if ( !load_cred )
        {
            string password;

            cout << "Password: ";
            cin >> password;

            client.authenticate( password );

            client.generateCredentials();

            cout << "SUCCESS\n";
            exit(0);
        }

        g_client = &client;

        if ( cmd.size() )
        {
            cmd_t::iterator icmd = commands.find( cmd );
            if ( icmd != commands.end() )
            {
                int ec = icmd->second.second( args );
                if ( ec < 0 )
                {
                    cout << "ERROR\n";
                    cerr << "Invalid arguments for command '" << cmd << "'.\n    Usage: " << icmd->second.first << "\n\n";
                    return 1;
                }
                return ec;
            }
            else
            {
                cout << "ERROR\n";
                cerr << "Unknown command '" << cmd << "'\n";
                return 1;
            }
        }

        //spUserDataReply users;
        //spRecordDataReply records;
        //spCollDataReply colls;


        //msgTest( client );
        //pingTest( client, 1000 );
        //perfTest( client );

/*
        #if 1
        spXfrDataReply xfrs = client.getData( "dat2", "olcf#dtn_atlas/~/working/", 0 );
        #else
        string new_id;
        spXfrDataReply xfrs = client.putData( "olcf#dtn_atlas/~/datafile", "Hello World", new_id, "Test data", "dat2", "{\"x\":1}" );
        cout << "Created data record " << new_id << "\n";
        #endif

        if ( xfrs->xfr_size() == 1 )
        {
            const XfrData & xfr = xfrs->xfr(0);
            cout << "xfr id     : " << xfr.id() << "\n";
            cout << "xfr mode   : " << (int)xfr.mode() << "\n";
            cout << "xfr status : " << (int)xfr.status() << "\n";
            cout << "data id    : " << xfr.data_id() << "\n";
            cout << "repo_path  : " << xfr.repo_path() << "\n";
            cout << "loc_path  : " << xfr.local_path() << "\n";
            cout << "globus id  : " << xfr.globus_id() << "\n";
        }
        else
            cout << "Data xfr not started?\n";
*/


/*
        XfrStatus xfr_stat = get_data->xfr_status();
        if ( xfr_stat == XFR_ACTIVE )
        {
            cout << "Waiting for xfr\n";
            while ( xfr_stat == XFR_ACTIVE )
            {
                sleep( 5 );
                xfr_stat = client.getXfrStatus( get_data->xfr_id() );
                cout << "status: " << (int)xfr_stat << "\n";
            }
        }
*/


/*
        records = client.recordView( "d3s:ddat1" );
        if ( records->record_size() == 1 )
        {
            const RecordData & rec = records->record(0);
            cout << "Record id: " << rec.id() << ", title: " << rec.title() << "\n";
        }
        else
            cout << "Record not found\n";
*/

        //cout << "trans ID: " << client.getData( "d3s:ddat1", "/home/d3s/xxxx", CREATE_PATH | BACKUP ) << "\n";


/*
        users = client.userView( "" );
        if ( users->user_size() == 1 )
        {
            const UserData & user = users->user(0);
            cout << "uid: " << user.uid() << ", name: " << user.name_first() << " " << user.name_last() << "\n";
        }

        users = client.userView( "d3s" );
        if ( users->user_size() == 1 )
        {
            const UserData & user = users->user(0);
            cout << "uid: " << user.uid() << ", name: " << user.name_first() << " " << user.name_last() << "\n";
        }
*/

/*
        users = client.userView( "d3s" );
        if ( users->user_size() == 1 )
        {
            const UserData & user = users->user(0);
            cout << "uid: " << user.uid() << ", name: " << user.name_first() << " " << user.name_last() << "\n";
        }
*/

/*
        colls = client.collList( "" );
        cout << "my collection count: " << colls->coll_size() << "\n";
        for ( int i = 0; i < colls->coll_size(); ++i )
        {
            const CollData & coll = colls->coll(i);
            cout << "id: " << coll.id() << ", title: " << coll.title() << "\n";
        }
*/

/*
        colls = client.collList( "user1" );
        cout << "user1 collection count: " << colls->coll_size() << "\n";
        for ( int i = 0; i < colls->coll_size(); ++i )
        {
            const CollData & coll = colls->coll(i);
            cout << "id: " << coll.id() << ", title: " << coll.title() << "\n";
        }
*/

/*
        spUserDataReply users = client.userList();

        cout << "user count: " << users->user_size() << "\n";
        for ( int i = 0; i < users->user_size(); ++i )
        {
            const UserData & user = users->user(i);
            cout << "uid: " << user.uid() << ", name: " << user.name_first() << " " << user.name_last() << "\n";
        }

        users.reset();
*/
        //client.stop();
        //sleep( 5 );
    }
    catch( TraceException &e )
    {
        cout << "ERROR\n";
        cerr << e.toString() << "\n";
        return 1;
    }
    catch( exception &e )
    {
        cout << "ERROR\n";
        cerr << e.what() << "\n";
        return 1;
    }

    return 0;
}

