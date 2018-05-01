'use strict';

const express = require('express');
var https = require('https');
var request = require('request');
const fs = require('fs');
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



app.set( 'view engine', 'ect' );
app.engine( 'ect', ectRenderer.render );


app.get('/', (request, response) => {
    console.log("get /");

    // Store user access token in session
    response.render('index', { user: user });

    //response.send('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>SDMS Dev WebApp</title></head><body>SDMS Development WebApp<br><br><a href="/get_ident">Get Globus Identities</a></body></html>');
})

app.get('/register', (request, response) => {
    console.log('register');
    response.render('register');
})

app.get('/login', (request, response) => {
    console.log('login');
    //response.render('login');
    var uri = globus_auth.code.getUri();
    response.redirect(uri)
})

app.get('/get_ident', (request, response) => {
    console.log('starting auth flow');
    var uri = globus_auth.code.getUri();
    response.redirect(uri)
})

app.get('/user_auth', ( a_request, a_response ) => {
    //console.log(`user_auth: `, request.query, request.body );

    globus_auth.code.getToken( a_request.originalUrl ).then( function( user ) {
        console.log( 'user:', user ); //=> { accessToken: '...', tokenType: 'bearer', ... }
        //console.log( 'id:', user.data.id_token, btoa( user.data.id_token ));

        // Store user access token in session
        sessionStorage.setItem( "user", user );

        try {
            //console.log( 'id enc:', user.data.id_token );
            var dec = jwt_decode( user.data.id_token );
            console.log( 'id dec:', dec );
        } catch( e ) {
            console.log('exception:', e );
        }

        // Refresh the current users access token.
        user.refresh().then( function (updatedUser) {
            console.log( updatedUser !== user); //=> true
            console.log( updatedUser.accessToken );
        });

        // Sign API requests on behalf of the current user.
        /*
        user.sign({
            method: 'get',
            url: 'https://sdms.ornl.gov'
        });*/

        // We should store the token into a database.


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
            body: 'token=' + user.accessToken + '&include=identities_set'
        }, function( error, response, body ) {
            var resp_content = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>SDMS Dev WebApp</title></head><body>SDMS Development WebApp<br><br>';

            if( response.statusCode >= 200 && response.statusCode < 300 ) {
                console.log( 'body:', body );
                var userinfo = JSON.parse( body );

                if ( !userinfo.active )
                    resp_content += "ERROR: Globus user is INACTIVE!<br><br>";

                resp_content += "Name: " + userinfo.name + "<br>";
                resp_content += "User name: " + userinfo.username + "<br>";
                resp_content += "Client ID: " + userinfo.client_id + "<br>";
                resp_content += "Identities:<br>";
                for ( var i in userinfo.identities_set ) {
                    resp_content += "&nbsp&nbsp&nbsp&nbsp" + userinfo.identities_set[i] + "<br>";
                }

                resp_content += "<br>Please manually install the reported Globus identities into the SDMS database for the associated user.<br>";

            } else {
                resp_content += "Failed to retrieve Globus identities.<br>";
            }

            resp_content += '<br><br><a href="/get_ident">Get Globus Identities</a><br>';
            resp_content += '<a href="/">Back to Main</a></body></html>';
            a_response.send( resp_content );
        } );
    })
})

var httpsServer = https.createServer( web_credentials, app );

console.log( "listeing on port", port );

httpsServer.listen( port );
