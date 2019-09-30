## @namespace datafed.CommandLib
# @brief Provides a high-level client interface to the DataFed server
# 
# The DataFed CommandLib module provides a high-level, text-based client
# interface for sending commands to, and receiving replies from, a DateFed
# server. Comands are structured hierarchically, with sub-commands taking
# specific options and arguments.
#
# The CommandLib module is meant to be embedded in a Python script or
# application, and can be used in two ways: 1) interactively via the run()
# function, or 2) programmatically via the exec() function.
#
# For interactive applications, the run() function will prompt the user for
# input, then print a response. Optionally, the run() method can loop until
# the user chooses to exit. The DataFed _cli is a very thin wrapper around
# the CommandLib run() function.
#
# The programmatic interface consists of the init(), login(), and command()
# functions. The command() function executes a single command and returns
# a reply in the form of a Google protobuf message.

from __future__ import division, print_function, absolute_import #, unicode_literals
import shlex
import getpass
import os
import sys
import datetime
import textwrap
import shutil
import click
import click.decorators
import re
import json as jsonlib
import time
import pathlib
import wget
from google.protobuf.json_format import MessageToJson
from google.protobuf.json_format import MessageToDict

from prompt_toolkit import PromptSession
from prompt_toolkit.history import FileHistory
from prompt_toolkit.auto_suggest import AutoSuggestFromHistory
from prompt_toolkit.formatted_text import to_formatted_text

from . import SDMS_Auth_pb2 as auth
from . import SDMS_pb2 as sdms
from . import MessageLib
from . import Config
from . import version

if sys.version_info.major == 3:
    unicode = str

_mapi = None
_cfg = None
_return_val = None
_uid = None
_cur_sel = None
_cur_coll = "root"
_cur_coll_prefix = "root"
_cur_coll_title = None
_cur_alias_prefix = ""
_prev_coll = "root"
_list_items = []
_interactive = True
_verbosity_sticky = 1
_verbosity = 1
_ctxt_settings = dict(help_option_names=['-?', '--help'],ignore_unknown_options=True,allow_extra_args=True)
_ep_default = None
_ep_cur = None
_max_md_size = 102400
_max_payload_size = 1048576
_most_recent_list_request = None
_most_recent_list_count = None
_xfr_statuses = {0: "Initiated", 1: "Active", 2: "Inactive", 3: "Succeeded", 4: "Failed"}
_xfr_modes = { 0: "Get", 1: "Put", 2: "Copy"}
_initialized = False
_devnull = None


_OM_TEXT = 0
_OM_JSON = 1
_OM_RETN = 2

_output_mode_sticky = _OM_TEXT
_output_mode = _OM_TEXT

_STAT_OK     = 0
_STAT_ERROR  = 1

class NoCommand(Exception):
    def __init__(self,*args,**kwargs):
        Exception.__init__(self,*args,**kwargs)

# Used by _cli script to run interactively
def _run():
    global _output_mode_sticky
    global _output_mode
    global _verbosity_sticky
    global _verbosity
    global _interactive

    _addConfigOptions()

    session = None
    _first = True

    while True:
        _output_mode = _output_mode_sticky
        _verbosity = _verbosity_sticky

        try:
            if _first:
                _cli(standalone_mode=False)
                # Won't get here if a command was specified on command-line
                _interactive = False
            else:
                if session == None:
                    session = PromptSession(history=FileHistory(os.path.expanduser("~/.datafed-hist")))
                if _cur_sel[0:2] == "p/":
                    prefix = "(" + _cur_sel[2:] + ") " + _cur_coll_prefix + ">"
                else:
                    prefix = _cur_coll_prefix + ">"
                _args = shlex.split(session.prompt(prefix,auto_suggest=AutoSuggestFromHistory()))
                _cli(prog_name="datafed",args=_args,standalone_mode=False)

        except click.ClickException as e:
            if _output_mode == _OM_TEXT:
                click.echo( e.format_message() )
            elif _output_mode == _OM_JSON:
                click.echo("{{\"msg_type\":\"ClientError\",\"message\":\"{}\"}}".format(e.format_message()))
            if _first:
                _interactive = False

        except SystemExit as e:
            # For subsequent interactive commands, hide top-level (start-up) options
            if _first and _interactive and _initialized:
                for i in _cli.params:
                    i.hidden = True

        except KeyboardInterrupt as e:
            # Break out of main loop
            _interactive = False
            break

        except NoCommand as e:
            # Be nice and switch to interactive when no command given
            if _interactive:
                _print_msg( 1, "Welcome to DataFed CLI, version {}".format(version))
                _print_msg( 1, "Authenticated as " + _mapi._uid )

                if _verbosity > 1:
                    _print_msg( 2, "Settings:" )
                    _cfg.printSettingInfo()
            else:
                if _output_mode == _OM_TEXT:
                    click.echo(e)
                elif _output_mode == _OM_JSON:
                    click.echo("{{\"msg_type\":\"ClientError\",\"message\":\"{}\"}}".format(e))

        except Exception as e:
            if _output_mode == _OM_TEXT:
                click.echo(e)
            elif _output_mode == _OM_JSON:
                click.echo("{{\"msg_type\":\"ClientError\",\"message\":\"{}\"}}".format(e))
            if _first:
                _interactive = False

        # If initialization failed or not in interactive mode, exit main loop
        if not _initialized or _interactive == False:
            break

        if _first:
            _first = False


##
# @brief Initialize Commandlib for programmatic access
#
# This function must be called before any other CommandLib functions.
# The Config class is used to load configuration settings, but settings
# (all or some) may also be supplied as an argument to init(). This
# function establishes a secure connection to the configured DataFed
# core server.
#
# @param opts - Configuration options (optional)
# @return Tuple of authentication status and DataFed user ID
# @retval (bool,str)
# @exception Exception: if init() called more than once
#
def init( opts = {} ):
    global _initialized
    global _mapi
    global _uid
    global _cur_sel
    global _cfg
    global _devnull

    if _mapi:
        raise Exception("init function can only be called once.")

    _addConfigOptions()

    _cfg = Config.API( opts )
    opts = _defaultOptions()

    _mapi = MessageLib.API( **opts )
    _mapi.setNackExceptionEnabled( False )
    auth, uid = _mapi.getAuthStatus()
    if auth:
        _uid = uid
        _cur_sel = uid

    _devnull = open(os.devnull, "w")
    _initialized = True

    return auth, uid


##
# @brief Manually authenticate client
#
# If not authenticated, this method attempts manual authentication
# using the supplied DataFed user ID and password.
#
# @param uid - DataFed user ID
# @param password - DataFed password
# @exception Exception: if called prior to init(), or multiple login() calls.
#
def loginByPassword( uid, password ):
    global _uid
    global _cur_sel

    if not _initialized:
        raise Exception("login called before init.")

    if _uid:
        raise Exception("login can only be called once.")

    _mapi.manualAuthByPassword( uid, password )

    _uid = uid
    _cur_sel = uid

def loginByToken( token ):
    global _uid
    global _cur_sel

    if not _initialized:
        raise Exception("login called before init.")

    if _uid:
        raise Exception("login can only be called once.")

    _mapi.manualAuthByToken( token )

    _uid = _mapi._uid
    _cur_sel = _mapi._uid

##
# @brief Execute a client _cli-style command
#
# This functions executes a text-based DataFed command in the same format as
# used by the DataFed _cli. Instead of printing output, this function returns
# the received DataFed server reply directly to the caller as a Python
# protobuf message instance. Refer to the *.proto files for details on
# the message interface.
#
# @param command - String containg _cli-style DataFed command
# @exception Exception: if called prior to init(), or if command parsing fails.
# @return DataFed reply message
# @retval Protobuf message object
#
def command( command ):
    if not _initialized:
        raise Exception("command() called before init().")

    global _return_val
    global _devnull
    global _output_mode_sticky
    global _output_mode

    _return_val = None
    _output_mode_sticky = _OM_RETN
    _output_mode = _OM_RETN

    # No way was found to disable clicks help output, so pipe stdout to nothing
    old_stdout = sys.stdout
    sys.stdout = _devnull

    try:
        _args = shlex.split( command )
        _cli(prog_name="datafed",args=_args,standalone_mode=False)
    except SystemExit as e:
        pass
    except click.ClickException as e:
        raise Exception(e.format_message())
    finally:
        # Restore stdout
        sys.stdout = old_stdout

    return _return_val

# Interactive and verbosity-aware print
def _print_msg( level, message, err = False ):
    global _verbosity
    global _interactive
    if _interactive and level <= _verbosity:
        click.echo( message, err = err )

# -----------------------------------------------------------------------------------------------------------------
# Switch functions
def _set_script_opt(ctx, param, value):
    global _interactive
    global _output_mode_sticky
    global _output_mode

    if value:
        _interactive = False
        _output_mode_sticky = _OM_JSON
        _output_mode = _OM_JSON

'''
def _set_output_json(ctx, param, value):
    global _output_mode_sticky
    global _output_mode
    if value:
        _output_mode_sticky = _OM_JSON
        _output_mode = _OM_JSON

def _set_output_text(ctx, param, value):
    global _output_mode_sticky
    global _output_mode
    if value:
        _output_mode_sticky = _OM_TEXT
        _output_mode = _OM_TEXT
'''

__global_project_options = [
    click.option('-p', '--project', required=False,type=str, help='Project ID for command'),
    ]

__global_output_options = [
    click.option('-v', '--verbosity', required=False,type=click.Choice(['0', '1', '2']), help='Verbosity of reply'),
    click.option("-J", "--json", is_flag=True, help="Set _cli output format to JSON, when applicable."),
    click.option("-T", "--text", is_flag=True, help="Set _cli output format to human-friendly text.")
    ]

##############################################################################

class AliasedGroup(click.Group):
    # Allows command matching by unique suffix
    def get_command(self, ctx, cmd_name):

        # Process aliases
        if cmd_name == "cd":
            return click.Group.get_command(self, ctx, "wc")

        rv = click.Group.get_command(self, ctx, cmd_name)
        if rv is not None:
            return rv
        matches = [x for x in self.list_commands(ctx)
            if x.startswith(cmd_name)]

        if not matches:
            # Cmd was not found - might be an invalid option
            if cmd_name[:1]=="-":
                raise Exception( "Invalid option: " + cmd_name )
            # Or not, unknown command
            return None
        elif len(matches) == 1:
            return click.Group.get_command(self, ctx, matches[0])
        ctx.fail('Too many matches: %s' % ', '.join(sorted(matches)))

def _global_project_options(func):
    for option in __global_project_options:
        func = option(func)
    return func

def _global_output_options(func):
    for option in reversed(__global_output_options):
        func = option(func)
    return func


def _addConfigOptions():
    for k, v in Config._opt_info.items():
        if not v[3] & Config._OPT_NO_CL:
            if v[3] & Config._OPT_HIDE:
                hide = True
            else:
                hide = False

            if v[3] & Config._OPT_INT:
                _cli.params.append( click.Option(v[4],type=int,help=v[5],hidden=hide))
            elif v[3] & Config._OPT_BOOL:
                _cli.params.append( click.Option(v[4],is_flag=True,default=None,help=v[5],hidden=hide))
            else:
                _cli.params.append( click.Option(v[4],type=str,help=v[5],hidden=hide))

