var mod_zmq = require("zeromq");
var mod_protobuf = require("protobufjs");

const MAX_CTX = 50;
const nullfr = Buffer.from([]);


class CommClass
{
    #ctx_next = 0;
    #core_sock;
    #ctx;
    #msg_by_id = {};
    #msg_by_name = {};

    constructor() {
        this.#ctx = new Array( MAX_CTX );
        this.#ctx.fill(null);
        this.#core_sock = mod_zmq.socket('dealer');
        this.#core_sock.on('message', this.#socketRead.bind( this ));
    }

    connect( server_addr ){
        this.#core_sock.connect( server_addr );
    }

    sendMessage( a_msg_name, a_msg_data, a_req, a_resp, a_cb ) {
        console.log("sendMessage",a_msg_name);

        var client = a_req.session.uid,
            inst = this;

        if ( !client ){
            console.log("NO AUTH :", a_msg_name, ":", a_req.connection.remoteAddress );
            throw "Not Authenticated";
        }
    
        a_resp.setHeader('Content-Type', 'application/json');
    
        this.#allocRequestContext( a_resp, function( ctx ){
            var msg = inst.#msg_by_name[a_msg_name];
            if ( !msg )
                throw "Invalid message type: " + a_msg_name;
    
            var msg_buf = msg.encode(a_msg_data).finish();
            console.log( "snd msg, type:", msg._msg_type, ", len:", msg_buf.length );
    
            var frame = Buffer.alloc(8);
            frame.writeUInt32BE( msg_buf.length, 0 );
            frame.writeUInt8( msg._pid, 4 );
            frame.writeUInt8( msg._mid, 5 );
            frame.writeUInt16BE( ctx, 6 );
    
            inst.#ctx[ctx] = function( a_reply ) {
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
    
            if ( msg_buf.length ){
                inst.#core_sock.send([ nullfr, frame, msg_buf, client ]);
            }else{
                inst.#core_sock.send([ nullfr, frame, client ]);
            }
        });
    }
    
    sendMessageDirect( a_msg_name, a_client, a_msg_data, a_cb ) {
        var msg = this.#msg_by_name[a_msg_name],
            inst = this;

        if ( !msg )
            throw "Invalid message type: " + a_msg_name;
    
        this.#allocRequestContext( null, function( ctx ){
    
            var msg_buf = msg.encode(a_msg_data).finish();
    
            var frame = Buffer.alloc(8);
            frame.writeUInt32BE( msg_buf.length, 0 );
            frame.writeUInt8( msg._pid, 4 );
            frame.writeUInt8( msg._mid, 5 );
            frame.writeUInt16BE( ctx, 6 );
    
            inst.#ctx[ctx] = a_cb;
    
            if ( msg_buf.length ){
                inst.#core_sock.send([ nullfr, frame, msg_buf, a_client ]);
            }else{
                inst.#core_sock.send([ nullfr, frame, a_client ]);
            }
        });
    }
    
    loadProto( proto_file, proto_enum_name, cb ){
        var inst = this;

        mod_protobuf.load( proto_file, function(err, root) {
            if ( err )
                throw err;

            if ( proto_enum_name ){
                var proto_enum = root.lookupEnum( proto_enum_name );
                if ( !proto_enum )
                    throw "Missing required 'Protocol' enum in " + proto_file + " file";
            
                inst.#processProtoFile( proto_enum );
            }

            if ( cb ){
                cb( root );
            }
        });
    }

    #processProtoFile( proto_enum ){
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

            this.#msg_by_id[ msg._msg_type ] = msg;
            this.#msg_by_name[ msg.name ] = msg;
        }
    }


    #allocRequestContext( a_resp, a_callback ) {
        var ctx = this.#ctx_next;

        // At max ctx, must search for first free slot
        if ( ctx == MAX_CTX ) {
            ctx = this.#ctx.indexOf( null );
            if ( ctx == -1 ) {
                console.log("ERROR: out of msg contexts!!!");
                if ( a_resp ) {
                    console.log("SEND FAIL");
                    a_resp.status( 503 );
                    a_resp.send( "DataFed server busy." );
                }
            }
        }

        // Set next ctx value. If in use, flag for search
        if ( ++this.#ctx_next < MAX_CTX ) {
            if ( this.#ctx[this.#ctx_next] ){
                this.#ctx_next = MAX_CTX;
            }
        }

        a_callback( ctx );
    }

    #socketRead( delim, frame, msg_buf ) {
        //console.log( "got msg", delim, frame, msg_buf );
        //console.log( "frame", frame.toString('hex') );

        frame.readUInt32BE( 0 ); // Null frame

        var mtype = (frame.readUInt8( 4 ) << 8 ) | frame.readUInt8( 5 ),
            ctx = frame.readUInt16BE( 6 ),
            msg_class = this.#msg_by_id[mtype],
            msg;

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

        var f = this.#ctx[ctx];
        if ( f ) {
            this.#ctx[ctx] = null;
            //console.log("freed ctx",ctx,"for msg",msg_class.name);
            this.#ctx_next = ctx;
            f( msg );
        } else {
            console.log( "ERROR: no callback found for ctxt", ctx," - msg type:", mtype, ", name:", msg_class.name );
        }
    }
};


module.exports = new CommClass();
