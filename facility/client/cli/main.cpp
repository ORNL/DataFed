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
            cout << "\n  Usage: " << cmd_long << " " << desc_long << "\n";
    }

    string              cmd_short;
    string              cmd_long;
    string              desc_short;
    string              desc_long;
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
string          g_keyw;
string          g_topic;
string          g_parent;
string          g_meta;
string          g_meta_file;
bool            g_meta_replace;
string          g_repo;
vector<string>  g_dep_add;
vector<string>  g_dep_rem;
bool            g_dep_clear;
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
string          g_select;
string          g_cur_xfr;
vector<string>  g_id_index;

po::options_description g_opts_command( "Command options" );

void updateIdIndex( spListingReply a_listing  )
{
    g_id_index.clear();

    for ( int i = 0; i < a_listing->item_size(); i++ )
    {
        g_id_index.push_back( a_listing->item(i).id() );
    }
}

string resolveIndexValue( const string & a_id )
{
    if ( a_id.size() == 1 || a_id.size() > 3 || a_id.back() != '.' )
        return a_id;

    unsigned int i;

    for ( i = 0; i < a_id.size() - 1; i++ )
    {
        if ( !isdigit( a_id[i] ) )
            return a_id;
    }

    if ( g_id_index.size() == 0 )
        EXCEPT( 1, "No listing data for index lookup." );

    i = strtoul( a_id.c_str(), NULL, 10 );
    if ( i == 0 || i > g_id_index.size() )
        EXCEPT( 1, "Index value out of range." );

    return g_id_index[i - 1];
}

string resolveID( const string & a_id )
{
    string id = resolveIndexValue( a_id );

    if ( id.size() > 2 && id[1] == '/' )
        return id;

    if ( id.find_first_of( ":" ) != string::npos )
        return id;

    return g_cur_alias_prefix + id;
}

string resolveCollID( const string & a_id, bool & a_final )
{
    a_final = false;

    string id = resolveIndexValue( a_id );

    if ( id == "." )
    {
        a_final = true;
        return g_cur_col;
    }
    else if ( id == "/" )
    {
        a_final = true;
        if ( g_cur_sel[0] == 'p' )
            return "c/p_" + g_cur_sel.substr(2) + "_root";
        else
            return "c/u_" + g_cur_sel.substr(2) + "_root";
    }
    else if ( id == ".." )
    {
        spCollDataReply rep = g_client->collGetParents( g_cur_col );
        if ( rep->coll_size() )
        {
            a_final = true;
            return rep->coll(0).id();
        }
        else
            EXCEPT( 1, "Already at root" );
    }
    else if ( id.size() > 2 && id[1] == '/' )
        return id;
    else if ( id.find_first_of( ":" ) != string::npos )
        return id;
    else
        return g_cur_alias_prefix + id;
}

void printSuccess()
{
    switch( g_out_form )
    {
    case TEXT:
        cerr << "SUCCESS\n";
        break;
    case CSV:
        cerr << "\"SUCCESS\"\n";
        break;
    case JSON:
        cerr << "{\"status\":\"SUCCESS\"}\n";
        break;
    }
}

void printError( const std::string & a_msg )
{
    switch( g_out_form )
    {
    case TEXT:
        cerr << "ERROR " << a_msg << "\n";
        break;
    case CSV:
        cerr << "\"ERROR\",\"" << escapeCSV( a_msg ) << "\"\n";
        break;
    case JSON:
        cerr << "{\"status\":\"ERROR\",\"message\":\"" << escapeJSON( a_msg ) << "\"}\n";
        break;
    }
}

void printUsers( spUserDataReply a_reply )
{
    if ( g_out_form == JSON )
    {
        cout << g_client->messageToJSON( a_reply.get() ) << "\n";
        return;
    }

    if ( g_out_form == CSV )
        cout << "\"UserID\",\"Name\",\"Email\",\"Admin\"\n";

    if ( a_reply->user_size() )
    {
        for ( int i = 0; i < a_reply->user_size(); i++ )
        {
            const UserData & user = a_reply->user(i);
            if ( g_out_form == TEXT )
            {
                cout << "UserID   " << user.uid() << "\n";
                cout << "Name     " << user.name() << "\n";
                if ( user.has_email() )
                    cout << "Email    " << user.email() << "\n";
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
                cout << "\n";
            }
            else
            {
                cout << "\"" << user.uid() << "\",\"" << user.name() << "\""
                    << ",\"" << ( user.has_email()?user.email():"" ) << "\""
                    << "," << ( user.has_is_admin()?user.is_admin():false ) << "\n";
            }
        }
    }
}

