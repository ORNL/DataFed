import * as util from "./util.js";
import * as dialogs from "./dialogs.js";

export function show(a_query, a_id, a_title, a_cb) {
    var dlg_inst,
        ele = document.createElement("div"),
        frame = $(ele);

    frame.html(
        "<div style='padding-bottom:0.25em'>Search Title:</div><input id='dlg_qry_title' type='text' style='width:100%'></input>",
    );

    var dlg_opts = {
        title: "Save Search",
        modal: true,
        width: 500,
        height: "auto",
        resizable: true,
        buttons: [],
        open: function (event, ui) {
            dlg_inst = $(this);
            if (a_title) {
                $("#dlg_qry_title", frame).val(a_title);
            }
            $(".btn", frame).button();
        },
        close: function (ev, ui) {
            dlg_inst.dialog("destroy").remove();
        },
    };

    function save(a_update) {
        var title = $("#dlg_qry_title", frame).val().trim();

        if (!title) {
            dialogs.dlgAlert("Input Error", "Title cannot be empty");
            return;
        }

        if (a_cb) {
            a_cb(title, a_update);
        }
        dlg_inst.dialog("close");
    }

    dlg_opts.buttons.push({
        text: "Cancel",
        click: function () {
            dlg_inst.dialog("close");
        },
    });

    if (a_id) {
        dlg_opts.buttons.push({
            text: "Update",
            click: function () {
                save(true);
            },
        });
    }

    dlg_opts.buttons.push({
        text: a_id ? "Save As" : "Save",
        click: function () {
            save(false);
        },
    });

    util.inputTheme($("input:text", frame));

    frame.dialog(dlg_opts);
}
