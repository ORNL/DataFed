#include <iostream>
#include <fstream>
#include <iomanip>
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

//typedef map<string,pair<string,int (*)()>> cmd_t;

typedef int (*cmd_func_t)();

struct CmdInfo
{
    CmdInfo( const char *  a_cmd_short, const char * a_cmd_long, const char * a_desc_short, const char * a_desc_long, cmd_func_t a_func ) :
        cmd_short(a_cmd_short), cmd_long(a_cmd_long), desc_short(a_desc_short), desc_long(a_desc_long), func(a_func)
    {}

    void help( bool a_full = false )
    {
        cout << cmd_long;
        if ( cmd_short.size() )
            cout << " (" << cmd_short << ")";
        cout << " - " << desc_short << "\n";

        if ( a_full )
            cout << desc_long << "\n";
    }

    string      cmd_short;
    string      cmd_long;
    string      desc_short;
    string      desc_long;
    cmd_func_t  func;
};

typedef vector<CmdInfo> cmd_list_t;
typedef map<string,CmdInfo*> cmd_map_t;

cmd_list_t  g_cmd_list;
cmd_map_t   g_cmd_map;

void addCommand( const char * a_cmd_short, const char * a_cmd_long, const char * a_desc_short, const char * a_desc_long, cmd_func_t a_func )
{
    g_cmd_list.push_back( CmdInfo( a_cmd_short, a_cmd_long, a_desc_short, a_desc_long, a_func ));
}

void buildCmdMap()
{
    for ( cmd_list_t::iterator c = g_cmd_list.begin(); c != g_cmd_list.end(); c++ )
    {
        if ( c->cmd_short.size() )
            g_cmd_map[c->cmd_short] = &(*c);
        if ( c->cmd_long.size() )
            g_cmd_map[c->cmd_long] = &(*c);
    }
}

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
                cout << "  Name   : " << user.name() << "\n";
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
                cout << "{\"uid\":\"" << user.uid() << "\",\"name\":\"" << user.name() << "\"";
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
                cout << "\"" << user.uid() << "\",\"" << user.name() << "\"\n";
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

void printData( spRecordDataReply a_rep, bool a_list = false )
{
    if ( a_rep->record_size() )
    {
        size_t pos;
        for ( int i = 0; i < a_rep->record_size(); i++ )
        {
            const RecordData & rec = a_rep->record(i);

            if ( a_list )
            {
                cout << left << setw(12) << rec.id();
                if ( rec.has_owner() )
                    cout << " " << left << setw(12) << rec.owner();

                if ( rec.has_alias() )
                {
                    pos = rec.alias().find_first_of(":");
                    if ( pos != string::npos )
                        cout << " " << left << setw(16) << rec.alias().substr( pos + 1 );
                }
                else
                    cout << " " << setw(16) << " ";

                cout << " \"" << rec.title() << "\"";
                cout << "\n";
            }
            else
            {
                cout << "   id : " << rec.id() << "\n";
                if ( rec.has_alias() )
                    cout << "alias : " << rec.alias() << "\n";
                cout << "title : " << rec.title() << "\n";
                if ( rec.has_desc() )
                    cout << " desc : " << rec.desc() << "\n";
                if ( rec.has_owner() )
                    cout << "owner : " << rec.owner() << "\n";
                if ( rec.has_metadata() )
                    cout << " meta : " << rec.metadata() << "\n";
            }
        }
    }
    else
        cout << "No results\n";
}

