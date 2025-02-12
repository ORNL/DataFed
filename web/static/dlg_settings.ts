import * as settings from "./settings.js";
import * as util from "./util.js";
import * as api from "./api.js";
import * as dialogs from "./dialogs.js";

export function show(a_cb) {
    console.log("user from settings:", settings.user);

    var content =
        "\
        User Interface<hr>\
        <table class='setting-table'>\
            <tr><td>Task History:</td><td><select id='task-poll-hours'>\
                <option value='1'>1 Hour</option>\
                <option value='12'>12 Hours</option>\
                <option value='24'>1 Day</option>\
                <option value='168'>1 Week</option>\
                <option value='720'>1 Month</option>\
                </select></td></tr>\
            <tr><td>Paging Size:</td><td><select id='page-size'>\
                <option value='10'>10</option>\
                <option value='20'>20</option>\
                <option value='50'>50</option>\
                <option value='100'>100</option>\
                </select></td></tr>\
            <tr><td>App. Theme:</td><td><select id='theme-sel'>\
                <option value='light'>Light</option>\
                <option value='dark'>Dark</option>\
                </select></td></tr>\
            <tr><td>Meta. Validation:</td><td><select id='meta-val'>\
                <option value='0'>Warn</option>\
                <option value='1'>Error</option>\
                </select></td></tr>\
        </table>\
        <br>Account Settings<hr>\
        <table class='setting-table'>\
            <tr><td>Default Alloc.:</td><td><select id='def-alloc'><option value='none'>None</option></select></td></tr>\
            <tr><td>E-mail:</td><td><input id='new_email'></input></td></tr>\
        </table>\
        <br>Command-Line Interface<hr>\
        <table class='setting-table'>\
            <tr><td>New password:</td><td><input type='password' id='cli_new_pw'></input></td></tr>\
            <tr><td>Confirm:</td><td><input type='password' id='cli_confirm_pw'></input></td></tr>\
            <tr><td></td><td><button class='btn' style='margin:.5em 0 0 0' id='btn_revoke_cred'>Revoke Credentials</button></td></tr>\
        </table>";

    var frame = $(document.createElement("div"));
    frame.html(content);
    util.inputTheme($("input:text,input:password", frame));
    $(".btn", frame).button();
    var emailFilter =
        /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    var def_alloc;

    $("#btn_revoke_cred", frame).click(function () {
        dialogs.dlgConfirmChoice(
            "Revoke CLI Credentials",
            "Revoke credentials for ALL configured environments? The SDMS CLI will revert to interactive mode until new credentials are configured using the CLI 'setup' command.",
            ["Cancel", "Revoke"],
            function (choice) {
                if (choice == 1) {
                    api.userRevokeCredentials(function (ok, data) {
                        if (!ok) dialogs.dlgAlert("Revoke Credentials Error", data);
                    });
                }
            },
        );
    });

    var options = {
        title: "DataFed Settings",
        modal: true,
        width: 450,
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
                text: "Save",
                click: function () {
                    var reload = false,
                        inst = $(this),
                        email,
                        pw;

                    var tmp = $("#new_email", frame).val();
                    if (tmp != settings.user.email) {
                        if (!emailFilter.test(String(tmp).toLowerCase())) {
                            dialogs.dlgAlert("Data Entry Error", "Invalid e-mail");
                            return;
                        } else {
                            email = tmp;
                            settings.setUserEmail(tmp);
                        }
                    }

                    tmp = $("#cli_new_pw", frame).val();
                    if (tmp) {
                        var pw2 = $("#cli_confirm_pw", frame).val();
                        if (tmp != pw2) {
                            dialogs.dlgAlert("Update CLI Password", "Passwords do not match");
                            return;
                        } else {
                            pw = tmp;
                        }
                    }

                    var save_opts = false,
                        opts = settings.opts;

                    tmp = parseInt($("#page-size", frame).val());
                    if (tmp != opts.page_sz) {
                        opts.page_sz = tmp;
                        save_opts = true;
                        reload = true;
                    }

                    tmp = parseInt($("#task-poll-hours", frame).val());
                    if (tmp != opts.task_hist) {
                        opts.task_hist = tmp;
                        save_opts = true;
                    }

                    tmp = parseInt($("#meta-val", frame).val());
                    if (tmp != settings.meta_val) {
                        opts.meta_val = tmp;
                        save_opts = true;
                    }

                    if (save_opts) {
                        settings.setOptionsObj(opts);
                    }

                    var close_cnt = 0;

                    function do_close() {
                        if (--close_cnt <= 0) {
                            util.setStatusText("Settings saved.");

                            if (a_cb) a_cb(reload);

                            inst.dialog("close");
                        }
                    }

                    tmp = $("#theme-sel", frame).val();
                    if (tmp != settings.theme) {
                        close_cnt++;
                        settings.setTheme(tmp);
                        $("#jq-theme-css").attr({ href: "/jquery-ui-" + tmp + "/jquery-ui.css" });
                        api.themeSave(tmp, function (ok, data) {
                            if (!ok) {
                                dialogs.dlgAlert("Save Theme Error", data);
                            } else {
                                do_close();
                            }
                        });
                    }

                    if (pw || email || save_opts) {
                        close_cnt++;
                        api.userUpdate(
                            "u/" + settings.user.uid,
                            pw,
                            email,
                            save_opts ? opts : null,
                            function (ok, data) {
                                if (!ok) {
                                    dialogs.dlgAlert("Save Settings Error", data);
                                } else {
                                    do_close();
                                }
                            },
                        );
                    }

                    tmp = $("#def-alloc", frame).val();
                    if (tmp != def_alloc) {
                        close_cnt++;
                        api.setDefaultAlloc(tmp, null, function (ok, data) {
                            if (!ok) {
                                dialogs.dlgAlert("Set Default Allocation Error", data);
                            } else {
                                do_close();
                            }
                        });
                    }

                    if (close_cnt == 0) do_close();
                },
            },
        ],
        open: function (event, ui) {
            $("#page-size", frame).val(settings.opts.page_sz).selectmenu({ width: 150 });
            $("#theme-sel", frame).val(settings.theme).selectmenu({ width: 150 });
            $("#meta-val", frame).val(settings.opts.meta_val).selectmenu({ width: 150 });
            $("#task-poll-hours", frame).val(settings.opts.task_hist).selectmenu({ width: 150 });
            $("#def-alloc", frame).selectmenu({ width: 225 });
            $("#new_email", frame).val(settings.user.email);
        },
        close: function (ev, ui) {
            $(this).dialog("destroy").remove();
        },
    };

    api.allocListBySubject(null, null, function (ok, data) {
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

        $("#def-alloc", frame).html(html);

        frame.dialog(options);
    });
}
