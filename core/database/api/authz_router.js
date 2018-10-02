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
        console.log( "authz call" );
        console.log( "client", req.queryParams.client );
        console.log( "file", req.queryParams.file );
        console.log( "act", req.queryParams.act );

        const client = g_lib.getUserFromClientID( req.queryParams.client );

        // Actions: read, write, create, delete, chdir, lookup
        var req_perm = 0;
        switch ( req.queryParams.act ) {
            case "read":
                req_perm = g_lib.PERM_READ;
                break;
            case "write":
            case "create":
                req_perm = g_lib.PERM_WRITE;
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
            if ( !g_lib.hasPermission( client, data, req_perm ))
                throw g_lib.ERR_PERM_DENIED;
        }

    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
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
            if ( !g_lib.hasPermission( client, data, req.queryParams.perms ))
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

router.get('/check', function (req, res) {
    try {
        const client = g_lib.getUserFromClientID( req.queryParams.client );
        var result = req.queryParams.perms;
        var id = req.queryParams.id;
        var ty = id[0];

        if ( id[1] != "/" )
            throw g_lib.ERR_INVALID_PARAM;

        if ( ty == "p" ){
            var role = g_lib.getProjectRole( client._id, id );
            if (( role == g_lib.PROJ_NO_ROLE ) || ( role == g_lib.PROJ_MEMBER )){ // Non members have only VIEW permissions
                if (( req.queryParams.perms & ~g_lib.PERM_VIEW ) != 0 )
                    result = 0;
            } else if ( role == g_lib.PROJ_MANAGER ){ // Managers have all but UPDATE
                if (( req.queryParams.perms & ~g_lib.PERM_MANAGER ) != 0 )
                    result = 0;
            }
        }else if ( ty == "d" || ty == "c" ){
            if ( !g_lib.hasAdminPermObject( client, id )){
                var obj = g_db[ty].document( id );
                if (!g_lib.hasPermission( client, obj, req.queryParams.perms ))
                    result = 0;
            }
        }else
            throw g_lib.ERR_INVALID_PARAM;

        res.send({ granted: result });
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('id', joi.string().required(), "Object ID")
.queryParam('perms', joi.number().required(), "Permission bits")
.summary('Checks client permissions for object')
.description('Checks client permissions for object (projects, data, collections');

