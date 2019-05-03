#!/usr/bin/env python
from __future__ import division, print_function, absolute_import #, unicode_literals
import getpass
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

g_first_cmd = True
g_really_exit = False
g_verbosity = 1
g_ctxt_settings = dict(help_option_names=['-h', '-?', '--help'])

# Verbosity-aware print
def info( level, *args ):
    if level >= g_verbosity:
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
@click.option("-l","--log",is_flag=True,help="Force manual authentication")
@click.option("-v","--verbosity",type=int,help="Verbosity level (0=quiet,1=normal,2=verbose)")
@click.pass_context
def cli(ctx,log,verbosity):
    global g_first_cmd
    global g_verbosity
    global g_really_exit

    if not verbosity is None:
        g_verbosity = verbosity

    if g_first_cmd and not ctx.invoked_subcommand is None:
        #print("exit after first cmd")
        g_really_exit = True

#------------------------------------------------------------------------------
# User command group
@cli.command(cls=AliasedGroup)
def user():
    pass


@user.command(name='list')
@click.option("-o","--offset",default=0,help="List offset")
@click.option("-c","--count",default=20,help="List count")
def user_list(offset,count):
    msg = auth.UserListAllRequest()
    msg.offset = offset
    msg.count = count
    reply, mt = mapi.sendRecv( msg )
    #print("verbosity:",g_verbosity)
    print(reply)


@user.command(name='view')
@click.option("-d","--details",is_flag=True,help="Show detailed user information")
@click.argument("uid")
def user_view(uid,details):
    msg = auth.UserViewRequest()
    msg.uid = uid
    msg.details = details
    reply, mt = mapi.sendRecv( msg )
    print(reply)


#------------------------------------------------------------------------------
# Data command group
@cli.command(cls=AliasedGroup)
def data():
    pass


@data.command(name='view')
@click.option("-d","--details",is_flag=True,help="Show detailed data information")
@click.argument("id")
def data_view(id,details):
    msg = auth.RecordViewRequest()
    msg.id = id
    if details:
        msg.details = True
    else:
        msg.details = False
    reply, mt = mapi.sendRecv( msg )
    print(reply)

@data.command(name='get',help="Get (download) raw data from datafed")
@click.argument("id")
def data_get():
    '''
    Gets the raw data associated with ID, which is ID/alias of data record to view"
    '''
    pass

@data.command(name='put',help="Put (upload) raw data to datafed")
@click.argument("id")
def data_put():
    pass

#------------------------------------------------------------------------------
# Miscellaneous commands

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


info(1,"DataFed CLI Ver.", ClientLib.version())

try:
    #mapi = ClientLib.MsgAPI("sdms.ornl.gov",7512,"3dV7&?{asLI?6<i(:IG32)-TJn9axTz1d2r6blDu","/home/cades/.sdms")
    mapi = ClientLib.MsgAPI("sdms.ornl.gov",7512)


    authorized, uid = mapi.getAuthStatus()
    if not authorized:
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
            into(1,"Aborting...")
            exit(1)

        mapi.installLocalCredentials()
    else:
        info(1,"Authenticated as",uid)

    '''
    if len(sys.argv) > 1:
        print( "non-interactive" )
        cli(obj={})
    else:
    '''
    session = PromptSession(unicode("> "),history=FileHistory(os.path.expanduser("~/.datafed-hist")))


    #max_iter = 3
    #while max_iter > 0:
    while True:
        #max_iter -= 1
        try:
            #print("first:",g_first_cmd)
            #_args = raw_input("> ").split()
            if g_first_cmd and len(sys.argv) > 1:
                cli()
            else:
                g_first_cmd = False
                _args = session.prompt(auto_suggest=AutoSuggestFromHistory()).split()
                cli(prog_name="datafed",args=_args)

            #if g_first_cmd and g_really_exit:
            #    break

        except SystemExit as e:
            if g_really_exit:
                #print("really exit")
                break
        except KeyboardInterrupt as e:
            break
        except Exception as e:
            print(e)

        g_first_cmd = False


    #while True:
    #    cli(obj={})

    #reply, mt = mapi.sendRecv( anon.StatusRequest() )
    #print "Status:",reply.status,mt

except Exception as e:
    print("Exception:",e)

print("Goodbye!")
