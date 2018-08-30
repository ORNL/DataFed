function makeBrowserTab(){
    console.log("making browser tab");

    var inst = this;

    inst.frame = $("#content");
    //inst.frame = $("#tab-browse");
    inst.data_ident = $("#data_ident",inst.frame);
    inst.data_info = $("#data_info",inst.frame);
    this.xfr_hist = $("#xfr_hist",inst.frame);
    this.alloc_stat = $("#alloc_stat",inst.frame);
    this.data_tree = null;
    this.data_md_tree = null;
    this.data_md_empty = true;
    this.data_md_empty_src = [{title:"(none)", icon:false}];
    //this.data_md_cur = {};
    this.data_md_exp = {};
    this.xfrHist = [];
    this.pollSince = 24*3600; // First poll = 24 hours =  sec
    this.my_root_key = "c/" + g_user.uid + "_root";
    this.drag_mode = 0;
    this.drag_enabled = true;

    this.deleteSelected = function(){
        var node = inst.data_tree.activeNode;
        hasPerms( node.key, PERM_ADMIN, function( perms ){
            if (( perms & PERM_ADMIN ) == 0 ){
                dlgAlert( "Cannot Perform Action", "Permission Denied." );
                return;
            }

            var msg,msg = "<div>Are you sure you want to delete ";

            if ( node.key[0] == "c" ) {
                msg += "collection ID " + node.key + "?<p>Choose the 'ALL' option to delete <i>ALL</i> sub-collections and data, or the 'OWNED' option to delete all sub-collections and any data that is NOT linked to other independent collections.</p><div>";

                confirmChoice( "Confirm Deletion", msg, ["All","OWNED","Cancel"], function( choice ){
                    console.log( "choice:",choice);
                    if ( choice != 2 ){
                        url = "/api/col/delete?id=" + encodeURIComponent(node.key) + "&mode=" + (choice==0?"all":"owned");
                        console.log( url);
                        _asyncGet( url, null, function( ok, data ){
                            if ( ok ) {
                                inst.deleteNode( node.key );
                                inst.updateBtnState();
                            } else {
                                alert( "Delete failed: " + data );
                            }
                        });
                    }
                });
            }else{
                var url = "/api/";

                if ( node.data.isproj ){
                    msg += "project ID " + node.key + "? This will delete <i>ALL</i> data and collections owned by the project.<div>";
                    url += "prj";
                } else {
                    msg += "data ID " + node.key + "?<div>";
                    url += "dat";
                }

                confirmChoice( "Confirm Deletion", msg, ["Delete","Cancel"], function( choice ){
                    if ( choice == 0 ){
                        url += "/delete?id=" + encodeURIComponent(node.key);
                        _asyncGet( url, null, function( ok, data ){
                            if ( ok ) {
                                inst.deleteNode( node.key );
                                inst.updateBtnState();
                            } else {
                                alert( "Delete failed: " + data );
                            }
                        });
                    }
                });
            }
        });
    }

    this.newProj = function() {
        dlgProjNewEdit(null,function(data){
            inst.addNode( data );
        });
    }

    this.newData = function() {
        var node = inst.data_tree.activeNode;
        if ( node && node.key[0] == "c" ) {
            hasPerms( node.key, PERM_CREATE, function( perms ){
                if (( perms & PERM_CREATE ) == 0 ){
                    dlgAlert( "Cannot Perform Action", "Permission Denied." );
                    return;
                }

                viewColl( node.key, function( coll ){
                    if ( coll ){
                        var coll_id = coll.alias?coll.alias:coll.id;

                        dlgDataNewEdit(0,null,coll_id,function(data){
                            inst.addNode( data );
                        });
                    }else
                        alert("Cannot access parent collection.");
                });
            });
        }
    }

    this.newColl = function() {
        var node = inst.data_tree.activeNode;
        if ( node && node.key[0] == "c" ) {
            hasPerms( node.key, PERM_CREATE, function( perms ){
                if (( perms & PERM_CREATE ) == 0 ){
                    dlgAlert( "Cannot Perform Action", "Permission Denied." );
                    return;
                }

                viewColl( node.key, function( coll ){
                    if ( coll ){
                        var coll_id = coll.alias?coll.alias:coll.id;

                        dlgDataNewEdit(1,null,coll_id,function(data){
                            inst.addNode( data );
                        });
                    }else
                        alert("Cannot access parent collection.");
                });
            });
        }
    }

    this.editSelected = function() {
        var node = inst.data_tree.activeNode;
        if ( node ) {
            //console.log( "edit sel", node, node.data.isproj );
            hasPerms( node.key, PERM_UPDATE, function( perms ){
                if (( perms & PERM_UPDATE ) == 0 ){
                    dlgAlert( "Cannot Perform Action", "Permission Denied." );
                    return;
                }

                if ( node.data.isproj ){
                    viewProj( node.key, function( data ){
                        if ( data ){
                            dlgProjNewEdit(data,function(data){
                                console.log("edit proj cb:",data);
                                inst.updateNodeTitle( data );
                            });
                        }else
                            alert( "Cannot access project." );
                    });
                }else if ( node.key[0] == "c" ) {
                    viewColl( node.key, function( data ){
                        if ( data ){
                            dlgDataNewEdit(1,data,null,function(data){
                                inst.updateNodeTitle( data );
                            });
                        }else
                            alert( "Cannot access collection." );
                    });
                } else if ( node.key[0] == "d" ) {
                    viewData( node.key, function( data ){
                        if ( data ){
                            dlgDataNewEdit(0,data,null,function(data){
                                inst.updateNodeTitle( data );
                            });
                        }else
                            alert( "Cannot access data record." );
                    }); 
                }
            });
        }
    }

    this.shareSelected = function() {
        var node = inst.data_tree.activeNode;
        if ( node ) {
            hasPerms( node.key, PERM_ADMIN, function( perms ){
                if (( perms & PERM_ADMIN ) == 0 ){
                    dlgAlert( "Cannot Perform Action", "Permission Denied." );
                    return;
                }

                if ( node.key[0] == "c" ){
                    viewColl( node.key, function( coll ){
                        if ( coll )
                            dlgSetACLs.show( coll );
                        else
                            alert("Cannot access collection.");
                    });
                } else {
                    viewData( node.key, function( data ){
                        if ( data )
                            dlgSetACLs.show( data );
                        else
                            alert( "Cannot access data record." );
                    });
                }
            });
        }
    }

    this.editAllocSelected = function(){
        var node = inst.data_tree.activeNode;
        if ( node ) {
            dlgAllocations.show();
        }
    }

    this.updateNodeTitle = function( data ){
        console.log( "upnodetitle", data );
        var title = inst.generateTitle( data );

        inst.data_tree.visit(function(node){
            if ( node.key == data.id )
                node.setTitle(title);
        });
    }

    this.deleteNode = function( key ){
        var items = [];
        inst.data_tree.visit(function(node){
            if ( node.key == key )
            items.push( node );
        });

        for ( var i in items ){
            items[i].remove();
        }
    }

    this.xfrSelected = function( a_mode ) {
        var key = inst.data_tree.activeNode.key;

        if ( key[0] == "d" ) {
            hasPerms( key, a_mode==1?PERM_READ:PERM_WRITE, function( perms ){
                if (( perms & ( a_mode==1?PERM_READ:PERM_WRITE )) == 0 ){
                    dlgAlert( "Cannot Perform Action", "Permission Denied." );
                    return;
                }

                viewData( key, function( data ){
                    if ( data )
                        dlgStartTransfer( a_mode, data );
                    else
                        alert( "Cannot access data record." );
                }); 
            });
        }
    }

    this.updateBtnState = function( state, admin ){
        console.log("updBtn",state,admin);
        if ( state == "c" ) {
            $("#btn_new_data",inst.frame).button("option","disabled",false);
            $("#btn_new_coll",inst.frame).button("option","disabled",false);
            $("#btn_edit",inst.frame).button("option","disabled",false);
            $("#btn_del",inst.frame).button("option","disabled",false);
            $("#btn_share",inst.frame).button("option","disabled",false);
            $("#btn_upload",inst.frame).button("option","disabled",true);
            $("#btn_download",inst.frame).button("option","disabled",true);
            $("#btn_alloc",inst.frame).button("option","disabled",true);
        } else if ( state == "d" ) {
            $("#btn_new_data",inst.frame).button("option","disabled",true);
            $("#btn_new_coll",inst.frame).button("option","disabled",true);
            $("#btn_edit",inst.frame).button("option","disabled",false);
            $("#btn_del",inst.frame).button("option","disabled",false);
            $("#btn_share",inst.frame).button("option","disabled",false);
            $("#btn_upload",inst.frame).button("option","disabled",false);
            $("#btn_download",inst.frame).button("option","disabled",false);
            $("#btn_alloc",inst.frame).button("option","disabled",true);
        } else if ( state == "r" ) {
            $("#btn_new_data",inst.frame).button("option","disabled",false);
            $("#btn_new_coll",inst.frame).button("option","disabled",false);
            $("#btn_edit",inst.frame).button("option","disabled",true);
            $("#btn_del",inst.frame).button("option","disabled",true);
            $("#btn_share",inst.frame).button("option","disabled",!admin);
            $("#btn_upload",inst.frame).button("option","disabled",true);
            $("#btn_download",inst.frame).button("option","disabled",true);
            $("#btn_alloc",inst.frame).button("option","disabled",true);
        } else if ( state == "p" ) {
            $("#btn_new_data",inst.frame).button("option","disabled",true);
            $("#btn_new_coll",inst.frame).button("option","disabled",true);
            $("#btn_edit",inst.frame).button("option","disabled",!admin);
            $("#btn_del",inst.frame).button("option","disabled",!admin);
            $("#btn_share",inst.frame).button("option","disabled",true);
            $("#btn_upload",inst.frame).button("option","disabled",true);
            $("#btn_download",inst.frame).button("option","disabled",true);
            $("#btn_alloc",inst.frame).button("option","disabled",false);
        } else {
            $("#btn_new_data",inst.frame).button("option","disabled",true);
            $("#btn_new_coll",inst.frame).button("option","disabled",true);
            $("#btn_edit",inst.frame).button("option","disabled",true);
            $("#btn_del",inst.frame).button("option","disabled",true);
            $("#btn_share",inst.frame).button("option","disabled",true);
            $("#btn_upload",inst.frame).button("option","disabled",true);
            $("#btn_download",inst.frame).button("option","disabled",true);
            $("#btn_alloc",inst.frame).button("option","disabled",state != "m");
        }
    }

    this.reloadSelected = function(){
        var node = inst.data_tree.activeNode;
        if ( node ){
            var exp = node.isExpanded();
            node.resetLazy();
            node.setExpanded(exp);
        }
    }

    this.noInfoAvail = function(){
        inst.updateBtnState();
        inst.data_info.html("(no information available)<br><br><br>");
        inst.showSelectedMetadata();
    }

    this.showSelectedInfo = function( node ){
        var html;

        if ( !node ){
            inst.updateBtnState();
            inst.data_info.html("(no information available)<br><br><br>");
            inst.showSelectedMetadata();
        }else{
            console.log( "node key:", node.key );
            var key,i;
            if ( node.key == "shared_proj" && node.data.scope )
                key = node.data.scope;
            else
                key = node.key;

            //console.log( "node:", node, key );
            if ( key == "mydata" ) {
                html = "My Data";
                inst.data_ident.html( html );
                inst.updateBtnState("m");
                inst.showSelectedMetadata();

                userView( g_user.uid, true, function( ok, user ){
                    if ( ok && user ){
                        html = "Data owned by " + user.name + "<br><br>";

                        html += "<table class='info_table'><col width='30%'><col width='70%'>";
                        html += "<tr><th>Field</th><th>Value</th></tr>";
                        html += "<tr><td>Allocation(s):</td><td>";

                        if ( user.alloc && user.alloc.length ){
                            var alloc,free;
                            for ( i in user.alloc ){
                                alloc = user.alloc[i]
                                free = Math.max( Math.floor(10000*(alloc.alloc - alloc.usage)/alloc.alloc)/100, 0 );
                                html += alloc.repo + ": " + sizeToString( alloc.alloc ) + " total, " + sizeToString( alloc.usage ) + " used (" + free + " % free)<br>";
                            }
                        }else{
                            html += "(none)";
                        }
                        html += "</table>";
                        inst.data_info.html(html);
                    }
                });
            }else if ( key[0] == "c" ) {
                html = "Collection, ID: " + key;
                inst.data_ident.html( html );

                viewColl( key, function( item ){
                    if ( item ){
                        if ( node.data.isroot )
                            inst.updateBtnState( "r", node.data.admin );
                        else
                            inst.updateBtnState( "c" );
        
                        html = "\"" + item.title + "\"<br>";
                        if ( item.desc )
                            html += "<p>\"" + item.desc + "\"</p>";
                        else
                            html += "<br>";

                        html += "<table class='info_table'><col width='30%'><col width='70%'>";
                        html += "<tr><th>Field</th><th>Value</th></tr>";
                        html += "<tr><td>Alias:</td><td>" + (item.alias?item.alias:"(none)") + "</td></tr>";
                        html += "<tr><td>Public Access:</td><td>" + (item.ispublic?"Enabled":"Disabled") + "</td></tr>";
                        html += "<tr><td>Owner:</td><td>" + item.owner.substr(2) + (item.owner[0]=="p"?" (project)":"") + "</td></tr>";
                        html += "</table>";
                        inst.data_info.html(html);
                        inst.showSelectedMetadata();
                    }else{
                        inst.noInfoAvail();
                    }
                }); 
            } else if ( key[0] == "d" ) {
                html = "Data Record, ID: " + key;
                inst.data_ident.html( html );

                viewData( key, function( item ){
                    if ( item ){
                        inst.updateBtnState( "d" );

                        html = "\"" + item.title + "\"<br>";
                        if ( item.desc )
                            html += "<p>\"" + item.desc + "\"</p>";
                        else
                            html += "<br>";

                        html += "<table class='info_table'><col width='30%'><col width='70%'>";
                        html += "<tr><th>Field</th><th>Value</th></tr>";
                        html += "<tr><td>Alias:</td><td>" + (item.alias?item.alias:"(none)") + "</td></tr>";
                        html += "<tr><td>Public Access:</td><td>" + (item.ispublic?"Enabled":"Disabled") + "</td></tr>";
                        html += "<tr><td>Data Repo:</td><td>" + item.repoId.substr(5) + "</td></tr>";
                        html += "<tr><td>Data Size:</td><td>" + sizeToString( item.dataSize ) + "</td></tr>";
                        html += "<tr><td>Data Updated:</td><td>" + (item.dataTime?Date(item.dataTime*1000).toString():"n/a") + "</td></tr>";
                        html += "<tr><td>Record Updated:</td><td>" + (item.recTime?Date(item.recTime*1000).toString():"n/a") + "</td></tr>";
                        html += "<tr><td>Owner:</td><td>" + item.owner.substr(2) + (item.owner[0]=="p"?" (project)":"") + "</td></tr>";
                        html += "</table>";
                        inst.data_info.html(html);
                        inst.showSelectedMetadata( item.metadata );
                    }else{
                        inst.noInfoAvail();
                    }
                }); 
            } else if ( key.startsWith("p/")) {
                html = "Project, ID: " + key;
                inst.data_ident.html( html );

                viewProj( key, function( item ){
                    if ( item ){
                        inst.updateBtnState("p",node.data.admin);

                        var html = "\"" + item.title + "\"<br>";
                        if ( item.desc )
                            html += "<p>\"" + item.desc + "\"</p>";
                        else
                            html += "<br>";

                        html += "<table class='info_table'><col width='30%'><col width='70%'>";
                        html += "<tr><th>Field</th><th>Value</th></tr>";
                        html += "<tr><td>Domain:</td><td>" + item.domain + "</td></tr>";
                        html += "<tr><td>Owner:</td><td>" + item.owner.substr(2) + "</td></tr>";
                        html += "<tr><td>Admins:</td><td>";
                        if ( item.admin && item.admin.length ){
                            for ( i in item.admin )
                                html += item.admin[i].substr(2) + " ";
                        }else{
                            html += "(none)";
                        }
                        html += "</td></tr>";
                        html += "<tr><td>Members:</td><td>";
                        if ( item.member && item.member.length ){
                            for ( i in item.member )
                                html += item.member[i].substr(2) + " ";
                        }else{
                            html += "(none)";
                        }
                        html += "<tr><td>Allocation(s):</td><td>";
                        if ( item.alloc && item.alloc.length ){
                            var alloc,free;
                            for ( i in item.alloc ){
                                alloc = item.alloc[i]
                                free = Math.max( Math.floor(10000*(alloc.alloc - alloc.usage)/alloc.alloc)/100, 0 );
                                html += alloc.repo + ": " + sizeToString( alloc.alloc ) + " total, " + sizeToString( alloc.usage ) + " used (" + free + " % free)<br>";
                            }
                        }else{
                            html += "(none)";
                        }
                        html += "</td></tr>";
                        html += "</table>";
                        inst.data_info.html(html);
                        inst.showSelectedMetadata( item.metadata );
                    }else{
                        inst.noInfoAvail();
                    }
                }); 
            } else {
                inst.noInfoAvail();
                inst.data_ident.html( "" );
            }
        }
    }

    this.buildObjSrcTree = function( obj, base ){
        //console.log("build", base);

        var src = [];
        var fkey;
        Object.keys(obj).forEach(function(k) {
            //console.log(key,typeof md[key]);

            if ( typeof obj[k] === 'object' ){
                fkey=base+"."+k;
                //console.log( fkey, "=", data_md_exp[fkey] );
                if ( inst.data_md_exp[fkey] ){
                    inst.data_md_exp[fkey] = 10;
                }
                src.push({title:k, icon: true, folder: true, expanded: inst.data_md_exp[fkey]?true:false, children: inst.buildObjSrcTree(obj[k],fkey)})
            }else if ( typeof obj[k] === 'string' )
                src.push({title:k + " : \"" + obj[k] + "\"", icon: false })
            else
                src.push({title:k + " : " + obj[k], icon: false })
        });

        return src;
    }

    this.showSelectedMetadata = function( md_str )
    {
        if ( md_str ){
            for ( var i in inst.data_md_exp ){
                if ( inst.data_md_exp[i] == 1 )
                    delete inst.data_md_exp[i];
                else
                inst.data_md_exp[i]--;
            }

            //console.log( "exp st", inst.data_md_exp );
            // TODO Use data_md_tree.isExapnded() to do lazy loading in case user's don't want to see metadata
            var md = JSON.parse( md_str );
            if ( inst.data_md_exp["Metadata"] )
                inst.data_md_exp["Metadata"] = 10;

            var src = [{title:"Metadata", icon: "ui-icon ui-icon-folder", folder: true, expanded: inst.data_md_exp["Metadata"]?true:false, children: inst.buildObjSrcTree(md,"Metadata")}];

            //console.log("md:",md);
            //console.log("keys:",Object.keys(md));
            //for ( var p in md ) {
                //if ( md.hasOwnProperty( p )) {

            inst.data_md_tree.reload( src );
            inst.data_md_empty = false;
        } else if ( !inst.data_md_empty ) {
            inst.data_md_tree.reload(inst.data_md_empty_src);
            inst.data_md_empty = true;
        }
    }

    this.addNode = function( item ){
        console.log( "addnode", item );

        if ( item.id.startsWith("p/")){
            // Projects can only be added to "my projects"
            var node = inst.data_tree.getNodeByKey("proj_adm");
            if ( node ){
                var prj_id = item.id.substr(2);
                node.addNode({ title: item.title + " (" + prj_id + ")",icon:"ui-icon ui-icon-box", folder: true, key:item.id,scope:item.id,isproj:true,admin:true,nodrag:true,children:[
                    {title: "Root Collection <i class='browse-reload ui-icon ui-icon-reload'></i>",icon:"ui-icon ui-icon-folder",folder:true,lazy:true,key:"c/"+prj_id+"_root",scope:item.id,isroot:true,admin:true,nodrag:true}
                ]});
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
                        inst.data_tree.visit(function(node){
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
                            var nodedat;
                            if ( item.id[0] == "c" )
                                nodedat = {title:inst.generateTitle(item),key:item.id,folder:true,icon:"ui-icon ui-icon-folder",scope:scope};
                            else
                                nodedat = {title:inst.generateTitle( item ),key:item.id,icon:"ui-icon ui-icon-file",scope:scope};
                            for ( var i in updnodes ) {
                                updnodes[i].addNode( nodedat );
                            }
                        }
                    }
                }
            });
        }
    }

    this.execQuery = function(){
        var query = $("#query_input").val();
        var scope = 0;

        if( $("#scope_mydat",inst.frame).prop("checked"))
            scope |= SS_MY_DATA;
        if( $("#scope_myproj",inst.frame).prop("checked"))
            scope |= SS_MY_PROJ;
        if( $("#scope_teamproj",inst.frame).prop("checked"))
            scope |= SS_TEAM_PROJ;
        if( $("#scope_usershare",inst.frame).prop("checked"))
            scope |= SS_USER_SHARE;
        if( $("#scope_projshare",inst.frame).prop("checked"))
            scope |= SS_PROJ_SHARE;
        if( $("#scope_public",inst.frame).prop("checked"))
            scope |= SS_PUBLIC;

        console.log( "query:", query, scope );

        setStatusText("Executing search query...");
        dataFind( query, scope, function( ok, items ){
            console.log( "qry res:", ok, items );

            var srch_node = inst.data_tree.getNodeByKey("search");
            var results = [];
            if ( items.length > 0 ){
                setStatusText( "Found " + items.length + " result" + (items.length==1?"":"s"));
                for ( var i in items ){
                    var item = items[i];
                    results.push({title:inst.generateTitle( item ), icon:false, key: item.id, nodrag: true });
                }
            } else {
                setStatusText("No results found");
                results.push({title:"(no results)",icon:false, nodrag: true});
            }
            srch_node.removeChildren();
            srch_node.addChildren( results );
            srch_node.setExpanded( true );

            if ( !inst.data_tree.activeNode )
                inst.showSelectedInfo();
        });
    }

    this.generateTitle = function( item ) {
        if ( item.alias )
            return "\"" + item.title + "\" (" + item.alias.substr(item.alias.lastIndexOf(":") + 1) + ")";
        else
            return "\"" + item.title + "\" [" + item.id.substr(2) + "]";
    }

    this.xfrUpdateHistory = function( xfr_list ){
        var len = xfr_list.length;
        var html;
        if ( len == 0 ){
            html = "(no recent transfers)";
        }else{
            html = "<table class='info_table'><tr><th>Data ID</th><th>Mode</th><th>Path</th><th>Started</th><th>Updated</th><th>Status</th></tr>";
            var stat;
            var start = new Date(0);
            var update = new Date(0);
            var options = { year: '2-digit', month: 'numeric', day: 'numeric', hour: '2-digit', minute: 'numeric', hour12: false };

            for ( var i = 0; i < len; i++ ) {
                stat = xfr_list[i];
                html += "<tr><td>" + stat.dataId + "</td><td>" + (stat.mode=="XM_GET"?"Get":"Put") + "</td><td>" + stat.localPath + "</td>";
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
        this.xfr_hist.html( html );
    }

    this.xfrHistoryPoll = function() {
        if ( !g_user )
            return;

        _asyncGet( "/api/xfr/list" + (inst.pollSince?"?since="+inst.pollSince:""), null, function( ok, data ){
            if ( ok ) {
                if ( data.xfr && data.xfr.length ) {
                    // Find and remove any previous entries
                    for ( var i in data.xfr ){
                        var xfr = data.xfr[i];
                        for ( var j in inst.xfrHist ){
                            if ( inst.xfrHist[i].id == xfr.id ){
                                inst.xfrHist.splice(i,1);
                                break;
                            }
                        }
                    }
                    inst.xfrHist = data.xfr.concat( inst.xfrHist );
                }
                inst.xfrUpdateHistory( inst.xfrHist );
            }
            inst.pollSince = 10;
            inst.xfrTimer = setTimeout( inst.xfrHistoryPoll, 1000*(inst.pollSince-1));
        });
    }

    this.setupRepoTab = function(){
        console.log("setupRepoTab");
        _asyncGet( "/api/repo/list?admin=u/"+g_user.uid+"&details=true", null, function(ok,data){
            if ( ok ){
                var html;
                console.log( "repo data:",data);
                if ( data && data.length ){
                    html = "<table class='info_table'><tr><th>Repo ID</th><th>Title</th><th>Address</th><th>Endpoint UUID</th><th>Capacity</th><th>Path</th></tr>";
                    var repo;
                    for ( var i in data ){
                        repo = data[i];
                        html += "<tr><td>"+repo.id.substr(5)+"</td><td>"+repo.title+"</td><td>"+repo.address+"</td><td>"+repo.endpoint+"</td><td>"+sizeToString( repo.capacity )+"</td><td>"+repo.path+"</td><td><button class='btn small repo_adm' repo='"+repo.id+"'>Admin</button></td></tr>";
                    }
                    //onclick='dlgRepoAdmin.show(\""+repo.id+"\")'
                    html += "</table>";
                }else{
                    html = "No administered repositories";
                }

                $("#repo_list").html( html );
                $(".btn","#repo_list").button();
                $(".repo_adm","#repo_list").click( function(ev){ dlgRepoAdmin.show($(this).attr("repo"),function(){ inst.setupRepoTab();}); });
            }
        });
    }

    var tree_source = [
        {title:"My Data",key:"mydata",nodrag:true,icon:"ui-icon ui-icon-copy",folder:true,expanded:true,children:[{
            title:"Root Collection <i class='browse-reload ui-icon ui-icon-reload'></i>",folder:true,expanded:true,icon:"ui-icon ui-icon-folder",lazy:true,key:inst.my_root_key,user:g_user.uid,scope:"u/"+g_user.uid,nodrag:true,isroot:true,admin:true}]},
        {title:"My Projects <i class='browse-reload ui-icon ui-icon-reload'",folder:true,icon:"ui-icon ui-icon-view-icons",nodrag:true,lazy:true,key:"proj_adm"},
        {title:"Team Projects <i class='browse-reload ui-icon ui-icon-reload'",folder:true,icon:"ui-icon ui-icon-view-icons-b",nodrag:true,lazy:true,key:"proj_mem"},
        {title:"Shared Data",folder:true,icon:"ui-icon ui-icon-circle-plus",nodrag:true,children:[
            {title:"By User <i class='browse-reload ui-icon ui-icon-reload'",nodrag:true,icon:"ui-icon ui-icon-folder",folder:true,lazy:true,key:"shared_user"},
            {title:"By Project <i class='browse-reload ui-icon ui-icon-reload'",nodrag:true,icon:"ui-icon ui-icon-folder",folder:true,lazy:true,key:"shared_proj"}
        ]},
        {title:"Favorites <i class='browse-reload ui-icon ui-icon-reload'",folder:true,icon:"ui-icon ui-icon-heart",lazy:true,nodrag:true,key:"favorites"},
        {title:"Views <i class='browse-reload ui-icon ui-icon-reload'",folder:true,icon:"ui-icon ui-icon-view-list",lazy:true,nodrag:true,key:"views"},
        {title:"Search Results",icon:"ui-icon ui-icon-zoom",folder:true,children:[{title:"(empty)",icon:false, nodrag: true}],key:"search", nodrag: true },
    ];

    $("#data_tree").fancytree({
        extensions: ["dnd","themeroller"],
        dnd:{
            dragStart: function(node, data) {
                //if ( !drag_enabled || node.key == "loose" || node.key == root_key )
                if ( !inst.drag_enabled || node.data.nodrag )
                    return false;

                if ( data.originalEvent.shiftKey ) {
                    inst.drag_mode = 1;
                    return true;
                } else if ( data.originalEvent.ctrlKey ) {
                    return false;
                } else {
                    inst.drag_mode = 0;
                    return true;
                }
            },
            dragDrop: function(node, data) {
                console.log("drop in",node,data);

                if ( inst.drag_mode ){
                    linkItemUnlinkSource( data.otherNode.key, node.key, node.parent.key, function( ok, msg ) {
                        if ( ok ){
                            node.setExpanded(true).always(function(){
                                data.otherNode.moveTo( node, data.hitMode );
                            });
                        }else
                            dlgAlert("Link Error", msg );
                    });
                }else{
                    linkItem( data.otherNode.key, node.key, function( ok, msg ) {
                        if ( ok ){
                            node.setExpanded(true).always(function(){
                                if ( data.otherNode.isFolder())
                                    data.otherNode.moveTo( node, data.hitMode );
                                else
                                    data.otherNode.copyTo( node, data.hitMode );
                            });
                        }else
                            dlgAlert("Link Error", msg );
                    });
                }
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
            } else if ( data.node.key == "shared_user" ) {
                if ( data.node.data.scope ){
                    data.result = {
                        url: "/api/acl/by_user/list?owner=" + encodeURIComponent(data.node.data.scope),
                        cache: false
                    };
                }else{
                    data.result = {
                        url: "/api/acl/by_user",
                        cache: false
                    };
                }
            } else if ( data.node.key == "shared_proj" ) {
                if ( data.node.data.scope ){
                    data.result = {
                        url: "/api/acl/by_proj/list?owner=" + encodeURIComponent(data.node.data.scope),
                        cache: false
                    };
                }else{
                    data.result = {
                        url: "/api/acl/by_proj",
                        cache: false
                    };
                }
            } else if ( data.node.key == "favorites" || data.node.key == "views" ) {
                data.result = [{title:"(not implemented yet)",icon:false,nodrag:true}];
            } else {
                data.result = {
                    url: "/api/col/read?id=" + encodeURIComponent( data.node.key ),
                    cache: false
                };
            }
        },
        loadError:function( event, data ) {
            console.log("load error, data:", data );
            var error = data.error;
            if ( error.responseText ){
                data.message = error.responseText;
                //data.details = data.responseText;
            } else if (error.status && error.statusText) {
                data.message = "Ajax error: " + data.message;
                data.details = "Ajax error: " + error.statusText + ", status code = " + error.status;
            }
        },
        postProcess: function( event, data ) {
            console.log( "pos proc:", data );
            if ( data.node.key == "proj_adm" || data.node.key == "proj_mem" ){
                data.result = [];
                if ( data.response.length ){
                    var item;
                    var admin = (data.node.key=="proj_adm"?true:false);
                    var prj_id;

                    for ( var i in data.response ) {
                        item = data.response[i];
                        prj_id = item.id.substr(2);
                        //data.result.push({ extraClasses:"project", title: item.title + " (" + prj_id + ")",icon:true, folder: true, key: "p/"+prj_id,
                        data.result.push({ title: inst.generateTitle(item),icon:"ui-icon ui-icon-box",folder:true,key: item.id,isproj:true,admin:admin,nodrag:true,children:[
                            {title: "Root Collection <i class='browse-reload ui-icon ui-icon-reload'></i>",icon:"ui-icon ui-icon-folder",folder:true,lazy:true,key:"c/"+prj_id+"_root",scope:item.id,isroot:true,admin:admin,nodrag:true}
                        ]});
                    }
                }else{
                    data.result.push({ title: "(none)", icon: false, nodrag:true });
                }
            } else if ( data.node.key == "shared_user" && !data.node.data.scope ){
                data.result = [];
                if ( data.response.length ){
                    var item;
                    for ( var i in data.response ) {
                        item = data.response[i];
                        data.result.push({ title: item.name + " (" + item.uid + ")",icon:"ui-icon ui-icon-person",folder:true,key:"shared_user",scope:"u/"+item.uid,lazy:true,nodrag:true});
                    }
                }else{
                    data.result.push({ title: "(none)", icon: false, nodrag:true });
                }
            } else if ( data.node.key == "shared_proj" && !data.node.data.scope ){
                data.result = [];
                if ( data.response.length ){
                    var item;
                    for ( var i in data.response ) {
                        item = data.response[i];
                        data.result.push({ title: inst.generateTitle(item),icon:"ui-icon ui-icon-box",folder:true,key:"shared_proj",scope:item.id,lazy:true,nodrag:true});
                    }
                }else{
                    data.result.push({ title: "(none)", icon: false, nodrag:true });
                }
            } else if ( data.node.key == "favorites" || data.node.key == "views" ) {
                // Not implemented yet
            } else if ( data.node.parent ) {
                data.result = [];
                var item,entry,scope = data.node.data.scope;
                var items = data.response.data?data.response.data:data.response.item;
                console.log(items);

                for ( var i in items ) {
                    item = items[i];
                    is_folder = item.id[0]=="c"?true:false;

                    entry = { title: inst.generateTitle( item ),folder:is_folder,scope:scope,key:item.id };
                    if ( is_folder ){
                        entry.lazy = true;
                        entry.icon = "ui-icon ui-icon-folder";
                    } else {
                        entry.icon = "ui-icon ui-icon-file";
                    }

                    data.result.push( entry );
                }
            }
        },
        activate: function( event, data ) {
            showSelectedInfo( data.node );
        },
        click: function(event, data) {
            if ( inst.drag_enabled && data.originalEvent.ctrlKey ) {
                //console.log("unlink", data );
                if ( data.node.data.nodrag )
                    return;

                // Prevent unlinking top-level folders
                var plist;
                if ( data.node.folder ){
                    plist = data.node.getParentList();

                    if ( !plist.length || plist[plist.length-1].data.nodrag )
                        return;
                }

                unlinkItem( data.node.key, data.node.parent.key, function( ok, rooted ) {
                    if ( ok ){
                        if ( rooted.length == 0 )
                            data.node.remove();
                        else{
                            // Don't care about what's in rooted array - only one item unlinked at a time here
                            //console.log( plist );
                            if ( !plist )
                                plist = data.node.getParentList();

                            console.log( "plist:", plist );

                            // If item was already at root, don't move node
                            if ( plist[plist.length-1].data.nodrag )
                                return;
    
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
                    }else
                        dlgAlert( "Unlink Error", rooted );
                });
            }
        }
    });

    this.data_tree = $('#data_tree').fancytree('getTree');

    $("#data_md_tree").fancytree({
        extensions: ["themeroller"],
        themeroller: {
            activeClass: "ui-state-hover",
            addClass: "",
            focusClass: "",
            hoverClass: "ui-state-active",
            selectedClass: ""
        },
        source: inst.data_md_empty_src,
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
                delete inst.data_md_exp[path];
            }else{
                //console.log("expanded", data.node, path );
                inst.data_md_exp[path] = 10;
            }
            //console.log( "exp st", inst.data_md_exp );
        }
    });

    this.data_md_tree = $("#data_md_tree").fancytree("getTree");

    // Connect event/click handlers
    $("#btn_new_proj",inst.frame).on('click', inst.newProj );
    $("#btn_new_data",inst.frame).on('click', inst.newData );
    $("#btn_new_coll",inst.frame).on('click', inst.newColl );
    $("#btn_edit",inst.frame).on('click', inst.editSelected );
    $("#btn_del",inst.frame).on('click', inst.deleteSelected );
    $("#btn_share",inst.frame).on('click', inst.shareSelected );
    $("#btn_upload",inst.frame).on('click', function(){ inst.xfrSelected(0) });
    $("#btn_download",inst.frame).on('click', function(){ inst.xfrSelected(1) });
    $("#btn_alloc",inst.frame).on('click', function(){ inst.editAllocSelected() });
    $(document.body).on('click', '.browse-reload' , inst.reloadSelected );

    $("#query_input").on('keyup', function (e) {
        if (e.keyCode == 13)
            execQuery();
    });
    $(".btn-refresh").button({icon:"ui-icon-refresh"});
    $('input').addClass("ui-widget ui-widget-content ui-corner-all");
    //$("#xfr_panel").accordion({collapsible:true,heightStyle:"content"});
    //$("#search_panel").accordion({collapsible:true,heightStyle:"content"});

    userView( g_user.uid, true, function( ok, user ){
        if ( ok && user ){
            g_user.isAdmin = user.isAdmin;
            g_user.isRepoAdmin = user.isRepoAdmin;
            if ( g_user.isRepoAdmin ){
                setupRepoTab();
                $('[href="#tab-repo"]').closest('li').show();
            }
        }
    });

    $("#footer-tabs").tabs({heightStyle:"fill",collapsible: true}).css({
        /*'min-height': '50px',*/
        'overflow': 'auto'
    });

    $(".scope",inst.frame).checkboxradio();
    var node = inst.data_tree.getNodeByKey( inst.my_root_key );
    node.load();
    node.setExpanded();
    inst.showSelectedInfo();
    this.xfrTimer = setTimeout( inst.xfrHistoryPoll, 1000 );
}
