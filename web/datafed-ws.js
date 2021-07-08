#!/usr/bin/env node

'use strict';

/*
This is the DataFed web server that provides both the web portal application (/ui) and the web API (/api).
User authentication is provided by Globus Auth API, and session information is stored in TWO cookies:

- 'connect.sid' - The session cookie itself
- 'datafed-theme' - User's preferred theme

*/

if ( process.argv.length != 3 ){
    throw "Invalid arguments, usage: datafed-ws config-file";
}

const express = require('express'); // For REST api
var session = require('express-session');
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser'); // cookies for user state
var https = require('https');
const constants = require('crypto');
const helmet = require('helmet');
const fs = require('fs');
const ini = require('ini');
var protobuf = require("protobufjs");
var zmq = require("zeromq");
const app = express();
var ECT = require('ect'); // for html templates
var ectRenderer = ECT({ watch: true, root: __dirname + '/views', ext : '.ect' });
const ClientOAuth2 = require('client-oauth2');

const MAX_CTX = 50;

var g_host,
    g_port,
    g_server_key_file,
    g_server_cert_file,
    g_server_chain_file,
    g_server_secret,
    g_test,
    g_msg_by_id = {},
    g_msg_by_name = {},
    g_core_sock = zmq.socket('dealer'),
    g_core_serv_addr,
    g_globus_auth,
    g_oauth_credentials,
    g_ctx = new Array( MAX_CTX ),
    g_ctx_next = 0,
    g_client_id,
    g_client_secret,
    //g_cookie_opts = { httpOnly: true, maxAge: 604800000, secure: true, sameSite: "lax" },
    //g_cookie_ui_opts = { httpOnly: true, maxAge: 604800000, secure: true, sameSite: "lax", path: "/ui" },
    g_ready_start = 4,
    g_version,
    g_ver_major,
    g_ver_mapi_major,
    g_ver_mapi_minor,
    g_ver_web;

const nullfr = Buffer.from([]);

g_ctx.fill(null);


function startServer(){
    console.log( "  Host:", g_host );
    console.log( "  Port:", g_port );
    console.log( "  Server key file:", g_server_key_file );
    console.log( "  Server cert file:", g_server_cert_file );
    console.log( "  Server chain file:", g_server_chain_file );
    console.log( "  Server secret:", g_server_secret );
    console.log( "  Core server addr:", g_core_serv_addr );
    console.log( "  Client ID:", g_client_id );
    console.log( "  Client Secret:", g_client_secret );
    console.log( "  Test mode:", g_test );

    console.log( "Connecting to Core" );

    g_core_sock.connect( g_core_serv_addr );

    sendMessageDirect( "VersionRequest", "", {}, function( reply ) {
        if ( !reply ){
            console.log( "ERROR: No reply from core server" );
        }else if ( reply.major != g_ver_major || reply.mapiMajor != g_ver_mapi_major ||
                reply.mapi_minor < g_ver_mapi_minor || reply.mapi_minor > ( g_ver_mapi_minor + 9 )){
            console.log( "ERROR: Incompatible server version (" + reply.major + "." + reply.mapiMajor + "." + reply.mapiMinor + ")" );
        }else{
            if ( reply.web > g_ver_web || reply.mapi_minor > g_ver_mapi_minor ){
                console.log( "WARNING: A newer web server version is available (" + reply.major + "." + reply.mapiMajor + "." + reply.mapiMinor + ":" + reply.web + ")" );
            }

            g_oauth_credentials = {
                clientId: g_client_id,
                clientSecret: g_client_secret,
                authorizationUri: 'https://auth.globus.org/v2/oauth2/authorize',
                accessTokenUri: 'https://auth.globus.org/v2/oauth2/token',
                redirectUri: 'https://'+g_host+':'+g_port+'/ui/authn',
                scopes: 'urn:globus:auth:scope:transfer.api.globus.org:all offline_access openid'
            };
        
            g_globus_auth = new ClientOAuth2( g_oauth_credentials );

            var privateKey  = fs.readFileSync( g_server_key_file, 'utf8');
            var certificate = fs.readFileSync( g_server_cert_file, 'utf8');
            var chain;
            if ( g_server_chain_file ){
                chain = fs.readFileSync( g_server_chain_file, 'utf8');
            }

            console.log( "Starting web server" );

            var httpsServer = https.createServer({
                key: privateKey,
                cert: certificate,
                ca: chain,
                secureOptions: constants.SSL_OP_NO_SSLv2 | constants.SSL_OP_NO_SSLv3 
            }, app );
            httpsServer.listen( g_port );
        }
    });
}

loadSettings();

express.static.mime.define({'application/javascript': ['js']});

app.use( express.static( __dirname + '/static' ));
// body size limit = 100*max metadata size, which is 100 Kb
app.use( bodyParser.json({ type: 'application/json', limit: '1048576'}));
app.use( bodyParser.text({ type: 'text/plain', limit: '1048576'}));
// Setup session management and cookie settings
app.use( session({
    secret: g_server_secret,
    resave: false,
    rolling: true,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        maxAge: 604800000,
        secure: true,
        sameSite: "lax"
    }
}));

app.use( cookieParser( g_server_secret ));
app.use( helmet({ hsts: { maxAge: 31536000 }}));
app.use( function( req, res, next ){
    res.setHeader('Content-Language','en-US');
    next();
});
app.set( 'view engine', 'ect' );
app.engine( 'ect', ectRenderer.render );


app.get('/', (a_req, a_resp) => {
    if ( a_req.session.uid && a_req.session.reg )
        a_resp.redirect( '/ui/main' );
    else{
        a_resp.redirect( '/ui/welcome' );
    }
});

app.get('/ui/welcome', (a_req, a_resp) => {
    if ( a_req.session.uid && a_req.session.reg )
        a_resp.redirect( '/ui/main' );
    else{
        console.log("Access welcome from", a_req.connection.remoteAddress );

        var theme = a_req.cookies['datafed-theme']|| "light";
        console.log("Theme:",theme);
        a_resp.render('index',{theme:theme,version:g_version,test_mode:g_test});
    }
});

app.get('/ui/main', (a_req, a_resp) => {
    if ( a_req.session.uid && a_req.session.reg ){
        console.log( "Access main (", a_req.session.uid, ") from", a_req.connection.remoteAddress );

        var theme = a_req.cookies['datafed-theme'] || "light";
        a_resp.render( 'main',{user_uid:a_req.session.uid,theme:theme,version:g_version,test_mode:g_test});
    }else{
        // datafed-user cookie not set, so clear datafed-id before redirect
        //a_resp.clearCookie( 'datafed-id' );
        a_resp.redirect( '/' );
    }
});

