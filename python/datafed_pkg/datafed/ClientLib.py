"""
DataFed API client library for creating, sending and receiving protobuf messages. Allows direct communication with DataFed's core service.


"""

import os
import zmq

from . import Version_pb2
from . import SDMS_Anon_pb2 as anon
from . import SDMS_Auth_pb2 as auth
from . import Connection
from . import dfConfig as dfC

def version():
    return "{}.{}.{}".format(Version_pb2.VER_MAJOR,Version_pb2.VER_MINOR,Version_pb2.VER_BUILD)

# High-level command interface
class CmdAPI:
    def __init__( self, mapi ):
        pass

    # Interpret cmd string, send msg, return reply
    def run( self, cmd_str ):
        pass

# Low-level message passing interface
class MsgAPI:
    def __init__( self,
        server_host,
        server_port,
        server_key_pub = None,
        server_cred_dir = None,
        client_key_pub = None,
        client_key_priv = None,
        client_cred_dir = None,
        manual_auth = None
        ):

        #print("man auth:",manual_auth)

        self._ctxt = 0
        self._auth = False

        # Process server cred dir
        self._server_cred_dir = server_cred_dir
        if self._server_cred_dir == None:
            self._server_cred_dir = dfC.Config.get_config("DF_SERVER_CRED_DIR")
            #SHOULD NO LONGER BE NECESSARY
    #        if self._server_cred_dir == None:
    #        self._server_cred_dir = "/etc/datafed/"
            #SHOULD NO LONGER BE NECESSARY
    #    if self._server_cred_dir[-1] != "/":
    #        self._server_cred_dir += "/"

        # Use or load server public key
        if server_key_pub != None:
            serv_pub = server_key_pub
        else:
            try:
                keyf = open(os.path.join(str(self._server_cred_dir), "datafed-core-key.pub"), "r" )
                serv_pub = keyf.read()
                keyf.close()
            except:
                raise Exception( "Could not open server public key file: " + os.path.join(str(self._server_cred_dir), "datafed-core-key.pub") )

        # Process client cred dir
        self._client_cred_dir = client_cred_dir
        if self._client_cred_dir == None:
            self._client_cred_dir = dfC.Config.get_config("DF_CLIENT_CRED_DIR")
     #       if self._client_cred_dir == None:
     #           self._client_cred_dir = "~/.datafed/"

        if self._client_cred_dir[-1] != "/":
            self._client_cred_dir += "/"

        self._client_cred_dir = os.path.expanduser(self._client_cred_dir)

        # Use, load, or generate client keys
        self._keys_loaded = False
        self._keys_valid = False

        if manual_auth:
            #print("gen keys")
            pub,priv = zmq.curve_keypair()
            pub = pub.decode("utf-8")
            priv = priv.decode("utf-8")
        elif client_key_pub != None and client_key_priv != None:
            pub = client_key_pub
            priv = client_key_priv
        else:
            try:
                keyf = open(os.path.join(str(self._client_cred_dir), "datafed-user-key.pub"), "r" )
                pub = keyf.read()
                keyf.close()
                keyf = open(os.path.join(str(self._client_cred_dir), "datafed-user-key.priv"), "r" )
                priv = keyf.read()
                keyf.close()
                if len(pub) != 40 or len(priv) != 40:
                    pub,priv = zmq.curve_keypair()
                else:
                    self._keys_valid = True
                self._keys_loaded = True
            except:
                pub,priv = zmq.curve_keypair()
                pub = pub.decode("utf-8")
                priv = priv.decode("utf-8")

        #print("make conn", server_host, server_port, serv_pub, pub, priv )

        self._conn = Connection.Connection( server_host, server_port, serv_pub, pub, priv )

        #print("register")

        self._conn.registerProtocol(anon)
        self._conn.registerProtocol(auth)

        #print("check ver")

        reply, mt = self.sendRecv(anon.VersionRequest(),5000)
        if reply == None:
            raise Exception( "Timeout waiting for server connection." )

        #reply, mt = self._recv()
        #print "ver reply:",reply
        #if reply.major != Version_pb2.VER_MAJOR or reply.minor != Version_pb2.VER_MINOR:
        #    raise Exception( "Incompatible server version {}.{}.{}".format(ver_reply.major,ver_reply.minor,ver_reply.build))

        #print("get auth")

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

# TODO: MAKE THIS AN OPTIONAL CMD -- NOT DEFAULT
    def installLocalCredentials(self):
        if not self._auth:
            raise Exception("Authentication required")

        msg = auth.GenerateCredentialsRequest()
        reply, mt = self.sendRecv( msg )

        # Make client cred dir if not exists
        if not os.path.exists(self._client_cred_dir):
            os.makedirs(self._client_cred_dir)
        else:
            pass

        #Make public key file
        with open(os.path.join(str(self._client_cred_dir), "datafed-user-key.pub"), "w" ) as keyf:
            keyf.write(reply.pub_key)

        #Make private key file
        with open(os.path.join(str(self._client_cred_dir), "datafed-user-key.priv"), "w" ) as keyf:
            keyf.write(reply.priv_key)

        self._keys_loaded = True

    '''
    def sendRecv2( self, msg_name, params, timeout = 5000 ):
        msg = self._conn.makeMessage(msg_name)
        for k,v in params.iteritems():
            setattr(msg, k, v)
        self._send(msg)
        return self._recv( timeout )

    def sendAsync2( self, msg_name, params ):
        msg = self._conn.makeMessage(msg_name)
        for k,v in params.iteritems():
            setattr(msg, k, v)
        self._ctxt += 1
        self._conn.send( msg, self._ctxt )
        return self._ctxt
    '''

    # Not thread safe
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

        if msg_type == "NackReply":
            if reply.err_msg:
                raise Exception(reply.err_msg)
            else:
                raise Exception("Server error {}".format( reply.err_code ))

        return reply, msg_type, ctxt
