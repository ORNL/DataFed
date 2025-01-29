import { dlgAlert } from "../../dialogs.js";
import { TransferDialogController } from "./transfer-dialog-controller.js";

export class TransferDialog {
    constructor() {
        this.currentDialog = null;
    }

    /**
     * Show transfer dialog
     * @param {number|null} mode - Transfer mode (GET/PUT)
     * @param {Array<object>|null} records - Data records
     * @param {Function} callback - Completion callback
     */
    show(mode, records, callback) {
        try {
            this.currentDialog = new TransferDialogController(mode, records, callback);
            this.currentDialog.show();
        } catch (error) {
            console.error("Error showing transfer dialog:", error);
            dlgAlert("Error", "Failed to open transfer dialog");
        }
    }
}

export const transferDialog = new TransferDialog();
