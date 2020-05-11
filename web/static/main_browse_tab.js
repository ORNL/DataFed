import * as api from "./api.js";
import * as model from "./model.js";
import * as util from "./util.js";
import * as settings from "./settings.js";
import * as dialogs from "./dialogs.js";
import * as panel_info from "./panel_item_info.js";
import * as panel_cat from "./panel_catalog.js";
import * as panel_graph from "./panel_graph.js";
import * as dlgDataNewEdit from "./dlg_data_new_edit.js";
import * as dlgRepoEdit from "./dlg_repo_edit.js";
import * as dlgSetACLs from "./dlg_set_acls.js";
import * as dlgRepoManage from "./dlg_repo_manage.js";
import * as dlgOwnerChangeConfirm from "./dlg_owner_chg_confirm.js";
import * as dlgStartXfer from "./dlg_start_xfer.js";
import * as dlgQueryNewEdit from "./dlg_query_new_edit.js";
import * as dlgSettings from "./dlg_settings.js";
import * as dlgCollNewEdit from "./dlg_coll_new_edit.js";
import * as dlgProjNewEdit from "./dlg_proj_new_edit.js";


var frame = $("#content");
var task_hist = $("#task_hist",frame);
var data_tree_div;
var data_tree = null;
var results_tree_div;
var results_tree;
var my_root_key;
//var uid = "u/" + settings.user.uid;
var drag_mode = 0;
var drag_enabled = true;
var searchSelect = false;
var selectScope = null;
var dragging = false;
var hoverTimer;
var keyNav, keyNavMS;
var pasteItems = [], pasteMode, pasteSourceParent, pasteCollections;
var SS_TREE = 0;
var SS_CAT = 1;
var SS_PROV = 2;
var SS_SEARCH = 3;
var SS_NOTIFY = 4;
var select_source = SS_TREE;
var cur_query;
var update_files, import_direct;
var cat_panel, graph_panel;

// Task history vars (to be moved to panel_task_hist )
var taskTimer, taskHist = [];
var pollSince = settings.opts.task_hist * 3600;
var pollMax = 120;
var pollMin = 4;

export function windowResized(){
    var h = $("#data-tabs-parent").height();
    var tabs = $("#data-tabs",frame);
    var hdr_h = $(".ui-tabs-nav",tabs).outerHeight();
    tabs.outerHeight(h);
    $(".ui-tabs-panel",tabs).outerHeight( h - hdr_h );

    h = $("#info-tabs-parent").height();
    tabs = $("#info-tabs");
    hdr_h = $(".ui-tabs-nav",tabs).outerHeight();
    tabs.outerHeight(h);
    $(".ui-tabs-panel",tabs).outerHeight( h - hdr_h );
    if ( graph_panel )
        graph_panel.resized( $("#data-tabs-parent").width(), h - hdr_h );
}

window.pageLoad = function( key, offset ){
    var node = data_tree.getNodeByKey( key );
    if ( node ){
        node.data.offset = offset;
        setTimeout(function(){
            node.load(true);
        },0);
    }
};

window.pageLoadCat = function( key, offset ){
    var node = cat_panel.tree.getNodeByKey( key );
    if ( node ){
        node.data.offset = offset;
        setTimeout( function(){
            node.load(true);
        },0);
    }
};

function getSelectedIDs(){
    var ids = [], sel, i;

    switch( select_source ){
        case SS_TREE:
            sel = data_tree.getSelectedNodes();
            for ( i in sel ){
                ids.push( sel[i].key );
            }
            break;
        case SS_SEARCH:
            sel = results_tree.getSelectedNodes();
            for ( i in sel ){
                ids.push( sel[i].key );
            }
            break;
        case SS_CAT:
            sel = cat_panel.tree.getSelectedNodes();
            for ( i in sel ){
                ids.push( sel[i].key );
            }
            break;
        case SS_PROV:
            if ( graph_panel.getSelectedID() ){
                ids.push( graph_panel.getSelectedID() );
            }
            break;
    }

    return ids;
}

function refreshNodeTitle( a_node, a_data, a_reload ){
    a_node.title = util.generateTitle( a_data );

    if ( a_data.id.startsWith( "d/" )){
        if ( a_data.doi )
            a_node.icon = "ui-icon ui-icon-linkext";
        else
            a_node.icon = "ui-icon ui-icon-file";
    }

    a_node.renderTitle();

    if ( a_reload )
        reloadNode( a_node );
}

function refreshUI( a_ids, a_data, a_reload ){

    if ( !a_ids || !a_data ){
        // If no IDs or unknown action, refresh everything
        reloadNode(data_tree.getNodeByKey("mydata"));
        reloadNode(data_tree.getNodeByKey("proj_own"));
        reloadNode(data_tree.getNodeByKey("proj_adm"));
        reloadNode(data_tree.getNodeByKey("proj_mem"));
        reloadNode(data_tree.getNodeByKey("shared_user"));
        reloadNode(data_tree.getNodeByKey("shared_proj"));
        reloadNode(data_tree.getNodeByKey("topics"));
        reloadNode(data_tree.getNodeByKey("queries"));
    }else{
        var ids = Array.isArray(a_ids)?a_ids:[a_ids];
        var data = Array.isArray(a_data)?a_data:[a_data];

        var idx;
        // Find existing ids in tree & graph and update displayed info
        data_tree.visit( function(node){
            idx = ids.indexOf( node.key );
            if ( idx != -1 ){
                refreshNodeTitle( node, data[idx], a_reload );
            }
        });

        cat_panel.tree.visit( function(node){
            idx = ids.indexOf( node.key );
            if ( idx != -1 ){
                refreshNodeTitle( node, data[idx], a_reload );
            }
        });
    }

    if ( cur_query ){
        execQuery( cur_query );
    }

    if ( graph_panel.getSubjectID() ){
        if ( a_ids && a_data )
            graph_panel.update( a_ids, a_data );
        else
            graph_panel.load( graph_panel.getSubjectID(), graph_panel.getSelectedID() );
    }

    var act_node;

    switch( select_source ){
        case SS_TREE:
            act_node = data_tree.activeNode;
            break;
        case SS_CAT:
            act_node = cat_panel.tree.activeNode;
            break;
        case SS_PROV:
            act_node = graph_panel.getSelectedID();
            break;
        case SS_SEARCH:
            act_node = results_tree.activeNode;
            break;
    }

    panel_info.showSelectedInfo( act_node );
}

function displayPath( path, item ){
    //console.log("displayPath");

    var node;

    function reloadPathNode( idx ){
        //console.log("reload",idx);
        node = data_tree.getNodeByKey( path[idx].id );
        if ( node ){
            $( "#data-tabs" ).tabs({ active: 0 });
            //console.log("reload node",node.key,",offset",path[idx].off);
            node.data.offset = path[idx].off;
            node.load(true).done( function(){
                node.setExpanded(true);
                if ( idx == 0 ){
                    node = data_tree.getNodeByKey( item );
                    if ( node ){
                        node.setActive();
                        data_tree.selectAll(false);
                        selectScope = node;
                        treeSelectNode(node);
                    }else{
                        util.setStatusText("Error: item not found.");
                        console.log("ITEM NOT FOUND!",item);
                    }
                    //asyncEnd();
                }else{
                    reloadPathNode( idx - 1 );
                }
            });
        }else{
            //asyncEnd();
            util.setStatusText("Error: path not found.");
        }
    }

    // Must examine and process paths that lead to projects, or shared data

    if ( path[path.length - 1].id.startsWith('c/p_') ){
        var proj_id = "p/"+path[path.length - 1].id.substr(4,path[path.length - 1].id.length-9);
        api.viewProj( proj_id, function( proj ){
            if ( proj ){
                //console.log("proj:",proj,settings.user.uid);
                var uid = "u/"+settings.user.uid;
                path.push({id:proj_id,off:0});
                if ( proj.owner == uid )
                    path.push({id:"proj_own",off:0});
                else if ( proj.admin && proj.admin.indexOf( uid ) != -1 )
                    path.push({id:"proj_adm",off:0});
                else if ( proj.member && proj.member.indexOf( uid ) != -1 )
                    path.push({id:"proj_mem",off:0});
                else{
                    console.log("NOT FOUND - shared project folder?" );
                    // TODO BROKEN CODE
                    /*
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
                                        util.setStatusText("Error: unable to access path information!",1);
                                        asyncEnd();
                                    }
                                });
                            }else{
                                util.setStatusText("Error: path to record not found!",1);
                                asyncEnd();
                            }
                        }else{
                            util.setStatusText("Error: " + projs,1);
                            asyncEnd();
                        }
                    });
                    */
                    return;
                }
                //console.log("path:",path);
                reloadPathNode( path.length - 1 );
            }
        });
    }else if ( path[path.length - 1].id.startsWith('c/u_') ){
        var uid = path[path.length - 1].id.substr(4,path[path.length - 1].id.length-9);
        if ( uid == settings.user.uid ){
            reloadPathNode( path.length - 1 );
        }else{
            // TODO BROKEN CODE
            /*
            aclByUser( function( ok, data ){
                if ( ok ){
                    console.log("data:",data);
                    var idx = data.items.findIndex(function(user){
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
                                util.setStatusText("Error: unable to access path information!",1);
                                asyncEnd();
                            }
                        });
                    }else{
                        util.setStatusText("Error: path to record not found!",1);
                        asyncEnd();
                    }
                }else{
                    util.setStatusText("Error:" + users,1);
                    asyncEnd();
                }
            });
            */
        }
    }else{
        reloadPathNode( path.length - 1 );
    }
}

