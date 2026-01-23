import * as browser_tab from "/main_browse_tab.js";
import * as util from "/util.js";
import * as api from "/api.js";
import * as settings from "/settings.js";
import * as dialogs from "/dialogs.js";

$(".btn-help").on("click", function () {
    window.open("https://ornl.github.io/DataFed/", "datafed-docs");
});

$(".btn-logout").on("click", function () {
    settings.clearUser();
    window.location = "/ui/logout";
});

window.refreshUI = function (a_ids, a_data, a_reload) {
    browser_tab.refreshUI(a_ids, a_data, a_reload);
};

function resizeUI() {
    browser_tab.windowResized();
}

// Suppress extraneous resize events while drag-resizing
var resizeTimer = null;
$(window).bind("resize", function () {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resizeUI, 100);
});

$(document).ready(function () {
    var tmpl_data = JSON.parse(document.getElementById("template_data").innerHTML);

    window.name = "sdms_target";

    $(".btn").button();
    util.tooltipTheme($("button,input"));
    settings.setTheme(tmpl_data.theme);

    if (tmpl_data.test_mode == "true") {
        $("#devmode").show();
    }

    resizeUI();

    api.userView(tmpl_data.user_uid, true, function (ok, user) {
        if (ok && user) {
            settings.setUser(user);

            api.epRecentLoad();

            $("#uname").text(
                util.escapeHTML(settings.user.nameFirst) +
                    " " +
                    util.escapeHTML(settings.user.nameLast),
            );

            if (settings.user.isAdmin) {
                $("#is_admin").show();
            }

            browser_tab.init();

            if (tmpl_data.restore_state) {
                const parentState = tmpl_data.restore_state.parent_dialog;

                if (parentState) {
                    if (parentState.type === "d_new_edit") {
                        import("/dlg_data_new_edit.js").then((module) => {
                            const { mode, data } = parentState;
                            module.show(mode, data, data.parentId);
                        });
                    } else if (parentState.type === "transfer") {
                        import("/components/transfer/index.js").then((module) => {
                            const { mode, records } = parentState;
                            // Re-open transfer dialog
                            module.transferDialog.show(mode, records, () => {
                                // Default callback if needed, usually this refreshes view
                                // but we might not have context.
                                console.log("Restored transfer dialog completed");
                            });
                        });
                    }
                }

                if (tmpl_data.restore_state.endpoint_browser) {
                    import("/components/endpoint-browse/index.js").then((module) => {
                        const { endpoint, path, mode } = tmpl_data.restore_state.endpoint_browser;
                        module.show(endpoint, path, mode, (selectedPath) => {
                            // Update parent dialog if open
                            if (parentState?.type === "d_new_edit") {
                                const new_data_dlg = $("#d_new_edit");
                                if (new_data_dlg.length && new_data_dlg.dialog("isOpen")) {
                                    new_data_dlg.find("#source_file").val(selectedPath);
                                }
                            } else if (parentState?.type === "transfer") {
                                // Update path in transfer dialog
                                const transfer_dlg_content =
                                    $("#records").closest(".ui-dialog-content");
                                if (
                                    transfer_dlg_content.length &&
                                    transfer_dlg_content.dialog("isOpen")
                                ) {
                                    const currentVal = transfer_dlg_content.find("#path").val();
                                    const prefix =
                                        endpoint.name &&
                                        currentVal.startsWith(endpoint.name)
                                            ? endpoint.name
                                            : "";
                                    
                                    let newVal = selectedPath;
                                    if (prefix && !selectedPath.startsWith(prefix)) {
                                         newVal = prefix + selectedPath;
                                    }
                                    
                                    transfer_dlg_content.find("#path").val(newVal);
                                }
                            } else {
                                console.log("Restored selection:", selectedPath);
                            } else {
                                console.log("Restored selection:", selectedPath);
                            }
                        });
                    });
                }
            }

            util.setStatusText("DataFed Ready");
        } else {
            dialogs.dlgAlert("System Error", "Unable to access user record");
        }
    });
});
