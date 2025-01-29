import * as api from "./api.js";
import * as model from "./model.js";
import * as util from "./util.js";
import * as settings from "./settings.js";
import * as dialogs from "./dialogs.js";
import * as panel_info from "./panel_item_info.js";
import * as panel_cat from "./panel_catalog.js";
import * as panel_graph from "./panel_graph.js";
import * as panel_search from "./panel_search.js";
import * as dlgDataNewEdit from "./dlg_data_new_edit.js";
import * as dlgRepoEdit from "./dlg_repo_edit.js";
import * as dlgSetACLs from "./dlg_set_acls.js";
import * as dlgRepoManage from "./dlg_repo_manage.js";
import * as dlgOwnerChangeConfirm from "./dlg_owner_chg_confirm.js";
import { transferDialog } from "./components/transfer/index.js";
import * as dlgSettings from "./dlg_settings.js";
import * as dlgCollNewEdit from "./dlg_coll_new_edit.js";
import * as dlgProjNewEdit from "./dlg_proj_new_edit.js";
import * as dlgAnnotation from "./dlg_annotation.js";
import * as dlgSchemaList from "./dlg_schema_list.js";
import * as dlgQuerySave from "./dlg_query_save.js";

//import * as dlgQueryBuild from "./dlg_query_builder.js";

var frame = $("#content"),
    task_hist = $("#task_hist", frame),
    data_tree_div,
    data_tree = null,
    my_root_key,
    move_mode = 0,
    drag_enabled = true,
    selectScope = null,
    dragging = false,
    hoverTimer,
    tab_close_timer,
    keyNav,
    keyNavMS,
    pasteItems = [],
    pasteSourceParent,
    pasteCollections,
    SS_TREE = 0,
    SS_CAT = 1,
    SS_PROV = 2,
    select_source = SS_TREE,
    select_source_prev = SS_TREE,
    searchMode = false,
    query_cur,
    query_id,
    query_title,
    update_files,
    import_direct,
    search_panel,
    cat_panel,
    cat_init = true,
    graph_panel;

// Task history vars (to be moved to panel_task_hist )
var taskTimer,
    taskHist = [];
var pollSince = settings.opts.task_hist * 3600;
var pollMax = 120;
var pollMin = 4;

var resize_container = $("#resize_container");

$("#data-tabs-parent").resizable({
    handles: "e",
    stop: function (event, ui) {
        var cellPercentWidth =
            (100 * ui.originalElement.outerWidth()) / resize_container.innerWidth();
        ui.originalElement.css("width", cellPercentWidth + "%");
        var nextCell = ui.originalElement.next();
        var nextPercentWidth = (100 * nextCell.outerWidth()) / resize_container.innerWidth();
        nextCell.css("width", nextPercentWidth + "%");
    },
});

export function windowResized() {
    var h = $("#data-tabs-parent").height();
    var tabs = $("#data-tabs", frame);
    var hdr_h = $(".ui-tabs-nav", tabs).outerHeight();
    tabs.outerHeight(h);
    $(".ui-tabs-panel", tabs).outerHeight(h - hdr_h);

    if (graph_panel) graph_panel.resized($("#data-tabs-parent").width(), h - hdr_h);

    // Match height of select info header
    //$("#sel_info_hdr").outerHeight( hdr_h ).css("line-height",hdr_h + "px");

    h = $("#info-tabs-parent").height();
    tabs = $("#info-tabs");
    hdr_h = $(".ui-tabs-nav", tabs).outerHeight();
    tabs.outerHeight(h);
    $("#info-tabs > .ui-tabs-panel").outerHeight(h - hdr_h);
}

$("body").on("click", ".page-first", function (ev) {
    var node = $.ui.fancytree.getNode(ev).parent;
    node.data.offset = 0;
    setTimeout(function () {
        node.load(true);
    }, 0);
});

$("body").on("click", ".page-prev", function (ev) {
    var node = $.ui.fancytree.getNode(ev).parent;
    node.data.offset -= settings.opts.page_sz;
    setTimeout(function () {
        node.load(true);
    }, 0);
});

$("body").on("click", ".page-next", function (ev) {
    var node = $.ui.fancytree.getNode(ev).parent;
    node.data.offset += settings.opts.page_sz;
    setTimeout(function () {
        node.load(true);
    }, 0);
});

$("body").on("click", ".page-last", function (ev) {
    var page = parseInt(ev.currentTarget.getAttribute("page"));
    var node = $.ui.fancytree.getNode(ev).parent;
    node.data.offset = page * settings.opts.page_sz;
    setTimeout(function () {
        node.load(true);
    }, 0);
});

$("body").on("click", ".srch-pg-first", function (ev) {
    if (query_cur) {
        query_cur.offset = 0;
        query_cur.count = settings.opts.page_sz;
        queryExec(query_cur);
    }
});

$("body").on("click", ".srch-pg-prev", function (ev) {
    if (query_cur) {
        query_cur.offset -= settings.opts.page_sz;
        if (query_cur.offset < 0) query_cur.offset = 0;
        query_cur.count = settings.opts.page_sz;
        queryExec(query_cur);
    }
});

$("body").on("click", ".srch-pg-next", function (ev) {
    if (query_cur) {
        query_cur.offset += settings.opts.page_sz;
        query_cur.count = settings.opts.page_sz;
        queryExec(query_cur);
    }
});

function getSelectedNodes() {
    var sel;

    switch (select_source) {
        case SS_TREE:
            sel = data_tree.getSelectedNodes();
            break;
        case SS_CAT:
            sel = cat_panel.getSelectedNodes();
            break;
    }

    return sel;
}

function getActionableIDs() {
    var ids = [],
        sel,
        i;

    switch (select_source) {
        case SS_TREE:
            /*if ( searchMode ){
                sel = [data_tree.getActiveNode()];
            }else{*/
            sel = data_tree.getSelectedNodes();
            //}
            for (i in sel) {
                ids.push(sel[i].key);
            }
            break;
        case SS_CAT:
            sel = cat_panel.getSelectedNodes();
            for (i in sel) {
                ids.push(sel[i].key);
            }
            break;
        case SS_PROV:
            if (graph_panel.getSelectedID()) {
                ids.push(graph_panel.getSelectedID());
            }
            break;
    }

    return ids;
}

/*function refreshNodeTitle( a_node, a_data, a_reload ){
    a_node.title = util.generateTitle( a_data );

    if ( a_data.id.startsWith( "d/" )){
        a_node.icon = util.getDataIcon( a_data );
    }

    a_node.renderTitle();

    if ( a_reload )
        reloadNode( a_node );
}*/

export function refreshUI(a_ids, a_data, a_reload) {
    //console.log("refresh",a_ids,a_data);
    if (!a_ids || !a_data) {
        // If no IDs or unknown action, refresh everything
        util.reloadNode(data_tree.getNodeByKey("mydata"));
        util.reloadNode(data_tree.getNodeByKey("projects"));
        util.reloadNode(data_tree.getNodeByKey("shared_user"));
        util.reloadNode(data_tree.getNodeByKey("shared_proj"));
        util.reloadNode(data_tree.getNodeByKey("saved_queries"));
        //util.reloadNode(cat_panel.tree.getNodeByKey("topics"));
    } else {
        var ids = Array.isArray(a_ids) ? a_ids : [a_ids];
        var data = Array.isArray(a_data) ? a_data : [a_data];

        var idx;
        // Find existing ids in tree & graph and update displayed info
        data_tree.visit(function (node) {
            idx = ids.indexOf(node.key);
            if (idx != -1) {
                util.refreshNodeTitle(node, data[idx], a_reload);
            }
        });

        /*cat_panel.tree.visit( function(node){
            idx = ids.indexOf( node.key );
            if ( idx != -1 ){
                util.refreshNodeTitle( node, data[idx], a_reload );
            }
        });*/
    }

    if (query_cur) {
        queryExec(query_cur);
    }

    if (graph_panel.getSubjectID()) {
        if (a_ids && a_data) graph_panel.update(a_ids, a_data);
        else graph_panel.load(graph_panel.getSubjectID(), graph_panel.getSelectedID());
    }

    cat_panel.refreshUI(a_ids, a_data, a_reload);

    var act_node;

    switch (select_source) {
        case SS_TREE:
            act_node = data_tree.activeNode;
            break;
        case SS_CAT:
            //act_node = cat_panel.tree.activeNode;
            break;
        case SS_PROV:
            act_node = graph_panel.getSelectedID();
            break;
    }

    panel_info.showSelectedInfo(act_node);
}

function displayPath_fin(node, item) {
    //console.log("displayPath_fin",node.key);

    var chn,
        ch = node.getChildren();
    for (var c in ch) {
        if (ch[c].key == item) {
            chn = ch[c];
            break;
        }
    }

    if (chn) {
        //console.log("found",chn.key);

        data_tree.selectAll(false);
        selectScope = chn;
        chn.setActive();
        chn.setSelected(true);
    } else {
        //util.setStatusText( "Record not found." );
        util.setStatusText("Not found in 'My Data'", 1);
    }

    //asyncEnd();
}

function displayPath_reload(item, path, idx) {
    //console.log("reload",idx);

    var node = data_tree.getNodeByKey(path[idx].id);
    if (node) {
        $("#data-tabs").tabs({ active: 0 });
        //console.log("reload node",node.key,node.data.offset,",offset",path[idx].off);
        if (node.data.offset == path[idx].off && node.isLoaded()) {
            // Already laoded and on the correct offset
            //console.log("already loaded");
            if (idx == 0) {
                displayPath_fin(node, item);
            } else {
                displayPath_reload(item, path, idx - 1);
            }
        } else {
            node.data.offset = path[idx].off;
            node.load(true).done(function () {
                node.setExpanded(true);
                if (idx == 0) {
                    displayPath_fin(node, item);
                } else {
                    displayPath_reload(item, path, idx - 1);
                }
            });
        }
    } else {
        //asyncEnd();
        util.setStatusText("Not found in 'My Data'", 1);
    }
}

