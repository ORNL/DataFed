function makeBrowserTab(){
    console.log("making browser tab");

    var inst = this;

    inst.frame = $("#content");
    //inst.frame = $("#tab-browse");
    //inst.data_ident = $("#data_ident",inst.frame);
    inst.sel_id = $("#sel_id",inst.frame);
    inst.sel_title_div = $("#sel_title_div",inst.frame);
    inst.sel_title = $("#sel_title",inst.frame);
    inst.sel_details_div = $("#sel_details_div",inst.frame);
    inst.sel_details = $("#sel_details",inst.frame);
    inst.sel_descr_div = $("#sel_descr_div",inst.frame);
    inst.sel_descr = $("#sel_descr",inst.frame);
    inst.sel_links_div = $("#sel_links_div",inst.frame);
    inst.sel_links = $("#sel_links",inst.frame);
    inst.sel_md_div = $("#sel_md_div",inst.frame);
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
    this.graph_center_x = 200;
    this.nodes_grp = null;
    this.nodes = null;
    this.links_grp = null;
    this.links = null;
    this.svg = null;
    this.simulation = null;
    this.sel_node = null;

    var SS_TREE = 0;
    var SS_CAT = 1;
    var SS_PROV = 2;
    var SS_SEARCH = 3;
    this.select_source = SS_TREE;

    this.windowResized = function(){
        console.log("browser panel resized");

        var h = $("#data-tabs-parent").height();
        inst.graph_center_x = $("#data-tabs-parent").width()/2;
        var tabs = $("#data-tabs");
        var hdr_h = $(".ui-tabs-nav",tabs).outerHeight();

        tabs.outerHeight(h);
        $(".ui-tabs-panel",tabs).outerHeight( h - hdr_h );
    }

    this.getSelectedIDs = function(){
        var ids = [];
        //console.log("getSelectedIDs, mode:",inst.select_source);
        switch( inst.select_source ){
            case SS_TREE:
                var sel = inst.data_tree.getSelectedNodes();
                for ( var i in sel ){
                    ids.push( sel[i].key );
                }
                break;
            case SS_SEARCH:
                var sel = inst.results_tree.getSelectedNodes();
                for ( var i in sel ){
                    ids.push( sel[i].key );
                }
                break;
            case SS_CAT:
                var sel = inst.cat_tree.getSelectedNodes();
                for ( var i in sel ){
                    ids.push( sel[i].key );
                }
                break;
            case SS_PROV:
                if ( inst.sel_node ){
                    ids.push( inst.sel_node.id );
                }
                break;
        }

        return ids;
    }

    this.refreshUI = function( a_ids, a_data, a_reload ){
        //console.log("refreshUI",a_ids,a_data);

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
                    node.tooltip = inst.generateTooltip( data[idx] );
                    if ( a_reload )
                        inst.reloadNode( node );
                }
            });
        }

        if ( inst.focus_node_id ){
            if ( a_ids && a_data )
                inst.graphUpdate( a_ids, a_data );
            else
                inst.graphLoad( inst.focus_node_id, inst.sel_node.id );
        }

        switch( inst.select_source ){
            case SS_TREE:
                var node = inst.data_tree.activeNode;
                inst.showSelectedInfo( node );
                break;
            case SS_CAT:
                inst.showSelectedInfo();
                break;
            case SS_PROV:
                inst.showSelectedInfo( inst.sel_node?inst.sel_node.id:null );
                break;
            case SS_SEARCH:
                var node = inst.results_tree.activeNode;
                inst.showSelectedInfo( node );
                break;
        }
    }


    this.displayPath = function( path, item ){
        //console.log("displayPath");

        var node;

        function reloadPathNode( idx ){
            //console.log("reload",idx);
            node = inst.data_tree.getNodeByKey( path[idx].id );
            if ( node ){
                $( "#data-tabs" ).tabs({ active: 0 });
                //console.log("reload node",node.key,",offset",path[idx].off);
                node.data.offset = path[idx].off;
                node.load(true).done( function(){
                    node.setExpanded(true);
                    if ( idx == 0 ){
                        node = inst.data_tree.getNodeByKey( item );
                        if ( node ){
                            node.setActive();
                            inst.data_tree.selectAll(false);
                            inst.selectScope = node;
                            inst.treeSelectNode(node);
                        }else{
                            setStatusText("Error: item not found.");
                            console.log("ITEM NOT FOUND!",item);
                        }
                        asyncEnd();
                    }else{
                        reloadPathNode( idx - 1 );
                    }
                });
            }else{
                asyncEnd();
                setStatusText("Error: path not found.");
            }
        }

        // Must examine and process paths that lead to projects, or shared data

        if ( path[path.length - 1].id.startsWith('c/p_') ){
            var proj_id = "p/"+path[path.length - 1].id.substr(4,path[path.length - 1].id.length-9);
            viewProj( proj_id, function( proj ){
                if ( proj ){
                    //console.log("proj:",proj,g_user.uid);
                    var uid = "u/"+g_user.uid;
                    path.push({id:proj_id,off:0});
                    if ( proj.owner == uid )
                        path.push({id:"proj_own",off:0});
                    else if ( proj.admin && proj.admin.indexOf( uid ) != -1 )
                        path.push({id:"proj_adm",off:0});
                    else if ( proj.member && proj.member.indexOf( uid ) != -1 )
                        path.push({id:"proj_mem",off:0});
                    else{
                        console.log("NOT FOUND - shared project folder?" );
                        aclByProject( function( ok, projs ){
                            if ( ok ){
                                //console.log("projs:",projs);
                                var idx = projs.findIndex(function(p){
                                    return p.id == proj_id;
                                });
                                if ( idx != -1 ){
                                    //console.log("list user shares");
                                    aclByProjectList( proj_id, function( ok, items ){
                                        if ( ok ){
                                            console.log("shared items:",items);
                                            var item_id;
                                            for ( var i in items.item ){
                                                item_id = items.item[i].id;
                                                idx = path.findIndex(function(coll){
                                                    return coll.id == item_id;
                                                });
                                                if ( idx != -1 ){
                                                    //console.log("orig path:",path);
                                                    path = path.slice( 0, idx + 1 );
                                                    path.push({id:"shared_proj_"+proj_id,off:0},{id:"shared_proj",off:0});
                                                    //console.log("path:",path);
                                                    reloadPathNode( path.length - 1 );
                                                    return;
                                                }
                                            }
                                            // Didn't find path, assume it's in shared_user
                                            path = [{id:"shared_proj_"+proj_id,off:0},{id:"shared_proj",off:0}];
                                            reloadPathNode( path.length - 1 );
                                        }else{
                                            setStatusText("Error: unable to access path information!",1);
                                            asyncEnd();
                                        }
                                    });
                                }else{
                                    setStatusText("Error: path to record not found!",1);
                                    asyncEnd();
                                }
                            }else{
                                setStatusText("Error: " + projs,1);
                                asyncEnd();
                            }
                        });
                        return
                    }
                    //console.log("path:",path);
                    reloadPathNode( path.length - 1 );
                }
            });
        }else if ( path[path.length - 1].id.startsWith('c/u_') ){
            var uid = path[path.length - 1].id.substr(4,path[path.length - 1].id.length-9);
            if ( uid == g_user.uid ){
                reloadPathNode( path.length - 1 );
            }else{
                aclByUser( function( ok, users ){
                    if ( ok ){
                        //console.log("users:",users);
                        var idx = users.findIndex(function(user){
                            return user.uid == uid;
                        });
                        if ( idx != -1 ){
                            //console.log("list user shares");
                            aclByUserList( "u/"+uid, function( ok, items ){
                                if ( ok ){
                                    //console.log("shared items:",items);
                                    var item_id;
                                    for ( var i in items.item ){
                                        item_id = items.item[i].id;
                                        idx = path.findIndex(function(coll){
                                            return coll.id == item_id;
                                        });
                                        if ( idx != -1 ){
                                            //console.log("orig path:",path);
                                            path = path.slice( 0, idx + 1 );
                                            path.push({id:"shared_user_"+uid,off:0},{id:"shared_user",off:0});
                                            //console.log("path:",path);
                                            reloadPathNode( path.length - 1 );
                                            return;
                                        }
                                    }
                                    // Didn't find path, assume it's in shared_user
                                    path = [{id:"shared_user_"+uid,off:0},{id:"shared_user",off:0}];
                                    reloadPathNode( path.length - 1 );
                                }else{
                                    setStatusText("Error: unable to access path information!",1);
                                    asyncEnd();
                                }
                            });
                        }else{
                            setStatusText("Error: path to record not found!",1);
                            asyncEnd();
                        }
                    }else{
                        setStatusText("Error:" + users,1);
                        asyncEnd();
                    }
                });
            }
        }else{
            reloadPathNode( path.length - 1 );
        }
    }

    this.showParent = function( which ){
        var ids = inst.getSelectedIDs();
        if ( ids.length != 1 ){
            asyncEnd();
            return;
        }

        var node, item_id = ids[0];

        if ( which != 0 ){
            node  = inst.data_tree.getActiveNode();
            if ( !node || !node.parent ){
                asyncEnd();
                return;
            }
        }

        //console.log("----- showParent -----",item_id);
        getParents( item_id, function( ok, data ){
            if ( ok ){
                if ( data.path.length ){
                    var i,path;
                    var done = 0, err = false;

                    if ( which == 0 || data.path.length == 1 )
                        path = data.path[0].item;
                    else{
                        // Figure out which parent path matches current location

                        for ( i in data.path ){
                            path = data.path[i].item;
                            //console.log("path:",path);
                            if ( path.findIndex(function(p){
                                return p.id == node.parent.key;
                            }) != -1 ){
                                if ( which == 1 )
                                    i>0?i--:i=data.path.length-1;
                                else
                                    i<data.path.length-1?i++:i=0;
                                path = data.path[i].item;
                                break;
                            }
                        }
                    }

                    for ( i = 0; i < path.length; i++ ){
                        path[i] = {id:path[i].id,off:null};
                        //console.log("getCollOffset",path[i].id );
                        getCollOffset( path[i].id, i>0?path[i-1].id:item_id, g_opts.page_sz, i, function( ok, data2, idx ){
                            done++;

                            if ( ok ){
                                path[idx].off = data2.offset;
                                if ( done == path.length && !err ){
                                    inst.displayPath( path, item_id );
                                }
                            }else if (!err){
                                setStatusText("Get Collections Error: " + data2, 1 );
                                err = true;
                            }

                            if ( done == path.length && err ){
                                asyncEnd();
                            }
                        });
                    }
                }
            }else{
                asyncEnd();
                setStatusText("Get Collections Error: " + data, 1 );
            }
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
                setStatusText("Lock Update Failed: " + data, 1 );
            }
        });
    }


    this.copyItems = function( items, dest_node, cb ){
        var item_keys = [];
        for( var i in items )
            item_keys.push( items[i].key );

        linkItems( item_keys, dest_node.key, function( ok, msg ) {
            if ( ok ){
                if ( dest_node.isLoaded() )
                    inst.reloadNode(dest_node);
            }else{
                dlgAlert( "Copy Error", msg );
                //setStatusText( "Copy Error: " + msg, 1 );
            }

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
            }else{
                dlgAlert( "Move Error", msg );
                //setStatusText( "Move Error: " + msg, 1 );
            }

            if ( cb )
                cb();

        });
    }

    //-------------------------------------------------------------------------
    // ACTION FUNCTIONS (UI event handlers)

    this.actionDeleteSelected = function(){
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
                            setStatusText( "Data Delete Error: " + data, 1 );
                    });
                }
                if ( coll.length ){
                    collDelete( coll, function( ok, data ){
                        if ( ok ){
                            if ( --done == 0 )
                                refreshAfterDel();
                        }else
                            setStatusText("Collection Delete Error: " + data, 1 );
                    });
                }
                if ( proj.length ){
                    projDelete( proj, function( ok, data ){
                        if ( ok ){
                            inst.reloadNode(inst.data_tree.getNodeByKey("proj_own"));
                            inst.showSelectedInfo();
                        }else
                            setStatusText("Project Delete Error: " + data, 1 );
                    });
                }
                if ( qry.length ){
                    sendQueryDelete( qry, function( ok, data ){
                        if ( ok ){
                            inst.reloadNode(inst.data_tree.getNodeByKey("queries"));
                            inst.showSelectedInfo();
                        }else
                            setStatusText("Query Delete Error: " + data, 1 );
                    });
                }
            }
        });
    }

    this.actionNewProj = function() {
        dlgProjNewEdit(null,function(data){
            setStatusText("Project "+data.id+" created");
            inst.reloadNode( inst.data_tree.getNodeByKey( "proj_own" ));
        });
    }

    this.actionNewData = function() {
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
                    inst.graphLoad( inst.focus_node_id, inst.sel_node.id );
            });
        });
    }


    this.actionNewColl = function(){
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

            dlgCollNewEdit(null,parent,0,function(data){
                var node = inst.data_tree.getNodeByKey( data.parentId );
                if ( node )
                    inst.reloadNode( node );
            });
        });
    }

    this.actionImportData = asyncFunc( function( files ){
        var coll_id;

        if ( !inst.update_files ){
            var node = inst.data_tree.activeNode;

            if ( !node ){
                asyncEnd();
                return;
            }

            if ( node.key.startsWith("d/")) {
                coll_id = node.parent.key;
            }else if (node.key.startsWith("c/")){
                coll_id = node.key;
            }else if (node.key.startsWith("p/")){
                coll_id = "c/p_"+node.key.substr(2)+"_root";
            }else{
                asyncEnd();
                return;
            }
        }

        // Read file contents into a single payload for atomic validation and processing
        var file, tot_size = 0;

        for ( i = 0; i < files.length; i++ ){
            file = files[i];
            console.log("size:",file.size,typeof file.size);
            if ( file.size == 0 ){
                dlgAlert("Import Error","File " + file.name + " is empty." );
                asyncEnd();
                return;
            }
            if ( file.size > MD_MAX_SIZE ){
                dlgAlert("Import Error","File " + file.name + " size (" + sizeToString( file.size ) + ") exceeds metadata size limit of " + sizeToString(MD_MAX_SIZE) + "." );
                asyncEnd();
                return;
            }
            tot_size += file.size;
        }

        if ( tot_size > PAYLOAD_MAX_SIZE ){
            dlgAlert("Import Error","Total import size (" + sizeToString( tot_size ) + ") exceeds server limit of " + sizeToString(PAYLOAD_MAX_SIZE) + "." );
            asyncEnd();
            return;
        }

        // Read file content and verify JSON format (must be {...})
        var count = 0, payload = [];
        var reader = new FileReader();

        reader.onload = function( e ){
            try{
                var obj = JSON.parse( e.target.result )
                var rec_count = 0;

                if ( obj instanceof Array ){
                    for ( i in obj ){
                        if ( !inst.update_files )
                            obj[i].parent = coll_id;
                        payload.push( obj[i] );
                    }
                    rec_count += obj.length;
                }else{
                    if ( !inst.update_files )
                        obj.parent = coll_id;
                    payload.push( obj );
                    rec_count++;
                }

                count++;
                if ( count == files.length ){
                    //console.log("Done reading all files", payload );
                    if ( inst.update_files ){
                        dataUpdateBatch( JSON.stringify( payload ), function( ok, data ){
                            if ( ok ){
                                inst.refreshUI();
                                setStatusText("Updated " + rec_count + " record" + (rec_count>1?"s":""));
                            }else{
                                dlgAlert( "Update Error", data );
                            }
                            asyncEnd();
                        });
                    }else{
                        dataCreateBatch( JSON.stringify( payload ), function( ok, data ){
                            if ( ok ){
                                setStatusText("Imported " + rec_count + " record" + (rec_count>1?"s":""));
                                var node = inst.data_tree.getNodeByKey( coll_id );
                                if ( node )
                                    inst.reloadNode( node );
                            }else{
                                dlgAlert( "Import Error", data );
                            }
                            asyncEnd();
                        });
                    }
                }else{
                    reader.readAsText(files[count],'UTF-8');
                }
            }catch(e){
                asyncEnd();
                dlgAlert("Import Error","Invalid JSON in file " + files[count].name );
                return;
            }
        }

        reader.onerror = function( e ){
            dlgAlert("Import Error", "Error reading file: " + files[count].name )
        }

        reader.onabort = function( e ){
            dlgAlert("Import Error", "Import aborted" )
        }

        reader.readAsText(files[count],'UTF-8');
    });

    this.actionFirstParent = asyncFunc( function(){
        inst.showParent(0);
    });

    this.actionPrevParent = asyncFunc( function(){
        inst.showParent(1);
    });

    this.actionNextParent = asyncFunc( function(){
        inst.showParent(2);
    });

    this.actionLockSelected = function(){
        inst.setLockSelected( true );
    }

    this.actionUnlockSelected = function(){
        inst.setLockSelected( false );
    }

    this.actionCutSelected = function(){
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

    this.actionCopySelected = function(){
        console.log("Copy");
        if ( inst.select_source == SS_TREE )
            inst.pasteItems = inst.data_tree.getSelectedNodes();
        else if ( inst.select_source == SS_SEARCH )
            inst.pasteItems = inst.results_tree.getSelectedNodes();
        else
            return;

        inst.pasteSource = pasteItems[0].parent;
        inst.pasteMode = "copy";
        inst.pasteCollections = [];
        for ( var i in inst.pasteItems ){
            if ( inst.pasteItems[i].key.startsWith("c/") )
                inst.pasteCollections.push( inst.pasteItems[i] );
        }
    }

    this.actionPasteSelected = function(){
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

    this.actionUnlinkSelected = function(){
        var sel = inst.data_tree.getSelectedNodes();
        if ( sel.length ){
            var scope = sel[0].data.scope;
            var items = [];
            for ( var i in sel ){
                items.push( sel[i].key );
            }
            //console.log("items:",items);
            unlinkItems( items, sel[0].parent.key, function( ok, data ) {
                if ( ok ){
                    if ( data.item && data.item.length ){
                        var loc_root = "c/" + scope.charAt(0) + "_" + scope.substr(2) + "_root";
                        inst.reloadNode( inst.data_tree.getNodeByKey( loc_root ));
                    }else{
                        inst.reloadNode( sel[0].parent );
                    }
                }else{
                    dlgAlert( "Unlink Error", data );
                }
            });
        }
    }

    this.actionEditSelected = function() {
        if ( async_guard )
            return;

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
                    setStatusText("Query Edit Error: " + old_qry, 1);
            });
            return;
        }else
            return;

        getPerms( id, req_perms, function( perms ){
            if (( perms & req_perms ) == 0 ){
                setStatusText( "Edit Error: Permission Denied.", 1 );
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
                        dlgCollNewEdit(data,null,perms,function(data){
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

    this.actionShareSelected = function() {
        var ids = inst.getSelectedIDs();
        if ( ids.length != 1 )
            return;

        var id = ids[0];

        checkPerms( id, PERM_SHARE, function( granted ){
            if ( !granted ){
                //alertPermDenied();
                setStatusText("Sharing Error: Permission Denied.", 1);
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

    /* Doesn't seem to be in use
    this.editAllocSelected = function(){
        // TODO - use selection, not active node
        var node = inst.data_tree.activeNode;
        if ( node ) {
            dlgAllocations.show();
        }
    }
    */

    this.actionDepGraph = function(){
        var ids = inst.getSelectedIDs();
        if ( ids.length != 1 )
            return;

        var id = ids[0];

        if ( id.charAt(0) == "d" ) {
            inst.graphLoad( id );
            $('[href="#tab-prov-graph"]').closest('li').show();
            $( "#data-tabs" ).tabs({ active: 2 });
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
        dataGet( ids );
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

    this.actionDataMove = function() {
        var ids = inst.getSelectedIDs();
        if ( ids.length != 1 )
            return;

        var id = ids[0];

        if ( id.charAt(0) == "d" ) {
            dataMove( id );
        }
    }

    this.actionReloadSelected = function(){
        var node;

        if ( inst.select_source == SS_TREE ){
            node = inst.data_tree.activeNode;
            if ( node ){
                inst.reloadNode( node );
            }
        } else if ( inst.select_source == SS_CAT ){
            node = inst.cat_tree.activeNode;
            if ( node ){
                inst.reloadNode( node, inst.cat_tree );
            }
        }

    };

    this.calcActionState = function( sel ){
        var bits,node;

        if ( sel.length > 1 ){
            bits = 0x319; //0x319;
            for ( var i in sel ){
                node = sel[i];
                switch ( node.key[0] ){
                    case "c": bits |= node.data.isroot?0xD7:0x52;  break;
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
                //case "c": bits = node.data.isroot?0x2F7:0x272;  break;
                case "c": bits = node.data.isroot?0x2D7:0x252;  break;
                case "d":
                    if ( node.parent.key.startsWith("c/"))
                        bits = 0x00;
                    else
                        bits = 0x100;
                    if ( node.data.doi )
                        bits |= 0x10;
                    break;
                case "p": bits = 0x3Fa | (node.data.admin?0:5); break;
                case "q": bits = 0x3F8; break;
                default:  bits = 0x3FF;  break;
            }
            //console.log("single",bits);
        }else{
            bits = 0x2FF;
        }

        return bits;
    }

    this.updateBtnState = function(){
        //console.log("updateBtnState");
        var bits,sel;
        switch( inst.select_source ){
            case SS_TREE:
                 sel = inst.data_tree.getSelectedNodes();
                bits = calcActionState( sel );
                break;
            case SS_CAT:
                //bits = 0xFF;
                sel = inst.cat_tree.getSelectedNodes();
                bits = calcActionState( sel );
                break;
            case SS_PROV:
                if ( inst.focus_node_id )
                    bits = 0;
                else
                    bits = 0xFF;
                break;
            case SS_SEARCH:
                sel = inst.results_tree.getSelectedNodes();
                bits = calcActionState( sel );
                break;
        }

        $("#btn_edit",inst.frame).button("option","disabled",(bits & 1) != 0 );
        //$("#btn_dup",inst.frame).button("option","disabled",(bits & 2) != 0);
        $("#btn_del",inst.frame).button("option","disabled",(bits & 4) != 0 );
        $("#btn_share",inst.frame).button("option","disabled",(bits & 8) != 0 );
        $("#btn_upload",inst.frame).button("option","disabled",(bits & 0x10) != 0 );
        $("#btn_download",inst.frame).button("option","disabled",(bits & 0x20) != 0);
        $("#btn_move",inst.frame).button("option","disabled",(bits & 0x20) != 0);
        $("#btn_lock",inst.frame).button("option","disabled",(bits & 0x40) != 0);
        $("#btn_unlock",inst.frame).button("option","disabled",(bits & 0x40) != 0);
        $("#btn_new_data",inst.frame).button("option","disabled",(bits & 0x100) != 0 );
        $("#btn_import_data",inst.frame).button("option","disabled",(bits & 0x100) != 0 );
        $("#btn_new_coll",inst.frame).button("option","disabled",(bits & 0x100) != 0 );
        //$("#btn_unlink",inst.frame).button("option","disabled",(bits & 0x80) != 0);
        $("#btn_dep_graph",inst.frame).button("option","disabled",(bits & 0x200) != 0 );
        $("#btn_prev_coll",inst.frame).button("option","disabled",(bits & 0x200) != 0 );
        $("#btn_next_coll",inst.frame).button("option","disabled",(bits & 0x200) != 0 );
        $("#btn_first_par_coll",inst.frame).button("option","disabled",(bits & 0x200) != 0 );

        inst.data_tree_div.contextmenu("enableEntry", "edit", (bits & 1) == 0 );
        //inst.data_tree_div.contextmenu("enableEntry", "dup", (bits & 2) == 0 );
        inst.data_tree_div.contextmenu("enableEntry", "del", (bits & 4) == 0 );
        inst.data_tree_div.contextmenu("enableEntry", "share", (bits & 8) == 0 );
        inst.data_tree_div.contextmenu("enableEntry", "put", (bits & 0x10) == 0 );
        inst.data_tree_div.contextmenu("enableEntry", "get", (bits & 0x20) == 0 );
        inst.data_tree_div.contextmenu("enableEntry", "move", (bits & 0x20) == 0 );
        inst.data_tree_div.contextmenu("enableEntry", "lock", (bits & 0x40) == 0 );
        inst.data_tree_div.contextmenu("enableEntry", "unlock", (bits & 0x40) == 0 );
        inst.data_tree_div.contextmenu("enableEntry", "unlink", (bits & 0x80) == 0 );
        inst.data_tree_div.contextmenu("enableEntry", "newd", (bits & 0x100) == 0 );
        inst.data_tree_div.contextmenu("enableEntry", "newc", (bits & 0x100) == 0 );
        inst.data_tree_div.contextmenu("enableEntry", "graph", (bits & 0x200) == 0 );
    }

    this.reloadNode = function( node, tree ){
        if ( !node || node.isLazy() && !node.isLoaded() )
            return;
        var tr = tree || inst.data_tree;
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
                        var n = tr.getNodeByKey( exp[idx] );
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

    this.updateSelectionField = function( fields ){
        if ( fields.id )
            inst.sel_id.text( fields.id );
        else
            inst.sel_id.text("(no information)");

        if ( fields.title ){
            inst.sel_title.text( fields.title );
            inst.sel_title_div.show();
        }else
            inst.sel_title_div.hide();

        if ( fields.descr ){
            inst.sel_descr.text(fields.descr);
            inst.sel_descr_div.show();
        }else if ( fields.descr_html ){
            inst.sel_descr.html(fields.descr_html);
            inst.sel_descr_div.show();
        }else{
            inst.sel_descr_div.hide();
        }


        if ( fields.details ){
            inst.sel_details.html(fields.details);
            inst.sel_details_div.show();
        }else{
            inst.sel_details_div.hide();
        }

        if ( fields.links ){
            inst.sel_links.html(fields.links);
            inst.sel_links_div.show();
        }else{
            inst.sel_links_div.hide();
        }

        if ( fields.md ){
            inst.showSelectedMetadata( fields.md );
            inst.sel_md_div.show();
        }else{
            inst.showSelectedMetadata();
            inst.sel_md_div.hide();
        }
    }

    this.showSelectedDataInfo = function( key ){
        viewData( key, function( item ){
            fields = {};

            if ( item ){
                var date = new Date();

                fields.id = "Data ID: " + key;
                if ( item.alias )
                    fields.id += ", Alias: " + item.alias;

                fields.title = "\"" + item.title + "\"";

                if ( item.desc )
                    fields.descr = item.desc;

                var html = "<table class='info_table'><col width='20%'><col width='80%'>";
                html += "<tr><td>Keywords:</td><td>" + (item.keyw?item.keyw:"N/A") + "</td></tr>";
                if ( item.doi )
                    html += "<tr><td>DOI:</td><td>" + item.doi + "</td></tr>";
                html += "<tr><td>Locked:</td><td>" + (item.locked?"Yes":"No") + "</td></tr>";
                if ( item.dataUrl ){
                    html += "<tr><td>Data URL:</td><td><a href='" + item.dataUrl + "' target='_blank'>"+item.dataUrl+"</a></td></tr>";
                }else{
                    html += "<tr><td>Data Repo:</td><td>" + item.repoId.substr(5) + "</td></tr>";
                    html += "<tr><td>Data Size:</td><td>" + sizeToString( item.size ) + "</td></tr>";
                    if ( item.source )
                        html += "<tr><td>Source:</td><td>" + item.source + "</td></tr>";
                    if ( item.ext )
                        html += "<tr><td>Extension:</td><td>" + item.ext + "</td></tr>";
                    html += "<tr><td>Auto Ext.:</td><td>" + (item.extAuto?"Yes":"No") + "</td></tr>";
                }
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

                fields.details = html;

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

                    fields.links = html;
                }else{
                    fields.links = "No relationships.";
                }

                fields.md = item.metadata;
            }else{
                fields.id = "Insufficient permissions to view data record.";
            }
            inst.updateSelectionField( fields );
        }); 
    }

    this.showSelectedInfo = function( node ){
        var fields = {};

        if ( !node ){
            inst.updateSelectionField(fields);
            return;
        }

        console.log( "node key:", node.key, "scope:", node.data?node.data.scope:"n/a" );
        var key,i,html;
        var date = new Date();

        if ( typeof node == 'string' )
            key = node;
        else if ( node.key == "shared_proj" && node.data.scope )
            key = node.data.scope;
        else if ( node.key.startsWith( "t/" ) && node.data.scope ){
            key = node.data.scope;
        }else
            key = node.key;

        if ( key == "mydata" ) {
            fields.id = "My Data";
            fields.descr = "Location for creating and organizing personal data and collections.";

            userView( g_user.uid, true, function( ok, user ){
                if ( ok && user ){
                    html = "<table class='info_table'><col width='20%'><col width='80%'>";
                    html += "<tr><td>Allocation(s):</td><td>";

                    if ( user.alloc && user.alloc.length ){
                        var alloc,free;
                        for ( i in user.alloc ){
                            alloc = user.alloc[i]
                            free = Math.max( Math.floor(10000*(alloc.maxSize - alloc.totSize)/alloc.maxSize)/100, 0 );
                            html += alloc.repo + ": " + sizeToString( alloc.maxSize ) + " total, " + sizeToString( alloc.totSize ) + " used (" + free + " % free)<br>";
                        }
                    }else{
                        html += "(n/a)";
                    }
                    html += "</table>";
                    fields.details = html;
                }

                inst.updateSelectionField( fields );
            });
        }else if ( key[0] == "c" ) {
            viewColl( key, function( item ){
                if ( item ){
                    fields.id = "Collection ID: " + key;
                    if ( item.alias )
                        fields.id += ", Alias: " + item.alias;

                    fields.title = "\"" + item.title + "\"";

                    if ( item.desc )
                        fields.descr = item.desc;

                    html = "<table class='info_table'><col width='20%'><col width='80%'>";
                    if ( item.ispublic && item.topic )
                        html += "<tr><td>Topic:</td><td>" + (item.topic?item.topic:"N/A") + "</td></tr>";
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

                    fields.details = html;
                }else{
                    fields.id = "Insufficient permissions to view collection.";
                }
                inst.updateSelectionField( fields );
            }); 
        } else if ( key[0] == "d" ) {
            inst.showSelectedDataInfo( key );
        } else if ( key.startsWith("p/")) {
            viewProj( key, function( item ){
                if ( item ){
                    fields.id = "Project ID: " + key;
                    fields.title = "\"" + item.title + "\"";

                    if ( item.desc )
                        fields.descr = item.desc;

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
                            free = Math.max( Math.floor(10000*(alloc.maxSize - alloc.totSize)/alloc.maxSize)/100, 0 );
                            html += alloc.repo + ": " + sizeToString( alloc.maxSize ) + " total, " + sizeToString( alloc.totSize ) + " used (" + free + " % free)<br>";
                        }
                    }else if( item.subRepo ){
                        free = Math.max( Math.floor(10000*(item.subAlloc - item.subUsage)/item.subAlloc)/100, 0 );
                        html += item.subRepo + ": (sub-alloc) " + sizeToString( item.subAlloc ) + " total, " + sizeToString( item.subUsage ) + " used (" + free + " % free)";
                    }else{
                        html += "(n/a)";
                    }

                    html += "</td></tr></table>";
                    fields.details = html;
                }else{
                    fields.id = "Insufficient permissions to view project.";
                }
                inst.updateSelectionField( fields );
            }); 
        } else if ( key.startsWith("q/")) {
            sendQueryView( key, function( ok, item ){
                if ( ok && item ){
                    fields.id = "Query ID: " + item.id;
                    fields.title = item.title;

                    var qry = JSON.parse( item.query );
                    fields.descr_html = "<table class='info_table'><col width='20%'><col width='80%'><tr><td><u>Query Field</u></td><td><u>Value</u></td></tr><tr><td>ID/Alias:</td><td>"+(qry.id?qry.id:"---")+"</td></tr><tr><td>Text:</td><td>"+(qry.quick?qry.quick:"---")+"</td></tr><tr><td>Metadata:</td><td>"+(qry.meta?qry.meta:"---")+"</td></tr></table>";

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
                    fields.details = html;
                }

                inst.updateSelectionField( fields );
            });
        } else if (( key.startsWith("u/") || key.startsWith( "shared_user_" )) && node.data.scope ) {
            userView( node.data.scope, false, function( ok, item ){
                if ( ok && item ){
                    fields.id = "User ID: " + item.uid;
                    fields.title = item.name;

                    html = "<table class='info_table'><col width='20%'><col width='80%'>";
                    html += "<tr><td>E-mail:</td><td>" + item.email + "</td></tr></table>";
                    fields.details = html;
                }

                inst.updateSelectionField( fields );
            });
        } else if ( key.startsWith( "shared_proj_" ) && node.data.scope ) {
            viewProj( node.data.scope, function( item ){
                if ( item ){
                    fields.id = "Project ID: " + key;
                    fields.title = "\"" + item.title + "\"";

                    if ( item.desc )
                        fields.descr = item.desc;

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
                    html += "</td></tr></table>";
                    fields.details = html;
                }else{
                    fields.id = "Insufficient permissions to view project.";
                }
                inst.updateSelectionField( fields );
            });
        } else if ( key == "allocs" ) {
            fields.id = "My Allocations";
            fields.descr = "Lists allocations and associated data records.";
            inst.updateSelectionField( fields );
        } else if ( key == "published" ) {
            fields.id = "Published Collections";
            fields.descr = "Lists collections published to DataFed catalogs.";
            inst.updateSelectionField( fields );
        } else if ( key.startsWith( "repo/" )) {
            var is_user = node.data.scope.startsWith("u/");
            fields.id = (node.data.sub_alloc?"Sub-a":"A") + "llocation on " + node.data.repo + ", user: " + node.data.scope;
            fields.descr = "Browse data records by allocation.";

            html = "<table class='info_table'><col width='20%'><col width='80%'>";
            html += "<tr><td>Repo ID:</td><td>" + node.data.repo + "</td></tr>";
            if ( !is_user )
                html += "<tr><td>Sub-allocation:</td><td>" + (node.data.sub_alloc?"Yes":"No") + "</td></tr>";
            html += "<tr><td>Capacity:</td><td>" + sizeToString( node.data.alloc_capacity ) + "</td></tr>";
            html += "<tr><td>Usage:";
            if ( is_user )
                html += " <span class='note'>*</span>";
            var used = Math.max( Math.floor(10000*node.data.alloc_usage/node.data.alloc_capacity)/100, 0 );
            html += "</td><td>" + sizeToString( node.data.alloc_usage ) + " (" + used + " %)</td></tr>";
            html += "<tr><td>Max. Records:</td><td>" + node.data.alloc_max_count + "</td></tr></table>";
            if ( is_user )
                html += "<br><span class='note'>* Includes any project sub-allocation usage</span>";
            fields.details = html;
            inst.updateSelectionField( fields );
        } else {
            inst.updateSelectionField( fields );
        }
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

            var src = [{title:"Metadata",folder:true,expanded:inst.data_md_exp["Metadata"]?true:false,children:inst.buildObjSrcTree(md,"Metadata")}];

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
                //var srch_node = inst.data_tree.getNodeByKey("search");
                var results = [];
                if ( items.length > 0 ){
                    setStatusText( "Found " + items.length + " result" + (items.length==1?"":"s"));
                    for ( var i in items ){
                        var item = items[i];
                        results.push({title:inst.generateTitle( item ),icon:item.doi?"ui-icon ui-icon-linkext":"ui-icon ui-icon-file",checkbox:false,key:item.id,nodrag:false,notarg:true,scope:item.owner,doi:item.doi,tooltip:inst.generateTooltip(item)});
                    }
                } else {
                    setStatusText("No results found");
                    results.push({title:"(no results)",icon:false,checkbox:false,nodrag:true,notarg:true});
                }
                $()
                //srch_node.removeChildren();
                //srch_node.addChildren( results );
                //srch_node.setExpanded( true );
                $("#search_results_tree").fancytree("getTree").reload(results);
                $('[href="#tab-search-results"]').closest('li').show();
                $( "#data-tabs" ).tabs({ active: 3 });

                if ( !inst.data_tree.activeNode )
                    inst.showSelectedInfo();
            }else{
                dlgAlert("Query Error",items);
            }
        });
    }

    this.parseQuickSearch = function(){
        //console.log("parse query");
        var query = {};
        var tmp = $("#text_query").val();
        if ( tmp )
            query.quick = tmp;

        tmp = $("#id_query").val();
        if ( tmp )
            query.id = tmp;

        tmp = $("#meta_query").val();
        if ( tmp )
            query.meta = tmp;

        query.scopes = [];

        if ( $("#scope_selected",inst.frame).prop("checked")){
            //console.log("select mode");
            var i, key, nodes = inst.data_tree.getSelectedNodes();
            for ( i in nodes ){
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
                //else if ( key.startsWith("t/") ){
                //    query.scopes.push({scope:SS_TOPIC,id:key,recurse:true});
                //}
            }
            nodes = inst.cat_tree.getSelectedNodes();
            //console.log("cat tree nodes:",nodes.length);
            for ( i in nodes ){
                key = nodes[i].key;
                query.scopes.push({scope:SS_TOPIC,id:key,recurse:true});
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

        //console.log("query:", query);

        // TODO make sure at least one scope set and on term
        return query;
    }

    this.searchDirect = function(){
        var query = parseQuickSearch();

        if ( query.scopes.length && ( query.quick || query.meta || query.id ))
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
                        setStatusText( "Query Save Error: " + data, 1 );
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
            $(inst.cat_tree_div).fancytree("option","checkbox",true);
            $("#btn_srch_clear_select",inst.frame).button("option","disabled",false);
            inst.searchSelect = true;
        }else{
            $(inst.data_tree_div).fancytree("option","checkbox",false);
            $(inst.cat_tree_div).fancytree("option","checkbox",false);
            $("#btn_srch_clear_select",inst.frame).button("option","disabled",true);
            inst.searchSelect = false;
        }
        inst.data_tree.selectAll(false);
        inst.cat_tree.selectAll(false);
    }

    this.searchClearSelection = function(){
        inst.data_tree.selectAll(false);
        inst.cat_tree.selectAll(false);
    }

    this.generateTitle = function( item ) {
        var title = "";

        if ( item.locked )
            title += "<i class='ui-icon ui-icon-locked'></i> ";

        //title += "\"" + escapeHTML(item.title) + "\"";
        //style='display:inline-block;max-width:5em;overflow:hidden;text-overflow: ellipsis'

        title += "\"<span class='fancytree-title data-tree-title'>" + escapeHTML(item.title) + "</span>\"";

        //if ( item.doi )
        //    title += " doi:" + escapeHTML(item.doi);

        title += "&nbsp&nbsp<span class='";

        if ( item.alias )
            title += "data-tree-alias'>("+ item.alias.substr(item.alias.lastIndexOf(":") + 1) + ")";
        else
            title += "data-tree-id'>[" + item.id + "]";

        title += "</span>";

        /*
        if ( item.alias )
            title += escapeHTML("\"" + item.title + "\" (" + item.alias.substr(item.alias.lastIndexOf(":") + 1) + ")");
        else
            title += escapeHTML("\"" + item.title + "\" [" + item.id + "]");

            //title += escapeHTML("\"" + item.title + "\" [" + item.id.substr(2) + "]");
        */


        return title;
    }

    this.generateTooltip = function( item ) {
        return escapeHTML("\"" + item.title + "\"") +
            ", id: " + item.id +
            (item.alias?", alias: "+item.alias:"") +
            (item.doi?", doi: "+item.doi:"");
    }

    this.xfrUpdateHistory = function( xfr_list ){
        var len = xfr_list.length;
        var html;
        if ( len == 0 ){
            html = "(no recent transfers)";
        }else{
            html = "<table class='info_table'><tr><th>Trans. ID</th><th>Mode</th><th>Data ID</th><th>Path</th><th>Started</th><th>Updated</th><th>Status</th></tr>";
            var stat;
            var start = new Date(0);
            var update = new Date(0);

            for ( var i = 0; i < len; i++ ) {
                stat = xfr_list[i];
                console.log("repo stat:",stat);
                html += "<tr><td>" + stat.id + "</td><td>";
                switch(stat.mode){
                    case "XM_GET": html += "Get"; break;
                    case "XM_PUT": html += "Put"; break;
                    case "XM_COPY": html += "Copy"; break;
                }

                html += "</td><td>";
                if ( stat.repo.file.length == 1 )
                    html += stat.repo.file[0].id;
                else
                    html += "(multiple)";

                html += "</td><td>";

                if ( stat.mode == "XM_COPY" )
                    html += "d/" + stat.localPath.substr( stat.localPath.lastIndexOf("/") + 1);
                else
                    html += stat.remEp + stat.remPath;
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
        //_asyncGet( "/api/repo/list?details=true", null, function(ok,data){
        repoList( true, false, function(ok,data){
            console.log("repo list:",ok,data);
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
                $(".repo_adm","#repo_list").click( function(ev){
                    dlgRepoEdit($(this).attr("repo"),function(){
                        inst.setupRepoTab();
                    });
                });
            }
        });
    }

    this.graphLoad = function( a_id, a_sel_node_id ){
        inst.focus_node_id = a_id;
        inst.sel_node_id = a_sel_node_id?a_sel_node_id:a_id;
        inst.sel_node = null;

        //console.log("owner:",a_owner);
        dataGetDepGraph( a_id, function( a_data ){
            console.log("dep data:",a_data);
            var item, i, j, dep, node;

            inst.link_data = [];
            //inst.graph_nodes = {};
            //inst.graph_edges = {};

            var new_node_data = [];
            var id,id_map = {};

            for ( i in a_data.item ){
                if ( a_data.item[i].id == a_id ){
                    inst.graph_owner = a_data.item[i].owner;
                    break;
                }
            }

            //node.label = item.owner.charAt(0)+":"+item.owner.substr(2)+":"+item.alias;

            for ( i in a_data.item ){
                item = a_data.item[i];
                //console.log("node:",item);
                node = {id:item.id,locked:item.locked,links:[]}
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

                if ( item.id == inst.sel_node_id ){
                    inst.sel_node = node;
                }

                //inst.graph_nodes[item.id] = {req:item.gen!=undefined,edges:[]};

                id_map[node.id] = new_node_data.length;
                new_node_data.push(node);
                for ( j in item.dep ){
                    dep = item.dep[j];
                    id = item.id+"-"+dep.id;
                    inst.link_data.push({source:item.id,target:dep.id,ty:DepTypeFromString[dep.type],id:id});
                    //inst.graph_edges[id] = [item.id,dep.id];
                }
            }

            for ( i in inst.link_data ){
                dep = inst.link_data[i];
                //console.log("link",dep);
                node = new_node_data[id_map[dep.source]];
                node.links.push(dep);
                node = new_node_data[id_map[dep.target]];
                node.links.push(dep);
                //inst.graph_nodes[dep.source].edges.push(dep.id);
                //inst.graph_nodes[dep.target].edges.push(dep.id);
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

            if ( !inst.sel_node ){
                if ( inst.node_data.length ){
                    inst.sel_node = inst.node_data[0];
                    inst.sel_node_id = inst.sel_node.id;
                }else{
                    inst.sel_node_id = null;
                }
            }

            inst.renderDepGraph();
            inst.showSelectedInfo( inst.sel_node_id );

            //console.log("graph nodes:",inst.graph_nodes);
            //console.log("graph edges:",inst.graph_edges);
        });
    }

    this.graphUpdate = function( a_ids, a_data ){
        // Only updates locked and alias of impacted nodes

        var ids = Array.isArray(a_ids)?a_ids:[a_ids];
        var data = Array.isArray(a_data)?a_data:[a_data];
        var i, node, item, render = false;

        for ( i = 0; i < ids.length; i++ ){
            node = inst.graphNodeFind( ids[i] );
            if ( node ){
                render = true;
                item = data[i];

                node.locked = item.locked;
                if ( item.alias ){
                    node.label = item.alias;
                }else
                    node.label = item.id;
            }
        }

        if ( render )
            inst.renderDepGraph();
    }

    this.renderDepGraph = function(){
        var g;

        inst.links = inst.links_grp.selectAll('line')
            .data( inst.link_data, function(d) { return d.id; });

        inst.links.enter()
            .append("line")
                .attr('marker-start',function(d){
                    //console.log("link enter 1");
                    switch ( d.ty ){
                        case 0: return 'url(#arrow-derivation)';
                        case 1: return 'url(#arrow-component)';
                        default: return '';
                    }
                })
                .attr('marker-end',function(d){
                    //console.log("link enter 1");
                    switch ( d.ty ){
                        case 2: return 'url(#arrow-new-version)';
                        default: return '';
                    }
                })
                .attr('class',function(d){
                    //console.log("link enter 2");
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

                //console.log("upd node", d );

                if ( d.id == inst.focus_node_id )
                    res += "main";
                else if ( d.row != undefined )
                    res += "prov";
                else{
                    //console.log("upd other node", d );
                    res += "other";
                }

                if ( d.comp )
                    res += " comp";
                else
                    res += " part";

                return res;
            });

        inst.nodes.select("text.label")
            .text(function(d) {
                return d.label;
            })
            .attr('x', function(d){
                if ( d.locked )
                    return r + 12;
                else
                    return r;
            });

        inst.nodes.select("text.locked")
            .html(function(d) {
                if (d.locked )
                    return "&#xe6bb";
                else
                    return "";
            });


        inst.nodes.selectAll(".node > circle.select")
            .attr("class", function(d){
                if ( d.id == inst.sel_node_id ){
                    //inst.sel_node = d;
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
                //console.log("node enter 1");

                if ( d.id == inst.focus_node_id )
                    res += "main";
                else if ( d.row != undefined )
                    res += "prov";
                else{
                    res += "other";
                    //console.log("new other node", d );
                }

                if ( d.comp )
                    res += " comp";
                else
                    res += " part";

                return res;
            })
            .on("mouseover",function(d){
                //console.log("mouse over");
                d3.select(this)
                    .transition()
                    .duration(150)
                    .attr('r',r*1.5);
            })
            .on("mouseout",function(d){
                d3.select(this)
                    .transition()
                    .duration(500)
                    .attr('r',r);
            })
            .on("dblclick", function(d,i){
                //console.log("dbl click");
                if ( d.comp )
                    inst.actionGraphNodeCollapse();
                else
                    inst.actionGraphNodeExpand();
                d3.event.stopPropagation();
            })
            .on("click", function(d,i){
                //console.log("click");
                if ( inst.sel_node != d ){
                    d3.select(".highlight")
                        .attr("class","select hidden");
                    d3.select(this.parentNode).select(".select")
                        .attr("class","select highlight");
                    inst.sel_node = d;
                    inst.sel_node_id = d.id;
                    inst.showSelectedInfo( d.id );
                }
                d3.event.stopPropagation();
            });

        g.append("circle")
            .attr("r", r *1.5)
            .attr("class", function(d){
                //console.log("node enter 3");

                if ( d.id == inst.sel_node_id ){
                    //inst.sel_node = d;
                    return "select highlight";
                }else
                    return "select hidden";
            });

        g.append("text")
            .attr("class","label")
            .text(function(d) {
                return d.label;
            })
            .attr('x', function(d){
                if ( d.locked )
                    return r + 12;
                else
                    return r;
            })
            .attr('y', -r)

        g.append("text")
            .attr("class","locked")
            .html(function(d) {
                if (d.locked )
                    return "&#xe6bb";
                else
                    return "";
            })
            .attr('x', r-3)
            .attr('y', -r+1)

        inst.nodes.exit()
            .remove();

        inst.nodes = inst.nodes_grp.selectAll('g');

        if ( inst.simulation ){
            //console.log("restart sim");
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
                        case 2: return .2;
                    }
                })
                .id( function(d) { return d.id; })

            inst.simulation = d3.forceSimulation()
                .nodes(inst.node_data)
                //.force('center', d3.forceCenter(200,200))
                .force('charge', d3.forceManyBody()
                    .strength(-300))
                .force('row', d3.forceY( function(d,i){ return d.row != undefined ?(75 + d.row*75):0; })
                    .strength( function(d){ return d.row != undefined ?.05:0; }))
                .force('col', d3.forceX(function(d,i){ return d.col != undefined?inst.graph_center_x:0; })
                    .strength( function(d){ return d.col != undefined ?.05:0; }))
                .force("link", linkForce )
                .on('tick', inst.simTick);

        }
    }

    this.dragStarted = function(d) {
        //console.log("drag start",d.id);
        if (!d3.event.active) inst.simulation.alphaTarget(0.3).restart();
        d.fx = d3.event.x;
        d.fy = d3.event.y;
        d3.event.sourceEvent.stopPropagation();
    }

    this.dragged = function(d) {
        //console.log("drag",d3.event.x,d3.event.y);
        d.fx = d3.event.x;
        d.fy = d3.event.y;
        inst.simTick(); 
        d3.event.sourceEvent.stopPropagation();
    }

    this.dragEnded = function(d){
        //console.log("drag end",d.id);
        if (!d3.event.active) inst.simulation.alphaTarget(0);
        d.x = d.fx;
        d.y = d.fy;
        delete d.fx;
        delete d.fy;
        //console.log("at:",d);
        d3.event.sourceEvent.stopPropagation();
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

    this.actionGraphNodeExpand = function(){
        console.log("expand node");
        //inst.sel_node_id = "d/51724878";

        if ( inst.sel_node && !inst.sel_node.comp ){
            //var exp_node = graphNodeFind( inst.sel_node )
            dataGetDeps( inst.sel_node_id, function( data ){
                //console.log("expand node data:",data);
                if ( data && data.item ){
                    var rec = data.item[0];
                    //console.log("node:",data);

                    inst.sel_node.comp = true;

                    var dep,node,link,i,id;

                    //node = inst.graphNodeFind(inst.sel_node_id);
                    //node.comp = true;

                    for ( i in rec.dep ){
                        dep = rec.dep[i];

                        if ( dep.dir == "DEP_IN" )
                            id = dep.id+"-"+rec.id;
                        else
                            id = rec.id+"-"+dep.id;

                        link = inst.graphLinkFind( id );
                        if ( link )
                            continue;

                        link = {id:id,ty:DepTypeFromString[dep.type]};
                        if ( dep.dir == "DEP_IN" ){
                            link.source = dep.id;
                            link.target = rec.id;
                        }else{
                            link.source = rec.id;
                            link.target = dep.id;
                        }

                        inst.sel_node.links.push(link);

                        node = inst.graphNodeFind(dep.id);
                        if ( !node ){
                            //console.log("adding node");
                            inst.node_data.push({id:dep.id,label:dep.alias?dep.alias:dep.id,links:[link]});
                        }else{
                            node.links.push(link);
                        }

                        //console.log("adding link");

                        inst.link_data.push(link);
                    }

                    inst.renderDepGraph();
                }
            });
        }
    }

    this.actionGraphNodeCollapse = function(){
        //console.log("collapse node");
        if ( inst.sel_node ){
            var i, link, dest, loc_trim=[];

            inst.sel_node.comp = false;

            for ( i = inst.sel_node.links.length - 1; i >= 0; i-- ){
                link = inst.sel_node.links[i];
                //console.log("lev 0 link:",link);
                dest = (link.source != inst.sel_node)?link.source:link.target;
                inst.graphPruneCalc( dest, [inst.sel_node.id], inst.sel_node );

                if ( !dest.prune && dest.row == undefined ){
                    inst.graphPruneReset(-1);
                    link.prune += 1;
                    //inst.graphPrune();
                }

                if ( dest.prune ){
                    //console.log("PRUNE ALL");
                    inst.graphPrune();
                }else if ( dest.row == undefined ){
                    //console.log("PRUNE LOCAL EDGE ONLY");
                    inst.graphPruneReset();
                    loc_trim.push(link);
                    //link.prune = true;
                    //inst.graphPrune();
                }else{
                    //console.log("PRUNE NONE");
                    inst.graphPruneReset();
                }
            }

            if ( loc_trim.length < inst.sel_node.links.length ){
                for ( i in loc_trim ){
                    loc_trim[i].prune = true;
                }
                inst.graphPrune();
            }

            //inst.graphPruneReset();

            inst.renderDepGraph();
        }
    }

    this.actionGraphNodeHide = function(){
        if ( inst.sel_node && inst.sel_node.id != inst.focus_node_id && inst.node_data.length > 1 ){
            inst.sel_node.prune = true;
            // Check for disconnection of the graph
            var start = inst.sel_node.links[0].source == inst.sel_node?inst.sel_node.links[0].target:inst.sel_node.links[0].source;
            if ( inst.graphCountConnected( start, [] ) == inst.node_data.length - 1 ){
                for ( i in inst.sel_node.links ){
                    inst.sel_node.links[i].prune = true;
                }
                inst.graphPrune();

                inst.sel_node = inst.node_data[0];
                inst.sel_node_id = inst.sel_node.id;
                inst.renderDepGraph();
            }else{
                inst.sel_node.prune = false;
                setStatusText("Node cannot be hidden");
            }
        }
    }

    this.graphCountConnected = function(a_node,a_visited,a_from){
        var count = 0;

        if ( a_visited.indexOf( a_node.id ) < 0 && !a_node.prune ){
            a_visited.push(a_node.id);
            count++;
            var link,dest;
            for ( var i in a_node.links ){
                link = a_node.links[i];
                if ( link != a_from ){
                    dest = (link.source == a_node?link.target:link.source);
                    count += graphCountConnected(dest,a_visited,link);
                }
            }
        }

        return count;
    }

    this.graphPrune = function(){
        var i,j,item;

        for ( i = inst.link_data.length - 1; i >= 0; i-- ){
            item = inst.link_data[i];
            if ( item.prune ){
                //console.log("pruning link:",item);
                if ( !item.source.prune ){
                    item.source.comp = false;
                    j = item.source.links.indexOf( item );
                    if ( j != -1 ){
                        item.source.links.splice(j,1);
                    }else{
                        console.log("BAD INDEX IN SOURCE LINKS!");
                    }
                }
                if ( !item.target.prune ){
                    item.target.comp = false;
                    j = item.target.links.indexOf( item );
                    if ( j != -1 ){
                        item.target.links.splice(j,1);
                    }else{
                        console.log("BAD INDEX IN TARGET LINKS!");
                    }
                }
                inst.link_data.splice(i,1)
            }
        }

        for ( i = inst.node_data.length - 1; i >= 0; i-- ){
            item = inst.node_data[i];
            if ( item.prune ){
                //console.log("pruning node:",item);
                inst.node_data.splice(i,1)
            }
        }
    }

    this.graphPruneReset = function(){
        var i;
        for ( i in inst.node_data ){
            inst.node_data[i].prune = false;
        }
        for ( i in inst.link_data ){
            inst.link_data[i].prune = false;
        }
    }

    // Depth-first-search to required nodes, mark for pruning
    this.graphPruneCalc = function( a_node, a_visited, a_source ){
        //console.log("graphPrune",a_node.label);
        if ( a_visited.indexOf(a_node.id) < 0 ){
            a_visited.push(a_node.id);

            if ( a_node.row != undefined ){
                //console.log("required node");
                return false;
            }

            var i, prune, dest, keep = false;

            for ( i in a_node.links ){
                link = a_node.links[i];
                //console.log("link:",link);
                dest = (link.source != a_node)?link.source:link.target;
                if ( dest != a_source ){
                    prune = inst.graphPruneCalc( dest, a_visited, a_node );
                    keep |= !prune;
                }
            }

            if ( !keep ){
                //console.log("prune!");
                a_node.prune = true;
                for ( i in a_node.links )
                    a_node.links[i].prune=true;

            }/*else{
                console.log("NO prune!");
            }*/

        }/*else
            console.log("already visited",a_visited);*/


        return a_node.prune;
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
            setStatusText("Cannot select across collections or categories",1);
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

    this.treeSelectRange = function( a_tree, a_node ){
        if ( a_node.parent != inst.selectScope.parent || a_node.data.scope != inst.selectScope.data.scope ){
            setStatusText("Cannot select across collections or categories",1);
            return;
        }

        var act_node = a_tree.activeNode;
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
                setStatusText("Range select only supported within a single collection.",1);
            }
        }
    }

    this.pasteAllowed = function( dest_node, src_node ){
        //console.log("pasteAllowed:",dest_node, src_node);
        //console.log("pasteSource:",inst.pasteSource);
        //if ( !dest_node.data.notarg && dest_node.data.scope == src_node.data.scope ){
        if ( !dest_node.data.notarg && dest_node.data.scope && (dest_node.data.scope.startsWith("u/") || dest_node.data.scope.startsWith("p/"))){
            // TODO - Wrong: must check parent keys
            //console.log("source par key:",inst.pasteSource.key,"dest:", dest_node.parent.key );
            if ( dest_node.key.startsWith("c/") ){
                if ( inst.pasteSource.key == dest_node.key )
                    return false;
            }else if (dest_node.key.startsWith("d/")){
                if ( inst.pasteSource.key == dest_node.parent.key || !dest_node.parent.key.startsWith("c/"))
                    return false;
            }else if (dest_node.key.startsWith("repo/")){
                if ( inst.pasteSource.data.scope != dest_node.data.scope )
                    return false;
            }else
                return false;

            if ( inst.pasteCollections.length ){
                var i,j,coll,dest_par = dest_node.getParentList(false,true);
                // Prevent collection drop in non-collection hierarchy
                /*for ( j in dest_par ){
                    if ( dest_par[j].data.nocoll )
                        return false;
                }*/
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
        //console.log("pageLoad",key, offset);
        var node = inst.data_tree.getNodeByKey( key );
        if ( node ){
            node.data.offset = offset;
            setTimeout(function(){
                node.load(true);
            },0);
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
        {title:"My Projects <i class='browse-reload ui-icon ui-icon-reload'></i>",folder:true,icon:"ui-icon ui-icon-view-icons",nodrag:true,lazy:true,key:"proj_own",offset:0},
        {title:"Managed Projects <i class='browse-reload ui-icon ui-icon-reload'></i>",folder:true,icon:"ui-icon ui-icon-view-icons",nodrag:true,lazy:true,key:"proj_adm",offset:0},
        {title:"Member Projects <i class='browse-reload ui-icon ui-icon-reload'></i>",folder:true,icon:"ui-icon ui-icon-view-icons",nodrag:true,lazy:true,key:"proj_mem",offset:0},
        {title:"Shared Data",folder:true,icon:"ui-icon ui-icon-circle-plus",nodrag:true,key:"shared_all",children:[
            {title:"By User <i class='browse-reload ui-icon ui-icon-reload'></i>",nodrag:true,folder:true,lazy:true,key:"shared_user"},
            {title:"By Project <i class='browse-reload ui-icon ui-icon-reload'></i>",nodrag:true,folder:true,lazy:true,key:"shared_proj"}
        ]},
        //{title:"My Topics <i class='browse-reload ui-icon ui-icon-reload'></i>",checkbox:false,folder:true,icon:"ui-icon ui-icon-structure",lazy:true,nodrag:true,key:"topics",offset:0},
        {title:"Saved Queries <i class='browse-reload ui-icon ui-icon-reload'></i>",folder:true,icon:"ui-icon ui-icon-view-list",lazy:true,nodrag:true,key:"queries",checkbox:false,offset:0},
        //{title:"Search Results",icon:"ui-icon ui-icon-zoom",checkbox:false,folder:true,children:[{title:"(no results)",icon:false, nodrag:true,checkbox:false}],key:"search",nodrag:true}
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

                /*
                var repo,j,dest_par = dest_node.getParentList(false,true);
                for ( j in dest_par ){
                    if ( dest_par[j].key.startsWith("repo/")){
                        repo = dest_par[j].key.substr(0,key.indexOf("/",5));
                        console.log("repo:",repo);
                        break;
                    }
                }*/

                if ( inst.pasteSource.data.scope != dest_node.data.scope /*|| repo*/ ){
                    /*var msg;
                    if ( repo )
                        msg = "This operation will cause raw data to be relocated to another repository.";
                    else
                        msg = "This operation will transfer ownership to another user/project and relocate raw data.";
                    msg += " Specified data records will be unavailable during relocation. Continue?";

                    dlgConfirmChoice( "Confirm Data Relocation", msg, ["Relocate","Cancel"], function(choice){
                        if ( choice == 0 ){*/
                            var keys = [];
                            for( var i in inst.pasteItems ){
                                keys.push( inst.pasteItems[i].key );
                            }
                            var dest;
                            if ( dest_node.key.startsWith("c/") )
                                dest = dest_node.key;
                            if ( dest_node.key.startsWith("repo/"))
                                dest = dest_node.data.repo;
                            else
                                dest = dest_node.parent.key;

                            dlgDataRelocate( keys, dest, dest_node.data.scope, function(){

                            //relocateItems( keys, dest, dest_node.data.scope, function(){
                            });
                        /*}
                    });*/
                    return;
                }

                function pasteDone(){
                    inst.pasteItems = [];
                    inst.pasteSource = null;
                    inst.pasteCollections = null;
                }

                if ( inst.drag_mode ){
                    inst.moveItems( inst.pasteItems, dest_node, /*data.otherNode,*/ pasteDone );
                }else{
                    inst.copyItems( inst.pasteItems, dest_node, pasteDone );
                }
            },
            dragEnter: function(node, data) {
                if ( inst.dragging ){
                    console.log( "drag enter:", node, data );
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
        //tooltip: function( ev, data ){
        //    return "tooltip";
        //},
        lazyLoad: function( event, data ) {
            if ( data.node.key == "mydata" ){
                data.result = [
                    {title:"Root Collection",folder:true,expanded:false,lazy:true,key:inst.my_root_key,offset:0,user:g_user.uid,scope:"u/"+g_user.uid,nodrag:true,isroot:true,admin:true},
                    {title:"Published Collections",folder:true,expanded:false,lazy:true,key:"published",offset:0,scope:"u/"+g_user.uid,nodrag:true,checkbox:false,icon:"ui-icon ui-icon-structure"},
                    {title:"Allocations",folder:true,lazy:true,icon:"ui-icon ui-icon-databases",key:"allocs",scope:"u/"+g_user.uid,nodrag:true,notarg:true,checkbox:false}
                ];
            }else if ( data.node.key == "proj_own" ){
                    data.result = {
                    url: "/api/prj/list?owner=true&offset="+data.node.data.offset+"&count="+g_opts.page_sz,
                    cache: false
                };
            } else if ( data.node.key == "proj_adm" ){
                data.result = {
                    url: "/api/prj/list?admin=true&offset="+data.node.data.offset+"&count="+g_opts.page_sz,
                    cache: false
                };
            } else if ( data.node.key == "proj_mem" ){
                data.result = {
                    url: "/api/prj/list?member=true&offset="+data.node.data.offset+"&count="+g_opts.page_sz,
                    cache: false
                };
            }else if ( data.node.key.startsWith("p/")){
                var prj_id = data.node.key.substr(2);
                data.result = [
                    {title: "Root Collection",folder:true,lazy:true,key:"c/p_"+prj_id+"_root",scope:data.node.key,isroot:true,admin:data.node.data.admin,nodrag:true},
                    {title:"Published Collections",folder:true,expanded:false,lazy:true,key:"published",offset:0,scope:data.node.key,nodrag:true,checkbox:false,icon:"ui-icon ui-icon-structure"},
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
                    url: "/api/dat/list/by_alloc?repo=" + encodeURIComponent(data.node.data.repo) + "&subject=" + encodeURIComponent(data.node.data.scope) + "&offset="+data.node.data.offset+"&count="+g_opts.page_sz,
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
            } else if ( data.node.key == "published" ) {
                data.result = {
                    url: "/api/col/published/list?subject=" + encodeURIComponent(data.node.data.scope) + "&offset="+data.node.data.offset+"&count="+g_opts.page_sz,
                    cache: false
                };
            }/* else if ( data.node.key == "topics" ) {
                data.result = {
                    url: "/api/top/list?offset="+data.node.data.offset+"&count="+g_opts.page_sz,
                    cache: false
                };
            }*/ else if ( data.node.key == "favorites" || data.node.key == "views" ) {
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
                if ( data.response.item && data.response.item.length ){
                    console.log( "pos proc project:", data.response );
                    var item;
                    var admin = (data.node.key=="proj_own"?true:false);

                    for ( var i in data.response.item ) {
                        item = data.response.item[i];
                        data.result.push({ title: inst.generateTitle(item)+" <i class='browse-reload ui-icon ui-icon-reload'></i>",icon:"ui-icon ui-icon-box",tooltip:inst.generateTooltip(item),folder:true,key:item.id,isproj:true,admin:admin,nodrag:true,lazy:true});
                    }
                }

                if ( data.response.offset > 0 || data.response.total > (data.response.offset + data.response.count) ){
                    var pages = Math.ceil(data.response.total/g_opts.page_sz), page = 1+data.response.offset/g_opts.page_sz;
                    data.result.push({title:"<button class='btn small''"+(page==1?" disabled":"")+" onclick='pageLoad(\""+data.node.key+"\",0)'>First</button> <button class='btn small'"+(page==1?" disabled":"")+" onclick='pageLoad(\""+data.node.key+"\","+(page-2)*g_opts.page_sz+")'>Prev</button> Page " + page + " of " + pages + " <button class='btn small'"+(page==pages?" disabled":"")+" onclick='pageLoad(\""+data.node.key+"\","+page*g_opts.page_sz+")'>Next</button> <button class='btn small'"+(page==pages?" disabled":"")+" onclick='pageLoad(\""+data.node.key+"\","+(pages-1)*g_opts.page_sz+")'>Last</button>",folder:false,icon:false,checkbox:false,hasBtn:true});
                }
            } else if ( data.node.key == "shared_user" && !data.node.data.scope ){
                data.result = [];
                if ( data.response.length ){
                    var item;
                    for ( var i in data.response ) {
                        item = data.response[i];
                        data.result.push({ title: item.name + " (" + item.uid + ") <i class='browse-reload ui-icon ui-icon-reload'></i>",icon:"ui-icon ui-icon-box",folder:true,key:"shared_user_"+item.uid,scope:"u/"+item.uid,lazy:true,nodrag:true});
                    }
                }
            } else if ( data.node.key == "shared_proj" && !data.node.data.scope ){
                data.result = [];
                if ( data.response.length ){
                    var item;
                    for ( var i in data.response ) {
                        item = data.response[i];
                        data.result.push({ title: inst.generateTitle(item) + " <i class='browse-reload ui-icon ui-icon-reload'></i>",icon:"ui-icon ui-icon-box",tooltip:inst.generateTooltip(item),folder:true,key:"shared_proj_"+item.id,scope:item.id,lazy:true,nodrag:true});
                    }
                }
            } else if ( data.node.key == "queries" ) {
                data.result = [];
                if ( data.response.length ){
                    var qry;
                    for ( var i in data.response ) {
                        qry = data.response[i];
                        data.result.push({ title: qry.title+" <i class='browse-reload ui-icon ui-icon-reload'></i>",icon:"ui-icon ui-icon-zoom",folder:true,key:qry.id,lazy:true,offset:0,checkbox:false,nodrag:true});
                    }
                }
            } else if ( data.node.key == "allocs" ) {
                data.result = [];
                if ( data.response.length ){
                    var alloc;
                    for ( var i in data.response ) {
                        alloc = data.response[i];
                        console.log("alloc:",alloc,"scope:",alloc.id);
                        data.result.push({ title: alloc.repo.substr(5)+" <i class='browse-reload ui-icon ui-icon-reload'></i>",icon:"ui-icon ui-icon-database",folder:true,key:alloc.repo+"/"+alloc.id,scope:alloc.id,repo:alloc.repo,lazy:true,offset:0,alloc_capacity:alloc.maxSize,alloc_usage:alloc.totSize,alloc_max_count:alloc.maxCount,sub_alloc:alloc.subAlloc,nodrag:true,checkbox:false});
                    }
                }
            } else if ( data.node.parent || data.node.key == "published" ) {
                //console.log("pos proc default",data.node.key,data.response);
                data.result = [];
                var item,entry,scope = data.node.data.scope;
                var items = data.response.data?data.response.data:data.response.item;
                for ( var i in items ) {
                    item = items[i];
                    if ( item.id[0]=="c" ){
                        entry = { title: inst.generateTitle(item),tooltip:inst.generateTooltip(item),folder:true,lazy:true,scope:scope,key:item.id, offset: 0 };
                    }else{
                        entry = { title: inst.generateTitle(item),tooltip:inst.generateTooltip(item),checkbox:false,folder:false,icon:item.doi?"ui-icon ui-icon-linkext":"ui-icon ui-icon-file",scope:item.owner?item.owner:scope,key:item.id,doi:item.doi };
                    }

                    data.result.push( entry );
                }

                if ( data.response.offset > 0 || data.response.total > (data.response.offset + data.response.count) ){
                    var pages = Math.ceil(data.response.total/g_opts.page_sz), page = 1+data.response.offset/g_opts.page_sz;
                    data.result.push({title:"<button class='btn small''"+(page==1?" disabled":"")+" onclick='pageLoad(\""+data.node.key+"\",0)'>First</button> <button class='btn small'"+(page==1?" disabled":"")+" onclick='pageLoad(\""+data.node.key+"\","+(page-2)*g_opts.page_sz+")'>Prev</button> Page " + page + " of " + pages + " <button class='btn small'"+(page==pages?" disabled":"")+" onclick='pageLoad(\""+data.node.key+"\","+page*g_opts.page_sz+")'>Next</button> <button class='btn small'"+(page==pages?" disabled":"")+" onclick='pageLoad(\""+data.node.key+"\","+(pages-1)*g_opts.page_sz+")'>Last</button>",folder:false,icon:false,checkbox:false,hasBtn:true});
                }
            }
            if ( data.result && data.result.length == 0 ){
                data.result.push({title:"(empty)",icon:false,checkbox:false,nodrag:true});
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
            //console.log("node click,target:",data.targetType);

            if ( data.targetType == "icon" && data.node.isFolder() ){
                data.node.toggleExpanded();
            }

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
                        inst.treeSelectRange(inst.data_tree,data.node);
                    }else if ( data.originalEvent.ctrlKey || data.originalEvent.metaKey ) {
                        inst.treeSelectNode(data.node,true);
                    }else if ( data.originalEvent.shiftKey ) {
                        inst.data_tree.selectAll(false);
                        inst.selectScope = data.node;
                        inst.treeSelectRange(inst.data_tree,data.node);
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

    tooltipTheme( inst.data_tree_div );

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
        },
        click: function( ev, data ){
            if ( data.targetType == "icon" && data.node.isFolder() ){
                data.node.toggleExpanded();
            }
        }
    });

    this.data_md_tree = $("#data_md_tree").fancytree("getTree");

    // Connect event/click handlers
    $("#btn_new_proj",inst.frame).on('click', inst.actionNewProj );
    $("#btn_new_data",inst.frame).on('click', inst.actionNewData );
    $("#btn_new_coll",inst.frame).on('click', inst.actionNewColl );
    $("#btn_import_data",inst.frame).on('click', function(){
        inst.update_files = false
        $('#input_files',inst.frame).val("");
        $('#input_files',inst.frame).trigger('click');
    });
    $("#btn_update_data",inst.frame).on('click', function(){
        inst.update_files = true
        $('#input_files',inst.frame).val("");
        $('#input_files',inst.frame).trigger('click');
    });

    var async_guard = false;

    function asyncFunc( fn ){
        return function(){
            if ( !async_guard ){
                console.log(">>> asyncBegin");
                async_guard = true;
                //$("body").css("cursor", "progress");
                return fn.apply(this,arguments);
            }else{
                console.log(">>> asyncBegin blocked");
            }
        }
    }

    function asyncEnd(){
        if ( async_guard ){
            console.log("<<< asyncEnd");
            //$("body").css("cursor", "default");
            async_guard = false;
        }else{
            console.log("<<< asyncEnd INVALID!!!!");
        }
    }

    $("#btn_edit",inst.frame).on('click', inst.actionEditSelected );
    //$("#btn_dup",inst.frame).on('click', inst.dupSelected );
    $("#btn_del",inst.frame).on('click', inst.actionDeleteSelected );
    $("#btn_share",inst.frame).on('click', inst.actionShareSelected );
    $("#btn_lock",inst.frame).on('click', inst.actionLockSelected );
    $("#btn_unlock",inst.frame).on('click', inst.actionUnlockSelected );
    $("#btn_upload",inst.frame).on('click', inst.actionDataPut );
    $("#btn_download",inst.frame).on('click', inst.actionDataGet );
    $("#btn_move",inst.frame).on('click', inst.actionDataMove );
    $("#btn_dep_graph",inst.frame).on('click', inst.actionDepGraph );
    $("#btn_prev_coll",inst.frame).on('click', inst.actionPrevParent );
    $("#btn_next_coll",inst.frame).on('click', inst.actionNextParent );
    $("#btn_first_par_coll",inst.frame).on('click', inst.actionFirstParent );

    $("#btn_exp_node",inst.frame).on('click', inst.actionGraphNodeExpand );
    $("#btn_col_node",inst.frame).on('click', inst.actionGraphNodeCollapse );
    $("#btn_hide_node",inst.frame).on('click', inst.actionGraphNodeHide );

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

    $(document.body).on('click', '.browse-reload' , inst.actionReloadSelected );

    $("#id_query,#text_query,#meta_query").on('keyup', function (e) {
        if (e.keyCode == 13)
            inst.searchDirect();
    });

    if ( g_user.isRepoAdmin ){
        setupRepoTab();
        $('[href="#tab-repo"]').closest('li').show();
    }

    if ( g_user.isAdmin ){
        //setupRepoTab();
        $('[href="#tab-admin"]').closest('li').show();
        $("#btn_manage_repos",inst.frame).on('click', dlgRepoManage );
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
    //-------------------------------------------------------------------------
    // CATALOG TREE

    var cat_subtab = new CatalogSubTab( inst, $("#tab-catalogs"));
    inst.cat_tree_div = $('#catalog_tree',$("#tab-catalogs"));
    inst.cat_tree = inst.cat_tree_div.fancytree('getTree');

    //inst.cat_tree_div = $('#catalog_tree');
    //inst.cat_tree = inst.cat_tree_div.fancytree('getTree');

    $("#search_results_tree").fancytree({
        extensions: ["themeroller"],
        themeroller: {
            activeClass: "my-fancytree-active",
            addClass: "",
            focusClass: "",
            hoverClass: "my-fancytree-hover",
            selectedClass: ""
        },
        source: [{title:"(no results)"}],
        selectMode: 2,
        activate: function( event, data ) {
            if ( inst.keyNav && !inst.keyNavMS ){
                inst.results_tree.selectAll(false);
                inst.selectScope = data.node;
                inst.treeSelectNode(data.node);
            }
            inst.keyNav = false;

            inst.showSelectedInfo( data.node );
        },
        select: function( event, data ) {
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
            if ( event.which == null ){
                // RIGHT-CLICK CONTEXT MENU
                //console.log("click no which");

                if ( !data.node.isSelected() ){
                    //console.log("not selected");
                    inst.results_tree.selectAll(false);
                    inst.selectScope = data.node;
                    inst.treeSelectNode(data.node);
                }

                // Enable/disable actions
                inst.results_tree_div.contextmenu("enableEntry", "unlink", false );
                inst.results_tree_div.contextmenu("enableEntry", "cut", false );
                inst.results_tree_div.contextmenu("enableEntry", "copy", true );
                inst.results_tree_div.contextmenu("enableEntry", "paste", false );
                inst.results_tree_div.contextmenu("enableEntry", "new", false );

            } else if ( data.targetType != "expander" /*&& data.node.data.scope*/ ){
                //console.log("has scope");
                if ( inst.results_tree.getSelectedNodes().length == 0 )
                    inst.selectScope = data.node;

                if ( data.originalEvent.shiftKey && (data.originalEvent.ctrlKey || data.originalEvent.metaKey)) {
                    inst.treeSelectRange(inst.results_tree,data.node);
                }else if ( data.originalEvent.ctrlKey || data.originalEvent.metaKey ) {
                    inst.treeSelectNode(data.node,true);
                }else if ( data.originalEvent.shiftKey ) {
                    inst.results_tree.selectAll(false);
                    inst.selectScope = data.node;
                    inst.treeSelectRange(inst.results_tree,data.node);
                }else{
                    inst.results_tree.selectAll(false);
                    inst.selectScope = data.node;
                    inst.treeSelectNode(data.node);
                }
            }
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

    inst.results_tree_div = $('#search_results_tree');
    inst.results_tree = inst.results_tree_div.fancytree('getTree');

    tooltipTheme( inst.results_tree_div );

    var ctxt_menu_opts = {
        delegate: "li",
        show: false,
        hide: false,
        menu: [
            {title: "Actions", children: [
                {title: "Edit", action: inst.actionEditSelected, cmd: "edit" },
                //{title: "Duplicate", cmd: "dup" },
                {title: "Delete", action: inst.actionDeleteSelected, cmd: "del" },
                {title: "Sharing", action: inst.actionShareSelected, cmd: "share" },
                {title: "Lock", action: inst.actionLockSelected, cmd: "lock" },
                {title: "Unlock", action: inst.actionUnlockSelected, cmd: "unlock" },
                {title: "Get", action: inst.actionDataGet, cmd: "get" },
                {title: "Put", action: inst.actionDataPut, cmd: "put" },
                {title: "Move", action: inst.actionDataMove, cmd: "move" },
                {title: "Graph", action: inst.actionDepGraph, cmd: "graph" }
                ]},
            {title: "New", cmd:"new",children: [
                {title: "Data", action: inst.actionNewData, cmd: "newd" },
                {title: "Collection", action: inst.actionNewColl, cmd: "newc" },
                {title: "Project", action: inst.actionNewProj, cmd: "newp" }
                ]},
            {title: "----"},
            {title: "Cut", action: inst.actionCutSelected, cmd: "cut" },
            {title: "Copy", action: inst.actionCopySelected, cmd: "copy" },
            {title: "Paste", action: inst.actionPasteSelected, cmd: "paste" },
            {title: "Unlink", action: inst.actionUnlinkSelected, cmd: "unlink" }
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
    };

    inst.data_tree_div.contextmenu(ctxt_menu_opts);
    inst.results_tree_div.contextmenu(ctxt_menu_opts);

    $("#data-tabs").tabs({
        heightStyle:"fill",
        active: 0,
        activate: function(ev,ui){
            console.log("tabs activate");
            if ( ui.newPanel.length ){
                switch ( ui.newPanel[0].id ){
                    case "tab-data-tree":
                        console.log("tree tab");
                        inst.select_source = SS_TREE;
                        var node = inst.data_tree.activeNode;
                        inst.showSelectedInfo( node );
                        break;
                    case "tab-catalogs":
                        inst.select_source = SS_CAT;
                        // TODO update sel info
                        inst.showSelectedInfo();
                        console.log("cat tab");
                        break;
                    case "tab-prov-graph":
                        inst.select_source = SS_PROV;
                        inst.showSelectedInfo( inst.sel_node?inst.sel_node.id:null );
                        console.log("prov tab");
                        break;
                    case "tab-search-results":
                        inst.select_source = SS_SEARCH;
                        var node = inst.results_tree.activeNode;
                        inst.showSelectedInfo( node );
                        console.log("results tab");
                        break;
                }
            }
            inst.updateBtnState();
        }
    });

    $(".prov-graph-close").click( function(){
        inst.links_grp.selectAll("*").remove();
        inst.nodes_grp.selectAll("*").remove();
        inst.node_data = [];
        inst.link_data = [];
        $('[href="#tab-prov-graph"]').closest('li').hide();
        $( "#data-tabs" ).tabs({ active: 0 });
    });

    $(".search-results-close").click( function(){
        $("#search_results_tree").fancytree("getTree").clear();
        $('[href="#tab-search-results"]').closest('li').hide();
        $( "#data-tabs" ).tabs({ active: 0 });
    });

    $("#footer-tabs").tabs({
        heightStyle:"auto",
        //collapsible: true,
        activate: function(ev,ui){
            if ( ui.newPanel.length && ui.newPanel[0].id == "tab-search" ){
                inst.updateSearchSelectState( true );
            } else if ( ui.oldPanel.length && ui.oldPanel[0].id == "tab-search" ){
                inst.updateSearchSelectState( false );
            }
        }
    }).css({'overflow': 'auto'});

    $("#toggle_footer").click( function(){
        $("#footer-tabs").toggle(0,function(){
            inst.windowResized();
        });
    });

    $("#sel_descr_hdr").button().click( function(){
        $("#sel_descr").slideToggle();
    });
    $("#sel_links_hdr").button().click( function(){
        $("#sel_links").slideToggle();
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

    $('#input_files',inst.frame).on("change",function(ev){
        if ( ev.target.files && ev.target.files.length ){
            inst.actionImportData( ev.target.files );
        }
    });

    // Graph Init
    var zoom = d3.zoom();

    inst.svg = d3.select("svg")
    .call(zoom.on("zoom", function () {
        svg.attr("transform", d3.event.transform)
    }))
    .append("g")

    defineArrowMarkerDeriv(inst.svg);
    defineArrowMarkerComp(inst.svg);
    defineArrowMarkerNewVer(inst.svg);

    inst.links_grp = inst.svg.append("g")
        .attr("class", "links");

    inst.nodes_grp = inst.svg.append("g")
        .attr("class", "nodes");


    //$("#sel_details").slideToggle();

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
