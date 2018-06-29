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
            if ( a_callback )
                a_callback( true, a_data );
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

function viewData( a_id, a_callback ) {
    console.log("viewData()");
    _asyncGet( "/api/dat/view?id=" + a_id, null, function( ok, data ){
        if ( ok ) {
            console.log("viewData ok, data:", data, typeof data );
            a_callback( data );
        }
        else {
            console.log("viewData failed:", data );
            a_callback();
        }
    });
}

function createData( a_title, a_alias, a_desc, a_md, a_coll, a_callback ) {
    console.log("createData()");
    _asyncGet( "/api/dat/create?title="+a_title+"&alias="+a_alias+"&desc="+a_desc+"&md="+a_md+"&coll="+a_coll, null, a_callback );
}

function findData( a_query, a_scope, a_callback ) {
    _asyncGet("/api/dat/find?query="+encodeURIComponent(a_query)+"&scope="+a_scope,null,a_callback);
}

function viewColl( a_id, a_callback ) {
    console.log("viewColl()");
    _asyncGet( "/api/col/view?id=" + a_id, null, function( ok, data ){
        if ( ok ) {
            console.log("viewColl ok, data:", data, typeof data );
            a_callback( data );
        }
        else {
            console.log("viewColl failed:", data );
            a_callback();
        }
    });
}

function viewProj( a_id, a_cb ){
    _asyncGet( "/api/prj/view?id=" + a_id, null, function( ok, data ){
        if ( ok ) {
            console.log("viewProj ok, data:", data, typeof data );
            a_cb( data );
        }
        else {
            console.log("viewProj failed:", data );
            a_cb();
        }
    });
}

function linkItem( a_item, a_coll, a_cb ) {
    _asyncGet( "/api/link?item="+a_item+"&coll="+a_coll, null, a_cb );
}

function linkItemUnlinkSource( a_item, a_coll, a_source, a_cb ) {
    _asyncGet( "/api/link?item="+a_item+"&coll="+a_coll+"&unlink="+a_source, null, a_cb );
}

function unlinkItem( a_item, a_coll, a_cb ) {
    _asyncGet( "/api/unlink?item="+a_item+"&coll="+a_coll, null, a_cb );
}

function getParents( a_id, a_cb ) {
    _asyncGet( "/api/col/get_parents?id="+a_id, null, a_cb );
}

function aclView( a_id, a_cb ) {
    _asyncGet( "/api/acl/view?id="+a_id, null, a_cb );
}

function aclUpdate( a_id, a_rules, a_public, a_cb ) {
    //console.log("update rules:",JSON.stringify(a_rules));
    console.log("update acl:",a_public);
    _asyncGet( "/api/acl/update?id="+a_id+"&rules="+JSON.stringify(a_rules)+"&pub="+a_public, null, a_cb );
}

function userView( a_id, a_cb ) {
    _asyncGet( "/api/usr/view?id="+a_id, null, a_cb );
}

function groupView( a_uid, a_gid, a_cb ) {
    if ( a_gid.startsWith("g/" ))
        _asyncGet( "/api/grp/view?uid="+a_uid+"&gid="+a_gid.substr(2), null, a_cb );
    else
        _asyncGet( "/api/grp/view?uid="+a_uid+"&gid="+a_gid, null, a_cb );
}

function groupList( a_uid, a_cb ) {
    _asyncGet( "/api/grp/list?uid="+a_uid, null, a_cb );
}

function groupCreate( a_uid, a_group, a_cb ) {
    var url = "/api/grp/create?uid="+a_uid+"&gid="+a_group.gid;
    if ( a_group.title )
        url += "&title="+a_group.title;
    if ( a_group.desc )
        url += "&desc="+a_group.desc;
    if ( a_group.member && a_group.member.length )
        url += "&member=" + JSON.stringify( a_group.member );

    _asyncGet( url, null, function( ok, data ){
        if (  a_cb )
            a_cb( ok, data );
    });
}

