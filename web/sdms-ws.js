#!/usr/bin/env nodejs

/*jshint strict: global */
/*jshint esversion: 6 */
/*jshint multistr: true */
/* globals require */
/* globals module */
/* globals console */
/* globals process */
/* globals Buffer */
/* globals __dirname */

/*import { isContext } from 'vm';*/

'use strict';

const express = require('express'); // For REST api
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser'); // cookies for user state
var https = require('https');
var request = require('request');
const fs = require('fs');
const ini = require('ini');
var protobuf = require("protobufjs");
var zmq = require("zeromq");
const app = express();
var ECT = require('ect'); // for html templates
var ectRenderer = ECT({ watch: true, root: __dirname + '/views', ext : '.ect' });
const ClientOAuth2 = require('client-oauth2');

const MAX_CTX = 50;

var g_host;
var g_port;
var g_server_key_file;
var g_server_cert_file;
var g_msg_by_id = {};
var g_msg_by_name = {};
var g_core_sock = zmq.socket('dealer');
var g_core_serv_addr;
var globus_auth;
var g_ctx = new Array( MAX_CTX );
var g_ctx_next = 0;
var g_oauth_credentials;
const nullfr = Buffer.from([]);

g_ctx.fill(null);

function defaultSettings(){
    g_host = "sdms.ornl.gov";
    g_port = 443;
    g_server_key_file = '/etc/sdms/sdms_web_key';
    g_server_cert_file = '/etc/sdms/sdms_web_cert';
    g_core_serv_addr = 'tcp://sdms.ornl.gov:7513';
}

function startServer(){
    console.log( "host:", g_host );
    console.log( "port:", g_port );
    console.log( "server key file:", g_server_key_file );
    console.log( "server cert file:", g_server_cert_file );
    console.log( "core server addr:", g_core_serv_addr );

    g_core_sock.connect( g_core_serv_addr );

    g_oauth_credentials = {
        clientId: '7bc68d7b-4ad4-4991-8a49-ecbfcae1a454',
        clientSecret: 'FpqvBscUorqgNLXKzlBAV0EQTdLXtBTTnGpf0+YnKEQ=',
        authorizationUri: 'https://auth.globus.org/v2/oauth2/authorize',
        accessTokenUri: 'https://auth.globus.org/v2/oauth2/token',
        redirectUri: 'https://'+g_host+':'+g_port+'/ui/authn',
        scopes: 'urn:globus:auth:scope:transfer.api.globus.org:all offline_access openid'
    };

    globus_auth = new ClientOAuth2( g_oauth_credentials );

    //--- This is a HACK to gt around lack of host cert
    /*
    var agentOptions = {
        host : g_host,
        port : g_port,
        path : '/',
        rejectUnauthorized : false
    };

    var agent = new https.Agent(agentOptions);
    */

    var privateKey  = fs.readFileSync( g_server_key_file, 'utf8');
    var certificate = fs.readFileSync( g_server_cert_file, 'utf8');

    var httpsServer = https.createServer( {key: privateKey, cert: certificate}, app );
    httpsServer.listen( g_port );
}

app.use( express.static( __dirname + '/static' ));
app.use( bodyParser.json({ type: 'application/json'}));
app.use( cookieParser() );
app.set( 'view engine', 'ect' );
app.engine( 'ect', ectRenderer.render );


app.get('/', (request, response) => {
    console.log("Initial site access from ", request.connection.remoteAddress );

    if ( request.cookies['sdms'] && request.cookies['sdms-user'])
        response.redirect( '/ui/main' );
    else
        response.redirect('/ui');
});

app.get('/ui', (request, response) => {
    console.log("get /ui");
    //console.log( "sdms cookie:", request.cookies['sdms'] );

    if ( request.cookies['sdms'] && request.cookies['sdms-user'] )
        response.redirect( '/ui/main' );
    else{
        var theme = request.cookies['sdms-theme']|| "light";
        response.render('index',{theme:theme});
    }
});

app.get('/ui/main', (request, response) => {
    console.log("get /ui/main");
    //console.log( "sdms cookie:", request.cookies['sdms'] );

    if ( request.cookies['sdms'] ){
        var theme = request.cookies['sdms-theme'] || "light";
        response.render( 'main',{theme:theme});
    }else
        response.redirect( '/ui' );
});

