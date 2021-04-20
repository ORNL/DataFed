'use strict';

const   createRouter = require('@arangodb/foxx/router');
const   router = createRouter();
const   joi = require('joi');
const   g_db = require('@arangodb').db;
const   g_lib = require('./support');

module.exports = router;


router.get('/gridftp', function (req, res) {
    try {
        console.log( "authz client", req.queryParams.client, "repo", req.queryParams.repo, "file", req.queryParams.file, "act", req.queryParams.act );

        const client = g_lib.getUserFromClientID_noexcept( req.queryParams.client );

        var idx = req.queryParams.file.lastIndexOf("/");
        var data_key = req.queryParams.file.substr( idx + 1 );
        var data_id = "d/" + data_key;

        // Special case - allow unknown client to read a publicly accessible record
        if ( !client ){
            if ( req.queryParams.act != "read" || !g_lib.hasPublicRead( data_id )){
                throw g_lib.ERR_PERM_DENIED;
            }
            //console.log("allow anon read of public record");
        }else{
            //console.log("client:",client);

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
                    throw g_lib.ERR_PERM_DENIED;
                case "chdir":
                case "lookup":
                    // For TESTING, allow these actions
                    return;
                default:
                    throw [g_lib.ERR_INVALID_PARAM,"Invalid gridFTP action: ", req.queryParams.act];
            }

            if ( !g_lib.hasAdminPermObject( client, data_id )) {
                var data = g_db.d.document( data_id );
                if ( !g_lib.hasPermissions( client, data, req_perm ))
                    throw g_lib.ERR_PERM_DENIED;
            }
        }

        // Verify repo and path are correct for record
        // Note: only managed records have an allocations and this gridftp auth call is only made for managed records
        var path = req.queryParams.file.substr( req.queryParams.file.indexOf("/",8));
        var loc = g_db.loc.firstExample({_from: data_id});
        if ( !loc )
            throw g_lib.ERR_PERM_DENIED;

        var alloc = g_db.alloc.firstExample({ _from: loc.uid, _to: loc._to });
        if ( !alloc )
            throw g_lib.ERR_PERM_DENIED;

        if ( alloc.path + data_key != path ){
            // This may be due to an alloc/owner change
            // Allow IF new path matches
            //console.log("authz loc info:", loc );

            if ( !loc.new_repo )
                throw g_lib.ERR_PERM_DENIED;

            alloc = g_db.alloc.firstExample({ _from: loc.new_owner?loc.new_owner:loc.uid, _to: loc.new_repo });

            //console.log("path:", path, "alloc path:", alloc.path + data_key );

            if ( !alloc || ( alloc.path + data_key != path ))
                throw g_lib.ERR_PERM_DENIED;
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


router.get('/perm/check', function (req, res) {
    try {
        const client = g_lib.getUserFromClientID( req.queryParams.client );
        var perms = req.queryParams.perms?req.queryParams.perms:g_lib.PERM_ALL;
        var obj,result = true,id = g_lib.resolveID( req.queryParams.id, client ), ty = id[0];

        if ( id[1] != "/" ){
            throw [g_lib.ERR_INVALID_PARAM,"Invalid ID, "+req.queryParams.id];
        }

        if ( ty == "p" ){
            var role = g_lib.getProjectRole( client._id, id );
            if ( role == g_lib.PROJ_NO_ROLE ){ // Non members have only VIEW permissions
                if ( perms != g_lib.PERM_RD_REC )
                    result = false;
            }else if ( role == g_lib.PROJ_MEMBER ){ // Non members have only VIEW permissions
                if (( perms & ~g_lib.PERM_MEMBER ) != 0 )
                    result = false;
            } else if ( role == g_lib.PROJ_MANAGER ){ // Managers have all but UPDATE
                if (( perms & ~g_lib.PERM_MANAGER ) != 0 )
                    result = false;
            }
        }else if ( ty == "d" ){
            if ( !g_lib.hasAdminPermObject( client, id )){
                obj = g_db.d.document( id );
                if ( obj.locked )
                    result = false;
                else
                    result = g_lib.hasPermissions( client, obj, perms );
            }
        }else if ( ty == "c" ) {
            // If create perm is requested, ensure owner of collection has at least one allocation
            if ( perms & g_lib.PERM_CREATE ){
                var owner = g_db.owner.firstExample({ _from: id });
                if ( !g_db.alloc.firstExample({ _from: owner._to })){
                    throw [g_lib.ERR_NO_ALLOCATION,"An allocation is required to create a collection."];
                }
            }

            if ( !g_lib.hasAdminPermObject( client, id )){
                obj = g_db.c.document( id );
                result = g_lib.hasPermissions( client, obj, perms );
            }
        }else{
            throw [g_lib.ERR_INVALID_PARAM,"Invalid ID, "+req.queryParams.id];
        }

        res.send({ granted: result });
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('id', joi.string().required(), "Object ID or alias")
.queryParam('perms', joi.number().required(), "Permission bit mask to check")
.summary('Checks client permissions for object')
.description('Checks client permissions for object (projects, data, collections');

router.get('/perm/get', function (req, res) {
    try {
        const client = g_lib.getUserFromClientID( req.queryParams.client );
        var result = req.queryParams.perms?req.queryParams.perms:g_lib.PERM_ALL;
        var obj,id = g_lib.resolveID( req.queryParams.id, client ), ty = id[0];

        if ( id[1] != "/" )
            throw [g_lib.ERR_INVALID_PARAM,"Invalid ID, "+req.queryParams.id];

        if ( ty == "p" ){
            var role = g_lib.getProjectRole( client._id, id );
            if ( role == g_lib.PROJ_NO_ROLE ){ // Non members have only VIEW permissions
                result &= g_lib.PERM_RD_REC;
            }else if ( role == g_lib.PROJ_MEMBER ){
                result &= g_lib.PERM_MEMBER;
            } else if ( role == g_lib.PROJ_MANAGER ){ // Managers have all but UPDATE
                result &= g_lib.PERM_MANAGER;
            }
        }else if ( ty == "d" ){
            if ( !g_lib.hasAdminPermObject( client, id )){
                obj = g_db.d.document( id );
                if ( obj.locked )
                    result = 0;
                else
                    result = g_lib.getPermissions( client, obj, result );
            }
        }else if ( ty == "c" ){
            if ( !g_lib.hasAdminPermObject( client, id )){
                obj = g_db.c.document( id );
                result = g_lib.getPermissions( client, obj, result );
            }
        }else
            throw [g_lib.ERR_INVALID_PARAM,"Invalid ID, "+req.queryParams.id];

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
