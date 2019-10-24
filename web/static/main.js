var g_user = null;

function loadUser() {
    console.log( "loadUser" );

    var user = Cookies.get( 'sdms-user' );
    //console.log( "user cookie: ", user );

    if ( user ) {
        g_user = JSON.parse( user );
    } else {
        g_user = null;
    }

    //console.log( "user: ", g_user );
}

function logout() {
    g_user = null;
    window.location = "/ui/logout";
}

function _asyncGet( a_url, a_raw_json_data, a_callback ) {
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

function _asyncPost( a_url, a_raw_json_data, a_callback ) {
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

function _asyncPostText( a_url, a_text_data, a_callback ) {
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

const escapeMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '/': '&#x2F;',
    '`': '&#x60;',
    '=': '&#x3D;'
};

function escapeHTML(string) {
    return String(string).replace(/[&<>"'`=\/]/g, function (s) {
        return escapeMap[s];
    });
}

// Examines input value to determine if an update has been made
// and if so, set the value in the updated object (only works for strings)
function getUpdatedValue( a_new_val, a_old_obj, a_new_obj, a_field ){
    var tmp = a_new_val.trim(), old = a_old_obj[a_field];
    if (( old === undefined && tmp.length ) || ( old !== undefined && tmp != old ))
        a_new_obj[a_field] = tmp;
};

/* Check permissions and available allocations/space, then show relocate dialog */
/*
function relocateItems( a_src_items, a_dest, a_owner, a_cb ){
    console.log("relocate items", a_src_items, a_dest, a_owner );
    var ok = true, count = a_src_items.length;
    for ( var i in a_src_items ){
        getPerms( a_src_items[i], PERM_DELETE, function( perms ){
            if (( perms & PERM_DELETE ) == 0 ){
                if ( ok ){
                    ok = false;
                    dlgAlert( "Cannot Perform Action", "Requires DELETE permission at source." );
                    count--;
                }
            }else{
                if ( --count == 0 && ok ){
                    if ( a_dest.startsWith("c/") ){
                        getPerms( a_dest, PERM_CREATE, function( perms ){
                            if (( perms & PERM_CREATE ) == 0 ){
                                dlgAlert( "Cannot Perform Action", "Requires CREATE permission at destination." );
                            }else{
                                console.log("Move to owner", a_owner,"collection",a_dest);
                                dlgDataRelocate( a_src_items, a_dest, a_owner, 10, function(){
                                });
                            }
                        });
                    }else{
                        console.log("Move to repo",a_dest);
                    }
                }
            }
        });
    }
}*/

function viewData( a_id, a_cb ) {
    _asyncGet( "/api/dat/view?id=" + encodeURIComponent(a_id), null, function( ok, data ){
        if ( ok ) {
            console.log("viewData ok, data:", data );
            a_cb( data );
        }
        else {
            //console.log("viewData failed:", data );
            setStatusText("View Data Error: " + data, 1 );
            a_cb();
        }
    });
}

function dataEdit( a_id, a_cb ){
    var req_perms = PERM_WR_REC | PERM_WR_META;
    getPerms( a_id, req_perms, function( perms ){

        if (( perms & req_perms ) == 0 ){
            alertPermDenied();
            return;
        }

        viewData( a_id, function( data ){
            if ( data ){
                dlgDataNewEdit(DLG_DATA_EDIT,data,null,perms,function(data){
                    if ( a_cb )
                        a_cb( data );
                });
            }
        }); 
    });
}


function dataShare( a_id ){
    checkPerms( a_id, PERM_SHARE, function( granted ){
        if ( !granted ){
            alertPermDenied();
            return;
        }

        viewData( a_id, function( data ){
            if ( data )
                dlgSetACLs( data );
        });
    });
}

function dataDelete( a_id, a_cb ) {
    checkPerms( a_id, PERM_DELETE, function( granted ){
        if ( !granted ){
            alertPermDenied();
            return;
        }

        dlgConfirmChoice( "Confirm Deletion", "Delete Data Record " + a_id + "?", ["Delete","Cancel"], function( choice ){
            if ( choice == 0 ){
                sendDataDelete( [a_id], function( ok, data ){
                    if ( ok ){
                        a_cb();
                    }else
                        dlgAlert("Data Delete Error", data);
                });
            }
        });
    });
}

function dataLock( a_id, a_lock, a_cb ){
    checkPerms( a_id, PERM_LOCK, function( granted ){
        if ( !granted ){
            alertPermDenied();
            return;
        }
        sendDataLock( [a_id], a_lock, function( ok, data ){
            if ( ok ){
                a_cb();
            }else{
                dlgAlert("Lock Update Failed",data);
            }
        });
    });
}

function dataGet( a_ids ){
    dataGetPreprocess( a_ids, function( ok, data ){
        if ( ok ){
            console.log("proproc:",data);
            var internal = false, external = false;

            for ( var i in data.item ){
                if ( data.item[i].locked ){
                    dlgAlert("Data Get Error","One or more data records are currently locked.");
                    return;
                }
                if ( data.item[i].url ){
                    external = true;
                }else if ( data.item[i].size <= 0 ){
                    dlgAlert("Data Get Error","One or more data records have no raw data.");
                    return;
                }else{
                    internal = true;
                }
            }
            if ( internal && external ){
                dlgAlert("Data Get Error", "Selected data records contain both internal and external raw data.");
                return;
            } else if ( internal ){
                dlgStartTransfer( XFR_GET, data.item );
            }else{
                for ( var i in data.item ){
                    console.log("download ", data.item[i].url )
                    var link = document.createElement("a");
                    var idx = data.item[i].url.lastIndexOf("/");
                    link.download = data.item[i].url.substr(idx);
                    link.href = data.item[i].url;
                    link.target = "_blank";
                    link.click();
                }
            }
        }else{
            dlgAlert("Data Get Error",data);
        }
    });
}

function dataPut( a_id ){
    checkPerms( a_id, PERM_WR_DATA, function( granted ){
        if ( !granted ){
            alertPermDenied();
            return;
        }

        viewData( a_id, function( data ){
            if ( data ){
                if ( data.doi ){
                    dlgAlert("Data Put Error","Record has read-only, externally managed data.");
                }else{
                    dlgStartTransfer( XFR_PUT, [data] );
                }
            }
        }); 
    });
}

function dataGetDeps( a_id, a_cb ) {
    _asyncGet( "/api/dat/dep/get?id=" + encodeURIComponent(a_id), null, function( ok, data ){
        if ( ok ) {
            //console.log("viewData ok, data:", data );
            a_cb( data );
        }
        else {
            //console.log("viewData failed:", data );
            setStatusText("Get Dependencies Error: " + data);
            a_cb();
        }
    });
}

function dataGetDepGraph( a_id, a_cb ) {
    _asyncGet( "/api/dat/dep/graph/get?id=" + encodeURIComponent(a_id), null, function( ok, data ){
        if ( ok ) {
            //console.log("viewData ok, data:", data );
            a_cb( data );
        }
        else {
            //console.log("viewData failed:", data );
            setStatusText("Get Dependency Graph Error: " + data);
            a_cb();
        }
    });
}

function dataCreateBatch( a_records, a_cb ){
    console.log("dataCreateBatch");
    _asyncPostText( "/api/dat/create/batch", a_records, function( ok, data ){
        if ( a_cb )
            a_cb( ok, data );
    });
}

function dataUpdateBatch( a_records, a_cb ){
    console.log("dataUpdateBatch");
    _asyncPostText( "/api/dat/update/batch", a_records, function( ok, data ){
        if ( a_cb )
            a_cb( ok, data );
    });
}

function sendDataDelete(a_ids,a_cb){
    _asyncGet( "/api/dat/delete?ids=" + encodeURIComponent(JSON.stringify(a_ids)), null, a_cb);
}

function copyData( a_src_id, a_dst_id, a_cb ){
    //console.log("copyData",a_src_id, a_dst_id);
    _asyncGet( "/api/dat/copy?src=" + encodeURIComponent(a_src_id) + "&dst=" + encodeURIComponent(a_dst_id), null, a_cb);
}

function dataFind( a_query, a_callback ) {
    //_asyncGet("/api/dat/search?query="+encodeURIComponent(a_query)+"&scope="+a_scope,null,a_callback);
    _asyncPost("/api/dat/search",a_query,a_callback);
}

function sendDataLock( a_ids, a_lock, a_cb ){
    _asyncGet( "/api/dat/lock?lock="+a_lock+"&ids=" + encodeURIComponent(JSON.stringify(a_ids)), null, a_cb );
}

function viewColl( a_id, a_cb ) {
    _asyncGet( "/api/col/view?id=" + encodeURIComponent(a_id), null, function( ok, data ){
        if ( ok ) {
            //console.log("viewColl ok, data:", data, typeof data );
            if ( data )
                a_cb( data );
            else
                a_cb();
        }
        else {
            setStatusText("View Collection Error: " + data);
            a_cb();
        }
    });
}

function collDelete(a_ids,a_cb){
    _asyncGet( "/api/col/delete?ids=" + encodeURIComponent(JSON.stringify(a_ids)), null, a_cb );
}

function viewProj( a_id, a_cb ){
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
            setStatusText("View Project Error: "+data);
            a_cb();
        }
    });
}

