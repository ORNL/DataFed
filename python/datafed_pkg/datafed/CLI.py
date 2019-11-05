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
from . import CommandLib
from . import Config
from . import version

if sys.version_info.major == 3:
    unicode = str

_OM_TEXT = 0
_OM_JSON = 1
_OM_RETN = 2

_STAT_OK     = 0
_STAT_ERROR  = 1

_capi = None
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
_output_mode_sticky = _OM_TEXT
_output_mode = _OM_TEXT
_ctxt_settings = dict(help_option_names=['-?', '--help'],ignore_unknown_options=True,allow_extra_args=True)
#_most_recent_list_request = None
#_most_recent_list_count = None
_xfr_statuses = {0: "Initiated", 1: "Active", 2: "Inactive", 3: "Succeeded", 4: "Failed"}
_xfr_modes = { 0: "Get", 1: "Put", 2: "Copy"}
_initialized = False
_devnull = None


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
                # Will get here if a command was specified on command-line, assume user wants non-REPL
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
                print( "disable interactive")
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
                _print_msg( 1, "Authenticated as " + _capi.getAuthUser() )

                if _verbosity > 1:
                    _print_msg( 2, "Settings:" )
                    _capi.cfg.printSettingInfo()
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
            print("exit:",_initialized, _interactive)
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
    global _capi
    global _uid
    global _cur_sel
    global _devnull

    if _capi:
        raise Exception("init function can only be called once.")

    _addConfigOptions()

    _capi.cfg = Config.API( opts )
    opts = _defaultOptions()

    _capi = CommandlLib.API( **opts )
    uid = _capi.getAuthUser()
    if uid:
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

    _capi.loginByPassword( uid, password )

    _uid = _capi.getAuthUser()
    _cur_sel = _uid

def loginByToken( token ):
    global _uid
    global _cur_sel

    if not _initialized:
        raise Exception("login called before init.")

    if _uid:
        raise Exception("login can only be called once.")

    _capi.loginByToken( token )

    _uid = _capi.getAuthUser()
    _cur_sel = _uid

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
        _cli( prog_name="datafed", args=_args, standalone_mode=False )
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
# Option callback functions

def _set_script_cb(ctx, param, value):
    global _interactive
    global _output_mode_sticky
    global _output_mode

    if value:
        _interactive = False
        _output_mode_sticky = _OM_JSON
        _output_mode = _OM_JSON

def _set_verbosity_cb(ctx, param, value):
    global _verbosity

    # don't need to protect from invalid values here - click does that for us
    if value:
        _verbosity = int(value)

__global_context_options = [
    click.option( '-x', '--context', required=False, type=str, help='User or project ID for command context' ),
    ]

__global_output_options = [
    click.option('-v', '--verbosity', type=click.Choice(['0', '1', '2']), callback=_set_verbosity_cb, expose_value = False, help='Verbosity level of output'),
    #click.option('-v', '--verbosity', required=False,type=click.Choice(['0', '1', '2']),callback=_set_verbosity_cb, help='Verbosity level of output'),
    #click.option("-J", "--json", is_flag=True, help="Set _cli output format to JSON, when applicable."),
    #click.option("-T", "--text", is_flag=True, help="Set _cli output format to human-friendly text.")
    ]

##############################################################################

class AliasedGroup(click.Group):
    # Allows command matching by unique suffix
    def get_command(self, ctx, cmd_name):
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

# Same as AliasGroup but checks for global aliases
class AliasedGroupRoot( AliasedGroup ):
    def get_command(self, ctx, cmd_name):
        if cmd_name == "ls" or cmd_name == "dir":
            return _collItemsList
        elif cmd_name == "cd":
            return _wc

        return super().get_command( ctx, cmd_name )

def _global_context_options(func):
    for option in __global_context_options:
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
@click.group(cls=AliasedGroupRoot,invoke_without_command=True,context_settings=_ctxt_settings)
@click.option("-m","--manual-auth",is_flag=True,help="Force manual authentication")
#@click.option("-J", "--json", is_flag=True,callback=_set_output_json,help="Set _cli output format to JSON, when applicable.")
#@click.option("-T","--text",is_flag=True,callback=_set_output_text,help="Set _cli output format to human-friendly text.")
#@click.option("-q","--quiet",is_flag=True,help="Suppress all output except for return value. Useful for scripting where unexpected prompts would cause issues. An error is generated if input is required when silenced.")
@click.option("-s","--script",is_flag=True,is_eager=True,callback=_set_script_cb,help="Start in non-interactive scripting mode. Output is in JSON, all intermediate I/O is disabled, and certain client-side commands are unavailable.")
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

    if _capi == None:
        _initialize(ctx.params)

    if ctx.invoked_subcommand is None:
        raise NoCommand("No command specified.")

