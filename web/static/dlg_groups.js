import * as api from "./api.js";
import * as util from "./util.js";
import * as dialogs from "./dialogs.js";
import * as dlgGroupEdit from "./dlg_group_edit.js";

export function show(a_uid, a_excl, cb, select) {
    const content =
        "<div class='col-flex' style='height:100%'>\
            <div style='flex:none;padding:.5rem 0 0 0'>Groups:</div>\
            <div class='content text' style='flex:1 1 100%;overflow:auto'>\
                <div id='dlg_group_tree' class='content no-border'></div>\
            </div>\
            <div style='flex:none;white-space:nowrap;padding:.25rem 0 0 0'>\
                <button id='dlg_add_grp' class='btn small'>New</button>\
                <button id='dlg_edit_grp' class='btn small' disabled>Edit</button>\
                <button id='dlg_rem_grp' class='btn small' disabled>Delete</button>\
            </div>\
        </div>";

    var frame = $(document.createElement("div"));
    frame.html(content);
    var group_tree;

    $("#dlg_add_grp", frame).click(addGroup);
    $("#dlg_edit_grp", frame).click(editGroup);
    $("#dlg_rem_grp", frame).click(remGroup);

    function selectNone() {
        $("#dlg_edit_grp", frame).prop("disabled", true);
        $("#dlg_rem_grp", frame).prop("disabled", true);
    }

    function addGroup() {
        dlgGroupEdit.show(a_uid, a_excl, null, function (group) {
            if (group) {
                var node = group_tree.rootNode.addNode({
                    title: util.escapeHTML(group.title) + " (" + util.escapeHTML(group.gid) + ")",
                    folder: true,
                    lazy: true,
                    icon: false,
                    key: "g/" + group.gid,
                });
                if (select) node.setSelected();
            }
        });
    }

    function remGroup() {
        var node = group_tree.getActiveNode();
        if (node) {
            dialogs.dlgConfirmChoice(
                "Confirm Delete",
                "Delete group '" + node.key.substr(2) + "'?",
                ["Cancel", "Delete"],
                function (choice) {
                    if (choice == 1) {
                        api.groupDelete(a_uid, node.key.substr(2), function (ok, data) {
                            if (ok) {
                                node.remove();
                                selectNone();
                            } else {
                                dialogs.dlgAlert("Group Delete Error", data);
                            }
                        });
                    }
                },
            );
        }
    }

    function editGroup() {
        var node = group_tree.getActiveNode();
        if (node) {
            api.groupView(a_uid, node.key.substr(2), function (ok, group) {
                if (ok) {
                    dlgGroupEdit.show(a_uid, a_excl, group, function (group_new) {
                        if (group_new) {
                            node.setTitle(
                                util.escapeHTML(group_new.title) +
                                    " (" +
                                    util.escapeHTML(group_new.gid) +
                                    ")",
                            );
                            node.resetLazy();
                        }
                    });
                } else {
                    dialogs.dlgAlert("Edit Group Error", group);
                }
            });
        }
    }

    var options = {
        title: select ? "Select Group(s)" : "Manage Groups",
        modal: true,
        width: 500,
        height: 400,
        resizable: true,
        buttons: [
            {
                text: select ? "Ok" : "Close",
                click: function () {
                    if (select && cb) {
                        var groups = [];
                        var sel = group_tree.getSelectedNodes();
                        for (var i in sel) {
                            groups.push(sel[i].key);
                        }
                        cb(groups);
                    } else if (cb) cb();

                    $(this).dialog("close");
                },
            },
        ],
        open: function (ev, ui) {
            api.groupList(a_uid, function (ok, data) {
                console.log("grpList", ok, data);
                if (!ok) {
                    dialogs.dlgAlert("Error Loading Groups", data);
                    $(this).dialog("close");
                    return;
                }

                var src = [];
                var group;
                for (var i in data) {
                    group = data[i];
                    if (a_excl.indexOf("g/" + group.gid) == -1)
                        src.push({
                            title: util.escapeHTML(group.title) + " (" + group.gid + ")",
                            folder: true,
                            lazy: true,
                            icon: false,
                            key: "g/" + group.gid,
                        });
                }

                $("#dlg_group_tree", frame).fancytree({
                    extensions: ["themeroller"],
                    themeroller: {
                        activeClass: "my-fancytree-active",
                        hoverClass: "",
                    },
                    source: src,
                    selectMode: select ? 2 : 1,
                    checkbox: select,
                    nodata: false,
                    lazyLoad: function (event, data) {
                        data.result = {
                            url: api.groupView_url(a_uid, data.node.key.substr(2)),
                            cache: false,
                        };
                    },
                    postProcess: function (event, data) {
                        if (data.node.lazy) {
                            console.log("post grp:", data);
                            data.result = [];
                            var mem,
                                grp = data.response.group[0];
                            if (grp.desc)
                                data.result.push({
                                    title: "[" + util.escapeHTML(grp.desc) + "]",
                                    icon: false,
                                    checkbox: false,
                                    key: "desc",
                                });

                            for (var i in grp.member) {
                                mem = grp.member[i];
                                data.result.push({
                                    title: mem.substr(2),
                                    icon: false,
                                    checkbox: false,
                                    key: mem,
                                });
                            }
                        }
                    },
                    activate: function (event, data) {
                        if (data.node.key.startsWith("g/")) {
                            $("#dlg_edit_grp", frame).button("enable");
                            $("#dlg_rem_grp", frame).button("enable");
                        } else {
                            $("#dlg_edit_grp", frame).button("disable");
                            $("#dlg_rem_grp", frame).button("disable");
                        }
                    },
                });

                group_tree = $.ui.fancytree.getTree($("#dlg_group_tree", frame));
            });
        },
        close: function (ev, ui) {
            $(this).dialog("destroy").remove();
        },
    };
    if (select) {
        options.buttons.push({
            text: "Cancel",
            click: function () {
                cb();
                $(this).dialog("close");
            },
        });
    }

    frame.dialog(options);
    $(".btn", frame).button();
}
