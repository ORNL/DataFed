import * as api from "./api.js";
import * as util from "./util.js";
import * as dialogs from "./dialogs.js";
import * as dlgRepoEdit from "./dlg_repo_edit.js";

export function show() {
    var content =
        "<div class='col-flex' style='height:100%'>\
            <div style='flex:none;padding:.5rem 0 0 0'>Repositories:</div>\
            <div class='ui-widget-content text' style='flex:1 1 100%;overflow:auto'>\
                <div id='dlg_repo_tree' class='no-border'></div>\
            </div>\
            <div style='flex:none;white-space:nowrap;padding:.25rem 0 0 0'>\
                <button id='dlg_add_repo' class='btn small'>New</button>\
                <button id='dlg_edit_repo' class='btn small' disabled>Edit</button>\
                <button id='dlg_rem_repo' class='btn small' disabled>Delete</button>\
            </div>\
        </div>";

    var frame = $(document.createElement("div"));
    frame.html(content);
    var tree;

    function addRepo() {
        console.log("Add repo");
        dlgRepoEdit.show(null, function () {
            util.setStatusText("Repo created");
            refreshRepoList();
        });
    }

    function remRepo() {
        console.log("Remove repo");
        var node = tree.getActiveNode();
        if (node) {
            dialogs.dlgConfirmChoice(
                "Confirm Delete",
                "Delete repo " +
                    node.key.substr(5) +
                    "? All associated data and allocations must be purged before repo can be deleted.",
                ["Cancel", "Delete"],
                function (choice) {
                    if (choice == 1) {
                        api.repoDelete(node.key);
                        util.setStatusText("Repo deleted");
                        refreshRepoList();
                    }
                },
            );
        }
    }

    function editRepo() {
        console.log("Edit repo");
        var node = tree.getActiveNode();
        if (node) {
            dlgRepoEdit.show(node.key, function () {
                util.setStatusText("Repo updated");
                refreshRepoList();
            });
        }
    }

    function refreshRepoList() {
        api.repoList(false, true, function (ok, data) {
            if (!ok) {
                dialogs.dlgAlert("Repo List Error", data);
                return;
            }

            //console.log( "repo list:", ok, data );
            var src = [];
            var repo;
            for (var i in data) {
                repo = data[i];
                src.push({
                    title: repo.id + " (" + repo.domain + ")",
                    folder: true,
                    lazy: true,
                    icon: false,
                    key: repo.id,
                });
            }
            tree.reload(src);
        });
    }

    $("#dlg_add_repo", frame).click(addRepo);
    $("#dlg_edit_repo", frame).click(editRepo);
    $("#dlg_rem_repo", frame).click(remRepo);

    var options = {
        title: "Manage Data Repositories",
        modal: true,
        width: 500,
        height: 400,
        resizable: true,
        buttons: [
            {
                text: "Close",
                click: function () {
                    $(this).dialog("close");
                },
            },
        ],
        open: function (event, ui) {
            api.repoList(false, true, function (ok, data) {
                if (!ok) {
                    dialogs.dlgAlert("Repo List Error", data);
                    return;
                }

                console.log("repo list:", ok, data);
                var src = [];
                var repo;
                for (var i in data) {
                    repo = data[i];
                    src.push({
                        title: repo.id + " (" + repo.domain + ")",
                        folder: true,
                        lazy: true,
                        icon: false,
                        key: repo.id,
                    });
                }

                $("#dlg_repo_tree", frame).fancytree({
                    extensions: ["themeroller"],
                    themeroller: {
                        activeClass: "my-fancytree-active",
                        hoverClass: "",
                    },
                    source: src,
                    selectMode: 1,
                    lazyLoad: function (event, data) {
                        data.result = { url: api.repoView_url(data.node.key), cache: false };
                    },
                    postProcess: function (event, data) {
                        if (data.node.lazy && data.response.length) {
                            console.log("resp:", data.response);
                            data.result = [];
                            var repo = data.response[0];
                            if (repo.title)
                                data.result.push({
                                    title: "title: " + util.escapeHTML(repo.title),
                                    icon: false,
                                });
                            if (repo.desc)
                                data.result.push({
                                    title: "desc: " + util.escapeHTML(repo.desc),
                                    icon: false,
                                });
                            if (repo.capacity)
                                data.result.push({
                                    title: "capacity: " + util.sizeToString(repo.capacity),
                                    icon: false,
                                });
                            //var adm;
                            //for ( var i in data.response.admin ) {
                            //    adm = data.response.admin[i];
                            //    data.result.push( { title: mem.substr(2), icon: false, checkbox: false,key:mem } );
                            // }
                        }
                    },
                    activate: function (ev, data) {
                        if (data.node.key.startsWith("repo/")) {
                            $("#dlg_edit_repo", frame).button("enable");
                            $("#dlg_rem_repo", frame).button("enable");
                        } else {
                            $("#dlg_edit_repo", frame).button("disable");
                            $("#dlg_rem_repo", frame).button("disable");
                        }
                    },
                });

                tree = $.ui.fancytree.getTree($("#dlg_repo_tree", frame));
            });
        },
        close: function (ev, ui) {
            $(this).dialog("destroy").remove();
        },
    };

    frame.dialog(options);
    $(".btn", frame).button();
}
