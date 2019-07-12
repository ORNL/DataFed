"""
DataFed high-level API
"""

from __future__ import division, print_function, absolute_import #, unicode_literals
import shlex
import getpass
import os
import sys
import click
import click.decorators
import re
import json
import time
import pathlib
from google.protobuf.json_format import MessageToJson
from google.protobuf.json_format import MessageToDict
import pdb

#import prompt_toolkit
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
    #raw_input = input

mapi = None
cfg = Config.API()

g_return_val = None
g_uid = None
g_cur_sel = None
g_cur_coll = "root"
g_cur_alias_prefix = ""
g_list_items = []
g_interactive = False
g_verbosity = 1
g_ctxt_settings = dict(help_option_names=['-h', '-?', '--help'])
g_ep_default = cfg.get("default_ep")
g_ep_cur = g_ep_default

OM_TEXT = 0
OM_JSON = 1
OM_RETN = 2

g_output_mode = OM_TEXT

def run():
    info(1,"DataFed CLI Ver.", version )

    session = None

    try:

        while True:
            try:
                if g_interactive == False:
                    cli(standalone_mode=True)
                    if g_interactive == False:
                        break
                    for i in cli.params:
                        i.hidden = True
                else:
                    if session == None:
                        session = PromptSession(unicode("> "),history=FileHistory(os.path.expanduser("~/.datafed-hist")))
                    _args = shlex.split(session.prompt(auto_suggest=AutoSuggestFromHistory()))
                    cli(prog_name="datafed",args=_args,standalone_mode=False)
            except SystemExit as e:
                #print("Sys exit")
                if g_interactive == False:
                    break
            except KeyboardInterrupt as e:
                #print("key inter")
                break
            except Exception as e:
                #print("gen except")
                click.echo(e)
                if g_interactive == False:
                    break

    except Exception as e:
        click.echo("Exception:",e)

    info(1,"Goodbye!")

def init():
    global mapi
    global g_uid
    global g_cur_sel

    if mapi:
        raise Exception("init function can only be called once.")

    # Get config options
    opts = {}
    for oi in Config.opt_info:
        opts[oi[0]] = cfg.get(oi[0])

    #print( "opts:", opts )

    mapi = MessageLib.API( **opts )
    auth, uid = mapi.getAuthStatus()
    if auth:
        g_uid = uid
        g_cur_sel = uid

    return auth


def login( uid, password ):
    global g_uid
    global g_cur_sel

    if not mapi:
        raise Exception("login called before init.")

    if g_uid:
        raise Exception("login can only be called once.")

    mapi.manualAuth( uid, password )

    g_uid = uid
    g_cur_sel = uid

def exec( command ):
    if not mapi:
        raise Exception("exec called before init.")

    global g_return_val
    global g_output_mode

    g_return_val = None
    g_output_mode = OM_RETN

    try:
        _args = shlex.split( command )
        cli(prog_name="datafed",args=_args,standalone_mode=False)
    except SystemExit as e:
        print("SystemExit exception",e)
        pdb.pm()

    return g_return_val

# Verbosity-aware print
def info( level, *args ):
    global g_verbosity
    if level <= g_verbosity:
        print( *args )

# -----------------------------------------------------------------------------------------------------------------
# Switch functions


def set_output_json(ctx, param, value):
    global g_output_mode
    if value:
        g_output_mode = OM_JSON

def set_output_text(ctx, param, value):
    global g_output_mode
    if value:
        g_output_mode = OM_TEXT

##############################################################################

# Allows command matching by unique suffix
class AliasedGroup(click.Group):
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


def my_param_memo(f, param):
    if isinstance(f, click.Command):
        f.params.append(param)
    else:
        if not hasattr(f, '__click_params__'):
            f.__click_params__ = []
        f.__click_params__.append(param)

def config_options( cfg ):
    def wrapper(f):
        for oi in Config.opt_info:
            #OPT_NO_CL
            if oi[4] & Config.OPT_INT:
                my_param_memo(f,click.Option(oi[5],type=int,default=cfg.get(oi[0]),help=oi[6]))
            elif oi[4] & Config.OPT_BOOL:
                my_param_memo(f,click.Option(oi[5],is_flag=True,default=cfg.get(oi[0]),help=oi[6]))
            else:
                my_param_memo(f,click.Option(oi[5],type=str,default=cfg.get(oi[0]),help=oi[6]))

        return f
    return wrapper


#------------------------------------------------------------------------------
# Top-level group with global options
@click.group(cls=AliasedGroup,invoke_without_command=True,context_settings=g_ctxt_settings)
@click.option("-l","--log",is_flag=True,help="Force manual authentication")
@click.option("-j", "--json", is_flag=True,callback=set_output_json,help="Set CLI output format to JSON, when applicable.")
@click.option("-t","--text",is_flag=True,callback=set_output_text,help="Set CLI output format to human-friendly text.")
@config_options( cfg )
@click.pass_context
def cli(ctx,*args,**kwargs):
    global g_interactive
    global g_verbosity

    #print("ctx params",ctx.params)

    if ctx.params["verbosity"] != None:
        g_verbosity = ctx.params["verbosity"]

    if not g_interactive and ctx.params["i"]:
        g_interactive = True

    if not g_interactive and ctx.invoked_subcommand is None:
        click.echo("No command specified.")
        click.echo(ctx.get_help())
    elif mapi == None:
        _initialize(ctx.params)

#for i in cli.params:
#    print( i.name )

