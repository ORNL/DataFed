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
//var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser'); // cookies for user state
var http = require('http');
var https = require('https');
const constants = require('crypto');
const helmet = require('helmet');
const fs = require('fs');
const ini = require('ini');
const app = express();
var ECT = require('ect'); // for html templates
var comm = require('./comm.js');
var ectRenderer = ECT({ watch: true, root: __dirname + '/views', ext : '.ect' });


// Any config options / vars that need to be shared with loaded modules must go here
var opts = {};

var g_host,
    g_port,
    g_server_key_file,
    g_server_cert_file,
    g_server_chain_file,
    g_system_secret,
    g_session_secret,
    g_core_serv_addr,
    g_ready_start = 4, // Number of async tasks to be completed before server start (general + 3 proto files loaded)
    g_ver_major,
    g_ver_mapi_major,
    g_ver_mapi_minor,
    g_ver_web,
    g_tls;



loadSettings();

express.static.mime.define({'application/javascript': ['js']});

// Enforce HSTS
app.use(helmet());

app.use( express.static( __dirname + '/static' ));
// body size limit = 100*max metadata size, which is 100 Kb
app.use( express.json({ type: 'application/json', limit: '1048576'}));
app.use( express.text({ type: 'text/plain', limit: '1048576'}));
// Setup session management and cookie settings
app.use( session({
    secret: g_session_secret,
    resave: false,
    rolling: true,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        maxAge: 432000000, // 5 days in msec
        secure: g_tls, // if tls is true, enable secure cookies
        sameSite: "lax"
    }
}));

app.use( cookieParser( g_session_secret ));
app.use(
    helmet({
        hsts: {
            maxAge: 31536000
        },
        contentSecurityPolicy:{
            useDefaults: true,
            directives: {
                "script-src": [
                    "'self'",
                    "'unsafe-inline'",
                    "https://cdnjs.cloudflare.com",
                    "https://cdn.jsdelivr.net",
                    "https://d3js.org",
                    "blob:"
                ],
                "img-src": [ "*", "data:" ]
            }
        }
    })
);

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
        console.log("Access welcome from", a_req.remoteAddress );

        var theme = a_req.cookies['datafed-theme']|| "light";
        a_resp.render('index',{ theme: theme, version: opts.version, test_mode: opts.test_mode });
    }
});

app.get('/ui/main', (a_req, a_resp) => {
    if ( a_req.session.uid && a_req.session.reg ){
        console.log( "Access main (", a_req.session.uid, ") from", a_req.connection.remoteAddress );

        var theme = a_req.cookies['datafed-theme'] || "light";
        a_resp.render( 'main',{ user_uid: a_req.session.uid, theme: theme, version: opts.version, test_mode: opts.test_mode });
    }else{
        console.log("no session",a_req.session);
        // datafed-user cookie not set, so clear datafed-id before redirect
        //a_resp.clearCookie( 'datafed-id' );
        a_resp.redirect( '/' );
    }
});




app.get('/ui/error', (a_req, a_resp) => {
    a_resp.render('error',{ theme: "light", version: opts.version, test_mode: opts.test_mode });
});