// TODO -  broken code
function showParent( which ){
    var ids = getSelectedIDs();
    if ( ids.length != 1 ){
        //asyncEnd();
        return;
    }

    var node, item_id = ids[0];

    if ( which != 0 ){
        node  = data_tree.getActiveNode();
        if ( !node || !node.parent ){
            //asyncEnd();
            return;
        }
    }

    api.getParents( item_id, function( ok, data ){
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

                        if ( path[0].id != node.parent.key )
                            continue;

                        if ( which == 1 )
                            if ( i > 0 ) i--; else i=data.path.length-1;
                        else
                            if ( i < data.path.length-1) i++; else i=0;
                        path = data.path[i].item;
                        break;
                    }
                }

                if ( !path ) // Might happen if displayed tree is stale
                    return;

                for ( i = 0; i < path.length; i++ ){
                    path[i] = {id:path[i].id,off:null};
                    //console.log("getCollOffset",path[i].id );
                    api.getCollOffset( path[i].id, i>0?path[i-1].id:item_id, settings.opts.page_sz, i, function( ok, data2, idx ){
                        done++;

                        if ( ok ){
                            path[idx].off = data2.offset;
                            if ( done == path.length && !err ){
                                displayPath( path, item_id );
                            }
                        }else if (!err){
                            util.setStatusText("Get Collections Error: " + data2, 1 );
                            err = true;
                        }

                        if ( done == path.length && err ){
                            //asyncEnd();
                        }
                    });
                }
            }
        }else{
            //asyncEnd();
            util.setStatusText("Get Collections Error: " + data, 1 );
        }
    });
}


function setLockSelected( a_lock ){
    var ids = getSelectedIDs();
    if ( ids.length == 0 )
        return;

    api.sendDataLock( ids, a_lock, function( ok, data ){
        if ( ok ){
            refreshUI( ids, data.item );
        }else{
            util.setStatusText("Lock Update Failed: " + data, 1 );
        }
    });
}