function displayPath(path, item) {
    //console.log("displayPath");

    // Must examine and process paths that lead to projects, or shared data

    if (path[path.length - 1].id.startsWith("c/p_")) {
        var proj_id =
            "p/" + path[path.length - 1].id.substr(4, path[path.length - 1].id.length - 9);
        api.projView(proj_id, function (proj) {
            if (proj) {
                //console.log("proj:",proj,settings.user.uid);
                var uid = "u/" + settings.user.uid;
                path.push({ id: proj_id, off: 0 });
                if (
                    proj.owner == uid ||
                    (proj.admin && proj.admin.indexOf(uid) != -1) ||
                    (proj.member && proj.member.indexOf(uid) != -1)
                ) {
                    path.push({ id: "projects", off: 0 });
                } else {
                    //console.log("list user shares");
                    api.aclByProjectList(proj_id, function (ok, items) {
                        if (ok) {
                            //console.log("shared items:",items);
                            var item_id, idx;
                            for (var i in items.item) {
                                item_id = items.item[i].id;
                                idx = path.findIndex(function (coll) {
                                    return coll.id == item_id;
                                });
                                if (idx != -1) {
                                    //console.log("orig path:",path);
                                    path = path.slice(0, idx + 1);
                                    path.push(
                                        { id: "shared_proj_" + proj_id, off: 0 },
                                        { id: "shared_proj", off: 0 },
                                    );
                                    //console.log("path:",path);
                                    displayPath_reload(item, path, path.length - 1);
                                    //asyncEnd();
                                    return;
                                }
                            }
                        }

                        util.setStatusText("Not found in 'My Data'", 1);
                        //asyncEnd();
                    });

                    return;
                }

                displayPath_reload(item, path, path.length - 1);
            }
        });
    } else if (path[path.length - 1].id.startsWith("c/u_")) {
        var uid = path[path.length - 1].id.substr(4, path[path.length - 1].id.length - 9);
        if (uid == settings.user.uid) {
            displayPath_reload(item, path, path.length - 1);
        } else {
            //console.log("list user shares");
            api.aclByUserList("u/" + uid, function (ok, items) {
                //console.log("aclByUserList:",ok,items);
                if (ok) {
                    var item_id, idx;
                    for (var i in items.item) {
                        item_id = items.item[i].id;
                        idx = path.findIndex(function (coll) {
                            return coll.id == item_id;
                        });
                        if (idx != -1) {
                            //console.log("orig path:",path);
                            path = path.slice(0, idx + 1);
                            path.push(
                                { id: "shared_user_u/" + uid, off: 0 },
                                { id: "shared_user", off: 0 },
                            );
                            //console.log("path:",path);
                            displayPath_reload(item, path, path.length - 1);
                            return;
                        }
                    }
                }

                util.setStatusText("Not found in 'My Data'", 1);
                //asyncEnd();
            });

            return;
        }
    } else {
        displayPath_reload(item, path, path.length - 1);
    }
}

function showParent(which) {
    var ids = getActionableIDs();
    if (ids.length != 1) {
        return;
    }

    var node,
        item_id = ids[0];

    //console.log("go to",item_id);

    if (which != 0) {
        node = data_tree.getActiveNode();
        if (!node || !node.parent) {
            //asyncEnd();
            return;
        }
    }

    api.getParents(item_id, function (ok, data) {
        if (ok) {
            //console.log("get parent OK",data.path);
            if (data.path.length) {
                var i, path;
                var done = 0,
                    err = false;

                if (which == 0 || data.path.length == 1) path = data.path[0].item;
                else {
                    // Figure out which parent path matches current location

                    for (i in data.path) {
                        path = data.path[i].item;
                        //console.log("path:",path);

                        if (path[0].id != node.parent.key) continue;

                        if (which == 1)
                            if (i > 0) i--;
                            else i = data.path.length - 1;
                        else if (i < data.path.length - 1) i++;
                        else i = 0;
                        path = data.path[i].item;
                        break;
                    }
                }

                //console.log("path",path);

                if (!path)
                    // Might happen if displayed tree is stale
                    return;

                for (i = 0; i < path.length; i++) {
                    path[i] = { id: path[i].id, off: null };
                    //console.log("getCollOffset",path[i].id );
                    api.getCollOffset(
                        path[i].id,
                        i > 0 ? path[i - 1].id : item_id,
                        settings.opts.page_sz,
                        i,
                        function (ok, data2, idx) {
                            done++;

                            if (ok) {
                                path[idx].off = data2.offset;
                                if (done == path.length && !err) {
                                    displayPath(path, item_id);
                                }
                            } else if (!err) {
                                util.setStatusText("Get Collections Error: " + data2, 1);
                                err = true;
                            }

                            if (done == path.length && err) {
                                //asyncEnd();
                            }
                        },
                    );
                }
            }
        } else {
            //asyncEnd();
            util.setStatusText("Get Collections Error: " + data, 1);
        }
    });
}

function setLockSelected(a_lock) {
    var ids = getActionableIDs();
    if (ids.length == 0) return;

    api.sendDataLock(ids, a_lock, function (ok, data) {
        if (ok) {
            refreshUI(ids, data.item);
        } else {
            util.setStatusText("Lock Update Failed: " + data, 1);
        }
    });
}

function refreshCollectionNodes(node_keys, scope) {
    // Refresh any collection nodes in data tree and catalog tree
    // Scope is used to narrow search in trees

    // Note: FancyTree does not have an efficient way to get a node by key (just linear search), so
    // instead we will do our own linear search that is more efficient due to branch pruning and early termination

    var refresh = [];
    var i,
        found = false;

    //console.log("REF: search data tree");

    data_tree.visit(function (node) {
        // Ignore nodes without scope (top-level nodes)
        if (node.data.scope !== undefined) {
            if (node.data.scope == scope) {
                if (node_keys.indexOf(node.key) != -1) {
                    refresh.push(node);
                    found = true;
                    return "skip";
                }
            } else if (found) {
                return false;
            } else {
                return "skip";
            }
        }
    });

    for (i in refresh) util.reloadNode(refresh[i]);

    refresh = [];

    for (i in refresh) util.reloadNode(refresh[i]);
}

/*
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
*/

/*
function moveItems( items, dest_node, cb ){
    console.log("moveItems",items,dest_node,pasteSourceParent);

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
}*/

function dataGet(a_ids, a_cb) {
    util.dataGet(a_ids, a_cb);
}

function dataPut(a_id, a_cb) {
    api.dataPutCheck(a_id, function (ok, data) {
        if (ok) {
            //console.log("data put check:",data);
            transferDialog.show(model.TT_DATA_PUT, [data.item], a_cb);
        } else {
            dialogs.dlgAlert("Data Put Error", data);
        }
    });
}

//-------------------------------------------------------------------------
// ACTION FUNCTIONS (UI event handlers)

function actionDeleteSelected() {
    var ids = getActionableIDs();
    if (ids.length == 0) return;

    var data = [],
        coll = [],
        proj = [],
        qry = [];
    for (var i in ids) {
        switch (ids[i].charAt(0)) {
            case "d":
                data.push(ids[i]);
                break;
            case "c":
                coll.push(ids[i]);
                break;
            case "p":
                proj.push(ids[i]);
                break;
            case "q":
                qry.push(ids[i]);
                break;
            default:
                break;
        }
    }

    var msg = "Delete selected items?";
    if (proj.length) {
        msg +=
            " Note that this action will delete all data records and collections contained within selected project(s)";
    } else if (coll.length) {
        msg +=
            " Note that this action will delete data records contained within the selected collection(s) that are not linked elsewhere.";
    }

    dialogs.dlgConfirmChoice("Confirm Deletion", msg, ["Cancel", "Delete"], function (choice) {
        if (choice == 1) {
            var done = 0;
            if (data.length) done++;
            if (coll.length) done++;

            if (data.length) {
                api.sendDataDelete(data, function (ok, data) {
                    if (ok) {
                        if (--done == 0) {
                            refreshUI();
                            resetTaskPoll();
                        }
                    } else dialogs.dlgAlert("Data Delete Error", data);
                });
            }
            if (coll.length) {
                api.collDelete(coll, function (ok, data) {
                    if (ok) {
                        if (--done == 0) {
                            refreshUI();
                            resetTaskPoll();
                        }
                    } else dialogs.dlgAlert("Collection Delete Error", data);
                });
            }
            if (proj.length) {
                api.projDelete(proj, function (ok, data) {
                    if (ok) {
                        util.reloadNode(data_tree.getNodeByKey("projects"));
                        panel_info.showSelectedInfo();
                        resetTaskPoll();
                    } else dialogs.dlgAlert("Project Error", data);
                });
            }
            if (qry.length) {
                api.queryDelete(qry, function (ok, data) {
                    if (ok) {
                        util.reloadNode(data_tree.getNodeByKey("saved_queries"));
                        panel_info.showSelectedInfo();
                    } else dialogs.dlgAlert("Saved Query Delete Error", data);
                });
            }
        }
    });
}

function fileMenu() {
    $("#filemenu").toggle().position({
        my: "left bottom",
        at: "left bottom",
        of: this,
    }); //"fade"); //.focus(); //slideToggle({direction: "up"});
}

function actionNewProj() {
    if (util.checkDlgOpen("p_new_edit")) return;

    dlgProjNewEdit.show(null, 0, function (data) {
        util.setStatusText("Project " + data.id + " created");
        util.reloadNode(data_tree.getNodeByKey("projects"));
    });
}

function actionNewData() {
    if (util.checkDlgOpen("d_new_edit")) return;

    var parent = "root";
    var node = data_tree.activeNode;
    if (node) {
        if (node.key.startsWith("d/") || node.key == "empty") {
            parent = node.parent.key;
        } else if (node.key.startsWith("c/")) {
            parent = node.key;
        } else if (node.key.startsWith("p/")) {
            parent = "c/p_" + node.key.substr(2) + "_root";
        }
    }

    api.checkPerms(parent, model.PERM_CREATE, function (ok, data) {
        if (!ok) {
            dialogs.dlgAlert("Permission Denied", data);
            return;
        }

        if (!data) {
            dialogs.dlgAlertPermDenied();
            return;
        }

        dlgDataNewEdit.show(
            dlgDataNewEdit.DLG_DATA_MODE_NEW,
            null,
            parent,
            0,
            function (data_new, parent_id) {
                resetTaskPoll();
                var node = data_tree.getNodeByKey(parent_id);
                if (node) util.reloadNode(node);
            },
        );
    });
}

function actionDupData() {
    var parent = "root";
    var node = data_tree.activeNode;
    if (node) {
        if (node.key.startsWith("d/")) {
            parent = node.parent.key;
            //console.log("parent",parent);
        }
    }

    api.checkPerms(parent, model.PERM_CREATE, function (ok, data) {
        if (!ok) {
            dialogs.dlgAlert("Permission Denied", data);
            return;
        }

        if (!data) {
            dialogs.dlgAlertPermDenied();
            return;
        }

        api.dataView(node.key, function (data) {
            dlgDataNewEdit.show(
                dlgDataNewEdit.DLG_DATA_MODE_DUP,
                data,
                parent,
                0,
                function (data2, parent_id) {
                    resetTaskPoll();
                    var node = data_tree.getNodeByKey(parent_id);
                    if (node) util.reloadNode(node);
                },
            );
        });
    });
}

function actionNewColl() {
    if (util.checkDlgOpen("c_new_edit")) return;

    var node = data_tree.activeNode;
    var parent = "root";
    if (node) {
        if (node.key.startsWith("d/") || node.key == "empty") {
            parent = node.parent.key;
        } else if (node.key.startsWith("c/")) {
            parent = node.key;
        } else if (node.key.startsWith("p/")) {
            parent = "c/p_" + node.key.substr(2) + "_root";
        }
    }

    api.checkPerms(parent, model.PERM_CREATE, function (ok, data) {
        if (!ok) {
            dialogs.dlgAlert("Permission Denied", data);
            return;
        }

        if (!data) {
            dialogs.dlgAlertPermDenied();
            return;
        }

        dlgCollNewEdit.show(null, parent, 0, function (data_new) {
            var node = data_tree.getNodeByKey(data_new.parentId);
            if (node) util.reloadNode(node);
        });
    });
}

