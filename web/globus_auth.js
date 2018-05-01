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


//app.use('/static', express.static('static'))
app.use( express.static( __dirname + '/static' ));

app.set( 'view engine', 'ect' );
app.engine( 'ect', ectRenderer.render );


app.get('/', (request, response) => {
    console.log("get /");

    // Store user access token in session
    response.render('index');

    //response.send('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>SDMS Dev WebApp</title></head><body>SDMS Development WebApp<br><br><a href="/get_ident">Get Globus Identities</a></body></html>');
})

app.get('/main', (request, response) => {
    response.render('main');
})

app.get('/register', (request, response) => {
    response.render('register');
})

app.get('/login', (request, response) => {
    var uri = globus_auth.code.getUri();
    response.redirect(uri)
})


app.get('/user_auth', ( a_request, a_response ) => {
    //console.log(`user_auth: `, request.query, request.body );

    globus_auth.code.getToken( a_request.originalUrl ).then( function( client_token ) {
        console.log( 'client token:', client_token );

        // Store user access token in session
        //sessionStorage.setItem( "user", user );

        try {
            var dec = jwt_decode( client_token.data.id_token );
            console.log( 'id dec:', dec );
        } catch( e ) {
            console.log('exception:', e );
        }

        // Refresh the current users access token.
        client_token.refresh().then( function (updatedUser) {
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

            if( response.statusCode >= 200 && response.statusCode < 300 ) {
                console.log( 'body:', body );
                userinfo = body; //JSON.parse( body );
            }

            a_response.render("login", { userinfo: userinfo });
        } );
    })
})

var httpsServer = https.createServer( web_credentials, app );

console.log( "listeing on port", port );

httpsServer.listen( port );
