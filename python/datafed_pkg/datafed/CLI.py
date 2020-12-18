## @namespace datafed.CLI
# @brief Provides a high-level client interface to the DataFed server
# 
# The DataFed CLI module provides a high-level, text-based client
# interface for sending commands to, and receiving replies from, a DateFed
# server. Comands are structured hierarchically, with sub-commands taking
# specific options and arguments.
#
# The CommandLib module is meant to be embedded in a Python script or
# application, and can be used in two ways: 1) interactively via the run()
# function, or 2) programmatically via the command() function.
#
# For interactive applications, the run() function will prompt the user for
# input, then print a response. Optionally, the run() method can loop until
# the user chooses to exit.
#
# The programmatic interface consists of the init(), login(), and command()
# functions. The command() function executes a single command and returns
# a reply in the form of a Google protobuf message.

from __future__ import division, print_function, absolute_import
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


_OM_TEXT = 0
_OM_JSON = 1
_OM_RETN = 2
_STAT_OK     = 0
_STAT_ERROR  = 1

_capi = None
_return_val = None
_uid = None
_cur_ctx = None
_cur_coll = None
_cur_coll_prefix = "root"
_cur_coll_title = None
_cur_alias_prefix = ""
_prev_coll = "root"
_prev_ctx = None
_list_items = []
_interactive = True
_verbosity_sticky = 1
_verbosity = 1
_output_mode_sticky = _OM_TEXT
_output_mode = _OM_TEXT
_ctxt_settings = dict(help_option_names=['-h','--help'],ignore_unknown_options=True,allow_extra_args=True)
_task_statuses = {0: "Queued", 1: "Ready", 2: "Running", 3: "Succeeded", 4: "Failed"}
_task_types = { 0: "Data Get", 1: "Data Put", 2: "Data Del", 3: "Rec Chg Alloc", 4: "Rec Chg Owner", 5: "Rec Delete", 6: "Alloc Create", 7: "Alloc Del", 8: "User Del", 9: "Project Del"}

#_xfr_encrypt_modes = { 0: "Disabled", 1: "Enabled", 2: "Required"}
_initialized = False
_devnull = None

_hdr_lev_char = ['-','-','^',',']

# =============================================================================
# --------------------------------------- CLI Module Public Interface Functions
# =============================================================================


##
# @brief Run a CLI shell
#
# The run function will start an interactive shell that will prompt for
# command input and display human-readable output.
#
def run():
    global _output_mode_sticky
    global _output_mode
    global _verbosity_sticky
    global _verbosity
    global _interactive

    #print("CLI run")

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
                if _cur_ctx != _uid:
                    prefix = "(" + _cur_ctx + ") " + _cur_coll_prefix + ">"
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

        except _NoCommand as e:
            # Be nice and switch to interactive when no command given
            if _interactive and _first:
                _print_msg( 1, "Welcome to DataFed CLI, version {}".format(version))
                _print_msg( 1, "Authenticated as " + _capi.getAuthUser() )
                _print_msg( 1, "Use 'exit' command or Ctrl-C to exit shell." )

                if _verbosity > 1:
                    _print_msg( 2, "Settings:" )
                    _capi.cfg.printSettingInfo()
            elif not _interactive:
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
# @brief Initialize CLI for programmatic access
#
# This function must be called before calling the command() function.
# The underlying Config class is used to load configuration settings, but
# settings (all or some) may also be supplied as an argument to init(). This
# function establishes a secure connection to the configured DataFed core
# server.
#
# @param opts - Configuration options (optional)
# @return Authentication DataFed user ID, or None if could not authenticate
# @exception Exception: if init() called more than once, or configuration error
#
def init( opts = {} ):
    global _initialized
    global _capi
    global _uid
    global _cur_ctx
    global _cur_coll
    global _devnull

    if _capi:
        raise Exception("init function can only be called once.")

    _addConfigOptions()

    _capi = CommandLib.API( opts )
    uid = _capi.getAuthUser()
    if uid:
        _uid = uid
        _cur_ctx = uid
        _cur_coll = "c/u_"+uid[2:]+"_root"

    _devnull = open(os.devnull, "w")
    _initialized = True

    return uid


##
# @brief Manually authenticate client with username and password
#
# This method attempts manual authentication using the supplied DataFed user
# ID and password.
#
# @param uid - DataFed user ID
# @param password - DataFed password
# @exception Exception: if called prior to init()
#
def loginByPassword( uid, password ):
    global _uid
    global _cur_ctx

    if not _initialized:
        raise Exception("login called before init.")

    _capi.loginByPassword( uid, password )

    _uid = _capi.getAuthUser()
    _cur_ctx = _uid

##
# @brief Manually authenticate client with access token
#
# This function attempts manual authentication using the supplied Globus
# access token.
#
# @param token - Globus access token
# @exception Exception: if called prior to init()
#
def loginByToken( token ):
    global _uid
    global _cur_ctx

    if not _initialized:
        raise Exception("login called before init.")

    _capi.loginByToken( token )

    _uid = _capi.getAuthUser()
    _cur_ctx = _uid

##
# @brief Execute a client CLI-style command
#
# This functions executes a text-based DataFed command in the same format as
# used by the DataFed CLI. Instead of printing output, this function returns
# the received DataFed server reply directly to the caller as a Python
# protobuf message instance. Refer to the *.proto files for details on
# the message interface.
#
# @param command - String containing CLI-style DataFed command
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


# =============================================================================
# ------------------------------------ Click Classes, Decorators, and Callbacks
# =============================================================================

# @cond

# Aliases click commands
class _AliasedGroup(click.Group):
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

    # This is to work-around a help bug in click production code
    def resolve_command(self, ctx, args):
        cmd_name, cmd, args = super().resolve_command( ctx, args )
        return cmd.name, cmd, args

# Same as AliasGroup but checks for global aliases
class _AliasedGroupRoot( _AliasedGroup ):
    def get_command(self, ctx, cmd_name):
        if cmd_name == "dir":
            return _list
        elif cmd_name == "cd":
            return _wc
        elif cmd_name == "?":
            return _help_cli

        return super().get_command( ctx, cmd_name )

class _NoCommand(Exception):
    def __init__(self,*args,**kwargs):
        Exception.__init__(self,*args,**kwargs)

# @endcond

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

    if value:
        _verbosity = int(value)


__global_context_options = [
    click.option( '-X', '--context', required=False, type=str, help="User or project ID for command alias context. See 'alias' command help for more information." ),
    ]


# Decorator to add context option to click commands
def _global_context_options(func):
    for option in __global_context_options:
        func = option(func)
    return func


__global_output_options = [
    click.option('-v', '--verbosity', type=click.Choice(['0', '1', '2']), callback=_set_verbosity_cb, expose_value = False, help='Verbosity level of output'),
    #click.option('-v', '--verbosity', required=False,type=click.Choice(['0', '1', '2']),callback=_set_verbosity_cb, help='Verbosity level of output'),
    #click.option("-J", "--json", is_flag=True, help="Set _cli output format to JSON, when applicable."),
    #click.option("-T", "--text", is_flag=True, help="Set _cli output format to human-friendly text.")
    ]

# Decorator to add output options to click commands
def _global_output_options(func):
    for option in reversed(__global_output_options):
        func = option(func)
    return func

# =============================================================================
# -------------------------------------------------- Click Entry Point Function
# =============================================================================