void printCollData( spCollDataReply a_reply, bool a_list = false )
{
    if ( a_reply->coll_size() )
    {
        size_t pos;
        for ( int i = 0; i < a_reply->coll_size(); i++ )
        {
            const CollData & data = a_reply->coll(i);

            if ( a_list )
            {
                cout << left << setw(12) << data.id();
                if ( data.has_owner() )
                    cout << " " << left << setw(12) << data.owner();

                if ( data.has_alias() )
                {
                    pos = data.alias().find_first_of(":");
                    if ( pos != string::npos )
                        cout << " " << left << setw(16) << data.alias().substr( pos + 1 );
                }
                else
                    cout << " " << setw(16) << " ";

                cout << " \"" << data.title() << "\"";
                cout << "\n";
            }
            else
            {
                cout << "  id    : " << data.id() << "\n";
                if ( data.has_alias() )
                    cout << "  alias : " << data.alias() << "\n";
                cout << "  title : " << data.title() << "\n";
                if ( data.has_owner() )
                    cout << "  owner : " << data.owner() << "\n";
                cout << "\n";
            }
        }
    }
    else
        cout << "No results\n";
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
            for ( cmd_list_t::iterator icmd = g_cmd_list.begin(); icmd != g_cmd_list.end(); ++icmd )
                icmd->help();

            cout << "\n";
        }
        else
        {
            cmd_map_t::iterator icmd = g_cmd_map.find( g_args[0] );
            if ( icmd == g_cmd_map.end() )
                cout << "Unknown command '" << g_args[0] << "'\n";
            else
                icmd->second->help( true );
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
    cout << rep->record_size() << " match(es) found:\n\n";
    printData( rep, true );

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

int data()
{
    if ( g_args[0] == "view" || g_args[0] == "v" )
    {
        if ( g_args.size() != 2 )
            return -1;

        spRecordDataReply rep = g_client->recordView( g_args[1] );
        printData( rep );
    }
    else if( g_args[0] == "list" || g_args[0] == "l" )
    {
        spRecordDataReply rep = g_client->recordList();
        printData( rep, true );
    }
    else if( g_args[0] == "create" || g_args[0] == "c" )
    {
        if ( g_args.size() != 1 )
            return -1;

        spRecordDataReply rep = createRecord();
        printData( rep );
    }
    else if( g_args[0] == "update" || g_args[0] == "u" )
    {
        if ( g_args.size() != 2 )
            return -1;

        spRecordDataReply rep = updateRecord( g_args[0] );
        printData( rep );
    }
    else if( g_args[0] == "delete" || g_args[0] == "d" )
    {
        cout << "NOT IMPLEMENTED YET\n";
    }
    else
        return -1;

    return 0;
}

int coll()
{
    if ( g_args[0] == "view" || g_args[0] == "v" )
    {
        if ( g_args.size() == 2 )
        {
            spCollDataReply rep = g_client->collView( g_args[1] );
            printCollData( rep );
        }
        else
            return -1;
    }
    else if( g_args[0] == "l" )
    {
        if ( g_args.size() == 1 )
        {
            spCollDataReply rep = g_client->collRead( "root" );
            printCollData( rep, true );
        }
        else if ( g_args.size() == 2 )
        {
            spCollDataReply rep = g_client->collRead( g_args[1] );
            printCollData( rep, true );
        }
        else
            return -1;
    }
    else if( g_args[0] == "create" || g_args[0] == "c" )
    {
        if ( g_args.size() != 1 )
            return -1;

        if ( !g_title.size() )
            EXCEPT_PARAM( 1, "Title option is required for create command" );

        spCollDataReply rep = g_client->collCreate( g_title, g_desc.size()?g_desc.c_str():0, g_alias.size()>2?g_alias.c_str():0 );
        printCollData( rep );
    }
    else if( g_args[0] == "update" || g_args[0] == "u" )
    {
        if ( g_args.size() != 2 )
            return -1;

        spCollDataReply rep = g_client->collUpdate( g_args[1], g_title.size()?g_title.c_str():0, g_desc.size()?g_desc.c_str():0, g_alias.size()>2?g_alias.c_str():0 );
        printCollData( rep );
    }
    else if( g_args[0] == "delete" || g_args[0] == "d" )
    {
        cout << "NOT IMPLEMENTED YET\n";
    }
    else if( g_args[0] == "add" || g_args[0] == "a" )
    {
        if ( g_args.size() != 3 )
            return -1;

        g_client->collAddItem( g_args[1], g_args[2] );
    }
    else if( g_args[0] == "remove" || g_args[0] == "r" )
    {
        if ( g_args.size() != 3 )
            return -1;

        g_client->collRemoveItem( g_args[1], g_args[2] );
    }
    else
        return -1;

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

/*
int gen_ssh()
{
    if ( g_args.size() != 1 )
        return -1;

    g_client->generateKeys( g_args[0] );
    cout << "SUCCESS\n";

    return 0;
}
*/

int get_ssh()
{
    if ( g_args.size() )
        return -1;

    cout << g_client->sshPublicKey() << "\n";

    return 0;
}

int setup()
{
    string key = g_client->setup();

//    g_client->generateCredentials();

//    cout << "SSH Public Key:\n" << g_client->generateKeys() << "\n\nThis key must be manually installed in your GlobusID account.\n";
    cout << "SSH Public Key:\n" << key << "\n\nThis key must be manually installed in your GlobusID account.\n";

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
    addCommand( "?", "help", "Show help", "Use 'help <cmd>' to show help for a specific command.", help );
    addCommand( "", "get", "Get data from repository", "get <id> <dest>\n\nTransfer raw data from repository and place in a specified destination directory. The <id> parameter may be either a data identifier or an alias. The <dest> parameter is the destination path including a globus end-point prefix (if no prefix is specified, the default local end-point will be used).", pull_data );
    addCommand( "", "put", "Put data into repository", "put <src> [id] [-t title] [-d desc] [-a alias] [-m metadata |-f meta-file]\n\nTransfer raw data from the specified <src> path to the repository. If the 'id' parameter is provided, the record with the associated identifier (or alias) will receive the data; otherwise a new data record will be created. Data record fields may be set or updated using the indicated options. For new records, the 'title' option is required. The source path may include a globus end-point prefix; however, if none is specified, the default local end-point will be used.", push_data );
    addCommand( "s", "status", "View data transfer status", "status <xfr_id>\n\nGet status of specified data transfer.", xfr_status );
    addCommand( "d", "data", "Data management", "data <cmd> [args]\n\nData commands: (l)ist, (v)iew, (c)reate, (u)pdate, (d)elete", data );
    addCommand( "c", "coll", "Collection management", "coll <cmd> [args]\n\nCollection commands: (l)ist, (v)iew, (c)reate, (u)pdate, (d)elete, (a)dd, (r)emove", coll );
    addCommand( "", "find", "Find data by metadata query", "find <query>\n\nReturns a list of all data records that match specified query (see documentation for query language description).", find_records );
    addCommand( "u", "user", "List or view user information", "user [id]\n\nLists all users if 'id' parameter is omitted; otherwise, view details of associated user.", user );
    addCommand( "a", "acl", "Manage ACLs for data or collections",  "acl [get|set] <id> [[uid|gid|def] [grant|deny [inh]] value] ]\n\nSet or get ACLs for record or collection <id> (as ID or alias)", acl );
    addCommand( "g", "group", "Group management (for ACLs)", "group <cmd> [id [args]]\n\nGroup commands: (l)ist, (v)iew, (c)reate, (u)pdate, (d)elete", group );
    addCommand( "", "setup", "Setup local environment","setup\n\nSetup the local environment.", setup );
    //addCommand( "", "gen-cred", "Generate local credentials","gen-cred\n\nGenerate new user credentials (X509) for the local environment.", no_console );
    //addCommand( "", "gen-ssh", "Generate globus SSH keys", "gen-ssh <out-file>\n\nGenerate new SSH keys for the local environment. The resulting public key is written to the specified output file and must be subsequently installed in the user's Globus ID account (see https://docs.globus.org/cli/legacy).", gen_ssh );
    addCommand( "", "get-ssh", "Retrieve globus public SSH key", "get-ssh <out-file>\n\nGet current SSH public key for the local environment. The public key is written to the specified output file.", get_ssh );

    buildCmdMap();

    string      host = "127.0.0.1";
    uint16_t    port = 5800;
    uint32_t    timeout = 5;
    string      home = getenv("HOME");
    string      cred_path = home + "/.sdms/";
    string      unit = "ccs";
    bool        manual_auth = false;

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
        ("login,l",po::bool_switch( &manual_auth )->default_value(false),"Manually login to SDMS")
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

/*
        bool load_cred = true;

        // Must process "gen-cred" command before client init
        if ( g_cmd == "gen-cred" )
        {
            if ( g_args.size() != 0 )
            {
                cout << "ERROR\n";
                cerr << "Invalid arguments for command '" << g_cmd << "'.\n";
                g_cmd_map["gen-cred"]->help( true );
                return 1;
            }

            load_cred = false;
        }
*/
        if ( !manual_auth && !Client::verifyCredentials( cred_path, unit ))
        {
            cout << "No client credentials found, manual authentication required\n";
            manual_auth = true;
        }

        Client client( host, port, timeout, cred_path, unit, !manual_auth );
        client.start();

        if ( manual_auth )
        {
            string uname;
            string password;

            cout << "SDMS user ID: ";
            cin >> uname;

            cout << "SDMS password: ";
            cin >> password;

            client.authenticate( uname, password );
        }

        g_client = &client;

        cmd_map_t::iterator icmd;

        if ( g_cmd.size() )
        {
            icmd = g_cmd_map.find( g_cmd );
            if ( icmd != g_cmd_map.end() )
            {
                int ec = icmd->second->func();
                if ( ec < 0 )
                {
                    cerr << "Invalid arguments.\n";
                    icmd->second->help( true );
                    cout << "\n";
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
                    tok.tokens().insert( tok.tokens().begin(),  "sdms" );

                    if ( processArgs( tok.tokens().size(), &tok.tokens()[0], opts_console, opts_pos ) == OPTS_OK )
                    {
                        if ( g_cmd.size() )
                        {
                            /*
                            cout << "cmd:["<<g_cmd<<"],args:";
                            for ( vector<string>::iterator a = g_args.begin(); a != g_args.end(); ++a )
                                cout << "["<<*a<<"]";
                            cout << "\n";
                            */

                            icmd = g_cmd_map.find( g_cmd );
                            if ( icmd != g_cmd_map.end() )
                            {
                                int ec = icmd->second->func();
                                if ( ec < 0 )
                                {
                                    cout << "Invalid arguments.\n";
                                    icmd->second->help( true );
                                    cout << "\n";
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

