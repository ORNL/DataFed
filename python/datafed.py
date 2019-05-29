"""
DataFed CLI
"""

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
import dfConfig as dfC


if sys.version_info.major == 3:
    unicode = str
    raw_input = input

mapi = None
g_uid = None
g_cur_sel = None
g_cur_coll = "root"
g_cur_alias_prefix = ""
g_list_items = []
g_interactive = False
#g_non_interact = False
#g_really_exit = False
g_verbosity = 1
g_ctxt_settings = dict(help_option_names=['-h', '-?', '--help'])
g_ep_default = dfC.Config.get_config("DF_DEFAULT_ENDPOINT")
g_ep_cur = g_ep_default

'''
def setup_env():
    "Function that accesses and sets environment variables from the configuration file"
    
    #TODO: Initial setup function
'''

# Verbosity-aware print
def info( level, *args ):
    global g_verbosity
    if level <= g_verbosity:
        print( *args )

def set_verbosity(ctx, param, value):
    #print("set verbosity:",value)
    global g_verbosity
    if value != None:
        g_verbosity = value

def set_interactive(ctx, param, value):
    #print("set interactive:",value)
    global g_interactive
    if value == True:
        g_interactive = value


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
@click.option("-c","--client-cred-dir",type=str,help="Client credential directory")
@click.option("-s","--server-cred-dir",type=str,help="Server credential directory")
@click.option("-l","--log",is_flag=True,help="Force manual authentication")
@click.option("-v","--verbosity",type=int,is_eager=True,callback=set_verbosity,expose_value=False,help="Verbosity level (0=quiet,1=normal,2=verbose)")
@click.option("-i","--interactive",is_flag=True,is_eager=True,callback=set_interactive,expose_value=False,help="Start an interactive session")
@click.pass_context
def cli(ctx,host,port,client_cred_dir,server_cred_dir,log):
    global g_interactive

    if not g_interactive and ctx.invoked_subcommand is None:
        click.echo("No command specified.")
        click.echo(ctx.get_help())
    elif mapi == None:
        initialize(host,port,client_cred_dir,server_cred_dir,log)


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
        click.echo(g_cur_coll)

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
    click.echo(reply)

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
        click.echo("Cannot specify both --metadata and --metadata-file options")
        return
    click.echo("t:",title,"a:",alias,"d:",description,"k:",key_words,"df:",data_file,"m:",metadata,"mf:",metadata_file,"c:",collection,"r:",repository)
    click.echo("TODO: NOT IMPLEMENTED")

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
        click.echo("Cannot specify both --metadata and --metadata-file options")
        return
    click.echo("id:",id,"t:",title,"a:",alias,"d:",description,"k:",key_words,"df:",data_file,"m:",metadata,"mf:",metadata_file)
    click.echo("TODO: NOT IMPLEMENTED")

@data.command(name='delete',help="Delete existing data record")
@click.argument("id")
def data_delete(id):
    id2 = resolveID(id)

    if g_interactive:
        if not confirm( "Delete record " + id2 + " (Y/n):"):
            return

    msg = auth.RecordDeleteRequest()
    msg.id = id2
    reply, mt = mapi.sendRecv( msg )

@data.command(name='get',help="Get (download) raw data of record ID and place in local PATH")
@click.argument("id")
@click.argument("path")
@click.option("-w","--wait",is_flag=True,help="Block until transfer is complete")
def data_get(id,path,wait):
    msg = auth.DataGetRequest()
    msg.id = resolveID(id)
    #msg.local = applyPrefix( path )
    msg.local = g_ep_cur + path
    reply, mt = mapi.sendRecv( msg )
    click.echo("reply:",reply)

    xfr = reply.xfr[0]
    click.echo("id:",xfr.id,"stat:",xfr.stat)
    if wait:
        click.echo("waiting")
        #while xfr.status < 3:
        while True:
            sleep(2)
            msg = auth.XfrViewRequest()
            msg.xfr_id = xfr.id
            reply, mt = mapi.sendRecv( msg )
            xfr = reply.xfr[0]
            click.echo("id:",xfr.id,"stat:",xfr.stat)

        click.echo("done. status:",xfr.stat)
    else:
        click.echo("xfr id:",xfr.id)

