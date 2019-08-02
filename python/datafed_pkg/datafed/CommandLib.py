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
# the user chooses to exit. The DataFed CLI is a very thin wrapper around
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
_cur_alias_prefix = ""
_list_items = []
_interactive = False
_verbosity = 1
_ctxt_settings = dict(help_option_names=['-h', '-?', '--help'])
_ep_default = None
_ep_cur = None


_OM_TEXT = 0
_OM_JSON = 1
_OM_RETN = 2

_output_mode = _OM_TEXT

# Used by CLI script to run interactively
def _run():

    #info(1,"DataFed CLI Ver.", version )

    _addConfigOptions()

    session = None
    _first = True

    try:
        while True:
            try:
                if _interactive == False:
                    cli(standalone_mode=True)
                    # cli always raises an exception
                else:
                    if session == None:
                        session = PromptSession(unicode("> "),history=FileHistory(os.path.expanduser("~/.datafed-hist")))
                    _args = shlex.split(session.prompt(auto_suggest=AutoSuggestFromHistory()))
                    cli(prog_name="datafed",args=_args,standalone_mode=True)
            except SystemExit as e:
                #print( "except - sys exit" )
                if _interactive == False:
                    break
                elif _first:
                    _first = False
                    for i in cli.params:
                        i.hidden = True
            except KeyboardInterrupt as e:
                #print("key inter")
                break
            except Exception as e:
                #print( "except: ", e )
                click.echo(e)
                if _interactive == False:
                    break

    except Exception as e:
        #print( "except - outer" )
        click.echo("Exception:",e)

    info(1,"Goodbye!")

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
    global _mapi
    global _uid
    global _cur_sel
    global _cfg

    _cfg = Config.API( opts )
    _addConfigOptions()

    if _mapi:
        raise Exception("init function can only be called once.")

    # Get config options
    opts = _cfg.getOpts()

    #print( "opts:", opts )

    _mapi = MessageLib.API( **opts )
    _mapi.setNackExceptionEnabled( False )
    auth, uid = _mapi.getAuthStatus()
    if auth:
        _uid = uid
        _cur_sel = uid

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
def login( uid, password ):
    global _uid
    global _cur_sel

    if not _mapi:
        raise Exception("login called before init.")

    if _uid:
        raise Exception("login can only be called once.")

    _mapi.manualAuth( uid, password )

    _uid = uid
    _cur_sel = uid

##
# @brief Execute a client CLI-style command
#
# This functions executes a text-based DataFed command in the same format as
# used by the DataFed CLI. Instead of printing output, this function returns
# the received DataFed server reply directly to the caller as a Python
# protobuf message instance. Refer to the *.proto files for details on
# the message interface.
#
# @param command - String containg CLI-style DataFed command
# @exception Exception: if called prior to init(), or if command parsing fails.
# @return DataFed reply message
# @retval Protobuf message object
#
def command( command ):
    if not _mapi:
        raise Exception("exec called before init.")

    global _return_val
    global _output_mode

    _return_val = None
    _output_mode = _OM_RETN

    try:
        _args = shlex.split( command )
        cli(prog_name="datafed",args=_args,standalone_mode=False)
    except SystemExit as e:
        #print( "except - sys exit" )
        pass
    except click.ClickException as e:
        #print( "except - click error" )
        raise Exception(e.format_message())

    return _return_val

# Verbosity-aware print
def info( level, *args ):
    global _verbosity
    if level <= int(_verbosity):
        print( *args )

# -----------------------------------------------------------------------------------------------------------------
# Switch functions


def _set_output_json(ctx, param, value):
    global _output_mode
    if value:
        _output_mode = _OM_JSON

def _set_output_text(ctx, param, value):
    global _output_mode
    if value:
        _output_mode = _OM_TEXT

def _set_verbosity(ctx, param, value):
    global _verbosity
    if value:
        _verbosity = int(value)

# TODO: Keep output options global variables so that they can be sticky and return output mode still works
# TODO: how to make sticky but transient per command -- change from callbacks to command-specific parsing
__global_output_options = [
    click.option('-v', '--verbosity', required=False, type=click.Choice(['0', '1', '2']), help='Verbosity of reply'),
    click.option("-j", "--json", is_flag=True,
                   help="Set CLI output format to JSON, when applicable."),
    click.option("-txt", "--text", is_flag=True,
                   help="Set CLI output format to human-friendly text.")]

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
            return None
        elif len(matches) == 1:
            return click.Group.get_command(self, ctx, matches[0])
        ctx.fail('Too many matches: %s' % ', '.join(sorted(matches)))

def _global_output_options(func):
    for option in reversed(__global_output_options):
        func = option(func)
    return func

def _addConfigOptions():
    global _cfg

    for k, v in Config._opt_info.items():
        if not v[3] & Config._OPT_NO_CL:
            if v[3] & Config._OPT_INT:
                cli.params.append( click.Option(v[4],type=int,help=v[5]))
            elif v[3] & Config._OPT_BOOL:
                cli.params.append( click.Option(v[4],is_flag=True,default=None,help=v[5]))
            else:
                cli.params.append( click.Option(v[4],type=str,help=v[5]))

#------------------------------------------------------------------------------
# Top-level group with global options
@click.group(cls=AliasedGroup,invoke_without_command=True,context_settings=_ctxt_settings)
@click.option("-m","--manual-auth",is_flag=True,help="Force manual authentication")
@click.option("-j", "--json", is_flag=True,callback=_set_output_json,help="Set CLI output format to JSON, when applicable.")
@click.option("-t","--text",is_flag=True,callback=_set_output_text,help="Set CLI output format to human-friendly text.")
@click.pass_context
def cli(ctx,*args,**kwargs):
    global _verbosity
    if _mapi == None:
        _initialize(ctx.params)

    if ctx.params['verbosity'] is not None and int(ctx.params['verbosity']) != _verbosity:
        _verbosity = int(ctx.params['verbosity'])

    if not _interactive and ctx.invoked_subcommand is None:
        click.echo("No command specified.")
        click.echo(ctx.get_help())



@cli.command(help="print global output mode variables")
def globe():
    global _verbosity
    global _output_mode
    click.echo("Global verbosity level: {}".format(_verbosity))
    click.echo("Global output mode: {}".format(_output_mode))

# ------------------------------------------------------------------------------
# Collection listing/navigation commands
@cli.command(help="List current collection, or collection specified by ID")
@click.option("-o","--offset",default=0,help="List offset")
@click.option("-c","--count",default=20,help="List count")
@click.argument("df-id", required=False)
@_global_output_options
@click.pass_context
def ls(ctx,df_id,offset,count,verbosity,json,text):
    global _cur_coll
    msg = auth.CollReadRequest()
    if df_id is not None:
        msg.id = resolve_coll_id(df_id)
    else:
        msg.id = _cur_coll
    msg.count = count
    msg.offset = offset

    if verbosity:
        __verbosity = int(verbosity)
    elif not verbosity:
        global _verbosity
        __verbosity = _verbosity

    if json:
        __output_mode = _OM_JSON
    elif text:
        __output_mode = _OM_TEXT
    elif not json and not text:
        global _output_mode
        __output_mode = _output_mode

    if __verbosity > 1:
        msg.details = True
    elif __verbosity == 0:
        msg.details = False

    click.echo("In-function output mode: {}".format(__output_mode))
    click.echo("In-function verbosity level: {}".format(__verbosity))
    click.echo(msg)
    reply = _mapi.sendRecv( msg )
    click.echo(reply)
    generic_reply_handler( reply, print_listing , __output_mode, __verbosity )


@cli.command(help="Print or change current working collection")
@click.argument("df-id",required=False)
def wc(df_id):
    global _cur_coll
    if df_id is not None:
        _cur_coll = resolve_coll_id(df_id)
    else:
        click.echo(_cur_coll)

# ------------------------------------------------------------------------------
# Data command group
@cli.command(cls=AliasedGroup,help="Data subcommands")
def data():
    pass


