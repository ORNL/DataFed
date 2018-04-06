'use strict';

const express = require('express');
var https = require('https');
var request = require('request');
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

app.get('/user_auth', ( a_request, a_response ) => {
    //console.log(`user_auth: `, request.query, request.body );

    globus_auth.code.getToken( a_request.originalUrl ).then( function( user ) {
        //console.log( 'token:', user ); //=> { accessToken: '...', tokenType: 'bearer', ... }
        //console.log( 'id:', user.data.id_token, btoa( user.data.id_token ));

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
        //console.log( 'https://auth.globus.org/v2/oauth2/token/introspect?token=' + user.accessToken + '&include=identities_set' );

        a_response.send( user.accessToken );

        request.post({
            uri: 'https://auth.globus.org/v2/oauth2/token/introspect',
            headers: {
                'Content-Type' : 'application/x-www-form-urlencoded',
                'Accept' : 'application/json',
                //'Authorization' :'Basic ' + btoa(oauth_credentials.clientId + ':' + oauth_credentials.clientSecret )
            },
            auth: {
                user: oauth_credentials.clientId,
                pass: oauth_credentials.clientSecret
            },
            body: 'token=' + user.accessToken + '&include=identities_set'
        }, function( error, response, body ) {
                console.log( 'something: ', error, response, body  );
        } );

/*
        var xhr = new XMLHttpRequest();

        console.log( xhr );

        xhr.open('POST', 'https://auth.globus.org/v2/oauth2/token/introspect' ); //, oauth_credentials.clientId, oauth_credentials.clientSecret );

        xhr.onerror = function( e ) {
            console.log( "req err:", e );
        };

        xhr.ontimeout = function( e ) {
            console.log( "req timeout:", e );
        };

        xhr.onabort = function( e ) {
            console.log( "req aborted:", e );
        };

        xhr.onprogress = function( e ) {
            console.log( "req progress:", e );
        };

        xhr.onloadstart = function( e ) {
            console.log( "req load start:", e );
        };

        xhr.onloadend = function( e ) {
            console.log( "req load end:", e );
        };

        xhr.onload = function( e ) {
            console.log( "req load:", e );
        };

        xhr.onreadystatechange = function() {
            console.log( 'state change:', xhr.readyState, xhr.status, xhr.statusText );
            if ( xhr.readyState > 3 && xhr.status >= 200 && xhr.status < 300 ) {
                console.log( 'introspect:', xhr.responseText );
            }
        };
        xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
        xhr.setRequestHeader('Accept', 'application/json');
        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
        xhr.setRequestHeader('Authorization', 'Basic ' + btoa(oauth_credentials.clientId + ':' + oauth_credentials.clientSecret ));
        xhr.send( 'token=' + user.accessToken + '&include=identities_set' );
*/
    })
})

var httpsServer = https.createServer( credentials, app );
httpsServer.listen( port );