# =============================================================================
# --------------------------------------------------------- CLI State Functions
# =============================================================================

@_cli.command(name='wc',help="Set/print current working collection or path. 'ID' can be a collection ID, alias, list index number, '-' (previous collection), or path. Only '..' and '/' are supported for paths. 'cd' is an alias for this command.")
@click.argument("coll_id",required=False, metavar="ID")
@click.pass_context
def _wc( ctx, coll_id ):
    if _output_mode_sticky != _OM_RETN and not _interactive:
        raise Exception("Command not supported in non-interactive modes.")

    #_output_checks( verbosity, json, text )

    global _cur_coll
    global _prev_coll
    global _cur_coll_title
    global _cur_coll_prefix

    if coll_id == None:
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
        reply = _capi.collectionView( _resolve_coll_id( coll_id ))
        coll = reply[0].coll[0]
        _prev_coll = _cur_coll
        _cur_coll = coll.id

        if coll.alias:
            _cur_coll_title = "\"{}\" ({})".format(coll.title,coll.alias)
            _cur_coll_prefix = coll.alias
        else:
            _cur_coll_title = "\"{}\" [{}]".format(coll.title,coll.id)
            _cur_coll_prefix = coll.id

@_cli.command(name='wp',help="Print current working path")
@click.pass_context
def _wp( ctx ):
    if _output_mode_sticky != _OM_RETN and not _interactive:
        raise Exception("Command not supported in non-interactive modes.")

    reply = _capi.collectionGetParents( _cur_coll, True )
    _generic_reply_handler( reply, _print_path )


def _setWorkingCollectionTitle():
    global _cur_coll
    global _cur_coll_title

    reply = _capi.collectionView( _cur_coll )

    coll = reply[0].coll[0]
    if coll.alias:
        _cur_coll_title = "\"{}\" ({})".format(coll.title,coll.alias)
        _cur_coll_prefix = coll.alias
    else:
        _cur_coll_title = "\"{}\" [{}]".format(coll.title,coll.id)
        _cur_coll_prefix = coll.id




'''
@_cli.command(name='more',help="List the next set of data replies from the DataFed server. Optional argument determines number of data replies received (else the previous count will be used)")
@click.argument("count",type=int,required=False)
def _more(count):
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

    #_output_checks( verbosity, json, text )

    reply = _mapi.sendRecv(_most_recent_list_request)


    for key in _listing_requests:
        if isinstance(_most_recent_list_request, key):
            _generic_reply_handler( reply, _listing_requests[key] )
'''

# =============================================================================
# -------------------------------------------------------------- Data Functions
# =============================================================================

@_cli.command(name='data',cls=AliasedGroup,help="Data subcommands")
def _data():
    pass

@_data.command(name='view',help="View data record")
@click.option("-d","--details",is_flag=True,help="Show additional fields")
@_global_context_options
@click.argument("data_id", metavar="ID")
def _dataView( data_id, details, context ):
    reply = _capi.dataView( _resolve_id( data_id ), details = details, context = context )
    _generic_reply_handler( reply, _print_data )