function actionImportData(files) {
    var coll_id;

    if (!update_files && !import_direct) {
        var node = data_tree.activeNode;

        if (!node) {
            //asyncEnd();
            return;
        }

        if (node.key.startsWith("d/")) {
            coll_id = node.parent.key;
        } else if (node.key.startsWith("c/")) {
            coll_id = node.key;
        } else if (node.key.startsWith("p/")) {
            coll_id = "c/p_" + node.key.substr(2) + "_root";
        } else {
            //asyncEnd();
            return;
        }
    }

    // Read file contents into a single payload for atomic validation and processing
    var file,
        tot_size = 0;

    for (var i = 0; i < files.length; i++) {
        file = files[i];
        //console.log("size:",file.size,typeof file.size);
        if (file.size == 0) {
            dialogs.dlgAlert("Import Error", "File " + file.name + " is empty.");
            //asyncEnd();
            return;
        }
        if (file.size > model.MD_MAX_SIZE) {
            dialogs.dlgAlert(
                "Import Error",
                "File " +
                    file.name +
                    " size (" +
                    util.sizeToString(file.size) +
                    ") exceeds metadata size limit of " +
                    util.sizeToString(model.MD_MAX_SIZE) +
                    ".",
            );
            //asyncEnd();
            return;
        }
        tot_size += file.size;
    }

    if (tot_size > model.PAYLOAD_MAX_SIZE) {
        dialogs.dlgAlert(
            "Import Error",
            "Total import size (" +
                util.sizeToString(tot_size) +
                ") exceeds server limit of " +
                util.sizeToString(model.PAYLOAD_MAX_SIZE) +
                ".",
        );
        //asyncEnd();
        return;
    }

    // Read file content and verify JSON format (must be {...})
    var count = 0,
        payload = [];
    var reader = new FileReader();

    reader.onload = function (e) {
        //console.log("files onload");
        try {
            var obj = JSON.parse(e.target.result);
            var rec_count = 0;

            if (obj instanceof Array) {
                for (var i in obj) {
                    if (!update_files && !import_direct) obj[i].parent = coll_id;
                    payload.push(obj[i]);
                }
                rec_count += obj.length;
            } else {
                if (!update_files && !import_direct) obj.parent = coll_id;
                payload.push(obj);
                rec_count++;
            }

            count++;
            if (count == files.length) {
                //console.log("Done reading all files", payload );
                if (update_files) {
                    api.dataUpdateBatch(JSON.stringify(payload), function (ok, data) {
                        if (ok) {
                            refreshUI();
                            util.setStatusText(
                                "Updated " + rec_count + " record" + (rec_count > 1 ? "s" : ""),
                            );
                        } else {
                            dialogs.dlgAlert("Update Error", data);
                        }
                        //asyncEnd();
                    });
                } else {
                    api.dataCreateBatch(JSON.stringify(payload), function (ok, data) {
                        if (ok) {
                            util.setStatusText(
                                "Imported " + rec_count + " record" + (rec_count > 1 ? "s" : ""),
                            );
                            if (import_direct) {
                                refreshUI();
                            } else {
                                var node = data_tree.getNodeByKey(coll_id);
                                if (node) util.reloadNode(node);
                            }
                        } else {
                            dialogs.dlgAlert("Import Error", data);
                        }
                        //asyncEnd();
                    });
                }
            } else {
                reader.readAsText(files[count], "UTF-8");
            }
        } catch (e) {
            //asyncEnd();
            dialogs.dlgAlert("Import Error", "Invalid JSON in file " + files[count].name);
            return;
        }
    };

    reader.onerror = function (e) {
        dialogs.dlgAlert("Import Error", "Error reading file: " + files[count].name);
    };

    reader.onabort = function (e) {
        dialogs.dlgAlert("Import Error", "Import aborted");
    };

    reader.readAsText(files[count], "UTF-8");
}

function actionFirstParent() {
    showParent(0);
}

function actionPrevParent() {
    showParent(1);
}

function actionNextParent() {
    showParent(2);
}

function actionLockSelected() {
    setLockSelected(true);
}

function actionUnlockSelected() {
    setLockSelected(false);
}

function actionCutSelected() {
    console.log("actionCutSelected");

    pasteItems = data_tree.getSelectedNodes();
    pasteSourceParent = pasteItems[0].parent;
    move_mode = 1;
    pasteCollections = [];
    for (var i in pasteItems) {
        if (pasteItems[i].key.startsWith("c/")) pasteCollections.push(pasteItems[i]);
    }
    //console.log("cutSelected",pasteItems,pasteSourceParent);
}

function actionCopySelected() {
    console.log("actionCopySelected");

    if (select_source == SS_TREE) pasteItems = data_tree.getSelectedNodes();
    else return;

    pasteSourceParent = pasteItems[0].parent;
    move_mode = 0;
    pasteCollections = [];
    for (var i in pasteItems) {
        if (pasteItems[i].key.startsWith("c/")) pasteCollections.push(pasteItems[i]);
    }
}

function actionPasteSelected() {
    console.log("actionPasteSelected");

    handlePasteItems(data_tree.activeNode);
}

function handlePasteItems(a_dest_node) {
    console.log("handlePasteItems");

    if (!pasteSourceParent || !pasteSourceParent.data) return;

    drag_enabled = false;

    var i,
        proj_id,
        ids = [];

    if (pasteSourceParent.data.scope != a_dest_node.data.scope) {
        console.log("Change owner");
        var coll_id =
            a_dest_node.key == "empty" || a_dest_node.key.startsWith("d/")
                ? a_dest_node.parent.key
                : a_dest_node.key;
        proj_id =
            pasteSourceParent.data.scope.charAt(0) == "p" ? pasteSourceParent.data.scope : null;

        for (i in pasteItems) {
            ids.push(pasteItems[i].key);
        }

        api.dataOwnerChange(ids, coll_id, null, proj_id, true, function (ok, reply) {
            //console.log("chg owner reply:",ok,reply);
            if (ok) {
                dlgOwnerChangeConfirm.show(
                    pasteSourceParent.data.scope,
                    a_dest_node.data.scope,
                    reply,
                    function (repo) {
                        //console.log("chg owner conf:", repo );
                        api.dataOwnerChange(
                            ids,
                            coll_id,
                            repo,
                            proj_id,
                            false,
                            function (ok, reply) {
                                if (ok) {
                                    //console.log("reply:", reply );
                                    resetTaskPoll();
                                    dialogs.dlgAlert(
                                        "Change Record Owner",
                                        "Task " +
                                            reply.task.id.substr(5) +
                                            " created to transfer data records to new owner.",
                                    );
                                } else {
                                    dialogs.dlgAlert("Change Record Owner Error", reply);
                                }
                            },
                        );
                    },
                );
            } else {
                dialogs.dlgAlert("Change Record Owner Error", reply);
            }
            drag_enabled = true;
        });
        return;
    } else if (a_dest_node.key.startsWith("repo/") || a_dest_node.parent.key.startsWith("repo/")) {
        console.log("Change alloc");

        var key = a_dest_node.key.startsWith("repo/") ? a_dest_node.key : a_dest_node.parent.key;
        var idx = key.indexOf("/", 5);
        var repo_id = key.substr(0, idx);
        proj_id =
            pasteSourceParent.data.scope.charAt(0) == "p" ? pasteSourceParent.data.scope : null;

        for (i in pasteItems) {
            ids.push(pasteItems[i].key);
        }

        api.dataAllocChange(ids, repo_id, proj_id, true, function (ok, reply) {
            if (ok) {
                if (reply.totCnt == 0) {
                    dialogs.dlgAlert(
                        "Change Record Allocation Error",
                        "No data records contained in selection.",
                    );
                } else if (reply.actCnt == 0) {
                    dialogs.dlgAlert(
                        "Change Record Allocation Error",
                        "All selected data records already use allocation on '" + repo_id + "'",
                    );
                } else {
                    dialogs.dlgConfirmChoice(
                        "Confirm Change Record Allocation",
                        "This operation will transfer " +
                            reply.actCnt +
                            " record(s) (out of " +
                            reply.totCnt +
                            " selected) with " +
                            util.sizeToString(reply.actSize) +
                            " of raw data to allocation on '" +
                            repo_id +
                            "'. Current allocation usage is " +
                            util.sizeToString(reply.dataSize) +
                            " out of " +
                            util.sizeToString(reply.dataLimit) +
                            " available and " +
                            reply.recCount +
                            " record(s) out of " +
                            reply.recLimit +
                            " available. Pending transfers may alter the amount of space available on target allocation.",
                        ["Cancel", "Confirm"],
                        function (choice) {
                            if (choice == 1) {
                                api.dataAllocChange(
                                    ids,
                                    repo_id,
                                    proj_id,
                                    false,
                                    function (ok, reply) {
                                        if (ok) {
                                            resetTaskPoll();
                                            dialogs.dlgAlert(
                                                "Change Record Allocation",
                                                "Task " +
                                                    reply.task.id.substr(5) +
                                                    " created to move data records to new allocation.",
                                            );
                                        } else {
                                            dialogs.dlgAlert(
                                                "Change Record Allocation Error",
                                                reply,
                                            );
                                        }
                                    },
                                );
                            }
                        },
                    );
                }
                drag_enabled = true;
            } else {
                dialogs.dlgAlert("Change Record Allocation Error", reply);
                drag_enabled = true;
            }
        });
        return;
    } else {
        if (a_dest_node.key.startsWith("d/")) {
            a_dest_node = a_dest_node.parent;
        } else if (a_dest_node.key == "empty") {
            a_dest_node = a_dest_node.parent;
        }

        var item_keys = [];
        for (var i in pasteItems) item_keys.push(pasteItems[i].key);

        pasteItems = [];
        pasteCollections = null;

        if (move_mode) {
            console.log("move items");

            api.colMoveItems(item_keys, pasteSourceParent.key, a_dest_node.key, function (ok, msg) {
                if (ok) {
                    refreshCollectionNodes(
                        [pasteSourceParent.key, a_dest_node.key],
                        a_dest_node.data.scope,
                    );
                } else {
                    dialogs.dlgAlert("Move Error", msg);
                    //util.setStatusText( "Move Error: " + msg, 1 );
                }

                pasteSourceParent = null;
                drag_enabled = true;
            });
        } else {
            console.log("copy/link items");

            api.linkItems(item_keys, a_dest_node.key, function (ok, msg) {
                if (ok) {
                    refreshCollectionNodes(
                        [pasteSourceParent.key, a_dest_node.key],
                        a_dest_node.data.scope,
                    );
                } else {
                    dialogs.dlgAlert("Copy Error", msg);
                    //util.setStatusText( "Copy Error: " + msg, 1 );
                }

                pasteSourceParent = null;
                drag_enabled = true;
            });
        }
    }
}

function actionUnlinkSelected() {
    var sel = data_tree.getSelectedNodes();
    if (sel.length) {
        var scope = sel[0].data.scope;
        var items = [];
        for (var i in sel) {
            items.push(sel[i].key);
        }
        //console.log("items:",items);
        api.unlinkItems(items, sel[0].parent.key, function (ok, data) {
            if (ok) {
                if (data.item && data.item.length) {
                    var loc_root = "c/" + scope.charAt(0) + "_" + scope.substr(2) + "_root";
                    refreshCollectionNodes([loc_root, sel[0].parent.key], sel[0].parent.data.scope);
                } else {
                    refreshCollectionNodes([sel[0].parent.key], sel[0].parent.data.scope);
                }
            } else {
                dialogs.dlgAlert("Unlink Error", data);
            }
        });
    }
}

function permGateAny(item_id, req_perms, cb) {
    api.getPerms(item_id, req_perms, function (perms) {
        if ((perms & req_perms) == 0) {
            util.setStatusText("Permission Denied.", 1);
        } else {
            //console.log("have perms:",perms);
            cb(perms);
        }
    });
}

