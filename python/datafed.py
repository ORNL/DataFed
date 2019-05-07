#!/usr/bin/env python
from __future__ import division, print_function, absolute_import #, unicode_literals
import getpass
import shlex
import SDMS_Anon_pb2 as anon
import SDMS_Auth_pb2 as auth
import ClientLib
import os
import sys
import click
import prompt_toolkit
from prompt_toolkit import PromptSession
from prompt_toolkit.history import FileHistory
from prompt_toolkit.auto_suggest import AutoSuggestFromHistory
from prompt_toolkit.formatted_text import to_formatted_text

if sys.version_info.major == 3:
    unicode = str

mapi = None
g_cur_sel = None
g_cur_coll = "root"
g_cur_alias_prefix = ""
g_list_items = []
g_non_interact = False
g_really_exit = False
g_verbosity = 1
g_ctxt_settings = dict(help_option_names=['-h', '-?', '--help'])
g_ep_default = os.environ.get("DATAFED_EP_DEFAULT")
g_ep_cur = g_ep_default

# Verbosity-aware print
def info( level, *args ):
    global g_verbosity
    if level <= g_verbosity:
        print( *args )

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

#------------------------------------------------------------------------------
# Top-level group with global options
@click.group(cls=AliasedGroup,invoke_without_command=True,context_settings=g_ctxt_settings)
@click.option("-h","--host",type=str,default="sdms.ornl.gov",help="Server host")
@click.option("-p","--port",type=int,default=7512,help="Server port")
@click.option("-l","--log",is_flag=True,help="Force manual authentication")
@click.option("-v","--verbosity",type=int,help="Verbosity level (0=quiet,1=normal,2=verbose)")
@click.pass_context
def cli(ctx,host,port,log,verbosity):
    global g_non_interact
    global g_verbosity
    global g_really_exit

    if not verbosity is None:
        g_verbosity = verbosity

    if mapi == None:
        initialize(host,port,log)

    if g_non_interact and not ctx.invoked_subcommand is None:
        g_really_exit = True

#------------------------------------------------------------------------------
# Collection listing/navigation commands
@cli.command(help="List current collection, or collection specified by ID")
@click.option("-o","--offset",default=0,help="List offset")
@click.option("-c","--count",default=20,help="List count")
@click.argument("id",required=False)
def ls(id,offset,count):
    global g_verbosity
    global g_cur_coll
    msg = auth.CollReadRequest()
    if id != None:
        msg.id = resolveCollID(id)
    else:
        msg.id = g_cur_coll
    msg.count = count
    msg.offset = offset
    if g_verbosity > 1:
        msg.details = True
    else:
        msg.details = False
    reply, mt = mapi.sendRecv( msg )
    printListing(reply)

@cli.command(help="Print or change current working collection")
@click.argument("id",required=False)
def wc(id):
    global g_cur_coll
    if id != None:
        g_cur_coll = resolveCollID(id)
    else:
        print(g_cur_coll)

#------------------------------------------------------------------------------
# Data command group
@cli.command(cls=AliasedGroup,help="Data subcommands")
def data():
    pass

@data.command(name='view',help="View data record")
@click.option("-d","--details",is_flag=True,help="Show additional fields")
@click.argument("id")
def data_view(id,details):
    msg = auth.RecordViewRequest()
    msg.id = resolveID(id)
    if details:
        msg.details = True
    else:
        msg.details = False
    reply, mt = mapi.sendRecv( msg )
    print(reply)

@data.command(name='create',help="Create new data record")
@click.argument("title")
@click.option("-a","--alias",type=str,required=False,help="Alias")
@click.option("-d","--description",type=str,required=False,help="Description text")
@click.option("-kw","--key-words",type=str,required=False,help="Keywords (comma separated list)")
@click.option("-df","--data-file",type=str,required=False,help="Local raw data file")
@click.option("-m","--metadata",type=str,required=False,help="Metadata (JSON)")
@click.option("-mf","--metadata-file",type=str,required=False,help="Metadata file (JSON)")
@click.option("-c","--collection",type=str,required=False,help="Parent collection ID/alias (default is current working collection)")
@click.option("-r","--repository",type=str,required=False,help="Repository ID")
def data_create(title,alias,description,key_words,data_file,metadata,metadata_file,collection,repository):
    if metadata and metadata_file:
        print("Cannot specify both --metadata and --metadata-file options")
        return
    print("t:",title,"a:",alias,"d:",description,"k:",key_words,"df:",data_file,"m:",metadata,"mf:",metadata_file,"c:",collection,"r:",repository)
    print("TODO: NOT IMPLEMENTED")