#------------------------------------------------------------------------------
# Top-level group with global options
@click.group(cls=AliasedGroup,invoke_without_command=True,context_settings=_ctxt_settings)
@click.option("-m","--manual-auth",is_flag=True,help="Force manual authentication")
#@click.option("-J", "--json", is_flag=True,callback=_set_output_json,help="Set _cli output format to JSON, when applicable.")
#@click.option("-T","--text",is_flag=True,callback=_set_output_text,help="Set _cli output format to human-friendly text.")
#@click.option("-q","--quiet",is_flag=True,help="Suppress all output except for return value. Useful for scripting where unexpected prompts would cause issues. An error is generated if input is required when silenced.")
@click.option("-s","--script",is_flag=True,is_eager=True,callback=_set_script_opt,help="Start in non-interactive scripting mode. Output is in JSON, all intermediate I/O is disabled, and certain client-side commands are unavailable.")
@click.option("--version",is_flag=True,help="Print version number and exit.")
@click.pass_context
def _cli(ctx,*args,**kwargs):
    ''''datafed' is the command-line interface (_cli) for the DataFed federated data management
    service. This _cli may be used to access most, but not all, of the features available
    via the DataFed web portal. This _cli may be used interactively (-i option), or for
    scripting (supports JSON output with the -J option).

    For more information about this _cli and DataFed in general, refer to https://datafed.ornl.gov/ui/docs
    '''

    global _verbosity
    global _verbosity_sticky

    if _mapi == None:
        _initialize(ctx.params)

    if ctx.invoked_subcommand is None:
        raise NoCommand("No command specified.")


# ------------------------------------------------------------------------------
# Collection listing/navigation commands
@_cli.command(name='ls',help="List current collection, or collection specified by ID")
@click.option("-O","--offset",default=0,help="Start list at offset")
@click.option("-C","--count",default=20,help="Limit list to count results")
@click.argument("df_id", required=False, metavar="ID")
@_global_project_options
@_global_output_options
@click.pass_context
def _ls(ctx,df_id,offset,count,project,verbosity,json,text):
    global _cur_coll
    global _most_recent_list_request
    global _most_recent_list_count

    if df_id is not None:
        cid = _resolve_coll_id(df_id,project)
    elif not df_id:
        if project is not None:
            raise Exception("Project option not allowed without a collection ID/alias")
        cid = _cur_coll

    msg = auth.CollReadRequest()
    msg.id = cid
    msg.count = count
    msg.offset = offset

    _output_checks( verbosity, json, text )

    if _verbosity > 1:
        msg.details = True
    else:
        msg.details = False

    _most_recent_list_request = msg
    _most_recent_list_count = int(msg.count)

    reply = _mapi.sendRecv( msg )
    _generic_reply_handler( reply, _print_listing )


@_cli.command(name='wc',help="Set/print current working collection or path. 'ID' can be a collection ID, alias, list index number, '-' (previous collection), or path. Only '..' and '/' are supported for paths. 'cd' is an alias for this command.")
@click.argument("df_id",required=False, metavar="ID")
@_global_output_options
@click.pass_context
def _wc(ctx,df_id,verbosity,json,text):
    if _output_mode_sticky != _OM_RETN and not _interactive:
        raise Exception("Command not supported in non-interactive modes.")

    _output_checks( verbosity, json, text )

    global _cur_coll
    global _prev_coll
    global _cur_coll_title
    global _cur_coll_prefix

    if df_id == None:
        if _cur_coll_title == None:
            _setWorkingCollectionTitle()

        if _output_mode == _OM_TEXT:
            click.echo(_cur_coll_title)
        elif _output_mode == _OM_JSON:
            click.echo("{\"wc\":\"" + _cur_coll + "\"}")
        else:
            global _return_val
            _return_val = _cur_coll
    else:
        msg = auth.CollViewRequest()
        msg.id = _resolve_coll_id(df_id)

        reply = _mapi.sendRecv( msg )

        # For RETN mode, must check for NACK
        if _checkNackReply( reply ):
            return

        _prev_coll = _cur_coll
        _cur_coll = msg.id
        coll = reply[0].coll[0]
        if coll.alias:
            _cur_coll_title = "\"{}\" ({})".format(coll.title,coll.alias)
            _cur_coll_prefix = coll.alias
        else:
            _cur_coll_title = "\"{}\" [{}]".format(coll.title,coll.id)
            _cur_coll_prefix = coll.id

@_cli.command(name='wp',help="Print current working path")
@_global_output_options
@click.pass_context
def _wp(ctx,verbosity,json,text):
    if _output_mode_sticky != _OM_RETN and not _interactive:
        raise Exception("Command not supported in non-interactive modes.")

    _output_checks( verbosity, json, text )

    msg = auth.CollGetParentsRequest()
    msg.id = _cur_coll
    msg.inclusive = True

    reply = _mapi.sendRecv( msg )
    _generic_reply_handler( reply, _print_path )


def _setWorkingCollectionTitle():
    global _cur_coll
    global _cur_coll_title

    msg = auth.CollViewRequest()
    msg.id = _cur_coll

    reply = _mapi.sendRecv( msg )

    # For RETN mode, must check for NACK
    if _checkNackReply( reply ):
        return

    coll = reply[0].coll[0]
    if coll.alias:
        _cur_coll_title = "\"{}\" ({})".format(coll.title,coll.alias)
        _cur_coll_prefix = coll.alias
    else:
        _cur_coll_title = "\"{}\" [{}]".format(coll.title,coll.id)
        _cur_coll_prefix = coll.id

@_cli.command(name='more',help="List the next set of data replies from the DataFed server. Optional argument determines number of data replies received (else the previous count will be used)")
@click.argument("count",type=int,required=False)
@_global_output_options
def _more(count,verbosity,json,text):
    if not _interactive:
        raise Exception("Command not supported in non-interactive modes.")

    global _most_recent_list_request
    global _most_recent_list_count
    _most_recent_list_request.offset += _most_recent_list_count
    if count:
        _most_recent_list_request.count = count
        _most_recent_list_count = count
    elif not count:
        _most_recent_list_request.count = _most_recent_list_count

    _output_checks( verbosity, json, text )

    reply = _mapi.sendRecv(_most_recent_list_request)

    # For RETN mode, must check for NACK
    if _checkNackReply( reply ):
        return

    for key in _listing_requests:
        if isinstance(_most_recent_list_request, key):
            _generic_reply_handler( reply, _listing_requests[key] )

# ------------------------------------------------------------------------------
# Data command group
@_cli.command(name='data',cls=AliasedGroup,help="Data subcommands")
def _data():
    pass

@_data.command(name='view',help="View data record")
@click.option("-d","--details",is_flag=True,help="Show additional fields")
@_global_project_options
@_global_output_options
@click.argument("df_id", metavar="ID")
def _data_view(df_id,details, project, verbosity,json,text):
    _output_checks( verbosity, json, text )

    msg = auth.RecordViewRequest()
    msg.id = _resolve_id(df_id,project)

    if details:
        msg.details = True
    elif not details:
        msg.details = False

    reply = _mapi.sendRecv( msg )
    _generic_reply_handler( reply, _print_data )


@_data.command(name='create',help="Create a new data record.")
@click.argument("title", required=False)
@click.option("-a","--alias",type=str,required=False,help="Alias.")
@click.option("-d","--description",type=str,required=False,help="Description text.")
@click.option("-k","--keywords",type=str,required=False,help="Keywords (comma separated list)")
@click.option("-r","--raw-data-file",type=str,required=False,help="Globus path to raw data file (local or remote) to upload with record. Default endpoint used if none provided.")
@click.option("-e","--extension",type=str,required=False,help="Override extension for raw data file (default = auto detect).")
@click.option("-m","--metadata",type=str,required=False,help="Inline metadata in JSON format.")
@click.option("-f","--metadata-file",type=click.File(mode='r'),required=False,help="Path to local metadata file containing JSON.") ####WARNING:NEEDS ABSOLUTE PATH? DOES NOT RECOGNIZE ~ AS HOME DIRECTORY
@click.option("-c","--collection",type=str,required=False, help="Parent collection ID/alias (default = current working collection)")
@click.option("-R","--repository",type=str,required=False,help="Repository ID")
@click.option("-D","--dep",multiple=True, type=click.Tuple([click.Choice(['der', 'comp', 'ver']), str]),help="Specify dependencies by listing first the type of relationship ('der', 'comp', or 'ver') follwed by ID/alias of the target record. Can be specified multiple times.")
@_global_project_options
@_global_output_options
def _data_create(title,alias,description,keywords,raw_data_file,extension,metadata,metadata_file,collection,repository,dep,project,verbosity,json,text):
    _output_checks( verbosity, json, text )

    if _output_mode_sticky == _OM_RETN and raw_data_file:
        raise Exception( "Cannot specify --raw-data-file option in API mode" )

    if metadata and metadata_file:
        raise Exception( "Cannot specify both --metadata and --metadata-file options" )

    msg = auth.RecordCreateRequest()
    msg.title = title

    if description:
        msg.desc = description

    if keywords:
        msg.keyw = keywords

    if alias:
        msg.alias = alias

    if collection:
        msg.parent_id = _resolve_coll_id(collection,project)
    else:
        if project is not None:
            raise Exception("Project option not allowed without a collection ID/alias")
        msg.parent_id = _cur_coll

    if repository:
        msg.repo_id = repository

    if extension:
        msg.ext = extension
        msg.ext_auto = False
    else:
        msg.ext_auto = True

    if metadata_file:
        metadata = metadata_file.read()

    if metadata:
        msg.metadata = metadata

    if dep:
        for d in dep:
            dp = msg.deps_add.add()
            if d[0] == "der":
                dp.type = 0
            elif d[0] == "comp":
                dp.type = 1
            elif d[0] == "ver":
                dp.type = 2
            dp.id = _resolve_id(d[1],project)

    if not raw_data_file:
        reply = _mapi.sendRecv(msg)
        _generic_reply_handler( reply, _print_data )
    else:
        if _output_mode == _OM_JSON:
            click.echo("[")
        reply = _mapi.sendRecv(msg)
        _generic_reply_handler( reply, _print_data )
        if _output_mode == _OM_JSON:
            click.echo(",")
        else:
            click.echo("")
        _put_data( reply[0].data[0].id, project, _resolve_filepath_for_xfr(raw_data_file,True), False, None )
        if _output_mode == _OM_JSON:
            click.echo("]")


