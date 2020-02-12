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
        var ctxt = { client: { _id: a_client._id, is_admin: a_client.is_admin }, new_owner: a_new_owner_id, mode: a_mode, coll: [], glob_data: [], http_data: [], visited: {} };

        switch( a_mode ){
            case g_lib.TT_DATA_GET:
                ctxt.data_perm = g_lib.PERM_RD_DATA;
                ctxt.coll_perm = g_lib.PERM_LIST;
                break;
            case g_lib.TT_DATA_PUT:
                ctxt.data_perm = g_lib.PERM_WR_DATA;
                // Collections not allowed
                break;
            case g_lib.TT_REC_ALLOC_CHG:
                // Must be data owner OR if owned by a project, the project or
                // an admin, or the creator.
                ctxt.coll_perm = g_lib.PERM_LIST;
                break;
            case g_lib.TT_REC_OWNER_CHG:
                // Must be data owner or creator OR if owned by a project, the project or
                // an admin.
                ctxt.coll_perm = g_lib.PERM_LIST;
                break;
            case g_lib.TT_REC_DEL:
                ctxt.data_perm = g_lib.PERM_DELETE;
                ctxt.coll_perm = g_lib.PERM_DELETE;
                break;
        }

        ctxt.comb_perm = ctxt.data_perm | ctxt.coll_perm;

        obj._preprocessItemsRecursive( ctxt, a_ids, null, null );

        var i;

        // For deletion, must further process data records to determine if they
        // are to be deleted or not (if they are linked elsewhere)
        if ( a_mode == g_lib.TT_REC_DEL ){
            var cnt, data, remove = [];

            for ( i in ctxt.glob_data ){
                data = ctxt.glob_data[i];
                cnt = ctxt.visited[data.id];
                if ( cnt == -1 || cnt == g_lib.getDataCollectionLinkCount( data.id ))
                    remove.push( data );
            }

            ctxt.glob_data = remove;
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
     * @param a_ctxt - Recursion context object
     * @param a_ids - Current list of data/collection IDs to process
     * @param a_perm - Inherited permission (undefined initially)
     * 
     * This function preprocesses with optimized permission verification by
     * using a depth-first analysis of collections. If the required permission
     * is satisfied via inherited ACLs, then no further permission checks are
     * required below that point. The end result is a flat list of collections
     * and data segregated into those with Globus data (regardless of data
     * size) and those with HTTP data.
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
                    if ( a_ctxt.mode == g_lib.TT_REC_DEL ){
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
                if ( doc.is_root && a_ctxt.mode == g_lib.TT_REC_DEL )
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
                if ( a_ctxt.mode == g_lib.TT_REC_ALLOC_CHG ){
                    // Must be data owner
                    if ( doc.owner != a_ctxt.client._id ){
                        throw [g_lib.ERR_PERM_DENIED,"Permission denied for data record " + id];
                    }
                }else if ( a_ctxt.mode == g_lib.TT_REC_OWNER_CHG ){
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
                        throw [ g_lib.ERR_INVALID_PARAM, "Cannot put data to published record '" + doc.id + "'." ];

                    a_ctxt.http_data.push({ id: id, title: doc.title, owner: doc.owner, url: doc.data_url, ext: doc.ext });
                }else if ( a_ctxt.mode != g_lib.TT_DATA_GET || doc.size ){
                    a_ctxt.glob_data.push({ id: id, title: doc.title, owner: doc.owner, size: doc.size, ext: doc.ext });
                }
            }
        }
    };


    obj._ensureExclusiveAccess = function( a_ids ){
        var i, id, lock;
        for ( i in a_ids ){
            id = a_ids[i];

            lock = g_db.lock.firstExample({ _to: id });
            if ( lock )
                throw [ g_lib.ERR_PERM_DENIED, "Operation not permitted - '" + id + "' in use." ];
        }
    };

    obj._processTaskDeps = function( a_task_id, a_ids, a_lock_lev, a_owner_lock_lev, a_context ){
        var i, id, lock, locks, block = new Set(), owner, owners = new Set();
        for ( i in a_ids ){
            id = a_ids[i];

            console.log("proc task dep:",id);

            owner = g_db.owner.firstExample({ _from: id });
            if ( owner )
                owners.add( owner._to );

            // Gather other tasks with priority over this new one
            locks = g_db.lock.byExample({_to: id });
            while ( locks.hasNext() ){
                console.log("has a lock!");

                lock = locks.next();
                if ( lock.context == a_context ){
                    if ( a_lock_lev > 0 || lock.level > 0 ){
                        block.add(lock._from);
                    }
                }
            }

            console.log("save a lock");

            // Add new lock
            if ( a_context )
                g_db.lock.save({ _from: a_task_id, _to: id, level: a_lock_lev, context: a_context });
            else
                g_db.lock.save({ _from: a_task_id, _to: id, level: a_lock_lev });
        }

        owners.forEach( function( owner_id ){
            locks = g_db.lock.byExample({ _to: owner_id });
            while ( locks.hasNext() ){
                lock = locks.next();
                if ( lock.context == a_context ){
                    if ( a_owner_lock_lev > 0 || lock.level > 0 ){
                        block.add(lock._from);
                    }
                }
            }

            if ( a_context )
                g_db.lock.save({ _from: a_task_id, _to: owner_id, level: a_owner_lock_lev, context: a_context });
            else
                g_db.lock.save({ _from: a_task_id, _to: owner_id, level: a_owner_lock_lev });
        });

        if ( block.size ){
            block.forEach( function(val){
                g_db.block.save({ _from: a_task_id, _to: val });
            });

            return true;
        }
        return false;
    };


    obj._computeDataPaths = function( a_owner_id, a_mode, a_data, a_src_repos, a_rem_path ){
        var data, loc, file;

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
                case g_lib.TT_REC_ALLOC_CHG:
                    // Ignore moves to same repo/allocation
                    if ( data.owner == a_owner_id && loc.repo._id == a_rem_path )
                        continue;
                    file.from = g_lib.computeDataPath(loc.loc);
                    file.to = data.id.substr( 2 );
                    break;
                case g_lib.TT_REC_OWNER_CHG:
                    // Ignore moves to same repo/allocation
                    if ( data.owner == a_owner_id && loc.repo._id == a_rem_path )
                        continue;
                    file.from = g_lib.computeDataPath(loc.loc);
                    file.to = data.id.substr( 2 );
                    break;
                case  g_lib.TT_REC_DEL:
                    file.from = g_lib.computeDataPath(loc.loc);
                    break;
            }

            if ( loc.repo._key in repo_map ){
                repo_map[loc.repo._key].files.push(file);
            }else{
                repo_map[loc.repo._key] = {repo_id:loc.repo._id,repo_ep:loc.repo.endpoint,files:[file]};
            }
        }

        for ( i in repo_map ){
            a_src_repos.push(repo_map[i]);
        }
    };


    obj._createTask = function( a_client_id, a_type, a_state ){
        var time = Math.floor( Date.now()/1000 );
        var obj = { type: a_type, status: g_lib.TS_READY, msg: "Pending", ct: time, ut: time, progress: 0, client: a_client_id, state: a_state };

        return obj;
    };


    obj.dataGet = function( a_client, a_path, a_encrypt, a_res_ids ){
        var result = obj.preprocessItems( a_client, null, a_res_ids, g_lib.TT_DATA_GET );

        if ( result.glob_data.length > 0 ){
            var state = { encrypt: a_encrypt, repos: [] };
            var idx = a_path.indexOf("/");

            if ( idx == -1 )
                throw [g_lib.ERR_INVALID_PARAM,"Invalid destination path (must include endpoint)"];

            state.dst_ep = a_path.substr(0,idx);
            state.dst_path = a_path.substr(idx);

            if ( state.dst_path.charAt( state.dst_path.length - 1 ) != "/" )
                state.dst_path += "/";

            obj._computeDataPaths( null, g_lib.TT_DATA_GET, result.glob_data, state.repos, null );

            var doc = obj._createTask( a_client._id, g_lib.TT_DATA_GET, state );
            var task = g_db.task.save( doc, { returnNew: true });

            var dep_ids = [];
            for ( var i in result.glob_data )
                dep_ids.push( result.glob_data[i].id );

            if ( obj._processTaskDeps( task.new._id, dep_ids, 0, 0 )){
                task = g_db._update( task.new._id, { status: g_lib.TS_BLOCKED, msg: "Queued" }, { returnNew: true });
            }

            task.new.id = task.new._id;
            delete task.new._id;
            delete task.new._key;
            delete task.new._rev;

            result.task = task.new;
        }

        return result;
    };


    obj.dataPut = function( a_client, a_path, a_encrypt, a_ext, a_res_ids ){
        var result = obj.preprocessItems( a_client, null, a_res_ids, g_lib.TT_DATA_PUT );

        if ( result.glob_data.length > 0 ){
            var state = { encrypt: a_encrypt, repos: [] };

            if ( a_ext )
                state.ext = a_ext;

            var idx = a_path.indexOf("/");

            if ( idx == -1 )
                throw [g_lib.ERR_INVALID_PARAM,"Invalid destination path (must include endpoint)"];

            state.src_ep = a_path.substr(0,idx);
            state.src_path = a_path.substr(idx);

            obj._computeDataPaths( null, g_lib.TT_DATA_PUT, result.glob_data, state.repos, state.src_path );

            var doc = obj._createTask( a_client._id, g_lib.TT_DATA_PUT, state );
            var task = g_db.task.save( doc, { returnNew: true });

            var dep_ids = [];
            for ( var i in result.glob_data )
                dep_ids.push( result.glob_data[i].id );

            if ( obj._processTaskDeps( task.new._id, dep_ids, 1, 0 )){
                task = g_db._update( task.new._id, { status: g_lib.TS_BLOCKED, msg: "Queued" }, { returnNew: true });
            }

            task.new.id = task.new._id;
            delete task.new._id;
            delete task.new._key;
            delete task.new._rev;

            result.task = task.new;
        }

        return result;
    };


    /** @brief Init a raw data delete task
     *
     * Input map is an object with repo_id keys to path and data ID array.
     */
    obj.taskInitDeleteRawData = function( a_client, a_del_map ){
        //console.log("taskInitDeleteRawData");
        var state = {repos:[]};
        for ( var i in a_del_map ){
            state.repos.push(a_del_map[i]);
        }
        //console.log("state.repos", state.repos );

        if ( state.repos.length ){
            var doc = obj._createTask( a_client._id, g_lib.TT_DATA_DEL, state );
            var task = g_db.task.save( doc, { returnNew: true });
            var data_ids = [];

            for ( i in a_del_map ){
                data_ids = data_ids.concat( a_del_map[i].ids );
            }

            if ( obj._processTaskDeps( task.new._id, data_ids, 1, 0 )){
                task = g_db._update( task.new._id, { status: g_lib.TS_BLOCKED, msg: "Queued" }, { returnNew: true });
            }

            task.new.id = task.new._id;
            delete task.new._id;
            delete task.new._key;
            delete task.new._rev;

            return task.new;
        }
    };


    /** @brief Initialize (or check) a record allocation change request
     * 
     * This operation initializes the move of raw data of one or more data
     * records (specified by a list of record and/or collection IDs) to a new
     * allocation. The actual move operation is implemented by a task worker
     * method in the core services. This function validates parameters and
     * checks permissions, and either reports information back to a client or
     * creates a task record.
     */

    obj.taskInitRecAllocChg = function( a_client, a_proj_id, a_res_ids, a_dst_repo_id, a_check ){
        // Verify that client is owner, or has admin permission to project owner
        var owner_id;

        if ( a_proj_id ){
            if ( !g_db.p.exists( a_proj_id ))
                throw [ g_lib.ERR_INVALID_PARAM, "Project '" + a_proj_id + "' does not exist." ];

            if ( !g_lib.hasManagerPermProj( a_client, a_proj_id ))
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

        var result = obj.preprocessItems({ _id: owner_id, is_admin: false }, null, a_res_ids, g_lib.TT_REC_ALLOC_CHG );

        var i,loc,rec,rec_ids = [];

        result.tot_cnt = result.http_data.length + result.glob_data.length;
        result.act_size = 0;
        result.act_cnt = 0;

        for ( i in result.http_data ){
            rec = result.http_data[i];
            rec_ids.push( rec.id );

            loc = g_db.loc.firstExample({ _from: rec.id });
            if ( loc._to != a_dst_repo_id ){
                result.act_cnt++;
            }
        }

        for ( i in result.glob_data ){
            rec = result.glob_data[i];
            rec_ids.push( rec.id );

            loc = g_db.loc.firstExample({ _from: rec.id });
            if ( loc._to != a_dst_repo_id ){
                if ( rec.size ){
                    result.act_cnt++;
                    result.act_size += rec.size;
                }
            }
        }

        result.act_cnt = rec_ids.length;
        result.data_limit = alloc.data_limit;
        result.data_size = alloc.data_size;
        result.rec_limit = alloc.rec_limit;
        result.rec_count = alloc.rec_count;

        // Stop if no record to process, or if this is just a check
        if ( rec_ids.length == 0 || a_check )
            return result;

        var state = { encrypt: 1, rec_ids: rec_ids, dst_repo_id: a_dst_repo_id, owner_id: owner_id };
        var doc = obj._createTask( a_client._id, g_lib.TT_REC_ALLOC_CHG, state );
        var task = g_db.task.save( doc, { returnNew: true });

        if ( obj._processTaskDeps( task.new._id, rec_ids, 1, 0 )){
            task = g_db._update( task.new._id, { status: g_lib.TS_BLOCKED, msg: "Queued" }, { returnNew: true });
        }

        task.new.id = task.new._id;
        delete task.new._id;
        delete task.new._key;
        delete task.new._rev;

        result.task = task.new;


        return result;
    };


    obj.taskStartRecAllocChg = function( a_task ){
        console.log("taskStartRecAllocChg", a_task._id );

        var dst_repo = g_db.repo.document( a_task.state.dst_repo_id );
        var is_proj = a_task.state.owner_id.charAt(0)=='p';
        var state = a_task.state;

        state.dst_repo_ep = dst_repo.endpoint;
        state.dst_repo_path = dst_repo.path + (is_proj?"project":"user") + state.owner_id.substr(1) + "/";
        state.steps = [];
        state.step = 0;
        state.substep = 0;
        state.xfr_status = 0;

        var i, j, id, rec, loc, repo, repo_map = {}, file;

        repo_map.empty = { rec_ids: [], size: 0 };

        for ( i in state.rec_ids ){
            id = state.rec_ids[i];
            rec = g_db.d.document(id);

            if ( !rec.data_url ){
                if ( rec.size == 0 ){
                    repo_map.empty.rec_ids.push( id );
                }else{
                    file = { id: id, size: rec.size };

                    loc = g_db.loc.firstExample({ _from: id });
                    repo = g_db._document( loc._to );

                    if ( is_proj ){
                        file.from = repo.path + "project" + state.owner_id.substr(1) + id.substr(1);
                    }else{
                        file.from = repo.path + "user" + state.owner_id.substr(1) + id.substr(1);
                    }
                    file.to = id.substr( 2 );

                    if ( repo._key in repo_map ){
                        repo_map[repo._key].files.push(file);
                    }else{
                        repo_map[repo._key] = {repo_id:repo._id,repo_ep:repo.endpoint,files:[file]};
                    }
                }
            }
        }

        //console.log("repo map", repo_map);

        var files, sz, k, rec_ids;

        if ( repo_map.empty.rec_ids.length ){
            state.steps.push( repo_map.empty );
        }

        delete repo_map.empty;

        for ( i in repo_map ){
            //console.log("proc repo", i);
            repo = repo_map[i];

            // Pack roughly equal transfer sizes into each transfer chunk/step

            repo.files.sort( function( a, b ){
                return b.size - a.size;
            });

            //console.log("sorted files", repo.files );

            // Push files larger than chunk size into own transfers
            for ( j = 0; j < repo.files.length; j++ ){
                if ( repo.files[j].size >= g_lib.GLOB_MAX_XFR_SIZE ){
                    state.steps.push({ rec_ids: [repo.files[j].id], size: repo.files[j].size,  xfr: { src_repo_id:repo.repo_id,src_repo_ep:repo.repo_ep,files:[repo.files[j]]}});
                }else{
                    break;
                }
            }

            for ( ; j < repo.files.length; j++ ){
                // Remaining files are smaller than max chunk size
                // Build new transfer by combining largest with smallest files
                sz = repo.files[j].size;
                rec_ids = [repo.files[j].id];
                files = [repo.files[j]];

                for ( k = j + 1; k < repo.files.length; ){
                    if ( sz + repo.files[k].size <= g_lib.GLOB_MAX_XFR_SIZE ){
                        rec_ids.push( repo.files[k].id );
                        files.push( repo.files[k] );
                        sz += repo.files[k].size;
                        repo.files.splice(k,1);
                    }else{
                        k++;
                    }
                }

                state.steps.push({ rec_ids: rec_ids, size: sz, xfr: { src_repo_id: repo.repo_id, src_repo_ep: repo.repo_ep, files: files }});
            }
        }

        // Sort steps from smallest to largest transfer size
        if ( state.steps.length ){
            state.steps.sort( function( a, b ){
                return a.size - b.size;
            });
        }

        var task = g_db._update( a_task._id, { status: g_lib.TS_RUNNING, msg: "Running", state: state }, { returnNew: true });

        task.new.id = task.new._id;
        delete task.new._id;
        delete task.new._key;
        delete task.new._rev;

        return task.new;
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
    obj.taskInitRecOwnerChg = function( a_client, a_proj_id, a_res_ids, a_dst_coll_id, a_dst_repo_id, a_check ){
        // Verify that client is owner, or has admin permission to project owner
        var old_owner_id;

        if ( a_proj_id ){
            if ( !g_db.p.exists( a_proj_id ))
                throw [ g_lib.ERR_INVALID_PARAM, "Project '" + a_proj_id + "' does not exist." ];

            if ( g_lib.getProjectRole( a_client._id, a_proj_id ) == g_lib.PROJ_NO_ROLE )
                throw [ g_lib.ERR_PERM_DENIED, "Operation requires affiliation with project '" + a_proj_id + "'" ];

            old_owner_id = a_proj_id;
        }else{
            old_owner_id = a_client._id;
        }

        var col_owner = g_db.owner.firstExample({_from: a_dst_coll_id });
        if ( col_owner._to != a_client._id ){
            if (( col_owner._to.charAt(0) != 'p' ) || !g_lib.hasManagerPermProj( a_client, a_proj_id )){
                var coll = g_db.c.document( a_dst_coll_id );
                if ( g_lib.hasPermissions( a_client, coll, g_lib.PERM_CREATE ) != true )
                    throw [ g_lib.ERR_PERM_DENIED, "Operation requires CREATE permission on destination collection '" + a_dst_coll_id + "'" ];
            }
        }

        var allocs;

        if ( a_check ){
            // Get a list of available repos for client to pick from (there must be at least one)
            allocs = g_db.alloc.byExample({ _from: col_owner._to });
            if ( !allocs.hasNext() )
                throw [ g_lib.ERR_PERM_DENIED, "No allocations available for '" + col_owner._to + "'" ];
        }else{
            // Verify destination repo
            if ( !g_db.repo.exists( a_dst_repo_id ))
                throw [ g_lib.ERR_INVALID_PARAM, "No such repo '" + a_dst_repo_id + "'" ];

            // Verify client/owner has an allocation
            if ( !g_db.alloc.firstExample({ _from: col_owner._to, _to: a_dst_repo_id }) )
                throw [ g_lib.ERR_INVALID_PARAM, "No allocation on '" + a_dst_repo_id + "'" ];
        }

        // TODO Revisit - why use owner_id instead of client?
        var result = obj.preprocessItems({ _id: old_owner_id, is_admin: false }, null, a_res_ids, g_lib.TT_REC_OWNER_CHG );
        var i,loc,rec,rec_ids = [];

        result.tot_cnt = result.http_data.length + result.glob_data.length;
        result.act_size = 0;
        result.act_cnt = 0;

        for ( i in result.http_data ){
            rec = result.http_data[i];
            rec_ids.push( rec.id );

            loc = g_db.loc.firstExample({ _from: rec.id });
            if ( loc._to != a_dst_repo_id ){
                result.act_cnt++;
            }
        }

        for ( i in result.glob_data ){
            rec = result.glob_data[i];
            rec_ids.push( rec.id );

            loc = g_db.loc.firstExample({ _from: rec.id });
            if ( loc._to != a_dst_repo_id ){
                if ( rec.size ){
                    result.act_cnt++;
                    result.act_size += rec.size;
                }
            }
        }

        result.act_cnt = rec_ids.length;

        if ( a_check ){
            result.allocs = [];
            while ( allocs.hasNext() ){
                rec = allocs.next();
                rec.repo = rec._to;
                delete rec._id;
                result.allocs.push( rec );
            }
        }

        // Stop if no record to process, or if this is just a check
        if ( rec_ids.length == 0 || a_check )
            return result;

        var state = { encrypt: 1, rec_ids: rec_ids, dst_coll_id: a_dst_coll_id, dst_repo_id: a_dst_repo_id, old_owner_id: old_owner_id, new_owner_id: col_owner._to };
        var doc = obj._createTask( a_client._id, g_lib.TT_REC_OWNER_CHG, state );
        var task = g_db.task.save( doc, { returnNew: true });

        if ( obj._processTaskDeps( task.new._id, rec_ids, 1, 0 )){
            task = g_db._update( task.new._id, { status: g_lib.TS_BLOCKED, msg: "Queued" }, { returnNew: true });
        }

        task.new.id = task.new._id;
        delete task.new._id;
        delete task.new._key;
        delete task.new._rev;

        result.task = task.new;


        return result;
    };

    obj.taskStartRecOwnerChg = function( a_task ){
        console.log("taskStartRecOwnerChg", a_task._id );

        var dst_repo = g_db.repo.document( a_task.state.dst_repo_id );
        var is_old_proj = a_task.state.old_owner_id.charAt(0)=='p';
        var is_new_proj = a_task.state.new_owner_id.charAt(0)=='p';
        var state = a_task.state;

        state.dst_repo_ep = dst_repo.endpoint;
        state.dst_repo_path = dst_repo.path + (is_new_proj?"project":"user") + state.new_owner_id.substr(1) + "/";
        state.steps = [];
        state.step = 0;
        state.substep = 0;
        state.xfr_status = 0;

        var i, j, id, rec, loc, repo, repo_map = {}, file;

        repo_map.empty = { rec_ids: [], size: 0 };

        for ( i in state.rec_ids ){
            id = state.rec_ids[i];
            rec = g_db.d.document(id);

            if ( !rec.data_url ){
                if ( rec.size == 0 ){
                    repo_map.empty.rec_ids.push( id );
                }else{
                    file = { id: id, size: rec.size };

                    loc = g_db.loc.firstExample({ _from: id });
                    repo = g_db._document( loc._to );
                    file.from = repo.path + (is_old_proj?"project":"user") + state.old_owner_id.substr(1) + id.substr(1);
                    file.to = id.substr( 2 );

                    if ( repo._key in repo_map ){
                        repo_map[repo._key].files.push(file);
                    }else{
                        repo_map[repo._key] = {repo_id:repo._id,repo_ep:repo.endpoint,files:[file]};
                    }
                }
            }
        }

        //console.log("repo map", repo_map);

        var files, sz, k, rec_ids;

        if ( repo_map.empty.rec_ids.length ){
            state.steps.push( repo_map.empty );
        }

        delete repo_map.empty;

        for ( i in repo_map ){
            //console.log("proc repo", i);
            repo = repo_map[i];

            // Pack roughly equal transfer sizes into each transfer chunk/step

            repo.files.sort( function( a, b ){
                return b.size - a.size;
            });

            //console.log("sorted files", repo.files );

            // Push files larger than chunk size into own transfers
            for ( j = 0; j < repo.files.length; j++ ){
                if ( repo.files[j].size >= g_lib.GLOB_MAX_XFR_SIZE ){
                    state.steps.push({ rec_ids: [repo.files[j].id], size: repo.files[j].size,  xfr: { src_repo_id:repo.repo_id,src_repo_ep:repo.repo_ep,files:[repo.files[j]]}});
                }else{
                    break;
                }
            }

            for ( ; j < repo.files.length; j++ ){
                // Remaining files are smaller than max chunk size
                // Build new transfer by combining largest with smallest files
                sz = repo.files[j].size;
                rec_ids = [repo.files[j].id];
                files = [repo.files[j]];

                for ( k = j + 1; k < repo.files.length; ){
                    if ( sz + repo.files[k].size <= g_lib.GLOB_MAX_XFR_SIZE ){
                        rec_ids.push( repo.files[k].id );
                        files.push( repo.files[k] );
                        sz += repo.files[k].size;
                        repo.files.splice(k,1);
                    }else{
                        k++;
                    }
                }

                state.steps.push({ rec_ids: rec_ids, size: sz, xfr: { src_repo_id: repo.repo_id, src_repo_ep: repo.repo_ep, files: files }});
            }
        }

        // Sort steps from smallest to largest transfer size
        if ( state.steps.length ){
            state.steps.sort( function( a, b ){
                return a.size - b.size;
            });
        }

        var task = g_db._update( a_task._id, { status: g_lib.TS_RUNNING, msg: "Running", state: state }, { returnNew: true });

        task.new.id = task.new._id;
        delete task.new._id;
        delete task.new._key;
        delete task.new._rev;

        return task.new;
    };

    /** @brief Delete data and/or collections by ID (not alias)
     * 
     * Immediately deletes collections and data records if no tasks have
     * locks on specified items; fails otherwise. Records with raw data
     * will trigger creation of a data delete task to clean-up raw data
     * files on associated repositories.
     */
    obj.dataCollDelete = function( a_client, a_res_ids ){
        var result = obj.preprocessItems( a_client, null, a_res_ids, g_lib.TT_REC_DEL );
        var i,rec_ids = [];

        for ( i in result.http_data )
            rec_ids.push( result.http_data[i].id );
        for ( i in result.glob_data )
            rec_ids.push( result.glob_data[i].id );

        obj._ensureExclusiveAccess( rec_ids );

        for ( i in result.coll ){
            // TODO Adjust for collection limit on allocation
            obj._deleteCollection( result.coll[i] );
        }

        // Delete records with no data
        for ( i in result.http_data ){
            obj._deleteDataRecord( result.http_data[i].id );
        }

        // Mark and schedule records for delete
        if ( result.glob_data.length ){
            var state = { repos: [] };
            obj._computeDataPaths( null, g_lib.TT_REC_DEL, result.glob_data, state.repos );

            var doc = obj._createTask( a_client._id, g_lib.TT_REC_DEL, state );
            var task = g_db.task.save( doc, { returnNew: true });

            task.new.id = task.new._id;
            delete task.new._id;
            delete task.new._key;
            delete task.new._rev;

            result.task = task.new;

            // Records with managed data must be marked as deleted, but not actually deleted
            for ( i in result.glob_data ){
                obj._deleteDataRecord( result.glob_data[i].id );
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

        obj._ensureExclusiveAccess( a_proj_ids );

        var allocs, alloc;
        var task_allocs = [];

        // For each project, determine allocation/raw data status and take appropriate actions
        for ( i in a_proj_ids ){
            proj_id = a_proj_ids[i];

            allocs = g_db.alloc.byExample({ _from: proj_id });
            while ( allocs.hasNext() ){
                alloc = allocs.next();
                task_allocs.push({ repo_id: alloc._to, path: alloc.path });
            }

            obj._projectDelete( proj_id );
        }


        var result = {};

        if ( task_allocs.length ){
            var state = { allocs: task_allocs };
            var doc = obj._createTask( a_client._id, g_lib.TT_PROJ_DEL, state );
            var task = g_db.task.save( doc, { returnNew: true });

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
    obj._projectDelete = function( a_proj_id ){
        // Delete allocations
        g_db.alloc.removeByExample({ _from: a_proj_id });

        // Delete all owned records (data, collections, groups, aliases
        var id, rec_ids = g_db._query( "for v in 1..1 inbound @proj owner return v._id", { proj: a_proj_id });

        while ( rec_ids.hasNext() ) {
            id = rec_ids.next();
            if ( id.charAt(0) == "c" ){
                g_lib.topicUnlink( id );
            }
            g_graph[id.charAt(0)].remove( id );
        }

        g_graph.d.remove( a_proj_id );
    };


    /** @brief Deletes a collection record
     *
     * NOTE: DO NOT CALL THIS DIRECTLY - USED ONLY BY TASK/PROCESS CODE
     *
     * Does not recursively delete contained items.
     */
    obj._deleteCollection = function( a_id ){
        var tmp = g_db.alias.firstExample({ _from: a_id });
        if ( tmp ){
            g_graph.a.remove( tmp._to );
        }

        tmp = g_db.top.firstExample({ _from: a_id });
        if ( tmp )
            g_lib.topicUnlink( a_id );

        g_graph.c.remove( a_id );
    };


    /** @brief Deletes data records
     *
     * Deletes record and associated graph objects. Does not delete raw data
     * but does adjust allocation.
     */
    obj._deleteDataRecord = function( a_id ){
        console.log( "delete rec", a_id );
        var doc = g_db.d.document( a_id );

        var alias = g_db.alias.firstExample({ _from: a_id });
        if ( alias ){
            g_graph.a.remove( alias._to );
        }

        var loc = g_db.loc.firstExample({ _from: a_id });
        var alloc = g_db.alloc.firstExample({ _from: doc.owner, _to: loc._to });

        console.log( "alloc", alloc );
        console.log( "data size", doc.size );
        console.log( "upd:", { data_size: alloc.data_size - doc.size,  rec_count: alloc.rec_count - 1 });
        g_db.alloc.update( alloc._id, { data_size: alloc.data_size - doc.size,  rec_count: alloc.rec_count - 1 });

        g_graph.d.remove( a_id );
    };


    obj.allocCreate = function( a_client, a_repo_id, a_subject_id, a_path ){
        var state = { repo: a_repo_id, subject: a_subject_id, path: a_path };
        var doc = obj._createTask( a_client._id, g_lib.TT_ALLOC_CREATE, state );
        var task = g_db.task.save( doc, { returnNew: true });

        if ( obj._processTaskDeps( task.new._id, [a_repo_id], 1, 0, a_subject_id )){
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

        if ( obj._processTaskDeps( task.new._id, [a_repo_id], 2, 0, a_subject_id )){
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
