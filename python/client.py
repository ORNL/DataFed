import SDMS_pb2
import SDMS_Anon_pb2
import SDMS_Auth_pb2
import Connection

conn = Connection.Connection(
    "sdms.ornl.gov",
    7512,
    "3dV7&?{asLI?6<i(:IG32)-TJn9axTz1d2r6blDu",
    "J@A8ItOE59xM0PF7N0CTgOX#{[${P>qGoXn*4Eaf",
    "IIKRr]Qg&A5m4]GY>An+H{Dvy{GpR4oQ1^mc<=Jq")

conn.registerProtocol(SDMS_Anon_pb2)
conn.registerProtocol(SDMS_Auth_pb2)