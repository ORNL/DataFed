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
import re
import json
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
g_output_json = False

 #TODO: Make this work, please
ALIASES = {
     "dv" : "data_view",
     "dc": "data_create",
     "du": "data_update",
     "get": "data_get",
     "put": "data_put"
}

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

def set_output_json(ctx, param, value):
    #print("set interactive:",value)
    global g_output_json
    if value == True:
        g_output_json = value

def set_output_txt(ctx, param, value):
    #print("set interactive:",value)
    global g_output_json
    if value == True:
        g_output_json = False


#changing parameter types to validation callbacks
'''
Not useful: the server should be the only one who can validate/decide what is valid and what is not

def validate_data_id(ctx, param, value):
    if len(value) == 10 and re.search(r'^d/[0-9]{8}', value):  # DataFed ID format: 'd/12345678'
        return value
    elif len(value) == 8 and re.search(r'[0-9]{8}', value):  # 8 digits assumed to be part of DataFed ID
        value = f'd/{value}'  # Converted to DF ID format as above
        return value
    elif len(value) < 60 and not bool(
            re.search(r'[^-a-z0-9_.]', value)):  # Check that alias is below 60 characters & only contains alphanum or -, . , or _
        return value
    else:
        raise click.BadParameter("Not a valid Data Record ID or alias. "
                                         "ID should be given in the form or an 8-digit number or DataFed ID (d/12345678)."
                                         "Aliases may be 60 characters long and contain only alphanumeric characters, .,  _, or -.")

def validate_coll_id(ctx, param, value):
    if len(value) == 10 and re.search(r'^c/[0-9]{8}', value):  # DataFed ID format: 'c/12345678'
        return value
    elif len(value) == 8 and re.search(r'[0-9]{8}', value):  # 8 digits assumed to be part of DataFed ID
        value = f'c/{value}'  # Converted to DF ID format as above
        return value
    elif len(value) < 60 and not bool(
            re.search(r'[^-a-z0-9_.]', value)):  # Check that alias is below 60 characters & only contains alphanum or -, . , or _
        return value
    else:
        raise click.BadParameter("Not a valid Collection ID or alias. "
                                         "ID should be given in the form or an 8-digit number or DataFed ID (c/12345678)."
                                         "Aliases may be 60 characters long and contain only alphanumeric characters, .,  _, or -.")


#TODO: Implement validation for project and user IDs
'''


class AliasedGroup(click.Group):
    """
    Allows use of command aliases as defined in dictionary object: "cmd_aliases"
    """
    '''
    def get_command(self, ctx, cmd_name):
        rv = click.Group.get_command(self, ctx, cmd_name)
        if rv is not None:
            return rv
        elif cmd_name in cmd_aliases:
            return click.Group.get_command(self, ctx, "cli." + cmd_aliases[cmd_name])
        elif rv is None:
            return None
        ctx.fail('No valid command specified.')
        '''
    '''
    def get_command(self, ctx, cmd_name):
        try:
            actual = ALIASES.get(cmd_name)
            click.echo(actual)
            return click.Group.get_command(self, ctx, "cli." + ALIASES[cmd_name])
        except KeyError:
            return click.Group.get_command(self, ctx, "cli." + ALIASES[cmd_name])
            '''
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
#@click.option("-j", "--json", is_flag=True,callback=set_output_json,expose_value=True,help="Set CLI output format to JSON, when applicable.")
#@click.option("-txt","--text",is_flag=True,callback=set_output_txt, expose_value=True,help="Set CLI output format to human-friendly text")
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
@click.argument("df-id", required=False)
def ls(df_id,offset,count):
    global g_verbosity
    global g_cur_coll
    msg = auth.CollReadRequest()
    if df_id is not None:
        msg.id = resolveCollID(df_id)
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
@click.argument("df-id",required=False)
def wc(df_id):
    global g_cur_coll
    if df_id is not None:
        g_cur_coll = resolveCollID(df_id)
    else:
        click.echo(g_cur_coll)

#------------------------------------------------------------------------------
# Data command group
@cli.command(cls=AliasedGroup,help="Data subcommands")
def data():
    pass

