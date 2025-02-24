import * as util from "./util.js";
import * as api from "./api.js";

export function show(a_ep, a_path, a_mode, a_cb) {
    var frame = $(document.createElement("div"));

    frame.html(
        "<div class='col-flex' style='height:100%'>\
                    <div style='flex:none'>\
                        <div class='row-flex' style='align-items:center'>\
                            <div style='flex:none'>Path:&nbsp</div>\
                            <div style='flex:auto'><input type='text' id='path' style='width:100%'></input></div>\
                            <div style='flex:none'>&nbsp<button id='up' class='btn small'>Up</button></div>\
                        </div>\
                    </div>\
                    <div style='flex:none;padding:.25em'></div>\
                    <div class='ui-widget-content content' style='flex:1 1 100%;min-height:0;overflow:auto'>\
                        <table id='file_tree'>\
                            <colgroup><col width='*'></col><col></col><col></col></colgroup>\
                            <tbody><tr><td style='white-space: nowrap;padding: 0 2em 0 0'></td><td style='white-space: nowrap;padding: 0 2em 0 0'></td><td style='white-space: nowrap'></td></tr></tbody>\
                        </table>\
                    </div>\
                </div>",
    );

    var path = a_path;
    var path_in_timer;
    var loading = false;

    $(".btn", frame).button();
    util.inputTheme($("input:text", frame));
    $("#path", frame).val(a_path);
    $(".btn", frame).button();

    $("#up", frame).on("click", function () {
        chdir("..");
    });

    function chdir(a_new_path) {
        if (a_new_path == ".") return;

        clearTimeout(path_in_timer);

        // Ensure path has a terminal /
        if (path.charAt(path.length - 1) != "/") path += "/";

        var new_path;
        if (a_new_path == "..") {
            if (path.length == 1) {
                return;
            }

            var idx = path.lastIndexOf("/", path.length - 2);

            if (idx > 0) new_path = path.substr(0, idx + 1);
            else new_path = "/";
        } else {
            new_path = path + a_new_path + "/";
        }
        //console.log("reload to:",new_path);

        reloadTree(new_path);
        path = new_path;
        $("#path", frame).val(new_path);
    }

    function reloadTree(a_new_path) {
        loading = true;
        $("#sel_btn").button("disable");
        $("#file_tree").fancytree("disable");

        api.epDirList(a_ep.id, a_new_path, false, function (data) {
            if (data) {
                //console.log("got result:",data);

                var tree_source = [];
                if (data.code) {
                    tree_source.push({
                        title: "<span class='ui-state-error'>Error: " + data.message + "</span>",
                        icon: false,
                        is_dir: true,
                    });
                } else {
                    tree_source.push({
                        title: ".",
                        icon: "ui-icon ui-icon-folder",
                        key: ".",
                        is_dir: true,
                    });
                    tree_source.push({
                        title: "..",
                        icon: "ui-icon ui-icon-folder",
                        key: "..",
                        is_dir: true,
                    });
                    var entry, dt, tstr;
                    for (var i in data.DATA) {
                        entry = data.DATA[i];

                        if (entry.type == "dir") {
                            tree_source.push({
                                title: entry.name,
                                icon: "ui-icon ui-icon-folder",
                                key: entry.name,
                                is_dir: true,
                            });
                        } else if (entry.type == "file") {
                            //vals = entry.last_modified.split(/[-: +]/);
                            tstr = entry.last_modified.replace(" ", "T");
                            //console.log("date:",tstr);
                            dt = new Date(tstr).toLocaleString();
                            tree_source.push({
                                title: entry.name,
                                size: util.sizeToString(entry.size),
                                date: dt,
                                icon: "ui-icon ui-icon-file",
                                key: entry.name,
                            });
                        }
                    }
                }
                $.ui.fancytree.getTree("#file_tree").reload(tree_source);
            }

            loading = false;
            $("#file_tree").fancytree("enable");
        });
    }

    var options = {
        title: "Browse End-Point " + a_ep.name,
        modal: true,
        width: "500",
        height: "400",
        resizable: true,
        buttons: [
            {
                text: "Cancel",
                click: function () {
                    clearTimeout(path_in_timer);
                    $(this).dialog("close");
                },
            },
            {
                id: "sel_btn",
                text: "Select",
                click: function () {
                    clearTimeout(path_in_timer);
                    if (a_cb) {
                        var node = $.ui.fancytree.getTree("#file_tree").activeNode;
                        if (node) {
                            a_cb(
                                path +
                                    (path.charAt(path.length - 1) == "/" ? "" : "/") +
                                    (node.key == "." ? "" : node.key),
                            );
                            $(this).dialog("close");
                        }
                    }
                },
            },
        ],
        open: function () {
            $("#file_tree").fancytree({
                extensions: ["themeroller", "table"],
                themeroller: {
                    activeClass: "my-fancytree-active",
                    hoverClass: "",
                },
                table: {
                    //indentation: 20,
                    nodeColumnIdx: 0,
                    //checkboxColumnIdx: 0  // render the checkboxes into the 1st column
                },
                renderColumns: function (ev, data) {
                    var node = data.node,
                        $tdList = $(node.tr).find(">td");

                    // Make the title cell span the remaining columns if it's a folder:
                    if (node.data.is_dir) {
                        $tdList.eq(0).prop("colspan", 3).nextAll().remove();
                        return;
                    }

                    // ...otherwise render remaining columns

                    $tdList.eq(1).text(node.data.size);
                    $tdList.eq(2).text(node.data.date);
                },
                checkbox: false,
                source: [{ title: "loading...", icon: false, is_dir: true }],
                selectMode: 1,
                nodata: false,
                activate: function (ev, data) {
                    data.node.setSelected(true);
                    if (
                        (data.node.data.is_dir && a_mode == "dir" && data.node.key != "..") ||
                        (!data.node.data.is_dir && a_mode == "file")
                    )
                        $("#sel_btn").button("enable");
                    else $("#sel_btn").button("disable");
                },
                dblclick: function (event, data) {
                    if (data.node.data.is_dir && !loading) {
                        chdir(data.node.key);
                    }
                },
            });

            reloadTree(a_path);

            $("#path", frame).on("input", function () {
                clearTimeout(path_in_timer);
                path_in_timer = setTimeout(function () {
                    path = $("#path", frame).val();
                    reloadTree(path);
                }, 1000);
            });
        },
        close: function (ev, ui) {
            $(this).dialog("destroy").remove();
        },
    };

    frame.dialog(options);
}
