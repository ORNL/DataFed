import * as browser_tab from "/main_browse_tab.js";
import * as util from "/util.js";
import * as api from "/api.js";
import * as settings from "/settings.js";
import * as dialogs from "/dialogs.js";
import { TransferDialogController } from "./components/transfer/transfer-dialog-controller.js";

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
    resumeTransferFlow();

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

            util.setStatusText("DataFed Ready");
        } else {
            dialogs.dlgAlert("System Error", "Unable to access user record");
        }
    });
});

/**
 * Resumes the transfer flow if the 'resumeFlow' flag is set in sessionStorage.
 * Retrieves the saved state from sessionStorage and initializes the TransferDialogController
 * with the saved state values. Removes the 'resumeFlow' flag from sessionStorage after resuming.
 */
const resumeTransferFlow = () => {
    const resumeFlow = sessionStorage.getItem("resumeFlow");
    if (resumeFlow === "true") {
        const savedState = sessionStorage.getItem("transferDialogState");
        if (savedState) {
            const state = JSON.parse(savedState);

            const transferDialogController = new TransferDialogController(
                state.mode,
                state.ids,
                state.callback,
            );

            transferDialogController.show();
        }

        sessionStorage.removeItem("resumeFlow");
    }
};