@data.command(name='put',help="Put (upload) raw data to datafed")
@click.argument("id")
def data_put(id):
    click.echo("TODO: NOT IMPLEMENTED")


#------------------------------------------------------------------------------
# Collection command group
@cli.command(cls=AliasedGroup,help="Collection subcommands")
def coll():
    pass

@coll.command(name='view',help="View collection")
@click.argument("id")
def coll_view(id):
    msg = auth.CollViewRequest()
    msg.id = resolveCollID(id)
    reply, mt = mapi.sendRecv( msg )
    click.echo(reply)

@coll.command(name='create',help="Create new collection")
@click.option("-t","--title",type=str,required=False,help="Title")
@click.option("-a","--alias",type=str,required=False,help="Alias")
@click.option("-d","--description",type=str,required=False,help="Description text")
@click.option("-c","--collection",type=str,required=False,help="Parent collection ID/alias (default is current working collection)")
def coll_create(title,alias,description,collection):
    click.echo("t:",title,"a:",alias,"d:",description,"c:",collection)
    click.echo("TODO: NOT IMPLEMENTED")

@coll.command(name='update',help="Update existing collection")
@click.argument("id")
@click.option("-t","--title",type=str,required=False,help="Title")
@click.option("-a","--alias",type=str,required=False,help="Alias")
@click.option("-d","--description",type=str,required=False,help="Description text")
def data_update(id,title,alias,description):
    click.echo("id:",id,"t:",title,"a:",alias,"d:",description)
    click.echo("TODO: NOT IMPLEMENTED")

@coll.command(name='delete',help="Delete existing collection")
@click.argument("id")
def coll_delete(id):
    id2 = resolveCollID(id)

    if g_interactive:
        click.echo("Warning: this will delete all data records and collections contained in the specified collection.")
        if not confirm( "Delete collection " + id2 + " (Y/n):"):
            return

    msg = auth.CollDeleteRequest()
    msg.id = id2
    reply, mt = mapi.sendRecv( msg )

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

#------------------------------------------------------------------------------
# User command group

@cli.command(cls=AliasedGroup,help="User commands")
def user():
    pass

@user.command(name='collab',help="List all users associated with common projects")
@click.option("-o","--offset",default=0,help="List offset")
@click.option("-c","--count",default=20,help="List count")
def user_collab(offset,count):
    click.echo("TODO: NOT IMPLEMENTED")


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
    click.echo(reply)

#------------------------------------------------------------------------------
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
    reply, mt = mapi.sendRecv( msg )
    printProjListing(reply)

@project.command(name='view',help="View project specified by ID")
@click.argument("id")
def project_view(id):
    msg = auth.ProjectViewRequest()
    msg.id = resolveID(id)
    reply, mt = mapi.sendRecv( msg )
    # TODO Print project info
    click.echo(reply)

#------------------------------------------------------------------------------
# Shared data command group

@cli.command(cls=AliasedGroup,help="Shared data commands")
def shared():
    pass

@shared.command(name="users",help="List users with shared data")
def shared_users():
    msg = auth.ACLByUserRequest()
    reply, mt = mapi.sendRecv( msg )
    printUserListing(reply)

@shared.command(name="projects",help="List projects with shared data")
def shared_projects():
    msg = auth.ACLByProjRequest()
    reply, mt = mapi.sendRecv( msg )
    printProjListing(reply)


@shared.command(name="list",help="List data shared by user/project ID")
@click.argument("id")
def shared_list(id):
    id2 = resolveID(id)

    if id2.startswith("p/"):
        msg = auth.ACLByProjListRequest()
    else:
        if not id2.startswith("u/"):
            id2 = "u/" + id2
        msg = auth.ACLByUserListRequest()

    msg.owner = id2
    reply, mt = mapi.sendRecv( msg )
    printListing(reply)

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
    click.echo("TODO: NOT IMPLEMENTED")