@data.command(name='update',help="Update existing data record")
@click.argument("id")
@click.option("-t","--title",type=str,required=False,help="Title")
@click.option("-a","--alias",type=str,required=False,help="Alias")
@click.option("-d","--description",type=str,required=False,help="Description text")
@click.option("-kw","--key-words",type=str,required=False,help="Keywords (comma separated list)")
@click.option("-df","--data-file",type=str,required=False,help="Local raw data file")
@click.option("-m","--metadata",type=str,required=False,help="Metadata (JSON)")
@click.option("-mf","--metadata-file",type=str,required=False,help="Metadata file (JSON)")
def data_update(id,title,alias,description,key_words,data_file,metadata,metadata_file):
    if metadata and metadata_file:
        print("Cannot specify both --metadata and --metadata-file options")
        return
    print("id:",id,"t:",title,"a:",alias,"d:",description,"k:",key_words,"df:",data_file,"m:",metadata,"mf:",metadata_file)
    print("TODO: NOT IMPLEMENTED")

@data.command(name='delete',help="Delete existing data record")
@click.argument("id")
def data_delete(id):
    print("TODO: NOT IMPLEMENTED")

@data.command(name='get',help="Get (download) raw data from datafed")
@click.argument("id")
def data_get(id):
    print("TODO: NOT IMPLEMENTED")

@data.command(name='put',help="Put (upload) raw data to datafed")
@click.argument("id")
def data_put(id):
    print("TODO: NOT IMPLEMENTED")


#------------------------------------------------------------------------------
# Collection command group
@cli.command(cls=AliasedGroup,help="Collection subcommands")
def coll():
    pass

@coll.command(name='view',help="View collection")
@click.argument("id")
def coll_view(id):
    msg = auth.CollViewRequest()
    msg.id = resolveID(id)
    reply, mt = mapi.sendRecv( msg )
    print(reply)

@coll.command(name='create',help="Create new collection")
@click.option("-t","--title",type=str,required=False,help="Title")
@click.option("-a","--alias",type=str,required=False,help="Alias")
@click.option("-d","--description",type=str,required=False,help="Description text")
@click.option("-c","--collection",type=str,required=False,help="Parent collection ID/alias (default is current working collection)")
def coll_create(title,alias,description,collection):
    print("t:",title,"a:",alias,"d:",description,"c:",collection)
    print("TODO: NOT IMPLEMENTED")

@coll.command(name='update',help="Update existing collection")
@click.argument("id")
@click.option("-t","--title",type=str,required=False,help="Title")
@click.option("-a","--alias",type=str,required=False,help="Alias")
@click.option("-d","--description",type=str,required=False,help="Description text")
def data_update(id,title,alias,description):
    print("id:",id,"t:",title,"a:",alias,"d:",description)
    print("TODO: NOT IMPLEMENTED")

@coll.command(name='delete',help="Delete existing collection")
@click.argument("id")
def coll_delete(id):
    print("TODO: NOT IMPLEMENTED")

@coll.command(name='add',help="Add data/collection ITEM_ID to collection COLL_ID")
@click.argument("item_id")
@click.argument("coll_id")
def coll_add(item_id,coll_id):
    msg = auth.CollWriteRequest()
    msg.id = resolveCollID(coll_id)
    msg.add.append(resolveID(item_id))
    reply, mt = mapi.sendRecv( msg )

@coll.command(name='remove',help="Remove data/collection ITEM_ID from collection COLL_ID")
@click.argument("item_id")
@click.argument("coll_id")
def coll_rem(item_id,coll_id):
    msg = auth.CollWriteRequest()
    msg.id = resolveCollID(coll_id)
    msg.rem.append(resolveID(item_id))
    reply, mt = mapi.sendRecv( msg )

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
    reply, mt = mapi.sendRecv( msg )
    printListing(reply)

@query.command(name='exec',help="Execute a stored query by ID")
@click.argument("id")
def query_exec(id):
    msg = auth.QueryExecRequest()
    msg.id = resolveID(id)
    reply, mt = mapi.sendRecv( msg )
    printListing(reply)

@query.command(name='text',help="Query by words or phrases")
def query_text():
    print("TODO: NOT IMPLEMENTED")

@query.command(name='meta',help="Query by metadata expression")
def query_meta():
    print("TODO: NOT IMPLEMENTED")

@query.command(cls=AliasedGroup,help="Query scope subcommands")
def scope():
    print("TODO: NOT IMPLEMENTED")

@scope.command(name='view',help="View categories and/or collections in query scope")
def scope_view():
    print("TODO: NOT IMPLEMENTED")

@scope.command(name='add',help="Add category or collection to query scope")
def scope_add():
    print("TODO: NOT IMPLEMENTED")

@scope.command(name='remove',help="Remove category or collection from query scope")
def scope_rem():
    print("TODO: NOT IMPLEMENTED")

