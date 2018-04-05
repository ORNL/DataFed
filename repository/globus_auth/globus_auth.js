const express = require('express');
const app = express();
const port = 7512;

app.get('/', (request, response) => {
    response.send('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>SDMS Dev WebApp</title></head><body>SDMS Development WebApp</body></html>');
})

app.listen( port, (err) => {
    if ( err ) {
        return console.log('something bad happened', err);
    }

    console.log(`server is listening on ${port}`);
})

app.get('/user_auth', (request, response) => {
    console.log(`user_auth: `, request.query, request.body );
    response.status(200).end();
})