# ------------------------------------------------------------------------------
# Collection listing/navigation commands
@cli.command(help="List current collection, or collection specified by ID")
@click.option("-o","--offset",default=0,help="List offset")
@click.option("-c","--count",default=20,help="List count")
@click.argument("df-id", required=False)
@click.pass_context
def ls(ctx,df_id,offset,count): #TODO: FIX print_listing function
    global g_verbosity
    global g_cur_coll
    msg = auth.CollReadRequest()
    if df_id is not None:
        msg.id = resolve_coll_id(df_id)
    else:
        msg.id = g_cur_coll
    msg.count = count
    msg.offset = offset

    if g_verbosity > 1:
        msg.details = True
    else:
        msg.details = False

    reply = mapi.sendRecv( msg )
    genericReplyHandler( reply, print_listing )


@cli.command(help="Print or change current working collection")
@click.argument("df-id",required=False)
def wc(df_id):
    global g_cur_coll
    if df_id is not None:
        g_cur_coll = resolve_coll_id(df_id)
    else:
        click.echo(g_cur_coll)

# ------------------------------------------------------------------------------
# Data command group
@cli.command(cls=AliasedGroup,help="Data subcommands")
def data():
    pass


@data.command(name='view',help="View data record")
@click.option("-d","--details",is_flag=True,help="Show additional fields")
@click.argument("id")
def data_view(df_id,details):
    msg = auth.RecordViewRequest()
    msg.id = resolve_id(df_id)
    if details:
        msg.details = True
    elif not details:
        msg.details = False

    reply = mapi.sendRecv( msg )
    genericReplyHandler( reply, print_data )


@data.command(name='create',help="Create new data record")
@click.argument("title")
@click.option("-a","--alias",type=str,required=False,help="Alias")
@click.option("-d","--description",type=str,required=False,help="Description text")
@click.option("-kw","--key-words",type=str,required=False,help="Keywords should be in the form of a comma separated list enclosed by double quotation marks") # TODO: SORT OUT syntax
@click.option("-df","--data-file",type=str,required=False,help="Specify the path to local raw data file, either relative or absolute. This will initiate a Globus transfer. If no endpoint is provided, the default endpoint will be used.") #TODO: Put functionality
@click.option("-ext","--extension",type=str,required=False,help="Specify an extension for the raw data file. If not provided, DataFed will automatically default to the extension of the file at time of put/upload.")
@click.option("-m","--metadata",type=str,required=False,help="Metadata (JSON)")
@click.option("-mf","--metadata-file",type=click.File(mode='r'),required=False,help="Metadata file (.json with relative or absolute path)") ####WARNING:NEEDS ABSOLUTE PATH? DOES NOT RECOGNIZE ~ AS HOME DIRECTORY
@click.option("-c","--collection",type=str,required=False, default= g_cur_coll, help="Parent collection ID/alias (default is current working collection)")
@click.option("-r","--repository",type=str,required=False,help="Repository ID")
@click.option("-dep","--dependencies",multiple=True, type=click.Tuple([click.Choice(['derived', 'component', 'version', 'der', 'comp', 'ver']), str]),help="Specify dependencies by listing first the type of relationship -- 'derived' from, 'component' of, or new 'version' of -- and then the id or alias of the related record. Can be used multiple times to add multiple dependencies.")
def data_create(title,alias,description,key_words,data_file,extension,metadata,metadata_file,collection,repository,dependencies): #cTODO: FIX
    if metadata and metadata_file:
        click.echo("Cannot specify both --metadata and --metadata-file options")
        return

    msg = auth.RecordCreateRequest()
    msg.title = title
    if description: msg.desc = description
 #  msg.topic = "" # TODO: Not yet implemented
    if key_words: msg.keyw = key_words   # TODO: Determine input format for keywords -- list? quotation marks? commas?
    if alias: msg.alias = alias
    if resolve_coll_id(collection): msg.parent_id = resolve_coll_id(collection)
    if repository: msg.repo_id = repository
    msg.ext_auto = True
    if extension is not None:
        msg.ext = extension
        msg.ext_auto = False
    if metadata_file is not None:
        metadata = json.dumps(json.load(metadata_file))
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
    if not data_file:
        reply, mt = mapi.sendRecv(msg)
        print_data(reply)

    if data_file:
        create_reply, mt = mapi.sendRecv(msg)
        click.echo("Data Record update successful. Initiating raw data transfer.")
        put_data(df_id=create_reply.data[0].id,gp=data_file,wait=False,extension=None)

#TODO Handle return value in OM_RETV

    print_data(create_reply)
    #put function

