import SDMS_pb2
import SDMS_Anon_pb2
import SDMS_Auth_pb2
import Connection

conn = Connection.Connection(
    "localhost",
    7512,
    "3&bAmvsOjS@Gjvd&P]cL77CH3UJCpjZNmN5IC3(=",
    "J@A8ItOE59xM0PF7N0CTgOX#{[${P>qGoXn*4Eaf",
    "IIKRr]Qg&A5m4]GY>An+H{Dvy{GpR4oQ1^mc<=Jq")

conn.registerProtocol(SDMS_Anon_pb2)
conn.registerProtocol(SDMS_Auth_pb2)

print "Sending status request"
msg = SDMS_Anon_pb2.StatusRequest()
conn.send( msg )

print "Waiting for status reply"
frame, reply = conn.recv( )
print "Got: ", frame, reply

print "Sending user list request"
msg = SDMS_Auth_pb2.UserListAllRequest()
msg.offset = 0
msg.count = 10
conn.send( msg )

print "Waiting for user list reply"
frame, reply = conn.recv( )
print "Got: ", frame, reply