@data.command(name='view',help="View data record")
@click.option("-d","--details",is_flag=True,help="Show additional fields")
@_global_output_options
@click.argument("df_id", metavar="id")
def data_view(df_id,details,verbosity,json,text):
    msg = auth.RecordViewRequest()
    msg.id = resolve_id(df_id)
    if details:
        msg.details = True
    elif not details:
        msg.details = False

    if verbosity:
        __verbosity = int(verbosity)
    elif not verbosity:
        global _verbosity
        __verbosity = _verbosity

    if json:
        __output_mode = _OM_JSON
    elif text:
        __output_mode = _OM_TEXT
    elif not json and not text:
        global _output_mode
        __output_mode = _output_mode

    reply = _mapi.sendRecv( msg )
    generic_reply_handler( reply, print_data, __output_mode, __verbosity )


@data.command(name='create',help="Create new data record")
@click.argument("title")
@click.option("-a","--alias",type=str,required=False,help="Alias")
@click.option("-d","--description",type=str,required=False,help="Description text")
@click.option("-p", "--topic", type=str, required=False, help="Data Record topic, using period ('.') as delimiter")
@click.option("-kw","--key-words",type=str,required=False,help="Keywords should be in the form of a comma separated list enclosed by double quotation marks")
@click.option("-df","--data-file",type=str,required=False,help="Specify the path to local raw data file, either relative or absolute. This will initiate a Globus transfer. If no endpoint is provided, the default endpoint will be used.")
@click.option("-ext","--extension",type=str,required=False,help="Specify an extension for the raw data file. If not provided, DataFed will automatically default to the extension of the file at time of put/upload.")
@click.option("-m","--metadata",type=str,required=False,help="Metadata (JSON)")
@click.option("-mf","--metadata-file",type=click.File(mode='r'),required=False,help="Metadata file (.json with relative or absolute path)") ####WARNING:NEEDS ABSOLUTE PATH? DOES NOT RECOGNIZE ~ AS HOME DIRECTORY
@click.option("-c","--collection",type=str,required=False, default= _cur_coll, help="Parent collection ID/alias (default is current working collection)")
@click.option("-r","--repository",type=str,required=False,help="Repository ID")
@click.option("-dep","--dependencies",multiple=True, type=click.Tuple([click.Choice(['derived', 'component', 'version', 'der', 'comp', 'ver']), str]),help="Specify dependencies by listing first the type of relationship -- 'derived' from, 'component' of, or new 'version' of -- and then the id or alias of the related record. Can be used multiple times to add multiple dependencies.")
@_global_output_options
def data_create(title,alias,description,topic,key_words,data_file,extension,metadata,metadata_file,collection,repository,dependencies,verbosity,json,text): #cTODO: FIX
    if metadata and metadata_file:
        click.echo("Cannot specify both --metadata and --metadata-file options")
        return
    msg = auth.RecordCreateRequest()
    msg.title = title
    if description: msg.desc = description
    if topic: msg.topic = topic #
    if key_words: msg.keyw = key_words   # TODO: Determine input format for keywords -- list? quotation marks? commas?
    if alias: msg.alias = alias
    if resolve_coll_id(collection): msg.parent_id = resolve_coll_id(collection)
    if repository: msg.repo_id = repository
    msg.ext_auto = True
    if extension is not None:
        msg.ext = extension
        msg.ext_auto = False
    if metadata_file is not None:
        metadata = jsonlib.dumps(jsonlib.load(metadata_file))
    if metadata: msg.metadata = metadata
    if dependencies:
        deps = list(dependencies)
        for i in range(len(deps)):
            item = deps[i-1]
            dep = msg.deps.add()
            dep.dir = 0
            if item[0] == "derived" or item[0] == "der": dep.type = 0
            elif item[0] == "component" or item[0] == "comp": dep.type = 1
            elif item[0] == "version" or item[0] == "ver":
                dep.type = 2
                dep.dir = 1
            if re.search(r'^d/[0-9]{8}', item[1]):
                dep.id = item[1]
            else: dep.alias = item[1]

    if verbosity:
        __verbosity = int(verbosity)
    elif not verbosity:
        global _verbosity
        __verbosity = _verbosity

    if json:
        __output_mode = _OM_JSON
    elif text:
        __output_mode = _OM_TEXT
    elif not json and not text:
        global _output_mode
        __output_mode = _output_mode

    if not data_file:
        reply = _mapi.sendRecv(msg)
        generic_reply_handler(reply, print_data, __output_mode, __verbosity)

    elif data_file: # TODO: Incorporate global output options for put-on-create
        create_reply = _mapi.sendRecv(msg)
        click.echo("Data Record update successful. Initiating raw data transfer.")
        put_data(df_id=create_reply[0].data[0].id,gp=resolve_filepath_for_xfr(data_file),wait=False,extension=None)

#TODO Handle return value in _OM_RETV


@data.command(name='update',help="Update existing data record")
@click.argument("df_id", metavar="id")
@click.option("-t","--title",type=str,required=False,help="Title")
@click.option("-a","--alias",type=str,required=False,help="Alias")
@click.option("-d","--description",type=str,required=False,help="Description text")
@click.option("-p", "--topic", type=str, required=False, help="Data Record topic, using period ('.') as delimiter")
@click.option("-kw","--key-words",type=str,required=False,help="Keywords (comma separated list)")
@click.option("-df","--data-file",type=str,required=False,help="Local raw data file")
@click.option("-ext","--extension",type=str,required=False,help="Specify an extension for the raw data file. If not provided, DataFed will automatically default to the extension of the file at time of put/upload.")
@click.option("-m","--metadata",type=str,required=False,help="Metadata (json)")
@click.option("-mf","--metadata-file",type=click.File(mode='r'),required=False,help="Metadata file (JSON)")
@click.option("-da","--dependencies-add",multiple=True, nargs=2, type=click.Tuple([click.Choice(['derived', 'component', 'version', 'der', 'comp', 'ver']), str]),help="Specify new dependencies by listing first the type of relationship -- 'derived' from, 'component' of, or new 'version' of -- and then the id or alias of the related record. Can be used multiple times to add multiple dependencies.")
@click.option("-dr","--dependencies-remove",multiple=True, nargs=2, type=click.Tuple([click.Choice(['derived', 'component', 'version', 'der', 'comp', 'ver']), str]),help="Specify dependencies to remove by listing first the type of relationship -- 'derived' from, 'component' of, or new 'version' of -- and then the id or alias of the related record. Can be used multiple times to remove multiple dependencies.") #Make type optional -- if no type given, then deletes all relationships with that record
@_global_output_options
def data_update(df_id,title,alias,description,topic,key_words,data_file,extension,metadata,metadata_file,dependencies_add,dependencies_remove,verbosity,json,text):
    if metadata and metadata_file:
        click.echo("Cannot specify both --metadata and --metadata-file options")
        return
    msg = auth.RecordUpdateRequest()
    msg.id = resolve_id(df_id)
    if title is not None: msg.title = title
    if description is not None: msg.desc = description
    if topic: msg.topic = topic
    if key_words is not None: msg.keyw = key_words # how can this be inputted? must it be a string without spaces? must python keep as such a string, or convert to list?
    if alias is not None: msg.alias = alias
    if extension is not None:
        msg.ext = extension
        msg.ext_auto = False
    if metadata_file is not None:
        metadata = jsonlib.dumps(jsonlib.load(metadata_file))
    if metadata is not None: msg.metadata = metadata
    if dependencies_add:
        deps = list(dependencies_add)
        for i in range(len(deps)):
            item = deps[i-1]
            dep = msg.deps_add.add()
            dep.dir = 0
            if item[0] == "derived" or item[0] == "der": dep.type = 0
            elif item[0] == "component" or item[0] == "comp": dep.type = 1
            elif item[0] == "version" or item[0] == "ver":
                dep.type = 2
                dep.dir = 1
            if re.search(r'^d/[0-9]{8}', item[1]):
                dep.id = item[1]
            else: dep.alias = item[1]
    if dependencies_remove:
        deps = list(dependencies_remove)
        for i in range(len(deps)):
            item = deps[i-1]
            dep = msg.deps_rem.add()
            dep.dir = 0
            if item[0] == "derived" or item[0] == "der": dep.type = 0
            elif item[0] == "component" or item[0] == "comp": dep.type = 1
            elif item[0] == "version" or item[0] == "ver":
                dep.type = 2
                dep.dir = 1
            if re.search(r'^d/[0-9]{8}', item[1]):
                dep.id = item[1]
            else: dep.alias = item[1]

    if verbosity:
        __verbosity = int(verbosity)
    elif not verbosity:
        global _verbosity
        __verbosity = _verbosity

    if json:
        __output_mode = _OM_JSON
    elif text:
        __output_mode = _OM_TEXT
    elif not json and not text:
        global _output_mode
        __output_mode = _output_mode

    if not data_file:
        reply = _mapi.sendRecv(msg)
        generic_reply_handler(reply, print_data, __output_mode, __verbosity)

    elif data_file: # TODO: Incorporate global output options for put-on-update
        update_reply, mt = _mapi.sendRecv(msg)
        click.echo("Data Record update successful. Initiating raw data transfer.")
        put_data(df_id=update_reply.data[0].id,gp=resolve_filepath_for_xfr(data_file),wait=False,extension=None)

    #TODO Handle return value in _OM_RETV