@_data.command(name='update',help="Update existing data record")
@click.argument("df_id", metavar="ID", required=False)
@click.option("-t","--title",type=str,required=False,help="Title")
@click.option("-a","--alias",type=str,required=False,help="Alias")
@click.option("-d","--description",type=str,required=False,help="Description text")
@click.option("-k","--keywords",type=str,required=False,help="Keywords (comma separated list)")
@click.option("-r","--raw-data-file",type=str,required=False,help="Globus path to raw data file (local or remote) to upload with record. Default endpoint used if none provided.")
@click.option("-e","--extension",type=str,required=False,help="Override extension for raw data file (default = auto detect).")
@click.option("-m","--metadata",type=str,required=False,help="Inline metadata in JSON format.")
@click.option("-f","--metadata-file",type=click.File(mode='r'),required=False,help="Path to local metadata file containing JSON.")
@click.option("-C","--dep-clear",is_flag=True,help="Clear all dependencies on record. May be used in conjunction with --dep-add to replace existing dependencies.")
@click.option("-A","--dep-add",multiple=True, nargs=2, type=click.Tuple([click.Choice(['der', 'comp', 'ver']), str]),help="Specify new dependencies by listing first the type of relationship ('der', 'comp', or 'ver') follwed by ID/alias of the target record. Can be specified multiple times.")
@click.option("-R","--dep-rem",multiple=True, nargs=2, type=click.Tuple([click.Choice(['der', 'comp', 'ver']), str]),help="Specify dependencies to remove by listing first the type of relationship ('der', 'comp', or 'ver') follwed by ID/alias of the target record. Can be specified multiple times.")
@_global_project_options
@_global_output_options
def _data_update(df_id,title,alias,description,keywords,raw_data_file,extension,metadata,metadata_file,dep_clear,dep_add,dep_rem,project,verbosity,json,text):
    _output_checks( verbosity, json, text )

    if metadata and metadata_file:
        raise Exception( "Cannot specify both --metadata and --metadata-file options." )

    if dep_clear and dep_rem:
        raise Exception( "Cannot specify both --dep-clear and --dep-rem options." )

    msg = auth.RecordUpdateRequest()
    msg.id = _resolve_id(df_id,project)

    if title:
        msg.title = title

    if description:
        msg.desc = description

    if keywords:
        msg.keyw = keywords

    if alias:
        msg.alias = alias

    if extension:
        msg.ext = extension
        msg.ext_auto = False

    if metadata_file:
        metadata = metadata_file.read()

    if metadata:
        msg.metadata = metadata

    if dep_clear:
        msg.deps_clear = True

    if dep_add:
        for d in dep_add:
            dep = msg.deps_add.add()
            if d[0] == "der":
                dep.type = 0
            elif d[0] == "comp":
                dep.type = 1
            elif d[0] == "ver":
                dep.type = 2
            dep.id = _resolve_id(d[1],project)

    if dep_rem:
        for d in dep_rem:
            dep = msg.deps_rem.add()
            if d[0] == "der":
                dep.type = 0
            elif d[0] == "comp":
                dep.type = 1
            elif d[0] == "ver":
                dep.type = 2
            dep.id = _resolve_id(d[1],project)

    if not raw_data_file:
        reply = _mapi.sendRecv(msg)
        _generic_reply_handler( reply, _print_data )
    else:
        if _output_mode == _OM_JSON:
            click.echo("[")
        reply = _mapi.sendRecv(msg)
        _generic_reply_handler( reply, _print_data )
        if _output_mode == _OM_JSON:
            click.echo(",")
        else:
            click.echo("")
        _put_data( reply[0].data[0].id, project, _resolve_filepath_for_xfr(raw_data_file,True), False, None )
        if _output_mode == _OM_JSON:
            click.echo("]")


@_data.command(name='delete',help="Delete existing data record")
@click.option("-f","--force",is_flag=True,help="Delete record without confirmation.")
@click.argument("df_id", metavar="ID", nargs=-1)
@_global_project_options
@_global_output_options
def _data_delete(df_id, force, project, verbosity, json, text):
    resolved_list = []
    for ids in df_id:
        resolved_list.append(_resolve_id(ids,project))
    if not force:
        if not _interactive:
            raise Exception("Cannot confirm deletion while running non-interactively.")

        if not click.confirm("Confirm delete record(s) {} ('y' to delete)?".format(resolved_list)):
            return
    msg = auth.RecordDeleteRequest()
    msg.id.extend(resolved_list)

    _output_checks( verbosity, json, text )

    reply = _mapi.sendRecv(msg)
    _generic_reply_handler( reply, _print_ack_reply )


@_data.command(name='get',help="Get (download) raw data of record ID and place in local PATH")
@click.argument("df_id", required=True, metavar="ID", nargs=-1)
@click.argument("path", required=True, nargs=1)
@click.option("-w","--wait",is_flag=True,help="Block until Globus transfer is complete")
@_global_project_options
@_global_output_options
def _data_get( df_id, path, wait, project, verbosity, json, text):
    _output_checks( verbosity, json, text )

    # Request server to map specified IDs into a list of specific record IDs.
    # This accounts for download of collections.

    msg = auth.DataGetPreprocRequest()
    for ids in df_id:
        msg.id.append( _resolve_id( ids, project ))

    reply = _mapi.sendRecv(msg)

    # For RETN mode, must check for NACK
    if _checkNackReply( reply ):
        return

    # May initiate multiple transfers - one per repo with multiple records per transfer
    # Downloads may be Globus OR HTTP, but not both

    glob_list = []
    http_list = []
    for i in reply[0].item:
        if i.url:
            http_list.append((i.url, i.id))
        else:
            glob_list.append(i.id)

    if glob_list and http_list:
        raise Exception("Cannot 'get' records via Globus and http with same command.")

    if http_list:
        # HTTP transfers
        path = _resolve_filepath_for_http( path )
        #result = []
        result = auth.HttpXfrDataReply()

        for item in http_list:
            xfr = result.xfr.add()
            xfr.rec_id = item[1]
            xfr.mode = sdms.XM_GET
            setattr(xfr,"from",item[0])
            xfr.to = path
            xfr.started = int(time.time())

            try:
                filename = os.path.join( path, wget.filename_from_url( item[0] ))
                # wget has a buggy filename uniquifier, appended integer will not increase after 1
                new_filename = _uniquify(filename)

                if _output_mode == _OM_TEXT and _verbosity >= 1:
                    data_file = wget.download( item[0], out=str(new_filename), bar=_bar_adaptive_human_readable)
                    _print_msg(1,"\nRecord {} downloaded to {}".format( item[1], data_file ))
                else:
                    data_file = wget.download( item[0], out=str(new_filename), bar=None)
                    #result.append({"id":item[1],"url":item[0],"file":data_file,"status":"SUCCEEDED"})
                    xfr.to = data_file
                    xfr.updated = int(time.time())
                    xfr.status = sdms.XS_SUCCEEDED


            except Exception as e:
                _print_msg(0,"Record {} download failed: {}".format(item[1],e))
                xfr.status = sdms.XS_FAILED
                xfr.err_msg = str(e)
                xfr.updated = int(time.time())
                #result.append({"id":item[1],"url":item[0],"file":new_filename,"status":"FAILED","err_msg":str(e)})

        if _output_mode_sticky == _OM_RETN:
            global _return_val
            _return_val = {"msg_type":"HttpXfrDataReply","message":result}
            return
        elif _output_mode == _OM_JSON:
            #click.echo( jsonlib.dumps( {"msg_type":"HttpXfrDataReply","message":result} ))
            click.echo( "{{\"msg_type\":\"{}\",\"message\":{}}}".format("HttpXfrDataReply",MessageToJson( result, preserving_proto_field_name=True )))

    elif len(glob_list) > 0:
        # Globus transfers
        msg = auth.DataGetRequest()
        msg.id.extend(glob_list)
        msg.path = _resolve_filepath_for_xfr(path,False)

        if msg.path != path:
            _print_msg(1,"Initiating Globus transfer to {}".format( msg.path ))

        reply = _mapi.sendRecv(msg)

        # For RETN mode, must check for NACK
        if _checkNackReply( reply ):
            return

        if wait:
            xfr_ids = []
            replies = []
            num_xfr = len( reply[0].xfr )

            for xfrs in reply[0].xfr:
                xfr_ids.append(xfrs.id)

            _print_msg(1,"Waiting on transfer ID(s) {}".format( str( xfr_ids )))

            msg = auth.XfrViewRequest()

            while wait and num_xfr > 0:
                time.sleep(3)

                for xid in xfr_ids:
                    msg.xfr_id = xid

                    reply = _mapi.sendRecv(msg)

                    # For RETN mode, must check for NACK
                    if _checkNackReply( reply ):
                        return

                    check = reply[0].xfr[0]
                    if check.status >= 3:
                        replies.append(check)
                        num_xfr = num_xfr - 1

                    if num_xfr > 0:
                        _print_msg(1,"  Transfer {}, status: {}".format( check.id,_xfr_statuses.get( check.status, "None ")))

            # This is messy... there is no single transfer status reply available from the server after the initial request
            # Must create a new reply and insert the contents of the status replies from the polling loop
            reply = auth.XfrDataReply()
            reply.xfr.extend(replies)
            _generic_reply_handler( [reply,"XfrDataReply"], _print_xfr_stat )
        else:
            _generic_reply_handler( reply, _print_xfr_stat )
    else:
        # Will land here if tried to get a collection with no records
        raise Exception("No data records found to download")



@_data.command(name='put',help="Put (upload) raw data located at PATH to DataFed record ID.")
@click.argument("df_id", metavar="ID", required=True, nargs=1)
@click.argument("path", metavar="PATH", required=True, nargs=1)
#@click.option("-fp","--filepath",type=str,required=True,help="Path to the file being uploaded. Relative paths are acceptable if transferring from the operating file system. Note that Windows-style paths need to be escaped, i.e. all single backslashes should be entered as double backslashes. If you wish to use a Windows path from a Unix-style machine, please use an absolute path in Globus-style format (see docs for details.)")
@click.option("-w","--wait",is_flag=True,help="Block reply or further commands until transfer is complete")
#@click.option("-ep","--endpoint",type=str,required=False,help="The endpoint from which the raw data file is to be transferred. If no endpoint is specified, the current session endpoint will be used.")
@click.option("-e", "--extension",type=str,required=False,help="Override extension for raw data file (default = auto detect).")
@_global_project_options
@_global_output_options
def _data_put(df_id, path, wait, extension, project, verbosity, json, text):
    _output_checks( verbosity, json, text )

    _put_data(df_id, project, _resolve_filepath_for_xfr(path,True), wait, extension )

# ------------------------------------------------------------------------------
# Data batch command group
@_data.command(name='batch',cls=AliasedGroup,help="Data batch subcommands")
def _batch():
    pass

@_batch.command(name='create',help="Batch create data records from JSON file(s)")
@click.option("-c","--collection",type=str,required=False, help="Optional target collection")
@click.argument("file", type=str, required=True, nargs=-1)
@_global_project_options
@_global_output_options
def _data_batch_create(collection,file,project,verbosity,json,text):
    _output_checks( verbosity, json, text )

    payload = []
    tot_size = 0

    for f in file:
        fp = pathlib.Path(f)

        if not fp.is_file():
            raise Exception( "File not found: " + f )

        tot_size += fp.stat().st_size
        if tot_size > _max_payload_size:
            raise Exception( "Total batch create size exceeds limit ({})".format( _max_payload_size ))

        with fp.open('r+') as f:
            records = jsonlib.load(f)

            if not isinstance(records, list):
                records = [records]

            if collection:
                coll = _resolve_coll_id(collection,project)
                for item in records:
                    item["parent"] = coll
            else:
                if project:
                    raise Exception("Project option not allowed without a collection ID/alias")
                for item in records:
                    if "parent" not in item:
                        item["parent"] = _cur_coll

            payload.extend( records )

    msg = auth.RecordCreateBatchRequest()
    msg.records = jsonlib.dumps(payload)

    reply = _mapi.sendRecv(msg)
    _generic_reply_handler( reply, _print_batch )


