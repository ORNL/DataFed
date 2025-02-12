import * as settings from "./settings.js";
import * as model from "./model.js";
import * as util from "./util.js";
import * as api from "./api.js";
import * as dialogs from "./dialogs.js";
import * as dlgPickUser from "./dlg_pick_user.js";
import * as dlgSchema from "./dlg_schema.js";

var tree, dlg_inst, frame;

window.schemaPageLoad = function (key, offset) {
    var node = tree.getNodeByKey(key);
    if (node) {
        node.data.offset = offset;
        setTimeout(function () {
            node.load(true);
        }, 0);
    }
};

function loadSchemas() {
    var tmp,
        par = {};

    tmp = $("#srch_id", frame).val().trim();
    if (tmp) par.id = tmp;

    tmp = $("#srch_txt", frame).val().trim();
    if (tmp) par.text = tmp;

    tmp = $("#srch_owner", frame).val().trim();
    if (tmp) par.owner = tmp;

    par.sort = $("#srch_sort", frame).val();
    if (par.sort < 0) {
        par.sortRev = true;
        par.sort = -par.sort;
    }
    par.sort--;

    //console.log("search",par);

    api.schemaSearch(par, function (ok, data) {
        if (ok) {
            //console.log( "sch res: ", data );
            var src = [];
            if (data.schema) {
                var sch;
                for (var i in data.schema) {
                    sch = data.schema[i];
                    //src.push({ title: sch.id + (sch.ver?"-"+sch.ver:"") + (sch.cnt?" (" + sch.cnt + ")":"") + (sch.ownNm?" " + sch.ownNm:"") + (sch.ownId?" (" + sch.ownId +")":""), key: sch.id + ":" + sch.ver });
                    src.push({
                        title:
                            sch.id +
                            ":" +
                            sch.ver +
                            (sch.cnt ? " (" + sch.cnt + ")" : "") +
                            (sch.ref ? " (R)" : ""),
                        own_nm: util.escapeHTML(sch.ownNm),
                        own_id: sch.ownId.substr(2),
                        id: sch.id,
                        ver: sch.ver,
                        cnt: sch.cnt,
                        ref: sch.ref,
                        key: sch.id + ":" + sch.ver,
                    });
                }
            } else {
                src.push({ title: "(no matches)" });
            }
            tree.reload(src);
        } else {
            dialogs.dlgAlert("Schema Search Error", data);
        }
    });
}

function getSelSchema(a_cb, a_resolve) {
    var data = tree.getSelectedNodes()[0].data;
    api.schemaView(data.id + ":" + data.ver, a_resolve, function (ok, reply) {
        //console.log("schema",reply);
        if (ok && reply.schema) {
            a_cb(reply.schema[0]);
        } else {
            dialogs.dlgAlert("Schema Load Error", reply);
        }
    });
}