void printProjects( spProjectDataReply a_reply )
{
    if ( g_out_form == JSON )
    {
        cout << g_client->messageToJSON( a_reply.get() ) << "\n";
        return;
    }

    if ( g_out_form == CSV )
        cout << "\"ProjID\",\"Title\",\"Desc\",\"Owner\",\"Created\",\"Updated\"\n";

    if ( a_reply->proj_size() )
    {
        time_t      t;
        struct tm*  pTM;

        for ( int i = 0; i < a_reply->proj_size(); i++ )
        {
            const ProjectData & proj = a_reply->proj(i);
            if ( g_out_form == TEXT )
            {
                cout << "ProjID  " << proj.id() << "\n";
                cout << "Title   " << proj.title() << "\n";
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
                cout << "\n";
            }
            else
            {
                cout << "\"" << proj.id() << "\",\"" << escapeCSV( proj.title() ) << "\""
                    << ",\"" << ( proj.has_desc()?escapeCSV( proj.desc() ):"" ) << "\""
                    << ",\"" << ( proj.has_owner()?proj.owner():"") << "\""
                    << ",\"" << ( proj.has_ct()?proj.ct():0) << "\""
                    << ",\"" << ( proj.has_ut()?proj.ut():0) << "\"\n";
            }
        }
    }
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
    {
        cout << g_client->messageToJSON( a_rep.get() ) << "\n";
        return;
    }

    if ( g_out_form == CSV )
        cout << "\"DataID\",\"Alias\",\"Title\",\"Desc\",\"Topic\",\"Keywords\",\"Owner\",\"Locked\",\"Size\",\"Repo\",\"Parent\",\"Uploaded\",\"Created\",\"Updated\",\"Meta\"\n";

    if ( a_rep->data_size() )
    {
        time_t      t;
        struct tm*  pTM;

        for ( int i = 0; i < a_rep->data_size(); i++ )
        {
            const RecordData & rec = a_rep->data(i);

            if ( g_out_form == TEXT )
            {
                cout << "DataID   " << rec.id();
                if ( rec.has_alias() )
                    cout << " (" << rec.alias() << ")";
                cout << "\nTitle    " << rec.title() << "\n";
                cout << "Desc     ";
                if ( rec.has_desc() )
                {
                    if ( !g_details && rec.desc().size() > 200 )
                    {
                        cout.write( rec.desc().c_str(), 200);
                        cout << "... (more)\n";
                    }
                    else
                        cout << rec.desc() << "\n";
                }
                else
                    cout << "n/a\n";

                cout << "Topic    " << (rec.has_topic()?rec.topic():"n/a") << "\n";
                cout << "Keywords " << (rec.has_keyw()?rec.keyw():"n/a") << "\n";
                cout << "Owner    " << (rec.has_owner()?rec.owner():"n/a") << "\n";
                cout << "Locked   " << ((rec.has_locked() && rec.locked())?"Yes":"No") << "\n";
                cout << "Size     " << (rec.has_size()?to_string(rec.size()):"n/a") << "\n";
                cout << "Repo     " << (rec.has_repo_id()?rec.repo_id():"n/a") << "\n";

                if ( rec.has_parent_id() )
                    cout << "Parent   " << rec.parent_id() << "\n";

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
                cout << "Meta     ";
                if ( rec.has_metadata() )
                {
                    if ( g_details )
                        cout << rec.metadata() << "\n";
                    else
                        cout << "(available)\n";
                }
                else
                    cout << "n/a\n";

                if ( rec.deps_size() )
                {
                    cout << "Refs     ";
                    for ( int j = 0; j < rec.deps_size(); j++ )
                    {
                        const DependencyData & dep = rec.deps(j);

                        if ( j > 0 )
                            cout << "         ";

                        switch( dep.type() )
                        {
                            case DEP_IS_DERIVED_FROM:
                                cout << (dep.dir()== DEP_OUT?"Derived from ":"Source of ");
                                break;
                            case DEP_IS_COMPONENT_OF:
                                cout << (dep.dir()==DEP_OUT?"Child of ":"Parent of ");
                                break;
                            case DEP_IS_NEW_VERSION_OF:
                                cout << (dep.dir()==DEP_OUT?"New version of ":"Deprecated by ");
                                break;
                            default:
                                break;
                        }
                        cout << dep.id();
                        if ( dep.has_alias() )
                            cout << " (" << dep.alias() << ")";
                        cout << "\n";
                    }
                }
            }
            else
            {
                cout << "\"" << rec.id() << "\""
                    << ",\"" << ( rec.has_alias()?rec.alias():"" ) << "\""
                    << ",\"" << escapeCSV( rec.title() ) << "\""
                    << ",\"" << ( rec.has_desc()?escapeCSV( rec.desc() ):"" ) << "\""
                    << ",\"" << ( rec.has_topic()?rec.topic():"" ) << "\""
                    << ",\"" << ( rec.has_keyw()?rec.keyw():"" ) << "\""
                    << ",\"" << ( rec.has_owner()?rec.owner():"" ) << "\""
                    << "," << ((rec.has_locked() && rec.locked())?"1":"0")
                    << "," << ( rec.has_size()?rec.size():0 )
                    << ",\"" << ( rec.has_repo_id()?rec.repo_id():"" ) << "\""
                    << ",\"" << ( rec.has_parent_id()?rec.parent_id():"" )
                    << "," << ( rec.has_dt()?rec.dt():0 )
                    << "," << ( rec.has_ct()?rec.ct():0 )
                    << "," << ( rec.has_ut()?rec.ut():0 )
                    << ",\"" << ( rec.has_metadata()?escapeCSV( rec.metadata() ):"" ) << "\"\n";
            }
        }
    }
}

