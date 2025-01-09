import * as dialogs from "../../dialogs.js";
import { TransferEndpointManager } from "./transfer-endpoint-manager.js";
import { TransferModel } from "../../models/transfer-model.js";
import { TransferUIManager } from "./transfer-ui-manager.js";

/**
 * @class TransferDialogController
 * @classDesc Manages the UI and logic for data transfers
 */
export class TransferDialogController {
    /**
     * @param {number} mode - Transfer mode (GET/PUT)
     * @param {Array<Object>} ids - Records to transfer
     * @param {Function} callback - Completion callback
     */
    constructor(mode, ids, callback) {
        this.model = new TransferModel(mode, ids);
        this.endpointManager = new TransferEndpointManager(this);
        this.uiManager = new TransferUIManager(this);
        this.ids = ids;
        this.callback = callback;
    }

    show() {
        try {
            this.uiManager.createDialog(this.uiManager.getDialogLabels());
            this.uiManager.initializeComponents();
            this.uiManager.attachMatchesHandler();
            this.endpointManager.initialized = true;
            this.uiManager.showDialog();
        } catch (error) {
            console.error("Failed to show transfer dialog:", error);
            dialogs.dlgAlert("Error", "Failed to open transfer dialog");
        }
    }
}
