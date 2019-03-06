var g_user = null;

function loadUser() {
    console.log( "loadUser" );

    var user = Cookies.get( 'sdms-user' );
    console.log( "user cookie: ", user );

    if ( user ) {
        g_user = JSON.parse( user );
    } else {
        g_user = null;
    }

    console.log( "user: ", g_user );
}

function logout() {
    console.log( "logout");
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

function getUpdatedValue( a_new_val, a_old_obj, a_new_obj, a_field ){
    var tmp = a_new_val.trim(), old = a_old_obj[a_field];
    if (( old == undefined && tmp.length ) || ( old != undefined && tmp != old ))
        a_new_obj[a_field] = tmp;
};

function viewData( a_id, a_cb ) {
    _asyncGet( "/api/dat/view?id=" + encodeURIComponent(a_id), null, function( ok, data ){
        if ( ok ) {
            //console.log("viewData ok, data:", data );
            a_cb( data );
        }
        else {
            //console.log("viewData failed:", data );
            setStatusText("View Data Error: " + data);
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

function dataGet( a_id ){
    checkPerms( a_id, PERM_RD_DATA, function( granted ){
        if ( !granted ){
            alertPermDenied();
            return;
        }

        viewData( a_id, function( data ){
            if ( data ){
                if ( !data.size || parseInt(data.size) == 0 )
                    dlgAlert("Data Get Error","Record contains no raw data");
                else
                    dlgStartTransfer( XFR_GET, data );
            }
        }); 
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
                dlgStartTransfer( XFR_PUT, data );
            }
        }); 
    });
}

function dataGetDeps( a_id, a_cb ) {
    _asyncGet( "/api/dat/deps/get?id=" + encodeURIComponent(a_id), null, function( ok, data ){
        if ( ok ) {
            //console.log("viewData ok, data:", data );
            a_cb( data );
        }
        else {
            //console.log("viewData failed:", data );
            setStatusText("Get Data Deps Error: " + data);
            a_cb();
        }
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
    _asyncGet( "/api/col/get_parents?id="+encodeURIComponent(a_id), null, a_cb );
}

function aclView( a_id, a_cb ) {
    _asyncGet( "/api/acl/view?id="+encodeURIComponent(a_id), null, a_cb );
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

function aclUpdate( a_id, a_rules, a_public, a_cb ) {
    _asyncGet( "/api/acl/update?id="+encodeURIComponent(a_id)+"&rules="+encodeURIComponent(JSON.stringify(a_rules))+"&pub="+a_public, null, a_cb );
}

function userView( a_id, a_details, a_cb ) {
    console.log("userView ",a_id);
    _asyncGet( "/api/usr/view?id="+a_id+(a_details?"&details=true":""), null, a_cb );
}

function repoView( a_repo, a_cb ){
    _asyncGet( "/api/repo/view?id="+a_repo, null, a_cb );
}

function repoUpdate( a_repo, a_title, a_desc, a_domain, a_exp_path, a_capacity, a_admins, a_cb ){
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

function allocStats( a_repo, a_subject, a_cb ){
    _asyncGet( "/api/repo/alloc/stats?repo="+a_repo+(a_subject?"&subject="+encodeURIComponent(a_subject):""), null, a_cb );
}

function allocSet( a_repo, a_subject, a_alloc, a_cb ){
    _asyncGet( "/api/repo/alloc/set?repo="+a_repo+"&subject="+encodeURIComponent(a_subject)+"&alloc="+a_alloc, null, a_cb );
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

function epRecentSave( a_cb ){
    console.log("epRecentSave",g_ep_recent);
    _asyncPost( "/ui/ep/recent/save",{ep:g_ep_recent}, function( ok, data ){
        if ( a_cb )
            a_cb();
    });
}

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

function setStatusText( text ){
    if ( status_timer )
        clearTimeout( status_timer );

    $("#status_text").html( text );
    status_timer = setTimeout( function(){
        status_timer = null;
        $("#status_text").html(" ");
    }, 8000 );
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

function xfrStart( a_id, a_mode, a_path, a_cb ){
    var url = "/api/dat/";

    if ( a_mode == XFR_GET )
        url += "get";
    else if ( a_mode == XFR_PUT )
        url += "put";
    else{
        return;
    }

    url += "?id=" + a_id + "&path=" + encodeURIComponent(a_path);

    _asyncGet( url, null, function( ok, data ){
        if ( ok ) {
            // TODO - Move recent path update to database service
            var p = g_ep_recent.indexOf(a_path);
            if ( p < 0 ){
                g_ep_recent.unshift(a_path);
                if ( g_ep_recent.length > 20 )
                    g_ep_recent.length = 20;
                epRecentSave();
            }else if ( p > 0 ) {
                g_ep_recent.unshift( g_ep_recent[p] );
                g_ep_recent.splice( p+1, 1 );
                epRecentSave();
            }
        }

        if ( a_cb )
            a_cb( ok, data );
    });
}

var status_timer;

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
var dlgRepoAdmin = new makeDlgRepoAdmin();
var dlgAllocNewEdit = new makeDlAllocNewEdit();
var g_ep_recent = [];
var g_date_opts = { year: '2-digit', month: 'numeric', day: 'numeric', hour: '2-digit', minute: 'numeric', hour12: false };

epRecentLoad();

console.log( "main.js loaded");