void printCollData( spCollDataReply a_reply )
{
    if ( g_out_form == JSON )
    {
        cout << g_client->messageToJSON( a_reply.get() ) << "\n";
        return;
    }

    if ( g_out_form == CSV )
        cout << "\"CollID\",\"Alias\",\"Title\",\"Desc\",\"Owner\",\"Parent\",\"Created\",\"Updated\"\n";

    if ( a_reply->coll_size() )
    {
        time_t      t;
        struct tm*  pTM;

        for ( int i = 0; i < a_reply->coll_size(); i++ )
        {
            const CollData & coll = a_reply->coll(i);

            if ( g_out_form == TEXT )
            {
                cout << "CollID  " << coll.id() << "\n";
                if ( coll.has_alias() )
                    cout << "Alias   " << coll.alias() << "\n";
                cout << "Title   " << coll.title() << "\n";
                if ( coll.has_desc() )
                    cout << "Desc    " << coll.desc() << "\n";
                if ( coll.has_owner() )
                    cout << "Owner   " << coll.owner() << "\n";
                if ( coll.has_parent_id() )
                    cout << "Parent  " << coll.parent_id() << "\n";
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
            }
            else
            {
                cout << "\"" << coll.id() << "\""
                    << ",\"" << (coll.has_alias()?coll.alias():"") << "\""
                    << ",\"" << escapeCSV( coll.title() ) << "\""
                    << ",\"" << (coll.has_desc()?escapeCSV( coll.desc() ):"") << "\""
                    << ",\"" << (coll.has_owner()?coll.owner():"") << "\""
                    << ",\"" << (coll.has_parent_id()?coll.parent_id():"" ) << "\""
                    << "," << (coll.has_ct()?coll.ct():0)
                    << "," << (coll.has_ut()?coll.ut():0)
                    << "\n";
            }
        }
    }
}

