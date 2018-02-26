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


router.get('/init', function (req, res) {
    try {
        const client = g_lib.getUserFromUID( req.queryParams.client );

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
.queryParam('client', joi.string().required(), "Client UID")
.queryParam('id', joi.string().required(), "Data record ID or alias")
.queryParam('perms', joi.number().required(), "Requested permissions (read/write)")
.summary('Performs pre-transfer authorization')
.description('Performs pre-transfer authorization. Returns required globus transfer parameters');


router.get('/view', function (req, res) {
    try {
        //const client = g_lib.getUserFromUID( req.queryParams.client );

        var result = g_db.tr.document( req.queryParams.id );

        result.id = result._id;
        delete result._id;
        delete result._key;
        delete result._rev;

        res.send( [result] );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client UID")
.queryParam('id', joi.string().required(), "Xfr record ID")
.summary('View transfer record')
.description('View transfer record');
