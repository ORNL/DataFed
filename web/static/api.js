import * as model from "./model.js";
import * as util from "./util.js";
import * as settings from "./settings.js";

export function _asyncGet( a_url, a_raw_json_data, a_callback ) {
    $.ajax({
        url : a_url,
        global : false,
        type : 'GET',
        data: a_raw_json_data,
        dataType: 'json',
        context: {t0:Date.now()},
        success : function( a_data, a_status, a_xhr ) {
            var elapsed = Date.now() - this.t0;
            if ( elapsed > 500 ){
                console.log( "Slow AJAX response:",elapsed,"ms, url:",a_url );
            }
            if ( a_callback ){
                a_callback( true, a_data );
            }
        },
        error : function( a_xhr, a_status, a_thrownError ) {
            //console.log("_asyncGet error handler")
            //console.log( 'asyncGet error: ', a_xhr );
            //console.log( 'asyncGet error: ', a_status );
            //console.log( 'asyncGet error: ', a_thrownError );
            //console.log( 'asyncGet error: ', a_xhr.responseText );
            if ( a_callback ) {
                if ( a_xhr.responseText )
                    a_callback( false, a_xhr.responseText );
                else if ( a_thrownError )
                    a_callback( false, a_thrownError );
                else if ( a_status )
                    a_callback( false, a_status );
                else
                    a_callback( false, "Unknown error" );
            }
        },
        timeout: 10000
    });
}

export function _asyncPost( a_url, a_raw_json_data, a_callback ) {
    console.log("post",a_raw_json_data);
    $.ajax({
        url : a_url,
        //global : false,
        type : 'POST',
        data: JSON.stringify(a_raw_json_data, null, 0),
        dataType: 'json',
        contentType: "application/json; charset=utf-8",
        success : function( a_data ) {
            if ( a_callback ){
                a_callback( true, a_data );
            }
        },
        error : function( a_xhr, a_status, a_thrownError ) {
            //console.log( 'asyncGet error: ', a_xhr );
            //console.log( 'asyncGet error: ', a_status );
            //console.log( 'asyncGet error: ', a_thrownError );
            //console.log( 'asyncGet error: ', a_xhr.responseText );
            if ( a_callback ) {
                if ( a_xhr.responseText )
                    a_callback( false, a_xhr.responseText );
                else if ( a_thrownError )
                    a_callback( false, a_thrownError );
                else if ( a_status )
                    a_callback( false, a_status );
                else
                    a_callback( false, "Unknown error" );
            }
        },
        timeout: 5000
    });
}

export function _asyncPostText( a_url, a_text_data, a_callback ) {
    console.log("post",a_text_data);
    $.ajax({
        url : a_url,
        //global : false,
        type : 'POST',
        data: a_text_data,
        dataType: 'json',
        contentType: "text/plain",
        success : function( a_data ) {
            if ( a_callback ){
                a_callback( true, a_data );
            }
        },
        error : function( a_xhr, a_status, a_thrownError ) {
            //console.log( 'asyncGet error: ', a_xhr );
            //console.log( 'asyncGet error: ', a_status );
            //console.log( 'asyncGet error: ', a_thrownError );
            //console.log( 'asyncGet error: ', a_xhr.responseText );
            if ( a_callback ) {
                if ( a_xhr.responseText )
                    a_callback( false, a_xhr.responseText );
                else if ( a_thrownError )
                    a_callback( false, a_thrownError );
                else if ( a_status )
                    a_callback( false, a_status );
                else
                    a_callback( false, "Unknown error" );
            }
        },
        timeout: 5000
    });
}

export function setDefaultAlloc( a_repo, a_subject, a_cb ){
    _asyncGet( "/api/repo/alloc/set/default?repo=" + a_repo + (a_subject?"&subject="+a_subject:""), null, a_cb );
}

export function xfrStart( a_ids, a_mode, a_path, a_ext, a_encrypt_mode, a_cb ){
    var url = "/api/dat/";

    if ( a_mode == model.TT_DATA_GET )
        url += "get" + "?id=" + encodeURIComponent(JSON.stringify(a_ids));
    else if ( a_mode == model.TT_DATA_PUT )
        url += "put" + "?id=" + encodeURIComponent(a_ids[0]) ;
    else{
        return;
    }

    url += "&path=" + encodeURIComponent(a_path)  + "&encrypt=" + a_encrypt_mode + ((a_ext && a_ext.length)?"&ext="+encodeURIComponent(a_ext):"");

    _asyncGet( url, null, function( ok, data ){
        if ( ok ){
            epRecentLoad( function(){
                if ( a_cb )
                    a_cb( ok, data );
            });
        }else{
            if ( a_cb )
                a_cb( ok, data );
        }
    });
}