@data.command(name='delete',help="Delete existing data record")
@click.argument("df_id", metavar="id", nargs=-1)
@_global_output_options
def data_delete(df_id, verbosity, json, text):
    resolved_list = []
    for ids in df_id:
        resolved_list.append(resolve_id(ids))
    if _interactive:
        if not click.confirm("Do you want to delete record/s {} ?".format(resolved_list)):
            return
    msg = auth.RecordDeleteRequest()
    msg.id.extend(resolved_list)
    if verbosity:
        __verbosity = int(verbosity)
    elif not verbosity:
        global _verbosity
        __verbosity = _verbosity

    if json:
        __output_mode = _OM_JSON
    elif text:
        __output_mode = _OM_TEXT
    elif not json and not text:
        global _output_mode
        __output_mode = _output_mode

    reply = _mapi.sendRecv(msg)
    generic_reply_handler(reply, print_ack_reply, __output_mode, __verbosity)


@data.command(name='get',help="Get (download) raw data of record ID and place in local PATH")
@click.argument("df_id", metavar="id", nargs=-1)
@click.option("-fp","--filepath",type=str,required=True,help="Destination to which file is to be downloaded. Relative paths are acceptable if transferring from the operating file system. Note that Windows-style paths need to be escaped, i.e. all single backslashes should be entered as double backslashes. If you wish to use a Windows path from a Unix-style machine, please use an absolute path in Globus-style format (see docs for details.)")
#@click.option("-ep","--endpoint",type=str,required=False,help="The endpoint to which the raw data file is to be transferred. If no endpoint is specified, the current session endpoint will be used.")
@click.option("-w","--wait",is_flag=True,help="Block until transfer is complete")
def data_get(df_id,filepath,wait): #Multi-get will initiate one transfer per repo (multiple records in one transfer, as long as they're in the same repo)
    check = auth.DataGetPreprocRequest()
    resolved_list = []
    for ids in df_id:
        resolved_list.append(resolve_id(ids))
    check.id.extend(resolved_list)
    check_reply, mt = _mapi.sendRecv(check)
    checked_list = []
    url_list = []
    for i in check_reply.item:
        if i.url:
            url_list.append((i.id))
        else:
            checked_list.append(i.id)

    if checked_list and url_list:
        click.echo("Cannot get data records via Globus and http transfers in the same command")

    elif url_list:
        click.echo("TODO: Data get via http transfer not yet implemented") # TODO: Implement http transfers
        destination_directory = resolve_filepath_for_xfr(filepath)
        for url in url_list:
            raw_data_record = wget.download(url, out=destination_directory)
        return
    elif checked_list: #Globus transfers
        gp = resolve_filepath_for_xfr(filepath)
       # if endpoint: gp = resolve_globus_path(fp, endpoint)
        # elif not endpoint: gp = resolve_globus_path(fp, "None")
        #if gp is None:
        #   click.echo(
         #       "No endpoint provided, and neither current working endpoint nor default endpoint have been configured.")
         #   return
        msg = auth.DataGetRequest()
        msg.id.extend(checked_list)
        msg.path = gp
        reply = _mapi.sendRecv(msg)
        xfr_ids = []
        replies = []
        for xfrs in reply[0].xfr:
            if _output_mode == _OM_JSON: click.echo('{{ "Transfer ID": "{}" }}'.format(xfrs.id))
            elif _output_mode == _OM_TEXT: click.echo("Transfer ID: {}".format(xfrs.id))
            xfr_ids.append(xfrs.id)
        if wait:
            if _verbosity >= 1 and _output_mode == _OM_TEXT: click.echo("Waiting")
            elif _output_mode == _OM_JSON: click.echo('{ "Status": "Waiting" }') # TODO: Figure out verbosity replies (1 or 2 for updates loop?)
            while wait is True:
                time.sleep(3)
                for xfrs in xfr_ids:
                    update_msg = auth.XfrViewRequest()
                    update_msg.xfr_id = xfrs
                    reply = _mapi.sendRecv(update_msg)
                    check = reply[0].xfr[0]
                    if check.status >=3:
                        replies.append(reply)
                        wait = False
                    statuses = {0: "Initiated", 1: "Active", 2: "Inactive", 3: "Succeeded", 4: "Failed"}
                    xfr_status = statuses.get(check.status, "None")
                    if _output_mode == _OM_JSON: click.echo('{{ "Transfer ID": "{}" , "Status": "{}" }}'.format(check.id, xfr_status)) #Text status, or numeric code for JSON?
                    elif _verbosity >= 1 and _output_mode == _OM_TEXT: click.echo(
                        "{:15} {:15} {:15} {:15}".format("Transfer ID:", check.id, "Status:", xfr_status)) # BUG: Gets stuck after 2 go-arounds
            for xfrs in replies:
                generic_reply_handler(xfrs, print_xfr_stat)
        else:
            for xfrs in replies:
                generic_reply_handler(xfrs, print_xfr_stat)



@data.command(name='put',help="Put (upload) raw data to DataFed")
@click.argument("df_id", metavar="id")
@click.option("-fp","--filepath",type=str,required=True,help="Path to the file being uploaded. Relative paths are acceptable if transferring from the operating file system. Note that Windows-style paths need to be escaped, i.e. all single backslashes should be entered as double backslashes. If you wish to use a Windows path from a Unix-style machine, please use an absolute path in Globus-style format (see docs for details.)")
@click.option("-w","--wait",is_flag=True,help="Block reply or further commands until transfer is complete")
#@click.option("-ep","--endpoint",type=str,required=False,help="The endpoint from which the raw data file is to be transferred. If no endpoint is specified, the current session endpoint will be used.")
@click.option("-ext", "--extension",type=str,required=False,help="Specify an extension for the raw data file. This will override any previously specified extension or auto-extension behavior.")
def data_put(df_id,filepath,wait,extension):
    # gp = resolve_filepath_for_xfr(filepath)
    # if endpoint: gp = resolve_globus_path(fp, endpoint)
    # elif not endpoint: gp = resolve_globus_path(fp, "None")
    # if gp:
    put_data(df_id,resolve_filepath_for_xfr(filepath),wait,extension)
    # elif gp is None:
    #    click.echo("No endpoint provided, and neither current working endpoint nor default endpoint have been configured.")
    # TODO Handle return value in _OM_RETV


# ------------------------------------------------------------------------------
# Collection command group
@cli.command(cls=AliasedGroup,help="Collection subcommands")
def coll():
    pass


@coll.command(name='view',help="View collection")
@click.argument("df_id", metavar="id")
@_global_output_options
def coll_view(df_id, verbosity, json, text):
    msg = auth.CollViewRequest()
    msg.id = resolve_coll_id(df_id)

    if verbosity:
        __verbosity = int(verbosity)
    elif not verbosity:
        global _verbosity
        __verbosity = _verbosity

    if json:
        __output_mode = _OM_JSON
    elif text:
        __output_mode = _OM_TEXT
    elif not json and not text:
        global _output_mode
        __output_mode = _output_mode

    reply = _mapi.sendRecv( msg )
    generic_reply_handler( reply, print_coll , __output_mode, __verbosity)