/* This is the post-Globus registration page where user may enter a password before continuing to main
*/
app.get('/ui/register', (a_req, a_resp) => {
    if ( !a_req.session.uid ){
        a_resp.redirect( '/' );
    } else if ( a_req.session.reg ){
        a_resp.redirect( '/ui/main' );
    } else {
        console.log( "Registration access (", a_req.session.uid, ") from", a_req.connection.remoteAddress );

        var theme = a_req.cookies['datafed-theme'] || "light";
        //a_req.session.name = userinfo.name;
        //a_req.session.email = userinfo.email;
        //a_req.session.uuids = userinfo.identities_set;
        //a_req.session.acc_tok = xfr_token.access_token;
        //a_req.session.ref_tok = xfr_token.refresh_token;
        //a_req.session.redirect = a_redirect_url;

        a_resp.render('register', { uid: a_req.session.uid, uname: a_req.session.name, theme: theme, version: g_version, test_mode: g_test });
    }
});

/* This is the "login/register" URL from welcome page.
User should be unknown at this point (if session were valid, would be redirected to /ui/main).
This is the beginning of the OAuth loop through Globus Auth and will redirect to /ui/authn
*/
app.get('/ui/login', (a_req, a_resp) => {
    if ( a_req.session.uid && a_req.session.reg ){
        a_resp.redirect( '/ui/main' );
    } else {
        console.log( "User (", a_req.session.uid, ") from", a_req.connection.remoteAddress, "log-in" );

        var uri = g_globus_auth.code.getUri();
        a_resp.redirect(uri);
    }
});


app.get('/ui/logout', (a_req, a_resp) => {
    console.log( "User (", a_req.session.uid, ") from", a_req.connection.remoteAddress, "logout" );

    //a_resp.clearCookie( 'datafed-id' );
    //a_resp.clearCookie( 'datafed-user', { path: "/ui" } );
    a_req.session.destroy( function(){
        a_resp.clearCookie( 'connect.sid' );
        a_resp.redirect("https://auth.globus.org/v2/web/logout?redirect_name=DataFed&redirect_uri=https://"+g_host);
    });
});

app.get('/ui/error', (a_req, a_resp) => {
    a_resp.render('error',{theme:"light",version:g_version,test_mode:g_test});
});

/* This is the OAuth redirect URL after a user authenticates with Globus
*/
app.get('/ui/authn', ( a_req, a_resp ) => {
    if ( a_req.session.uid && a_req.session.reg ){
        a_resp.redirect( '/ui/main' );
    } else {
        console.log( "Globus authenticated - log in to DataFed" );

        doLogin( a_req, a_resp, g_globus_auth, "/ui/main" );
    }
});


/* This function is called after Globus authentication and loads Globus tokens and identity information.
The user is then checked in DataFed and, if present redirected to the main page; otherwise, sent to
the registration page.
*/
function doLogin( a_req, a_resp, a_auth, a_redirect_url ){
    // Ask Globus for client token (Globus knows user somehow - cookies?)
    a_auth.code.getToken( a_req.originalUrl ).then( function( client_token ) {
        var xfr_token = client_token.data.other_tokens[0];

        const opts = {
            hostname: 'auth.globus.org',
            method: 'POST',
            path: '/v2/oauth2/token/introspect',
            rejectUnauthorized: true,
            auth: g_oauth_credentials.clientId + ":" + g_oauth_credentials.clientSecret,
            headers:{
                'Content-Type' : 'application/x-www-form-urlencoded',
                'Accept' : 'application/json',
            }
        };

        // Request user info from token
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
                        /*user_ck = {
                            uid: userinfo.username.substr( 0, userinfo.username.indexOf( "@" )),
                            name: userinfo.name,
                            email: userinfo.email,
                            uuids: userinfo.identities_set
                        };*/

                    // Verify datafed is in audience

                    console.log( 'User', uid, 'authenticated, verifying DataFed account' );


                    sendMessageDirect( "UserFindByUUIDsRequest", "sdms-ws", { uuid: userinfo.identities_set }, function( reply ) {
                        if ( !reply  ) {
                            console.log( "Error - Find user call failed." );
                            //a_resp.clearCookie( 'datafed-id' );
                            //a_resp.clearCookie( 'datafed-user', { path: "/ui" } );
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
                            a_req.session.redirect = a_redirect_url;

                            a_resp.redirect( "/ui/register" );
                        } else {
                            console.log( 'User', uid, 'verified, acc:', xfr_token.access_token, ", ref:", xfr_token.refresh_token, ", exp:", xfr_token.expires_in );

                            // Store only data needed for active session
                            a_req.session.uid = uid;
                            a_req.session.reg = true;

                            // Refresh Globus access & refresh tokens to Core/DB
                            setAccessToken( uid, xfr_token.access_token, xfr_token.refresh_token, xfr_token.expires_in );

                            // TODO Account may be disable from SDMS (active = false)

                            a_resp.redirect( a_redirect_url );
                        }
                    });
                }else{
                    // TODO - Not sure this is required - req.on('error'...) should catch this?
                    console.log("Error: Globus introspection failed. User token:", xfr_token );
                    //a_resp.clearCookie( 'datafed-id' );
                    //a_resp.clearCookie( 'datafed-user', { path: "/ui" } );
                    a_resp.redirect( "/ui/error" );
                }
            });
        });
          
        req.on('error', (e) => {
            console.log("Error: Globus introspection failed. User token:", xfr_token );
            //a_resp.clearCookie( 'datafed-id' );
            //a_resp.clearCookie( 'datafed-user', { path: "/ui" } );
            a_resp.redirect( "/ui/error" );
        });

        req.write( 'token=' + client_token.accessToken + '&include=identities_set' );
        req.end();
    }, function( reason ){
        console.log("Error: Globus get token failed. Reason:", reason );
        //a_resp.clearCookie( 'datafed-id' );
        //a_resp.clearCookie( 'datafed-user', { path: "/ui" } );
        a_resp.redirect( "/ui/error" );
    });
}


app.get('/ui/do_register', ( a_req, a_resp ) => {
    if ( a_req.session.uid && a_req.session.reg ){
        a_resp.redirect( '/ui/main' );
    } else {
        console.log( 'Registering user', a_req.session.uid );

        sendMessageDirect( "UserCreateRequest", "sdms", { uid: a_req.session.uid, password: a_req.query.pw, name: a_req.session.name, email: a_req.session.email, uuid: a_req.session.uuids }, function( reply ) {
            if ( !reply ) {
                console.log( "Error - User create failed: empty reply" );
                a_resp.status(500).send( "Error - User create failed (server did not respond)" );
            } else if ( reply.errCode ) {
                if ( reply.errMsg ) {
                    console.log( "Error - User create failed:", reply.errMsg );
                    a_resp.status(500).send( "Error - User create failed: " + reply.errMsg );
                } else {
                    a_resp.status(500).send( "Error - User create failed: " + reply.errCode );
                    console.log("Error - User create failed: ", reply.errCode);
                }
            } else {
                // Save access token
                setAccessToken( a_req.session.uid, a_req.session.acc_tok, a_req.session.ref_tok, a_req.session.acc_tok_ttl );

                // Set session as registered user
                a_req.session.reg = true;

                // Remove data not needed for active session
                delete a_req.session.name;
                delete a_req.session.email;
                delete a_req.session.uuids;
                delete a_req.session.acc_tok;
                delete a_req.session.acc_tok_ttl;
                delete a_req.session.ref_tok;
                delete a_req.session.uuids;
    
                a_resp.redirect( a_req.session.redirect );
            }
        });
    }
});