@data.command(name='update',help="Update existing data record")
@click.argument("df_id")
@click.option("-t","--title",type=str,required=False,help="Title")
@click.option("-a","--alias",type=str,required=False,help="Alias")
@click.option("-d","--description",type=str,required=False,help="Description text")
@click.option("-kw","--key-words",type=str,required=False,help="Keywords (comma separated list)")
@click.option("-df","--data-file",type=str,required=False,help="Local raw data file")
@click.option("-ext","--extension",type=str,required=False,help="Specify an extension for the raw data file. If not provided, DataFed will automatically default to the extension of the file at time of put/upload.")
@click.option("-m","--metadata",type=str,required=False,help="Metadata (JSON)")
@click.option("-mf","--metadata-file",type=click.File(mode='r'),required=False,help="Metadata file (JSON)")
@click.option("-da","--dependencies-add",multiple=True, nargs=2, type=click.Tuple([click.Choice(['derived', 'component', 'version', 'der', 'comp', 'ver']), str]),help="Specify new dependencies by listing first the type of relationship -- 'derived' from, 'component' of, or new 'version' of -- and then the id or alias of the related record. Can be used multiple times to add multiple dependencies.")
@click.option("-dr","--dependencies-remove",multiple=True, nargs=2, type=click.Tuple([click.Choice(['derived', 'component', 'version', 'der', 'comp', 'ver']), str]),help="Specify dependencies to remove by listing first the type of relationship -- 'derived' from, 'component' of, or new 'version' of -- and then the id or alias of the related record. Can be used multiple times to remove multiple dependencies.") #Make type optional -- if no type given, then deletes all relationships with that record
def data_update(df_id,title,alias,description,key_words,data_file,extension,metadata,metadata_file,dependencies_add,dependencies_remove): #TODO: FIX
    if metadata and metadata_file:
        click.echo("Cannot specify both --metadata and --metadata-file options")
        return
    msg = auth.RecordUpdateRequest()
    msg.id = resolve_id(df_id)
    if title is not None: msg.title = title
    if description is not None: msg.desc = description
    if key_words is not None: msg.keyw = key_words # how can this be inputted? must it be a string without spaces? must python keep as such a string, or convert to list?
    if alias is not None: msg.alias = alias
    if extension is not None:
        msg.ext = extension
        msg.ext_auto = False
    if metadata_file is not None:
        metadata = json.dumps(json.load(metadata_file))
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
    if not data_file:
        reply, mt = mapi.sendRecv(msg)
        print_data(reply)
    if data_file:
        update_reply, mt = mapi.sendRecv(msg)
        click.echo("Data Record update successful. Initiating raw data transfer.")
        put_data(df_id=update_reply.data[0].id,gp=data_file,wait=False,extension=None)

    #TODO Handle return value in OM_RETV


@data.command(name='delete',help="Delete existing data record")
@click.argument("df_id", nargs=-1)
def data_delete(df_id):
    resolved_list = []
    for ids in df_id:
        resolved_list.append(resolve_id(ids))
    if g_interactive:
        if not click.confirm("Do you want to delete record/s {}".format(resolved_list)):
            return
    msg = auth.RecordDeleteRequest()
    msg.id.extend(resolved_list)
    reply, mt = mapi.sendRecv(msg)

    #TODO Handle return value in OM_RETV

    if mt == "AckReply":
        click.echo("Delete succeeded")


@data.command(name='get',help="Get (download) raw data of record ID and place in local PATH")
@click.argument("df_id", nargs=-1)
@click.option("-fp","--filepath",type=str,required=True,help="Destination to which file is to be downloaded. Relative paths are acceptable if transferring from the operating file system. Note that Windows-style paths need to be escaped, i.e. all single backslashes should be entered as double backslashes. If you wish to use a Windows path from a Unix-style machine, please use an absolute path in Globus-style format (see docs for details.)")
@click.option("-ep","--endpoint",type=str,required=False,help="The endpoint to which the raw data file is to be transferred. If no endpoint is specified, the current session endpoint will be used.")
@click.option("-w","--wait",is_flag=True,help="Block until transfer is complete")
def data_get(df_id,filepath,endpoint,wait):
    fp = resolve_filepath_for_xfr(filepath)
    if endpoint: gp = resolve_globus_path(fp, endpoint)
    elif not endpoint: gp = resolve_globus_path(fp, "None")
    if gp is None:
        click.echo(
            "No endpoint provided, and neither current working endpoint nor default endpoint have been configured.")
        return
    elif gp:
        msg = auth.DataGetRequest()
        resolved_list = []
        for ids in df_id:
            resolved_list.append(resolve_id(ids))
        msg.id.extend(resolved_list)
        msg.path = gp
        reply, mt = mapi.sendRecv(msg)
        xfr_id = reply.xfr[0].id
        click.echo("Transfer ID: {}".format(xfr_id))
        if wait:
            if g_verbosity >= 1: click.echo("Waiting")  # TODO: Figure out verbosity replies (1 or 2 for updates loop?)
            while wait is True:
                time.sleep(2)
                update_msg = auth.XfrViewRequest()
                update_msg.xfr_id = xfr_id
                reply, mt = mapi.sendRecv(update_msg)
                check = reply.xfr[0]
                if check.status == 3 or check.status == 4: break
                statuses = {0: "Initiated", 1: "Active", 2: "Inactive", 3: "Succeeded", 4: "Failed"}
                xfr_status = statuses.get(check.status, "None")
                if g_verbosity >= 1: click.echo(
                    "{:15} {:15} {:15} {:15}".format("Transfer ID:", check.id, "Status:", xfr_status))
            print_xfr_stat(reply)
        else:
            print_xfr_stat(reply)
        #TODO Handle return value in OM_RETV


@data.command(name='put',help="Put (upload) raw data to DataFed")
@click.argument("df_id")
@click.option("-fp","--filepath",type=str,required=True,help="Path to the file being uploaded. Relative paths are acceptable if transferring from the operating file system. Note that Windows-style paths need to be escaped, i.e. all single backslashes should be entered as double backslashes. If you wish to use a Windows path from a Unix-style machine, please use an absolute path in Globus-style format (see docs for details.)")
@click.option("-w","--wait",is_flag=True,help="Block reply or further commands until transfer is complete")
@click.option("-ep","--endpoint",type=str,required=False,help="The endpoint from which the raw data file is to be transferred. If no endpoint is specified, the current session endpoint will be used.")
@click.option("-ext", "--extension",type=str,required=False,help="Specify an extension for the raw data file. This will override any previously specified extension or auto-extension behavior.")
def data_put(df_id,filepath,wait,endpoint,extension):
    fp = resolve_filepath_for_xfr(filepath)
    if endpoint: gp = resolve_globus_path(fp, endpoint)
    elif not endpoint: gp = resolve_globus_path(fp, "None")
    if gp:
        put_data(df_id,gp,wait,extension)
    elif gp is None:
        click.echo("No endpoint provided, and neither current working endpoint nor default endpoint have been configured.")
    #TODO Handle return value in OM_RETV


