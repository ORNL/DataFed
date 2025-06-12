import * as util from "./util.js";

export function dlgConfirmChoice(title, msg, btns, cb) {
    var div = $(document.createElement("div"));
    div.html(msg);

    var options = {
        title: title,
        modal: true,
        buttons: [],
        open: function (ev, ui) {
            $(":button", div.parent()).blur();
        },
        close: function (ev, ui) {
            $(this).dialog("destroy").remove();
        },
    };

    for (var i in btns) {
        // JSHINT WARNS BUT THIS IS CORRECT (can't use ECS6)
        (function (idx) {
            options.buttons.push({
                text: btns[idx],
                click: function () {
                    cb(idx);
                    $(this).dialog("close");
                },
            });
        })(i);
    }

    div.dialog(options);
}

export function dlgSingleEntry(title, label, btns, cb) {
    var div = $(document.createElement("div"));
    div.html(label + "&nbsp<input id='dlg_se_input' type='text'></input>");
    util.inputTheme($("#dlg_se_input", div));

    var options = {
        title: title,
        width: "auto",
        modal: true,
        buttons: [],
        close: function (ev, ui) {
            $(this).dialog("destroy").remove();
        },
    };

    for (var i in btns) {
        // JSHINT WARNS BUT THIS IS CORRECT (can't use ECS6)
        (function (idx) {
            options.buttons.push({
                text: btns[idx],
                click: function () {
                    cb(idx, $("#dlg_se_input", div).val());
                    $(this).dialog("close");
                },
            });
        })(i);
    }

    div.dialog(options);
}

export function dlgAlert(title, msg, cb) {
    var div = $(document.createElement("div"));
    div.html(msg);
    var options = {
        title: title,
        modal: true,
        buttons: [
            {
                text: "Ok",
                click: function () {
                    $(this).dialog("close");
                    if (cb) cb();
                },
            },
        ],
        close: function (ev, ui) {
            $(this).dialog("destroy").remove();
        },
    };

    div.dialog(options);
}

export function dlgAlertPermDenied() {
    dlgAlert("Cannot Perform Action", "Permission Denied.");
}