function groupUpdate( a_group, a_cb ) {
    var url = "/api/grp/update?uid="+a_group.uid+"&gid="+a_group.gid;
    if ( a_group.title )
        url += "&title="+a_group.title;
    if ( a_group.desc )
        url += "&desc="+a_group.desc;
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
    _asyncGet( "/api/grp/delete?uid="+a_uid+"&gid="+(a_gid.startsWith("g/")?a_gid.substr(2):a_gid), null, function( ok, data ){
        if ( ok && a_cb )
            a_cb();
    });
}

function dlgNewEdit(a_mode,a_data,a_parent,a_cb) {
    var frame = $(document.createElement('div'));
    frame.html(
        "<table style='width:100%'>\
            <tr><td>Title:</td><td><input type='text' id='title' style='width:100%'></input></td></tr>\
            <tr><td>Alias:</td><td><input type='text' id='alias' style='width:100%'></input></td></tr>\
            <tr><td >Description:</td><td><textarea id='desc' rows=3 style='width:100%'></textarea></td></tr>\
            <tr id='dlg_md_row'><td>Metadata:</td><td><textarea id='md' rows=3 style='width:100%'></textarea></td></tr>\
            <tr id='dlg_md_row2'><td>Metadata mode:</td><td>\
                <input type='radio' id='md_merge' name='md_mode' value='merge' checked>\
                <label for='md_merge'>Merge</label>\
                <input type='radio' id='md_set'  name='md_mode' value='set'>\
                <label for='md_mode'>Set</label>\
                </td></tr>\
            <tr id='dlg_coll_row'><td>Parent:</td><td><input type='text' id='coll' style='width:100%'></input></td></tr>\
            </table>" );

    var dlg_title;
    if ( a_data ) {
        dlg_title = (a_mode?"Edit Collection ":"Edit Data ") + a_data.id;
    } else {
        dlg_title = a_mode?"New Collection":"New Data";
    }

    var options = {
        title: dlg_title,
        modal: true,
        width: 400,
        height: 'auto',
        resizable: true,
        closeOnEscape: false,
        buttons: [{
            text: a_data?"Update":"Create",
            click: function() {
                var title = encodeURIComponent($("#title",frame).val());
                if ( !title ) {
                    alert("Title cannot be empty");
                    return;
                }

                var alias = encodeURIComponent($("#alias",frame).val());
                var desc = encodeURIComponent($("#desc",frame).val());
                var coll = encodeURIComponent($("#coll",frame).val());
                var md = encodeURIComponent($("#md",frame).val());

                var url = "/api/";
                if ( a_mode )
                    url += "col";
                else
                    url += "dat";

                if ( a_data )
                    url += "/update?id="+a_data.id + "&";
                else
                    url += "/create?"
                var delim = "";

                if ( title ) {
                    url += "title="+title;
                    delim = "&";
                }

                if ( alias ) {
                    url += delim + "alias="+alias;
                    delim = "&";
                }

                if ( desc ) {
                    url += delim + "desc="+desc;
                    delim = "&";
                }

                if ( a_mode == 0 ){
                    if ( md ) {
                        url += delim + "md="+md;
                        delim = "&";

                        if ( a_data ) {
                            if ( $('input[name=md_mode]:checked', frame ).val() == "set" )
                                url += "&mdset=true";
                        }
                    }
                }

                if ( coll )
                    url += delim + "coll="+coll;

                console.log( "URL in js", url );

                var inst = $(this);
                _asyncGet( url, null, function( ok, data ){
                    if ( ok ) {
                        inst.dialog('destroy').remove();
                        //console.log( "data:",data);
                        if ( a_cb )
                            a_cb(data.data[0]);
                    } else {
                        alert( "Error: " + data );
                    }
                });
            }
        },{
            text: "Cancel",
            click: function() {
                $(this).dialog('destroy').remove();
            }
        }],
        open: function(event,ui){
            if ( a_data ){
                $("#title",frame).val(a_data.title);
                $("#alias",frame).val(a_data.alias);
                $("#desc",frame).val(a_data.desc);
                $("#md",frame).val(a_data.metadata);
                $("#dlg_coll_row",frame).css("display","none");
                if ( a_mode )
                    $("#dlg_md_row2",frame).css("display","none");
                else
                    $("#dlg_md_row2",frame).css("display","show");
            } else {
                $("#title",frame).val("");
                $("#alias",frame).val("");
                $("#desc",frame).val("");
                $("#coll",frame).val(a_parent?a_parent:"");
                $("#md",frame).val("");
                $("#dlg_coll_row",frame).css("display","show");
                $("#dlg_md_row2",frame).css("display","none");
            }

            if ( a_mode ){
                $("#md",frame).val("");
                $("#dlg_md_row",frame).css("display","none");
            } else
                $("#dlg_md_row",frame).css("display","show");
        }
    };


    frame.dialog( options );
}