function actionEditSelected() {
    //if ( async_guard )
    //    return;

    var ids = getActionableIDs();

    if (ids.length != 1) return;

    var id = ids[0];

    if (util.checkDlgOpen(id + "_edit")) return;

    switch (id.charAt(0)) {
        case "p":
            permGateAny(id, model.PERM_WR_REC | model.PERM_SHARE, function (perms) {
                api.projView(id, function (data) {
                    if (data) {
                        dlgProjNewEdit.show(data, perms, function (data) {
                            refreshUI(id, data);
                        });
                    }
                });
            });
            break;
        case "c":
            permGateAny(id, model.PERM_WR_REC | model.PERM_SHARE, function (perms) {
                api.collView(id, function (data) {
                    if (data) {
                        dlgCollNewEdit.show(data, null, perms, function (data) {
                            //refreshUI( id, data );
                        });
                    }
                });
            });
            break;
        case "d":
            permGateAny(
                id,
                model.PERM_WR_REC | model.PERM_WR_META | model.PERM_WR_DATA,
                function (perms) {
                    api.dataView(id, function (data) {
                        dlgDataNewEdit.show(
                            dlgDataNewEdit.DLG_DATA_MODE_EDIT,
                            data,
                            null,
                            perms,
                            function (data) {
                                // TODO - Only do this if raw data source is changed
                                resetTaskPoll();
                            },
                        );
                    });
                },
            );
            break;
        case "q":
            api.queryView(id, function (ok, data) {
                if (ok) {
                    if (!searchMode) {
                        setSearchMode(true);
                    }
                    query_id = data.id;
                    query_title = data.title;
                    search_panel.setQuery(data.query);
                } else {
                    util.setStatusText("Saved Query Edit Error: " + data, 1);
                }
            });
            return;
        default:
            return;
    }
}

function actionShareSelected() {
    var ids = getActionableIDs();
    if (ids.length != 1) return;

    var id = ids[0];

    api.checkPerms(id, model.PERM_SHARE, function (ok, data) {
        if (!ok) {
            dialogs.dlgAlert("Permission Denied", data);
            return;
        }

        if (!data) {
            dialogs.dlgAlertPermDenied();
            return;
        }

        if (id.charAt(0) == "c") {
            api.collView(id, function (coll) {
                if (coll) dlgSetACLs.show(coll);
            });
        } else {
            api.dataView(id, function (data) {
                dlgSetACLs.show(data);
            });
        }
    });
}

function actionDepGraph() {
    var ids = getActionableIDs();
    if (ids.length != 1) return;

    var id = ids[0];

    if (id.charAt(0) == "d") {
        graph_panel.load(id);
        $('[href="#tab-prov-graph"]').closest("li").show();
        $("#data-tabs").tabs({ active: 3 });
    }
}

function actionRefresh() {
    var sel = getSelectedNodes();

    if (sel.length == 1) {
        var node = sel[0];
        if (node.isLazy()) {
            util.reloadNode(node);
        } else if (node.parent.isLazy()) {
            var par = node.parent;
            util.reloadNode(par, function () {
                var new_node = par.findFirst(function (n) {
                    if (n.key == node.key) return true;
                });
                if (new_node) {
                    new_node.setActive();
                    new_node.setSelected();
                } else {
                    par.setActive();
                    par.setSelected();
                }
            });
        }
    }
}

function actionAnnotate() {
    var ids = getActionableIDs();
    if (ids.length != 1) return;

    var id = ids[0];

    permGateAny(id, model.PERM_RD_REC | model.PERM_RD_META | model.PERM_RD_DATA, function (perms) {
        dlgAnnotation.show(id, null, null, null, function () {
            panel_info.showSelectedInfo(id, function (data) {
                // TODO Should rely on model.update here
                //console.log("ann data",data);
                refreshUI(id, data);
            });
        });
    });
}

function actionDataGet() {
    var ids = getActionableIDs();
    dataGet(ids, function () {
        resetTaskPoll();
    });
}

function actionDataPut() {
    var ids = getActionableIDs();
    if (ids.length != 1) return;

    var id = ids[0];

    if (id.charAt(0) == "d") {
        dataPut(id, function () {
            resetTaskPoll();
        });
    }
}

/*function actionReloadSelected(){
    var node;

    if ( select_source == SS_TREE ){
        node = data_tree.activeNode;
        if ( node ){
            reloadNode( node );
        }
    } else if ( select_source == SS_CAT ){
        node = cat_panel.tree.activeNode;
        if ( node ){
            reloadNode( node );
        }
    }
}*/

function actionSchemaList() {
    if (util.checkDlgOpen("dlg_schema_list")) return;

    dlgSchemaList.show();
}

function calcActionState(sel) {
    var bits, node;

    //console.log("calcActionState",sel);

    if (!sel) {
        bits = 0x7ff;
    } else if (sel.length > 1) {
        bits = 0x71b;
        for (var i in sel) {
            node = sel[i];
            switch (node.key[0]) {
                case "c":
                    bits |= node.data.isroot ? 0xd7 : 0x52;
                    break;
                case "d":
                    bits |= 0x00;
                    break;
                case "r":
                    bits |= 0x5f7;
                    break;
                case "p":
                    bits |= 0x5fa;
                    if (node.data.mgr) bits |= 4;
                    else if (!node.data.admin) bits |= 5;
                    break;
                case "q":
                    bits |= 0x5f9;
                    break;
                default:
                    bits |= 0x5ff;
                    break;
            }
        }

        //console.log("multi",bits);
    } else if (sel.length) {
        node = sel[0];

        switch (node.key.charAt(0)) {
            //case "c": bits = node.data.isroot?0x2F7:0x272;  break;
            case "c":
                bits = node.data.isroot ? 0x2d7 : 0x252;
                break;
            case "d":
                if (node.parent && node.parent.key.startsWith("c/")) bits = 0x00;
                else bits = 0x102;
                if (node.data.external) bits |= 0x10;
                if (!node.data.size) bits |= 0x20;
                break;
            case "p":
                bits = 0x7fa;
                if (node.data.mgr) bits |= 4;
                else if (!node.data.admin) bits |= 5;
                break;
            case "q":
                bits = 0x7fa;
                break;
            default:
                if (node.key == "empty" && node.parent.key.startsWith("c/")) bits = 0x6ff;
                else bits = 0x7ff;
                break;
        }
        //console.log("single",bits);
    } else {
        bits = 0x7ff;
    }

    return bits;
}

// Exported for sub-panels
export function updateBtnState() {
    //console.log("updateBtnState");

    var bits, sel;
    switch (select_source) {
        case SS_TREE:
            /*if ( searchMode ){
                sel = [data_tree.getActiveNode()];
            }else{*/
            sel = data_tree.getSelectedNodes();
            //}
            //console.log("sel:",sel);

            bits = calcActionState(sel);
            break;
        case SS_CAT:
            sel = cat_panel.getSelectedNodes();
            bits = calcActionState(sel);
            break;
        case SS_PROV:
            bits = calcActionState(graph_panel.getSelectedNodes());
            break;
    }

    //console.log("updateBtnState, bits:", bits );

    $("#btn_edit", frame).button("option", "disabled", (bits & 1) != 0);
    $("#btn_dup_data", frame).button("option", "disabled", (bits & 2) != 0);
    $("#btn_del", frame).button("option", "disabled", (bits & 4) != 0);
    $("#btn_share", frame).button("option", "disabled", (bits & 8) != 0);
    $("#btn_upload", frame).button("option", "disabled", (bits & 0x10) != 0);
    $("#btn_download", frame).button("option", "disabled", (bits & 0x20) != 0);
    $("#btn_lock", frame).button("option", "disabled", (bits & 0x40) != 0);
    $("#btn_unlock", frame).button("option", "disabled", (bits & 0x40) != 0);
    $("#btn_new_data", frame).button("option", "disabled", (bits & 0x100) != 0);
    //$("#btn_import_data",frame).button("option","disabled",(bits & 0x100) != 0 );
    $("#btn_new_coll", frame).button("option", "disabled", (bits & 0x100) != 0);
    //$("#btn_unlink",frame).button("option","disabled",(bits & 0x80) != 0);
    $("#btn_dep_graph", frame).button("option", "disabled", (bits & 0x200) != 0);
    $("#btn_prev_coll", frame).button("option", "disabled", (bits & 0x200) != 0);
    $("#btn_next_coll", frame).button("option", "disabled", (bits & 0x200) != 0);
    $("#btn_srch_first_par_coll", frame).button("option", "disabled", (bits & 0x200) != 0);
    $("#btn_cat_first_par_coll", frame).button("option", "disabled", (bits & 0x200) != 0);
    $("#btn_annotate", frame).button("option", "disabled", (bits & 0x400) != 0);

    // Enable/disable file import/export menu items (by position, not name)

    // Export selected (only collections or records selected)
    if (bits & 0x400) $("#filemenu li:nth-child(4)").addClass("ui-state-disabled");
    else $("#filemenu li:nth-child(4)").removeClass("ui-state-disabled");

    // Import to collection
    if (bits & 0x100) $("#filemenu li:nth-child(1)").addClass("ui-state-disabled");
    else $("#filemenu li:nth-child(1)").removeClass("ui-state-disabled");

    data_tree_div.contextmenu("enableEntry", "edit", (bits & 1) == 0);
    //data_tree_div.contextmenu("enableEntry", "dup", (bits & 2) == 0 );
    data_tree_div.contextmenu("enableEntry", "del", (bits & 4) == 0);
    data_tree_div.contextmenu("enableEntry", "share", (bits & 8) == 0);
    data_tree_div.contextmenu("enableEntry", "put", (bits & 0x10) == 0);
    data_tree_div.contextmenu("enableEntry", "get", (bits & 0x20) == 0);
    data_tree_div.contextmenu("enableEntry", "move", (bits & 0x20) == 0);
    data_tree_div.contextmenu("enableEntry", "lock", (bits & 0x40) == 0);
    data_tree_div.contextmenu("enableEntry", "unlock", (bits & 0x40) == 0);
    data_tree_div.contextmenu("enableEntry", "unlink", (bits & 0x80) == 0);
    data_tree_div.contextmenu("enableEntry", "newd", (bits & 0x100) == 0);
    data_tree_div.contextmenu("enableEntry", "newc", (bits & 0x100) == 0);
    data_tree_div.contextmenu("enableEntry", "graph", (bits & 0x200) == 0);
    data_tree_div.contextmenu("enableEntry", "sub", (bits & 0x400) == 0);
    data_tree_div.contextmenu("enableEntry", "note", (bits & 0x400) == 0);
}

function setSearchMode(enabled) {
    if (enabled) {
        searchMode = true;
        //search_panel.setSearchSelect( searchSelect );
        $("#search_panel", frame).show();
        //$(data_tree_div).fancytree("option","checkbox",true);
    } else {
        searchMode = false;
        //search_panel.setSearchSelect();
        $("#search_panel", frame).hide();
        //$(data_tree_div).fancytree("option","checkbox",false);
    }
}