function projDelete( a_ids, a_cb ){
    _asyncGet( "/api/prj/delete?ids=" + encodeURIComponent(JSON.stringify(a_ids)), null, a_cb );
}

function linkItems( a_items, a_coll, a_cb ) {
    _asyncGet( "/api/col/link?items="+encodeURIComponent(JSON.stringify(a_items))+"&coll="+encodeURIComponent(a_coll), null, a_cb );
}

/*
function unlinkItem( a_item, a_coll, a_cb ) {
    _asyncGet( "/api/unlink?item="+encodeURIComponent(a_item)+"&coll="+encodeURIComponent(a_coll), null, a_cb );
}*/

function unlinkItems( a_items, a_coll, a_cb ) {
    console.log("unlinkItems()",a_items);
    _asyncGet( "/api/col/unlink?items="+encodeURIComponent(JSON.stringify(a_items))+"&coll="+encodeURIComponent(a_coll), null, a_cb );
}

function colMoveItems( a_items, a_src_id, a_dst_id, a_cb ) {
    console.log("colMoveItems", a_items, a_src_id, a_dst_id );
    _asyncGet( "/api/col/move?items="+encodeURIComponent(JSON.stringify(a_items))+"&src_id="+encodeURIComponent(a_src_id)+"&dst_id="+encodeURIComponent(a_dst_id), null, a_cb );
}

