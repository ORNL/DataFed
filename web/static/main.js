var g_user = null;

function loadUser() {
    console.log( "loadUser" );

    var user = Cookies.get( 'sdms-user' );

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
    //Cookies.remove( 'sdms-user', { path: "/ui" });
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

function viewData( a_id, a_cb ) {
    _asyncGet( "/api/dat/view?id=" + encodeURIComponent(a_id), null, function( ok, data ){
        if ( ok ) {
            console.log("viewData ok, data:", data );
            a_cb( data );
        }
        else {
            console.log("viewData failed:", data );
            a_cb();
        }
    });
}

function copyData( a_src_id, a_dst_id, a_cb ){
    //console.log("copyData",a_src_id, a_dst_id);
    _asyncGet( "/api/dat/copy?src=" + encodeURIComponent(a_src_id) + "&dst=" + encodeURIComponent(a_dst_id), null, a_cb);
}

function dataFind( a_query, a_callback ) {
    //_asyncGet("/api/dat/search?query="+encodeURIComponent(a_query)+"&scope="+a_scope,null,a_callback);
    _asyncPost("/api/dat/search",a_query,a_callback);
}

function viewColl( a_id, a_cb ) {
    console.log("viewColl()");
    _asyncGet( "/api/col/view?id=" + encodeURIComponent(a_id), null, function( ok, data ){
        if ( ok ) {
            console.log("viewColl ok, data:", data, typeof data );
            if ( data )
                a_cb( data );
            else
                a_cb();
        }
        else {
            //console.log("viewColl failed:", data );
            a_cb();
            /*
            dlgAlert("Error Viewing Collection", "Collection ID: " + a_id + "<br>Reason: " + data, function(){
                a_cb();
            });*/
        }
    });
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
            a_cb();
        }
    });
}

function linkItem( a_item, a_coll, a_cb ) {
    _asyncGet( "/api/link?item="+encodeURIComponent(a_item)+"&coll="+encodeURIComponent(a_coll), null, a_cb );
}

function linkItemUnlinkSource( a_item, a_coll, a_source, a_cb ) {
    _asyncGet( "/api/link?item="+encodeURIComponent(a_item)+"&coll="+encodeURIComponent(a_coll)+"&unlink="+encodeURIComponent(a_source), null, a_cb );
}

function unlinkItem( a_item, a_coll, a_cb ) {
    _asyncGet( "/api/unlink?item="+encodeURIComponent(a_item)+"&coll="+encodeURIComponent(a_coll), null, a_cb );
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

function repoUpdate( a_repo, a_title, a_desc, a_capacity, a_admins, a_cb ){
    console.log("repo upd:",a_repo, a_title, a_desc, a_capacity);
    var url = "/api/repo/update?id="+a_repo;
    if ( a_title )
        url += "&title="+encodeURIComponent(a_title);
    if ( a_desc )
        url += "&desc="+encodeURIComponent(a_desc);
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
function allocListByUser( a_cb ){
    _asyncGet( "/api/repo/alloc/list/by_user", null, a_cb );
}

function allocListByOwner( a_id, a_cb ){
    _asyncGet( "/api/repo/alloc/list/by_owner?id="+a_id, null, a_cb );
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

function topicList( a_parent, a_cb ){
    if ( !a_cb )
        return;

    _asyncGet( "/api/top/list?id="+encodeURIComponent(a_parent?a_parent:"t/root"), null, function( ok, data ){
        if ( a_cb ){
            a_cb( ok, data );
        }
    });
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
        console.log("epRecentLoad",ok,data);
        
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

function confirmChoice( title, msg, btns, cb ) {
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

function isValidID( id ){
    var len = id.length;
    if ( !len ){
        dlgAlert("Invalid ID","ID cannot be blank.");
        return false;
    }

    var code, i;
    var allowed = [43,45,46,95];

    for ( i = 0; i < len; i++ ){
        code = id.charCodeAt(i);
        if (!(code > 47 && code < 58) && // numeric (0-9)
            !(code > 64 && code < 91) && // upper alpha (A-Z)
            !(code > 96 && code < 123)){ // lower alpha (a-z)
            if ( allowed.indexOf( code ) == -1 || i == 0 ){
                dlgAlert("Invalid ID","IDs can only contain upper/lower case letters, numbers, and the punctuation characters '.', '-', '+', and '_'. IDs also cannot start with a puncuation character.");
                return false;
            }
        }
    }

    return true;
};

function isValidAlias( alias ){
    var len = alias.length;
    if ( len ){
        var code, i;
        var allowed = [43,45,46,95];

        for ( i = 0; i < len; i++ ){
            code = alias.charCodeAt(i);
            if (!(code > 47 && code < 58) && // numeric (0-9)
                !(code > 64 && code < 91) && // upper alpha (A-Z)
                !(code > 96 && code < 123)){ // lower alpha (a-z)
                if ( allowed.indexOf( code ) == -1 || i == 0 ){
                    dlgAlert("Invalid Alias","Aliases can only contain upper/lower case letters, numbers, and the punctuation characters '.', '-', '+', and '_'. Aliases also cannot start with a puncuation character.");
                    return false;
                }
            }
        }
    }

    return true;
};


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

var status_timer;

var PERM_VIEW           = 0x01;
var PERM_RD_META        = 0x02;
var PERM_RD_DATA        = 0x04;
var PERM_WR_META        = 0x08;
var PERM_WR_DATA        = 0x10;
var PERM_ADMIN          = 0x20;
var PERM_TAG            = 0x40;
var PERM_NOTE           = 0x80;
var PERM_ALL            = 0xFF;
var PERM_READONLY       = 0x07;
var PERM_READWRITE      = 0x1F;

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

var dlgSetACLs = new makeDlgSetACLs();
var dlgPickUser = new makeDlgPickUser();
var dlgGroups = new makeDlgGroups();
var dlgGroupEdit = new makeDlgGroupEdit();
var dlgAllocations = new makeDlgAllocations();
var dlgRepoAdmin = new makeDlgRepoAdmin();
var dlgAllocNewEdit = new makeDlAllocNewEdit();
var g_ep_recent = [];
var g_date_opts = { year: '2-digit', month: 'numeric', day: 'numeric', hour: '2-digit', minute: 'numeric', hour12: false };

epRecentLoad();

console.log( "main.js loaded");