@click.group(cls=_AliasedGroupRoot,invoke_without_command=True,context_settings=_ctxt_settings)
@click.option("-m","--manual-auth",is_flag=True,help="Force manual authentication")
@click.option("-s","--script",is_flag=True,is_eager=True,callback=_set_script_cb,help="Start in non-interactive scripting mode. Output is in JSON, all intermediate I/O is disabled, and certain client-side commands are unavailable.")
@click.option("--version",is_flag=True,help="Print version number and exit.")
@click.pass_context
def _cli(ctx,*args,**kwargs):
    ''''datafed' is the command-line interface (CLI) for the DataFed federated data management
    service and may be used to access many of the features available via the DataFed web
    portal. This CLI may be used interactively (human-friendly output) or for scripting (JSON
    output) by specifying the -s option.

    When the datafed CLI is run without any command arguments, a interactive shell session is
    started. While in the shell, commands should be entered without specifying the 'datafed'
    prefix.
    '''

    global _verbosity
    global _verbosity_sticky

    if _capi == None:
        _initialize(ctx.params)

    if ctx.invoked_subcommand is None:
        raise _NoCommand("No command specified.")


# =============================================================================
# --------------------------------------------------------- CLI State Functions
# =============================================================================

@_cli.command(name='gendoc',hidden=True)
@click.pass_context
def _genDoc( ctx ):

    body = _genDocCmd( None, ctx, 0, recurse = False )

    #body = _genDocHeader("General Usage",0) + "\n" + _cli.get_help( ctx.parent ) + "\n\n"

    for c in _cli.list_commands( ctx ):
        subcmd = _cli.get_command( _cli, c )
        if not subcmd.hidden:
            body = body + _genDocCmd( subcmd, click.Context( subcmd, info_name = subcmd.name, parent=ctx.parent ), 0 )

    print(body)

def _genDocHeader( cmd, level ):
    global _hdr_lev_char
    ul = ""
    ul = ul.rjust( len(cmd), _hdr_lev_char[level])

    if level == 0:
        return ul + "\n" + cmd + "\n" + ul + "\n"
    else:
        return cmd + "\n" + ul + "\n"

def _genDocCmd( cmd, ctx, level, parname = None, recurse = True ):
    if cmd == None:
        cname = "Datafed"
        cmd = _cli
    elif parname:
        cname = parname + " " + cmd.name.capitalize()
    else:
        cname = cmd.name.capitalize()

    if hasattr( cmd, 'list_commands' ):
        is_group = True
        doc = _genDocHeader( cname + " Commands", level )
    else:
        is_group = False
        doc = _genDocHeader( cname + " Command", level )

    #doc += "\n" + cmd.get_help( ctx ) + "\n\n"

    tmp = cmd.collect_usage_pieces( ctx )
    opts = []
    for param in cmd.get_params(ctx):
        rv = param.get_help_record(ctx)
        if rv is not None:
            opts.append(rv)

    doc +=  "\n" + cmd.help + "\n\nUsage::\n\n    " 
    if cname == "Datafed":
        doc += "datafed"
    else:
        doc += ctx.command_path 
    doc += " " + " ".join(tmp) + "\n\nOptions:\n\n"

    for o in opts:
        doc += o[0] + "  " + o[1] + "\n"

    doc += "\n"

    if is_group:
        doc += "Sub-Commands:\n\n===============  ============================================================\n"
        for c in cmd.list_commands( ctx ):
            subcmd = cmd.get_command( cmd, c )
            if not subcmd.hidden:
                doc += '{0: <15}  {1}\n'.format( subcmd.name, subcmd.get_short_help_str(limit=60))
        doc += "===============  ============================================================\n\n"

        if recurse:
            for c in cmd.list_commands( ctx ):
                subcmd = cmd.get_command( cmd, c )
                if not subcmd.hidden:
                    doc = doc + _genDocCmd( subcmd, click.Context( subcmd, info_name = subcmd.name, parent=ctx ), level + 1, cname )
    else:
        doc += "\n"

    return doc

@_cli.command(name='wc')
@click.argument("coll_id",required=False, metavar="ID")
def _wc( coll_id ):
    '''
    Set/print current working collection or path. 'ID' can be a collection ID, alias,
    list index number, '-' (previous collection), or path. Only '..' and '/' are
    supported for paths. 'cd' is an alias for this command.
    '''

    if _output_mode_sticky != _OM_RETN and not _interactive:
        raise Exception("Command not supported in non-interactive modes.")

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
        _id = _resolve_coll_id( coll_id )

        if len(_id) > 2:
            if _id[:2] == "p/":
                _id = "c/p_" + _id[2:] + "_root"
            elif _id[:2] == "u/":
                _id = "c/u_" + _id[2:] + "_root"

        reply = _capi.collectionView( _id )

        coll = reply[0].coll[0]

        _prev_coll = _cur_coll
        _cur_coll = coll.id

        if coll.alias:
            _cur_coll_title = "\"{}\" ({})".format(coll.title,coll.alias)
            _cur_coll_prefix = coll.alias
        else:
            _cur_coll_title = "\"{}\" [{}]".format(coll.title,coll.id)
            _cur_coll_prefix = coll.id

        global _cur_ctx
        if coll.owner != _cur_ctx:
            _cur_ctx = coll.owner
            _capi.setContext( _cur_ctx )
            if _output_mode == _OM_TEXT and _cur_ctx != _uid:
                click.echo("CLI now tracking as {}. Use 'cd //' to return to {}.".format( _cur_ctx, _uid ))


@_cli.command(name='wp')
def _wp():
    '''Get current working path. Displays the full path of the current working
    collection starting from the root collection of the associated user or
    project.
    '''

    if _output_mode_sticky != _OM_RETN and not _interactive:
        raise Exception("Command not supported in non-interactive modes.")

    reply = _capi.collectionGetParents( _cur_coll, True )
    _generic_reply_handler( reply, _print_path )

'''
@_cli.command(name='alias')
@click.argument("context",required=False, metavar="ID")
def _alias( context ):
    """
    Get or set the current user/project alias context. To set the context,
    specify a user or project ID for the ID argument. Use '-' for the ID
    argument to swap between the current and previously set context, and use
    '.' to set the context to the current authenticated user. Omitting the ID
    argument will print the current context.
    """

    if _output_mode_sticky != _OM_RETN and not _interactive:
        raise Exception("Command not supported in non-interactive modes.")

    global _cur_ctx
    global _prev_ctx

    if context:
        if context == ".":
            if _cur_ctx != _uid:
                _capi.setContext( _uid )
                _prev_ctx = _cur_ctx
                _cur_ctx = _uid
        elif context == "-":
            if _prev_ctx:
                ctx = _cur_ctx
                _cur_ctx = _prev_ctx
                _prev_ctx = ctx
                _capi.setContext( _cur_ctx )
        else:
            _capi.setContext( context )
            ctx = _capi.getContext()
            if ctx != _cur_ctx:
                _prev_ctx = _cur_ctx
                _cur_ctx = ctx

    click.echo( _capi.getContext() )
'''

# =============================================================================
# -------------------------------------------------------------- Data Functions
# =============================================================================


@_cli.command(name='data',cls=_AliasedGroup,help="Data commands.")
def _data():
    pass


@_data.command(name='view')
#@click.option("-d","--details",is_flag=True,help="Show additional fields")
@_global_context_options
@_global_output_options
@click.argument( "data_id", metavar="ID" )
def _dataView( data_id, context ):
    '''
    View data record information. Displays record title, description, tags,
    and other informational and administrative fields. ID may be a data record
    identifier, alias, or index value from a listing. By default, description
    text is truncated and metadata is not shown unless the verbosity is as
    level 2.
    '''
    reply = _capi.dataView( _resolve_id( data_id ), context = context )
    _generic_reply_handler( reply, _print_data )


