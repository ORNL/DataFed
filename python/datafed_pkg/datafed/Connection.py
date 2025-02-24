# @package datafed.Connection
# Low-level message-oriented communications module
#
# The DataFed Connection class enables sending and receiving Google protobuf
# messages over ZeroMQ. Protobuf messages are automatically serialized and
# unserialized, and custom framing is generated to efficiently convey message
# type, size, and a re-association context value.
#
# The Google protobuf library does not provide a mechanism for identifying
# message types numerically (only by string), so a build-time custom tool
# (pyproto_add_msg_idx.py) is used to generate the mappings from message
# names to message index (and vice versa) and appends this information as
# dictionaries to the compiled proto files (xxxx_pb2.py). The
# registerProtocol() method then loads uses this information to create
# consistent message type framing for python send/recv methods.

from google.protobuf.message_factory import GetMessageClass
import logging
import zmq
import zmq.utils.z85
import struct
import sys
import uuid


##
# @class Connection
# @brief Provides low-level message-oriented communication
#
# The DataFed Connection class enables sending and receiving Google protobuf
# messages over ZeroMQ. Protobuf messages are automatically serialized and
# unserialized, and custom framing is generated to efficiently convey message
# type, size, and a re-association context value.
#
class Connection:
    ##
    # @brief Initialize a Connection instance
    #
    # When a Connection instance is created, the underlying ZeroMq connection
    # is initialized using supplied parameters.
    #
    # @param server_host - DataFed core server hostname or IP address
    # @param server_port - DataFed core server port number
    # @param server_pub_key - Server public CurveMQ key
    # @param client_pub_key - Client public CurveMQ key
    # @param client_priv_key - Client private CurveMQ key
    # @param zmq_ctxt - ZeroMQ context (optional)
    #
    def __init__(
        self,
        server_host,
        server_port,
        server_pub_key,
        client_pub_key,
        client_priv_key,
        zmq_ctxt=None,
        log_level=logging.INFO,
    ):
        self._log_level = log_level
        self._format = "%(asctime)s datafed-cli %(levelname)s %(message)"
        logging.Formatter(self._format)

        self._logger = logging.getLogger(__name__)
        self._logger.setLevel(self._log_level)

        # Unfortunately we cannot get the public key out once we put it in zmq
        self._pub_key = client_pub_key

        self._msg_desc_by_type = {}
        self._msg_desc_by_name = {}
        self._msg_type_by_desc = {}

        self._address = "tcp://{0}:{1}".format(server_host, server_port)
        # init zeromq
        if zmq_ctxt:
            self._zmq_ctxt = zmq_ctxt
            self._zmq_ctxt_owner = False
        else:
            self._zmq_ctxt = zmq.Context()
            self._zmq_ctxt_owner = True
            self._zmq_ctxt.setsockopt(zmq.RECONNECT_IVL, 2000)

        self._socket = self._zmq_ctxt.socket(zmq.DEALER)
        self._socket.setsockopt(zmq.TCP_KEEPALIVE, 1)
        self._socket.setsockopt(zmq.TCP_KEEPALIVE_CNT, 20)
        self._socket.setsockopt(zmq.TCP_KEEPALIVE_IDLE, 540)
        self._socket.setsockopt(zmq.TCP_KEEPALIVE_INTVL, 5)

        if sys.version_info.major == 3:
            try:
                self._socket.setsockopt_string(zmq.CURVE_SECRETKEY, client_priv_key)
            except BaseException:
                raise Exception("Invalid client private key")
            try:
                self._socket.setsockopt_string(zmq.CURVE_PUBLICKEY, client_pub_key)
            except BaseException:
                raise Exception("Invalid client public key")
            try:
                self._socket.setsockopt_string(zmq.CURVE_SERVERKEY, server_pub_key)
            except BaseException:
                raise Exception("Invalid server public key: " + server_pub_key)
        else:
            self._socket.curve_secretkey = client_priv_key
            self._socket.curve_publickey = client_pub_key
            self._socket.curve_serverkey = server_pub_key

        # TODO need a timeout
        self._socket.connect(self._address)
        self._socket.setsockopt(zmq.LINGER, 100)

    def __del__(self):
        # Clean-up zeromq resources on delete
        if "_socket" in dir(self):
            self._socket.close()
        if "_zmq_ctxt" in dir(self) and self._zmq_ctxt_owner:
            self._zmq_ctxt.destroy()

    ##
    # @brief Register a protobuf module
    #
    # This method registers an imported protobuf module (_pb2 file) for use
    # with the Connection class. Registration is required for proper message
    # framing and serialization.
    #
    # @param msg_module - Protobuf module (imported *_pb2 module)
    #
    def registerProtocol(self, msg_module):
        # Message descriptors are stored by name created by protobuf compiler
        # A custom post-proc tool generates and appends _msg_name_to_type with
        # defined DataFed-sepcific numer message types

        for name, desc in sorted(msg_module.DESCRIPTOR.message_types_by_name.items()):
            msg_t = msg_module._msg_name_to_type[name]
            self._msg_desc_by_type[msg_t] = desc
            self._msg_desc_by_name[desc.name] = desc
            self._msg_type_by_desc[desc] = msg_t

    ##
    # @brief Receive a message
    #
    # Receive a protobuf message with timeout. This method automatically
    # parses and creates a new protobuf message class based on received
    # framing. The new message object, the message name (defined in the
    # associated proto file), and re-association context are returned as
    # a tuple. On timeout, (None,None,None) is returned.
    #
    # @param timeout - Timeout in milliseconds
    # @return Tuple of message, message type, and re-association context
    # @retval (object,str,int) or (None,None,None) on timeout
    # @exception Exception: if unregistered message type is received.
    #
    def recv(self, a_timeout=1000):
        # Wait for data to arrive
        ready = self._socket.poll(a_timeout)
        if ready > 0:
            # receive null frame
            self._socket.recv_string(0)

            header = ""
            while header != "BEGIN_DATAFED":
                header = self._socket.recv_string(0)

            msg = self._socket.recv(0)
            route_count = struct.unpack("!i", msg)[0]

            for i in range(0, route_count):
                # route
                self._socket.recv(0)

            # null_packet
            self._socket.recv(0)

            # correlation_id
            correlation_id = self._socket.recv_string(0)
            self._logger.debug(
                f"Receiving message with correlation id is {correlation_id}"
            )
            # key
            self._socket.recv_string(0)
            # client
            self._socket.recv_string(0)

            # receive custom frame header and unpack
            frame_data = self._socket.recv(0)
            frame_values = struct.unpack(">LBBH", frame_data)
            msg_type = (frame_values[1] << 8) | frame_values[2]

            # find message descriptor based on type (descriptor index)

            if not (msg_type in self._msg_desc_by_type):
                raise Exception(
                    "received unregistered message type: {}".format(msg_type)
                )

            desc = self._msg_desc_by_type[msg_type]

            if frame_values[0] > 0:
                # Create message by parsing content
                data = self._socket.recv(0)
                reply = GetMessageClass(desc)()
                reply.ParseFromString(data)
            else:
                # No content, just create message instance
                data = self._socket.recv(0)
                reply = GetMessageClass(desc)()

            return reply, desc.name, frame_values[3]
        else:
            return None, None, None

    ##
    # @brief Send a message
    #
    # Serializes and sends framing and message payload over connection.
    #
    # @param message - The protobuf message object to be sent
    # @param ctxt - Reply re-association value (int)
    # @exception Exception: if unregistered message type is sent.
    #
    def send(self, message, ctxt):
        # Find msg type by descriptor look-up
        if not (message.DESCRIPTOR in self._msg_type_by_desc):
            raise Exception("Attempt to send unregistered message type.")
        msg_type = self._msg_type_by_desc[message.DESCRIPTOR]

        # Initial Null frame
        self._socket.send_string("BEGIN_DATAFED", zmq.SNDMORE)
        route_count = 0
        # !i - The ! - is for network byte order, the 'i' is for an integer
        self._socket.send(struct.pack("!i", route_count), zmq.SNDMORE)
        self._socket.send(b"", zmq.SNDMORE)
        correlation_id = str(uuid.uuid4())
        self._logger.debug(f"Creating message with correlation id is {correlation_id}")
        self._socket.send_string(correlation_id, zmq.SNDMORE)
        self._socket.send_string(self._pub_key, zmq.SNDMORE)
        self._socket.send_string("no_user", zmq.SNDMORE)

        # Serialize
        data = message.SerializeToString()
        data_sz = len(data)

        # Build the message frame, to match C-struct MessageFrame
        frame = struct.pack(">LBBH", data_sz, msg_type >> 8, msg_type & 0xFF, ctxt)

        if data_sz > 0:
            # Send frame and payload
            self._socket.send(frame, zmq.SNDMORE)
            self._socket.send(data, 0)
        else:
            # Send frame (no payload)
            self._socket.send(frame, zmq.SNDMORE)
            self._socket.send(b"", 0)

    ##
    # @brief Reset connection
    #
    # This method disconnects and then reconnects to the same remote server.
    # This is useful for clearing error conditions or re-establishing a
    # connection after security handshake.
    #
    def reset(self):
        self._socket.disconnect(self._address)
        self._socket.connect(self._address)
        self._socket.setsockopt(zmq.LINGER, 100)

    ##
    # @brief Makes a new protobuf message instance based on message name
    #
    # @param msg_name (str) - Name of message class to instantiate
    # @return New protobuf message instance, or None if not registered
    #
    def makeMessage(self, msg_name):
        # find message descriptor based on type (descriptor index)
        if msg_name in self._msg_desc_by_name:
            return GetMessageClass(self._msg_desc_by_name[msg_name])()
        else:
            return None