@_data.command(name='create',help="Create a new data record.")
@click.argument("title", required=False)
@click.option("-a","--alias",type=str,required=False,help="Alias.")
@click.option("-d","--description",type=str,required=False,help="Description text.")
@click.option("-k","--keywords",type=str,required=False,help="Keywords (comma separated list)")
@click.option("-r","--raw-data-file",type=str,required=False,help="Globus path to raw data file (local or remote) to upload with record. Default endpoint used if none provided.")
@click.option("-e","--extension",type=str,required=False,help="Override extension for raw data file (default = auto detect).")
@click.option("-m","--metadata",type=str,required=False,help="Inline metadata in JSON format.")
@click.option("-f","--metadata-file",type=click.File(mode='r'),required=False,help="Path to local metadata file containing JSON.") 
@click.option("-p","--parent",type=str,required=False, help="Parent collection ID/alias (default = current working collection)")
@click.option("-R","--repository",type=str,required=False,help="Repository ID")
@click.option("-D","--deps",multiple=True, type=click.Tuple([click.Choice(['der', 'comp', 'ver']), str]),help="Dependencies by listing first the type of relationship ('der', 'comp', or 'ver') follwed by ID/alias of the target record. Can be specified multiple times.")
@_global_context_options
def _dataCreate( title, alias, description, keywords, raw_data_file, extension, metadata, metadata_file, parent, repository, deps, context ):
    if raw_data_file and not _interactive:
        raise Exception( "Cannot specify --raw-data-file option in non-interactive modes." )

    if metadata and metadata_file:
        raise Exception( "Cannot specify both --metadata and --metadata-file options." )

    if parent:
        parent_id = _resolve_coll_id( parent, context )
    else:
        parent_id = _cur_coll

    reply = _capi.dataCreate( title, alias = alias, description = description, keywords = keywords, extension = extension,
        metadata = metadata, metadata_file = metadata_file, parent_id = parent_id, deps = deps, repo_id = repository, context = context )
    _generic_reply_handler( reply, _print_data )

    if raw_data_file:
        click.echo("")
        reply = _capi.dataPut( reply[0].data[0].id, raw_data_file )
        _generic_reply_handler( reply, _print_xfr_stat )


@_data.command(name='update',help="Update an existing data record.")
@click.argument("data_id", metavar="ID", required=False)
@click.option("-t","--title",type=str,required=False,help="Title")
@click.option("-a","--alias",type=str,required=False,help="Alias")
@click.option("-d","--description",type=str,required=False,help="Description text")
@click.option("-k","--keywords",type=str,required=False,help="Keywords (comma separated list)")
@click.option("-r","--raw-data-file",type=str,required=False,help="Globus path to raw data file (local or remote) to upload with record. Default endpoint used if none provided.")
@click.option("-e","--extension",type=str,required=False,help="Override extension for raw data file (default = auto detect).")
@click.option("-m","--metadata",type=str,required=False,help="Inline metadata in JSON format.")
@click.option("-f","--metadata-file",type=click.File(mode='r'),required=False,help="Path to local metadata file containing JSON.")
@click.option("-S","--metadata-set",is_flag=True,required=False,help="Set (replace) existing metadata with provided instead of merging.")
@click.option("-C","--dep-clear",is_flag=True,help="Clear all dependencies on record. May be used in conjunction with --dep-add to replace existing dependencies.")
@click.option("-A","--dep-add",multiple=True, nargs=2, type=click.Tuple([click.Choice(['der', 'comp', 'ver']), str]),help="Specify new dependencies by listing first the type of relationship ('der', 'comp', or 'ver') follwed by ID/alias of the target record. Can be specified multiple times.")
@click.option("-R","--dep-rem",multiple=True, nargs=2, type=click.Tuple([click.Choice(['der', 'comp', 'ver']), str]),help="Specify dependencies to remove by listing first the type of relationship ('der', 'comp', or 'ver') followed by ID/alias of the target record. Can be specified multiple times.")
@_global_context_options
def _dataUpdate( data_id, title, alias, description, keywords, raw_data_file, extension, metadata, metadata_file, metadata_set, dep_clear, dep_add, dep_rem, context ):
    if raw_data_file and not _interactive:
        raise Exception( "Cannot specify --raw-data-file option in non-interactive modes." )

    if metadata and metadata_file:
        raise Exception( "Cannot specify both --metadata and --metadata-file options." )

    if dep_clear and dep_rem:
        raise Exception( "Cannot specify both --dep-clear and --dep-rem options." )

    reply = _capi.dataUpdate( _resolve_id( data_id ), title = title, alias = alias, description = description, keywords = keywords, extension = extension,
        metadata = metadata, metadata_file = metadata_file, metadata_set = metadata_set, dep_clear = dep_clear, dep_add = dep_add, dep_rem = dep_rem, context = context )
    _generic_reply_handler( reply, _print_data )

    if raw_data_file:
        click.echo("")
        reply = _capi.dataPut( reply[0].data[0].id, raw_data_file )
        _generic_reply_handler( reply, _print_xfr_stat )