@_data.command(name='create')
@click.argument("title", required=True)
@click.option("-a","--alias",type=str,required=False,help="Record alias.")
@click.option("-d","--description",type=str,required=False,help="Description text.")
@click.option("-T","--tags",type=str,required=False,help="Tags (comma separated list).")
@click.option("-r","--raw-data-file",type=str,required=False,help="Globus path to raw data file (local or remote) to upload to new record. Default endpoint is used if none provided.")
@click.option("-x","--extension",type=str,required=False,help="Override raw data file extension if provided (default is auto detect).")
@click.option("-m","--metadata",type=str,required=False,help="Inline metadata in JSON format. JSON must define an object type. Cannot be specified with --metadata-file option.")
@click.option("-f","--metadata-file",type=str,required=False,help="Path to local metadata file containing JSON. JSON must define an object type. Cannot be specified with --metadata option.") 
@click.option("-p","--parent",type=str,required=False, help="Parent collection ID, alias, or listing index. Default is the current working collection.")
@click.option("-R","--repository",type=str,required=False,help="Repository ID. Uses default allocation if not specified.")
@click.option("-D","--deps",multiple=True, type=click.Tuple([click.Choice(['der', 'comp', 'ver']), str]),help="Dependencies (provenance). Use one '--deps' option per dependency and specify with a string consisting of the type of relationship ('der', 'comp', 'ver') follwed by ID/alias of the referenced record. Relationship types are: 'der' for 'derived from', 'comp' for 'a component of', and 'ver' for 'a new version of'.")
@_global_context_options
@_global_output_options
def _dataCreate( title, alias, description, tags, raw_data_file, extension, metadata, metadata_file, parent, repository, deps, context ):
    '''
    Create a new data record. The data record 'title' is required, but all
    other attributes are optional. On success, the ID of the created data
    record is returned. Note that if a parent collection is specified, and
    that collection belongs to a project or other collaborator, the creating
    user must have permission to write to that collection. The raw-data-file
    option is only supported in interactive mode and is provided as a
    convenience to avoid a separate dataPut() call.
    '''

    if raw_data_file and not _interactive:
        raise Exception( "Cannot specify --raw-data-file option in non-interactive modes." )

    if metadata and metadata_file:
        raise Exception( "Cannot specify both --metadata and --metadata-file options." )

    if tags:
        tags = tags.split(",")

    if parent:
        parent_id = _resolve_coll_id( parent, context )
    else:
        parent_id = _cur_coll

    reply = _capi.dataCreate( title, alias = alias, description = description, tags = tags, extension = extension,
        metadata = metadata, metadata_file = metadata_file, parent_id = parent_id, deps = deps, repo_id = repository, context = context )
    _generic_reply_handler( reply, _print_data )

    if raw_data_file:
        click.echo("")
        reply = _capi.dataPut( reply[0].data[0].id, raw_data_file )
        _generic_reply_handler( reply, _print_task )


@_data.command(name='update')
@click.argument("data_id", metavar="ID", required=False)
@click.option("-t","--title",type=str,required=False,help="Title")
@click.option("-a","--alias",type=str,required=False,help="Alias")
@click.option("-d","--description",type=str,required=False,help="Description text")
@click.option("-T","--tags",type=str,required=False,help="Tags (comma separated list)")
@click.option("-r","--raw-data-file",type=str,required=False,help="Globus path to raw data file (local or remote) to upload with record. Default endpoint used if none provided.")
@click.option("-x","--extension",type=str,required=False,help="Override extension for raw data file (default = auto detect).")
@click.option("-m","--metadata",type=str,required=False,help="Inline metadata in JSON format.")
@click.option("-f","--metadata-file",type=str,required=False,help="Path to local metadata file containing JSON.")
@click.option("-S","--metadata-set",is_flag=True,required=False,help="Set (replace) existing metadata with provided instead of merging.")
@click.option("-A","--deps-add",multiple=True, nargs=2, type=click.Tuple([click.Choice(['der', 'comp', 'ver']), str]),help="Specify dependencies to add by listing first the type of relationship ('der', 'comp', or 'ver') follwed by ID/alias of the target record. Can be specified multiple times.")
@click.option("-R","--deps-rem",multiple=True, nargs=2, type=click.Tuple([click.Choice(['der', 'comp', 'ver']), str]),help="Specify dependencies to remove by listing first the type of relationship ('der', 'comp', or 'ver') followed by ID/alias of the target record. Can be specified multiple times.")
@_global_context_options
@_global_output_options
def _dataUpdate( data_id, title, alias, description, tags, raw_data_file, extension, metadata, metadata_file, metadata_set, deps_add, deps_rem, context ):
    '''
    Update an existing data record. The data record ID is required and can be
    an ID, alias, or listing index; all other record attributes are optional.
    The raw-data-file option is only supported in interactive mode and is
    provided as a convenience to avoid a separate dataPut() call.
    '''

    if raw_data_file and not _interactive:
        raise Exception( "Cannot specify --raw-data-file option in non-interactive modes." )

    if metadata and metadata_file:
        raise Exception( "Cannot specify both --metadata and --metadata-file options." )

    if tags:
        tags = tags.split(",")

    reply = _capi.dataUpdate( _resolve_id( data_id ), title = title, alias = alias, description = description, tags = tags, extension = extension,
        metadata = metadata, metadata_file = metadata_file, metadata_set = metadata_set, deps_add = deps_add, deps_rem = deps_rem, context = context )
    _generic_reply_handler( reply, _print_data )

    if raw_data_file:
        click.echo("")
        reply = _capi.dataPut( reply[0].data[0].id, raw_data_file )
        _generic_reply_handler( reply, _print_task )


@_data.command(name='delete')
@click.option("-f","--force",is_flag=True,help="Delete record(s) without confirmation.")
@click.argument("data_id", metavar="ID", nargs=-1)
@_global_context_options
def _dataDelete( data_id, force, context ):
    '''
    Delete one or more existing data records. Multiple ID arguments can be
    provided and may data record IDs, aliases, or index values from a listing.
    By default, a confirmation prompt is used, but this can be bypassed with
    the '--force' option.
    '''

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


@_data.command(name='get')
@click.argument("df_id", required=True, metavar="ID", nargs=-1)
@click.argument("path", required=True, metavar="PATH", nargs=1)
@click.option("-w","--wait",is_flag=True,help="Block until Globus transfer is complete.")
@click.option("-e","--encrypt",type=click.Choice(['0', '1', '2']),default='1',help="Encryption mode: 0 = none, 1 = if available (default), 2 = force.")
@click.option("-o","--orig_fname",is_flag=True,help="Download to original filename(s).")
@_global_context_options
def _dataGet( df_id, path, wait, encrypt, orig_fname, context ):
    '''
    Get (download) raw data of data records and/or collections. Multiple ID
    arguments can be specified and may be data record and/or collection IDs,
    aliases, or index values from s listing. The PATH argument is the
    destination for the download and can be either a full Globus path (with
    endpoint), or a local file system path (absolute or relative).
    
    Downloads will involve either Globus transfers or HTTP transfers depending
    on the source data for the selected records, and the two source types may
    not be mixed. For Globus transfers, if no endpoint is specified in the PATH
    argument, the current endpoint will be used. For HTTP transfers, the PATH
    argument may be an absolute or relative path within the local filesystem.
    For both cases, if the destination PATH doesn't exist, it will be created
    given sufficient filesystem permissions.

    Because HTTP downloads are performed directly by the CLI, they are always
    blocking calls; thus the 'wait' option only applies to Globus transfers.
    '''

    resolved_ids = []
    for ids in df_id:
        resolved_ids.append( _resolve_id( ids ))

    if _interactive:
        bar = _bar_adaptive_human_readable
    else:
        bar = None

    reply = _capi.dataGet( resolved_ids, path, encrypt = int(encrypt), orig_fname = orig_fname, wait = wait, progress_bar = bar, context = context )

    if reply[1] == "DataGetReply":
        _generic_reply_handler( reply, _print_task )


