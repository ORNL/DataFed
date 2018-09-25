#include <iostream>
#include <fstream>
#include <iomanip>
#include <vector>
#include <map>
#include <cstdlib>
#include <unistd.h>
#include <time.h>
#include <termios.h>
#include <boost/program_options.hpp>
#include <boost/tokenizer.hpp>
#include <boost/token_functions.hpp>
#include <readline/readline.h>
#include <readline/history.h>
#include "TraceException.hpp"
#include "SmartTokenizer.hpp"
#include "Util.hpp"
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

const char * ServerStatusText[] = { "NORMAL", "DEGRADED", "FAILED", "OFFLINE" };
const char * StatusText[] = { "INITIAL", "ACTIVE", "INACTIVE", "SUCCEEDED", "FAILED" };


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
string          g_name;
string          g_email;
string          g_globus_id;
bool            g_details;
string          g_cfg_file;
uint32_t        g_since;
uint32_t        g_from;
uint32_t        g_to;
int32_t         g_status;
string          g_cmd;
vector<string>  g_args;
bool            g_out_json;
bool            g_out_csv;
bool            g_out_text;
OutputFormat    g_out_form = TEXT;
string          g_cur_sel;
string          g_cur_col;
string          g_cur_alias_prefix;

po::options_description g_opts_command( "Command options" );


string resolveID( const string & a_id )
{
    if ( a_id.size() > 2 && a_id[1] == '/' )
        return a_id;

    if ( a_id.find_first_of( ":" ) != string::npos )
        return a_id;

    return g_cur_alias_prefix + a_id;
}

void printUsers( spUserDataReply a_reply )
{
    if ( g_out_form == JSON )
        cout << "{\"Users\":[";
    else if ( g_out_form == CSV )
        cout << "\"UserID\",\"Name\",\"Email\",\"Phone\",\"Admin\"\n";

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
                cout << "UserID   " << user.uid() << "\n";
                cout << "Name     " << user.name() << "\n";
                if ( user.has_email() )
                    cout << "Email    " << user.email() << "\n";
                if ( user.has_phone() )
                    cout << "Phone    " << user.phone() << "\n";
                if ( user.has_is_admin() )
                    cout << "Admin     " << user.is_admin() << "\n";
                //if ( user.has_is_repo_admin() )
                //    cout << "RepoAdmin " << user.is_repo_admin() << "\n";

                /*
                if ( user.ident_size() )
                {
                    cout << "  idents :\n";
                    for ( int j = 0; j < user.ident_size(); j++ )
                        cout << "    " << user.ident(j) << "\n";
                }*/

                break;
            case JSON:
                cout << "{\"UserID\":\"" << user.uid() << "\",\"Name\":\"" << user.name() << "\"";
                if ( user.has_email() )
                    cout << ",\"Email\":\"" << user.email() << "\"";
                if ( user.has_phone() )
                    cout << ",\"Phone\":\"" << user.phone() << "\"";
                if ( user.has_is_admin() )
                    cout << ",\"Admin\":" << (user.is_admin()?"true":"false");
                cout << "}";
                break;
            case CSV:
                cout << "\"" << user.uid() << "\",\"" << user.name() << "\""
                    << ",\"" << ( user.has_email()?user.email():"" ) << "\""
                    << ",\"" << ( user.has_phone()?user.phone():"" ) << "\""
                    << "," << ( user.has_is_admin()?user.is_admin():false ) << "\n";
                break;
            }

            if ( g_out_form == TEXT )
                cout << "\n";
        }
    }
    if ( g_out_form == JSON )
        cout << "]}\n";
}