@_data.command(name='delete',help="Delete one or more existing data records.")
@click.option("-f","--force",is_flag=True,help="Delete record without confirmation.")
@click.argument("data_id", metavar="ID", nargs=-1)
@_global_context_options
def _dataDelete( data_id, force, context ):
    resolved_ids = []
    for ids in data_id:
        resolved_ids.append( _resolve_id( ids ))

    if not force:
        if not _interactive:
            raise Exception("Cannot confirm deletion while running non-interactively.")

        if not click.confirm( "Confirm delete record(s)?" ):
            return

    reply = _capi.dataDelete( resolved_ids, context = context )
    _generic_reply_handler( reply, _print_ack_reply )


@_data.command(name='get',help="Get (download) raw data of record ID and place in local PATH")
@click.argument("df_id", required=True, metavar="ID", nargs=-1)
@click.argument("path", required=True, nargs=1)
@click.option("-w","--wait",is_flag=True,help="Block until Globus transfer is complete")
@_global_context_options
def _dataGet( df_id, path, wait, context ):
    resolved_ids = []
    for ids in df_id:
        resolved_ids.append( _resolve_id( ids ))

    reply = _capi.dataGet( resolved_ids, path, wait = wait, display_progress = _interactive, context = context )
    _generic_reply_handler( reply, _print_xfr_stat )


@_data.command(name='put',help="Put (upload) raw data located at PATH to DataFed record ID.")
@click.argument("data_id", metavar="ID", required=True, nargs=1)
@click.argument("path", metavar="PATH", required=True, nargs=1)
@click.option("-w","--wait",is_flag=True,help="Block reply or further commands until transfer is complete")
@click.option("-e", "--extension",type=str,required=False,help="Override extension for raw data file (default = auto detect).")
@_global_context_options
def _dataPut( data_id, path, wait, extension, context ):
    reply = _capi.dataPut( _resolve_id( data_id ), path, wait = wait, extension = extension, context = context )
    _generic_reply_handler( reply, _print_xfr_stat )


# =============================================================================
# -------------------------------------------------------- Data-Batch Functions
# =============================================================================

@_data.command(name='batch',cls=AliasedGroup,help="Data batch subcommands")
def _batch():
    pass

@_batch.command(name='create',help="Batch create data records from JSON file(s)")
@click.option("-c","--collection",type=str,required=False, help="Optional target collection")
@click.argument("file", type=str, required=True, nargs=-1)
@_global_context_options
def _data_batch_create( collection, file, context ):
    if collection:
        coll_id = _resolve_coll_id( collection, context )

    reply = _capi.dataBatchCreate( file, coll_id = coll_id, context = context ):
    _generic_reply_handler( reply, _print_batch )


@_batch.command(name='update',help="Batch update existing data records from JSON file(s)")
@click.argument("file", type=str, required=True, nargs=-1)
def _data_batch_update( file ):
    reply = _capi.dataBatchUpdate( file )
    _generic_reply_handler( reply, _print_batch )


# =============================================================================
# -------------------------------------------------------- Collection Functions
# =============================================================================

@_cli.command( name='coll',cls=AliasedGroup, help="Collection subcommands" )
def _coll():
    pass


@_coll.command(name='view',help="View collection")
@click.argument("coll_id", metavar="ID")
@_global_context_options
def _collView( coll_id, context ):
    reply = _capi.collectionView( _resolve_coll_id( coll_id, context ), context = context )
    _generic_reply_handler( reply, _print_coll )


@_coll.command(name='create',help="Create new collection")
@click.argument("title")
@click.option("-a","--alias",type=str,required=False,help="Alias")
@click.option("-p","--parent",type=str,required=False,help="Parent collection ID/alias (default is current working collection)")
@click.option("-d","--description",type=str,required=False,help="Description text")
@click.option("--topic", type=str, required=False, help="Publish the collection to the provided topic.")
@_global_context_options
def _collCreate( title, alias, description, topic, parent, context ):
    if parent:
        parent_id = _resolve_coll_id( parent, context )
    else:
        parent_id = _cur_coll

    reply = _capi.collectionCreate( title, alias = alias, description = description, topic = topic, parent_id = parent_id, context = context )
    _generic_reply_handler( reply, _print_coll )


