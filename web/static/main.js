import * as browser_tab from "/main_browse_tab.js";
import * as util from "/util.js";
import * as api from "/api.js";
import * as settings from "/settings.js";
import * as dialogs from "/dialogs.js";
import { TransferDialogController } from "./components/transfer/transfer-dialog-controller.js";
import { TransferMode } from "./models/transfer-model.js";
import { transferStore, persistor, loadTransferState, clearTransferState } from "./store/store.js";
import { PersistGate } from "redux-persist/integration/react";

$(".btn-help").on("click", function () {
    window.open("https://ornl.github.io/DataFed/", "datafed-docs");
});

$(".btn-logout").on("click", function () {
    settings.clearUser();
    clearTransferState();
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

    resumeTransferFlow();
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

            util.setStatusText("DataFed Ready");
        } else {
            dialogs.dlgAlert("System Error", "Unable to access user record");
        }
    });
});

/**
 * Resumes the transfer flow using the Redux store with redux-persist
 * Retrieves the saved state and initializes the TransferDialogController
 * with the saved state values.
 */
const resumeTransferFlow = () => {
    // Wait for rehydration to complete before accessing the state
    const unsubscribe = persistor.subscribe(() => {
        const { bootstrapped } = persistor.getState();
        if (bootstrapped) {
            unsubscribe();
            
            // Check if resumeFlow flag is set in sessionStorage
            const shouldResumeFlow = sessionStorage.getItem('resumeFlow') === 'true';
            const savedState = loadTransferState();
            
            if (savedState) {
                console.info("Resuming transfer flow with persisted state:", savedState);
                
                try {
                    // Convert the callback string back to a function
                    const sessionStorageCallback = new Function('return ' + savedState.callback)();
                    
                    const transferDialogController = new TransferDialogController(
                        TransferMode[savedState.mode] || savedState.mode,
                        savedState.ids || [],
                        sessionStorageCallback,
                        { dialogs, api }
                    );

                    transferDialogController.show();
                    
                    // Clear the resumeFlow flag after successful restoration
                    if (shouldResumeFlow) {
                        sessionStorage.removeItem('resumeFlow');
                    }
                } catch (error) {
                    console.error("Failed to resume transfer flow:", error);
                    clearTransferState();
                    sessionStorage.removeItem('resumeFlow');
                }
            } else if (shouldResumeFlow) {
                // If we have the flag but no state, clear the flag
                console.warn("Resume flow flag was set but no state was found");
                sessionStorage.removeItem('resumeFlow');
            }
        }
    });
};