void printProjects( spProjectDataReply a_reply )
{
    if ( g_out_form == JSON )
        cout << "{\"Projects\":[";
    else if ( g_out_form == CSV )
        cout << "\"ProjID\",\"Title\",\"Domain\",\"Desc\",\"Owner\",\"Created\",\"Updated\"\n";

    if ( a_reply->proj_size() )
    {
        time_t      t;
        struct tm*  pTM;

        for ( int i = 0; i < a_reply->proj_size(); i++ )
        {
            if ( g_out_form == JSON && i > 0 )
                cout << ",";

            const ProjectData & proj = a_reply->proj(i);
            switch ( g_out_form )
            {
            case TEXT:
                cout << "ProjID  " << proj.id() << "\n";
                cout << "Title   " << proj.title() << "\n";
                if ( proj.has_domain() )
                    cout << "Domain  " << proj.domain() << "\n";
                if ( proj.has_desc() )
                    cout << "Desc    " << proj.desc() << "\n";
                if ( proj.has_owner() )
                    cout << "Owner   " << proj.owner() << "\n";
                if ( proj.has_ct() )
                {
                    t = (time_t)proj.ct();
                    pTM = localtime(&t);
                    cout << "Created " << put_time(pTM, "%Y-%m-%d %H:%M:%S") << "\n";
                }
                if ( proj.has_ut() )
                {
                    t = (time_t)proj.ut();
                    pTM = localtime(&t);
                    cout << "Updated " << put_time(pTM, "%Y-%m-%d %H:%M:%S") << "\n";
                }
                break;
            case JSON:
                cout << "{\"ProjID\":\"" << proj.id() << "\",\"Title\":\"" << escapeJSON( proj.title() ) << "\"";
                if ( proj.has_domain() )
                    cout << ",\"Domain\":\"" << proj.domain() << "\"";
                if ( proj.has_desc() )
                    cout << ",\"Desc\":\"" << escapeJSON( proj.desc() ) << "\"";
                if ( proj.has_owner() )
                    cout << ",\"Owner\":\"" << proj.owner() << "\"";
                if ( proj.has_ct() )
                    cout << ",\"Created\":" << proj.ct();
                if ( proj.has_ut() )
                    cout << ",\"Updated\":" << proj.ut();
                cout << "}";
                break;
            case CSV:
                cout << "\"" << proj.id() << "\",\"" << escapeCSV( proj.title() ) << "\""
                    << ",\"" << ( proj.has_domain()?proj.domain():"" ) << "\""
                    << ",\"" << ( proj.has_desc()?escapeCSV( proj.desc() ):"" ) << "\""
                    << ",\"" << ( proj.has_owner()?proj.owner():"") << "\""
                    << ",\"" << ( proj.has_ct()?proj.ct():0) << "\""
                    << ",\"" << ( proj.has_ut()?proj.ut():0) << "\"\n";
                break;
            }

            if ( g_out_form == TEXT )
                cout << "\n";
        }
    }
    if ( g_out_form == JSON )
        cout << "]}\n";
}

#if 0
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
#endif

void printData( spRecordDataReply a_rep )
{
    if ( g_out_form == JSON )
        cout << "{\"Data\":[";
    else if ( g_out_form == CSV )
        cout << "\"DataID\",\"Alias\",\"Title\",\"Desc\",\"Owner\",\"Size\",\"Uploaded\",\"Created\",\"Updated\",\"Meta\"\n";

    if ( a_rep->data_size() )
    {
        time_t      t;
        struct tm*  pTM;

        for ( int i = 0; i < a_rep->data_size(); i++ )
        {
            const RecordData & rec = a_rep->data(i);

            if ( g_out_form == JSON && i > 0 )
                cout << ",";

            switch ( g_out_form )
            {
            case TEXT:
                cout << "DataID   " << rec.id() << "\n";
                if ( rec.has_alias() )
                    cout << "Alias    " << rec.alias() << "\n";
                cout << "Title    " << rec.title() << "\n";
                if ( rec.has_desc() )
                    cout << "Desc     " << rec.desc() << "\n";
                if ( rec.has_owner() )
                    cout << "Owner    " << rec.owner() << "\n";
                if ( rec.has_size() )
                    cout << "Size     " << rec.size() << "\n";
                if ( rec.has_dt() )
                {
                    t = (time_t)rec.dt();
                    pTM = localtime(&t);
                    cout << "Uploaded " << put_time(pTM, "%Y-%m-%d %H:%M:%S") << "\n";
                }
                if ( rec.has_ct() )
                {
                    t = (time_t)rec.ct();
                    pTM = localtime(&t);
                    cout << "Created  " << put_time(pTM, "%Y-%m-%d %H:%M:%S") << "\n";
                }
                if ( rec.has_ut() )
                {
                    t = (time_t)rec.ut();
                    pTM = localtime(&t);
                    cout << "Updated  " << put_time(pTM, "%Y-%m-%d %H:%M:%S") << "\n";
                }
                if ( rec.has_metadata() )
                    cout << "Meta     " << rec.metadata() << "\n";
                break;
            case CSV:
                cout << "\"" << rec.id() << "\""
                    << ",\"" << ( rec.has_alias()?rec.alias():"" ) << "\""
                    << ",\"" << escapeCSV( rec.title() ) << "\""
                    << ",\"" << ( rec.has_desc()?escapeCSV( rec.desc() ):"" ) << "\""
                    << ",\"" << ( rec.has_owner()?rec.owner():"" ) << "\""
                    << "," << ( rec.has_size()?rec.size():0 )
                    << "," << ( rec.has_dt()?rec.dt():0 )
                    << "," << ( rec.has_ct()?rec.ct():0 )
                    << "," << ( rec.has_ut()?rec.ut():0 )
                    << ",\"" << ( rec.has_metadata()?escapeCSV( rec.metadata() ):"" ) << "\"\n";
                break;
            case JSON:
                cout << "{\"DataID\":\"" << rec.id() << "\"";
                if ( rec.has_alias() )
                    cout << ",\"Alias\":\"" << rec.alias() << "\"";
                cout << ",\"Title\":\"" << escapeJSON( rec.title() ) << "\"";
                if ( rec.has_desc() )
                    cout << ",\"Desc\":\"" << escapeJSON( rec.desc() ) << "\"";
                if ( rec.has_owner() )
                    cout << ",\"Owner\":\"" << rec.owner() << "\"";
                if ( rec.has_size() )
                    cout << ",\"Size\":" << rec.size();
                if ( rec.has_dt() )
                    cout << ",\"Uploaded\":" << rec.dt();
                if ( rec.has_ct() )
                    cout << ",\"Created\":" << rec.ct();
                if ( rec.has_ut() )
                    cout << ",\"Updated\":" << rec.ut();
                if ( rec.has_metadata() )
                    cout << ",\"Meta\":" << rec.metadata();
                cout << "}";
                break;
            }
        }
    }

    if ( g_out_form == JSON )
        cout << "]}\n";
}