# ------------------------------------------------------------------------------
# Collection command group
@cli.command(cls=AliasedGroup,help="Collection subcommands")
def coll():
    pass


@coll.command(name='view',help="View collection")
@click.argument("df_id")
def coll_view(df_id):
    msg = auth.CollViewRequest()
    msg.id = resolve_coll_id(df_id)
    reply = mapi.sendRecv( msg )
    genericReplyHandler( reply, print_coll )


@coll.command(name='create',help="Create new collection")
@click.argument("title")
@click.option("-a","--alias",type=str,required=False,help="Alias")
@click.option("-d","--description",type=str,required=False,help="Description text")
@click.option("-c","--collection",type=str,required=False,help="Parent collection ID/alias (default is current working collection)")
def coll_create(title,alias,description,collection):
    msg = auth.CollCreateRequest()
    msg.title = title
    if alias is not None: msg.alias = alias
    if description is not None: msg.desc = description
    if resolve_coll_id(collection) is not None: msg.parent_id = resolve_coll_id(collection)
    click.echo(msg)
    reply = mapi.sendRecv(msg)
    genericReplyHandler( print_coll, reply)


@coll.command(name='update',help="Update existing collection")
@click.argument("df_id")
@click.option("-t","--title",type=str,required=False,help="Title")
@click.option("-a","--alias",type=str,required=False,help="Alias")
@click.option("-d","--description",type=str,required=False,help="Description text")
def coll_update(df_id,title,alias,description):
    msg = auth.CollUpdateRequest()
    msg.id = resolve_coll_id(df_id)
    if title is not None: msg.title = title
    if alias is not None: msg.alias = alias
    if description is not None: msg.desc = description
    reply = mapi.sendRecv(msg)
    genericReplyHandler( reply, print_coll )


@coll.command(name='delete',help="Delete existing collection")
@click.argument("df_id")
def coll_delete(df_id):
    id2 = resolve_coll_id(df_id)

    if g_interactive:
        click.echo("Warning: this will delete all data records and collections contained in the specified collection.")
        if not confirm( "Delete collection " + id2 + " (Y/n):"):
            return

    msg = auth.CollDeleteRequest()
    msg.id = id2
    reply, mt = mapi.sendRecv( msg )
    if mt == "AckReply": click.echo("Success: collection deleted.")


@coll.command(name='add',help="Add data/collection ITEM_ID to collection COLL_ID")
@click.argument("item_id")
@click.argument("coll_id")
def coll_add(item_id,coll_id):
    global g_verbosity
    msg = auth.CollWriteRequest()
    msg.id = resolve_coll_id(coll_id)
    msg.add.append(resolve_id(item_id))
    reply, mt = mapi.sendRecv(msg)
    if g_verbosity >= 1:
        if mt == "ListingReply": # TODO: Should be AckReply
            click.echo("Success: Item {} added to collection {}.".format(item_id, coll_id))


@coll.command(name='remove',help="Remove data/collection ITEM_ID from collection COLL_ID")
@click.argument("item_id")
@click.argument("coll_id")
def coll_rem(item_id,coll_id):
    global g_verbosity
    msg = auth.CollWriteRequest()
    msg.id = resolve_coll_id(coll_id)
    msg.rem.append(resolve_id(item_id))
    reply, mt = mapi.sendRecv(msg)
    if g_verbosity >= 1:
        if mt == "ListingReply": # TODO: Should be AckReply
            click.echo("Success: Item {} removed from collection {}.".format(item_id, coll_id))

#------------------------------------------------------------------------------
# Query command group
@cli.command(cls=AliasedGroup,help="Query subcommands")
def query():
    pass


@query.command(name='list',help="List saved queries")
@click.option("-o","--offset",default=0,help="List offset")
@click.option("-c","--count",default=20,help="List count")
def query_list(offset,count):
    msg = auth.QueryListRequest()
    msg.offset = offset
    msg.count = count
    reply = mapi.sendRecv( msg )
    genericReplyHandler( reply, print_listing )
    #TODO: Figure out verbosity-dependent replies


@query.command(name='exec',help="Execute a stored query by ID")
@click.argument("df_id")
def query_exec(df_id):
    msg = auth.QueryExecRequest()
    msg.id = resolve_id(df_id)
    reply = mapi.sendRecv( msg )
    genericReplyHandler( reply, print_listing )


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
def user_collab(offset,count):
    msg = auth.UserListCollabRequest()
    msg.offset = offset
    msg.count = count
    reply = mapi.sendRecv(msg)

    genericReplyHandler( reply, print_user_listing )


@user.command(name='all',help="List all users")
@click.option("-o","--offset",default=0,help="List offset")
@click.option("-c","--count",default=20,help="List count")
def user_all(offset,count):
    msg = auth.UserListAllRequest()
    msg.offset = offset
    msg.count = count
    reply = mapi.sendRecv( msg )

    genericReplyHandler( reply, print_user_listing )


@user.command(name='view',help="View information for user UID")
@click.argument("uid")
def user_view(uid):
    msg = auth.UserViewRequest()
    msg.uid = resolve_id(uid)
    reply = mapi.sendRecv(msg)

    genericReplyHandler( reply, print_user )


# ------------------------------------------------------------------------------
# Project command group

@cli.command(cls=AliasedGroup,help="Project commands")
def project():
    pass


