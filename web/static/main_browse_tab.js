function makeBrowserTab(){
    console.log("making browser tab");

    var inst = this;

    inst.frame = $("#content");
    //inst.frame = $("#tab-browse");
    //inst.data_ident = $("#data_ident",inst.frame);
    inst.sel_id = $("#sel_id",inst.frame);
    inst.sel_title = $("#sel_title",inst.frame);
    inst.sel_details = $("#sel_details",inst.frame);
    inst.sel_descr = $("#sel_descr",inst.frame);
    this.xfr_hist = $("#xfr_hist",inst.frame);
    this.alloc_stat = $("#alloc_stat",inst.frame);
    this.data_tree = null;
    this.data_md_tree = null;
    this.data_md_empty = true;
    this.data_md_empty_src = [{title:"(none)", icon:false}];
    //this.data_md_cur = {};
    this.data_md_exp = {};
    this.xfrHist = [];
    this.pollSince = g_opts.xfr_hist * 3600;
    this.my_root_key = "c/u_" + g_user.uid + "_root";
    this.drag_mode = 0;
    this.drag_enabled = true;
    this.searchSelect = false;
    this.selectScope = null;
    this.dragging = false;
    this.pasteItems = [];

    this.deleteSelected = function(){
        var node = inst.data_tree.activeNode;
        checkPerms( node.key, PERM_ADMIN, function( granted ){
            if ( !granted ){
                alertPermDenied();
                return;
            }

            var msg,msg = "<div>Are you sure you want to delete ";

            if ( node.key[0] == "c" ) {
                msg += "collection ID " + node.key + "?<p>Note that this action will delete all contained data records that are not linked to other collections.</p><div>";

                confirmChoice( "Confirm Deletion", msg, ["Delete","Cancel"], function( choice ){
                    if ( choice == 0 ){
                        url = "/api/col/delete?id=" + encodeURIComponent(node.key);
                        _asyncGet( url, null, function( ok, data ){
                            if ( ok ) {
                                inst.deleteNode( node.key );
                                inst.updateBtnState();
                            } else {
                                dlgAlert( "Collection Delete Error", data );
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

    this.newMenu = function(){
        $("#newmenu").toggle().position({
            my: "left bottom",
            at: "left bottom",
            of: this
        }); //"fade"); //.focus(); //slideToggle({direction: "up"});
    }

    this.newProj = function() {
        dlgProjNewEdit(null,function(data){
            inst.addNode( data );
        });
    }

    this.newData = function() {
        var parent = "root";
        var node = inst.data_tree.activeNode;
        if ( node ){
            if ( node.key.startsWith("d/")) {
                parent = node.parent.key;
            }else if (node.key.startsWith("c/")){
                parent = node.key;
            }else if (node.key.startsWith("p/")){
                parent = "c/p_"+node.key.substr(2)+"_root";
            }
        }

        checkPerms( parent, PERM_WR_DATA, function( granted ){
            if ( !granted ){
                alertPermDenied();
                return;
            }

            viewColl( parent, function( coll ){
                if ( coll ){
                    var coll_id = coll.alias?coll.alias:coll.id;

                    dlgDataNewEdit(DLG_DATA_NEW,null,coll_id,0,function(data,coll){
                        var node;
                        if ( coll.startsWith( "c/" )){
                            node = inst.data_tree.getNodeByKey( coll );
                            if ( node )
                                inst.reloadNode( node );
                        }else{
                            viewColl( coll, function( data ){
                                if ( data ){
                                    node = inst.data_tree.getNodeByKey( data.id );
                                    if ( node )
                                        inst.reloadNode( node );
                                }
                            });
                        }
                    });
                }else
                    alert("Cannot access parent collection.");
            });
        });
    }

    this.newColl = function() {
        var node = inst.data_tree.activeNode;
        var parent = "root";
        if ( node ){
            if ( node.key.startsWith("d/")) {
                parent = node.parent.key;
            }else if (node.key.startsWith("c/")){
                parent = node.key;
            }else if (node.key.startsWith("p/")){
                parent = "c/p_"+node.key.substr(2)+"_root";
            }
        }

        checkPerms( parent, PERM_WR_DATA, function( granted ){
            if ( !granted ){
                alertPermDenied();
                return;
            }

            viewColl( parent, function( coll ){
                if ( coll ){
                    var coll_id = coll.alias?coll.alias:coll.id;

                    dlgCollNewEdit(null,coll_id,function(data,coll){
                        var node;
                        if ( coll.startsWith( "c/" )){
                            node = inst.data_tree.getNodeByKey( coll );
                            if ( node )
                                inst.reloadNode( node );
                        }else{
                            viewColl( coll, function( data ){
                                if ( data ){
                                    node = inst.data_tree.getNodeByKey( data.id );
                                    if ( node )
                                        inst.reloadNode( node );
                                }
                            });
                        }
                    });
                }else
                    alert("Cannot access parent collection.");
            });
        });
    }

    this.toggleLock = function(){
        var node = inst.data_tree.activeNode;
        if ( node ) {
            if ( node.key[0] == "d" ){
                toggleDataLock( node.key, function( ok, data ){
                    if ( ok ){
                        inst.updateNodeTitle( data.data[0] );
                        inst.showSelectedInfo( node );
                    }else{
                        dlgAlert("Toggle Lock Failed",data);
                    }
                });
            }
        }
    }

    this.copyItems = function( items, dest_node, cb ){
        var item_keys = [];
        for( var i in items )
            item_keys.push( items[i].key );

        linkItems( item_keys, dest_node.key, function( ok, msg ) {
            if ( ok ){
                if ( dest_node.isLoaded() )
                    inst.reloadNode(dest_node);
            }else
                setStatusText( msg );
            if ( cb )
                cb();
        });
    }

    this.moveItems = function( items, dest_node, cb ){
        //console.log("moveItems",items,dest_node,inst.pasteSource);
        var item_keys = [];
        for( var i in items )
            item_keys.push( items[i].key );

        linkItemsUnlinkSource( item_keys, dest_node.key, inst.pasteSource.key, function( ok, msg ) {
            if ( ok ){
                // If there is a hierarchical relationship between source and dest, only need to reload the top-most node.
                var i, par = inst.pasteSource.getParentList(false,true);
                //console.log("Source node parents:",par);
                for ( i in par ){
                    if ( par[i].key == dest_node.key ){
                        //console.log("Reload dest node ONLY");
                        inst.reloadNode(dest_node);
                        return;
                    }
                }
                par = dest_node.getParentList(false,true);
                //console.log("Dest node parents:",par);
                for ( i in par ){
                    if ( par[i].key == inst.pasteSource.key ){
                        //console.log("Reload source node ONLY");
                        inst.reloadNode(inst.pasteSource);
                        return;
                    }
                }
                //console.log("Reload BOTH nodes");
                if ( dest_node.isLoaded() )
                    inst.reloadNode(dest_node);
                inst.reloadNode(inst.pasteSource);
            }else
                setStatusText( msg );

            if ( cb )
                cb();

        });
    }

    this.cutSelected = function(){
        inst.pasteItems = inst.data_tree.getSelectedNodes();
        inst.pasteSource = pasteItems[0].parent;
        inst.pasteMode = "cut";
        inst.pasteCollections = [];
        for ( var i in inst.pasteItems ){
            if ( inst.pasteItems[i].key.startsWith("c/") )
                inst.pasteCollections.push( inst.pasteItems[i] );
        }
        //console.log("cutSelected",inst.pasteItems,inst.pasteSource);
    }

    this.copySelected = function(){
        console.log("Copy");
        inst.pasteItems = inst.data_tree.getSelectedNodes();
        inst.pasteSource = pasteItems[0].parent;
        inst.pasteMode = "copy";
        inst.pasteCollections = [];
        for ( var i in inst.pasteItems ){
            if ( inst.pasteItems[i].key.startsWith("c/") )
                inst.pasteCollections.push( inst.pasteItems[i] );
        }
    }

    this.pasteSelected = function(){
        var node = inst.data_tree.activeNode;
        if ( node && inst.pasteItems.length ){
            function pasteDone(){
                inst.pasteItems = [];
                inst.pasteSource = null;
                inst.pasteCollections = null;
            }

            if ( node.key.startsWith( "d/" ))
                node = node.parent;
            if ( inst.pasteMode == "cut" )
                inst.moveItems( inst.pasteItems, node, pasteDone );
            else
                inst.copyItems( inst.pasteItems, node, pasteDone );
        }
    }

    this.unlinkSelected = function(){
        var sel = inst.data_tree.getSelectedNodes();
        if ( sel.length ){
            var items = [];
            for ( var i in sel ){
                items.push( sel[i].key );
            }
            //console.log("items:",items);
            unlinkItems( items, sel[0].parent.key, function( ok, rooted ) {
                if ( ok ){
                    if ( rooted.length ){
                        //console.log("rooted:",rooted);
                        inst.reloadNode( inst.data_tree.getNodeByKey( inst.my_root_key ));
                    }else{
                        inst.reloadNode( sel[0].parent );
                    }
                }else
                    setStatusText( rooted );
            });
        }
    }

    this.editSelected = function() {
        var node = inst.data_tree.activeNode;
        if ( node ) {
            if ( node.data.isproj || node.key[0] == "c")
                req_perms = PERM_ADMIN;
            else if ( node.key[0] == "d" )
                req_perms = PERM_ADMIN | PERM_WR_META;
            else
                return;

            getPerms( node.key, req_perms, function( perms ){
                console.log("perms:",perms);

                if (( perms & req_perms ) == 0 ){
                    dlgAlert( "Cannot Perform Action", "Permission Denied." );
                    return;
                }

                if ( node.data.isproj ){
                    viewProj( node.key, function( data ){
                        if ( data ){
                            dlgProjNewEdit(data,function(data){
                                inst.updateNodeTitle( data );
                                inst.showSelectedInfo( node );
                            });
                        }else
                            alert( "Cannot access project." );
                    });
                }else if ( node.key[0] == "c" ) {
                    viewColl( node.key, function( data ){
                        if ( data ){
                            dlgCollNewEdit(data,null,function(data){
                                inst.updateNodeTitle( data );
                                inst.showSelectedInfo( node );
                            });
                        }else
                            alert( "Cannot access collection." );
                    });
                } else if ( node.key[0] == "d" ) {
                    viewData( node.key, function( data ){
                        if ( data ){
                            dlgDataNewEdit(DLG_DATA_EDIT,data,null,perms,function(data){
                                inst.updateNodeTitle( data );
                                inst.showSelectedInfo( node );
                            });
                        }else
                            alert( "Cannot access data record." );
                    }); 
                }
            });
        }
    }

    this.dupSelected = function(){
        var node = inst.data_tree.activeNode;
        if ( node && node.key[0] == "d" ) {
            //console.log( "edit sel", node, node.data.isproj );
            checkPerms( node.key, PERM_READONLY, function( granted ){
                if ( !granted ){
                    alertPermDenied();
                    return;
                }

                viewData( node.key, function( data ){
                    if ( data ){
                        console.log( "data", data );
                        dlgDataNewEdit(DLG_DATA_DUP,data,null,0,function(data2){
                            inst.addNode( data2 );
                            if ( data.dataSize && parseInt(data.dataSize) > 0 ){
                                copyData( node.key, data2.id, function( ok, data ){
                                    if ( ok )
                                        dlgAlert( "Transfer Initiated", "Data transfer ID and progress will be shown under the 'Transfers' tab on the main window." );
                                    else
                                        dlgAlert( "Transfer Error", data );
                                });
                            }
                        });
                    }else
                        alert( "Cannot access data record." );
                }); 
            });
        }
    }

    this.shareSelected = function() {
        var node = inst.data_tree.activeNode;
        if ( node ) {
            checkPerms( node.key, PERM_ADMIN, function( granted ){
                if ( !granted ){
                    alertPermDenied();
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
            var perm = (a_mode==XFR_GET?PERM_RD_DATA:PERM_WR_DATA);
            checkPerms( key, perm, function( granted ){
                if ( !granted ){
                    alertPermDenied();
                    return;
                }

                viewData( key, function( data ){
                    if ( data ){
                        dlgStartTransfer( a_mode, data );
                    }else
                        alert( "Cannot access data record." );
                }); 
            });
        }
    }

    this.calcActionState = function( state, admin ){
        var bits;

        switch ( state ){
            case "c": bits = 0x72;  break;
            case "d": bits = 0;     break;
            case "r": bits = 0xF7;  break;
            case "p": bits = 0xFa | (admin?0:5); break;
            default:  bits = 0xFF;  break;
        }
        return bits;
    }

    this.updateBtnState = function( state, admin ){
        //console.log("upd btn state",state,admin,bits);
        var bits = calcActionState( state, admin );

        $("#btn_edit",inst.frame).button("option","disabled",(bits & 1) != 0 );
        //$("#btn_dup",inst.frame).button("option","disabled",(bits & 2) != 0);
        $("#btn_del",inst.frame).button("option","disabled",(bits & 4) != 0);
        $("#btn_share",inst.frame).button("option","disabled",(bits & 8) != 0);
        $("#btn_upload",inst.frame).button("option","disabled",(bits & 0x10) != 0);
        $("#btn_download",inst.frame).button("option","disabled",(bits & 0x20) != 0);
        $("#btn_lock",inst.frame).button("option","disabled",(bits & 0x40) != 0);
        //$("#btn_unlink",inst.frame).button("option","disabled",(bits & 0x80) != 0);

        inst.data_tree_div.contextmenu("enableEntry", "edit", (bits & 1) == 0 );
        //inst.data_tree_div.contextmenu("enableEntry", "dup", (bits & 2) == 0 );
        inst.data_tree_div.contextmenu("enableEntry", "del", (bits & 4) == 0 );
        inst.data_tree_div.contextmenu("enableEntry", "share", (bits & 8) == 0 );
        inst.data_tree_div.contextmenu("enableEntry", "put", (bits & 0x10) == 0 );
        inst.data_tree_div.contextmenu("enableEntry", "get", (bits & 0x20) == 0 );
        inst.data_tree_div.contextmenu("enableEntry", "lock", (bits & 0x40) == 0 );
        inst.data_tree_div.contextmenu("enableEntry", "unlink", (bits & 0x80) == 0 );
    }

    this.reloadDataTree = function(){
        inst.reloadNode( inst.data_tree.getNodeByKey( inst.my_root_key ) );
        inst.reloadNode( inst.data_tree.getNodeByKey( "proj_own" ) );
        inst.reloadNode( inst.data_tree.getNodeByKey( "proj_adm" ) );
        inst.reloadNode( inst.data_tree.getNodeByKey( "proj_mem" ) );
        inst.reloadNode( inst.data_tree.getNodeByKey( "shared_user" ) );
        inst.reloadNode( inst.data_tree.getNodeByKey( "shared_proj" ) );
    }

    this.reloadNode = function( node ){
        if ( node.isLazy() && !node.isLoaded() )
            return;

        var save_exp = node.isExpanded();
        if ( save_exp ){
            var exp = [];
            node.visit(function(n){
                //console.log("node:",n.key);
                if ( n.isExpanded() )
                    exp.push(n.key);
            });
        }
        //console.log( "expanded:", exp );
        node.load(true).always(function(){
            if ( save_exp ){
                function expNode( idx ){
                    if ( idx < exp.length ){
                        var n = inst.data_tree.getNodeByKey( exp[idx] );
                        if ( n ){
                            n.setExpanded(true).always(function(){
                                expNode( idx + 1 );
                            });
                        }else{
                            expNode( idx + 1 );
                        }
                    };
                }

                expNode(0);
            }
        });
    }

    this.reloadSelected = function(){
        var node = inst.data_tree.activeNode;
        if ( node ){
            inst.reloadNode( node );
        }
    }

    this.showSelectedInfo = function( node ){
        if ( !node ){
            inst.noInfoAvail();
        }else{
            console.log( "node key:", node.key );
            var key,i,html;
            var date = new Date();

            if ( node.key == "shared_proj" && node.data.scope )
                key = node.data.scope;
            else
                key = node.key;

            if ( key == "mydata" ) {
                inst.sel_id.text( "My Data" );
                inst.sel_title.text( "" );
                inst.sel_descr.text( "Location for creating and organizing personal data and collections." );
                inst.updateBtnState("m");
                inst.showSelectedMetadata();

                userView( g_user.uid, true, function( ok, user ){
                    if ( ok && user ){
                        html = "<table class='info_table'><col width='30%'><col width='70%'>";
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
                        inst.sel_details.html(html);

                        inst.showSelectedMetadata();
                    }
                });
            }else if ( key[0] == "c" ) {
                viewColl( key, function( item ){
                    if ( item ){
                        if ( node.data.isroot )
                            inst.updateBtnState( "r", node.data.admin );
                        else
                            inst.updateBtnState( "c", null );
        
                        html = "Collection ID: " + key;
                        if ( item.alias )
                            html += ", Alias: " + item.alias;
                        inst.sel_id.text(html);

                        html = "\"" + item.title + "\"";
                        inst.sel_title.text(html);

                        if ( item.desc )
                            inst.sel_descr.text(item.desc);
                        else
                            inst.sel_descr.text("(none)");

                        html = "<table class='info_table'><col width='30%'><col width='70%'>";
                        html += "<tr><td>Public Access:</td><td>" + (item.ispublic?"Enabled":"Disabled") + "</td></tr>";
                        html += "<tr><td>Owner:</td><td>" + item.owner.substr(2) + (item.owner[0]=="p"?" (project)":"") + "</td></tr>";
                        if ( item.ct ){
                            date.setTime(item.ct*1000);
                            html += "<tr><td>Created:</td><td>" + date.toLocaleDateString("en-US", g_date_opts) + "</td></tr>";
                        }
                        if ( item.ut ){
                            date.setTime(item.ut*1000);
                            html += "<tr><td>Updated:</td><td>" + date.toLocaleDateString("en-US", g_date_opts) + "</td></tr>";
                        }
                        html += "</table>";
                        inst.sel_details.html(html);

                        inst.showSelectedMetadata();
                    }else{
                        inst.noInfoAvail("Insufficient permissions to view collection.");
                    }
                }); 
            } else if ( key[0] == "d" ) {
                viewData( key, function( item ){
                    if ( item ){
                        inst.updateBtnState( "d", null );

                        html = "Data ID: " + key;
                        if ( item.alias )
                            html += ", Alias: " + item.alias;
                        inst.sel_id.text(html);
                        inst.sel_title.text("\"" + item.title + "\"");

                        if ( item.desc )
                            inst.sel_descr.text( item.desc );
                        else
                            inst.sel_descr.text("(none)");

                        html = "<table class='info_table'><col width='30%'><col width='70%'>";
                        html += "<tr><td>Keywords:</td><td>" + (item.keyw?item.keyw:"N/A") + "</td></tr>";
                        html += "<tr><td>Topic:</td><td>" + (item.topic?item.topic:"N/A") + "</td></tr>";
                        html += "<tr><td>Public Access:</td><td>" + (item.ispublic?"Enabled":"Disabled") + "</td></tr>";
                        html += "<tr><td>Locked:</td><td>" + (item.locked?"Yes":"No") + "</td></tr>";
                        html += "<tr><td>Data Repo:</td><td>" + item.repoId.substr(5) + "</td></tr>";
                        html += "<tr><td>Data Size:</td><td>" + sizeToString( item.size ) + "</td></tr>";
                        if ( item.ct ){
                            date.setTime(item.ct*1000);
                            html += "<tr><td>Created:</td><td>" + date.toLocaleDateString("en-US", g_date_opts) + "</td></tr>";
                        }
                        if ( item.ut ){
                            date.setTime(item.ut*1000);
                            html += "<tr><td>Updated:</td><td>" + date.toLocaleDateString("en-US", g_date_opts) + "</td></tr>";
                        }
                        if ( item.dt ){
                            date.setTime(item.dt*1000);
                            html += "<tr><td>Uploaded:</td><td>" + date.toLocaleDateString("en-US", g_date_opts)+ "</td></tr>";
                        }
                        html += "<tr><td>Owner:</td><td>" + item.owner.substr(2) + (item.owner[0]=="p"?" (project)":"") + "</td></tr>";
                        html += "</table>";

                        inst.sel_details.html(html);
                        inst.showSelectedMetadata( item.metadata );
                    }else{
                        inst.noInfoAvail("Insufficient permissions to view data record.");
                    }
                }); 
            } else if ( key.startsWith("p/")) {
                viewProj( key, function( item ){
                    if ( item ){
                        inst.updateBtnState("p",node.data.admin);

                        inst.sel_id.text("Project ID: " + key);
                        inst.sel_title.text("\"" + item.title + "\"");

                        if ( item.desc )
                            inst.sel_descr.text(item.desc);
                        else
                            inst.sel_descr.text("(none)");

                        html = "<table class='info_table'><col width='30%'><col width='70%'>";
                        html += "<tr><td>Owner:</td><td>" + item.owner.substr(2) + "</td></tr>";
                        if ( item.ct ){
                            date.setTime(item.ct*1000);
                            html += "<tr><td>Created:</td><td>" + date.toLocaleDateString("en-US", g_date_opts) + "</td></tr>";
                        }
                        if ( item.ut ){
                            date.setTime(item.ut*1000);
                            html += "<tr><td>Updated:</td><td>" + date.toLocaleDateString("en-US", g_date_opts) + "</td></tr>";
                        }
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
                        }else if( item.subRepo ){
                            free = Math.max( Math.floor(10000*(item.subAlloc - item.subUsage)/item.subAlloc)/100, 0 );
                            html += item.subRepo + ": (sub-alloc) " + sizeToString( item.subAlloc ) + " total, " + sizeToString( item.subUsage ) + " used (" + free + " % free)";
                        }else{
                            html += "(none)";
                        }

                        html += "</td></tr></table>";
                        inst.sel_details.html(html);

                        inst.showSelectedMetadata();
                    }else{
                        inst.noInfoAvail("Insufficient permissions to view project.");
                    }
                }); 
            } else if ( key == "shared_user" && node.data.scope ) {
                inst.updateBtnState();
                //console.log( "user", node.data.scope, node );
                userView( node.data.scope, false, function( ok, item ){
                    if ( ok && item ){
                        inst.sel_id.text("User ID: " + item.uid);
                        inst.sel_title.text(item.name);
                        inst.sel_descr.text("");
                        html = "<table class='info_table'><col width='30%'><col width='70%'>";
                        html += "<tr><td>E-mail:</td><td>" + item.email + "</td></tr></table>";
                        inst.sel_details.html(html);
                        inst.showSelectedMetadata();
                    }else{
                        inst.noInfoAvail();
                    }
                });
            } else if ( key == "allocs" ) {
                inst.sel_id.text( "My Allocations" );
                inst.sel_title.text("");
                inst.sel_descr.text("Browse all allocations and associated data records.");
                inst.sel_details.html("");
            } else if ( key.startsWith( "repo/" )) {
                inst.sel_id.text( "Allocation on " + key + ", user: " + node.data.scope );
                inst.sel_title.text("");
                inst.sel_descr.text("Browse data records by allocation.");
                html = "<table class='info_table'><col width='30%'><col width='70%'>";
                // TODO deal with project sub-allocations
                html += "<tr><td>Repo ID:</td><td>" + key + "</td></tr>";
                html += "<tr><td>Capacity:</td><td>" + node.data.alloc_capacity + "</td></tr>";
                html += "<tr><td>Usage:</td><td>" + node.data.alloc_usage + "</td></tr></table>";
                inst.sel_details.html(html);

            } else {
                inst.noInfoAvail();
                //inst.data_ident.html( "" );
            }
        }

    }

    this.noInfoAvail = function( message ){
        inst.updateBtnState();
        inst.sel_id.text( message?message:"(no information)");
        inst.sel_title.text("");
        inst.sel_descr.text("(no information)");
        inst.sel_details.text("(no information)");
        inst.showSelectedMetadata();
    }


    this.buildObjSrcTree = function( obj, base ){
        //console.log("build tree", obj, base);

        var src = [], k2;
        Object.keys(obj).forEach(function(k) {
            //console.log( "key:",k, "type:", typeof obj[k] );
            k2 = escapeHTML(k);

            //console.log(key,typeof md[key]);
            if ( obj[k] === null ){
                //console.log( "is NULL" );
                src.push({title:k2 + " : null", icon: false })
            }else if ( typeof obj[k] === 'object' ){
                //console.log( "is an object" );

                var fkey=base+"."+k2;
                //console.log( fkey, "=", data_md_exp[fkey] );
                if ( inst.data_md_exp[fkey] ){
                    inst.data_md_exp[fkey] = 10;
                }
                src.push({title:k2, icon: true, folder: true, expanded: inst.data_md_exp[fkey]?true:false, children: inst.buildObjSrcTree(obj[k],fkey)})
            }else if ( typeof obj[k] === 'string' ){
                //console.log( "is a string" );
                src.push({title:k2 + " : \"" + escapeHTML( obj[k] ) + "\"", icon: false })
            }else{
                //console.log( "is an something else" );
                src.push({title:k2 + " : " + obj[k], icon: false })
            }
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
            var node = inst.data_tree.getNodeByKey("proj_own");
            if ( node ){
                var prj_id = item.id.substr(2);
                node.addNode({ title: item.title + " (" + prj_id + ")",icon:"ui-icon ui-icon-box", folder: true, key:item.id,scope:item.id,isproj:true,admin:true,nodrag:true,children:[
                    {title: "Root Collection <i class='browse-reload ui-icon ui-icon-reload'></i>",icon:"ui-icon ui-icon-folder",folder:true,lazy:true,key:"c/p_"+prj_id+"_root",scope:item.id,isroot:true,admin:true,nodrag:true}
                ]});
            }
        }else{
            // Data and/or collections
            // Get collections that this item belongs to
            getParents( item.id, function( ok, data ) {
                if ( ok ) {
                    var par = data.coll;
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

    this.execQuery = function( query ){
        setStatusText("Executing search query...");
        dataFind( query, function( ok, items ){
            console.log( "qry res:", ok, items );
            if ( ok ){
                var srch_node = inst.data_tree.getNodeByKey("search");
                var results = [];
                if ( items.length > 0 ){
                    setStatusText( "Found " + items.length + " result" + (items.length==1?"":"s"));
                    for ( var i in items ){
                        var item = items[i];
                        results.push({title:inst.generateTitle( item ),icon:"ui-icon ui-icon-file",checkbox:false,key:item.id,nodrag:false,notarg:true,scope:item.owner});
                    }
                } else {
                    setStatusText("No results found");
                    results.push({title:"(no results)",icon:false,checkbox:false,nodrag:true,notarg:true});
                }
                srch_node.removeChildren();
                srch_node.addChildren( results );
                srch_node.setExpanded( true );

                if ( !inst.data_tree.activeNode )
                    inst.showSelectedInfo();
            }else{
                dlgAlert("Query Error",items);
            }
        });
    }

    this.searchDirect = function(){
        var query = {};
        var tmp = $("#text_query").val();
        if ( tmp )
            query.quick = tmp;

        tmp = $("#meta_query").val();
        if ( tmp )
            query.meta = tmp;

        query.scopes = [];

        if ( $("#scope_selected",inst.frame).prop("checked")){
            var key, nodes = inst.data_tree.getSelectedNodes();
            for ( var i in nodes ){
                key = nodes[i].key;
                if ( key == "mydata" ){
                    query.scopes.push({scope:SS_USER});
                }else if ( key == "proj_own" ){
                    query.scopes.push({scope:SS_OWNED_PROJECTS});
                }else if ( key == "proj_adm" ){
                    query.scopes.push({scope:SS_MANAGED_PROJECTS});
                }else if ( key == "proj_mem" ){
                    query.scopes.push({scope:SS_MEMBER_PROJECTS});
                }else if ( key == "shared_all" ){
                    query.scopes.push({scope:SS_SHARED_BY_ANY_USER});
                    query.scopes.push({scope:SS_SHARED_BY_ANY_PROJECT});
                }else if ( key == "shared_user" ){
                    if ( nodes[i].data.scope )
                        query.scopes.push({scope:SS_SHARED_BY_USER,id:nodes[i].data.scope});
                    else
                        query.scopes.push({scope:SS_SHARED_BY_ANY_USER});
                }else if ( key == "shared_proj" ){
                    if ( nodes[i].data.scope )
                        query.scopes.push({scope:SS_SHARED_BY_PROJECT,id:nodes[i].data.scope});
                    else
                        query.scopes.push({scope:SS_SHARED_BY_ANY_PROJECT});
                }else if ( key.startsWith("c/") )
                    query.scopes.push({scope:SS_COLLECTION,id:key,recurse:true});
                else if ( key.startsWith("p/") )
                    query.scopes.push({scope:SS_PROJECT,id:key});
                else if ( key.startsWith("t/") ){
                    query.scopes.push({scope:SS_TOPIC,id:key,recurse:true});
                }
            }
        }else{
            if ( $("#scope_mydat",inst.frame).prop("checked"))
                query.scopes.push({scope:SS_USER});
            if ( $("#scope_myproj",inst.frame).prop("checked"))
                query.scopes.push({scope:SS_OWNED_PROJECTS});
            if ( $("#scope_otherproj",inst.frame).prop("checked")){
                query.scopes.push({scope:SS_MANAGED_PROJECTS});
                query.scopes.push({scope:SS_MEMBER_PROJECTS});
            }
            if ( $("#scope_shared",inst.frame).prop("checked")){
                query.scopes.push({scope:SS_SHARED_BY_ANY_USER});
                query.scopes.push({scope:SS_SHARED_BY_ANY_PROJECT});
            }
            if ( $("#scope_public",inst.frame).prop("checked"))
                query.scopes.push({scope:SS_PUBLIC});
        }

        //console.log("scopes:", query.scopes);

        if ( query.scopes.length && ( query.quick || query.meta ))
            inst.execQuery( query );
    }

    this.searchWizard = function(){
        dlgSearchWizard( function( query ){
            /*
            $("#query_input").val( query );
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
            inst.execQuery( query, scope );
            */
        });
    }

    this.updateSearchSelectState = function( enabled ){
        if( enabled && $("#scope_selected",inst.frame).prop("checked")){
            $(inst.data_tree_div).fancytree("option","checkbox",true);
            //$(inst.data_tree_div).fancytree("option","selectMode",2);
            $("#btn_srch_clear_select",inst.frame).button("option","disabled",false);
            inst.searchSelect = true;
        }else{
            $(inst.data_tree_div).fancytree("option","checkbox",false);
            //$(inst.data_tree_div).fancytree("option","selectMode",1);
            $("#btn_srch_clear_select",inst.frame).button("option","disabled",true);
            inst.searchSelect = false;
        }
        inst.data_tree.selectAll(false);
    }

    this.searchClearSelection = function(){
        inst.data_tree.selectAll(false);
    }

    this.generateTitle = function( item ) {
        var title = "";

        if ( item.locked )
            title += " <i class='ui-icon ui-icon-locked'></i> ";

        if ( item.alias )
            title += escapeHTML("\"" + item.title + "\" (" + item.alias.substr(item.alias.lastIndexOf(":") + 1) + ")");
        else
            title += escapeHTML("\"" + item.title + "\" [" + item.id.substr(2) + "]");

        return  title;
    }

    this.xfrUpdateHistory = function( xfr_list ){
        var len = xfr_list.length;
        var html;
        if ( len == 0 ){
            html = "(no recent transfers)";
        }else{
            html = "<table class='info_table'><tr><th>Xfr ID</th><th>Data ID</th><th>Mode</th><th>Path</th><th>Started</th><th>Updated</th><th>Status</th></tr>";
            var stat;
            var start = new Date(0);
            var update = new Date(0);

            for ( var i = 0; i < len; i++ ) {
                stat = xfr_list[i];
                html += "<tr><td>" + stat.id + "</td><td>" + stat.dataId + "</td><td>";

                switch(stat.mode){
                    case "XM_GET": html += "Get"; break;
                    case "XM_PUT": html += "Put"; break;
                    case "XM_COPY": html += "Copy"; break;
                }
                html += "</td><td>";
                if ( stat.mode == "XM_COPY" )
                    html += "d/" + stat.localPath.substr( stat.localPath.lastIndexOf("/") + 1);
                else
                    html += stat.localPath;
                html += "</td>";
                start.setTime( stat.started*1000 );
                update.setTime( stat.updated*1000 );
                html += "<td>" + start.toLocaleDateString("en-US", g_date_opts) + "</td><td>" + update.toLocaleDateString("en-US", g_date_opts) + "</td><td>";

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
                            if ( inst.xfrHist[j].id == xfr.id ){
                                inst.xfrHist.splice(j,1);
                                break;
                            }
                        }
                    }
                    inst.xfrHist = data.xfr.concat( inst.xfrHist );
                    inst.xfrUpdateHistory( inst.xfrHist );
                }
            }
            inst.pollSince = 10;
            inst.xfrTimer = setTimeout( inst.xfrHistoryPoll, 1000*(inst.pollSince-1));
        });
    }

    this.setupRepoTab = function(){
        _asyncGet( "/api/repo/list?admin=u/"+g_user.uid+"&details=true", null, function(ok,data){
            if ( ok ){
                var html;

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

    this.treeSelectNode = function( a_node, a_toggle ){
        if ( a_node.parent != inst.selectScope.parent || a_node.data.scope != inst.selectScope.data.scope ){
            setStatusText("Cannot select across collections or categories");
            return;
        }

        if ( a_toggle ){
            if ( a_node.isSelected() ){
                a_node.setSelected( false );
            }else{
                a_node.setSelected( true );
            }
        }else{
            a_node.setSelected( true );
        }
    }

    this.treeSelectRange = function( a_node ){
        if ( a_node.parent != inst.selectScope.parent || a_node.data.scope != inst.selectScope.data.scope ){
            setStatusText("Cannot select across collections or categories");
            return;
        }

        var act_node = inst.data_tree.activeNode;
        if ( act_node ){
            var parent = act_node.parent;
            if ( parent == a_node.parent ){
                var n,sel = false;
                for ( i in parent.children ){
                    n = parent.children[i];
                    if ( sel ){
                        n.setSelected( true );
                        if ( n.key == act_node.key || n.key == a_node.key )
                            break;
                    }else{
                        if ( n.key == act_node.key || n.key == a_node.key ){
                            n.setSelected( true );
                            sel = true;
                        }
                    }
                }
            }else{
                setStatusText("Range select only supported within a single collection.");
            }
        }
    }

    this.pasteAllowed = function( dest_node, src_node ){
        if ( !dest_node.data.notarg && dest_node.data.scope == src_node.data.scope ){
            if ( inst.pasteSource.key == dest_node.key )
                return false;

            if ( inst.pasteCollections.length ){
                var i,j,coll,dest_par = dest_node.getParentList(false,true);
                // Prevent collection drop in non-collection hierarchy
                for ( j in dest_par ){
                    if ( dest_par[j].data.nocoll )
                        return false;
                }
                // Prevent collection reentrancy
                // Fancytree handles this when one item selected, must check for multiple items
                if ( inst.pasteCollections.length > 1 ){
                    for ( i in inst.pasteCollections ){
                        coll = inst.pasteCollections[i];
                        for ( j in dest_par ){
                            if ( dest_par[j].key == coll.key )
                                return false;
                        }
                    }
                }
            }
            return "over";
        }else
            return false;
    }

    this.pageLoad = function( key, offset ){
        console.log("pageLoad",key, offset);
        var node = inst.data_tree.getNodeByKey( key );
        if ( node ){
            node.data.offset = offset;
            //console.log("new offset:",node.data.offset);
            node.load(true);
        }
    }

/*    this.pageLast = function( coll ){
        console.log("pageLast", coll);
    }*/

    var tree_source = [
        //{title:"Favorites <i class='browse-reload ui-icon ui-icon-reload'",folder:true,icon:"ui-icon ui-icon-heart",lazy:true,nodrag:true,key:"favorites"},
        {title:"My Data",key:"mydata",nodrag:true,icon:"ui-icon ui-icon-box",folder:true,expanded:true,children:[
            {title:"Root Collection <i class='browse-reload ui-icon ui-icon-reload'></i>",folder:true,expanded:true,icon:"ui-icon ui-icon-folder",lazy:true,key:inst.my_root_key,offset:0,user:g_user.uid,scope:"u/"+g_user.uid,nodrag:true,isroot:true,admin:true},
            {title:"Allocations",folder:true,lazy:true,icon:"ui-icon ui-icon-databases",key:"allocs",scope:"u/"+g_user.uid,nodrag:true,notarg:true,nocoll:true,checkbox:false}
        ]},
        {title:"My Projects <i class='browse-reload ui-icon ui-icon-reload'></i>",folder:true,icon:"ui-icon ui-icon-view-icons",nodrag:true,lazy:true,key:"proj_own"},
        {title:"Managed Projects <i class='browse-reload ui-icon ui-icon-reload'></i>",folder:true,icon:"ui-icon ui-icon-view-icons",nodrag:true,lazy:true,key:"proj_adm"},
        {title:"Member Projects <i class='browse-reload ui-icon ui-icon-reload'></i>",folder:true,icon:"ui-icon ui-icon-view-icons",nodrag:true,lazy:true,key:"proj_mem"},
        {title:"Shared Data",folder:true,icon:"ui-icon ui-icon-circle-plus",nodrag:true,key:"shared_all",children:[
            {title:"By User <i class='browse-reload ui-icon ui-icon-reload'></i>",nodrag:true,icon:"ui-icon ui-icon-folder",folder:true,lazy:true,key:"shared_user"},
            {title:"By Project <i class='browse-reload ui-icon ui-icon-reload'></i>",nodrag:true,icon:"ui-icon ui-icon-folder",folder:true,lazy:true,key:"shared_proj"}
        ]},
        {title:"Topics <i class='browse-reload ui-icon ui-icon-reload'></i>",checkbox:false,folder:true,icon:"ui-icon ui-icon-structure",lazy:true,nodrag:true,key:"topics",offset:0},
        //{title:"Views <i class='browse-reload ui-icon ui-icon-reload'",folder:true,icon:"ui-icon ui-icon-view-list",lazy:true,nodrag:true,key:"views"},
        {title:"Search Results",icon:"ui-icon ui-icon-zoom",checkbox:false,folder:true,children:[{title:"(no results)",icon:false, nodrag: true}],key:"search", nodrag: true },
    ];


    $("#data_tree").fancytree({
        extensions: ["dnd","themeroller"],
        toggleEffect: false,
        dnd:{
            autoExpandMS: 400,
            draggable:{
                zIndex: 1000,
                scroll: true,
                //containment: "parent",
                //revert: false,
                scrollSpeed: 10,
                scrollSensitivity: 30
            },
            dragStart: function(node, data) {
                console.log( "drag start" );
                //if ( !drag_enabled || node.key == "loose" || node.key == root_key )
                if ( !inst.drag_enabled || node.data.nodrag )
                    return false;

                if ( !node.isSelected() ){
                    inst.data_tree.selectAll(false);
                    inst.selectScope = data.node;
                    node.setSelected(true);
                }

                inst.pasteItems = inst.data_tree.getSelectedNodes();
                inst.pasteSource = inst.pasteItems[0].parent;
                inst.pasteCollections = [];
                for ( var i in inst.pasteItems ){
                    if ( inst.pasteItems[i].key.startsWith("c/") )
                        inst.pasteCollections.push( inst.pasteItems[i] );
                }
                inst.dragging = true;

                if ( data.originalEvent.ctrlKey || !node.parent.key.startsWith("c/") ) {
                    inst.drag_mode = 0;
                } else {
                    inst.drag_mode = 1;
                }
                return true;
            },
            dragDrop: function(dest_node, data) {
                inst.dragging = false;

                // data.otherNode = source, node = destination
                console.log("drop stop in",dest_node.key);

                function pasteDone(){
                    inst.pasteItems = [];
                    inst.pasteSource = null;
                    inst.pasteCollections = null;
                }

                var repo,j,dest_par = dest_node.getParentList(false,true);
                for ( j in dest_par ){
                    if ( dest_par[j].key.startsWith("repo/")){
                        repo = dest_par[j].key;
                        break;
                    }
                }

                if ( repo ){
                    dlgAlert("Move Data","Moving data between allocations is not currently supported.");
                }else{
                    if ( inst.drag_mode ){
                        inst.moveItems( inst.pasteItems, dest_node, data.otherNode, pasteDone );
                    }else{
                        inst.copyItems( inst.pasteItems, dest_node, pasteDone );
                    }
                }
            },
            dragEnter: function(node, data) {
                //console.log( "enter:", node, data );
                return inst.pasteAllowed( node, data.otherNode );
            }
        },
        themeroller: {
            activeClass: "",
            addClass: "",
            focusClass: "",
            hoverClass: "fancytree-hover",
            selectedClass: ""
        },
        source: tree_source,
        selectMode: 2,
        lazyLoad: function( event, data ) {
            if ( data.node.key == "proj_own" ){
                data.result = {
                    url: "/api/prj/list?owner=true",
                    cache: false
                };
            } else if ( data.node.key == "proj_adm" ){
                data.result = {
                    url: "/api/prj/list?admin=true",
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
            } else if ( data.node.key == "allocs" ) {
                data.result = {
                    url: "/api/repo/alloc/list/by_subject?subject=" + encodeURIComponent(data.node.data.scope),
                    cache: false
                };
            } else if ( data.node.key.startsWith( "repo/" )) {
                console.log("load repo (alloc) tree:", data.node.key );
                data.result = {
                    url: "/api/dat/list/by_alloc?repo=" + encodeURIComponent(data.node.key) + "&subject=" + encodeURIComponent(data.node.data.scope) + "&offset="+data.node.data.offset+"&count="+g_opts.page_sz,
                    cache: false
                };
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
            } else if ( data.node.key == "topics" ) {
                data.result = {
                    url: "/api/top/list?offset="+data.node.data.offset+"&count="+g_opts.page_sz,
                    cache: false
                };
            } else if ( data.node.key == "favorites" || data.node.key == "views" ) {
                data.result = [{title:"(not implemented yet)",icon:false,nodrag:true}];
            } else if ( data.node.key.startsWith("t/") ) {
                data.result = {
                    url: "/api/top/list?id=" + encodeURIComponent( data.node.key ) + "&offset="+data.node.data.offset+"&count="+g_opts.page_sz,
                    cache: false
                };
            } else {
                data.result = {
                    url: "/api/col/read?offset="+data.node.data.offset+"&count="+g_opts.page_sz+"&id=" + encodeURIComponent( data.node.key ),
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
            //console.log( "pos proc:", data );
            if ( data.node.key == "proj_own" || data.node.key == "proj_adm" || data.node.key == "proj_mem" ){
                data.result = [];
                if ( data.response.length ){
                    console.log( "pos proc project:", data.response );
                    var item;
                    var admin = (data.node.key=="proj_own"?true:false);
                    var prj_id;

                    for ( var i in data.response ) {
                        item = data.response[i];
                        prj_id = item.id.substr(2);
                        data.result.push({ title: inst.generateTitle(item),icon:"ui-icon ui-icon-box",folder:true,key: item.id,isproj:true,admin:admin,nodrag:true,children:[
                            {title: "Root Collection <i class='browse-reload ui-icon ui-icon-reload'></i>",icon:"ui-icon ui-icon-folder",folder:true,lazy:true,key:"c/p_"+prj_id+"_root",scope:item.id,isroot:true,admin:admin,nodrag:true},
                            {title:"Allocations",folder:true,lazy:true,icon:"ui-icon ui-icon-databases",key:"allocs",scope:item.id,nodrag:true,checkbox:false}
                        ]});
                    }
                }else{
                    data.result.push({ title: "(none)", icon: false, checkbox:false, nodrag:true });
                }
            } else if ( data.node.key == "shared_user" && !data.node.data.scope ){
                data.result = [];
                if ( data.response.length ){
                    var item;
                    for ( var i in data.response ) {
                        item = data.response[i];
                        data.result.push({ title: item.name + " (" + item.uid + ")",icon:"ui-icon ui-icon-box",folder:true,key:"shared_user",scope:"u/"+item.uid,lazy:true,nodrag:true});
                    }
                }else{
                    data.result.push({ title: "(none)", icon: false, checkbox:false, nodrag:true });
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
                    data.result.push({ title: "(none)", icon: false, checkbox:false, nodrag:true });
                }
            } else if ( data.node.key == "allocs" ) {
                data.result = [];
                console.log("postProc allocs:", data.response);
                if ( data.response.length ){
                    var alloc;
                    for ( var i in data.response ) {
                        alloc = data.response[i];
                        data.result.push({ title: alloc.repo.substr(5)+" <i class='browse-reload ui-icon ui-icon-reload'></i>",icon:"ui-icon ui-icon-database",folder:true,key:alloc.repo,scope:alloc.id,lazy:true,offset:0,alloc_capacity:alloc.alloc,alloc_usage:alloc.usage,nodrag:true,checkbox:false});
                    }
                }else{
                    data.result.push({ title: "(none)", icon: false, checkbox:false, nodrag:true });
                }
            //} else if ( data.node.key.startsWith( "repo/" )) {
            //    console.log("post-proc repo (alloc) tree:", data.node.key );
            } else if ( data.node.key == "topics" || data.node.key.startsWith("t/") ) {
                data.result = [];
                var item,entry;
                var items = data.response.item;
                console.log("topic resp:",data.response);
                for ( var i in items ) {
                    item = items[i];
                    if ( item.id[0]=="t" ){
                        entry = { title: item.title.charAt(0).toUpperCase() + item.title.substr(1),folder:true,lazy:true,scope:"topics",key:item.id,icon:"ui-icon ui-icon-grip-solid-horizontal",nodrag:true,offset:0 };
                    }else{
                        entry = { title: inst.generateTitle(item),scope:item.owner,key:item.id,icon:"ui-icon ui-icon-file",checkbox:false };
                    }

                    data.result.push( entry );
                }

                if ( data.response.offset > 0 || data.response.total > (data.response.offset + data.response.count) ){
                    var pages = Math.ceil(data.response.total/g_opts.page_sz), page = 1+data.response.offset/g_opts.page_sz;
                    data.result.push({title:"<button class='btn small''"+(page==1?" disabled":"")+" onclick='pageLoad(\""+data.node.key+"\",0)'>First</button> <button class='btn small'"+(page==1?" disabled":"")+" onclick='pageLoad(\""+data.node.key+"\","+(page-2)*g_opts.page_sz+")'>Prev</button> Page " + page + " of " + pages + " <button class='btn small'"+(page==pages?" disabled":"")+" onclick='pageLoad(\""+data.node.key+"\","+page*g_opts.page_sz+")'>Next</button> <button class='btn small'"+(page==pages?" disabled":"")+" onclick='pageLoad(\""+data.node.key+"\","+(pages-1)*g_opts.page_sz+")'>Last</button>",folder:false,icon:false,checkbox:false,hasBtn:true});
                }
            } else if ( data.node.key == "favorites" || data.node.key == "views" ) {
                // Not implemented yet
            } else if ( data.node.parent ) {
                //console.log("Coll read, off:",data.response.offset,"count:",data.response.count,"total:",data.response.total);
                data.result = [];
                var item,entry,scope = data.node.data.scope;
                var items = data.response.data?data.response.data:data.response.item;
                //console.log(items);

                /*if ( data.response.offset > 0 ){
                    data.result.push({title:"(Prev)",statusNodeType:"paging",folder:false,icon:false,checkbox:false,offset:data.response.offset - data.response.count});
                }*/

                for ( var i in items ) {
                    item = items[i];
                    if ( item.id[0]=="c" ){
                        entry = { title: inst.generateTitle( item ),folder:true,lazy:true,icon:"ui-icon ui-icon-folder",scope:scope,key:item.id, offset: 0 };
                    }else{
                        entry = { title: inst.generateTitle( item ),checkbox:false,folder:false,icon:"ui-icon ui-icon-file",scope:scope,key:item.id };
                    }

                    data.result.push( entry );
                }

                /*if ( data.response.total > (data.response.offset + data.response.count) ){
                    data.result.push({title:"(Next)",statusNodeType:"paging",folder:false,icon:false,checkbox:false,offset:data.response.offset + data.response.count});
                }*/
//<i class='browse-reload ui-icon ui-icon-reload'></i>

                if ( data.response.offset > 0 || data.response.total > (data.response.offset + data.response.count) ){
                    var pages = Math.ceil(data.response.total/g_opts.page_sz), page = 1+data.response.offset/g_opts.page_sz;
                    data.result.push({title:"<button class='btn small''"+(page==1?" disabled":"")+" onclick='pageLoad(\""+data.node.key+"\",0)'>First</button> <button class='btn small'"+(page==1?" disabled":"")+" onclick='pageLoad(\""+data.node.key+"\","+(page-2)*g_opts.page_sz+")'>Prev</button> Page " + page + " of " + pages + " <button class='btn small'"+(page==pages?" disabled":"")+" onclick='pageLoad(\""+data.node.key+"\","+page*g_opts.page_sz+")'>Next</button> <button class='btn small'"+(page==pages?" disabled":"")+" onclick='pageLoad(\""+data.node.key+"\","+(pages-1)*g_opts.page_sz+")'>Last</button>",folder:false,icon:false,checkbox:false,hasBtn:true});
                }
            }
        },
        renderNode: function(ev,data){
            if ( data.node.data.hasBtn ){
                $(".btn",data.node.li).button();
            }
        },
        activate: function( event, data ) {
            console.log("node activate",data.node);
            showSelectedInfo( data.node );
        },
        select: function( event, data ) {
            if ( data.node.isSelected() ){
                console.log("node select",data.node);
            }else{
                console.log("node deselect",data.node);
            }


            //if ( inst.searchSelect && data.node.isSelected() ){
            if ( data.node.isSelected() ){
                    data.node.visit( function( node ){
                    node.setSelected( false );
                });
                var parents = data.node.getParentList();
                for ( i in parents ){
                    parents[i].setSelected( false );
                }
            }
        },
        click: function(event, data) {
            //console.log("node click,ev:",event,"which:",event.which);
            if ( inst.dragging ){ // Suppress click processing on aborted drag
                inst.dragging = false;
            }else if ( !inst.searchSelect ){ // Selection "rules" differ for search-select mode
                if ( event.which == null ){
                    // Context menu (no mouse event info for some reason)
                    if ( !data.node.isSelected() ){
                        inst.data_tree.selectAll(false);
                        inst.selectScope = data.node;
                        inst.treeSelectNode(data.node);
                    }
                    // Update contextmenu choices
                    var sel = inst.data_tree.getSelectedNodes();

                    if ( !sel[0].parent.key.startsWith("c/") || sel[0].data.nodrag ){
                        inst.data_tree_div.contextmenu("enableEntry", "unlink", false );
                        inst.data_tree_div.contextmenu("enableEntry", "cut", false );
                    }else{
                        inst.data_tree_div.contextmenu("enableEntry", "unlink", true );
                        inst.data_tree_div.contextmenu("enableEntry", "cut", true );
                    }

                    var coll_sel = false;

                    // If any collections are selected, copy is not available
                    for ( i in sel ){
                        if ( sel[i].key.startsWith("c/")){
                            coll_sel = true;
                            break;
                        }
                    }
                    if ( sel[0].data.nodrag || coll_sel )
                        inst.data_tree_div.contextmenu("enableEntry", "copy", false );
                    else
                        inst.data_tree_div.contextmenu("enableEntry", "copy", true );


                    //inst.data_tree_div.contextmenu("enableEntry", "copy", (bits & 0x80) == 0 );
                    //if ( inst.pasteItems.length > 0 && sel[0].data.scope == inst.pasteItems[0].data.scope )
                    if ( inst.pasteItems.length > 0 && inst.pasteAllowed( sel[0], inst.pasteItems[0] ))
                        inst.data_tree_div.contextmenu("enableEntry", "paste", true );
                    else
                        inst.data_tree_div.contextmenu("enableEntry", "paste", false );

                } else if ( data.targetType != "expander" && data.node.data.scope ){
                    if ( inst.data_tree.getSelectedNodes().length == 0 )
                        inst.selectScope = data.node;

                    if ( data.originalEvent.shiftKey && data.originalEvent.ctrlKey ) {
                        inst.treeSelectRange(data.node);
                    }else if ( data.originalEvent.ctrlKey ) {
                        inst.treeSelectNode(data.node,true);
                    }else if ( data.originalEvent.shiftKey ) {
                        inst.data_tree.selectAll(false);
                        inst.selectScope = data.node;
                        inst.treeSelectRange(data.node);
                    }else{
                        inst.data_tree.selectAll(false);
                        inst.selectScope = data.node;
                        inst.treeSelectNode(data.node);
                    }
                }
            }
            //}
        } /*,
        clickPaging: function(event, data) {
            console.log("click paging node",data,data.node.parent,data.node.getParent());
            //var url = "/api/col/read?offset="+ data.node.data.offset +"&count=10&id=" + encodeURIComponent( data.node.parent.key );
            //console.log("new url:",url);
            data.node.parent.data.offset = data.node.data.offset;
            console.log("new offset:",data.node.parent.data.offset);
            data.node.parent.load(true);
        }*/
    });

    inst.data_tree_div = $('#data_tree');
    inst.data_tree = inst.data_tree_div.fancytree('getTree');

    inst.data_tree_div.contextmenu({
        delegate: "li",
        show: false,
        hide: false,
        menu: [
            {title: "Actions", children: [
                {title: "Edit", action: inst.editSelected, cmd: "edit" },
                //{title: "Duplicate", cmd: "dup" },
                {title: "Delete", action: inst.deleteSelected, cmd: "del" },
                {title: "Sharing", action: inst.shareSelected, cmd: "share" },
                {title: "Lock", action: inst.toggleLock, cmd: "lock" },
                {title: "Get", action: function(){ inst.xfrSelected(XFR_GET) }, cmd: "get" },
                {title: "Put", action: function(){ inst.xfrSelected(XFR_PUT) }, cmd: "put" }
                ]},
            {title: "New", children: [
                {title: "Data", action: inst.newData, cmd: "newd" },
                {title: "Collection", action: inst.newColl, cmd: "newc" },
                {title: "Project", action: newProj, cmd: "newp" }
                ]},
            {title: "----"},
            {title: "Cut", action: inst.cutSelected, cmd: "cut" },
            {title: "Copy", action: inst.copySelected, cmd: "copy" },
            {title: "Paste", action: inst.pasteSelected, cmd: "paste" },
            {title: "Unlink", action: inst.unlinkSelected, cmd: "unlink" }
            ],
        beforeOpen: function( ev, ui ){
            ev.stopPropagation();
            // Select the target before menu is shown
            ui.target.click();
        }
    });

    $("#data_md_tree").fancytree({
        extensions: ["themeroller"],
        themeroller: {
            activeClass: "",
            addClass: "",
            focusClass: "",
            hoverClass: "fancytree-hover",
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
    $("#btn_new",inst.frame).on('click', inst.newMenu );
    $("#btn_new_proj",inst.frame).on('click', function(){ $("#newmenu").hide(); inst.newProj(); });
    $("#btn_new_data",inst.frame).on('click', function(){ $("#newmenu").hide(); inst.newData(); });
    $("#btn_new_coll",inst.frame).on('click', function(){ $("#newmenu").hide(); inst.newColl(); });
    $("#btn_edit",inst.frame).on('click', inst.editSelected );
    //$("#btn_dup",inst.frame).on('click', inst.dupSelected );
    $("#btn_del",inst.frame).on('click', inst.deleteSelected );
    $("#btn_share",inst.frame).on('click', inst.shareSelected );
    $("#btn_lock",inst.frame).on('click', inst.toggleLock );
    $("#btn_upload",inst.frame).on('click', function(){ inst.xfrSelected(XFR_PUT) });
    $("#btn_download",inst.frame).on('click', function(){ inst.xfrSelected(XFR_GET) });
    //$("#btn_alloc",inst.frame).on('click', function(){ inst.editAllocSelected() });

    $("#btn_alloc",inst.frame).on('click', function(){ dlgAllocations() });

    $(document.body).on('click', '.browse-reload' , inst.reloadSelected );

    $("#text_query,#meta_query").on('keyup', function (e) {
        if (e.keyCode == 13)
            inst.searchDirect();
    });

    if ( g_user.isRepoAdmin ){
        setupRepoTab();
        $('[href="#tab-repo"]').closest('li').show();
    }

    $(".btn-refresh").button({icon:"ui-icon-refresh"});
    inputTheme( $('input'));
/*
    userView( g_user.uid, true, function( ok, user ){
        if ( ok && user ){
            g_user.isAdmin = user.isAdmin;
            g_user.isRepoAdmin = user.isRepoAdmin;
            if ( g_user.isRepoAdmin ){
                setupRepoTab();
                $('[href="#tab-repo"]').closest('li').show();
            }
            if ( user.options ){
                console.log("user opts:",user.options);
                g_opts = JSON.parse( user.options );
            }
        }
    });
*/

    $("#footer-tabs").tabs({
        heightStyle:"auto",
        collapsible: true,
        activate: function(ev,ui){
            console.log("tab activate:",ui);
            if ( ui.newPanel.length && ui.newPanel[0].id == "tab-search" ){
                inst.updateSearchSelectState( true );
            } else if ( ui.oldPanel.length && ui.oldPanel[0].id == "tab-search" ){
                inst.updateSearchSelectState( false );
            }
        }}).css({
        /*'min-height': '50px',*/
        'overflow': 'auto'
    });

    $("#sel_descr_hdr").button().click( function(){
        $("#sel_descr").slideToggle();
    });
    $("#sel_details_hdr").button().click( function(){
        $("#sel_details").slideToggle();
    });
    $("#sel_md_hdr").button().click( function(){
        $("#sel_md").slideToggle();
    });

    $("#btn_upd_pw").click( function(){
        var pw1 = $('#cli_new_pw').val();
        var pw2 = $('#cli_confirm_pw').val();
        if ( pw1.length == 0 )
            dlgAlert( "Update CLI Password", "Password cannot be empty" );
        else if ( pw1 != pw2 )
            dlgAlert( "Update CLI Password", "Passwords do not match" );
        else{
            $('#cli_new_pw').val("");
            $('#cli_confirm_pw').val("");
            _asyncGet( "/api/usr/update?uid=u/"+g_user.uid+"&pw="+pw1, null, function( ok, data ){
                if ( ok )
                    dlgAlert( "Update CLI Password", "Password successfully updated." );
                else
                    dlgAlert( "Update CLI Password", "Password update failed: " + data );
            });
        }
    });

    $("#btn_revoke_cred").click( function(){
        confirmChoice( "Revoke CLI Credentials", "Revoke credentials for ALL configured environments? The SDMS CLI will revert to interactive mode until new credentials are configured using the CLI 'setup' command.", ["Revoke","Cancel"], function(choice){
            if ( choice == 0 ){
                _asyncGet( "/api/usr/revoke_cred", null, function( ok, data ){
                    if ( ok )
                        dlgAlert( "Revoke CLI Credentials", "Credentials successfully revoked." );
                    else
                        dlgAlert( "Revoke CLI Credentials", "Credential revoke failed: " + data );
                });
            }
        });
    });

    var emailTimer;
    var emailFilter = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    var emailBad = false;

    $("#new_email").val( g_user.email ).on('input', function(){
        if ( emailTimer )
            clearTimeout( emailTimer);

        if ( emailBad ){
            $("#new_email").removeClass('ui-state-error');
            emailBad = false;
        }

        emailTimer = setTimeout( function(){
            emailTimer = null;
            var email = $("#new_email").val();

            if (!emailFilter.test(String(email).toLowerCase())) {
                setStatusText( 'Invalid e-mail entry' );
                $("#new_email").addClass('ui-state-error');
                emailBad = true;
            }else{
                _asyncGet( "/api/usr/update?uid=u/"+g_user.uid+"&email="+email, null, function( ok, data ){
                    if ( !ok )
                        dlgAlert( "Update E-mail", "E-mail update failed: " + data );
                    else
                        setStatusText( 'E-mail updated' );
                });
            }

        }, 1200 );
    });;

    $(".scope",inst.frame).checkboxradio();
    $(".scope2",inst.frame).checkboxradio();

    $("#scope_selected",inst.frame).on( "change",function(ev){
        if( $("#scope_selected",inst.frame).prop("checked")){
            $(".scope",inst.frame).checkboxradio("disable");
        }else{
            $(".scope",inst.frame).checkboxradio("enable");
        }

        inst.updateSearchSelectState( true );
    });

    $("#newmenu").menu();
    $("#lockmenu").menu();

    $("#theme-sel").val(g_theme).selectmenu({width:"auto",position:{my:"left bottom",at:"left bottom",collision:"none"}}).on('selectmenuchange', function( ev, ui ) {
        themeSet( ui.item.value );
    });

    $("#page-size").val(g_opts.page_sz).selectmenu({width:"auto",position:{my:"left bottom",at:"left bottom",collision:"none"}}).on('selectmenuchange', function( ev, ui ) {
        g_opts.page_sz = parseInt(ui.item.value);
        inst.reloadDataTree();

        _asyncGet( "/api/usr/update?uid=u/"+g_user.uid+"&opts="+encodeURIComponent(JSON.stringify(g_opts)), null, function( ok, data ){
            if ( !ok )
                dlgAlert( "Update Options Error", data );
            else
                console.log("saved");
        });
    });

    $("#xfr-poll-hours").val(g_opts.xfr_hist).selectmenu({width:"auto",position:{my:"left bottom",at:"left bottom",collision:"none"}}).on('selectmenuchange', function( ev, ui ) {
        clearTimeout( inst.xfrTimer );
        g_opts.xfr_hist = parseInt(ui.item.value);
        inst.xfrHist = [];
        inst.pollSince = g_opts.xfr_hist * 3600;
        inst.xfrTimer = setTimeout( inst.xfrHistoryPoll, 1000 );

        _asyncGet( "/api/usr/update?uid=u/"+g_user.uid+"&opts="+encodeURIComponent(JSON.stringify(g_opts)), null, function( ok, data ){
            if ( !ok )
                dlgAlert( "Update Options Error", data );
            else
                console.log("saved");
        });
    });

    this.menutimer = null;
    $("#newmenu").mouseout(function(){
        if ( !this.menutimer ){
            this.menutimer = setTimeout( function(){
                $("#newmenu").hide();
                this.menutimer = null;
            }, 1000 );
        }
    });

    $("#newmenu").mouseover(function(){
        if ( this.menutimer ){
            clearTimeout(this.menutimer);
            this.menutimer = null;
        }
    });

    //$("#left-panel").resizable({handles:"e"});

    var node = inst.data_tree.getNodeByKey( inst.my_root_key );
    node.load();
    node.setExpanded();
    inst.showSelectedInfo();
    this.xfrTimer = setTimeout( inst.xfrHistoryPoll, 1000 );
}
