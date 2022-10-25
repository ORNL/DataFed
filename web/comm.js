var mod_zmq = require("zeromq");
var mod_protobuf = require("protobufjs");

const MAX_CTX = 50;
const nullfr = Buffer.from([]);

var g_ctx_next = 0,
    g_core_sock = mod_zmq.socket('dealer'),
    g_ctx = new Array( MAX_CTX ),
    g_msg_by_id = {},
    g_msg_by_name = {};


g_ctx.fill(null);


module.exports = function( app, opts ){
    console.log("communication module eval");

    function loadProto( proto_file, proto_enum_name, cb ){
        mod_protobuf.load( proto_file, function(err, root) {
            if ( err )
                throw err;

            if ( proto_enum_name ){
                var proto_enum = root.lookupEnum( proto_enum_name );
                if ( !proto_enum )
                    throw "Missing require 'Protocol' enum in " + proto_file + " file";
            
                processProtoFile( proto_enum );
            }

            if ( cb ){
                cb( root );
            }
        });
    }
    
    function connect( server_addr ){
        g_core_sock.connect( server_addr );
    }

    function sendMessage( a_msg_name, a_msg_data, a_req, a_resp, a_cb, a_anon ) {
        var client = a_req.session.uid;
        if ( !client ){
            console.log("NO AUTH :", a_msg_name, ":", a_req.connection.remoteAddress );
            throw "Not Authenticated";
        }
    
        a_resp.setHeader('Content-Type', 'application/json');
    
        allocRequestContext( a_resp, function( ctx ){
            var msg = g_msg_by_name[a_msg_name];
            if ( !msg )
                throw "Invalid message type: " + a_msg_name;
    
            var msg_buf = msg.encode(a_msg_data).finish();
            console.log( "snd msg, type:", msg._msg_type, ", len:", msg_buf.length );
    
            /* Frame contents (C++)
            uint32_t    size;       // Size of buffer
            uint8_t     proto_id;
            uint8_t     msg_id;
            uint16_t    isContext
            */
            var frame = Buffer.alloc(8);
            frame.writeUInt32BE( msg_buf.length, 0 );
            frame.writeUInt8( msg._pid, 4 );
            frame.writeUInt8( msg._mid, 5 );
            frame.writeUInt16BE( ctx, 6 );
    
            g_ctx[ctx] = function( a_reply ) {
                if ( !a_reply ) {
                    console.log("Error - reply handler: empty reply");
                    a_resp.status(500).send( "Empty reply" );
                } else if ( a_reply.errCode ) {
                    if ( a_reply.errMsg ) {
                        console.log("Error - reply handler:", a_reply.errMsg);
                        a_resp.status(500).send( a_reply.errMsg );
                    } else {
                        a_resp.status(500).send( "error code: " + a_reply.errCode );
                        console.log("Error - reply handler:", a_reply.errCode);
                    }
                } else {
                    a_cb( a_reply );
                }
            };
    
            if ( msg_buf.length )
                g_core_sock.send([ nullfr, frame, msg_buf, client ]);
            else
                g_core_sock.send([ nullfr, frame, client ]);
        });
    }
    
    function sendMessageDirect( a_msg_name, a_client, a_msg_data, a_cb ) {
        var msg = g_msg_by_name[a_msg_name];
        if ( !msg )
            throw "Invalid message type: " + a_msg_name;
    
        allocRequestContext( null, function( ctx ){
    
            var msg_buf = msg.encode(a_msg_data).finish();
    
            var frame = Buffer.alloc(8);
            frame.writeUInt32BE( msg_buf.length, 0 );
            frame.writeUInt8( msg._pid, 4 );
            frame.writeUInt8( msg._mid, 5 );
            frame.writeUInt16BE( ctx, 6 );
    
            g_ctx[ctx] = a_cb;
    
            if ( msg_buf.length )
                g_core_sock.send([ nullfr, frame, msg_buf, a_client ]);
            else
                g_core_sock.send([ nullfr, frame, a_client ]);
        });
    }
    
}

function processProtoFile( proto_enum ){
    /*
    Note: DataFed assigns numeric IDs to messages by the order they are defined in the .proto file.
    Message IDs (types) are created by combining the "ID" value of the "Protocol" enum with the
    index of each message as:

        ID << 8 | (index - 1)
    
    The index is reduced by 1 because the Protocol enum is included in the list of messages, but
    unwanted in the mapping. The resulting IDs are store in two global index objects (msg_by_id and
    msg_by_name)
    */

    var i,
        msg,
        msg_list = [],
        pid = proto_enum.values.ID;

    for ( i in proto_enum.parent.nested )
        msg_list.push( proto_enum.parent.nested[i] );

    for ( i = 1; i < msg_list.length; i++ ){
        msg = msg_list[i];
        msg._pid = pid;
        msg._mid = i-1;
        msg._msg_type = (pid << 8) | (i-1);

        //console.log(msg.name,msg._msg_type);

        g_msg_by_id[ msg._msg_type ] = msg;
        g_msg_by_name[ msg.name ] = msg;
    }
}


function allocRequestContext( a_resp, a_callback ) {
    var ctx = g_ctx_next;

    // At max ctx, must search for first free slot
    if ( ctx == MAX_CTX ) {
        ctx = g_ctx.indexOf( null );
        if ( ctx == -1 ) {
            console.log("ERROR: out of msg contexts!!!");
            if ( a_resp ) {
                console.log("SEND FAIL");
                a_resp.status( 503 );
                a_resp.send( "DataFed server busy." );
            }
        }
    }

    // Set next ctx value, or flag for search
    if ( ++g_ctx_next < MAX_CTX ) {
        if ( g_ctx[g_ctx_next] )
            g_ctx_next = MAX_CTX;
    }

    a_callback( ctx );
}

g_core_sock.on('message', function( delim, frame, msg_buf ) {
    //console.log( "got msg", delim, frame, msg_buf );
    //console.log( "frame", frame.toString('hex') );
    /*var mlen =*/ frame.readUInt32BE( 0 );
    var mtype = (frame.readUInt8( 4 ) << 8 ) | frame.readUInt8( 5 );
    var ctx = frame.readUInt16BE( 6 );

    //console.log( "got msg type:", mtype );
    //console.log( "client len:", client?client.length:0 );
    //console.log( "msg_buf len:", msg_buf?msg_buf.length:0 );
    //console.log( "len", mlen, "mtype", mtype, "ctx", ctx );

    var msg_class = g_msg_by_id[mtype];
    var msg;

    if ( msg_class ) {
        // Only try to decode if there is a payload
        if ( msg_buf && msg_buf.length ) {
            try {
                msg = msg_class.decode( msg_buf );
                if ( !msg )
                    console.log( "ERROR: msg decode failed: no reason" );
            } catch ( err ) {
                console.log( "ERROR: msg decode failed:", err );
            }
        } else {
            msg = msg_class;
        }
    } else {
        console.log( "ERROR: unknown msg type:", mtype );
    }

    var f = g_ctx[ctx];
    if ( f ) {
        g_ctx[ctx] = null;
        //console.log("freed ctx",ctx,"for msg",msg_class.name);
        g_ctx_next = ctx;
        f( msg );
    } else {
        console.log( "ERROR: no callback found for ctxt", ctx," - msg type:", mtype, ", name:", msg_class.name );
    }
});