@_data.command(name='put')
@click.argument("data_id", metavar="ID", required=True, nargs=1)
@click.argument("path", metavar="PATH", required=True, nargs=1)
@click.option("-w","--wait",is_flag=True,help="Block reply or further commands until transfer is complete")
@click.option("-x", "--extension",type=str,required=False,help="Override extension for raw data file (default = auto detect).")
@click.option("-e","--encrypt",type=click.Choice(['0', '1', '2']),default='1',help="Encryption mode: 0 = none, 1 = if available (default), 2 = force.")
@_global_context_options
def _dataPut( data_id, path, wait, extension, encrypt, context ):
    '''
    Put (upload) raw data located at PATH to DataFed record ID.  The ID
    argument may be data record ID, alias, or index value from a listing.
    The PATH argument specifies the source file for the upload and can be
    either a full Globus path (with endpoint), or a local file system path
    (absolute or relative). If no endpoint is specified in the PATH
    argument, the current endpoint will be used.
    '''

    reply = _capi.dataPut( _resolve_id( data_id ), path, encrypt = int(encrypt), wait = wait, extension = extension, context = context )

    if reply[1] == "DataPutReply":
        _generic_reply_handler( reply, _print_task )
    else:
        _generic_reply_handler( reply, _print_task_array )


# =============================================================================
# -------------------------------------------------------- Data-Batch Functions
# =============================================================================

@_data.command(name='batch',cls=_AliasedGroup,help="Data batch commands.")
def _batch():
    pass

@_batch.command(name='create')
@click.option("-c","--collection",type=str,required=False, help="Optional target collection (default is root).")
@click.argument("file", type=str, required=True, metavar="FILE", nargs=-1)
@_global_context_options
def _data_batch_create( collection, file, context ):
    '''
    Batch create data records from JSON file(s). Multiple FILE arguments may be
    specified and are absolute or relative paths to JSON inputs file on a local
    filesystem. JSON input files may contain individual JSON objects, or arrays
    of JSON objects. Each JSON object represents a new data record and the JSON
    must comply with the DataFed record input schema (see online documentation).
    '''

    if collection:
        coll_id = _resolve_coll_id( collection, context )

    reply = _capi.dataBatchCreate( file, coll_id = coll_id, context = context )
    _generic_reply_handler( reply, _print_batch )


@_batch.command(name='update')
@click.argument("file", type=str, required=True, nargs=-1)
def _data_batch_update( file ):
    '''
    Batch update data records from JSON file(s). Multiple FILE arguments may be
    specified and are absolute or relative paths to JSON inputs file on a local
    filesystem. JSON input files may contain individual JSON objects, or arrays
    of JSON objects. Each JSON object represents a new data record and the JSON
    must comply with the DataFed record input schema (see online documentation).
    '''

    reply = _capi.dataBatchUpdate( file )
    _generic_reply_handler( reply, _print_batch )


# =============================================================================
# --------------------------------------------------------------- List Function
# =============================================================================

@_cli.command(name='ls')
@click.option("-O","--offset",default=0,help="Start list at offset")
@click.option("-C","--count",default=20,help="Limit list to count results")
@click.argument("item_id", required=False, metavar="ID")
@_global_context_options
@click.pass_context
def _list( ctx, item_id, offset, count, context ):
    '''
    List contents of a collection, or shared items. ID may be a collection ID
    or alias, a relative path, a user or project ID, an index value from a
    listing, or omitted for the current working collection. If the ID is a
    user or project, the ls command will list shared items associated with the
    given user or project.
    '''

    global _cur_coll

    if item_id == None:
        _id = _cur_coll
    else:
        _id = _resolve_coll_id( item_id )

    if  _id[:2] == "p/":
        if _capi.projectGetRole( _id ) == 0:
            reply = _capi.sharesListItems( _id, offset = offset, count = count, context = context )
            if _output_mode == _OM_TEXT:
                click.echo("Listing project shares:")
        else:
            reply = _capi.collectionItemsList( "c/p_"+_id[2:]+"_root", offset = offset, count = count, context = context )
            if _output_mode == _OM_TEXT:
                click.echo("Listing project root:")
    elif  _id[:2] == "u/":
        reply = _capi.sharesListItems( _id, offset = offset, count = count, context = context )
        if _output_mode == _OM_TEXT:
                click.echo("Listing user shares:")
    else:
        reply = _capi.collectionItemsList( _id, offset = offset, count = count, context = context )

    _generic_reply_handler( reply, _print_listing )

# =============================================================================
# -------------------------------------------------------- Collection Functions
# =============================================================================


@_cli.command( name='coll',cls=_AliasedGroup, help="Collection commands." )
def _coll():
    pass


@_coll.command(name='view')
@click.argument("coll_id", metavar="ID")
@_global_context_options
@_global_output_options
def _collView( coll_id, context ):
    '''
    View collection information. Displays collection title, description, and
    other administrative fields. ID may be a collection identifier, alias, or
    index value from a listing. Use 'coll list' command to see items contained
    in a collection.
    '''

    reply = _capi.collectionView( _resolve_coll_id( coll_id, context ), context = context )
    _generic_reply_handler( reply, _print_coll )


@_coll.command(name='create')
@click.argument("title")
@click.option("-a","--alias",type=str,required=False,help="Alias")
@click.option("-p","--parent",type=str,required=False,help="Parent collection ID/alias (default is current working collection)")
@click.option("-d","--description",type=str,required=False,help="Description text")
@click.option("-T","--tags",type=str,required=False,help="Tags (comma separated list).")
@click.option("--topic", type=str, required=False, help="Publish the collection to the provided topic.")
@_global_context_options
@_global_output_options
def _collCreate( title, alias, description, tags, topic, parent, context ):
    '''
    Create a new collection. The collection 'title' is required, but all
    other attributes are optional. On success, the ID of the created
    collection is returned. Note that if a parent collection is specified, and
    that collection belongs to a project or other collaborator, the creating
    user must have permission to write to that collection.
    '''

    if parent:
        parent_id = _resolve_coll_id( parent, context )
    else:
        parent_id = _cur_coll

    if tags:
        tags = tags.split(",")

    reply = _capi.collectionCreate( title, alias = alias, description = description, tags = tags, topic = topic, parent_id = parent_id, context = context )
    _generic_reply_handler( reply, _print_coll )


@_coll.command(name='update')
@click.argument("coll_id", metavar="ID")
@click.option("-t","--title",type=str,required=False,help="Title")
@click.option("-a","--alias",type=str,required=False,help="Alias")
@click.option("-d","--description",type=str,required=False,help="Description text")
@click.option("-T","--tags",type=str,required=False,help="Tags (comma separated list).")
@click.option("--topic", type=str, required=False, help="Publish the collection under the provided topic.")
@_global_context_options
@_global_output_options
def _collUpdate( coll_id, title, alias, description, tags, topic, context):
    '''
    Update an existing collection. The collection ID is required and can be
    an ID, alias, or listing index; all other collection attributes are
    optional.
    '''

    if tags:
        tags = tags.split(",")

    reply = _capi.collectionUpdate( _resolve_coll_id( coll_id, context = context ), title = title, alias = alias, description = description, tags = tags, topic = topic, context = context )
    _generic_reply_handler( reply, _print_coll )