@project.command(name='list',help="List projects")
@click.option("-o","--owner",is_flag=True,help="Include owned projects")
@click.option("-a","--admin",is_flag=True,help="Include administered projects")
@click.option("-m","--member",is_flag=True,help="Include membership projects")
def project_list(owner,admin,member):
    if not (owner or admin or member):
        owner = True
        admin = True
        member = True

    msg = auth.ProjectListRequest()
    msg.by_owner = owner
    msg.by_admin = admin
    msg.by_member = member
    reply = mapi.sendRecv( msg ) #TODO: Figure out verbosity reply?
    genericReplyHandler( reply, print_proj_listing )


@project.command(name='view',help="View project specified by ID")
@click.argument("df_id")
def project_view(df_id):
    msg = auth.ProjectViewRequest()
    msg.id = resolve_id(df_id)
    reply = mapi.sendRecv(msg)
    genericReplyHandler( reply, print_proj )


# ------------------------------------------------------------------------------
# Shared data command group

@cli.command(cls=AliasedGroup,help="Shared data commands")
def shared():
    pass


@shared.command(name="users",help="List users with shared data")
def shared_users():
    msg = auth.ACLByUserRequest()
    reply, mt = mapi.sendRecv( msg )
    genericReplyHandler( reply, print_user_listing )


@shared.command(name="projects",help="List projects with shared data")
def shared_projects():
    msg = auth.ACLByProjRequest()
    reply = mapi.sendRecv( msg )
    genericReplyHandler( reply, print_proj_listing )


@shared.command(name="list",help="List data shared by user/project ID")
@click.argument("df_id")
def shared_list(df_id):
    id2 = resolve_id(df_id)

    if id2.startswith("p/"):
        msg = auth.ACLByProjListRequest()
    else:
        if not id2.startswith("u/"):
            id2 = "u/" + id2
        msg = auth.ACLByUserListRequest()

    msg.owner = id2
    reply = mapi.sendRecv( msg )
    genericReplyHandler( reply, print_listing )


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
def xfr_list(time_from,to,since,status): # TODO: Absolute time is not user friendly
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
    reply = mapi.sendRecv(msg)
    genericReplyHandler( reply, print_listing )


@xfr.command(name='stat',help="Get status of transfer ID, or most recent transfer id ID omitted")
@click.argument("df_id",required=False,default="MOST RECENT XFR ID") # Does this have to be a dynamic global variable?
def xfr_stat(df_id):
    if df_id:
        msg = auth.XfrViewRequest()
        msg.xfr_id = resolve_id(df_id)
        reply = mapi.sendRecv(msg)
        genericReplyHandler( reply, print_xfr_stat )
    elif not df_id:
        msg = auth.XfrListRequest() # TODO: How to isolate most recent Xfr
        reply = mapi.sendRecv(msg)
        genericReplyHandler( reply, print_listing )


# ------------------------------------------------------------------------------
# End-point commands

@cli.command(cls=AliasedGroup,help="Endpoint commands")
def ep():
    pass


@ep.command(name='get',help="Get Globus endpoint for the current session. At the start of the session, this will be the previously configured default endpoint.")
def ep_get():
    global g_ep_cur
    if g_ep_cur:
        click.echo(g_ep_cur)
    else:
        global g_ep_default
        if g_ep_default:
            g_ep_cur = g_ep_default
            info(1, g_ep_cur)
        else:
            info(1,"No endpoint specified for the current session, and default end-point has not been configured.")


@ep.command(name='default',help="Get or set the default Globus endpoint. If no endpoint is given, the previously configured default endpoint will be returned. If an argument is given, the new endpoint will be set as the default.")
@click.argument("new_default_ep",required=False)
def ep_default(new_default_ep): ### CAUTION: Setting a new default will NOT update the current session's endpoint automatically --- MUST FOLLOW WITH EP SET
    global g_ep_default
    if new_default_ep:
        new_default_ep = resolve_index_val(new_default_ep)
        cfg.set("default_ep",new_default_ep,True)
        g_ep_default = new_default_ep
   #     except:
        # TODO: add more functionality
        # check if input is valid endpoint?
    else:
        if g_ep_default:
            click.echo(g_ep_default)
        else:
            click.echo("Default endpoint has not been configured.")


@ep.command(name='set',help="Set endpoint for the current session. If no endpoint is given, the previously configured default endpoint will be used.")
@click.argument("path",required=False)
def ep_set(path):
    global g_ep_cur
    if path:
        g_ep_cur = resolve_index_val(path)
    else:
        if g_ep_default:
            g_ep_cur = g_ep_default
        else:
            info(1,"Default endpoint has not been configured.")
            return

    info(1,g_ep_cur)


@ep.command(name='list',help="List recent endpoints.")
def ep_list():
    msg = auth.UserGetRecentEPRequest()
    reply = mapi.sendRecv( msg )
    genericReplyHandler( reply, print_endpoints )


# ------------------------------------------------------------------------------
# Miscellaneous commands

@cli.command(name='ident',help="Set current user or project identity to ID (omit for self)")
@click.option("-s","--show",is_flag=True,help="Show current identity")
@click.argument("df_id",required=False)
def ident(df_id,show):
    global g_cur_sel
    global g_cur_coll
    global g_cur_alias_prefix

    if show:
        click.echo(g_cur_sel)
        return

    if df_id == None:
        df_id = g_uid

    if df_id[0:2] == "p/":
        msg = auth.ProjectViewRequest()
        msg.id = df_id
        reply, mt = mapi.sendRecv( msg )

        g_cur_sel = df_id
        g_cur_coll = "c/p_" + g_cur_sel[2:] + "_root"
        g_cur_alias_prefix = "p:" + g_cur_sel[2:] + ":"

        info(1,"Switched to project " + g_cur_sel)
    else:
        if df_id[0:2] != "u/":
            id = "u/" + df_id

        msg = auth.UserViewRequest()
        msg.uid = df_id
        reply, mt = mapi.sendRecv( msg )

        g_cur_sel = df_id
        g_cur_coll = "c/u_" + g_cur_sel[2:] + "_root"
        g_cur_alias_prefix = "u:" + g_cur_sel[2:] + ":"

        info(1,"Switched to user " + g_cur_sel)

