#!/usr/bin/env python
import getpass
import SDMS_Anon_pb2 as anon
import SDMS_Auth_pb2 as auth
import ClientLib
import click

print "DataFed CLI Ver.", ClientLib.version()

#try:
if True:
    #mapi = ClientLib.MsgAPI("sdms.ornl.gov",7512,"3dV7&?{asLI?6<i(:IG32)-TJn9axTz1d2r6blDu","/home/cades/.sdms")
    mapi = ClientLib.MsgAPI("sdms.ornl.gov",7512)


    authorized, uid = mapi.getAuthStatus()
    if not authorized:
        if not mapi.keysLoaded():
            print "No local credentials loaded."
        elif not mapi.keysValid():
            print "Invalid local credentials."

        print "Manual authentication required."

        i = 0
        while i < 3:
            i += 1
            uid = raw_input("User ID: ")
            password = getpass.getpass(prompt="Password: ")
            try:
                mapi.manualAuth( uid, password )
                break
            except Exception as e:
                print e

        if i == 3:
            print "Aborting..."
            exit(1)

        mapi.installLocalCredentials()
    else:
        print "Authenticated as",uid


    #reply, mt = mapi.sendRecv( anon.StatusRequest() )
    #print "Status:",reply.status,mt

    reply, mt = mapi.sendRecv( auth.UserListAllRequest() )
    print "users:",reply,mt



#except Exception as e:
#    print "Exception:",e

print "Goodbye!"