export function dataView( a_id, a_cb ) {
    _asyncGet( "/api/dat/view?id=" + encodeURIComponent(a_id), null, function( ok, data ){
        if ( ok ) {
            //console.log("viewData ok, data:", data );
            a_cb( data );
        }
        else {
            //console.log("viewData failed:", data );
            util.setStatusText( "View Data Error: " + data, true );
            a_cb();
        }
    });
}

export function dataAllocChange( a_ids, a_repo_id, a_proj_id, a_check, a_cb ){
    //console.log("change alloc, items", a_ids );
    var url = "/api/dat/alloc_chg?id=" + encodeURIComponent(JSON.stringify(a_ids))+"&repo_id="+encodeURIComponent(a_repo_id);
    if (a_proj_id )
        url += "&proj_id="+encodeURIComponent(a_proj_id);
    if ( a_check)
        url += "&check=1";

    _asyncGet( url, null, a_cb );
}


export function dataOwnerChange( a_ids, a_coll_id, a_repo_id, a_proj_id, a_check, a_cb ){
    //console.log("change owner, items", a_ids );
    var url = "/api/dat/owner_chg?id=" + encodeURIComponent(JSON.stringify(a_ids))+"&coll_id="+encodeURIComponent(a_coll_id);
    if (a_repo_id )
        url += "&repo_id="+encodeURIComponent(a_repo_id);
    if (a_proj_id )
        url += "&proj_id="+encodeURIComponent(a_proj_id);
    if ( a_check)
        url += "&check=1";

    _asyncGet( url, null, a_cb );
}

export function dataGetCheck( a_ids, a_cb ){
    _asyncGet( "/api/dat/get?id=" + encodeURIComponent(JSON.stringify(a_ids)) + "&check=true", null, a_cb );
}

export function dataPutCheck( a_id, a_cb ){
    _asyncGet( "/api/dat/put?id=" + encodeURIComponent(a_id) + "&check=true", null, a_cb );
}


export function dataGetDeps( a_id, a_cb ) {
    _asyncGet( "/api/dat/dep/get?id=" + encodeURIComponent(a_id), null, function( ok, data ){
        if ( ok ) {
            //console.log("viewData ok, data:", data );
            a_cb( data );
        }
        else {
            //console.log("viewData failed:", data );
            util.setStatusText( "Get Dependencies Error: " + data, true );
            a_cb();
        }
    });
}

export function dataGetDepGraph( a_id, a_cb ) {
    _asyncGet( "/api/dat/dep/graph/get?id=" + encodeURIComponent(a_id), null, function( ok, data ){
        if ( ok ) {
            //console.log("viewData ok, data:", data );
            a_cb( data );
        }
        else {
            //console.log("viewData failed:", data );
            util.setStatusText("Get Dependency Graph Error: " + data);
            a_cb();
        }
    });
}

export function dataCreateBatch( a_records, a_cb ){
    //console.log("dataCreateBatch");
    _asyncPostText( "/api/dat/create/batch", a_records, function( ok, data ){
        if ( a_cb )
            a_cb( ok, data );
    });
}

export function dataUpdateBatch( a_records, a_cb ){
    //console.log("dataUpdateBatch");
    _asyncPostText( "/api/dat/update/batch", a_records, function( ok, data ){
        if ( a_cb )
            a_cb( ok, data );
    });
}

export function sendDataDelete(a_ids,a_cb){
    _asyncGet( "/api/dat/delete?ids=" + encodeURIComponent(JSON.stringify(a_ids)), null, a_cb);
}

export function copyData( a_src_id, a_dst_id, a_cb ){
    //console.log("copyData",a_src_id, a_dst_id);
    _asyncGet( "/api/dat/copy?src=" + encodeURIComponent(a_src_id) + "&dst=" + encodeURIComponent(a_dst_id), null, a_cb);
}

export function dataFind( a_query, a_callback ) {
    //_asyncGet("/api/dat/search?query="+encodeURIComponent(a_query)+"&scope="+a_scope,null,a_callback);
    _asyncPost("/api/dat/search",a_query,a_callback);
}

export function sendDataLock( a_ids, a_lock, a_cb ){
    _asyncGet( "/api/dat/lock?lock="+a_lock+"&ids=" + encodeURIComponent(JSON.stringify(a_ids)), null, a_cb );
}