@_batch.command(name='update',help="Batch update existing data records from JSON file(s)")
@click.argument("file", type=str, required=True, nargs=-1)
@_global_output_options
def _data_batch_update(file,verbosity,json,text):
    _output_checks( verbosity, json, text )

    payload = []
    tot_size = 0

    for f in file:
        fp = pathlib.Path(f)

        if not fp.is_file():
            raise Exception( "File not found: " + f )

        tot_size += fp.stat().st_size
        if tot_size > _max_payload_size:
            raise Exception( "Total batch update size exceeds limit ({})".format( _max_payload_size ))

        with fp.open('r+') as f:
            records = jsonlib.load(f)

            if not isinstance(records, list):
                payload.append( records )
            else:
                payload.extend( records )

    msg = auth.RecordUpdateBatchRequest()
    msg.records = jsonlib.dumps(payload)

    reply = _mapi.sendRecv(msg)
    _generic_reply_handler( reply, _print_ack_reply )


# ------------------------------------------------------------------------------
# Collection command group
@_cli.command(name='coll',cls=AliasedGroup,help="Collection subcommands")
def _coll():
    pass


@_coll.command(name='view',help="View collection")
@click.argument("df_id", metavar="ID")
@_global_project_options
@_global_output_options
def _coll_view(df_id, project, verbosity, json, text):
    msg = auth.CollViewRequest()
    msg.id = _resolve_coll_id(df_id,project)

    _output_checks( verbosity, json, text )

    reply = _mapi.sendRecv( msg )
    _generic_reply_handler( reply, _print_coll )


@_coll.command(name='create',help="Create new collection")
@click.argument("title")
@click.option("-a","--alias",type=str,required=False,help="Alias")
@click.option("-c","--collection",type=str,required=False,help="Parent collection ID/alias (default is current working collection)")
@click.option("-d","--description",type=str,required=False,help="Description text")
@click.option("--topic", type=str, required=False, help="Publish the collection (make associated records and data read-only to everyone) under the provided topic. Topics use periods ('.') as delimiters.")
@_global_project_options
@_global_output_options
def _coll_create(title,alias,description,topic,collection,project,verbosity,json,text):
    msg = auth.CollCreateRequest()
    msg.title = title
    if alias: msg.alias = alias
    if description: msg.desc = description
    if topic:
        msg.topic = topic
    if collection:
        msg.parent_id = _resolve_coll_id(collection,project)
    else:
        if project is not None:
            raise Exception("Project option not allowed without a collection ID/alias")

        msg.parent_id = _cur_coll

    _output_checks( verbosity, json, text )

    reply = _mapi.sendRecv(msg)
    _generic_reply_handler( reply, _print_coll )


@_coll.command(name='update',help="Update existing collection")
@click.argument("df_id", metavar="ID")
@click.option("-t","--title",type=str,required=False,help="Title")
@click.option("-a","--alias",type=str,required=False,help="Alias")
@click.option("-d","--description",type=str,required=False,help="Description text")
@click.option("--topic", type=str, required=False, help="Publish the collection under the provided topic. Topics use periods ('.') as delimiters. To revoke published status, specify '-p undo'")
@_global_project_options
@_global_output_options
def _coll_update(df_id,title,alias,description,topic,project,verbosity,json,text):
    msg = auth.CollUpdateRequest()
    msg.id = _resolve_coll_id(df_id,project)
    if title: msg.title = title
    if alias: msg.alias = alias
    if description: msg.desc = description
    if topic:
        if topic == 'undo':
            msg.topic = ""
        else:
            msg.topic = topic

    _output_checks( verbosity, json, text )

    reply = _mapi.sendRecv(msg)
    _generic_reply_handler( reply, _print_coll )


@_coll.command(name='delete',help="Delete existing collection. ID may be a collection ID or alias, or an index value from a listing.")
@click.option("-f","--force",is_flag=True,help="Delete collection without confirmation.")
@click.argument("df_id", metavar="ID", nargs=-1)
@_global_project_options
@_global_output_options
def _coll_delete(df_id, force, project, verbosity, json, text):
    resolved_list = []
    for ids in df_id:
        resolved_list.append(_resolve_coll_id(ids,project))

    if not force:
        if not _interactive:
            raise Exception("Cannot confirm deletion while running non-interactively.")

        click.echo("Warning: this will delete all data records and collections contained in the specified collection(s).")
        if not click.confirm("Continue?"):
            return

    msg = auth.CollDeleteRequest()
    msg.id.extend(resolved_list)

    _output_checks( verbosity, json, text )

    reply = _mapi.sendRecv(msg)
    _generic_reply_handler( reply, _print_ack_reply )


@_coll.command(name='add',help="Add data records and/or collections to a collection. Specify one or more items to add using the ITEM_ID arguments, and a target collection using the COLL_ID argument.")
@click.argument("item_id",metavar="ITEM_ID", required=True, nargs=-1)
@click.argument("coll_id",metavar="COLL_ID", required=True, nargs=1)
@_global_project_options
@_global_output_options
def _coll_add( item_id, coll_id, project, verbosity, json, text ):
    _output_checks( verbosity, json, text )

    msg = auth.CollWriteRequest()
    msg.id = _resolve_coll_id(coll_id,project)
    for i in item_id:
        msg.add.append(_resolve_id(i,project))

    reply = _mapi.sendRecv(msg)
    _generic_reply_handler( reply, _print_ack_reply )

@_coll.command(name='remove',help="Remove data records and/or collections from a collection. Specify one or more items to remove using the ITEM_ID arguments, and a target collection using the COLL_ID argument.")
@click.argument("item_id",metavar="ITEM_ID", required=True, nargs=-1)
@click.argument("coll_id",metavar="COLL_ID", required=True, nargs=1)
@_global_project_options
@_global_output_options
def _coll_rem( item_id, coll_id, project, verbosity, json, text ):
    _output_checks( verbosity, json, text )

    msg = auth.CollWriteRequest()
    msg.id = _resolve_coll_id(coll_id,project)
    for i in item_id:
        msg.rem.append(_resolve_id(i,project))

    reply = _mapi.sendRecv(msg)
    _generic_reply_handler( reply, _print_ack_reply )

#------------------------------------------------------------------------------
# Query command group
@_cli.command(name='query',cls=AliasedGroup,help="Query subcommands")
def _query():
    pass


@_query.command(name='list',help="List saved queries")
@click.option("-O","--offset",default=0,help="Start list at offset")
@click.option("-C","--count",default=20,help="Limit list to count results")
@_global_output_options
def _query_list(offset,count, verbosity, json, text):
    msg = auth.QueryListRequest()
    msg.offset = offset
    msg.count = count

    _output_checks( verbosity, json, text )

    global _most_recent_list_request
    global _most_recent_list_count

    _most_recent_list_request = msg
    _most_recent_list_count = int(msg.count)

    reply = _mapi.sendRecv(msg)
    _generic_reply_handler( reply, _print_listing )


@_query.command(name='exec',help="Execute a stored query by ID")
@click.argument("df_id", metavar="ID")
@_global_output_options
def _query_exec(df_id, verbosity, json, text):
    msg = auth.QueryExecRequest()
    msg.id = _resolve_id(df_id)

    _output_checks( verbosity, json, text )

    #global _most_recent_list_request
    #global _most_recent_list_count
    #_most_recent_list_request = msg
    reply = _mapi.sendRecv(msg)
    _generic_reply_handler( reply, _print_listing ) #QueryData does not match lisitng reply for print function

# ------------------------------------------------------------------------------
# User command group

@_cli.command(name='user',cls=AliasedGroup,help="User commands")
def _user():
    pass


@_user.command(name='collab',help="List all users associated with common projects")
@click.option("-O","--offset",default=0,help="Start list at offset")
@click.option("-C","--count",default=20,help="Limit list to count results")
@_global_output_options
def _user_collab(offset,count, verbosity, json, text):
    msg = auth.UserListCollabRequest()
    msg.offset = offset
    msg.count = count

    _output_checks( verbosity, json, text )

    global _most_recent_list_request
    global _most_recent_list_count
    _most_recent_list_request = msg
    _most_recent_list_count = int(msg.count)

    reply = _mapi.sendRecv(msg)
    _generic_reply_handler( reply, _print_user_listing )


@_user.command(name='all',help="List all users")
@click.option("-O","--offset",default=0,help="Start list at offset")
@click.option("-C","--count",default=20,help="Limit list to count results")
@_global_output_options
def _user_all(offset,count, verbosity, json, text):
    msg = auth.UserListAllRequest()
    msg.offset = offset
    msg.count = count

    _output_checks( verbosity, json, text )

    global _most_recent_list_request
    global _most_recent_list_count
    _most_recent_list_request = msg
    _most_recent_list_count = int(msg.count)

    reply = _mapi.sendRecv(msg)
    _generic_reply_handler( reply, _print_user_listing )


@_user.command(name='view',help="View information for user UID")
@click.argument("uid")
@_global_output_options
def _user_view(uid, verbosity, json, text):
    msg = auth.UserViewRequest()
    msg.uid = _resolve_id(uid)

    _output_checks( verbosity, json, text )

    reply = _mapi.sendRecv(msg)
    _generic_reply_handler( reply, _print_user )


@_user.command(name='who',help="Show current user identity.")
def _user_who():
    if _output_mode == _OM_TEXT:
        click.echo("User ID: {}".format(_uid))
    elif _output_mode == _OM_JSON:
        click.echo("{{\"uid\":\"{}\"}}".format(_uid))
    else:
        global _return_val
        _return_val = _uid

# ------------------------------------------------------------------------------
# Project command group

@_cli.command(name='project',cls=AliasedGroup,help="Project commands")
def _project():
    pass


@_project.command(name='list',help="List projects")
@click.option("-o","--owned",is_flag=True,help="Include owned projects")
@click.option("-a","--admin",is_flag=True,help="Include administered projects")
@click.option("-m","--member",is_flag=True,help="Include membership projects")
@click.option("-O","--offset",default=0,help="Start list at offset")
@click.option("-C","--count",default=20,help="Limit list to count results")
@_global_output_options
def _project_list(owned,admin,member,offset,count, verbosity, json, text):
    if not (owned or admin or member):
        owned = True
        admin = True
        member = True

    msg = auth.ProjectListRequest()
    msg.subject = _cur_sel
    msg.as_owner = owned
    msg.as_admin = admin
    msg.as_member = member
    msg.offset = offset
    msg.count = count

    _output_checks( verbosity, json, text )

    global _most_recent_list_request
    global _most_recent_list_count
    _most_recent_list_request = msg
    _most_recent_list_count = int(msg.count)

    reply = _mapi.sendRecv( msg )
    _generic_reply_handler( reply, _print_listing )


@_project.command(name='view',help="View project specified by ID")
@click.argument("df_id", metavar="ID")
@_global_output_options
def _project_view(df_id, verbosity, json, text):
    msg = auth.ProjectViewRequest()
    msg.id = _resolve_id(df_id)

    _output_checks( verbosity, json, text )

    reply = _mapi.sendRecv(msg)
    _generic_reply_handler( reply, _print_proj )