@cli.command(name='setup',help="Setup local credentials")
@click.pass_context
def setup(ctx):
    cfg_dir = cfg.get("client_cfg_dir")
    if cfg_dir == None:
        raise Exception("Client configuration directory is not configured")
    msg = auth.GenerateCredentialsRequest()
    reply, mt = mapi.sendRecv( msg )

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
    global g_interactive
    g_interactive = True
    sys.exit(0)


# ------------------------------------------------------------------------------
# Print and Utility functions

def resolve_index_val(df_id):
    try:
        if len(df_id) <= 3:
            global g_list_items
            if df_id.endswith("."):
                df_idx = int(df_id[:-1])
            else:
                df_idx = int(df_id)
            if df_idx <= len(g_list_items):
                #print("found")
                return g_list_items[df_idx-1]
    except ValueError:
        #print("not a number")
        pass

    return df_id


def resolve_id(df_id):
    df_id2 = resolve_index_val(df_id)

    if (len(df_id2) > 2 and df_id2[1] == "/") or (df_id2.find(":") > 0):
        return df_id2

    return g_cur_alias_prefix + df_id2


def resolve_coll_id(df_id):
    if df_id == ".":
        return g_cur_coll
    elif df_id == "/":
        if g_cur_sel[0] == "p":
            return "c/p_" + g_cur_sel[2:] + "_root"
        else:
            return "c/u_" + g_cur_sel[2:] + "_root"
    elif df_id == "..":
        msg = auth.CollGetParentsRequest()
        msg.id = g_cur_coll
        msg.all = False
        reply, mt = mapi.sendRecv(msg)
        if len(reply.coll):
            return reply.coll[0].id
        else:
            raise Exception("Already at root")

    df_id2 = resolve_index_val(df_id)
    #print("inter id:",df_id2)
    if (len(df_id2) > 2 and df_id2[1] == "/" ) or (df_id2.find(":") > 0):
        return df_id2

    return g_cur_alias_prefix + df_id2


def put_data(df_id,gp,wait,extension):
    global g_verbosity
    msg = auth.DataPutRequest()
    msg.id = resolve_id(df_id)
    msg.path = gp
    if extension: msg.ext = extension
    reply, mt = mapi.sendRecv(msg)
    xfr_id = reply.xfr[0].id
    click.echo("Transfer ID: {}".format(xfr_id))
    if wait:
        if g_verbosity >= 1: click.echo("Waiting")  # TODO: Figure out verbosity replies (1 or 2 for updates loop?)
        while wait is True:
            time.sleep(2)
            update_msg = auth.XfrViewRequest()
            update_msg.xfr_id = xfr_id
            reply, mt = mapi.sendRecv(update_msg)
            check = reply.xfr[0]
            if check.status == 3 or check.status == 4: break
            statuses = {0: "Initiated", 1: "Active", 2: "Inactive", 3: "Succeeded", 4: "Failed"}
            xfr_status = statuses.get(check.status, "None")
            if g_verbosity >= 1: click.echo("{:15} {:15} {:15} {:15}".format("Transfer ID:",check.id,"Status:",xfr_status))
        print_xfr_stat(reply)
    else:
        print_xfr_stat(reply)


def resolve_filepath_for_xfr(filepath):
    if filepath[0] == '/':  # absolute full path, must be in globus format
        filepath = filepath[1:]

    elif filepath[0] != "/":  # relative path to be resolved
        filepath = pathlib.Path.cwd() / filepath
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
    global g_ep_cur
    global g_ep_default
    if fp[0] != '/':
        fp = "/" + fp
    if endpoint != "None":
        fp = endpoint + fp
    elif endpoint == "None":
        if g_ep_cur:
            fp = g_ep_cur + fp
        elif g_ep_cur is None:
            if g_ep_default:
                fp = g_ep_default + fp
            elif g_ep_default is None:
                fp = None

    return fp #endpoint and path

def genericReplyHandler( reply, printFunc ):
    global g_output_mode

    if g_output_mode == OM_RETN:
        global g_return_val
        g_return_val = reply
    else:
        printFunc( reply[0] )

#TODO Need JSON Support
def print_listing(reply):
    df_idx = 1
    global g_list_items
    g_list_items = []
    click.echo("{:3} {:12} ({:20} {}".format("","DataFed ID","Alias)","Title"))
    for i in reply.item:
        g_list_items.append(i.id)
        if i.alias:
            click.echo("{:2}. {:12} ({:20} {}".format(df_idx,i.id,i.alias+')',i.title))
        else:
            click.echo("{:2}. {:34} {}".format(df_idx,i.id,i.title))
        df_idx += 1

#TODO Need JSON Support
def print_user_listing( reply ):
    df_idx = 1
    global g_list_items
    g_list_items = []
    for i in reply.user:
        g_list_items.append(i.uid)
        click.echo("{:2}. {:24} {}".format(df_idx,i.uid,i.name))
        df_idx += 1

#TODO Need JSON Support
def print_proj_listing(reply):
    df_idx = 1
    global g_list_items
    g_list_items = []
    for i in reply.proj:
        g_list_items.append(i.id)
        click.echo("{:2}. {:24} {}".format(df_idx,i.id,i.title))
        df_idx += 1

