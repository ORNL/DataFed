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
var cookieParser = require('cookie-parser'); // cookies for user state
var https = require('https');
var request = require('request');
const fs = require('fs');
var protobuf = require("protobufjs");
var zmq = require("zeromq");
const app = express();
var ECT = require('ect'); // for html templates
var ectRenderer = ECT({ watch: true, root: __dirname + '/views', ext : '.ect' });
const port = 443;

var server_key = process.env.SDMS_WEB_KEY || 'sdms_web_key.pem';
var server_cert = process.env.SDMS_WEB_CERT || 'sdms_web_cert.pem';

var privateKey  = fs.readFileSync( server_key, 'utf8');
var certificate = fs.readFileSync( server_cert, 'utf8');
var web_credentials = {key: privateKey, cert: certificate};
var g_anon;
var g_auth;
var g_msg_by_id = {};
var g_msg_by_name = {};

const oauth_credentials = {
    clientId: '7bc68d7b-4ad4-4991-8a49-ecbfcae1a454',
    clientSecret: 'FpqvBscUorqgNLXKzlBAV0EQTdLXtBTTnGpf0+YnKEQ=',
    authorizationUri: 'https://auth.globus.org/v2/oauth2/authorize',
    accessTokenUri: 'https://auth.globus.org/v2/oauth2/token',
    redirectUri: 'https://sdms.ornl.gov:443/ui/authn',
    scopes: 'urn:globus:auth:scope:transfer.api.globus.org:all offline_access openid'
};

//scopes: ['openid','urn:globus:auth:scope:transfer.api.globus.org:all']

// Initialize the OAuth2 Library
const ClientOAuth2 = require('client-oauth2');
var globus_auth = new ClientOAuth2( oauth_credentials );

//--- This is a HACK to gt around lack of host cert
var agentOptions;
var agent;

agentOptions = {
    host : 'sdms.ornl.gov',
    port : '443',
    path : '/',
    rejectUnauthorized : false
};

agent = new https.Agent(agentOptions);

const MAX_CTX = 50;
var g_ctx = new Array( MAX_CTX );
g_ctx.fill(null);
var g_ctx_next = 0;

var serv_addr = 'tcp://sdms.ornl.gov:9001';
const nullfr = Buffer.from([]);
var core_sock = zmq.socket('dealer');
core_sock.connect( serv_addr );
console.log('Connected to SDMS at', serv_addr );

//console.log(  __dirname + '/static' );
app.use( express.static( __dirname + '/static' ));
app.use( cookieParser() );
app.set( 'view engine', 'ect' );
app.engine( 'ect', ectRenderer.render );


app.get('/', (request, response) => {
    console.log("get /");

    if ( request.cookies['sdms'] )
        response.redirect( '/ui/main' );
    else
        response.redirect('/ui');
});

app.get('/ui', (request, response) => {
    console.log("get /ui");
    console.log( "sdms cookie:", request.cookies['sdms'] );

    if ( request.cookies['sdms'] )
        response.redirect( '/ui/main' );
    else
        response.render('index');
});

app.get('/ui/main', (request, response) => {
    console.log("get /ui/main");
    console.log( "sdms cookie:", request.cookies['sdms'] );

    if ( request.cookies['sdms'] )
        response.render( 'main' );
    else
        response.redirect( '/ui' );
});

app.get('/ui/docs', (request, response) => {
    response.render( 'docs' );
});

app.get('/ui/register', (request, response) => {
    console.log("get /ui/register", request.query.acc_tok, request.query.ref_tok );

    response.render('register', { acc_tok: request.query.acc_tok, ref_tok: request.query.ref_tok });
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
    console.log("get /ui/error");

    response.render('error');
});

