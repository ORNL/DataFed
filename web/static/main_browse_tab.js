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

    confirmChoice( "Confirm Deletion", msg, ["Yes","Cancel"], function( choice ){
        if ( choice == 0 ){
            var inst = $(this);
            url += "/delete?id=" + item.key;
            _asyncGet( url, null, function( ok, data ){
                if ( ok ) {
                    deleteNode( item.key );
                } else {
                    alert( "Delete failed: " + data );
                }
            });
        }
    });
}

function newData() {
    var node = $('#data_tree').fancytree('getTree').activeNode;
    if ( node && node.key[0] == "c" ) {
        viewColl( node.key, function( data ){
            var coll = data.data[0];
            var coll_id = coll.id;
            if ( coll.alias ){
                if ( coll.owner != g_user.uid )
                    coll_id = coll.owner + ":" + coll.alias;
                else
                    coll_id = coll.alias;
            }

            dlgNewEdit(0,null,coll_id,coll.owner,function(data){
                addNode( data );
            });
        }); 
    } /*else {
        dlgNewEdit(0,null,null,function(data){
            addNode( data );
        });
    }*/
}

function newColl() {
    var node = $('#data_tree').fancytree('getTree').activeNode;
    if ( node && node.key[0] == "c" ) {
        viewColl( node.key, function( data ){
            var coll = data.data[0];
            var coll_id = coll.id;
            if ( coll.alias ){
                if ( coll.owner != g_user.uid )
                    coll_id = coll.owner + ":" + coll.alias;
                else
                    coll_id = coll.alias;
            }
            dlgNewEdit(1,null,coll_id,coll.owner,function(data){
                addNode( data );
            });
        }); 
    }/* else {
        dlgNewEdit(1,null,null,function(data){
            addNode( data );
        });
    }*/
}

function editSelected() {
    var node = $('#data_tree').fancytree('getTree').activeNode;
    if ( node ) {
        if ( node.key[0] == "c" ) {
            viewColl( node.key, function( data ){
                dlgNewEdit(1,data.data[0],null,null,function(data){
                    updateNodeTitle( data );
                });
            }); 
        } else if ( node.key[0] == "d" ) {
            viewData( node.key, function( data ){
                dlgNewEdit(0,data.data[0],null,null,function(data){
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
                dlgSetACLs.show( data.data[0] );
            });
        } else {
            viewData( node.key, function( data ){
                dlgSetACLs.show( data.data[0] );
            });
        }
    }
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

function updateBtnState( state ){
    if ( state == "c" ) {
        $(".btn.act-data").not(".act-folder").button("option", "disabled", true);
        $(".btn.act-folder").button("option", "disabled", false);
    } else if ( state == "d" ) {
        $(".btn.act-folder").button("option", "disabled", true);
        $(".btn.act-data").button("option", "disabled", false);
    } else if ( state == "r" ) {
        $(".btn.act-folder").button("option", "disabled", true);
        $(".btn.act-data").button("option", "disabled", true);
        $(".btn.act-root").button("option", "disabled", false);
    } else {
        $(".btn.act-folder").button("option", "disabled", true);
        $(".btn.act-data").button("option", "disabled", true);
    }

}

function showSelectedInfo( key ){
    if ( key[0] == "c" /*&& key != root_key*/ ) {
        //if ( key == root_key )
        if ( key.endsWith( "_root" ))
            updateBtnState( "r" );
        else
            updateBtnState( "c" );
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
        updateBtnState( "d" );
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

function addNode( item ){
    console.log( "addnode", item );
    // Get collections that this item belongs to
    getParents( item.id, function( ok, data ) {
        if ( ok ) {
            var tree = $("#data_tree").fancytree("getTree");
            var par = data.data;
            var scope;

            if ( par && par.length ) {
                var updnodes = [];
                tree.visit(function(node){
                    if ( node.isFolder() ) {
                        for ( var i in par ) {
                            if ( par[i].id == node.key ) {
                                updnodes.push( node );
                                scope = node.data.scope;
                                break;
                            }
                        }
                    }
                });
                if ( updnodes.length ) {
                    var nodedat = {title: generateTitle( item ), key: item.id, folder:item.id[0]=="c"?true:false, scope: scope };
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

function generateTitle( item ) {
    if ( item.alias )
        return "\"" + item.title + "\" (" + item.alias.substr(item.alias.indexOf(":") + 1) + ")";
    else
        return "\"" + item.title + "\" [" + item.id.substr(2) + "]";

    /*entry = { title: "<span style='display:inline-block;width:20ch'>" + item.id.substr(2) + (alias?" (" + alias + ")":" ") + "</span> \"" + item.title + "\"", folder: is_folder, key: item.id };*/
}

function setupBrowseTab(){
    var tree_source = [
        {title:"My Data",folder:true,lazy:true,key: "c/" + g_user.uid + "_root", scope: g_user.uid },
        {title:"My Projects",folder:true,lazy:true,key:"myproj"},
        {title:"Shares",folder:true,lazy:true },
        {title:"Views",folder:true,lazy:true }
    ];

    $("#data_tree").fancytree({
        extensions: ["dnd","themeroller"],
        dnd:{
            dragStart: function(node, data) {
                //if ( !drag_enabled || node.key == "loose" || node.key == root_key )
                if ( !drag_enabled || node.key.endsWith("_root"))
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
                console.log( "enter:", node, data );
                //if ( node.isFolder() && node.key != "loose" )
                if ( node.isFolder() && node.data.scope == data.otherNode.data.scope )
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
            if ( data.node.key == "myproj" ){
                data.result = {
                    url: "/api/prj/list/",
                    cache: false
                };
            } /*else if ( data.node.key == "prjbyadm" ){
                data.result = {
                    url: "/api/prj/list/by_admin",
                    cache: false
                };
            } else if ( data.node.key == "prjbymem" ){
                data.result = {
                    url: "/api/prj/list/by_member",
                    cache: false
                };
            } else if ( data.node.key == "loose" ) {
                data.result = {
                    url: "/api/dat/list",
                    cache: false
                };
            }*/else {
                data.result = {
                    url: "/api/col/read?id=" + data.node.key,
                    cache: false
                };
            }
        },
        postProcess: function( event, data ) {
            console.log( "pos proc:", data );
            if ( data.node.key == "myproj" ){
                data.result = [];
                if ( data.response.length ){
                    var item;
                    for ( var i in data.response ) {
                        item = data.response[i];
                        data.result.push({ title: item.title + " (" + item.id + ")", folder: true, key: "c/"+item.id+"_root", scope: item.id, lazy: true });
                    }
                }else{
                    data.result.push({ title: "(none)", icon: false  });
                }
            } else if ( data.node.parent ) {
                data.result = [];
                var item;
                var folder;
                var entry;
                var scope = data.node.data.scope;

                for ( var i in data.response.data ) {
                    item = data.response.data[i];
                    is_folder = item.id[0]=="c"?true:false;

                    entry = { title: generateTitle( item ), folder: is_folder, scope: scope, key: item.id };
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
            // TODO Revisit unlink feature
            if ( drag_enabled && data.originalEvent.ctrlKey ) {
                if ( data.node.isFolder() ){
                    //if ( data.node.key != "loose" && data.node.key != root_key && data.node.parent.key != root_key ){
                        //console.log("move to root",data.node );
                        linkItemUnlinkSource( data.node.key, "root", data.node.parent.key, function() {
                            data.node.moveTo( data.node.getParentList()[0], "over" );
                        });
                    //}
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