void printListing( spListingReply a_reply )
{
    if ( g_out_form == JSON )
    {
        cout << g_client->messageToJSON( a_reply.get() ) << "\n";
        return;
    }

    if ( g_out_form == CSV )
        cout << "\"id\",\"alias\",\"title\",\"locked\"\n";

    string tmp;
    for ( int i = 0; i < a_reply->item_size(); i++ )
    {
        const ListingData & item = a_reply->item(i);

        if ( g_out_form == TEXT )
        {
            cout << setw(4) << left << (to_string(i + 1) + ". ");

            if ( item.has_locked() && item.locked() )
                cout << "L ";
            else
                cout << "  ";

            cout << left << setw(12) << item.id();

            if ( item.has_alias() && item.alias().size() )
            {
                tmp = string("(") + item.alias() + ")";
                cout << setw(19) << tmp;
            }
            else
                cout << setw(19) << " ";

            cout << " \"" << item.title() << "\"\n";
        }
        else
        {
            cout << "\"" << item.id() << "\""
                << ",\"" << (item.has_alias()?item.alias():"") << "\""
                << ",\"" << escapeCSV( item.title() ) << "\""
                << "," << (item.has_locked() && item.locked()?1:0) << "\n";
        }
    }
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
    if ( g_out_form == JSON )
    {
        cout << g_client->messageToJSON( a_reply.get() ) << "\n";
        return;
    }

    if ( a_reply->xfr_size() )
    {
        time_t t;

        if ( g_out_form == CSV )
            cout << "\"TransID\",\"DataID\",\"Mode\",\"Status\",\"Error\",\"Path\",\"StatusTS\"\n";

        struct tm* gmt_time;

        for ( int i = 0; i < a_reply->xfr_size(); i++ )
        {
            const XfrData & xfr = a_reply->xfr(i);
            if ( g_out_form == TEXT )
            {
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
            }
            else
            {
                cout << "\"" << xfr.id() << "\",";
                cout << "\"" << xfr.data_id() << "\",";
                cout << "\"" << (xfr.mode()==XM_GET?"GET":"PUT") << "\",";
                cout << "\"" << StatusText[xfr.status()] << "\",";
                cout << "\"" << (xfr.has_err_msg()?xfr.err_msg():"") << "\",";
                cout << "\"" << xfr.local_path() << "\",";
                cout << xfr.updated() << "\n";
            }
        }
    }
    else
    {
        if ( g_out_form == TEXT )
            cout << "No matching transfers\n";
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
        cout << "      Use \"help [command]\" for command-specific help\n";
        cout << "      Use ctrl-c or \"exit\" to exit shell\n\n";
        cout << g_opts_command << "\nAvailable commands:\n\n";

        for ( cmd_list_t::iterator icmd = g_cmd_list.begin(); icmd != g_cmd_list.end(); ++icmd )
        {
            cout << "  ";
            icmd->help();
        }
    }
    else
    {
        cmd_map_t::iterator icmd = g_cmd_map.find( g_args[0] );
        if ( icmd == g_cmd_map.end() )
            printError( "Unknown command" );
        else
            icmd->second->help( true );
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

    string par = g_cur_col;

    if ( g_parent.size() )
    {
        bool fin;
        par = resolveCollID( g_parent, fin );
    }

    if ( g_meta_file.size() )
    {
        if ( g_meta.size() )
            EXCEPT_PARAM( 1, "Options meta and meta-file are mutually exclusive" );

        ifstream inf( g_meta_file.c_str() );
        if ( !inf.is_open() )
            EXCEPT_PARAM( 1, "Could not open metadata file: " << g_meta_file );

        string metadata(( istreambuf_iterator<char>(inf)), istreambuf_iterator<char>());

        inf.close();

        return g_client->recordCreate( g_title, g_desc.size()?g_desc.c_str():0, g_alias.size()?g_alias.c_str():0, g_keyw.size()?g_keyw.c_str():0, g_topic.size()?g_topic.c_str():0, metadata.c_str(), par.c_str(), g_repo.size()?g_repo.c_str():0, &g_dep_add );
    }
    else
    {
        return g_client->recordCreate( g_title, g_desc.size()?g_desc.c_str():0, g_alias.size()>2?g_alias.c_str():0, g_keyw.size()?g_keyw.c_str():0, g_topic.size()?g_topic.c_str():0, g_meta.size()?g_meta.c_str():0, par.c_str(), g_repo.size()?g_repo.c_str():0, &g_dep_add );
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

        return g_client->recordUpdate( a_id, g_title.size()?g_title.c_str():0, g_desc.size()?g_desc.c_str():0, g_alias.size()?g_alias.c_str():0, g_keyw.size()?g_keyw.c_str():0, g_topic.size()?g_topic.c_str():0, metadata.c_str(), !g_meta_replace, &g_dep_add, &g_dep_rem, g_dep_clear );
    }
    else
    {
        return g_client->recordUpdate( a_id, g_title.size()?g_title.c_str():0, g_desc.size()?g_desc.c_str():0, g_alias.size()>2?g_alias.c_str():0, g_keyw.size()?g_keyw.c_str():0, g_topic.size()?g_topic.c_str():0, g_meta.size()?g_meta.c_str():0, !g_meta_replace, &g_dep_add, &g_dep_rem, g_dep_clear );
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
    updateIdIndex( rep );

    cout << rep->item_size() << " match(es) found:\n\n";
    //printData( rep, true );

    return 0;
}



int data_view()
{
    if ( g_args.size() != 1 )
        return -1;

    spRecordDataReply rep = g_client->recordView( resolveID( g_args[0] ));
    printData( rep );

    return 0;
}

int data_create()
{
    if ( g_args.size() != 0 )
        return -1;

    spRecordDataReply rep = createRecord();
    printData( rep );

    return 0;
}

int data_update()
{
    if ( g_args.size() != 1 )
        return -1;

    spRecordDataReply rep = updateRecord( resolveID( g_args[0] ));
    printData( rep );
    return 0;
}

int data_get()
{
    if ( g_args.size() == 1 )
    {
        spDataPathReply rep = g_client->dataGetPath( resolveID( g_args[0] ));
        cout << rep->path() << "\n";
        return 0;
    }
    else if ( g_args.size() == 2 )
    {
        int stat = 0;

        spXfrDataReply xfrs = g_client->dataGet( resolveID( g_args[0] ), g_args[1] );

        g_cur_xfr = xfrs->xfr(0).id();

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
            cout << "{\"id\":\"" << xfr.id() << "\",\"status\":\"" << StatusText[xfr.status()] << "\",\"local_path\":\"" << xfr.local_path() << "\"}\n";
            break;
        }

        return stat;
    }
    else
        return -1;
}


int data_put()
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
        data_id = resolveID( g_args[0] );
        spRecordDataReply rep = updateRecord( data_id );
    }
    else
        return -1;

    int stat = 0;

    // Push data to record

    spXfrDataReply xfrs = g_client->dataPut( data_id, *g_args.rbegin() );

    g_cur_xfr = xfrs->xfr(0).id();

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
        cout << "DataID   " << data_id << "\nTransID  " << xfr.id() << "\nStatus   " << StatusText[xfr.status()] << "\nPath     " << xfr.local_path() << "\n";
        break;
    case CSV:
        cout << "\"DataID\",\"TransID\",\"Status\",\"Path\"\n";
        cout << "\"" + data_id + "\",\"" << xfr.id() << "\",\"" << StatusText[xfr.status()] << "\",\"" << xfr.local_path() << "\"\n";
        break;
    case JSON:
        cout << "{\"data_id\":\"" + data_id + "\",\"id\":\"" << xfr.id() << "\",\"status\":\"" << StatusText[xfr.status()] << "\",\"local_path\":\"" << xfr.local_path() << "\"}\n";
        break;
    }

    return stat;

}

int data_clear()
{
    if ( g_args.size() != 1 )
        return -1;

    g_client->dataDelete( resolveID( g_args[0] ));
    printSuccess();

    return 0;
}

int data_delete()
{
    if ( g_args.size() != 1 )
        return -1;

    g_client->recordDelete( resolveID( g_args[0] ));
    printSuccess();

    return 0;
}

int coll_view()
{
    if ( g_args.size() == 0 )
    {
        spCollDataReply rep = g_client->collView( g_cur_col );
        printCollData( rep );
    }
    else if ( g_args.size() == 1 )
    {
        bool fin;
        string id = resolveCollID( g_args[0], fin );
        spCollDataReply rep = g_client->collView( id );
        printCollData( rep );
    }
    else
        return -1;

    return 0;
}

int coll_create()
{
    if ( g_args.size() != 0 )
        return -1;

    if ( !g_title.size() )
        EXCEPT_PARAM( 1, "Title is required" );

    string par = g_cur_col;

    if ( g_parent.size() )
    {
        bool fin;
        par = resolveCollID( g_parent, fin );
    }

    spCollDataReply rep = g_client->collCreate( g_title, g_desc.size()?g_desc.c_str():0, g_alias.size()>2?g_alias.c_str():0, par.c_str() );
    printCollData( rep );

    return 0;
}

