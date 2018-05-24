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

function dlgNewEdit(a_mode,a_data,a_parent,a_cb) {
    var frame = $('#dlg_new');
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
                        inst.dialog( "close" );
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
                $( this ).dialog( "close" );
                if ( a_cb )
                    a_cb();
            }
        }],
        open: function(event,ui){
            if ( a_data ){
                $("#title",frame).val(a_data.title);
                $("#alias",frame).val(a_data.alias);
                $("#desc",frame).val(a_data.desc);
                $("#md",frame).val(a_data.metadata);
                document.getElementById("dlg_coll_row").style.display = 'none';
                if ( a_mode )
                    document.getElementById("dlg_md_row2").style.display = 'none';
                else
                    document.getElementById("dlg_md_row2").style.display = '';
            } else {
                $("#title",frame).val("");
                $("#alias",frame).val("");
                $("#desc",frame).val("");
                $("#coll",frame).val(a_parent?a_parent:"");
                $("#md",frame).val("");
                document.getElementById("dlg_coll_row").style.display = '';
                document.getElementById("dlg_md_row2").style.display = 'none';
            }

            if ( a_mode ){
                $("#md",frame).val("");
                document.getElementById("dlg_md_row").style.display = 'none';
            } else
                document.getElementById("dlg_md_row").style.display = '';
        }
    };


    frame.dialog( options );
}

