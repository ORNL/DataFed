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
                    var perms;
                    if ( req.queryParams.mode == g_lib.XM_PUT )
                        perms = g_lib.PERM_DAT_WRITE;
                    else
                        perms = g_lib.PERM_DAT_READ;
                    if ( !g_lib.hasPermission( client, data, perms ))
                        throw g_lib.ERR_PERM_DENIED;
                }

                var dest_path = req.queryParams.path;
                if ( dest_path.charAt( dest_path.length - 1 ) != "/" )
                    dest_path += "/";
                dest_path += data_id.substr( 2 );

                // See if there is an existing transfer record either in INIT or ACTIVE state
                var xfr = g_db._query( "for i in tr filter i.data_id == @data_id and i.dest_path == @dest and i.status < 3 return i", { data_id: data_id, dest: dest_path }).toArray();
                if ( xfr.length == 0 )
                {

                    // TODO Check/set read/write lock on data record (revision)
                    // TODO Add configuration info for facility end-points and storage locations

                    xfr = g_db.tr.save({
                        mode: req.queryParams.mode,
                        status: g_lib.XS_INIT,
                        data_id: data_id,
                        data_path: "olcf#dtn_atlas/ccs/home/d3s/sdms-repo/" + data_id.substr( 2 ),
                        dest_path: dest_path,
                        globus_id: client.globus_id,
                        updated: ((Date.now()/1000)|0)
                        }, { returnNew: true } );

                    result = [xfr.new];
                } else {
                    // Two different processes cannot PUT the same data
                    if ( xfr[0].mode == g_lib.XM_PUT || req.queryParams.mode == g_lib.XM_PUT )
                        throw g_lib.ERR_XFR_CONFLICT;

                    // TODO - Not sure if it's OK for two different users to GET to the same destination...
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
        var obj = { updated: ((Date.now()/1000)|0) };

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
.queryParam('status', joi.number().optional(), "New status")
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