@_coll.command(name='update',help="Update existing collection. ID may be a collection ID or alias, or an index value from a listing.")
@click.argument("coll_id", metavar="ID")
@click.option("-t","--title",type=str,required=False,help="Title")
@click.option("-a","--alias",type=str,required=False,help="Alias")
@click.option("-d","--description",type=str,required=False,help="Description text")
@click.option("--topic", type=str, required=False, help="Publish the collection under the provided topic.")
@_global_context_options
def _collUpdate( coll_id, title, alias, description, topic, context):
    reply = _capi.collectionUpdate( coll_id, alias = alias, description = description, topic = topic, context = context )
    _generic_reply_handler( reply, _print_coll )


@_coll.command(name='delete',help="Delete one or more existing collection(s). IDs may be collection IDs or aliases, or index values from a listing.")
@click.option("-f","--force",is_flag=True,help="Delete without confirmation.")
@click.argument("coll_id", metavar="ID", nargs=-1)
@_global_context_options
def _collDelete( coll_id, force, context ):
    resolved_ids = []
    for ids in coll_id:
        resolved_ids.append( _resolve_coll_id( ids, context = context ))

    if not force:
        if not _interactive:
            raise Exception("Cannot confirm deletion while running non-interactively.")

        click.echo("Warning: this will delete all data records and collections contained in the specified collection(s).")
        if not click.confirm("Continue?"):
            return

    reply = _capi.collectionDelete( resolved_ids, context )
    _generic_reply_handler( reply, _print_ack_reply )


@_coll.command(name='list',help="List items in collection. ID may be a collection ID or alias, an index value from a listing, or omitted for the current working collection.")
@click.option("-O","--offset",default=0,help="Start list at offset")
@click.option("-C","--count",default=20,help="Limit list to count results")
@click.argument("coll_id", required=False, metavar="ID")
@_global_context_options
@click.pass_context
def _collItemsList( ctx, coll_id, offset, count, context ):
    global _cur_coll
    #global _most_recent_list_request
    #global _most_recent_list_count

    if coll_id == None:
        cid = _cur_coll
    else:
        cid = coll_id

    #_most_recent_list_request = msg
    #_most_recent_list_count = int(msg.count)

    reply = _capi.collectionItemsList( cid, offset = offset, count = count, context = context )
    _generic_reply_handler( reply, _print_listing )


@_coll.command(name='add',help="Add data records and/or collections to a collection. COLL_ID is the destination collection and ITEM_IDs specify one or more data records and/or collections to add to the destination collection. COLL_ID and ITEM_IDs may be IDs, aliases, or index values from a listing. COLL_ID may also be a relative collection path ('.', '..', or '/').")
@click.argument("coll_id",metavar="COLL_ID", required=True, nargs=1)
@click.argument("item_id",metavar="ITEM_ID", required=True, nargs=-1)
@_global_context_options
def _collItemsAdd( coll_id, item_id, context ):
    resolved_ids = []
    for i in item_id:
        resolved_ids.append( _resolve_id( i ))

    reply = _capi.collectionItemsUpdate( _resolve_coll_id( coll_id, context ), add_ids = resolved_ids, context = context )
    _generic_reply_handler( reply, _print_ack_reply )


@_coll.command(name='remove',help="Remove data records and/or collections from a collection. COLL_ID is the containing collection and ITEM_IDs specify one or more data records and/or collections to remove from the containing collection. COLL_ID and ITEM_IDs may be IDs, aliases, or index values from a listing. COLL_ID may also be a relative collection path ('.', '..', or '/').")
@click.argument("coll_id",metavar="COLL_ID", required=True, nargs=1)
@click.argument("item_id",metavar="ITEM_ID", required=True, nargs=-1)
@_global_context_options
def _coll_rem(  coll_id, item_id, context ):
    resolved_ids = []
    for i in item_id:
        resolved_ids.append( _resolve_id( i ))

    reply = _capi.collectionItemsUpdate( _resolve_coll_id( coll_id, context ), rem_ids = resolved_ids, context = context )
    _generic_reply_handler( reply, _print_ack_reply )


# =============================================================================
# ------------------------------------------------------------- Query Functions
# =============================================================================

@_cli.command(name='query',cls=AliasedGroup,help="Query subcommands")
def _query():
    pass

