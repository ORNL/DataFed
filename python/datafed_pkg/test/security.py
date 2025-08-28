#!/usr/bin/env python3

import getpass
import datafed.CommandLib
import datafed.SDMS_Auth_pb2 as auth


opts = {}

opts["manual_auth"] = True
uid = input("User ID: ")
password = getpass.getpass(prompt="Password: ")

api = datafed.CommandLib.API(opts)

api.loginByPassword(uid, password)

msg = auth.UserCreateRequest()
msg.uid = "newuser"
msg.password = "temptemp"
msg.name = "New User"
msg.email = "NewUser@foo.bar"

print("sending")

reply, mt = api._mapi.sendRecv(msg)

print("got", reply)
