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

        #priv_key = zmq.utils.z85.decode(a_client_priv_key)
        #pub_key = zmq.utils.z85.decode(a_client_pub_key)

        self._socket.curve_secretkey = a_client_priv_key
        self._socket.curve_publickey = a_client_pub_key
        self._socket.curve_serverkey = a_server_pub_key
        #self._socket.setsockopt( zmq.ZMQ_CURVE_SECRETKEY, priv_key )
        #self._socket.setsockopt( zmq.ZMQ_CURVE_PUBLICKEY, pub_key )
        #self._socket.setsockopt( zmq.ZMQ_CURVE_SERVERKEY, a_server_pub_key )

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
        """
        Must build a message type (integer) to descriptor table for automatic
        message creation/parsing on receive
        """
        # Message descriptors are stored by name - must convert to an array in alphabetic order
        
        #msgs_by_start = {}
        #for name, desc in a_msg_module.DESCRIPTOR.message_types_by_name.items():
        #    msgs_by_start[desc._serialized_start] = desc

        #msgs_unordered = copy( a_msg_module.DESCRIPTOR.message_types_by_name )

        # build descriptors by type look-up
        proto_id = a_msg_module._PROTOCOL.values[0].number << 8
        idx = 0
        #print "registering protocol"
        for name,desc in sorted(a_msg_module.DESCRIPTOR.message_types_by_name.items()):
            #print idx, ":", name, desc.name
            msg_t = proto_id | idx
            self._msg_desc_by_type[msg_t] = desc
            self._msg_type_by_desc[desc] = msg_t
            idx += 1

        # build indexes
        #idx = proto_id << 16
        #for i,desc in sorted(msgs_by_start.items()):
            #print idx, ' @ ', desc
            #self._msg_desc_by_type[idx] = desc
            #self._msg_type_by_desc[desc] = idx
            #idx += 1

    # -------------------------------------------------------------------------
    def recv( self, a_timeout=1000 ):
        """
        Receive a protobuf message with timeout (may throw zeromq/protobuf exceptions)
        """
        # Wait for data to arrive
        rval = []
        ready = self._socket.poll( a_timeout )
        if ready > 0:

            # receive zermq frame header and unpack
            frame_data = self._socket.recv( zmq.NOBLOCK )
            frame_values = struct.unpack( '<HHL', frame_data )
            msg_type = (frame_values[0] << 16) | frame_values[1]

            # receive message paylod into buffer
            data = self._socket.recv( zmq.NOBLOCK )

            # find message descriptor based on type (descriptor index)
            desc = self._msg_desc_by_type[msg_type]

            # make new instance of message subclass and parse from buffer
            rval.append(msg_type)
            rval.append(google.protobuf.reflection.ParseMessage( desc, data ))
            return rval
        else:
            return 0, None

    # -------------------------------------------------------------------------
    def send( self, a_message, route=None ):
        """
        Sends a protobuf message (may throw zeromq/protobuf exceptions)
        """
        # Find msg type by descriptor look-up
        msg_type = self._msg_type_by_desc[a_message.DESCRIPTOR]

        # Reverse word order
        msg_type = (msg_type & 0xFFFF << 16) | (msg_type & 0xFFFF0000 >> 16)

        # Serialize
        data = a_message.SerializeToString()

        # Build the message frame, to match C-struct MessageFrame
        frame = struct.pack( '<HHL', msg_type >> 16, msg_type & 0xFFFF, len( data ))

        # Send frame, then body
        while True:
            try:
                self._socket.send( frame, zmq.NOBLOCK | zmq.SNDMORE )
                break
            except zmq.Again:
                time.sleep(0.1)
        while True:
            try:
                self._socket.send( data, zmq.NOBLOCK )
                break
            except zmq.Again:
                time.sleep(0.1)


    # -------------------------------------------------------------------------
    def getMessageTypeName( self, a_msg_type ):
        """
        Return the short name of a message class based on message type
        """
        # if a_msg_type > 0 and a_msg_type < self._msg_desc_by_type:
        #     return self._msg_desc_by_type[a_msg_type].name
        # return ''
        if a_msg_type in self._msg_desc_by_type:
            rval = self._msg_desc_by_type[a_msg_type].name
        else:
            rval = ''
        return rval
