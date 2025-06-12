import * as settings from "./settings.js";
import * as util from "./util.js";
import * as api from "./api.js";
import * as dialogs from "./dialogs.js";
import * as dlgPickUser from "./dlg_pick_user.js";
import * as dlgPickProject from "./dlg_pick_proj.js";

export function show(a_repo, a_alloc, a_excl, a_cb) {
    var ele = document.createElement("div");
    var frame = $(ele);

    frame.html(
        "<table width='100%'>\
        <tr><td style='vertical-align:middle' id='subj_label'>Subject&nbspID:</td><td><input type='text' id='subject' style='width:100%'></input></td></tr>\
        <tr id='subj_btn_row' style='display:none'><td style='vertical-align:middle'></td><td style='text-align:right'><button class='btn small' id='set_user'>Users</button> <button class='btn small' id='set_proj'>Projects</button></td></tr>\
        <tr><td style='vertical-align:middle'>Max. Data Size:</td><td><input type='text' id='data_limit' style='width:100%'></input></td></tr>\
        <tr><td style='vertical-align:middle'>Total Data size:</td><td><input type='text' id='data_size' style='width:100%' readonly></input></td></tr>\
        <tr><td style='vertical-align:middle'>Max. Rec. Count:</td><td><input type='text' id='rec_limit' style='width:100%'></input></td></tr>\
        </table>",
    );
    util.inputTheme($("input", frame));

    var alloc;

    if (a_alloc) {
        alloc = a_alloc;
        if (a_alloc.id.startsWith("p/")) $("#subj_label", frame).html("Project&nbspID:");
        else $("#subj_label", frame).html("User&nbspID:");

        util.inputDisable($("#subject", frame)).val(a_alloc.id);
        $("#data_limit", frame).val(a_alloc.dataLimit);
        $("#data_size", frame).val(a_alloc.dataSize);
        $("#rec_limit", frame).val(a_alloc.recLimit);
    } else {
        alloc = { repo: a_repo, id: null, dataLimit: 0, dataSize: 0, recLimit: 0 };
        $("#subj_btn_row", frame).show();
        $("#subject", frame);
        $("#data_size", frame).val("0");
        $("#rec_limit", frame).val(1000);
        $(".btn", frame).button();

        $("#set_user", frame).click(function () {
            dlgPickUser.show("u/" + settings.user.uid, a_excl, true, function (users) {
                alloc.id = users[0];
                $("#subject", frame).val(alloc.id);
            });
        });

        $("#set_proj", frame).click(function () {
            dlgPickProject.show(a_excl, true, function (projs) {
                alloc.id = projs[0];
                $("#subject", frame).val(alloc.id);
            });
        });
    }

    util.inputDisable($("#data_size", frame));

    var options = {
        title: (a_alloc ? "Edit" : "Add") + " Allocation",
        modal: true,
        width: 400,
        height: "auto",
        resizable: true,
        buttons: [
            {
                text: "Cancel",
                click: function () {
                    $(this).dialog("close");
                },
            },
            {
                text: a_alloc ? "Update" : "Add",
                click: function () {
                    if (!a_alloc) {
                        alloc.id = $("#subject", frame).val();
                        if (!alloc.id) {
                            dialogs.dlgAlert("Data Entry Error", "Subject ID cannot be empty.");
                            return;
                        }
                        if (!alloc.id.startsWith("u/") && !alloc.id.startsWith("p/")) {
                            dialogs.dlgAlert(
                                "Data Entry Error",
                                "Invalid subject ID (must include 'u/' or 'p/' prefix.",
                            );
                            return;
                        }
                    }

                    var data_limit = util.parseSize($("#data_limit", frame).val());

                    if (data_limit == null) {
                        dialogs.dlgAlert("Data Entry Error", "Invalid max size value.");
                        return;
                    }

                    if (data_limit == 0) {
                        dialogs.dlgAlert("Data Entry Error", "Max size cannot be 0.");
                        return;
                    }

                    var rec_limit = parseInt($("#rec_limit", frame).val());

                    if (isNaN(rec_limit)) {
                        dialogs.dlgAlert("Data Entry Error", "Invalid max count value.");
                        return;
                    }

                    if (rec_limit == 0) {
                        dialogs.dlgAlert("Data Entry Error", "Max count cannot be 0.");
                        return;
                    }

                    alloc.dataLimit = data_limit;
                    alloc.recLimit = rec_limit;

                    var dlg_inst = $(this);
                    if (a_alloc) {
                        api.allocSet(a_repo, alloc.id, data_limit, rec_limit, function (ok, data) {
                            if (ok) {
                                a_cb(alloc);
                                dlg_inst.dialog("close");
                            } else {
                                dialogs.dlgAlert(
                                    "Allocation Error",
                                    "Allocation update failed (" + data + ").",
                                );
                            }
                        });
                    } else {
                        api.allocCreate(
                            a_repo,
                            alloc.id,
                            data_limit,
                            rec_limit,
                            function (ok, data) {
                                if (ok) {
                                    a_cb(alloc);
                                    dlg_inst.dialog("close");
                                } else {
                                    dialogs.dlgAlert(
                                        "Allocation Error",
                                        "Allocation creation failed (" + data + ").",
                                    );
                                }
                            },
                        );
                    }
                },
            },
        ],
        open: function (event, ui) {},
        close: function (ev, ui) {
            $(this).dialog("destroy").remove();
        },
    };

    frame.dialog(options);
}
