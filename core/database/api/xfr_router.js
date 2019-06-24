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
                read: ["u","g","d","c","a","repo","loc","uuid","accn","alias","acl","admin"],
                write: ["tr"]
            },
            action: function() {
                const client = g_lib.getUserFromClientID( req.queryParams.client );

                var data_id = g_lib.resolveDataID( req.queryParams.id, client );
                var data = g_db.d.document( data_id );
                //var data_loc = g_db.loc.firstExample({_from: data_id });

                if ( !g_lib.hasAdminPermObject( client, data._id )) {
                    var perms;
                    if ( req.queryParams.mode == g_lib.XM_PUT )
                        perms = g_lib.PERM_WR_DATA;
                    else
                        perms = g_lib.PERM_RD_DATA;
                    if ( !g_lib.hasPermissions( client, data, perms ))
                        throw g_lib.ERR_PERM_DENIED;
                }

                var dest_id,dest_data;

                if ( req.queryParams.mode == g_lib.XM_COPY ){
                    // Overloaded path to mean destination ID
                    dest_id = g_lib.resolveDataID( req.queryParams.path, client );
                    if ( !g_lib.hasAdminPermObject( client, dest_id )) {
                        dest_data = g_db.d.document( dest_id );
                        if ( !g_lib.hasPermissions( client, dest_data, g_lib.PERM_WR_DATA ))
                            throw g_lib.ERR_PERM_DENIED;
                    }
                }

                // Get data storage location
                var repo_loc = g_db._query("for v,e in 1..1 outbound @data loc return { repo: v, loc: e }", { data: data_id } ).toArray();
                if ( repo_loc.length != 1 )
                    throw [g_lib.ERR_INTERNAL_FAULT,"No storage location for data record, " + data_id];

                repo_loc = repo_loc[0];
                var xfr;
                var now = ((Date.now()/1000)|0);

                if ( req.queryParams.mode == g_lib.XM_PUT ) {
                    xfr = g_db._query( "for i in tr filter i.data_id == @data_id and i.status < 3 return i", { data_id: data_id }).toArray();
                    // If there are any active puts/gets for same data, this is a conflict
                    if ( xfr.length != 0 )
                        throw [g_lib.ERR_XFR_CONFLICT,"Transfer conflict - transfer(s) in-progress for " + data_id];

                    xfr = g_db.tr.save({
                        mode: g_lib.XM_PUT,
                        status: g_lib.XS_INIT,
                        data_id: data_id,
                        repo_path: repo_loc.repo.endpoint + g_lib.computeDataPath(repo_loc.loc),//repo_loc.loc.path,
                        local_path: req.queryParams.path,
                        user_id: client._id,
                        repo_id: repo_loc.repo._id,
                        started: now,
                        updated: now,
                        ext: req.queryParams.ext
                        }, { returnNew: true } );

                    result = [xfr.new];
                } else if ( req.queryParams.mode == g_lib.XM_GET ) {
                    if ( !data.size )
                        throw [g_lib.ERR_NO_RAW_DATA,"Data record, "+data_id+", has no raw data"];

                    var dest_path = req.queryParams.path;
                    if ( dest_path.charAt( dest_path.length - 1 ) != "/" )
                        dest_path += "/";
                    dest_path += data_id.substr( 2 ) + data.ext;

                    // See if there is an existing transfer record either in INIT or ACTIVE state
                    xfr = g_db._query( "for i in tr filter i.data_id == @data_id and ( i.mode == 1 or i.local_path == @loc_path ) and i.status < 3 return i", { data_id: data_id, loc_path: dest_path }).toArray();

                    for ( var i in xfr ) {
                        if ( xfr[i].mode == g_lib.XM_PUT || xfr[i].user_id != client._id )
                            throw [g_lib.ERR_XFR_CONFLICT,"Transfer conflict - put in-progress for " + data_id];
                    }

                    if ( xfr.length == 0 )
                    {
                        xfr = g_db.tr.save({
                            mode: g_lib.XM_GET,
                            status: g_lib.XS_INIT,
                            data_id: data_id,
                            repo_path: repo_loc.repo.endpoint + g_lib.computeDataPath(repo_loc.loc), //repo_loc.loc.path,
                            local_path: dest_path,
                            user_id: client._id,
                            repo_id: repo_loc.repo._id,
                            started: now, 
                            updated: now
                            }, { returnNew: true } );

                        result = [xfr.new];
                    } else {
                        result = xfr;
                    }
                } else {
                    if ( !data.size )
                        throw [g_lib.ERR_NO_RAW_DATA,"Data record, "+data_id+", has no raw data"];

                    xfr = g_db._query( "for i in tr filter ( i.data_id == @src_id or i.data_id == @dst_id ) and i.status < 3 return i", { src_id: data_id, dst_id: dest_id }).toArray();
                    // If there are any active puts/gets/copies for same data, this is a conflict
                    if ( xfr.length != 0 )
                        throw [g_lib.ERR_XFR_CONFLICT,"Transfer conflict - transfer(s) in progress for source and/or destination"];

                    // Get data dest storage location
                    var repo_loc_dst = g_db._query("for v,e in 1..1 outbound @data loc return { repo: v, loc: e }", { data: dest_id } ).toArray();
                    if ( repo_loc_dst.length != 1 )
                        throw [g_lib.ERR_INTERNAL_FAULT,"No storage location for data record, " + dest_id];

                    repo_loc_dst = repo_loc_dst[0];

                    xfr = g_db.tr.save({
                        mode: g_lib.XM_COPY,
                        status: g_lib.XS_INIT,
                        data_id: dest_id,
                        repo_path: repo_loc_dst.repo.endpoint +  g_lib.computeDataPath(repo_loc_dst.loc), //repo_loc_dst.loc.path,
                        local_path: repo_loc.repo.endpoint +  g_lib.computeDataPath(repo_loc.loc), //repo_loc.loc.path,
                        user_id: client._id,
                        repo_id: repo_loc_dst.repo._id,
                        started: now, 
                        updated: now
                        }, { returnNew: true } );

                    result = [xfr.new];
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
.queryParam('ext', joi.string().optional(), "Extension override")
.queryParam('mode', joi.number().required(), "Transfer mode (get read/write, put)")
.summary('Performs pre-transfer authorization and initialization')
.description('Performs pre-transfer authorization and initialization');


router.get('/init2', function (req, res) {
    try {
        var result = [];
        console.log("init2");

        g_db._executeTransaction({
            collections: {
                read: ["u","g","d","c","a","repo","loc","uuid","accn","alias","acl","admin"],
                write: ["tr"]
            },
            action: function() {
                const client = g_lib.getUserFromClientID( req.queryParams.client );
                var i,file,repos={},id,data,repo_loc;

                console.log("input path:",req.queryParams.path);
                var idx = req.queryParams.path.indexOf("/");
                if ( idx == -1 )
                    throw [g_lib.ERR_INVALID_PARAM,"Invalid remote path (must include endpoint)"];

                var rem_path = req.queryParams.path.substr(idx);
                var rem_src;
                console.log("rem path:",rem_path);
                var rem_ep = req.queryParams.path.substr(0,idx);
                console.log("rem_ep:",rem_ep,",idx:",idx);

                if ( req.queryParams.mode == g_lib.XM_GET ){
                    if ( rem_path.charAt( rem_path.length - 1 ) != "/" )
                        rem_path += "/";
                }else{
                    if ( req.queryParams.ids.length > 1 )
                        throw [g_lib.ERR_INVALID_PARAM,"Only one destination record allowed for data PUT."];

                    idx = rem_path.lastIndexOf("/");
                    if ( idx > 0 ){
                        rem_src = rem_path.substr(idx+1);
                        rem_path = rem_path.substr(0,idx+1);
                    }else{
                        rem_src = rem_path.substr(1);
                        rem_path = "/";
                    }
                    console.log("rem src:",rem_src);
                    console.log("rem path(2):",rem_path);
                }

                for ( i in req.queryParams.ids ){
                    id = g_lib.resolveDataID( req.queryParams.ids[i], client );
                    console.log("id:",id);

                    data = g_db.d.document( id );

                    if ( req.queryParams.mode == g_lib.XM_GET && !data.size )
                        throw [g_lib.ERR_NO_RAW_DATA,"Data record, "+req.queryParams.ids[i]+", has no raw data"];

                    if ( !g_lib.hasAdminPermObject( client, id )) {
                        if ( !g_lib.hasPermissions( client, data, g_lib.PERM_RD_DATA ))
                            throw g_lib.ERR_PERM_DENIED;
                    }

                    // Get data storage location
                    repo_loc = g_db._query("for v,e in 1..1 outbound @data loc return { repo: v, loc: e }", { data: id } ).toArray();
                    if ( repo_loc.length != 1 )
                        throw [g_lib.ERR_INTERNAL_FAULT,"No storage location for data record, " + id];

                    repo_loc = repo_loc[0];

                    console.log("repo:",repo_loc.repo._key);

                    file = { id: id };

                    if ( req.queryParams.mode == g_lib.XM_PUT ){
                        file.from = rem_src;
                        file.to = g_lib.computeDataPath(repo_loc.loc);
                    }else{
                        file.from = g_lib.computeDataPath(repo_loc.loc);
                        file.to = id.substr( 2 ) + (data.ext?data.ext:"");
                    }

                    if ( repo_loc.repo._key in repos ){
                        repos[repo_loc.repo._key].files.push(file);
                    }else{
                        repos[repo_loc.repo._key] = {repo_id:repo_loc.repo._key,repo_ep:repo_loc.repo.endpoint,files:[file]};
                    }
                }

                if ( !req.queryParams.validate ){
                    var now = ((Date.now()/1000)|0);
                    var tr_obj = {
                        mode: req.queryParams.mode,
                        status: g_lib.XS_INIT,
                        rem_ep: rem_ep,
                        rem_path: rem_path,
                        user_id: client._id,
                        started: now, 
                        updated: now
                    };

                    for ( i in repos ){
                        tr_obj.repo = repos[i];
                        result.push( g_db.tr.save( tr_obj, { returnNew: true } ).new );
                    }
                    /*var tr_obj = {
                        mode: req.queryParams.mode,
                        status: g_lib.XS_INIT,
                        repos: repos,
                        rem_ep: rem_ep,
                        rem_path: rem_path,
                        user_id: client._id,
                        started: now, 
                        updated: now
                    };

                    if ( req.queryParams.mode == g_lib.XM_PUT && req.queryParams.ext ) {
                        tr_obj.ext = req.queryParams.ext;
                    }

                    result.push( g_db.tr.save( tr_obj, { returnNew: true } ).new );
                    */
                }
            }
        });

        res.send( result );
    } catch( e ) {
        g_lib.handleException( e, res );
    }
})
.queryParam('client', joi.string().required(), "Client ID")
.queryParam('ids', joi.array().items(joi.string()).required(), "Array of data record IDs or aliases")
.queryParam('path', joi.string().required(), "Remote path")
.queryParam('mode', joi.number().required(), "Transfer mode (get, put)")
.queryParam('ext', joi.string().optional(), "Extension override (put only)")
.queryParam('validate', joi.bool().optional(), "Perform validation only")
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

                if ( req.queryParams.err_msg )
                    obj.err_msg = req.queryParams.err_msg;

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
.queryParam('err_msg', joi.string().optional(), "Error message")
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
            throw [g_lib.ERR_INVALID_PARAM,"Cannot specify both time range and elapsed time"];

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
                result = g_db._query( "for i in tr filter i.user_id == @uid and " + filter + " sort i.updated desc return i", { uid: client._id } ).toArray();
            else
                result = g_db._query( "for i in tr filter i.user_id == @uid sort i.updated desc return i", { uid: client._id } ).toArray();
        } else {
            if ( filter.length )
                result = g_db._query( "for i in tr filter " + filter + " sort i.updated desc return i" ).toArray();
            else
                result = g_db._query( "for i in tr sort i.updated desc return i" ).toArray();
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

router.get('/purge', function (req, res) {
    var age = (Date.now()/1000) - req.queryParams.age;
    g_db._query("for i in tr filter i.started < " + age  + " remove i._key in tr");
})
.queryParam('age', joi.number().required(), "Age in seconds.")
.summary('Purge old transfer records')
.description('Purge old transfer records older than specified age.');