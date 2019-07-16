"""
The DataFed MessageLib.API class provides a low-level interface for creating,
sending and receiving messages to/from a DataFed server. The DataFed message
interface uses Google's protobuf package, and the messages (requests, replies,
and data structures) are defined in the *.proto files included in the DataFed
client package.

The MessageLib.API class provides basic connectivity, authentication, and both
synchronous ans asynchronous message send/recv methods. Note that, by default,
received NackReply responses from the server are converted to exceptions;
however, this can be disabled using the setNackException() method.
"""

import os
import zmq
from . import Version_pb2
from . import SDMS_Anon_pb2 as anon
from . import SDMS_Auth_pb2 as auth
from . import Connection


class API:
    def __init__( self,
        server_host = None,
        server_port = None,
        server_pub_key_file = None,
        server_cfg_dir = None,
        client_pub_key_file = None,
        client_priv_key_file = None,
        client_cfg_dir = None,
        log = None,
        **kwargs
        ):

        self._ctxt = 0
        self._auth = False
        self._nack_except = True

        # Process server cred dir
        self._server_cred_dir = server_cfg_dir

        # Use or load server public key
        if server_pub_key_file != None:
            serv_pub = server_pub_key_file
        else:
            try:
                keyf = open(os.path.join(str(self._server_cred_dir), "datafed-core-key.pub"), "r" )
                serv_pub = keyf.read()
                keyf.close()
            except:
                raise Exception( "Could not open server public key file: " + os.path.join(str(self._server_cred_dir), "datafed-core-key.pub") )

        # Process client cred dir
        self._client_cred_dir = client_cfg_dir

        # Use, load, or generate client keys
        self._keys_loaded = False
        self._keys_valid = False

        if log:
            #print("gen keys")
            pub,priv = zmq.curve_keypair()
            pub = pub.decode("utf-8")
            priv = priv.decode("utf-8")
        else:
            try:
                if client_pub_key_file:
                    keyf = open(client_pub_key_file, "r" )
                else:
                    keyf = open(os.path.join(str(self._client_cred_dir), "datafed-user-key.pub"), "r" )
                pub = keyf.read()
                keyf.close()

                if client_priv_key_file:
                    keyf = open(client_priv_key_file, "r" )
                else:
                    keyf = open(os.path.join(str(self._client_cred_dir), "datafed-user-key.priv"), "r" )
                priv = keyf.read()
                keyf.close()
                if len(pub) != 40 or len(priv) != 40:
                    pub,priv = zmq.curve_keypair()
                    pub = pub.decode("utf-8")
                    priv = priv.decode("utf-8")
                else:
                    self._keys_valid = True
                self._keys_loaded = True
            except:
                pub,priv = zmq.curve_keypair()
                pub = pub.decode("utf-8")
                priv = priv.decode("utf-8")

        self._conn = Connection.Connection( server_host, server_port, serv_pub, pub, priv )

        self._conn.registerProtocol(anon)
        self._conn.registerProtocol(auth)

        # Check for compatible protocol versions
        reply, mt = self.sendRecv(anon.VersionRequest(),5000)
        if reply == None:
            raise Exception( "Timeout waiting for server connection." )

        if reply.major != Version_pb2.VER_MAJOR or reply.minor != Version_pb2.VER_MINOR:
            raise Exception( "Incompatible server version {}.{}.{}".format(ver_reply.major,ver_reply.minor,ver_reply.build))

        # Check if server authenticated based on keys
        reply, mt = self.sendRecv( anon.GetAuthStatusRequest() )
        self._auth = reply.auth
        self._uid = reply.uid

    def keysLoaded(self):
        return self._keys_loaded

    def keysValid(self):
        return self._keys_valid

    def getAuthStatus(self):
        return self._auth, self._uid

    def manualAuth( self, uid, password ):
        msg = anon.AuthenticateRequest()
        msg.uid = uid
        msg.password = password
        self.sendRecv( msg )

        # Reset connection so server can re-authenticate
        self._conn.reset()

        # Test auth status
        reply, mt = self.sendRecv( anon.GetAuthStatusRequest() )
        if not reply.auth:
            raise Exception("Internal authentication error")
        self._auth = True
        self._uid = reply.uid

    def getNackException( self ):
        return self._nack_except

    def setNackException( self, enabled ):
        if enabled:
            self._nack_except = True
        else:
            self._nack_except = False

    def sendRecv( self, msg, timeout = 5000 ):
        self.send( msg )
        reply, mt, ctxt = self.recv( timeout )
        if reply == None:
            return None, None
        if ctxt != self._ctxt:
            raise Exception("Mismatched reply")
        return reply, mt

    def send( self, msg ):
        self._ctxt += 1
        self._conn.send( msg, self._ctxt )
        return self._ctxt

    def recv( self, timeout = 5000 ):
        reply, msg_type, ctxt = self._conn.recv( timeout )
        if reply == None:
            return None, None, None

        if msg_type == "NackReply" and self._nack_except:
            if reply.err_msg:
                raise Exception(reply.err_msg)
            else:
                raise Exception("Server error {}".format( reply.err_code ))

        return reply, msg_type, ctxt