@_coll.command(name='delete')
@click.option("-f","--force",is_flag=True,help="Delete without confirmation.")
@click.argument("coll_id", metavar="ID", nargs=-1)
@_global_context_options
def _collDelete( coll_id, force, context ):
    '''
    Delete one or more existing collections. Multiple ID arguments can be
    provided and may be collection IDs, aliases, or index values from a
    listing. By default, a confirmation prompt is used, but this can be
    bypassed with the '--force' option.

    When a collection is deleted, all contained collections are also deleted;
    however, contained data records are only deleted if they are not linked to
    another collection not involved in the deletion.
    '''

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


@_coll.command(name='add')
@click.argument("coll_id",metavar="COLL_ID", required=True, nargs=1)
@click.argument("item_id",metavar="ITEM_ID", required=True, nargs=-1)
@_global_context_options
def _collItemsAdd( coll_id, item_id, context ):
    '''
    Add data records and/or collections to a collection. COLL_ID is the
    destination collection and ITEM_IDs specify one or more data records and/or
    collections to add to the destination collection. COLL_ID and ITEM_IDs may
    be IDs, aliases, or index values from a listing. COLL_ID may also be a
    relative collection path ('.', '..', or '/').
    '''

    resolved_ids = []
    for i in item_id:
        resolved_ids.append( _resolve_id( i ))

    reply = _capi.collectionItemsUpdate( _resolve_coll_id( coll_id, context ), add_ids = resolved_ids, context = context )
    _generic_reply_handler( reply, _print_ack_reply )


@_coll.command(name='remove')
@click.argument("coll_id",metavar="COLL_ID", required=True, nargs=1)
@click.argument("item_id",metavar="ITEM_ID", required=True, nargs=-1)
@_global_context_options
def _coll_rem(  coll_id, item_id, context ):
    '''
    Remove data records and/or collections from a collection. COLL_ID is the
    containing collection and ITEM_IDs specify one or more data records and/or
    collections to remove from the containing collection. COLL_ID and ITEM_IDs
    may be IDs, aliases, or index values from a listing. COLL_ID may also be a
    relative collection path ('.', '..', or '/').
    '''

    resolved_ids = []
    for i in item_id:
        resolved_ids.append( _resolve_id( i ))

    reply = _capi.collectionItemsUpdate( _resolve_coll_id( coll_id, context ), rem_ids = resolved_ids, context = context )
    _generic_reply_handler( reply, _print_ack_reply )


# =============================================================================
# ------------------------------------------------------------- Query Functions
# =============================================================================

@_cli.command(name='query',cls=_AliasedGroup,help="Data query commands.")
def _query(*args,**kwargs):
    pass

@_query.command(name='list')
@click.option("-O","--offset",default=0,help="Start list at offset")
@click.option("-C","--count",default=20,help="Limit list to count results")
def _queryList( offset, count ):
    '''
    List saved queries.
    '''

    reply = _capi.queryList( offset = offset, count = count )
    _generic_reply_handler( reply, _print_listing )

@_query.command(name='view')
@click.argument("qry_id", metavar="ID")
def _queryView( qry_id ):
    '''
    View a saved query by ID.
    '''

    reply = _capi.queryView( _resolve_id( qry_id ))
    _generic_reply_handler( reply, _print_query )

@_query.command(name='create')
@click.option("-i","--id",help="ID/alias expression")
@click.option("-t","--text",help="Text expression")
@click.option("-m","--meta",help="Metadata expression")
@click.option("-n","--no-default",is_flag=True,help="Exclude personal data and projects")
@click.option("-c","--coll",multiple=True, type=str,help="Collection(s) to search")
@click.option("-p","--proj",multiple=True, type=str,help="Project(s) to search")
@click.argument("title", metavar="TITLE")
def _queryCreate( title, id, text, meta, no_default, coll, proj ):
    '''
    Create a saved query.
    '''

    reply = _capi.queryCreate( title, id = id, text = text, meta = meta, no_default = no_default, coll = coll, proj = proj )
    _generic_reply_handler( reply, _print_query )

@_query.command(name='update')
@click.option("--title",help="New query title")
@click.option("-i","--id",help="ID/alias expression")
@click.option("-t","--text",help="Text expression")
@click.option("-m","--meta",help="Metadata expression")
@click.argument("qry_id", metavar="ID")
def _queryUpdate( qry_id, title, id, text, meta ):
    '''
    Update a saved query. The title and search terms of a query may be updated;
    however, search scope cannot currently be changed. To remove a term,
    specify an empty string ("") for the associated option.
    '''

    reply = _capi.queryUpdate( _resolve_id( qry_id ), title = title, id = id, text = text, meta = meta )
    _generic_reply_handler( reply, _print_query )


@_query.command(name='delete')
@click.argument("qry_id", metavar="ID")
def _queryDelete( qry_id ):
    '''
    Delete a saved query by ID.
    '''

    reply = _capi.queryDelete( _resolve_id( qry_id ))
    _generic_reply_handler( reply, _print_ack_reply )


@_query.command(name='exec')
@click.option("-O","--offset",default=0,help="Start results list at offset")
@click.option("-C","--count",default=20,help="Limit to count results")
@click.argument("qry_id", metavar="ID")
def _queryExec( qry_id, offset, count ):
    '''
    Execute a saved query by ID.
    '''

    reply = _capi.queryExec( _resolve_id( qry_id ), offset = offset, count = count )
    _generic_reply_handler( reply, _print_listing )


@_query.command(name='run')
@click.option("-i","--id",help="ID/alias expression")
@click.option("-t","--text",help="Text expression")
@click.option("-m","--meta",help="Metadata expression")
@click.option("-n","--no-default",is_flag=True,help="Exclude personal data and projects")
@click.option("-c","--coll",multiple=True, type=str,help="Collection(s) to search")
@click.option("-p","--proj",multiple=True, type=str,help="Project(s) to search")
@click.option("-O","--offset",default=0,help="Start result list at offset")
@click.option("-C","--count",default=20,help="Limit to count results (default = 20)")
def _queryRun( id, text, meta, no_default, coll, proj, offset, count ):
    '''
    Run a directly entered query. Unless the 'no-default' option is included,
    the search scope includes all data owned by the authenticated user (in
    their root collection and projects that are owned or managed, or where the
    user is a member of the project. Projects and collections that are not part
    of the default scope may be added using the --proj and --coll options
    respectively.
    '''

    reply = _capi.queryDirect( id = id, text = text, meta = meta, no_default = no_default, coll = coll, proj = proj, offset = offset, count = count )
    _generic_reply_handler( reply, _print_listing )

# =============================================================================
# -------------------------------------------------------------- User Functions
# =============================================================================

@_cli.command(name='user',cls=_AliasedGroup,help="User commands.")
def _user():
    pass

@_user.command(name='collab')
@click.option("-O","--offset",default=0,help="Start list at offset")
@click.option("-C","--count",default=20,help="Limit list to count results")
def _userListCollab( offset, count ):
    '''
    List all users that are collaborators. Collaborators are defined as users
    that have projects in common with the current user, or that have data-
    sharing relationships with the current user.
    '''

    reply = _capi.userListCollaborators( offset = offset, count = count )
    _generic_reply_handler( reply, _print_user_listing )


