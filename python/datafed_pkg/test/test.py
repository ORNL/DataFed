import datafed.CommandLib as cmd
import click

auth = cmd.init()

if not auth:
    cmd.login("stansberrydv","badpass")

reply = cmd.exec("user all -o 0 -c 1")
print( reply )

reply = cmd.exec("user collab -o 0 -c 1")
print( reply )

reply = cmd.exec("user view stansberrydv")
print( reply )

reply = cmd.exec("user view xcxcc")
print( reply )

try:
    reply = cmd.exec("user view")
    print( "cmd should have failed" )
except Exception as e:
    print("expected exception:",str(e))

print( "test done." )