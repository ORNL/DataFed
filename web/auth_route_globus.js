const ClientOAuth2 = require('client-oauth2');

var oauth_credentials,
    globus_auth;


module.exports = function( app, opts ){
    console.log("opts",opts);

    oauth_credentials = {
        clientId: opts.globus_client_id,
        clientSecret: opts.globus_client_secret,
        authorizationUri: 'https://auth.globus.org/v2/oauth2/authorize',
        accessTokenUri: 'https://auth.globus.org/v2/oauth2/token',
        redirectUri: opts.extern_url + "/ui/authn",
        scopes: 'urn:globus:auth:scope:transfer.api.globus.org:all offline_access openid'
    };

    globus_auth = new ClientOAuth2( oauth_credentials );

    /* This is the "login/register" URL from welcome page.
    User should be unknown at this point (if session were valid, would be redirected to /ui/main).
    This is the beginning of the OAuth loop through Globus Auth and will redirect to /ui/authn
    */
    app.get('/ui/login', (a_req, a_resp) => {
        if ( a_req.session && a_req.session.uid && a_req.session.reg ){
            a_resp.redirect( '/ui/main' );
        } else {
            console.log( "GLOBUS AUTH login from", a_req.remoteAddress );
    
            a_resp.redirect( globus_auth.code.getUri() );
        }
    });

    app.get('/ui/logout', (a_req, a_resp) => {
        if ( a_req.session ){
            console.log( "User (", a_req.session.uid, ") from", a_req.remoteAddress, "logout" );
    
            a_req.session.destroy( function(){
                a_resp.clearCookie( 'connect.sid' );
                a_resp.redirect("https://auth.globus.org/v2/web/logout?redirect_name=DataFed&redirect_uri="+opts.extern_url);
            });
        }
    });
    
    /* This is the OAuth redirect URL after a user authenticates with Globus
    */
    app.get('/ui/authn', ( a_req, a_resp ) => {
        console.log( "Globus authenticated - logging in to DataFed" );

        /* This after Globus authentication. Loads Globus tokens and identity information.
        The user is then checked in DataFed and, if present redirected to the main page;
        otherwise, the client is sent to the new user registration page.
        */

        globus_auth.code.getToken( a_req.originalUrl ).then( function( client_token ) {
        
            // Get Globus transfer API tokens (access and refresh)
            var xfr_token = client_token.data.other_tokens[0];

            const opts = {
                hostname: 'auth.globus.org',
                method: 'POST',
                path: '/v2/oauth2/token/introspect',
                rejectUnauthorized: true,
                auth: oauth_credentials.clientId + ":" + oauth_credentials.clientSecret,
                headers:{
                    'Content-Type' : 'application/x-www-form-urlencoded',
                    'Accept' : 'application/json',
                }
            };

            // Request Globus user info - allowed for app due to granted scope(s)
            const req = https.request( opts, (res) => {
                var data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    //console.log('tok introspect done, data:', data );

                    if ( res.statusCode >= 200 && res.statusCode < 300 ){
                        var userinfo = JSON.parse( data ),
                            uid = userinfo.username.substr( 0, userinfo.username.indexOf( "@" ));

                        console.log( 'User', uid, 'authenticated, verifying DataFed account' );

                        sendMessageDirect( "UserFindByUUIDsRequest", "datafed-ws", { uuid: userinfo.identities_set }, function( reply ) {
                            if ( !reply  ) {
                                console.log( "Error - Find user call failed." );
                                a_resp.redirect( "/ui/error" );
                            } else if ( !reply.user || !reply.user.length ) {
                                // Not registered
                                console.log( "User", uid, "not registered" );

                                // Store all data need for registration in session (temporarily)
                                a_req.session.uid = uid;
                                a_req.session.name = userinfo.name;
                                a_req.session.email = userinfo.email;
                                a_req.session.uuids = userinfo.identities_set;
                                a_req.session.acc_tok = xfr_token.access_token;
                                a_req.session.acc_tok_ttl = xfr_token.expires_in;
                                a_req.session.ref_tok = xfr_token.refresh_token;

                                a_resp.redirect( "/ui/register" );
                            } else {
                                console.log( 'User', uid, 'verified, acc:', xfr_token.access_token, ", ref:", xfr_token.refresh_token, ", exp:", xfr_token.expires_in );

                                // Store only data needed for active session
                                a_req.session.uid = uid;
                                a_req.session.reg = true;

                                // Refresh Globus access & refresh tokens to Core/DB
                                setAccessToken( uid, xfr_token.access_token, xfr_token.refresh_token, xfr_token.expires_in );

                                // TODO Account may be disable from SDMS (active = false)
                                a_resp.redirect( "/ui/main" );
                            }
                        });
                    }else{
                        // TODO - Not sure this is required - req.on('error'...) should catch this?
                        console.log("Error: Globus introspection failed. User token:", xfr_token );
                        a_resp.redirect( "/ui/error" );
                    }
                });
            });

            req.on('error', (e) => {
                console.log("Error: Globus introspection failed. User token:", xfr_token );
                a_resp.redirect( "/ui/error" );
            });

            req.write( 'token=' + client_token.accessToken + '&include=identities_set' );
            req.end();
        }, function( reason ){
            console.log("Error: Globus get token failed. Reason:", reason );
            a_resp.redirect( "/ui/error" );
        });
    });

    /*
    This is the post-Globus registration page where user may enter a password before continuing to main
    */
    app.get('/ui/register', (a_req, a_resp) => {
        console.log("/ui/register");

        if ( !a_req.session.uid ){
            a_resp.redirect( '/' );
        } else if ( a_req.session.reg ){
            a_resp.redirect( '/ui/main' );
        } else {
            var theme = a_req.cookies['datafed-theme'] || "light";
            a_resp.render('auth_globus_register', { uid: a_req.session.uid, uname: a_req.session.name, theme: theme, version: opts.version, test_mode: opts.test_mode });
        }
    });

}