function handleQueryResults(data) {
    //console.log("handleQueryResults",data);

    // Find results node in data tree
    var results_node = data_tree.getNodeByKey("search_results");
    if (!results_node) {
        results_node = data_tree.getRootNode().addChildren({
            title: "Search Results",
            checkbox: false,
            folder: true,
            icon: "ui-icon ui-icon-zoom",
            nodrag: true,
            key: "search_results",
            children: [],
        });
    }

    var i,
        results = [];
    if (data.item && data.item.length > 0) {
        util.setStatusText(
            "Found " + data.item.length + " result" + (data.item.length == 1 ? "" : "s"),
        );

        if (data.offset > 0 || data.total > data.offset + data.count) {
            var page_mx = Math.ceil(data.total / settings.opts.page_sz) - 1,
                page = Math.floor(data.offset / settings.opts.page_sz);

            results.push({
                title:
                    "<button class='btn btn-icon-tiny srch-pg-first''" +
                    (page == 0 ? " disabled" : "") +
                    "><span class='ui-icon ui-icon-triangle-1-w-stop'></span></button> \
                <button class='btn btn-icon-tiny srch-pg-prev'" +
                    (page == 0 ? " disabled" : "") +
                    "><span class='ui-icon ui-icon-triangle-1-w'></span></button> \
                Page " +
                    (page + 1) +
                    " of " +
                    (page_mx + 1) +
                    " <button class='btn btn-icon-tiny srch-pg-next'" +
                    (page >= page_mx ? " disabled" : "") +
                    "><span class='ui-icon ui-icon-triangle-1-e'></span></button>",
                folder: false,
                icon: false,
                checkbox: false,
                hasBtn: true,
            });
        }

        for (i in data.item) {
            var item = data.item[i];
            // Results can be data records and/or collections
            if (item.id[0] == "c") {
                results.push({
                    title: util.generateTitle(item, false, true),
                    _title: item.title,
                    folder: true,
                    lazy: true,
                    scope: item.owner,
                    key: item.id,
                    offset: 0,
                    nodrag: true,
                });
            } else {
                results.push({
                    title: util.generateTitle(item, false, true),
                    icon: util.getDataIcon(item),
                    key: item.id,
                    nodrag: false,
                    notarg: true,
                    checkbox: false,
                    scope: item.owner,
                    size: item.size,
                    external: item.external,
                    nodrag: true,
                });
            }
        }
    } else {
        util.setStatusText("No results found");
        results.push({
            title: "(no results)",
            icon: false,
            checkbox: false,
            nodrag: true,
            notarg: true,
        });
    }

    //results_node.removeChildren();
    var ch = results_node.getChildren();
    results_node.addChildren(results);
    for (i in ch) {
        ch[i].remove();
    }
    if (!results_node.isExpanded()) {
        results_node.setExpanded();
    }

    if (data.item && data.item.length > 0) {
        results_node.makeVisible();
    }
}

// Get selected nodes and return as a subtree
// Filter-out nodes that cannot be searched
export function searchPanel_GetSelection() {
    //console.log( "searchPanel_GetSelection" );

    var res,
        j,
        n,
        owner,
        par,
        ch,
        sel = data_tree.getSelectedNodes();

    for (var i in sel) {
        n = sel[i];
        // Only allow collections, projects, mydata, shared project & user collections
        // If personal root collection is specified, convert to "my data" scope
        // If a project root collection is specified, convert to project scope

        par = n.getParentList(false, true);

        if (n.key == "mydata") {
            owner = null;
        } else if (n.key.startsWith("p/")) {
            owner = n.key;
        } else if (n.key.startsWith("shared_user_")) {
            owner = n.key.substr(12);
        } else if (n.key.startsWith("shared_proj_")) {
            owner = n.key.substr(12);
        } else if (n.key.startsWith("c/")) {
            if (n.data.scope == "u/" + settings.user.uid) {
                owner = null;
            } else if (n.data.scope.startsWith("u/") || n.data.scope.startsWith("p/")) {
                owner = n.data.scope;
            } else {
                // Might be a search result?
                continue;
            }
        } else {
            // Invalid selections
            continue;
        }

        if (!res || res.owner != owner) {
            res = { owner: owner, ch: {} };
        }

        // If leaf node is root, prune it (search all of user/project instead)
        if (par[par.length - 1].data.isroot) {
            par.pop();
        }

        ch = res.ch;
        for (j in par) {
            n = par[j];
            if (!(n.key in ch)) {
                ch[n.key] = { _title: n.data._title ? n.data._title : n.title, ch: {} };
            }

            ch = ch[n.key].ch;
        }
    }

    return res;
}

// ----- Run query button -----

$("#srch_run_btn", frame).on("click", function () {
    var query = search_panel.getQuery();
    searchPanel_Run(query);
});

export function searchPanel_Run(query) {
    console.log("searchPanel_Run", query);

    if (query.owner === undefined || query.empty) {
        handleQueryResults([]);
        $("#srch_save_btn,#srch_run_btn", frame).button("option", "disabled", true);
        return;
    }

    // Add offset/count
    query.offset = 0;
    query.count = settings.opts.page_sz;

    queryExec(query);
    data_tree.getNodeByKey("saved_queries");
    $("#srch_save_btn,#srch_run_btn", frame).button("option", "disabled", false);
}

// ----- Save query button -----

$("#srch_save_btn", frame).on("click", function () {
    searchPanel_Save();
});

export function searchPanel_Save() {
    var query = search_panel.getQuery();

    if (query.empty) {
        util.setStatusText("Cannot save query - no search terms.", true);
        return;
    }

    //queryCalcScope( query );

    if (query.owner === undefined) {
        dialogs.dlgAlert("Save Query", "Cannot save query - invalid search selection.");
        return;
    }

    dlgQuerySave.show(query, query_id, query_title, function (title, update) {
        if (update) {
            api.queryUpdate(query_id, title, query, function (ok, data) {
                if (ok) {
                    util.reloadNode(data_tree.getNodeByKey("saved_queries"));
                    query_id = null;
                    query_title = null;
                } else {
                    util.setStatusText("Query Save Error: " + data, 1);
                }
            });
        } else {
            api.queryCreate(title, query, function (ok, data) {
                if (ok) {
                    util.reloadNode(data_tree.getNodeByKey("saved_queries"));
                    query_id = null;
                    query_title = null;
                } else {
                    util.setStatusText("Query Save Error: " + data, 1);
                }
            });
        }
    });
}

function queryExec(query) {
    util.setStatusText("Executing search query...");
    api.dataSearch(query, function (ok, data) {
        if (ok) {
            // Set this query as current for refresh
            query_cur = query;
            handleQueryResults(data);
        } else {
            dialogs.dlgAlert("Query Error", data);
        }
    });
}

function taskUpdateHistory(task_list) {
    var len = task_list.length;
    var html;
    if (len == 0) {
        html = "(no recent server tasks)";
    } else {
        html =
            "<table class='task-table'><tr><th>Task ID</th><th>Type</th><th>Created</th><th>Updated</th><th>Status</th></tr>";
        var task,
            time = new Date(0);

        for (var i in task_list) {
            task = task_list[i];

            html +=
                "<tr style='font-size:.9em' class='task-row' id='" +
                task.id +
                "'><td>" +
                task.id.substr(5) +
                "</td><td style='white-space: nowrap'>";
            html += model.TaskTypeLabel[task.type];

            time.setTime(task.ct * 1000);
            html +=
                "</td><td style='white-space: nowrap'>" +
                time.toLocaleDateString("en-US", settings.date_opts);

            time.setTime(task.ut * 1000);
            html +=
                "</td><td style='white-space: nowrap'>" +
                time.toLocaleDateString("en-US", settings.date_opts);

            html += "</td><td style='width:99%'>";
            switch (task.status) {
                case "TS_BLOCKED":
                    html += "QUEUED";
                    break;
                case "TS_READY":
                    html += "READY";
                    break;
                case "TS_RUNNING":
                    html += "RUNNING (" + Math.floor((100 * task.step) / task.steps) + "%)";
                    break;
                case "TS_SUCCEEDED":
                    html += "<span class='task-succeeded'>SUCCEEDED</span>";
                    break;
                case "TS_FAILED":
                    html += "<span class='task-failed'>FAILED</span> - " + task.msg;
                    break;
            }

            html += "</td></tr>";
        }
        html += "</table>";
    }
    task_hist.html(html);

    $(".task-row", task_hist)
        .on("click", function (ev) {
            panel_info.showSelectedInfo(ev.currentTarget.id);
        })
        .hover(
            function () {
                $(this).addClass("my-fancytree-hover");
            },
            function () {
                $(this).removeClass("my-fancytree-hover");
            },
        );
}

function taskHistoryPoll() {
    //console.log("taskHistoryPoll",pollSince);

    if (!settings.user) return;

    api._asyncGet(api.taskList_url(pollSince * 2), null, function (ok, data) {
        if (ok && data) {
            //console.log( "task list:",ok,data);
            if (data.task && data.task.length) {
                // Find and remove any previous entries
                var task;
                for (var i in data.task) {
                    task = data.task[i];
                    for (var j in taskHist) {
                        if (taskHist[j].id == task.id) {
                            taskHist.splice(j, 1);
                            break;
                        }
                    }
                }
                taskHist = data.task.concat(taskHist);
                // Truncate history to limit memory use
                if (taskHist.length > 500) taskHist = taskHist.slice(0, 500);

                taskUpdateHistory(taskHist);
                pollSince = 0;
            }
        }

        // Poll period after initial scan should run at slowest rate
        // If a transfer is started or detected, poll will drop to min period
        if (pollSince == 0) pollSince = pollMin;
        else if (pollSince < pollMax) pollSince *= 2;
        else pollSince = pollMax;

        //console.log( "poll per:",pollSince);

        taskTimer = setTimeout(taskHistoryPoll, 1000 * pollSince);
    });
}

function resetTaskPoll() {
    pollSince = 0;
    clearTimeout(taskTimer);
    taskTimer = setTimeout(taskHistoryPoll, 1000);
}

function setupRepoTab() {
    api.repoList(true, false, function (ok, data) {
        if (ok) {
            var html;

            if (data && data.length) {
                html =
                    "<table class='info_table'><tr><th>Repo ID</th><th>Title</th><th>Address</th><th>Capacity</th><th>Path</th></tr>";
                var repo;
                for (var i in data) {
                    repo = data[i];
                    html +=
                        "<tr><td>" +
                        repo.id.substr(5) +
                        "</td><td>" +
                        util.escapeHTML(repo.title) +
                        "</td><td>" +
                        util.escapeHTML(repo.address) +
                        "</td><td>" +
                        util.sizeToString(repo.capacity) +
                        "</td><td>" +
                        util.escapeHTML(repo.path) +
                        "</td><td><button class='btn small repo_adm' repo='" +
                        repo.id +
                        "'>Admin</button></td></tr>";
                }
                html += "</table>";
            } else {
                html = "No administered repositories";
            }

            $("#repo_list").html(html);
            $(".btn", "#repo_list").button();
            $(".repo_adm", "#repo_list").click(function (ev) {
                dlgRepoEdit.show($(this).attr("repo"), function () {
                    setupRepoTab();
                });
            });
        }
    });
}

// Only called for data tree nodes
function treeSelectNode(a_node, a_toggle) {
    if (a_node.parent != selectScope.parent || a_node.data.scope != selectScope.data.scope) {
        util.setStatusText("Cannot select across collections or categories", 1);
        return;
    }

    if (a_toggle) {
        if (a_node.isSelected()) {
            a_node.setSelected(false);
        } else {
            a_node.setSelected(true);
        }
    } else {
        a_node.setSelected(true);
    }
}