@_query.command(name='list',help="List saved queries")
@click.option("-O","--offset",default=0,help="Start list at offset")
@click.option("-C","--count",default=20,help="Limit list to count results")
def _queryList( offset, count ):
    #global _most_recent_list_request
    #global _most_recent_list_count
    #_most_recent_list_request = msg
    #_most_recent_list_count = int(msg.count)

    reply = _capi.queryList( offset = offset, count = count )
    _generic_reply_handler( reply, _print_listing )


@_query.command(name='exec',help="Execute a stored query by ID")
@click.argument("qry_id", metavar="ID")
def _queryExec( qry_id ):
    #global _most_recent_list_request
    #global _most_recent_list_count
    #_most_recent_list_request = msg

    reply = _capi.queryExec( _resolve_id( qry_id ))
    _generic_reply_handler( reply, _print_listing )

# =============================================================================
# -------------------------------------------------------------- User Functions
# =============================================================================

@_cli.command(name='user',cls=AliasedGroup,help="User commands")
def _user():
    pass

@_user.command(name='collab',help="List all users associated with common projects")
@click.option("-O","--offset",default=0,help="Start list at offset")
@click.option("-C","--count",default=20,help="Limit list to count results")
def _userListCollab( offset, count ):
    #global _most_recent_list_request
    #global _most_recent_list_count
    #_most_recent_list_request = msg
    #_most_recent_list_count = int(msg.count)

    reply = _capi.userListCollaborators( offset = offset, count = count )
    _generic_reply_handler( reply, _print_user_listing )


@_user.command(name='all',help="List all users")
@click.option("-O","--offset",default=0,help="Start list at offset")
@click.option("-C","--count",default=20,help="Limit list to count results")
def _userListAll( offset, count ):
    #global _most_recent_list_request
    #global _most_recent_list_count
    #_most_recent_list_request = msg
    #_most_recent_list_count = int(msg.count)

    reply = _capi.userListAll( offset = offset, count = count )
    _generic_reply_handler( reply, _print_user_listing )


@_user.command(name='view',help="View information for user UID")
@click.argument("uid")
def _userView( uid ):
    reply = _capi.userView( uid )
    _generic_reply_handler( reply, _print_user )


@_user.command( name='who', help="Show current user identity.")
def _userWho():
    if _output_mode == _OM_TEXT:
        click.echo("User ID: {}".format(_uid))
    elif _output_mode == _OM_JSON:
        click.echo("{{\"uid\":\"{}\"}}".format(_uid))
    else:
        global _return_val
        _return_val = _uid


# =============================================================================
# ----------------------------------------------------------- Project Functions
# =============================================================================

@_cli.command(name='project',cls=AliasedGroup,help="Project commands")
def _project():
    pass


@_project.command(name='list',help="List projects")
@click.option("-o","--owned",is_flag=True,help="Include owned projects")
@click.option("-a","--admin",is_flag=True,help="Include administered projects")
@click.option("-m","--member",is_flag=True,help="Include membership projects")
@click.option("-O","--offset",default=0,help="Start list at offset")
@click.option("-C","--count",default=20,help="Limit list to count results")
def _projectList( owned, admin, member, offset, count ):
    if not (owned or admin or member):
        owned = True
        admin = True
        member = True

    #global _most_recent_list_request
    #global _most_recent_list_count
    #_most_recent_list_request = msg
    #_most_recent_list_count = int(msg.count)

    reply = _capi.projectList( self, owned = owned, admin = admin, member = member, offset = offset, count = count ):
    _generic_reply_handler( reply, _print_listing )


@_project.command(name='view',help="View project specified by ID")
@click.argument("proj_id", metavar="ID")
def _projectView( proj_id ):
    reply = _capi.projectView( _resolve_id( proj_id ))
    _generic_reply_handler( reply, _print_proj )

'''
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
'''

# =============================================================================
# ------------------------------------------------------- Shared Data Functions
# =============================================================================

@_cli.command(name='shared',cls=AliasedGroup,help="Shared data commands")
def _shared():
    pass


@_shared.command(name="users",help="List users with shared data")
def _sharedUsers():
    reply = _capi.sharedUsersList()
    _generic_reply_handler( reply, _print_user_listing )


@_shared.command(name="projects",help="List projects with shared data")
def _sharedProjects():
    reply = _capi.sharedProjectsList()
    _generic_reply_handler( reply, _print_proj_listing )