function refreshCollectionNodes( node_keys, scope ){
    // Refresh any collection nodes in data tree and catalog tree
    // Scope is used to narrow search in trees

    // Note: FancyTree does not have an efficient way to get a node by key (just linear search), so
    // instead we will do our own linear search that is more efficient due to branch pruning and early termination

    var refresh = [];
    var i,found = false;

    //console.log("REF: search data tree");

    data_tree.visit( function( node ){
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
        reloadNode(refresh[i]);

    refresh= [];
    //console.log("REF: search catalog tree");

    // catalog_tree is slightly different than data_tree
    cat_panel.tree.visit( function( node ){
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
        reloadNode(refresh[i]);
}

function copyItems( items, dest_node, cb ){
    var item_keys = [];
    for( var i in items )
        item_keys.push( items[i].key );

    api.linkItems( item_keys, dest_node.key, function( ok, msg ) {
        if ( ok ){
            refreshCollectionNodes([dest_node.key],dest_node.data.scope);
        }else{
            dialogs.dlgAlert( "Copy Error", msg );
            //util.setStatusText( "Copy Error: " + msg, 1 );
        }

        if ( cb )
            cb();
    });
}

function moveItems( items, dest_node, cb ){
    //console.log("moveItems",items,dest_node,pasteSourceParent);
    var item_keys = [];
    for( var i in items )
        item_keys.push( items[i].key );

    api.colMoveItems( item_keys, pasteSourceParent.key, dest_node.key, function( ok, msg ) {
        if ( ok ){
            refreshCollectionNodes([pasteSourceParent.key,dest_node.key],dest_node.data.scope);
        }else{
            dialogs.dlgAlert( "Move Error", msg );
            //util.setStatusText( "Move Error: " + msg, 1 );
        }

        if ( cb )
            cb();

    });
}

function dataGet( a_ids, a_cb ){
    api.dataGetCheck( a_ids, function( ok, data ){
        if ( ok ){
            //console.log("data get check:",data);
            var i, internal = false, external = false;

            if ( !data.item || !data.item.length ){
                dialogs.dlgAlert("Data Get Error","Selection contains no raw data.");
                return;
            }

            for ( i in data.item ){
                if ( data.item[i].locked ){
                    dialogs.dlgAlert("Data Get Error","One or more data records are currently locked.");
                    return;
                }
                if ( data.item[i].url ){
                    external = true;
                }else if ( data.item[i].size <= 0 ){
                    dialogs.dlgAlert("Data Get Error","One or more data records have no raw data.");
                    return;
                }else{
                    internal = true;
                }
            }

            if ( internal && external ){
                dialogs.dlgAlert("Data Get Error", "Selected data records contain both internal and external raw data.");
                return;
            } else if ( internal ){
                dlgStartXfer.show( model.TT_DATA_GET, data.item, a_cb );
            }else{
                for ( i in data.item ){
                    //console.log("download ", data.item[i].url )
                    var link = document.createElement("a");
                    var idx = data.item[i].url.lastIndexOf("/");
                    link.download = data.item[i].url.substr(idx);
                    link.href = data.item[i].url;
                    link.target = "_blank";
                    link.click();
                }
            }
        }else{
            dialogs.dlgAlert("Data Get Error",data);
        }
    });
}

function dataPut( a_id, a_cb ){
    api.dataPutCheck( a_id, function( ok, data ){
        if ( ok ){
            //console.log("data put check:",data);

            if ( !data.item || !data.item.length ){
                dialogs.dlgAlert("Data Put Error","Selection contains no record.");
                return;
            }

            if ( data.item[0].doi ){
                dialogs.dlgAlert("Data Put Error","Record has read-only, externally managed data.");
            }else{
                dlgStartXfer.show( model.TT_DATA_PUT, data.item, a_cb );
            }
        }else{
            dialogs.dlgAlert("Data Put Error",data);
        }
    });
}

//-------------------------------------------------------------------------
// ACTION FUNCTIONS (UI event handlers)

function actionDeleteSelected(){
    var ids = getSelectedIDs();
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

    dialogs.dlgConfirmChoice( "Confirm Deletion", msg, ["Cancel","Delete"], function( choice ){
        if ( choice == 1 ){
            var done = 0;
            if ( data.length )
                done++;
            if ( coll.length )
                done++;

            if ( data.length ){
                api.sendDataDelete( data, function( ok, data ){
                    if ( ok ){
                        if ( --done == 0 )
                            refreshUI();
                    }else
                        util.setStatusText( "Data Delete Error: " + data, 1 );
                });
            }
            if ( coll.length ){
                api.collDelete( coll, function( ok, data ){
                    if ( ok ){
                        if ( --done == 0 )
                            refreshUI();
                    }else
                        util.setStatusText("Collection Delete Error: " + data, 1 );
                });
            }
            if ( proj.length ){
                api.projDelete( proj, function( ok, data ){
                    if ( ok ){
                        reloadNode(data_tree.getNodeByKey("proj_own"));
                        panel_info.showSelectedInfo();
                    }else
                        util.setStatusText("Project Delete Error: " + data, 1 );
                });
            }
            if ( qry.length ){
                api.sendQueryDelete( qry, function( ok, data ){
                    if ( ok ){
                        reloadNode(data_tree.getNodeByKey("queries"));
                        panel_info.showSelectedInfo();
                    }else
                        util.setStatusText("Query Delete Error: " + data, 1 );
                });
            }
        }
    });
}

function fileMenu(){
    $("#filemenu").toggle().position({
        my: "left bottom",
        at: "left bottom",
        of: this
    }); //"fade"); //.focus(); //slideToggle({direction: "up"});
}

function actionNewProj() {
    if ( util.checkDlgOpen( "p_new_edit" ))
        return;

    dlgProjNewEdit.show(null,0,function( data ){
        util.setStatusText("Project "+data.id+" created");
        reloadNode( data_tree.getNodeByKey( "proj_own" ));
    });
}

function actionNewData() {
    if ( util.checkDlgOpen( "d_new_edit" ))
        return;

    var parent = "root";
    var node = data_tree.activeNode;
    if ( node ){
        if ( node.key.startsWith("d/") || node.key == "empty" ) {
            parent = node.parent.key;
        }else if (node.key.startsWith("c/")){
            parent = node.key;
        }else if (node.key.startsWith("p/")){
            parent = "c/p_"+node.key.substr(2)+"_root";
        }
    }

    api.checkPerms( parent, model.PERM_CREATE, function( granted ){
        if ( !granted ){
            dialogs.dlgAlertPermDenied();
            return;
        }

        dlgDataNewEdit.show( dlgDataNewEdit.DLG_DATA_MODE_NEW,null,parent,0,function(data,parent_id){
            resetTaskPoll();
            var node = data_tree.getNodeByKey( parent_id );
            if ( node )
                reloadNode( node );
            if ( graph_panel.getSubjectID() )
                graph_panel.load( graph_panel.getSubjectID(), graph_panel.getSelectedID() );
        });
    });
}

function actionDupData(){
    var parent = "root";
    var node = data_tree.activeNode;
    if ( node ){
        if ( node.key.startsWith("d/")) {
            parent = node.parent.key;
            console.log("parent",parent);
        }
    }

    api.checkPerms( parent, model.PERM_CREATE, function( granted ){
        if ( !granted ){
            dialogs.dlgAlertPermDenied();
            return;
        }
        api.dataView( node.key, function( data ){
            if ( data ){
                dlgDataNewEdit.show( dlgDataNewEdit.DLG_DATA_MODE_DUP,data,parent,0,function(data2,parent_id){
                    console.log("back from dup",parent_id);
                    var node = data_tree.getNodeByKey( parent_id );
                    if ( node )
                        reloadNode( node );
                    if ( graph_panel.getSubjectID() )
                        graph_panel.load( graph_panel.getSubjectID(), graph_panel.getSelectedID() );
                });
            }
        });
    });
}

function actionNewColl(){
    if ( util.checkDlgOpen( "c_new_edit" ))
        return;

    var node = data_tree.activeNode;
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

    api.checkPerms( parent, model.PERM_CREATE, function( granted ){
        if ( !granted ){
            dialogs.dlgAlertPermDenied();
            return;
        }

        dlgCollNewEdit.show(null,parent,0,function(data){
            var node = data_tree.getNodeByKey( data.parentId );
            if ( node )
                reloadNode( node );
        });
    });
}

function actionImportData( files ){
    var coll_id;

    if ( !update_files && !import_direct ){
        var node = data_tree.activeNode;

        if ( !node ){
            //asyncEnd();
            return;
        }

        if ( node.key.startsWith("d/")) {
            coll_id = node.parent.key;
        }else if (node.key.startsWith("c/")){
            coll_id = node.key;
        }else if (node.key.startsWith("p/")){
            coll_id = "c/p_"+node.key.substr(2)+"_root";
        }else{
            //asyncEnd();
            return;
        }
    }

    // Read file contents into a single payload for atomic validation and processing
    var file, tot_size = 0;

    for ( var i = 0; i < files.length; i++ ){
        file = files[i];
        console.log("size:",file.size,typeof file.size);
        if ( file.size == 0 ){
            dialogs.dlgAlert("Import Error","File " + file.name + " is empty." );
            //asyncEnd();
            return;
        }
        if ( file.size > model.MD_MAX_SIZE ){
            dialogs.dlgAlert("Import Error","File " + file.name + " size (" + util.sizeToString( file.size ) + ") exceeds metadata size limit of " + util.sizeToString(model.MD_MAX_SIZE) + "." );
            //asyncEnd();
            return;
        }
        tot_size += file.size;
    }

    if ( tot_size > model.PAYLOAD_MAX_SIZE ){
        dialogs.dlgAlert("Import Error","Total import size (" + util.sizeToString( tot_size ) + ") exceeds server limit of " + util.sizeToString(model.PAYLOAD_MAX_SIZE) + "." );
        //asyncEnd();
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
                    if ( !update_files && !import_direct )
                        obj[i].parent = coll_id;
                    payload.push( obj[i] );
                }
                rec_count += obj.length;
            }else{
                if ( !update_files && !import_direct )
                    obj.parent = coll_id;
                payload.push( obj );
                rec_count++;
            }

            count++;
            if ( count == files.length ){
                //console.log("Done reading all files", payload );
                if ( update_files ){
                    api.dataUpdateBatch( JSON.stringify( payload ), function( ok, data ){
                        if ( ok ){
                            refreshUI();
                            util.setStatusText("Updated " + rec_count + " record" + (rec_count>1?"s":""));
                        }else{
                            dialogs.dlgAlert( "Update Error", data );
                        }
                        //asyncEnd();
                    });
                }else{
                    api.dataCreateBatch( JSON.stringify( payload ), function( ok, data ){
                        if ( ok ){
                            util.setStatusText("Imported " + rec_count + " record" + (rec_count>1?"s":""));
                            if ( import_direct ){
                                refreshUI();
                            }else{
                                var node = data_tree.getNodeByKey( coll_id );
                                if ( node )
                                    reloadNode( node );
                            }
                        }else{
                            dialogs.dlgAlert( "Import Error", data );
                        }
                        //asyncEnd();
                    });
                }
            }else{
                reader.readAsText(files[count],'UTF-8');
            }
        }catch(e){
            //asyncEnd();
            dialogs.dlgAlert("Import Error","Invalid JSON in file " + files[count].name );
            return;
        }
    };

    reader.onerror = function( e ){
        dialogs.dlgAlert("Import Error", "Error reading file: " + files[count].name );
    };

    reader.onabort = function( e ){
        dialogs.dlgAlert("Import Error", "Import aborted" );
    };

    reader.readAsText(files[count],'UTF-8');
}

function actionFirstParent(){
    showParent(0);
}

function actionPrevParent(){
    showParent(1);
}

function actionNextParent(){
    showParent(2);
}

function actionLockSelected(){
    setLockSelected( true );
}

function actionUnlockSelected(){
    setLockSelected( false );
}

function actionCutSelected(){
    pasteItems = data_tree.getSelectedNodes();
    pasteSourceParent = pasteItems[0].parent;
    pasteMode = "cut";
    pasteCollections = [];
    for ( var i in pasteItems ){
        if ( pasteItems[i].key.startsWith("c/") )
            pasteCollections.push( pasteItems[i] );
    }
    //console.log("cutSelected",pasteItems,pasteSourceParent);
}

function actionCopySelected(){
    console.log("Copy");
    if ( select_source == SS_TREE )
        pasteItems = data_tree.getSelectedNodes();
    else if ( select_source == SS_SEARCH )
        pasteItems = results_tree.getSelectedNodes();
    else
        return;

    pasteSourceParent = pasteItems[0].parent;
    pasteMode = "copy";
    pasteCollections = [];
    for ( var i in pasteItems ){
        if ( pasteItems[i].key.startsWith("c/") )
            pasteCollections.push( pasteItems[i] );
    }
}

function actionPasteSelected(){
    function pasteDone(){
        pasteItems = [];
        pasteSourceParent = null;
        pasteCollections = null;
    }

    var node = data_tree.activeNode;
    if ( node && pasteItems.length ){

        if ( node.key == "empty" || node.key.startsWith( "d/" ))
            node = node.parent;
        if ( pasteMode == "cut" )
            moveItems( pasteItems, node, pasteDone );
        else
            copyItems( pasteItems, node, pasteDone );
    }
}

function actionUnlinkSelected(){
    var sel = data_tree.getSelectedNodes();
    if ( sel.length ){
        var scope = sel[0].data.scope;
        var items = [];
        for ( var i in sel ){
            items.push( sel[i].key );
        }
        //console.log("items:",items);
        api.unlinkItems( items, sel[0].parent.key, function( ok, data ) {
            if ( ok ){
                if ( data.item && data.item.length ){
                    var loc_root = "c/" + scope.charAt(0) + "_" + scope.substr(2) + "_root";
                    //reloadNode( data_tree.getNodeByKey( loc_root ));
                    refreshCollectionNodes([loc_root,sel[0].parent.key],sel[0].parent.data.scope);
                }else{
                    //reloadNode( sel[0].parent );
                    refreshCollectionNodes([sel[0].parent.key],sel[0].parent.data.scope);
                }
            }else{
                dialogs.dlgAlert( "Unlink Error", data );
            }
        });
    }
}

function permGateAny( item_id, req_perms, cb ){
    api.getPerms( item_id, req_perms, function( perms ){
        if (( perms & req_perms ) == 0 ){
            util.setStatusText( "Permission Denied.", 1 );
        }else{
            console.log("have perms:",perms);
            cb( perms );
        }
    });
}

function actionEditSelected() {
    //if ( async_guard )
    //    return;

    var ids = getSelectedIDs();

    if ( ids.length != 1 )
        return;

    var id = ids[0];

    if ( util.checkDlgOpen( id + "_edit" ))
        return;

    switch( id.charAt(0) ){
        case "p":
            permGateAny( id, model.PERM_WR_REC | model.PERM_SHARE, function( perms ){
                api.viewProj( id, function( data ){
                    if ( data ){
                        dlgProjNewEdit.show( data, perms, function( data ){
                            refreshUI( id, data );
                        });
                    }
                });
            });
            break;
        case "c":
            permGateAny( id, model.PERM_WR_REC | model.PERM_SHARE, function( perms ){
                api.viewColl( id, function( data ){
                    if ( data ){
                        dlgCollNewEdit.show( data, null, perms, function( data ){
                            refreshUI( id, data );
                        });
                    }
                });
            });
            break;
        case "d":
            permGateAny( id, model.PERM_WR_REC | model.PERM_WR_META | model.PERM_WR_DATA, function( perms ){
                api.dataView( id, function( data ){
                    if ( data ){
                        dlgDataNewEdit.show( dlgDataNewEdit.DLG_DATA_MODE_EDIT, data, null, perms, function( data ){
                            refreshUI( id, data );
                            // TODO - Only do this if raw data source is changed
                            resetTaskPoll();
                        });
                    }
                }); 
            }); 
            break;
        case 'q':
            api.sendQueryView( id, function( ok, old_qry ){
                if ( ok ){
                    dlgQueryNewEdit.show( old_qry, function( data ){
                        refreshUI( id, data, true );
                    });
                }else
                    util.setStatusText("Query Edit Error: " + old_qry, 1);
            });
            return;
        default:
            return;
    }
}

function actionShareSelected() {
    var ids = getSelectedIDs();
    if ( ids.length != 1 )
        return;

    var id = ids[0];

    api.checkPerms( id, model.PERM_SHARE, function( granted ){
        if ( !granted ){
            //dialogs.dlgAlertPermDenied();
            util.setStatusText("Sharing Error: Permission Denied.", 1);
            return;
        }

        if ( id.charAt(0) == "c" ){
            api.viewColl( id, function( coll ){
                if ( coll )
                    dlgSetACLs.show( coll );
            });
        } else {
            api.dataView( id, function( data ){
                if ( data )
                    dlgSetACLs.show( data );
            });
        }
    });
}

function actionDepGraph(){
    var ids = getSelectedIDs();
    if ( ids.length != 1 )
        return;

    var id = ids[0];

    if ( id.charAt(0) == "d" ) {
        graph_panel.load( id );
        $('[href="#tab-prov-graph"]').closest('li').show();
        $( "#data-tabs" ).tabs({ active: 3 });
    }
}

function actionDataGet() {
    var ids = getSelectedIDs();
    dataGet( ids, function(){
        resetTaskPoll();
    });
}

function actionDataPut() {
    var ids = getSelectedIDs();
    if ( ids.length != 1 )
        return;

    var id = ids[0];

    if ( id.charAt(0) == "d" ) {
        dataPut( id, function(){
            resetTaskPoll();
        });
    }
}

function actionReloadSelected(){
    var node;

    if ( select_source == SS_TREE ){
        node = data_tree.activeNode;
        if ( node ){
            reloadNode( node );
        }
    } else if ( select_source == SS_CAT ){
        node = cat_panel.tree.activeNode;
        if ( node ){
            reloadNode( node, cat_panel.tree );
        }
    }
}

function calcActionState( sel ){
    var bits,node;

    if ( sel.length > 1 ){
        bits = 0x31B;
        for ( var i in sel ){
            node = sel[i];
            switch ( node.key[0] ){
                case "c": bits |= node.data.isroot?0xD7:0x52;  break;
                case "d": bits |= 0x00;  break;
                case "r": bits |= 0x5F7;  break;
                case "p":
                    bits |= 0x5Fa;
                    if ( node.data.mgr )
                        bits |= 4;
                    else if ( !node.data.admin )
                        bits |= 5;
                    break;
                case "q": bits |= 0x5F9; break;
                default:  bits |= 0x5FF;  break;
            }
        }

        //console.log("multi",bits);
    }else if ( sel.length ){
        node = sel[0];
        console.log("node:",node);
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
                if ( !node.data.size )
                    bits |= 0x20;
                break;
            case "p":
                bits = 0x7Fa;
                if ( node.data.mgr )
                    bits |= 4;
                else if ( !node.data.admin )
                    bits |= 5;
                break;
            case "q": bits = 0x7FA; break;
            default:
                if ( node.key == "empty" && node.parent.key.startsWith("c/"))
                    bits = 0x6FF;
                else
                    bits = 0x7FF;
                break;
        }
        //console.log("single",bits);
    }else{
        bits = 0x6FF;
    }

    return bits;
}