@data.command(name='view',help="View data record")
@click.option("-d","--details",is_flag=True,help="Show additional fields")
@click.argument("df-id")
def data_view(df_id,details):
    msg = auth.RecordViewRequest()
    msg.id = resolveID(df_id)
    if details:
        msg.details = True
    else:
        msg.details = False
    reply, mt = mapi.sendRecv( msg )
    click.echo()

#TODO: implement ext and auto-ext, turn metadata file into metadata string, dependencies?
#TODO: how to handle binary json files?
@data.command(name='create',help="Create new data record")
@click.argument("title")
@click.option("-a","--alias",type=str,required=False,help="Alias")
@click.option("-d","--description",type=str,required=False,help="Description text")
@click.option("-kw","--key-words",type=str,required=False,help="Keywords (comma separated list)") # TODO: SORT OUT syntax
@click.option("-df","--data-file",type=str,required=False,help="Local raw data file") #TODO: Put functionality
@click.option("-ext","--extension",type=str,required=False,help="Specify an extension for the raw data file. If not provided, DataFed will automatically default to the extension of the file at time of put/upload.")
@click.option("-m","--metadata",type=str,required=False,help="Metadata (JSON)")
@click.option("-mf","--metadata-file",type=click.File('r'),required=False,help="Metadata file (.json with relative or absolute path)")
@click.option("-c","--collection",type=str,required=False, default= g_cur_coll, help="Parent collection ID/alias (default is current working collection)")
@click.option("-r","--repository",type=str,required=False,help="Repository ID") #Does this need to default??
@click.option("-dep","--dependencies",multiple=True, type=click.Tuple([click.Choice(['derived', 'component', 'version', 'der', 'comp', 'ver']), str]),help="Specify dependencies by listing first the type of relationship -- 'derived' from, 'component' of, or new 'version' of -- and then the id or alias of the related record. Can be used multiple times to add multiple dependencies.")
def data_create(title,alias,description,key_words,data_file,extension,metadata,metadata_file,collection,repository,dependencies): #cTODO: FIX
    if metadata and metadata_file:
        click.echo("Cannot specify both --metadata and --metadata-file options")
        return
    msg = auth.RecordCreateRequest()
    msg.title = title
    if description: msg.desc = description
    #msg.topic = ""
    if key_words: msg.keyw = key_words   #how can this be inputted? must it be a string without spaces? must python keep as such a string, or convert to list?
    if alias: msg.alias = alias
    if resolveCollID(collection): msg.parent_id = resolveCollID(collection)
    if repository: msg.repo_id = repository
    #msg.ext = ""
    msg.ext_auto = True
    if extension is not None:
        msg.ext = extension
        msg.ext_auto = False  # does cli have to do this, or does server already?
    if metadata_file is not None:
        metadata = str(json.load(metadata_file))
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
    click.echo(msg) #load metadata from JSON file, then convert to string) # TODO: implement dependencies
    reply, mt = mapi.sendRecv(msg)
#    click.echo("t:",title,"a:",alias,"d:",description,"k:",key_words,"df:",data_file,"m:",metadata,"mf:",metadata_file,"c:",collection,"r:",repository)
    click.echo(reply)

