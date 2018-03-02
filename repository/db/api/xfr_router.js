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
        var result;

        g_db._executeTransaction({
            collections: {
                read: ["u","g","d","c","a","alias","acl","admin"],
                write: ["tr"]
            },
            action: function() {
                const client = g_lib.getUserFromUID( req.queryParams.client );

                var data_id = g_lib.resolveID( req.queryParams.id, client );
                var data = g_db.d.document( data_id );

                if ( !g_lib.hasAdminPermObject( client, data._id )) {
                    var perms = g_lib.PERM_DAT_READ;
                    if ( req.queryParams.mode > g_lib.XM_GET_READ )
                        perms |= g_lib.PERM_DAT_WRITE;
                    if ( !g_lib.hasPermission( client, data, perms ))
                        throw g_lib.ERR_PERM_DENIED;
                }

                // See if there is an existing transfer record either in INIT or ACTIVE state
                var xfr = g_db._query( "for i in tr filter i.data_id == @data_id and i.dest_path == @dest return i", { data_id: data_id, dest: req.queryParams.path }).toArray();
                if ( xfr.length == 0 )
                {

                    // TODO Check/set read/write lock on data record (revision)
                    // TODO Add configuration info for facility end-points and storage locations

                    xfr = g_db.tr.save({
                        mode: req.queryParams.mode,
                        status: g_lib.XS_INIT,
                        data_id: data_id,
                        data_path: "olcf#sdms/xx/" + data_id.substr( 2 ),
                        dest_path: req.queryParams.path,
                        globus_id: client.globus_id
                        }, { returnNew: true } );

                    result = [xfr.new];
                } else {
                    // TODO Must also check mode is same
                    if ( xfr[0].globus_id != client.globus_id )
                        throw g_lib.ERR_XFR_CONFLICT;

                    result = xfr;
                }
            }
        });

        res.send( result );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client UID")
.queryParam('id', joi.string().required(), "Data record ID or alias")
.queryParam('path', joi.string().required(), "Data local path")
.queryParam('mode', joi.number().required(), "Transfer mode (get read/write, put)")
.summary('Performs pre-transfer authorization and initialization')
.description('Performs pre-transfer authorization and initialization');


router.get('/update', function (req, res) {
    try {
        var obj = {};

        if ( req.queryParams.status != null )
            obj.status = req.queryParams.status;

        if ( req.queryParams.task_id )
            obj.task_id = req.queryParams.task_id;

        var xfr = g_db._update( req.queryParams.xfr_id, obj, { keepNull: false, returnNew: true });

        res.send( [xfr.new] );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client UID")
.queryParam('xfr_id', joi.string().required(), "Xfr record ID")
.queryParam('status', joi.string().optional(), "New status")
.queryParam('task_id', joi.string().optional(), "New task ID")
.summary('Update transfer record')
.description('Update transfer record');


router.get('/view', function (req, res) {
    try {
        //const client = g_lib.getUserFromUID( req.queryParams.client );

        var result = g_db.tr.document( req.queryParams.xfr_id );

        res.send( [result] );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client UID")
.queryParam('xfr_id', joi.string().required(), "Xfr record ID")
.summary('View transfer record')
.description('View transfer record');