int coll_update()
{
    if ( g_args.size() != 1 )
        return -1;

    spCollDataReply rep = g_client->collUpdate( resolveID( g_args[0] ), g_title.size()?g_title.c_str():0, g_desc.size()?g_desc.c_str():0, g_alias.size()>2?g_alias.c_str():0 );
    printCollData( rep );

    return 0;
}

int coll_delete()
{
    if ( g_args.size() != 1 )
        return -1;

    g_client->collDelete( resolveID( g_args[0] ));

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
    if ( g_args.size() == 0 ||  g_args.size() == 1 )
    {
        string id;
        if ( g_args.size() == 0 )
        {
            if ( !g_cur_xfr.size() )
            {
                printError( "No recent transfer" );
                return 1;
            }

            id = g_cur_xfr;
        }
        else
            id = g_args[0];

        spXfrDataReply xfr = g_client->xfrView( id );

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

int ep_get()
{
    if ( g_args.size() != 0 )
        return -1;
    const string & ep = g_client->getDefaultEndpoint();
    switch( g_out_form )
    {
    case TEXT:
        cout << ep << "\n";
        break;
    case CSV:
        cout << "\"" << ep << "\"\n";
        break;
    case JSON:
        cout << "{\"ep\":\"" << ep << "\"}\n";
        break;
    }

    return 0;
}

int ep_set()
{
    if ( g_args.size() != 1 )
        return -1;

    if ( g_args[0].find_first_of("/") != string::npos )
        EXCEPT( 1, "Do not include slashes in end-point name/UUID" );

    g_client->setDefaultEndpoint( g_args[0] );
    printSuccess();
    return 0;
}

int ep_list()
{
    if ( g_args.size() != 0 )
        return -1;
    spUserGetRecentEPReply rep = g_client->getRecentEndpoints();

    if ( g_out_form == JSON )
    {
        cout << g_client->messageToJSON( rep.get() );
        return 0;
    }

    for ( int i = 0; i < rep->ep_size(); i++ )
    {
        if ( g_out_form == TEXT )
            cout << rep->ep(i) << "\n";
        else
            cout << "\"" << rep->ep(i) << "\"\n";
    }

    return 0;
}

int user()
{
    if ( g_args.size() != 1 )
        return -1;

    spUserDataReply rep;

    if ( g_args[0] == "collab" || g_args[0] == "c" )
        rep = g_client->userListCollaborators();
    else if ( g_args[0] == "shared" || g_args[0] == "s" )
        rep = g_client->userListShared();
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

void select( const string & a_new_sel )
{
    if ( a_new_sel.compare( 0, 2, "p/" ) == 0 )
    {
        spProjectDataReply rep = g_client->projectView( a_new_sel );

        g_cur_sel = a_new_sel;
        g_cur_col = "c/p_" + g_cur_sel.substr(2) + "_root";
        g_cur_alias_prefix = "p:" + g_cur_sel.substr(2) + ":";
    }
    else
    {
        string id;
        if ( a_new_sel.compare( 0, 2, "u/" ) != 0 )
            id = "u/" + a_new_sel;
        else
            id = a_new_sel;

        spUserDataReply rep = g_client->userView( id, false );

        g_cur_sel = id;
        g_cur_col = "c/u_" + g_cur_sel.substr(2) + "_root";
        g_cur_alias_prefix = "u:" + g_cur_sel.substr(2) + ":";
    }
}

int pwc()
{
    spCollDataReply rep = g_client->collGetParents( g_cur_col, true );
    size_t pos;

    for ( int i = rep->coll_size() - 2; i >= 0 ; i-- )
    {
        if ( rep->coll(i).has_alias() )
        {
            pos = rep->coll(i).alias().find_last_of(":");
            cout << "/" << rep->coll(i).alias().substr( pos + 1 );
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

int wc()
{
    if ( g_args.size() == 0 )
    {
        pwc();
    }
    else if ( g_args.size() == 1 )
    {
        bool fin;
        string id = resolveCollID( g_args[0], fin );

        if ( !fin )
        {
            spCollDataReply rep = g_client->collView( id );
            if ( !rep->coll_size() )
                EXCEPT( 1, "Invalid collection" );

            g_cur_col = rep->coll(0).id();

            if ( rep->coll(0).owner() != g_cur_sel )
            {
                g_cur_sel = rep->coll(0).owner();
                g_cur_alias_prefix = "u:" + g_cur_sel.substr(2) + ":";
                cout << "Switched to " << ( g_cur_sel[0] == 'u'?"user":"project" ) << ": " << g_cur_sel  << "\n";
            }
        }
        else
        {
            g_cur_col = id;
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
        updateIdIndex( rep );
        printListing( rep );
    }
    else if ( g_args.size() == 1 )
    {
        bool fin;
        rep = g_client->collRead( resolveCollID( g_args[0], fin ) );
        updateIdIndex( rep );
        printListing( rep );
    }
    else
        return -1;


    return 0;
}

int link()
{
    bool fin;

    if ( g_args.size() == 2 )
    {
        string id = resolveCollID( g_args[1], fin );
        g_client->collAddItem( id, resolveCollID( g_args[0], fin ) );
    }
    else if ( g_args.size() == 1 )
        g_client->collAddItem( g_cur_col, resolveCollID( g_args[0], fin ));
    else
        return -1;

    return 0;
}

int unlink()
{
    bool fin;

    if ( g_args.size() == 2 )
    {
        string id = resolveCollID( g_args[1], fin );
        g_client->collRemoveItem( id, resolveCollID( g_args[0], fin ) );
    }
    else if ( g_args.size() == 1 )
        g_client->collRemoveItem( g_cur_col, resolveCollID( g_args[0], fin ));
    else
        return -1;

    return 0;
}

int move()
{
    bool src_fin, dest_fin;
    string src_id, dest_id, item_id;

    if ( g_args.size() == 3 )
    {
        src_id = resolveCollID( g_args[1], src_fin );
        dest_id = resolveCollID( g_args[2], dest_fin );
    }
    else if ( g_args.size() == 2 )
    {
        src_id = g_cur_col;
        src_fin = true;
        dest_id = resolveCollID( g_args[1], dest_fin );
    }
    else
        return -1;

    item_id = resolveID( g_args[0] );

/*
    if ( !src_fin )
    {
        spCollDataReply rep = g_client->collView( src_id );
        if ( !rep->coll_size() )
            EXCEPT( 1, "Invalid source collection" );
        src_id = rep->coll(0).id();
    }

    if ( !dest_fin )
    {
        spCollDataReply rep = g_client->collView( dest_id );
        if ( !rep->coll_size() )
            EXCEPT( 1, "Invalid destination collection" );
        dest_id = rep->coll(0).id();
    }

    if ( dest_id != src_id && item_id != src_id && item_id != dest_id )
    {
        g_client->collAddItem( dest_id, item_id );
        g_client->collRemoveItem( src_id, item_id );
    }
    else
    {
        cerr << "ERROR Invalid parameter(s)\n";
        return 1;
    }
*/
    g_client->collMoveItem( src_id, dest_id, item_id );

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
    g_keyw.clear();
    g_topic.clear();
    g_parent.clear();
    g_meta.clear();
    g_meta_file.clear();
    g_meta_replace = false;
    g_dep_add.clear();
    g_dep_rem.clear();
    g_dep_clear = false;
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

int exit_shell()
{
    exit(0);
}

int main( int a_argc, char ** a_argv )
{
    addCommand( "?", "help", "Show help", "Use 'help <cmd>' to show help for a specific command.", help );

    // Data Commands
    addCommand("dv","data-view", "View data record", "<id>\n\nViews fields of specified data record. The <id> argument may be an identifier or an alias.", data_view );
    addCommand("dc","data-create", "Create data record", "-t <title> [-a] [-d] [-md|-f [-r]]\n\nCreates a new data record using fields provided via options (see general help for option descriptions).", data_create );
    addCommand("du","data-update", "Update data record", "<id> [-t] [-a] [-d] [-md|-f [-r]]\n\nUpdates an existing data record using fields provided via options (see general help for option descriptions).  The <id> argument may be an identifier or an alias.", data_update );
    addCommand( "get", "data-get", "Get data from repository", "<id> <dest>\n\nTransfer raw data from repository and place in a specified destination directory. The <id> parameter may be either a data identifier or an alias. The <dest> parameter is the destination path including a globus end-point prefix (if no prefix is specified, the default local end-point will be used). If no destination is specified, this command will return a local path to the (read-only) raw data file if one exists.", data_get );
    addCommand( "put", "data-put", "Put data into repository", "[id] <src> [-t title] [-d desc] [-a alias] [-m metadata |-f meta-file]\n\nTransfer raw data from the specified <src> path to the repository. If the 'id' parameter is provided, the record with the associated identifier (or alias) will receive the data; otherwise a new data record will be created (see help on data command for details). The source path may include a globus end-point prefix; however, if none is specified, the default local end-point will be used.", data_put );
    addCommand("","data-clear", "Clear raw data", "<id>\n\nDeletes raw data associated with an existing data record. The <id> argument may be an identifier or an alias.", data_clear );
    addCommand("","data-delete", "Delete data record", "<id>\n\nDeletes an existing data record, including raw data. The <id> argument may be an identifier or an alias.", data_delete );
    addCommand( "find", "data-find", "Find data by metadata query", "<query>\n\nReturns a list of all data records that match specified query (see documentation for query language description).", find_records );

    // Collection commands
    addCommand( "cv", "coll-view", "View collection record", "<id>\n\nView fields of specified collection record. The <id> argument may be an identifier or an alias. This command does not list items linked to the collection; for this, see the \"ls\" command.", coll_view );
    addCommand( "cc", "coll-create", "Create collection record", "-t <title> [-a] [-d]\n\nCreates a new collection record using fields provided via options (see general help for option descriptions). The new collection is created as a child of the current working collection (root by default).", coll_create );
    addCommand( "cu", "coll-update", "Update collection record", "<id> [-t] [-a] [-d]\n\nUpdates an existing collection record using fields provided via options (see general help for option descriptions). The <id> argument may be an identifier or an alias.", coll_update );
    addCommand( "", "coll-delete", "Delete collection record", "<id>\n\nDelete collection and all contained data.", coll_delete );


    // Transfer related commands
    addCommand( "xl", "xfr-list", "List data transfers", "[<id>] [--since] [--from] [--to] [--status]\n\nList details of specified transfer (using <id>) or data transfers that match specified options.", xfr_list );
    addCommand( "xs", "xfr-status", "Get data transfer status", "<id>\n\nGet status of data transfer specified by <id> parameter.", xfr_status );
    addCommand( "epg", "ep-get", "Get default end-point", "\n\nGet current default end-point.", ep_get );
    addCommand( "eps", "ep-set", "Set default end-point", "<name/uuid>\n\nSet current default end-point to specified legacy name or UUID.", ep_set );
    addCommand( "epl", "ep-list", "List recent end-points", "\n\nList recently used end-points.", ep_list );

    addCommand( "u", "user", "List/view users by affiliation", "<cmd>\n\nList or view user depending on value of <cmd> argument: \"collab\" lists collaborators (team members, users granted explicit access, etc.), \"shared\" lists users sharing data with current user, or specify a user ID to view a specific user.", user );

    addCommand( "p", "project", "List/view projects by affiliation", "project <cmd/id>\n\nList (m)y projects, (t)eam projects, or projects with (s)hared access, or view project information if an ID is given.", project );

    // File-system-like commands
    addCommand( "", "sel", "Select user or project","[<id>]\n\nSelect the specified user or project for collection navigation. If no id is provided, prints the current user or project.", select );
    //addCommand( "", "pwc", "Print working collection","\n\nPrint current workingcollection with parent hierarchy.", pwc );
    addCommand( "", "wc", "Print/change working collection","<id/cmd>\n\nPrints working collection if no arguments specified; otherwise changset working collection to specifed value. The 'id/cmd' argument can be a collection ID or alias, '/' for the root collection, or '..' to move up one collection.", wc );
    addCommand( "", "ls", "List current collection","[<id/cmd>]>\n\nList contents of current working collection or specified location. The 'id/cmd' argument can be a collection ID or alias, '/' for the root collection, '..' for the parent of the current working collection, or \".\" (or omitted) for the current collection.", ls );
    addCommand( "ln", "link", "Link item into a collection","<id> [<coll_id>]\n\nLinks a data record or collection into the specified collection. The <coll_id> paramter may be a collection ID or alias, \"/\" for root (of the current user or project), \"..\" for the parent of the current collection, or \".\" (or omitted) for the current collection. Note that if the item being linked is a collection, it will be unlinked from it's current location before being linked into the new location.", link );
    addCommand( "ul", "unlink", "Unlink item from a collection","<id> [<coll_id>]>\n\nUnlinks a data record or collection from the specified collection. The <coll_id> paramter may be \"/\" for root, \"..\" for the parent of the current collection, or \".\" (or omitted) for the current collection. Note that if the item being unlinked has no other links, it will be unlinked from the specified location and re-linked into the root collection.", unlink );
    addCommand( "mv", "move", "Move link item to new collection","<id> [<src_id>] <dest_id>>\n\nMoves item links from source collection <src_id> to destination collection <dest_id>. If the <src_id> paramter is omitted, the current collection is used. Collection ids may be \"/\" for root, \"..\" for the parent of the current collection, or \".\" for the current collection.", move );
    addCommand( "", "setup", "Setup local environment","\n\nSetup the local environment for non-interactive use by installing encryption keys in facility-specified location.", setup );
    addCommand( "", "status", "Check status of core server","\n\nGets core server status to to verify communication and system readiness.", ping );
    addCommand( "", "exit", "Exit interactive shell","", exit_shell );

    //addCommand( "a", "acl", "Manage ACLs for data or collections",  "acl [get|set] <id> [[uid|gid|def] [grant|deny [inh]] value] ]\n\nSet or get ACLs for record or collection <id> (as ID or alias)", acl );
    //addCommand( "g", "group", "Group management (for ACLs)", "group <cmd> [id [args]]\n\nGroup commands: (l)ist, (v)iew, (c)reate, (u)pdate, (d)elete", group );
    //addCommand( "", "cp", "Copy data into a collection","cp <data_id> [<coll_id>]>\n\n\"Copies\" a data record into either the specified collection, or the current collection if <coll_id> is not provided. The command does not create an actual copy of the data, rather it creates a link to the data in the specified collection. Use the \"dup\" command to create a new data record from an existing record.", cp );
    //addCommand( "", "mv", "Move data/collection into a collection","mv <id> [<coll_id>]>\n\n\"Moves\" a data record or a collection into either the specified collection, or the current collection if <coll_id> is not provided. The command creates a new link to the data/collection in the specified collection, and unlinks it from the.", mv );

    buildCmdMap();

    string      host = "sdms.ornl.gov";
    uint16_t    port = 7512;
    uint32_t    timeout = 10000;
    const char* home = getenv("HOME");
    string      client_cred_dir = string(home?home:"") + "/.sdms/";
    string      service_cred_dir = "/etc/sdms/";
    bool        manual_auth = false;
    const char* def_ep = getenv("SDMS_CLIENT_DEFAULT_EP");
    bool        non_interact = false;

    const char *tmp = getenv("SDMS_SERVICE_CRED_DIR");
    if ( tmp )
        service_cred_dir = tmp;

    tmp = getenv("SDMS_CLIENT_CRED_DIR");
    if ( tmp )
        client_cred_dir = tmp;

    po::options_description opts_startup( "Program options" );
    po::options_description opts_hidden( "Hidden options" );
    po::options_description opts_all( "All options" );
    po::options_description opts_console( "Console options" );
    po::positional_options_description opts_pos;

    opts_startup.add_options()
        ("help,?", "Show help")
        ("version", "Show version number")
        ("client-cred-dir,C",po::value<string>( &client_cred_dir ),"Client credentials directory")
        ("serv-cred-dir,S",po::value<string>( &service_cred_dir ),"SDMS service credentials directory")
        ("host,H",po::value<string>( &host ),"Service hostname/IP")
        ("port,P",po::value<uint16_t>( &port ),"Service port")
        ("cfg",po::value<string>( &g_cfg_file ),"Use config file for options")
        ("login,L",po::bool_switch( &manual_auth )->default_value(false),"Manually login to SDMS")
        ("sel",po::value<string>( &g_select ),"Select user or project prior to executing command")
        ;

    g_opts_command.add_options()
        ("wait,w",po::bool_switch( &g_wait )->default_value(false),"Block until command completes")
        ("title,t",po::value<string>( &g_title ),"Specify title for create/update commands")
        ("desc,d",po::value<string>( &g_desc ),"Specify description for create/update commands")
        ("alias,a",po::value<string>( &g_alias ),"Specify alias for create/update commands")
        ("keyw,k",po::value<string>( &g_keyw ),"Specify keywords for data create/update commands")
        ("top",po::value<string>( &g_topic ),"Specify topic for data create/update commands")
        ("par,p",po::value<string>( &g_parent ),"Specify parent collection ID or alias when creating new data record or collection")
        ("md,m",po::value<string>( &g_meta ),"Specify metadata (JSON format) for create/update commands")
        ("md-file,f",po::value<string>( &g_meta_file ),"Specify filename to read metadata from (JSON format) for create/update commands")
        ("md-replace,r",po::bool_switch( &g_meta_replace ),"Replace existing metadata instead of merging with existing fields")
        ("dep-add,A",po::value<vector<string>>( &g_dep_add ),"Add dependency (id/alias,type) for data create/update (repeat for multiple)")
        ("dep-rem,R",po::value<vector<string>>( &g_dep_rem ),"Remove dependency (id/alias) for data update (repeat for multiple)")
        ("dep-clear,C",po::bool_switch( &g_dep_clear ),"Clears all dependencies for data update (use with -A to set dependencies)")
        ("repo",po::value<string>( &g_repo ),"Use specific storage allocation by repo ID for new data")
        ("text,T",po::bool_switch( &g_out_text ),"Output in TEXT format (default)")
        ("json,J",po::bool_switch( &g_out_json ),"Output in JSON format (default is TEXT)")
        ("csv",po::bool_switch( &g_out_csv ),"Output in CSV format (default is TEXT)")
        //("name,n",po::value<string>( &g_name ),"Specify user name for update command")
        //("email,e",po::value<string>( &g_email ),"Specify user email for update command")
        //("globus_id,g",po::value<string>( &g_globus_id ),"Specify user globus_id for update command")
        ("verbose,v",po::bool_switch( &g_details ),"Show extra details for supported commands")
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
            cout << "Usage: sdms [command [args]] [options]\n";
            cout << "      \"help [command]\" for command-specific help\n\n";
            cout << opts_startup << "\nAvailable commands:\n\n";

            for ( cmd_list_t::iterator icmd = g_cmd_list.begin(); icmd != g_cmd_list.end(); ++icmd )
            {
                cout << "  ";
                icmd->help();
            }

            cout << "\n\nRunning the sdms CLI without specifying a command starts an interactive shell.\n\n";
            return 1;
        }

        if ( res == OPTS_VERSION )
        {
            cout << VERSION << endl;
            return 1;
        }

        if ( !non_interact )
            cout << "SDMS CLI Client, ver. " << VERSION << "\n";

        if ( manual_auth && non_interact )
            EXCEPT( 0, "Manual authentication required" );

        if ( !manual_auth && !Client::verifyCredentials( client_cred_dir ))
        {
            if ( non_interact )
                EXCEPT( 0, "Manual authentication required" );

            cerr << "No client credentials found, manual authentication required.\n";
            manual_auth = true;
        }

        Client client( host, port, timeout, service_cred_dir, client_cred_dir, !manual_auth );

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
        else
        {
            if ( !non_interact )
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
                if ( g_select.size() )
                {
                    select( g_select );
                }

                int ec = icmd->second->func();
                if ( ec < 0 )
                    EXCEPT_PARAM( 0, "Invalid arguments to command " << g_cmd );

                return ec;
            }
            else
            {
                EXCEPT_PARAM( 0, "Unknown command " << g_cmd );
            }
        }
        else
        {
            char * cmd_str;
            size_t len;
            SmartTokenizer<> tok;

            cout << "Console mode. Use Ctrl-C or type \"exit\" to terminate program. Type \"help\" or \"?\" for help.\n\n";

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
                                    printError( "Invalid arguments" );
                                    icmd->second->help( true );
                                    cout << "\n";
                                }
                            }
                            else
                            {
                                printError( "Unknown command" );
                            }
                        }
                    }
                }
                catch( TraceException &e )
                {
                    printError( e.toString() );
                }
                catch( exception &e )
                {
                    printError( e.what() );
                }
            }
        }
    }
    catch( TraceException &e )
    {
        printError( e.toString() );
        return 1;
    }
    catch( exception &e )
    {
        printError( e.what() );
        return 1;
    }

    return 0;
}