function dlgStartTransfer( a_mode, a_data ) {
    var frame = $('#dlg_xfr');
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
                        inst.dialog( "close" );
                    } else {
                        alert( "Error: " + data );
                    }
                });
            }
        },{
            text: "Cancel",
            click: function() {
                $( this ).dialog( "close" );
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

function deleteSelected() {
    var item = $('#data_tree').fancytree('getTree').activeNode;
    var url = "/api/";
    var msg = "<div>Are you sure you want to delete ";

    if ( item.key[0] == "d" ) {
        msg += "data";
        url += "dat";
    } else {
        msg += "collection";
        url += "col";
    }

    msg += " ID " + item.key + "?<div>";

    $( msg ).dialog({
        title: "Confirm Deletion",
        modal: true,
        buttons: [
            {
                text: "Yes",
                click: function() {
                    var inst = $(this);
                    url += "/delete?id=" + item.key;
                    _asyncGet( url, null, function( ok, data ){
                        if ( ok ) {
                            inst.dialog( "close" );
                            deleteNode( item.key );
                        } else {
                            alert( "Delete failed: " + data );
                        }
                    });
                }
            },{
                text: "Cancel",
                click: function() {
                    $( this ).dialog( "close" );
                }
            }
        ]
    });
}

function newData() {
    var node = $('#data_tree').fancytree('getTree').activeNode;
    if ( node ) {
        if ( node.key[0] == "c" ) {
            viewColl( node.key, function( data ){
                var obj = data.data[0];
                dlgNewEdit(0,null,obj.alias?obj.alias:obj.id,function(data){
                    addNode( data );
                });
            }); 
        } else
            dlgNewEdit(0,null,null,function(data){
                addNode( data );
            });
    } else {
        dlgNewEdit(0,null,null,function(data){
            addNode( data );
        });
    }
}

function newColl() {
    var node = $('#data_tree').fancytree('getTree').activeNode;
    if ( node ) {
        if ( node.key[0] == "c" ) {
            viewColl( node.key, function( data ){
                var obj = data.data[0];
                dlgNewEdit(1,null,obj.alias?obj.alias:obj.id,function(data){
                    addNode( data );
                });
            }); 
        } else
            dlgNewEdit(1,null,null,function(data){
                addNode( data );
            });
    } else {
        dlgNewEdit(1,null,null,function(data){
            addNode( data );
        });
    }
}

function editSelected() {
    var node = $('#data_tree').fancytree('getTree').activeNode;
    if ( node ) {
        if ( node.key[0] == "c" ) {
            viewColl( node.key, function( data ){
                dlgNewEdit(1,data.data[0],null,function(data){
                    updateNodeTitle( data );
                });
            }); 
        } else if ( node.key[0] == "d" ) {
            viewData( node.key, function( data ){
                dlgNewEdit(0,data.data[0],null,function(data){
                    updateNodeTitle( data );
                });
            }); 
        }
    }
}

function shareSelected() {
    var node = $('#data_tree').fancytree('getTree').activeNode;
    if ( node ) {
        if ( node.key[0] == "c" ){
            viewColl( node.key, function( data ){
                dlgSetACLs( data.data[0] );
            });
        } else {
            viewData( node.key, function( data ){
                dlgSetACLs( data.data[0] );
            });
        }
    }
}

function dlgSetACLs( item ){
    var frame = $('#dlg_acl');
    var options = {
        title: "Sharing for " + (item.id[0]=="c"?"Collection ":"Data ") + item.id,
        modal: true,
        width: 400,
        height: 'auto',
        resizable: true,
        closeOnEscape: false,
        buttons: [{
            text: "Ok",
            click: function() {
                var inst = $(this);
                inst.dialog( "close" );
            }
        },{
            text: "Cancel",
            click: function() {
                $( this ).dialog( "close" );
            }
        }],
        open: function(event,ui){
            $("#dlg_acl_title",frame).html(item.title);


            var src = [
                {title:"Users",folder:true,children:[{title:"user1"}],key:"users"},
                {title:"Groups",folder:true,children:[{title:"group1"}],key:"groups"},
                {title:"Default",folder:false,key:"default"}
            ];
    
            $("#dlg_acl_tree",frame).fancytree({
                extensions: ["themeroller"],
                themeroller: {
                    activeClass: "ui-state-hover",
                    addClass: "",
                    focusClass: "",
                    hoverClass: "ui-state-active",
                    selectedClass: ""
                },
                source: src,
                selectMode: 1,
                activate: function( event, data ) {
                    //console.log("click",data.node );
                    //showSelectedInfo( data.node.key );
                },
            });

            $( "input", frame ).checkboxradio();
            //$( "select", frame ).selectmenu();
            /*
            $("#title",frame).val(a_data.title);
            $("#alias",frame).val(a_data.alias);
            $("#desc",frame).val(a_data.desc);
            $("#md",frame).val(a_data.metadata);
            document.getElementById("dlg_coll_row").style.display = 'none';
            if ( a_mode )
                document.getElementById("dlg_md_row2").style.display = 'none';
            else
                document.getElementById("dlg_md_row2").style.display = '';
            */
        }
    };

    frame.dialog( options );
}

function generateTitle( item ) {
    if ( item.alias )
        return "\"" + item.title + "\" (" + item.alias.substr(item.alias.indexOf(":") + 1) + ")";
    else
        return "\"" + item.title + "\" [" + item.id.substr(2) + "]";

    /*entry = { title: "<span style='display:inline-block;width:20ch'>" + item.id.substr(2) + (alias?" (" + alias + ")":" ") + "</span> \"" + item.title + "\"", folder: is_folder, key: item.id };*/
}

function addNode( item ){
    console.log( "addnode", item );
    // Get collections that this item belongs to
    getParents( item.id, function( ok, data ) {
        if ( ok ) {
            var tree = $("#data_tree").fancytree("getTree");
            var par = data.data;
            console.log( "parents", par );

            if ( par && par.length ) {
                var updnodes = [];
                tree.visit(function(node){
                    console.log( "visit", node );
                    if ( node.isFolder() ) {
                        console.log( "is folder" );
                        for ( var i in par ) {
                            if ( par[i].id == node.key ) {
                                updnodes.push( node );
                                break;
                            }
                        }
                    }
                });
                if ( updnodes.length ) {
                    var nodedat = {title: generateTitle( item ), key: item.id, folder:item.id[0]=="c"?true:false };
                    for ( var i in updnodes ) {
                        updnodes[i].addNode( nodedat );
                    }
                }
            } else {
                // No parents - loose data
                tree.rootNode.children[1].addNode({title: generateTitle( item ), ket: item.id });
            }
        }
    });
}

function updateNodeTitle( data ){
    console.log( "upnodetitle", data );
    var tree = $("#data_tree").fancytree("getTree");
    var title = generateTitle( data );

    tree.visit(function(node){
        if ( node.key == data.id )
            node.setTitle(title);
    });
}

function deleteNode( key ){
    var tree = $("#data_tree").fancytree("getTree");
    var inst = [];
    tree.visit(function(node){
        if ( node.key == key )
            inst.push( node );
    });

    for ( var i in inst ){
        inst[i].remove();
    }
}

function xfrSelected( a_mode ) {
    var key = $('#data_tree').fancytree('getTree').activeNode.key;

    if ( key[0] == "d" ) {
        viewData( key, function( data ){
            dlgStartTransfer( a_mode, data.data[0] );
        }); 
    }
}

function xfrHistoryPoll() {
    console.log( "poll xfr history" );
    if ( !g_user )
        return;

    _asyncGet( "/api/xfr/status", null, function( ok, data ){
        if ( ok ) {
            //console.log( "xfr status", data );
            if ( data.xfr && data.xfr.length ) {
                var len = data.xfr.length>5?5:data.xfr.length;
                var html = "<table class='info_table'><tr><th>Data ID</th><th>Mode</th><th>Path</th><th>Status</th></tr>";
                var stat;
                for ( var i = 0; i < len; i++ ) {
                    stat = data.xfr[i];
                    html += "<tr><td>" + stat.dataId + "</td><td>" + (stat.mode=="XM_GET"?"Download":"Upload") + "</td><td>" + stat.localPath + "</td><td>";
                    if ( stat.status == "XS_FAILED" )
                    html += "FAILED: " + stat.errMsg + "</td></tr>";
                    else
                        html += stat.status.substr(3) + "</td></tr>";
                }
                html += "</table>";
                $("#xfr_hist").html( html );
            } else {
                $("#xfr_hist").html("No transfer history");
            }
        }

        //pollTimer = setTimeout( xfrHistoryPoll, 5000 );
    });
}

function updateBtnState( state ){
    if ( state == undefined ) {
        console.log("undef");
        $(".btn.act-folder").button("option", "disabled", true);
        $(".btn.act-data").button("option", "disabled", true);
    } else if ( state == false ) {
        console.log("false");
        $(".btn.act-data").not(".act-folder").button("option", "disabled", true);
        $(".btn.act-folder").button("option", "disabled", false);
    } else {
        console.log("true");
        $(".btn.act-folder").button("option", "disabled", false);
        $(".btn.act-data").button("option", "disabled", false);
    }
}

function showSelectedInfo( key ){
    if ( key[0] == "c" && key != root_key ) {
        updateBtnState( false );
        viewColl( key, function( data ){
            var item = data.data[0];
            var html = "<table class='info_table'><col width='30%'><col width='70%'>";
            html += "<tr><td>Type:</td><td>Data Collection</td></tr>";
            html += "<tr><td>ID:</td><td>" + item.id + "</td></tr>";
            html += "<tr><td>Title:</td><td>" + item.title + "</td></tr>";
            html += "<tr><td>Alias:</td><td>" + (item.alias?item.alias:"(none)") + "</td></tr>";
            html += "<tr><td>Desc:</td><td>" + (item.desc?item.desc:"(none)") + "</td></tr>";
            html += "<tr><td>Owner:</td><td>" + (item.owner?item.owner:"n/a") + "</td></tr>";
            html += "</table>";
            $("#data_info").html(html);
        }); 
    } else if ( key[0] == "d" ) {
        updateBtnState( true );
        viewData( key, function( data ){
            var item = data.data[0];
            var html = "<table class='info_table'><col width='30%'><col width='70%'>";
            html += "<tr><td>Type:</td><td>Data Record</td></tr>";
            html += "<tr><td>ID:</td><td>" + item.id + "</td></tr>";
            html += "<tr><td>Title:</td><td>" + item.title + "</td></tr>";
            html += "<tr><td>Alias:</td><td>" + (item.alias?item.alias:"(none)") + "</td></tr>";
            html += "<tr><td>Desc:</td><td>" + (item.desc?item.desc:"(none)") + "</td></tr>";
            html += "<tr><td>Data Size (bytes):</td><td>" + (item.dataSize?item.dataSize:"n/a") + "</td></tr>";
            html += "<tr><td>Data Updated:</td><td>" + (item.dataTime?Date(item.dataTime*1000).toString():"n/a") + "</td></tr>";
            html += "<tr><td>Metadata:</td><td>" + (item.metadata?item.metadata:"(none)") + "</td></tr>";
            html += "<tr><td>Record Updated:</td><td>" + (item.recTime?Date(item.recTime*1000).toString():"n/a") + "</td></tr>";
            html += "<tr><td>Owner:</td><td>" + (item.owner?item.owner:"n/a") + "</td></tr>";
            html += "</table>";
            $("#data_info").html(html);
        }); 
    } else {
        updateBtnState();
        $("#data_info").html("");
    }
}

function setupDataTree(){
    var tree_source = [{title:"root",folder:true,lazy:true,key:root_key},
        {title:"Loose data",folder:true,lazy:true,key:"loose"}];

    $("#data_tree").fancytree({
        extensions: ["dnd","themeroller"],
        dnd:{
            dragStart: function(node, data) {
                if ( !drag_enabled || node.key == "loose" || node.key == root_key )
                    return false;

                if ( data.originalEvent.shiftKey ) {
                    drag_mode = 1;
                    return true;
                } else if ( data.originalEvent.ctrlKey ) {
                    return false;
                } else {
                    drag_mode = 0;
                    return true;
                }
            },
            dragDrop: function(node, data) {
                node.setExpanded(true).always(function(){
                    //console.log("drop in",node,data);

                    for ( var i in node.children ){
                        if ( node.children[i].key == data.otherNode.key )
                            return false;
                    }

                    if ( data.otherNode.parent.key == "loose" ){
                        linkItem( data.otherNode.key, node.key, function() {
                            data.otherNode.moveTo( node, data.hitMode );
                        });
                    } else if ( drag_mode || data.otherNode.isFolder() ){
                        linkItemUnlinkSource( data.otherNode.key, node.key, node.parent.key, function() {
                            data.otherNode.moveTo( node, data.hitMode );
                        });
                    }else{
                        linkItem( data.otherNode.key, node.key, function() {
                            data.otherNode.copyTo( node, data.hitMode );
                        });
                    }
                });
            },
            dragEnter: function(node, data) {
                if ( node.isFolder() && node.key != "loose" )
                    return "over";
                else
                    return false;
            }
        },
        themeroller: {
            activeClass: "ui-state-hover",
            addClass: "",
            focusClass: "",
            hoverClass: "ui-state-active",
            selectedClass: ""
        },
        source: tree_source,
        selectMode: 1,
        lazyLoad: function( event, data ) {
            if ( data.node.key == "loose" ) {
                data.result = {
                    url: "/api/dat/list",
                    cache: false
                };
            } else {
                data.result = {
                    url: "/api/col/read?id=" + data.node.key,
                    cache: false
                };
            }
        },
        postProcess: function( event, data ) {
            console.log( "pos proc:", data );
            if ( data.node.parent ) {
                data.result = [];
                var item;
                var folder;
                var entry;
                for ( var i in data.response.data ) {
                    item = data.response.data[i];
                    is_folder = item.id[0]=="c"?true:false;

                    entry = { title: generateTitle( item ), folder: is_folder, key: item.id };
                    if ( is_folder )
                        entry.lazy = true;
                    data.result.push( entry );
                }
            }
        },
        activate: function( event, data ) {
            //console.log("click",data.node );
            //data.node.setSelected(true);
            showSelectedInfo( data.node.key );
        },
        /*select: function(event, data){
            console.log("select",data.node.isSelected(),data.node.data);
        },*/
        click: function(event, data) {
            if ( drag_enabled && data.originalEvent.ctrlKey && data.node.parent.key != "loose" ) {
                if ( data.node.isFolder() ){
                    if ( data.node.key != "loose" && data.node.key != root_key && data.node.parent.key != root_key ){
                        //console.log("move to root",data.node );
                        linkItemUnlinkSource( data.node.key, "root", data.node.parent.key, function() {
                            data.node.moveTo( data.node.getParentList()[0], "over" );
                        });
                    }
                } else {
                    //console.log("unlink",data.node );
                    unlinkItem( data.node.key, data.node.parent.key, function() {
                        data.node.remove();
                    });
                }
            }
        }
    });
}

var pollTimer = setTimeout( xfrHistoryPoll, 1000 );

function test() {
    console.log("testing...");
    _asyncGet( "/ui/test", null, function( ok, data ){
        if ( ok ) {
            console.log("test ok, data:", data, typeof data );
        }
        else {
            console.log("test failed:", data );
        }
    });
}

console.log( "main.js loaded");