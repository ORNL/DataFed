#include <iostream>
#include <fstream>
#include <vector>
#include <map>
#include <cstdlib>
#include <unistd.h>
#include <time.h>
#include <boost/program_options.hpp>
#include <boost/tokenizer.hpp>
#include <boost/token_functions.hpp>
#include <readline/readline.h>
#include <readline/history.h>
#include "TraceException.hpp"
#include "SmartTokenizer.hpp"
#include "Client.hpp"

#define timerDef() struct timespec _T0 = {0,0}, _T1 = {0,0}
#define timerStart() clock_gettime(CLOCK_REALTIME,&_T0)
#define timerStop() clock_gettime(CLOCK_REALTIME,&_T1)
#define timerElapsed() ((_T1.tv_sec - _T0.tv_sec) + ((_T1.tv_nsec - _T0.tv_nsec)/1.0e9))


using namespace std;
using namespace SDMS;
using namespace SDMS::Facility;
namespace po = boost::program_options;

#define VERSION "1.0.0"

Client * g_client = 0;

const char * StatusText[] = { "INITIAL", "ACTIVE", "INACTIVE", "SUCCEEDED", "FAILED" };

typedef map<string,pair<string,int (*)()>> cmd_t;

enum OutputFormat
{
    TEXT,
    JSON,
    CSV
};

bool            g_wait = false;
string          g_title;
string          g_desc;
string          g_alias;
string          g_meta;
string          g_meta_file;
bool            g_meta_replace;
string          g_cfg_file;
string          g_cmd;
vector<string>  g_args;
string          g_out_form_str;
OutputFormat    g_out_form = TEXT;

cmd_t   g_commands;

po::options_description g_opts_command( "Command options" );



void printUsers( spUserDataReply a_reply )
{
    if ( g_out_form == JSON )
        cout << "{\"users\":[";
    if ( a_reply->user_size() )
    {
        for ( int i = 0; i < a_reply->user_size(); i++ )
        {
            if ( g_out_form == JSON && i > 0 )
                cout << ",";

            const UserData & user = a_reply->user(i);
            switch ( g_out_form )
            {
            case TEXT:
                cout << "  UID    : " << user.uid() << "\n";
                cout << "  Name   : " << user.name_first() << " " << user.name_last() << "\n";
                if ( user.has_email() )
                    cout << "  email  : " << user.email() << "\n";
                if ( user.has_globus_id() )
                    cout << "  globus : " << user.globus_id() << "\n";
                if ( user.has_phone() )
                    cout << "  phone  : " << user.phone() << "\n";
                if ( user.has_is_admin() )
                    cout << "  admin  : " << user.is_admin() << "\n";
                break;
            case JSON:
                cout << "{\"uid\":\"" << user.uid() << "\",\"name_first\":\"" << user.name_first() << "\",\"name_last\":\"" << user.name_last() << "\"";
                if ( user.has_email() )
                    cout << ",\"email\":\"" << user.email() << "\"";
                if ( user.has_globus_id() )
                    cout << ",\"globus_id\":\"" << user.globus_id() << "\"";
                if ( user.has_phone() )
                    cout << ",\"phone\":\"" << user.phone() << "\"";
                if ( user.has_is_admin() )
                    cout << ",\"admin\":" << (user.is_admin()?"true":"false");
                cout << "}";
                break;
            case CSV:
                cout << "\"" << user.uid() << "\",\"" << user.name_first() << "\",\"" << user.name_last() << "\"\n";
                break;
            }

            if ( g_out_form == TEXT )
                cout << "\n";
        }
    }
    if ( g_out_form == JSON )
        cout << "]}\n";
}

void printGroups( spGroupDataReply a_reply )
{
    if ( a_reply->group_size() )
    {
        for ( int i = 0; i < a_reply->group_size(); i++ )
        {
            const GroupData & data = a_reply->group(i);

            cout << "  GID   : " << data.gid() << "\n";
            if ( data.has_title() )
                cout << "  Title : " << data.title() << "\n";
            if ( data.has_desc() )
                cout << "  Desc  : " << data.desc() << "\n";
            if ( data.member_size() > 0 )
            {
                cout << "  Member:";
                for ( int i = 0; i < data.member_size(); ++i )
                    cout << " " << data.member(i);
                cout << "\n";
            }
            cout << "\n";
        }
    }
    else cout << "No results\n";
}

