import * as api from "./api.js";
import * as util from "./util.js";
import * as settings from "./settings.js";
import * as dialogs from "./dialogs.js";
import * as dlgAllocNewEdit from "./dlg_alloc_new_edit.js";
import * as dlgPickUser from "./dlg_pick_user.js";

export function show(a_repo_id, a_cb) {
    var content =
        "<div class='row-flex' style='height:100%'>\
            <div class='col-flex' style='flex:1 1 70%;height:100%'>\
                <div style='flex:none' class='ui-widget-header'>Configuration:</div>\
                <div style='flex:none'>\
                    <table style='width:100%'>\
                        <tr><td style='vertical-align:middle'>ID: <span class='note'>*</span></td><td><input type='text' id='id' style='width:100%' disabled></input></td></tr>\
                        <tr><td style='vertical-align:middle'>Title: <span class='note'>*</span></td><td><input type='text' id='title' style='width:100%'></input></td></tr>\
                        <tr><td style='vertical-align:top'>Description:</td><td><textarea id='desc' rows=3 style='width:100%;resize:none;padding:0'></textarea></td></tr>\
                        <tr><td style='vertical-align:top'>Srvr. Address: <span class='note'>*</span></td><td><input type='text' id='addr' style='width:100%'></input></td></tr>\
                        <tr><td style='vertical-align:top'>Public Key: <span class='note'>*</span></td><td><input type='text' id='pub_key' style='width:100%'></input></td></tr>\
                        <tr><td style='vertical-align:top'>End-point ID: <span class='note'>*</span></td><td><input type='text' id='ep_id' style='width:100%'></input></td></tr>\
                        <tr><td style='vertical-align:middle'>Path: <span class='note'>*</span></td><td><input type='text' id='path' style='width:100%'></input></td></tr>\
                        <tr><td style='vertical-align:middle'>Domain:</td><td><input type='text' id='domain' style='width:100%'></input></td></tr>\
                        <tr><td style='vertical-align:middle'>Export Path:</td><td><input type='text' id='exp_path' style='width:100%'></input></td></tr>\
                        <tr><td style='vertical-align:middle'>Capacity: <span class='note'>*</span></td><td><input type='text' id='capacity' style='width:100%'></input></td></tr>\
                    </table>\
                </div>\
                <div style='flex:none' class='ui-widget-header edit-only'>Statistics:</div>\
                <div style='flex:none' class='edit-only'>\
                    <table style='width:100%'>\
                        <tr><td style='vertical-align:middle'>Record&nbspCount:</td><td><input type='text' id='no_records' style='width:100%' disabled></input></td></tr>\
                        <tr><td style='vertical-align:middle'>File&nbspCount:</td><td><input type='text' id='no_files' style='width:100%' disabled></input></td></tr>\
                        <tr><td style='vertical-align:middle'>Capacity&nbspUsed:</td><td><input type='text' id='used' style='width:100%' disabled></input></td></tr>\
                    </table>\
                </div>\
            </div>\
            <div style='flex:none'>&nbsp</div>\
            <div class='col-flex' style='flex:1 1 30%;min-height:100%'>\
                <div style='flex:none' class='ui-widget-header'>Administrators: <span class='note'>*</span></div>\
                <div style='flex:1 1 40%;overflow:auto' class='content text'>\
                    <div id='admin_tree' class='content no-border' style='min-height:0'></div>\
                </div>\
                <div style='flex:none;padding:.25em 0'>\
                    <button class='btn small' id='add_adm_btn'>Add</button>\
                    <button class='btn small' id='rem_adm_btn' disabled>Remove</button>\
                </div>\
                <div style='flex:none' class='ui-widget-header edit-only'>Allocations:</div>\
                <div style='flex:1 1 60%;overflow:auto' class='content text edit-only'>\
                    <div id='alloc_tree' class='content no-border' style='min-height:0'></div>\
                </div>\
                <div style='flex:none;padding:.25em 0' class='edit-only'>\
                    <button class='btn small' id='add_alloc_btn'>Add</button>\
                    <button class='btn small' id='stat_alloc_btn' disabled>Stats</button>\
                    <button class='btn small' id='edit_alloc_btn' disabled>Edit</button>\
                    <button class='btn small' id='del_alloc_btn' disabled>Delete</button>\
                </div>\
            </div>\
        </div>";

    var frame = $(document.createElement("div"));
    var repo = null;
    var changed = 0;

    frame.html(content);

    util.inputTheme($("input", frame));
    util.inputTheme($("textarea", frame));

    function repoInputChanged(a_bit) {
        changed |= a_bit;
        $("#apply_btn").button("option", "disabled", false);
    }

    function initForm() {
        if (repo) {
            $("#id", frame).val(repo.id.substr(5));
            $("#title", frame).val(repo.title);
            $("#desc", frame).val(repo.desc);
            $("#addr", frame).val(repo.address);
            $("#pub_key", frame).val(repo.pubKey);
            $("#ep_id", frame).val(repo.endpoint);
            $("#domain", frame).val(repo.domain);
            $("#path", frame).val(repo.path);
            $("#exp_path", frame).val(repo.expPath);
            $("#capacity", frame).val(repo.capacity);
            var admin;
            for (var i in repo.admin) {
                admin = repo.admin[i];
                admin_tree.rootNode.addNode({
                    title: admin.substr(2),
                    icon: "ui-icon ui-icon-person",
                    key: admin,
                });
            }
        }
    }

    function initStats(stats) {
        if (stats) {
            $("#used", frame).val(util.sizeToString(stats.dataSize));
            $("#no_records", frame).val(stats.recCount);
            $("#no_files", frame).val(stats.fileCount);
        }
    }

    function initAlloc(alloc) {
        if (alloc && alloc.length) {
            for (var i in alloc) {
                addAllocNode(alloc[i]);
            }
        }
    }

    function addAllocNode(alloc) {
        alloc_tree.rootNode.addNode({
            title:
                alloc.id.substr(2) +
                "  (" +
                util.sizeToString(alloc.dataSize) +
                "/" +
                util.sizeToString(alloc.dataLimit) +
                ")",
            icon: alloc.id.startsWith("u/") ? "ui-icon ui-icon-person" : "ui-icon ui-icon-box",
            key: alloc.id,
            alloc: alloc,
        });
    }

    function updateAllocTitle(node) {
        node.setTitle(
            node.key.substr(2) +
                "  (" +
                util.sizeToString(node.data.alloc.dataSize) +
                "/" +
                util.sizeToString(node.data.alloc.dataLimit) +
                ")",
        );
    }

    $(".btn", frame).button();

    if (a_repo_id) {
        $("#title", frame).on("input", function () {
            repoInputChanged(1);
        });
        $("#desc", frame).on("input", function () {
            repoInputChanged(2);
        });
        $("#domain", frame).on("input", function () {
            repoInputChanged(4);
        });
        $("#capacity", frame).on("input", function () {
            repoInputChanged(8);
        });
        $("#path", frame).on("input", function () {
            repoInputChanged(0x10);
        });
        $("#exp_path", frame).on("input", function () {
            repoInputChanged(0x20);
        });
        $("#pub_key", frame).on("input", function () {
            repoInputChanged(0x40);
        });
        $("#addr", frame).on("input", function () {
            repoInputChanged(0x80);
        });
        $("#ep_id", frame).on("input", function () {
            repoInputChanged(0x100);
        });
    }

    $("#add_adm_btn", frame).click(function () {
        var excl = [];
        admin_tree.visit(function (node) {
            //console.log("excl adm:",node.key);
            excl.push(node.key);
        });

        dlgPickUser.show("u/" + settings.user.uid, excl, false, function (uids) {
            var uid;
            for (var i in uids) {
                uid = uids[i];
                admin_tree.rootNode.addNode({
                    title: uid.substr(2),
                    icon: "ui-icon ui-icon-person",
                    key: uid,
                });
            }
            repoInputChanged(16);
        });
    });

    $("#rem_adm_btn", frame).click(function () {
        var node = admin_tree.getActiveNode();
        if (node) {
            node.remove();
            $("#rem_adm_btn", frame).button("option", "disabled", true);
        }
        repoInputChanged(0x200);
    });

    $("#add_alloc_btn", frame).click(function () {
        var excl = [];
        alloc_tree.visit(function (node) {
            excl.push(node.key);
        });

        dlgAllocNewEdit.show(a_repo_id, null, excl, function (alloc) {
            console.log("new alloc:", alloc);
            addAllocNode(alloc);
        });
    });

    $("#edit_alloc_btn", frame).click(function () {
        var node = alloc_tree.getActiveNode();
        if (node) {
            dlgAllocNewEdit.show(a_repo_id, node.data.alloc, [], function (alloc) {
                console.log("updated alloc:", alloc);
                node.data.alloc = alloc;
                updateAllocTitle(node);
            });
        }
    });

    $("#stat_alloc_btn", frame).click(function () {
        var node = alloc_tree.getActiveNode();
        if (node) {
            api.allocStats(a_repo_id, node.key, function (ok, data) {
                if (ok) {
                    //console.log("stats:",data);
                    // Update alloc tree with latest total_sz
                    node.data.alloc.totalSz = data.totalSz;
                    updateAllocTitle(node);

                    var msg =
                        "<table class='info_table'>\
                    <tr><td>No. of Records:</td><td>" +
                        data.recCount +
                        "</td></tr>\
                    <tr><td>No. of Files:</td><td>" +
                        data.fileCount +
                        "</td></tr>\
                    <tr><td>Total size:</td><td>" +
                        data.dataSize +
                        "<br>(" +
                        util.sizeToString(data.dataSize) +
                        ")</td></tr>\
                    <tr><td>Average size:</td><td>" +
                        util.sizeToString(data.fileCount > 0 ? data.dataSize / data.fileCount : 0) +
                        "</td></tr>\
                    </table><br>Histogram:<br><br><table class='info_table'>\
                    <tr><th></th><th>1's</th><th>10's</th><th>100's</th></tr>\
                    <tr><td>B:</td><td>" +
                        data.histogram[0] +
                        "</td><td>" +
                        data.histogram[1] +
                        "</td><td>" +
                        data.histogram[2] +
                        "</td></tr>\
                    <tr><td>KB:</td><td>" +
                        data.histogram[3] +
                        "</td><td>" +
                        data.histogram[4] +
                        "</td><td>" +
                        data.histogram[5] +
                        "</td></tr>\
                    <tr><td>MB:</td><td>" +
                        data.histogram[6] +
                        "</td><td>" +
                        data.histogram[7] +
                        "</td><td>" +
                        data.histogram[8] +
                        "</td></tr>\
                    <tr><td>GB:</td><td>" +
                        data.histogram[9] +
                        "</td><td>" +
                        data.histogram[10] +
                        "</td><td>" +
                        data.histogram[11] +
                        "</td></tr>\
                    <tr><td>TB:</td><td>" +
                        data.histogram[12] +
                        "</td></tr>\
                    </table>";

                    dialogs.dlgAlert("Allocation Statistics", msg);
                }
            });
        }
    });

    $("#del_alloc_btn", frame).click(function () {
        var node = alloc_tree.getActiveNode();
        if (node) {
            dialogs.dlgConfirmChoice(
                "Confirm Delete",
                "Delete allocation for " +
                    (node.key.startsWith("u/") ? "user " : "project ") +
                    node.key.substr(2) +
                    "?",
                ["Cancel", "Delete"],
                function (choice) {
                    if (choice == 1) {
                        api.allocDelete(a_repo_id, node.key, function (ok, data) {
                            if (ok) node.remove();
                            else dialogs.dlgAlert("Allocation Delete Error", data);
                        });
                    }
                },
            );
        }
    });

    $("#admin_tree", frame).fancytree({
        extensions: ["themeroller"],
        themeroller: {
            activeClass: "my-fancytree-active",
            hoverClass: "",
        },
        source: [],
        selectMode: 1,
        nodata: false,
        activate: function (event, data) {
            $("#rem_adm_btn", frame).button("option", "disabled", false);
        },
    });

    var admin_tree = $.ui.fancytree.getTree($("#admin_tree", frame));

    $("#alloc_tree", frame).fancytree({
        extensions: ["themeroller"],
        themeroller: {
            activeClass: "my-fancytree-active",
            hoverClass: "",
        },
        source: [],
        selectMode: 1,
        nodata: false,
        activate: function (event, data) {
            $("#stat_alloc_btn", frame).button("option", "disabled", false);
            $("#edit_alloc_btn", frame).button("option", "disabled", false);
            $("#del_alloc_btn", frame).button("option", "disabled", false);
        },
    });

    var alloc_tree = $.ui.fancytree.getTree($("#alloc_tree", frame));

    var options = {
        title: (a_repo_id ? "Edit" : "New") + " Data Repository",
        modal: true,
        width: 750,
        height: 550, // NOTE: Chrome does not layout dialog correctly with auto height
        resizable: true,
        buttons: [
            {
                text: a_repo_id ? "Close" : "Cancel",
                click: function () {
                    if (a_repo_id && a_cb) a_cb();
                    $(this).dialog("close");
                },
            },
            {
                id: "apply_btn",
                text: a_repo_id ? "Apply Changes" : "Save",
                click: function () {
                    var obj, cap;
                    if (a_repo_id) {
                        obj = { id: repo.id };
                        util.getUpdatedValue($("#title", frame).val(), repo, obj, "title");
                        util.getUpdatedValue($("#desc", frame).val(), repo, obj, "desc");
                        util.getUpdatedValue($("#addr", frame).val(), repo, obj, "address");
                        util.getUpdatedValue($("#pub_key", frame).val(), repo, obj, "pubKey");
                        util.getUpdatedValue($("#ep_id", frame).val(), repo, obj, "endpoint");
                        util.getUpdatedValue($("#path", frame).val(), repo, obj, "path");
                        util.getUpdatedValue($("#domain", frame).val(), repo, obj, "domain");
                        util.getUpdatedValue($("#exp_path", frame).val(), repo, obj, "expPath");

                        cap = util.parseSize($("#capacity", frame).val());
                        if (cap == null) {
                            dialogs.dlgAlert("Data Entry Error", "Invalid repo capacity value.");
                            return;
                        }
                        if (cap != repo.capacity) obj.capacity = cap;

                        var admins = [];
                        admin_tree.visit(function (node) {
                            admins.push(node.key);
                        });

                        if (admins.length == 0) {
                            dialogs.dlgAlert(
                                "Data Entry Error",
                                "Must specify at least one repo admin.",
                            );
                            return;
                        }

                        if (admins.length != repo.admin.length) obj.admin = admins;
                        else {
                            for (var i in admins) {
                                if (admins[i] != repo.admin[i]) {
                                    obj.admin = admins;
                                    break;
                                }
                            }
                        }

                        console.log("repo update:", obj);

                        if (changed) {
                            api.repoUpdate(obj, function (ok, data) {
                                if (ok) {
                                    changed = 0;
                                    $("#apply_btn").button("option", "disabled", true);
                                } else {
                                    dialogs.dlgAlert("Repo Update Failed", data);
                                }
                            });
                        }
                    } else {
                        obj = {
                            id: $("#id", frame).val(),
                            title: $("#title", frame).val(),
                            address: $("#addr", frame).val(),
                            pubKey: $("#pub_key", frame).val(),
                            endpoint: $("#ep_id", frame).val(),
                            path: $("#path", frame).val(),
                        };

                        var tmp = $("#desc", frame).val().trim();
                        if (tmp) obj.desc = tmp;
                        tmp = $("#domain", frame).val().trim();
                        if (tmp) obj.domain = tmp;
                        tmp = $("#exp_path", frame).val().trim();
                        if (tmp) obj.exp_path = tmp;

                        cap = util.parseSize($("#capacity", frame).val());
                        if (cap == null) {
                            dialogs.dlgAlert("Data Entry Error", "Invalid repo capacity value.");
                            return;
                        }
                        obj.capacity = cap;

                        obj.admin = [];
                        admin_tree.visit(function (node) {
                            obj.admin.push(node.key);
                        });

                        if (obj.admin.length == 0) {
                            dialogs.dlgAlert(
                                "Data Entry Error",
                                "Must specify at least one repo admin.",
                            );
                            return;
                        }

                        var inst = $(this);

                        api.repoCreate(obj, function (ok, data) {
                            if (ok) {
                                if (a_cb) a_cb();
                                inst.dialog("close");
                            } else {
                                dialogs.dlgAlert("Repo Create Failed", data);
                            }
                        });
                    }
                },
            },
        ],
        open: function (event, ui) {
            if (a_repo_id != null) {
                api.repoView(a_repo_id, function (ok, a_repo) {
                    if (ok && a_repo.length) {
                        repo = a_repo[0];
                        initForm();
                    }
                });

                api.allocStats(a_repo_id, null, function (ok, stats) {
                    if (ok) {
                        initStats(stats);
                    }
                });

                api.allocList(a_repo_id, function (ok, alloc) {
                    if (ok) {
                        initAlloc(alloc);
                    }
                });

                $("#apply_btn").button("option", "disabled", true);
            } else {
                $("#stat_alloc_btn", frame).button("option", "disabled", true);
                $("#add_alloc_btn", frame).button("option", "disabled", true);
                $("#edit_alloc_btn", frame).button("option", "disabled", true);
                $("#del_alloc_btn", frame).button("option", "disabled", true);
                $("#id", frame).attr("disabled", false);
                $(".edit-only", frame).hide();
            }

            //if ( a_repo_id ){
            //    $("#apply_btn").button("option", "disabled", true);
            // }

            var widget = frame.dialog("widget");
            $(".ui-dialog-buttonpane", widget).append(
                "<span class='note' style='padding:1em;line-height:200%'>* Required fields</span>",
            );
        },
        close: function (ev, ui) {
            $(this).dialog("destroy").remove();
        },
    };

    frame.dialog(options);
}