// Exported for sub-panels
export function updateBtnState(){
    //console.log("updateBtnState");
    var bits,sel;
    switch( select_source ){
        case SS_TREE:
            sel = data_tree.getSelectedNodes();
            bits = calcActionState( sel );
            break;
        case SS_CAT:
            //bits = 0xFF;
            sel = cat_panel.tree.getSelectedNodes();
            bits = calcActionState( sel );
            break;
        case SS_PROV:
            bits = calcActionState(graph_panel.getSelectedNodes());
            break;
        case SS_SEARCH:
            sel = results_tree.getSelectedNodes();
            bits = calcActionState( sel );
            break;
    }

    $("#btn_edit",frame).button("option","disabled",(bits & 1) != 0 );
    $("#btn_dup_data",frame).button("option","disabled",(bits & 2) != 0 );
    $("#btn_del",frame).button("option","disabled",(bits & 4) != 0 );
    $("#btn_share",frame).button("option","disabled",(bits & 8) != 0 );
    $("#btn_upload",frame).button("option","disabled",(bits & 0x10) != 0 );
    $("#btn_download",frame).button("option","disabled",(bits & 0x20) != 0);
    $("#btn_lock",frame).button("option","disabled",(bits & 0x40) != 0);
    $("#btn_unlock",frame).button("option","disabled",(bits & 0x40) != 0);
    $("#btn_new_data",frame).button("option","disabled",(bits & 0x100) != 0 );
    //$("#btn_import_data",frame).button("option","disabled",(bits & 0x100) != 0 );
    $("#btn_new_coll",frame).button("option","disabled",(bits & 0x100) != 0 );
    //$("#btn_unlink",frame).button("option","disabled",(bits & 0x80) != 0);
    $("#btn_dep_graph",frame).button("option","disabled",(bits & 0x200) != 0 );
    $("#btn_prev_coll",frame).button("option","disabled",(bits & 0x200) != 0 );
    $("#btn_next_coll",frame).button("option","disabled",(bits & 0x200) != 0 );
    $("#btn_srch_first_par_coll",frame).button("option","disabled",(bits & 0x200) != 0 );
    $("#btn_cat_first_par_coll",frame).button("option","disabled",(bits & 0x200) != 0 );

    // Enable/disable file import/export menu items (by position, not name)

    // Export selected (only collections or records selected)
    if ( bits & 0x400 )
        $("#filemenu li:nth-child(4)").addClass("ui-state-disabled");
    else
        $("#filemenu li:nth-child(4)").removeClass("ui-state-disabled");

    // Import to collection
    if ( bits & 0x100 )
        $("#filemenu li:nth-child(1)").addClass("ui-state-disabled");
    else
        $("#filemenu li:nth-child(1)").removeClass("ui-state-disabled");

    data_tree_div.contextmenu("enableEntry", "edit", (bits & 1) == 0 );
    //data_tree_div.contextmenu("enableEntry", "dup", (bits & 2) == 0 );
    data_tree_div.contextmenu("enableEntry", "del", (bits & 4) == 0 );
    data_tree_div.contextmenu("enableEntry", "share", (bits & 8) == 0 );
    data_tree_div.contextmenu("enableEntry", "put", (bits & 0x10) == 0 );
    data_tree_div.contextmenu("enableEntry", "get", (bits & 0x20) == 0 );
    data_tree_div.contextmenu("enableEntry", "move", (bits & 0x20) == 0 );
    data_tree_div.contextmenu("enableEntry", "lock", (bits & 0x40) == 0 );
    data_tree_div.contextmenu("enableEntry", "unlock", (bits & 0x40) == 0 );
    data_tree_div.contextmenu("enableEntry", "unlink", (bits & 0x80) == 0 );
    data_tree_div.contextmenu("enableEntry", "newd", (bits & 0x100) == 0 );
    data_tree_div.contextmenu("enableEntry", "newc", (bits & 0x100) == 0 );
    data_tree_div.contextmenu("enableEntry", "graph", (bits & 0x200) == 0 );
}

function saveExpandedPaths( node, paths ){
    var subp = {};
    if ( node.children ){
        var child;
        for ( var i in node.children ){
            child = node.children[i];
            if ( child.isExpanded() ){
                saveExpandedPaths( child, subp );
            }
        }
    }
    paths[node.key] = subp;
}

function restoreExpandedPaths( node, paths ){
    node.setExpanded(true).always(function(){
        if ( node.children ){
            var child;
            for ( var i in node.children ){
                child = node.children[i];
                if ( child.key in paths ){
                    restoreExpandedPaths( child, paths[child.key] );
                }
            }
        }
    });
}

function reloadNode( node, tree ){
    if ( !node || node.isLazy() && !node.isLoaded() )
        return;

    var save_exp = node.isExpanded();
    var paths = {};

    if ( save_exp ){
        saveExpandedPaths( node, paths );
    }

    node.load(true).always(function(){
        if ( save_exp ){
            restoreExpandedPaths( node, paths[node.key] );
        }
    });
}


function execQuery( query ){
    util.setStatusText("Executing search query...");
    api.dataFind( query, function( ok, items ){
        console.log( "qry res:", ok, items );
        if ( ok ){
            //var srch_node = data_tree.getNodeByKey("search");

            // Set this query as current for refresh
            cur_query = query;

            var results = [];
            if ( items.length > 0 ){
                util.setStatusText( "Found " + items.length + " result" + (items.length==1?"":"s"));
                for ( var i in items ){
                    var item = items[i];
                    results.push({title:util.generateTitle( item, false, true ),icon:item.doi?"ui-icon ui-icon-linkext":"ui-icon ui-icon-file",
                        checkbox:false,key:item.id,nodrag:false,notarg:true,scope:item.owner,doi:item.doi,size:item.size});
                }
            } else {
                util.setStatusText("No results found");
                results.push({title:"(no results)",icon:false,checkbox:false,nodrag:true,notarg:true});
            }

            $.ui.fancytree.getTree("#search_results_tree").reload(results);
            $('[href="#tab-search-results"]').closest('li').show();
            $( "#data-tabs" ).tabs({ active: 4 });

            if ( !data_tree.activeNode )
                panel_info.showSelectedInfo();
        }else{
            dialogs.dlgAlert("Query Error",items);
        }
    });
}

function parseQuickSearch(){
    //console.log("parse query");
    var query = {};
    var tmp = $("#text_query",frame).val();
    if ( tmp )
        query.text = tmp;

    tmp = $("#id_query",frame).val();
    if ( tmp )
        query.id = tmp;

    tmp = $("#meta_query",frame).val();
    if ( tmp )
        query.meta = tmp;

    query.scopes = [];

    if ( $("#scope_selected",frame).prop("checked")){
        //console.log("select mode");
        var i, key, nodes = data_tree.getSelectedNodes();
        for ( i in nodes ){
            key = nodes[i].key;
            if ( key == "mydata" ){
                query.scopes.push({scope:model.SS_USER});
            }else if ( key == "proj_own" ){
                query.scopes.push({scope:model.SS_OWNED_PROJECTS});
            }else if ( key == "proj_adm" ){
                query.scopes.push({scope:model.SS_MANAGED_PROJECTS});
            }else if ( key == "proj_mem" ){
                query.scopes.push({scope:model.SS_MEMBER_PROJECTS});
            }else if ( key == "shared_all" ){
                query.scopes.push({scope:model.SS_SHARED_BY_ANY_USER});
                query.scopes.push({scope:model.SS_SHARED_BY_ANY_PROJECT});
            }else if ( key == "shared_user" ){
                if ( nodes[i].data.scope )
                    query.scopes.push({scope:model.SS_SHARED_BY_USER,id:nodes[i].data.scope});
                else
                    query.scopes.push({scope:model.SS_SHARED_BY_ANY_USER});
            }else if ( key == "shared_proj" ){
                if ( nodes[i].data.scope )
                    query.scopes.push({scope:model.SS_SHARED_BY_PROJECT,id:nodes[i].data.scope});
                else
                    query.scopes.push({scope:model.SS_SHARED_BY_ANY_PROJECT});
            }else if ( key.startsWith("c/") )
                query.scopes.push({scope:model.SS_COLLECTION,id:key,recurse:true});
            else if ( key.startsWith("p/") )
                query.scopes.push({scope:model.SS_PROJECT,id:key});
            //else if ( key.startsWith("t/") ){
            //    query.scopes.push({scope:SS_TOPIC,id:key,recurse:true});
            //}
        }
        nodes = cat_panel.tree.getSelectedNodes();
        //console.log("cat tree nodes:",nodes.length);
        for ( i in nodes ){
            key = nodes[i].key;
            query.scopes.push({scope:model.SS_TOPIC,id:key,recurse:true});
        }
    }else{
        if ( $("#scope_mydat",frame).prop("checked"))
            query.scopes.push({scope:model.SS_USER});
        if ( $("#scope_myproj",frame).prop("checked"))
            query.scopes.push({scope:model.SS_OWNED_PROJECTS});
        if ( $("#scope_otherproj",frame).prop("checked")){
            query.scopes.push({scope:model.SS_MANAGED_PROJECTS});
            query.scopes.push({scope:model.SS_MEMBER_PROJECTS});
        }
        if ( $("#scope_shared",frame).prop("checked")){
            query.scopes.push({scope:model.SS_SHARED_BY_ANY_USER});
            query.scopes.push({scope:model.SS_SHARED_BY_ANY_PROJECT});
        }
    }

    //console.log("query:", query);

    // TODO make sure at least one scope set and on term
    return query;
}

function searchDirect(){
    $("#run_qry_btn").removeClass("ui-state-error");

    var query = parseQuickSearch();

    //if ( query.scopes.length && ( query.text || query.meta || query.id ))
    execQuery( query );
}

function querySave(){
    dialogs.dlgSingleEntry( "Save Query", "Query Title:", ["Save","Cancel"], function(btn,val){
        if ( btn == 0 ){
            var query = parseQuickSearch();
            api.sendQueryCreate( val, query, function( ok, data ){
                if ( ok )
                    reloadNode(data_tree.getNodeByKey("queries"));
                else
                    util.setStatusText( "Query Save Error: " + data, 1 );
            });
        }
    });
}

