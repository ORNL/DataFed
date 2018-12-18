/*jshint strict: global */
/*jshint esversion: 6 */
/*jshint multistr: true */
/* globals require */
/* globals module */
/* globals console */

'use strict';

const   createRouter = require('@arangodb/foxx/router');
const   router = createRouter();
const   joi = require('joi');

const   g_db = require('@arangodb').db;
const   g_graph = require('@arangodb/general-graph')._graph('sdmsg');
const   g_lib = require('./support');

module.exports = router;


router.get('/gridftp', function (req, res) {
    try {
        console.log( "authz client", req.queryParams.client, "repo", req.queryParams.repo, "file", req.queryParams.file, "act", req.queryParams.act );

        const client = g_lib.getUserFromClientID( req.queryParams.client );
        console.log("client:",client);

        // Actions: read, write, create, delete, chdir, lookup
        var req_perm = 0;
        switch ( req.queryParams.act ) {
            case "read":
                req_perm = g_lib.PERM_RD_DATA;
                break;
            case "write":
            case "create":
                req_perm = g_lib.PERM_WR_DATA;
                break;
            case "delete":
                throw g_lib.ERR_INVALID_ACTION;
            case "chdir":
            case "lookup":
                // For TESTING, allow these actions
                return;
            default:
                throw g_lib.ERR_INVALID_ACTION;
        }

        var idx = req.queryParams.file.lastIndexOf("/");
        console.log("doc ID:","d/" + req.queryParams.file.substr( idx + 1 ));

        var data = g_db.d.document( "d/" + req.queryParams.file.substr( idx + 1 ));

        if ( !g_lib.hasAdminPermObject( client, data._id )) {
            if ( !g_lib.hasPermissions( client, data, req_perm ))
                throw g_lib.ERR_PERM_DENIED;
        }

        // Verify repo and path are correct for record
        var path = req.queryParams.file.substr( req.queryParams.file.indexOf("/",8));
        var loc = g_db.loc.firstExample({_from:data._id});
        console.log( "file:",req.queryParams.file);
        console.log( "req loc:",path);
        console.log( "actual loc:",loc.path);
        console.log( "req repo:",req.queryParams.repo,",actual repo",loc._to);
        if ( !loc || loc._to != req.queryParams.repo || loc.path != path )
            throw g_lib.ERR_INVALID_LOCATION;
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('repo', joi.string().required(), "Originating repo ID")
.queryParam('file', joi.string().required(), "Data file name")
.queryParam('act', joi.string().required(), "Action")
.summary('Checks authorization')
.description('Checks authorization');


router.get('/perm/check', function (req, res) {
    try {
        const client = g_lib.getUserFromClientID( req.queryParams.client );
        var perms = req.queryParams.perms?req.queryParams.perms:g_lib.PERM_ALL;
        var obj,result = true,id = g_lib.resolveID( req.queryParams.id, client ), ty = id[0];

        if ( id[1] != "/" )
            throw g_lib.ERR_INVALID_PARAM;

        if ( ty == "p" ){
            var role = g_lib.getProjectRole( client._id, id );
            if (( role == g_lib.PROJ_NO_ROLE ) || ( role == g_lib.PROJ_MEMBER )){ // Non members have only VIEW permissions
                if ( perms != g_lib.PERM_VIEW )
                    result = false;
            } else if ( role == g_lib.PROJ_MANAGER ){ // Managers have all but UPDATE
                if (( perms & ~g_lib.PERM_MANAGER ) != 0 )
                    result = false;
            }
        }else if ( ty == "d" ){
            if ( !g_lib.hasAdminPermObject( client, id )){
                obj = g_db.d.document( id );
                if ( obj.locked && ( perms & (g_lib.PERM_RD_DATA | g_lib.PERM_RD_META | g_lib.PERM_WR_DATA | g_lib.PERM_WR_META  | g_lib.PERM_ADMIN)) != 0 )
                    result = false;
                else
                    result = g_lib.hasPermissions( client, obj, perms );
            }
        }else if ( ty == "c" ){
            if ( !g_lib.hasAdminPermObject( client, id )){
                obj = g_db.c.document( id );
                result = g_lib.hasPermissions( client, obj, perms );
            }
        }else
            throw g_lib.ERR_INVALID_PARAM;

        res.send({ granted: result });
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('id', joi.string().required(), "Object ID or alias")
.queryParam('perms', joi.number().optional(), "Permission bit mask to check (default = ALL)")
.summary('Checks client permissions for object')
.description('Checks client permissions for object (projects, data, collections');

router.get('/perm/get', function (req, res) {
    try {
        const client = g_lib.getUserFromClientID( req.queryParams.client );
        var result = req.queryParams.perms?req.queryParams.perms:g_lib.PERM_ALL;
        var obj,id = g_lib.resolveID( req.queryParams.id, client ), ty = id[0];

        if ( ty == "p" ){
            var role = g_lib.getProjectRole( client._id, id );
            if (( role == g_lib.PROJ_NO_ROLE ) || ( role == g_lib.PROJ_MEMBER )){ // Non members have only VIEW permissions
                result &= g_lib.PERM_VIEW;
            } else if ( role == g_lib.PROJ_MANAGER ){ // Managers have all but UPDATE
                result &= g_lib.PERM_MANAGER;
            }
        }else if ( ty == "d" ){
            if ( !g_lib.hasAdminPermObject( client, id )){
                obj = g_db.d.document( id );
                if ( obj.locked )
                    result &= ~(g_lib.PERM_RD_DATA | g_lib.PERM_RD_META | g_lib.PERM_WR_DATA | g_lib.PERM_WR_META  | g_lib.PERM_ADMIN);

                result = g_lib.getPermissions( client, obj, result );
            }
        }else if ( ty == "c" ){
            if ( !g_lib.hasAdminPermObject( client, id )){
                obj = g_db.c.document( id );
                result = g_lib.getPermissions( client, obj, result );
            }
        }else
            throw g_lib.ERR_INVALID_PARAM;

        res.send({ granted: result });
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('id', joi.string().required(), "Object ID or alias")
.queryParam('perms', joi.number().optional(), "Permission bit mask to get (default = all)")
.summary('Gets client permissions for object')
.description('Gets client permissions for object (projects, data, collections. Note this is potentially slower than using "check" method.');