@_shared.command(name="ls",help="List shared data records and collections by user/project ID")
@click.argument("df_id", metavar = "ID")
def _sharedList( df_id ):
    reply = _capi.sharedDataList( _resolve_id( df_id ))
    _generic_reply_handler( reply, _print_listing )


# =============================================================================
# ---------------------------------------------------------- Transfer Functions
# =============================================================================

@_cli.command(name='xfr',cls=AliasedGroup,help="Globus data transfer management commands")
def _xfr():
    pass


@_xfr.command(name='list',help="List recent Globus transfers")
@click.option("-s","--since",help="List from specified time in seconds (suffix h = hours, d = days, w = weeks)")
@click.option("-f","--from","time_from",help="List from specified date/time (M/D/YYYY[,HH:MM])")
@click.option("-t","--to",help="List up to specified date/time (M/D/YYYY[,HH:MM])")
@click.option("-st","--status",type=click.Choice(["0","1","2","3","4","init","initiated","active","inactive","succeeded","failed"]),help="List transfers matching specified status")
@click.option("-l","--limit",type=int,help="Limit to 'n' most recent transfers")
def _xfrList( time_from, to, since, status, limit ):
    if since != None and (time_from != None or to != None):
        raise Exception("Cannot specify 'since' and 'from'/'to' ranges.")

    reply = _capi.xfrList( time_from = time_from, to = to, since = since, status = status, limit = limit ):
    _generic_reply_handler( reply, _print_xfr_listing )


@_xfr.command(name='stat',help="Get status of transfer ID, or most recent transfer if ID omitted")
@click.argument( "xfr_id", metavar="ID", required=False )
def _xfrStat( xfr_id ):
    reply = _capi.xfrStat( xfr_id ):
    _generic_reply_handler( reply, _print_xfr_stat )


# =============================================================================
# ---------------------------------------------------------- Endpoint Functions
# =============================================================================

@_cli.command(name='ep',cls=AliasedGroup,help="Endpoint commands")
def _ep():
    pass


@_ep.command(name='get',help="Get Globus endpoint for the current session. At the start of the session, this will be the previously configured default endpoint.")
def _epGet():
    ep = _capi.endpointGet()

    if not ep:
        raise Exception("No endpoint set or configured")

    if _output_mode_sticky == _OM_RETN:
        global _return_val
        _return_val = ep
    elif _output_mode == _OM_TEXT:
        click.echo( ep )
    else:
        click.echo('{{ "endpoint": "{}" }}'.format( ep ))


@_ep.command(name='set',help="Set endpoint for the current session. If no endpoint is given, the configured default endpoint will be set as the current endpoint.")
@click.argument("endpoint",required=False)
def _epSet( endpoint ):
    if _output_mode_sticky != _OM_RETN and not _interactive:
        raise Exception("Command not supported in non-interactive modes.")

    if endpoint:
        ep = _resolve_id( endpoint )
    else:
        ep = _capi.endpointDefaultGet()
        if not ep:
            raise Exception( "No default endpoint configured." )

    _capi.endpointSet( ep )

    if _output_mode_sticky == _OM_RETN:
        global _return_val
        _return_val = ep
    elif _output_mode == _OM_TEXT:
        click.echo( ep )
    else:
        click.echo('{{ "endpoint": "{}" }}'.format( ep ))


@_ep.command(name='list',help="List recently used endpoints.")
def _epList():
    reply = _capi.endpointListRecent()
    _generic_reply_handler( reply, _print_endpoints )


@_ep.command(name='default',cls=AliasedGroup,help="Default endpoint commands")
def _epDefault():
    pass


@_ep_default.command(name='get',help="Get the default Globus endpoint.")
def _epDefaultGet():
    ep = _capi.endpointDefaultGet()
    if not ep:
        raise Exception( "No default endpoint configured." )

    if _output_mode_sticky == _OM_RETN:
        global _return_val
        _return_val = ep
    elif _output_mode == _OM_TEXT:
        click.echo( ep )
    else:
        click.echo('{{ "endpoint": "{}" }}'.format( ep ))