// Dialog that allows creation and editing of Projects
function dlgNewEditProj(a_data,a_cb) {
    console.log( "dlgNewEditProj", a_data );
    var frame = $(document.createElement('div'));
    var html = "<div class='col-flex' style='height:100%'>\
        <div style='flex:none'>\
            <table style='width:100%'>\
                <tr><td>ID:</td><td><input type='text' id='id' style='width:100%'></input></td></tr>\
                <tr><td>Title:</td><td><input type='text' id='title' style='width:100%'></input></td></tr>\
                <tr><td>Description:</td><td><textarea id='desc' rows=3 style='width:100%'></textarea></td></tr>\
                <tr><td>Domain:</td><td><input type='text' id='domain' style='width:100%'></input></td></tr>\
                <tr id='repo_row'><td>Repo ID:</td><td><input type='text' id='repo_id' style='width:100%'></input></td></tr>\
                <tr><td>Owner:</td><td><input type='text' id='owner_id' style='width:100%' disabled></input></td></tr>\
            </table>\
        </div>\
        <div style='flex:none'>&nbsp</div>\
        <div class='row-flex' style='flex: 1 1 100%'>\
            <div class='col-flex' style='flex: 1 1 50%;height:100%'>\
                <div style='flex:none'>Members:</div>\
                <div class='ui-widget-content text' style='flex:1 1 100%;min-height:5em;overflow:auto'>\
                    <div id='proj_mem_tree' class='no-border'></div>\
                </div>\
                <div style='flex:none;padding-top:.25em'><button id='add_mem_btn' class='btn'>Add</button>&nbsp<button id='rem_mem_btn' class='btn' disabled>Remove</button></div>\
            </div>\
            <div style='flex:none'>&nbsp</div>\
            <div class='col-flex' style='flex: 1 1 50%;height:100%'>\
                <div style='flex:none'>Admins:</div>\
                <div class='ui-widget-content text' style='flex:1 1 100%;min-height:5em;overflow:auto'>\
                    <div id='proj_adm_tree' class='no-border'></div>\
                </div>\
                <div style='flex:none;padding-top:.25em'><button id='add_adm_btn' class='btn'>Add</button>&nbsp<button id='rem_adm_btn' class='btn' disabled>Remove</button></div>\
            </div>\
        </div>";

    frame.html( html );

    var dlg_title;
    if ( a_data ) {
        dlg_title = "Edit Project " + a_data.id;
    } else {
        dlg_title = "New Project";
    }
    var proj;
    if ( a_data )
        proj = Object.assign({}, a_data);
    else
        proj = { owner: g_user.uid };

    var options = {
        title: dlg_title,
        modal: true,
        width: 400,
        height: 'auto',
        resizable: true,
        closeOnEscape: false,
        buttons: [{
            text: a_data?"Update":"Create",
            click: function() {
                proj.id = $("#id",frame).val();
                proj.domain = $("#domain",frame).val();
                proj.title = $("#title",frame).val();
                proj.desc = $("#desc",frame).val();
                proj.repo = $("#repo_id",frame).val();

                console.log( "project update, old:", a_data, "new:",proj);
                if ( !proj.id || !proj.domain || !proj.title ){
                    alert("Missing one or more required fields: ID, title, and domain.");
                    return;
                }

                var url = "/api/prj/";

                if ( a_data )
                    url += "update?id=";
                else
                    url += "create?id=";

                url += encodeURIComponent( proj.id );;

                if ( !a_data || proj.domain != a_data.domain )
                    url += "&domain="+ encodeURIComponent(proj.domain);

                if ( !a_data || proj.title != a_data.title )
                    url += "&title="+ encodeURIComponent(proj.title);

                if (( !a_data && proj.desc ) || proj.desc != a_data.desc )
                    url += "&desc="+ encodeURIComponent(proj.desc);

                if ( !a_data && proj.repo )
                    url += "&repo="+ encodeURIComponent(proj.repo);

                var mem_tree =  $("#proj_mem_tree",frame).fancytree("getTree");
                var adm_tree =  $("#proj_adm_tree",frame).fancytree("getTree");
        
                var admins = [];
                adm_tree.visit( function(node){
                    admins.push( node.title );
                });
                url += "&admins=" + JSON.stringify( admins );

                var members = [];
                mem_tree.visit( function(node){
                    members.push( node.title );
                });
                url += "&members=" + JSON.stringify( members );
                console.log( "URL", url );

                var inst = $(this);
                _asyncGet( url, null, function( ok, data ){
                    if ( ok ) {
                        inst.dialog('destroy').remove();
                        //console.log( "data:",data);
                        if ( a_cb )
                            a_cb(data.data[0]);
                    } else {
                        alert( "Error: " + data );
                    }
                });
            }
        },{
            text: "Cancel",
            click: function() {
                $(this).dialog('destroy').remove();
            }
        }],
        open: function(event,ui){
            var mem_src = [];
            var adm_src = [];

            if ( a_data ){
                $("#id",frame).val(a_data.id);
                $("#id",frame).prop("disabled",true);
                $("#title",frame).val(a_data.title);
                $("#desc",frame).val(a_data.desc);
                $("#domain",frame).val(a_data.domain);
                $("#repo_row",frame).css("display","none");
                $("#owner_id",frame).val(a_data.owner);

                for ( var i in a_data.member )
                    mem_src.push({title: a_data.member[i],icon:false,key: "u/"+a_data.member[i] });

                for ( i in a_data.admin )
                    adm_src.push({title: a_data.admin[i],icon:false,key: "u/"+a_data.admin[i] });

            }else{
                $("#owner_id",frame).val(g_user.uid);
            }

            $("#proj_mem_tree",frame).fancytree({
                extensions: ["themeroller"],
                themeroller: {
                    activeClass: "ui-state-hover",
                    addClass: "",
                    focusClass: "",
                    hoverClass: "ui-state-active",
                    selectedClass: ""
                },
                source: mem_src,
                selectMode: 1,
                checkbox: false,
                activate: function( event, data ) {
                    $("#rem_mem_btn",frame).button("option", "disabled", false);
                }
            });

            $("#proj_adm_tree",frame).fancytree({
                extensions: ["themeroller"],
                themeroller: {
                    activeClass: "ui-state-hover",
                    addClass: "",
                    focusClass: "",
                    hoverClass: "ui-state-active",
                    selectedClass: ""
                },
                source: adm_src,
                selectMode: 1,
                checkbox: false,
                activate: function( event, data ) {
                    $("#rem_adm_btn",frame).button("option", "disabled", false);
                }
            });

            var mem_tree =  $("#proj_mem_tree",frame).fancytree("getTree");
            var adm_tree =  $("#proj_adm_tree",frame).fancytree("getTree");
            var uid;
            var warn;

            function do_warn(){
                if ( warn ){
                    if ( warn == 1 )
                        setStatusText( "Project owner ignored." );
                    else if ( warn == 2 )
                        setStatusText( "Users cannot be both project admins and members." );
                    else
                        setStatusText( "Project owner and dual-role member/admin users ignored." );
                }
            }

            $("#add_mem_btn",frame).click( function(){
                dlgPickUser.show( function( uids ){
                    warn = 0;
                    for ( i in uids ){
                        uid = uids[i];
                        if ( uid == "u/"+proj.owner ){
                            warn |= 1;
                            continue;
                        }

                        if ( adm_tree.getNodeByKey( uid )){
                            warn |= 2;
                            continue;
                        }

                        if ( !mem_tree.getNodeByKey( uid )){
                            mem_tree.rootNode.addNode({title: uid.substr(2),icon:false,key: uid });
                        }
                    }
                    do_warn();
                });
            });

            $("#rem_mem_btn",frame).click( function(){
                var node = mem_tree.getActiveNode();
                if ( node ){
                    node.remove();
                    $("#rem_mem_btn",frame).button("option", "disabled", true);
                }
            });

            $("#add_adm_btn",frame).click( function(){
                dlgPickUser.show( function( uids ){
                    for ( i in uids ){
                        uid = uids[i];

                        if ( uid == "u/"+proj.owner ){
                            warn |= 1;
                            continue;
                        }

                        if ( mem_tree.getNodeByKey( uid )){
                            warn |= 2;
                            continue;
                        }

                        if ( !adm_tree.getNodeByKey( uid )){
                            adm_tree.rootNode.addNode({title: uid.substr(2),icon:false,key: uid });
                        }
                    }
                    do_warn();
                });
            });

            $("#rem_adm_btn",frame).click( function(){
                var node = adm_tree.getActiveNode();
                if ( node ){
                    node.remove();
                    $("#rem_adm_btn",frame).button("option", "disabled", true);
                }
            });

            $(".btn",frame).button();
        }
    };


    frame.dialog( options );
}