function getParents( a_id, a_cb ) {
    console.log("getParents",a_id);
    _asyncGet( "/api/col/get_parents?id="+encodeURIComponent(a_id), null, a_cb );
}

function getCollOffset( coll_id, item_id, page_sz, idx, cb ){
    console.log("getCollOffset",coll_id,item_id,page_sz,idx);
    _asyncGet( "/api/col/get_offset?id="+encodeURIComponent(coll_id)+"&item_id="+encodeURIComponent(item_id)+"&page_sz="+page_sz, null, function(ok,data){
        console.log("getCollOffset - cb",coll_id,item_id,page_sz,idx);
        cb( ok, data, idx )
    });
}

function aclView( a_id, a_cb ) {
    _asyncGet( "/api/acl/view?id="+encodeURIComponent(a_id), null, a_cb );
}

function aclUpdate( a_id, a_rules, a_public, a_cb ) {
    _asyncGet( "/api/acl/update?id="+encodeURIComponent(a_id)+"&rules="+encodeURIComponent(JSON.stringify(a_rules))+"&pub="+a_public, null, a_cb );
}

function aclByUser( a_cb ) {
    _asyncGet( "/api/acl/by_user", null, a_cb );
}

function aclByUserList( a_user_id, a_cb ) {
    _asyncGet( "/api/acl/by_user/list?owner="+encodeURIComponent(a_user_id), null, a_cb );
}