void printCollData( spCollDataReply a_reply )
{
    if ( g_out_form == JSON )
        cout << "{\"Collections\":[";
    else if ( g_out_form == CSV )
        cout << "\"CollID\",\"Alias\",\"Title\",\"Desc\",\"Owner\",\"Created\",\"Updated\"\n";

    if ( a_reply->coll_size() )
    {
        time_t      t;
        struct tm*  pTM;

        for ( int i = 0; i < a_reply->coll_size(); i++ )
        {
            const CollData & coll = a_reply->coll(i);

            switch ( g_out_form )
            {
            case TEXT:
                cout << "CollID  " << coll.id() << "\n";
                if ( coll.has_alias() )
                    cout << "Alias   " << coll.alias() << "\n";
                cout << "Title   " << coll.title() << "\n";
                if ( coll.has_desc() )
                    cout << "Desc    " << coll.desc() << "\n";
                if ( coll.has_owner() )
                    cout << "Owner   " << coll.owner() << "\n";
                if ( coll.has_ct() )
                {
                    t = (time_t)coll.ct();
                    pTM = localtime(&t);
                    cout << "Created " << put_time(pTM, "%Y-%m-%d %H:%M:%S") << "\n";
                }
                if ( coll.has_ut() )
                {
                    t = (time_t)coll.ut();
                    pTM = localtime(&t);
                    cout << "Updated " << put_time(pTM, "%Y-%m-%d %H:%M:%S") << "\n";
                }
                cout << "\n";
                break;
            case CSV:
                break;
            case JSON:
                cout << "{\"CollID\":\"" << coll.id() << "\"";
                if ( coll.has_alias() )
                    cout << ",\"Alias\":" << coll.alias() << "\"";
                cout << ",\"Title\"" << escapeJSON( coll.title() ) << "\"";
                if ( coll.has_desc() )
                    cout << ",\"Desc\":" << escapeJSON( coll.desc() ) << "\"";
                if ( coll.has_owner() )
                    cout << ",\"Owner\":" << coll.owner() << "\"";
                if ( coll.has_ct() )
                    cout << ",\"Created\":" << coll.ct();
                if ( coll.has_ut() )
                    cout << ",\"Updated\":" << coll.ut();
                cout << "\n";
                break;
            }
        }
    }
}

void printListing( spListingReply a_reply )
{
    if ( a_reply->item_size() )
    {
        size_t pos;
        for ( int i = 0; i < a_reply->item_size(); i++ )
        {
            const ListingData & item = a_reply->item(i);

            cout << left << setw(12) << item.id();

            if ( item.has_alias() )
            {
                pos = item.alias().find_last_of(":");
                if ( pos != string::npos )
                    cout << " " << left << setw(16) << item.alias().substr( pos + 1 );
            }
            else
                cout << " " << setw(16) << " ";

            cout << " \"" << item.title() << "\"";
            cout << "\n";
        }
    }
    else
        cout << "\n";
}

#if 0
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
            if ( rule.has_inhgrant() )
                cout << "  Grant(i) : " << rule.inhgrant() << "\n";
            if ( rule.has_inhdeny() )
                cout << "  Deny(i)  : " << rule.inhdeny() << "\n";
            cout << "\n";
        }
    }
    else
        cout << "  No ACLs set\n";
}
#endif