#TODO Need JSON Support
def print_endpoints(reply):
    df_idx = 1
    global g_list_items
    g_list_items = []
    for i in reply.ep:
        p = i.rfind("/")
        if p >= 0:
            path = i[0:p+1]
            g_list_items.append(path)
            click.echo("{:2}. {}".format(df_idx,path))
            df_idx += 1


def print_data(message):
    global g_verbosity
    global g_output_mode

    if g_output_mode == OM_TEXT:
        dr = message.data[0]
        if g_verbosity >= 0:
            click.echo("{:<25} {:<50}".format('ID: ', dr.id) + '\n' +
                       "{:<25} {:<50}".format('Title: ', dr.title) + '\n' +
                       "{:<25} {:<50}".format('Alias: ', dr.alias))
        if g_verbosity >= 1:
            click.echo("{:<25} {:<50}".format('Description: ', dr.desc) + '\n' +
                       "{:<25} {:<50}".format('Keywords: ', dr.keyw) + '\n' +
                       "{:<25} {:<50}".format('Size: ', dr.size) + '\n' + ## convert to gigs?
                       "{:<25} {:<50}".format('Date Created: ', time.strftime("%D %H:%M", time.gmtime(dr.ct))) + '\n' +
                       "{:<25} {:<50}".format('Date Updated: ', time.strftime("%D %H:%M", time.gmtime(dr.ut))))
        if g_verbosity >= 2:
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
                click.echo("{:<25} {:<50}".format('Metadata: ', (json.dumps(json.loads(dr.metadata, indent=4)))))
            elif not dr.metadata:
                click.echo("{:<25} {:<50}".format('Metadata: ', "None"))
            if not dr.deps:
                click.echo("{:<25} {:<50}".format('Dependencies: ', 'None'))
            elif dr.deps:
                click.echo("{:<25}".format('Dependencies:'))
                print_deps(message)
    elif g_output_mode == OM_JSON:
        json_output = MessageToJson(message,preserving_proto_field_name=True)
        click.echo(json_output)
    #elif g_output_dict:
    #    dict_output = MessageToDict(message,preserving_proto_field_name=True)
    #    click.echo(dict_output)


def print_coll(message):
    global g_verbosity
    global g_output_mode

    if g_output_mode == OM_TEXT:
        coll = message.coll[0]
        if g_verbosity >= 0:
            click.echo("{:<25} {:<50}".format('ID: ', coll.id) + '\n' +
                       "{:<25} {:<50}".format('Title: ', coll.title) + '\n' +
                       "{:<25} {:<50}".format('Alias: ', coll.alias))
        if g_verbosity >= 1:
            click.echo("{:<25} {:<50}".format('Description: ',coll.desc) + '\n' +
                       "{:<25} {:<50}".format('Owner: ', coll.owner) + '\n' +
                       "{:<25} {:<50}".format('Parent Collection ID: ', coll.parent_id))
        if g_verbosity == 2:
            click.echo("{:<25} {:<50}".format('Is Public: ', str(coll.ispublic)) + '\n' +
                       "{:<25} {:<50}".format('Date Created: ', time.strftime("%D %H:%M", time.gmtime(coll.ct))) + '\n' +
                       "{:<25} {:<50}".format('Date Updated: ', time.strftime("%D %H:%M", time.gmtime(coll.ut))))
    elif g_output_mode == OM_JSON:
        output = MessageToJson(message,preserving_proto_field_name=True)
        click.echo(output)
    #elif g_output_dict:
    #    output = MessageToDict(message,preserving_proto_field_name=True)
    #    click.echo(output)

#TODO Need JSON Support
def print_deps(dependencies):
    if dependencies is not None or dependencies != "None":
        deps = list(dependencies)
        click.echo("{:<5} {:<10} {:<25} {:<15} {:<25}".format("", 'Direction','Type','ID', 'Alias'))
        for item in deps:
            rep = item.get
            click.echo("{:<5} {:<10} {:<25} {:<15} {:<25}".format("", rep('dir', 'None'),rep('type', 'None'),rep('id', 'None'), rep('alias', 'None')))

#TODO Need JSON Support
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


def print_xfr_stat(message):
    global g_verbosity
    global g_output_mode

    if g_output_mode == OM_JSON:
        output = MessageToJson(message,preserving_proto_field_name=True)
        click.echo(output)
    #elif g_output_dict:
    #    output = MessageToDict(message,preserving_proto_field_name=True)
    #    click.echo(output)
    elif g_output_mode == OM_TEXT:
        for xfr in message.xfr:
            modes = { 0: "Get", 1: "Put", 2: "Copy"}
            xfr_mode = modes.get(xfr.mode, "None")
            statuses = { 0: "Initiated", 1: "Active", 2: "Inactive", 3: "Succeeded", 4: "Failed"}
            xfr_status = statuses.get(xfr.status, "None")
            df_ids = []
            for files in xfr.repo.file: df_ids.append(files.id)
            if g_verbosity >= 0:
                click.echo("{:<25} {:<50}".format('Xfr ID: ', xfr.id) + '\n' +
                           "{:<25} {:<50}".format('Mode: ', xfr_mode) + '\n' +
                           "{:<25} {:<50}".format('Status: ', str(xfr_status)))
            if g_verbosity >= 1:
                click.echo("{:<25} {:<50}".format('Data Record ID/s: ', str(df_ids)) + '\n' +
                           "{:<25} {:<50}".format('Date Started: ', time.strftime("%D %H:%M", time.gmtime(xfr.started))) + '\n' +
                           "{:<25} {:<50}".format('Date Updated: ', time.strftime("%D %H:%M", time.gmtime(xfr.started))))
            if g_verbosity == 2:
                click.echo("{:<25} {:<50}".format('Remote Endpoint:', xfr.rem_ep) + '\n' 
                           "{:<25} {:<50}".format('Remote Path: ', xfr.rem_path))