function treeSelectRange(a_tree, a_node) {
    if (a_node.parent != selectScope.parent || a_node.data.scope != selectScope.data.scope) {
        util.setStatusText("Cannot select across collections or categories", 1);
        return;
    }

    var act_node = a_tree.activeNode;
    if (act_node) {
        var parent = act_node.parent;
        if (parent == a_node.parent) {
            var n,
                sel = false;
            for (var i in parent.children) {
                n = parent.children[i];
                if (sel) {
                    n.setSelected(true);
                    if (n.key == act_node.key || n.key == a_node.key) break;
                } else {
                    if (n.key == act_node.key || n.key == a_node.key) {
                        n.setSelected(true);
                        sel = true;
                    }
                }
            }
        } else {
            util.setStatusText("Range select only supported within a single collection.", 1);
        }
    }
}

/**
 * @function
 * Check if pasting is allowed to the specified node.
 *
 * This function checks whether a paste operation is allowed based on various conditions,
 * such as whether the destination node is valid, whether the source and destination nodes
 * belong to the same scope, and other restrictions like node types and parent-child relationships.
 *
 * @param {object} dest_node - The candidate destination node where the paste operation is being attempted.
 * @param {object} src_node - The node being dragged or copied to the destination.
 *
 * @returns {string|boolean} Returns "over" if the paste is allowed, otherwise returns `false`.
 *
 * There is additional source information in the pasteSourceParent and pasteCollections variables.
 */
function pasteAllowed(dest_node, src_node) {
    //console.log("pasteAllowed:",dest_node, src_node);
    console.log("pasteAllowed?");

    if (!dest_node.data.notarg && dest_node.data.scope) {
        // Prevent pasting to self or across scopes or from other trees
        if (!pasteSourceParent || pasteSourceParent.key == dest_node.key) {
            //console.log("no 1",pasteSourceParent,pasteSourceParent.key,dest_node.key);
            return false;
        }

        // Different scopes requires destination or destination parent to be a collection
        if (dest_node.data.scope != src_node.data.scope) {
            if (!(dest_node.key.startsWith("c/") || dest_node.parent.key.startsWith("c/"))) {
                //console.log("no 2");
                return false;
            }
        } else {
            if (dest_node.key.startsWith("d/") || dest_node.key == "empty") {
                if (
                    pasteSourceParent.key == dest_node.parent.key ||
                    !(
                        dest_node.parent.key.startsWith("c/") ||
                        dest_node.parent.key.startsWith("repo/")
                    )
                ) {
                    //console.log("no 3",pasteSourceParent.key, dest_node.parent.key);
                    return false;
                }
            }

            if (pasteCollections.length) {
                var i,
                    j,
                    coll,
                    dest_par = dest_node.getParentList(false, true);
                // Prevent collection reentrancy
                // Fancytree handles this when one item selected, must check for multiple items
                if (pasteCollections.length > 1) {
                    for (i in pasteCollections) {
                        coll = pasteCollections[i];
                        for (j in dest_par) {
                            if (dest_par[j].key == coll.key) {
                                //console.log("no 4");
                                return false;
                            }
                        }
                    }
                }
            }
        }
        console.log("OK");
        return "over";
    } else {
        console.log("no 5");
        return false;
    }
}

var ctxt_menu_opts = {
    delegate: "li",
    show: false,
    hide: false,
    menu: [
        {
            title: "Actions",
            cmd: "actions",
            children: [
                { title: "Edit", action: actionEditSelected, cmd: "edit" },
                //{title: "Duplicate", cmd: "dup" },
                { title: "Sharing", action: actionShareSelected, cmd: "share" },
                //{title: "Lock", action: actionLockSelected, cmd: "lock" },
                //{title: "Unlock", action: actionUnlockSelected, cmd: "unlock" },
                { title: "Download", action: actionDataGet, cmd: "get" },
                { title: "Upload", action: actionDataPut, cmd: "put" },
                { title: "Provenance", action: actionDepGraph, cmd: "graph" },
                { title: "Annotate", action: actionAnnotate, cmd: "note" },
                { title: "----" },
                { title: "Delete", action: actionDeleteSelected, cmd: "del" },
            ],
        },
        {
            title: "New",
            cmd: "new",
            children: [
                { title: "Data Record", action: actionNewData, cmd: "newd" },
                { title: "Collection", action: actionNewColl, cmd: "newc" },
            ],
        },
        { title: "----" },
        { title: "Cut", action: actionCutSelected, cmd: "cut" },
        { title: "Copy", action: actionCopySelected, cmd: "copy" },
        { title: "Paste", action: actionPasteSelected, cmd: "paste" },
        { title: "Unlink", action: actionUnlinkSelected, cmd: "unlink" },
        { title: "Refresh", action: actionRefresh, cmd: "refresh" },
    ],
    beforeOpen: function (ev, ui) {
        ev.stopPropagation();

        // Ignore context menu over paging nodes
        var node = $.ui.fancytree.getNode(ev.originalEvent);
        if (node && node.data.hasBtn) return false;

        // Select the target before menu is shown
        if (hoverTimer) {
            clearTimeout(hoverTimer);
            hoverTimer = null;
        }

        ui.target.click();
    },
};

$("#input_files", frame).on("change", function (ev) {
    if (ev.target.files && ev.target.files.length) {
        actionImportData(ev.target.files);
    }
});

$("#filemenu").menu().removeClass("ui-widget-content").addClass("ui-corner-all");

var filemenutimer = null;

$("#filemenu").mouseout(function () {
    if (!filemenutimer) {
        filemenutimer = setTimeout(function () {
            $("#filemenu").hide();
            filemenutimer = null;
        }, 1000);
    }
});

$("#filemenu").mouseover(function () {
    if (filemenutimer) {
        clearTimeout(filemenutimer);
        filemenutimer = null;
    }
});

$("#info-tabs").tabs({
    heightStyle: "fill",
    active: 0,
});

$(".prov-graph-close").click(function () {
    graph_panel.clear();
    $('[href="#tab-prov-graph"]').closest("li").hide();
    $("#data-tabs").tabs({ active: select_source_prev });
});

$("#footer-tabs").tabs({
    heightStyle: "auto",
    collapsible: true,
    active: 0,
    activate: function (ev, ui) {
        if (tab_close_timer) {
            clearTimeout(tab_close_timer);
        }

        if (
            (ui.newTab.length == 0 && ui.newPanel.length == 0) ||
            (ui.oldTab.length == 0 && ui.oldPanel.length == 0)
        ) {
            windowResized();
        }
    },
});

// Start an auto-close timer for tabs
tab_close_timer = setTimeout(function () {
    $("#footer-tabs").tabs("option", "active", false);
}, 10000);

$("#data-tabs").tabs({
    heightStyle: "fill",
    active: 0,
    activate: function (ev, ui) {
        if (ui.newPanel.length) {
            if (select_source == SS_TREE || select_source == SS_CAT)
                select_source_prev = select_source;

            switch (ui.newPanel[0].id) {
                case "tab-data-tree":
                    select_source = SS_TREE;
                    panel_info.showSelectedInfo(data_tree.activeNode, checkTreeUpdate);
                    break;
                case "tab-catalogs":
                    select_source = SS_CAT;
                    if (cat_init) {
                        cat_panel.init();
                        cat_init = false;
                    }
                    panel_info.showSelectedInfo(cat_panel.getActiveNode(), checkTreeUpdate);
                    break;
                case "tab-prov-graph":
                    select_source = SS_PROV;
                    panel_info.showSelectedInfo(
                        graph_panel.getSelectedID(),
                        graph_panel.checkGraphUpdate,
                    );
                    break;
            }
        }
        updateBtnState();
    },
});

$("#btn_edit", frame).on("click", actionEditSelected);
//$("#btn_dup",frame).on('click', dupSelected );
$("#btn_del", frame).on("click", actionDeleteSelected);
$("#btn_share", frame).on("click", actionShareSelected);
$("#btn_lock", frame).on("click", actionLockSelected);
$("#btn_unlock", frame).on("click", actionUnlockSelected);
$("#btn_upload", frame).on("click", actionDataPut);
$("#btn_download", frame).on("click", actionDataGet);
$("#btn_dep_graph", frame).on("click", actionDepGraph);
$("#btn_annotate", frame).on("click", actionAnnotate);
$("#btn_prev_coll", frame).on("click", actionPrevParent);
$("#btn_next_coll", frame).on("click", actionNextParent);
$("#btn_refresh", frame).on("click", actionRefresh);
$("#btn_srch_first_par_coll", frame).on("click", actionFirstParent);
$("#btn_cat_first_par_coll", frame).on("click", actionFirstParent);
$("#btn_cat_refresh", frame).on("click", actionRefresh);
$("#btn_schemas", frame).on("click", actionSchemaList);

$("#btn_exp_node", frame).on("click", function () {
    graph_panel.expandNode();
});

$("#btn_col_node", frame).on("click", function () {
    graph_panel.collapseNode();
});

$("#btn_hide_node", frame).on("click", function () {
    graph_panel.hideNode();
});

$("#btn_settings").on("click", function () {
    dlgSettings.show(function (reload) {
        if (reload) {
            refreshUI();
        }
        clearTimeout(taskTimer);
        task_hist.html("(no recent transfers)");
        taskHist = [];
        pollSince = settings.opts.task_hist * 3600;
        taskTimer = setTimeout(taskHistoryPoll, 1000);
    });
});

// Connect event/click handlers
$("#btn_file_menu", frame).on("click", fileMenu);
$("#btn_new_proj", frame).on("click", actionNewProj);
$("#btn_new_data", frame).on("click", actionNewData);
$("#btn_dup_data", frame).on("click", actionDupData);
$("#btn_new_coll", frame).on("click", actionNewColl);

$("#btn_import_data", frame).on("click", function () {
    $("#filemenu").hide();
    update_files = false;
    import_direct = false;
    $("#input_files", frame).val("");
    $("#input_files", frame).trigger("click");
});

$("#btn_import_direct_data", frame).on("click", function () {
    $("#filemenu").hide();
    update_files = false;
    import_direct = true;
    $("#input_files", frame).val("");
    $("#input_files", frame).trigger("click");
});

$("#btn_update_data", frame).on("click", function () {
    $("#filemenu").hide();
    update_files = true;
    $("#input_files", frame).val("");
    $("#input_files", frame).trigger("click");
});

$("#btn_export_data", frame).on("click", function () {
    $("#filemenu").hide();
    dialogs.dlgConfirmChoice(
        "Confirm Export",
        "Export selected record metadata to browser download directory?",
        ["Cancel", "Export"],
        function (choice) {
            if (choice == 1) {
                var ids = getActionableIDs();

                api.dataExport(ids, function (ok, data) {
                    //console.log("reply:", data );
                    var rec;
                    for (var i in data.record) {
                        rec = JSON.parse(data.record[i]);
                        util.saveFile(rec.id.substr(2) + ".json", data.record[i]);
                    }
                });
            }
        },
    );
});

