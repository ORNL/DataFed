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
        var data = g_db.d.document( "d/" + req.queryParams.file.substr( idx + 1 ));

        if ( !g_lib.hasAdminPermObject( client, data._id )) {
            if ( !g_lib.hasPermissions( client, data, req_perm ))
                throw g_lib.ERR_PERM_DENIED;
        }

        // Verify that the file should exist on the associate repo
        if ( req_perm == g_lib.PERM_WR_DATA ){
            console.log("check alloc");
            var loc = g_db.loc.firstExample({_from:data._id});
            console.log("loc",loc);
            if ( !loc || loc._to != req.queryParams.repo )
                throw g_lib.ERR_INVALID_ALLOC;
        }
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


router.get('/xfr/pre', function (req, res) {
    try {
        const client = g_lib.getUserFromClientID( req.queryParams.client );

        var data_id = g_lib.resolveID( req.queryParams.id, client );
        var data = g_db.d.document( data_id );

        if ( !g_lib.hasAdminPermObject( client, data._id )) {
            if ( !g_lib.hasPermissions( client, data, req.queryParams.perms ))
                throw g_lib.ERR_PERM_DENIED;
        }

        // TODO Check/set read/write lock on data record (revision)

        // TODO Add configuration infor for facility end-points and storage locations
        
        var result = { id: data_id, src_path: "olcf#sdms/aa/", src_name: data_id.substr( 2 ), globus_id: client.globus_id };

        res.send( result );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('id', joi.string().required(), "Data record ID or alias")
.queryParam('perms', joi.number().required(), "Requested permissions (read/write)")
.summary('Performs pre-transfer authorization')
.description('Performs pre-transfer authorization. Returns required globus transfer parameters');

router.get('/perm/check', function (req, res) {
    try {
        const client = g_lib.getUserFromClientID( req.queryParams.client );
        var perms = req.queryParams.perms?req.queryParams.perms:g_lib.PERM_ALL;
        var result = true;
        var id = g_lib.resolveID( req.queryParams.id, client ), ty = id[0];

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
        }else if ( ty == "d" || ty == "c" ){
            if ( !g_lib.hasAdminPermObject( client, id )){
                console.log("no admin perm");
                var obj = g_db[ty].document( id );
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
        console.log("get perm:",req.queryParams.client,req.queryParams.perms);
        const client = g_lib.getUserFromClientID( req.queryParams.client );
        var result = req.queryParams.perms?req.queryParams.perms:g_lib.PERM_ALL;
        var id = g_lib.resolveID( req.queryParams.id, client ), ty = id[0];

        if ( ty == "p" ){
            var role = g_lib.getProjectRole( client._id, id );
            if (( role == g_lib.PROJ_NO_ROLE ) || ( role == g_lib.PROJ_MEMBER )){ // Non members have only VIEW permissions
                result &= g_lib.PERM_VIEW;
            } else if ( role == g_lib.PROJ_MANAGER ){ // Managers have all but UPDATE
                result &= g_lib.PERM_MANAGER;
            }
        }else if ( ty == "d" || ty == "c" ){
            if ( !g_lib.hasAdminPermObject( client, id )){
                console.log("no admin perm");
                var obj = g_db[ty].document( id );
                result = g_lib.getPermissions( client, obj, result );
            }
        }else
            throw g_lib.ERR_INVALID_PARAM;

         console.log("result:",result);

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
