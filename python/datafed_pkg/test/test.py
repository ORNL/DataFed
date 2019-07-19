import datafed.CommandLib as cmd
import click

auth, uid = cmd.init()

if not auth:
    cmd.login("stansberrydv","badpass")

reply = cmd.command("user all -o 0 -c 1")
print( reply )

reply = cmd.command("user collab -o 0 -c 1")
print( reply )

reply = cmd.command("user view stansberrydv")
print( reply )

reply = cmd.command("user view xcxcc")
print( reply )

try:
    reply = cmd.command("user view")
    print( "cmd should have failed" )
except Exception as e:
    print("expected exception:",str(e))

print( "test done." )