export function viewColl( a_id, a_cb ) {
    _asyncGet( "/api/col/view?id=" + encodeURIComponent(a_id), null, function( ok, data ){
        if ( ok ) {
            //console.log("viewColl ok, data:", data, typeof data );
            if ( data )
                a_cb( data );
            else
                a_cb();
        }
        else {
            util.setStatusText( "View Collection Error: " + data, true );
            a_cb();
        }
    });
}

export function collDelete(a_ids,a_cb){
    _asyncGet( "/api/col/delete?ids=" + encodeURIComponent(JSON.stringify(a_ids)), null, a_cb );
}

export function viewProj( a_id, a_cb ){
    _asyncGet( "/api/prj/view?id=" + encodeURIComponent(a_id), null, function( ok, data ){
        if ( ok ) {
            //console.log("viewProj ok, data:", data, typeof data );
            if ( data )
                a_cb( data );
            else
                a_cb();
        }
        else {
            //console.log("viewProj failed:", data );
            util.setStatusText( "View Project Error: "+data, true );
            a_cb();
        }
    });
}

export function projDelete( a_ids, a_cb ){
    _asyncGet( "/api/prj/delete?ids=" + encodeURIComponent(JSON.stringify(a_ids)), null, a_cb );
}

export function linkItems( a_items, a_coll, a_cb ) {
    _asyncGet( "/api/col/link?items="+encodeURIComponent(JSON.stringify(a_items))+"&coll="+encodeURIComponent(a_coll), null, a_cb );
}

/*
function unlinkItem( a_item, a_coll, a_cb ) {
    _asyncGet( "/api/unlink?item="+encodeURIComponent(a_item)+"&coll="+encodeURIComponent(a_coll), null, a_cb );
}*/

export function unlinkItems( a_items, a_coll, a_cb ) {
    //console.log("unlinkItems()",a_items);
    _asyncGet( "/api/col/unlink?items="+encodeURIComponent(JSON.stringify(a_items))+"&coll="+encodeURIComponent(a_coll), null, a_cb );
}

export function colMoveItems( a_items, a_src_id, a_dst_id, a_cb ) {
    //console.log("colMoveItems", a_items, a_src_id, a_dst_id );
    _asyncGet( "/api/col/move?items="+encodeURIComponent(JSON.stringify(a_items))+"&src_id="+encodeURIComponent(a_src_id)+"&dst_id="+encodeURIComponent(a_dst_id), null, a_cb );
}

export function getParents( a_id, a_cb ) {
    //console.log("getParents",a_id);
    _asyncGet( "/api/col/get_parents?id="+encodeURIComponent(a_id), null, a_cb );
}

export function getCollOffset( coll_id, item_id, page_sz, idx, cb ){
    //console.log("getCollOffset",coll_id,item_id,page_sz,idx);
    _asyncGet( "/api/col/get_offset?id="+encodeURIComponent(coll_id)+"&item_id="+encodeURIComponent(item_id)+"&page_sz="+page_sz, null, function(ok,data){
        //console.log("getCollOffset - cb",coll_id,item_id,page_sz,idx);
        cb( ok, data, idx );
    });
}

export function aclView( a_id, a_cb ) {
    _asyncGet( "/api/acl/view?id="+encodeURIComponent(a_id), null, a_cb );
}

export function aclUpdate( a_id, a_rules, a_cb ) {
    _asyncGet( "/api/acl/update?id="+encodeURIComponent(a_id)+"&rules="+encodeURIComponent(JSON.stringify(a_rules)), null, a_cb );
}

export function aclByUser( a_cb ) {
    _asyncGet( "/api/acl/by_subject?inc_users=true", null, a_cb );
}

export function aclByUserList( a_user_id, a_cb ) {
    _asyncGet( "/api/acl/by_subject/list?owner="+encodeURIComponent(a_user_id), null, a_cb );
}

export function aclByProject( a_cb ) {
    _asyncGet( "/api/acl/by_subject?inc_projects=true", null, a_cb );
}

export function aclByProjectList( a_proj_id, a_cb ) {
    _asyncGet( "/api/acl/by_subject/list?owner="+encodeURIComponent(a_proj_id), null, a_cb );
}

export function checkPerms( a_id, a_perms, a_cb ){
    _asyncGet( "/api/perms/check?id="+encodeURIComponent(a_id)+(a_perms?("&perms="+a_perms):""), null, function(ok,data){
        //console.log("checkPerm",a_id,a_perms,ok,data);
        if ( ok )
            a_cb( data.granted );
        else
            a_cb( false );
    });
}

export function getPerms( a_id, a_perms, a_cb ){
    _asyncGet( "/api/perms/get?id="+encodeURIComponent(a_id)+(a_perms?("&perms="+a_perms):""), null, function(ok,data){
        //console.log("getPerm",a_id,a_perms,ok,data);
        if ( ok )
            a_cb( data.granted );
        else
            a_cb( false );
    });
}

