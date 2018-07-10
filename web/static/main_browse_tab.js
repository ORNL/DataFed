var data_md_tree;
var data_md_empty = true;
var data_md_empty_src = [{title:"(none)", icon:false}];
var data_md_cur = {};
var data_md_exp = {};
var xfrHist = [];
var pollSince = 24*3600; // First poll = 24 hours =  sec
var pollTimer;
var my_root_key;

function deleteSelected() {
    var node = $('#data_tree').fancytree('getTree').activeNode;
    var url = "/api/";
    var msg = "<div>Are you sure you want to delete ";
    var id;

    if ( node.data.isproj ){
        msg += "project";
        url += "prj";
        id = node.data.scope;
    }else if( node.key[0] == "d" ) {
        msg += "data";
        url += "dat";
        id = node.key;
    }else{
        msg += "collection";
        url += "col";
        id = node.key;
    }

    msg += " ID " + id + "?<div>";

    confirmChoice( "Confirm Deletion", msg, ["Yes","Cancel"], function( choice ){
        if ( choice == 0 ){
            var inst = $(this);
            url += "/delete?id=" + id;
            _asyncGet( url, null, function( ok, data ){
                if ( ok ) {
                    deleteNode( node.key );
                } else {
                    alert( "Delete failed: " + data );
                }
            });
        }
    });
}

