import * as settings from "./settings.js";
import * as api from "./api.js";
import * as util from "./util.js";
import * as model from "./model.js";

var tree;

window.projPageLoad = function (key, offset) {
    var node = tree.getNodeByKey(key);
    if (node) {
        node.data.offset = offset;
        setTimeout(function () {
            node.load(true);
        }, 0);
    }
};

export function show(a_excl, a_single_sel, cb) {
    var frame = $(document.createElement("div"));
    frame.html(
        "<div class='content text' style='height:98%;overflow:auto'>\
            <div id='dlg_proj_tree' class='content no-border'></div>\
        </div>",
    );

    var options = {
        title: "Select Project(s)",
        modal: true,
        width: 400,
        height: 500,
        resizable: true,
        buttons: [
            {
                text: "Cancel",
                click: function () {
                    $(this).dialog("close");
                },
            },
            {
                id: "ok_btn",
                text: "Ok",
                click: function () {
                    var key,
                        users = [],
                        sel = tree.getSelectedNodes();

                    for (var i in sel) {
                        key = sel[i].key;
                        if (users.indexOf(key) == -1) users.push(key);
                    }
                    cb(users);
                    $(this).dialog("close");
                },
            },
        ],
        open: function () {
            $("#ok_btn").button("disable");
        },
        close: function (ev, ui) {
            $(this).dialog("destroy").remove();
        },
    };

    var src = [
        {
            title: "All By ID",
            icon: "ui-icon ui-icon-folder",
            folder: true,
            lazy: true,
            checkbox: false,
            key: "all-id",
            offset: 0,
        },
        {
            title: "All By Title",
            icon: "ui-icon ui-icon-folder",
            folder: true,
            lazy: true,
            checkbox: false,
            key: "all-title",
            offset: 0,
        },
    ];

    $("#dlg_proj_tree", frame).fancytree({
        extensions: ["themeroller"],
        themeroller: {
            activeClass: "my-fancytree-active",
            hoverClass: "",
        },
        source: src,
        nodata: false,
        selectMode: a_single_sel ? 1 : 2,
        select: function () {
            if (tree.getSelectedNodes().length) {
                $("#ok_btn").button("enable");
            } else {
                $("#ok_btn").button("disable");
            }
        },
        checkbox: true,
        lazyLoad: function (event, data) {
            data.result = {
                url: api.projList_url(
                    false,
                    false,
                    false,
                    data.node.key == "all-id" ? model.SORT_ID : model.SORT_TITLE,
                    data.node.data.offset,
                    settings.opts.page_sz,
                ),
                cache: false,
            };
        },
        postProcess: function (event, data) {
            if (data.node.lazy) {
                console.log("post proc", data.response);
                data.result = [];
                var proj, i;
                if (data.node.key == "all-title") {
                    for (i in data.response.item) {
                        proj = data.response.item[i];
                        data.result.push({
                            title: '"' + util.escapeHTML(proj.title) + '"  (' + proj.id + ")",
                            icon: "ui-icon ui-icon-box",
                            key: proj.id,
                            unselectable: a_excl.indexOf(proj.id) != -1,
                        });
                    }
                } else {
                    for (i in data.response.item) {
                        proj = data.response.item[i];
                        data.result.push({
                            title: proj.id + '  ("' + util.escapeHTML(proj.title) + ')"',
                            icon: "ui-icon ui-icon-box",
                            key: proj.id,
                            unselectable: a_excl.indexOf(proj.id) != -1,
                        });
                    }
                }

                if (
                    data.response.offset > 0 ||
                    data.response.total > data.response.offset + data.response.count
                ) {
                    var pages = Math.ceil(data.response.total / settings.opts.page_sz);
                    var page = 1 + data.response.offset / settings.opts.page_sz;
                    data.result.push({
                        title:
                            "<button id='first_page_proj' class='btn small'" +
                            (page == 1 ? " disabled" : "") +
                            " >First</button> " +
                            "<button id='back_page_proj' class='btn small'" +
                            (page == 1 ? " disabled" : "") +
                            " >Prev</button> " +
                            "Page " +
                            page +
                            " of " +
                            pages +
                            " <button id='forward_page_proj' class='btn small'" +
                            (page == pages ? " disabled" : "") +
                            " >Next</button> " +
                            "<button id='last_page_proj' class='btn small'" +
                            (page == pages ? " disabled" : "") +
                            " >Last</button>",
                        folder: false,
                        icon: false,
                        checkbox: false,
                        hasBtn: true,
                    });

                    data.node.page = page;
                    data.node.pages = pages;
                }
            }
        },
        renderNode: function (ev, data) {
            if (data.node.data.hasBtn) {
                $(".btn", data.node.li).button();
                $("#first_page_proj", data.node.span).click(function () {
                    projPageLoad(data.node.parent.key, 0);
                });
                $("#back_page_proj", data.node.span).click(function () {
                    projPageLoad(
                        data.node.parent.key,
                        (data.node.parent.page - 2) * settings.opts.page_sz,
                    );
                });
                $("#forward_page_proj", data.node.span).click(function () {
                    projPageLoad(
                        data.node.parent.key,
                        data.node.parent.page * settings.opts.page_sz,
                    );
                });
                $("#last_page_proj", data.node.span).click(function () {
                    projPageLoad(
                        data.node.parent.key,
                        (data.node.parent.pages - 1) * settings.opts.page_sz,
                    );
                });
            }
        },
    });

    tree = $.ui.fancytree.getTree($("#dlg_proj_tree", frame));

    frame.dialog(options);
}