@xfr.command(name='stat',help="Get status of transfer ID, or most recent transfer id ID omitted")
@click.argument("id",required=False)
def xfr_stat(id):
    click.echo("TODO: NOT IMPLEMENTED")

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

@ep.command(name='default',help="Get or set default end-point path")
@click.argument("new_default_ep",required=False)
def ep_default(new_default_ep):
    global g_ep_default
    if new_default_ep:
 #       try:
        dfC.Config.set_default_ep(new_default_ep)
        g_ep_default = new_default_ep
   #     except:
        # TODO: add more functionality
        # check if input is valid endpoint
    else:
        if g_ep_default:
            click.echo(g_ep_default)
        else:
            click.echo("Default end-point not configured")


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

@ep.command(name='list',help="List recent end-point paths")
def ep_list():
    msg = auth.UserGetRecentEPRequest()
    reply, mt = mapi.sendRecv( msg )
    printEndpoints(reply)

#------------------------------------------------------------------------------
# Miscellaneous commands

@cli.command(name='ident',help="Set current user or project identity to ID (omit for self)")
@click.option("-s","--show",is_flag=True,help="Show current identity")
@click.argument("id",required=False)
def ident(id,show):
    global g_cur_sel
    global g_cur_coll
    global g_cur_alias_prefix

    if show:
        click.echo(g_cur_sel)
        return

    if id == None:
        id = g_uid

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

@cli.command(name='help',help="Show datafed client help")
@click.pass_context
def help_cli(ctx):
    click.echo(ctx.parent.get_help())


@cli.command(name="exit",help="Exit interactive session")
def exit_cli():
    global g_interactive
    g_interactive = True
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
            click.echo("{:2}. {:12} ({:20} {}".format(idx,i.id,i.alias+")",i.title))
        else:
            click.echo("{:2}. {:34} {}".format(idx,i.id,i.title))
        idx += 1

def printUserListing( reply ):
    idx = 1
    global g_list_items
    g_list_items = []
    for i in reply.user:
        g_list_items.append(i.uid)
        click.echo("{:2}. {:24} {}".format(idx,i.uid,i.name))
        idx += 1

def printProjListing(reply):
    idx = 1
    global g_list_items
    g_list_items = []
    for i in reply.proj:
        g_list_items.append(i.id)
        click.echo("{:2}. {:24} {}".format(idx,i.id,i.title))
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
            click.echo("{:2}. {}".format(idx,path))
            idx += 1

def confirm( msg ):
    val = echo.prompt( msg )
    if val == "Y":
        return True
    else:
        return False

def initialize(server,port,client_cred_dir,server_cred_dir,manual_auth):
    global mapi
    global g_uid
    global g_interactive
    global g_cur_sel

    try:
        mapi = ClientLib.MsgAPI(
            server_host=server,
            server_port=port,
            client_cred_dir=client_cred_dir,
            server_cred_dir=server_cred_dir,
            manual_auth=manual_auth
            )
    except Exception as e:
        click.echo(e)
        g_interactive = False
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

#------------------------------------------------------------------------------
# Main loop

info(1,"DataFed CLI Ver.", ClientLib.version())

'''
click.echo("CLI:",dir(cli))
click.echo("params:",dir(cli.params))
for i in cli.params:
    click.echo(i.name, dir(i))
sys.exit(1)
'''

try:
    session = PromptSession(unicode("> "),history=FileHistory(os.path.expanduser("~/.datafed-hist")))

    #max_iter = 5

    while True:
        #if max_iter == 0:
        #    break
        #max_iter -= 1

        try:
            #if mapi == None and len(sys.argv) > 1:
            if g_interactive == False:
                cli(standalone_mode=True)
                if g_interactive == False:
                    break
                for i in cli.params:
                    i.hidden = True
            else:
                _args = shlex.split(session.prompt(auto_suggest=AutoSuggestFromHistory()))
                cli(prog_name="datafed",args=_args,standalone_mode=False)
        except SystemExit as e:
            #print("Sys exit")
            #if g_really_exit:
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
