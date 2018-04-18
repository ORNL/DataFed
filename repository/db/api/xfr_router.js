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
                read: ["u","g","d","c","a","uuid","accn","alias","acl","admin"],
                write: ["tr"]
            },
            action: function() {
                const client = g_lib.getUserFromClientID( req.queryParams.client );

                var data_id = g_lib.resolveID( req.queryParams.id, client );
                var data = g_db.d.document( data_id );

                if ( !g_lib.hasAdminPermObject( client, data._id )) {
                    var perms;
                    if ( req.queryParams.mode == g_lib.XM_PUT )
                        perms = g_lib.PERM_WRITE;
                    else
                        perms = g_lib.PERM_READ;
                    if ( !g_lib.hasPermission( client, data, perms ))
                        throw g_lib.ERR_PERM_DENIED;
                }

                var xfr;

                if ( req.queryParams.mode == g_lib.XM_PUT ) {
                    xfr = g_db._query( "for i in tr filter i.data_id == @data_id and i.status < 3 return i", { data_id: data_id }).toArray();
                    // If there are any active puts/gets for same data, this is a conflict
                    if ( xfr.length != 0 )
                        throw g_lib.ERR_XFR_CONFLICT;

                    xfr = g_db.tr.save({
                        mode: g_lib.XM_PUT,
                        status: g_lib.XS_INIT,
                        data_id: data_id,
                        repo_path: "fb82a688-3817-11e8-b977-0ac6873fc732/data/" + data_id.substr( 2 ),
                        local_path: req.queryParams.path,
                        user_id: client._id,
                        globus_id: client.globus_id,
                        updated: ((Date.now()/1000)|0)
                        }, { returnNew: true } );

                    result = [xfr.new];
                } else {
                    var dest_path = req.queryParams.path;
                    if ( dest_path.charAt( dest_path.length - 1 ) != "/" )
                        dest_path += "/";
                    dest_path += data_id.substr( 2 );

                    // See if there is an existing transfer record either in INIT or ACTIVE state
                    xfr = g_db._query( "for i in tr filter i.data_id == @data_id and ( i.mode == 1 or i.local_path == @loc_path ) and i.status < 3 return i", { data_id: data_id, loc_path: dest_path }).toArray();

                    for ( var i in xfr ) {
                        if ( xfr[i].mode == g_lib.XM_PUT || xfr[i].user_id != client._id )
                            throw g_lib.ERR_XFR_CONFLICT;
                    }

                    if ( xfr.length == 0 )
                    {
                        // TODO Add configuration info for facility end-points and storage locations

                        xfr = g_db.tr.save({
                            mode: g_lib.XM_GET,
                            status: g_lib.XS_INIT,
                            data_id: data_id,
                            repo_path: "fb82a688-3817-11e8-b977-0ac6873fc732/data/" + data_id.substr( 2 ),
                            local_path: dest_path,
                            user_id: client._id,
                            globus_id: client.globus_id,
                            updated: ((Date.now()/1000)|0)
                            }, { returnNew: true } );

                        result = [xfr.new];
                    } else {
                        result = xfr;
                    }
                }
            }
        });

        res.send( result );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('id', joi.string().required(), "Data record ID or alias")
.queryParam('path', joi.string().required(), "Data local path")
.queryParam('mode', joi.number().required(), "Transfer mode (get read/write, put)")
.summary('Performs pre-transfer authorization and initialization')
.description('Performs pre-transfer authorization and initialization');


router.get('/update', function (req, res) {
    try {
        var result;

        g_db._executeTransaction({
            collections: {
                read: [],
                write: ["tr"]
            },
            action: function() {
                var obj = { updated: ((Date.now()/1000)|0) };

                if ( req.queryParams.status != null )
                    obj.status = req.queryParams.status;

                if ( req.queryParams.task_id )
                    obj.task_id = req.queryParams.task_id;

                var xfr = g_db._update( req.queryParams.xfr_id, obj, { keepNull: false, returnNew: true });

                result = [xfr.new];
            }
        });

        res.send( result );
    } catch( e ) {
        g_lib.handleException( e, res );
    }})
//.queryParam('client', joi.string().required(), "Client UID")
.queryParam('xfr_id', joi.string().required(), "Xfr record ID")
.queryParam('status', joi.number().optional(), "New status")
.queryParam('task_id', joi.string().optional(), "New task ID")
.summary('Update transfer record')
.description('Update transfer record');


router.get('/view', function (req, res) {
    try {
        //const client = g_lib.getUserFromClientID( req.queryParams.client );


        var result = g_db.tr.document( req.queryParams.xfr_id );

        res.send( [result] );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
//.queryParam('client', joi.string().required(), "Client UID")
.queryParam('xfr_id', joi.string().required(), "Xfr record ID")
.summary('View transfer record')
.description('View transfer record');

router.get('/list', function (req, res) {
    try {
        var result;
        var filter = "";

        if (( req.queryParams.from != undefined || req.queryParams.to != undefined ) && req.queryParams.since != undefined )
            throw g_lib.ERR_INVALID_PARAM;

        if ( req.queryParams.from != undefined ) {
            filter += "i.updated >= " + req.queryParams.from;
        }

        if ( req.queryParams.to != undefined ) {
            if ( filter.length )
                filter += " and ";
            filter += "i.updated <= " + req.queryParams.to;
        }

        if ( req.queryParams.since != undefined ) {
            filter += "i.updated >= " + ((Date.now()/1000) - req.queryParams.since);
        }

        if ( req.queryParams.status != undefined ) {
            if ( filter.length )
                filter += " and ";

            filter += "i.status == " + req.queryParams.status;
        }

        if ( req.queryParams.client != undefined ) {
            const client = g_lib.getUserFromClientID( req.queryParams.client );

            if ( filter.length )
                result = g_db._query( "for i in tr filter i.user_id == @uid and " + filter + " return i", { uid: client._id } ).toArray();
            else
                result = g_db._query( "for i in tr filter i.user_id == @uid return i", { uid: client._id } ).toArray();
        } else {
            if ( filter.length )
                result = g_db._query( "for i in tr filter " + filter + " return i" ).toArray();
            else
                result = g_db._query( "for i in tr return i" ).toArray();
        }

        res.send( result );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().optional(), "Client ID")
.queryParam('from', joi.number().optional(), "Return results on or after absolute 'from' time.")
.queryParam('to', joi.number().optional(), "Return result on or before absolute 'to' time.")
.queryParam('since', joi.number().optional(), "Return results between now and 'since' seconds ago.")
.queryParam('status', joi.number().optional(), "Return results matching 'status'.")
.summary('List transfer record')
.description('View transfer record');