export function init() {
    //console.log("browser - user from settings:",settings.user);
    var tree_source = [
        //{title:"Favorites",folder:true,icon:"ui-icon ui-icon-heart",lazy:true,nodrag:true,key:"favorites"},
        {
            title: "Personal Data",
            key: "mydata",
            nodrag: true,
            notarg: true,
            icon: "ui-icon ui-icon-person",
            folder: true,
            lazy: true,
            scope: "u/" + settings.user.uid,
        },
        {
            title: "Project Data",
            key: "projects",
            nodrag: true,
            notarg: true,
            folder: true,
            icon: "ui-icon ui-icon-view-icons",
            checkbox: false,
            folder: true,
            lazy: true,
            offset: 0,
        },
        {
            title: "Shared Data",
            folder: true,
            icon: "ui-icon ui-icon-circle-plus",
            nodrag: true,
            notarg: true,
            checkbox: false,
            key: "shared_all",
            children: [
                {
                    title: "By User",
                    icon: "ui-icon ui-icon-persons",
                    nodrag: true,
                    notarg: true,
                    checkbox: false,
                    folder: true,
                    lazy: true,
                    key: "shared_user",
                },
                {
                    title: "By Project",
                    icon: "ui-icon ui-icon-view-icons",
                    nodrag: true,
                    notarg: true,
                    checkbox: false,
                    folder: true,
                    lazy: true,
                    key: "shared_proj",
                },
            ],
        },

        {
            title: "Saved Queries",
            folder: true,
            icon: "ui-icon ui-icon-zoom",
            lazy: true,
            nodrag: true,
            notarg: true,
            key: "saved_queries",
            checkbox: false,
            offset: 0,
        },
        //{title:"Search Results",folder:true,icon:"ui-icon ui-icon-zoom",nodrag:true,key:"search_results",children:[]},
    ];

    my_root_key = "c/u_" + settings.user.uid + "_root";

    $("#data_tree", frame)
        .fancytree({
            extensions: ["dnd5", "themeroller"],
            toggleEffect: false,
            dnd5: {
                autoExpandMS: 400,
                preventNonNodes: true,
                preventLazyParents: false,
                dropEffectDefault: "copy",
                scroll: false,
                dragStart: function (node, data) {
                    //console.log( "dnd start" );

                    if (!drag_enabled || node.data.nodrag) {
                        return false;
                    }

                    clearTimeout(hoverTimer);
                    node.setActive(true);
                    if (!node.isSelected()) {
                        data_tree.selectAll(false);
                        selectScope = data.node;
                        node.setSelected(true);
                    }

                    pasteItems = data_tree.getSelectedNodes();

                    data.dataTransfer.setData("text/plain", node.key);

                    pasteSourceParent = pasteItems[0].parent;
                    //console.log("pasteSourceParent",pasteSourceParent);
                    pasteCollections = [];
                    for (var i in pasteItems) {
                        if (pasteItems[i].key.startsWith("c/"))
                            pasteCollections.push(pasteItems[i]);
                    }
                    dragging = true;

                    if (
                        data.originalEvent.ctrlKey ||
                        data.originalEvent.metaKey ||
                        !node.parent.key.startsWith("c/")
                    ) {
                        move_mode = 0;
                    } else {
                        move_mode = 1;
                    }
                    return true;
                },
                dragDrop: function (dest_node, data) {
                    dragging = false;

                    handlePasteItems(dest_node);
                },
                dragEnter: function (node, data) {
                    //console.log("dragEnter");
                    var allowed = pasteAllowed(node, data.otherNode);

                    return allowed;
                },
                dragEnd: function (node, data) {
                    dragging = false;
                },
            },
            themeroller: {
                activeClass: "my-fancytree-active",
                hoverClass: "",
            },
            source: tree_source,
            selectMode: 2,
            checkbox: false,
            collapse: function (ev, data) {
                var act_id = panel_info.getActiveItemID();
                if (act_id) {
                    data.node.visit(function (nd) {
                        if (nd.key == act_id && nd.isActive()) {
                            panel_info.showSelectedInfo();
                            return false;
                        }
                    });
                }

                if (data.node.isLazy()) {
                    data.node.resetLazy();
                }

                updateBtnState();
            },
            lazyLoad: function (event, data) {
                if (data.node.key == "mydata") {
                    data.result = { url: api.collView_url(my_root_key), cache: false };
                } else if (data.node.key == "projects") {
                    data.result = {
                        url: api.projList_url(
                            true,
                            true,
                            true,
                            model.SORT_TITLE,
                            data.node.data.offset,
                            settings.opts.page_sz,
                        ),
                        cache: false,
                    };
                } else if (data.node.key.startsWith("p/")) {
                    data.result = {
                        url: api.collView_url("c/p_" + data.node.key.substr(2) + "_root"),
                        cache: false,
                    };
                } else if (data.node.key.startsWith("shared_")) {
                    if (data.node.data.scope) {
                        data.result = {
                            url: api.aclListSharedItems_url(data.node.data.scope),
                            cache: false,
                        };
                    } else if (data.node.key.charAt(7) == "u") {
                        data.result = { url: api.aclListSharedUsers_url(), cache: false };
                    } else {
                        data.result = { url: api.aclListSharedProjects_url(), cache: false };
                    }
                } else if (data.node.key == "allocs") {
                    data.result = {
                        url: api.repoAllocListByOwner_url(
                            data.node.data.scope,
                            data.node.data.scope,
                        ),
                        cache: false,
                    };
                } else if (data.node.key.startsWith("repo/")) {
                    data.result = {
                        url: api.repoAllocListItems_url(
                            data.node.data.repo,
                            data.node.data.scope,
                            data.node.data.offset,
                            settings.opts.page_sz,
                        ),
                        cache: false,
                    };
                } else if (data.node.key == "saved_queries") {
                    data.result = {
                        url: api.queryList_url(data.node.data.offset, settings.opts.page_sz),
                        cache: false,
                    };
                } else if (data.node.key.startsWith("q/")) {
                    data.result = {
                        url: api.queryExec_url(
                            data.node.key,
                            data.node.data.offset,
                            settings.opts.page_sz,
                        ),
                        cache: false,
                    };
                } else if (data.node.key.startsWith("published")) {
                    data.result = {
                        url: api.collListPublished_url(
                            data.node.data.scope,
                            data.node.data.offset,
                            settings.opts.page_sz,
                        ),
                        cache: false,
                    };
                } else {
                    var key = data.node.key;

                    data.result = {
                        url: api.collRead_url(key, data.node.data.offset, settings.opts.page_sz),
                        cache: false,
                    };
                }
            },
            loadError: function (event, data) {
                console.log("load error, data:", data);
                var error = data.error;
                if (error.responseText) {
                    data.message = error.responseText;
                    //data.details = data.responseText;
                } else if (error.status && error.statusText) {
                    data.message = "Ajax error: " + data.message;
                    data.details =
                        "Ajax error: " + error.statusText + ", status code = " + error.status;
                }
            },
            postProcess: function (event, data) {
                var item,
                    i,
                    scope = null;

                //console.log( "pos proc:", data );
                if (data.node.key == "mydata") {
                    var uid = "u/" + settings.user.uid;
                    data.result = [
                        {
                            title: util.generateTitle(data.response),
                            _title: util.escapeHTML(data.response.title),
                            folder: true,
                            expanded: false,
                            lazy: true,
                            checkbox: false,
                            key: my_root_key,
                            offset: 0,
                            user: settings.user.uid,
                            scope: uid,
                            nodrag: true,
                            isroot: true,
                            admin: true,
                        },
                        {
                            title: "Public Collections",
                            folder: true,
                            expanded: false,
                            lazy: true,
                            key: "published_u_" + settings.user.uid,
                            offset: 0,
                            scope: uid,
                            nodrag: true,
                            notarg: true,
                            checkbox: false,
                            icon: "ui-icon ui-icon-book",
                        },
                        {
                            title: "Allocations",
                            folder: true,
                            lazy: true,
                            icon: "ui-icon ui-icon-databases",
                            key: "allocs",
                            scope: uid,
                            nodrag: true,
                            notarg: true,
                            checkbox: false,
                        },
                    ];
                } else if (data.node.key.startsWith("p/")) {
                    var prj_id = data.node.key.substr(2);
                    data.result = [
                        {
                            title: util.generateTitle(data.response),
                            _title: util.escapeHTML(data.response.title),
                            folder: true,
                            lazy: true,
                            checkbox: false,
                            key: "c/p_" + prj_id + "_root",
                            offset: 0,
                            scope: data.node.key,
                            isroot: true,
                            admin: data.node.data.admin,
                            nodrag: true,
                        },
                        {
                            title: "Public Collections",
                            folder: true,
                            expanded: false,
                            lazy: true,
                            key: "published_p_" + prj_id,
                            offset: 0,
                            scope: data.node.key,
                            nodrag: true,
                            checkbox: false,
                            icon: "ui-icon ui-icon-book",
                        },
                        {
                            title: "Allocations",
                            folder: true,
                            lazy: true,
                            icon: "ui-icon ui-icon-databases",
                            key: "allocs",
                            scope: data.node.key,
                            nodrag: true,
                            checkbox: false,
                        },
                    ];
                } else if (data.node.key == "projects") {
                    data.result = [];
                    if (data.response.item && data.response.item.length) {
                        var admin,
                            mgr,
                            uid = "u/" + settings.user.uid;

                        for (i in data.response.item) {
                            item = data.response.item[i];
                            admin = item.owner == uid;
                            mgr = item.creator == uid;
                            data.result.push({
                                title: util.generateTitle(item, true),
                                _title: util.escapeHTML(item.title),
                                icon: "ui-icon ui-icon-box",
                                folder: true,
                                key: item.id,
                                scope: item.id,
                                isproj: true,
                                admin: admin,
                                mgr: mgr,
                                nodrag: true,
                                notarg: true,
                                lazy: true,
                            });
                        }
                    }

                    util.addTreePagingNode(data);
                } else if (data.node.key == "shared_user" && !data.node.data.scope) {
                    data.result = [];
                    if (data.response.item && data.response.item.length) {
                        for (i in data.response.item) {
                            item = data.response.item[i];
                            data.result.push({
                                title: item.title + " (" + item.id.substr(2) + ")",
                                icon: "ui-icon ui-icon-person",
                                folder: true,
                                key: "shared_user_" + item.id,
                                scope: item.id,
                                lazy: true,
                                nodrag: true,
                            });
                        }
                    }
                } else if (data.node.key == "shared_proj" && !data.node.data.scope) {
                    data.result = [];
                    if (data.response.item && data.response.item.length) {
                        for (i in data.response.item) {
                            item = data.response.item[i];
                            data.result.push({
                                title: util.generateTitle(item, true),
                                _title: util.escapeHTML(item.title),
                                icon: "ui-icon ui-icon-box",
                                folder: true,
                                key: "shared_proj_" + item.id,
                                scope: item.id,
                                lazy: true,
                                nodrag: true,
                            });
                        }
                    }
                } else if (data.node.key == "saved_queries") {
                    data.result = [];
                    if (data.response.length) {
                        var qry;
                        for (i in data.response) {
                            qry = data.response[i];
                            data.result.push({
                                title: util.escapeHTML(qry.title),
                                icon: false,
                                folder: true,
                                key: qry.id,
                                lazy: true,
                                offset: 0,
                                checkbox: false,
                                nodrag: true,
                            });
                        }
                    }
                } else if (data.node.key == "allocs") {
                    data.result = [];
                    if (data.response.length) {
                        var alloc;
                        for (i = 0; i < data.response.length; i++) {
                            alloc = data.response[i];
                            data.result.push({
                                title: alloc.repo.substr(5) + (i == 0 ? " (default)" : ""),
                                icon: "ui-icon ui-icon-database",
                                folder: true,
                                key: alloc.repo + "/" + alloc.id,
                                scope: alloc.id,
                                repo: alloc.repo,
                                lazy: true,
                                offset: 0,
                                nodrag: true,
                                checkbox: false,
                            });
                        }
                    }
                } else if (data.node.parent) {
                    // General data/collection listing for all nodes
                    data.result = [];

                    var is_pub = data.node.key.startsWith("published") ? true : false,
                        is_qry = data.node.key.startsWith("q/"),
                        entry,
                        items = data.response.data ? data.response.data : data.response.item;

                    scope = data.node.data.scope;

                    util.addTreePagingNode(data, is_qry);

                    for (i in items) {
                        item = items[i];

                        if (item.id[0] == "c") {
                            entry = {
                                title: util.generateTitle(item),
                                _title: util.escapeHTML(item.title),
                                folder: true,
                                lazy: true,
                                scope: scope,
                                isroot: item.id.endsWith("_root"),
                                key: item.id,
                                offset: 0,
                                nodrag: is_pub || is_qry,
                            };
                        } else {
                            entry = {
                                title: util.generateTitle(item),
                                checkbox: false,
                                folder: false,
                                icon: util.getDataIcon(item),
                                scope: item.owner ? item.owner : scope,
                                key: item.id,
                                doi: item.doi,
                                size: item.size,
                                external: item.external,
                                nodrag: is_qry,
                            };
                        }

                        data.result.push(entry);
                    }
                }

                if (data.result && data.result.length == 0) {
                    if (scope)
                        data.result.push({
                            title: "(empty)",
                            icon: false,
                            checkbox: false,
                            scope: scope,
                            nodrag: true,
                            key: "empty",
                        });
                    else
                        data.result.push({
                            title: "(empty)",
                            icon: false,
                            checkbox: false,
                            nodrag: true,
                            notarg: true,
                            key: "empty",
                        });
                }
            },
            renderNode: function (ev, data) {
                if (data.node.data.hasBtn) {
                    $(".btn", data.node.li).button();
                }
            },
            focus: function (ev, data) {
                //console.log("focus",data.node.key);
                data.node.setActive(true);
            },
            activate: function (event, data) {
                //console.log("activate",data.node.key);

                if (keyNav && !keyNavMS) {
                    data_tree.selectAll(false);
                    selectScope = data.node;
                    treeSelectNode(data.node);
                }
                keyNav = false;

                panel_info.showSelectedInfo(data.node, checkTreeUpdate);

                /*if ( searchMode ){
                updateBtnState();
            }*/
            },
            select: function (event, data) {
                //console.log("select",data.node.key);
                /*
            if ( data.node.isSelected() ){
                var others;

                if ( searchMode ){
                    if ( searchScope != data.node.data.scope ){
                        searchScope = data.node.data.scope;
                        if ( !util.isObjEmpty( searchSelect )){
                            //data_tree.selectAll( false );
                            var sel = data_tree.getSelectedNodes();
                            for( var i in sel ){
                                if ( sel[i].key != data.node.key ){
                                    sel[i].setSelected( false );
                                }
                            }
                            searchSelect = {};
                        }
                    }else{
                        others = new Set();
                    }
                }
                //console.log( data.node.title );

                searchSelect[ data.node.key ] = data.node.data._title?data.node.data._title:data.node.title;

                // Unselect child nodes
                data.node.visit( function( node ){
                    delete searchSelect[node.key];
                    if ( searchMode && others ){
                        others.add( node.key );
                    }
                });

                // Unselect parent nodes
                var parents = data.node.getParentList();
                for ( var i in parents ){
                    delete searchSelect[parents[i].key];
                    if ( searchMode && others ){
                        others.add( parents[i].key );
                    }
                }

                // Select/Deselect other node instances
                if ( searchMode ){
                    //console.log("parents",parents);
                    if ( parents.length ){
                        parents = parents[0];
                        parents.setSelected( false );
                    }else{
                        parents = data.node;
                    }

                    parents.visit( function( node ){
                        if ( others && others.has( node.key )){
                            //console.log( "delsel", node.key );
                            node.setSelected( false );
                        }else if ( node.key == data.node.key ){
                            node.setSelected( true );
                        }
                    });
                }
            }else{
                //console.log("deselect",data.node.key);
                delete searchSelect[data.node.key];

                if ( searchMode ){
                    var parents = data.node.getParentList();
                    //console.log("parents 2",parents);
                    parents = parents.length?parents[0]:data.node;
                    //console.log("start",parents);
                    parents.visit( function( node ){
                        if ( node.key == data.node.key ){
                            node.setSelected( false );
                        }
                    });
                }
            }

            if ( searchMode ){
                search_panel.setSearchSelect( searchSelect );
            }
            */

                updateBtnState();
            },
            keydown: function (ev, data) {
                //console.log("keydown",ev.keyCode);
                if (ev.keyCode == 32) {
                    if (data_tree.getSelectedNodes().length == 0) {
                        selectScope = data.node;
                    }

                    treeSelectNode(data.node, true);
                } else if (ev.keyCode == 13) {
                    if (keyNavMS) {
                        keyNavMS = false;
                        util.setStatusText("Keyboard multi-select mode DISABLED");
                    } else {
                        keyNavMS = true;
                        util.setStatusText("Keyboard multi-select mode ENABLED");
                    }
                } else if (ev.keyCode == 38 || ev.keyCode == 40) {
                    keyNav = true;
                }
            },
            click: function (event, data) {
                //console.log("click",data.node.key);

                if (dragging) {
                    // Suppress click processing on aborted drag
                    //console.log("click dragging");
                    dragging = false;
                } /*if ( !searchMode )*/ else {
                    //console.log("click not search");
                    if (event.which == null) {
                        // RIGHT-CLICK CONTEXT MENU

                        if (!data.node.isSelected()) {
                            //console.log("not selected - select");
                            data_tree.selectAll(false);
                            selectScope = data.node;
                            treeSelectNode(data.node);
                        }
                        // Update contextmenu choices
                        var sel = data_tree.getSelectedNodes();

                        // Enable/disable actions
                        if (!sel[0].parent.key.startsWith("c/") || sel[0].data.nodrag) {
                            data_tree_div.contextmenu("enableEntry", "unlink", false);
                            data_tree_div.contextmenu("enableEntry", "cut", false);
                        } else {
                            data_tree_div.contextmenu("enableEntry", "unlink", true);
                            data_tree_div.contextmenu("enableEntry", "cut", true);
                        }

                        var coll_sel = false;

                        // If any collections are selected, copy is not available
                        for (var i in sel) {
                            if (sel[i].key.startsWith("c/")) {
                                coll_sel = true;
                                break;
                            }
                        }

                        if (sel[0].data.nodrag || coll_sel)
                            data_tree_div.contextmenu("enableEntry", "copy", false);
                        else data_tree_div.contextmenu("enableEntry", "copy", true);

                        if (pasteItems.length > 0 && pasteAllowed(sel[0], pasteItems[0]))
                            data_tree_div.contextmenu("enableEntry", "paste", true);
                        else data_tree_div.contextmenu("enableEntry", "paste", false);
                    } else if (data.targetType != "expander" /*&& data.node.data.scope*/) {
                        if (data_tree.getSelectedNodes().length == 0) selectScope = data.node;

                        if (data.originalEvent.altKey) {
                            if (searchMode) {
                                data_tree.selectAll(false);
                                selectScope = data.node;
                                data.node.setSelected(true);
                                search_panel.addSelected();
                            }
                        } else if (data.originalEvent.ctrlKey || data.originalEvent.metaKey) {
                            treeSelectNode(data.node, true);
                        } else if (data.originalEvent.shiftKey) {
                            data_tree.selectAll(false);
                            selectScope = data.node;
                            treeSelectRange(data_tree, data.node);
                        } else {
                            if (data.targetType == "icon" && data.node.isFolder()) {
                                data.node.toggleExpanded();
                            }

                            data_tree.selectAll(false);
                            selectScope = data.node;
                            treeSelectNode(data.node);
                        }
                    }
                }
            },
        })
        .on("mouseenter", ".fancytree-node", function (event) {
            if (event.ctrlKey || event.metaKey) {
                if (hoverTimer) {
                    clearTimeout(hoverTimer);
                    //hoverNav = false;
                    hoverTimer = null;
                }
                var node = $.ui.fancytree.getNode(event);
                hoverTimer = setTimeout(function () {
                    if (!node.isActive()) {
                        //hoverNav = true;
                        node.setActive(true);
                    }
                    hoverTimer = null;
                }, 750);
                //console.log("hover:",node.key);
            }
            //node.info(event.type);
        });

    data_tree_div = $("#data_tree", frame);
    data_tree = $.ui.fancytree.getTree("#data_tree");

    util.tooltipTheme(data_tree_div);

    if (settings.user.isRepoAdmin) {
        $("#btn_new_proj").show();
        setupRepoTab();
        $('[href="#tab-repo"]').closest("li").show();
    }

    if (settings.user.isAdmin) {
        $('[href="#tab-admin"]').closest("li").show();
        $("#btn_manage_repos", frame).on("click", dlgRepoManage.show);
    }

    $(".btn-refresh").button({ icon: "ui-icon-refresh", showLabel: false });
    util.inputTheme($("input"));

    search_panel = panel_search.newSearchPanel($("#search_panel", frame), "qry", this);
    cat_panel = panel_cat.newCatalogPanel("#catalog_tree", $("#tab-catalogs", frame), this);
    graph_panel = panel_graph.newGraphPanel("#data-graph", $("tab#-prov-graph", frame), this);

    $("#btn_search_panel").on("click", function () {
        setSearchMode(!searchMode);
    });

    data_tree_div.contextmenu(ctxt_menu_opts);

    var node = data_tree.getNodeByKey("mydata");

    node.setExpanded().done(function () {
        var node2 = data_tree.getNodeByKey(my_root_key);
        node2.setExpanded();
    });

    panel_info.showSelectedInfo();
    taskTimer = setTimeout(taskHistoryPoll, 1000);
}