app.get('/api/usr/register', ( a_req, a_resp ) => {
    console.log( '/api/usr/register', a_req.session );

    if ( !a_req.session.uid ){
        console.log( 'Not logged in' );
        throw "Error: not authenticated.";
    } else if ( a_req.session.reg ){
        console.log( 'Already registered' );
        throw "Error: already registered.";
    } else {
        console.log( 'Registering user', a_req.session.uid );

        comm.sendMessageDirect( "UserCreateRequest", "", {
            uid: a_req.session.uid,
            password: a_req.query.pw,
            name: a_req.session.name,
            email: a_req.session.email,
            uuid: a_req.session.uuids,
            secret: g_system_secret
        }, function( reply ) {
            if ( !reply ) {
                console.log("Error: user registration failed - empty reply from server");
                a_resp.status(500).send( "Empty reply from server" );
            } else if ( reply.errCode ) {
                if ( reply.errMsg ) {
                    console.log("Error: user registration failed - ", reply.errMsg);
                    a_resp.status(500).send( reply.errMsg );
                } else {
                    console.log("Error: user registration failed - code:", reply.errCode);
                    a_resp.status(500).send( "Error code: " + reply.errCode );
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

                a_resp.send( reply );
            }
        });
    }
});

app.get('/api/msg/daily', ( a_req, a_resp ) => {
    comm.sendMessageDirect( "DailyMessageRequest", null, {}, function( reply ) {
        a_resp.json( reply );
    });
});

app.get('/api/usr/find/by_uuids', ( a_req, a_resp ) => {
    comm.sendMessage( "UserFindByUUIDsRequest", { uuid: a_req.query.uuids }, a_req, a_resp, function( reply ) {
        a_resp.json( reply.user[0] );
    });
});

app.get('/api/usr/find/by_name_uid', ( a_req, a_resp ) => {
    var par = {nameUid: a_req.query.name_uid};
    if ( a_req.query.offset != undefined && a_req.query.count != undefined ){
        par.offset = a_req.query.offset;
        par.count = a_req.query.count;
    }

    comm.sendMessage( "UserFindByNameUIDRequest", par, a_req, a_resp, function( reply ) {
        a_resp.send( reply );
    });
});

app.get('/api/usr/view', ( a_req, a_resp ) => {
    //console.log("/usr/view:",a_req.query.id);
    comm.sendMessage( "UserViewRequest", { uid: a_req.query.id, details:(a_req.query.details=="true"?true:false)}, a_req, a_resp, function( reply ) {
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

    comm.sendMessage( "UserUpdateRequest", params, a_req, a_resp, function( reply ) {
        a_resp.json( reply.user[0] );
    });
});

app.get('/api/usr/revoke_cred', ( a_req, a_resp ) => {
    //console.log("/api/usr/revoke_cred");
    comm.sendMessage( "RevokeCredentialsRequest", {}, a_req, a_resp, function( reply ) {
        a_resp.json({});
    });
});

app.get('/api/usr/list/all', ( a_req, a_resp ) => {
    var par = {};
    if ( a_req.query.offset != undefined && a_req.query.count != undefined ){
        par.offset = a_req.query.offset;
        par.count = a_req.query.count;
    }

    comm.sendMessage( "UserListAllRequest", par, a_req, a_resp, function( reply ) {
        a_resp.json(reply);
    });
});

app.get('/api/usr/list/collab', ( a_req, a_resp ) => {
    var par = {};
    if ( a_req.query.offset != undefined && a_req.query.count != undefined ){
        par.offset = a_req.query.offset;
        par.count = a_req.query.count;
    }

    comm.sendMessage( "UserListCollabRequest", par, a_req, a_resp, function( reply ) {
        a_resp.json(reply);
    });
});

app.post('/api/prj/create', ( a_req, a_resp ) => {
    comm.sendMessage( "ProjectCreateRequest", a_req.body, a_req, a_resp, function( reply ) {
        if ( reply.proj )
            a_resp.send(reply.proj);
        else
            a_resp.send([]);
    });
});

app.post('/api/prj/update', ( a_req, a_resp ) => {
    comm.sendMessage( "ProjectUpdateRequest", a_req.body, a_req, a_resp, function( reply ) {
        if ( reply.proj )
            a_resp.send(reply.proj);
        else
            a_resp.send([]);
    });
});

app.get('/api/prj/delete', ( a_req, a_resp ) => {
    comm.sendMessage( "ProjectDeleteRequest", { id: JSON.parse(a_req.query.ids)}, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/prj/view', ( a_req, a_resp ) => {
    comm.sendMessage( "ProjectViewRequest", { id: a_req.query.id }, a_req, a_resp, function( reply ) {
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
    comm.sendMessage( "ProjectListRequest", params, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.post('/api/prj/search', ( a_req, a_resp ) => {
    //console.log("search:",a_req.body);
    comm.sendMessage( "ProjectSearchRequest", a_req.body, a_req, a_resp, function( reply ) {
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

    comm.sendMessage( "GroupCreateRequest", params, a_req, a_resp, function( reply ) {
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

    comm.sendMessage( "GroupUpdateRequest", params, a_req, a_resp, function( reply ) {
        a_resp.send(reply.group[0]);
    });
});

app.get('/api/grp/view', ( a_req, a_resp ) => {
    comm.sendMessage( "GroupViewRequest", { uid: a_req.query.uid, gid: a_req.query.gid }, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/grp/list', ( a_req, a_resp ) => {
    comm.sendMessage( "GroupListRequest", { uid: a_req.query.uid }, a_req, a_resp, function( reply ) {
        a_resp.send(reply.group?reply.group:[]);
    });
});

app.get('/api/grp/delete', ( a_req, a_resp ) => {
    comm.sendMessage( "GroupDeleteRequest", { uid: a_req.query.uid, gid: a_req.query.gid }, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

/*
app.get('/api/dat/search', ( a_req, a_resp ) => {
    comm.sendMessage( "RecordSearchRequest", { query: a_req.query.query, scope: a_req.query.scope }, a_req, a_resp, function( reply ) {
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

    comm.sendMessage( "QueryListRequest", par, a_req, a_resp, function( reply ) {
        a_resp.send(reply.item?reply.item:[]);
    });
});


app.post('/api/query/create', ( a_req, a_resp ) => {
    console.log("save:",a_req.body);
    comm.sendMessage( "QueryCreateRequest", {title: a_req.query.title, query: a_req.body }, a_req, a_resp, function( reply ) {
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

    comm.sendMessage( "QueryUpdateRequest", params, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/query/delete', ( a_req, a_resp ) => {
    comm.sendMessage( "QueryDeleteRequest", { id: JSON.parse(a_req.query.ids)}, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/query/view', ( a_req, a_resp ) => {
    comm.sendMessage( "QueryViewRequest", {id:a_req.query.id}, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/query/exec', ( a_req, a_resp ) => {
    var msg = {
        id : a_req.query.id
    };

    if ( a_req.query.offset != undefined && a_req.query.count != undefined ){
        msg.offset = a_req.query.offset;
        msg.count = a_req.query.count;
    }

    comm.sendMessage( "QueryExecRequest", msg, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});


app.post('/api/dat/search', ( a_req, a_resp ) => {
    console.log("search:",a_req.body);
    //var msg = g_msg_by_name["SearchRequest"];
    //var msg_buf = msg.encode(JSON.stringify( a_req.body )).finish();
    //var msg2 = msg.decode( msg_buf );
    //console.log("msg2",msg2);

    comm.sendMessage( "SearchRequest", a_req.body, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.post('/api/dat/create', ( a_req, a_resp ) => {
    comm.sendMessage( "RecordCreateRequest", a_req.body, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.post('/api/dat/create/batch', ( a_req, a_resp ) => {
    //console.log( "dat create batch", a_req.headers['content-type'], typeof a_req.body );
    comm.sendMessage( "RecordCreateBatchRequest", {records:a_req.body}, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.post('/api/dat/update', ( a_req, a_resp ) => {
    //console.log( "dat update", a_req.body );
    comm.sendMessage( "RecordUpdateRequest", a_req.body, a_req, a_resp, function( reply ) {
        if ( reply.data && reply.data.length ){
            console.log( "User", a_req.session.uid, "- data update, id:", reply.data[0].id );
        }
        a_resp.send(reply);
    });
});

app.post('/api/dat/update/batch', ( a_req, a_resp ) => {
    //console.log( "dat update batch", a_req.headers['content-type'], typeof a_req.body );
    comm.sendMessage( "RecordUpdateBatchRequest", {records:a_req.body}, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/dat/lock', ( a_req, a_resp ) => {
    //console.log("/dat/lock, lock:",a_req.query.lock);
    comm.sendMessage( "RecordLockRequest", { id: JSON.parse(a_req.query.ids), lock: a_req.query.lock=="true"?true:false}, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/dat/lock/toggle', ( a_req, a_resp ) => {
    comm.sendMessage( "RecordLockToggleRequest", { id: a_req.query.id }, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/dat/copy', ( a_req, a_resp ) => {
    var params  = {
        sourceId: a_req.query.src,
        destId: a_req.query.dst
    };

    comm.sendMessage( "DataCopyRequest", params, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/dat/delete', ( a_req, a_resp ) => {
    //console.log("/dat/delete",a_req.query.ids);
    comm.sendMessage( "RecordDeleteRequest", { id: JSON.parse(a_req.query.ids) }, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/dat/view', ( a_req, a_resp ) => {
    comm.sendMessage( "RecordViewRequest", { id: a_req.query.id }, a_req, a_resp, function( reply ) {
        if ( reply.data && reply.data.length )
            a_resp.send( reply );
        else
            a_resp.send();
    });
});

app.get('/api/dat/export', ( a_req, a_resp ) => {
    comm.sendMessage( "RecordExportRequest", { id: JSON.parse( a_req.query.ids )}, a_req, a_resp, function( reply ) {
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

    comm.sendMessage( "RecordListByAllocRequest", par, a_req, a_resp, function( reply ) {
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

    comm.sendMessage( "DataGetRequest", par, a_req, a_resp, function( reply ) {
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

    comm.sendMessage( "DataPutRequest", par, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/dat/dep/get', ( a_req, a_resp ) => {
    comm.sendMessage( "RecordGetDependenciesRequest", { id: a_req.query.ids }, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/dat/dep/graph/get', ( a_req, a_resp ) => {
    comm.sendMessage( "RecordGetDependencyGraphRequest", { id: a_req.query.id }, a_req, a_resp, function( reply ) {
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

    comm.sendMessage( "RecordAllocChangeRequest", params, a_req, a_resp, function( reply ) {
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

    comm.sendMessage( "RecordOwnerChangeRequest", params, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.post('/api/metadata/validate', ( a_req, a_resp ) => {
    //console.log( "md val", a_req.body );
    comm.sendMessage( "MetadataValidateRequest", a_req.body, a_req, a_resp, function( reply ) {
        //console.log("rec update:",reply);
        a_resp.send(reply);
    });
});

app.get('/api/perms/check', ( a_req, a_resp ) => {
    var params = { id: a_req.query.id };
    if ( a_req.query.perms != undefined )
        params.perms = a_req.query.perms;
    if ( a_req.query.any != undefined )
        params.any = a_req.query.any;
    comm.sendMessage( "CheckPermsRequest", params, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/perms/get', ( a_req, a_resp ) => {
    var params = { id: a_req.query.id };
    if ( a_req.query.perms != undefined )
        params.perms = a_req.query.perms;
    comm.sendMessage( "GetPermsRequest", params, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/acl/view', ( a_req, a_resp ) => {
    comm.sendMessage( "ACLViewRequest", { id: a_req.query.id }, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/acl/update', ( a_req, a_resp ) => {
    comm.sendMessage( "ACLUpdateRequest", { id: a_req.query.id, rules: a_req.query.rules }, a_req, a_resp, function( reply ) {
        if ( reply.rule && reply.rule.length ){
            console.log( "User", a_req.session.uid, "- ACL update, id:", a_req.query.id, a_req.query.rules );
        }
        a_resp.send(reply);
    });
});

app.get('/api/acl/shared/list', ( a_req, a_resp ) => {
    comm.sendMessage( "ACLSharedListRequest", {incUsers:a_req.query.inc_users?true:false,incProjects:a_req.query.inc_projects?true:false}, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/acl/shared/list/items', ( a_req, a_resp ) => {
    comm.sendMessage( "ACLSharedListItemsRequest", {owner:a_req.query.owner}, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

/*
app.get('/api/acl/by_user', ( a_req, a_resp ) => {
    comm.sendMessage( "ACLByUserRequest", {}, a_req, a_resp, function( reply ) {
        if ( reply.user )
            a_resp.send(reply.user);
        else
            a_resp.send([]);
    });
});

app.get('/api/acl/by_user/list', ( a_req, a_resp ) => {
    comm.sendMessage( "ACLByUserListRequest", {owner:a_req.query.owner}, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/acl/by_proj', ( a_req, a_resp ) => {
    comm.sendMessage( "ACLByProjRequest", {}, a_req, a_resp, function( reply ) {
        if ( reply.proj )
            a_resp.send(reply.proj);
        else
            a_resp.send([]);
    });
});

app.get('/api/acl/by_proj/list', ( a_req, a_resp ) => {
    comm.sendMessage( "ACLByProjListRequest", {owner:a_req.query.owner}, a_req, a_resp, function( reply ) {
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
    comm.sendMessage( "NoteCreateRequest", params, a_req, a_resp, function( reply ) {
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

    comm.sendMessage( "NoteUpdateRequest", params, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/note/comment/edit', ( a_req, a_resp ) => {
    var params  = {
        id: a_req.query.id,
        comment: a_req.query.comment,
        commentIdx: a_req.query.comment_idx
    };

    comm.sendMessage( "NoteCommentEditRequest", params, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/note/view', ( a_req, a_resp ) => {
    comm.sendMessage( "NoteViewRequest", { id:a_req.query.id}, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/note/list/by_subject', ( a_req, a_resp ) => {
    comm.sendMessage( "NoteListBySubjectRequest", { subject:a_req.query.subject}, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/tag/search', ( a_req, a_resp ) => {
    var par = { name: a_req.query.name };
    if ( a_req.query.offset != undefined && a_req.query.count != undefined ){
        par.offset = a_req.query.offset;
        par.count = a_req.query.count;
    }

    comm.sendMessage( "TagSearchRequest", par, a_req, a_resp, function( reply ) {
        a_resp.json(reply);
    });
});

app.get('/api/tag/autocomp', ( a_req, a_resp ) => {
    var par = { name: a_req.query.term, offset: 0, count: 20 };

    comm.sendMessage( "TagSearchRequest", par, a_req, a_resp, function( reply ) {
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

    comm.sendMessage( "TagListByCountRequest", par, a_req, a_resp, function( reply ) {
        a_resp.json(reply);
    });
});

app.get('/api/task/list', ( a_req, a_resp ) => {
    var params = {};
    if ( a_req.query.since )
        params.since = a_req.query.since;
    comm.sendMessage( "TaskListRequest", params, a_req, a_resp, function( reply ) {
        a_resp.json(reply);
    });
});

app.get('/api/task/view', ( a_req, a_resp ) => {
    //console.log("task/view", a_req.query.id );
    comm.sendMessage( "TaskViewRequest", {"taskId":a_req.query.id}, a_req, a_resp, function( reply ) {
        a_resp.json(reply);
    });
});

app.post('/api/col/create', ( a_req, a_resp ) => {
    comm.sendMessage( "CollCreateRequest", a_req.body, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.post('/api/col/update', ( a_req, a_resp ) => {
    //console.log("col update:",a_req.body);
    comm.sendMessage( "CollUpdateRequest", a_req.body, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/col/delete', ( a_req, a_resp ) => {
    comm.sendMessage( "CollDeleteRequest", { id: JSON.parse(a_req.query.ids)}, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/col/view', ( a_req, a_resp ) => {
    comm.sendMessage( "CollViewRequest", { id: a_req.query.id }, a_req, a_resp, function( reply ) {
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
    comm.sendMessage( "CollReadRequest", par, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/col/get_parents', ( a_req, a_resp ) => {
    comm.sendMessage( "CollGetParentsRequest", { id: a_req.query.id }, a_req, a_resp, function( reply ) {
        //console.log("get_parents",reply);
        a_resp.send(reply);
    });
});

app.get('/api/col/get_offset', ( a_req, a_resp ) => {
    comm.sendMessage( "CollGetOffsetRequest", { id: a_req.query.id, item: a_req.query.item_id, pageSz: a_req.query.page_sz}, a_req, a_resp, function( reply ) {
        //console.log("get_offset - cb",a_req.query.id, a_req.query.item_id, a_req.query.page_sz);
        a_resp.send(reply);
    });
});

app.get('/api/col/move', ( a_req, a_resp ) => {
    //console.log("move items:",a_req.query.items,"src:",a_req.query.src_id,"dst:",a_req.query.dst_id);
    comm.sendMessage( "CollMoveRequest", { srcId: a_req.query.src_id, dstId: a_req.query.dst_id, item: JSON.parse(a_req.query.items) }, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/col/link', ( a_req, a_resp ) => {
    comm.sendMessage( "CollWriteRequest", { id: a_req.query.coll, add: JSON.parse(a_req.query.items) }, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/col/unlink', ( a_req, a_resp ) => {
    comm.sendMessage( "CollWriteRequest", { id: a_req.query.coll, rem: JSON.parse(a_req.query.items) }, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/col/published/list', ( a_req, a_resp ) => {
    var par = { subject: a_req.query.subject };
    if ( a_req.query.offset != undefined && a_req.query.count != undefined ){
        par.offset = a_req.query.offset;
        par.count = a_req.query.count;
    }

    comm.sendMessage( "CollListPublishedRequest", par, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});


app.post('/api/cat/search', ( a_req, a_resp ) => {
    comm.sendMessage( "CatalogSearchRequest", a_req.body, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});


app.post('/api/col/pub/search/data', ( a_req, a_resp ) => {
    comm.sendMessage( "RecordSearchPublishedRequest", a_req.body, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});


app.get('/api/repo/list', ( a_req, a_resp ) => {
    var params = {};
    if ( a_req.query.all )
        params.all = a_req.query.all;
    if ( a_req.query.details )
        params.details = a_req.query.details;
    comm.sendMessage( "RepoListRequest", params, a_req, a_resp, function( reply ) {
        a_resp.json(reply.repo?reply.repo:[]);
    });
});

app.get('/api/repo/view', ( a_req, a_resp ) => {
    comm.sendMessage( "RepoViewRequest", {id:a_req.query.id}, a_req, a_resp, function( reply ) {
        a_resp.json(reply.repo?reply.repo:[]);
    });
});

app.post('/api/repo/create', ( a_req, a_resp ) => {
    comm.sendMessage( "RepoCreateRequest", a_req.body, a_req, a_resp, function( reply ) {
        a_resp.json({});
    });
});

app.post('/api/repo/update', ( a_req, a_resp ) => {
    comm.sendMessage( "RepoUpdateRequest", a_req.body, a_req, a_resp, function( reply ) {
        a_resp.json({});
    });
});

app.get('/api/repo/delete', ( a_req, a_resp ) => {
    comm.sendMessage( "RepoDeleteRequest", {id:a_req.query.id}, a_req, a_resp, function( reply ) {
        a_resp.json({});
    });
});

app.get('/api/repo/calc_size', ( a_req, a_resp ) => {
    comm.sendMessage( "RepoCalcSizeRequest", {recurse:a_req.query.recurse=="true"?true:false,item:JSON.parse(a_req.query.items)}, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/repo/alloc/list/by_repo', ( a_req, a_resp ) => {
    comm.sendMessage( "RepoListAllocationsRequest", {id:a_req.query.id}, a_req, a_resp, function( reply ) {
        a_resp.json(reply.alloc?reply.alloc:[]);
    });
});

app.get('/api/repo/alloc/list/by_subject', ( a_req, a_resp ) => {
    var par = {};
    if ( a_req.query.subject != undefined )
        par.subject = a_req.query.subject;
    if ( a_req.query.stats == "true" )
        par.stats = true;

    comm.sendMessage( "RepoListSubjectAllocationsRequest", par, a_req, a_resp, function( reply ) {
        a_resp.json(reply.alloc?reply.alloc:[]);
    });
});

app.get('/api/repo/alloc/list/by_object', ( a_req, a_resp ) => {
    comm.sendMessage( "RepoListObjectAllocationsRequest", {id:a_req.query.id}, a_req, a_resp, function( reply ) {
        a_resp.json(reply.alloc?reply.alloc:[]);
    });
});

app.get('/api/repo/alloc/view', ( a_req, a_resp ) => {
    comm.sendMessage( "RepoViewAllocationRequest", {repo:a_req.query.repo,subject:a_req.query.subject}, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/repo/alloc/stats', ( a_req, a_resp ) => {
    comm.sendMessage( "RepoAllocationStatsRequest", {repo:a_req.query.repo,subject:a_req.query.subject}, a_req, a_resp, function( reply ) {
        a_resp.json(reply.alloc?reply.alloc:{});
    });
});

app.get('/api/repo/alloc/create', ( a_req, a_resp ) => {
    comm.sendMessage( "RepoAllocationCreateRequest", {repo:a_req.query.repo,subject:a_req.query.subject,dataLimit:a_req.query.data_limit,recLimit:a_req.query.rec_limit}, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/repo/alloc/delete', ( a_req, a_resp ) => {
    comm.sendMessage( "RepoAllocationDeleteRequest", {repo:a_req.query.repo,subject:a_req.query.subject}, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/repo/alloc/set', ( a_req, a_resp ) => {
    comm.sendMessage( "RepoAllocationSetRequest", {repo:a_req.query.repo,subject:a_req.query.subject,dataLimit:a_req.query.data_limit,recLimit:a_req.query.rec_limit}, a_req, a_resp, function( reply ) {
        a_resp.send(reply);
    });
});

app.get('/api/repo/alloc/set/default', ( a_req, a_resp ) => {
    var par = {repo:a_req.query.repo};
    if ( a_req.query.subject )
        par.subject = a_req.query.subject;

    comm.sendMessage( "RepoAllocationSetDefaultRequest", par, a_req, a_resp, function( reply ) {
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

    comm.sendMessage( "TopicListTopicsRequest", par, a_req, a_resp, function( reply ) {
        a_resp.json(reply);
    });
});

app.get('/api/top/list/coll', ( a_req, a_resp ) => {
    var par = {topicId:a_req.query.id};
    if ( a_req.query.offset != undefined && a_req.query.count != undefined ){
        par.offset = a_req.query.offset;
        par.count = a_req.query.count;
    }

    comm.sendMessage( "TopicListCollectionsRequest", par, a_req, a_resp, function( reply ) {
        a_resp.json(reply);
    });
});

app.get('/api/top/view', ( a_req, a_resp ) => {
    comm.sendMessage( "TopicViewRequest", { id: a_req.query.id }, a_req, a_resp, function( reply ) {
        a_resp.json(reply);
    });
});

app.get('/api/top/search', ( a_req, a_resp ) => {
    comm.sendMessage( "TopicSearchRequest", {phrase:a_req.query.phrase}, a_req, a_resp, function( reply ) {
        a_resp.json(reply);
    });
});

app.get('/api/sch/view', ( a_req, a_resp ) => {
    comm.sendMessage( "SchemaViewRequest", { id: a_req.query.id, resolve: a_req.query.resolve }, a_req, a_resp, function( reply ) {
        a_resp.json(reply);
    });
});

app.post('/api/sch/search', ( a_req, a_resp ) => {
    comm.sendMessage( "SchemaSearchRequest", a_req.body, a_req, a_resp, function( reply ) {
        a_resp.json(reply);
    });
});

app.post('/api/sch/create', ( a_req, a_resp ) => {
    comm.sendMessage( "SchemaCreateRequest", a_req.body, a_req, a_resp, function( reply ) {
        a_resp.json(reply);
    });
});

app.post('/api/sch/revise', ( a_req, a_resp ) => {
    comm.sendMessage( "SchemaReviseRequest", a_req.body, a_req, a_resp, function( reply ) {
        a_resp.json(reply);
    });
});

app.post('/api/sch/update', ( a_req, a_resp ) => {
    comm.sendMessage( "SchemaUpdateRequest", a_req.body, a_req, a_resp, function( reply ) {
        a_resp.json(reply);
    });
});

app.post('/api/sch/delete', ( a_req, a_resp ) => {
    comm.sendMessage( "SchemaDeleteRequest", { id: a_req.query.id }, a_req, a_resp, function( reply ) {
        a_resp.json(reply);
    });
});

app.get('/ui/ep/view', ( a_req, a_resp ) => {

    comm.sendMessage( "UserGetAccessTokenRequest", {}, a_req, a_resp, function( reply ) {
        const req_opts = {
            hostname: 'transfer.api.globusonline.org',
            method: 'GET',
            path: '/v0.10/endpoint/' + encodeURIComponent(a_req.query.ep),
            rejectUnauthorized: true,
            headers:{
                Authorization: ' Bearer ' + reply.access
            }
        };

        const req = https.request( req_opts, (res) => {
            var data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
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

    comm.sendMessage( "UserGetAccessTokenRequest", {}, a_req, a_resp, function( reply ) {

        const req_opts = {
            hostname: 'transfer.api.globusonline.org',
            method: 'GET',
            path: '/v0.10/endpoint_search?filter_scope=all&fields=display_name,canonical_name,id,description,organization,activated,expires_in,default_directory&filter_fulltext='+encodeURIComponent(a_req.query.term),
            rejectUnauthorized: true,
            headers:{
                Authorization: ' Bearer ' + reply.access
            }
        };

        const req = https.request( req_opts, (res) => {
            var data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
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
    comm.sendMessage( "UserGetRecentEPRequest", {}, a_req, a_resp, function( reply ) {
        a_resp.json(reply.ep?reply.ep:[]);
    });
});

app.post('/ui/ep/recent/save', ( a_req, a_resp ) => {
    comm.sendMessage( "UserSetRecentEPRequest", a_req.body, a_req, a_resp, function( reply ) {
        a_resp.json({});
    });
});

app.get('/ui/ep/dir/list', ( a_req, a_resp ) => {
    comm.sendMessage( "UserGetAccessTokenRequest", {}, a_req, a_resp, function( reply ) {

        const req_opts = {
            hostname: 'transfer.api.globusonline.org',
            method: 'GET',
            path: '/v0.10/operation/endpoint/' + encodeURIComponent(a_req.query.ep) + '/ls?path=' + encodeURIComponent(a_req.query.path) + '&show_hidden=' + a_req.query.hidden,
            rejectUnauthorized: true,
            headers:{
                Authorization: ' Bearer ' + reply.access
            }
        };

        const req = https.request( req_opts, (res) => {
            var data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                a_resp.json(JSON.parse(data));
            });
        });

        req.on('error', (e) => {
            a_resp.status( 500 );
            a_resp.send( "Globus endpoint directoy listing failed." );
        });

        req.end();
    });

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
    comm.sendMessageDirect( "UserSetAccessTokenRequest", a_uid, { access: a_acc_tok, refresh: a_ref_tok, expiresIn: a_expires_sec }, function( reply ){
        // Should be an AckReply
        //console.log("setAccessToken reply:", reply );
    });
}

comm.loadProto( "Version.proto", null, function( root ) {
    console.log('Version.proto loaded');

    var msg = root.lookupEnum( "Version" );
    if ( !msg )
        throw "Missing Version enum in Version.Anon proto file";

    g_ver_major = msg.values.VER_MAJOR;
    g_ver_mapi_major = msg.values.VER_MAPI_MAJOR;
    g_ver_mapi_minor = msg.values.VER_MAPI_MINOR;
    g_ver_web = msg.values.VER_WEB;

    opts.version = g_ver_major + "." + g_ver_mapi_major + "." + g_ver_mapi_minor + ":" + g_ver_web;

    console.log('Running Version', opts.version);
    if ( --g_ready_start == 0 )
        startServer();
});

comm.loadProto( "SDMS_Anon.proto", "SDMS.Anon.Protocol", function( root ) {
    console.log('SDMS_Anon.proto loaded');

    if ( --g_ready_start == 0 )
        startServer();
});

comm.loadProto("SDMS_Auth.proto", "SDMS.Auth.Protocol", function(err, root) {
    console.log('SDMS_Auth.proto loaded');

    if ( --g_ready_start == 0 )
        startServer();
});

process.on('unhandledRejection', (reason, p) => {
    console.log( 'Error - unhandled rejection at: Promise', p, 'reason:', reason );
});



function loadSettings(){
    g_host = "datafed.ornl.gov";
    g_port = 443;
    g_tls = true;
    g_server_key_file = '/opt/datafed/datafed-web-key.pem';
    g_server_cert_file = '/opt/datafed/datafed-web-cert.pem';
    g_core_serv_addr = 'tcp://datafed.ornl.gov:7513';

    console.log( "Reading configuration from file", process.argv[2] );

    try{
        var config = ini.parse(fs.readFileSync(process.argv[2],'utf-8'));
    
        if ( config.server ){
            g_host = config.server.host || g_host;
            g_port = config.server.port || g_port;
            if ( config.server.tls == "0" || config.server.tls == "false" ){
                g_tls = false;
            }
            opts.extern_url = config.server.extern_url;
            if ( g_tls ){
                g_server_key_file = config.server.key_file || g_server_key_file;
                g_server_cert_file = config.server.cert_file || g_server_cert_file;
                g_server_chain_file = config.server.chain_file;
            }
            g_system_secret = config.server.system_secret;
            g_session_secret = config.server.session_secret;
        }
        if ( config.oauth ){
            opts.globus_client_id = config.oauth.client_id;
            opts.globus_client_secret = config.oauth.client_secret;
        }
        if ( config.core ){
            g_core_serv_addr = config.core.server_address || g_core_serv_addr;
        }

        if ( !opts.extern_url ){
            opts.extern_url = "http"+(g_tls?'s':'')+"://" + g_host + ":" + g_port;
        }
    }catch( e ){
        console.log( "Could not open/parse configuration file", process.argv[2] );
        console.log( e.message );
        throw e;
    }

    if ( !g_system_secret ){
        throw "Server system secret not set.";
    }
    if ( !g_session_secret ){
        throw "Server session secret not set.";
    }
}

function startServer(){
    console.log( "  Host:", g_host );
    console.log( "  Port:", g_port );
    console.log( "  TLS:", g_tls?"Yes":"No" );
    if ( g_tls ){
        console.log( "  Server key file:", g_server_key_file );
        console.log( "  Server cert file:", g_server_cert_file );
        console.log( "  Server chain file:", g_server_chain_file );
    }
    console.log( "  External URL:", opts.extern_url );
    console.log( "  Core server addr:", g_core_serv_addr );

    console.log( "Connecting to Core" );

    comm.connect( g_core_serv_addr );


    comm.sendMessageDirect( "VersionRequest", "", {}, function( reply ) {
        if ( !reply ){
            console.log( "ERROR: No reply from core server" );
        }else if ( reply.major != g_ver_major || reply.mapiMajor != g_ver_mapi_major ||
                reply.mapi_minor < g_ver_mapi_minor || reply.mapi_minor > ( g_ver_mapi_minor + 9 )){
            console.log( "ERROR: Incompatible server version (" + reply.major + "." + reply.mapiMajor + "." + reply.mapiMinor + ")" );
        }else{
            if ( reply.web > g_ver_web || reply.mapi_minor > g_ver_mapi_minor ){
                console.log( "WARNING: A newer web server version is available (" + reply.major + "." + reply.mapiMajor + "." + reply.mapiMinor + ":" + reply.web + ")" );
            }

            if ( reply.testMode ) {
                opts.test_mode = true;
                console.log( "WARNING: TEST MODE ENABLED!" );
            } else {
                opts.test_mode = false;
            }

            // Load all route files
            var routePath="./routes/";
            fs.readdirSync(routePath).forEach(function(file) {
                console.log("loading route",routePath+file);
                require(routePath+file)( app, opts );
            });

            var server;
            if ( g_tls ){
                var privateKey  = fs.readFileSync( g_server_key_file, 'utf8');
                var certificate = fs.readFileSync( g_server_cert_file, 'utf8');
                var chain;
                if ( g_server_chain_file ){
                    chain = fs.readFileSync( g_server_chain_file, 'utf8');
                }
                console.log( "Starting https server" );
                server = https.createServer({
                    key: privateKey,
                    cert: certificate,
                    ca: chain,
                    secureOptions: constants.SSL_OP_NO_SSLv2 | constants.SSL_OP_NO_SSLv3
                }, app );
            }else{
                console.log( "Starting http server" );
                server = http.createServer({}, app);
            }

            server.listen( g_port );
        }
    });
}

if ( --g_ready_start == 0 )
    startServer();