@_user.command(name='all')
@click.option("-O","--offset",default=0,help="Start list at offset")
@click.option("-C","--count",default=20,help="Limit list to count results")
def _userListAll( offset, count ):
    '''
    List all users.
    '''

    reply = _capi.userListAll( offset = offset, count = count )
    _generic_reply_handler( reply, _print_user_listing )


@_user.command( name='view' )
@click.argument("uid", metavar="UID" )
def _userView( uid ):
    '''
    View user information.
    '''

    reply = _capi.userView( _resolve_id( uid ))
    _generic_reply_handler( reply, _print_user )


@_user.command( name='who' )
def _userWho():
    '''
    Show current authenticated user ID.
    '''

    if not _uid:
        raise Exception( "Not authenticated." )

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

@_cli.command(name='project',cls=_AliasedGroup,help="Project commands.")
def _project():
    pass


@_project.command( name='list' )
@click.option("-o","--owned",is_flag=True,help="Include owned projects")
@click.option("-a","--admin",is_flag=True,help="Include administered projects")
@click.option("-m","--member",is_flag=True,help="Include membership projects")
@click.option("-O","--offset",default=0,help="Start list at offset")
@click.option("-C","--count",default=20,help="Limit list to count results")
def _projectList( owned, admin, member, offset, count ):
    '''
    List projects associated with current user. List projects that are owned or managed by the
    current user, as well as projects were the current user is a member.
    '''

    if not (owned or admin or member):
        owned = True
        admin = True
        member = True

    reply = _capi.projectList( owned = owned, admin = admin, member = member, offset = offset, count = count )
    _generic_reply_handler( reply, _print_listing )


@_project.command(name='view')
@click.argument("proj_id", metavar="ID")
@_global_output_options
def _projectView( proj_id ):
    '''
    View project information. Current user must have a role (owner, manager, or
    member) within the project specified by the ID argument.
    '''

    reply = _capi.projectView( _resolve_id( proj_id ))
    _generic_reply_handler( reply, _print_proj )


# =============================================================================
# ------------------------------------------------------- Shared Data Functions
# =============================================================================

@_cli.command(name="shares")
@click.option("-u","--users",is_flag=True,help="Show users only")
@click.option("-p","--projects",is_flag=True,help="Show projects only")
def _shares( users, projects ):
    '''
    List users and/or projects sharing data with current user.
    '''

    # TODO - add project subject when projects shares are added
    if not users and not projects:
        reply = _capi.sharesListOwners( True, True )
    else:
        reply = _capi.sharesListOwners( users, projects )
    _generic_reply_handler( reply, _print_listing )

# =============================================================================
# ---------------------------------------------------------- Transfer Functions
# =============================================================================

@_cli.command(name='task',cls=_AliasedGroup,help="Task management commands.")
def _task():
    pass

@_task.command( name = 'list' )
@click.option("-s","--since",help="List from specified time (seconds default, suffix h = hours, d = days, w = weeks)")
@click.option("-f","--from","time_from",help="List from specified date/time (M/D/YYYY[,HH:MM])")
@click.option("-t","--to",help="List up to specified date/time (M/D/YYYY[,HH:MM])")
@click.option("-S","--status",type=click.Choice(["0","1","2","3","4","queued","ready","running","succeeded","failed"]),multiple=True,help="List tasks matching specified status")
@click.option("-O","--offset",default=0,help="Start list at offset")
@click.option("-C","--count",default=20,help="Limit list to count results")
def _taskList( time_from, to, since, status, offset, count ):
    '''
    List recent tasks. If no time or status filter options are
    provided, all tasks initiated by the current user are listed,
    most recent first. Note that the DataFed server periodically purges
    tasks history such that only up to 30 days of history are retained.
    '''

    if since != None and (time_from != None or to != None):
        raise Exception("Cannot specify 'since' and 'from'/'to' ranges.")

    reply = _capi.taskList( time_from = time_from, time_to = to, since = since, status = status, offset = offset, count = count )
    _generic_reply_handler( reply, _print_task_listing )


@_task.command(name='view')
@click.argument( "task_id", metavar="ID", required=False )
def _taskView( task_id ):
    '''
    Show task information. Use the ID argument to view a specific task
    record, or omit to view the latest task initiated by the current user.
    '''
    if task_id:
        _id = _resolve_id( task_id )
    else:
        _id = task_id
    reply = _capi.taskView( _id )
    _generic_reply_handler( reply, _print_task_array )


# =============================================================================
# ---------------------------------------------------------- Endpoint Functions
# =============================================================================

@_cli.command(name='ep',cls=_AliasedGroup,help="Endpoint commands.")
def _ep():
    pass


@_ep.command(name='get')
def _epGet():
    '''
    Get Globus endpoint for the current session. At the start of a session, the
    current endpoint will be set to the default endpoint, if configured.
    '''

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


@_ep.command( name='set' )
@click.argument( "endpoint", required=False )
def _epSet( endpoint ):
    '''
    Set endpoint for the current session. If no endpoint is given, the
    default endpoint will be set as the current endpoint, if configured.
    '''

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


@_ep.command( name='list' )
def _epList():
    '''
    List recently used endpoints.
    '''

    reply = _capi.endpointListRecent()
    _generic_reply_handler( reply, _print_endpoints )


@_ep.command(name='default',cls=_AliasedGroup,help="Default endpoint commands.")
def _epDefault():
    pass


@_epDefault.command(name='get')
def _epDefaultGet():
    '''
    Show the default Globus endpoint.
    '''

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


@_epDefault.command(name='set')
@click.argument("endpoint",required=False)
@click.option("-c","--current",is_flag=True,help="Set default endpoint to current endpoint.")
def _epDefaultSet( current, endpoint ):
    '''
    Set the default Globus endpoint. The default endpoint will be set from the
    'endpoint' argument, or if the '--current' options is specified, from the
    currently active endpoint.
    '''

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

@_cli.command( name='setup' )
@click.pass_context
def _setup(ctx):
    '''
    Setup local credentials. This command installs DataFed credentials for the
    current user in the configured client configuration directory. Subsequent
    use of the DataFed CLI will read these credentials instead of requiring
    manual authentication.
    '''

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

'''
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
'''


@_cli.command(name='verbosity')
@click.argument("level", required=False)
def _verbositySet(level):
    '''
    Set/display verbosity level. The verbosity level argument can be 0
    (lowest), 1 (normal), or 2 (highest). If the the level is omitted, the
    current verbosity level is returned.
    '''

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

        
@_cli.command( name='help' )
@click.argument("command", required=False, nargs=-1)
@click.pass_context
def _help_cli(ctx,command):
    '''
    Show DataFed CLI help. Include a command name as the argument to see
    command-specific help.
    '''

    if not command:
        click.echo("DataFed _cli, version {}\n".format(version))
        click.echo(ctx.parent.get_help())
    else:
        first = True
        for c in command:
            #print( c )
            if first:
                first = False
                subcmd = _cli.get_command( _cli, c )
            else:
                subcmd = subcmd.get_command( subcmd, c )

            if not subcmd:
                break
            else:
                ctx = click.Context( subcmd, info_name = subcmd.name, parent = ctx )

        if subcmd:
            click.echo( subcmd.get_help( ctx ))
        else:
            click.echo( "No such command: {}".format( c ))

@_cli.command( name="exit" )
def _exit_cli():
    '''
    Exit an interactive session. Ctrl-C may also be used to exit the shell.
    '''

    global _interactive

    if not _interactive:
        raise Exception("Command not supported in non-interactive modes.")

    _interactive = False
    sys.exit(0)