@scope.command(name='clear',help="Remove all categories and/or collections from query scope")
def scope_clear():
    print("TODO: NOT IMPLEMENTED")

@scope.command(name='reset',help="Reset query scope to default")
def scope_reset():
    print("TODO: NOT IMPLEMENTED")

#------------------------------------------------------------------------------
# User command group

@cli.command(cls=AliasedGroup,help="User commands")
def user():
    pass

@user.command(name='collab',help="List all users associated with common projects")
@click.option("-o","--offset",default=0,help="List offset")
@click.option("-c","--count",default=20,help="List count")
def user_collab(offset,count):
    print("TODO: NOT IMPLEMENTED")

@user.command(name='shared',help="List users with shared data")
@click.option("-o","--offset",default=0,help="List offset")
@click.option("-c","--count",default=20,help="List count")
def user_shared(offset,count):
    print("TODO: NOT IMPLEMENTED")

@user.command(name='all',help="List all users")
@click.option("-o","--offset",default=0,help="List offset")
@click.option("-c","--count",default=20,help="List count")
def user_all(offset,count):
    msg = auth.UserListAllRequest()
    msg.offset = offset
    msg.count = count
    reply, mt = mapi.sendRecv( msg )
    printUserListing(reply)

@user.command(name='view',help="View information for user UID")
@click.option("-d","--details",is_flag=True,help="Show detailed user information")
@click.argument("uid")
def user_view(uid,details):
    msg = auth.UserViewRequest()
    msg.uid = resolveID(uid)
    msg.details = details
    reply, mt = mapi.sendRecv( msg )
    print(reply)

#------------------------------------------------------------------------------
# Project command group

@cli.command(cls=AliasedGroup,help="Project commands")
def project():
    pass

@project.command(name='shared',help="List projects with shared data")
@click.option("-o","--offset",default=0,help="List offset")
@click.option("-c","--count",default=20,help="List count")
def project_shared(offset,count):
    print("TODO: NOT IMPLEMENTED")

#------------------------------------------------------------------------------
# Transfer commands

@cli.command(cls=AliasedGroup,help="Data transfer management commands")
def xfr():
    pass

@xfr.command(name='list',help="List recent transfers")
@click.option("-s","--since",help="List from specified time (use s,h,d suffix)")
@click.option("-f","--from",help="List from specified absolute time (timestamp)")
@click.option("-t","--to",help="List up to specified absolute time (timestamp)")
@click.option("-st","--status",help="List transfers matching specified status")
def xfr_list():
    print("TODO: NOT IMPLEMENTED")

@xfr.command(name='stat',help="Get status of transfer ID, or most recent transfer id ID omitted")
@click.argument("id",required=False)
def xfr_stat(id):
    print("TODO: NOT IMPLEMENTED")

#------------------------------------------------------------------------------
# End-point commands

@cli.command(cls=AliasedGroup,help="End-point commands")
def ep():
    pass

@ep.command(name='get',help="Get current end-point path")
def ep_get():
    global g_ep_cur
    if g_ep_cur:
        info(1,g_ep_cur)
    else:
        info(1,"Not set")

@ep.command(name='set',help="Set current end-point path (omit path for default)")
@click.argument("path",required=False)
def ep_set(path):
    global g_ep_cur
    if path:
        g_ep_cur = resolveID(path)
    else:
        if g_ep_default:
            g_ep_cur = g_ep_default
        else:
            info(1,"Default end-point not configured")
            return

    info(1,g_ep_cur)

@ep.command(name='default',help="Get default end-point path")
def ep_default():
    global g_ep_default
    if g_ep_default:
        print(g_ep_default)
    else:
        print("Default end-point not configured")

@ep.command(name='list',help="List recent end-point paths")
def ep_list():
    msg = auth.UserGetRecentEPRequest()
    reply, mt = mapi.sendRecv( msg )
    printEndpoints(reply)

#------------------------------------------------------------------------------
# Miscellaneous commands

@cli.command(name='select',help="Show or set selected user or project")
@click.argument("id",required=False)
def select(id):
    global g_cur_sel
    global g_cur_coll
    global g_cur_alias_prefix

    if id:
        if id[0:2] == "p/":
            msg = auth.ProjectViewRequest()
            msg.id = id
            reply, mt = mapi.sendRecv( msg )

            g_cur_sel = id
            g_cur_coll = "c/p_" + g_cur_sel[2:] + "_root"
            g_cur_alias_prefix = "p:" + g_cur_sel[2:] + ":"

            info(1,"Switched to project " + g_cur_sel)
        else:
            if id[0:2] != "u/":
                id = "u/" + id

            msg = auth.UserViewRequest()
            msg.uid = id
            reply, mt = mapi.sendRecv( msg )

            g_cur_sel = id
            g_cur_coll = "c/u_" + g_cur_sel[2:] + "_root"
            g_cur_alias_prefix = "u:" + g_cur_sel[2:] + ":"

            info(1,"Switched to user " + g_cur_sel)
    else:
        print(g_cur_sel)