export function show(a_select, a_resolve, a_cb) {
    var ele = document.createElement("div");
    ele.id = "dlg_schema_list";

    frame = $(ele);

    frame.html(
        "<div class='col-flex' style='height:100%'>\
            <div style='flex:3 3 75%;overflow:auto;padding:0' class='ui-widget ui-widget-content content'>\
                <table id='sch_tree'>\
                    <colgroup><col width='*'></col><col></col><col></col></colgroup>\
                    <tbody><tr><td style='white-space: nowrap;padding: 0 2em 0 0'></td><td style='white-space: nowrap;padding: 0 2em 0 0'></td></tr></tbody>\
                </table>\
            </div>\
            <div style='flex:none;padding-top:0.5em'>\
                <button id='sch_new' class='btn' title='Create new schema'>New</button>\
                <button id='sch_view' class='btn btn-any' title='View schema details' disabled>View</button>\
                <button id='sch_edit' class='btn btn-own-unused' title='Edit schema' disabled>Edit</button>\
                <button id='sch_rev' class='btn btn-own' title='Create new revision of schema' disabled>Revise</button>\
                <button id='sch_del' class='btn btn-own-unused' title='Delete schema' disabled>Delete</button>\
            </div>\
            <div style='flex:none;padding-top:0.5em'>Search Options:</div>\
            <div style='flex:none;padding:0.5em 0 0 0.5em'>\
                <table style='width:100%'>\
                    <tr><td>ID:</td><td colspan='5'><input id='srch_id' type='text' style='width:100%;box-sizing:border-box'></input></td></tr>\
                    <tr><td>Text:</td><td colspan='5'><input id='srch_txt' type='text' style='width:100%;box-sizing:border-box'></input></td></tr>\
                    <tr><td>Owner:</td><td colspan='4'><input id='srch_owner' type='text' style='width:100%;box-sizing:border-box'></input></td>\
                        <td style='width:0'><button title='Select user' id='pick_user' class='btn btn-icon-tiny'><span class='ui-icon ui-icon-person'></span></button></td></tr>\
                    <tr>\
                        <td>Sort&nbsp;By:</td><td colspan='2' style='width:100%'>\
                            <select id='srch_sort'>\
                                <option value='" +
            (model.SORT_ID + 1) +
            "' selected>ID</option>\
                                <option value='-" +
            (model.SORT_ID + 1) +
            "'>ID (reverse)</option>\
                                <option value='" +
            (model.SORT_OWNER + 1) +
            "'>Owner</option>\
                                <option value='-" +
            (model.SORT_OWNER + 1) +
            "'>Owner (reverse)</option>\
                                <option value='" +
            (model.SORT_RELEVANCE + 1) +
            "'>Relevance</option>\
                            </select>\
                        </td>\
                        <td>\
                            <button class='btn' id='reset_btn'>Reset</button>\
                        </td>\
                        <td colspan='2'>\
                            <button class='btn' id='srch_btn'>Search</button>\
                        </td>\
                    </tr>\
                </table>\
            </div>\
        </div>",
    );

    var dlg_opts = {
        title: a_select ? "Select Schema" : "Manage Schemas",
        modal: false,
        width: 600,
        height: 500,
        resizable: true,
        buttons: [],
        open: function (event, ui) {
            dlg_inst = $(this);

            $(".btn", frame).button();
            if (a_select) {
                $("#dlg_sch_list_ok_btn").button("disable");
            }
            $("#srch_sort", frame).selectmenu();
        },
        close: function (ev, ui) {
            dlg_inst.dialog("destroy").remove();
        },
    };

    if (a_select) {
        dlg_opts.buttons.push({
            text: "Cancel",
            click: function () {
                dlg_inst.dialog("close");
            },
        });
    }

    dlg_opts.buttons.push({
        id: "dlg_sch_list_ok_btn",
        text: a_select ? "Select" : "Close",
        click: function () {
            if (a_select && a_cb) {
                getSelSchema(function (schema) {
                    a_cb(schema);
                    dlg_inst.dialog("close");
                }, a_resolve);
            } else {
                dlg_inst.dialog("close");
            }
        },
    });

    util.inputTheme($("input:text", frame));
    //var search_input = $("#search_input",frame);

    var src = [{ title: "Loading...", icon: false, folder: false }];

    $("#sch_tree", frame).fancytree({
        extensions: ["themeroller", "table"],
        themeroller: {
            activeClass: "my-fancytree-active",
            hoverClass: "",
        },
        table: {
            nodeColumnIdx: 0,
        },
        source: src,
        nodata: false,
        selectMode: 1,
        icon: false,
        checkbox: false,
        activate: function (ev, data) {
            data.node.setSelected(true);
            $(".btn-any", frame).button("enable");
            if (data.node.data.own_id == settings.user.uid) {
                $(".btn-own", frame).button("enable");
                $(".btn-own-unused", frame).button(
                    data.node.data.cnt == 0 && !data.node.data.ref ? "enable" : "disable",
                );
            } else {
                $(".btn-own,.btn-own-unused", frame).button("disable");
            }

            if (a_select) {
                $("#dlg_sch_list_ok_btn").button("enable");
            }
        },
        renderColumns: function (ev, data) {
            var node = data.node,
                $tdList = $(node.tr).find(">td");

            //$tdList.eq(1).text(node.data.own_nm);
            if (node.data.own_nm) {
                $tdList
                    .eq(1)
                    .html("<span title='" + node.data.own_id + "'>" + node.data.own_nm + "</span>");
            }
            //$tdList.eq(2).text(node.data.own_id?"("+node.data.own_id+")":"");
        },
    });

    tree = $.ui.fancytree.getTree($("#sch_tree", frame));

    $("#srch_owner", frame).val("u/" + settings.user.uid);

    loadSchemas();

    $("#pick_user", frame).click(function () {
        dlgPickUser.show("u/" + settings.user.uid, [], true, function (users) {
            $("#srch_owner", frame).val(users);
            loadSchemas();
        });
    });

    $("#sch_view", frame).on("click", function () {
        getSelSchema(function (schema) {
            if (util.checkDlgOpen("dlg_schema_" + schema.id + "_" + schema.ver)) return;

            dlgSchema.show(dlgSchema.mode_view, schema);
        });
    });

    $("#sch_edit", frame).on("click", function () {
        getSelSchema(function (schema) {
            if (util.checkDlgOpen("dlg_schema_" + schema.id + "_" + schema.ver)) return;

            dlgSchema.show(dlgSchema.mode_edit, schema, function () {
                setTimeout(function () {
                    loadSchemas();
                }, 1000);
            });
        });
    });

    $("#sch_new", frame).on("click", function () {
        if (util.checkDlgOpen("dlg_schema_new")) return;

        dlgSchema.show(dlgSchema.mode_new, null, function () {
            setTimeout(function () {
                loadSchemas();
            }, 1000);
        });
    });

    $("#sch_rev", frame).on("click", function () {
        getSelSchema(function (schema) {
            if (util.checkDlgOpen("dlg_schema_" + schema.id + "_" + schema.ver)) return;

            dlgSchema.show(dlgSchema.mode_rev, schema, function () {
                setTimeout(function () {
                    loadSchemas();
                }, 1000);
            });
        });
    });

    $("#sch_del", frame).on("click", function () {
        getSelSchema(function (schema) {
            if (util.checkDlgOpen("dlg_schema_" + schema.id + "_" + schema.ver)) return;

            api.schemaDelete(schema.id + ":" + schema.ver, function (ok, reply) {
                if (ok) {
                    loadSchemas();
                } else {
                    dialogs.dlgAlert("Schema Delete Error", reply);
                }
            });
        });
    });

    $("#reset_btn", frame).on("click", function () {
        $("#srch_txt,#srch_id,#srch_owner", frame).val("");
        loadSchemas();
    });

    $("#srch_btn", frame).on("click", function () {
        loadSchemas();
    });

    $("#srch_txt,#srch_id,#srch_owner", frame).on("keypress", function (e) {
        if (e.keyCode == 13) {
            loadSchemas();
        }
    });

    //var in_timer;

    /*search_input.on( "input", function(e) {
        if ( in_timer )
            clearTimeout( in_timer );

        in_timer = setTimeout( function(){
            var node = tree.getNodeByKey("search");
            node.load(true).done( function(){ node.setExpanded(true); });
        }, 500 );
    });*/

    frame.dialog(dlg_opts);
}