@_project.command(name='select',help="Select project for use. ID may be a project ID, or an index value from a project listing. If ID is omitted, current project is deselected.")
@click.argument("df_id", metavar="ID",required=False)
def _project_select(df_id):
    if _output_mode_sticky != _OM_RETN and not _interactive:
        raise Exception("Command not supported in non-interactive modes.")

    global _cur_sel
    global _cur_coll
    global _cur_alias_prefix

    if df_id == None:
        if _cur_sel == _uid:
            return

        _cur_sel = _uid
        _cur_coll = "c/u_" + _uid[2:] + "_root"
        _cur_alias_prefix = ""

        _print_msg(1,"Switched to user " + _cur_sel)
    else:
        df_id = _resolve_index_val(df_id)

        if df_id[0:2] != "p/":
            if df_id.find("/") != -1:
                raise Exception("Invalid ID - must be a project ID.")
            df_id = "p/" + df_id

        msg = auth.ProjectViewRequest()
        msg.id = df_id

        reply = _mapi.sendRecv( msg )

        # For RETN mode, must check for NACK
        if _checkNackReply( reply ):
            return

        _cur_sel = df_id
        _cur_coll = "c/p_" + _cur_sel[2:] + "_root"
        _cur_alias_prefix = "p:" + _cur_sel[2:] + ":"

        _print_msg(1,"Switched to project " + _cur_sel)

    _setWorkingCollectionTitle()

@_project.command(name='who',help="View currently selected project.")
def _project_who():
    if _output_mode_sticky != _OM_RETN and not _interactive:
        raise Exception("Command not supported in non-interactive modes.")

    global _cur_sel
    if _cur_sel and _cur_sel[:2] == "p/":
        proj = _cur_sel
    else:
        proj = None

    if _output_mode_sticky == _OM_RETN:
        global _return_val
        _return_val = proj
    elif proj:
        click.echo(proj)
    else:
        click.echo("(no project selected)")

# ------------------------------------------------------------------------------
# Shared data command group

@_cli.command(name='shared',cls=AliasedGroup,help="Shared data commands")
def _shared():
    pass


@_shared.command(name="users",help="List users with shared data")
@_global_output_options
def _shared_users(verbosity, json, text):
    msg = auth.ACLByUserRequest()

    _output_checks( verbosity, json, text )

    reply = _mapi.sendRecv( msg )
    _generic_reply_handler( reply, _print_user_listing )


@_shared.command(name="projects",help="List projects with shared data")
@_global_output_options
def _shared_projects(verbosity, json, text):
    msg = auth.ACLByProjRequest()

    _output_checks( verbosity, json, text )

    reply = _mapi.sendRecv( msg )
    _generic_reply_handler( reply, _print_proj_listing ) #Haven't tested


@_shared.command(name="ls",help="List shared data records and collections by user/project ID")
@click.argument("df_id", metavar = "ID")
@_global_output_options
def _shared_list(df_id, verbosity, json, text):
    id2 = _resolve_id(df_id)

    if id2.startswith("p/"):
        msg = auth.ACLByProjListRequest()
    else:
        if not id2.startswith("u/"):
            id2 = "u/" + id2
        msg = auth.ACLByUserListRequest()

    msg.owner = id2

    _output_checks( verbosity, json, text )

    reply = _mapi.sendRecv( msg )
    _generic_reply_handler( reply, _print_listing )


# ------------------------------------------------------------------------------
# Transfer commands

@_cli.command(name='xfr',cls=AliasedGroup,help="Globus data transfer management commands")
def _xfr():
    pass


@_xfr.command(name='list',help="List recent Globus transfers")
@click.option("-s","--since",help="List from specified time in seconds (suffix h = hours, d = days, w = weeks)")
@click.option("-f","--from","time_from",help="List from specified date/time (M/D/YYYY[,HH:MM])")
@click.option("-t","--to",help="List up to specified date/time (M/D/YYYY[,HH:MM])")
@click.option("-st","--status",type=click.Choice(["0","1","2","3","4","init","initiated","active","inactive","succeeded","failed"]),help="List transfers matching specified status")
@click.option("-l","--limit",type=int,help="Limit to 'n' most recent transfers")
@_global_output_options
def _xfr_list(time_from,to,since,status,limit,verbosity,json,text): # TODO: Absolute time is not user friendly
    if since != None and (time_from != None or to != None):
        raise Exception("Cannot specify 'since' and 'from'/'to' ranges.")

    msg = auth.XfrListRequest()

    if time_from != None:
        ts = _strToTimestamp( time_from )
        if ts == None:
            raise Exception("Invalid time format for 'from' option.")

        setattr( msg, "from", ts )

    if to != None:
        ts = _strToTimestamp( to )
        if ts == None:
            raise Exception("Invalid time format for 'to' option.")

        msg.to = ts

    if since != None:
        try:
            suf = since[-1]
            mod = 1

            if suf == 'h':
                val = int(since[:-1])
                mod = 3600
            elif suf == 'd':
                val = int(since[:-1])
                mod = 24*3600
            elif suf == 'w':
                val = int(since[:-1])
                mod = 7*24*3600
            else:
                val = int(since)

            if val == None:
                raise Exception("Invalid value for 'since'")

            msg.since = val*mod
        except:
            raise Exception("Invalid value for 'since'")

    if status in ["0","1","2","3","4"]: msg.status = int(status)
    elif status == "init" or status == "initiated": msg.status = 0
    elif status == "active": msg.status = 1
    elif status == "inactive": msg.status = 2
    elif status == "succeeded": msg.status = 3
    elif status == "failed": msg.status = 4

    if limit != None:
        try:
            lim = int(limit)
        except:
            raise Exception("Invalid limit value.")

        if lim > 0:
            msg.limit = lim
        else:
            raise Exception("Invalid limit value.")

    _output_checks( verbosity, json, text )

    reply = _mapi.sendRecv(msg)
    _generic_reply_handler( reply, _print_xfr_listing )


@_xfr.command(name='stat',help="Get status of transfer ID, or most recent transfer if ID omitted")
@click.argument( "df_id", metavar="ID", required=False )
@_global_output_options
def _xfr_stat(df_id, verbosity, json, text):
    _output_checks( verbosity, json, text )

    if df_id:
        msg = auth.XfrViewRequest()
        msg.xfr_id = _resolve_id(df_id)

        reply = _mapi.sendRecv(msg)
    elif not df_id:
        msg = auth.XfrListRequest()
        msg.limit = 1

        reply = _mapi.sendRecv(msg)

    _generic_reply_handler( reply, _print_xfr_stat )


# ------------------------------------------------------------------------------
# End-point commands

@_cli.command(name='ep',cls=AliasedGroup,help="Endpoint commands")
def _ep():
    pass


@_ep.command(name='get',help="Get Globus endpoint for the current session. At the start of the session, this will be the previously configured default endpoint.")
@_global_output_options
def _ep_get(verbosity, json, text):
    global _ep_cur

    _output_checks( verbosity, json, text )

    if not _ep_cur:
        raise Exception("No endpoint set or configured")

    if _output_mode_sticky == _OM_RETN:
        global _return_val
        _return_val = _ep_cur
    elif _output_mode == _OM_TEXT:
        click.echo(_ep_cur)
    else:
        click.echo('{{ "endpoint": "{}" }}'.format(_ep_cur))


@_ep.command(name='set',help="Set endpoint for the current session. If no endpoint is given, the configured default endpoint will be set as the current endpoint.")
@click.argument("endpoint",required=False)
@_global_output_options
def _ep_set(endpoint, verbosity, json, text):
    if _output_mode_sticky != _OM_RETN and not _interactive:
        raise Exception("Command not supported in non-interactive modes.")

    _output_checks( verbosity, json, text )

    global _ep_cur
    global _ep_default

    if endpoint:
        _ep_cur = _resolve_index_val(endpoint)
    elif _ep_default:
        _ep_cur = _ep_default
    else:
        raise Exception("No default configured.")

    if _ep_cur:
        if _output_mode_sticky == _OM_RETN:
            global _return_val
            _return_val = _ep_cur
        elif _output_mode == _OM_TEXT:
            click.echo(_ep_cur)
        else:
            click.echo('{{ "endpoint": "{}" }}'.format(_ep_cur))


@_ep.command(name='list',help="List recently used endpoints.") # TODO: Process returned paths to isolate and list indexed endpoints only. With index
@_global_output_options
def _ep_list(verbosity, json, text):
    _output_checks( verbosity, json, text )

    msg = auth.UserGetRecentEPRequest()

    reply = _mapi.sendRecv( msg )
    _generic_reply_handler( reply, _print_endpoints )

@_ep.command(name='default',cls=AliasedGroup,help="Default endpoint commands")
def _ep_default():
    pass

@_ep_default.command(name='get',help="Get the default Globus endpoint.")
@_global_output_options
def _ep_default_get( verbosity, json, text ):
    _output_checks( verbosity, json, text )

    global _ep_default

    if _ep_default == None:
        raise Exception("No default endpoint configured.")

    if _output_mode_sticky == _OM_RETN:
        global _return_val
        _return_val = _ep_default
    elif _output_mode == _OM_TEXT:
        click.echo(_ep_default)
    else:
        click.echo('{{ "endpoint": "{}" }}'.format(_ep_default))

@_ep_default.command(name='set',help="Set the default Globus endpoint. The default endpoint will be set from the 'endpoint' argument, or, if the --current options is provided, from the currently active endpoint.")
@click.argument("endpoint",required=False)
@click.option("-c","--current",is_flag=True,help="Set default endpoint to current endpoint.")
@_global_output_options
def _ep_default_set( current, endpoint, verbosity, json, text ):
    _output_checks( verbosity, json, text )

    global _ep_cur
    global _ep_default

    if current:
        if _output_mode_sticky != _OM_RETN and not _interactive:
            raise Exception("--current option not supported in non-interactive mode.")

        if _ep_cur == None:
            raise Exception("No current endpoint set.")

        _ep_default = _ep_cur
        _cfg.set("default_ep",_ep_default,True)
    elif endpoint:
        _ep_default = _resolve_index_val(endpoint)
        _cfg.set("default_ep",_ep_default,True)
        if _ep_cur == None:
            _ep_cur = _ep_default
    else:
        raise Exception("Must specify an endpoint or the --current flag.")

    if _output_mode_sticky == _OM_RETN:
        global _return_val
        _return_val = _ep_default
    elif _output_mode == _OM_TEXT:
        click.echo(_ep_default)
    else:
        click.echo('{{ "endpoint": "{}" }}'.format(_ep_default))

# ------------------------------------------------------------------------------
# Miscellaneous commands

@_cli.command(name='setup',help="Setup local credentials")
@click.pass_context
def _setup(ctx):
    cfg_dir = _cfg.get("client_cfg_dir")
    pub_file = _cfg.get("client_pub_key_file")
    priv_file = _cfg.get("client_priv_key_file")

    if cfg_dir == None and (pub_file == None or priv_file == None):
        raise Exception("Client configuration directory and/or client key files not configured")

    msg = auth.GenerateCredentialsRequest()

    reply = _mapi.sendRecv( msg )

    # For RETN mode, must check for NACK
    if _checkNackReply( reply ):
        return

    if pub_file == None:
        pub_file = os.path.join(cfg_dir, "datafed-user-key.pub")

    keyf = open( pub_file, "w" )
    keyf.write( reply[0].pub_key )
    keyf.close()

    if priv_file == None:
        priv_file = os.path.join(cfg_dir, "datafed-user-key.priv")

    keyf = open( priv_file, "w" )
    keyf.write( reply[0].priv_key )
    keyf.close()

    if _output_mode_sticky != _OM_RETN:
        _print_ack_reply()


