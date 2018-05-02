'use strict';

const express = require('express');
var cookieParser = require('cookie-parser');
var https = require('https');
var request = require('request');
const fs = require('fs');
var protobuf = require("protobufjs");
const app = express();
var ECT = require('ect');
var ectRenderer = ECT({ watch: true, root: __dirname + '/views', ext : '.ect' });
const port = 443;

var server_key = process.env.SDMS_WEB_KEY || 'sdms_web_key.pem';
var server_cert = process.env.SDMS_WEB_CERT || 'sdms_web_cert.pem';

var privateKey  = fs.readFileSync( server_key, 'utf8');
var certificate = fs.readFileSync( server_cert, 'utf8');
var web_credentials = {key: privateKey, cert: certificate};
var jwt_decode = require('jwt-decode');


const oauth_credentials = {
    clientId: '7bc68d7b-4ad4-4991-8a49-ecbfcae1a454',
    clientSecret: 'FpqvBscUorqgNLXKzlBAV0EQTdLXtBTTnGpf0+YnKEQ=',
    authorizationUri: 'https://auth.globus.org/v2/oauth2/authorize',
    accessTokenUri: 'https://auth.globus.org/v2/oauth2/token',
    redirectUri: 'https://sdms.ornl.gov:443/user_auth',
    scopes: ['openid']
};

// Initialize the OAuth2 Library
const ClientOAuth2 = require('client-oauth2');
var globus_auth = new ClientOAuth2( oauth_credentials );

app.use( express.static( __dirname + '/static' ));
app.use( cookieParser() );
app.set( 'view engine', 'ect' );
app.engine( 'ect', ectRenderer.render );


app.get('/', (request, response) => {
    console.log("get /");

    response.render('index');
})

app.get('/main', (request, response) => {
    console.log("get /main");

    response.render( 'main', { user: request.cookies['sdms-user'] });
})

app.get('/register', (request, response) => {
    console.log("get /register");

    response.render('register');
})

app.get('/login', (request, response) => {
    console.log("get /login");

    var uri = globus_auth.code.getUri();
    console.log( 'about to go to', uri );
    response.redirect(uri)
})

app.get('/error', (request, response) => {
    console.log("get /error");

    response.render('error');
})

app.get('/user_auth', ( a_request, a_response ) => {
    console.log( 'get /user_auth', a_request.originalUrl );

    // TODO Need to understand error flow here - there doesn't seem to be anhy error handling

    globus_auth.code.getToken( a_request.originalUrl ).then( function( client_token ) {
        console.log( 'client token:', client_token );

        /*
        try {
            var dec = jwt_decode( client_token.data.id_token );
            //console.log( 'id dec:', dec );
        } catch( e ) {
            console.log('exception:', e );
        }*/

        // Refresh the current users access token.
        client_token.refresh().then( function( updatedUser ) {
            // TODO What to do here???
            console.log( updatedUser !== client_token ); //=> true
            console.log( updatedUser.accessToken );
        });

        // Sign API requests on behalf of the current user.
        /*
        client_token.sign({
            method: 'get',
            url: 'https://sdms.ornl.gov'
        });*/

        request.post({
            uri: 'https://auth.globus.org/v2/oauth2/token/introspect',
            headers: {
                'Content-Type' : 'application/x-www-form-urlencoded',
                'Accept' : 'application/json',
            },
            auth: {
                user: oauth_credentials.clientId,
                pass: oauth_credentials.clientSecret
            },
            body: 'token=' + client_token.accessToken + '&include=identities_set'
        }, function( error, response, body ) {
            var userinfo = null;

            if ( response.statusCode >= 200 && response.statusCode < 300 ) {
                console.log( 'got user info:', body );
                userinfo = JSON.parse( body );

                request.get({
                    uri: 'https://sdms.ornl.gov/usr/find',
                    qs: { ids: userinfo.identities_set }
                }, function( error, response, body ) {
                    console.log( '/usr/find cb' );
                    if ( error ) {
                        console.log( '/usr/find error:', error );
                        a_response.clearCookie( 'sdms-token' );
                        a_response.clearCookie( 'sdms-user' );
                        a_response.redirect( "/error" );
                    } else {
                        a_response.cookie( 'sdms-token', client_token.accessToken, { httpOnly: true });
                        if ( response.statusCode == 200 ) {
                            console.log( 'user found:', body );
                            a_response.cookie( 'sdms-user', body );
                            a_response.redirect( "main" );
                        } else {
                            console.log( 'user not found' );
                            a_response.clearCookie( 'sdms-user' );
                            a_response.redirect( "register" );
                        }
                    }
                });

            } else {
                a_response.clearCookie( 'sdms-token' );
                a_response.clearCookie( 'sdms-user' );
                a_response.redirect( "/error" );
            }
        } );
    }, function( reason ){
        console.log( "getToken failed:", reason );
    })
});

app.get('/usr/find', ( a_request, a_response ) => {
    console.log("get /usr/find");

    // TODO Send req to Core Server via protobuf
    a_response.send({ user: "foo-user", fake: 1 });
});

process.on('unhandledRejection', (reason, p) => {
    console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
});

var httpsServer = https.createServer( web_credentials, app );

console.log( "listeing on port", port );

httpsServer.listen( port );