app.get('/ui/docs', (request, response) => {
    var theme = request.cookies['sdms-theme'] || "light";
    response.render( 'docs',{theme:theme});
});

app.get('/ui/register', (request, response) => {
    //console.log("get /ui/register", request.query.acc_tok, request.query.ref_tok );
    if ( !request.cookies['sdms-user'] )
        response.redirect( '/' );

    var theme = request.cookies['sdms-theme'] || "light";

    response.render('register', { acc_tok: request.query.acc_tok, ref_tok: request.query.ref_tok, uid: request.query.uid, uname: request.query.uname, theme: theme });
});

app.get('/ui/login', (request, response) => {
    console.log("get /ui/login");

    var uri = globus_auth.code.getUri();
    response.redirect(uri);
});

app.get('/ui/logout', (request, response) => {
    console.log("get /ui/logout");

    response.clearCookie( 'sdms' );
    response.clearCookie( 'sdms-user', { path: "/ui" } );
    response.redirect("/ui");
});

app.get('/ui/error', (request, response) => {
    //console.log("get /ui/error");
    var theme = request.cookies['sdms-theme'] || "light";
    response.render('error',{theme:theme});
});

app.get('/ui/authn', ( a_request, a_response ) => {
    console.log( '/ui/authn', a_request.originalUrl );

    // TODO Need to understand error flow here - there doesn't seem to be anhy error handling

    globus_auth.code.getToken( a_request.originalUrl ).then( function( client_token ) {
        //console.log( 'client token:', client_token );
        var xfr_token = client_token.data.other_tokens[0];
        //console.log( 'xfr token:', xfr_token );

        // TODO - Refresh the current users access token?
        /*
        client_token.refresh().then( function( updatedUser ) {
            // TODO What to do here???
            console.log( updatedUser !== client_token ); //=> true
            console.log( updatedUser.accessToken );
        }, function( reason ) {
            console.log( "refresh failed:", reason );
        }); */

        request.post({
            uri: 'https://auth.globus.org/v2/oauth2/token/introspect',
            headers: {
                'Content-Type' : 'application/x-www-form-urlencoded',
                'Accept' : 'application/json',
            },
            auth: {
                user: g_oauth_credentials.clientId,
                pass: g_oauth_credentials.clientSecret
            },
            body: 'token=' + client_token.accessToken + '&include=identities_set'
        }, function( error, response, body ) {
            var userinfo = null;

            if ( response.statusCode >= 200 && response.statusCode < 300 ) {
                userinfo = JSON.parse( body );
                userinfo.uid = userinfo.username.substr( 0, userinfo.username.indexOf( "@" ));

                console.log( 'user', userinfo.uid, 'authenticated, verifying SDMS account' );

                sendMessageDirect( "UserFindByUUIDsRequest", "sdms", { uuid: userinfo.identities_set }, function( reply ) {
                    //console.log( "UserFindByUUIDsRequest reply:", reply );

                    if ( !reply  ) {
                        console.log("User find error. Reply:", reply );
                        a_response.redirect( "/ui/error" );
                    } else if ( !reply.user || !reply.user.length ) {
                        // Not registered
                        console.log("User not registered", userinfo );
                        a_response.cookie( 'sdms-user', JSON.stringify( userinfo ), { path: "/ui" });
                        //a_response.redirect( "/ui/register" );
                        //console.log("uid", userinfo.uid, "uname", userinfo.name );

                        a_response.redirect( "/ui/register?acc_tok=" + xfr_token.access_token + "&ref_tok=" + xfr_token.refresh_token + "&uid=" + userinfo.uid + "&uname=" + userinfo.name );
                    } else {
                        console.log( 'user', userinfo.uid, 'verified' );
                        // Registered, save access token
                        userinfo.acc_tok = xfr_token.access_token;
                        userinfo.ref_tok = xfr_token.refresh_token;
                        saveToken( userinfo.uid, xfr_token.access_token, xfr_token.refresh_token );

                        // TODO Account may be disable from SDMS (active = false)
                        a_response.cookie( 'sdms', userinfo.uid, { httpOnly: true, maxAge: 259200000 });
                        a_response.cookie( 'sdms-user', JSON.stringify( userinfo ), { path: "/ui" });
                        a_response.redirect( "/ui/main" );
                    }
                });
            } else {
                a_response.clearCookie( 'sdms' );
                a_response.clearCookie( 'sdms-user', { path: "/ui" } );
                a_response.redirect( "/ui/error" );
            }
        } );
    }, function( reason ){
        console.log( "getToken failed:", reason );
    });
});

