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


app.get('/', (request, response) => {
    response.send('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>SDMS Dev WebApp</title></head><body>SDMS Development WebApp</body></html>');
})

app.get('/user_auth', (request, response) => {
    console.log(`user_auth: `, request.query, request.body );
    response.status(200).end();
})

var httpsServer = https.createServer( credentials, app );

httpsServer.listen( port );