@coll.command(name='create',help="Create new collection")
@click.argument("title")
@click.option("-a","--alias",type=str,required=False,help="Alias")
@click.option("-d","--description",type=str,required=False,help="Description text")
@click.option("-c","--collection",type=str,required=False,help="Parent collection ID/alias (default is current working collection)")
@_global_output_options
def coll_create(title,alias,description,collection, verbosity, json, text):
    msg = auth.CollCreateRequest()
    msg.title = title
    if alias is not None: msg.alias = alias
    if description is not None: msg.desc = description
    if resolve_coll_id(collection) is not None: msg.parent_id = resolve_coll_id(collection)

    if verbosity:
        __verbosity = int(verbosity)
    elif not verbosity:
        global _verbosity
        __verbosity = _verbosity

    if json:
        __output_mode = _OM_JSON
    elif text:
        __output_mode = _OM_TEXT
    elif not json and not text:
        global _output_mode
        __output_mode = _output_mode

    reply = _mapi.sendRecv(msg)
    generic_reply_handler(reply, print_coll, __output_mode, __verbosity)


@coll.command(name='update',help="Update existing collection")
@click.argument("df_id", metavar="id")
@click.option("-t","--title",type=str,required=False,help="Title")
@click.option("-a","--alias",type=str,required=False,help="Alias")
@click.option("-d","--description",type=str,required=False,help="Description text")
@_global_output_options
def coll_update(df_id,title,alias,description, verbosity, json, text):
    msg = auth.CollUpdateRequest()
    msg.id = resolve_coll_id(df_id)
    if title is not None: msg.title = title
    if alias is not None: msg.alias = alias
    if description is not None: msg.desc = description
    if verbosity:
        __verbosity = int(verbosity)
    elif not verbosity:
        global _verbosity
        __verbosity = _verbosity

    if json:
        __output_mode = _OM_JSON
    elif text:
        __output_mode = _OM_TEXT
    elif not json and not text:
        global _output_mode
        __output_mode = _output_mode

    reply = _mapi.sendRecv(msg)
    generic_reply_handler(reply, print_coll, __output_mode, __verbosity)


@coll.command(name='delete',help="Delete existing collection")
@click.argument("df_id", metavar="id", nargs=-1)
@_global_output_options
def coll_delete(df_id, verbosity, json, text):
    resolved_list = []
    for ids in df_id:
        resolved_list.append(resolve_coll_id(ids))
    if _interactive:
        click.echo("Warning: this will delete all data records and collections contained in the specified collection(s).")
        if not click.confirm("Do you want to delete collection(s) {} ?".format(resolved_list)):
            return
    msg = auth.CollDeleteRequest()
    msg.id.extend(resolved_list)
    if verbosity:
        __verbosity = int(verbosity)
    elif not verbosity:
        global _verbosity
        __verbosity = _verbosity

    if json:
        __output_mode = _OM_JSON
    elif text:
        __output_mode = _OM_TEXT
    elif not json and not text:
        global _output_mode
        __output_mode = _output_mode

    reply = _mapi.sendRecv(msg)
    generic_reply_handler(reply, print_ack_reply, __output_mode, __verbosity)


@coll.command(name='add',help="Add data/collection ITEM_ID to collection COLL_ID")
@click.argument("item_id")
@click.argument("coll_id")
@_global_output_options
def coll_add(item_id,coll_id, verbosity, json, text):
    msg = auth.CollWriteRequest()
    msg.id = resolve_coll_id(coll_id)
    msg.add.append(resolve_id(item_id))
    if verbosity:
        __verbosity = int(verbosity)
    elif not verbosity:
        global _verbosity
        __verbosity = _verbosity

    if json:
        __output_mode = _OM_JSON
    elif text:
        __output_mode = _OM_TEXT
    elif not json and not text:
        global _output_mode
        __output_mode = _output_mode
    reply, mt = _mapi.sendRecv(msg)
    if __verbosity >= 1:
        if mt == "ListingReply": # TODO: Should be AckReply?
            click.echo("Success: Item {} added to collection {}.".format(item_id, coll_id))


@coll.command(name='remove',help="Remove data/collection ITEM_ID from collection COLL_ID")
@click.argument("item_id")
@click.argument("coll_id")
@_global_output_options
def coll_rem(item_id,coll_id, verbosity, json, text):
    msg = auth.CollWriteRequest()
    msg.id = resolve_coll_id(coll_id)
    msg.rem.append(resolve_id(item_id))
    if verbosity:
        __verbosity = int(verbosity)
    elif not verbosity:
        global _verbosity
        __verbosity = _verbosity

    if json:
        __output_mode = _OM_JSON
    elif text:
        __output_mode = _OM_TEXT
    elif not json and not text:
        global _output_mode
        __output_mode = _output_mode
    reply, mt = _mapi.sendRecv(msg)
    if __verbosity >= 1:
        if mt == "ListingReply": # TODO: Should be AckReply?
            click.echo("Success: Item {} removed from collection {}.".format(item_id, coll_id))

#------------------------------------------------------------------------------
# Query command group
@cli.command(cls=AliasedGroup,help="Query subcommands")
def query():
    pass


@query.command(name='list',help="List saved queries")
@click.option("-o","--offset",default=0,help="List offset")
@click.option("-c","--count",default=20,help="List count")
@_global_output_options
def query_list(offset,count, verbosity, json, text):
    msg = auth.QueryListRequest()
    msg.offset = offset
    msg.count = count
    if verbosity:
        __verbosity = int(verbosity)
    elif not verbosity:
        global _verbosity
        __verbosity = _verbosity

    if json:
        __output_mode = _OM_JSON
    elif text:
        __output_mode = _OM_TEXT
    elif not json and not text:
        global _output_mode
        __output_mode = _output_mode
    reply = _mapi.sendRecv(msg)
    generic_reply_handler( reply, print_listing, __output_mode, __verbosity)
    #TODO: Figure out verbosity-dependent replies


@query.command(name='exec',help="Execute a stored query by ID")
@click.argument("df_id", metavar="id")
@_global_output_options
def query_exec(df_id, verbosity, json, text):
    msg = auth.QueryExecRequest()
    msg.id = resolve_id(df_id)
    if verbosity:
        __verbosity = int(verbosity)
    elif not verbosity:
        global _verbosity
        __verbosity = _verbosity

    if json:
        __output_mode = _OM_JSON
    elif text:
        __output_mode = _OM_TEXT
    elif not json and not text:
        global _output_mode
        __output_mode = _output_mode
    reply = _mapi.sendRecv(msg)
    generic_reply_handler( reply, print_listing, __output_mode, __verbosity)


@query.command(name='text',help="Query by words or phrases")
def query_text():
    click.echo("TODO: NOT IMPLEMENTED")


@query.command(name='meta',help="Query by metadata expression")
def query_meta():
    click.echo("TODO: NOT IMPLEMENTED")


@query.command(cls=AliasedGroup,help="Query scope subcommands")
def scope():
    click.echo("TODO: NOT IMPLEMENTED")


@scope.command(name='view',help="View categories and/or collections in query scope")
def scope_view():
    click.echo("TODO: NOT IMPLEMENTED")


@scope.command(name='add',help="Add category or collection to query scope")
def scope_add():
    click.echo("TODO: NOT IMPLEMENTED")


@scope.command(name='remove',help="Remove category or collection from query scope")
def scope_rem():
    click.echo("TODO: NOT IMPLEMENTED")


@scope.command(name='clear',help="Remove all categories and/or collections from query scope")
def scope_clear():
    click.echo("TODO: NOT IMPLEMENTED")


@scope.command(name='reset',help="Reset query scope to default")
def scope_reset():
    click.echo("TODO: NOT IMPLEMENTED")


# ------------------------------------------------------------------------------
# User command group

@cli.command(cls=AliasedGroup,help="User commands")
def user():
    pass


