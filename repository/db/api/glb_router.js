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


router.get('/authz', function (req, res) {
    try {
        console.log( "authz call" );
        console.log( "client", req.queryParams.client );
        console.log( "file", req.queryParams.file );
        console.log( "act", req.queryParams.act );

        const client = g_lib.getUserFromCert( req.queryParams.client );

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
.queryParam('client', joi.string().required(), "Client certificate")
.queryParam('file', joi.string().required(), "Data file name")
.queryParam('act', joi.string().required(), "Action")
.summary('Checks authorization')
.description('Checks authorization');