task_hist.html("(no recent transfers)");

api.getDailyMessage(function (ok, reply) {
    if (ok && reply.message) {
        $("#msg_daily", frame).text(reply.message);
        $("#msg_daily_div", frame).show();
    }
});

export function checkTreeUpdate(a_data, a_source) {
    //console.log("checkTreeUpdate", a_data, a_source );

    if (a_source.key.startsWith("d/")) {
        if (a_data.size != a_source.data.size) {
            //console.log("size diff, update!");
            model.update([a_data]);
        }
    }
}

model.registerUpdateListener(function (a_data) {
    console.log("main tab updating:", a_data);

    var nd, data;

    switch (select_source) {
        case SS_TREE:
            nd = data_tree.activeNode;
            break;
        case SS_CAT:
            //nd = cat_panel.tree.activeNode;
            break;
        case SS_PROV:
            nd = graph_panel.getSelectedID();
            break;
    }

    if (nd) {
        for (var i in a_data) {
            if (a_data[i].id == nd.key) {
                panel_info.showSelectedInfo(nd);
                break;
            }
        }
    }

    // Find impacted nodes in data tree and update title
    data_tree.visit(function (node) {
        if (node.key in a_data) {
            data = a_data[node.key];
            // Update size if changed
            if (node.key.startsWith("d/") && node.data.size != data.size) {
                node.data.size = data.size;
            }
            util.refreshNodeTitle(node, data);
        }
    });

    updateBtnState();
});