app.get('/api/usr/find/by_uuids', ( a_req, a_resp ) => {
    sendMessage( "UserFindByUUIDsRequest", { uuid: a_req.query.uuids }, a_req, a_resp, function( reply ) {
        a_resp.json( reply.user[0] );
    });
});

app.get('/api/usr/find/by_name_uid', ( a_req, a_resp ) => {
    var par = {nameUid: a_req.query.name_uid};
    if ( a_req.query.offset != undefined && a_req.query.count != undefined ){
        par.offset = a_req.query.offset;
        par.count = a_req.query.count;
    }

    sendMessage( "UserFindByNameUIDRequest", par, a_req, a_resp, function( reply ) {
        a_resp.send( reply );
    });
});

app.get('/api/usr/view', ( a_req, a_resp ) => {
    //console.log("/usr/view:",a_req.query.id);
    sendMessage( "UserViewRequest", { uid: a_req.query.id, details:(a_req.query.details=="true"?true:false)}, a_req, a_resp, function( reply ) {
        a_resp.json( reply.user[0] );
    });
});

app.get('/api/usr/update', ( a_req, a_resp ) => {
    var params = { uid: a_req.query.uid };
    if ( a_req.query.email != undefined )
        params.email = a_req.query.email;
    if ( a_req.query.pw != undefined )
        params.password = a_req.query.pw;
    if ( a_req.query.opts != undefined ){
        params.options = a_req.query.opts;
    }

    sendMessage( "UserUpdateRequest", params, a_req, a_resp, function( reply ) {
        a_resp.json( reply.user[0] );
    });
});

app.get('/api/usr/revoke_cred', ( a_req, a_resp ) => {
    //console.log("/api/usr/revoke_cred");
    sendMessage( "RevokeCredentialsRequest", {}, a_req, a_resp, function( reply ) {
        a_resp.json({});
    });
});

app.get('/api/usr/list/all', ( a_req, a_resp ) => {
    var par = {};
    if ( a_req.query.offset != undefined && a_req.query.count != undefined ){
        par.offset = a_req.query.offset;
        par.count = a_req.query.count;
    }

    sendMessage( "UserListAllRequest", par, a_req, a_resp, function( reply ) {
        a_resp.json(reply);
    });
});

app.get('/api/usr/list/collab', ( a_req, a_resp ) => {
    var par = {};
    if ( a_req.query.offset != undefined && a_req.query.count != undefined ){
        par.offset = a_req.query.offset;
        par.count = a_req.query.count;
    }

    sendMessage( "UserListCollabRequest", par, a_req, a_resp, function( reply ) {
        a_resp.json(reply);
    });
});

app.post('/api/prj/create', ( a_req, a_resp ) => {
    sendMessage( "ProjectCreateRequest", a_req.body, a_req, a_resp, function( reply ) {
        if ( reply.proj )
            a_resp.send(reply.proj);
        else
            a_resp.send([]);
    });
});

app.post('/api/prj/update', ( a_req, a_resp ) => {
    sendMessage( "ProjectUpdateRequest", a_req.body, a_req, a_resp, function( reply ) {
        if ( reply.proj )
            a_resp.send(reply.proj);
        else
            a_resp.send([]);
    });
});