@user.command(name='collab',help="List all users associated with common projects")
@click.option("-o","--offset",default=0,help="List offset")
@click.option("-c","--count",default=20,help="List count")
@_global_output_options
def user_collab(offset,count, verbosity, json, text):
    msg = auth.UserListCollabRequest()
    msg.offset = offset
    msg.count = count
    if verbosity:
        __verbosity = int(verbosity)
    elif not verbosity:
        global _verbosity
        __verbosity = _verbosity

    if json:
        __output_mode = _OM_JSON
    elif text:
        __output_mode = _OM_TEXT
    elif not json and not text:
        global _output_mode
        __output_mode = _output_mode
    reply = _mapi.sendRecv(msg)

    generic_reply_handler( reply, print_user_listing, __output_mode, __verbosity)


@user.command(name='all',help="List all users")
@click.option("-o","--offset",default=0,help="List offset")
@click.option("-c","--count",default=20,help="List count")
@_global_output_options
def user_all(offset,count, verbosity, json, text):
    msg = auth.UserListAllRequest()
    msg.offset = offset
    msg.count = count
    if verbosity:
        __verbosity = int(verbosity)
    elif not verbosity:
        global _verbosity
        __verbosity = _verbosity

    if json:
        __output_mode = _OM_JSON
    elif text:
        __output_mode = _OM_TEXT
    elif not json and not text:
        global _output_mode
        __output_mode = _output_mode
    reply = _mapi.sendRecv(msg)

    generic_reply_handler( reply, print_user_listing, __output_mode, __verbosity)


@user.command(name='view',help="View information for user UID")
@click.argument("uid")
@_global_output_options
def user_view(uid, verbosity, json, text):
    msg = auth.UserViewRequest()
    msg.uid = resolve_id(uid)
    if verbosity:
        __verbosity = int(verbosity)
    elif not verbosity:
        global _verbosity
        __verbosity = _verbosity

    if json:
        __output_mode = _OM_JSON
    elif text:
        __output_mode = _OM_TEXT
    elif not json and not text:
        global _output_mode
        __output_mode = _output_mode
    reply = _mapi.sendRecv(msg)

    generic_reply_handler( reply, print_user, __output_mode, __verbosity)


# ------------------------------------------------------------------------------
# Project command group

@cli.command(cls=AliasedGroup,help="Project commands")
def project():
    pass


@project.command(name='list',help="List projects")
@click.option("-o","--owner",is_flag=True,help="Include owned projects")
@click.option("-a","--admin",is_flag=True,help="Include administered projects")
@click.option("-m","--member",is_flag=True,help="Include membership projects")
@_global_output_options
def project_list(owner,admin,member, verbosity, json, text):
    if not (owner or admin or member):
        owner = True
        admin = True
        member = True
    msg = auth.ProjectListRequest()
    msg.as_owner = owner
    msg.as_admin = admin
    msg.as_member = member
    if verbosity:
        __verbosity = int(verbosity)
    elif not verbosity:
        global _verbosity
        __verbosity = _verbosity

    if json:
        __output_mode = _OM_JSON
    elif text:
        __output_mode = _OM_TEXT
    elif not json and not text:
        global _output_mode
        __output_mode = _output_mode

    reply = _mapi.sendRecv( msg )
    generic_reply_handler( reply, print_listing, __output_mode, __verbosity) #print listing prints "Alias" despite proj not having any


@project.command(name='view',help="View project specified by ID")
@click.argument("df_id", metavar="id")
@_global_output_options
def project_view(df_id, verbosity, json, text):
    msg = auth.ProjectViewRequest()
    msg.id = resolve_id(df_id)
    if verbosity:
        __verbosity = int(verbosity)
    elif not verbosity:
        global _verbosity
        __verbosity = _verbosity

    if json:
        __output_mode = _OM_JSON
    elif text:
        __output_mode = _OM_TEXT
    elif not json and not text:
        global _output_mode
        __output_mode = _output_mode
    reply = _mapi.sendRecv(msg)
    generic_reply_handler( reply, print_proj , __output_mode, __verbosity)


# ------------------------------------------------------------------------------
# Shared data command group

@cli.command(cls=AliasedGroup,help="Shared data commands")
def shared():
    pass


@shared.command(name="users",help="List users with shared data")
@_global_output_options
def shared_users(verbosity, json, text):
    msg = auth.ACLByUserRequest()
    if verbosity:
        __verbosity = int(verbosity)
    elif not verbosity:
        global _verbosity
        __verbosity = _verbosity

    if json:
        __output_mode = _OM_JSON
    elif text:
        __output_mode = _OM_TEXT
    elif not json and not text:
        global _output_mode
        __output_mode = _output_mode
    reply = _mapi.sendRecv( msg )
    generic_reply_handler( reply, print_user_listing, __output_mode, __verbosity )


@shared.command(name="projects",help="List projects with shared data")
@_global_output_options
def shared_projects(verbosity, json, text):
    msg = auth.ACLByProjRequest()
    if verbosity:
        __verbosity = int(verbosity)
    elif not verbosity:
        global _verbosity
        __verbosity = _verbosity

    if json:
        __output_mode = _OM_JSON
    elif text:
        __output_mode = _OM_TEXT
    elif not json and not text:
        global _output_mode
        __output_mode = _output_mode
    reply = _mapi.sendRecv( msg )
    generic_reply_handler( reply, print_proj_listing, __output_mode, __verbosity ) #Haven't tested


@shared.command(name="list",help="List data shared by user/project ID")
@click.argument("df_id", metavar = "id")
@_global_output_options
def shared_list(df_id, verbosity, json, text):
    id2 = resolve_id(df_id)

    if id2.startswith("p/"):
        msg = auth.ACLByProjListRequest()
    else:
        if not id2.startswith("u/"):
            id2 = "u/" + id2
        msg = auth.ACLByUserListRequest()

    msg.owner = id2
    if verbosity:
        __verbosity = int(verbosity)
    elif not verbosity:
        global _verbosity
        __verbosity = _verbosity

    if json:
        __output_mode = _OM_JSON
    elif text:
        __output_mode = _OM_TEXT
    elif not json and not text:
        global _output_mode
        __output_mode = _output_mode
    reply = _mapi.sendRecv( msg )
    generic_reply_handler( reply, print_listing, __output_mode, __verbosity )


# ------------------------------------------------------------------------------
# Transfer commands

@cli.command(cls=AliasedGroup,help="Data transfer management commands")
def xfr():
    pass


@xfr.command(name='list',help="List recent transfers")
@click.option("-s","--since",help="List from specified time (use s,h,d suffix)")
@click.option("-f","--from","time_from",help="List from specified absolute time (timestamp)")
@click.option("-t","--to",help="List up to specified absolute time (timestamp)")
@click.option("-st","--status",type=click.Choice(["0","1","2","3","4","init","initiated","active","inactive","succeeded","failed"]),help="List transfers matching specified status")
@_global_output_options
def xfr_list(time_from,to,since,status, verbosity, json, text): # TODO: Absolute time is not user friendly
    click.echo("TODO: NOT IMPLEMENTED")
    msg = auth.XfrListRequest()
   #msg.(from) = time_from # TODO: 'From' is a magic keyword and shouldn't be used in python
    msg.to = to
    msg.since = since
    if status in ["0","1","2","3","4"]: msg.status = int(status)
    elif status == "init" or status == "initiated": msg.status = 0
    elif status == "active": msg.status = 1
    elif status == "inactive": msg.status = 2
    elif status == "succeeded": msg.status = 3
    elif status == "failed": msg.status = 4
    if verbosity:
        __verbosity = int(verbosity)
    elif not verbosity:
        global _verbosity
        __verbosity = _verbosity

    if json:
        __output_mode = _OM_JSON
    elif text:
        __output_mode = _OM_TEXT
    elif not json and not text:
        global _output_mode
        __output_mode = _output_mode
    reply = _mapi.sendRecv(msg)
    generic_reply_handler( reply, print_listing, __output_mode, __verbosity )


