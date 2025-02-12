import * as model from "./model.js";
import * as util from "./util.js";
import * as settings from "./settings.js";
import * as api from "./api.js";
import * as dialogs from "./dialogs.js";
import * as dlgPickUser from "./dlg_pick_user.js";

export function show(a_data, a_upd_perms, a_cb) {
    var ele = document.createElement("div");
    ele.id = (a_data ? a_data.id.replace("/", "_") : "p_new") + "_edit";
    var frame = $(ele);
    var def_alloc;

    var html =
        "<div class='col-flex' style='height:100%'>\
        <div style='flex:none'>\
            <table class='form-table'>\
                <tr><td>ID: <span class='note'>*</span></td><td><input type='text' id='id' style='width:100%'></input></td></tr>\
                <tr><td>Title: <span class='note'>*</span></td><td><input type='text' id='title' style='width:100%'></input></td></tr>\
                <tr><td style='vertical-align:top'>Description:</td><td><textarea id='desc' rows=3 style='width:100%;padding:0'></textarea></td></tr>\
                <tr id='def_alloc_row' style='display:none'><td>Default&nbspAlloc:</td><td><select id='def_alloc'><option value='none'>None</option></select></td></tr>\
                <tr><td>Owner:</td><td><input type='text' id='owner_id' style='width:100%'></input></td></tr>\
            </table>\
        </div>\
        <div style='flex:none'>&nbsp</div>\
        <div class='row-flex' style='flex: 1 1 100%;min-height:0'>\
            <div class='col-flex' style='flex: 1 1 50%;height:100%'>\
                <div style='flex:none'>Members:</div>\
                <div class='content text' style='flex:1 1 100%;min-height:5em;overflow:auto'>\
                    <div id='proj_mem_tree' class='content no-border'></div>\
                </div>\
                <div style='flex:none;padding-top:.25em'><button id='add_mem_btn' class='btn'>Add</button>&nbsp<button id='rem_mem_btn' class='btn' disabled>Remove</button></div>\
            </div>\
            <div style='flex:none'>&nbsp</div>\
            <div class='col-flex' style='flex: 1 1 50%;height:100%'>\
                <div style='flex:none'>Admins:</div>\
                <div class='content text' style='flex:1 1 100%;min-height:5em;overflow:auto'>\
                    <div id='proj_adm_tree' class='content no-border'></div>\
                </div>\
                <div style='flex:none;padding-top:.25em'><button id='add_adm_btn' class='btn'>Add</button>&nbsp<button id='rem_adm_btn' class='btn' disabled>Remove</button></div>\
            </div>\
        </div>";

    frame.html(html);

    var proj;
    if (a_data) proj = Object.assign({}, a_data);
    else proj = { owner: "u/" + settings.user.uid };

    util.inputTheme($("input", frame));
    util.inputTheme($("textarea", frame));
    util.inputDisable($("#owner_id", frame));

    var options = {
        title: a_data ? "Edit Project " + a_data.id : "New Project",
        modal: false,
        width: 500,
        height: 550,
        position: { my: "left", at: "center+10", of: "body" },
        resizable: true,
        buttons: [
            {
                text: "Cancel",
                click: function () {
                    $(this).dialog("close");
                },
            },
            {
                text: a_data ? "Update" : "Create",
                click: function () {
                    var proj = {},
                        i,
                        inst = $(this),
                        mem_tree = $.ui.fancytree.getTree("#proj_mem_tree"),
                        adm_tree = $.ui.fancytree.getTree("#proj_adm_tree"),
                        admins = [],
                        members = [],
                        result,
                        close_cnt = 0;

                    adm_tree.visit(function (node) {
                        admins.push(node.key);
                    });

                    mem_tree.visit(function (node) {
                        members.push(node.key);
                    });

                    if (a_data) {
                        var diff,
                            do_upd = false;

                        proj.id = a_data.id;

                        util.getUpdatedValue($("#title", frame).val(), a_data, proj, "title");
                        util.getUpdatedValue($("#desc", frame).val(), a_data, proj, "desc");

                        if (proj.title != undefined || proj.desc != undefined) {
                            do_upd = true;
                        }

                        diff = false;
                        if (a_data.admin && a_data.admin.length) {
                            if (a_data.admin.length == admins.length) {
                                diff = false;
                                for (i = 0; i < admins.length; i++) {
                                    if (a_data.admin[i] != admins[i]) {
                                        diff = true;
                                        break;
                                    }
                                }
                            } else {
                                diff = true;
                            }
                        } else if (admins.length) {
                            diff = true;
                        }

                        if (diff) {
                            do_upd = true;
                            proj.admin = admins;
                            proj.adminSet = true;
                        }

                        diff = false;
                        if (a_data.member && a_data.member.length) {
                            if (a_data.member.length == members.length) {
                                for (i = 0; i < members.length; i++) {
                                    if (a_data.member[i] != members[i]) {
                                        diff = true;
                                        break;
                                    }
                                }
                            } else {
                                diff = true;
                            }
                        } else if (members.length) {
                            diff = true;
                        }

                        if (diff) {
                            do_upd = true;
                            proj.member = members;
                            proj.memberSet = true;
                        }

                        if (do_upd) {
                            close_cnt++;
                            console.log("update project");
                            api.projUpdate(proj, function (ok, data) {
                                if (!ok) {
                                    dialogs.dlgAlert("Project Update Error", data);
                                } else {
                                    result = data[0];
                                    do_close();
                                }
                            });
                        }

                        var tmp = $("#def_alloc", frame).val();
                        if (tmp != def_alloc) {
                            close_cnt++;
                            console.log("Set def alloc", tmp);
                            api.setDefaultAlloc(tmp, a_data.id, function (ok, data) {
                                if (!ok) {
                                    dialogs.dlgAlert("Error Setting Default Allocation", data);
                                } else {
                                    if (!result) result = a_data;
                                    do_close();
                                }
                            });
                        }
                    } else {
                        close_cnt = 1;

                        proj.id = $("#id", frame).val().trim();
                        proj.title = $("#title", frame).val().trim();
                        proj.desc = $("#desc", frame).val().trim();

                        if (!proj.id) {
                            util.setStatusText("ID field is required.", true);
                            return;
                        }

                        if (!proj.title) {
                            util.setStatusText("Title field is required.", true);
                            return;
                        }

                        if (members.length) {
                            proj.member = members;
                        }

                        if (admins.length) proj.admin = admins;

                        api.projCreate(proj, function (ok, data) {
                            if (!ok) {
                                dialogs.dlgAlert("Project Create Error", data);
                            } else {
                                result = data[0];
                                do_close();
                            }
                        });
                    }

                    function do_close() {
                        console.log("do_close", close_cnt);
                        if (--close_cnt <= 0) {
                            util.setStatusText("Project saved.");

                            if (a_cb) a_cb(result);

                            inst.dialog("close");
                        }
                    }

                    if (close_cnt == 0) do_close();
                },
            },
        ],
        open: function (event, ui) {
            var widget = frame.dialog("widget");
            $(".ui-dialog-buttonpane", widget).append(
                "<span class='note' style='padding:1em;line-height:200%'>* Required fields</span>",
            );

            var mem_src = [];
            var adm_src = [];

            if (a_data) {
                util.inputDisable($("#id", frame)).val(a_data.id);
                $("#title", frame).val(a_data.title);
                $("#desc", frame).val(a_data.desc);
                $("#def_alloc", frame).selectmenu({ width: 225 });
                $("#def_alloc_row", frame).show();
                $("#owner_id", frame).val(a_data.owner);

                if ((a_upd_perms & model.PERM_WR_REC) == 0)
                    util.inputDisable($("#title,#desc,#add_adm_btn,#rem_adm_btn", frame));

                for (var i in a_data.member)
                    mem_src.push({
                        title: a_data.member[i].substr(2),
                        icon: false,
                        key: a_data.member[i],
                    });

                for (i in a_data.admin)
                    adm_src.push({
                        title: a_data.admin[i].substr(2),
                        icon: false,
                        key: a_data.admin[i],
                    });
            } else {
                $("#owner_id", frame).val(settings.user.uid);
            }

            $("#proj_mem_tree", frame).fancytree({
                extensions: ["themeroller"],
                themeroller: {
                    activeClass: "my-fancytree-active",
                    hoverClass: "",
                },
                source: mem_src,
                nodata: false,
                selectMode: 1,
                checkbox: false,
                activate: function (event, data) {
                    $("#rem_mem_btn", frame).button("option", "disabled", false);
                },
            });

            $("#proj_adm_tree", frame).fancytree({
                extensions: ["themeroller"],
                themeroller: {
                    activeClass: "my-fancytree-active",
                    hoverClass: "",
                },
                source: adm_src,
                nodata: false,
                selectMode: 1,
                checkbox: false,
                activate: function (event, data) {
                    if ((a_upd_perms & model.PERM_WR_REC) != 0) {
                        $("#rem_adm_btn", frame).button("option", "disabled", false);
                    }
                },
            });

            var mem_tree = $.ui.fancytree.getTree("#proj_mem_tree");
            var adm_tree = $.ui.fancytree.getTree("#proj_adm_tree");
            var uid;

            $("#add_mem_btn", frame).click(function () {
                var excl = [proj.owner];
                adm_tree.visit(function (node) {
                    excl.push(node.key);
                });
                mem_tree.visit(function (node) {
                    excl.push(node.key);
                });

                dlgPickUser.show("u/" + settings.user.uid, excl, false, function (uids) {
                    for (i in uids) {
                        uid = uids[i];
                        mem_tree.rootNode.addNode({ title: uid.substr(2), icon: false, key: uid });
                    }
                });
            });

            $("#rem_mem_btn", frame).click(function () {
                var node = mem_tree.getActiveNode();
                if (node) {
                    node.remove();
                    $("#rem_mem_btn", frame).button("option", "disabled", true);
                }
            });

            $("#add_adm_btn", frame).click(function () {
                var excl = [proj.owner];
                adm_tree.visit(function (node) {
                    console.log("excl adm:", node.key);
                    excl.push(node.key);
                });
                mem_tree.visit(function (node) {
                    console.log("excl mem:", node.key);
                    excl.push(node.key);
                });
                console.log("excl:", excl);
                dlgPickUser.show("u/" + settings.user.uid, excl, false, function (uids) {
                    console.log("sel:", uids);
                    for (i in uids) {
                        uid = uids[i];

                        adm_tree.rootNode.addNode({ title: uid.substr(2), icon: false, key: uid });
                    }
                });
            });

            $("#rem_adm_btn", frame).click(function () {
                var node = adm_tree.getActiveNode();
                if (node) {
                    node.remove();
                    $("#rem_adm_btn", frame).button("option", "disabled", true);
                }
            });

            $(".btn", frame).button();
        },
        close: function (ev, ui) {
            $(this).dialog("destroy").remove();
        },
    };

    if (a_data) {
        api.allocListBySubject(a_data.id, null, function (ok, data) {
            var html = "";
            if (ok && data.length) {
                var alloc;
                for (var i = 0; i < data.length; i++) {
                    alloc = data[i];
                    html += "<option value='" + alloc.repo + "'";
                    if (i == 0) {
                        html += " selected";
                        def_alloc = alloc.repo;
                    }
                    html +=
                        ">" +
                        alloc.repo.substr(5) +
                        " (" +
                        util.sizeToString(alloc.dataSize) +
                        " / " +
                        util.sizeToString(alloc.dataLimit) +
                        ")</option>";
                }
            }

            $("#def_alloc", frame).html(html);

            frame.dialog(options);
        });
    } else {
        frame.dialog(options);
    }
}
