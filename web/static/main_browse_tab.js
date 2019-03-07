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
    this.data_md_empty_src = [{title:"(n/a)", icon:false}];
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
    this.node_data = [];
    this.link_data = [];
    this.r = 10;
    this.nodes_grp = null;
    this.nodes = null;
    this.links_grp = null;
    this.links = null;
    this.svg = null;
    this.simulation = null;
    this.sel_node = null;
    this.tree_mode = true;

    this.windowResized = function(){
        var h = $("#data-tabs-parent").height();
        var tabs = $("#data-tabs");
        var hdr_h = $(".ui-tabs-nav",tabs).outerHeight();

        //console.log("resized, h:",h,",hdr h:",hdr_h);

        tabs.outerHeight(h);
        $(".ui-tabs-panel",tabs).outerHeight( h - hdr_h );
    }

    this.getSelectedIDs = function(){
        var ids = [];

        if ( !inst.tree_mode ){
            if ( inst.sel_node ){
                ids.push( inst.sel_node.id );
            }
        }else{
            var sel = inst.data_tree.getSelectedNodes();
            for ( var i in sel ){
                ids.push( sel[i].key );
            }
        }

        return ids;
    }

    this.refreshUI = function( a_ids, a_data, a_reload ){
        console.log("refreshUI",a_ids,a_data);

        if ( !a_ids || !a_data ){
            // If no IDs or unknown action, refresh everything
            inst.reloadNode(inst.data_tree.getNodeByKey("mydata"));
            inst.reloadNode(inst.data_tree.getNodeByKey("proj_own"));
            inst.reloadNode(inst.data_tree.getNodeByKey("proj_adm"));
            inst.reloadNode(inst.data_tree.getNodeByKey("proj_mem"));
            inst.reloadNode(inst.data_tree.getNodeByKey("shared_user"));
            inst.reloadNode(inst.data_tree.getNodeByKey("shared_proj"));
            inst.reloadNode(inst.data_tree.getNodeByKey("topics"));
            inst.reloadNode(inst.data_tree.getNodeByKey("queries"));
        }else{
            var ids = Array.isArray(a_ids)?a_ids:[a_ids];
            var data = Array.isArray(a_data)?a_data:[a_data];

            var idx;
            // Find existing ids in tree & graph and update displayed info
            inst.data_tree.visit( function(node){
                idx = ids.indexOf( node.key );
                if ( idx != -1 ){
                    node.setTitle( inst.generateTitle( data[idx] ));
                    if ( a_reload )
                        inst.reloadNode( node );
                }
            });
        }

        if ( inst.focus_node_id ){
            loadGraph( inst.focus_node_id );
        }

        if ( inst.tree_mode ){
            var node = inst.data_tree.activeNode;
            inst.showSelectedInfo( node );
        }else{
            inst.showSelectedInfo( inst.sel_node?inst.sel_node.id:null );
        }
    }

    this.deleteSelected = function(){
        var ids = inst.getSelectedIDs();
        if ( ids.length == 0 )
            return;

        var data=[],coll=[],proj=[],qry=[];
        for ( var i in ids ){
            switch ( ids[i].charAt(0) ){
                case 'd': data.push( ids[i] ); break;
                case 'c': coll.push( ids[i] ); break;
                case 'p': proj.push( ids[i] ); break;
                case 'q': qry.push( ids[i] ); break;
                default: break;
            }
        }

        var msg = "Delete selected items?";
        if ( coll.length || proj.length ){
            msg += " Note that this action will delete all data records and collections contained within selected ";
            if ( coll.length && proj.length )
                msg += "collection(s) and project(s).";
            else if ( coll.length )
                msg += "collection(s).";
            else
                msg += "project(s).";
        }

        dlgConfirmChoice( "Confirm Deletion", msg, ["Delete","Cancel"], function( choice ){
            if ( choice == 0 ){
                var done = 0;
                if ( data.length )
                    done++;
                if ( coll.length )
                    done++;

                function refreshAfterDel(){
                    refreshUI();
                }

                if ( data.length ){
                    sendDataDelete( data, function( ok, data ){
                        if ( ok ){
                            if ( --done == 0 )
                                refreshAfterDel();
                        }else
                            dlgAlert("Data Delete Error", data);
                    });
                }
                if ( coll.length ){
                    collDelete( coll, function( ok, data ){
                        if ( ok ){
                            if ( --done == 0 )
                                refreshAfterDel();
                        }else
                            dlgAlert("Collection Delete Error", data);
                    });
                }
                if ( proj.length ){
                    projDelete( proj, function( ok, data ){
                        if ( ok ){
                            inst.reloadNode(inst.data_tree.getNodeByKey("proj_own"));
                            inst.showSelectedInfo();
                        }else
                            dlgAlert("Project Delete Error", data);
                    });
                }
                if ( qry.length ){
                    sendQueryDelete( qry, function( ok, data ){
                        if ( ok ){
                            inst.reloadNode(inst.data_tree.getNodeByKey("queries"));
                            inst.showSelectedInfo();
                        }else
                            dlgAlert("Query Delete Error", data);
                    });
                }
            }
        });
    }

    this.newProj = function() {
        dlgProjNewEdit(null,function(data){
            setStatusText("Project "+data.id+" created");
            inst.reloadNode( inst.data_tree.getNodeByKey( "proj_own" ));
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

        checkPerms( parent, PERM_CREATE, function( granted ){
            if ( !granted ){
                alertPermDenied();
                return;
            }

            dlgDataNewEdit(DLG_DATA_NEW,null,parent,0,function(data,parent_id){
                var node = inst.data_tree.getNodeByKey( parent_id );
                if ( node )
                    inst.reloadNode( node );
                if ( inst.focus_node_id )
                    inst.loadGraph( inst.focus_node_id );
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

        checkPerms( parent, PERM_CREATE, function( granted ){
            if ( !granted ){
                alertPermDenied();
                return;
            }

            dlgCollNewEdit(null,parent,function(data){
                var node = inst.data_tree.getNodeByKey( data.parentId );
                if ( node )
                    inst.reloadNode( node );
            });
        });
    }

    this.setLockSelected = function( a_lock ){
        var ids = inst.getSelectedIDs();
        if ( ids.length == 0 )
            return;

        sendDataLock( ids, a_lock, function( ok, data ){
            if ( ok ){
                refreshUI( ids, data.item );
            }else{
                dlgAlert("Lock Update Failed",data);
            }
        });
    }

    this.lockSelected = function(){
        inst.setLockSelected( true );
    }

    this.unlockSelected = function(){
        inst.setLockSelected( false );
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
        console.log("moveItems",items,dest_node,inst.pasteSource);
        var item_keys = [];
        for( var i in items )
            item_keys.push( items[i].key );

        colMoveItems( item_keys, inst.pasteSource.key, dest_node.key, function( ok, msg ) {
            if ( ok ){
                console.log("move OK");

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
        var ids = inst.getSelectedIDs();

        if ( ids.length != 1 )
            return;

        var id = ids[0];
        var req_perms = 0;

        if ( id.charAt(0) == "p" || id.charAt(0) == "c")
            req_perms = PERM_WR_REC;
        else if ( id.charAt(0) == "d" )
            req_perms = PERM_WR_REC | PERM_WR_META;
        else if ( id.charAt(0) == 'q' ){
            sendQueryView( id, function( ok, old_qry ){
                if ( ok ){
                    dlgQueryNewEdit( old_qry, function( data ){
                        refreshUI( id, data, true );
                    });
                }else
                    dlgAlert("Query Edit Error",old_qry);
            });
            return;
        }else
            return;

        getPerms( id, req_perms, function( perms ){
            if (( perms & req_perms ) == 0 ){
                dlgAlert( "Cannot Perform Action", "Permission Denied." );
                return;
            }

            if ( id.charAt(0) == 'p' ){
                viewProj( id, function( data ){
                    if ( data ){
                        dlgProjNewEdit(data,function(data){
                            refreshUI( id, data );
                        });
                    }
                });
            }else if ( id.charAt(0) == "c" ) {
                viewColl( id, function( data ){
                    if ( data ){
                        dlgCollNewEdit(data,null,function(data){
                            refreshUI( id, data );
                        });
                    }
                });
            } else if ( id.charAt(0) == "d" ) {
                viewData( id, function( data ){
                    if ( data ){
                        dlgDataNewEdit(DLG_DATA_EDIT,data,null,perms,function(data){
                            refreshUI( id, data );
                        });
                    }
                }); 
            }
        });
    }

    /*
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
                    }
                }); 
            });
        }
    }*/

    this.shareSelected = function() {
        var ids = inst.getSelectedIDs();
        if ( ids.length != 1 )
            return;

        var id = ids[0];

        checkPerms( id, PERM_SHARE, function( granted ){
            if ( !granted ){
                alertPermDenied();
                return;
            }

            if ( id.charAt(0) == "c" ){
                viewColl( id, function( coll ){
                    if ( coll )
                        dlgSetACLs( coll );
                });
            } else {
                viewData( id, function( data ){
                    if ( data )
                        dlgSetACLs( data );
                });
            }
        });
    }

    this.editAllocSelected = function(){
        // TODO - use selection, not active node
        var node = inst.data_tree.activeNode;
        if ( node ) {
            dlgAllocations.show();
        }
    }

    this.depGraph = function(){
        var ids = inst.getSelectedIDs();
        if ( ids.length != 1 )
            return;

        var id = ids[0];

        if ( id.charAt(0) == "d" ) {
            loadGraph( id );
            $( "#data-tabs" ).tabs({ active: 1 });
        }
    }

    /*
    this.updateNodeTitle = function( data ){
        var title = inst.generateTitle( data );

        inst.data_tree.visit(function(node){
            if ( node.key == data.id )
                node.setTitle(title);
        });
    }*/

    this.actionDataGet = function() {
        var ids = inst.getSelectedIDs();
        if ( ids.length != 1 )
            return;

        var id = ids[0];

        if ( id.charAt(0) == "d" ) {
            dataGet( id );
        }
    }

    this.actionDataPut = function() {
        var ids = inst.getSelectedIDs();
        if ( ids.length != 1 )
            return;

        var id = ids[0];

        if ( id.charAt(0) == "d" ) {
            dataPut( id );
        }
    }

    this.calcActionState = function( sel ){
        var bits,node;

        if ( sel.length > 1 ){
            bits = 0x319;
            for ( var i in sel ){
                node = sel[i];
                switch ( node.key[0] ){
                    case "c": bits |= node.data.isroot?0xF7:0x72;  break;
                    case "d": bits |= 0x00;  break;
                    case "r": bits |= 0x1F7;  break;
                    case "p": bits |= 0x1Fa | (node.data.admin?0:5); break;
                    case "q": bits |= 0x1F9; break;
                    default:  bits |= 0x1FF;  break;
                }
            }

            //console.log("multi",bits);
        }else if ( sel.length ){
            node = sel[0];

            switch ( node.key[0] ){
                case "c": bits = node.data.isroot?0x2F7:0x272;  break;
                case "d":
                    if ( node.parent.key.startsWith("c/"))
                        bits = 0x00;
                    else
                        bits = 0x100;
                    break;
                case "p": bits = 0x3Fa | (node.data.admin?0:5); break;
                case "q": bits = 0x3F8; break;
                default:  bits = 0x3FF;  break;
            }
            //console.log("single",bits);
        }else{
            bits = 0xFF;
        }

        return bits;
    }

    this.updateBtnState = function(){
        //console.log("updateBtnState");

        var sel = inst.data_tree.getSelectedNodes();
        var bits = calcActionState( sel );

        $("#btn_edit",inst.frame).button("option","disabled",(bits & 1) != 0 );
        //$("#btn_dup",inst.frame).button("option","disabled",(bits & 2) != 0);
        $("#btn_del",inst.frame).button("option","disabled",(bits & 4) != 0 );
        $("#btn_share",inst.frame).button("option","disabled",(bits & 8) != 0 );
        $("#btn_upload",inst.frame).button("option","disabled",(bits & 0x10) != 0 );
        $("#btn_download",inst.frame).button("option","disabled",(bits & 0x20) != 0);
        $("#btn_lock",inst.frame).button("option","disabled",(bits & 0x40) != 0);
        $("#btn_unlock",inst.frame).button("option","disabled",(bits & 0x40) != 0);
        $("#btn_new_data",inst.frame).button("option","disabled",(bits & 0x100) != 0 );
        $("#btn_new_coll",inst.frame).button("option","disabled",(bits & 0x100) != 0 );
        //$("#btn_unlink",inst.frame).button("option","disabled",(bits & 0x80) != 0);
        $("#btn_dep_graph",inst.frame).button("option","disabled",(bits & 0x200) != 0 );

        inst.data_tree_div.contextmenu("enableEntry", "edit", (bits & 1) == 0 );
        //inst.data_tree_div.contextmenu("enableEntry", "dup", (bits & 2) == 0 );
        inst.data_tree_div.contextmenu("enableEntry", "del", (bits & 4) == 0 );
        inst.data_tree_div.contextmenu("enableEntry", "share", (bits & 8) == 0 );
        inst.data_tree_div.contextmenu("enableEntry", "put", (bits & 0x10) == 0 );
        inst.data_tree_div.contextmenu("enableEntry", "get", (bits & 0x20) == 0 );
        inst.data_tree_div.contextmenu("enableEntry", "lock", (bits & 0x40) == 0 );
        inst.data_tree_div.contextmenu("enableEntry", "unlock", (bits & 0x40) == 0 );
        inst.data_tree_div.contextmenu("enableEntry", "unlink", (bits & 0x80) == 0 );
        inst.data_tree_div.contextmenu("enableEntry", "newd", (bits & 0x100) == 0 );
        inst.data_tree_div.contextmenu("enableEntry", "newc", (bits & 0x100) == 0 );
        inst.data_tree_div.contextmenu("enableEntry", "graph", (bits & 0x200) == 0 );
    }

    this.reloadNode = function( node ){
        if ( !node || node.isLazy() && !node.isLoaded() )
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
        // Triggered from refresh button on node
        var node = inst.data_tree.activeNode;
        if ( node ){
            inst.reloadNode( node );
        }
    }

    /*
    inst.getRefreshNode = function(a_node){
        //console.log("getRefreshNode",a_node);
        var node = a_node.parent,prev = a_node;
        while(node){
            if ( !node.key.startsWith("c/")){
                return node;
            }
            prev = node;
            node = node.parent;
        }
    }*/

    this.showSelectedInfo = function( node ){
        if ( !node ){
            inst.noInfoAvail();
        }else{
            //console.log( "node key:", node.key );
            var key,i,html;
            var date = new Date();

            if ( typeof node == 'string' )
                key = node;
            else if ( node.key == "shared_proj" && node.data.scope )
                key = node.data.scope;
            else
                key = node.key;

            if ( key == "mydata" ) {
                inst.sel_id.text( "My Data" );
                inst.sel_title.text( "" );
                inst.sel_descr.text( "Location for creating and organizing personal data and collections." );
                inst.showSelectedMetadata();

                userView( g_user.uid, true, function( ok, user ){
                    if ( ok && user ){
                        html = "<table class='info_table'><col width='20%'><col width='80%'>";
                        html += "<tr><td>Allocation(s):</td><td>";

                        if ( user.alloc && user.alloc.length ){
                            var alloc,free;
                            for ( i in user.alloc ){
                                alloc = user.alloc[i]
                                free = Math.max( Math.floor(10000*(alloc.alloc - alloc.usage)/alloc.alloc)/100, 0 );
                                html += alloc.repo + ": " + sizeToString( alloc.alloc ) + " total, " + sizeToString( alloc.usage ) + " used (" + free + " % free)<br>";
                            }
                        }else{
                            html += "(n/a)";
                        }
                        html += "</table>";
                        inst.sel_details.html(html);
                        $("#sel_references").html("(n/a)");
                        inst.showSelectedMetadata();
                    }
                });
            }else if ( key[0] == "c" ) {
                viewColl( key, function( item ){
                    if ( item ){
                        html = "Collection ID: " + key;
                        if ( item.alias )
                            html += ", Alias: " + item.alias;
                        inst.sel_id.text(html);

                        html = "\"" + item.title + "\"";
                        inst.sel_title.text(html);

                        if ( item.desc )
                            inst.sel_descr.text(item.desc);
                        else
                            inst.sel_descr.text("(n/a)");

                        html = "<table class='info_table'><col width='20%'><col width='80%'>";
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
                        $("#sel_references").html("(n/a)");

                        inst.showSelectedMetadata();
                    }else{
                        inst.noInfoAvail("Insufficient permissions to view collection.");
                    }
                }); 
            } else if ( key[0] == "d" ) {
                viewData( key, function( item ){
                    if ( item ){
                        html = "Data ID: " + key;
                        if ( item.alias )
                            html += ", Alias: " + item.alias;
                        inst.sel_id.text(html);
                        inst.sel_title.text("\"" + item.title + "\"");

                        if ( item.desc )
                            inst.sel_descr.text( item.desc );
                        else
                            inst.sel_descr.text("(n/a)");

                        html = "<table class='info_table'><col width='20%'><col width='80%'>";
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
                        if ( item.deps && item.deps.length ){
                            var dep,id;
                            html = "";
                            for ( i in item.deps ){
                                dep = item.deps[i];
                                id = dep.id + (dep.alias?" ("+dep.alias+")":"");

                                if ( dep.dir == "DEP_OUT" ){
                                    switch(dep.type){
                                        case "DEP_IS_DERIVED_FROM":
                                            html += "Derived from " + id + "<br>";
                                            break;
                                        case "DEP_IS_COMPONENT_OF":
                                            html += "Component of " + id + "<br>";
                                            break;
                                        case "DEP_IS_NEW_VERSION_OF":
                                            html += "New version of " + id + "<br>";
                                            break;
                                    }
                                }else{
                                    switch(dep.type){
                                        case "DEP_IS_DERIVED_FROM":
                                            html += "Precursor of " + id + "<br>";
                                            break;
                                        case "DEP_IS_COMPONENT_OF":
                                            html += "Container of " + id + "<br>";
                                            break;
                                        case "DEP_IS_NEW_VERSION_OF":
                                            html += "Old version of " + id + "<br>";
                                            break;
                                    }
                                }

                                //html += dep.id + " " + dep.type + " " + dep.dir + "<BR>";
                            }
                            $("#sel_references").html(html);
                        }else{
                            $("#sel_references").html("(n/a)");
                        }
                        inst.showSelectedMetadata( item.metadata );
                    }else{
                        inst.noInfoAvail("Insufficient permissions to view data record.");
                    }
                }); 
            } else if ( key.startsWith("p/")) {
                viewProj( key, function( item ){
                    if ( item ){
                        inst.sel_id.text("Project ID: " + key);
                        inst.sel_title.text("\"" + item.title + "\"");

                        if ( item.desc )
                            inst.sel_descr.text(item.desc);
                        else
                            inst.sel_descr.text("(n/a)");

                        html = "<table class='info_table'><col width='20%'><col width='80%'>";
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
                            html += "(n/a)";
                        }
                        html += "</td></tr>";
                        html += "<tr><td>Members:</td><td>";
                        if ( item.member && item.member.length ){
                            for ( i in item.member )
                                html += item.member[i].substr(2) + " ";
                        }else{
                            html += "(n/a)";
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
                            html += "(n/a)";
                        }

                        html += "</td></tr></table>";
                        inst.sel_details.html(html);
                        $("#sel_references").html("(n/a)");

                        inst.showSelectedMetadata();
                    }else{
                        inst.noInfoAvail("Insufficient permissions to view project.");
                    }
                }); 
            } else if ( key.startsWith("q/")) {
                sendQueryView( key, function( ok, item ){
                    if ( ok && item ){
                        inst.sel_id.text("Query ID: " + item.id);
                        inst.sel_title.text(item.title);
                        var qry = JSON.parse( item.query );
                        console.log("qry:",qry);
                        inst.sel_descr.html("<table class='info_table'><col width='20%'><col width='80%'><tr><td>Text:</td><td>"+(qry.quick?qry.quick:"(n/a)")+"</td></tr><tr><td>Metadata:</td><td>"+(qry.meta?qry.meta:"(n/a)")+"</td></tr></table>");
                        html = "<table class='info_table'><col width='20%'><col width='80%'>";
                        html += "<tr><td>Owner:</td><td>" + item.owner.substr(2) + "</td></tr>";
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
                        $("#sel_references").html("(n/a)");
                        inst.showSelectedMetadata();
                    }else{
                        inst.noInfoAvail();
                    }
                });
            } else if ( key == "shared_user" && node.data.scope ) {
                //console.log( "user", node.data.scope, node );
                userView( node.data.scope, false, function( ok, item ){
                    if ( ok && item ){
                        inst.sel_id.text("User ID: " + item.uid);
                        inst.sel_title.text(item.name);
                        inst.sel_descr.text("(n/a)");
                        html = "<table class='info_table'><col width='20%'><col width='80%'>";
                        html += "<tr><td>E-mail:</td><td>" + item.email + "</td></tr></table>";
                        inst.sel_details.html(html);
                        $("#sel_references").html("(n/a)");
                        inst.showSelectedMetadata();
                    }else{
                        inst.noInfoAvail();
                    }
                });
            } else if ( key == "allocs" ) {
                inst.sel_id.text( "My Allocations" );
                inst.sel_title.text("");
                inst.sel_descr.text("Browse all allocations and associated data records.");
                inst.sel_details.html("(n/a)");
                $("#sel_references").html("(n/a)");
            } else if ( key.startsWith( "repo/" )) {
                inst.sel_id.text( "Allocation on " + key + ", user: " + node.data.scope );
                inst.sel_title.text("");
                inst.sel_descr.text("Browse data records by allocation.");
                html = "<table class='info_table'><col width='20%'><col width='80%'>";
                // TODO deal with project sub-allocations
                html += "<tr><td>Repo ID:</td><td>" + key + "</td></tr>";
                html += "<tr><td>Capacity:</td><td>" + node.data.alloc_capacity + "</td></tr>";
                html += "<tr><td>Usage:</td><td>" + node.data.alloc_usage + "</td></tr></table>";
                inst.sel_details.html(html);
                $("#sel_references").html("(n/a)");

            } else {
                inst.noInfoAvail();
                //inst.data_ident.html( "" );
            }
        }

    }

    this.noInfoAvail = function( message ){
        inst.sel_id.text( message?message:"(n/a)");
        inst.sel_title.text("");
        inst.sel_descr.text("(n/a)");
        inst.sel_details.text("(n/a)");
        $("#sel_references").html("(n/a)");
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

    /*
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
    }*/

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

    this.parseQuickSearch = function(){
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

        // TODO make sure at least one scope set and on term
        return query;
    }

    this.searchDirect = function(){
        var query = parseQuickSearch();

        if ( query.scopes.length && ( query.quick || query.meta ))
            inst.execQuery( query );
    }

    this.querySave = function(){
        dlgSingleEntry( "Save Query", "Query Title:", ["Save","Cancel"], function(btn,val){
            if ( btn == 0 ){
                var query = parseQuickSearch();
                sendQueryCreate( val, query, function( ok, data ){
                    if ( ok )
                        inst.reloadNode(inst.data_tree.getNodeByKey("queries"));
                    else
                        dlgAlert( "Query Save Error", data );
                });
            }
        });
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
            title += "<i class='ui-icon ui-icon-locked'></i> ";

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

    this.xfrHistoryPoll = function(){
        //console.log("xfrHistoryPoll",inst.pollSince);

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

    this.loadGraph = function( a_id ){
        inst.focus_node_id = a_id;
        inst.sel_node_id = a_id;

        //console.log("owner:",a_owner);
        dataGetDeps( a_id, function( a_data ){
            //console.log("dep data:",a_data);
            var item, i, j, dep, node;

            inst.link_data = [];
            var new_node_data = [];
            var id_map = {};

            for ( i in a_data.item ){
                if ( a_data.item[i].id == a_id ){
                    inst.graph_owner = a_data.item[i].owner;
                    break;
                }
            }

            //node.label = item.owner.charAt(0)+":"+item.owner.substr(2)+":"+item.alias;

            for ( i in a_data.item ){
                item = a_data.item[i];
                console.log("node:",item);
                node = {id:item.id /*,title:item.title*/}
                if ( item.alias ){
                    node.label = item.alias;
                }else
                    node.label = item.id;

                if ( item.gen != undefined ){
                    node.row = item.gen;
                    node.col = 0;
                }

                if ( item.id == a_id ){
                    node.comp = true;
                }

                id_map[node.id] = new_node_data.length;
                new_node_data.push(node);
                for ( j in item.dep ){
                    dep = item.dep[j];
                    inst.link_data.push({source:item.id,target:dep.id,ty:DepTypeFromString[dep.type],id:item.id+"-"+dep.id});
                }
            }

            // Copy any existing position data to new nodes
            var node2;
            for ( i in inst.node_data ){
                node = inst.node_data[i];
                if ( id_map[node.id] != undefined ){
                    node2 = new_node_data[id_map[node.id]];
                    node2.x = node.x;
                    node2.y = node.y;
                }
            }

            inst.node_data = new_node_data;

            inst.renderDepGraph();
        });
    }

    this.renderDepGraph = function(){
        var g;

        inst.links = inst.links_grp.selectAll('line')
            .data( inst.link_data, function(d) { return d.id; });

            inst.links.enter()
            .append("line")
                .attr('marker-start',function(d){
                    switch ( d.ty ){
                        case 0: return 'url(#arrow-derivation)';
                        case 1: return 'url(#arrow-component)';
                        case 2: return 'url(#arrow-new-version)';
                    }
                })
                .attr('class',function(d){
                    switch ( d.ty ){
                        case 0: return 'link derivation';
                        case 1: return 'link component';
                        case 2: return 'link new-version';
                    }
                });

        inst.links.exit()
            .remove();

        inst.links = inst.links_grp.selectAll('line');

        inst.nodes = inst.nodes_grp.selectAll('g')
            .data( inst.node_data, function(d) { return d.id; });

        // Update
        inst.nodes.select("circle.obj")
            .attr('class',function(d){
                var res = 'obj ';

                console.log("upd node", d );

                if ( d.id == inst.focus_node_id )
                    res += "main";
                else if ( d.row != undefined )
                    res += "prov";
                else{
                    console.log("upd other node", d );
                    res += "other";
                }

                if ( d.comp )
                    res += " comp";
                else
                    res += " part";

                return res;
            });

        inst.nodes.select("text")
            .text(function(d) {
                return d.label;
            });

        inst.nodes.selectAll(".node > circle.select")
            .attr("class", function(d){
                if ( d.id == inst.sel_node_id ){
                    inst.sel_node = d;
                    return "select highlight";
                }else
                    return "select hidden";
            });

        g = inst.nodes.enter()
            .append("g")
                .attr("class", "node")
                .call(d3.drag()
                    .on("start", inst.dragStarted)
                    .on("drag", inst.dragged)
                    .on("end", inst.dragEnded));

        g.append("circle")
            .attr("r", r)
            .attr('class',function(d){
                var res = 'obj ';
                
                if ( d.id == inst.focus_node_id )
                    res += "main";
                else if ( d.row != undefined )
                    res += "prov";
                else{
                    res += "other";
                    console.log("new other node", d );
                }

                if ( d.comp )
                    res += " comp";
                else
                    res += " part";

                return res;
            })
            .on("click", function(d,i){
                d3.select(".highlight")
                    .attr("class","select hidden");
                d3.select(this.parentNode).select(".select")
                    .attr("class","select highlight");
                inst.sel_node = d;
                inst.sel_node_id = d.id;
                inst.showSelectedInfo( d.id );
            });

        g.append("circle")
            .attr("r", r*1.5)
            .attr("class", function(d){
                if ( d.id == inst.sel_node_id ){
                    inst.sel_node = d;
                    return "select highlight";
                }else
                    return "select hidden";
            });

        g.append("text")
            .text(function(d) {
                return d.label;
            })
            .attr('x', r)
            .attr('y', -r)
            .attr("fill", "white");

        inst.nodes.exit()
            .remove();

        inst.nodes = inst.nodes_grp.selectAll('g');

        if ( inst.simulation ){
            console.log("restart sim");
            inst.simulation
                .nodes(inst.node_data)
                .force("link").links(inst.link_data);

            inst.simulation.alpha(1).restart();
        }else{
            var linkForce = d3.forceLink(inst.link_data)
                .strength(function(d){
                    switch(d.ty){
                        case 0: return .2;
                        case 1: return .2;
                        case 2: return .1;
                    }
                })
                .id( function(d) { return d.id; })

            inst.simulation = d3.forceSimulation()
                .nodes(inst.node_data)
                //.force('center', d3.forceCenter(200,200))
                .force('charge', d3.forceManyBody()
                    .strength(-200))
                .force('row', d3.forceY( function(d,i){ return d.row != undefined ?(75 + d.row*75):0; })
                    .strength( function(d){ return d.row != undefined ?.1:0; }))
                .force('col', d3.forceX(function(d,i){ return d.col != undefined?200:0; })
                    .strength( function(d){ return d.col != undefined ?.1:0; }))
                .force("link", linkForce )
                .on('tick', inst.simTick);

        }
    }

    this.dragStarted = function(d) {
        //console.log("drag start",d.id);
        if (!d3.event.active) inst.simulation.alphaTarget(0.3).restart();
        d.fx = d3.event.x;
        d.fy = d3.event.y;
    }

    this.dragged = function(d) {
        //console.log("drag",d3.event.x,d3.event.y);
        d.fx = d3.event.x;
        d.fy = d3.event.y;
        inst.simTick(); 
    }

    this.dragEnded = function(d){
        //console.log("drag start",d.id);
        if (!d3.event.active) inst.simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
    }

    this.graphNodeFind = function( a_id ){
        for ( var i in inst.node_data ){
            if ( inst.node_data[i].id == a_id )
                return inst.node_data[i];
        }
    }

    this.graphLinkFind = function( a_id ){
        for ( var i in inst.link_data ){
            if ( inst.link_data[i].id == a_id )
                return inst.link_data[i];
        }
    }

    this.graphNodeExpand = function(){
        console.log("expand node");
        if ( inst.sel_node ){
            //var exp_node = graphNodeFind( inst.sel_node )
            viewData( inst.sel_node.id, function( data ){
                if ( data && data.deps ){
                    console.log("node:",data);
                    /*
                    inst.sel_node.comp = true;
                    var dep,node,i,id;
                    for ( i in data.deps ){
                        dep = data.deps[i];

                        node = inst.graphNodeFind(dep.id);

                        if ( dep.dir == "DEP_IN" )
                            id = dep.id+"-"+data.id;
                        else
                            id = data.id+"-"+dep.id;

                        if ( !node ){
                            console.log("adding node");
                            inst.node_data.push({id:dep.id,label:dep.alias?dep.alias:dep.id});
                        }else if ( inst.graphLinkFind( id ))
                            continue;
                        console.log("adding link");

                        if ( dep.dir == "DEP_IN" )
                            inst.link_data.push({source:dep.id,target:data.id,ty:DepTypeFromString[dep.type],id:id});
                        else
                            inst.link_data.push({source:data.id,target:dep.id,ty:DepTypeFromString[dep.type],id:id});
                    }*/
                    for ( var i in inst.node_data ){
                        var node = inst.node_data[i];
                        console.log("node old:",node);
                        node.vx = null;
                        node.vy = null;
                    }
        
                    inst.renderDepGraph();
                    //inst.loadGraph(inst.focus_node_id);
                }
            });
        }
    }

    this.graphNodeCollapse = function(){
        console.log("collapse node");
    }

    this.simTick = function() {
        //console.log("tick");
        inst.nodes
            .attr("transform", function(d) {
                return "translate(" + d.x + "," + d.y + ")"; });

        inst.links
            .attr("x1", function(d) { return d.source.x; })
            .attr("y1", function(d) { return d.source.y; })
            .attr("x2", function(d) { return d.target.x; })
            .attr("y2", function(d) { return d.target.y; });
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
        console.log("pasteAllowed:",dest_node, src_node);
        console.log("pasteSource:",inst.pasteSource);
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

    /*{title:"My Data",key:"mydata",nodrag:true,icon:"ui-icon ui-icon-box",folder:true,expanded:true,children:[
        {title:"Root Collection <i class='browse-reload ui-icon ui-icon-reload'></i>",folder:true,expanded:true,icon:"ui-icon ui-icon-folder",lazy:true,key:inst.my_root_key,offset:0,user:g_user.uid,scope:"u/"+g_user.uid,nodrag:true,isroot:true,admin:true},
        {title:"Allocations <i class='browse-reload ui-icon ui-icon-reload'></i>",folder:true,lazy:true,icon:"ui-icon ui-icon-databases",key:"allocs",scope:"u/"+g_user.uid,nodrag:true,notarg:true,nocoll:true,checkbox:false}
    ]},*/

    var tree_source = [
        //{title:"Favorites <i class='browse-reload ui-icon ui-icon-reload'",folder:true,icon:"ui-icon ui-icon-heart",lazy:true,nodrag:true,key:"favorites"},
        {title:"My Data <i class='browse-reload ui-icon ui-icon-reload'></i>",key:"mydata",nodrag:true,icon:"ui-icon ui-icon-box",folder:true,expanded:false,lazy:true},
        {title:"My Projects <i class='browse-reload ui-icon ui-icon-reload'></i>",folder:true,icon:"ui-icon ui-icon-view-icons",nodrag:true,lazy:true,key:"proj_own"},
        {title:"Managed Projects <i class='browse-reload ui-icon ui-icon-reload'></i>",folder:true,icon:"ui-icon ui-icon-view-icons",nodrag:true,lazy:true,key:"proj_adm"},
        {title:"Member Projects <i class='browse-reload ui-icon ui-icon-reload'></i>",folder:true,icon:"ui-icon ui-icon-view-icons",nodrag:true,lazy:true,key:"proj_mem"},
        {title:"Shared Data",folder:true,icon:"ui-icon ui-icon-circle-plus",nodrag:true,key:"shared_all",children:[
            {title:"By User <i class='browse-reload ui-icon ui-icon-reload'></i>",nodrag:true,icon:"ui-icon ui-icon-folder",folder:true,lazy:true,key:"shared_user"},
            {title:"By Project <i class='browse-reload ui-icon ui-icon-reload'></i>",nodrag:true,icon:"ui-icon ui-icon-folder",folder:true,lazy:true,key:"shared_proj"}
        ]},
        {title:"Topics <i class='browse-reload ui-icon ui-icon-reload'></i>",checkbox:false,folder:true,icon:"ui-icon ui-icon-structure",lazy:true,nodrag:true,key:"topics",offset:0},
        {title:"Saved Queries <i class='browse-reload ui-icon ui-icon-reload'></i>",folder:true,icon:"ui-icon ui-icon-view-list",lazy:true,nodrag:true,key:"queries",checkbox:false,offset:0},
        {title:"Search Results",icon:"ui-icon ui-icon-zoom",checkbox:false,folder:true,children:[{title:"(no results)",icon:false, nodrag:true,checkbox:false}],key:"search",nodrag:true}
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
                if ( !inst.drag_enabled || node.data.nodrag ){
                    console.log("abort drag start");
                    return false;
                }
                clearTimeout( inst.hoverTimer );
                node.setActive(true);
                if ( !node.isSelected() ){
                    console.log( "clear selection" );
                    inst.data_tree.selectAll(false);
                    inst.selectScope = data.node;
                    node.setSelected(true);
                }

                inst.pasteItems = inst.data_tree.getSelectedNodes();
                console.log( "drag start", inst.pasteItems );

                inst.pasteSource = inst.pasteItems[0].parent;
                inst.pasteCollections = [];
                for ( var i in inst.pasteItems ){
                    if ( inst.pasteItems[i].key.startsWith("c/") )
                        inst.pasteCollections.push( inst.pasteItems[i] );
                }
                inst.dragging = true;

                if ( data.originalEvent.ctrlKey || data.originalEvent.metaKey || !node.parent.key.startsWith("c/") ) {
                    inst.drag_mode = 0;
                } else {
                    inst.drag_mode = 1;
                }
                return true;
            },
            dragDrop: function(dest_node, data) {
                inst.dragging = false;

                // data.otherNode = source, node = destination
                console.log("drop stop in",dest_node.key,inst.pasteItems);

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
                        inst.moveItems( inst.pasteItems, dest_node, /*data.otherNode,*/ pasteDone );
                    }else{
                        inst.copyItems( inst.pasteItems, dest_node, pasteDone );
                    }
                }
            },
            dragEnter: function(node, data) {
                if ( inst.dragging ){
                    //console.log( "drag enter:", node, data );
                    return inst.pasteAllowed( node, data.otherNode );
                }else{
                    return false;
                }
            }
        },
        themeroller: {
            activeClass: "my-fancytree-active",
            addClass: "",
            focusClass: "",
            hoverClass: "my-fancytree-hover",
            selectedClass: ""
        },
        source: tree_source,
        selectMode: 2,
        collapse: function( event, data ) {
            if ( data.node.isLazy() ){
                console.log("collapse");
                data.node.resetLazy();
            }
        },
        lazyLoad: function( event, data ) {
            if ( data.node.key == "mydata" ){
                data.result = [
                    {title:"Root Collection",folder:true,expanded:false,icon:"ui-icon ui-icon-folder",lazy:true,key:inst.my_root_key,offset:0,user:g_user.uid,scope:"u/"+g_user.uid,nodrag:true,isroot:true,admin:true},
                    {title:"Allocations",folder:true,lazy:true,icon:"ui-icon ui-icon-databases",key:"allocs",scope:"u/"+g_user.uid,nodrag:true,notarg:true,nocoll:true,checkbox:false}
                ];
            }else if ( data.node.key == "proj_own" ){
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
            }else if ( data.node.key.startsWith("p/")){
                var prj_id = data.node.key.substr(2);
                data.result = [
                    {title: "Root Collection",icon:"ui-icon ui-icon-folder",folder:true,lazy:true,key:"c/p_"+prj_id+"_root",scope:data.node.key,isroot:true,admin:data.node.data.admin,nodrag:true},
                    {title:"Allocations",folder:true,lazy:true,icon:"ui-icon ui-icon-databases",key:"allocs",scope:data.node.key,nodrag:true,checkbox:false}
                ];
            } else if ( data.node.key.startsWith( "shared_user" )) {
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
                data.result = {
                    url: "/api/dat/list/by_alloc?repo=" + encodeURIComponent(data.node.key) + "&subject=" + encodeURIComponent(data.node.data.scope) + "&offset="+data.node.data.offset+"&count="+g_opts.page_sz,
                    cache: false
                };
            } else if ( data.node.key.startsWith( "shared_proj" )) {
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
            } else if ( data.node.key == 'queries') {
                data.result = {
                    url: "/api/query/list?offset="+data.node.data.offset+"&count="+g_opts.page_sz,
                    cache: false
                };
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
            } else if ( data.node.key.startsWith("q/") ) {
                data.result = {
                    url: "/api/query/exec?id=" + encodeURIComponent( data.node.key ),
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
            if ( data.node.key == "mydata" || data.node.key.startsWith("p/")){
                //console.log("post mydata",data.response);
            }else if ( data.node.key == "proj_own" || data.node.key == "proj_adm" || data.node.key == "proj_mem" ){
                    data.result = [];
                if ( data.response.length ){
                    console.log( "pos proc project:", data.response );
                    var item;
                    var admin = (data.node.key=="proj_own"?true:false);
                    //var prj_id;

                    for ( var i in data.response ) {
                        item = data.response[i];
                        //prj_id = item.id.substr(2);
                        data.result.push({ title: inst.generateTitle(item)+" <i class='browse-reload ui-icon ui-icon-reload'></i>",icon:"ui-icon ui-icon-box",folder:true,key:item.id,isproj:true,admin:admin,nodrag:true,lazy:true});
                        /*children:[
                            {title: "Root Collection <i class='browse-reload ui-icon ui-icon-reload'></i>",icon:"ui-icon ui-icon-folder",folder:true,lazy:true,key:"c/p_"+prj_id+"_root",scope:item.id,isroot:true,admin:admin,nodrag:true},
                            {title:"Allocations <i class='browse-reload ui-icon ui-icon-reload'></i>",folder:true,lazy:true,icon:"ui-icon ui-icon-databases",key:"allocs",scope:item.id,nodrag:true,checkbox:false}
                        ]});*/
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
                        data.result.push({ title: item.name + " (" + item.uid + ") <i class='browse-reload ui-icon ui-icon-reload'></i>",icon:"ui-icon ui-icon-box",folder:true,key:"shared_user_"+item.uid,scope:"u/"+item.uid,lazy:true,nodrag:true});
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
                        data.result.push({ title: inst.generateTitle(item) + " <i class='browse-reload ui-icon ui-icon-reload'></i>",icon:"ui-icon ui-icon-box",folder:true,key:"shared_proj_"+item.id,scope:item.id,lazy:true,nodrag:true});
                    }
                }else{
                    data.result.push({ title: "(none)", icon: false, checkbox:false, nodrag:true });
                }
            } else if ( data.node.key == "queries" ) {
                data.result = [];
                if ( data.response.length ){
                    var qry;
                    for ( var i in data.response ) {
                        qry = data.response[i];
                        data.result.push({ title: qry.title+" <i class='browse-reload ui-icon ui-icon-reload'></i>",icon:"ui-icon ui-icon-zoom",folder:true,key:qry.id,lazy:true,offset:0,checkbox:false,nodrag:true});
                    }
                }else{
                    data.result.push({ title: "(none)", icon: false, checkbox:false, nodrag:true });
                }
            } else if ( data.node.key == "allocs" ) {
                data.result = [];
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
                //console.log("pos proc default",data.node.key,data.response);
                data.result = [];
                var item,entry,scope = data.node.data.scope;
                var items = data.response.data?data.response.data:data.response.item;
                for ( var i in items ) {
                    item = items[i];
                    if ( item.id[0]=="c" ){
                        entry = { title: inst.generateTitle( item ),folder:true,lazy:true,icon:"ui-icon ui-icon-folder",scope:scope,key:item.id, offset: 0 };
                    }else{
                        entry = { title: inst.generateTitle( item ),checkbox:false,folder:false,icon:"ui-icon ui-icon-file",scope:item.owner?item.owner:scope,key:item.id };
                    }

                    data.result.push( entry );
                }

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
            if ( inst.keyNav && !inst.keyNavMS ){
                inst.data_tree.selectAll(false);
                inst.selectScope = data.node;
                inst.treeSelectNode(data.node);
            }
            inst.keyNav = false;

            showSelectedInfo( data.node );
        },
        select: function( event, data ) {
            /*if ( data.node.isSelected() ){
                console.log("node select",data.node);
            }else{
                console.log("node deselect",data.node);
            }*/

            //if ( inst.searchSelect && data.node.isSelected() ){
            if ( data.node.isSelected() ){
                //showSelectedInfo( data.node );

                data.node.visit( function( node ){
                    node.setSelected( false );
                });
                var parents = data.node.getParentList();
                for ( i in parents ){
                    parents[i].setSelected( false );
                }
            }

            inst.updateBtnState();
        },
        keydown: function(ev, data) {
            //console.log("keydown",ev.keyCode);
            if ( ev.keyCode == 32 ){
                if ( inst.data_tree.getSelectedNodes().length == 0 ){
                    inst.selectScope = data.node;
                }
                inst.treeSelectNode(data.node,true);
            }else if( ev.keyCode == 13 ){
                if ( inst.keyNavMS ){
                    inst.keyNavMS = false;
                    setStatusText("Keyboard multi-select mode DISABLED");
                }else{
                    inst.keyNavMS = true;
                    setStatusText("Keyboard multi-select mode ENABLED");
                }
            }else if( ev.keyCode == 38 || ev.keyCode == 40 ){
                inst.keyNav = true;
            }
        },
        click: function(event, data) {
            //console.log("node click,ev:",event,"orig:",data.originalEvent);
            if ( inst.dragging ){ // Suppress click processing on aborted drag
                inst.dragging = false;
            }else if ( !inst.searchSelect ){ // Selection "rules" differ for search-select mode
                if ( event.which == null ){
                    // RIGHT-CLICK CONTEXT MENU
                    //console.log("click no which");

                    if ( !data.node.isSelected() ){
                        //console.log("not selected");
                        inst.data_tree.selectAll(false);
                        inst.selectScope = data.node;
                        inst.treeSelectNode(data.node);
                    }
                    // Update contextmenu choices
                    var sel = inst.data_tree.getSelectedNodes();

                    // Enable/disable actions
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
                } else if ( data.targetType != "expander" /*&& data.node.data.scope*/ ){
                    //console.log("has scope");
                    if ( inst.data_tree.getSelectedNodes().length == 0 )
                        inst.selectScope = data.node;

                    if ( data.originalEvent.shiftKey && (data.originalEvent.ctrlKey || data.originalEvent.metaKey)) {
                        inst.treeSelectRange(data.node);
                    }else if ( data.originalEvent.ctrlKey || data.originalEvent.metaKey ) {
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
                }else{
                    //console.log("DEFAULT",data.node);
                }
            }
            //}
        }
    }).on("mouseenter", ".fancytree-node", function(event){
        if ( event.ctrlKey || event.metaKey ){
            if ( inst.hoverTimer ){
                clearTimeout(inst.hoverTimer);
                //inst.hoverNav = false;
                inst.hoverTimer = null;
            }
            var node = $.ui.fancytree.getNode(event);
            inst.hoverTimer = setTimeout(function(){
                if ( !node.isActive() ){
                    //inst.hoverNav = true;
                    node.setActive(true);
                }
                inst.hoverTimer = null;
            },750);
            //console.log("hover:",node.key);
        }
        //node.info(event.type);
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
                {title: "Lock", action: inst.lockSelected, cmd: "lock" },
                {title: "Unlock", action: inst.unlockSelected, cmd: "unlock" },
                {title: "Get", action: inst.actionDataGet, cmd: "get" },
                {title: "Put", action: inst.actionDataPut, cmd: "put" },
                {title: "Graph", action: inst.depGraph, cmd: "graph" }
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
            if ( inst.hoverTimer ){
                clearTimeout(inst.hoverTimer);
                inst.hoverTimer = null;
            }
            //inst.hoverNav = true;
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
    $("#btn_new_proj",inst.frame).on('click', inst.newProj );
    $("#btn_new_data",inst.frame).on('click', inst.newData );
    $("#btn_new_coll",inst.frame).on('click', inst.newColl );

    $("#btn_edit",inst.frame).on('click', inst.editSelected );
    //$("#btn_dup",inst.frame).on('click', inst.dupSelected );
    $("#btn_del",inst.frame).on('click', inst.deleteSelected );
    $("#btn_share",inst.frame).on('click', inst.shareSelected );
    $("#btn_lock",inst.frame).on('click', inst.lockSelected );
    $("#btn_unlock",inst.frame).on('click', inst.unlockSelected );
    $("#btn_upload",inst.frame).on('click', inst.actionDataPut );
    $("#btn_download",inst.frame).on('click', inst.actionDataGet );
    //$("#btn_alloc",inst.frame).on('click', function(){ inst.editAllocSelected() });
    $("#btn_dep_graph",inst.frame).on('click', inst.depGraph );

    $("#btn_exp_node",inst.frame).on('click', inst.graphNodeExpand );
    $("#btn_col_node",inst.frame).on('click', inst.graphNodeCollapse );

    $("#btn_alloc",inst.frame).on('click', function(){ dlgAllocations() });
    $("#btn_settings",inst.frame).on('click', function(){ dlgSettings(function(reload){
        if(reload){
            inst.refreshUI();
        }
        clearTimeout(inst.xfrTimer);
        this.xfr_hist.html( "(no recent transfers)" );
        inst.xfrHist = [];
        inst.pollSince = g_opts.xfr_hist * 3600;
        inst.xfrTimer = setTimeout( inst.xfrHistoryPoll, 1000 );
    })});

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
    $("#data-tabs").tabs({
        heightStyle:"fill",
        activate: function(ev,ui){
            if ( ui.newPanel.length && ui.newPanel[0].id == "tab-data-graph" ){
                inst.tree_mode = false;
                inst.showSelectedInfo( inst.sel_node?inst.sel_node.id:null );
            }else{
                inst.tree_mode = true;
                var node = inst.data_tree.activeNode;
                inst.showSelectedInfo( node );
            }
        }
    });

    $("#footer-tabs").tabs({
        heightStyle:"auto",
        collapsible: true,
        activate: function(ev,ui){
            if ( ui.newPanel.length && ui.newPanel[0].id == "tab-search" ){
                inst.updateSearchSelectState( true );
            } else if ( ui.oldPanel.length && ui.oldPanel[0].id == "tab-search" ){
                inst.updateSearchSelectState( false );
            }
        }
    }).css({'overflow': 'auto'});

    $("#sel_descr_hdr").button().click( function(){
        $("#sel_descr").slideToggle();
    });
    $("#sel_references_hdr").button().click( function(){
        $("#sel_references").slideToggle();
    });
    $("#sel_details_hdr").button().click( function(){
        $("#sel_details").slideToggle();
    });
    $("#sel_md_hdr").button().click( function(){
        $("#sel_md").slideToggle();
    });

    $(".scope",inst.frame).checkboxradio();
    $(".scope2",inst.frame).checkboxradio();

    $("#scope_selected",inst.frame).on( "change",function(ev){
        if( $("#scope_selected",inst.frame).prop("checked")){
            $(".scope",inst.frame).prop("checked",false).checkboxradio("disable").checkboxradio("refresh");
        }else{
            $(".scope",inst.frame).checkboxradio("enable");
        }

        inst.updateSearchSelectState( true );
    });

    // Graph Init
    var zoom = d3.zoom();

    inst.svg = d3.select("svg")
    .call(zoom.on("zoom", function () {
        svg.attr("transform", d3.event.transform)
    }))
    .append("g")

    defineArrowMarker(inst.svg, "derivation");
    defineArrowMarker(inst.svg, "component");
    defineArrowMarker(inst.svg, "new-version");

    inst.links_grp = inst.svg.append("g")
        .attr("class", "links");

    inst.nodes_grp = inst.svg.append("g")
        .attr("class", "nodes");

    //$("#lockmenu").menu();

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
    $("#sel_details").slideToggle();

    var node = inst.data_tree.getNodeByKey( "mydata" );
    node.setExpanded().done(function(){
        node = inst.data_tree.getNodeByKey( inst.my_root_key );
        node.setExpanded();
    });

    inst.showSelectedInfo();
    this.xfr_hist.html( "(no recent transfers)" );
    this.xfrTimer = setTimeout( inst.xfrHistoryPoll, 1000 );

    return inst;
}
