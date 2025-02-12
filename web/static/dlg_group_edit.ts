import * as util from "./util.js";
import * as api from "./api.js";
import * as dialogs from "./dialogs.js";
import * as dlgPickUser from "./dlg_pick_user.js";

export function show(a_uid, a_excl, a_group, cb) {
    const content =
        "<div class='col-flex' style='height:100%'>\
            <div style='flex:none'>\
                <table style='width:100%'>\
                <tr><td>ID:</td><td><input type='text' id='gid' style='width:100%'></input></td></tr>\
                <tr><td>Title:</td><td><input type='text' id='title' style='width:100%'></input></td></tr>\
                <tr><td >Description:</td><td><textarea id='desc' rows=3 style='width:100%'></textarea></td></tr>\
                </table>\
            </div>\
            <div style='flex:none'>Members:</div>\
            <div class='content text' style='flex:1 1 100%;overflow:auto'>\
                <div id='member_list' class='content no-border' style='overflow:auto'></div>\
            </div>\
            <div style='flex:none;padding:.25rem'><button id='btn_add' class='btn small'>Add</button>&nbsp<button id='btn_remove' class='btn small'>Remove</button>&nbsp<button id='btn_clear' class='btn small'>Clear</button></div>\
            </div>\
        </div>";

    var frame = $(document.createElement("div"));
    frame.html(content);

    function removeUser() {
        var node = mem_tree.getActiveNode();
        if (node) {
            var i = group.member.indexOf(node.key);
            if (i > -1) {
                group.member.splice(i, 1);
                node.remove();
            }
            $("#btn_remove", frame).button("disable");
            if (group.member.length == 0) $("#btn_clear", frame).button("enable");
        }
    }

    function addUsers() {
        var excl = [...a_excl, ...group.member];
        dlgPickUser.show(a_uid, excl, false, function (uids) {
            if (uids.length > 0) {
                var i, id;
                for (i in uids) {
                    id = uids[i];
                    if (a_excl.indexOf(id) == -1 && !mem_tree.getNodeByKey(id)) {
                        mem_tree.rootNode.addNode({
                            title: util.escapeHTML(id.substr(2)),
                            icon: false,
                            key: id,
                        });
                        group.member.push(id);
                    }
                }
                if (group.member.length) $("#btn_clear", frame).button("enable");
            }
        });
    }

    function clearUsers() {
        group.member = [];
        mem_tree.clear();
        $("#btn_clear", frame).button("disable");
        $("#btn_remove", frame).button("disable");
    }

    function userSelected() {
        $("#btn_remove", frame).button("enable");
    }

    $(".btn", frame).button();
    util.inputTheme($("input", frame));
    util.inputTheme($("textarea", frame));

    var group,
        src = [];

    if (a_group) {
        if (!a_group.member) a_group.member = [];

        group = jQuery.extend(true, {}, a_group);

        util.inputDisable($("#gid", frame)).val(group.gid);
        $("#title", frame).val(group.title);
        $("#desc", frame).val(group.desc);

        if (group.member && group.member.length) {
            $("#btn_clear", frame).button("enable");

            for (var i in group.member) {
                src.push({
                    title: util.escapeHTML(group.member[i].substr(2)),
                    icon: false,
                    key: group.member[i],
                });
            }
        } else {
            group.member = [];
            $("#btn_clear", frame).button("disable");
        }
    } else {
        group = { member: [] };
        $("#btn_clear", frame).button("disable");
    }

    $("#btn_remove", frame).button("disable");

    $("#member_list", frame).fancytree({
        extensions: ["themeroller"],
        themeroller: {
            activeClass: "my-fancytree-active",
            hoverClass: "",
        },
        source: src,
        selectMode: 1,
        nodata: false,
        activate: function (event, data) {
            userSelected();
        },
    });

    var mem_tree = $.ui.fancytree.getTree($("#member_list", frame));

    var options = {
        title: a_group ? "Edit Group '" + util.escapeHTML(a_group.gid) + "'" : "New Group",
        modal: true,
        width: 600,
        height: 450,
        resizable: true,
        buttons: [
            {
                text: "Cancel",
                click: function () {
                    $(this).dialog("close");
                    cb();
                },
            },
            {
                text: "Ok",
                click: function () {
                    group.gid = $("#gid", frame).val();
                    group.title = $("#title", frame).val();
                    group.desc = $("#desc", frame).val();

                    var i,
                        uid,
                        dlg_inst = $(this);

                    if (a_group) {
                        if (a_group.title == group.title) delete group.title;
                        if (a_group.desc == group.desc) delete group.desc;

                        group.add = [];
                        group.rem = [];

                        for (i in group.member) {
                            uid = group.member[i];
                            if (a_group.member.indexOf(uid) == -1) {
                                group.add.push(uid);
                            }
                        }

                        for (i in a_group.member) {
                            uid = a_group.member[i];
                            if (group.member.indexOf(uid) == -1) {
                                group.rem.push(uid);
                            }
                        }

                        api.groupUpdate(group, function (ok, data) {
                            if (!ok) {
                                dialogs.dlgAlert("Server Error", data);
                            } else {
                                dlg_inst.dialog("close");
                                cb(data);
                            }
                        });
                    } else {
                        api.groupCreate(a_uid, group, function (ok, data) {
                            if (!ok) {
                                dialogs.dlgAlert("Server Error", data);
                            } else {
                                dlg_inst.dialog("close");
                                cb(data);
                            }
                        });
                    }
                },
            },
        ],
        open: function (event, ui) {},
        close: function (ev, ui) {
            $(this).dialog("destroy").remove();
        },
    };

    $("#btn_remove", frame).click(function () {
        removeUser();
    });
    $("#btn_clear", frame).click(function () {
        clearUsers();
    });
    $("#btn_add", frame).click(function () {
        addUsers();
    });

    frame.dialog(options);
}