@data.command(name='update',help="Update existing data record")
@click.argument("df_id")
@click.option("-t","--title",type=str,required=False,help="Title")
@click.option("-a","--alias",type=str,required=False,help="Alias")
@click.option("-d","--description",type=str,required=False,help="Description text")
@click.option("-kw","--key-words",type=str,required=False,help="Keywords (comma separated list)")
@click.option("-df","--data-file",type=str,required=False,help="Local raw data file")
@click.option("-ext","--extension",type=str,required=False,help="Specify an extension for the raw data file. If not provided, DataFed will automatically default to the extension of the file at time of put/upload.")
@click.option("-m","--metadata",type=str,required=False,help="Metadata (JSON)")
@click.option("-mf","--metadata-file",type=str,required=False,help="Metadata file (JSON)")
@click.option("-da","--dependencies-add",multiple=True, nargs=2, type=click.Tuple([click.Choice(['derived', 'component', 'version', 'der', 'comp', 'ver']), str]),help="Specify new dependencies by listing first the type of relationship -- 'derived' from, 'component' of, or new 'version' of -- and then the id or alias of the related record. Can be used multiple times to add multiple dependencies.")
@click.option("-dr","--dependencies-remove",multiple=True, nargs=2, type=click.Tuple([click.Choice(['derived', 'component', 'version', 'der', 'comp', 'ver']), str])help="Specify dependencies to remove by listing first the type of relationship -- 'derived' from, 'component' of, or new 'version' of -- and then the id or alias of the related record. Can be used multiple times to remove multiple dependencies.") #Make type optional -- if no type given, then deletes all relationships with that record
def data_update(df_id,title,alias,description,key_words,data_file,extension,metadata,metadata_file): #TODO: FIX
    if metadata and metadata_file:
        click.echo("Cannot specify both --metadata and --metadata-file options")
        return
    msg = auth.RecordUpdateRequest()
    msg.id = resolveID(df_id)
    if title is not None: msg.title = title
    if description is not None: msg.desc = description
    if key_words is not None: msg.keyw = key_words # how can this be inputted? must it be a string without spaces? must python keep as such a string, or convert to list?
    if alias is not None: msg.alias = alias
    if extension is not None:
        msg.ext = extension
        msg.ext_auto = False  # does cli have to do this, or does server already?
    if metadata_file is not None:
        metadata = str(json.load(metadata_file))
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
    click.echo(msg)  # load metadata from JSON file, then convert to string) #TODO: implement dependencies
    reply, mt = mapi.sendRecv(msg)
    click.echo("reply: ", reply)
    #click.echo("id:",id,"t:",title,"a:",alias,"d:",description,"k:",key_words,"df:",data_file,"m:",metadata,"mf:",metadata_file)

@data.command(name='delete',help="Delete existing data record")
@click.argument("df_id")
def data_delete(df_id): #TODO: Fix me!
    id2 = resolveID(df_id)
    if g_interactive:
        if not confirm( "Delete record " + id2 + " (Y/n):"):
            return
    msg = auth.RecordDeleteRequest()
    msg.id = id2
    reply, mt = mapi.sendRecv( msg )
    click.echo(reply)

@data.command(name='get',help="Get (download) raw data of record ID and place in local PATH")
@click.argument("df_id")
@click.argument("path", type=click.Path())
@click.option("-w","--wait",is_flag=True,help="Block until transfer is complete")
def data_get(df_id,path,wait):
    msg = auth.DataGetRequest()
    msg.id = resolveID(df_id)
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
@click.argument("df_id")
@click.option("-e","--endpoint",type=str,required=False,default=g_ep_cur,help="Globus endpoint, will default to current endpoint")
@click.option("-fp","--filepath",type=click.Path(dir_okay=False),required=True,help="Absolute path to the file being uploaded")
@click.option("-w","--wait",is_flag=True,help="Block until transfer is complete")
def data_put(df_id,endpoint,filepath,wait):
    msg = auth.DataPutRequest()
    msg.id = resolveID(df_id)
    msg.local = endpoint + filepath
    msg.ext = filepath
    click.echo(msg)
    reply,mt = mapi.sendRecv(msg)
    click.echo("reply:", reply) #TODO: returns 'write' only, not reply:write even

    xfr = reply.xfr[0]
    click.echo("id:", xfr.id, "stat:", xfr.stat)
    if wait:
        click.echo("waiting")
        # while xfr.status < 3:
        while True:
            sleep(2)
            msg = auth.XfrViewRequest()
            msg.xfr_id = xfr.id
            reply, mt = mapi.sendRecv(msg)
            xfr = reply.xfr[0]
            click.echo("id:", xfr.id, "stat:", xfr.stat)

        click.echo("done. status:", xfr.stat)
    else:
        click.echo("xfr id:", xfr.id)
    click.echo("TODO: NOT IMPLEMENTED")


#------------------------------------------------------------------------------
# Collection command group
@cli.command(cls=AliasedGroup,help="Collection subcommands")
def coll():
    pass

