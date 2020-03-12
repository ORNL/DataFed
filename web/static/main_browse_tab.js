function makeBrowserTab(){
    console.log("making browser tab");

    var inst = this;

    inst.frame = $("#content");
    this.task_hist = $("#task_hist",inst.frame);
    this.alloc_stat = $("#alloc_stat",inst.frame);
    this.data_tree = null;
    this.data_md_tree = null;
    this.data_md_empty = true;
    this.data_md_empty_src = [{title:"(n/a)", icon:false}];
    this.data_md_exp = {};
    this.taskHist = [];
    this.pollSince = g_opts.task_hist * 3600;
    this.pollMax = 120;
    this.pollMin = 4;
    this.my_root_key = "c/u_" + g_user.uid + "_root";
    this.uid = "u/" + g_user.uid;
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
        var h = $("#data-tabs-parent").height();
        inst.graph_center_x = $("#data-tabs-parent").width()/2;
        var tabs = $("#data-tabs");
        var hdr_h = $(".ui-tabs-nav",tabs).outerHeight();
        tabs.outerHeight(h);
        $(".ui-tabs-panel",tabs).outerHeight( h - hdr_h );

        h = $("#info-tabs-parent").height();
        tabs = $("#info-tabs");
        hdr_h = $(".ui-tabs-nav",tabs).outerHeight();
        tabs.outerHeight(h);
        $(".ui-tabs-panel",tabs).outerHeight( h - hdr_h );
    };

    this.getSelectedIDs = function(){
        var ids = [], sel, i;
        //console.log("getSelectedIDs, mode:",inst.select_source);
        switch( inst.select_source ){
            case SS_TREE:
                sel = inst.data_tree.getSelectedNodes();
                for ( i in sel ){
                    ids.push( sel[i].key );
                }
                break;
            case SS_SEARCH:
                sel = inst.results_tree.getSelectedNodes();
                for ( i in sel ){
                    ids.push( sel[i].key );
                }
                break;
            case SS_CAT:
                sel = inst.cat_tree.getSelectedNodes();
                for ( i in sel ){
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
    };

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
                    //node.setTitle( inst.generateTitle( data[idx] ));
                    node.title = inst.generateTitle( data[idx] );
                    inst.updateIcon( node, data[idx] );
                    node.renderTitle();
                    if ( a_reload )
                        inst.reloadNode( node );
                }
            });
        }

        if ( inst.cur_query ){
            inst.execQuery( inst.cur_query );
        }

        if ( inst.focus_node_id ){
            if ( a_ids && a_data )
                inst.graphUpdate( a_ids, a_data );
            else
                inst.graphLoad( inst.focus_node_id, inst.sel_node.id );
        }

        switch( inst.select_source ){
            case SS_TREE:
                inst.showSelectedInfo( inst.data_tree.activeNode );
                break;
            case SS_CAT:
                inst.showSelectedInfo();
                break;
            case SS_PROV:
                inst.showSelectedInfo( inst.sel_node?inst.sel_node.id:null );
                break;
            case SS_SEARCH:
                inst.showSelectedInfo( inst.results_tree.activeNode );
                break;
        }
    };


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
                    //var uid = "u/"+g_user.uid;
                    path.push({id:proj_id,off:0});
                    if ( proj.owner == inst.uid )
                        path.push({id:"proj_own",off:0});
                    else if ( proj.admin && proj.admin.indexOf( inst.uid ) != -1 )
                        path.push({id:"proj_adm",off:0});
                    else if ( proj.member && proj.member.indexOf( inst.uid ) != -1 )
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
                        return;
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
    };

    // TODO - This is broken
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
                                    if ( i > 0 ) i--; else i=data.path.length-1;
                                else
                                    if ( i < data.path.length-1) i++; else i=0;
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
    };

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
    };

    this.refreshCollectionNodes = function( node_keys, scope ){
        // Refresh any collection nodes in data tree and catalog tree
        // Scope is used to narrow search in trees

        // Note: FancyTree does not have an efficient way to get a node by key (just linear search), so
        // instead we will do our own linear search that is more efficient due to branch pruning and early termination

        var refresh = [];
        var i,found = false;

        //console.log("REF: search data tree");

        inst.data_tree.visit( function( node ){
            // Ignore nodes without scope (top-level nodes)
            if ( node.data.scope !== undefined ){
                if ( node.data.scope == scope ){
                    if ( node_keys.indexOf( node.key ) != -1 ){
                        //console.log("REF: found node:",node.key);
                        refresh.push( node );
                        found = true;
                        return "skip";
                    }
                }else if (found){
                    //console.log("REF: early terminate search at:",node.key);
                    return false;
                }else{
                    //console.log("REF: skip node:",node.key);
                    return "skip";
                }
            }else{
                //console.log("REF: ignore node:",node.key);
            }
        });

        //console.log("REF: refresh results:",refresh);

        for ( i in refresh )
            inst.reloadNode(refresh[i]);

        refresh= [];
        //console.log("REF: search catalog tree");

        // catalog_tree is slightly different than data_tree
        inst.cat_tree.visit( function( node ){
            // Ignore nodes without scope (top-level nodes)
            if ( node.data.scope !== undefined ){
                if ( node.data.scope == scope ){
                    if ( node_keys.indexOf( node.key ) != -1 ){
                        //console.log("REF: found node:",node.key);
                        refresh.push( node );
                        return "skip";
                    }
                }else{
                    //console.log("REF: skip node:",node.key);
                    return "skip";
                }
            }else{
                //console.log("REF: ignore node:",node.key);
            }
        });

        //console.log("REF: refresh results:",refresh);

        for ( i in refresh )
            inst.reloadNode(refresh[i]);
    };

    this.copyItems = function( items, dest_node, cb ){
        var item_keys = [];
        for( var i in items )
            item_keys.push( items[i].key );

        linkItems( item_keys, dest_node.key, function( ok, msg ) {
            if ( ok ){
                inst.refreshCollectionNodes([dest_node.key],dest_node.data.scope);
            }else{
                dlgAlert( "Copy Error", msg );
                //setStatusText( "Copy Error: " + msg, 1 );
            }

            if ( cb )
                cb();
        });
    };

    this.moveItems = function( items, dest_node, cb ){
        //console.log("moveItems",items,dest_node,inst.pasteSourceParent);
        var item_keys = [];
        for( var i in items )
            item_keys.push( items[i].key );

        colMoveItems( item_keys, inst.pasteSourceParent.key, dest_node.key, function( ok, msg ) {
            if ( ok ){
                inst.refreshCollectionNodes([inst.pasteSourceParent.key,dest_node.key],dest_node.data.scope);
            }else{
                dlgAlert( "Move Error", msg );
                //setStatusText( "Move Error: " + msg, 1 );
            }

            if ( cb )
                cb();

        });
    };

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
        if ( proj.length ){
            msg += " Note that this action will delete all data records and collections contained within selected project(s)";
        } else if ( coll.length ){
            msg += " Note that this action will delete data records contained within the selected collection(s) that are not linked elsewhere.";
        }

        dlgConfirmChoice( "Confirm Deletion", msg, ["Cancel","Delete"], function( choice ){
            if ( choice == 1 ){
                var done = 0;
                if ( data.length )
                    done++;
                if ( coll.length )
                    done++;

                if ( data.length ){
                    sendDataDelete( data, function( ok, data ){
                        if ( ok ){
                            if ( --done == 0 )
                                refreshUI();
                        }else
                            setStatusText( "Data Delete Error: " + data, 1 );
                    });
                }
                if ( coll.length ){
                    collDelete( coll, function( ok, data ){
                        if ( ok ){
                            if ( --done == 0 )
                                refreshUI();
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
    };

    this.fileMenu = function(){
        $("#filemenu").toggle().position({
            my: "left bottom",
            at: "left bottom",
            of: this
        }); //"fade"); //.focus(); //slideToggle({direction: "up"});
    };

    this.actionNewProj = function() {
        dlgProjNewEdit(null,0,function( data ){
            setStatusText("Project "+data.id+" created");
            inst.reloadNode( inst.data_tree.getNodeByKey( "proj_own" ));
        });
    };

    this.actionNewData = function() {
        var parent = "root";
        var node = inst.data_tree.activeNode;
        if ( node ){
            if ( node.key.startsWith("d/") || node.key == "empty" ) {
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
                inst.resetTaskPoll();
                var node = inst.data_tree.getNodeByKey( parent_id );
                if ( node )
                    inst.reloadNode( node );
                if ( inst.focus_node_id )
                    inst.graphLoad( inst.focus_node_id, inst.sel_node.id );
            });
        });
    };

    this.actionDupData = function(){
        var parent = "root";
        var node = inst.data_tree.activeNode;
        if ( node ){
            if ( node.key.startsWith("d/")) {
                parent = node.parent.key;
                console.log("parent",parent);
            }
        }

        checkPerms( parent, PERM_CREATE, function( granted ){
            if ( !granted ){
                alertPermDenied();
                return;
            }
            viewData( node.key, function( data ){
                if ( data ){
                    dlgDataNewEdit(DLG_DATA_DUP,data,parent,0,function(data2,parent_id){
                        console.log("back from dup",parent_id);
                        var node = inst.data_tree.getNodeByKey( parent_id );
                        if ( node )
                            inst.reloadNode( node );
                        if ( inst.focus_node_id )
                            inst.graphLoad( inst.focus_node_id, inst.sel_node.id );
                    });
                }
            });
        });
    };

    this.actionNewColl = function(){
        var node = inst.data_tree.activeNode;
        var parent = "root";
        if ( node ){
            if ( node.key.startsWith("d/") || node.key == "empty" ) {
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
    };

    this.actionImportData = asyncFunc( function( files ){
        var coll_id;

        if ( !inst.update_files && !inst.import_direct ){
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
            //console.log("files onload");
            try{
                var obj = JSON.parse( e.target.result );
                var rec_count = 0;

                if ( obj instanceof Array ){
                    for ( var i in obj ){
                        if ( !inst.update_files && !inst.import_direct )
                            obj[i].parent = coll_id;
                        payload.push( obj[i] );
                    }
                    rec_count += obj.length;
                }else{
                    if ( !inst.update_files && !inst.import_direct )
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
                                if ( inst.import_direct ){
                                    inst.refreshUI();
                                }else{
                                    var node = inst.data_tree.getNodeByKey( coll_id );
                                    if ( node )
                                        inst.reloadNode( node );
                                }
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
        };

        reader.onerror = function( e ){
            dlgAlert("Import Error", "Error reading file: " + files[count].name );
        };

        reader.onabort = function( e ){
            dlgAlert("Import Error", "Import aborted" );
        };

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
    };

    this.actionUnlockSelected = function(){
        inst.setLockSelected( false );
    };

    this.actionCutSelected = function(){
        inst.pasteItems = inst.data_tree.getSelectedNodes();
        inst.pasteSourceParent = pasteItems[0].parent;
        inst.pasteMode = "cut";
        inst.pasteCollections = [];
        for ( var i in inst.pasteItems ){
            if ( inst.pasteItems[i].key.startsWith("c/") )
                inst.pasteCollections.push( inst.pasteItems[i] );
        }
        //console.log("cutSelected",inst.pasteItems,inst.pasteSourceParent);
    };

    this.actionCopySelected = function(){
        console.log("Copy");
        if ( inst.select_source == SS_TREE )
            inst.pasteItems = inst.data_tree.getSelectedNodes();
        else if ( inst.select_source == SS_SEARCH )
            inst.pasteItems = inst.results_tree.getSelectedNodes();
        else
            return;

        inst.pasteSourceParent = pasteItems[0].parent;
        inst.pasteMode = "copy";
        inst.pasteCollections = [];
        for ( var i in inst.pasteItems ){
            if ( inst.pasteItems[i].key.startsWith("c/") )
                inst.pasteCollections.push( inst.pasteItems[i] );
        }
    };

    this.actionPasteSelected = function(){
        function pasteDone(){
            inst.pasteItems = [];
            inst.pasteSourceParent = null;
            inst.pasteCollections = null;
        }

        var node = inst.data_tree.activeNode;
        if ( node && inst.pasteItems.length ){

            if ( node.key == "empty" || node.key.startsWith( "d/" ))
                node = node.parent;
            if ( inst.pasteMode == "cut" )
                inst.moveItems( inst.pasteItems, node, pasteDone );
            else
                inst.copyItems( inst.pasteItems, node, pasteDone );
        }
    };

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
                        //inst.reloadNode( inst.data_tree.getNodeByKey( loc_root ));
                        inst.refreshCollectionNodes([loc_root,sel[0].parent.key],sel[0].parent.data.scope);
                    }else{
                        //inst.reloadNode( sel[0].parent );
                        inst.refreshCollectionNodes([sel[0].parent.key],sel[0].parent.data.scope);
                    }
                }else{
                    dlgAlert( "Unlink Error", data );
                }
            });
        }
    };

    this.permGateAny = function( item_id, req_perms, cb ){
        getPerms( item_id, req_perms, function( perms ){
            if (( perms & req_perms ) == 0 ){
                setStatusText( "Permission Denied.", 1 );
            }else{
                console.log("have perms:",perms);
                cb( perms );
            }
        });
    };

    this.actionEditSelected = function() {
        if ( async_guard )
            return;

        var ids = inst.getSelectedIDs();

        if ( ids.length != 1 )
            return;

        var id = ids[0];

        switch( id.charAt(0) ){
            case "p":
                permGateAny( id, PERM_WR_REC | PERM_SHARE, function( perms ){
                    viewProj( id, function( data ){
                        if ( data ){
                            dlgProjNewEdit( data, perms, function( data ){
                                refreshUI( id, data );
                            });
                        }
                    });
                });
                break;
            case "c":
                permGateAny( id, PERM_WR_REC | PERM_SHARE, function( perms ){
                    viewColl( id, function( data ){
                        if ( data ){
                            dlgCollNewEdit( data, null, perms, function( data ){
                                refreshUI( id, data );
                            });
                        }
                    });
                });
                break;
            case "d":
                permGateAny( id, PERM_WR_REC | PERM_WR_META | PERM_WR_DATA, function( perms ){
                    viewData( id, function( data ){
                        if ( data ){
                            dlgDataNewEdit( DLG_DATA_EDIT, data, null, perms, function( data ){
                                refreshUI( id, data );
                                inst.resetTaskPoll();
                            });
                        }
                    }); 
                }); 
                break;
            case 'q':
                sendQueryView( id, function( ok, old_qry ){
                    if ( ok ){
                        dlgQueryNewEdit( old_qry, function( data ){
                            refreshUI( id, data, true );
                        });
                    }else
                        setStatusText("Query Edit Error: " + old_qry, 1);
                });
                return;
            default:
                return;
        }
    };

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
    };

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
    };

    this.actionDataGet = function() {
        var ids = inst.getSelectedIDs();
        dataGet( ids, function(){
            inst.resetTaskPoll();
        });
    };

    this.actionDataPut = function() {
        var ids = inst.getSelectedIDs();
        if ( ids.length != 1 )
            return;

        var id = ids[0];

        if ( id.charAt(0) == "d" ) {
            dataPut( id, function(){
                inst.resetTaskPoll();
            });
        }
    };

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
            bits = 0x31A; //0x319;
            for ( var i in sel ){
                node = sel[i];
                switch ( node.key[0] ){
                    case "c": bits |= node.data.isroot?0xD7:0x52;  break;
                    case "d": bits |= 0x00;  break;
                    case "r": bits |= 0x1F7;  break;
                    case "p":
                        bits |= 0x1Fa;
                        if ( node.data.mgr )
                            bits |= 4;
                        else if ( !node.data.admin )
                            bits |= 5;
                        break;
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
                        bits = 0x102;
                    if ( node.data.doi )
                        bits |= 0x10;
                    break;
                case "p":
                    bits = 0x3Fa;
                    if ( node.data.mgr )
                        bits |= 4;
                    else if ( !node.data.admin )
                        bits |= 5;
                    break;
                case "q": bits = 0x3FA; break;
                default:
                    if ( node.key == "empty" && node.parent.key.startsWith("c/"))
                        bits = 0x2FF;
                    else
                        bits = 0x3FF;
                    break;
            }
            //console.log("single",bits);
        }else{
            bits = 0x2FF;
        }

        return bits;
    };

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
        $("#btn_dup_data",inst.frame).button("option","disabled",(bits & 2) != 0 );
        $("#btn_del",inst.frame).button("option","disabled",(bits & 4) != 0 );
        $("#btn_share",inst.frame).button("option","disabled",(bits & 8) != 0 );
        $("#btn_upload",inst.frame).button("option","disabled",(bits & 0x10) != 0 );
        $("#btn_download",inst.frame).button("option","disabled",(bits & 0x20) != 0);
        $("#btn_lock",inst.frame).button("option","disabled",(bits & 0x40) != 0);
        $("#btn_unlock",inst.frame).button("option","disabled",(bits & 0x40) != 0);
        $("#btn_new_data",inst.frame).button("option","disabled",(bits & 0x100) != 0 );
        //$("#btn_import_data",inst.frame).button("option","disabled",(bits & 0x100) != 0 );
        $("#btn_new_coll",inst.frame).button("option","disabled",(bits & 0x100) != 0 );
        //$("#btn_unlink",inst.frame).button("option","disabled",(bits & 0x80) != 0);
        $("#btn_dep_graph",inst.frame).button("option","disabled",(bits & 0x200) != 0 );
        $("#btn_prev_coll",inst.frame).button("option","disabled",(bits & 0x200) != 0 );
        $("#btn_next_coll",inst.frame).button("option","disabled",(bits & 0x200) != 0 );
        $("#btn_srch_first_par_coll",inst.frame).button("option","disabled",(bits & 0x200) != 0 );
        $("#btn_cat_first_par_coll",inst.frame).button("option","disabled",(bits & 0x200) != 0 );

        if ( bits & 0x100 )
            $("#filemenu li:nth-child(1)").addClass("ui-state-disabled");
        else
            $("#filemenu li:nth-child(1)").removeClass("ui-state-disabled");

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
    };

    this.saveExpandedPaths = function( node, paths ){
        var subp = {};
        if ( node.children ){
            var child;
            for ( var i in node.children ){
                child = node.children[i];
                if ( child.isExpanded() ){
                    inst.saveExpandedPaths( child, subp );
                }
            }
        }
        paths[node.key] = subp;
    };

    this.restoreExpandedPaths = function( node, paths ){
        node.setExpanded(true).always(function(){
            if ( node.children ){
                var child;
                for ( var i in node.children ){
                    child = node.children[i];
                    if ( child.key in paths ){
                        inst.restoreExpandedPaths( child, paths[child.key] );
                    }
                }
            }
        });
    };

    this.reloadNode = function( node, tree ){
        if ( !node || node.isLazy() && !node.isLoaded() )
            return;

        var save_exp = node.isExpanded();
        var paths = {};

        if ( save_exp ){
            inst.saveExpandedPaths( node, paths );
        }

        node.load(true).always(function(){
            if ( save_exp ){
                inst.restoreExpandedPaths( node, paths[node.key] );
            }
        });
    };

    this.showSelectedHTML = function( html ){
        $("#sel_info_form").hide();
        $("#sel_info_div").html(html).show();
        inst.showSelectedMetadata();
    };

    this.showSelectedDataInfo = function( key ){
        viewData( key, function( item ){
            showSelectedItemInfo( item );
            if ( item.metadata ){
                inst.showSelectedMetadata( item.metadata );
            }else{
                inst.showSelectedMetadata();
            }
        }); 
    };

    this.showSelectedCollInfo = function( key ){
        viewColl( key, function( item ){
            if ( item ){
                showSelectedItemInfo( item );
                inst.showSelectedMetadata();
            }else{
                inst.showSelectedMetadata();
                inst.showSelectedHTML( "Insufficient permissions to view collection." );
            }
        }); 
    };

    this.showSelectedUserInfo = function( key ){
        userView( key, true, function( ok, item ){
            if ( ok, item ){
                item.id = item.uid;
                showSelectedItemInfo( item );
                inst.showSelectedMetadata();
            }else{
                inst.showSelectedMetadata();
                inst.showSelectedHTML( "Insufficient permissions to view user." );
            }
        }); 
    };

    this.showSelectedProjInfo = function( key ){
        viewProj( key, function( item ){
            if ( item ){
                showSelectedItemInfo( item );
                inst.showSelectedMetadata();
            }else{
                inst.showSelectedMetadata();
                inst.showSelectedHTML( "Insufficient permissions to view project." );
            }
        }); 
    };

    this.showSelectedAllocInfo = function( repo, user ){
        allocView( repo, user, function( ok, data ){
            if ( ok ){
                var item = data.alloc[0];
                item.user = item.id;
                item.id = item.repo;
                showSelectedItemInfo( item );
                inst.showSelectedMetadata();
            }else{
                inst.showSelectedMetadata();
                inst.showSelectedHTML( "Insufficient permissions to view allocation." );
            }
        });
    };

    this.showSelectedQueryInfo = function( key ){
        sendQueryView( key, function( ok, item ){
            if ( item ){
                showSelectedItemInfo( item );
                inst.showSelectedMetadata();
            }else{
                inst.showSelectedMetadata();
                inst.showSelectedHTML( "Insufficient permissions to view query." );
            }
        }); 
    };

    this.showSelectedMetadata = function( md_str )
    {
        if ( md_str ){
            for ( var i in inst.data_md_exp ){
                if ( inst.data_md_exp[i] == 1 )
                    delete inst.data_md_exp[i];
                else
                    inst.data_md_exp[i]--;
            }

            var md = JSON.parse( md_str );
            var src = buildObjSrcTree(md,"",inst);
            inst.data_md_tree.reload( src );
            inst.data_md_empty = false;
        } else if ( !inst.data_md_empty ) {
            inst.data_md_tree.reload(inst.data_md_empty_src);
            inst.data_md_empty = true;
        }
    };

    this.showSelectedInfo = function( node ){
        if ( !node ){
            inst.showSelectedMetadata();
            inst.showSelectedHTML( "" );
            return;
        }

        //console.log( "node key:", node.key, "scope:", node.data?node.data.scope:"n/a" );
        var key;

        if ( typeof node == 'string' )
            key = node;
        else if ( node.key == "shared_proj" && node.data.scope )
            key = node.data.scope;
        else if ( node.key.startsWith( "t/" ) && node.data.scope ){
            key = node.data.scope;
        }else
            key = node.key;

        if ( key[0] == "c" ) {
            inst.showSelectedCollInfo( key );
        }else if ( key[0] == "d" ) {
            inst.showSelectedDataInfo( key );
        }else if ( key == "mydata" ) {
            inst.showSelectedHTML( "Owned Data<br><br>All data owned by you." );
        }else if ( key == "proj_own" ) {
            inst.showSelectedHTML( "Owned Projects<br><br>All projects owned by you." );
        }else if ( key == "proj_adm" ) {
            inst.showSelectedHTML( "Managed Projects<br><br>Projects owned by other users that are managed by you." );
        }else if ( key == "proj_mem" ) {
            inst.showSelectedHTML( "Member Projects<br><br>Projects owned by other users where you are a member." );
        }else if ( key == "shared_all" ) {
            inst.showSelectedHTML( "Shared Data<br><br>Data shared with you by other users and projects." );
        }else if ( key == "shared_user" ) {
            inst.showSelectedHTML( "Shared Data by User<br><br>Data shared with you by other users." );
        }else if ( key == "shared_proj" ) {
            inst.showSelectedHTML( "Shared Data by Project<br><br>Data shared with you by other projects." );
        }else if ( key == "queries" ) {
            inst.showSelectedHTML( "Saved Queries<br><br>All saved queries created by you." );
        }else if ( key.startsWith("p/")){
            inst.showSelectedProjInfo( key );
        }else if ( key.startsWith("q/")){
            inst.showSelectedQueryInfo( key );
        }else if (( key.startsWith("u/") || key.startsWith( "shared_user_" )) && node.data.scope ){
            inst.showSelectedUserInfo( node.data.scope );
        }else if ( key.startsWith( "shared_proj_" ) && node.data.scope ){
            inst.showSelectedProjInfo( node.data.scope );
        }else if ( key == "allocs" ) {
            inst.showSelectedHTML( "Data Allocations<br><br>Lists allocations and associated data records." );
        }else if ( key.startsWith("published")) {
            inst.showSelectedHTML( "Public Collections<br><br>Lists collections made public and available in DataFed catalogs." );
        }else if ( key.startsWith( "repo/" )) {
            inst.showSelectedAllocInfo( node.data.repo, node.data.scope );
        }else{
            inst.showSelectedMetadata();
            inst.showSelectedHTML( "" );
        }
    };

    this.execQuery = function( query ){
        setStatusText("Executing search query...");
        dataFind( query, function( ok, items ){
            console.log( "qry res:", ok, items );
            if ( ok ){
                //var srch_node = inst.data_tree.getNodeByKey("search");

                // Set this query as current for refresh
                inst.cur_query = query;

                var results = [];
                if ( items.length > 0 ){
                    setStatusText( "Found " + items.length + " result" + (items.length==1?"":"s"));
                    for ( var i in items ){
                        var item = items[i];
                        results.push({title:inst.generateTitle( item ),icon:item.doi?"ui-icon ui-icon-linkext":"ui-icon ui-icon-file",checkbox:false,key:item.id,nodrag:false,notarg:true,scope:item.owner,doi:item.doi});
                    }
                } else {
                    setStatusText("No results found");
                    results.push({title:"(no results)",icon:false,checkbox:false,nodrag:true,notarg:true});
                }

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
    };

    this.parseQuickSearch = function(){
        //console.log("parse query");
        var query = {};
        var tmp = $("#text_query").val();
        if ( tmp )
            query.text = tmp;

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
    };

    this.searchDirect = function(){
        $("#run_qry_btn").removeClass("ui-state-error");

        var query = parseQuickSearch();

        //if ( query.scopes.length && ( query.text || query.meta || query.id ))
        inst.execQuery( query );
    };

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
    };

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
    };

    this.searchClearSelection = function(){
        inst.data_tree.selectAll(false);
        inst.cat_tree.selectAll(false);
    };

    this.generateTitle = function( item, refresh ) {
        var title = "";

        if ( item.locked )
            title += "<i class='ui-icon ui-icon-locked'></i> ";

        title += "<span class='fancytree-title data-tree-title'>" + escapeHTML(item.title) + "</span>" + (refresh?"&nbsp<i class='browse-reload ui-icon ui-icon-reload'></i>":"") + "<span class='data-tree-subtitle'>";
        title += "<span class='data-tree-id'>" + item.id + "</span>";
        title += "<span class='data-tree-alias'>" + (item.alias?item.alias.substr(item.alias.lastIndexOf(":") + 1):"") + "</span>";

        if ( item.owner && item.owner.startsWith( "p/" )){
            if ( item.creator && item.creator != inst.uid )
                title += "&nbsp<span class='data-tree-creator'>[" + item.creator.substr(2) + "]</span>";
        }else{
            if ( item.owner && item.creator ){
                if ( item.owner != inst.uid && item.creator != inst.uid )
                    title += "&nbsp<span class='data-tree-owner'>(" + item.owner.substr(2) + ")</span>";
                else if ( item.creator != inst.uid )
                    title += "&nbsp<span class='data-tree-creator'>[" + item.creator.substr(2) + "]</span>";
            }else if ( item.owner ){
                if ( item.owner != inst.uid )
                    title += "&nbsp<span class='data-tree-owner'>(" + item.owner.substr(2) + ")</span>";
            }else if ( item.creator ){
                if ( item.creator != inst.uid )
                    title += "&nbsp<span class='data-tree-creator'>[" + item.creator.substr(2) + "]</span>";
            }
        }

        title += "</span>";

        return title;
    };

    this.updateIcon = function( node, data ) {
        if ( data.id.startsWith( "d/" )){
            if ( data.doi )
                node.icon = "ui-icon ui-icon-linkext";
            else
                node.icon = "ui-icon ui-icon-file";
        }
    };

    this.taskUpdateHistory = function( task_list ){
        var len = task_list.length;
        var html;
        if ( len == 0 ){
            html = "(no recent server tasks)";
        }else{
            html = "<table class='info_table'><tr><th>Task ID</th><th>Type</th><th>Status</th><th>Prog.</th><th>Started</th><th>Updated</th><th>Message</th></tr>";
            var task, time = new Date(0);

            for ( var i in task_list ) {
                task = task_list[i];

                html += "<tr style='font-size:.9em'><td>" + task.id.substr(5) + "</td><td>";

                switch( task.type ){
                    case "TT_DATA_GET": html += "Get Data"; break;
                    case "TT_DATA_PUT": html += "Put Data"; break;
                    case "TT_DATA_DEL": html += "Delete Data"; break;
                    case "TT_REC_CHG_ALLOC": html += "Change Allocation"; break;
                    case "TT_REC_CHG_OWNER": html += "Change Owner"; break;
                    case "TT_REC_DEL": html += "Delete Record"; break;
                    case "TT_ALLOC_CREATE": html += "Create Alloc"; break;
                    case "TT_ALLOC_DEL": html += "Delete Alloc"; break;
                    case "TT_USER_DEL": html += "Delete User"; break;
                    case "TT_PROJ_DEL": html += "Delete Project"; break;
                }

                html += "</td><td>";

                switch( task.status ){
                    case "TS_BLOCKED": html += "Queued"; break;
                    case "TS_READY": html += "Ready"; break;
                    case "TS_RUNNING": html += "Running"; break;
                    case "TS_SUCCEEDED": html += "Succeeded"; break;
                    case "TS_FAILED": html += "Failed"; break;
                }

                switch( task.status ){
                    case "TS_BLOCKED":
                    case "TS_READY":
                        html += "</td><td>";
                        break;
                    case "TS_RUNNING":
                    case "TS_FAILED":
                        html += "</td><td>" + Math.floor(100*task.step / task.steps) + "% (" + (task.step + 1) + "/" + task.steps + ")";
                        break;
                    case "TS_SUCCEEDED":
                        html += "</td><td>100%";
                        break;
                    }


                time.setTime( task.ct*1000 );
                html += "</td><td>" + time.toLocaleDateString("en-US", g_date_opts );

                time.setTime( task.ut*1000 );
                html += "</td><td>" + time.toLocaleDateString("en-US", g_date_opts );

                html += "</td><td>" + task.msg + "</td></tr>";
            }
            html += "</table>";
        }
        this.task_hist.html( html );
    };

    this.taskHistoryPoll = function(){
        //console.log("taskHistoryPoll",inst.pollSince);

        if ( !g_user )
            return;

        _asyncGet( "/api/task/list" + (inst.pollSince?"?since="+Math.round(2*inst.pollSince):""), null, function( ok, data ){
            if ( ok && data ) {
                //console.log( "task list:",ok,data);
                if ( data.task && data.task.length ) {
                    // Find and remove any previous entries
                    var task;
                    for ( var i in data.task ){
                        task = data.task[i];
                        for ( var j in inst.taskHist ){
                            if ( inst.taskHist[j].id == task.id ){
                                inst.taskHist.splice(j,1);
                                break;
                            }
                        }
                    }
                    inst.taskHist = data.task.concat( inst.taskHist );
                    inst.taskUpdateHistory( inst.taskHist );
                    inst.pollSince = 0;
                }
            }

            // Poll period after initial scan should run at slowest rate
            // If a transfer is started or detected, poll will drop to min period
            if ( inst.pollSince == 0 )
                inst.pollSince = inst.pollMin;
            else if ( inst.pollSince < inst.pollMax )
                inst.pollSince *= 2;
            else
                inst.pollSince = inst.pollMax;

                console.log( "poll per:",inst.pollSince);

            inst.taskTimer = setTimeout( inst.taskHistoryPoll, 1000*(inst.pollSince));
        });
    };

    this.resetTaskPoll = function(){
        console.log("reset task poll");
        inst.pollSince = 0;
        clearTimeout(inst.taskTimer);
        inst.taskTimer = setTimeout( inst.taskHistoryPoll, 1000 );
    };

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
    };

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
                node = {id:item.id,locked:item.locked,links:[]};
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
    };

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
    };

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
            .attr('y', -r);

        g.append("text")
            .attr("class","locked")
            .html(function(d) {
                if (d.locked )
                    return "&#xe6bb";
                else
                    return "";
            })
            .attr('x', r-3)
            .attr('y', -r+1);

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
                        case 0: return 0.1;
                        case 1: return 0.1;
                        case 2: return 0.1;
                    }
                })
                .id( function(d) { return d.id; });

            inst.simulation = d3.forceSimulation()
                .nodes(inst.node_data)
                //.force('center', d3.forceCenter(200,200))
                .force('charge', d3.forceManyBody()
                    .strength(-300))
                .force('row', d3.forceY( function(d,i){ return d.row != undefined ?(75 + d.row*75):0; })
                    .strength( function(d){ return d.row != undefined ?0.05:0; }))
                .force('col', d3.forceX(function(d,i){ return d.col != undefined?inst.graph_center_x:0; })
                    .strength( function(d){ return d.col != undefined ?0.05:0; }))
                .force("link", linkForce )
                .on('tick', inst.simTick);

        }
    };

    this.dragStarted = function(d) {
        //console.log("drag start",d.id);
        if (!d3.event.active) inst.simulation.alphaTarget(0.3).restart();
        d.fx = d3.event.x;
        d.fy = d3.event.y;
        d3.event.sourceEvent.stopPropagation();
    };

    this.dragged = function(d) {
        //console.log("drag",d3.event.x,d3.event.y);
        d.fx = d3.event.x;
        d.fy = d3.event.y;
        inst.simTick(); 
        d3.event.sourceEvent.stopPropagation();
    };

    this.dragEnded = function(d){
        //console.log("drag end",d.id);
        if (!d3.event.active) inst.simulation.alphaTarget(0);
        d.x = d.fx;
        d.y = d.fy;
        delete d.fx;
        delete d.fy;
        //console.log("at:",d);
        d3.event.sourceEvent.stopPropagation();
    };

    this.graphNodeFind = function( a_id ){
        for ( var i in inst.node_data ){
            if ( inst.node_data[i].id == a_id )
                return inst.node_data[i];
        }
    };

    this.graphLinkFind = function( a_id ){
        for ( var i in inst.link_data ){
            if ( inst.link_data[i].id == a_id )
                return inst.link_data[i];
        }
    };

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
    };

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
    };

    this.actionGraphNodeHide = function(){
        if ( inst.sel_node && inst.sel_node.id != inst.focus_node_id && inst.node_data.length > 1 ){
            inst.sel_node.prune = true;
            // Check for disconnection of the graph
            var start = inst.sel_node.links[0].source == inst.sel_node?inst.sel_node.links[0].target:inst.sel_node.links[0].source;
            if ( inst.graphCountConnected( start, [] ) == inst.node_data.length - 1 ){
                for ( var i in inst.sel_node.links ){
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
    };

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
    };

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
                inst.link_data.splice(i,1);
            }
        }

        for ( i = inst.node_data.length - 1; i >= 0; i-- ){
            item = inst.node_data[i];
            if ( item.prune ){
                //console.log("pruning node:",item);
                inst.node_data.splice(i,1);
            }
        }
    };

    this.graphPruneReset = function(){
        var i;
        for ( i in inst.node_data ){
            inst.node_data[i].prune = false;
        }
        for ( i in inst.link_data ){
            inst.link_data[i].prune = false;
        }
    };

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
    };

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
    };

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
    };

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
                for ( var i in parent.children ){
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
    };

    /** @brief Check if past is allowed to specified node
     *  @param dest_node - Candidate paste destination node
     *  @param src_node - Node being dragged
     *
     * There is additional source information in inst.pasteXXX
     */
    this.pasteAllowed = function( dest_node, src_node ){
        //console.log("pasteAllowed:",dest_node, src_node);

        if ( !dest_node.data.notarg && dest_node.data.scope ){
            // Prevent pasting to self or across scopes
            if ( inst.pasteSourceParent.key == dest_node.key )
                return false;

            // Different scopes requires destination or destination parent to be a collection
            if ( dest_node.data.scope != src_node.data.scope ){
                if ( !(dest_node.key.startsWith( "c/" ) || dest_node.parent.key.startsWith( "c/" )))
                    return false;
            }else{
                if ( dest_node.key.startsWith( "d/" ) || dest_node.key == "empty" ){
                    if ( inst.pasteSourceParent.key == dest_node.parent.key || !(dest_node.parent.key.startsWith("c/") || dest_node.parent.key.startsWith("repo/")))
                        return false;
                }

                if ( inst.pasteCollections.length ){
                    var i,j,coll,dest_par = dest_node.getParentList(false,true);
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
            }
            return "over";
        }else
            return false;
    };

    this.pageLoad = function( key, offset ){
        //console.log("pageLoad",key, offset);
        var node = inst.data_tree.getNodeByKey( key );
        if ( node ){
            node.data.offset = offset;
            setTimeout(function(){
                node.load(true);
            },0);
        }
    };


    var tree_source = [
        //{title:"Favorites <i class='browse-reload ui-icon ui-icon-reload'",folder:true,icon:"ui-icon ui-icon-heart",lazy:true,nodrag:true,key:"favorites"},
        {title:"Owned Data <i class='browse-reload ui-icon ui-icon-reload'></i>",key:"mydata",nodrag:true,icon:"ui-icon ui-icon-box",folder:true,expanded:false,lazy:true},
        {title:"Owned Projects <i class='browse-reload ui-icon ui-icon-reload'></i>",folder:true,icon:"ui-icon ui-icon-view-icons",nodrag:true,lazy:true,key:"proj_own",offset:0},
        {title:"Managed Projects <i class='browse-reload ui-icon ui-icon-reload'></i>",folder:true,icon:"ui-icon ui-icon-view-icons",nodrag:true,lazy:true,key:"proj_adm",offset:0},
        {title:"Member Projects <i class='browse-reload ui-icon ui-icon-reload'></i>",folder:true,icon:"ui-icon ui-icon-view-icons",nodrag:true,lazy:true,key:"proj_mem",offset:0},
        {title:"Shared Data",folder:true,icon:"ui-icon ui-icon-circle-plus",nodrag:true,key:"shared_all",children:[
            {title:"By User <i class='browse-reload ui-icon ui-icon-reload'></i>",nodrag:true,folder:true,lazy:true,key:"shared_user"},
            {title:"By Project <i class='browse-reload ui-icon ui-icon-reload'></i>",nodrag:true,folder:true,lazy:true,key:"shared_proj"}
        ]},
        {title:"Saved Queries <i class='browse-reload ui-icon ui-icon-reload'></i>",folder:true,icon:"ui-icon ui-icon-view-list",lazy:true,nodrag:true,key:"queries",checkbox:false,offset:0},
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

                inst.pasteSourceParent = inst.pasteItems[0].parent;
                console.log("pasteSourceParent",inst.pasteSourceParent);
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
                inst.drag_enabled = false;

                // data.otherNode = source, node = destination
                console.log("drop stop in",dest_node.key,inst.pasteItems);

                var i, proj_id, ids = [];

                if ( inst.pasteSourceParent.data.scope != dest_node.data.scope ){
                    console.log("Change owner");
                    var coll_id = dest_node.key.startsWith( "d/" )?dest_node.parent.key:dest_node.key;
                    proj_id = inst.pasteSourceParent.data.scope.charAt(0) == 'p'?inst.pasteSourceParent.data.scope:null;

                    for( i in inst.pasteItems ){
                        ids.push( inst.pasteItems[i].key );
                    }

                    dataOwnerChange( ids, coll_id, null, proj_id, true, function( ok, reply ){
                        console.log("chg owner reply:",ok,reply);
                        if ( ok ){
                            dlgOwnerChangeConfirm( inst.pasteSourceParent.data.scope, dest_node.data.scope, reply, function( repo ){
                                console.log("chg owner conf:", repo );
                                dataOwnerChange( ids, coll_id, repo, proj_id, false, function( ok, reply ){
                                    if ( ok ){
                                        console.log("reply:", reply );
                                        inst.resetTaskPoll();
                                        dlgAlert( "Change Record Owner", "Task " + reply.task.id.substr(5) + " created to transfer data records to new owner." );
                                    }else{
                                        dlgAlert( "Change Record Owner Error", reply );
                                    }
                                });
                            });
                        }else{
                            dlgAlert( "Change Record Owner Error", reply );
                        }
                        inst.drag_enabled = true;
                    });
                    return;
                }else if ( dest_node.key.startsWith( "repo/" ) || dest_node.parent.key.startsWith( "repo/" )){
                    var key = dest_node.key.startsWith( "repo/" )? dest_node.key:dest_node.parent.key;
                    var idx = key.indexOf("/",5);
                    var repo_id = key.substr(0,idx);
                    proj_id = inst.pasteSourceParent.data.scope.charAt(0) == 'p'?inst.pasteSourceParent.data.scope:null;

                    for( i in inst.pasteItems ){
                        ids.push( inst.pasteItems[i].key );
                    }

                    dataAllocChange( ids, repo_id, proj_id, true, function( ok, reply ){
                        if ( ok ){
                            if ( reply.totCnt == 0 ){
                                dlgAlert( "Change Record Allocation Error", "No data records contained in selection." );
                            }else if ( reply.actCnt == 0 ){
                                dlgAlert( "Change Record Allocation Error", "All selected data records already use allocation on '" + repo_id + "'" );
                            }else{
                                dlgConfirmChoice( "Confirm Change Record Allocation", "This operation will transfer " + reply.actCnt + " record(s) (out of "+reply.totCnt+" selected) with " + sizeToString( reply.actSize ) + " of raw data to allocation on '" + repo_id + "'. Current allocation usage is " + sizeToString( reply.dataSize ) + " out of " + sizeToString( reply.dataLimit ) + " available and "+reply.recCount+" record(s) out of "+reply.recLimit+" available. Pending transfers may alter the amount of space available on target allocation.", ["Cancel","Confirm"], function(choice){
                                    if ( choice == 1 ){
                                        dataAllocChange( ids, repo_id, proj_id, false, function( ok, reply ){
                                            if ( ok ){
                                                inst.resetTaskPoll();
                                                dlgAlert("Change Record Allocation","Task " + reply.task.id.substr(5) + " created to move data records to new allocation.");
                                            }else{
                                                dlgAlert( "Change Record Allocation Error", reply );
                                            }
                                        });
                                    }
                                });
                            }
                            inst.drag_enabled = true;
                        }else{
                            dlgAlert( "Change Record Allocation Error", reply );
                            inst.drag_enabled = true;
                        }
                    });
                    return;
                }else if ( dest_node.key.startsWith("d/")){
                    dest_node = dest_node.parent;
                }else if ( dest_node.key == "empty" ){
                    dest_node = dest_node.parent;
                }

                function pasteDone(){
                    inst.pasteItems = [];
                    inst.pasteSourceParent = null;
                    inst.pasteCollections = null;
                }

                if ( inst.drag_mode ){
                    inst.moveItems( inst.pasteItems, dest_node, /*data.otherNode,*/ pasteDone );
                }else{
                    inst.copyItems( inst.pasteItems, dest_node, pasteDone );
                }
                inst.drag_enabled = true;
            },
            dragEnter: function(node, data) {
                if ( inst.dragging ){
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
                data.node.resetLazy();
            }
        },
        //tooltip: function( ev, data ){
        //    return "tooltip";
        //},
        lazyLoad: function( event, data ) {
            if ( data.node.key == "mydata" ){
                data.result = [
                    {title:"Root Collection",folder:true,expanded:false,lazy:true,key:inst.my_root_key,offset:0,user:g_user.uid,scope:inst.uid,nodrag:true,isroot:true,admin:true},
                    {title:"Public Collections",folder:true,expanded:false,lazy:true,key:"published_u_"+g_user.uid,offset:0,scope:inst.uid,nodrag:true,notarg:true,checkbox:false,icon:"ui-icon ui-icon-structure"},
                    {title:"Allocations <i class='browse-reload ui-icon ui-icon-reload'></i>",folder:true,lazy:true,icon:"ui-icon ui-icon-databases",key:"allocs",scope:inst.uid,nodrag:true,notarg:true,checkbox:false}
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
                    {title:"Public Collections",folder:true,expanded:false,lazy:true,key:"published_p_"+prj_id,offset:0,scope:data.node.key,nodrag:true,checkbox:false,icon:"ui-icon ui-icon-structure"},
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
            } else if ( data.node.key.startsWith("published")) {
                data.result = {
                    url: "/api/col/published/list?subject=" + encodeURIComponent(data.node.data.scope) + "&offset="+data.node.data.offset+"&count="+g_opts.page_sz,
                    cache: false
                };
            }else if ( data.node.key == "favorites" || data.node.key == "views" ) {
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
            var item, i, scope = null;

            //console.log( "pos proc:", data );
            if ( data.node.key == "mydata" || data.node.key.startsWith("p/")){
                //console.log("post mydata",data.response);
            }else if ( data.node.key == "proj_own" || data.node.key == "proj_adm" || data.node.key == "proj_mem" ){
                    data.result = [];
                if ( data.response.item && data.response.item.length ){
                    console.log( "pos proc project:", data.response );
                    var admin = (data.node.key=="proj_own"?true:false);
                    var mgr = (data.node.key=="proj_adm"?true:false);

                    for ( i in data.response.item ) {
                        item = data.response.item[i];
                        data.result.push({ title: inst.generateTitle(item,true),icon:"ui-icon ui-icon-box",folder:true,key:item.id,isproj:true,admin:admin,mgr:mgr,nodrag:true,lazy:true});
                    }
                }

                inst.addTreePagingNode( data );
            } else if ( data.node.key == "shared_user" && !data.node.data.scope ){
                data.result = [];
                if ( data.response.length ){
                    for ( i in data.response ) {
                        item = data.response[i];
                        data.result.push({ title: item.name + " (" + item.uid + ") <i class='browse-reload ui-icon ui-icon-reload'></i>",icon:"ui-icon ui-icon-box",folder:true,key:"shared_user_"+item.uid,scope:"u/"+item.uid,lazy:true,nodrag:true});
                    }
                }
            } else if ( data.node.key == "shared_proj" && !data.node.data.scope ){
                data.result = [];
                if ( data.response.length ){
                    for ( i in data.response ) {
                        item = data.response[i];
                        data.result.push({ title: inst.generateTitle(item,true),icon:"ui-icon ui-icon-box",folder:true,key:"shared_proj_"+item.id,scope:item.id,lazy:true,nodrag:true});
                    }
                }
            } else if ( data.node.key == "queries" ) {
                data.result = [];
                if ( data.response.length ){
                    var qry;
                    for ( i in data.response ) {
                        qry = data.response[i];
                        data.result.push({ title: qry.title+" <i class='browse-reload ui-icon ui-icon-reload'></i>",icon:"ui-icon ui-icon-zoom",folder:true,key:qry.id,lazy:true,offset:0,checkbox:false,nodrag:true});
                    }
                }
            } else if ( data.node.key == "allocs" ) {
                data.result = [];
                if ( data.response.length ){
                    var alloc;
                    for ( i in data.response ) {
                        alloc = data.response[i];
                        data.result.push({ title: alloc.repo.substr(5),icon:"ui-icon ui-icon-database",folder:true,key:alloc.repo+"/"+alloc.id,scope:alloc.id,repo:alloc.repo,lazy:true,offset:0,nodrag:true,checkbox:false});
                    }
                }
            } else if ( data.node.parent || data.node.key.startsWith("published")) {
                // General data/collection listing for all nodes
                //console.log("pos proc default",data.node.key,data.response);
                data.result = [];
                var entry;
                scope = data.node.data.scope;
                var items = data.response.data?data.response.data:data.response.item;
                for ( i in items ) {
                    item = items[i];
                    if ( item.id[0]=="c" ){
                        entry = { title: inst.generateTitle(item),folder:true,lazy:true,scope:scope,key:item.id, offset: 0 };
                    }else{
                        entry = { title: inst.generateTitle(item),checkbox:false,folder:false,icon:item.doi?"ui-icon ui-icon-linkext":"ui-icon ui-icon-file",scope:item.owner?item.owner:scope,key:item.id,doi:item.doi };
                    }

                    data.result.push( entry );
                }

                inst. addTreePagingNode( data );

                //if (( !items || !items.length ) && ( data.node.parent.key.startsWith("c/") || data.node.parent.key.startsWith("repo/"))){
                    //data.result.push({title:"(empty1)",icon:false,checkbox:false,scope:scope,nodrag:true,key:"empty"});
                //}
            }

            if ( data.result && data.result.length == 0 ){
                if ( scope )
                    data.result.push({title:"(empty)",icon:false,checkbox:false,scope:scope,nodrag:true,key:"empty"});
                else
                    data.result.push({title:"(empty)",icon:false,checkbox:false,nodrag:true,notarg:true,key:"empty"});
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
                for ( var i in parents ){
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
            if ( data.targetType == "icon" && data.node.isFolder() ){
                data.node.toggleExpanded();
            }

            if ( inst.dragging ){ // Suppress click processing on aborted drag
                inst.dragging = false;
            }else if ( !inst.searchSelect ){ // Selection "rules" differ for search-select mode
                if ( event.which == null ){
                    // RIGHT-CLICK CONTEXT MENU

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
                    for ( var i in sel ){
                        if ( sel[i].key.startsWith("c/")){
                            coll_sel = true;
                            break;
                        }
                    }

                    if ( sel[0].data.nodrag || coll_sel )
                        inst.data_tree_div.contextmenu("enableEntry", "copy", false );
                    else
                        inst.data_tree_div.contextmenu("enableEntry", "copy", true );

                    if ( inst.pasteItems.length > 0 && inst.pasteAllowed( sel[0], inst.pasteItems[0] ))
                        inst.data_tree_div.contextmenu("enableEntry", "paste", true );
                    else
                        inst.data_tree_div.contextmenu("enableEntry", "paste", false );
                } else if ( data.targetType != "expander" /*&& data.node.data.scope*/ ){
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

    inst.addTreePagingNode = function( a_data ){
        if ( a_data.response.offset > 0 || a_data.response.total > (a_data.response.offset + a_data.response.count )){
            var pages = Math.ceil(a_data.response.total/g_opts.page_sz), page = 1+a_data.response.offset/g_opts.page_sz;
            a_data.result.push({title:"<button class='btn small''"+(page==1?" disabled":"")+" onclick='pageLoad(\""+a_data.node.key+"\",0)'>First</button> <button class='btn small'"+(page==1?" disabled":"")+" onclick='pageLoad(\""+a_data.node.key+"\","+(page-2)*g_opts.page_sz+")'>Prev</button> Page " + page + " of " + pages + " <button class='btn small'"+(page==pages?" disabled":"")+" onclick='pageLoad(\""+a_data.node.key+"\","+page*g_opts.page_sz+")'>Next</button> <button class='btn small'"+(page==pages?" disabled":"")+" onclick='pageLoad(\""+a_data.node.key+"\","+(pages-1)*g_opts.page_sz+")'>Last</button>",folder:false,icon:false,checkbox:false,hasBtn:true});
        }
    };

    inst.data_tree_div = $('#data_tree');
    inst.data_tree = inst.data_tree_div.fancytree('getTree');

    tooltipTheme( inst.data_tree_div );

    $("#data_md_tree").fancytree({
        extensions: ["themeroller","filter"],
        themeroller: {
            activeClass: "my-fancytree-active",
            addClass: "",
            focusClass: "",
            hoverClass: "my-fancytree-hover",
            selectedClass: ""
        },
        filter:{
            autoExpand: true,
            mode: "hide"
        },
        source: inst.data_md_empty_src,
        selectMode: 1,
        beforeExpand: function(event,data){
            // Handle auto-expansion
            var path = data.node.title;
            var par = data.node.parent;
            while ( par ){
                if ( par.title == "root" && !par.parent )
                    break;
                path = par.title + "." + path;
                par = par.parent;
            }

            if ( data.node.isExpanded() ){
                delete inst.data_md_exp[path];
            }else{
                inst.data_md_exp[path] = 10;
            }
        }
    });

    this.data_md_tree = $("#data_md_tree").fancytree("getTree");

    // Connect event/click handlers
    $("#btn_file_menu",inst.frame).on('click', inst.fileMenu );
    $("#btn_new_proj",inst.frame).on('click', inst.actionNewProj );
    $("#btn_new_data",inst.frame).on('click', inst.actionNewData );
    $("#btn_dup_data",inst.frame).on('click', inst.actionDupData );
    $("#btn_new_coll",inst.frame).on('click', inst.actionNewColl );
    $("#btn_import_data",inst.frame).on('click', function(){
        $("#filemenu").hide();
        inst.update_files = false;
        inst.import_direct = false;
        $('#input_files',inst.frame).val("");
        $('#input_files',inst.frame).trigger('click');
    });
    $("#btn_import_direct_data",inst.frame).on('click', function(){
        $("#filemenu").hide();
        inst.update_files = false;
        inst.import_direct = true;
        $('#input_files',inst.frame).val("");
        $('#input_files',inst.frame).trigger('click');
    });
    $("#btn_update_data",inst.frame).on('click', function(){
        $("#filemenu").hide();
        inst.update_files = true;
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
        };
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
    $("#btn_dep_graph",inst.frame).on('click', inst.actionDepGraph );
    $("#btn_prev_coll",inst.frame).on('click', inst.actionPrevParent );
    $("#btn_next_coll",inst.frame).on('click', inst.actionNextParent );
    $("#btn_srch_first_par_coll",inst.frame).on('click', inst.actionFirstParent );
    $("#btn_cat_first_par_coll",inst.frame).on('click', inst.actionFirstParent );

    $("#btn_exp_node",inst.frame).on('click', inst.actionGraphNodeExpand );
    $("#btn_col_node",inst.frame).on('click', inst.actionGraphNodeCollapse );
    $("#btn_hide_node",inst.frame).on('click', inst.actionGraphNodeHide );

    $("#btn_alloc",inst.frame).on('click', function(){ dlgAllocations(); });
    $("#btn_settings",inst.frame).on('click', function(){ dlgSettings(function(reload){
        if(reload){
            inst.refreshUI();
        }
        clearTimeout(inst.taskTimer);
        this.task_hist.html( "(no recent transfers)" );
        inst.taskHist = [];
        inst.pollSince = g_opts.task_hist * 3600;
        inst.taskTimer = setTimeout( inst.taskHistoryPoll, 1000 );
    });});

    $(document.body).on('click', '.browse-reload' , inst.actionReloadSelected );

    $("#id_query,#text_query,#meta_query").on('keypress', function (e) {
        if (e.keyCode == 13){
            inst.searchDirect();
        }
    });

    $("#id_query,#text_query,#meta_query").on( "input", function(e) {
        $("#run_qry_btn").addClass("ui-state-error");
    });

    $("#btn_srch_refresh").on("click", function(){
        if ( inst.cur_query )
            inst.execQuery( inst.cur_query );
    });

    $("#md_filter_text").on('keypress', function (e) {
        if (e.keyCode == 13){
            var text = $("#md_filter_text").val();
            inst.data_md_tree.filterNodes( text );
        }
    });

    $("#md_filter_apply").on('click', function (e) {
        var text = $("#md_filter_text").val();
        inst.data_md_tree.filterNodes( text );
    });

    $("#md_filter_reset").on('click', function (e) {
        $("#md_filter_text").val("");
        inst.data_md_tree.clearFilter();
        var node = inst.data_md_tree.getActiveNode();
        if ( node ){
            node.li.scrollIntoView();
        }
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
            {title: "Actions", cmd: "actions", children: [
                {title: "Edit", action: inst.actionEditSelected, cmd: "edit" },
                //{title: "Duplicate", cmd: "dup" },
                {title: "Delete", action: inst.actionDeleteSelected, cmd: "del" },
                {title: "Sharing", action: inst.actionShareSelected, cmd: "share" },
                {title: "Lock", action: inst.actionLockSelected, cmd: "lock" },
                {title: "Unlock", action: inst.actionUnlockSelected, cmd: "unlock" },
                {title: "Get", action: inst.actionDataGet, cmd: "get" },
                {title: "Put", action: inst.actionDataPut, cmd: "put" },
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
    inst.cat_tree_div.contextmenu(ctxt_menu_opts);
    inst.results_tree_div.contextmenu(ctxt_menu_opts);

    $("#data-tabs").tabs({
        heightStyle:"fill",
        active: 0,
        activate: function(ev,ui){
            var node;

            if ( ui.newPanel.length ){
                switch ( ui.newPanel[0].id ){
                    case "tab-data-tree":
                        inst.select_source = SS_TREE;
                        node = inst.data_tree.activeNode;
                        inst.showSelectedInfo( node );
                        break;
                    case "tab-catalogs":
                        inst.select_source = SS_CAT;
                        inst.showSelectedInfo();
                        break;
                    case "tab-prov-graph":
                        inst.select_source = SS_PROV;
                        inst.showSelectedInfo( inst.sel_node?inst.sel_node.id:null );
                        break;
                    case "tab-search-results":
                        inst.select_source = SS_SEARCH;
                        node = inst.results_tree.activeNode;
                        inst.showSelectedInfo( node );
                        break;
                }
            }
            inst.updateBtnState();
        }
    });

    $("#info-tabs").tabs({
        heightStyle:"fill",
        active: 0,
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
        inst.cur_query = null;
        $("#search_results_tree").fancytree("getTree").clear();
        $('[href="#tab-search-results"]').closest('li').hide();
        $( "#data-tabs" ).tabs({ active: 0 });
    });

    $("#footer-tabs").tabs({
        heightStyle: "auto",
        collapsible: true,
        active: false,
        activate: function(ev,ui){
            if ( ui.newPanel.length && ui.newPanel[0].id == "tab-search" ){
                inst.updateSearchSelectState( true );
            } else if ( ui.oldPanel.length && ui.oldPanel[0].id == "tab-search" ){
                inst.updateSearchSelectState( false );
            }

            if (( ui.newTab.length == 0 && ui.newPanel.length == 0 ) || ( ui.oldTab.length == 0 && ui.oldPanel.length == 0 )){
                inst.windowResized();
                /*setTimeout( function(){
                    inst.windowResized();
                }, 1500 );*/
            }
        }
    }).css({'overflow': 'auto'});

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

    $("#filemenu").menu().removeClass("ui-widget-content").addClass("ui-corner-all");

    this.filemenutimer = null;
    $("#filemenu").mouseout(function(){
        if ( !this.filemenutimer ){
            this.filemenutimer = setTimeout( function(){
                $("#filemenu").hide();
                this.filemenutimer = null;
            }, 1000 );
        }
    });

    $("#filemenu").mouseover(function(){
        if ( this.filemenutimer ){
            clearTimeout(this.filemenutimer);
            this.filemenutimer = null;
        }
    });


    // Graph Init
    var zoom = d3.zoom();

    inst.svg = d3.select("svg")
    .call(zoom.on("zoom", function () {
        svg.attr("transform", d3.event.transform);
    }))
    .append("g");

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
    this.task_hist.html( "(no recent transfers)" );
    this.taskTimer = setTimeout( inst.taskHistoryPoll, 1000 );

    return inst;
}
