/*jshint strict: global */
/*jshint esversion: 6 */
/*jshint multistr: true */
/* globals require */
/* globals module */
/* globals console */

'use strict';

const   g_db = require('@arangodb').db;
const   g_lib = require('./support');
const   g_graph = require('@arangodb/general-graph')._graph('sdmsg');

module.exports = ( function() {
    var obj = {};

    /** @brief Pre-process data/collection IDs for permissions and required data
     *
     * Examine data and collections for proper permissions for the given mode and
     * recursively process items (data/collections) in included collections. Does
     * not resolve IDs. On success, returns lists of data records for globus and
     * http data, as well as records without data. Also returns a flat list of
     * all collections. In delete mode, for data records in collections, only data
     * that isn't linked elsewhere are returned.
     */
    obj.preprocessItems = function( a_client, a_new_owner_id, a_ids, a_mode ){
        var ctxt = { client: { _id: a_client._id, is_admin: a_client.is_admin }, new_owner: a_new_owner_id, mode: a_mode, coll: [], globus_data: [], http_data: [], no_data: [], visited: {} };

        switch( a_mode ){
            case g_lib.TT_DATA_GET:
                ctxt.data_perm = g_lib.PERM_RD_DATA;
                ctxt.coll_perm = g_lib.PERM_LIST;
                break;
            case g_lib.TT_DATA_PUT:
                ctxt.data_perm = g_lib.PERM_WR_DATA;
                // Collections not allowed
                break;
            case g_lib.TT_DATA_CHG_ALLOC:
                // Must be data owner OR if owned by a project, the project or
                // an admin, or the creator.
                ctxt.coll_perm = g_lib.PERM_LIST;
                break;
            case g_lib.TT_DATA_CHG_OWNER:
                // Must be data owner or creator OR if owned by a project, the project or
                // an admin.
                ctxt.coll_perm = g_lib.PERM_LIST;
                break;
            case g_lib.TT_DATA_DEL:
                ctxt.data_perm = g_lib.PERM_DELETE;
                ctxt.coll_perm = g_lib.PERM_DELETE;
                break;
        }

        ctxt.comb_perm = ctxt.data_perm | ctxt.coll_perm;

        obj._preprocessItemsRecursive( ctxt, a_ids, null, null );

        // For deletion, must further process data records to determine if they
        // are to be deleted or not (if they are linked elsewhere)
        if ( a_mode == g_lib.TT_DATA_DEL ){
            var i, cnt, data, remove = [];

            for ( i in ctxt.globus_data ){
                data = ctxt.globus_data[i];
                cnt = ctxt.visited[data.id];
                if ( cnt == -1 || cnt == g_lib.getDataCollectionLinkCount( data.id ))
                    remove.push( data );
            }

            ctxt.globus_data = remove;
            remove = [];

            for ( i in ctxt.no_data ){
                data = ctxt.no_data[i];
                cnt = ctxt.visited[data.id];
                if ( cnt == -1 || cnt == g_lib.getDataCollectionLinkCount( data.id ))
                    remove.push( data );
            }

            ctxt.no_data = remove;
        }

        delete ctxt.client;
        delete ctxt.visited;
        delete ctxt.data_perm;
        delete ctxt.coll_perm;
        delete ctxt.comb_perm;

        return ctxt;
    };


    /**
     * @brief Recursive preprocessing of data/collections for data operations
     * @param a_ctxt - Recurion context object
     * @param a_ids - Current list of data/collection IDs to process
     * @param a_perm - Inherited permission (undefined initially)
     * 
     * This function preprocessed with optimized permission verification by
     * using a depth-first analysis of collections. If the required permission
     * is satisfied via inherited ACLs, then no further permission checks are
     * required below that point. The end result is a flat list of collections
     * and data segregated into those with Globus data, those with HTTP data,
     * and those with no raw data.
     */
    obj._preprocessItemsRecursive = function( a_ctxt, a_ids, a_data_perm, a_coll_perm ){
        var i, id, ids, is_coll, doc;
        var perm, data_perm = a_data_perm, coll_perm = a_coll_perm;

        for ( i in a_ids ){
            id = a_ids[i];

            if ( id.charAt(0) == 'c' ){
                if ( a_ctxt.mode == g_lib.TT_DATA_PUT )
                    throw [ g_lib.ERR_INVALID_PARAM, "Collections not supported for PUT operations." ];
                is_coll = true;
            }else{
                is_coll = false;
            }

            // Skip / count data already record visited
            if ( !is_coll ){
                if ( id in a_ctxt.visited ){
                    if ( a_ctxt.mode == g_lib.TT_DATA_DEL ){
                        var cnt = a_ctxt.visited[id];
                        if ( cnt != -1 )
                            a_ctxt.visited[id] = cnt + 1;
                    }
                    continue;
                }else{
                    a_ctxt.visited[id] = (a_data_perm==null?-1:1);
                }
            }

            if ( !g_db._exists( id ))
                throw [ g_lib.ERR_INVALID_PARAM, (is_coll?"Collection '":"Data record '") + id + "' does not exist." ];

            doc = g_db._document( id );

            if ( doc.deleted )
                throw [g_lib.ERR_INVALID_PARAM, "Operation refers to deleted data record " + id];

            // Check permissions

            if ( is_coll ){
                // Make sure user isn't trying to delete root
                if ( doc.is_root && a_ctxt.mode == g_lib.TT_DATA_DEL )
                    throw [g_lib.ERR_PERM_DENIED,"Cannot delete root collection " + id];

                /* If either collection OR data permission are not satisfied,
                will need to evaluate grant and inherited collection
                permissions. Local ACLs could apply additional inherited
                permissions.*/

                if ((( coll_perm & a_ctxt.coll_perm ) != a_ctxt.coll_perm ) || (( data_perm & a_ctxt.data_perm ) != a_ctxt.data_perm )){
                    if ( !g_lib.hasAdminPermObjectLoaded( a_ctxt.client, doc )){
                        if ( coll_perm != null ) // Already have inherited permission, don't ask again
                            perm = g_lib.getPermissionsLocal( a_ctxt.client._id, doc );
                        else
                            perm = g_lib.getPermissionsLocal( a_ctxt.client._id, doc, true, a_ctxt.comb_perm );

                        data_perm = perm.inhgrant | perm.inherited;
                        coll_perm = perm.grant | perm.inherited;

                        if (( coll_perm & a_ctxt.coll_perm ) != a_ctxt.coll_perm )
                            throw [g_lib.ERR_PERM_DENIED,"Permission denied for data record " + id];

                    }else{
                        data_perm = a_ctxt.data_perm;
                        coll_perm = a_ctxt.coll_perm;
                    }
                }
            }else{
                if ( a_ctxt.mode == g_lib.TT_DATA_CHG_ALLOC ){
                    // Must be data owner OR if owned by a project, the project or
                    // an admin or the creator.

                    if ( doc.owner != a_ctxt.client._id ){
                        if ( doc.owner.startsWith( "p/" )){
                            if (!( doc.owner in a_ctxt.visited )){
                                if ( g_lib.hasManagerPermProj( a_ctxt.client._id, doc.owner )){
                                    // Put project ID in visited to avoid checking permissions again
                                    a_ctxt.visited[doc.owner] = 1;
                                }else{
                                    throw [g_lib.ERR_PERM_DENIED,"Permission denied for data record " + id];
                                }
                            }
                        }else{
                            throw [g_lib.ERR_PERM_DENIED,"Permission denied for data record " + id];
                        }
                    }
                }else if ( a_ctxt.mode == g_lib.TT_DATA_CHG_OWNER ){
                    // Must be data owner or creator OR if owned by a project, the project or
                    // an admin.

                    if ( doc.owner != a_ctxt.client._id && doc.creator != a_ctxt.client._id ){
                        if ( doc.owner.startsWith( "p/" )){
                            if (!( doc.owner in a_ctxt.visited )){
                                if ( g_lib.hasManagerPermProj( a_ctxt.client._id, doc.owner )){
                                    // Put project ID in visited to avoid checking permissions again
                                    a_ctxt.visited[doc.owner] = 1;
                                }else{
                                    throw [g_lib.ERR_PERM_DENIED,"Permission denied for data record " + id];
                                }
                            }
                        }else{
                            throw [g_lib.ERR_PERM_DENIED,"Permission denied for data record " + id];
                        }
                    }
                }else{
                    if (( data_perm & a_ctxt.data_perm ) != a_ctxt.data_perm ){
                        if ( !g_lib.hasAdminPermObjectLoaded( a_ctxt.client, doc )){
                            if ( a_data_perm != null ) // Already have inherited permission, don't ask again
                                perm = g_lib.getPermissionsLocal( a_ctxt.client._id, doc );
                            else
                                perm = g_lib.getPermissionsLocal( a_ctxt.client._id, doc, true, a_ctxt.data_perm );

                            if ((( perm.grant | perm.inherited ) & a_ctxt.data_perm ) != a_ctxt.data_perm )
                                throw [g_lib.ERR_PERM_DENIED,"Permission denied for data record " + id];
                        }
                    }
                }
            }

            // Permission OK, process item

            if ( is_coll ){
                a_ctxt.coll.push( id );
                ids = g_db._query( "for v in 1..1 outbound @coll item return v._id", { coll: id }).toArray();
                obj._preprocessItemsRecursive( a_ctxt, ids, data_perm, coll_perm );
            }else{
                if ( doc.data_url ){
                    if ( a_ctxt.mode == g_lib.TT_DATA_PUT )
                        throw [g_lib.ERR_INVALID_PARAM,"Cannot PUT data to published record."];
                    if ( a_ctxt.mode == g_lib.TT_DATA_GET )
                        a_ctxt.http_data.push({ id: id, title: doc.title, owner: doc.owner, url: doc.data_url, ext: doc.ext });
                    else
                        a_ctxt.no_data.push({ id: id, owner: doc.owner });
                }else if ( doc.size || a_ctxt.mode == g_lib.TT_DATA_PUT ){
                    a_ctxt.globus_data.push({ id: id, title: doc.title, owner: doc.owner, size: doc.size, ext: doc.ext });
                }else if ( !doc.size ){
                    a_ctxt.no_data.push({ id: id, owner: doc.owner });
                }
            }
        }
    };


    obj._processTaskDeps = function( a_task_id, a_ids, a_lock_lev, a_context ){
        var i, id, lock, locks, block = new Set();
        for ( i in a_ids ){
            // ensure dependency exists
            id = a_ids[i];

            // Gather other tasks with priority over this new one
            locks = g_db.lock.byExample({_to: id });
            while ( locks.hasNext() ){
                lock = locks.next();
                if ( lock.context == a_context ){
                    if ( lock.level > 1 )
                        throw [g_lib.ERR_INVALID_PARAM,"Operation involves deleted items."];

                    if ( a_lock_lev > 0 || lock.level > 0 ){
                        block.add(lock._from);
                    }
                }
            }

            // Add new lock
            if ( a_context )
                g_db.lock.save({ _from: a_task_id, _to: id, level: a_lock_lev, context: a_context });
            else
                g_db.lock.save({ _from: a_task_id, _to: id, level: a_lock_lev });
        }

        if ( block.size ){
            block.forEach( function(val){
                g_db.block.save({ _from: a_task_id, _to: val });
            });

            return true;
        }
        return false;
    };


    obj._computeDataPaths = function( a_owner_id, a_mode, a_data, a_src_repos, a_rem_path ){
        var data, loc, file, result = { ids: [], data_size: 0, rec_count: 0 };

        var repo_map = {};

        for ( var i in a_data ){
            data = a_data[i];

            // Get data storage location
            loc = g_db._query("for v,e in 1..1 outbound @data loc return { repo: v, loc: e }", { data: data.id });
            if ( !loc.hasNext( ))
                throw [g_lib.ERR_INTERNAL_FAULT,"No storage location for data record, " + data.id];

            loc = loc.next();
            file = { id: data.id, size: data.size };

            switch ( a_mode ){
                case g_lib.TT_DATA_PUT:
                    file.from = a_rem_path;
                    file.to = g_lib.computeDataPath(loc.loc);
                    break;
                case g_lib.TT_DATA_GET:
                    file.from = g_lib.computeDataPath(loc.loc);
                    file.to = data.id.substr( 2 ) + (data.ext?data.ext:"");
                    break;
                case g_lib.TT_DATA_CHG_ALLOC:
                    // Ignore moves to same repo/allocation
                    if ( data.owner == a_owner_id && loc.repo._id == a_rem_path )
                        continue;
                    file.from = g_lib.computeDataPath(loc.loc);
                    file.to = data.id.substr( 2 );
                    break;
                case g_lib.TT_DATA_CHG_OWNER:
                    // Ignore moves to same repo/allocation
                    if ( data.owner == a_owner_id && loc.repo._id == a_rem_path )
                        continue;
                    file.from = g_lib.computeDataPath(loc.loc);
                    file.to = data.id.substr( 2 );
                    break;
                case  g_lib.TT_DATA_DEL:
                    file.from = g_lib.computeDataPath(loc.loc);
                    break;
            }

            result.data_size += data.size;
            result.rec_count++;
            result.ids.push( data.id );

            if ( loc.repo._key in repo_map ){
                repo_map[loc.repo._key].files.push(file);
            }else{
                repo_map[loc.repo._key] = {repo_id:loc.repo._id,repo_ep:loc.repo.endpoint,files:[file]};
            }
        }

        for ( i in repo_map ){
            a_src_repos.push(repo_map[i]);
        }

        return result;
    };


    obj._createTask = function( a_client_id, a_type, a_state ){
        var time = Math.floor( Date.now()/1000 );
        var obj = { type: a_type, status: g_lib.TS_READY, msg: "Pending", ct: time, ut: time, progress: 0, client: a_client_id, state: a_state };

        return obj;
    };



    obj.dataGet = function( a_client, a_path, a_encrypt, a_res_ids ){
        var result = obj.preprocessItems( a_client, null, a_res_ids, g_lib.TT_DATA_GET );

        //var result = {globus_data: [], http_data: [], no_data: []};
        //obj._dataOpPreProc({ client: a_client, mode: g_lib.TT_DATA_GET, perm: g_lib.PERM_RD_DATA, result: result }, a_res_ids );

        if ( result.globus_data.length > 0 ){
            var state = { encrypt: a_encrypt, repos: [] };
            var idx = a_path.indexOf("/");

            if ( idx == -1 )
                throw [g_lib.ERR_INVALID_PARAM,"Invalid destination path (must include endpoint)"];

            state.dst_ep = a_path.substr(0,idx);
            state.dst_path = a_path.substr(idx);

            if ( state.dst_path.charAt( state.dst_path.length - 1 ) != "/" )
                state.dst_path += "/";

            var data = obj._computeDataPaths( a_client._id, g_lib.TT_DATA_GET, result.globus_data, state.repos, null );

            if ( data.ids.length ){
                var doc = obj._createTask( a_client._id, g_lib.TT_DATA_GET, state );
                var task = g_db.task.save( doc, { returnNew: true });

                if ( obj._processTaskDeps( task.new._id, data.ids, 0 )){
                    task = g_db._update( task.new._id, { status: g_lib.TS_BLOCKED, msg: "Queued" }, { returnNew: true });
                }

                task.new.id = task.new._id;
                delete task.new._id;
                delete task.new._key;
                delete task.new._rev;

                result.task = task.new;
            }
        }

        return result;
    };


    obj.dataPut = function( a_client, a_path, a_encrypt, a_ext, a_res_ids ){
        var result = obj.preprocessItems( a_client, null, a_res_ids, g_lib.TT_DATA_PUT );

        //var result = {globus_data: []};
        //obj._dataOpPreProc({ client: a_client, mode: g_lib.TT_DATA_PUT, perm: g_lib.PERM_WR_DATA, result: result }, a_res_ids );

        if ( result.globus_data.length > 0 ){
            var state = { encrypt: a_encrypt, repos: [] };

            if ( a_ext )
                state.ext = a_ext;

            var idx = a_path.indexOf("/");

            if ( idx == -1 )
                throw [g_lib.ERR_INVALID_PARAM,"Invalid destination path (must include endpoint)"];

            state.src_ep = a_path.substr(0,idx);
            state.src_path = a_path.substr(idx);

            var data = obj._computeDataPaths( a_client._id, g_lib.TT_DATA_PUT, result.globus_data, state.repos, state.src_path );

            if ( data.ids.length ){
                var doc = obj._createTask( a_client._id, g_lib.TT_DATA_PUT, state );
                var task = g_db.task.save( doc, { returnNew: true });

                if ( obj._processTaskDeps( task.new._id, data.ids, 1 )){
                    task = g_db._update( task.new._id, { status: g_lib.TS_BLOCKED, msg: "Queued" }, { returnNew: true });
                }

                task.new.id = task.new._id;
                delete task.new._id;
                delete task.new._key;
                delete task.new._rev;

                result.task = task.new;
            }
        }

        return result;
    };


    /**
     * 
     * This operation moves raw data of one or more data records (specified by
     * ID or by parent collection) to a new allocation. Ownership and linkages
     * of the data does not change. If the client is not the owner (i.e. project
     * data), in order to move the raw data the client must be a project owner/
     * admin, the creating team member of the data, or be a team member with
     * delete permission on the data record. If these conditions are not met an
     * error will be thrown. This means that "guest" creators of data in other
     * accounts can not change the initial allocation used for that data.
     */
    obj.dataChangeAllocation = function( a_client, a_proj_id, a_dst_repo_id, a_encrypt, a_res_ids ){
        // Verify that client is owner, or has admin permission to project owner
        var owner_id;

        if ( a_proj_id ){
            if ( !a_proj_id.startsWith("p/"))
                throw [ g_lib.ERR_INVALID_PARAM, "Invalid project ID '" + a_proj_id + "'" ];

            if ( g_lib.hasManagerPermProj( a_client, a_proj_id ))
                throw [ g_lib.ERR_PERM_DENIED, "Operation requires admin permissions to project." ];

            owner_id = a_proj_id;
        }else{
            owner_id = a_client._id;
        }

        // Verify destination repo
        if ( !g_db.repo.exists( a_dst_repo_id ))
            throw [ g_lib.ERR_INVALID_PARAM, "No such repo '" + a_dst_repo_id + "'" ];

        // Verify client/owner has an allocation
        var alloc = g_db.alloc.firstExample({ _from: owner_id, _to: a_dst_repo_id });
        if ( !alloc )
            throw [ g_lib.ERR_INVALID_PARAM, "No allocation on '" + a_dst_repo_id + "'" ];

        // Owner is client for move operation
        var result = obj.preprocessItems({ _id: owner_id, is_admin: false }, null, a_res_ids, g_lib.TT_DATA_CHG_ALLOC );

        if ( result.globus_data.length > 0 ){
            var state = { encrypt: a_encrypt, repos: [] };
            var dst_repo = g_db.repo.document( a_dst_repo_id );

            state.dst_ep = dst_repo.endpoint;
            state.dst_path = dst_repo.path + (a_proj_id?"project":"user") + owner_id.substr(1) + "/";

            var data = obj._computeDataPaths( owner_id, g_lib.TT_DATA_CHG_ALLOC, result.globus_data, state.repos, a_dst_repo_id );

            if ( data.ids.length ){
                // Verify that allocation has room for records
                if ( data.rec_count + alloc.rec_count > alloc.rec_limit )
                    throw [ g_lib.ERR_PERM_DENIED, "Operation exceeds allocation record limit (max: "+alloc.rec_limit+")." ];

                // Verify that allocation has room for data
                if ( data.data_size + alloc.data_size > alloc.data_limit )
                    throw [ g_lib.ERR_PERM_DENIED, "Operation exceeds allocation data size limit (max: "+alloc.data_limit+")." ];

                var doc = obj._createTask( a_client._id, g_lib.TT_DATA_CHG_ALLOC, state );
                var task = g_db.task.save( doc, { returnNew: true });

                if ( obj._processTaskDeps( task.new._id, data.ids, 1 )){

                    task = g_db._update( task.new._id, { status: g_lib.TS_BLOCKED, msg: "Queued" }, { returnNew: true });
                }

                task.new.id = task.new._id;
                delete task.new._id;
                delete task.new._key;
                delete task.new._rev;

                result.task = task.new;
            }
        }

        return result;
    };


    /**
     * 
     * This operation changes the owner of one or more data records (specified
     * by ID or by parent collection) and moves the associated raw data to an
     * allocation of the new owner. The new owner and allocation are determined
     * by the destination collection which may have a default allocation, or if
     * not, the global default for the new owner is used. The client must be
     * the owner or creator of the data being transferred, and they must have
     * CREATE permission on the destination collection. Any existing ACLs on
     * the data are cleared.
     */
    obj.dataChangeOwner = function( a_client, a_dst_coll_id, a_encrypt, a_res_ids ){
        // Verify dest collection exists
        if ( !g_db.c.exists( a_dst_coll_id ))
            throw [ g_lib.ERR_INVALID_PARAM, "No such collection '" + a_dst_coll_id + "'" ];

        var dest_coll = g_db.c.document( a_dst_coll_id );

        // Verify client permissions on destination collection
        if ( dest_coll.owner != a_client._id ){
            if ( !g_lib.hasAdminPermObjectLoaded( a_client, dest_coll )){
                if ( !g_lib.hasPermissions( a_client, dest_coll, g_lib.PERM_CREATE, true ))
                    throw [ g_lib.ERR_INVALID_PARAM, "Operation requires CREATE permission on destination collection." ];
            }
        }

        // Get associated or default allocation for new owner
        var alloc, loc = g_db.loc.firstExample({ _from: dest_coll._id });
        if ( loc ){
            alloc = g_db.alloc.firstExample({ _from: loc.uid, _to: loc._to });
        }else{
            alloc = g_lib.assignRepo( dest_coll.owner );
        }

        if ( !alloc )
            throw [ g_lib.ERR_INVALID_PARAM, "No allocation available for destination owner." ];

        var result = obj.preprocessItems( a_client, dest_coll.owner, a_res_ids, g_lib.TT_DATA_CHG_OWNER );

        if ( result.globus_data.length > 0 ){
            var state = { encrypt: a_encrypt, repos: [] };
            var dst_repo = g_db.repo.document( alloc._to );

            state.dst_repo_id = dst_repo._id;
            state.dst_ep = dst_repo.endpoint;

            if ( dest_coll.owner.charAt(0) == 'u' ){
                state.dst_path = dst_repo.path + "user" + dest_coll.owner.substr(1) + "/";
            }else{
                state.dst_path = dst_repo.path + "project" + dest_coll.owner.substr(1) + "/";
            }

            var data = obj._computeDataPaths( dest_coll.owner, g_lib.TT_DATA_CHG_OWNER, result.globus_data, state.repos, state.dst_repo_id );

            if ( data.ids.length ){
                // Verify that allocation has room for records
                if ( data.rec_count + alloc.rec_count > alloc.rec_limit )
                    throw [g_lib.ERR_PERM_DENIED, "Operation exceeds allocation record limit (max: "+alloc.rec_limit+")."];

                // Verify that allocation has room for data
                if ( data.data_size + alloc.data_size > alloc.data_limit )
                    throw [g_lib.ERR_PERM_DENIED, "Operation exceeds allocation data size limit (max: "+alloc.data_limit+")."];
            
                var doc = obj._createTask( a_client._id, g_lib.TT_DATA_CHG_OWNER, state );
                var task = g_db.task.save( doc, { returnNew: true });

                if ( obj._processTaskDeps( task.new._id, data.ids, 1 )){

                    task = g_db._update( task.new._id, { status: g_lib.TS_BLOCKED, msg: "Queued" }, { returnNew: true });
                }

                task.new.id = task.new._id;
                delete task.new._id;
                delete task.new._key;
                delete task.new._rev;

                result.task = task.new;
            }
        }

        return result;
    };


    /** @brief Delete data and/or collections by ID (not alias)
     * 
     * Immediately deletes collections and data records without managed raw
     * data, and marks and schedules records with managed data for deletion
     * with a background task. When this task completes, the marked records
     * are then deleted and user allocations adjusted. Conflicting pre-
     * existing tasks are honored, but subsequent tasks (get, put, move) will
     * be rejected. Note that records are only deleted if they are either
     * specifically identified for deletion (in the initial ids parameter), or
     * are only linked within the collections being deleted.
     */
    obj.dataCollDelete = function( a_owner, a_res_ids ){
        var result = obj.preprocessItems( a_owner, null, a_res_ids, g_lib.TT_DATA_DEL );
        var i, alloc_adj = {};

        // Delete collections
        for ( i in result.coll ){
            obj.deleteCollection( result.coll[i] );
        }

        // Delete records with no data
        for ( i in result.no_data ){
            obj.deleteDataRecordWithoutData( result.no_data[i].id, alloc_adj );
        }

        obj.updateAllocations( alloc_adj );

        // Mark and schedule records with data for delete
        if ( result.globus_data.length ){
            var state = { repos: [] };
            var data = obj._computeDataPaths( a_owner._id, g_lib.TT_DATA_DEL, result.globus_data, state.repos );

            if ( data.ids.length ){
                var doc = obj._createTask( a_owner._id, g_lib.TT_DATA_DEL, state );
                var task = g_db.task.save( doc, { returnNew: true });

                if ( obj._processTaskDeps( task.new._id, data.ids, 2 )){
                    task = g_db._update( task.new._id, { status: g_lib.TS_BLOCKED, msg: "Queued" }, { returnNew: true });
                }

                // Records with managed data must be marked as deleted, but not actually deleted
                for ( i in result.globus_data ){
                    obj.trashDataRecordWithData( result.globus_data[i].id );
                }

                task.new.id = task.new._id;
                delete task.new._id;
                delete task.new._key;
                delete task.new._rev;

                result.task = task.new;
            }
        }

        return result;
    };



    /** @brief Delete projects and associated data
     *
     * Delete or mark as deleted one or more projects based on whether each
     * project has one or more allocations, and, if so, whether any data
     * records have associated raw data. If a project has no allocations,
     * it can be deleted immediately. If a project has allocations but no
     * raw data, the project can be deleted, but a task must be initialized
     * to delete the allocations. If a project has allocations with raw
     * data AND there are existing tasks with dependencies on the records
     * with raw data, then the project must be "trashed" such that it can no
     * longer be used, and a task initialized to delete both the trashed
     * project and the allocations. Note that permissions need only be checked
     * at the project level, not at the data/collection level.
     */
    obj.projectDelete = function( a_client, a_proj_ids ){
        var i,proj_id,proj;

        // Verify existence and check permission
        for ( i in a_proj_ids ){
            proj_id = a_proj_ids[i];
            if ( !g_db.p.exists( proj_id ))
                throw [ g_lib.ERR_INVALID_PARAM, "No such project '" + proj_id + "'" ];

            proj = g_db.p.document( proj_id );
            if ( proj.deleted )
                throw [ g_lib.ERR_INVALID_PARAM, "No such project '" + proj_id + "'" ];

            g_lib.ensureAdminPermProj( a_client, proj_id );
        }

        var allocs, alloc, locks, lock, can_del;
        var task_allocs = [], task_proj_ids = [], task_blocks = new Set();

        // For each project, determine allocation/raw data status and take appropriate actions
        for ( i in a_proj_ids ){
            proj_id = a_proj_ids[i];
            
            locks = g_db.lock.byExample({ _to: proj_id });

            can_del = !locks.hasNext();

            while( locks.hasNext() ){
                lock = locks.next();
                if ( lock.level == 2 )
                    throw [g_lib.ERR_INVALID_PARAM, "Operation refers to deleted project: " + proj_id];

                task_blocks.add(lock._from);
            }

            // Check for allocations
            allocs = g_db.alloc.byExample({ _from: proj_id });
            while ( allocs.hasNext() ){
                alloc = allocs.next();
                task_allocs.push({ repo_id: alloc._to, path: alloc.path });
            }

            if ( can_del ){
                obj._projectDeleteImmediate( proj_id );
            }else{
                obj._projectHide( proj_id );
            }
        }

        if ( task_allocs.length ){
            var state = { allocs: task_allocs };
            if ( task_proj_ids.length > 0 )
                state.proj_ids = task_proj_ids;

            var doc = obj._createTask( a_owner._id, g_lib.TT_PROJ_DEL, state );
            var task = g_db.task.save( doc, { returnNew: true });

            if ( data_ids.length && obj._processTaskDeps( task.new._id, data_ids, 2 )){
                task = g_db._update( task.new._id, { status: g_lib.TS_BLOCKED, msg: "Queued" }, { returnNew: true });
            }

            // Records with managed data must be marked as deleted, but not actually deleted
            for ( i in result.globus_data ){
                obj.trashDataRecordWithData( result.globus_data[i].id );
            }

            task.new.id = task.new._id;
            delete task.new._id;
            delete task.new._key;
            delete task.new._rev;

            result.task = task.new;
        }

        return result;


    };

        /** @brief Deletes project immediately
     *
     * Deletes projects and associated graph objects.
     *
     * DO NOT USE ON PROJECTS WITH RAW DATA!!!!
     */
    obj._projectDeleteImmediate = function( a_id, a_alloc_adj ){
        var alias = g_db.alias.firstExample({ _from: a_id });
        if ( alias ){
            g_graph.a.remove( alias._to );
        }

        var owner = g_db.owner.firstExample({ _from: a_id });
        var loc = g_db.loc.firstExample({ _from: a_id });
        var alloc_id = g_db.alloc.firstExample({ _from: owner._to, _to: loc._to })._id;

        if ( alloc_id in a_alloc_adj ){
            a_alloc_adj[alloc_id].rec_count -= 1;
        }else{
            a_alloc_adj[alloc_id] = { data_size: 0, rec_count: -1 };
        }

        g_graph.d.remove( a_id );
    };


    /** @brief Marks project as deleted and moves to trash
     *
     * Marks project as deleted and removes some graph associations. Does not
     * delete data records.
     */
    obj._projectHide = function( a_proj_id ){
        // Mark project as deleted
        g_db.p.update( a_proj_id, { deleted: true });

        // Mark all collections and records as deleted
        //var id, ids = g_db._query( "for v in 1..1 inbound @proj owner filter IS_SAME_COLLECTION('d',v) or IS_SAME_COLLECTION('c',v) return v._id", { proj: a_id });
        var item, items = g_db.owner.byExample({ _to: a_proj_id });
        while ( items.hasNext() ){
            item = items.next();
            if ( item._from.charAt(0) == 'd' )
                g_db.d.update( id, { deleted: true });
            else if ( item._from.charAt(0) == 'c' )
                g_db.c.update( id, { deleted: true });
        }
    };


    /** @brief Deletes a collection record
     *
     * NOTE: DO NOT CALL THIS DIRECTLY - USED ONLY BY TASK/PROCESS CODE
     *
     * Does not recursively delete contained items.
     */
    obj.deleteCollection = function( a_id ){
        var tmp = g_db.alias.firstExample({ _from: a_id });
        if ( tmp ){
            g_graph.a.remove( tmp._to );
        }

        tmp = g_db.top.firstExample({ _from: a_id });
        if ( tmp )
            g_lib.topicUnlink( a_id );

        g_graph.c.remove( a_id );
    };

    /** @brief Deletes data records without raw data
     *
     * Deletes record and associated graph objects. Does not delete raw data
     * nor adjust allocations for owner.
     *
     * DO NOT USE ON RECORDS WITH RAW DATA!!!!
     */
    obj.deleteDataRecordWithoutData = function( a_id, a_alloc_adj ){
        var alias = g_db.alias.firstExample({ _from: a_id });
        if ( alias ){
            g_graph.a.remove( alias._to );
        }

        var owner = g_db.owner.firstExample({ _from: a_id });
        var loc = g_db.loc.firstExample({ _from: a_id });
        var alloc_id = g_db.alloc.firstExample({ _from: owner._to, _to: loc._to })._id;

        if ( alloc_id in a_alloc_adj ){
            a_alloc_adj[alloc_id].rec_count -= 1;
        }else{
            a_alloc_adj[alloc_id] = { data_size: 0, rec_count: -1 };
        }

        g_graph.d.remove( a_id );
    };


    /** @brief Marks data record as deleted and moves to trash
     *
     * Marks record as deleted and removes some graph associations. Does not
     * delete raw data nor adjust allocations for owner.
     */
    obj.trashDataRecordWithData = function( a_id ){
        // Get rid of alias
        var alias = g_db.alias.firstExample({ _from: a_id });
        if ( alias ){
            g_graph.a.remove( alias._to );
        }

        // Get rid of collection links
        g_db.item.removeByExample({ _to: a_id });

        // Get rid of direct ACLs
        g_db.acl.removeByExample({ _from: a_id });

        // Mark record as deleted
        g_db.d.update( a_id, { deleted: true });
    };

    /** @brief Deletes a data record that has been previously "trashed"
     *
     * Compute  allocation adjustments then remove data record. All other work
     * has already been done when record was trashed.
     */
    obj.deleteTrashedRecord = function( a_data, a_alloc_adj ){
        console.log("deleteThrashedRecord:",a_data._id);
        var adj, loc = g_db.loc.firstExample({ _from: a_data._id });
        var alloc_id = g_db.alloc.firstExample({ _from: a_data.owner, _to: loc._to })._id;

        console.log("alloc ID:",alloc_id);

        if ( alloc_id in a_alloc_adj ){
            adj = a_alloc_adj[alloc_id];
            console.log("in alloc_adj",adj);
            adj.data_size -= a_data.size;
            adj.rec_count -= 1;
        }else{
            console.log("NOT in alloc_adj");
            a_alloc_adj[alloc_id] = { data_size: -a_data.size, rec_count: -1 };
        }

        console.log("new alloc_adj",a_alloc_adj[alloc_id]);

        g_graph.d.remove( a_data._id );
    };

    /** @brief Update allocations with provided adjustments
     * @param a_alloc_adj - object with alloc/user/project id as key and adjustments in value
     *
     * Adjustments are made to allocations, user, and/or project records.
     * Allocations adjustments include data size and record count, user/project
     * adjustments are record and collection count and data size (for summary purposes).
     */
    obj.updateAllocations = function( a_alloc_adj ){
        console.log("updateAllocations",a_alloc_adj);
        var doc, adj;
        for ( var id in a_alloc_adj ){
            adj = a_alloc_adj[id];
            console.log("alloc",id,adj);

            if ( id.charAt(0) == 'u'|| id.charAt(0) == 'p' ){
                doc = g_db.document( id );
                g_db._update( id, { data_size: doc.data_size + adj.data_size, rec_count: doc.rec_count + adj.rec_count, coll_count: doc.coll_count + adj.coll_count });
            }else{
                doc = g_db.alloc.document( id );
                g_db._update( id, { data_size: doc.data_size + adj.data_size, rec_count: doc.rec_count + adj.rec_count });
            }
        }
    };

    obj.allocCreate = function( a_client, a_repo_id, a_subject_id, a_path ){
        var state = { repo: a_repo_id, subject: a_subject_id, path: a_path };
        var doc = obj._createTask( a_client._id, g_lib.TT_ALLOC_CREATE, state );
        var task = g_db.task.save( doc, { returnNew: true });

        if ( obj._processTaskDeps( task.new._id, [a_repo_id], 1, a_subject_id )){
            task = g_db._update( task.new._id, { status: g_lib.TS_BLOCKED, msg: "Queued" }, { returnNew: true });
        }

        task.new.id = task.new._id;
        delete task.new._id;
        delete task.new._key;
        delete task.new._rev;

        task = task.new;

        return { "task" : task };
    };


    obj.allocDelete = function( a_client, a_repo_id, a_subject_id, a_path ){
        var state = { repo: a_repo_id, subject: a_subject_id, path: a_path };
        var doc = obj._createTask( a_client._id, g_lib.TT_ALLOC_DEL, state );
        var task = g_db.task.save( doc, { returnNew: true });

        if ( obj._processTaskDeps( task.new._id, [a_repo_id], 1, a_subject_id )){
            task = g_db._update( task.new._id, { status: g_lib.TS_BLOCKED, msg: "Queued" }, { returnNew: true });
        }

        task.new.id = task.new._id;
        delete task.new._id;
        delete task.new._key;
        delete task.new._rev;

        task = task.new;

        return { "task" : task };
    };


    return obj;
}() );