function aclByProject( a_cb ) {
    _asyncGet( "/api/acl/by_proj", null, a_cb );
}

function aclByProjectList( a_proj_id, a_cb ) {
    _asyncGet( "/api/acl/by_proj/list?owner="+encodeURIComponent(a_proj_id), null, a_cb );
}

function checkPerms( a_id, a_perms, a_cb ){
    _asyncGet( "/api/perms/check?id="+encodeURIComponent(a_id)+(a_perms?("&perms="+a_perms):""), null, function(ok,data){
        console.log("checkPerm",a_id,a_perms,ok,data);
        if ( ok )
            a_cb( data.granted );
        else
            a_cb( false );
    });
}

function getPerms( a_id, a_perms, a_cb ){
    _asyncGet( "/api/perms/get?id="+encodeURIComponent(a_id)+(a_perms?("&perms="+a_perms):""), null, function(ok,data){
        //console.log("getPerm",a_id,a_perms,ok,data);
        if ( ok )
            a_cb( data.granted );
        else
            a_cb( false );
    });
}

function alertPermDenied(){
    dlgAlert( "Cannot Perform Action", "Permission Denied." );
}


function userView( a_id, a_details, a_cb ) {
    console.log("userView ",a_id);
    _asyncGet( "/api/usr/view?id="+a_id+(a_details?"&details=true":""), null, a_cb );
}

function repoList( a_details, a_list_all, a_cb ){
    var url = "/api/repo/list";
    if ( a_details )
        url += "?details=true";
    if ( a_list_all )
        url += (a_details?"&":"?") + "all=true";
    _asyncGet( url, null, a_cb );
}

function repoView( a_repo, a_cb ){
    _asyncGet( "/api/repo/view?id="+a_repo, null, a_cb );
}

function repoCreate( a_repo_data, a_cb ){
    //console.log("repo upd:",a_repo, a_title, a_desc, a_capacity);
    _asyncPost("/api/repo/create",a_repo_data,a_cb);
}

function repoUpdate( a_repo_data, a_cb ){
    //console.log("repo upd:",a_repo, a_title, a_desc, a_capacity);
    _asyncPost("/api/repo/update",a_repo_data,a_cb);
}

function repoDelete( a_repo_id, a_cb ){
    //console.log("repo upd:",a_repo, a_title, a_desc, a_capacity);
    _asyncGet("/api/repo/delete?id="+a_repo_id,null,a_cb);
}

/*function repoUpdate( a_repo, a_title, a_desc, a_domain, a_exp_path, a_capacity, a_admins, a_cb ){
    console.log("repo upd:",a_repo, a_title, a_desc, a_capacity);
    var url = "/api/repo/update?id="+a_repo;
    if ( a_title )
        url += "&title="+encodeURIComponent(a_title);
    if ( a_desc )
        url += "&desc="+encodeURIComponent(a_desc);
    if ( a_domain )
        url += "&domain="+encodeURIComponent(a_domain);
    if ( a_exp_path )
        url += "&exp_path="+encodeURIComponent(a_exp_path);
    if ( a_capacity != null )
        url += "&capacity="+a_capacity;
    if ( a_admins )
        url += "&admins=" + JSON.stringify( a_admins );
    console.log( url );
    _asyncGet( url, null, a_cb );
}*/

function repoCalcSize( a_items, a_recursive, a_cb ){
    console.log("calcSize, rec:",a_recursive,"items",a_items);
    _asyncGet( "/api/repo/calc_size?recurse=" + a_recursive + "&items="+ encodeURIComponent(JSON.stringify(a_items)), null, function( ok, data ){
        a_cb( ok, data );
    });
}