void printCollData( spCollDataReply a_reply )
{
    if ( a_reply->coll_size() )
    {
        for ( int i = 0; i < a_reply->coll_size(); i++ )
        {
            const CollData & data = a_reply->coll(i);

            cout << "  ID    : " << data.id() << "\n";
            cout << "  Title : " << data.title() << "\n";
            cout << "\n";
        }
    }
}

void printACLs( spACLDataReply a_reply )
{
    if ( a_reply->rule_size() )
    {
        for ( int i = 0; i < a_reply->rule_size(); i++ )
        {
            const ACLRule & rule = a_reply->rule(i);

            cout << "  ID       : " << rule.id() << "\n";
            if ( rule.has_grant() )
                cout << "  Grant    : " << rule.grant() << "\n";
            if ( rule.has_deny() )
                cout << "  Deny     : " << rule.deny() << "\n";
            if ( rule.has_inh_grant() )
                cout << "  Grant(i) : " << rule.inh_grant() << "\n";
            if ( rule.has_inh_deny() )
                cout << "  Deny(i)  : " << rule.inh_deny() << "\n";
            cout << "\n";
        }
    }
    else
        cout << "  No ACLs set\n";
}


int no_console()
{
    cout << "Command not supported in console mode.\n";
    return 0;
}


int help()
{
    if ( g_args.size() == 0 )
    {
        cout << "Usage: command [args] [options] \n";
        cout << "      \"help all\" to list all commands\n";
        cout << "      \"help [command]\" for command-specific help\n\n";
        cout << g_opts_command << endl;
    }
    else
    {
        if ( g_args[0] == "all" )
        {
            cout << "Available commands:\n\n";
            for ( cmd_t::iterator icmd = g_commands.begin(); icmd != g_commands.end(); ++icmd )
            {
                cout << "  " << icmd->first << "\n";
            }
            cout << "\n";
        }
        else
        {
            cmd_t::iterator icmd = g_commands.find( g_args[0] );
            if ( icmd == g_commands.end() )
                cout << "Unknown command '" << g_args[0] << "'\n";
            else
                cout << "Help for command '" << g_args[0] << "':\n\n    Usage: " << icmd->second.first << "\n\n";
        }
    }

    return 0;
}

spRecordDataReply createRecord()
{
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

        return g_client->recordCreate( g_title, g_desc.size()?g_desc.c_str():0, g_alias.size()?g_alias.c_str():0, metadata.c_str() );
    }
    else
    {
        return g_client->recordCreate( g_title, g_desc.size()?g_desc.c_str():0, g_alias.size()>2?g_alias.c_str():0, g_meta.size()?g_meta.c_str():0 );
    }
}

spRecordDataReply updateRecord( const string & a_id )
{
    if ( g_meta_file.size() )
    {
        if ( g_meta.size() )
            EXCEPT_PARAM( 1, "Options meta and meta-file are mutually exclusive" );

        ifstream inf( g_meta_file.c_str() );
        if ( !inf.is_open() )
            EXCEPT_PARAM( 1, "Could not open metadata file: " << g_meta_file );

        string metadata(( istreambuf_iterator<char>(inf)), istreambuf_iterator<char>());

        inf.close();

        return g_client->recordUpdate( a_id, g_title.size()?g_title.c_str():0, g_desc.size()?g_desc.c_str():0, g_alias.size()?g_alias.c_str():0, metadata.c_str(), !g_meta_replace );
    }
    else
    {
        return g_client->recordUpdate( a_id, g_title.size()?g_title.c_str():0, g_desc.size()?g_desc.c_str():0, g_alias.size()>2?g_alias.c_str():0, g_meta.size()?g_meta.c_str():0, !g_meta_replace );
    }
}

void printDataRecord( const RecordData & a_rec )
{
    cout << "   id : " << a_rec.id() << "\n";
    if ( a_rec.has_alias() )
        cout << "alias : " << a_rec.alias() << "\n";
    cout << "title : " << a_rec.title() << "\n";
    if ( a_rec.has_desc() )
        cout << " desc : " << a_rec.desc() << "\n";
    if ( a_rec.has_metadata() )
        cout << " meta : " << a_rec.metadata() << "\n";
}

int create_record()
{
    if ( g_args.size() != 0 )
        return -1;

    spRecordDataReply rep = createRecord();

    cout << rep->record(0).id() << "\n";

    return 0;
}


