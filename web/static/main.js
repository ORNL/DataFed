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

function _asyncGet( a_path, a_raw_json_data, a_callback ) {
    $.ajax({
        url : a_path,
        global : false,
        type : 'get',
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
        timeout: 5000
    });
}

function viewData( a_id, a_cb ) {
    console.log("viewData()");
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

/*
function createData( a_title, a_alias, a_desc, a_md, a_coll, a_callback ) {
    console.log("createData()");
    _asyncGet( "/api/dat/create?title="+encodeURIComponent(a_title)+"&alias="+a_alias+"&desc="+a_desc+"&md="+a_md+"&coll="+a_coll, null, a_callback );
}*/

function dataFind( a_query, a_scope, a_callback ) {
    _asyncGet("/api/dat/search?query="+encodeURIComponent(a_query)+"&scope="+a_scope,null,a_callback);
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

function hasPerms( a_id, a_perms, a_cb ){
    _asyncGet( "/api/has_perms?id="+encodeURIComponent(a_id)+"&perms="+a_perms, null, function(ok,data){
        console.log("hasPerm",a_id,a_perms,ok,data);
        if ( ok )
            a_cb( data.granted );
        else
            a_cb( 0 );
    });
}

function aclUpdate( a_id, a_rules, a_public, a_cb ) {
    _asyncGet( "/api/acl/update?id="+encodeURIComponent(a_id)+"&rules="+encodeURIComponent(JSON.stringify(a_rules))+"&pub="+a_public, null, a_cb );
}

function userView( a_id, a_details, a_cb ) {
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


function epAutocomplete( a_term, a_cb ){
    _asyncGet( "/ui/ep/autocomp?term="+encodeURIComponent(a_term), null, function( ok, data ){
        if (  a_cb )
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
    _asyncGet( "/ui/ep/recent/save?recent="+encodeURIComponent(JSON.stringify(g_ep_recent)), null, function( ok, data ){
        if ( a_cb )
            a_cb();
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
        if ( val != NaN ){
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
                if ( val != NaN )
                    result = val;
            }else{
                val = parseFloat( tokens[0].substr(0,len-2));
                if ( val != NaN ){
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
            if ( val != NaN )
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

var status_timer;

var PERM_LIST           = 0x001;   // Find record by browsing
var PERM_VIEW           = 0x002;   // Read public record fields (not collection items or raw data)
var PERM_UPDATE         = 0x004;   // Update public record fields
var PERM_ADMIN          = 0x008;   // Read, write admin fields, delete record
var PERM_TAG            = 0x010;   // Add/remove tags on record
var PERM_NOTE           = 0x020;   // Add, remove, edit annotations on record
var PERM_READ           = 0x040;   // Read raw data or list collection items
var PERM_WRITE          = 0x080;   // Write raw data or add/remove collection items
var PERM_CREATE         = 0x100;   // Create data and collections
var PERM_ALL            = 0x1FF;
var PERM_PUBLIC         = 0x043;
var PERM_READONLY       = 0x073;
var PERM_READWRITE      = 0x0F7;

var SS_MY_DATA          = 0x01;
var SS_MY_PROJ          = 0x02;
var SS_TEAM_PROJ        = 0x04;
var SS_USER_SHARE       = 0x08;
var SS_PROJ_SHARE       = 0x10;
var SS_PUBLIC           = 0x20;

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

//$('.status-bar').addClass("ui-widget ui-widget-content ui-corner-all");

console.log( "main.js loaded");