@_cli.command(name='output',help="Set output mode. If MODE argument is 'json' or 'text', the current mode will be set accordingly. If no argument is provided, the current output mode will be displayed.")
@click.argument("mode",metavar='MODE',required=False)
@click.pass_context
def _output_mode( ctx, mode ):
    global _output_mode_sticky

    if not _interactive:
        raise Exception("Command not supported in non-interactive modes.")

    if mode == None:
        if _output_mode_sticky == _OM_TEXT:
            click.echo("text")
        elif _output_mode_sticky == _OM_JSON:
            click.echo("json")
    else:
        m = mode.lower()
        if m == "j" or m == "json":
            _output_mode_sticky = _OM_JSON
        elif m == "t" or m == "text":
            _output_mode_sticky = _OM_TEXT
        else:
            raise Exception("Invalid output mode.")

@_cli.command(name='verbosity',help="Set/display verbosity level. The verbosity level argument can be 0 (lowest), 1 (normal), or 2 (highest). If the the level is omitted, the current verbosity level is returned.")
@click.argument("level", required=False)
@click.pass_context
def _verbosity_cli(ctx,level):
    if not _interactive:
        raise Exception("Command not supported in non-interactive modes.")

    global _verbosity_sticky
    if level != None:
        try:
            v = int(level)
        except:
            raise Exception("Invalid verbosity value.")

        if v < 0 or v > 2:
            raise Exception("Invalid verbosity value.")

        _verbosity_sticky = v
    else:
        click.echo(_verbosity_sticky)

@_cli.command(name='help',help="Show datafed client help. Specify command(s) to see command-specific help.")
@click.argument("command", required=False, nargs=-1)
@click.pass_context
def _help_cli(ctx,command):
    # TODO hand non-text output modes

    if not command:
        click.echo("DataFed _cli, version {}\n".format(version))
        click.echo(ctx.parent.get_help())
    else:
        for c in command:
            if c in _cli.commands:
                click.echo(_cli.commands[c].get_help(ctx))
            else:
                click.echo("Unknown command: " + c)
                click.echo(ctx.parent.get_help())


@_cli.command(name="exit",help="Exit interactive session")
def _exit_cli():
    global _interactive

    if not _interactive:
        raise Exception("Command not supported in non-interactive modes.")

    _interactive = False
    sys.exit(0)


# ------------------------------------------------------------------------------
# Print and Utility functions

def _resolve_index_val(df_id):
    try:
        if len(df_id) <= 3:
            global _list_items
            if df_id.endswith("."):
                df_idx = int(df_id[:-1])
            else:
                df_idx = int(df_id)
            if df_idx <= len(_list_items):
                return _list_items[df_idx-1]
    except ValueError:
        pass

    return df_id


def _resolve_id(df_id,project = None):
    df_id2 = _resolve_index_val(df_id)

    if (len(df_id2) > 2 and df_id2[1] == "/") or (df_id2.find(":") > 0):
        return df_id2

    if project:
        if project[:2] == "p/":
            return "p:" + project[2:] + ":" + df_id2
        else:
            return "p:" + project + ":" + df_id2
    else:
        return _cur_alias_prefix + df_id2


def _resolve_coll_id(df_id,project = None):
    if df_id == ".":
        if project:
            raise Exception("Project option may not be used with relative paths")
        return _cur_coll
    elif df_id == "-":
        if project:
            raise Exception("Project option may not be used with previous working collection")
        return _prev_coll
    elif df_id == "/":
        if project:
            if project[:2] == "p/":
                return "c/p_" + project[2:] + "_root"
            else:
                return "c/p_" + project + "_root"
        elif _cur_sel[0] == "p":
            return "c/p_" + _cur_sel[2:] + "_root"
        else:
            return "c/u_" + _cur_sel[2:] + "_root"
    elif df_id == "..":
        if project:
            raise Exception("Project option may not be used with relative paths")
        msg = auth.CollGetParentsRequest()
        msg.id = _cur_coll

        reply = _mapi.sendRecv(msg)

        # For RETN mode, must check for NACK
        if _checkNackReply( reply ):
            return

        if len(reply[0].path) and len(reply[0].path[0].item):
            return reply[0].path[0].item[0].id
        else:
            raise Exception("Already at root")

    df_id2 = _resolve_index_val(df_id)

    if df_id2.find("/") > 0 or df_id2.find(":") > 0:
        return df_id2

    if project:
        if project[:2] == "p/":
            return "p:" + project[2:] + ":" + df_id2
        else:
            return "p:" + project + ":" + df_id2
    else:
        return _cur_alias_prefix + df_id2

def _put_data(df_id, project, path, wait, extension ):
    msg = auth.DataPutRequest()
    msg.id = _resolve_id(df_id,project)
    msg.path = path
    if extension:
        msg.ext = extension

    reply = _mapi.sendRecv(msg)

    # For RETN mode, must check for NACK
    if _checkNackReply( reply ):
        return

    if wait:
        xfr_id = reply[0].xfr[0].id
        _print_msg(1,"Waiting on transfer ID {}".format( xfr_id ))

        while wait is True:
            time.sleep(2)

            update_msg = auth.XfrViewRequest()
            update_msg.xfr_id = xfr_id

            reply = _mapi.sendRecv(update_msg)

            # For RETN mode, must check for NACK
            if _checkNackReply( reply ):
                return

            check = reply[0].xfr[0]

            if check.status == 3 or check.status == 4:
                break

            _print_msg(1,"  Status: {}".format( _xfr_statuses.get(check.status, "None") ))

        _print_msg(1,"")
        _generic_reply_handler( reply, _print_xfr_stat )
    else:
        _generic_reply_handler( reply, _print_xfr_stat )


def _resolve_filepath_for_http(path):
    if path[0] == "~":
        res = pathlib.Path(path).expanduser().resolve()
    elif path[0] == "." or path[0] != '/':
        res = pathlib.Path.cwd() / path
        res = res.resolve()
    else:
        res = path

    return str(res)

def _resolve_filepath_for_xfr(path,must_exist):
    # path arg is a string

    if path[0] == "~":
        path = pathlib.Path(path).expanduser()
    elif path[0] == ".":
        path = pathlib.Path.cwd() / path
    else:
        path = pathlib.Path(path)

    if must_exist:
        path = path.resolve()
    else:
        # Can't use resolve b/c it throws an exception when a path doesn't exist pre python 3.6
        # Must manually locate the lowest relative path component and resolve only to that point
        # Then append then remainder to the resolved portion

        idx = 0
        rel = None
        for p in path.parts:
            if p == "." or p == "..":
                rel = idx
            idx = idx + 1

        if rel != None:
            basep = pathlib.Path()
            endp = pathlib.Path()
            idx = 0
            for p in path.parts:
                if idx <= rel:
                    basep = basep.joinpath( p )
                else:
                    endp = endp.joinpath( p )
                idx = idx + 1

            path = basep.resolve().joinpath(endp)

    endpoint_name = re.compile(r'[\w\-]+#[\w\-]+')
    endpoint_uuid = re.compile(r'[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}', re.I)

    if re.match(endpoint_name, str(path)) or re.match(endpoint_uuid, str(path)): #starts with endpoint
        fp = path
    else:
        fp = pathlib.PurePath(path)

        if isinstance(fp, pathlib.PureWindowsPath):
    #        click.echo("Is Windows flavour")# If Windows flavour
            if fp.drive:
    #            click.echo("Drive name found")# turning drive letter into globus-suitable format
                drive_name = fp.drive.replace(':', '')
    #            click.echo("Stripped drive letter is {}".format(drive_name)) # TODO: testing
                parts = fp.parts[1:]
    #            click.echo(parts) # TODO: testing
                fp = pathlib.PurePosixPath('/' + drive_name)
    #            click.echo("Posix path representation is {}".format(fp)) # TODO: testing
                for item in parts:
                    fp = fp / str(item)  # adds each part
    #                click.echo(fp) # TODO: testing
            elif not fp.drive:
                fp = fp.as_posix()
    #            click.echo("No drivename found, as posix path {}".format(fp))
                if fp[0] != '/':
                    fp = "/" + fp

        global _ep_cur

        if _ep_cur:
            fp = _ep_cur + str(fp)
        else:
            raise Exception("No endpoint set")

    return str(fp)


def _generic_reply_handler( reply, printFunc ): # NOTE: Reply is a tuple containing (reply msg, msg type)
    if _output_mode_sticky == _OM_RETN:
        global _return_val
        _return_val = reply
        return

    if reply[1] == "AckReply":
        _print_ack_reply()
    elif _output_mode == _OM_JSON:
        click.echo( "{{\"msg_type\":\"{}\",\"message\":{}}}".format(reply[1],MessageToJson( reply[0], preserving_proto_field_name=True )))
    elif _output_mode == _OM_TEXT:
        printFunc( reply[0] )


def _print_ack_reply( reply = None ):
    if _output_mode == _OM_JSON:
        click.echo( "{{\"msg_type\":\"AckReply\",\"message\":{{}}}}")
        #click.echo('{}')
    elif _output_mode == _OM_TEXT and _verbosity > 0:
        click.echo("OK")

def _print_listing( message ):
    df_idx = 1
    global _list_items
    _list_items = []
    #click.echo("{:3} {:12} ({:20} {}".format("","DataFed ID","Alias)","Title")) #because projects don't have aliases
    for i in message.item:
        _list_items.append(i.id)
        if i.alias:
            click.echo("{:2}. {:12} ({:20} {}".format(df_idx,i.id,i.alias+')',i.title))
        else:
            click.echo("{:2}. {:34} {}".format(df_idx,i.id,i.title))
        df_idx += 1

def _print_user_listing( message ):
    df_idx = 1
    global _list_items
    _list_items = []
    for i in message.user:
        _list_items.append(i.uid)
        click.echo("{:2}. {:24} {}".format(df_idx,i.uid,i.name))
        df_idx += 1


def _print_proj_listing( message ): #reply is a ListingReply message
    df_idx = 1
    global _list_items
    _list_items = []
    for i in message.proj:
        _list_items.append(i.id)
        click.echo("{:2}. {:24} {}".format(df_idx,i.id,i.title))
        df_idx += 1


def _print_endpoints( message ):
    df_idx = 1
    global _list_items
    _list_items = []
    for i in message.ep:
        p = i.find("/")
        if p >= 0:
            path = i[0:p]
        try:
            idx = _list_items.index(path)
        except:
            _list_items.append(path)
            click.echo("{:2}. {}".format(df_idx,path))
            df_idx += 1