@xfr.command(name='stat',help="Get status of transfer ID, or most recent transfer id ID omitted")
@click.argument("df_id", metavar="id",required=False,default="MOST RECENT XFR ID") # Does this have to be a dynamic global variable?
@_global_output_options
def xfr_stat(df_id, verbosity, json, text):
    if verbosity:
        __verbosity = int(verbosity)
    elif not verbosity:
        global _verbosity
        __verbosity = _verbosity

    if json:
        __output_mode = _OM_JSON
    elif text:
        __output_mode = _OM_TEXT
    elif not json and not text:
        global _output_mode
        __output_mode = _output_mode
    if df_id:
        msg = auth.XfrViewRequest()
        msg.xfr_id = resolve_id(df_id)
        reply = _mapi.sendRecv(msg)
        generic_reply_handler( reply, print_xfr_stat, __output_mode, __verbosity )
    elif not df_id:
        msg = auth.XfrListRequest() # TODO: How to isolate most recent Xfr
        reply = _mapi.sendRecv(msg)
        generic_reply_handler( reply, print_listing, __output_mode, __verbosity )


# ------------------------------------------------------------------------------
# End-point commands

@cli.command(cls=AliasedGroup,help="Endpoint commands")
def ep():
    pass


@ep.command(name='get',help="Get Globus endpoint for the current session. At the start of the session, this will be the previously configured default endpoint.")
def ep_get():
    global _ep_cur
    if _ep_cur:
        click.echo(_ep_cur)
    else:
        global _ep_default
        if _ep_default:
            _ep_cur = _ep_default
            info(1, _ep_cur)
        else:
            info(1,"No endpoint specified for the current session, and default end-point has not been configured.")


@ep.command(name='default',help="Get or set the default Globus endpoint. If no endpoint is given, the previously configured default endpoint will be returned. If an argument is given, the new endpoint will be set as the default.")
@click.argument("new_default_ep",required=False)
def ep_default(new_default_ep): ### CAUTION: Setting a new default will NOT update the current session's endpoint automatically --- MUST FOLLOW WITH EP SET
    global _ep_default
    if new_default_ep:
        new_default_ep = resolve_index_val(new_default_ep)
        _cfg.set("default_ep",new_default_ep,True)
        _ep_default = new_default_ep

    else:
        if _ep_default:
            click.echo(_ep_default)
        else:
            click.echo("Default endpoint has not been configured.")


@ep.command(name='set',help="Set endpoint for the current session. If no endpoint is given, the previously configured default endpoint will be used.")
@click.argument("path",required=False)
def ep_set(path):
    global _ep_cur
    if path:
        _ep_cur = resolve_index_val(path)
    else:
        if _ep_default:
            _ep_cur = _ep_default
        else:
            info(1,"Default endpoint has not been configured.")
            return

    info(1,_ep_cur)


@ep.command(name='list',help="List recent endpoints.") # TODO: Process returned paths to isolate and list indexed endpoints only. With index
@_global_output_options
def ep_list(verbosity, json, text):
    msg = auth.UserGetRecentEPRequest()
    reply = _mapi.sendRecv( msg )
    generic_reply_handler( reply, print_endpoints )


# ------------------------------------------------------------------------------
# Miscellaneous commands

@cli.command(name='ident',help="Set current user or project identity to ID (omit for self)") # Does this actually switch the identity??
@click.option("-s","--show",is_flag=True,help="Show current identity")
@click.argument("df_id", metavar="id",required=False)
def ident(df_id,show):
    global _cur_sel
    global _cur_coll
    global _cur_alias_prefix

    if show:
        click.echo(_cur_sel)
        return

    if df_id == None:
        df_id = _uid

    if df_id[0:2] == "p/":
        msg = auth.ProjectViewRequest()
        msg.id = df_id
        reply, mt = _mapi.sendRecv( msg )

        _cur_sel = df_id
        _cur_coll = "c/p_" + _cur_sel[2:] + "_root"
        _cur_alias_prefix = "p:" + _cur_sel[2:] + ":"

        info(1,"Switched to project " + _cur_sel)
    else:
        if df_id[0:2] != "u/":
            id = "u/" + df_id

        msg = auth.UserViewRequest()
        msg.uid = df_id
        reply, mt = _mapi.sendRecv( msg )

        _cur_sel = df_id
        _cur_coll = "c/u_" + _cur_sel[2:] + "_root"
        _cur_alias_prefix = "u:" + _cur_sel[2:] + ":"

        info(1,"Switched to user " + _cur_sel)

@cli.command(name='setup',help="Setup local credentials")
@click.pass_context
def setup(ctx):
    cfg_dir = _cfg.get("client_cfg_dir")
    if cfg_dir == None:
        raise Exception("Client configuration directory is not configured")
    msg = auth.GenerateCredentialsRequest()
    reply, mt = _mapi.sendRecv( msg )

    keyf = open(os.path.join(cfg_dir, "datafed-user-key.pub"), "w" )
    keyf.write( reply.pub_key )
    keyf.close()

    keyf = open(os.path.join(cfg_dir, "datafed-user-key.priv"), "w" )
    keyf.write( reply.priv_key )
    keyf.close()

    print("Ok")


@cli.command(name='help',help="Show datafed client help")
@click.pass_context
def help_cli(ctx):
    click.echo(ctx.parent.get_help())


@cli.command(name="exit",help="Exit interactive session")
def exit_cli():
    global _interactive
    _interactive = True
    sys.exit(0)


# ------------------------------------------------------------------------------
# Print and Utility functions

def resolve_index_val(df_id):
    try:
        if len(df_id) <= 3:
            global _list_items
            if df_id.endswith("."):
                df_idx = int(df_id[:-1])
            else:
                df_idx = int(df_id)
            if df_idx <= len(_list_items):
                #print("found")
                return _list_items[df_idx-1]
    except ValueError:
        #print("not a number")
        pass

    return df_id


def resolve_id(df_id):
    df_id2 = resolve_index_val(df_id)

    if (len(df_id2) > 2 and df_id2[1] == "/") or (df_id2.find(":") > 0):
        return df_id2

    return _cur_alias_prefix + df_id2


def resolve_coll_id(df_id):
    if df_id == ".":
        return _cur_coll
    elif df_id == "/":
        if _cur_sel[0] == "p":
            return "c/p_" + _cur_sel[2:] + "_root"
        else:
            return "c/u_" + _cur_sel[2:] + "_root"
    elif df_id == "..":
        msg = auth.CollGetParentsRequest()
        msg.id = _cur_coll
        msg.all = False
        reply, mt = _mapi.sendRecv(msg)
        if len(reply.coll):
            return reply.coll[0].id
        else:
            raise Exception("Already at root")

    df_id2 = resolve_index_val(df_id)
    #print("inter id:",df_id2)
    if (len(df_id2) > 2 and df_id2[1] == "/" ) or (df_id2.find(":") > 0):
        return df_id2

    return _cur_alias_prefix + df_id2


def put_data(df_id,gp,wait,extension):
    global _verbosity
    msg = auth.DataPutRequest()
    msg.id = resolve_id(df_id)
    msg.path = gp
    if extension: msg.ext = extension
    reply = _mapi.sendRecv(msg)
    xfr_id = reply[0].xfr[0].id
    if _output_mode == _OM_JSON:
        click.echo('{{ "Transfer ID": "{}" }}'.format(xfr_id))
    elif _output_mode == _OM_TEXT:
        click.echo("{:<25} {:<50}".format("Transfer ID:",xfr_id))
    if wait:
        if _verbosity >= 1 and _output_mode == _OM_TEXT:
            click.echo("Waiting")
        elif _output_mode == _OM_JSON:
            click.echo('{ "Status": "Waiting" }')  # TODO: Figure out verbosity replies (1 or 2 for updates loop?)
        while wait is True:
            time.sleep(2)
            update_msg = auth.XfrViewRequest()
            update_msg.xfr_id = xfr_id
            reply = _mapi.sendRecv(update_msg)
            check = reply[0].xfr[0]
            if check.status == 3 or check.status == 4: break
            statuses = {0: "Initiated", 1: "Active", 2: "Inactive", 3: "Succeeded", 4: "Failed"}
            xfr_status = statuses.get(check.status, "None")
            if _output_mode == _OM_JSON:
                click.echo('{{ "Transfer ID": "{}" , "Status": "{}" }}'.format(check.id, xfr_status))
            elif _verbosity >= 1 and _output_mode == _OM_TEXT:
                click.echo("{:<25} {:<50} {:<25} {:<25}".format("Transfer ID:",check.id,"Status:",xfr_status))
        generic_reply_handler(reply,print_xfr_stat)
    else:
        generic_reply_handler(reply,print_xfr_stat)


