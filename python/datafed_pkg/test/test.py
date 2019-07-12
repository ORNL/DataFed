import datafed.CommandLib as cmd

auth = cmd.init()

if not auth:
    cmd.login("stansberrydv","badpass")

reply = cmd.exec("user all -o 0 -c 1")
print( reply )

reply = cmd.exec("user collab -o 0 -c 1")
print( reply )

reply = cmd.exec("user view stansberrydv")
print( reply )

print( "test done." )