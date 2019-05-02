"""
Connection is a Python class for sending and receiving messages via
protobuf.
"""
import google.protobuf.reflection
import zmq
import zmq.utils.z85
import struct
import time
import inspect


class Connection:
    """
    Initialize a Connection object
    """
    def __init__(self,
                a_server_host=None,
                a_server_port=None,
                a_server_pub_key=None,
                a_client_pub_key=None,
                a_client_priv_key=None,
                a_zmq_ctxt=None):

        self._msg_desc_by_type = {}
        self._msg_desc_by_name = {}
        self._msg_type_by_desc = {}

        self._address = 'tcp://{0}:{1}'.format(a_server_host, a_server_port)

        # init zeromq
        if a_zmq_ctxt:
            self._zmq_ctxt = a_zmq_ctxt
            self._zmq_ctxt_owner = False
        else:
            self._zmq_ctxt = zmq.Context()
            self._zmq_ctxt_owner = True
            self._zmq_ctxt.setsockopt( zmq.RECONNECT_IVL, 2000 )

        self._socket = self._zmq_ctxt.socket( zmq.DEALER )
        self._socket.setsockopt( zmq.TCP_KEEPALIVE, 1 )
        self._socket.setsockopt( zmq.TCP_KEEPALIVE_CNT, 20 )
        self._socket.setsockopt( zmq.TCP_KEEPALIVE_IDLE, 540 )
        self._socket.setsockopt( zmq.TCP_KEEPALIVE_INTVL, 5 )
        self._socket.curve_secretkey = a_client_priv_key
        self._socket.curve_publickey = a_client_pub_key
        self._socket.curve_serverkey = a_server_pub_key

        # TODO need a timeout
        self._socket.connect( self._address )
        self._socket.setsockopt(zmq.LINGER, 100)

    # -------------------------------------------------------------------------
    def __del__(self):
        if '_socket' in dir(self):
            self._socket.close()
        if '_zmq_ctxt' in dir(self) and self._zmq_ctxt_owner:
            self._zmq_ctxt.destroy()


    # -------------------------------------------------------------------------
    def registerProtocol( self, a_msg_module ):
        # Message descriptors are stored by name - must convert to an array in alphabetic order

        # build descriptors by type look-up
        proto_id = a_msg_module._PROTOCOL.values[0].number << 8
        idx = 0
        #print "registering protocol"
        for name,desc in sorted(a_msg_module.DESCRIPTOR.message_types_by_name.items()):
            msg_t = proto_id | idx
            #print msg_t, " = ", desc.name
            self._msg_desc_by_type[msg_t] = desc
            self._msg_desc_by_name[desc.name] = desc
            self._msg_type_by_desc[desc] = msg_t
            idx += 1


    # -------------------------------------------------------------------------
    def recv( self, a_timeout=1000 ):
        """
        Receive a protobuf message with timeout (may throw zeromq/protobuf exceptions)
        """
        # Wait for data to arrive
        ready = self._socket.poll( a_timeout )
        if ready > 0:
            # rcv null frame
            nf = self._socket.recv( 0 )
            #print "-- null frame len: ", len( nf )

            # receive zermq frame header and unpack
            frame_data = self._socket.recv( 0 )
            #print "-- frame len: ", len( frame_data )
            frame_values = struct.unpack( '<LBBH', frame_data )
            msg_type = (frame_values[1] << 8) | frame_values[2]

            # find message descriptor based on type (descriptor index)
            if not (msg_type in self._msg_desc_by_type):
                raise Exception( "received unregistered message type: {}".format( msg_type ))

            desc = self._msg_desc_by_type[msg_type]
            #print "rcv ",msg_type,desc.name

            # receive message paylod into buffer
            if frame_values[0] > 0:
                data = self._socket.recv( 0 )
                #print "-- data len: ", len( data )
                reply = google.protobuf.reflection.ParseMessage( desc, data )
            else:
                reply = google.protobuf.reflection.MakeClass( desc )()

            # make new instance of message subclass and parse from buffer

            return reply, desc.name, frame_values[3]
        else:
            return None, None, None

    # -------------------------------------------------------------------------
    def send( self, a_message, a_ctxt ):
        """
        Sends a protobuf message (may throw zeromq/protobuf exceptions)
        """
        # Find msg type by descriptor look-up
        msg_type = self._msg_type_by_desc[a_message.DESCRIPTOR]

        # Initial Null frame
        self._socket.send( b'', zmq.SNDMORE )

        # Serialize
        data = a_message.SerializeToString()
        data_sz = len( data )

        # Build the message frame, to match C-struct MessageFrame
        frame = struct.pack( '<LBBH', data_sz, msg_type >> 8, msg_type & 0xFF, a_ctxt )

        # Send body
        if data_sz > 0:
            # Send frame
            self._socket.send( frame, zmq.SNDMORE )
            # Send body
            self._socket.send( data, 0 )
        else:
            # Send frame
            self._socket.send( frame, 0 )

    def reset( self ):
        self._socket.disconnect( self._address )
        self._socket.connect( self._address )
        self._socket.setsockopt(zmq.LINGER, 100)

    # -------------------------------------------------------------------------
    def makeMessage( self, a_msg_name ):
        # find message descriptor based on type (descriptor index)
        if not (a_msg_name in self._msg_desc_by_name):
            raise Exception( "No such message type registered: {}".format( a_msg_name ))

        return google.protobuf.reflection.MakeClass( self._msg_desc_by_name[a_msg_name] )()

    # -------------------------------------------------------------------------
    def getMessageTypeName( self, a_msg_type ):
        # Return the name of a message class based on message type
        if a_msg_type in self._msg_desc_by_type:
            return self._msg_desc_by_type[a_msg_type].name
        else:
            return None