function allocList( a_id, a_cb ){
    _asyncGet( "/api/repo/alloc/list/by_repo?id="+a_id, null, a_cb );
}
function allocListBySubject( a_subject, a_inc_stats, a_cb ){
    var url = "/api/repo/alloc/list/by_subject?";
    if ( a_subject )
        url += "subject="+encodeURIComponent(a_subject);
    if ( a_inc_stats )
        url += (a_subject?"&":"") + "stats=true";
    _asyncGet( url, null, a_cb );
}

function allocListByObject( a_id, a_cb ){
    _asyncGet( "/api/repo/alloc/list/by_object?id="+a_id, null, a_cb );
}

function allocView( a_repo, a_subject, a_cb ){
    _asyncGet( "/api/repo/alloc/view?repo="+a_repo+(a_subject?"&subject="+encodeURIComponent(a_subject):""), null, a_cb );
}

function allocStats( a_repo, a_subject, a_cb ){
    _asyncGet( "/api/repo/alloc/stats?repo="+a_repo+(a_subject?"&subject="+encodeURIComponent(a_subject):""), null, a_cb );
}

function allocSet( a_repo, a_subject, a_max_size, a_max_count, a_cb ){
    _asyncGet( "/api/repo/alloc/set?repo="+a_repo+"&subject="+encodeURIComponent(a_subject)+"&max_size="+a_max_size+"&max_count="+a_max_count, null, a_cb );
}

function groupView( a_uid, a_gid, a_cb ) {
    if ( a_gid.startsWith("g/" ))
        _asyncGet( "/api/grp/view?uid="+encodeURIComponent(a_uid)+"&gid="+encodeURIComponent(a_gid.substr(2)), null, a_cb );
    else
        _asyncGet( "/api/grp/view?uid="+encodeURIComponent(a_uid)+"&gid="+encodeURIComponent(a_gid), null, a_cb );
}

function groupList( a_uid, a_cb ) {
    _asyncGet( "/api/grp/list?uid="+encodeURIComponent(a_uid), null, a_cb );
}


