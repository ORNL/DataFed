#!/usr/bin/env python3

import sys
import argparse
import random
import datafed.CommandLib
import json
import time
import getpass
import datafed.SDMS_Anon_pb2 as anon
import datafed.SDMS_Auth_pb2 as auth
import datafed.SDMS_pb2 as sdms


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
msg.secret = "dfgdfg"

print("sending")

reply, mt = api._mapi.sendRecv(msg)

print("got", reply)
