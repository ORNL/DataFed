'use strict';

const express = require('express');
var https = require('https');
const fs = require('fs');
const app = express();
const port = 7512;

var server_key = process.env.SDMS_WEB_KEY || 'sdms_web_key.pem';
var server_cert = process.env.SDMS_WEB_CERT || 'sdms_web_cert.pem';

var privateKey  = fs.readFileSync( server_key, 'utf8');
var certificate = fs.readFileSync( server_cert, 'utf8');
var credentials = {key: privateKey, cert: certificate};
var jwt_decode = require('jwt-decode');

const oauth_credentials = {
    clientId: '7bc68d7b-4ad4-4991-8a49-ecbfcae1a454',
    clientSecret: 'FpqvBscUorqgNLXKzlBAV0EQTdLXtBTTnGpf0+YnKEQ=',
    authorizationUri: 'https://auth.globus.org/v2/oauth2/authorize',
    accessTokenUri: 'https://auth.globus.org/v2/oauth2/token',
    redirectUri: 'https://sdms.ornl.gov:7512/user_auth',
    scopes: ['openid']
};

// Initialize the OAuth2 Library
const ClientOAuth2 = require('client-oauth2');

var globus_auth = new ClientOAuth2( oauth_credentials );

app.get('/', (request, response) => {
    response.send('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>SDMS Dev WebApp</title></head><body>SDMS Development WebApp<br><br><a href="/go">Go!</a></body></html>');
})

app.get('/go', (request, response) => {
    console.log(`starting auth flow` );
    var uri = globus_auth.code.getUri();
    response.redirect(uri)
})

app.get('/user_auth', (request, response) => {
    console.log(`user_auth: `, request.query, request.body );

    globus_auth.code.getToken( request.originalUrl ).then( function( user ) {
        //console.log( 'token:', user ); //=> { accessToken: '...', tokenType: 'bearer', ... }
	//console.log( 'id:', user.data.id_token, btoa( user.data.id_token ));
	try {
            console.log( 'id enc:', user.data.id_token );
	    console.log( 'start' );
//var token = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJmb28iOiJiYXIiLCJleHAiOjEzOTMyODY4OTMsImlhdCI6MTM5MzI2ODg5M30.4-iaDojEVl0pJQMjrbM1EzUIfAZgsbK_kgnVyVxFSVo';

            //var dec = jwt_decode( token );
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
        user.sign({
            method: 'get',
            url: 'https://sdms.ornl.gov'
        });

        // We should store the token into a database.
        return response.send( user.accessToken );
    })
})

var httpsServer = https.createServer( credentials, app );
httpsServer.listen( port );
