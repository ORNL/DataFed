import Version_pb2
import SDMS_pb2
import SDMS_Anon_pb2
import SDMS_Auth_pb2
import zmq
import Connection
import click

def version():
    return "{}.{}.{}".format(Version_pb2.VER_MAJOR,Version_pb2.VER_MINOR,Version_pb2.VER_BUILD)

class DataFed_MAPI:
    def __init__( self, host, port, cred_dir ):
        self._ctxt = 0
        pub,priv = zmq.curve_keypair()
        self._conn = Connection.Connection( host, port,
            "3dV7&?{asLI?6<i(:IG32)-TJn9axTz1d2r6blDu",
            pub,priv)

        self._conn.registerProtocol(SDMS_Anon_pb2)
        self._conn.registerProtocol(SDMS_Auth_pb2)

        self._send(SDMS_Anon_pb2.VersionRequest())
        reply, mt = self._recv()
        #print "ver reply:",reply
        if reply.major != Version_pb2.VER_MAJOR or reply.minor != Version_pb2.VER_MINOR:
            raise Exception( "Incompatible server version {}.{}.{}".format(ver_reply.major,ver_reply.minor,ver_reply.build))

    def _send( self, msg ):
        self._ctxt += 1
        self._conn.send( msg, self._ctxt )

    def _recv( self ):
        reply, msg_type, ctxt = self._conn.recv()
        if reply == None:
            raise Exception("Receive timeout")

        if ctxt != self._ctxt:
            raise Exception("Mismatched reply")

        if msg_type == "NackReply":
            if reply.err_msg:
                raise Exception(reply.err_msg)
            else:
                raise Exception("Server error {}".format( reply.err_code ))

        return reply, msg_type

    def statusRequest( self ):
        self._send(SDMS_Anon_pb2.StatusRequest())
        return self._recv()

    def userListAllRequest( self, offset = None, count = None ):
        msg = SDMS_Auth_pb2.UserListAllRequest()
        if offset and count:
            msg.offset = offset
            msg.count = count
        self._send(msg)
        return self._recv()

'''
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
'''
