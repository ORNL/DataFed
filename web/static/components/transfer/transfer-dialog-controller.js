import { TransferEndpointManager } from "./transfer-endpoint-manager.js";
import { TransferModel } from "../../models/transfer-model.js";
import { TransferUIManager } from "./transfer-ui-manager.js";
import * as dialogs from "../../dialogs.js";
import * as api from "../../api.js";

/**
 * @class TransferDialogController
 *
 * Manages the UI and logic for data transfers
 */
export class TransferDialogController {
    /**
     * @param {TransferMode[keyof TransferMode]} mode - Transfer mode (GET/PUT)
     * @param {Array<object>} ids - Records to transfer
     * @param {Function} callback - Completion callback
     * @param {object} services - The service objects to use for API and dialog operations
     * @param {object} services.dialogs - Dialog service
     * @param {Function} services.dialogs.dlgAlert - Alert dialog function
     * @param {object} services.api - API service
     */
    constructor(mode, ids, callback, services = { dialogs, api }) {
        this.model = new TransferModel(mode, ids);
        this.endpointManager = new TransferEndpointManager(this, services);
        this.uiManager = new TransferUIManager(this, services);
        this.ids = ids;
        this.callback = callback;
        this.services = services;
    }

    show() {
        try {
            this.uiManager.initializeComponents();
            this.uiManager.attachMatchesHandler();
            this.endpointManager.state.initialized = true;
            this.uiManager.showDialog();
        } catch (error) {
            console.error("Failed to show transfer dialog:", error);
            this.services.dialogs.dlgAlert("Error", "Failed to open transfer dialog");
        }
    }
}
