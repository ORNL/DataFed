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
    obj._preprocessItems = function( a_client, a_ids, a_mode ){
        var ctxt = { client: { _id: a_client._id, is_admin: a_client.is_admin }, mode: a_mode, coll: [], globus_data: [], http_data: [], no_data: [], visited: {} };

        switch( a_mode ){
            case g_lib.TT_DATA_GET:
                ctxt.data_perm = g_lib.PERM_RD_DATA;
                ctxt.coll_perm = g_lib.PERM_LIST;
                break;
            case g_lib.TT_DATA_PUT:
                ctxt.data_perm = g_lib.PERM_WR_DATA;
                // Collections not allowed
                break;
            case g_lib.TT_DATA_MOVE:
                ctxt.data_perm = g_lib.PERM_DELETE;
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
        // are to be deleted or not (linked elsewhere)
        if ( a_mode == g_lib.TT_DATA_DEL ){
            var i, cnt, data, remove = [];

            for ( i in ctxt.globus_data ){
                data = ctxt.globus_data[i];
                cnt = ctxt.visited[data.id];
                if ( cnt == -1 || cnt == g_lib._getDataCollectionLinkCount( data.id ))
                    remove.push( data );
            }

            ctxt.globus_data = remove;
            remove = [];

            for ( i in ctxt.no_data ){
                data = ctxt.no_data[i];
                cnt = ctxt.visited[data.id];
                if ( cnt == -1 || cnt == g_lib._getDataCollectionLinkCount( data.id ))
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
                    throw [ obj.ERR_INVALID_PARAM, "Collections not supported for PUT operations." ];
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
                throw [ obj.ERR_INVALID_PARAM, (is_coll?"Collection '":"Data record '") + id + "' does not exist." ];

            doc = g_db._document( id );

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
                        a_ctxt.http_data.push({ id: id, owner: doc.owner, url: doc.data_url, ext: doc.ext });
                    else
                        a_ctxt.no_data.push({ id: id, owner: doc.owner });
                }else if ( doc.size || a_ctxt.mode == g_lib.TT_DATA_PUT ){
                    a_ctxt.globus_data.push({ id: id, owner: doc.owner, size: doc.size, ext: doc.ext });
                }else if ( !doc.size ){
                    a_ctxt.no_data.push({ id: id, owner: doc.owner });
                }
            }
        }
    };


    /*
    obj._dataOpPreProc = function( a_ctxt, a_ids, a_visited ){
        var id, doc, list;

        if ( !a_visited )
            a_visited = new Set();

        for ( var i in a_ids ){
            id = a_ids[i];
            //console.log("proc",id);

            if ( id.charAt(0) == 'c' ){
                if ( !g_lib.hasAdminPermObject( a_ctxt.client, id )) {
                    doc = g_db.c.document( id );
                    if ( !g_lib.hasPermissions( a_ctxt.client, doc, g_lib.PERM_LIST ))
                        throw g_lib.ERR_PERM_DENIED;
                }
                //console.log("read coll");

                list = g_db._query( "for v in 1..1 outbound @coll item return v._id", { coll: id }).toArray();
                obj._dataOpPreProc( a_ctxt, list, a_visited );
            }else{
                if ( !a_visited.has( id )){
                    //console.log("not visited");

                    doc = g_db.d.document( id );
                    if ( !g_lib.hasAdminPermObject( a_ctxt.client, id )) {
                        if ( !g_lib.hasPermissions( a_ctxt.client, doc, a_ctxt.perm ))
                            throw g_lib.ERR_PERM_DENIED;
                    }

                    //console.log("store res");
                    if ( doc.data_url ){
                        if ( a_ctxt.mode == g_lib.TT_DATA_PUT )
                            throw [g_lib.ERR_INVALID_PARAM,"Cannot perform operation on published data."];
                        if ( a_ctxt.mode == g_lib.TT_DATA_GET )
                            a_ctxt.result.http_data.push({ id: id, owner: doc.owner, url: doc.data_url, ext: doc.ext });
                        else
                            a_ctxt.result.no_data.push({ id: id, owner: doc.owner });
                    }else if ( doc.size || a_ctxt.mode == g_lib.TT_DATA_PUT ){
                        a_ctxt.result.globus_data.push({ id: id, owner: doc.owner, size: doc.size, ext: doc.ext });
                    }else if ( !doc.size ){
                        a_ctxt.result.no_data.push({ id: id, owner: doc.owner });
                    }
                    a_visited.add(id);
                }
            }
        }
    };*/


    obj._processTaskDeps = function( a_task_id, a_data, a_write ){
        var i, j, data, lock, locks, block = new Set();
        for ( i in a_data ){
            // ensure dependency exists
            data = a_data[i];

            // Gather other tasks with priority over this new one
            locks = g_db.lock.byExample({_to: data.id });
            while ( locks.hasNext() ){
                lock = locks.next();
                if ( a_write || lock.write ){
                    block.add(lock._from);
                }
            }

            // Add new lock
            g_db.lock.save({ _from: a_task_id, _to: data.id, write: a_write });
        }

        if ( block.size ){
            block.forEach( function(val){
                g_db.block.save({ _from: a_task_id, _to: val });
            });

            return true;
        }
        return false;
    };


    obj._computeDataPaths = function( a_client, a_mode, a_data, a_src_repos, a_rem_path ){
        var data, loc, file;

        for ( var i in a_data ){
            data = a_data[i];

            // Get data storage location
            loc = g_db._query("for v,e in 1..1 outbound @data loc return { repo: v, loc: e }", { data: data.id });
            if ( !loc.hasNext( ))
                throw [g_lib.ERR_INTERNAL_FAULT,"No storage location for data record, " + data.id];

            loc = loc.next();
            file = { id: data.id };

            if ( a_mode == g_lib.TT_DATA_PUT ){
                file.from = a_rem_path;
                file.to = g_lib.computeDataPath(loc.loc);
            }else if ( a_mode == g_lib.TT_DATA_GET ){
                file.from = g_lib.computeDataPath(loc.loc);
                file.to = data.id.substr( 2 ) + (data.ext?data.ext:"");
            }else if ( a_mode == g_lib.TT_DATA_MOVE ){
                // Ignore moves to same repo/allocation
                if ( data.owner == a_client._id && loc.repo._id == a_rem_path )
                    continue;
                file.from = g_lib.computeDataPath(loc.loc);
                file.to = data.id.substr( 2 );
            }else{ // DELETE
                file.from = g_lib.computeDataPath(loc.loc);
            }

            if ( loc.repo._key in a_src_repos ){
                a_src_repos[loc.repo._key].files.push(file);
            }else{
                a_src_repos[loc.repo._key] = {repo_id:loc.repo._key,repo_ep:loc.repo.endpoint,files:[file]};
            }
        }
    };


    obj._createTask = function( a_client_id, a_type, a_state ){
        var time = Math.floor( Date.now()/1000 );
        var obj = { type: a_type, status: g_lib.TS_READY, msg: "Pending", ct: time, ut: time, progress: 0, user: a_client_id, state: a_state };

        return obj;
    };

    obj._deleteCollection = function( a_id ){
        var tmp = g_db.alias.byExample({ _from: a_id });
        if ( tmp ){
            g_graph.a.remove({ _id: tmp._to });
        }

        tmp = g_db.top.firstExample({ _from: a_id });
        if ( tmp )
            g_lib.topicUnlink( a_id );

        g_graph.c.remove( a_id );
    };

    /** @brief Deletes data record but not raw data
     *
     * Deletes record and associated graph objects. Does not delete raw data
     * nor adjust allocations for owner.
     */
    obj._deleteDataRecord = function( a_id ){
        var alias = g_db.alias.byExample({ _from: a_id });
        if ( alias ){
            g_graph.a.remove({ _id: alias._to });
        }

        g_graph.d.remove( a_id );
    };


    /** @brief Marks data record as deleted and moves to trash
     *
     * Marks record as deleted and removes some graph associations. Does not
     * delete raw data nor adjust allocations for owner.
     */
    obj._trashDataRecord = function( a_id ){
        // Get rid of alias
        var alias = g_db.alias.byExample({ _from: a_id });
        if ( alias ){
            g_graph.a.remove({ _id: alias._to });
        }

        // Get rid of collection links
        g_db.item.removeByExample({ _to: a_id });

        // Get rid of direct ACLs
        g_db.acl.removeByExample({ _from: a_id });

        // Mark record as deleted
        g_db.d._update( a_id, { deleted: true });
    };


    obj.dataGet = function( a_client, a_path, a_encrypt, a_res_ids ){
        var result = obj._preprocessItems( a_client, a_res_ids, g_lib.TT_DATA_GET );

        //var result = {globus_data: [], http_data: [], no_data: []};
        //obj._dataOpPreProc({ client: a_client, mode: g_lib.TT_DATA_GET, perm: g_lib.PERM_RD_DATA, result: result }, a_res_ids );

        if ( result.globus_data.length > 0 ){
            var state = { encrypt: a_encrypt, encrypted: false, repo_idx: 0, file_idx: 0, repos: {} };
            var idx = a_path.indexOf("/");

            if ( idx == -1 )
                throw [g_lib.ERR_INVALID_PARAM,"Invalid destination path (must include endpoint)"];

            state.dst_ep = a_path.substr(0,idx);
            state.dst_path = a_path.substr(idx);

            if ( state.dst_path.charAt( state.dst_path.length - 1 ) != "/" )
                state.dst_path += "/";

            obj._computeDataPaths( a_client, g_lib.TT_DATA_GET, result.globus_data, state.repos, null );

            var doc = obj._createTask( a_client._id, g_lib.TT_DATA_GET, state );
            var task = g_db.task.save( doc, { returnNew: true });

            if ( obj._processTaskDeps( task.new._id, result.globus_data, false )){
                task = g_db._update( task.new._id, { status: g_lib.TS_BLOCKED, msg: "Queued" }, { returnNew: true });
            }

            task.id = task._id;
            delete task._id;
            delete task._key;
            delete task._rev;

            result.task = task;
        }

        return result;
    };


    obj.dataPut = function( a_client, a_path, a_encrypt, a_ext, a_res_ids ){
        var result = obj._preprocessItems( a_client, a_res_ids, g_lib.TT_DATA_PUT );

        //var result = {globus_data: []};
        //obj._dataOpPreProc({ client: a_client, mode: g_lib.TT_DATA_PUT, perm: g_lib.PERM_WR_DATA, result: result }, a_res_ids );

        if ( result.globus_data.length > 0 ){
            var state = { encrypt: a_encrypt, encrypted: false, repo_idx: 0, file_idx: 0, repos: {} };

            if ( a_ext )
                state.ext = a_ext;

            var idx = a_path.indexOf("/");

            if ( idx == -1 )
                throw [g_lib.ERR_INVALID_PARAM,"Invalid destination path (must include endpoint)"];

            state.src_ep = a_path.substr(0,idx);
            state.src_path = a_path.substr(idx);

            obj._computeDataPaths( a_client, g_lib.TT_DATA_PUT, result.globus_data, state.repos, state.src_path );

            var doc = obj._createTask( a_client._id, g_lib.TT_DATA_PUT, state );
            var task = g_db.task.save( doc, { returnNew: true });

            if ( obj._processTaskDeps( task.new._id, result.globus_data, true )){
                task = g_db._update( task.new._id, { status: g_lib.TS_BLOCKED, msg: "Queued" }, { returnNew: true });
            }

            task.id = task._id;
            delete task._id;
            delete task._key;
            delete task._rev;

            result.task = task;
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
    obj.dataMove = function( a_client, a_owner_id, a_dst_repo_id, a_encrypt, a_res_ids ){
        var result = obj._preprocessItems( a_client, a_res_ids, g_lib.TT_DATA_MOVE );

        //var result = {globus_data: [], no_data: []};
        //obj._dataOpPreProc({ client: a_client, mode: g_lib.TT_DATA_MOVE, perm: g_lib.PERM_DELETE, result: result }, a_res_id );

        if ( result.globus_data.length > 0 ){
            var state = { encrypt: a_encrypt, encrypted: false, repo_idx: 0, file_idx: 0, repos: {} };

            if ( !g_db.repo.exists( a_dst_repo_id ))
                throw [obj.ERR_INVALID_PARAM, "No such repo '" + a_dst_repo_id + "'" ];

            var dst_repo = g_db.repo.document( a_dst_repo_id );

            state.dst_ep = dst_repo.endpoint;

            if ( a_dst_owner_id.charAt(0) == 'u' ){
                state.dst_path = dst_repo.path + "user" + a_dst_owner_id.substr(1) + "/";
            }else{
                state.dst_path = dst_repo.path + "project" + a_dst_owner_id.substr(1) + "/";
            }

            //state.dst_path = g_lib.computeDataPathPrefix( a_dst_repo_id, a_client._id );

            obj._computeDataPaths( a_client, g_lib.TT_DATA_MOVE, result.globus_data, state.repos, state.dst_path );

            var doc = obj._createTask( a_client._id, g_lib.TT_DATA_MOVE, state );
            var task = g_db.task.save( doc, { returnNew: true });

            if ( obj._processTaskDeps( task.new._id, result.globus_data, true )){

                task = g_db._update( task.new._id, { status: g_lib.TS_BLOCKED, msg: "Queued" }, { returnNew: true });
            }

            task.id = task._id;
            delete task._id;
            delete task._key;
            delete task._rev;

            result.task = task;
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
    obj.dataCollDelete = function( a_client, a_res_ids ){
        var result = obj._preprocessItems( a_client, a_res_ids, g_lib.TT_DATA_DEL );
        var i;

        // Delete collections
        for ( i in result.coll ){
            obj._deleteCollection( result.coll[i] );
        }

        // Delete records with no data
        for ( i in result.no_data ){
            obj._deleteDataRecord( result.no_data[i].id );
        }

        // Mark and schedule records with data for delete
        if ( result.globus_data.length ){
            var state = { repo_idx: 0, file_idx: 0, repos: {} };

            obj._computeDataPaths( a_client, g_lib.TT_DATA_DEL, result.globus_data, state.repos );

            var doc = obj._createTask( a_client._id, g_lib.TT_DATA_DEL, state );
            var task = g_db.task.save( doc, { returnNew: true });

            if ( obj._processTaskDeps( task.new._id, result.globus_data, g_lib.TT_DATA_DEL )){
                task = g_db._update( task.new._id, { status: g_lib.TS_BLOCKED, msg: "Queued" }, { returnNew: true });
            }

            // Records with managed data must be marked as deleted, but not actually deleted
            for ( i in result.globus_data ){
                obj._trashDataRecord( result.globus_data[i].id );
            }

            task.id = task._id;
            delete task._id;
            delete task._key;
            delete task._rev;

            result.task = task;
        }

        return result;
    };



    /** @brief Delete a project and all data
     * 
     */
    obj.projectDelete = function( a_client, a_proj_id ){
    };


    return obj;
}() );