app.get('/ui/do_register', ( a_req, a_resp ) => {
    console.log( 'get /ui/do_register' );
    var userinfo = JSON.parse( a_req.cookies[ 'sdms-user' ] );
    console.log( 'userinfo', userinfo );
    //var uid = userinfo.username.substr( 0, userinfo.username.indexOf( "@" ));

    sendMessageDirect( "UserCreateRequest", "sdms", { uid: userinfo.uid, password: a_req.query.pw, name: userinfo.name, email: userinfo.email, uuid: userinfo.identities_set }, function( reply ) {
        if ( !reply ) {
            console.log("empty reply");
            a_resp.status(500).send( "Empty reply" );
        } else if ( reply.errCode ) {
            if ( reply.errMsg ) {
                console.log("error", reply.errMsg);
                a_resp.status(500).send( reply.errMsg );
            } else {
                a_resp.status(500).send( "error code: " + reply.errCode );
                console.log("error", reply.errCode);
            }
        } else {
            // Save access token
            saveToken( userinfo.uid, a_req.query.acc_tok, a_req.query.ref_tok );
            userinfo.acc_tok = a_req.query.acc_tok;
            userinfo.ref_tok = a_req.query.ref_tok;
            a_resp.cookie( 'sdms', userinfo.uid, { httpOnly: true, maxAge: 259200000 });
            a_resp.cookie( 'sdms-user', JSON.stringify( userinfo ), { path:"/ui" });
            a_resp.redirect( "/ui/main" );
        }
    });
});

app.get('/api/usr/find', ( a_req, a_resp ) => {
    sendMessage( "UserFindByUUIDsRequest", { uuid: a_req.query.uuids }, a_req, a_resp, function( reply ) {
        a_resp.json( reply.user[0] );
    });
});

app.get('/api/usr/view', ( a_req, a_resp ) => {
    sendMessage( "UserViewRequest", { uid: a_req.query.id, details:(a_req.query.details=="true"?true:false)}, a_req, a_resp, function( reply ) {
        a_resp.json( reply.user[0] );
    });
});

app.get('/api/usr/update', ( a_req, a_resp ) => {
    var params = { uid: a_req.query.uid };
    if ( a_req.query.email )
        params.email = a_req.query.email;
    if ( a_req.query.pw )
        params.password = a_req.query.pw;
    if ( a_req.query.opts )
        params.options = a_req.query.opts;

    sendMessage( "UserUpdateRequest", params, a_req, a_resp, function( reply ) {
        a_resp.json( reply.user[0] );
    });
});

app.get('/api/usr/revoke_cred', ( a_req, a_resp ) => {
    console.log("/api/usr/revoke_cred");
    sendMessage( "RevokeCredentialsRequest", {}, a_req, a_resp, function( reply ) {
        a_resp.json({});
    });
});

app.get('/api/usr/list/all', ( a_req, a_resp ) => {
    sendMessage( "UserListAllRequest", {}, a_req, a_resp, function( reply ) {
        a_resp.json(reply.user);
    });
});

app.get('/api/usr/list/collab', ( a_req, a_resp ) => {
    sendMessage( "UserListCollabRequest", {}, a_req, a_resp, function( reply ) {
        a_resp.json(reply.user?reply.user:[]);
    });
});

app.get('/api/prj/create', ( a_req, a_resp ) => {
    var params  = {
        id: a_req.query.id,
        title: a_req.query.title,
        domain: a_req.query.domain
    }
    if ( a_req.query.repo )
        params.repo = a_req.query.repo;
    if ( a_req.query.desc )
        params.desc = a_req.query.desc;
    if ( a_req.query.sub_repo ){
        params.subRepo = a_req.query.sub_repo;
        params.subAlloc = a_req.query.sub_alloc;
    }
    if ( a_req.query.members )
        params.member = JSON.parse( a_req.query.members );
    if ( a_req.query.admins )
        params.admin = JSON.parse( a_req.query.admins );

    sendMessage( "ProjectCreateRequest", params, a_req, a_resp, function( reply ) {
        if ( reply.proj )
            a_resp.send(reply.proj);
        else
            a_resp.send([]);
    });
});