function updateSearchSelectState( enabled ){
    if( enabled && $("#scope_selected",frame).prop("checked")){
        $(data_tree_div).fancytree("option","checkbox",true);
        cat_panel.setSearchSelectMode(true);

        //cat_panel.tree.setOption("checkbox",true);
        $("#btn_srch_clear_select",frame).button("option","disabled",false);
        searchSelect = true;
    }else{
        $(data_tree_div).fancytree("option","checkbox",false);
        cat_panel.setSearchSelectMode(false);
        //cat_panel.tree.setOption("checkbox",false);
        $("#btn_srch_clear_select",frame).button("option","disabled",true);
        searchSelect = false;
    }
    data_tree.selectAll(false);
    cat_panel.tree.selectAll(false);
}

function searchClearSelection(){
    data_tree.selectAll(false);
    cat_panel.tree.selectAll(false);
}

function taskUpdateHistory( task_list ){
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
            html += "</td><td>" + time.toLocaleDateString("en-US", settings.date_opts );

            time.setTime( task.ut*1000 );
            html += "</td><td>" + time.toLocaleDateString("en-US", settings.date_opts );

            html += "</td><td>" + task.msg + "</td></tr>";
        }
        html += "</table>";
    }
    task_hist.html( html );
}

function taskHistoryPoll(){
    //console.log("taskHistoryPoll",pollSince);

    if ( !settings.user )
        return;

    api._asyncGet( "/api/task/list" + (pollSince?"?since="+Math.round(2*pollSince):""), null, function( ok, data ){
        if ( ok && data ) {
            //console.log( "task list:",ok,data);
            if ( data.task && data.task.length ) {
                // Find and remove any previous entries
                var task;
                for ( var i in data.task ){
                    task = data.task[i];
                    for ( var j in taskHist ){
                        if ( taskHist[j].id == task.id ){
                            taskHist.splice(j,1);
                            break;
                        }
                    }
                }
                taskHist = data.task.concat( taskHist );
                taskUpdateHistory( taskHist );
                pollSince = 0;
            }
        }

        // Poll period after initial scan should run at slowest rate
        // If a transfer is started or detected, poll will drop to min period
        if ( pollSince == 0 )
            pollSince = pollMin;
        else if ( pollSince < pollMax )
            pollSince *= 2;
        else
            pollSince = pollMax;

            console.log( "poll per:",pollSince);

        taskTimer = setTimeout( taskHistoryPoll, 1000*(pollSince));
    });
}

function resetTaskPoll(){
    console.log("reset task poll");
    pollSince = 0;
    clearTimeout(taskTimer);
    taskTimer = setTimeout( taskHistoryPoll, 1000 );
}

function setupRepoTab(){
    //_asyncGet( "/api/repo/list?details=true", null, function(ok,data){
    api.repoList( true, false, function(ok,data){
        console.log("repo list:",ok,data);
        if ( ok ){
            var html;

            if ( data && data.length ){
                html = "<table class='info_table'><tr><th>Repo ID</th><th>Title</th><th>Address</th><th>Endpoint UUID</th><th>Capacity</th><th>Path</th></tr>";
                var repo;
                for ( var i in data ){
                    repo = data[i];
                    html += "<tr><td>"+repo.id.substr(5)+"</td><td>"+repo.title+"</td><td>"+repo.address+"</td><td>"+repo.endpoint+
                        "</td><td>"+util.sizeToString( repo.capacity )+"</td><td>"+repo.path+"</td><td><button class='btn small repo_adm' repo='"+
                        repo.id+"'>Admin</button></td></tr>";
                }
                html += "</table>";
            }else{
                html = "No administered repositories";
            }

            $("#repo_list").html( html );
            $(".btn","#repo_list").button();
            $(".repo_adm","#repo_list").click( function(ev){
                dlgRepoEdit.show($(this).attr("repo"),function(){
                    setupRepoTab();
                });
            });
        }
    });
}


function treeSelectNode( a_node, a_toggle ){
    if ( a_node.parent != selectScope.parent || a_node.data.scope != selectScope.data.scope ){
        util.setStatusText("Cannot select across collections or categories",1);
        return;
    }

    if ( a_toggle ){
        if ( a_node.isSelected() ){
            console.log("select false");

            a_node.setSelected( false );
        }else{
            console.log("select true");
            a_node.setSelected( true );
        }
    }else{
        console.log("select true");
        a_node.setSelected( true );
    }
}

function treeSelectRange( a_tree, a_node ){
    if ( a_node.parent != selectScope.parent || a_node.data.scope != selectScope.data.scope ){
        util.setStatusText("Cannot select across collections or categories",1);
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
            util.setStatusText("Range select only supported within a single collection.",1);
        }
    }
}

/** @brief Check if past is allowed to specified node
    *  @param dest_node - Candidate paste destination node
    *  @param src_node - Node being dragged
    *
    * There is additional source information in pasteXXX
    */
