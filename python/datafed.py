#!/usr/bin/env python

import client

print "DataFed CLI Ver.", client.version()

try:
    mapi = client.DataFed_MAPI("sdms.ornl.gov",7512,"/etc/sdms")

    reply, mt = mapi.statusRequest()
    print "Status:",reply.status,mt

    reply, mt = mapi.userListAllRequest(1,3)
    print "users:",reply,mt
except Exception as e:
    print e