function groupCreate( a_uid, a_group, a_cb ) {
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

function groupUpdate( a_group, a_cb ) {
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

function groupDelete( a_uid, a_gid, a_cb ) {
    _asyncGet( "/api/grp/delete?uid="+a_uid+"&gid="+encodeURIComponent(a_gid.startsWith("g/")?a_gid.substr(2):a_gid), null, function( ok, data ){
        if ( ok && a_cb )
            a_cb();
    });
}

function topicList( a_parent, a_offset, a_count, a_inc_data, a_cb ){
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

function sendQueryCreate( a_title, a_query, a_callback ) {
    //_asyncGet("/api/dat/search?query="+encodeURIComponent(a_query)+"&scope="+a_scope,null,a_callback);
    _asyncPost("/api/query/create?title="+encodeURIComponent(a_title),a_query,a_callback);
}

function sendQueryUpdate( a_id, a_title, a_query, a_callback ) {
    var url = "/api/query/update?id="+a_id;
    if ( a_title != undefined )
        url += "&title=" + encodeURIComponent(a_title);
    _asyncPost(url,a_query,a_callback);
}

function sendQueryDelete( a_ids, a_cb ){
    _asyncGet( "/api/query/delete?ids=" + encodeURIComponent(JSON.stringify(a_ids)), null, a_cb );
}

function sendQueryView( a_id, a_callback ){
    console.log("sendQueryView,",a_id);
    _asyncGet("/api/query/view?id="+encodeURIComponent(a_id),null,a_callback);
}

function epView( a_ep, a_cb ){
    _asyncGet( "/ui/ep/view?ep="+encodeURIComponent(a_ep), null, function( ok, data ){
        if ( a_cb )
            a_cb( ok, data );
    });
}

function epAutocomplete( a_term, a_cb ){
    _asyncGet( "/ui/ep/autocomp?term="+encodeURIComponent(a_term), null, function( ok, data ){
        if ( a_cb )
            a_cb( ok, data );
    });
}

function epRecentLoad( a_cb ){
    console.log("epRecentLoad");
    _asyncGet( "/ui/ep/recent/load", null, function( ok, data ){
        //console.log("epRecentLoad",ok,data);
        
        if ( ok ){
            g_ep_recent = data;
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

function epDirList( a_ep, a_path, a_show_hidden, a_cb ){
    console.log("epDirList",a_ep,a_path);
    _asyncGet( "/ui/ep/dir/list?ep=" + encodeURIComponent(a_ep) + "&path=" + encodeURIComponent(a_path) + "&hidden=" + (a_show_hidden?"true":"false"), null, function( ok, data ){
        if ( a_cb ){
            if ( ok )
                a_cb( data );
            else{
                console.log("dir list failed",data);
                a_cb();
            }
        }
    });
}

function setStatusText( text, err ){
    if ( status_timer )
        clearTimeout( status_timer );
    if ( status_int )
        clearTimeout( status_int );

    var bar = $("#status_text");

    if ( err ){
        bar.addClass("blink-background");
        bar.html( "<span class='ui-icon ui-icon-alert' style='color:yellow;font-size:115%'></span>&nbsp" + text );
    }else{
        bar.removeClass("blink-background");
        bar.html( text);
    }

    status_timer = setTimeout( function(){
        status_timer = null;
        bar.html(" ");
        bar.removeClass("blink-background");
    },9000);
}

function dlgConfirmChoice( title, msg, btns, cb ) {
    var div = $(document.createElement('div'));
    div.html( msg );
    var options = {
        title: title,
        modal: true,
        buttons: []
    };

    for ( var i in btns ){
        ( function( idx ) {
            options.buttons.push({
                text: btns[idx],
                click: function() {
                    cb( idx );
                    $(this).dialog('destroy').remove();
                }
            });
        })(i);
    }

    div.dialog( options );
}

function dlgSingleEntry( title, label, btns, cb ) {
    var div = $(document.createElement('div'));
    div.html( label + "&nbsp<input id='dlg_se_input' type='text'></input>" );
    inputTheme($("#dlg_se_input",div));

    var options = {
        title: title,
        width: 'auto',
        modal: true,
        buttons: []
    };

    for ( var i in btns ){
        ( function( idx ) {
            options.buttons.push({
                text: btns[idx],
                click: function() {
                    cb( idx, $("#dlg_se_input",div).val() );
                    $(this).dialog('destroy').remove();
                }
            });
        })(i);
    }

    div.dialog( options );
}

function dlgAlert( title, msg, cb ) {
    var div = $(document.createElement('div'));
    div.html( msg );
    var options = {
        title: title,
        modal: true,
        buttons: [{
            text: "Ok",
            click: function() {
                $(this).dialog('destroy').remove();
                if ( cb )
                    cb();
            }
        }]
    };

    div.dialog( options );
}

function sizeToString( a_bytes ){
    if ( a_bytes == 0 )
        return "0";
    else if ( a_bytes < 1024 )
        return a_bytes + " B";
    else if ( a_bytes < 1048576 )
        return Math.floor( a_bytes / 102.4 )/10 + " KB";
    else if ( a_bytes < 1073741824 )
        return Math.floor( a_bytes / 104857.6 )/10 + " MB";
    else if ( a_bytes < 1099511627776 )
        return Math.floor( a_bytes / 107374182.4 )/10 + " GB";
    else
        return Math.floor( a_bytes / 109951162777.6 )/10 + " TB";
}

function parseSize( a_size_str ){
    var result = null, val;
    var tokens = a_size_str.toUpperCase().trim().split(" ");
    console.log( "tokens:", tokens );
    for ( var i in tokens ){
        if ( tokens[i].length == 0 ){
            console.log( "splice at", i );
            tokens.splice(i,1);
        }
    }
    console.log( "tokens:", tokens );

    if ( tokens.length == 2 ){
        val = parseFloat(tokens[0]);
        if ( !isNaN(val) ){
            switch(tokens[1]){
                case "PB": val *= 1024;
                case "TB": val *= 1024;
                case "GB": val *= 1024;
                case "MB": val *= 1024;
                case "KB": val *= 1024;
                case "B":
                    result = val;
                    break;
            }
        }
    }else if( tokens.length == 1 ){
        if ( tokens[0].endsWith("B")){
            var len = tokens[0].length;
            var numchar = "0123456789.";
            if ( numchar.indexOf( tokens[0][len-2] ) != -1 ){
                val = parseFloat( tokens[0].substr(0,len-1));
                if ( !isNaN(val))
                    result = val;
            }else{
                val = parseFloat( tokens[0].substr(0,len-2));
                if ( !isNaN(val) ){
                    switch(tokens[0][len-2]){
                        case "P": val *= 1024;
                        case "T": val *= 1024;
                        case "G": val *= 1024;
                        case "M": val *= 1024;
                        case "K": val *= 1024;
                            result = val;
                            break;
                    }
                }
            }
        }else{
            val = parseFloat( tokens[0] );
            if ( !isNaN(val) )
                result = val;
        }
    }
    if ( result != null )
        result = Math.ceil( result );
    return result;
}


function themeSet( theme ){
    g_theme = theme;
    $("#jq-theme-css").attr({href : "/jquery-ui-"+g_theme+"/jquery-ui.css" });
    _asyncGet( "/ui/theme/save?theme="+theme, null, null );
}

function tooltipTheme( a_objs ){
    a_objs.tooltip({
        show: { effect: "fade", delay: 1000 },
        classes:{ "ui-tooltip": "note ui-corner-all tooltip-style" },
        position: {my: "left+15 top+15", at: "left bottom", collision: "flipfit" }
    });
}

function inputTheme( a_objs ){
    a_objs.addClass("ui-widget ui-widget-content");
    return a_objs;
}

function inputDisable( a_objs ){
    a_objs.prop("disabled",true).removeClass("ui-widget-content").addClass("ui-state-disabled");
    return a_objs;
}

function inputEnable( a_objs ){
    a_objs.prop("disabled",false).removeClass("ui-state-disabled").addClass("ui-widget-content");
    return a_objs;
}

function dataGetPreprocess( a_ids, a_cb ){
    var url = "/api/dat/get/preproc?ids=" + encodeURIComponent(JSON.stringify(a_ids));
    _asyncGet( url, null, a_cb );
}

function xfrStart( a_ids, a_mode, a_path, a_ext, a_cb ){
    var url = "/api/dat/";

    if ( a_mode == XFR_GET )
        url += "get" + "?ids=" + encodeURIComponent(JSON.stringify(a_ids)) ;
    else if ( a_mode == XFR_PUT )
        url += "put" + "?id=" + encodeURIComponent(a_ids[0]) ;
    else{
        return;
    }

    url += "&path=" + encodeURIComponent(a_path) + ((a_ext && a_ext.length)?"&ext="+encodeURIComponent(a_ext):"");

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


function defineArrowMarkerDeriv( a_svg ){
    a_svg.append('defs').append('marker')
        .attr('id','arrow-derivation')
        .attr('refX',-2.5)
        .attr('refY',2)
        .attr('orient','auto')
        .attr('markerWidth',5)
        .attr('markerHeight',4)
        .append('svg:path')
            .attr('class','arrow-path derivation')
            .attr('d', 'M 5,0 L 0,2 L 5,4')
}

function defineArrowMarkerComp( a_svg ){
    a_svg.append('defs').append('marker')
        .attr('id','arrow-component')
        .attr('refX',-2.5)
        .attr('refY',2)
        .attr('orient','auto')
        .attr('markerWidth',8)
        .attr('markerHeight',4)
        .append('svg:path')
            .attr('class','arrow-path component')
            .attr('d', 'M 4,0 L 0,2 L 4,4 L 8,2')
}

function defineArrowMarkerNewVer( a_svg, a_name ){
    a_svg.append('defs').append('marker')
        .attr('id','arrow-new-version')
        .attr('refX',8.5)
        .attr('refY',2)
        .attr('orient','auto')
        .attr('markerWidth',10)
        .attr('markerHeight',4)
        .append('svg:path')
            .attr('class','arrow-path new-version')
            .attr('d', 'M 2,0 L 6,2 L 2,4 M 4,2 L 0,4 L 0,0')
}

var status_timer;
var status_int;

var PERM_RD_REC         = 0x0001; // Read record info (description, keywords, details)
var PERM_RD_META        = 0x0002; // Read structured metadata
var PERM_RD_DATA        = 0x0004; // Read raw data
var PERM_WR_REC         = 0x0008; // Write record info (description, keywords, details)
var PERM_WR_META        = 0x0010; // Write structured metadata
var PERM_WR_DATA        = 0x0020; // Write raw data
var PERM_LIST           = 0x0040; // List contents of collection
var PERM_LINK           = 0x0080; // Link/unlink child records (collections only)
var PERM_CREATE         = 0x0100; // Create new child records (collections only)
var PERM_DELETE         = 0x0200; // Delete record
var PERM_SHARE          = 0x0400; // View/set ACLs
var PERM_LOCK           = 0x0800; // Lock record
//var PERM_LABEL          = 0x0800; // Label record
//var PERM_TAG            = 0x1000; // Tag record
//var PERM_ANNOTATE       = 0x2000; // Annotate record
var PERM_MAX            = 0x0800; // Lock record

var PERM_BAS_READ       = PERM_RD_REC | PERM_RD_META | PERM_RD_DATA | PERM_LIST;
var PERM_BAS_WRITE      = PERM_WR_REC | PERM_WR_META | PERM_WR_DATA | PERM_LINK | PERM_CREATE;
var PERM_BAS_ADMIN      = PERM_DELETE | PERM_SHARE | PERM_LOCK;
var PERM_ALL            = 0x0FFF;

var MD_MAX_SIZE                 = 102400; // Max metadata size = 100 Kb
var PAYLOAD_MAX_SIZE            = 1048576; // Max server payload size = 10 MB

var SS_USER                     = 1;
var SS_PROJECT                  = 2;
var SS_OWNED_PROJECTS           = 3;
var SS_MANAGED_PROJECTS         = 4;
var SS_MEMBER_PROJECTS          = 5;
var SS_COLLECTION               = 6;
var SS_TOPIC                    = 7;
var SS_SHARED_BY_USER           = 8;
var SS_SHARED_BY_ANY_USER       = 9;
var SS_SHARED_BY_PROJECT        = 10;
var SS_SHARED_BY_ANY_PROJECT    = 11;
var SS_PUBLIC                   = 12;
var SS_VIEW                     = 13;

var XFR_GET         = 0;
var XFR_PUT         = 1;
var XFR_SELECT      = 2;

var DEP_IN          = 0;
var DEP_OUT         = 1;

var DEP_IS_DERIVED_FROM    = 0;
var DEP_IS_COMPONENT_OF    = 1;
var DEP_IS_NEW_VERSION_OF  = 2;

DepDirFromString = {
    "DEP_IN":DEP_IN,
    "DEP_OUT":DEP_OUT
}

DepTypeFromString = {
    "DEP_IS_DERIVED_FROM":DEP_IS_DERIVED_FROM,
    "DEP_IS_COMPONENT_OF":DEP_IS_COMPONENT_OF,
    "DEP_IS_NEW_VERSION_OF":DEP_IS_NEW_VERSION_OF
}

var dlgGroups = new makeDlgGroups();
var dlgGroupEdit = new makeDlgGroupEdit();
var dlgAllocNewEdit = new makeDlAllocNewEdit();
var g_ep_recent = [];
var g_date_opts = { year: '2-digit', month: 'numeric', day: 'numeric', hour: '2-digit', minute: 'numeric', hour12: false };

epRecentLoad();

console.log( "main.js loaded");