export function userView( a_id, a_details, a_cb ) {
    //console.log("userView ",a_id);
    _asyncGet( "/api/usr/view?id="+a_id+(a_details?"&details=true":""), null, a_cb );
}

export function repoList( a_details, a_list_all, a_cb ){
    var url = "/api/repo/list";
    if ( a_details )
        url += "?details=true";
    if ( a_list_all )
        url += (a_details?"&":"?") + "all=true";
    _asyncGet( url, null, a_cb );
}

export function repoView( a_repo, a_cb ){
    _asyncGet( "/api/repo/view?id="+a_repo, null, a_cb );
}

export function repoCreate( a_repo_data, a_cb ){
    //console.log("repo upd:",a_repo, a_title, a_desc, a_capacity);
    _asyncPost("/api/repo/create",a_repo_data,a_cb);
}

export function repoUpdate( a_repo_data, a_cb ){
    //console.log("repo upd:",a_repo, a_title, a_desc, a_capacity);
    _asyncPost("/api/repo/update",a_repo_data,a_cb);
}

export function repoDelete( a_repo_id, a_cb ){
    //console.log("repo upd:",a_repo, a_title, a_desc, a_capacity);
    _asyncGet("/api/repo/delete?id="+a_repo_id,null,a_cb);
}

export function repoCalcSize( a_items, a_recursive, a_cb ){
    //console.log("calcSize, rec:",a_recursive,"items",a_items);
    _asyncGet( "/api/repo/calc_size?recurse=" + a_recursive + "&items="+ encodeURIComponent(JSON.stringify(a_items)), null, function( ok, data ){
        a_cb( ok, data );
    });
}

export function allocList( a_id, a_cb ){
    _asyncGet( "/api/repo/alloc/list/by_repo?id="+a_id, null, a_cb );
}

export function allocListBySubject( a_subject, a_inc_stats, a_cb ){
    var url = "/api/repo/alloc/list/by_subject?";
    if ( a_subject )
        url += "subject="+encodeURIComponent(a_subject);
    if ( a_inc_stats )
        url += (a_subject?"&":"") + "stats=true";
    _asyncGet( url, null, a_cb );
}

export function allocListByObject( a_id, a_cb ){
    _asyncGet( "/api/repo/alloc/list/by_object?id="+a_id, null, a_cb );
}

export function allocView( a_repo, a_subject, a_cb ){
    _asyncGet( "/api/repo/alloc/view?repo="+a_repo+(a_subject?"&subject="+encodeURIComponent(a_subject):""), null, a_cb );
}

export function allocStats( a_repo, a_subject, a_cb ){
    _asyncGet( "/api/repo/alloc/stats?repo="+a_repo+(a_subject?"&subject="+encodeURIComponent(a_subject):""), null, a_cb );
}

export function allocCreate( a_repo, a_subject, a_data_limit, a_rec_limit, a_cb ){
    _asyncGet( "/api/repo/alloc/create?repo="+a_repo+"&subject="+encodeURIComponent(a_subject)+"&data_limit="+a_data_limit+"&rec_limit="+a_rec_limit, null, a_cb );
}

export function allocDelete( a_repo, a_subject, a_cb ){
    _asyncGet( "/api/repo/alloc/delete?repo="+a_repo+"&subject="+encodeURIComponent(a_subject), null, a_cb );
}

export function allocSet( a_repo, a_subject, a_data_limit, a_rec_limit, a_cb ){
    _asyncGet( "/api/repo/alloc/set?repo="+a_repo+"&subject="+encodeURIComponent(a_subject)+"&data_limit="+a_data_limit+"&rec_limit="+a_rec_limit, null, a_cb );
}

export function groupView( a_uid, a_gid, a_cb ) {
    if ( a_gid.startsWith("g/" ))
        _asyncGet( "/api/grp/view?uid="+encodeURIComponent(a_uid)+"&gid="+encodeURIComponent(a_gid.substr(2)), null, a_cb );
    else
        _asyncGet( "/api/grp/view?uid="+encodeURIComponent(a_uid)+"&gid="+encodeURIComponent(a_gid), null, a_cb );
}

export function groupList( a_uid, a_cb ) {
    _asyncGet( "/api/grp/list?uid="+encodeURIComponent(a_uid), null, a_cb );
}