app.get('/api/prj/update', ( a_req, a_resp ) => {
    var params  = {
        id: a_req.query.id,
    }
    if ( a_req.query.domain )
        params.domain = a_req.query.domain;
    if ( a_req.query.title )
        params.title = a_req.query.title;
    if ( a_req.query.repo )
        params.repo = a_req.query.repo;
    if ( a_req.query.desc  )
        params.desc = a_req.query.desc;
    if ( a_req.query.sub_repo )
        params.subRepo = a_req.query.sub_repo;
    if ( a_req.query.sub_alloc )
        params.subAlloc = a_req.query.sub_alloc;
    if ( a_req.query.members )
        params.member = JSON.parse( a_req.query.members );
    if ( a_req.query.admins )
        params.admin = JSON.parse( a_req.query.admins );

    sendMessage( "ProjectUpdateRequest", params, a_req, a_resp, function( reply ) {
        if ( reply.proj )
            a_resp.send(reply.proj);
        else
            a_resp.send([]);
    });
});

app.get('/api/prj/delete', ( a_req, a_resp ) => {
    sendMessage( "ProjectDeleteRequest", { id: a_req.query.id }, a_req, a_resp, function( reply ) {
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
    if ( a_req.query.owner )
        params.byOwner = a_req.query.owner=="true"?true:false;
    if ( a_req.query.admin )
        params.byAdmin = a_req.query.admin=="true"?true:false;
    if ( a_req.query.member )
        params.byMember = a_req.query.member=="true"?true:false;

    sendMessage( "ProjectListRequest", params, a_req, a_resp, function( reply ) {
        if ( reply.proj )
            a_resp.send(reply.proj);
        else
            a_resp.send([]);
    });
});

app.get('/api/prj/list/by_admin', ( a_req, a_resp ) => {
    sendMessage( "ProjectListByAdminRequest", {}, a_req, a_resp, function( reply ) {
        if ( reply.proj )
            a_resp.send(reply.proj);
        else
            a_resp.send([]);
    });
});

app.get('/api/prj/list/by_member', ( a_req, a_resp ) => {
    sendMessage( "ProjectListByMemberRequest", {}, a_req, a_resp, function( reply ) {
        if ( reply.proj )
            a_resp.send(reply.proj);
        else
            a_resp.send([]);
    });
});

app.get('/api/grp/create', ( a_req, a_resp ) => {
    var params  = {
        group: {
            uid: a_req.query.uid,
            gid: a_req.query.gid,
            title: a_req.query.title?a_req.query.title:undefined,
            desc: a_req.query.desc?a_req.query.desc:undefined,
            member: a_req.query.member?JSON.parse( a_req.query.member ):undefined
        }
    };

    sendMessage( "GroupCreateRequest", params, a_req, a_resp, function( reply ) {
        a_resp.send(reply.group[0]);
    });
});

app.get('/api/grp/update', ( a_req, a_resp ) => {
    var params  = {
        uid: a_req.query.uid,
        gid: a_req.query.gid,
        title: a_req.query.title,
        desc: a_req.query.desc,
        addUid: a_req.query.add?JSON.parse( a_req.query.add ):null,
        remUid: a_req.query.rem?JSON.parse( a_req.query.rem ):null,
    };

    sendMessage( "GroupUpdateRequest", params, a_req, a_resp, function( reply ) {
        a_resp.send(reply.group[0]);
    });
});

app.get('/api/grp/view', ( a_req, a_resp ) => {
    sendMessage( "GroupViewRequest", { uid: a_req.query.uid, gid: a_req.query.gid }, a_req, a_resp, function( reply ) {
        a_resp.send(reply.group[0]);
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

app.post('/api/dat/search', ( a_req, a_resp ) => {
    console.log("search:",a_req.body);
    sendMessage( "RecordSearchRequest", { query: JSON.stringify( a_req.body ) }, a_req, a_resp, function( reply ) {
        a_resp.send(reply.item?reply.item:[]);
    });
});

app.post('/api/dat/create', ( a_req, a_resp ) => {
    //console.log( "dat create", a_req.body );

    sendMessage( "RecordCreateRequest", a_req.body, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.post('/api/dat/update', ( a_req, a_resp ) => {
    console.log( "dat update", a_req.body );

    sendMessage( "RecordUpdateRequest", a_req.body, a_req, a_resp, function( reply ) {
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
    sendMessage( "RecordDeleteRequest", { id: a_req.query.id }, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/dat/view', ( a_req, a_resp ) => {
    sendMessage( "RecordViewRequest", { id: a_req.query.id }, a_req, a_resp, function( reply ) {
        if ( reply.data && reply.data.length )
            a_resp.send(reply.data[0]);
        else
            a_resp.send();
    });
});

app.get('/api/dat/get', ( a_req, a_resp ) => {
    sendMessage( "DataGetRequest", { id: a_req.query.id, local: a_req.query.path }, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/dat/put', ( a_req, a_resp ) => {
    sendMessage( "DataPutRequest", { id: a_req.query.id, local: a_req.query.path }, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
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
    sendMessage( "ACLUpdateRequest", { id: a_req.query.id, rules: a_req.query.rules, ispublic: (a_req.query.pub=="true"?true:false)}, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

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

app.get('/api/xfr/list', ( a_req, a_resp ) => {
    var params = {};
    if ( a_req.query.since )
        params.since = a_req.query.since;
    sendMessage( "XfrListRequest", params, a_req, a_resp, function( reply ) {
        a_resp.json(reply);
    });
});

app.post('/api/col/create', ( a_req, a_resp ) => {
    sendMessage( "CollCreateRequest", a_req.body, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.post('/api/col/update', ( a_req, a_resp ) => {
    sendMessage( "CollUpdateRequest", a_req.body, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/col/delete', ( a_req, a_resp ) => {
    sendMessage( "CollDeleteRequest", { id: a_req.query.id }, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/col/view', ( a_req, a_resp ) => {
    sendMessage( "CollViewRequest", { id: a_req.query.id }, a_req, a_resp, function( reply ) {
        if ( reply.coll && reply.coll.length )
            a_resp.send(reply.coll[0]);
        else
            a_resp.send();
    });
});

app.get('/api/col/read', ( a_req, a_resp ) => {
    var par = { id: a_req.query.id };
    if ( a_req.query.offset != undefined && a_req.query.count != undefined ){
        par.offset = a_req.query.offset;
        par.count = a_req.query.count;
    }

    sendMessage( "CollReadRequest", par, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/col/get_parents', ( a_req, a_resp ) => {
    sendMessage( "CollGetParentsRequest", { id: a_req.query.id }, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

// TODO - Link and unlink should be atomic with DB
app.get('/api/link', ( a_req, a_resp ) => {
    console.log("link items:",a_req.query.items,",coll:",a_req.query.coll,",unlink:",a_req.query.unlink);
    var items =  JSON.parse(a_req.query.items)
    sendMessage( "CollWriteRequest", { id: a_req.query.coll, add: items }, a_req, a_resp, function( reply ) {
        if ( a_req.query.unlink ) {
            var unlink_items = [];
            for ( var i in items ){
                if ( items[i].charAt(0) == 'd' )
                    unlink_items.push(items[i]);
            }
            sendMessage( "CollWriteRequest", { id: a_req.query.unlink, rem: unlink_items }, a_req, a_resp, function( reply2 ) {
                a_resp.send(reply2);
            });
        } else
            a_resp.send(reply);
    });
});

app.get('/api/unlink', ( a_req, a_resp ) => {
    console.log("unlink items:",a_req.query.items,"coll:",a_req.query.coll);
    sendMessage( "CollWriteRequest", { id: a_req.query.coll, rem: JSON.parse(a_req.query.items) }, a_req, a_resp, function( reply ) {
        a_resp.send(reply.item?reply.item:[]);
    });
});

app.get('/api/repo/list', ( a_req, a_resp ) => {
    var params = {};
    if ( a_req.query.admin )
        params.admin = a_req.query.admin;
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

app.get('/api/repo/update', ( a_req, a_resp ) => {
    var params = {id:a_req.query.id};
    if ( a_req.query.title )
        params.title = a_req.query.title;
    if ( a_req.query.desc )
        params.desc = a_req.query.desc;
    if ( a_req.query.domain )
        params.domain = a_req.query.domain;
    if ( a_req.query.capacity )
        params.capacity = a_req.query.capacity;
    if ( a_req.query.admins )
        params.admin = JSON.parse( a_req.query.admins );

    sendMessage( "RepoUpdateRequest", params, a_req, a_resp, function( reply ) {
        a_resp.json({});
    });
});

app.get('/api/repo/alloc/list/by_repo', ( a_req, a_resp ) => {
    sendMessage( "RepoListAllocationsRequest", {id:a_req.query.id}, a_req, a_resp, function( reply ) {
        a_resp.json(reply.alloc?reply.alloc:[]);
    });
});

app.get('/api/repo/alloc/list/by_user', ( a_req, a_resp ) => {
    sendMessage( "RepoListUserAllocationsRequest", {}, a_req, a_resp, function( reply ) {
        a_resp.json(reply.alloc?reply.alloc:[]);
    });
});

app.get('/api/repo/alloc/list/by_proj', ( a_req, a_resp ) => {
    sendMessage( "RepoListProjectAllocationsRequest", {id:a_req.query.id}, a_req, a_resp, function( reply ) {
        a_resp.json(reply.alloc?reply.alloc:[]);
    });
});

app.get('/api/repo/alloc/list/by_owner', ( a_req, a_resp ) => {
    sendMessage( "RepoListOwnerAllocationsRequest", {id:a_req.query.id}, a_req, a_resp, function( reply ) {
        a_resp.json(reply.alloc?reply.alloc:[]);
    });
});

app.get('/api/repo/alloc/stats', ( a_req, a_resp ) => {
    sendMessage( "RepoAllocationStatsRequest", {repo:a_req.query.repo,subject:a_req.query.subject}, a_req, a_resp, function( reply ) {
        a_resp.json(reply.alloc?reply.alloc:{});
    });
});

app.get('/api/repo/alloc/set', ( a_req, a_resp ) => {
    sendMessage( "RepoAllocationSetRequest", {repo:a_req.query.repo,subject:a_req.query.subject,alloc:a_req.query.alloc}, a_req, a_resp, function( reply ) {
        a_resp.json({});
    });
});

app.get('/api/top/list', ( a_req, a_resp ) => {
    var params = {topicId:a_req.query.id?a_req.query.id:"t/root"};
    console.log("params:",params);
    sendMessage( "TopicListRequest", params, a_req, a_resp, function( reply ) {
        a_resp.json(reply.item?reply.item:[]);
    });
});

app.get('/api/top/link', ( a_req, a_resp ) => {
    sendMessage( "TopicLinkRequest", {topic:a_req.topic,id:a_req.query.id}, a_req, a_resp, function( reply ) {
        a_resp.json({});
    });
});

app.get('/api/top/unlink', ( a_req, a_resp ) => {
    sendMessage( "TopicUnlinkRequest", {topic:a_req.topic,id:a_req.query.id}, a_req, a_resp, function( reply ) {
        a_resp.json({});
    });
});

app.get('/ui/ep/view', ( a_req, a_resp ) => {
    console.log("/ui/ep/view", a_req.query.ep );

    var userinfo = JSON.parse(a_req.cookies['sdms-user']);
    //console.log("userinfo", userinfo );

    request.get({
        uri: 'https://transfer.api.globusonline.org/v0.10/endpoint/' + encodeURIComponent(a_req.query.ep),
        auth: {
            bearer: userinfo.acc_tok,
        }
    }, function( error, response, body ) {
        a_resp.json(JSON.parse(body));
    });

});

app.get('/ui/ep/autocomp', ( a_req, a_resp ) => {
    console.log("/ui/eo/autocomp", a_req.query.term);

    var userinfo = JSON.parse(a_req.cookies['sdms-user']);
    //console.log("userinfo", userinfo );

    request.get({
        uri: 'https://transfer.api.globusonline.org/v0.10/endpoint_search?filter_scope=all&fields=display_name,canonical_name,id,description,organization,activated,expires_in,default_directory&filter_fulltext='+a_req.query.term,
        auth: {
            bearer: userinfo.acc_tok,
        }
    }, function( error, response, body ) {
        a_resp.json(JSON.parse(body));
    });

});

app.get('/ui/ep/recent/load', ( a_req, a_resp ) => {
    sendMessage( "UserGetRecentEPRequest", {}, a_req, a_resp, function( reply ) {
        a_resp.json(reply.ep?reply.ep:[]);
    });

    //var recent = a_req.cookies['sdms-recent'];
    //a_resp.json(recent?JSON.parse(recent):[]);
});

app.post('/ui/ep/recent/save', ( a_req, a_resp ) => {
    sendMessage( "UserSetRecentEPRequest", a_req.body, a_req, a_resp, function( reply ) {
        a_resp.json({});
    });
    //a_resp.cookie( 'sdms-recent', a_req.query.recent, { path: "/ui" });
    //a_resp.json({});
});

app.get('/ui/ep/dir/list', ( a_req, a_resp ) => {
    console.log("/ui/ep/dir/list", a_req.query.ep, a_req.query.path );

    var userinfo = JSON.parse(a_req.cookies['sdms-user']);
    //console.log("userinfo", userinfo );

    request.get({
        uri: 'https://transfer.api.globusonline.org/v0.10/operation/endpoint/' + encodeURIComponent(a_req.query.ep) + '/ls?path=' + encodeURIComponent(a_req.query.path) + '&show_hidden=' + a_req.query.hidden,
        auth: {
            bearer: userinfo.acc_tok,
        }
    }, function( error, response, body ) {
        console.log("ep ls err:",error);
        console.log("ep ls body sz:",body.length );
        a_resp.json(JSON.parse(body));
    });

});


app.get('/ui/theme/load', ( a_req, a_resp ) => {
    var theme = a_req.cookies['sdms-theme'];
    a_resp.send( theme );
});

app.get('/ui/theme/save', ( a_req, a_resp ) => {
    a_resp.cookie( 'sdms-theme', a_req.query.theme, { path: "/ui", maxAge: 100000000000 });
    a_resp.send("");
});


function saveToken( a_uid, a_acc_tok, a_ref_tok ) {
    sendMessageDirect( "UserSaveTokensRequest", a_uid, { access: a_acc_tok, refresh: a_ref_tok }, function( reply ) {
    });
}


function allocRequestContext( a_response, a_callback ) {
    var ctx = g_ctx_next;
    if ( ctx == MAX_CTX ) {
        ctx = g_ctx.indexOf( null );
        if ( ctx == -1 ) {
            if ( a_response ) {
                a_response.status( 503 );
                a_response.send( "Server too busy" );
            }
        } else {
            a_callback( ctx );
        }
    } else if ( ++g_ctx_next < MAX_CTX ) {
        if ( g_ctx[g_ctx_next] )
            g_ctx_next = MAX_CTX;
        a_callback( ctx );
    }
}


function sendMessage( a_msg_name, a_msg_data, a_req, a_resp, a_cb ) {
    var client = a_req.cookies[ 'sdms' ];

    a_resp.setHeader('Content-Type', 'application/json');

    if ( !client ) {
        a_resp.status(403).send( "Not authorized" );
        return;
    }

    //console.log("sendMsg parms:",a_msg_data);
    allocRequestContext( a_resp, function( ctx ){
        var msg = g_msg_by_name[a_msg_name];
        if ( !msg )
            throw "Invalid message type: " + a_msg_name;

        var msg_buf = msg.encode(a_msg_data).finish();
        //console.log( "snd msg, type:", msg._msg_type, ", len:", msg_buf.length );

        /* Frame contents (C++)
        uint32_t    size;       // Size of buffer
        uint8_t     proto_id;
        uint8_t     msg_id;
        uint16_t    isContext
        */
        var frame = Buffer.alloc(8);
        frame.writeUInt32LE( msg_buf.length, 0 );
        frame.writeUInt8( msg._pid, 4 );
        frame.writeUInt8( msg._mid, 5 );
        frame.writeUInt16LE( ctx, 6 );

        g_ctx[ctx] = function( a_reply ) {
            if ( !a_reply ) {
                console.log("empty reply");
                a_resp.status(500).send( "Empty reply" );
            } else if ( a_reply.errCode ) {
                if ( a_reply.errMsg ) {
                    console.log("error", a_reply.errMsg);
                    a_resp.status(500).send( a_reply.errMsg );
                } else {
                    a_resp.status(500).send( "error code: " + a_reply.errCode );
                    console.log("error", a_reply.errCode);
                }
            } else {
                a_cb( a_reply );
            }
        };

        //console.log("frame buffer", frame.toString('hex'));
        //console.log("msg buffer", msg_buf.toString('hex'));

        //console.log( "sendMsg:", a_msg_name );
        if ( msg_buf.length )
            g_core_sock.send([ nullfr, frame, client, msg_buf ]);
        else
            g_core_sock.send([ nullfr, frame, client ]);
    });
}


function sendMessageDirect( a_msg_name, a_client, a_msg_data, a_cb ) {
    var msg = g_msg_by_name[a_msg_name];
    if ( !msg )
        throw "Invalid message type: " + a_msg_name;

    allocRequestContext( null, function( ctx ){
        var msg_buf = msg.encode(a_msg_data).finish();
        //console.log( "snd msg, type:", msg._msg_type, ", len:", msg_buf.length );

        var frame = Buffer.alloc(8);
        frame.writeUInt32LE( msg_buf.length, 0 );
        frame.writeUInt8( msg._pid, 4 );
        frame.writeUInt8( msg._mid, 5 );
        frame.writeUInt16LE( ctx, 6 );

        g_ctx[ctx] = a_cb;

        //console.log( "sendMsgDirect:", a_msg_name );
        if ( msg_buf.length )
            g_core_sock.send([ nullfr, frame, a_client, msg_buf ]);
        else
            g_core_sock.send([ nullfr, frame, a_client ]);
    });
}

protobuf.load("SDMS_Anon.proto", function(err, root) {
    if ( err )
        throw err;

    console.log('SDMS_Anon.proto loaded');

    var msg = root.lookupEnum( "SDMS.Anon.Protocol" );
    if ( !msg )
        throw "Missing Protocol enum in SDMS.Anon proto file";
    
    var mlist = msg.parent.order;
    var pid = msg.values.ID;

    for ( var i = 0; i < mlist.length - 1; i++ ) {
        msg = mlist[i+1];

        msg._pid = pid;
        msg._mid = i;
        msg._msg_type = (pid << 8) | i;

        g_msg_by_id[ msg._msg_type ] = msg;
        g_msg_by_name[ msg.name ] = msg;
    }
});

protobuf.load("SDMS_Auth.proto", function(err, root) {
    if ( err )
        throw err;

    console.log('SDMS_Auth.proto loaded');

    var msg = root.lookupEnum( "SDMS.Auth.Protocol" );
    if ( !msg )
        throw "Missing Protocol enum in SDMS.Auth proto file";
    
    var mlist = msg.parent.order;
    var pid = msg.values.ID;
    // Skip first entry which is Protocol enum
    for ( var i = 0; i < mlist.length-1; i++ ) {
        msg = mlist[i+1];

        msg._pid = pid;
        msg._mid = i;
        msg._msg_type = (pid << 8) | i;

        g_msg_by_id[ msg._msg_type ] = msg;
        g_msg_by_name[ msg.name ] = msg;
    }
});

process.on('unhandledRejection', (reason, p) => {
    console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
});

g_core_sock.on('message', function( delim, frame, client, msg_buf ) {
    //console.log( "got msg", delim, frame, msg_buf );
    //console.log( "frame", frame.toString('hex') );
    var mlen = frame.readUInt32LE( 0 );
    var mtype = (frame.readUInt8( 4 ) << 8 ) | frame.readUInt8( 5 );
    var ctx = frame.readUInt16LE( 6 );

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
                    console.log( "decode failed" );
            } catch ( err ) {
                console.log( "decode failed:", err );
            }
        } else {
            msg = msg_class;
        }
    } else {
        console.log( "unkown mtype" );
    }

    var f = g_ctx[ctx];
    if ( f ) {
        g_ctx[ctx] = null;
        g_ctx_next = ctx;
        f( msg );
    } else {
        console.log( "no callback found!" );
    }
});

if ( process.argv.length > 2 ){
    // Only argument supported is path to a configuration file
    defaultSettings();

    console.log( "Reading configuration from file", process.argv[2] );
    try{
        var config = ini.parse(fs.readFileSync(process.argv[2],'utf-8'));
        if ( config.server ){
            g_host = config.server.host || g_host;
            g_port = config.server.port || g_port;
            g_server_key_file = config.server.key_file || g_server_key_file;
            g_server_cert_file = config.server.cert_file || g_server_cert_file;
        }
        if ( config.core ){
            g_core_serv_addr = config.core.server_address || g_core_serv_addr;
        }
    }catch( e ){
        console.log( "Could not open/parse configuration file", process.argv[2] );
        console.log( e.message );
    }

    startServer();
}else{
    defaultSettings();
    startServer();
}
