import * as browser_tab from "/main_browse_tab.js";
import * as util from "/util.js";
import * as api from "/api.js";
import * as settings from "/settings.js";
import * as dialogs from "/dialogs.js";
import { TransferDialogController } from "./components/transfer/transfer-dialog-controller.js";
import { TransferMode } from "./models/transfer-model.js";
import { transferStore, persistor, loadTransferState, clearTransferState, isPersistedStateValid } from "./store/store.js";
import { PersistGate } from "redux-persist/integration/react";

$(".btn-help").on("click", function () {
    window.open("https://ornl.github.io/DataFed/", "datafed-docs");
});

$(".btn-logout").on("click", function () {
    // Clear all application state before logout
    try {
        // Show a loading indicator
        util.setStatusText("Logging out...");
        
        // Clear application state
        settings.clearUser();
        
        // Clear transfer state with a more thorough approach
        clearTransferState();
        
        // Clear any additional session storage items
        sessionStorage.removeItem('resumeFlow');
        
        // Clear any localStorage items that might be related to the app state
        const localStorageKeys = Object.keys(localStorage);
        localStorageKeys.forEach(key => {
            if (key.startsWith('persist:') || key.includes('transfer') || key.includes('datafed')) {
                localStorage.removeItem(key);
            }
        });
        
        console.info("Application state cleared successfully");
        
        // Redirect to logout page
        window.location = "/ui/logout";
    } catch (error) {
        console.error("Error during logout:", error);
        // Force redirect even if clearing state fails
        window.location = "/ui/logout";
    }
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
            
            try {
                // Check if resumeFlow flag is set in sessionStorage
                const shouldResumeFlow = sessionStorage.getItem('resumeFlow') === 'true';
                
                // Validate the persisted state before using it
                if (!isPersistedStateValid()) {
                    console.warn("Persisted state is invalid or expired, clearing it");
                    clearTransferState();
                    sessionStorage.removeItem('resumeFlow');
                    return;
                }
                
                const savedState = loadTransferState();
                const storeState = transferStore.getState();
                
                // Log the full state for debugging
                console.debug("Redux store state after rehydration:", storeState);
                
                if (savedState) {
                    console.info("Resuming transfer flow with persisted state:", savedState);
                    
                    try {
                        // Convert the callback string back to a function if it exists
                        let sessionStorageCallback;
                        if (savedState.callback) {
                            try {
                                sessionStorageCallback = new Function('return ' + savedState.callback)();
                            } catch (callbackError) {
                                console.warn("Could not restore callback function:", callbackError);
                                sessionStorageCallback = () => {
                                    console.log("Restored transfer completed");
                                    util.setStatusText("Transfer session restored successfully");
                                };
                            }
                        } else {
                            sessionStorageCallback = () => {
                                console.log("Restored transfer completed");
                                util.setStatusText("Transfer session restored successfully");
                            };
                        }
                        
                        // Create a new controller with the saved state
                        const transferDialogController = new TransferDialogController(
                            TransferMode[savedState.mode] || savedState.mode,
                            savedState.ids || [],
                            sessionStorageCallback,
                            { dialogs, api }
                        );

                        // Restore UI state if available
                        if (storeState.uiState) {
                            console.info("Restoring UI state:", storeState.uiState);
                            util.setStatusText("Restoring previous transfer session...");
                        }
                        
                        // Restore endpoint state if available
                        if (storeState.endpointState) {
                            console.info("Restoring endpoint state:", storeState.endpointState);
                        }

                        // Show the dialog with restored state
                        setTimeout(() => {
                            transferDialogController.show();
                            
                            // Clear the resumeFlow flag after successful restoration
                            if (shouldResumeFlow) {
                                sessionStorage.removeItem('resumeFlow');
                            }
                        }, 500); // Small delay to ensure UI is ready
                    } catch (error) {
                        console.error("Failed to resume transfer flow:", error);
                        dialogs.dlgAlert("Resume Error", "Failed to resume previous transfer session. Starting fresh.");
                        clearTransferState();
                        sessionStorage.removeItem('resumeFlow');
                    }
                } else if (shouldResumeFlow) {
                    // If we have the flag but no state, clear the flag
                    console.warn("Resume flow flag was set but no state was found");
                    sessionStorage.removeItem('resumeFlow');
                    dialogs.dlgAlert("Session Expired", "Your previous transfer session has expired or was not found.");
                }
            } catch (error) {
                console.error("Error in resumeTransferFlow:", error);
                // Attempt recovery by clearing potentially corrupted state
                clearTransferState();
                sessionStorage.removeItem('resumeFlow');
                dialogs.dlgAlert("Error", "An error occurred while trying to resume your previous session.");
            }
        }
    });
};