def _print_data( message ):
    for dr in message.data:
        click.echo( "{:<20} {:<50}".format('ID: ', dr.id) + '\n' +
                    "{:<20} {:<50}".format('Title: ', dr.title) + '\n' +
                    "{:<20} {:<50}".format('Alias: ', dr.alias if dr.alias else "(none)" ) + '\n' +
                    "{:<20} {:<50}".format('Keywords: ', dr.keyw if dr.keyw else "(none)" ) + '\n' +
                    "{:<20} {:<50}".format('Locked: ', str(dr.locked)))

        if dr.data_url:
            click.echo("{:<20} {:<50}".format('DOI No.: ', dr.doi))
            click.echo("{:<20} {:<50}".format('Data URL: ', dr.data_url))
        else:
            click.echo("{:<20} {:<50}".format('Data Size: ', _human_readable_bytes(dr.size)) + '\n' +
                    "{:<20} {:<50}".format('Data Repo ID: ', dr.repo_id) + '\n' +
                    "{:<20} {:<50}".format('Source: ', dr.source if dr.source else '(none)' ))
            if dr.ext_auto:
                click.echo( "{:<20} {:<50}".format('Extension: ', '(auto)'))
            else:
                click.echo( "{:<20} {:<50}".format('Extension: ', dr.ext if dr.ext else '(not set)' ))

        click.echo( "{:<20} {:<50}".format('Owner: ', dr.owner[2:]) + '\n' +
                    "{:<20} {:<50}".format('Creator: ', dr.creator[2:]) + '\n' +
                    "{:<20} {:<50}".format('Created: ', _timestampToStr(dr.ct)) + '\n' +
                    "{:<20} {:<50}".format('Updated: ', _timestampToStr(dr.ut)))

        w,h = shutil.get_terminal_size((80, 20))

        wrapper = textwrap.TextWrapper(initial_indent='  ',subsequent_indent='  ',width=w)
        if len(dr.desc) > 200 and _verbosity < 2:
            click.echo( "Description:\n\n" + wrapper.fill( dr.desc[:200] + '... (more)' ) + '\n' )
        elif len(dr.desc) > 0:
            click.echo( "Description:\n\n" + wrapper.fill( dr.desc ) + '\n')
        else:
            click.echo( "{:<20} {:<50}".format('Description: ', '(none)'))

        if _verbosity == 2:
            if dr.metadata:
                click.echo( "Metadata:\n" )
                json = jsonlib.loads( dr.metadata )
                _printJSON( json, 2, 2 )
                click.echo( "" )
                # TODO: Paging function?
            elif not dr.metadata:
                click.echo("{:<20} {:<50}".format('Metadata: ', "(none)"))
            if not dr.deps:
                click.echo("{:<20} {:<50}".format('Dependencies: ', '(none)'))
            elif dr.deps:
                click.echo("{:<20}".format('Dependencies:\n'))
                _print_deps(dr)


def _print_batch( message ):
    if _verbosity == 1:
        df_idx = 1
        global _list_items
        _list_items = []
        for i in message.data:
            _list_items.append(i.id)
            click.echo("{:2}. {:12} ({:20} {}".format(df_idx, i.id, i.alias + ')', i.title))
            df_idx += 1
        click.echo("Processed {} records.".format(len(message.data)))


def _print_coll( message ):
    for coll in message.coll:
        click.echo( "{:<20} {:<50}".format('ID: ', coll.id) + '\n' +
                    "{:<20} {:<50}".format('Title: ', coll.title) + '\n' +
                    "{:<20} {:<50}".format('Alias: ', coll.alias if coll.alias else "(none)") + '\n' +
                    "{:<20} {:<50}".format('Topic: ', coll.topic if coll.topic else '(not published)') + '\n' +
                    "{:<20} {:<50}".format('Owner: ', coll.owner[2:]) + '\n' +
                    "{:<20} {:<50}".format('Created: ', _timestampToStr(coll.ct)) + '\n' +
                    "{:<20} {:<50}".format('Updated: ', _timestampToStr(coll.ut)))

        w,h = shutil.get_terminal_size((80, 20))

        wrapper = textwrap.TextWrapper(initial_indent='  ',subsequent_indent='  ',width=w)
        if len(coll.desc) > 200 and _verbosity < 2:
            click.echo( "Description:\n\n" + wrapper.fill( coll.desc[:200] + '... (more)' ) + '\n')
        elif len(coll.desc) > 0:
            click.echo( "Description:\n\n" + wrapper.fill( coll.desc ) + '\n')
        else:
            click.echo( "{:<20} {:<50}".format('Description: ', '(none)'))

def _print_deps( dr ):
    types = {0: "is Derived from", 1: "is a Component of", 2: "is a New Version of"}
    for i in dr.deps:
        if i.dir == 0: # incoming -- DR is old, precursor, or container -- DEP is relative of DR
            click.echo("  {:12} ({:<15} {:20} {:12} ({:<15}".format(
                i.id,i.alias+')',types[i.type],dr.id,dr.alias+')'))
        elif i.dir == 1: # outgoing -- DR is new, derivation, or component -- DR is relative of DEP
            click.echo("  {:12} ({:<15} {:20} {:12} ({:<15}".format(
                dr.id,dr.alias+')',types[i.type],i.id,i.alias+')'))
    click.echo("")

def _print_xfr_listing( message ):
    df_idx = 1
    global _list_items
    _list_items = []
    for i in message.xfr:
        _list_items.append(i.id)
        xfr_mode = _xfr_modes.get(i.mode, "None")
        xfr_status = _xfr_statuses.get(i.status, "None")

        click.echo("{:2}. {:13}  {}  {}  {:10}  {}".format(df_idx,i.id,xfr_mode,_timestampToStr(i.started),xfr_status,i.rem_ep+i.rem_path))
        df_idx += 1


def _print_xfr_stat( message ):
    for xfr in message.xfr:
        xfr_mode = _xfr_modes.get(xfr.mode, "None")
        xfr_status = _xfr_statuses.get(xfr.status, "None")

        click.echo( "{:<20} {:<50}".format('Xfr ID: ', xfr.id) + '\n' +
                    "{:<20} {:<50}".format('Mode: ', xfr_mode) + '\n' +
                    "{:<20} {:<50}".format('Status: ', xfr_status))

        if xfr.status == 4:
            click.echo("{:<20} {:<50}".format('Error: ', xfr.err_msg))

        click.echo( "{:<20} {:<50}".format('Endpoint:', xfr.rem_ep) + '\n' +
                    "{:<20} {:<50}".format('Path: ', xfr.rem_path) + '\n' +
                    "{:<20} {:<50}".format('Started: ', _timestampToStr(xfr.started)) + '\n' +
                    "{:<20} {:<50}".format('Updated: ', _timestampToStr(xfr.started)))

        if _verbosity == 2:
            n = len( xfr.repo.file )
        else:
            n = min( 5, len( xfr.repo.file ))

        df_ids = ""
        n = min( 5, len( xfr.repo.file ))
        for f in range(n):
            if f > 0:
                df_ids += ", "
            df_ids += xfr.repo.file[f].id

        click.echo("{:<20} {:<50}".format('Data Record(s): ', df_ids ))

def _print_user( message ):
    for usr in message.user:
        if _verbosity >= 0:
            click.echo("{:<20} {:<50}".format('User ID: ', usr.uid) + '\n' +
                       "{:<20} {:<50}".format('Name: ', usr.name) + '\n' +
                       "{:<20} {:<50}".format('Email: ', usr.email))


def _print_proj( message ):

    for proj in message.proj:
        #for i in proj.member: members.append(i)

        w,h = shutil.get_terminal_size((80, 20))

        click.echo( "{:<20} {:<50}".format('ID: ', proj.id) + '\n' +
                    "{:<20} {:<50}".format('Title: ', proj.title) + '\n' +
                    "{:<20} {:<50}".format('Owner: ', proj.owner[2:]) + '\n' +
                    "{:<20} {:<50}".format('Created: ', _timestampToStr(proj.ct)) + '\n' +
                    "{:<20} {:<50}".format('Updated: ', _timestampToStr(proj.ut)))

        if _verbosity == 2:
            if len(proj.admin):
                text = _arrayToCSV(proj.admin,2)
                wrapper = textwrap.TextWrapper(subsequent_indent=' '*21,width=w-21)
                click.echo( "Admins:              " + wrapper.fill( text ))
            else:
                click.echo("{:<20} (none)".format('Admin(s): '))

            if len(proj.member):
                text = _arrayToCSV(proj.member,2)
                wrapper = textwrap.TextWrapper(subsequent_indent=' '*21,width=w-21)
                click.echo( "Members:             " + wrapper.fill( text ))
            else:
                click.echo("{:<20} (none)".format('Admin(s): '))

            if proj.sub_repo:
                click.echo("{:<20} {} (sub-alloc), {} total, {} used".format("Allocation:",proj.sub_repo, _human_readable_bytes(proj.sub_alloc),_human_readable_bytes(proj.sub_usage)))
            elif len(proj.alloc) > 0:
                for alloc in proj.alloc:
                    click.echo("{:<20} {}, {} total, {} used".format("Allocation:",alloc.repo, _human_readable_bytes(alloc.max_size),_human_readable_bytes(alloc.tot_size)))
            else:
                click.echo("{:<20} (none)".format("Allocation:"))

        wrapper = textwrap.TextWrapper(initial_indent='  ',subsequent_indent='  ',width=w)

        if len(proj.desc) > 200 and _verbosity < 2:
            click.echo( "Description:\n\n" + wrapper.fill( proj.desc[:200] + '... (more)' ) + '\n' )
        elif len(proj.desc) > 0:
            click.echo( "Description:\n\n" + wrapper.fill( proj.desc ) + '\n')
        else:
            click.echo( "{:<20} {:<50}".format('Description: ', '(none)'))

def _print_path( message ):
    ind = 0
    for p in message.path:
        for i in reversed(p.item):
            if ind == 0:
                if i.alias:
                    click.echo( "\"{}\" ({})".format(i.title,i.alias))
                else:
                    click.echo( "\"{}\" [{}]".format(i.title,i.id))
            else:
                if i.alias:
                    click.echo( "{:{}}\"{}\" ({})".format(' ',ind,i.title,i.alias))
                else:
                    click.echo( "{:{}}\"{}\" [{}]".format(' ',ind,i.title,i.id))
            ind = ind + 3


_listing_requests = {
    auth.UserListAllRequest: _print_user_listing,
    auth.UserListCollabRequest: _print_user_listing,
    auth.QueryListRequest: _print_listing,
    #auth.QueryExecRequest: _print_listing, #does not allow for paging on server side
    auth.TopicListRequest: '',
    auth.ProjectListRequest: _print_listing,
    auth.CollListPublishedRequest: '',
    auth.CollListRequest: '',
    auth.RecordListByAllocRequest: '',
    auth.CollReadRequest: _print_listing,
    }


def _output_checks(verbosity=None,json=None,text=None):
    global _output_mode_sticky
    if _output_mode_sticky == _OM_RETN:
        return

    global _verbosity
    global _output_mode

    if verbosity:
        # don't need to protect from invalid values here - click does that for us
        _verbosity = int(verbosity)

    if json:
        _output_mode = _OM_JSON
    elif text:
        _output_mode = _OM_TEXT


def _human_readable_bytes(size,precision=1):
    suffixes=['B','KB','MB','GB','TB', 'PB']
    suffixIndex = 0

    while size > 1024 and suffixIndex < 5:
        suffixIndex += 1 #increment the index of the suffix
        size = size/1024.0 #apply the division
    if suffixIndex == 0:
        return "{} B".format(size)
    else:
        return "{:.{}f} {}".format(size,precision,suffixes[suffixIndex])