def resolve_filepath_for_xfr(path):

    if path[0] == "~":
        path = pathlib.Path(path).expanduser().resolve() #home, no endpoint
     #   click.echo("begin with tilde, resolved expanded path is {}".format(path))
    elif path[0] == ".":
        path = pathlib.Path.cwd() / path
        path = path.resolve() #relative path
     #   click.echo("begin with period, resolved path is {}".format(path))

    endpoint_name = re.compile(r'[\w\-]+#[\w\-]+')
    endpoint_uuid = re.compile(r'[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}', re.I)

    if re.match(endpoint_name, str(path)) or re.match(endpoint_uuid, str(path)): #starts with endpoint
        fp = path
     #   click.echo("endpoint regex match successful, full globus path taken as {}".format(fp))

    else:
        fp = pathlib.PurePath(path)
   #     click.echo("No endpoint found, purepath is {}".format(fp))

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
        global _ep_default
        if _ep_cur:
            fp = _ep_cur + str(fp)
    #        click.echo("Found current endpoint, globus path is {}".format(str(fp)))
        elif _ep_cur is None:
            if _ep_default:
                fp = _ep_default + str(fp)
    #            click.echo("Found default endpoint, globus path is {}".format(str(fp)))
            elif _ep_default is None:
    #            click.echo("Path given does not appear to contain an endpoint, and no default or current session endpoint has been specified.")
                return

    return str(fp)

'''
def resolve_filepath_for_xfr(filepath):
    if filepath[0] == '/':  # absolute full path, must be in globus format
        filepath = filepath[1:]

    elif filepath[0] != "/":  # relative path to be resolved
        filepath = phathlib.Path.cwd() / filepat
        filepath = filepath.resolve()  # now absolute path

    fp = pathlib.PurePath(filepath)

    if isinstance(fp, pathlib.PureWindowsPath):  # If Windows flavour
        if fp.drive:  # turning drive letter into globus-suitable format
            drive_name = fp.drive.replace(':', '')
            click.echo(drive_name)
            parts = fp.parts[1:]
            click.echo(parts)
            fp = pathlib.PurePosixPath('/' + drive_name)
            click.echo(fp)
            for item in parts:
                fp = fp / str(item)  # adds each part
                click.echo(fp)

    return str(fp)


def resolve_globus_path(fp, endpoint):
    global _ep_cur
    global _ep_default
    if fp[0] != '/':
        fp = "/" + fp
    if endpoint != "None":
        fp = endpoint + fp
    elif endpoint == "None":
        if _ep_cur:
            fp = _ep_cur + fp
        elif _ep_cur is None:
            if _ep_default:
                fp = _ep_default + fp
            elif _ep_default is None:
                fp = None

    return fp #endpoint and path
'''

def generic_reply_handler( reply, printFunc , output_mode, verbosity ): # NOTE: Reply is a tuple containing (reply msg, msg type)
    if output_mode == _OM_RETN:
        global _return_val
        _return_val = reply
    if reply[1] == "AckReply":
        print_ack_reply(output_mode, verbosity)
    #elif str(reply[0]) == "":
    #    click.echo("None")
    elif output_mode == _OM_JSON:
        click.echo(MessageToJson(reply[0],preserving_proto_field_name=True))
    else:
        printFunc( reply[0] , verbosity)


def print_ack_reply(output_mode, verbosity):

    if output_mode == _OM_JSON:
        click.echo('{ "Status":"OK" }')
    elif output_mode == _OM_TEXT and verbosity > 0:
        click.echo("OK")


def print_listing(reply, verbosity):
    df_idx = 1
    global _list_items
    _list_items = []
    #click.echo("{:3} {:12} ({:20} {}".format("","DataFed ID","Alias)","Title")) #because projects don't have aliases
    for i in reply.item:
        _list_items.append(i.id)
        if i.alias:
            click.echo("{:2}. {:12} ({:20} {}".format(df_idx,i.id,i.alias+')',i.title))
        else:
            click.echo("{:2}. {:34} {}".format(df_idx,i.id,i.title))
        df_idx += 1


def print_user_listing( reply, verbosity ):
    df_idx = 1
    global _list_items
    _list_items = []
    for i in reply.user:
        _list_items.append(i.uid)
        click.echo("{:2}. {:24} {}".format(df_idx,i.uid,i.name))
        df_idx += 1


def print_proj_listing(reply, verbosity): #reply is a ListingReply message
    df_idx = 1
    global _list_items
    _list_items = []
    for i in reply.proj:
        _list_items.append(i.id)
        click.echo("{:2}. {:24} {}".format(df_idx,i.id,i.title))
        df_idx += 1


def print_endpoints(reply, verbosity):
    df_idx = 1
    global _list_items
    _list_items = []
    for i in reply.ep:
        p = i.rfind("/")
        if p >= 0:
            path = i[0:p+1]
            _list_items.append(path)
            click.echo("{:2}. {}".format(df_idx,path))
            df_idx += 1


def print_data(message, verbosity):

    dr = message.data[0]
    if verbosity >= 0:
        click.echo("{:<25} {:<50}".format('ID: ', dr.id) + '\n' +
                   "{:<25} {:<50}".format('Title: ', dr.title) + '\n' +
                   "{:<25} {:<50}".format('Alias: ', dr.alias))
    if verbosity >= 1:
        click.echo("{:<25} {:<50}".format('Description: ', dr.desc) + '\n' +
                   "{:<25} {:<50}".format('Keywords: ', dr.keyw) + '\n' +
                   "{:<25} {:<50}".format('Size: ', human_readable_bytes(dr.size)) + '\n' + ## convert to gigs?
                   "{:<25} {:<50}".format('Date Created: ', time.strftime("%D %H:%M", time.gmtime(dr.ct))) + '\n' +
                   "{:<25} {:<50}".format('Date Updated: ', time.strftime("%D %H:%M", time.gmtime(dr.ut))))
    if verbosity >= 2:
        click.echo("{:<25} {:<50}".format('Topic: ', dr.topic) + '\n' +
                   "{:<25} {:<50}".format('Is Public: ', str(dr.ispublic)) + '\n' +
                   "{:<25} {:<50}".format('Data Repo ID: ', dr.repo_id) + '\n' +
                   "{:<25} {:<50}".format('Source: ', dr.source) + '\n' +
                   "{:<25} {:<50}".format('Extension: ', dr.ext) + '\n' +
                   "{:<25} {:<50}".format('Auto Extension: ', str(dr.ext_auto)) + '\n' +
                   "{:<25} {:<50}".format('Owner: ', dr.owner) + '\n' +
                   "{:<25} {:<50}".format('Locked: ', str(dr.locked)) + '\n' +
                   "{:<25} {:<50}".format('Parent Collection ID: ', dr.parent_id))
        if dr.metadata:
            click.echo("{:<25} {:<50}".format('Metadata: ', (jsonlib.dumps(jsonlib.loads(dr.metadata), indent=4)))) # TODO: Paging function
        elif not dr.metadata:
            click.echo("{:<25} {:<50}".format('Metadata: ', "None"))
        if not dr.deps:
            click.echo("{:<25} {:<50}".format('Dependencies: ', 'None'))
        elif dr.deps:
            click.echo("{:<25}".format('Dependencies:'))
            print_deps(message)


def print_coll(message, verbosity):

    coll = message.coll[0]
    if verbosity >= 0:
        click.echo("{:<25} {:<50}".format('ID: ', coll.id) + '\n' +
                   "{:<25} {:<50}".format('Title: ', coll.title) + '\n' +
                   "{:<25} {:<50}".format('Alias: ', coll.alias))
    if verbosity >= 1:
        click.echo("{:<25} {:<50}".format('Description: ',coll.desc) + '\n' +
                   "{:<25} {:<50}".format('Owner: ', coll.owner) + '\n' +
                   "{:<25} {:<50}".format('Parent Collection ID: ', coll.parent_id))
    if verbosity == 2:
        click.echo("{:<25} {:<50}".format('Is Public: ', str(coll.ispublic)) + '\n' +
                   "{:<25} {:<50}".format('Date Created: ', time.strftime("%D %H:%M", time.gmtime(coll.ct))) + '\n' +
                   "{:<25} {:<50}".format('Date Updated: ', time.strftime("%D %H:%M", time.gmtime(coll.ut))))