function newProj() {
    dlgNewEditProj(null,function(data){
        addNode( data );
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

            dlgNewEdit(0,null,coll_id,function(data){
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
            dlgNewEdit(1,null,coll_id,function(data){
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
        console.log( "edit sel", node, node.data.isproj );
        if ( node.data.isproj ){
            viewProj( node.data.scope, function( data ){
                dlgNewEditProj(data[0],null,function(data){
                    //updateNodeTitle( data );
                });
            });
        }else if ( node.key[0] == "c" ) {
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

function updateBtnState( state, admin ){
    console.log("updBtn",state,admin);
    if ( state == "c" ) {
        $("#btn_new_data").button("option","disabled",false);
        $("#btn_new_coll").button("option","disabled",false);
        $("#btn_edit").button("option","disabled",false);
        $("#btn_del").button("option","disabled",false);
        $("#btn_share").button("option","disabled",false);
        $("#btn_upload").button("option","disabled",true);
        $("#btn_download").button("option","disabled",true);
    } else if ( state == "d" ) {
        $("#btn_new_data").button("option","disabled",true);
        $("#btn_new_coll").button("option","disabled",true);
        $("#btn_edit").button("option","disabled",false);
        $("#btn_del").button("option","disabled",false);
        $("#btn_share").button("option","disabled",false);
        $("#btn_upload").button("option","disabled",false);
        $("#btn_download").button("option","disabled",false);
    } else if ( state == "r" ) {
        $("#btn_new_data").button("option","disabled",false);
        $("#btn_new_coll").button("option","disabled",false);
        $("#btn_edit").button("option","disabled",true);
        $("#btn_del").button("option","disabled",true);
        $("#btn_share").button("option","disabled",!admin);
        $("#btn_upload").button("option","disabled",true);
        $("#btn_download").button("option","disabled",true);
    } else if ( state == "p" ) {
        $("#btn_new_data").button("option","disabled",true);
        $("#btn_new_coll").button("option","disabled",true);
        $("#btn_edit").button("option","disabled",!admin);
        $("#btn_del").button("option","disabled",!admin);
        $("#btn_share").button("option","disabled",true);
        $("#btn_upload").button("option","disabled",true);
        $("#btn_download").button("option","disabled",true);
    } else {
        $("#btn_new_data").button("option","disabled",true);
        $("#btn_new_coll").button("option","disabled",true);
        $("#btn_edit").button("option","disabled",true);
        $("#btn_del").button("option","disabled",true);
        $("#btn_share").button("option","disabled",true);
        $("#btn_upload").button("option","disabled",true);
        $("#btn_download").button("option","disabled",true);
    }

}

function showSelectedInfo( node ){
    if ( !node ){
        updateBtnState();
        $("#data_info").html("(no information available)<br><br><br>");
        showSelectedMetadata();
    }else{
        if ( node.key[0] == "c" /*&& key != root_key*/ ) {
            //if ( node.key == my_root_key )
            if ( node.data.isroot )
                updateBtnState( "r", node.data.admin );
            else
                updateBtnState( "c" );
            viewColl( node.key, function( data ){
                var item = data.data[0];
                var html = "Collection, ID: " + item.id + (item.alias?", Alias: " + item.alias:"");
                $("#data_ident").html( html );

                html = "\"" + item.title + "\"<br>";
                if ( item.desc )
                    html += "<p>\"" + item.desc + "\"</p>";
                else
                    html += "<br>";

                html += "<table class='info_table'><col width='30%'><col width='70%'>";
                html += "<tr><th>Field</th><th>Value</th></tr>";
                html += "<tr><td>Public Access:</td><td>" + (item.ispublic?"Enabled":"Disabled") + "</td></tr>";
                html += "<tr><td>Owner:</td><td>" + item.owner.substr(2) + (item.owner[0]=="p"?" (project)":"") + "</td></tr>";
                html += "</table>";
                $("#data_info").html(html);
                showSelectedMetadata();
            }); 
        } else if ( node.key[0] == "d" ) {
            updateBtnState( "d" );
            viewData( node.key, function( data ){
                var item = data.data[0];
                var html = "Data Record, ID: " + item.id + (item.alias?", Alias: " + item.alias:"");
                $("#data_ident").html( html );

                var html = "\"" + item.title + "\"<br>";
                if ( item.desc )
                    html += "<p>\"" + item.desc + "\"</p>";
                else
                    html += "<br>";

                html += "<table class='info_table'><col width='30%'><col width='70%'>";
                html += "<tr><th>Field</th><th>Value</th></tr>";
                html += "<tr><td>Public Access:</td><td>" + (item.ispublic?"Enabled":"Disabled") + "</td></tr>";
                html += "<tr><td>Data Size (bytes):</td><td>" + (item.dataSize?item.dataSize:"n/a") + "</td></tr>";
                html += "<tr><td>Data Updated:</td><td>" + (item.dataTime?Date(item.dataTime*1000).toString():"n/a") + "</td></tr>";
                html += "<tr><td>Record Updated:</td><td>" + (item.recTime?Date(item.recTime*1000).toString():"n/a") + "</td></tr>";
                html += "<tr><td>Owner:</td><td>" + item.owner.substr(2) + (item.owner[0]=="p"?" (project)":"") + "</td></tr>";
                html += "</table>";
                $("#data_info").html(html);
                showSelectedMetadata( item.metadata );
            }); 
        } else if ( node.key.startsWith("p/") ) {
            viewProj( node.key, function( data ){
                var item = data[0];
                updateBtnState("p",node.data.admin);
                var html = "Project, ID: " + item.id;
                $("#data_ident").html( html );

                var html = "\"" + item.title + "\"<br>";
                if ( item.desc )
                    html += "<p>\"" + item.desc + "\"</p>";
                else
                    html += "<br>";

                html += "<table class='info_table'><col width='30%'><col width='70%'>";
                html += "<tr><th>Field</th><th>Value</th></tr>";
                html += "<tr><td>Domain:</td><td>" + item.domain + "</td></tr>";
                html += "<tr><td>Repo:</td><td>" + item.repo + "</td></tr>";
                html += "<tr><td>Owner:</td><td>" + item.owner.substr(2) + "</td></tr>";
                html += "<tr><td>Admins:</td><td>";
                if ( item.admin && item.admin.length ){
                    for ( var i in item.admin )
                        html += item.admin[i].substr(2) + " ";
                }else{
                    html += "(none)";
                }
                html += "</td></tr>";
                html += "<tr><td>Members:</td><td>";
                if ( item.member && item.member.length ){
                    for ( var i in item.member )
                        html += item.member[i].substr(2) + " ";
                }else{
                    html += "(none)";
                }
                html += "</td></tr>";
                html += "</table>";
                $("#data_info").html(html);
                showSelectedMetadata( item.metadata );
            }); 
        } else {
            updateBtnState();
            $("#data_ident").html( "" );
            $("#data_info").html("(no information available)<br><br><br>");
            showSelectedMetadata();
        }
    }
}

function buildObjSrcTree( obj, base ){
    console.log("build", base);

    var src = [];
    var fkey;
    Object.keys(obj).forEach(function(k) {
        //console.log(key,typeof md[key]);

        if ( typeof obj[k] === 'object' ){
            fkey=base+"."+k;
            //console.log( fkey, "=", data_md_exp[fkey] );
            if ( data_md_exp[fkey] ){
                data_md_exp[fkey] = 10;
            }
            src.push({title:k, icon: true, folder: true, expanded: data_md_exp[fkey]?true:false, children: buildObjSrcTree(obj[k],fkey)})
        }else if ( typeof obj[k] === 'string' )
            src.push({title:k + " : \"" + obj[k] + "\"", icon: false })
        else
            src.push({title:k + " : " + obj[k], icon: false })
    });

    return src;
}

function showSelectedMetadata( md_str )
{
    if ( md_str ){
        for ( var i in data_md_exp ){
            if ( data_md_exp[i] == 1 )
                delete data_md_exp[i];
            else
                data_md_exp[i]--;
        }

        console.log( "exp st", data_md_exp );
        // TODO Use data_md_tree.isExapnded() to do lazy loading in case user's don't want to see metadata
        var md = JSON.parse( md_str );
        if ( data_md_exp["md"] )
            data_md_exp["md"] = 10;
        var src = [{title:"md", icon: true, folder: true, expanded: data_md_exp["md"]?true:false, children: buildObjSrcTree(md,"md")}];

        //console.log("md:",md);
        //console.log("keys:",Object.keys(md));
        //for ( var p in md ) {
            //if ( md.hasOwnProperty( p )) {

        data_md_tree.reload( src );
        data_md_empty = false;
    } else if ( !data_md_empty ) {
        data_md_tree.reload(data_md_empty_src);
        data_md_empty = true;
    }
}

function addNode( item ){
    console.log( "addnode", item );
    var tree = $("#data_tree").fancytree("getTree");

    if ( item.id.startsWith("p/")){
        // Projects can only be added to "my projects"
        var node = tree.getNodeByKey("proj_adm");
        if ( node ){
            var prj_id = item.id.substr(2);
            node.addNode({ extraClasses:"project", title: item.title + " (" + prj_id + ")",icon:true, folder: true, key: "p/"+prj_id,scope:prj_id,isproj:true,admin:admin,nodrag:true,children:[
                {title: "Root Collection",icon:true,folder:true,lazy:true,key:"c/"+prj_id+"_root",scope:prj_id,isroot:true,admin:true,nodrag:true}
            ]});

            //node.addNode({ extraClasses:"project", title: item.title + " (" + prj_id + ")",icon:true, folder: true, key: "c/"+prj_id+"_root",scope:prj_id,isproj:true,admin:true,lazy:true,nodrag:true});
        }
    }else{
        // Data and/or collections
        // Get collections that this item belongs to
        getParents( item.id, function( ok, data ) {
            if ( ok ) {
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
}

function execQuery(){
    var query = $("#query_input").val();
    var scope = $("#query_scope").val();

    console.log( "query:", query, scope );

    setStatusText("Executing search query...");
    findData( query, scope, function( ok, data ){
        //console.log( "qry res:", ok, data );

        var tree = $("#data_tree").fancytree("getTree");
        var srch_node = tree.getNodeByKey("search");
        var results = [];
        if ( data.data && data.data.length > 0 ){
            setStatusText( "Found " + data.data.length + " result" + (data.data.length==1?"":"s"));
            for ( var i in data.data ){
                var item = data.data[i];
                results.push({title: generateTitle( item ), icon:false, key: item.id, nodrag: true });
            }
        } else {
            setStatusText("No results found");
            results.push({title:"(no results)",icon:false, nodrag: true});
        }
        srch_node.removeChildren();
        srch_node.addChildren( results );
        srch_node.setExpanded( true );

        if ( !tree.activeNode )
            showSelectedInfo();
    });
}

function generateTitle( item ) {
    if ( item.alias )
        return "\"" + item.title + "\" (" + item.alias.substr(item.alias.indexOf(":") + 1) + ")";
    else
        return "\"" + item.title + "\" [" + item.id.substr(2) + "]";

    /*entry = { title: "<span style='display:inline-block;width:20ch'>" + item.id.substr(2) + (alias?" (" + alias + ")":" ") + "</span> \"" + item.title + "\"", folder: is_folder, key: item.id };*/
}

function xfrUpdateHistory( xfr_list ){
    var len = xfr_list.length;
    var html;
    if ( len == 0 ){
        html = "(no recent transfers)";
    }else{
        html = "<table class='info_table'><tr><th>Data ID</th><th>Mode</th><th>Path</th><th>Started</th><th>Status Updated</th><th>Status</th></tr>";
        var stat;
        var start = new Date(0);
        var update = new Date(0);
        var options = { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: 'numeric' };

        for ( var i = 0; i < len; i++ ) {
            stat = xfr_list[i];
            html += "<tr><td>" + stat.dataId + "</td><td>" + (stat.mode=="XM_GET"?"Download":"Upload") + "</td><td>" + stat.localPath + "</td>";
            start.setTime( stat.started*1000 );
            update.setTime( stat.updated*1000 );
            html += "<td>" + start.toLocaleDateString("en-US", options) + "</td><td>" + update.toLocaleDateString("en-US", options) + "</td><td>";

            if ( stat.status == "XS_FAILED" )
                html += "FAILED: " + stat.errMsg + "</td></tr>";
            else
                html += stat.status.substr(3) + "</td></tr>";
        }
        html += "</table>";
    }
    $("#xfr_hist").html( html );
}

function xfrHistoryPoll() {
    if ( !g_user )
        return;

    _asyncGet( "/api/xfr/list" + (pollSince?"?since="+pollSince:""), null, function( ok, data ){
        if ( ok ) {
            if ( data.xfr && data.xfr.length ) {
                // Find and remove any previous entries
                for ( var i in data.xfr ){
                    var xfr = data.xfr[i];
                    for ( var j in xfrHist ){
                        if ( xfrHist[i].id == xfr.id ){
                            xfrHist.splice(i,1);
                            break;
                        }
                    }
                }
                xfrHist = data.xfr.concat( xfrHist );
            }
            xfrUpdateHistory( xfrHist );
        }
        pollSince = 10;
        pollTimer = setTimeout( xfrHistoryPoll, 1000*(pollSince-1));
    });
}

function setupBrowseTab(){
    my_root_key = "c/" + g_user.uid + "_root";

    var tree_source = [
        {title:"My Data",folder:true,icon:false,lazy:true,key:my_root_key,user:g_user.uid,scope:g_user.uid,nodrag:true,isroot:true,admin:true},
        {title:"My Projects",folder:true,icon:false,nodrag:true,lazy:true,key:"proj_adm"},
        {title:"Team Projects",folder:true,icon:false,nodrag:true,lazy:true,key:"proj_mem"},
        {title:"Shared Data",folder:true,icon:false,lazy:true,nodrag:true,key:"shared"},
        {title:"Favorites",folder:true,icon:false,lazy:true,nodrag:true,key:"favorites"},
        {title:"Views",folder:true,icon:false,lazy:true,nodrag:true,key:"views"},
        {title:"Search Results",icon:false,folder:true,children:[{title:"(empty)",icon:false, nodrag: true}],key:"search", nodrag: true },
    ];

    $("#data_tree").fancytree({
        extensions: ["dnd","themeroller"],
        dnd:{
            dragStart: function(node, data) {
                //if ( !drag_enabled || node.key == "loose" || node.key == root_key )
                if ( !drag_enabled || node.data.nodrag )
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
                if ( node.isFolder() && !node.data.notarg && node.data.scope == data.otherNode.data.scope )
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
            if ( data.node.key == "proj_adm" ){
                data.result = {
                    url: "/api/prj/list?owner=true&admin=true",
                    cache: false
                };
            } else if ( data.node.key == "proj_mem" ){
                data.result = {
                    url: "/api/prj/list?member=true",
                    cache: false
                };
            } else if ( data.node.key == "public" ) {
                data.result = {
                    url: "/api/dat/list/public?uid=" + data.node.data.scope,
                    cache: false
                };
            } else if ( data.node.key == "shared" ) {
                if ( data.node.data.scope ){
                    data.result = {
                        url: "/api/acl/by_user/list?owner=" + data.node.data.scope,
                        cache: false
                    };
                }else{
                    data.result = {
                        url: "/api/acl/by_user",
                        cache: false
                    };
                }
            } else if ( data.node.key == "favorites" || data.node.key == "views" ) {
                data.result = [{title:"(not implemented yet)", icon:false}];
            } else {
                data.result = {
                    url: "/api/col/read?id=" + data.node.key,
                    cache: false
                };
            }
        },
        postProcess: function( event, data ) {
            //console.log( "pos proc:", data );
            if ( data.node.key == "proj_adm" || data.node.key == "proj_mem" ){
                data.result = [];
                if ( data.response.length ){
                    var item;
                    var admin = (data.node.key=="proj_adm"?true:false);
                    var prj_id;

                    for ( var i in data.response ) {
                        item = data.response[i];
                        prj_id = item.id.substr(2);
                        data.result.push({ extraClasses:"project", title: item.title + " (" + prj_id + ")",icon:true, folder: true, key: "p/"+prj_id,scope:prj_id,isproj:true,admin:admin,nodrag:true,children:[
                            {title: "Root Collection",icon:true,folder:true,lazy:true,key:"c/"+prj_id+"_root",scope:prj_id,isroot:true,admin:admin,nodrag:true}
                        ]});
                    }
                }else{
                    data.result.push({ title: "(none)", icon: false, nodrag:true });
                }
            } else if ( data.node.key == "shared" && !data.node.data.scope ){
                data.result = [];
                if ( data.response.length ){
                    var item;
                    for ( var i in data.response ) {
                        item = data.response[i];
                        data.result.push({ title: item.name + " (" + item.uid + ")",icon:false,folder:true,key:"shared",scope:item.uid,lazy:true,nodrag:true});
                    }
                }else{
                    data.result.push({ title: "(none)", icon: false, nodrag:true });
                }
            } else if ( data.node.key == "favorites" || data.node.key == "views" ) {
                // Not implemented yet
            } else if ( data.node.parent ) {
                data.result = [];
                var item;
                var folder;
                var entry;
                var scope = data.node.data.scope;
                var nodrag = false;

                //if ( data.node.key.endsWith("_root") ){
                if ( data.node.data.isroot ){
                        data.result.push({title:"[Public Access Data]",folder:true,icon:false,lazy:true,key:"public",scope:scope,nodrag:true,notarg:true});
                } else if ( data.node.key == "public" )
                    nodrag = true;

                for ( var i in data.response.data ) {
                    item = data.response.data[i];
                    is_folder = item.id[0]=="c"?true:false;

                    entry = { title: generateTitle( item ), folder: is_folder, scope: scope, key: item.id };
                    if ( is_folder )
                        entry.lazy = true;
                    if ( nodrag )
                        entry.nodrag = true;
                    data.result.push( entry );
                }
            }
        },
        activate: function( event, data ) {
            showSelectedInfo( data.node );
        },
        click: function(event, data) {
            if ( drag_enabled && data.originalEvent.ctrlKey ) {
                unlinkItem( data.node.key, data.node.parent.key, function( ok, rooted ) {
                    if ( ok ){
                        if ( rooted.length == 0 )
                            data.node.remove();
                        else{
                            // Don't care about what's in rooted array - only one item unlinked at a time here
                            var plist = data.node.getParentList();
                            //console.log( plist );
                            var parent;
                            for ( i in plist ){
                                if ( plist[i].data.scope ){
                                    parent = plist[i];
                                    break;
                                }
                            }
                            console.log( "rooted:", rooted, "parent:",parent );
                            data.node.moveTo( parent, "over" );
                        }
                    }
                });
            }
        }
    });

    $("#data_md_tree").fancytree({
        extensions: ["themeroller"],
        themeroller: {
            activeClass: "ui-state-hover",
            addClass: "",
            focusClass: "",
            hoverClass: "ui-state-active",
            selectedClass: ""
        },
        source: data_md_empty_src,
        selectMode: 1,
        beforeExpand: function(event,data){
            var path = data.node.title;
            var par = data.node.parent;
            while ( par ){
                if ( par.title == "root" && !par.parent )
                    break;
                path = par.title + "." + path;
                par = par.parent;
            }

            if ( data.node.isExpanded() ){
                //console.log("collapsed", data.node, path );
                delete data_md_exp[path];
            }else{
                //console.log("expanded", data.node, path );
                data_md_exp[path] = 10;
            }
            //console.log( "exp st", data_md_exp );
        }
    });

    data_md_tree = $("#data_md_tree").fancytree("getTree");

    $("#query_input").on('keyup', function (e) {
        if (e.keyCode == 13)
            execQuery();
    });
    $("#query_scope").selectmenu({
        width:"auto"
    });

    $("#xfr_panel").accordion({collapsible:true,heightStyle:"content"});

    showSelectedInfo();

    pollTimer = setTimeout( xfrHistoryPoll, 1000 );
}
