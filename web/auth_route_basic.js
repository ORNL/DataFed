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
        console.log("basic auth /api/usr/login");

        sendMessage( "AuthenticateByPasswordRequest", { uid: a_req.query.uid, password: a_req.query.password }, a_req, a_resp, function( reply ) {
            if ( reply.authorized ){
                a_req.session.uid = uid;
                a_req.session.reg = true;
                a_req.session.save();

                a_resp.redirect( "/ui/main" );
            }else{
                var context = { type: "login", uid: a_req.query.uid, authorized: false };
                a_resp.render( 'auth_basic_login',{ theme:theme, version:opts.version, test_mode:opts.test_mode, context: context });
            }
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
