#ifndef SOCKETTRANSLATOR_HPP
#define SOCKETTRANSLATOR_HPP
#pragma once

// Local public includes
#include "common/SocketOptions.hpp"

// Third party includes
#include <zmq.hpp>

// Standard includes
#include <unordered_map>

namespace SDMS {

class ISocket;
class SocketOptions;

/**
 * Specifies the type of Socket
 *
 * DEALER - Like REQUEST Socket but asynchronous, intended for clients
 *  1. Bidirectional
 *  2. Send/recieve unrestricted
 *  3. Outgoing routing strategy Round-robin
 *  4. Incoming routing strategy Fair-queud
 *
 * ROUTER - Like REPLY socket but asynchronous and able to distinguish connected
 * agents. Intended for server, has to be able to distinguish between the
 * different connected clients so it knows who to respond to.
 *  1. Bidirectional
 *  2. Unrestricted send and recv
 *  3. Outgoing routing strategy Multiple Unicast -
 *  4. Incoming routing strategy Fair-queued
 *
 * When creating a client socket you can assign an id sock.identity = "name"
 * If this has not been done the router will create a random identity and
 * assign it to that socket.
 *
 * SUBSCRIBE
 *  1. Unidirectional
 *  2. Receive only
 *  3. Incoming routing strategy Fair-queued
 *  4. Outgoing routing N/A
 *
 * REPLIER
 *  1. Bidirectional
 *  2. Communication pattern (Receive, Send), (Receive, Send), ...
 *     Receive, Send occur in pairs to one client at a time.
 *  3. Ougoing routing strategy Fair-robin
 *  4. Incoming routing strategy Last peer
 **/
int translateToZMQSocket(ISocket *socket);
int translateToZMQSocket(const SocketOptions &options);

/**
 * Convert a zmq socket type to printable string.
 **/
std::string zmqSocketTypeToString(int zmq_enum_val);
} // namespace SDMS

#endif // SOCKETTRANSLATOR_HPP