# =============================================================================
# ----------------------------------------------------------- Utility Functions
# =============================================================================


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

    reply = _mapi.sendRecv(_most_recent_list_request)


    for key in _listing_requests:
        if isinstance(_most_recent_list_request, key):
            _generic_reply_handler( reply, _listing_requests[key] )

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

'''

# =============================================================================
# ------------------------------------------------------------- Print Functions
# =============================================================================

# Interactive and verbosity-aware print
def _print_msg( level, message, err = False ):
    global _verbosity
    global _interactive
    if _interactive and level <= _verbosity:
        click.echo( message, err = err )

def _print_ack_reply( reply = None ):
    if _output_mode == _OM_JSON:
        click.echo( "{{\"msg_type\":\"AckReply\",\"message\":{{}}}}")
        #click.echo('{}')
    elif _output_mode == _OM_TEXT and _verbosity > 0:
        click.echo("OK")

def _print_listing( message ):
    if len(message.item) == 0:
        click.echo("(no items)")
        return

    df_idx = 1
    global _list_items
    _list_items = []

    for i in message.item:
        _list_items.append(i.id)
        if i.alias:
            click.echo("{:2}. {:12} ({:20} {}".format(df_idx,i.id,i.alias+')',i.title))
        else:
            click.echo("{:2}. {:34} {}".format(df_idx,i.id,i.title))
        df_idx += 1

def _print_user_listing( message ):
    if len(message.user) == 0:
        click.echo("(no users)")
        return

    df_idx = 1
    global _list_items
    _list_items = []
    for i in message.user:
        _list_items.append(i.uid)
        click.echo("{:2}. {:24} {}, {}".format(df_idx,i.uid,i.name_last,i.name_first))
        df_idx += 1


def _print_proj_listing( message ):
    if len(message.proj) == 0:
        click.echo("(no projects)")
        return

    df_idx = 1
    global _list_items
    _list_items = []
    for i in message.proj:
        _list_items.append(i.id)
        click.echo("{:2}. {:24} {}".format(df_idx,i.id,i.title))
        df_idx += 1


def _print_endpoints( message ):
    if len(message.ep) == 0:
        click.echo("(no endpoints)")
        return

    df_idx = 1
    global _list_items
    _list_items = []
    for i in message.ep:
        p = i.find("/")
        if p > 0:
            path = i[0:p]
        else:
            path = i

        try:
            _list_items.index(path)
        except:
            _list_items.append(path)
            click.echo("{:2}. {}".format(df_idx,path))
            df_idx += 1


def _print_data( message ):
    for dr in message.data:
        click.echo( "{:<15}{:<50}".format('ID: ', dr.id))
        click.echo( "{:<15}{:<50}".format('Alias: ', dr.alias if dr.alias else "(none)" ))
        _wrap_text( dr.title, "Title:", 15 )
        _wrap_text( _arrayToCSV( dr.tags, 0 ), "Tags:", 15 )

        if dr.data_url:
            click.echo("{:<15}{:<50}".format('DOI No.: ', dr.doi))
            click.echo("{:<15}{:<50}".format('Data URL: ', dr.data_url))
        else:
            click.echo("{:<15}{:<50}".format('Data Size: ', _capi.sizeToStr(dr.size)) + '\n' +
                    "{:<15}{:<50}".format('Data Repo ID: ', dr.repo_id) + '\n' +
                    "{:<15}{:<50}".format('Source: ', dr.source if dr.source else '(none)' ))
            if dr.ext_auto:
                click.echo( "{:<15}{:<50}".format('Extension: ', '(auto)'))
            else:
                click.echo( "{:<15}{:<50}".format('Extension: ', dr.ext if dr.ext else '(not set)' ))

        click.echo( "{:<15}{:<50}".format('Owner: ', dr.owner[2:]) + '\n' +
                    "{:<15}{:<50}".format('Creator: ', dr.creator[2:]) + '\n' +
                    "{:<15}{:<50}".format('Created: ', _capi.timestampToStr(dr.ct)) + '\n' +
                    "{:<15}{:<50}".format('Updated: ', _capi.timestampToStr(dr.ut)))

        if len(dr.desc) > 200 and _verbosity < 2:
            _wrap_text( dr.desc[:200] + '... [more]', "Description:", 15, True )
        else:
            _wrap_text( dr.desc, "Description:", 15 )

        if _verbosity == 2:
            if dr.metadata:
                click.echo( "Metadata:\n" )
                json = jsonlib.loads( dr.metadata )
                _printJSON( json, 2, 2 )
                click.echo( "\n" )
                # TODO: Paging function?
            elif not dr.metadata:
                click.echo("{:<15}{:<50}".format('Metadata: ', "(none)"))
            if not dr.deps:
                click.echo("{:<15}{:<50}".format('Dependencies: ', '(none)'))
            elif dr.deps:
                click.echo("{:<15}".format('Dependencies:\n'))
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
        click.echo( "{:<15}{:<50}".format('ID: ', coll.id))
        click.echo( "{:<15}{:<50}".format('Alias: ', coll.alias if coll.alias else "(none)" ))
        _wrap_text( coll.title, "Title:", 15 )
        _wrap_text( _arrayToCSV( coll.tags, 0 ), "Tags:", 15 )

        click.echo( "{:<15}{:<50}".format('Topic: ', coll.topic if coll.topic else '(not published)') + '\n' +
                    "{:<15}{:<50}".format('Owner: ', coll.owner[2:]) + '\n' +
                    "{:<15}{:<50}".format('Created: ', _capi.timestampToStr(coll.ct)) + '\n' +
                    "{:<15}{:<50}".format('Updated: ', _capi.timestampToStr(coll.ut)))

        if len(coll.desc) > 200 and _verbosity < 2:
            _wrap_text( coll.desc[:200] + '... [more]', "Description:", 15, True )
        else:
            _wrap_text( coll.desc, "Description:", 15 )

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

def _print_task_listing( message ):
    if len(message.task) == 0:
        click.echo("(no tasks)")
        return

    df_idx = 1
    global _list_items
    _list_items = []
    for t in message.task:
        _list_items.append(t.id)
        task_type = _task_types.get(t.type, "None")
        task_status = _task_statuses.get(t.status, "None")

        click.echo("{:2}. {:14}  {:13}  {:9}  {}  {}".format(df_idx, t.id, task_type, task_status, _capi.timestampToStr(t.ct), _capi.timestampToStr(t.ut) ))
        df_idx += 1

def _print_task( message ):
    if message.HasField( "task" ):
        task_type = _task_types.get(message.task.type, "None")
        task_status = _task_statuses.get(message.task.status, "None")

        click.echo( "{:<20} {:<50}".format('Task ID: ', message.task.id) + '\n' +
                    "{:<20} {:<50}".format('Type: ', task_type) + '\n' +
                    "{:<20} {:<50}".format('Status: ', task_status))

        if message.task.status == 4:
            click.echo("{:<20} {:<50}".format('Message: ', message.task.msg))

        click.echo( "{:<20} {:<50}".format('Started: ', _capi.timestampToStr(message.task.ct)) + '\n' +
                    "{:<20} {:<50}".format('Updated: ', _capi.timestampToStr(message.task.ut)))

def _print_task_array( message ):
    #print("_print_task_array")

    for t in message.task:
        #print(t)

        task_type = _task_types.get(t.type, "None")
        task_status = _task_statuses.get(t.status, "None")
        #xfr_encrypt = _xfr_encrypt_modes.get(xfr.encrypt, "None")

        click.echo( "{:<20} {:<50}".format('Task ID: ', t.id) + '\n' +
                    "{:<20} {:<50}".format('Type: ', task_type) + '\n' +
                    "{:<20} {:<50}".format('Status: ', task_status))

        if t.status == 4:
            click.echo("{:<20} {:<50}".format('Message: ', t.msg))

        #click.echo( "{:<20} {:<50}".format('Endpoint:', xfr.rem_ep) + '\n' +
        #            "{:<20} {:<50}".format('Path: ', xfr.rem_path) + '\n' +
        #            "{:<20} {} ({})".format('Encrypted:', xfr.encrypted, xfr_encrypt) + '\n' +
        click.echo( "{:<20} {:<50}".format('Started: ', _capi.timestampToStr(t.ct)) + '\n' +
                    "{:<20} {:<50}".format('Updated: ', _capi.timestampToStr(t.ut)))

def _print_user( message ):
    for usr in message.user:
        if _verbosity >= 0:
            click.echo("{:<10} {:<50}".format('User ID: ', usr.uid) + '\n' +
                       "{:<10} {:<50}".format('Name: ', usr.name_last + ", " + usr.name_first) + '\n' +
                       "{:<10} {:<50}".format('Email: ', usr.email))

def _print_proj( message ):
    for proj in message.proj:
        #for i in proj.member: members.append(i)

        #w,h = shutil.get_terminal_size((80, 20))

        click.echo( "{:<14} {:<50}".format('ID: ', proj.id) + '\n' +
                    "{:<14} {:<50}".format('Title: ', proj.title) + '\n' +
                    "{:<14} {:<50}".format('Owner: ', proj.owner[2:]) + '\n' +
                    "{:<14} {:<50}".format('Created: ', _capi.timestampToStr(proj.ct)) + '\n' +
                    "{:<14} {:<50}".format('Updated: ', _capi.timestampToStr(proj.ut)))

        if _verbosity == 2:
            if len(proj.admin):
                text = _arrayToCSV(proj.admin,2)
                _wrap_text( text, "Admins:", 15 )
            else:
                click.echo("{:<14} (none)".format('Admin(s): '))

            if len(proj.member):
                text = _arrayToCSV(proj.member,2)
                _wrap_text( text, "Members:", 15 )
            else:
                click.echo("{:<14} (none)".format('Admin(s): '))

            if len(proj.alloc) > 0:
                first = True
                for alloc in proj.alloc:
                    if first == True:
                        first = False
                        click.echo("{:<14} {}, {} total, {} used".format("Allocations:",alloc.repo, _capi.sizeToStr(alloc.data_limit),_capi.sizeToStr(alloc.data_size)))
                    else:
                        click.echo("{:<14} {}, {} total, {} used".format("",alloc.repo, _capi.sizeToStr(alloc.data_limit),_capi.sizeToStr(alloc.data_size)))
            else:
                click.echo("{:<14} (none)".format("Allocations:"))

        if len(proj.desc) > 200 and _verbosity < 2:
            _wrap_text( proj.desc[:200] + '... [more]', "Description:", 15, True )
        else:
            _wrap_text( proj.desc, "Description:", 15 )

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

def _print_query( message ):
    for q in message.query:
        click.echo( "{:<20} {:<50}\n".format('ID: ', q.id)+
                    "{:<20} {:<50}".format('Title: ', q.title))

        qry = jsonlib.loads( q.query )
        click.echo( "{:<20} {:<50}".format('ID Term: ', "\"" + qry["id"] + "\"" if "id" in qry else "N/A"))
        click.echo( "{:<20} {:<50}".format('Text Term: ', "\"" + qry["text"] + "\"" if "text" in qry else "N/A"))
        click.echo( "{:<20} {:<50}".format('Meta Term: ', "\"" + qry["meta"] + "\"" if "meta" in qry else "N/A"))
        delim = ""
        scopes = ""
        for s in qry["scopes"]:
            scopes = scopes + delim + _scopeToStr( s )
            delim = ", "
        click.echo( "{:<20} {:<50}".format('Scopes: ', scopes ))

        click.echo( "{:<20} {:<50}\n".format('Owner: ', q.owner[2:]) +
                    "{:<20} {:<50}\n".format('Created: ', _capi.timestampToStr(q.ct)) +
                    "{:<20} {:<50}\n".format('Updated: ', _capi.timestampToStr(q.ut)))

def _wrap_text( text, prefix, indent, compact = False ):
    if len(text) == 0:
        click.echo( "{0:<{1}}{2:<50}".format(prefix, indent, "(none)" ))

    w,h = shutil.get_terminal_size((80, 20))
    if len(prefix) < indent:
        prefix = prefix + ' '*(indent-len(prefix))

    wrapper = textwrap.TextWrapper(initial_indent=prefix,subsequent_indent=' '*indent,width=w)

    if compact:
        click.echo( wrapper.fill( text ))
    else:
        para = text.splitlines()
        first = True

        for p in para:
            click.echo( wrapper.fill( p ))
            if first == True:
                wrapper.initial_indent = ' '*indent
                first = False

def _scopeToStr( scope ):
    s = scope["scope"]

    if s == 1:
        return "my-data"
    elif s == 2:
        return "proj: " + scope["id"]
    elif s == 3:
        return "my-proj"
    elif s == 4:
        return "mgd-proj"
    elif s == 5:
        return "mem-proj"
    elif s == 6:
        return "coll: " + scope["id"]


# =============================================================================
# ----------------------------------------------------------- Support Functions
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
    elif coll_id == "~" or coll_id == "~/" or coll_id == "//":
        return "c/u_" + _uid[2:] + "_root"
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
        elif _cur_ctx[0] == "p":
            return "c/p_" + _cur_ctx[2:] + "_root"
        else:
            return "c/u_" + _cur_ctx[2:] + "_root"
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


def _bar_adaptive_human_readable( current, total, width=80 ):
    # This is a modified version of the wget.bar_adaptive function

    if not total or total < 0:
        msg = "%s / unknown" % _capi.sizeToStr(current)
        if len(msg) < width:  # leaves one character to avoid linefeed
            return msg
        if len("%s" % current) < width:
            return "%s" % _capi.sizeToStr(current)

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
            output += ("%s / %s" % (_capi.sizeToStr(current), _capi.sizeToStr(total))).rjust(min_width['size'])

        selected = selected[1:]
        if selected:
            output += ' '  # add field separator

    return output


# =============================================================================
# ----------------------------------------------------- Initialization Functions
# =============================================================================


def _initialize( opts ):
    global _initialized
    global _capi
    global _uid
    global _output_mode_sticky
    global _output_mode
    global _verbosity_sticky
    global _verbosity
    global _interactive
    global _cur_ctx
    global _cur_coll

    #print("_initialize, opts:", opts )

    if "version" in opts and opts["version"]:
        click.echo( version )
        _interactive = False
        raise SystemExit()

    try:
        man_auth = opts["manual_auth"]

        if man_auth:
            #print("CLI - manual auth")
            if _output_mode == _OM_RETN:
                raise Exception("The --manual-auth option may not be used when running in API mode.")
            elif not _interactive:
                raise Exception("The --manual-auth option may not be used when running non-interactively.")

        _capi = CommandLib.API( opts )

        if _interactive and _capi._mapi.new_client_avail:
            click.echo("Note: Your DataFed python package is out of date.")

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
                uid = click.prompt("User ID")
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
        _cur_ctx = uid
        _cur_coll = "c/u_"+uid[2:]+"_root"
        _initialized = True
    except Exception as e:
        _interactive = False
        raise


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





