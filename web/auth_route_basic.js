var comm = require('./comm.js');

module.exports=function(app, opts ){

    app.get('/ui/login', (a_req, a_resp) => {
        if ( a_req.session && a_req.session.uid && a_req.session.reg ){
            a_resp.redirect( '/ui/main' );
        } else {
            console.log( "User login BASIC AUTH", opts );

            var theme = a_req.cookies['datafed-theme'] || "light";
            a_resp.render( 'auth_basic_login',{ theme:theme, version:opts.version, test_mode:opts.test_mode });
        }
    });

    app.get('/ui/logout', (a_req, a_resp) => {
        if ( a_req.session ){
            console.log( "User (", a_req.session.uid, ") from", a_req.remoteAddress, "logout" );
    
            a_req.session.destroy( function(){
                a_resp.clearCookie( 'connect.sid' );
                a_resp.redirect("/");
            });
        }
    });

    app.get('/api/usr/login/basic', ( a_req, a_resp ) => {
        console.log("basic auth /api/usr/login", a_req.query.uid, a_req.query.pw );

        comm.sendMessageDirect( "AuthenticateByPasswordRequest", "", { uid: a_req.query.uid, password: a_req.query.pw }, function( reply ) {
            console.log("auth reply",reply,a_req.session);

            if ( reply.auth ){
                a_req.session.touch();
                a_req.session.uid = reply.uid;
                a_req.session.reg = true;
            }else{
                delete a_req.session.uid;
                delete a_req.session.reg;
            }

            a_resp.send( reply );
        });
    });
    
    // This fakes the Globus user authentication and sets up session params
    app.get('/api/usr/register/basic', ( a_req, a_resp ) => {
        console.log("/api/usr/register/basic",a_req.query.uid,a_req.query.name);

        // Store all data need for registration in session (temporarily)
        a_req.session.uid = a_req.query.uid;
        a_req.session.name = a_req.query.name;
        a_req.session.email = "junk";
        a_req.session.uuids = ["junk"];
        a_req.session.acc_tok = "junk";
        a_req.session.acc_tok_ttl = 100000;
        a_req.session.ref_tok = "junk";

        console.log("session uid:",a_req.session.uid);

        a_resp.send({});
    });
}