app.get('/api/prj/delete', ( a_req, a_resp ) => {
    sendMessage( "ProjectDeleteRequest", { id: JSON.parse(a_req.query.ids)}, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/prj/view', ( a_req, a_resp ) => {
    sendMessage( "ProjectViewRequest", { id: a_req.query.id }, a_req, a_resp, function( reply ) {
        if ( reply.proj && reply.proj.length )
            a_resp.send(reply.proj[0]);
        else
            a_resp.send();
    });
});

app.get('/api/prj/list', ( a_req, a_resp ) => {
    var params = {};
    if ( a_req.query.owner != undefined )
        params.asOwner = a_req.query.owner=="true"?true:false;
    if ( a_req.query.admin != undefined )
        params.asAdmin = a_req.query.admin=="true"?true:false;
    if ( a_req.query.member != undefined )
        params.asMember = a_req.query.member=="true"?true:false;
    if ( a_req.query.sort != undefined )
        params.sort = a_req.query.sort;
    if ( a_req.query.offset != undefined && a_req.query.count != undefined ){
        params.offset = a_req.query.offset;
        params.count = a_req.query.count;
    }
    
    //console.log("proj list:",params);
    sendMessage( "ProjectListRequest", params, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.post('/api/prj/search', ( a_req, a_resp ) => {
    //console.log("search:",a_req.body);
    sendMessage( "ProjectSearchRequest", a_req.body, a_req, a_resp, function( reply ) {
        a_resp.send(reply.item?reply.item:[]);
    });
});

app.get('/api/grp/create', ( a_req, a_resp ) => {
    var params  = {
        group: {
            uid: a_req.query.uid,
            gid: a_req.query.gid,
        }
    };

    if ( a_req.query.title != undefined )
        params.group.title = a_req.query.title;
    if ( a_req.query.desc != undefined )
        params.group.desc = a_req.query.desc;
    if ( a_req.query.member != undefined )
        params.group.member = JSON.parse( a_req.query.member );

    sendMessage( "GroupCreateRequest", params, a_req, a_resp, function( reply ) {
        a_resp.send(reply.group[0]);
    });
});

app.get('/api/grp/update', ( a_req, a_resp ) => {
    var params  = {
        uid: a_req.query.uid,
        gid: a_req.query.gid
    };

    if ( a_req.query.title != undefined )
        params.title = a_req.query.title;
    if ( a_req.query.desc != undefined )
        params.desc = a_req.query.desc;
    if ( a_req.query.add != undefined )
        params.addUid = JSON.parse( a_req.query.add );
    if ( a_req.query.rem != undefined )
        params.remUid = JSON.parse( a_req.query.rem );

    sendMessage( "GroupUpdateRequest", params, a_req, a_resp, function( reply ) {
        a_resp.send(reply.group[0]);
    });
});

app.get('/api/grp/view', ( a_req, a_resp ) => {
    sendMessage( "GroupViewRequest", { uid: a_req.query.uid, gid: a_req.query.gid }, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/grp/list', ( a_req, a_resp ) => {
    sendMessage( "GroupListRequest", { uid: a_req.query.uid }, a_req, a_resp, function( reply ) {
        a_resp.send(reply.group?reply.group:[]);
    });
});

app.get('/api/grp/delete', ( a_req, a_resp ) => {
    sendMessage( "GroupDeleteRequest", { uid: a_req.query.uid, gid: a_req.query.gid }, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

/*
app.get('/api/dat/search', ( a_req, a_resp ) => {
    sendMessage( "RecordSearchRequest", { query: a_req.query.query, scope: a_req.query.scope }, a_req, a_resp, function( reply ) {
        a_resp.send(reply.item?reply.item:[]);
    });
});
*/

app.get('/api/query/list', ( a_req, a_resp ) => {
    var par = {};
    if ( a_req.query.offset != undefined && a_req.query.count != undefined ){
        par.offset = a_req.query.offset;
        par.count = a_req.query.count;
    }

    sendMessage( "QueryListRequest", par, a_req, a_resp, function( reply ) {
        a_resp.send(reply.item?reply.item:[]);
    });
});


app.post('/api/query/create', ( a_req, a_resp ) => {
    console.log("save:",a_req.body);
    sendMessage( "QueryCreateRequest", {title: a_req.query.title, query: a_req.body }, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.post('/api/query/update', ( a_req, a_resp ) => {
    var params = {id:a_req.query.id};
    if ( a_req.query.title )
        params.title = a_req.query.title;
    if ( a_req.body )
        params.query = a_req.body;

    //console.log("'/api/query/update, params=[",params,"]");

    sendMessage( "QueryUpdateRequest", params, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/query/delete', ( a_req, a_resp ) => {
    sendMessage( "QueryDeleteRequest", { id: JSON.parse(a_req.query.ids)}, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/query/view', ( a_req, a_resp ) => {
    sendMessage( "QueryViewRequest", {id:a_req.query.id}, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/query/exec', ( a_req, a_resp ) => {
    //console.log("search:",a_req.body);
    sendMessage( "QueryExecRequest", {id:a_req.query.id}, a_req, a_resp, function( reply ) {
        //console.log("qry exec res:",reply);
        a_resp.send(reply);
    });
});


app.post('/api/dat/search', ( a_req, a_resp ) => {
    console.log("search:",a_req.body);
    //var msg = g_msg_by_name["SearchRequest"];
    //var msg_buf = msg.encode(JSON.stringify( a_req.body )).finish();
    //var msg2 = msg.decode( msg_buf );
    //console.log("msg2",msg2);

    sendMessage( "SearchRequest", a_req.body, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.post('/api/dat/create', ( a_req, a_resp ) => {
    sendMessage( "RecordCreateRequest", a_req.body, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.post('/api/dat/create/batch', ( a_req, a_resp ) => {
    //console.log( "dat create batch", a_req.headers['content-type'], typeof a_req.body );
    sendMessage( "RecordCreateBatchRequest", {records:a_req.body}, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.post('/api/dat/update', ( a_req, a_resp ) => {
    //console.log( "dat update", a_req.body );
    sendMessage( "RecordUpdateRequest", a_req.body, a_req, a_resp, function( reply ) {
        if ( reply.data && reply.data.length ){
            console.log( "User", a_req.session.uid, "- data update, id:", reply.data[0].id );
        }
        a_resp.send(reply);
    });
});

app.post('/api/dat/update/batch', ( a_req, a_resp ) => {
    //console.log( "dat update batch", a_req.headers['content-type'], typeof a_req.body );
    sendMessage( "RecordUpdateBatchRequest", {records:a_req.body}, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/dat/lock', ( a_req, a_resp ) => {
    //console.log("/dat/lock, lock:",a_req.query.lock);
    sendMessage( "RecordLockRequest", { id: JSON.parse(a_req.query.ids), lock: a_req.query.lock=="true"?true:false}, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/dat/lock/toggle', ( a_req, a_resp ) => {
    sendMessage( "RecordLockToggleRequest", { id: a_req.query.id }, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/dat/copy', ( a_req, a_resp ) => {
    var params  = {
        sourceId: a_req.query.src,
        destId: a_req.query.dst
    };

    sendMessage( "DataCopyRequest", params, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/dat/delete', ( a_req, a_resp ) => {
    //console.log("/dat/delete",a_req.query.ids);
    sendMessage( "RecordDeleteRequest", { id: JSON.parse(a_req.query.ids) }, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/dat/view', ( a_req, a_resp ) => {
    sendMessage( "RecordViewRequest", { id: a_req.query.id }, a_req, a_resp, function( reply ) {
        if ( reply.data && reply.data.length )
            a_resp.send( reply );
        else
            a_resp.send();
    });
});

app.get('/api/dat/export', ( a_req, a_resp ) => {
    sendMessage( "RecordExportRequest", { id: JSON.parse( a_req.query.ids )}, a_req, a_resp, function( reply ) {
        a_resp.send( reply );
    });
});

app.get('/api/dat/list/by_alloc', ( a_req, a_resp ) => {
    var par  = {
        repo: a_req.query.repo,
        subject: a_req.query.subject
    };
    if ( a_req.query.offset != undefined && a_req.query.count != undefined ){
        par.offset = a_req.query.offset;
        par.count = a_req.query.count;
    }

    sendMessage( "RecordListByAllocRequest", par, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/dat/get', ( a_req, a_resp ) => {
    //console.log("data get",a_req.query);

    var par = { id: JSON.parse( a_req.query.id )};

    if ( a_req.query.path )
        par.path = a_req.query.path;

    if ( a_req.query.encrypt != undefined )
        par.encrypt = a_req.query.encrypt;

    if ( a_req.query.orig_fname )
        par.origFname = true;

    if ( a_req.query.check )
        par.check = a_req.query.check;

    sendMessage( "DataGetRequest", par, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/dat/put', ( a_req, a_resp ) => {
    var par = { id: a_req.query.id };

    if ( a_req.query.path )
        par.path = a_req.query.path;

    if ( a_req.query.encrypt != undefined )
        par.encrypt = a_req.query.encrypt;

    if ( a_req.query.ext )
        par.ext = a_req.query.ext;

    if ( a_req.query.check )
        par.check = a_req.query.check;

    sendMessage( "DataPutRequest", par, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/dat/dep/get', ( a_req, a_resp ) => {
    sendMessage( "RecordGetDependenciesRequest", { id: a_req.query.ids }, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/dat/dep/graph/get', ( a_req, a_resp ) => {
    sendMessage( "RecordGetDependencyGraphRequest", { id: a_req.query.id }, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/dat/alloc_chg', ( a_req, a_resp ) => {
    //console.log('/api/dat/alloc_chg');

    var params = { id: JSON.parse(a_req.query.id) };
    if ( a_req.query.repo_id )
        params.repoId = a_req.query.repo_id;
    if ( a_req.query.proj_id )
        params.projId = a_req.query.proj_id;
    if ( a_req.query.check )
        params.check = true;

    sendMessage( "RecordAllocChangeRequest", params, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/dat/owner_chg', ( a_req, a_resp ) => {
    //console.log('/api/dat/owner_chg',a_req.query);
    var params = { id: JSON.parse(a_req.query.id), collId: a_req.query.coll_id };
    if ( a_req.query.repo_id )
        params.repoId = a_req.query.repo_id;
    if ( a_req.query.proj_id )
        params.projId = a_req.query.proj_id;
    if ( a_req.query.check )
        params.check = true;

    //console.log('/api/dat/owner_chg params:',params);

    sendMessage( "RecordOwnerChangeRequest", params, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.post('/api/metadata/validate', ( a_req, a_resp ) => {
    //console.log( "md val", a_req.body );
    sendMessage( "MetadataValidateRequest", a_req.body, a_req, a_resp, function( reply ) {
        //console.log("rec update:",reply);
        a_resp.send(reply);
    });
});

app.get('/api/doi/view', ( a_req, a_resp ) => {
    //console.log("DOI:",a_req.query.doi);
    sendMessage( "DOIViewRequest", { doi: a_req.query.doi }, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    }, true );
});

app.get('/api/perms/check', ( a_req, a_resp ) => {
    var params = { id: a_req.query.id };
    if ( a_req.query.perms != undefined )
        params.perms = a_req.query.perms;
    if ( a_req.query.any != undefined )
        params.any = a_req.query.any;
    sendMessage( "CheckPermsRequest", params, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/perms/get', ( a_req, a_resp ) => {
    var params = { id: a_req.query.id };
    if ( a_req.query.perms != undefined )
        params.perms = a_req.query.perms;
    sendMessage( "GetPermsRequest", params, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/acl/view', ( a_req, a_resp ) => {
    sendMessage( "ACLViewRequest", { id: a_req.query.id }, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/acl/update', ( a_req, a_resp ) => {
    sendMessage( "ACLUpdateRequest", { id: a_req.query.id, rules: a_req.query.rules }, a_req, a_resp, function( reply ) {
        if ( reply.rule && reply.rule.length ){
            console.log( "User", a_req.session.uid, "- ACL update, id:", a_req.query.id, a_req.query.rules );
        }
        a_resp.send(reply);
    });
});

app.get('/api/acl/shared/list', ( a_req, a_resp ) => {
    sendMessage( "ACLSharedListRequest", {incUsers:a_req.query.inc_users?true:false,incProjects:a_req.query.inc_projects?true:false}, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/acl/shared/list/items', ( a_req, a_resp ) => {
    sendMessage( "ACLSharedListItemsRequest", {owner:a_req.query.owner}, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

/*
app.get('/api/acl/by_user', ( a_req, a_resp ) => {
    sendMessage( "ACLByUserRequest", {}, a_req, a_resp, function( reply ) {
        if ( reply.user )
            a_resp.send(reply.user);
        else
            a_resp.send([]);
    });
});

app.get('/api/acl/by_user/list', ( a_req, a_resp ) => {
    sendMessage( "ACLByUserListRequest", {owner:a_req.query.owner}, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/acl/by_proj', ( a_req, a_resp ) => {
    sendMessage( "ACLByProjRequest", {}, a_req, a_resp, function( reply ) {
        if ( reply.proj )
            a_resp.send(reply.proj);
        else
            a_resp.send([]);
    });
});

app.get('/api/acl/by_proj/list', ( a_req, a_resp ) => {
    sendMessage( "ACLByProjListRequest", {owner:a_req.query.owner}, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});
*/

app.get('/api/note/create', ( a_req, a_resp ) => {
    var params  = {
        type: a_req.query.type,
        subject: a_req.query.subject,
        title: a_req.query.title,
        comment: a_req.query.comment,
        activate: a_req.query.activate
    };

    //console.log("note create",params)
    sendMessage( "NoteCreateRequest", params, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/note/update', ( a_req, a_resp ) => {
    var params  = {
        id: a_req.query.id,
        comment: a_req.query.comment,
    };

    if ( a_req.query.new_type )
        params.newType = a_req.query.new_type;

    if ( a_req.query.new_state )
        params.newState = a_req.query.new_state;

    if ( a_req.query.new_title )
        params.newTitle = a_req.query.new_title;

    sendMessage( "NoteUpdateRequest", params, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/note/comment/edit', ( a_req, a_resp ) => {
    var params  = {
        id: a_req.query.id,
        comment: a_req.query.comment,
        commentIdx: a_req.query.comment_idx
    };

    sendMessage( "NoteCommentEditRequest", params, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/note/view', ( a_req, a_resp ) => {
    sendMessage( "NoteViewRequest", { id:a_req.query.id}, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/note/list/by_subject', ( a_req, a_resp ) => {
    sendMessage( "NoteListBySubjectRequest", { subject:a_req.query.subject}, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/tag/search', ( a_req, a_resp ) => {
    var par = { name: a_req.query.name };
    if ( a_req.query.offset != undefined && a_req.query.count != undefined ){
        par.offset = a_req.query.offset;
        par.count = a_req.query.count;
    }

    sendMessage( "TagSearchRequest", par, a_req, a_resp, function( reply ) {
        a_resp.json(reply);
    });
});

app.get('/api/tag/autocomp', ( a_req, a_resp ) => {
    var par = { name: a_req.query.term, offset: 0, count: 20 };

    sendMessage( "TagSearchRequest", par, a_req, a_resp, function( reply ) {
        var res = [], tag;
        if ( reply.tag ){
            for ( var i in reply.tag ){
                tag = reply.tag[i];
                res.push({ value: tag.name, label: tag.name + " (" + tag.count + ")" });
            }
        }

        a_resp.json( res );
    });
});

// TODO This doesn't seem to be used anymore
app.get('/api/tag/list/by_count', ( a_req, a_resp ) => {
    var par = {};
    if ( a_req.query.offset != undefined && a_req.query.count != undefined ){
        par.offset = a_req.query.offset;
        par.count = a_req.query.count;
    }

    sendMessage( "TagListByCountRequest", par, a_req, a_resp, function( reply ) {
        a_resp.json(reply);
    });
});

app.get('/api/task/list', ( a_req, a_resp ) => {
    var params = {};
    if ( a_req.query.since )
        params.since = a_req.query.since;
    sendMessage( "TaskListRequest", params, a_req, a_resp, function( reply ) {
        a_resp.json(reply);
    });
});

app.get('/api/task/view', ( a_req, a_resp ) => {
    //console.log("task/view", a_req.query.id );
    sendMessage( "TaskViewRequest", {"taskId":a_req.query.id}, a_req, a_resp, function( reply ) {
        a_resp.json(reply);
    });
});

app.post('/api/col/create', ( a_req, a_resp ) => {
    sendMessage( "CollCreateRequest", a_req.body, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.post('/api/col/update', ( a_req, a_resp ) => {
    //console.log("col update:",a_req.body);
    sendMessage( "CollUpdateRequest", a_req.body, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/col/delete', ( a_req, a_resp ) => {
    sendMessage( "CollDeleteRequest", { id: JSON.parse(a_req.query.ids)}, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/col/view', ( a_req, a_resp ) => {
    sendMessage( "CollViewRequest", { id: a_req.query.id }, a_req, a_resp, function( reply ) {
        if ( reply.coll && reply.coll.length ){
            a_resp.send(reply.coll[0]);
        }else{
            a_resp.send();
        }
    });
});

app.get('/api/col/read', ( a_req, a_resp ) => {
    var par = { id: a_req.query.id };
    if ( a_req.query.offset != undefined && a_req.query.count != undefined ){
        par.offset = a_req.query.offset;
        par.count = a_req.query.count;
    }
    //console.log("Coll Read",a_req.query.id);
    sendMessage( "CollReadRequest", par, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/col/get_parents', ( a_req, a_resp ) => {
    sendMessage( "CollGetParentsRequest", { id: a_req.query.id }, a_req, a_resp, function( reply ) {
        //console.log("get_parents",reply);
        a_resp.send(reply);
    });
});

app.get('/api/col/get_offset', ( a_req, a_resp ) => {
    sendMessage( "CollGetOffsetRequest", { id: a_req.query.id, item: a_req.query.item_id, pageSz: a_req.query.page_sz}, a_req, a_resp, function( reply ) {
        //console.log("get_offset - cb",a_req.query.id, a_req.query.item_id, a_req.query.page_sz);
        a_resp.send(reply);
    });
});

app.get('/api/col/move', ( a_req, a_resp ) => {
    //console.log("move items:",a_req.query.items,"src:",a_req.query.src_id,"dst:",a_req.query.dst_id);
    sendMessage( "CollMoveRequest", { srcId: a_req.query.src_id, dstId: a_req.query.dst_id, item: JSON.parse(a_req.query.items) }, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/col/link', ( a_req, a_resp ) => {
    sendMessage( "CollWriteRequest", { id: a_req.query.coll, add: JSON.parse(a_req.query.items) }, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/col/unlink', ( a_req, a_resp ) => {
    sendMessage( "CollWriteRequest", { id: a_req.query.coll, rem: JSON.parse(a_req.query.items) }, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/col/published/list', ( a_req, a_resp ) => {
    var par = { subject: a_req.query.subject };
    if ( a_req.query.offset != undefined && a_req.query.count != undefined ){
        par.offset = a_req.query.offset;
        par.count = a_req.query.count;
    }

    sendMessage( "CollListPublishedRequest", par, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});


app.post('/api/cat/search', ( a_req, a_resp ) => {
    sendMessage( "CatalogSearchRequest", a_req.body, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});


app.post('/api/col/pub/search/data', ( a_req, a_resp ) => {
    sendMessage( "RecordSearchPublishedRequest", a_req.body, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});


app.get('/api/repo/list', ( a_req, a_resp ) => {
    var params = {};
    if ( a_req.query.all )
        params.all = a_req.query.all;
    if ( a_req.query.details )
        params.details = a_req.query.details;
    sendMessage( "RepoListRequest", params, a_req, a_resp, function( reply ) {
        a_resp.json(reply.repo?reply.repo:[]);
    });
});

app.get('/api/repo/view', ( a_req, a_resp ) => {
    sendMessage( "RepoViewRequest", {id:a_req.query.id}, a_req, a_resp, function( reply ) {
        a_resp.json(reply.repo?reply.repo:[]);
    });
});

app.post('/api/repo/create', ( a_req, a_resp ) => {
    sendMessage( "RepoCreateRequest", a_req.body, a_req, a_resp, function( reply ) {
        a_resp.json({});
    });
});

app.post('/api/repo/update', ( a_req, a_resp ) => {
    sendMessage( "RepoUpdateRequest", a_req.body, a_req, a_resp, function( reply ) {
        a_resp.json({});
    });
});

app.get('/api/repo/delete', ( a_req, a_resp ) => {
    //console.log("repo del, id",a_req.query.id);
    sendMessage( "RepoDeleteRequest", {id:a_req.query.id}, a_req, a_resp, function( reply ) {
        a_resp.json({});
    });
});

app.get('/api/repo/calc_size', ( a_req, a_resp ) => {
    sendMessage( "RepoCalcSizeRequest", {recurse:a_req.query.recurse=="true"?true:false,item:JSON.parse(a_req.query.items)}, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/repo/alloc/list/by_repo', ( a_req, a_resp ) => {
    sendMessage( "RepoListAllocationsRequest", {id:a_req.query.id}, a_req, a_resp, function( reply ) {
        a_resp.json(reply.alloc?reply.alloc:[]);
    });
});

app.get('/api/repo/alloc/list/by_subject', ( a_req, a_resp ) => {
    var par = {};
    if ( a_req.query.subject != undefined )
        par.subject = a_req.query.subject;
    if ( a_req.query.stats == "true" )
        par.stats = true;

    sendMessage( "RepoListSubjectAllocationsRequest", par, a_req, a_resp, function( reply ) {
        a_resp.json(reply.alloc?reply.alloc:[]);
    });
});

app.get('/api/repo/alloc/list/by_object', ( a_req, a_resp ) => {
    sendMessage( "RepoListObjectAllocationsRequest", {id:a_req.query.id}, a_req, a_resp, function( reply ) {
        a_resp.json(reply.alloc?reply.alloc:[]);
    });
});

app.get('/api/repo/alloc/view', ( a_req, a_resp ) => {
    sendMessage( "RepoViewAllocationRequest", {repo:a_req.query.repo,subject:a_req.query.subject}, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/repo/alloc/stats', ( a_req, a_resp ) => {
    sendMessage( "RepoAllocationStatsRequest", {repo:a_req.query.repo,subject:a_req.query.subject}, a_req, a_resp, function( reply ) {
        a_resp.json(reply.alloc?reply.alloc:{});
    });
});

app.get('/api/repo/alloc/create', ( a_req, a_resp ) => {
    sendMessage( "RepoAllocationCreateRequest", {repo:a_req.query.repo,subject:a_req.query.subject,dataLimit:a_req.query.data_limit,recLimit:a_req.query.rec_limit}, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/repo/alloc/delete', ( a_req, a_resp ) => {
    sendMessage( "RepoAllocationDeleteRequest", {repo:a_req.query.repo,subject:a_req.query.subject}, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/repo/alloc/set', ( a_req, a_resp ) => {
    //console.log("alloc set:",a_req.query.repo,a_req.query.subject,a_req.query.data_limit,a_req.query.rec_limit);
    sendMessage( "RepoAllocationSetRequest", {repo:a_req.query.repo,subject:a_req.query.subject,dataLimit:a_req.query.data_limit,recLimit:a_req.query.rec_limit}, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/repo/alloc/set/default', ( a_req, a_resp ) => {
    var par = {repo:a_req.query.repo};
    if ( a_req.query.subject )
        par.subject = a_req.query.subject;

    //console.log("alloc set def:",par);

    sendMessage( "RepoAllocationSetDefaultRequest", par, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/top/list/topics', ( a_req, a_resp ) => {
    var par = {}

    if ( a_req.query.id )
        par.topicId = a_req.query.id;

    if ( a_req.query.offset != undefined && a_req.query.count != undefined ){
        par.offset = a_req.query.offset;
        par.count = a_req.query.count;
    }

    //console.log("top qry",a_req.query);
    //console.log("top par",par);

    sendMessage( "TopicListTopicsRequest", par, a_req, a_resp, function( reply ) {
        a_resp.json(reply);
    });
});

app.get('/api/top/list/coll', ( a_req, a_resp ) => {
    var par = {topicId:a_req.query.id};
    if ( a_req.query.offset != undefined && a_req.query.count != undefined ){
        par.offset = a_req.query.offset;
        par.count = a_req.query.count;
    }

    sendMessage( "TopicListCollectionsRequest", par, a_req, a_resp, function( reply ) {
        a_resp.json(reply);
    });
});

app.get('/api/top/view', ( a_req, a_resp ) => {
    sendMessage( "TopicViewRequest", { id: a_req.query.id }, a_req, a_resp, function( reply ) {
        a_resp.json(reply);
    });
});

app.get('/api/top/search', ( a_req, a_resp ) => {
    //console.log("top srch",a_req.query.phrase);
    sendMessage( "TopicSearchRequest", {phrase:a_req.query.phrase}, a_req, a_resp, function( reply ) {
        a_resp.json(reply);
    });
});

app.get('/api/sch/view', ( a_req, a_resp ) => {
    sendMessage( "SchemaViewRequest", { id: a_req.query.id, resolve: a_req.query.resolve }, a_req, a_resp, function( reply ) {
        a_resp.json(reply);
    });
});

app.post('/api/sch/search', ( a_req, a_resp ) => {
    sendMessage( "SchemaSearchRequest", a_req.body, a_req, a_resp, function( reply ) {
        a_resp.json(reply);
    });
});

app.post('/api/sch/create', ( a_req, a_resp ) => {
    sendMessage( "SchemaCreateRequest", a_req.body, a_req, a_resp, function( reply ) {
        a_resp.json(reply);
    });
});

app.post('/api/sch/revise', ( a_req, a_resp ) => {
    sendMessage( "SchemaReviseRequest", a_req.body, a_req, a_resp, function( reply ) {
        a_resp.json(reply);
    });
});

app.post('/api/sch/update', ( a_req, a_resp ) => {
    sendMessage( "SchemaUpdateRequest", a_req.body, a_req, a_resp, function( reply ) {
        a_resp.json(reply);
    });
});

app.post('/api/sch/delete', ( a_req, a_resp ) => {
    sendMessage( "SchemaDeleteRequest", { id: a_req.query.id }, a_req, a_resp, function( reply ) {
        a_resp.json(reply);
    });
});

app.get('/ui/ep/view', ( a_req, a_resp ) => {
    //console.log("/ui/ep/view", a_req.query.ep );

    //var userinfo = JSON.parse(a_req.cookies['datafed-user']);

    sendMessage( "UserGetAccessTokenRequest", {}, a_req, a_resp, function( reply ) {
        //console.log("token reply:", reply );

        const opts = {
            hostname: 'transfer.api.globusonline.org',
            method: 'GET',
            path: '/v0.10/endpoint/' + encodeURIComponent(a_req.query.ep),
            rejectUnauthorized: true,
            headers:{
                Authorization: ' Bearer ' + reply.access            
            }
        };

        const req = https.request( opts, (res) => {
            var data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                //console.log('done:',data);
                a_resp.json(JSON.parse(data));
            });
        });
          
        req.on('error', (e) => {
            a_resp.status( 500 );
            a_resp.send( "Globus endpoint view failed." );
        });

        req.end();
    });
});

app.get('/ui/ep/autocomp', ( a_req, a_resp ) => {
    //console.log("/ui/eo/autocomp", a_req.query.term);

    sendMessage( "UserGetAccessTokenRequest", {}, a_req, a_resp, function( reply ) {
        //console.log("token reply:", reply );

        const opts = {
            hostname: 'transfer.api.globusonline.org',
            method: 'GET',
            path: '/v0.10/endpoint_search?filter_scope=all&fields=display_name,canonical_name,id,description,organization,activated,expires_in,default_directory&filter_fulltext='+encodeURIComponent(a_req.query.term),
            rejectUnauthorized: true,
            headers:{
                Authorization: ' Bearer ' + reply.access            
            }
        };

        const req = https.request( opts, (res) => {
            var data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                //console.log('done:',data);
                a_resp.json(JSON.parse(data));
            });
        });
          
        req.on('error', (e) => {
            a_resp.status( 500 );
            a_resp.send( "Globus endpoint search failed." );
        });

        req.end();
    });
});

app.get('/ui/ep/recent/load', ( a_req, a_resp ) => {
    sendMessage( "UserGetRecentEPRequest", {}, a_req, a_resp, function( reply ) {
        a_resp.json(reply.ep?reply.ep:[]);
    });
});

app.post('/ui/ep/recent/save', ( a_req, a_resp ) => {
    sendMessage( "UserSetRecentEPRequest", a_req.body, a_req, a_resp, function( reply ) {
        a_resp.json({});
    });
});

app.get('/ui/ep/dir/list', ( a_req, a_resp ) => {
    sendMessage( "UserGetAccessTokenRequest", {}, a_req, a_resp, function( reply ) {
        //console.log("reply:", reply );

        const opts = {
            hostname: 'transfer.api.globusonline.org',
            method: 'GET',
            path: '/v0.10/operation/endpoint/' + encodeURIComponent(a_req.query.ep) + '/ls?path=' + encodeURIComponent(a_req.query.path) + '&show_hidden=' + a_req.query.hidden,
            rejectUnauthorized: true,
            headers:{
                Authorization: ' Bearer ' + reply.access            
            }
        };

        const req = https.request( opts, (res) => {
            var data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                //console.log('done:',data);
                a_resp.json(JSON.parse(data));
            });
        });
          
        req.on('error', (e) => {
            a_resp.status( 500 );
            a_resp.send( "Globus endpoint directoy listing failed." );
        });

        req.end();
    });

/*        request.get({
            uri: 'https://transfer.api.globusonline.org/v0.10/operation/endpoint/' + encodeURIComponent(a_req.query.ep) + '/ls?path=' + encodeURIComponent(a_req.query.path) + '&show_hidden=' + a_req.query.hidden,
            auth: {
                bearer: reply.access,
            }
        }, function( error, response, body ) {
            //console.log("ep ls err:",error);
            //console.log("ep ls body sz:",body.length );
            a_resp.json(JSON.parse(body));
        });
    });
*/

});


app.get('/ui/theme/load', ( a_req, a_resp ) => {
    var theme = a_req.cookies['datafed-theme'];
    a_resp.send( theme );
});

app.get('/ui/theme/save', ( a_req, a_resp ) => {
    a_resp.cookie( 'datafed-theme', a_req.query.theme, { httpOnly: true, path: "/ui", maxAge: 31536000000 /*1 year in msec */ });
    a_resp.send("{\"ok\":true}");
});


function setAccessToken( a_uid, a_acc_tok, a_ref_tok, a_expires_sec ) {
    console.log( "setAccessToken",a_uid, a_acc_tok, a_ref_tok, a_expires_sec);
    sendMessageDirect( "UserSetAccessTokenRequest", a_uid, { access: a_acc_tok, refresh: a_ref_tok, expiresIn: a_expires_sec }, function( reply ){
        // Should be an AckReply
        console.log("reply:",reply.$type);
    });
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


function sendMessage( a_msg_name, a_msg_data, a_req, a_resp, a_cb, a_anon ) {
    var client = a_req.session.uid;
    if ( !client ){
        console.log("NO AUTH :", a_msg_name, ":", a_req.connection.remoteAddress );
        throw "Not Authenticated";
    }

    a_resp.setHeader('Content-Type', 'application/json');

    //console.log("sendMsg parms:",a_msg_data);

    //    console.log("sendMsg alloc ctx", a_msg_name );
    allocRequestContext( a_resp, function( ctx ){
        //console.log("sendMsg", a_msg_name, ctx );

        var msg = g_msg_by_name[a_msg_name];
        if ( !msg )
            throw "Invalid message type: " + a_msg_name;

        //console.log("msg verify:",msg.verify(a_msg_data));

        var msg_buf = msg.encode(a_msg_data).finish();
        //console.log( "snd msg, type:", msg._msg_type, ", len:", msg_buf.length );

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

        //console.log("frame buffer", frame.toString('hex'));
        //console.log("msg buffer", msg_buf.toString('hex'));

        //console.log( "sendMsg:", a_msg_name );
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
        //console.log("sendMsgDir", a_msg_name, ctx );

        var msg_buf = msg.encode(a_msg_data).finish();
        //console.log( "snd msg, type:", msg._msg_type, ", len:", msg_buf.length );

        var frame = Buffer.alloc(8);
        frame.writeUInt32BE( msg_buf.length, 0 );
        frame.writeUInt8( msg._pid, 4 );
        frame.writeUInt8( msg._mid, 5 );
        frame.writeUInt16BE( ctx, 6 );

        g_ctx[ctx] = a_cb;

        //console.log( "sendMsgDirect:", a_msg_name );
        if ( msg_buf.length )
            g_core_sock.send([ nullfr, frame, msg_buf, a_client ]);
        else
            g_core_sock.send([ nullfr, frame, a_client ]);
    });
}

function processProtoFile( msg ){
    //var mlist = msg.parent.order;
    var i, msg_list = [];
    for ( i in msg.parent.nested )
        msg_list.push(msg.parent.nested[i]);

    //msg_list.sort();

    var pid = msg.values.ID;

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

protobuf.load("Version.proto", function(err, root) {
    if ( err )
        throw err;

    console.log('Version.proto loaded');

    var msg = root.lookupEnum( "Version" );
    if ( !msg )
        throw "Missing Version enum in Version.Anon proto file";

    g_ver_major = msg.values.VER_MAJOR;
    g_ver_mapi_major = msg.values.VER_MAPI_MAJOR;
    g_ver_mapi_minor = msg.values.VER_MAPI_MINOR;
    g_ver_web = msg.values.VER_WEB;
    
    g_version = g_ver_major + "." + g_ver_mapi_major + "." + g_ver_mapi_minor + ":" + g_ver_web;

    console.log('Running Version',g_version);
    if ( --g_ready_start == 0 )
        startServer();
});

protobuf.load("SDMS_Anon.proto", function(err, root) {
    if ( err )
        throw err;

    console.log('SDMS_Anon.proto loaded');

    var msg = root.lookupEnum( "SDMS.Anon.Protocol" );
    if ( !msg )
        throw "Missing Protocol enum in SDMS.Anon proto file";

    processProtoFile( msg );
    if ( --g_ready_start == 0 )
        startServer();
});

protobuf.load("SDMS_Auth.proto", function(err, root) {
    if ( err )
        throw err;

    console.log('SDMS_Auth.proto loaded');

    var msg = root.lookupEnum( "SDMS.Auth.Protocol" );
    if ( !msg )
        throw "Missing Protocol enum in SDMS.Auth proto file";

    processProtoFile( msg );
    if ( --g_ready_start == 0 )
        startServer();
});

process.on('unhandledRejection', (reason, p) => {
    console.log( 'Error - unhandled rejection at: Promise', p, 'reason:', reason );
});


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

function loadSettings(){
    g_host = "datafed.ornl.gov";
    g_port = 443;
    g_server_key_file = '/etc/datafed/datafed-web-key.pem';
    g_server_cert_file = '/etc/datafed/datafed-web-cert.pem';
    //g_server_chain_file = '/etc/datafed/DigiCertSHA2SecureServerCA.pem';
    g_core_serv_addr = 'tcp://datafed.ornl.gov:7513';
    g_test = false;

    console.log( "Reading configuration from file", process.argv[2] );

    try{
        var config = ini.parse(fs.readFileSync(process.argv[2],'utf-8'));
        if ( config.server ){
            g_host = config.server.host || g_host;
            g_port = config.server.port || g_port;
            g_server_key_file = config.server.key_file || g_server_key_file;
            g_server_cert_file = config.server.cert_file || g_server_cert_file;
            g_server_chain_file = config.server.chain_file || g_server_chain_file;
            g_server_secret = config.server.secret;
            g_test = config.server.test || g_test;
        }
        if ( config.oauth ){
            g_client_id = config.oauth.client_id || g_client_id;
            g_client_secret = config.oauth.client_secret || g_client_secret;
        }
        if ( config.core ){
            g_core_serv_addr = config.core.server_address || g_core_serv_addr;
        }
    }catch( e ){
        console.log( "Could not open/parse configuration file", process.argv[2] );
        console.log( e.message );
        throw e;
    }

    if ( !g_server_secret ){
        throw "Server session secret not set.";
    }
}


if ( --g_ready_start == 0 )
    startServer();