void printXfrData( spXfrDataReply a_reply )
{
    if ( a_reply->xfr_size() )
    {
        time_t t;

        if ( g_out_form == JSON )
            cout << "{\"transfers\":[";
        else if ( g_out_form == CSV )
            cout << "\"TransID\",\"DataID\",\"Mode\",\"Status\",\"Error\",\"Path\",\"StatusTS\"\n";

        struct tm* gmt_time;

        for ( int i = 0; i < a_reply->xfr_size(); i++ )
        {
            if ( g_out_form == JSON && i > 0 )
                cout << ",";

            const XfrData & xfr = a_reply->xfr(i);
            switch( g_out_form )
            {
            case TEXT:
                cout << "TransID   " << xfr.id() << "\n";
                cout << "DataID    " << xfr.data_id() << "\n";
                cout << "Mode      " << (xfr.mode()==XM_GET?"GET":"PUT") << "\n";
                cout << "Status    " << StatusText[xfr.status()] << "\n";
                if ( xfr.has_err_msg() )
                    cout << "Error     " << xfr.err_msg() << "\n";
                cout << "Path      " << xfr.local_path() << "\n";
                t = (time_t)xfr.updated();
                gmt_time = localtime(&t);
                cout << "StatusTS  " << put_time(gmt_time, "%Y-%m-%d %H:%M:%S") << "\n";
                cout << "\n";
                break;
            case CSV:
                cout << "\"" << xfr.id() << "\",";
                cout << "\"" << xfr.data_id() << "\",";
                cout << "\"" << (xfr.mode()==XM_GET?"GET":"PUT") << "\",";
                cout << "\"" << StatusText[xfr.status()] << "\",";
                cout << "\"" << (xfr.has_err_msg()?xfr.err_msg():"") << "\",";
                cout << "\"" << xfr.local_path() << "\",";
                cout << xfr.updated() << "\n";
                break;
            case JSON:
                cout << "{\"TransID\":\"" << xfr.id() << "\",";
                cout << "\"DataID\":\"" << xfr.data_id() << "\",";
                cout << "\"Mode\":\"" << (xfr.mode()==XM_GET?"GET":"PUT") << "\",";
                cout << "\"Status\":\"" << StatusText[xfr.status()] << "\",";
                if ( xfr.has_err_msg() )
                    cout << "\"Error\":\"" << xfr.err_msg() << "\",";
                cout << "\"Path\":\"" << xfr.local_path() << "\",";
                cout << "\"StatusTS\":" << xfr.updated() << "}";
                break;
            }
        }

        if ( g_out_form == JSON )
        {
            cout << "]}\n";
        }
    }
    else
    {
        switch( g_out_form )
        {
        case TEXT:
            cout << "No matching transfers\n";
            break;
        case CSV:
            cout << "\"No matching transfers\"\n";
            break;
        case JSON:
            cout << "{\"transfers\":[]}";
            break;
        }
    }
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

int ping()
{
    ServiceStatus stat = g_client->status();
    switch ( g_out_form )
    {
    case TEXT:
        cout << ServerStatusText[stat] << "\n";
        break;
    case CSV:
        cout << "\"" << ServerStatusText[stat] << "\"\n";
        break;
    case JSON:
        cout << "{\"status\":\"" << ServerStatusText[stat] << "\"}\n";
        break;
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

        return g_client->recordCreate( g_title, g_desc.size()?g_desc.c_str():0, g_alias.size()?g_alias.c_str():0, metadata.c_str(), g_cur_col.c_str() );
    }
    else
    {
        return g_client->recordCreate( g_title, g_desc.size()?g_desc.c_str():0, g_alias.size()>2?g_alias.c_str():0, g_meta.size()?g_meta.c_str():0, g_cur_col.c_str() );
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

    spListingReply rep = g_client->recordFind( query );
    cout << rep->item_size() << " match(es) found:\n\n";
    //printData( rep, true );

    return 0;
}


int get_data()
{
    if ( g_args.size() != 2 )
        return -1;

    int stat = 0;

    spXfrDataReply xfrs = g_client->dataGet( g_args[0], g_args[1] );

    if ( g_wait )
    {
        string xfr_id = xfrs->xfr(0).id();
        XfrStatus status = xfrs->xfr(0).status();
        while ( status < 3 )
        {
            sleep( 5 );
            xfrs = g_client->xfrView( xfr_id );
            status = xfrs->xfr(0).status();
        }

        if ( status != 3 )
            stat = 1;
    }

    const XfrData & xfr = xfrs->xfr(0);

    switch ( g_out_form )
    {
    case TEXT:
        cout << "TransID  " << xfr.id() << "\nStatus   " << StatusText[xfr.status()] << "\nPath     " << xfr.local_path() << "\n";
        break;
    case CSV:
        cout << "\"TransID\",\"Status\",\"Path\"\n";
        cout << "\"" << xfr.id() << "\",\"" << StatusText[xfr.status()] << "\",\"" << xfr.local_path() << "\"\n";
        break;
    case JSON:
        cout << "{\"TransID\":\"" << xfr.id() << "\",\"Status\":\"" << StatusText[xfr.status()] << "\",\"Path\":\"" << xfr.local_path() << "\"}\n";
        break;
    }

    return stat;
}


int put_data()
{
    string data_id;

    if ( g_args.size() == 1 )
    {
        // Create new record based on options
        spRecordDataReply rep = createRecord();
        data_id = rep->data(0).id();
    }
    else if ( g_args.size() == 2 )
    {
        // Update existing record if options are provided
        data_id = g_args[0];
        spRecordDataReply rep = updateRecord( data_id );
    }
    else
        return -1;

    int stat = 0;

    // Push data to record

    spXfrDataReply xfrs = g_client->dataPut( data_id, *g_args.rbegin() );

    if ( g_wait )
    {
        string xfr_id = xfrs->xfr(0).id();
        XfrStatus status = xfrs->xfr(0).status();
        while ( status < 3 )
        {
            sleep( 5 );
            xfrs = g_client->xfrView( xfr_id );
            status = xfrs->xfr(0).status();
        }

        if ( status != 3 )
            stat = 1;
    }

    const XfrData & xfr = xfrs->xfr(0);

    switch ( g_out_form )
    {
    case TEXT:
        cout << "TransID  " << xfr.id() << "\nStatus   " << StatusText[xfr.status()] << "\nPath     " << xfr.local_path() << "\n";
        break;
    case CSV:
        cout << "\"TransID\",\"Status\",\"Path\"\n";
        cout << "\"" << xfr.id() << "\",\"" << StatusText[xfr.status()] << "\",\"" << xfr.local_path() << "\"\n";
        break;
    case JSON:
        cout << "{\"TransID\":\"" << xfr.id() << "\",\"Status\":\"" << StatusText[xfr.status()] << "\",\"Path\":\"" << xfr.local_path() << "\"}\n";
        break;
    }

    return stat;

}

int data()
{
    if ( g_args[0] == "view" || g_args[0] == "v" )
    {
        if ( g_args.size() != 2 )
            return -1;

        spRecordDataReply rep = g_client->recordView( resolveID( g_args[1] ));
        printData( rep );
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

        spRecordDataReply rep = updateRecord( resolveID( g_args[1] ));
        printData( rep );
    }
    else if( g_args[0] == "clear" || g_args[0] == "r" )
    {
        if ( g_args.size() != 2 )
            return -1;

        g_client->dataDelete( g_args[1] );
        cout << "SUCCESS\n";
    }
    else if( g_args[0] == "delete" || g_args[0] == "d" )
    {
        if ( g_args.size() != 2 )
            return -1;

        g_client->recordDelete( resolveID( g_args[1] ));
        cout << "SUCCESS\n";
    }
    else
        return -1;

    return 0;
}

int coll()
{
    if ( g_args[0] == "view" || g_args[0] == "v" )
    {
        if ( g_args.size() == 1 )
        {
            spCollDataReply rep = g_client->collView( g_cur_col );
            printCollData( rep );
        }
        else if ( g_args.size() == 2 )
        {
            spCollDataReply rep = g_client->collView( resolveID( g_args[1] ));
            printCollData( rep );
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

        spCollDataReply rep = g_client->collCreate( g_title, g_desc.size()?g_desc.c_str():0, g_alias.size()>2?g_alias.c_str():0, g_cur_col.c_str() );
        printCollData( rep );
    }
    else if( g_args[0] == "update" || g_args[0] == "u" )
    {
        if ( g_args.size() != 2 )
            return -1;

        spCollDataReply rep = g_client->collUpdate( resolveID( g_args[1] ), g_title.size()?g_title.c_str():0, g_desc.size()?g_desc.c_str():0, g_alias.size()>2?g_alias.c_str():0 );
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


int xfr_list()
{
    if ( g_args.size() == 0 )
    {
        uint32_t since = 6*3600;

        if ( g_from || g_to )
            since = 0;
        else if ( g_since )
            since = g_since;

        XfrStatus status = XS_INIT;

        if ( g_status >= 0 && g_status <= XS_FAILED )
            status = (XfrStatus)g_status;
        else
            g_status = -1;

        spXfrDataReply xfr = g_client->xfrList( since?&since:0, g_from?&g_from:0, g_to?&g_to:0, g_status >= 0?&status:0 );
        printXfrData( xfr );
    }
    else if ( g_args.size() == 1 )
    {
        spXfrDataReply xfr = g_client->xfrView( g_args[0] );
        printXfrData( xfr );
    }
    else
        return -1;

    return 0;
}

int xfr_status()
{
    if ( g_args.size() == 1 )
    {
        spXfrDataReply xfr = g_client->xfrView( g_args[0] );

        if ( xfr->xfr_size() )
        {
            switch( g_out_form )
            {
            case TEXT:
                cout << StatusText[xfr->xfr(0).status()] << "\n";
                break;
            case CSV:
                cout << "\"" << StatusText[xfr->xfr(0).status()] << "\"\n";
                break;
            case JSON:
                cout << "{\"status\":\"" << StatusText[xfr->xfr(0).status()] << "\"}\n";
                break;
            }
        }

        return 0;
    }
    else
        return -1;
}

int user()
{
    if ( g_args.size() != 1 )
        return -1;

    spUserDataReply rep;

    if ( g_args[0] == "collab" || g_args[0] == "c" )
        rep = g_client->userListCollaborators( g_details );
    else if ( g_args[0] == "shared" || g_args[0] == "s" )
        rep = g_client->userListShared( g_details );
    else
        rep = g_client->userView( g_args[0], g_details );

    printUsers( rep );

    return 0;
}


int project()
{
    if ( g_args.size() != 1 )
        return -1;

    spProjectDataReply rep;

    if ( g_args[0] == "my" || g_args[0] == "m" )
        rep = g_client->projectListMine();
    else if ( g_args[0] == "team" || g_args[0] == "t" )
        rep = g_client->projectListTeam();
    else if ( g_args[0] == "shared" || g_args[0] == "s" )
        rep = g_client->projectListShared();
    else
        rep = g_client->projectView( g_args[0] );

    printProjects( rep );

    return 0;
}

#if 0
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

            rule += "inh" + g_args[3] + "\":\"" + g_args[5] + "\"}]";
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
#endif

int setup()
{
    g_client->setup();
    cout << "SUCCESS\n";

    return 0;
}

int select()
{
    if ( g_args.size() == 1 )
    {
        string new_sel = g_args[0];

        if ( new_sel.compare( 0, 2, "p/" ) == 0 )
        {
            spProjectDataReply rep = g_client->projectView( new_sel );
            cout << "Switched to project: " << new_sel << "\n";
            if ( g_details )
            {
                cout << "\n";
                printProjects( rep );
            }

            g_cur_sel = new_sel;
            g_cur_col = "c/p_" + g_cur_sel.substr(2) + "_root";
            g_cur_alias_prefix = "p:" + g_cur_sel.substr(2) + ":";
        }
        else
        {
            if ( new_sel.compare( 0, 2, "u/" ) != 0 )
                new_sel = "u/" + new_sel;

            spUserDataReply rep = g_client->userView( new_sel, false );

            cout << "Switched to user: " << new_sel << "\n";
            if ( g_details )
            {
                cout << "\n";
                printUsers( rep );
            }

            g_cur_sel = new_sel;
            g_cur_col = "c/u_" + g_cur_sel.substr(2) + "_root";
            g_cur_alias_prefix = "u:" + g_cur_sel.substr(2) + ":";
        }
    }
    else if ( g_args.size() == 0 )
    {
        cout << "Current selection: " << g_cur_sel << "\n";
        if ( g_details )
        {
            cout << "\n";

            if ( g_cur_sel.compare( 0, 2, "p/" ) == 0 )
            {
                spProjectDataReply rep = g_client->projectView( g_cur_sel );
                printProjects( rep );
            }
            else
            {
                spUserDataReply rep = g_client->userView( g_cur_sel, false );
                printUsers( rep );
            }
        }
    }
    else
        return -1;

    return 0;
}

int pwd()
{
    spCollDataReply rep = g_client->collGetParents( g_cur_col, true );
    size_t pos;

    for ( int i = rep->coll_size() - 2; i >= 0 ; i-- )
    {
        if ( rep->coll(i).has_alias() )
        {
            pos = rep->coll(i).alias().find_last_of(":");
            cout << "/" << rep->coll(i).alias().substr( pos + 1 );;
        }
        else
            cout << "/[" << rep->coll(i).id() << "]";
    }

    if ( rep->coll_size() > 0 )
    {
        rep = g_client->collView( g_cur_col );
        if ( rep->coll_size() )
        {
            if ( rep->coll(0).has_alias() )
            {
                pos = rep->coll(0).alias().find_last_of(":");
                cout << "/" << rep->coll(0).alias().substr( pos + 1 );;
            }
            else
                cout << "/[" << rep->coll(0).id() << "]";
        }
    }
    else
        cout << "/";

    cout << "\n";

    return 0;
}

int cd()
{
    if ( g_args.size() == 0 || ( g_args.size() == 1 && g_args[0] == "/" ))
    {
        if ( g_cur_sel[0] == 'p' )
            g_cur_col = "c/p_" + g_cur_sel.substr(2) + "_root";
        else
            g_cur_col = "c/u_" + g_cur_sel.substr(2) + "_root";
    }
    else if ( g_args.size() == 1 )
    {
        spCollDataReply rep;
        if ( g_args[0] == ".." )
        {
            rep = g_client->collGetParents( g_cur_col );
            if ( rep->coll_size() )
                g_cur_col = rep->coll(0).id();
        }
        else
        {
            rep = g_client->collView( resolveID( g_args[0] ));
            g_cur_col = rep->coll(0).id();

            if ( rep->coll(0).owner() != g_cur_sel )
            {
                g_cur_sel = rep->coll(0).owner();
                g_cur_alias_prefix = "u:" + g_cur_sel.substr(2) + ":";
                cout << "Switched to " << ( g_cur_sel[0] == 'u'?"user":"project" ) << ": " << g_cur_sel  << "\n";
            }
        }
    }
    else
        return -1;

    return 0;
}

int ls()
{
    spListingReply rep;

    if ( g_args.size() == 0 )
    {
        rep = g_client->collRead( g_cur_col );
        printListing( rep );
    }
    else if ( g_args.size() == 1 )
    {
        string id;
        if ( g_args[0] == "/" )
        {
            if ( g_cur_sel[0] == 'p' )
                id = "c/p_" + g_cur_sel.substr(2) + "_root";
            else
                id = "c/u_" + g_cur_sel.substr(2) + "_root";
        }
        else if ( g_args[0] == ".." )
        {
            spCollDataReply rep2 = g_client->collGetParents( g_cur_col );
            if ( rep2->coll_size() )
                id = rep2->coll(0).id();
            else
            {
                cout << "Already at root\n";
                return 1;
            }
        }
        else
            id = resolveID( g_args[0] );

        rep = g_client->collRead( id );
        printListing( rep );
    }
    else
        return -1;


    return 0;
}

enum OptionResult
{
    OPTS_OK,
    OPTS_HELP,
    OPTS_VERSION,
    OPTS_ERROR
};

OptionResult processArgs( int a_argc, const char ** a_argv, po::options_description & a_opts_desc, po::positional_options_description & a_opts_pos, bool a_throw = true )
{
    g_wait = false;
    g_title.clear();
    g_desc.clear();
    g_alias.clear();
    g_meta.clear();
    g_meta_file.clear();
    g_meta_replace = false;
    g_name.clear();
    g_email.clear();
    g_globus_id.clear();
    g_details = false;
    g_since = 0;
    g_from = 0;
    g_to = 0;
    g_status = -1;
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

        if ( g_out_json  )
            g_out_form = JSON;
        else if ( g_out_csv )
            g_out_form = CSV;
        else if ( g_out_text )
            g_out_form = TEXT;
    }
    catch( po::unknown_option & e )
    {
        if ( a_throw )
            throw e;

        cerr << "ERROR " << e.what() << "\n";
        return OPTS_ERROR;
    }

    return OPTS_OK;
}


int main( int a_argc, char ** a_argv )
{
    addCommand( "?", "help", "Show help", "Use 'help <cmd>' to show help for a specific command.", help );
    addCommand( "", "get", "Get data from repository", "get <id> <dest>\n\nTransfer raw data from repository and place in a specified destination directory. The <id> parameter may be either a data identifier or an alias. The <dest> parameter is the destination path including a globus end-point prefix (if no prefix is specified, the default local end-point will be used).", get_data );
    addCommand( "", "put", "Put data into repository", "put [id] <src> [-t title] [-d desc] [-a alias] [-m metadata |-f meta-file]\n\nTransfer raw data from the specified <src> path to the repository. If the 'id' parameter is provided, the record with the associated identifier (or alias) will receive the data; otherwise a new data record will be created. Data record fields may be set or updated using the indicated options. For new records, the 'title' option is required. The source path may include a globus end-point prefix; however, if none is specified, the default local end-point will be used.", put_data );
    addCommand( "t", "trans", "List data transfers with details", "trans [id]\n\nList details of specified or matching data transfers. Use --since, --from, --to, and --status for match criteria.", xfr_list );
    addCommand( "s", "status", "Get data transfer status", "status <id>\n\nGet status of data transfer specified by <id> parameter.", xfr_status );
    addCommand( "d", "data", "Data management", "data <cmd> [args]\n\nData commands: (v)iew, (c)reate, (u)pdate, clea(r), (d)elete", data );
    addCommand( "c", "coll", "Collection management", "coll <cmd> [args]\n\nCollection commands: (v)iew, (c)reate, (u)pdate, (d)elete, (a)dd, (r)emove", coll );
    addCommand( "", "find", "Find data by metadata query", "find <query>\n\nReturns a list of all data records that match specified query (see documentation for query language description).", find_records );
    addCommand( "u", "user", "List/view users by affiliation", "user <cmd/id>\n\nList users by (c)ollaborators or (s)hared access, or view user information if an ID is given.", user );
    addCommand( "p", "project", "List/view projects by affiliation", "project <cmd> [id]\n\nList (m)y projects, (t)eam projects, or projects with (s)hared access, or view project information if an ID is given.", project );

    //addCommand( "a", "acl", "Manage ACLs for data or collections",  "acl [get|set] <id> [[uid|gid|def] [grant|deny [inh]] value] ]\n\nSet or get ACLs for record or collection <id> (as ID or alias)", acl );
    //addCommand( "g", "group", "Group management (for ACLs)", "group <cmd> [id [args]]\n\nGroup commands: (l)ist, (v)iew, (c)reate, (u)pdate, (d)elete", group );
    addCommand( "", "sel", "Select user or project","sel [<id>]\n\nSelect the specified user or project for collection navigation. If no id is provided, prints the current user or project.", select );
    addCommand( "", "pwd", "Print working \"directory\" (collection)","pwd\n\nPrint current working \"directory\" (collection) and parent hierarchy.", pwd );
    addCommand( "", "cd", "Change \"directory\" (collection)","cd <id/cmd>\n\nChange current \"directory\" (collection). The 'id/cmd' argument can be a collection ID or alias, '/' for the root collection, or '..' to move up one collection.", cd );
    addCommand( "", "ls", "List current collection","ls [<id/cmd>]>\n\nList contents of current working collection or specified location. The 'id/cmd' argument can be a collection ID or alias, '/' for the root collection, or '..' for the parent of the current working collection.", ls );
    addCommand( "", "setup", "Setup local environment","setup\n\nSetup the local environment.", setup );
    addCommand( "", "ping", "Ping core server","ping\n\nPing core server to test communication.", ping );

    buildCmdMap();

    string      host = "sdms.ornl.gov";
    uint16_t    port = 7512;
    uint32_t    timeout = 10000;
    const char* home = getenv("HOME");
    string      cred_path = string(home?home:"") + "/.sdms/";
    bool        manual_auth = false;
    const char* def_ep = getenv("SDMS_CLI_DEFEP");
    bool        non_interact = false;

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
        ("text,T",po::bool_switch( &g_out_text ),"Output in TEXT format (default)")
        ("json,J",po::bool_switch( &g_out_json ),"Output in JSON format (default is TEXT)")
        ("csv,C",po::bool_switch( &g_out_csv ),"Output in CSV format (default is TEXT)")
        //("name,n",po::value<string>( &g_name ),"Specify user name for update command")
        //("email,e",po::value<string>( &g_email ),"Specify user email for update command")
        //("globus_id,g",po::value<string>( &g_globus_id ),"Specify user globus_id for update command")
        ("details,D",po::bool_switch( &g_details ),"Retrieve extra details for supported commands")
        ("since",po::value<uint32_t>( &g_since ),"Specify time since 'now' in seconds")
        ("from",po::value<uint32_t>( &g_from ),"Specify absolute 'from' time")
        ("to",po::value<uint32_t>( &g_to ),"Specify absolute 'to' time")
        ("status",po::value<int32_t>( &g_status ),"Specify transfer status")
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

        if ( g_cmd.size() )
            non_interact = true;

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

        if ( manual_auth && non_interact )
            EXCEPT( 0, "Manual authentication required" );

        if ( !manual_auth && !Client::verifyCredentials( cred_path ))
        {
            if ( non_interact )
                EXCEPT( 0, "Manual authentication required" );

            cerr << "No client credentials found, manual authentication required.\n";
            manual_auth = true;
        }

        Client client( host, port, timeout, cred_path, !manual_auth );
        string uid = client.start();
        if ( def_ep )
            client.setDefaultEndpoint( def_ep );

        if ( manual_auth || !uid.size() )
        {
            if ( !manual_auth )
                cerr << "Client credentials are invalid, manual authentication required.\n";

            string uname;
            string password;

            cout << "SDMS user ID: ";
            cin >> uname;

            cout << "SDMS password: ";

            termios oldt;
            tcgetattr(STDIN_FILENO, &oldt);
            termios newt = oldt;
            newt.c_lflag &= ~ECHO;
            tcsetattr(STDIN_FILENO, TCSANOW, &newt);
            cin >> password;
            tcsetattr(STDIN_FILENO, TCSANOW, &oldt);

            client.authenticate( uname, password );
            g_cur_sel = uname;
            if ( g_cur_sel.compare( 0, 2, "u/" ) != 0 )
                g_cur_sel = "u/" + g_cur_sel;
        }
        else if ( !non_interact )
        {
            cout << "Authenticated as " << uid << "\n";
            g_cur_sel = uid;
        }


        g_cur_col = "c/u_" + g_cur_sel.substr(2) + "_root";
        g_cur_alias_prefix = "u:" + g_cur_sel.substr(2) + ":";

        g_client = &client;

        cmd_map_t::iterator icmd;

        if ( g_cmd.size() )
        {
            icmd = g_cmd_map.find( g_cmd );
            if ( icmd != g_cmd_map.end() )
            {
                int ec = icmd->second->func();
                if ( ec < 0 )
                    EXCEPT_PARAM( 0, "Invalid arguments to command " << g_cmd );

                return ec;
            }
            else
            {
                EXCEPT_PARAM( 0, "unknown command " << g_cmd );
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

                    if ( processArgs( tok.tokens().size(), &tok.tokens()[0], opts_console, opts_pos, false ) == OPTS_OK )
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
        cerr << "ERROR " << e.toString() << "\n";
        return 1;
    }
    catch( exception &e )
    {
        cerr << "ERROR " << e.what() << "\n";
        return 1;
    }

    return 0;
}