@coll.command(name='view',help="View collection")
@click.argument("df_id")
def coll_view(df_id):
    msg = auth.CollViewRequest()
    msg.id = resolveCollID(id)
    reply, mt = mapi.sendRecv( msg )
    click.echo(reply)

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
    if resolveCollID(collection) is not None: msg.parent_id = resolveCollID(collection)
    click.echo(msg)
    reply, mt = mapi.sendRecv(msg)
    click.echo(reply)
    click.echo("t: %s, a: %s, d: %s, c: %s" % (title, alias, description, collection))
    #TODO : JSON output

@coll.command(name='update',help="Update existing collection")
@click.argument("df_id")
@click.option("-t","--title",type=str,required=False,help="Title")
@click.option("-a","--alias",type=str,required=False,help="Alias")
@click.option("-d","--description",type=str,required=False,help="Description text")
def coll_update(df_id,title,alias,description):
    msg = auth.CollUpdateRequest()
    msg.id = resolveCollID(df_id)
    if title is not None: msg.title = title
    if alias is not None: msg.alias = alias
    if description is not None: msg.desc = description
    click.echo(msg)
    reply, mt = mapi.sendRecv(msg)
    click.echo(reply)
    click.echo("t: %s, a: %s, d: %s" % (title, alias, description))
#TODO: Fix-up

@coll.command(name='delete',help="Delete existing collection")
@click.argument("df_id")
def coll_delete(df_id):
    id2 = resolveCollID(df_id)

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
@click.argument("df_id")
def query_exec(df_id):
    msg = auth.QueryExecRequest()
    msg.id = resolveID(df_id)
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
    msg = auth.UserListCollabRequest()
    msg.offset = offset
    msg.count = count
    reply, mt = mapi.sendRecv(msg)
    printUserListing(reply)


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
@click.argument("df_id")
def project_view(df_id):
    msg = auth.ProjectViewRequest()
    msg.id = resolveID(df_id)
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
@click.argument("df_id")
def shared_list(df_id):
    id2 = resolveID(df_id)

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
@click.argument("df_id",required=False,default="MOST RECENT XFR ID")
def xfr_stat(df_id):
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

def resolveIndexVal( df_id ):
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

def resolveID( df_id ):
    df_id2 = resolveIndexVal( df_id )

    if ( len(df_id2) > 2 and df_id2[1] == "/" ) or (df_id2.find(":") > 0):
        return df_id2

    return g_cur_alias_prefix + df_id2

def resolveCollID( df_id ):
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
        reply, mt = mapi.sendRecv( msg )
        #print(reply)
        if len(reply.coll):
            return reply.coll[0].id
        else:
            raise Exception("Already at root")

    df_id2 = resolveIndexVal( df_id )
    #print("inter id:",df_id2)
    if ( len(df_id2) > 2 and df_id2[1] == "/" ) or (df_id2.find(":") > 0):
        return df_id2

    return g_cur_alias_prefix + df_id2


def printListing( reply ):
    df_idx = 1
    global g_list_items
    g_list_items = []
    for i in reply.item:
        g_list_items.append(i.df_id)
        if i.alias:
            click.echo("{:2}. {:12} ({:20} {}".format(df_idx,i.df_id,i.alias+")",i.title))
        else:
            click.echo("{:2}. {:34} {}".format(df_idx,i.df_id,i.title))
        df_idx += 1

def printUserListing( reply ):
    df_idx = 1
    global g_list_items
    g_list_items = []
    for i in reply.user:
        g_list_items.append(i.uid)
        click.echo("{:2}. {:24} {}".format(df_idx,i.uid,i.name))
        df_idx += 1

def printProjListing(reply):
    df_idx = 1
    global g_list_items
    g_list_items = []
    for i in reply.proj:
        g_list_items.append(i.df_id)
        click.echo("{:2}. {:24} {}".format(df_idx,i.df_id,i.title))
        df_idx += 1

def printEndpoints(reply):
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

def confirm( msg ):
    val = click.prompt( msg )
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
