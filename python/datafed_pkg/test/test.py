import datafed.CommandLib as cmd

reply = cmd.exec("user all -o 0 -c 1")
print( reply )

reply = cmd.exec("user collab -o 0 -c 1")
print( reply )

reply = cmd.exec("user view stansberrydv")
print( reply )

print( "test done." )