function pasteAllowed( dest_node, src_node ){
    //console.log("pasteAllowed:",dest_node, src_node);

    if ( !dest_node.data.notarg && dest_node.data.scope ){
        // Prevent pasting to self or across scopes or from other trees
        if ( !pasteSourceParent || pasteSourceParent.key == dest_node.key )
            return false;

        // Different scopes requires destination or destination parent to be a collection
        if ( dest_node.data.scope != src_node.data.scope ){
            if ( !(dest_node.key.startsWith( "c/" ) || dest_node.parent.key.startsWith( "c/" )))
                return false;
        }else{
            if ( dest_node.key.startsWith( "d/" ) || dest_node.key == "empty" ){
                if ( pasteSourceParent.key == dest_node.parent.key || !(dest_node.parent.key.startsWith("c/") || dest_node.parent.key.startsWith("repo/")))
                    return false;
            }

            if ( pasteCollections.length ){
                var i,j,coll,dest_par = dest_node.getParentList(false,true);
                // Prevent collection reentrancy
                // Fancytree handles this when one item selected, must check for multiple items
                if ( pasteCollections.length > 1 ){
                    for ( i in pasteCollections ){
                        coll = pasteCollections[i];
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
}


function addTreePagingNode( a_data ){
    if ( a_data.response.offset > 0 || a_data.response.total > (a_data.response.offset + a_data.response.count )){
        var pages = Math.ceil(a_data.response.total/settings.opts.page_sz), page = 1+a_data.response.offset/settings.opts.page_sz;
        a_data.result.push({title:"<button class='btn btn-icon-tiny''"+(page==1?" disabled":"")+" onclick='pageLoad(\"" +
            a_data.node.key+"\",0)'><span class='ui-icon ui-icon-triangle-1-w-stop'></span></button> <button class='btn btn-icon-tiny'"+(page==1?" disabled":"") +
            " onclick='pageLoad(\""+a_data.node.key+"\","+(page-2)*settings.opts.page_sz+")'><span class='ui-icon ui-icon-triangle-1-w'></span></button> Page " +
            page + " of " + pages + " <button class='btn btn-icon-tiny'"+(page==pages?" disabled":"")+" onclick='pageLoad(\"" +
            a_data.node.key+"\","+page*settings.opts.page_sz+")'><span class='ui-icon ui-icon-triangle-1-e'></span></button> <button class='btn btn-icon-tiny'" + 
            (page==pages?" disabled":"")+" onclick='pageLoad(\""+a_data.node.key+"\","+(pages-1)*settings.opts.page_sz +
            ")'><span class='ui-icon ui-icon-triangle-1-e-stop'></span></button>", folder:false, icon:false, checkbox:false, hasBtn:true });
    }
}

var tree_source = [
    //{title:"Favorites <i class='browse-reload ui-icon ui-icon-reload'",folder:true,icon:"ui-icon ui-icon-heart",lazy:true,nodrag:true,key:"favorites"},
    {title:"My Data <i class='browse-reload ui-icon ui-icon-reload'></i>",key:"mydata",nodrag:true,icon:"ui-icon ui-icon-person",folder:true,expanded:false,lazy:true},
    {title:"My Projects <i class='browse-reload ui-icon ui-icon-reload'></i>",folder:true,icon:"ui-icon ui-icon-view-icons",nodrag:true,lazy:true,key:"proj_own",offset:0},
    {title:"Managed Projects <i class='browse-reload ui-icon ui-icon-reload'></i>",folder:true,icon:"ui-icon ui-icon-view-icons",nodrag:true,lazy:true,key:"proj_adm",offset:0},
    {title:"Member Projects <i class='browse-reload ui-icon ui-icon-reload'></i>",folder:true,icon:"ui-icon ui-icon-view-icons",nodrag:true,lazy:true,key:"proj_mem",offset:0},
    {title:"Shared Data",folder:true,icon:"ui-icon ui-icon-circle-plus",nodrag:true,key:"shared_all",children:[
        {title:"By User <i class='browse-reload ui-icon ui-icon-reload'></i>",icon:"ui-icon ui-icon-persons",nodrag:true,folder:true,lazy:true,key:"shared_user"},
        {title:"By Project <i class='browse-reload ui-icon ui-icon-reload'></i>",icon:"ui-icon ui-icon-view-icons",nodrag:true,folder:true,lazy:true,key:"shared_proj"}
    ]},
    {title:"Subscribed Data",folder:true,icon:"ui-icon ui-icon-sign-in",nodrag:true,lazy:true,key:"subscribed",checkbox:false,offset:0},
    {title:"Saved Queries <i class='browse-reload ui-icon ui-icon-reload'></i>",folder:true,icon:"ui-icon ui-icon-view-list",lazy:true,nodrag:true,key:"queries",checkbox:false,offset:0},
];

var ctxt_menu_opts = {
    delegate: "li",
    show: false,
    hide: false,
    menu: [
        {title: "Actions", cmd: "actions", children: [
            {title: "Edit", action: actionEditSelected, cmd: "edit" },
            //{title: "Duplicate", cmd: "dup" },
            {title: "Sharing", action: actionShareSelected, cmd: "share" },
            //{title: "Lock", action: actionLockSelected, cmd: "lock" },
            //{title: "Unlock", action: actionUnlockSelected, cmd: "unlock" },
            {title: "Download", action: actionDataGet, cmd: "get" },
            {title: "Upload", action: actionDataPut, cmd: "put" },
            {title: "Provenance", action: actionDepGraph, cmd: "graph" },
            {title: "----"},
            {title: "Delete", action: actionDeleteSelected, cmd: "del" }
            ]},
        {title: "New", cmd:"new",children: [
            {title: "Data", action: actionNewData, cmd: "newd" },
            {title: "Collection", action: actionNewColl, cmd: "newc" },
            {title: "Project", action: actionNewProj, cmd: "newp" }
            ]},
        {title: "----"},
        {title: "Cut", action: actionCutSelected, cmd: "cut" },
        {title: "Copy", action: actionCopySelected, cmd: "copy" },
        {title: "Paste", action: actionPasteSelected, cmd: "paste" },
        {title: "Unlink", action: actionUnlinkSelected, cmd: "unlink" }
        ],
    beforeOpen: function( ev, ui ){
        ev.stopPropagation();

        // Ignore context menu over paging nodes
        var node = $.ui.fancytree.getNode( ev.originalEvent );
        if ( node && node.data.hasBtn )
            return false;

        // Select the target before menu is shown
        if ( hoverTimer ){
            clearTimeout(hoverTimer);
            hoverTimer = null;
        }

        ui.target.click();
    }
};


$(".scope",frame).checkboxradio();
$(".scope2",frame).checkboxradio();

$("#scope_selected",frame).on( "change",function(ev){
    if( $("#scope_selected",frame).prop("checked")){
        $(".scope",frame).prop("checked",false).checkboxradio("disable").checkboxradio("refresh");
    }else{
        $(".scope",frame).checkboxradio("enable");
    }

    updateSearchSelectState( true );
});

$('#input_files',frame).on("change",function(ev){
    if ( ev.target.files && ev.target.files.length ){
        actionImportData( ev.target.files );
    }
});

$("#filemenu").menu().removeClass("ui-widget-content").addClass("ui-corner-all");

var filemenutimer = null;

$("#filemenu").mouseout(function(){
    if ( !filemenutimer ){
        filemenutimer = setTimeout( function(){
            $("#filemenu").hide();
            filemenutimer = null;
        }, 1000 );
    }
});

$("#filemenu").mouseover(function(){
    if ( filemenutimer ){
        clearTimeout(filemenutimer);
        filemenutimer = null;
    }
});

// Wire-up callbacks in static browser template
$("#run_qry_btn",frame).on("click", function(){ searchDirect(); });
$("#save_qry_btn",frame).on("click", function(){ querySave(); });
$("#btn_srch_clear_select",frame).on("click", function(){ searchClearSelection(); });

$("#info-tabs").tabs({
    heightStyle:"fill",
    active: 0,
});

$(".prov-graph-close").click( function(){
    graph_panel.clear();
    $('[href="#tab-prov-graph"]').closest('li').hide();
    $( "#data-tabs" ).tabs({ active: 0 });
});

$(".search-results-close").click( function(){
    cur_query = null;
    $.ui.fancytree.getTree("#search_results_tree").clear();
    $('[href="#tab-search-results"]').closest('li').hide();
    $( "#data-tabs" ).tabs({ active: 0 });
});

$("#footer-tabs").tabs({
    heightStyle: "auto",
    collapsible: true,
    active: false,
    activate: function(ev,ui){
        if ( ui.newPanel.length && ui.newPanel[0].id == "tab-search" ){
            updateSearchSelectState( true );
        } else if ( ui.oldPanel.length && ui.oldPanel[0].id == "tab-search" ){
            updateSearchSelectState( false );
        }

        if (( ui.newTab.length == 0 && ui.newPanel.length == 0 ) || ( ui.oldTab.length == 0 && ui.oldPanel.length == 0 )){
            windowResized();
            /*setTimeout( function(){
                windowResized();
            }, 1500 );*/
        }
    }
}).css({'overflow': 'auto'});

$("#data-tabs").tabs({
    heightStyle:"fill",
    active: 0,
    activate: function(ev,ui){
        if ( ui.newPanel.length ){
            switch ( ui.newPanel[0].id ){
                case "tab-data-tree":
                    select_source = SS_TREE;
                    panel_info.showSelectedInfo( data_tree.activeNode );
                    break;
                case "tab-catalogs":
                    select_source = SS_CAT;
                    panel_info.showSelectedInfo( cat_panel.tree.activeNode );
                    break;
                case "tab-notifications":
                    //select_source = SS_CAT;
                    //panel_info.showSelectedInfo( cat_panel.tree.activeNode );
                    break;
                case "tab-prov-graph":
                    select_source = SS_PROV;
                    panel_info.showSelectedInfo( graph_panel.getSelectedID() );
                    break;
                case "tab-search-results":
                    select_source = SS_SEARCH;
                    panel_info.showSelectedInfo( results_tree.activeNode );
                    break;
            }
        }
        updateBtnState();
    }
});

$("#id_query,#text_query,#meta_query").on( "input", function(e) {
    $("#run_qry_btn").addClass("ui-state-error");
});

$("#btn_srch_refresh").on("click", function(){
    if ( cur_query )
        execQuery( cur_query );
});

$("#btn_edit",frame).on('click', actionEditSelected );
//$("#btn_dup",frame).on('click', dupSelected );
$("#btn_del",frame).on('click', actionDeleteSelected );
$("#btn_share",frame).on('click', actionShareSelected );
$("#btn_lock",frame).on('click', actionLockSelected );
$("#btn_unlock",frame).on('click', actionUnlockSelected );
$("#btn_upload",frame).on('click', actionDataPut );
$("#btn_download",frame).on('click', actionDataGet );
$("#btn_dep_graph",frame).on('click', actionDepGraph );
$("#btn_prev_coll",frame).on('click', actionPrevParent );
$("#btn_next_coll",frame).on('click', actionNextParent );
$("#btn_srch_first_par_coll",frame).on('click', actionFirstParent );
$("#btn_cat_first_par_coll",frame).on('click', actionFirstParent );

$("#btn_exp_node",frame).on('click', function(){
    graph_panel.expandNode();
});

$("#btn_col_node",frame).on('click', function(){
    graph_panel.collapseNode();
});

$("#btn_hide_node",frame).on('click', function(){
    graph_panel.hideNode();
});

$("#btn_settings").on('click', function(){ dlgSettings.show( function(reload){
    if(reload){
        refreshUI();
    }
    clearTimeout(taskTimer);
    task_hist.html( "(no recent transfers)" );
    taskHist = [];
    pollSince = settings.opts.task_hist * 3600;
    taskTimer = setTimeout( taskHistoryPoll, 1000 );
});});

$(document.body).on('click', '.browse-reload' , actionReloadSelected );

$("#id_query,#text_query,#meta_query").on('keypress', function (e) {
    if (e.keyCode == 13){
        searchDirect();
    }
});

$('#text_query').droppable({
    accept: function( item ){
        console.log("qry txt accept");
        return true;
    },
    drop: function(ev,ui){
        // TODO What does this do?
        var sourceNode = $(ui.helper).data("ftSourceNode");
        console.log("qry txt drop:",sourceNode);
    }
});

// Connect event/click handlers
$("#btn_file_menu",frame).on('click', fileMenu );
$("#btn_new_proj",frame).on('click', actionNewProj );
$("#btn_new_data",frame).on('click', actionNewData );
$("#btn_dup_data",frame).on('click', actionDupData );
$("#btn_new_coll",frame).on('click', actionNewColl );

$("#btn_import_data",frame).on('click', function(){
    $("#filemenu").hide();
    update_files = false;
    import_direct = false;
    $('#input_files',frame).val("");
    $('#input_files',frame).trigger('click');
});

$("#btn_import_direct_data",frame).on('click', function(){
    $("#filemenu").hide();
    update_files = false;
    import_direct = true;
    $('#input_files',frame).val("");
    $('#input_files',frame).trigger('click');
});

$("#btn_update_data",frame).on('click', function(){
    $("#filemenu").hide();
    update_files = true;
    $('#input_files',frame).val("");
    $('#input_files',frame).trigger('click');
});

$("#btn_export_data",frame).on('click', function(){
    $("#filemenu").hide();
    dialogs.dlgConfirmChoice( "Confirm Export", "Export selected record metadata to browser download directory?", ["Cancel","Export"], function( choice ){
        if ( choice == 1 ){
            var ids = getSelectedIDs();

            api.dataExport( ids, function( ok, data ){
                console.log("reply:", data );
                var rec;
                for ( var i in data.record ){
                    rec = JSON.parse( data.record[i] );
                    util.saveFile( rec.id.substr(2) + ".json", data.record[i] );
                }
            });
        }
    });
});

export function init(){
    console.log("browser - user from settings:",settings.user);

    my_root_key = "c/u_" + settings.user.uid + "_root";

    $("#data_tree",frame).fancytree({
        extensions: ["dnd5","themeroller"],
        toggleEffect: false,
        dnd5:{
            autoExpandMS: 400,
            preventNonNodes: true,
            preventLazyParents: false,
            dropEffectDefault: "copy",
            scroll: false,
            dragStart: function(node, data) {
                console.log( "dnd start" );

                if ( !drag_enabled || node.data.nodrag ){
                    console.log( "NOT ALLOWED" );
                    return false;
                }

                clearTimeout( hoverTimer );
                node.setActive(true);
                if ( !node.isSelected() ){
                    console.log( "clear selection" );
                    data_tree.selectAll(false);
                    selectScope = data.node;
                    node.setSelected(true);
                }

                pasteItems = data_tree.getSelectedNodes();

                data.dataTransfer.setData("text/plain",node.key);

                pasteSourceParent = pasteItems[0].parent;
                console.log("pasteSourceParent",pasteSourceParent);
                pasteCollections = [];
                for ( var i in pasteItems ){
                    if ( pasteItems[i].key.startsWith("c/") )
                        pasteCollections.push( pasteItems[i] );
                }
                dragging = true;

                if ( data.originalEvent.ctrlKey || data.originalEvent.metaKey || !node.parent.key.startsWith("c/") ) {
                    drag_mode = 0;
                } else {
                    drag_mode = 1;
                }
                return true;
            },
            dragDrop: function(dest_node, data) {
                dragging = false;
                drag_enabled = false;

                // data.otherNode = source, node = destination
                console.log("drop stop in",dest_node.key,pasteItems);

                var i, proj_id, ids = [];

                if ( pasteSourceParent.data.scope != dest_node.data.scope ){
                    console.log("Change owner");
                    var coll_id = dest_node.key.startsWith( "d/" )?dest_node.parent.key:dest_node.key;
                    proj_id = pasteSourceParent.data.scope.charAt(0) == 'p'?pasteSourceParent.data.scope:null;

                    for( i in pasteItems ){
                        ids.push( pasteItems[i].key );
                    }

                    api.dataOwnerChange( ids, coll_id, null, proj_id, true, function( ok, reply ){
                        console.log("chg owner reply:",ok,reply);
                        if ( ok ){
                            dlgOwnerChangeConfirm.show( pasteSourceParent.data.scope, dest_node.data.scope, reply, function( repo ){
                                console.log("chg owner conf:", repo );
                                api.dataOwnerChange( ids, coll_id, repo, proj_id, false, function( ok, reply ){
                                    if ( ok ){
                                        console.log("reply:", reply );
                                        resetTaskPoll();
                                        dialogs.dlgAlert( "Change Record Owner", "Task " + reply.task.id.substr(5) + " created to transfer data records to new owner." );
                                    }else{
                                        dialogs.dlgAlert( "Change Record Owner Error", reply );
                                    }
                                });
                            });
                        }else{
                            dialogs.dlgAlert( "Change Record Owner Error", reply );
                        }
                        drag_enabled = true;
                    });
                    return;
                }else if ( dest_node.key.startsWith( "repo/" ) || dest_node.parent.key.startsWith( "repo/" )){
                    var key = dest_node.key.startsWith( "repo/" )? dest_node.key:dest_node.parent.key;
                    var idx = key.indexOf("/",5);
                    var repo_id = key.substr(0,idx);
                    proj_id = pasteSourceParent.data.scope.charAt(0) == 'p'?pasteSourceParent.data.scope:null;

                    for( i in pasteItems ){
                        ids.push( pasteItems[i].key );
                    }

                    api.dataAllocChange( ids, repo_id, proj_id, true, function( ok, reply ){
                        if ( ok ){
                            if ( reply.totCnt == 0 ){
                                dialogs.dlgAlert( "Change Record Allocation Error", "No data records contained in selection." );
                            }else if ( reply.actCnt == 0 ){
                                dialogs.dlgAlert( "Change Record Allocation Error", "All selected data records already use allocation on '" + repo_id + "'" );
                            }else{
                                dialogs.dlgConfirmChoice( "Confirm Change Record Allocation", "This operation will transfer " + reply.actCnt + " record(s) (out of "+reply.totCnt +
                                    " selected) with " + util.sizeToString( reply.actSize ) + " of raw data to allocation on '" + repo_id + "'. Current allocation usage is " +
                                    util.sizeToString( reply.dataSize ) + " out of " + util.sizeToString( reply.dataLimit ) + " available and "+reply.recCount+" record(s) out of " +
                                    reply.recLimit+" available. Pending transfers may alter the amount of space available on target allocation.", ["Cancel","Confirm"], function(choice){
                                    if ( choice == 1 ){
                                        api.dataAllocChange( ids, repo_id, proj_id, false, function( ok, reply ){
                                            if ( ok ){
                                                resetTaskPoll();
                                                dialogs.dlgAlert("Change Record Allocation","Task " + reply.task.id.substr(5) + " created to move data records to new allocation.");
                                            }else{
                                                dialogs.dlgAlert( "Change Record Allocation Error", reply );
                                            }
                                        });
                                    }
                                });
                            }
                            drag_enabled = true;
                        }else{
                            dialogs.dlgAlert( "Change Record Allocation Error", reply );
                            drag_enabled = true;
                        }
                    });
                    return;
                }else if ( dest_node.key.startsWith("d/")){
                    dest_node = dest_node.parent;
                }else if ( dest_node.key == "empty" ){
                    dest_node = dest_node.parent;
                }

                function pasteDone(){
                    pasteItems = [];
                    pasteSourceParent = null;
                    pasteCollections = null;
                }

                if ( drag_mode ){
                    moveItems( pasteItems, dest_node, /*data.otherNode,*/ pasteDone );
                }else{
                    copyItems( pasteItems, dest_node, pasteDone );
                }
                drag_enabled = true;
            },
            dragOver: function(node, data) {
                data.dropEffect = data.dropEffectSuggested;
            },
            dragEnter: function(node, data) {
                var allowed = pasteAllowed( node, data.otherNode );

                return allowed;
            },
            dragEnd: function(node, data) {
                dragging = false;
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
        lazyLoad: function( event, data ) {
            if ( data.node.key == "mydata" ){
                console.log("lazy load mydata, user:",settings.user);
                var uid = "u/" + settings.user.uid;
                data.result = [
                    {title:"Root Collection",folder:true,expanded:false,lazy:true,key:my_root_key,offset:0,user:settings.user.uid,scope:uid,nodrag:true,isroot:true,admin:true},
                    {title:"Published Collections",folder:true,expanded:false,lazy:true,key:"published_u_"+settings.user.uid,offset:0,scope:uid,nodrag:true,notarg:true,checkbox:false,icon:"ui-icon ui-icon-sign-out"},
                    {title:"Allocations <i class='browse-reload ui-icon ui-icon-reload'></i>",folder:true,lazy:true,icon:"ui-icon ui-icon-databases",key:"allocs",scope:uid,nodrag:true,notarg:true,checkbox:false}
                ];
            }else if ( data.node.key == "proj_own" ){
                    data.result = {
                    url: "/api/prj/list?owner=true&offset="+data.node.data.offset+"&count="+settings.opts.page_sz,
                    cache: false
                };
            } else if ( data.node.key == "proj_adm" ){
                data.result = {
                    url: "/api/prj/list?admin=true&offset="+data.node.data.offset+"&count="+settings.opts.page_sz,
                    cache: false
                };
            } else if ( data.node.key == "proj_mem" ){
                data.result = {
                    url: "/api/prj/list?member=true&offset="+data.node.data.offset+"&count="+settings.opts.page_sz,
                    cache: false
                };
            }else if ( data.node.key.startsWith("p/")){
                var prj_id = data.node.key.substr(2);
                data.result = [
                    {title: "Root Collection",folder:true,lazy:true,key:"c/p_"+prj_id+"_root",scope:data.node.key,isroot:true,admin:data.node.data.admin,nodrag:true},
                    {title:"Published Collections",folder:true,expanded:false,lazy:true,key:"published_p_"+prj_id,offset:0,scope:data.node.key,nodrag:true,checkbox:false,icon:"ui-icon ui-icon-sign-out"},
                    {title:"Allocations",folder:true,lazy:true,icon:"ui-icon ui-icon-databases",key:"allocs",scope:data.node.key,nodrag:true,checkbox:false}
                ];
            } else if ( data.node.key.startsWith( "shared_user" )) {
                if ( data.node.data.scope ){
                    data.result = {
                        url: "/api/acl/by_subject/list?owner=" + encodeURIComponent(data.node.data.scope),
                        cache: false
                    };
                }else{
                    data.result = {
                        url: "/api/acl/by_subject?inc_users=true",
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
                    url: "/api/dat/list/by_alloc?repo=" + encodeURIComponent(data.node.data.repo) + "&subject=" + encodeURIComponent(data.node.data.scope) + "&offset="+data.node.data.offset+"&count="+settings.opts.page_sz,
                    cache: false
                };
            } else if ( data.node.key.startsWith( "shared_proj" )) {
                if ( data.node.data.scope ){
                    data.result = {
                        url: "/api/acl/by_subject/list?owner=" + encodeURIComponent(data.node.data.scope),
                        cache: false
                    };
                }else{
                    data.result = {
                        url: "/api/acl/by_subject?inc_projects=true",
                        cache: false
                    };
                }
            } else if ( data.node.key == 'queries') {
                data.result = {
                    url: "/api/query/list?offset="+data.node.data.offset+"&count="+settings.opts.page_sz,
                    cache: false
                };
            } else if ( data.node.key.startsWith("published")) {
                data.result = {
                    url: "/api/col/published/list?subject=" + encodeURIComponent(data.node.data.scope) + "&offset="+data.node.data.offset+"&count="+settings.opts.page_sz,
                    cache: false
                };
            } else if ( data.node.key == "favorites" || data.node.key == "views" ) {
                data.result = [{title:"(not implemented yet)",icon:false,nodrag:true}];
            } else if ( data.node.key.startsWith("q/") ) {
                data.result = {
                    url: "/api/query/exec?id=" + encodeURIComponent( data.node.key ),
                    cache: false
                };
            } else {
                var key = data.node.key;
                if ( data.node.data.key_pfx )
                    key = data.node.key.substr( data.node.data.key_pfx.length );

                //console.log("Lazy load coll",key);

                data.result = {
                    url: "/api/col/read?offset="+data.node.data.offset+"&count="+settings.opts.page_sz+"&id=" + encodeURIComponent( key ),
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
                        data.result.push({ title: util.generateTitle(item,true),icon:"ui-icon ui-icon-box",folder:true,key:item.id,isproj:true,admin:admin,mgr:mgr,nodrag:true,lazy:true});
                    }
                }

                addTreePagingNode( data );
            } else if ( data.node.key == "shared_user" && !data.node.data.scope ){
                console.log("pos proc:", data.response );
                data.result = [];
                if ( data.response.item && data.response.item.length ){
                    for ( i in data.response.item ) {
                        item = data.response.item[i];
                        data.result.push({ title: item.title + " (" + item.id.substr(2) + ") <i class='browse-reload ui-icon ui-icon-reload'></i>",icon:"ui-icon ui-icon-person",folder:true, key:"shared_user_"+item.id, scope: item.id, lazy:true,nodrag:true});
                    }
                }
            } else if ( data.node.key == "shared_proj" && !data.node.data.scope ){
                data.result = [];
                if ( data.response.item && data.response.item.length ){
                    for ( i in data.response.item ) {
                        item = data.response.item[i];
                        data.result.push({ title: util.generateTitle(item,true),icon:"ui-icon ui-icon-box",folder:true,key:"shared_proj_"+item.id,scope:item.id,lazy:true,nodrag:true});
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
                    for ( i = 0; i < data.response.length; i++ ) {
                        alloc = data.response[i];
                        data.result.push({ title: alloc.repo.substr(5) + (i==0?" (default)":""),icon:"ui-icon ui-icon-database",folder:true,key:alloc.repo+"/"+alloc.id,scope:alloc.id,repo:alloc.repo,lazy:true,offset:0,nodrag:true,checkbox:false});
                    }
                }
            } else if ( data.node.parent ) {
                // General data/collection listing for all nodes
                // Define key prefixes for collections in special tree locations

                var key_pfx = "";
                if ( data.node.key.startsWith("published"))
                    key_pfx = "pub_";

                data.result = [];
                var entry;
                scope = data.node.data.scope;
                var items = data.response.data?data.response.data:data.response.item;

                // Annotation entry for parent collection
                if ( data.node.key.startsWith( "c/" )){
                    data.result.push({title:"Annotations",folder:true,lazy:true,icon:"ui-icon ui-icon-news",checkbox:false,scope:scope,nodrag:true,key:"note_"+data.node.key.substr(2)});
                }

                addTreePagingNode( data );

                for ( i in items ) {
                    item = items[i];
                    if ( item.id[0]=="c" ){
                        entry = { title: util.generateTitle(item),folder:true,lazy:true,scope:scope, key: key_pfx + item.id, offset: 0, nodrag: key_pfx?true:false, key_pfx: key_pfx };
                    }else{
                        entry = { title: util.generateTitle(item),checkbox:false,folder:false, icon:item.doi?"ui-icon ui-icon-linkext":"ui-icon ui-icon-file",
                        scope:item.owner?item.owner:scope, key:item.id, doi:item.doi, size:item.size };
                    }

                    data.result.push( entry );
                }
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

            if ( keyNav && !keyNavMS ){
                data_tree.selectAll(false);
                selectScope = data.node;
                treeSelectNode(data.node);
            }
            keyNav = false;

            panel_info.showSelectedInfo( data.node );
        },
        select: function( event, data ) {
            //if ( searchSelect && data.node.isSelected() ){
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

            updateBtnState();
        },
        keydown: function(ev, data) {
            //console.log("keydown",ev.keyCode);
            if ( ev.keyCode == 32 ){
                // Manual search select uses different select rules
                if ( !searchSelect ){
                    if ( data_tree.getSelectedNodes().length == 0 ){
                        selectScope = data.node;
                    }

                    treeSelectNode(data.node,true);
                }
            }else if( ev.keyCode == 13 ){
                if ( keyNavMS ){
                    keyNavMS = false;
                    util.setStatusText("Keyboard multi-select mode DISABLED");
                }else{
                    keyNavMS = true;
                    util.setStatusText("Keyboard multi-select mode ENABLED");
                }
            }else if( ev.keyCode == 38 || ev.keyCode == 40 ){
                keyNav = true;
            }
        },
        click: function(event, data) {
            //console.log("click",data.node.key);

            if ( dragging ){ // Suppress click processing on aborted drag
                dragging = false;
            }else if ( !searchSelect ){ // Selection "rules" differ for search-select mode
                if ( event.which == null ){
                    // RIGHT-CLICK CONTEXT MENU

                    if ( !data.node.isSelected() ){
                        console.log("not selected - select");
                        data_tree.selectAll(false);
                        selectScope = data.node;
                        treeSelectNode(data.node);
                    }
                    // Update contextmenu choices
                    var sel = data_tree.getSelectedNodes();

                    // Enable/disable actions
                    if ( !sel[0].parent.key.startsWith("c/") || sel[0].data.nodrag ){
                        data_tree_div.contextmenu("enableEntry", "unlink", false );
                        data_tree_div.contextmenu("enableEntry", "cut", false );
                    }else{
                        data_tree_div.contextmenu("enableEntry", "unlink", true );
                        data_tree_div.contextmenu("enableEntry", "cut", true );
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
                        data_tree_div.contextmenu("enableEntry", "copy", false );
                    else
                        data_tree_div.contextmenu("enableEntry", "copy", true );

                    if ( pasteItems.length > 0 && pasteAllowed( sel[0], pasteItems[0] ))
                        data_tree_div.contextmenu("enableEntry", "paste", true );
                    else
                        data_tree_div.contextmenu("enableEntry", "paste", false );
                } else if ( data.targetType != "expander" /*&& data.node.data.scope*/ ){
                    if ( data_tree.getSelectedNodes().length == 0 )
                        selectScope = data.node;

                    if ( data.originalEvent.shiftKey && (data.originalEvent.ctrlKey || data.originalEvent.metaKey)) {
                        treeSelectRange(data_tree,data.node);
                    }else if ( data.originalEvent.ctrlKey || data.originalEvent.metaKey ) {
                        treeSelectNode(data.node,true);
                    }else if ( data.originalEvent.shiftKey ) {
                        data_tree.selectAll(false);
                        selectScope = data.node;
                        treeSelectRange(data_tree,data.node);
                    }else{
                        if ( data.targetType == "icon" && data.node.isFolder() ){
                            data.node.toggleExpanded();
                        }

                        data_tree.selectAll(false);
                        selectScope = data.node;
                        treeSelectNode(data.node);
                    }
                }
            }
        }
    }).on("mouseenter", ".fancytree-node", function(event){
        if ( event.ctrlKey || event.metaKey ){
            if ( hoverTimer ){
                clearTimeout(hoverTimer);
                //hoverNav = false;
                hoverTimer = null;
            }
            var node = $.ui.fancytree.getNode(event);
            hoverTimer = setTimeout(function(){
                if ( !node.isActive() ){
                    //hoverNav = true;
                    node.setActive(true);
                }
                hoverTimer = null;
            },750);
            //console.log("hover:",node.key);
        }
        //node.info(event.type);
    });

    data_tree_div = $('#data_tree',frame);
    data_tree = $.ui.fancytree.getTree("#data_tree");

    util.tooltipTheme( data_tree_div );

    if ( settings.user.isRepoAdmin ){
        setupRepoTab();
        $('[href="#tab-repo"]').closest('li').show();
    }

    if ( settings.user.isAdmin ){
        $('[href="#tab-admin"]').closest('li').show();
        $("#btn_manage_repos",frame).on('click', dlgRepoManage.show );
    }

    $(".btn-refresh").button({icon:"ui-icon-refresh",showLabel:false});
    util.inputTheme( $('input'));

    cat_panel = panel_cat.newCatalogPanel( "#catalog_tree", $("#tab-catalogs",frame), this );

    graph_panel = panel_graph.newGraphPanel( "#data-graph", $("tab#-prov-graph",frame), this );

    $("#search_results_tree").fancytree({
        extensions: ["themeroller","dnd5"],
        themeroller: {
            activeClass: "my-fancytree-active",
            addClass: "",
            focusClass: "",
            hoverClass: "my-fancytree-hover",
            selectedClass: ""
        },
        dnd5:{
            preventForeignNodes: true,
            dropEffectDefault: "copy",
            scroll: false,
            dragStart: function(node, data) {
                console.log( "dnd start" );
                data.dataTransfer.setData("text/plain",node.key);
                return true;
            }
        },
        source: [{title:"(no results)"}],
        selectMode: 2,
        activate: function( event, data ) {
            if ( keyNav && !keyNavMS ){
                results_tree.selectAll(false);
                data.node.setSelected( true );
            }
            keyNav = false;

            panel_info.showSelectedInfo( data.node );
        },
        select: function( event, data ) {
            updateBtnState();
        },
        keydown: function(ev, data) {
            //console.log("keydown",ev.keyCode);
            if ( ev.keyCode == 32 ){
                if ( data.node.isSelected() ){
                    data.node.setSelected( false );
                }else{
                    data.node.setSelected( true );
                }
            }else if( ev.keyCode == 13 ){
                if ( keyNavMS ){
                    keyNavMS = false;
                    util.setStatusText("Keyboard multi-select mode DISABLED");
                }else{
                    keyNavMS = true;
                    util.setStatusText("Keyboard multi-select mode ENABLED");
                }
            }else if( ev.keyCode == 38 || ev.keyCode == 40 ){
                keyNav = true;
            }
        },
        click: function(event, data) {
            if ( event.which == null ){
                // RIGHT-CLICK CONTEXT MENU
                //console.log("click no which");

                if ( !data.node.isSelected() ){
                    results_tree.selectAll(false);
                    data.node.setSelected( true );
                }

                // Enable/disable actions
                results_tree_div.contextmenu("enableEntry", "unlink", false );
                results_tree_div.contextmenu("enableEntry", "cut", false );
                results_tree_div.contextmenu("enableEntry", "copy", true );
                results_tree_div.contextmenu("enableEntry", "paste", false );
                results_tree_div.contextmenu("enableEntry", "new", false );

            } else if ( data.targetType != "expander" /*&& data.node.data.scope*/ ){
                if ( data.originalEvent.shiftKey && (data.originalEvent.ctrlKey || data.originalEvent.metaKey)) {
                    util.treeSelectRange( results_tree, data.node );
                }else if ( data.originalEvent.ctrlKey || data.originalEvent.metaKey ) {
                    if ( data.node.isSelected() ){
                        data.node.setSelected( false );
                    }else{
                        data.node.setSelected( true );
                    }
                }else if ( data.originalEvent.shiftKey ) {
                    results_tree.selectAll(false);
                    //selectScope = data.node;
                    util.treeSelectRange( results_tree, data.node );
                }else{
                    results_tree.selectAll(false);
                    //selectScope = data.node;
                    data.node.setSelected( true );
                }
            }
        }
    }).on("mouseenter", ".fancytree-node", function(event){
        if ( event.ctrlKey || event.metaKey ){
            if ( hoverTimer ){
                clearTimeout(hoverTimer);
                //hoverNav = false;
                hoverTimer = null;
            }
            var node = $.ui.fancytree.getNode(event);
            hoverTimer = setTimeout(function(){
                if ( !node.isActive() ){
                    //hoverNav = true;
                    node.setActive(true);
                }
                hoverTimer = null;
            },750);
            //console.log("hover:",node.key);
        }
        //node.info(event.type);
    });

    results_tree_div = $('#search_results_tree');
    results_tree = $.ui.fancytree.getTree("#search_results_tree");

    util.tooltipTheme( results_tree_div );

    data_tree_div.contextmenu(ctxt_menu_opts);
    cat_panel.tree_div.contextmenu(ctxt_menu_opts);
    results_tree_div.contextmenu(ctxt_menu_opts);

    var node = data_tree.getNodeByKey( "mydata" );

    node.setExpanded().done(function(){
        var node2 = data_tree.getNodeByKey( my_root_key );
        node2.setExpanded();
    });

    panel_info.showSelectedInfo();
    taskTimer = setTimeout( taskHistoryPoll, 1000 );
}

task_hist.html( "(no recent transfers)" );