app.get('/ui/authn', ( a_request, a_response ) => {
    console.log( 'get /user_auth', a_request.originalUrl );

    // TODO Need to understand error flow here - there doesn't seem to be anhy error handling

    globus_auth.code.getToken( a_request.originalUrl ).then( function( client_token ) {
        console.log( 'client token:', client_token );
        var xfr_token = client_token.data.other_tokens[0];
        console.log( 'xfr token:', xfr_token );

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
                user: oauth_credentials.clientId,
                pass: oauth_credentials.clientSecret
            },
            body: 'token=' + client_token.accessToken + '&include=identities_set'
        }, function( error, response, body ) {
            var userinfo = null;

            if ( response.statusCode >= 200 && response.statusCode < 300 ) {
                console.log( 'got user info:', body );
                userinfo = JSON.parse( body );
                userinfo.uid = userinfo.username.substr( 0, userinfo.username.indexOf( "@" ));

                sendMessageDirect( "UserFindByUUIDsRequest", "sdms", { uuid: userinfo.identities_set }, function( reply ) {
                    console.log( "UserFindByUUIDsRequest reply:", reply );

                    if ( !reply  ) {
                        console.log("User find error. Reply:", reply );
                        a_response.redirect( "/ui/error" );
                    } else if ( !reply.user || !reply.user.length ) {
                        // Not registered
                        console.log("User not registered", userinfo );
                        a_response.cookie( 'sdms-user', JSON.stringify( userinfo ), { path: "/ui" });
                        //a_response.redirect( "/ui/register" );
                        a_response.redirect( "/ui/register?acc_tok=" + xfr_token.access_token + "&ref_tok=" + xfr_token.refresh_token );
                    } else {
                        // Registered, save access token
                        saveToken( userinfo.uid, xfr_token.access_token, xfr_token.refresh_token );

                        // TODO Account may be disable from SDMS (active = false)
                        a_response.cookie( 'sdms', userinfo.uid, { httpOnly: true });
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

            a_resp.cookie( 'sdms', userinfo.uid, { httpOnly: true });
            //a_response.cookie( 'sdms-user', JSON.stringify( user ), { path:"/ui" });
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
    if ( a_req.query.desc )
        params.desc = a_req.query.desc;
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
        a_resp.send(reply.group);
    });
});

app.get('/api/grp/delete', ( a_req, a_resp ) => {
    sendMessage( "GroupDeleteRequest", { uid: a_req.query.uid, gid: a_req.query.gid }, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/dat/search', ( a_req, a_resp ) => {
    sendMessage( "RecordSearchRequest", { query: a_req.query.query, scope: a_req.query.scope }, a_req, a_resp, function( reply ) {
        a_resp.send(reply.item?reply.item:[]);
    });
});

app.get('/api/dat/create', ( a_req, a_resp ) => {
    var params  = {
        title: a_req.query.title,
        alias: a_req.query.alias,
        desc: a_req.query.desc,
        metadata: a_req.query.md,
        parentId:  a_req.query.coll
    };

    sendMessage( "RecordCreateRequest", params, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/dat/update', ( a_req, a_resp ) => {
    var params = { id:  a_req.query.id };
    if ( a_req.query.title )
        params.title = a_req.query.title;

    if ( a_req.query.alias )
        params.alias = a_req.query.alias;

    if ( a_req.query.desc )
        params.desc = a_req.query.desc;

    if ( a_req.query.public != undefined )
        params.public = a_req.query.public;

    if ( a_req.query.md ) {
        params.metadata = a_req.query.md;
        if ( a_req.query.mdset )
            params.mdset = true;
    }

    sendMessage( "RecordUpdateRequest", params, a_req, a_resp, function( reply ) {
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

app.get('/api/has_perms', ( a_req, a_resp ) => {
    sendMessage( "CheckPermsRequest", { id: a_req.query.id, perms: a_req.query.perms }, a_req, a_resp, function( reply ) {
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

app.get('/api/col/create', ( a_req, a_resp ) => {
    var params  = {
        title: a_req.query.title,
        alias: a_req.query.alias,
        desc: a_req.query.desc,
        parentId: a_req.query.coll
    };

    sendMessage( "CollCreateRequest", params, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/col/update', ( a_req, a_resp ) => {
    var params = { id:  a_req.query.id };
    if ( a_req.query.title )
        params.title = a_req.query.title;

    if ( a_req.query.alias )
        params.alias = a_req.query.alias;

    if ( a_req.query.desc )
        params.desc = a_req.query.desc;

    sendMessage( "CollUpdateRequest", params, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/col/delete', ( a_req, a_resp ) => {
    sendMessage( "CollDeleteRequest", { id: a_req.query.id, mode:(a_req.query.mode=="all"?0:1) }, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/col/view', ( a_req, a_resp ) => {
    sendMessage( "CollViewRequest", { id: a_req.query.id }, a_req, a_resp, function( reply ) {
        if ( reply.data && reply.data.length )
            a_resp.send(reply.data[0]);
        else
            a_resp.send();
    });
});

app.get('/api/col/read', ( a_req, a_resp ) => {
    sendMessage( "CollReadRequest", { id: a_req.query.id }, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/col/get_parents', ( a_req, a_resp ) => {
    sendMessage( "CollGetParentsRequest", { id: a_req.query.id }, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/link', ( a_req, a_resp ) => {
    sendMessage( "CollWriteRequest", { id: a_req.query.coll, add: [a_req.query.item] }, a_req, a_resp, function( reply ) {
        if ( a_req.query.unlink ) {
            sendMessage( "CollWriteRequest", { id: a_req.query.unlink, rem: [a_req.query.item] }, a_req, a_resp, function( reply2 ) {
                a_resp.send(reply2);
            });
        } else
            a_resp.send(reply);
    });
});

app.get('/api/unlink', ( a_req, a_resp ) => {
    sendMessage( "CollWriteRequest", { id: a_req.query.coll, rem: [a_req.query.item] }, a_req, a_resp, function( reply ) {
        console.log("unlink rooted:",reply.item);
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
        console.log( "repo list:",reply.repo);
        a_resp.json(reply.repo?reply.repo:[]);
    });
});

app.get('/api/repo/view', ( a_req, a_resp ) => {
    sendMessage( "RepoViewRequest", {id:a_req.query.id}, a_req, a_resp, function( reply ) {
        console.log( "repo:",reply.repo);
        a_resp.json(reply.repo?reply.repo:[]);
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

app.get('/api/repo/alloc/stats', ( a_req, a_resp ) => {
    console.log("alloc stats");
    sendMessage( "RepoAllocationStatsRequest", {repo:a_req.query.repo,subject:a_req.query.subject}, a_req, a_resp, function( reply ) {
        console.log("alloc stats reply", reply.alloc);
        a_resp.json(reply.alloc?reply.alloc:{});
    });
});

app.get('/api/repo/alloc/set', ( a_req, a_resp ) => {
    console.log("alloc set");
    sendMessage( "RepoAllocationSetRequest", {repo:a_req.query.repo,subject:a_req.query.subject,alloc:a_req.query.alloc}, a_req, a_resp, function( reply ) {
        console.log("alloc set reply");
        a_resp.json(reply.alloc?reply.alloc:{});
    });
});

protobuf.load("SDMS_Anon.proto", function(err, root) {
    if ( err )
        throw err;

    g_anon = root;

    console.log('anon protobuf loaded');

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

    g_auth = root;

    console.log('auth protobuf loaded');

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

function saveToken( a_uid, a_acc_tok, a_ref_tok ) {
    console.log( "save token", a_uid, a_acc_tok, a_ref_tok );

    sendMessageDirect( "UserSaveTokensRequest", a_uid, { access: a_acc_tok, refresh: a_ref_tok }, function( reply ) {
    });
}

core_sock.on('message', function( delim, frame, client, msg_buf ) {
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
            core_sock.send([ nullfr, frame, client, msg_buf ]);
        else
            core_sock.send([ nullfr, frame, client ]);
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
            core_sock.send([ nullfr, frame, a_client, msg_buf ]);
        else
            core_sock.send([ nullfr, frame, a_client ]);
    });
}


process.on('unhandledRejection', (reason, p) => {
    console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
});


var httpsServer = https.createServer( web_credentials, app );
httpsServer.listen( port );