def _uniquify(path):
    filepath = pathlib.Path(path)
    while filepath.exists():
        stem = filepath.stem #string
        suffixes = filepath.suffixes #list
        stem_parts = stem.split("__", 1) #list

        if stem_parts[-1].isdigit(): #nth copy
            index_value = int(stem_parts[-1])
            index_value += 1
            stem_parts[-1] = str(index_value)
            new_stem = "__".join(stem_parts)
            new_name = [new_stem]
            for suffix in suffixes: new_name.append(suffix)
            new_name = "".join(new_name)
            filepath = filepath.with_name(new_name)
        else: #first copy
            new_stem = stem + "__1"
            new_name = [new_stem]
            for suffix in suffixes: new_name.append(suffix)
            new_name = "".join(new_name)
            filepath = filepath.with_name(new_name)

    return str(filepath)

def _timestampToStr( ts ):
    return time.strftime("%m/%d/%Y,%H:%M", time.localtime( ts ))

def _strToTimestamp( time_str ):
    try:
        return int( time_str )
    except:
        pass

    try:
        return int( datetime.datetime.strptime( time_str, "%m/%d/%Y" ).timestamp())
    except:
        pass

    try:
        return int( datetime.datetime.strptime( time_str, "%m/%d/%Y,%H:%M" ).timestamp())
    except:
        pass

    try:
        return int( datetime.datetime.strptime( time_str, "%m/%d/%Y,%H:%M:%S" ).timestamp())
    except:
        pass

    return None

def _arrayToCSV( items, skip ):
    text = ""
    for i in items:
        if len(text):
            text += ", "
        if skip:
            text += i[skip:]
        else:
            text += i
    return text


def _printJSON( json, cur_indent, indent ):
    pref = " "*cur_indent
    last = 0

    for k, v in json.items():
        print( "" if last == 0 else ",\n", pref, end='', sep='' )
        last = 1
        if type( v ) is dict:
            if v:
                print( k, ": {" )
                _printJSON( v, cur_indent + indent, indent )
                print( "\n", pref, "}", sep='', end='' )
            else:
                print( k, ": {}", end='' )
        elif type( v ) is list:
            # Test array for dict or list values
            cplx = False
            for a in v:
                if type(a) is dict or type(a) is list:
                    cplx = True
                    break
            if cplx:
                print( k, ": [" )
                _printJSON_List( v, cur_indent + indent, indent )
                print( "\n", pref, "]", sep='', end='' )
            else:
                print( k, " : ", str( v ), sep = '', end='')
        elif type( v ) is str:
            print( k, " : \"", v, "\"", sep='', end='' )
        else:
            print( k, " : ", v,  sep = '', end='' )

def _printJSON_List( json, cur_indent, indent ):
    pref = " "*cur_indent
    last = 0
    for v in json:
        if type( v ) is dict:
            if v:
                if last == 0:
                    print( pref, "{", sep='' )
                elif last == 1:
                    print( ",{", sep='' )
                else:
                    print( ",\n",pref,"{", sep='' )

                _printJSON( v, cur_indent + indent, indent )
                print( "\n", pref, "}", sep='', end='' )
                last = 1
            else:
                if last == 0:
                    print( pref, "{}", sep='', end='' )
                elif last == 1:
                    print( ",\n{}", sep='', end='' )
                else:
                    print( ",\n",pref,"{}", sep='', end='' )
                last = 2
        else:
            print( ",\n" if last != 0 else "", pref, end='', sep ='' )
            last = 2

            if type( v ) is list:
                # Test array for dict or list values
                cplx = False
                for a in v:
                    if type(a) is dict or type(a) is list:
                        cplx = True
                        break
                if cplx:
                    print( "[" )
                    _printJSON_List( v, cur_indent + indent, indent )
                    print( pref, "]", sep='', end='' )
                else:
                    print( str( v ), end = '' )
            elif type( v ) is str:
                print( "\"", v, "\"", end='', sep='' )
            else:
                print( v, end='' )

#def bar_custom_text(current, total, width=80):
#    click.echo("Downloading: {:.2f}% [{} / {}]".format(current / total * 100, _human_readable_bytes(current), _human_readable_bytes(total)))


def _bar_adaptive_human_readable(current, total, width=80):
    """Return progress bar string for given values in one of three
    styles depending on available width:

        [..  ] downloaded / total
        downloaded / total
        [.. ]

    if total value is unknown or <= 0, show bytes counter using two
    adaptive styles:

        %s / unknown
        %s

    if there is not enough space on the screen, do not display anything

    returned string doesn't include control characters like \r used to
    place cursor at the beginning of the line to erase previous content.

    this function leaves one free character at the end of string to
    avoid automatic linefeed on Windows.
    """


    # process special case when total size is unknown and return immediately
    if not total or total < 0:
        msg = "%s / unknown" % _human_readable_bytes(current)
        if len(msg) < width:  # leaves one character to avoid linefeed
            return msg
        if len("%s" % current) < width:
            return "%s" % _human_readable_bytes(current)

    # --- adaptive layout algorithm ---
    #
    # [x] describe the format of the progress bar
    # [x] describe min width for each data field
    # [x] set priorities for each element
    # [x] select elements to be shown
    #   [x] choose top priority element min_width < avail_width
    #   [x] lessen avail_width by value if min_width
    #   [x] exclude element from priority list and repeat

    #  10% [.. ]  10/100
    # pppp bbbbb sssssss

    min_width = {
        'percent': 4,  # 100%
        'bar': 3,  # [.]
        'size': len("%s" % total) * 2 + 3,  # 'xxxx / yyyy'
    }
    priority = ['percent', 'bar', 'size']

    # select elements to show
    selected = []
    avail = width
    for field in priority:
        if min_width[field] < avail:
            selected.append(field)
            avail -= min_width[field] + 1  # +1 is for separator or for reserved space at
            # the end of line to avoid linefeed on Windows
    # render
    output = ''
    for field in selected:

        if field == 'percent':
            # fixed size width for percentage
            output += ('%s%%' % (100 * current // total)).rjust(min_width['percent'])
        elif field == 'bar':  # [. ]
            # bar takes its min width + all available space
            output += wget.bar_thermometer(current, total, min_width['bar'] + avail)
        elif field == 'size':
            # size field has a constant width (min == max)
            output += ("%s / %s" % (_human_readable_bytes(current), _human_readable_bytes(total))).rjust(min_width['size'])

        selected = selected[1:]
        if selected:
            output += ' '  # add field separator

    return output

def _checkNackReply( reply ):
    if _output_mode_sticky == _OM_RETN and reply[1] == "NackReply":
        global _return_val
        _return_val = reply
        return True
    else:
        return False

def _defaultOptions():
    opts = _cfg.getOpts()

    # Examine initial configuration options and set & save defaults where needed
    save = False

    if not "server_host" in opts:
        _cfg.set( "server_host", "datafed.ornl.gov" )
        opts["server_host"] = "datafed.ornl.gov"
        save = True

    if not "server_port" in opts:
        _cfg.set( "server_port", 7512 )
        opts["server_port"] = 7512
        save = True

    if not "server_pub_key_file" in opts:
        serv_key_file = None

        if "server_cfg_dir" in opts:
            serv_key_file = os.path.expanduser( os.path.join( opts['server_cfg_dir'], "datafed-core-key.pub" ))
            _cfg.set( "server_pub_key_file", serv_key_file )
            opts["server_pub_key_file"] = serv_key_file

        if not serv_key_file or not os.path.exists( serv_key_file ):
            serv_key_file = None
            if "client_cfg_dir" in opts:
                serv_key_file = os.path.expanduser( os.path.join( opts['client_cfg_dir'], "datafed-core-key.pub" ))
                _cfg.set( "server_pub_key_file", serv_key_file )
                opts["server_pub_key_file"] = serv_key_file
                save = True

            if not serv_key_file:
                raise Exception("Could not find location of server public key file.")

            if not os.path.exists(serv_key_file):
                # Make default server pub key file
                url = "https://"+opts["server_host"]+"/datafed-core-key.pub"
                _print_msg( 1, "Downloading server public key from " + url )
                fname = wget.download( url, out=serv_key_file, bar=_bar_adaptive_human_readable)
                _print_msg( 1, "\nServer key written to " + serv_key_file )

    if not "client_pub_key_file" in opts or not "client_priv_key_file" in opts:
        if not "client_cfg_dir" in opts:
            raise Exception("Client key file(s) or client configuration directory not specified or invalid.")

        if not "client_pub_key_file" in opts:
            key_file = os.path.expanduser( os.path.join( opts['client_cfg_dir'], "datafed-user-key.pub" ))
            _cfg.set( "client_pub_key_file", key_file )
            opts["client_pub_key_file"] = key_file
            save = True

        if not "client_priv_key_file" in opts:
            key_file = os.path.expanduser( os.path.join( opts['client_cfg_dir'], "datafed-user-key.priv" ))
            _cfg.set( "client_priv_key_file", key_file )
            opts["client_priv_key_file"] = key_file
            save = True

    if save:
        _cfg.save()

    return opts

def _initialize( opts ):
    global _initialized
    global _mapi
    global _uid
    global _output_mode_sticky
    global _output_mode
    global _verbosity_sticky
    global _verbosity
    global _interactive
    global _cur_sel
    global _cfg
    global _ep_default
    global _ep_cur

    #print("_initialize, opts:",opts)

    if "version" in opts and opts["version"]:
        click.echo( version )
        _interactive = False
        raise SystemExit()

    _cfg = Config.API( opts )
    opts =_defaultOptions()

    _ep_default = _cfg.get("default_ep")
    _ep_cur = _ep_default

    tmp = _cfg.get("verbosity")
    if tmp != None:
        _verbosity_sticky = tmp
        _verbosity = tmp

    try:
        _mapi = MessageLib.API( **opts )
    except Exception as e:
        click.echo(e)
        _interactive = False
        sys.exit(1)

    # Ignore 'manual_auth' option if set in exec mode
    if opts["manual_auth"]:
        if _output_mode == _OM_RETN:
            raise Exception("The --manual-auth option may not be used when running in API mode.")
        elif not _interactive:
            raise Exception("The --manual-auth option may not be used when running non-interactively.")

    auth, uid = _mapi.getAuthStatus()

    tmp = _cfg.get("client_token")
    if tmp != None:
        _mapi.manualAuthByToken( tmp )
    elif opts["manual_auth"] or not auth:
        if not opts["manual_auth"]:
            if not _mapi.keysLoaded():
                if _output_mode == _OM_RETN:
                    raise Exception("Not authenticated: no local credentials loaded.")
                _print_msg(1,"No local credentials loaded.")
            elif not _mapi.keysValid():
                if _output_mode == _OM_RETN:
                    raise Exception("Not authenticated: invalid local credentials.")
                _print_msg(1,"Invalid local credentials.",True)

            _print_msg(0,"Manual authentication required.")

        if not _interactive:
            raise Exception("Cannot manually authentication when running non-interactively.")

        i = 0
        while i < 3:
            i += 1
            uid = click.prompt("User ID: ")
            password = getpass.getpass(prompt="Password: ")
            try:
                _mapi.manualAuthByPassword( uid, password )
                break
            except Exception as e:
                click.echo(e)

        if i == 3:
            _print_msg(1,"Aborting...",True)
            _interactive = False
            sys.exit(1)

    _uid = uid
    _cur_sel = uid
    _initialized = True