int update_record()
{
    if ( g_args.size() != 1 )
        return -1;

    updateRecord( g_args[0] );

    cout << "SUCCESS\n";

    return 0;
}


int delete_record()
{
    cout << "Not implemented yet\n";
    return 1;
}

int view_record()
{
    if ( g_args.size() != 1 )
        return -1;

    spRecordDataReply rep = g_client->recordView( g_args[0] );

    for ( int i = 0; i < rep->record_size(); i++ )
    {
        printDataRecord( rep->record(i) );
    }

    return 0;
}


int find_records()
{
    if ( g_args.size() == 0 )
        return -1;

    string query;
    query.reserve( 512 );

    for ( vector<string>::iterator a = g_args.begin(); a != g_args.end(); a++ )
    {
        query.append( *a );
        query.append( " " );
    }

    spRecordDataReply rep = g_client->recordFind( query );
    if ( rep->record_size() )
    {
        cout << rep->record_size() << " match(es) found:\n\n";

        for ( int i = 0; i < rep->record_size(); i++ )
        {
            printDataRecord( rep->record(i) );
            cout << "\n";
        }
    }
    else
    {
        cout << "No matches found.\n";
    }

    return 0;
}


int pull_data()
{
    if ( g_args.size() != 2 )
        return -1;

    spXfrDataReply xfrs = g_client->pullData( g_args[0], g_args[1] );

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


int push_data()
{
    string data_id;

    if ( g_args.size() == 1 )
    {
        // Create new record based on options
        spRecordDataReply rep = createRecord();
        data_id = rep->record(0).id();
    }
    else if ( g_args.size() == 2 )
    {
        // Update existing record if options are provided
        data_id = g_args[0];
        spRecordDataReply rep = updateRecord( data_id );
    }
    else
        return -1;

    // Push data to record

    spXfrDataReply xfrs = g_client->pushData( data_id, *g_args.rbegin() );

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


int xfr_status()
{
    if ( g_args.size() != 1 )
        return -1;

    spXfrDataReply xfr = g_client->xfrView( g_args[0] );
    cout << StatusText[xfr->xfr(0).status()] << "\n";

    return 0;
}

int read_coll()
{
    if ( g_args.size() == 0 )
    {
        spCollDataReply rep = g_client->collRead( "root" );
        printCollData( rep );
    }
    else if ( g_args.size() == 1 )
    {
        spCollDataReply rep = g_client->collRead( g_args[0] );
        printCollData( rep );
    }
    else
        return -1;

    return 0;
}

int user()
{
    if ( g_args.size() == 0 )
    {
        spUserDataReply rep = g_client->userList();
        printUsers( rep );
    }
    else if ( g_args.size() == 1 )
    {
        spUserDataReply rep = g_client->userView( g_args[0] );
        printUsers( rep );
    }
    else
        return -1;

    return 0;
}

int group()
{
    if ( g_args.size() >= 2 )
    {
        if ( g_args[0] == "create" || g_args[0] == "c" )
        {
            if ( g_args.size() > 4 )
                return -1;

            spGroupDataReply rep = g_client->groupCreate( g_args[1], g_args.size() > 2?g_args[2].c_str():0, g_args.size() > 3?g_args[3].c_str():0 );
            printGroups( rep );
        }
        else if ( g_args[0] == "update" || g_args[0] == "u" )
        {
            if ( g_args.size() > 4 )
                return -1;

            spGroupDataReply rep = g_client->groupUpdate( g_args[1], g_args.size() > 2?g_args[2].c_str():0, g_args.size() > 3?g_args[3].c_str():0 );
            printGroups( rep );
        }
        else if ( g_args[0] == "delete" || g_args[0] == "d" )
        {
            if ( g_args.size() > 2 )
                return -1;

            g_client->groupDelete( g_args[1] );

        }
        else if ( g_args[0] == "view"  || g_args[0] == "v" )
        {
            if ( g_args.size() > 2 )
                return -1;

            spGroupDataReply rep = g_client->groupView( g_args[1] );
            printGroups( rep );
        }
        else if ( g_args[0] == "add"  || g_args[0] == "+" )
        {
            if ( g_args.size() < 3 )
                return -1;

            vector<string> ids;
            for ( size_t i = 2; i < g_args.size(); ++i )
                ids.push_back( g_args[i] );

            spGroupDataReply rep = g_client->groupAdd( g_args[1], ids );
            printGroups( rep );
        }
        else if ( g_args[0] == "rem"  || g_args[0] == "-" )
        {
            if ( g_args.size() < 3 )
                return -1;

            vector<string> ids;
            for ( size_t i = 2; i < g_args.size(); ++i )
                ids.push_back( g_args[i] );

            spGroupDataReply rep = g_client->groupRemove( g_args[1], ids );
            printGroups( rep );
        }
        else
            return -1;
    }
    else if ( g_args.size() == 1 )
    {
        if ( g_args[0] == "list"  || g_args[0] == "ls" )
        {
            spGroupDataReply rep = g_client->groupList();
            printGroups( rep );
        }
    }
    else
        return -1;

    return 0;
}

int acl()
{
    if ( g_args.size() == 2 && g_args[0] == "get" )
    {
        spACLDataReply rep = g_client->aclView( g_args[1] );
        printACLs( rep );
    }
    else if (( g_args.size() == 5 || g_args.size() == 6 ) && g_args[0] == "set" )
    {
        if ( g_args[3] != "grant" || g_args[3] == "deny" )
            return -1;

        // acl [get|set] id [[uid|gid|def] [grant|deny [inh]] value] ]
        string rule = "[{\"id\":\"" + g_args[2] + "\",\"";

        if ( g_args[4] == "inh" )
        {
            if ( g_args.size() != 6 )
                return -1;

            rule += "inh_" + g_args[3] + "\":\"" + g_args[5] + "\"}]";
        }
        else
        {
            rule += g_args[3] + "\":\"" + g_args[4] + "\"}]";
        }

        spACLDataReply rep = g_client->aclUpdate( g_args[1], rule );
        printACLs( rep );
    }
    else
        return -1;

    return 0;
}

int add_item()
{
    if ( g_args.size() != 2 )
        return -1;

    // Collection ID
    g_client->collectionAdd( g_args[1], g_args[0] );

    return 0;
}

int rem_item()
{
    if ( g_args.size() != 2 )
        return -1;

    // Collection ID
    g_client->collectionRemove( g_args[1], g_args[0] );

    return 0;
}

int gen_ssh()
{
    if ( g_args.size() != 1 )
        return -1;

    g_client->generateKeys( g_args[0] );
    cout << "SUCCESS\n";

    return 0;
}

int get_ssh()
{
    if ( g_args.size() != 1 )
        return -1;

    g_client->getPublicKey( g_args[0] );
    cout << "SUCCESS\n";

    return 0;
}


enum OptionResult
{
    OPTS_OK,
    OPTS_HELP,
    OPTS_VERSION,
    OPTS_ERROR
};

OptionResult processArgs( int a_argc, const char ** a_argv, po::options_description & a_opts_desc, po::positional_options_description & a_opts_pos )
{
    g_wait = false;
    g_title.clear();
    g_desc.clear();
    g_alias.clear();
    g_meta.clear();
    g_meta_file.clear();
    g_meta_replace = false;
    g_cmd.clear();
    g_args.clear();

    try
    {
        po::variables_map opt_map;
        po::store( po::command_line_parser( a_argc, a_argv ).options( a_opts_desc ).positional( a_opts_pos ).run(), opt_map );
        po::notify( opt_map );

        if ( opt_map.count( "help" ) )
            return OPTS_HELP;

        if ( opt_map.count( "version" ))
            return OPTS_VERSION;

        if ( g_cfg_file.size() )
        {
            ifstream optfile( g_cfg_file.c_str() );
            if ( !optfile.is_open() )
                EXCEPT_PARAM( ID_CLIENT_ERROR, "Could not open config file: " << g_cfg_file );

            po::store( po::parse_config_file( optfile, a_opts_desc, false ), opt_map );
            po::notify( opt_map );

            optfile.close();
        }

        if ( opt_map.count( "output-format" ))
        {
            if ( g_out_form_str == "text" )
                g_out_form = TEXT;
            else if ( g_out_form_str == "json" )
                g_out_form = JSON;
            else if ( g_out_form_str == "csv" )
                g_out_form = CSV;
            else
            {
                cout << "Invalid value for output format\n";
                return OPTS_ERROR;
            }
        }
    }
    catch( po::unknown_option & e )
    {
        cout << "error!\n";
        cout << e.what() << endl;
        return OPTS_ERROR;
    }

    return OPTS_OK;
}


int main( int a_argc, char ** a_argv )
{
    g_commands["help"] = { "help [cmd]\n\nList all commands, or show help for 'cmd'", help };
    g_commands["create"] = { "create -t title [-d desc] [-a alias] [-m metadata |-f meta-file]\n\nCreate a new data record using supplied options. Returns new data ID on success.", create_record };
    g_commands["update"] = { "update id [-t title] [-d desc] [-a alias] [-m metadata |-f meta-file]\n\nUpdate an existing data record using supplied options.", update_record };
    g_commands["delete"] = { "delete id\n\nDelete an existing data record.", delete_record };
    g_commands["view"] = { "view id\n\nView an existing data record.", view_record };
    g_commands["ls"] = { "ls [id]\n\nList contents of a collection specified by 'id'. If 'id' is omitted, all top-level collections are listed.", read_coll };
    g_commands["group"] = { "group cmd [id [args]]\n\nGroup command (list, view, create, update, delete) for group 'id'", group };
    g_commands["add"] = { "add id id2\n\nAdd item 'id' into collection 'id2'.", add_item };
    g_commands["rem"] = { "rem id id2\n\nRemove item 'id' from collection 'id2'.", rem_item };
    g_commands["find"] = { "find query\n\nReturns a list of all data records that match specified query (see documentation for query language description).", find_records };
    g_commands["pull"] = { "pull id dest\n\n'Pull' raw data from repository and place in a specified destination directory. The 'id' parameter may be either a data identifier or an alias. The destination path may include a globus end-point prefix; however, if none is specified, the default local end-point will be used.", pull_data };
    g_commands["push"] = { "push [id] src [-t title] [-d desc] [-a alias] [-m metadata |-f meta-file]\n\n'Push' raw data from the specified source path to the repository. If the 'id' parameter is provided, the record with the associated identifier (or alias) will receive the data; otherwise a new data record will be created. Data record fields may be set or updated using the indicated options, and for new records, the 'title' option is required. The source path may include a globus end-point prefix; however, if none is specified, the default local end-point will be used.", push_data };
    g_commands["status"] = { "status xfr_id\n\nGet status of specified data transfer.", xfr_status };
    g_commands["user"] = { "user [id]\n\nList all users, or view user associated with 'id'.", user };
    g_commands["acl"] = { "acl [get|set] id [[uid|gid|def] [grant|deny [inh]] value] ]\n\nSet or get ACLs for record 'id' (ID/alias)", acl };
    g_commands["gen-cred"] = { "gen-cred\n\nGenerate new user credentials (X509) for the local environment.", no_console };
    g_commands["gen-ssh"] = { "gen-ssh out-file\n\nGenerate new SSH keys for the local environment. The resulting public key is written to the specified output file and must be subsequently installed in the user's Globus ID account (see https://docs.globus.org/cli/legacy).", gen_ssh };
    g_commands["get-ssh"] = { "get-ssh out-file\n\nGet current SSH public key for the local environment. The public key is written to the specified output file.", get_ssh };

    string      host = "127.0.0.1";
    uint16_t    port = 5800;
    uint32_t    timeout = 5;
    string      home = getenv("HOME");
    string      cred_path = home + "/.sdms/";
    string      unit = "CCS";

    po::options_description opts_startup( "Program options" );
    po::options_description opts_hidden( "Hidden options" );
    po::options_description opts_all( "All options" );
    po::options_description opts_console( "Console options" );
    po::positional_options_description opts_pos;

    opts_startup.add_options()
        ("help,?", "Show help")
        ("version,v", "Show version number")
        ("cred-dir,c",po::value<string>( &cred_path ),"User credentials directory")
        ("host,h",po::value<string>( &host ),"Service hostname/IP")
        ("port,p",po::value<uint16_t>( &port ),"Service port")
        ("cfg",po::value<string>( &g_cfg_file ),"Use config file for options")
        ;

    g_opts_command.add_options()
        ("wait,w",po::bool_switch( &g_wait )->default_value(false),"Block until command completes")
        ("title,t",po::value<string>( &g_title ),"Specify title for create/update commands")
        ("desc,d",po::value<string>( &g_desc ),"Specify description for create/update commands")
        ("alias,a",po::value<string>( &g_alias ),"Specify alias for create/update commands")
        ("md,m",po::value<string>( &g_meta ),"Specify metadata (JSON format) for create/update commands")
        ("md-file,f",po::value<string>( &g_meta_file ),"Specify filename to read metadata from (JSON format) for create/update commands")
        ("md-replace,r",po::bool_switch( &g_meta_replace ),"Replace existing metadata instead of merging with existing fields")
        ("output-format,O",po::value<string>( &g_out_form_str ),"Output format (text,json,csv)")
        ;

    opts_hidden.add_options()
        ("cmd",po::value<string>( &g_cmd ),"Command to run")
        ("arg",po::value<vector<string>>( &g_args ),"Command argument(s)")
        ;

    opts_startup.add(g_opts_command);
    opts_all.add(opts_startup).add(opts_hidden);
    opts_console.add(g_opts_command).add(opts_hidden);

    opts_pos.add( "cmd", 1 );
    opts_pos.add( "arg", -1 );

    try
    {
        OptionResult res = processArgs( a_argc, (const char**)a_argv, opts_all, opts_pos );
        
        if ( res == OPTS_HELP )
        {
            cout << "SDMS CLI Client, ver. " << VERSION << "\n";
            cout << "Usage: sdms [options] command [args] [cmd options]\n";
            cout << "      \"help all\" to list all commands\n";
            cout << "      \"help [command]\" for command-specific help\n\n";
            cout << opts_startup << endl;

            return 1;
        }

        if ( res == OPTS_VERSION )
        {
            cout << VERSION << endl;
            return 1;
        }

        if ( res == OPTS_ERROR )
        {
            return 1;
        }

        bool load_cred = true;

        // Must process "gen-cred" command before client init
        if ( g_cmd == "gen-cred" )
        {
            if ( g_args.size() != 0 )
            {
                cout << "ERROR\n";
                cerr << "Invalid arguments for command '" << g_cmd << "'.\n    Usage: " << g_commands["gen-cred"].first << "\n\n";
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

        cmd_t::iterator icmd;

        if ( g_cmd.size() )
        {
            icmd = g_commands.find( g_cmd );
            if ( icmd != g_commands.end() )
            {
                int ec = icmd->second.second();
                if ( ec < 0 )
                {
                    cout << "ERROR\n";
                    cerr << "Invalid arguments for command '" << g_cmd << "'.\n    Usage: " << icmd->second.first << "\n\n";
                    return 1;
                }
                return ec;
            }
            else
            {
                cout << "ERROR\n";
                cerr << "Unknown command '" << g_cmd << "'\n";
                return 1;
            }
        }
        else
        {
            char * cmd_str;
            size_t len;
            SmartTokenizer<> tok;

            cout << "SDMS CLI Client, ver. " << VERSION << "\n";
            cout << "Console mode. Use Ctrl-C or type \"exit\" to terminate program.\n\n";

            while ( 1 )
            {
                cmd_str = readline(">");

                len = strlen( cmd_str );
                if ( !len )
                    continue;

                if ( strcmp( cmd_str, "exit" ) == 0 )
                    break;

                tok.parse( cmd_str, len );
                add_history( cmd_str );
                free( cmd_str );

                try
                {
                    //const char * foo = "sdms";
                    tok.tokens().insert( tok.tokens().begin(),  "sdms" );

                    if ( processArgs( tok.tokens().size(), &tok.tokens()[0], opts_console, opts_pos ) == OPTS_OK )
                    {
                        if ( g_cmd.size() )
                        {
                            cout << "cmd:["<<g_cmd<<"],args:";
                            for ( vector<string>::iterator a = g_args.begin(); a != g_args.end(); ++a )
                                cout << "["<<*a<<"]";
                            cout << "\n";

                            icmd = g_commands.find( g_cmd );
                            if ( icmd != g_commands.end() )
                            {
                                int ec = icmd->second.second();
                                if ( ec < 0 )
                                {
                                    cout << "Invalid arguments. Usage: " << icmd->second.first << "\n\n";
                                }
                            }
                            else
                            {
                                cout << "Unknown command\n";
                            }
                        }
                    }
                }
                catch( TraceException &e )
                {
                    cout << e.toString() << "\n";
                }
                catch( exception &e )
                {
                    cout << e.what() << "\n";
                }
            }
        }
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