def print_user(message):
    global g_verbosity
    global g_output_mode

    if g_output_mode == OM_TEXT:
        usr = message.user[0]
        if g_verbosity >= 0:
            click.echo("{:<25} {:<50}".format('User ID: ', usr.uid) + '\n' +
                       "{:<25} {:<50}".format('Name: ', usr.name) + '\n' +
                       "{:<25} {:<50}".format('Email: ', usr.email))
    elif g_output_mode == OM_JSON:
        output = MessageToJson(message, preserving_proto_field_name=True)
        click.echo(output)
    #elif g_output_dict:
    #    output = MessageToDict(message, preserving_proto_field_name=True)
    #    click.echo(output)

def print_metadata(message): #how to pretty print json?
    pass

def print_proj(message):
    global g_verbosity
    global g_output_mode

    if g_output_mode == OM_TEXT:
        proj = message.proj[0]
        admins = []
        members = []
        for i in proj.admin: admins.append(i)
        for i in proj.member: members.append(i)
        if g_verbosity >= 0:
            click.echo("{:<25} {:<50}".format('ID: ', proj.id) + '\n' +
                       "{:<25} {:<50}".format('Title: ', proj.title) + '\n' +
                       "{:<25} {:<50}".format('Description: ', proj.desc))
        if g_verbosity >= 1:
            click.echo("{:<25} {:<50}".format('Owner: ', proj.owner) + '\n' +
                       "{:<25} {:<50}".format('Admin(s): ', str(admins)) + '\n' +
                       "{:<25} {:<50}".format('Members: ', str(members)))
        if g_verbosity == 2:
            click.echo("{:<25} {:<50}".format('Date Created: ', time.strftime("%D %H:%M", time.gmtime(proj.ct))) + '\n' +
                       "{:<25} {:<50}".format('Date Updated: ', time.strftime("%D %H:%M", time.gmtime(proj.ut))) + '\n' +
                       "{:<25} {:<50}".format('Sub Repo: ', proj.sub_repo) + '\n' +
                       "{:<25} {:<50}".format('Sub Allocation: ', GetHumanReadable(proj.sub_alloc) + '\n' +
                       "{:<25} {:<50}".format('Sub Usage: ', GetHumanReadable(proj.sub_usage))))
            for i in proj.alloc:
                print_allocation_data(i)
    elif g_output_mode == OM_JSON:
        output = MessageToJson(message, preserving_proto_field_name=True)
        click.echo(output)
    #elif g_output_dict:
    #    output = MessageToDict(message, preserving_proto_field_name=True)
    #   click.echo(output)


#TODO Need JSON Support
def print_allocation_data(alloc):
    click.echo("{:<25} {:<50}".format('Repo: ', alloc.repo) + '\n' +
               "{:<25} {:<50}".format('Max Size: ', GetHumanReadable(alloc.max_size)) + '\n' +
               "{:<25} {:<50}".format('Total Size: ', GetHumanReadable(alloc.tot_size)) + '\n' +
               "{:<25} {:<50}".format('Max Record Count: ', alloc.max_count) + '\n' +
               "{:<25} {:<50}".format('Path: ', alloc.path) + '\n' +
               "{:<25} {:<50}".format('ID: ', alloc.id) + '\n' +
               "{:<25} {:<50}".format('Sub Allocation: ', str(alloc.sub_alloc)))


def GetHumanReadable(size,precision=2):
    suffixes=['B','KB','MB','GB','TB']
    suffixIndex = 0
    while size > 1024 and suffixIndex < 4:
        suffixIndex += 1 #increment the index of the suffix
        size = size/1024.0 #apply the division
    return "%.*f%s" % (precision,size,suffixes[suffixIndex])


def confirm( msg ):
    val = click.prompt( msg )
    if val == "Y":
        return True
    else:
        return False

def _initialize( opts ):
    global mapi
    global g_uid
    global g_interactive
    global g_cur_sel

    #print("opts:",opts)

    try:
        mapi = MessageLib.API( **opts )
    except Exception as e:
        click.echo(e)
        g_interactive = False
        sys.exit(1)

    # Ignore 'log' option if set in exec mode
    if opts["log"] and g_output_mode == OM_RETN:
        opts["log"] = False

    auth, uid = mapi.getAuthStatus()

    if opts["log"] or not auth:
        if not opts["log"]:
            if not mapi.keysLoaded():
                if g_output_mode == OM_RETN:
                    raise Exception("Not authenticated: no local credentials loaded.")
                info(1,"No local credentials loaded.")
            elif not mapi.keysValid():
                if g_output_mode == OM_RETN:
                    raise Exception("Not authenticated: invalid local credentials.")
                info(1,"Invalid local credentials.")

            info(0,"Manual authentication required.")
        i = 0
        while i < 3:
            i += 1
            uid = click.prompt("User ID: ")
            password = getpass.getpass(prompt="Password: ")
            try:
                mapi.manualAuth( uid, password )
                break
            except Exception as e:
                click.echo(e)

        if i == 3:
            info(1,"Aborting...")
            g_interactive = True
            sys.exit(1)

        mapi.installLocalCredentials()
    else:
        info(1,"Authenticated as",uid)

    g_uid = uid
    g_cur_sel = uid