function dlgStartTransfer( a_mode, a_data ) {
    var frame = $(document.createElement('div'));
    frame.html(
        "<table style='width:100%'>\
        <tr><td>Title:</td><td><input disabled type='text' id='title' style='width:100%'></input></td></tr>\
        <tr><td>Alias:</td><td><input disabled type='text' id='alias' style='width:100%'></input></td></tr>\
        <tr><td >Description:</td><td><textarea disabled id='desc' rows=3 style='width:100%'></textarea></td></tr>\
        <tr><td>Metadata:</td><td><textarea disabled id='md' rows=3 style='width:100%'></textarea></td></tr>\
        <tr><td>Path:</td><td><input type='text' id='path' style='width:100%'></input></td></tr>\
        </table>" );

    var dlg_title = (a_mode?"Download Data ":"Upload Data ") + a_data.id;

    var options = {
        title: dlg_title,
        modal: true,
        width: 400,
        height: 'auto',
        resizable: true,
        closeOnEscape: false,
        buttons: [{
            text: a_mode?"Download":"Upload",
            click: function() {
                var path = encodeURIComponent($("#path",frame).val());
                if ( !path ) {
                    alert("Path cannot be empty");
                    return;
                }

                var url = "/api/dat/";
                if ( a_mode )
                    url += "get";
                else
                    url += "put";

                url += "?id=" + a_data.id + "&path=" + path;

                var inst = $(this);
                _asyncGet( url, null, function( ok, data ){
                    if ( ok ) {
                        inst.dialog('destroy').remove();
                    } else {
                        alert( "Error: " + data );
                    }
                });
            }
        },{
            text: "Cancel",
            click: function() {
                $(this).dialog('destroy').remove();
            }
        }],
        open: function(event,ui){
            $("#title",frame).val(a_data.title);
            $("#alias",frame).val(a_data.alias);
            $("#desc",frame).val(a_data.desc);
            $("#md",frame).val(a_data.metadata);
            $("#path",frame).val("olcf#dtn_atlas/~/");
        }
    };

    frame.dialog( options );
}


function setStatusText( text ){
    if ( status_timer )
        clearTimeout( status_timer );

    $("#status_text").html( text );
    status_timer = setTimeout( function(){
        status_timer = null;
        $("#status_text").html("");
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

var dlgSetACLs = new makeDlgSetACLs();
var dlgPickUser = new makeDlgPickUser();
var dlgGroups = new makeDlgGroups();
var dlgGroupEdit = new makeDlgGroupEdit();

console.log( "main.js loaded");