'''
def print_deps(dependencies):
    if dependencies is not None or dependencies != "None":
        deps = list(dependencies)
        click.echo("{:<5} {:<10} {:<25} {:<15} {:<25}".format("", 'Direction','Type','ID', 'Alias'))
        for item in deps:
            rep = item.get
            click.echo("{:<5} {:<10} {:<25} {:<15} {:<25}".format("", rep('dir', 'None'),rep('type', 'None'),rep('id', 'None'), rep('alias', 'None')))
'''

def print_deps(message):
    types = {0: "is Derived from", 1: "is a Component of", 2: "is a New Version of"}
    dr = message.data[0]
    dep = message.data[0].deps
    for i in dep:
        if i.dir == 0: # incoming -- DR is old, precursor, or container -- DEP is relative of DR
            click.echo("{:2} {:12} ({:<15} {:20} {:12} ({:<15}".format(
                "",i.id,i.alias+')',types[i.type],dr.id,dr.alias+')'))
        elif i.dir == 1: # outgoing -- DR is new, derivation, or component -- DR is relative of DEP
            click.echo("{:2} {:12} ({:<15} {:20} {:12} ({:<15}".format(
                "",dr.id,dr.alias+')',types[i.type],i.id,i.alias+')'))


def print_xfr_stat(message, verbosity):

    for xfr in message.xfr:
        modes = { 0: "Get", 1: "Put", 2: "Copy"}
        xfr_mode = modes.get(xfr.mode, "None")
        statuses = { 0: "Initiated", 1: "Active", 2: "Inactive", 3: "Succeeded", 4: "Failed"}
        xfr_status = statuses.get(xfr.status, "None")
        df_ids = []
        for files in xfr.repo.file: df_ids.append(files.id)
        if verbosity >= 0:
            click.echo("{:<25} {:<50}".format('Xfr ID: ', xfr.id) + '\n' +
                       "{:<25} {:<50}".format('Mode: ', xfr_mode) + '\n' +
                       "{:<25} {:<50}".format('Status: ', str(xfr_status)))
        if verbosity >= 1:
            click.echo("{:<25} {:<50}".format('Data Record ID/s: ', str(df_ids)) + '\n' +
                       "{:<25} {:<50}".format('Date Started: ', time.strftime("%D %H:%M", time.gmtime(xfr.started))) + '\n' +
                       "{:<25} {:<50}".format('Date Updated: ', time.strftime("%D %H:%M", time.gmtime(xfr.started))))
        if verbosity == 2:
            click.echo("{:<25} {:<50}".format('Remote Endpoint:', xfr.rem_ep) + '\n' 
                       "{:<25} {:<50}".format('Remote Path: ', xfr.rem_path))


def print_user(message, verbosity):

    usr = message.user[0]
    if verbosity >= 0:
        click.echo("{:<25} {:<50}".format('User ID: ', usr.uid) + '\n' +
                   "{:<25} {:<50}".format('Name: ', usr.name) + '\n' +
                   "{:<25} {:<50}".format('Email: ', usr.email))


def print_metadata(message):
    pass


def print_proj(message, verbosity):

    proj = message.proj[0]
    admins = []
    members = []
    for i in proj.admin: admins.append(i)
    for i in proj.member: members.append(i)
    if verbosity >= 0:
        click.echo("{:<25} {:<50}".format('ID: ', proj.id) + '\n' +
                   "{:<25} {:<50}".format('Title: ', proj.title) + '\n' +
                   "{:<25} {:<50}".format('Description: ', proj.desc))
    if verbosity >= 1:
        click.echo("{:<25} {:<50}".format('Owner: ', proj.owner) + '\n' +
                   "{:<25} {:<50}".format('Admin(s): ', str(admins)) + '\n' +
                   "{:<25} {:<50}".format('Members: ', str(members)))
    if verbosity == 2:
        click.echo("{:<25} {:<50}".format('Date Created: ', time.strftime("%D %H:%M", time.gmtime(proj.ct))) + '\n' +
                   "{:<25} {:<50}".format('Date Updated: ', time.strftime("%D %H:%M", time.gmtime(proj.ut))) + '\n' +
                   "{:<25} {:<50}".format('Sub Repo: ', proj.sub_repo) + '\n' +
                   "{:<25} {:<50}".format('Sub Allocation: ', human_readable_bytes(proj.sub_alloc) + '\n' +
                   "{:<25} {:<50}".format('Sub Usage: ', human_readable_bytes(proj.sub_usage))))
        for i in proj.alloc:
            print_allocation_data(i)


def print_allocation_data(alloc): #
    click.echo("{:<25} {:<50}".format('Repo: ', alloc.repo) + '\n' +
               "{:<25} {:<50}".format('Max Size: ', human_readable_bytes(alloc.max_size)) + '\n' +
               "{:<25} {:<50}".format('Total Size: ', human_readable_bytes(alloc.tot_size)) + '\n' +
               "{:<25} {:<50}".format('Max Record Count: ', alloc.max_count) + '\n' +
               "{:<25} {:<50}".format('Path: ', alloc.path) + '\n' +
               "{:<25} {:<50}".format('ID: ', alloc.id) + '\n' +
               "{:<25} {:<50}".format('Sub Allocation: ', str(alloc.sub_alloc)))


def human_readable_bytes(size,precision=2):
    suffixes=['B','KB','MB','GB','TB']
    suffixIndex = 0
    while size > 1024 and suffixIndex < 4:
        suffixIndex += 1 #increment the index of the suffix
        size = size/1024.0 #apply the division
    return "%.*f%s" % (precision,size,suffixes[suffixIndex])


def _initialize( opts ):
    global _mapi
    global _uid
    global _verbosity
    global _interactive
    global _cur_sel
    global _cfg
    global _ep_default
    global _ep_cur

    _cfg = Config.API( opts )
    opts = _cfg.getOpts()

    _ep_default = _cfg.get("default_ep")
    _ep_cur = _ep_default

    tmp = _cfg.get("verbosity")
    if tmp != None:
        _verbosity = tmp

    tmp = _cfg.get("interactive")
    if tmp != None:
        _interactive = tmp

    info( 1, "Welcome to DataFed CLI, version", version )
    if _verbosity > 1:
        print( "Settings details:" )
        _cfg.printSettingInfo()

    #print("opts:",opts)

    try:
        _mapi = MessageLib.API( **opts )
    except Exception as e:
        click.echo(e)
        _interactive = False
        sys.exit(1)

    # Ignore 'manual_auth' option if set in exec mode
    if opts["manual_auth"] and _output_mode == _OM_RETN:
        opts["manual_auth"] = False

    auth, uid = _mapi.getAuthStatus()

    if opts["manual_auth"] or not auth:
        if not opts["manual_auth"]:
            if not _mapi.keysLoaded():
                if _output_mode == _OM_RETN:
                    raise Exception("Not authenticated: no local credentials loaded.")
                info(1,"No local credentials loaded.")
            elif not _mapi.keysValid():
                if _output_mode == _OM_RETN:
                    raise Exception("Not authenticated: invalid local credentials.")
                info(1,"Invalid local credentials.")

            info(0,"Manual authentication required.")
        i = 0
        while i < 3:
            i += 1
            uid = click.prompt("User ID: ")
            password = getpass.getpass(prompt="Password: ")
            try:
                _mapi.manualAuth( uid, password )
                break
            except Exception as e:
                click.echo(e)

        if i == 3:
            info(1,"Aborting...")
            _interactive = True
            sys.exit(1)

        _mapi.installLocalCredentials()
    else:
        info(1,"Authenticated as",uid)

    _uid = uid
    _cur_sel = uid