@cli.command(name='help',help="Show datafed client help")
@click.pass_context
def help_cli(ctx):
    print(ctx.parent.get_help())


@cli.command(name="exit",help="Exit datafed client")
def exit_cli():
    #print("exit cmd")
    global g_really_exit
    g_really_exit = True
    sys.exit(0)

#------------------------------------------------------------------------------
# Print and Utility functions

def resolveIndexVal( id ):
    try:
        if len(id) <= 3:
            global g_list_items
            if id.endswith("."):
                idx = int(id[:-1])
            else:
                idx = int(id)
            if idx <= len(g_list_items):
                #print("found")
                return g_list_items[idx-1]
    except ValueError:
        #print("not a number")
        pass

    return id

def resolveID( id ):
    id2 = resolveIndexVal( id )

    if ( len(id2) > 2 and id2[1] == "/" ) or (id2.find(":") > 0):
        return id2

    return g_cur_alias_prefix + id2

def resolveCollID( id ):
    if id == ".":
        return g_cur_coll
    elif id == "/":
        if g_cur_sel[0] == "p":
            return "c/p_" + g_cur_sel[2:] + "_root"
        else:
            return "c/u_" + g_cur_sel[2:] + "_root"
    elif id == "..":
        msg = auth.CollGetParentsRequest()
        msg.id = g_cur_coll
        msg.all = False
        reply, mt = mapi.sendRecv( msg )
        #print(reply)
        if len(reply.coll):
            return reply.coll[0].id
        else:
            raise Exception("Already at root")

    id2 = resolveIndexVal( id )
    #print("inter id:",id2)
    if ( len(id2) > 2 and id2[1] == "/" ) or (id2.find(":") > 0):
        return id2

    return g_cur_alias_prefix + id2


def printListing( reply ):
    idx = 1
    global g_list_items
    g_list_items = []
    for i in reply.item:
        g_list_items.append(i.id)
        if i.alias:
            print("{:2}. {:12} ({:20} {}".format(idx,i.id,i.alias+")",i.title))
        else:
            print("{:2}. {:34} {}".format(idx,i.id,i.title))
        idx += 1

def printUserListing( reply ):
    idx = 1
    global g_list_items
    g_list_items = []
    for i in reply.user:
        g_list_items.append(i.uid)
        print("{:2}. {:24} {}".format(idx,i.uid,i.name))
        idx += 1

def printEndpoints(reply):
    idx = 1
    global g_list_items
    g_list_items = []
    for i in reply.ep:
        p = i.rfind("/")
        if p >= 0:
            path = i[0:p+1]
            g_list_items.append(path)
            print("{:2}. {}".format(idx,path))
            idx += 1

def initialize(server,port,manual_auth):
    global mapi
    global g_really_exit
    global g_cur_sel

    try:
        mapi = ClientLib.MsgAPI(server_host=server,server_port=port,manual_auth=manual_auth)
    except Exception as e:
        print(e)
        g_really_exit = True
        sys.exit(1)

    authorized, uid = mapi.getAuthStatus()

    if manual_auth or not authorized:
        if not manual_auth:
            if not mapi.keysLoaded():
                info(1,"No local credentials loaded.")
            elif not mapi.keysValid():
                info(1,"Invalid local credentials.")

            info(0,"Manual authentication required.")

        i = 0
        while i < 3:
            i += 1
            uid = raw_input("User ID: ")
            password = getpass.getpass(prompt="Password: ")
            try:
                mapi.manualAuth( uid, password )
                break
            except Exception as e:
                print(e)

        if i == 3:
            info(1,"Aborting...")
            g_really_exit = True
            sys.exit(1)

        mapi.installLocalCredentials()
    else:
        info(1,"Authenticated as",uid)

    g_cur_sel = uid

#------------------------------------------------------------------------------
# Main loop

info(1,"DataFed CLI Ver.", ClientLib.version())

try:
    session = PromptSession(unicode("> "),history=FileHistory(os.path.expanduser("~/.datafed-hist")))

    while True:
        try:
            if mapi == None and len(sys.argv) > 1:
                g_non_interact = True
                cli()
            else:
                _args = shlex.split(session.prompt(auto_suggest=AutoSuggestFromHistory()))
                cli(prog_name="datafed",args=_args)

        except SystemExit as e:
            if g_really_exit:
                break
        except KeyboardInterrupt as e:
            break
        except Exception as e:
            print(e)

        g_non_interact = False

except Exception as e:
    print("Exception:",e)

print("Goodbye!")