@_ep_default.command(name='set',help="Set the default Globus endpoint. The default endpoint will be set from the 'endpoint' argument, or, if the --current options is provided, from the currently active endpoint.")
@click.argument("endpoint",required=False)
@click.option("-c","--current",is_flag=True,help="Set default endpoint to current endpoint.")
def _epDefaultSet( current, endpoint ):

    if current:
        if _output_mode_sticky != _OM_RETN and not _interactive:
            raise Exception("--current option not supported in non-interactive mode.")

        ep = _capi.endpointGet()
        if ep == None:
            raise Exception("No current endpoint set.")

        _capi.endpointDefaultSet( ep )
    elif endpoint:
        ep = _resolve_id( endpoint )
        _capi.endpointDefaultSet( ep )
    else:
        raise Exception("Must specify an endpoint or the --current flag.")

    if _output_mode_sticky == _OM_RETN:
        global _return_val
        _return_val = ep
    elif _output_mode == _OM_TEXT:
        click.echo( ep )
    else:
        click.echo('{{ "endpoint": "{}" }}'.format( ep ))


# =============================================================================
# -------------------------------------------------------------- Misc Functions
# =============================================================================

@_cli.command(name='setup',help="Setup local credentials")
@click.pass_context
def _setup(ctx):
    cfg_dir = _capi.cfg.get("client_cfg_dir")
    pub_file = _capi.cfg.get("client_pub_key_file")
    priv_file = _capi.cfg.get("client_priv_key_file")

    if cfg_dir == None and (pub_file == None or priv_file == None):
        raise Exception("Client configuration directory and/or client key files not configured")

    reply = _capi.generateCredentials()

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
def _outputModeSet( ctx, mode ):
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
def _verbositySet(ctx,level):
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


# =============================================================================
# ----------------------------------------------------------- Utility Functions
# =============================================================================

def _resolve_id( df_id ):
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


def _resolve_coll_id( coll_id, context = None ):
    if coll_id == ".":
        return _cur_coll
    elif coll_id == "-":
        return _prev_coll
    elif coll_id == "/":
        if context:
            if context[:2] == "p/":
                return "c/p_" + context[2:] + "_root"
            elif context[:2] == "u/":
                return "c/u_" + context[2:] + "_root"
            else:
                return "c/u_" + context + "_root"
        elif _cur_sel[0] == "p":
            return "c/p_" + _cur_sel[2:] + "_root"
        else:
            return "c/u_" + _cur_sel[2:] + "_root"
    elif coll_id == "..":
        reply = _capi.collectionGetParents( _cur_coll )

        if len(reply[0].path) and len(reply[0].path[0].item):
            return reply[0].path[0].item[0].id
        else:
            raise Exception("Already at root")
    else:
        return _resolve_id( coll_id )


def _generic_reply_handler( reply, printFunc ):
    # NOTE: Reply is a tuple containing (reply msg, msg type)

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


# =============================================================================
# ------------------------------------------------------------- Print Functions
# =============================================================================


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


def _initialize( opts ):
    print("CLI - init()")

    global _initialized
    global _capi
    global _uid
    global _output_mode_sticky
    global _output_mode
    global _verbosity_sticky
    global _verbosity
    global _interactive
    global _cur_sel

    #print("_initialize, opts:",opts)

    if "version" in opts and opts["version"]:
        click.echo( version )
        _interactive = False
        raise SystemExit()

    try:
        man_auth = opts["manual_auth"]

        if man_auth:
            if _output_mode == _OM_RETN:
                raise Exception("The --manual-auth option may not be used when running in API mode.")
            elif not _interactive:
                raise Exception("The --manual-auth option may not be used when running non-interactively.")

        # TODO change API() to accept an already inited config instance
        _capi = CommandLib.API( **opts )

        if man_auth or _capi.getAuthUser() == None:
            if not man_auth:
                if not _capi._mapi.keysLoaded():
                    if _output_mode == _OM_RETN:
                        raise Exception("Not authenticated: no local credentials loaded.")
                    _print_msg(1,"No local credentials loaded.")
                elif not _capi._mapi.keysValid():
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
                    _capi.loginByPassword( uid, password )
                    break
                except Exception as e:
                    click.echo(e)

            if i == 3:
                raise Exception("Too many failed log-in attempts.")

        tmp = _capi.cfg.get("verbosity")
        if tmp != None:
            _verbosity_sticky = tmp
            _verbosity = tmp

        uid = _capi.getAuthUser()

        _uid = uid
        _cur_sel = uid
        _initialized = True

        print("Init done. interactive:",_interactive)

    except Exception as e:
        #click.echo(e)
        _interactive = False
        raise
        #sys.exit(1)