export function groupCreate( a_uid, a_group, a_cb ) {
    var url = "/api/grp/create?uid="+encodeURIComponent(a_uid)+"&gid="+encodeURIComponent(a_group.gid);
    if ( a_group.title )
        url += "&title="+encodeURIComponent(a_group.title);
    if ( a_group.desc )
        url += "&desc="+encodeURIComponent(a_group.desc);
    if ( a_group.member && a_group.member.length )
        url += "&member=" + JSON.stringify( a_group.member );

    _asyncGet( url, null, function( ok, data ){
        if (  a_cb )
            a_cb( ok, data );
    });
}

export function groupUpdate( a_group, a_cb ) {
    var url = "/api/grp/update?uid="+encodeURIComponent(a_group.uid)+"&gid="+encodeURIComponent(a_group.gid);
    if ( a_group.title )
        url += "&title="+encodeURIComponent(a_group.title);
    if ( a_group.desc )
        url += "&desc="+encodeURIComponent(a_group.desc);
    if ( a_group.add && a_group.add.length )
        url += "&add=" + JSON.stringify(a_group.add);
    if ( a_group.rem && a_group.rem.length )
        url += "&rem=" + JSON.stringify(a_group.rem);

    _asyncGet( url, null, function( ok, data ){
        if (  a_cb )
            a_cb( ok, data );
    });
}

export function groupDelete( a_uid, a_gid, a_cb ) {
    _asyncGet( "/api/grp/delete?uid="+a_uid+"&gid="+encodeURIComponent(a_gid.startsWith("g/")?a_gid.substr(2):a_gid), null, a_cb );
}

export function topicList( a_parent, a_offset, a_count, a_inc_data, a_cb ){
    if ( !a_cb )
        return;
    var url = "/api/top/list?id="+encodeURIComponent(a_parent?a_parent:"t/root");
    if ( a_inc_data === false )
        url += "&data=false";
    if ( a_offset != undefined && a_count != undefined )
        url += "&offset="+a_offset+"&count="+a_count;
    _asyncGet( url, null, function( ok, data ){
        if ( a_cb ){
            a_cb( ok, data );
        }
    });
}

export function sendQueryCreate( a_title, a_query, a_callback ) {
    //_asyncGet("/api/dat/search?query="+encodeURIComponent(a_query)+"&scope="+a_scope,null,a_callback);
    _asyncPost("/api/query/create?title="+encodeURIComponent(a_title),a_query,a_callback);
}

export function sendQueryUpdate( a_id, a_title, a_query, a_callback ) {
    var url = "/api/query/update?id="+a_id;
    if ( a_title != undefined )
        url += "&title=" + encodeURIComponent(a_title);
    _asyncPost(url,a_query,a_callback);
}

export function sendQueryDelete( a_ids, a_cb ){
    _asyncGet( "/api/query/delete?ids=" + encodeURIComponent(JSON.stringify(a_ids)), null, a_cb );
}

export function sendQueryView( a_id, a_callback ){
    //console.log("sendQueryView,",a_id);
    _asyncGet("/api/query/view?id="+encodeURIComponent(a_id),null,a_callback);
}

export function epView( a_ep, a_cb ){
    _asyncGet( "/ui/ep/view?ep="+encodeURIComponent(a_ep), null, function( ok, data ){
        if ( a_cb )
            a_cb( ok, data );
    });
}

export function epAutocomplete( a_term, a_cb ){
    _asyncGet( "/ui/ep/autocomp?term="+encodeURIComponent(a_term), null, function( ok, data ){
        if ( a_cb )
            a_cb( ok, data );
    });
}

export function epRecentLoad( a_cb ){
    //console.log("epRecentLoad");
    _asyncGet( "/ui/ep/recent/load", null, function( ok, data ){
        //console.log("epRecentLoad",ok,data);
        
        if ( ok ){
            settings.epSetRecent( data );
        }

        if ( a_cb )
            a_cb();
    });
}

/*
function epRecentSave( a_cb ){
    console.log("epRecentSave",g_ep_recent);
    _asyncPost( "/ui/ep/recent/save",{ep:g_ep_recent}, function( ok, data ){
        if ( a_cb )
            a_cb();
    });
}
*/

export function epDirList( a_ep, a_path, a_show_hidden, a_cb ){
    //console.log("epDirList",a_ep,a_path);
    _asyncGet( "/ui/ep/dir/list?ep=" + encodeURIComponent(a_ep) + "&path=" + encodeURIComponent(a_path) + "&hidden=" + (a_show_hidden?"true":"false"), null, function( ok, data ){
        if ( a_cb ){
            if ( ok )
                a_cb( data );
            else{
                //console.log("dir list failed",data);
                a_cb();
            }
        }
    });
}
