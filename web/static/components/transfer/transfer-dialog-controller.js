import { TransferEndpointManager } from "./transfer-endpoint-manager.js";
import { TransferModel } from "../../models/transfer-model.js";
import { TransferUIManager } from "./transfer-ui-manager.js";
import * as dialogs from "../../dialogs.js";
import * as api from "../../api.js";
import { transferStore } from "../../store/store.js";
import { saveTransferState, clearTransferState } from "../../store/reducers/transfer-reducer.js";

/**
 * @class TransferDialogController
 *
 * Manages the UI and logic for data transfers
 */
export class TransferDialogController {
    /**
     * @param {number|TransferMode[keyof TransferMode]} mode - Transfer mode (GET/PUT)
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
        
        // Generate a unique ID for this transfer session
        this.transferId = Date.now().toString();
    }

    /**
     * Adds endpoint browser state to be saved with transfer state
     * @param {Object} endpointBrowserState - The endpoint browser state to save
     */
    addEndpointBrowserState(endpointBrowserState) {
        this.endpointBrowserState = endpointBrowserState;
    }
    
    /**
     * Saves the current transfer state to the store
     */
    saveState() {
        const state = {
            id: this.transferId,
            mode: this.model.mode,
            ids: this.ids,
            callback: String(this.callback),
            timestamp: Date.now(),
            endpointBrowserState: this.endpointBrowserState
        };
        
        // Dispatch action to save state
        transferStore.dispatch(saveTransferState(state));
        
        // Log state saving for debugging
        console.debug("Transfer state saved:", state);
    }
    
    /**
     * Clears the saved transfer state
     */
    clearState() {
        transferStore.dispatch(clearTransferState());
    }

    /**
     * Shows the transfer dialog
     */
    show() {
        try {
            this.uiManager.initializeComponents();
            this.uiManager.attachMatchesHandler();
            this.endpointManager.state.initialized = true;
            
            // Save state when dialog is shown
            this.saveState();
            
            this.uiManager.showDialog();
        } catch (error) {
            console.error("Failed to show transfer dialog:", error);
            this.services.dialogs.dlgAlert("Error", "Failed to open transfer dialog");
            this.clearState();
        }
    }
    
    /**
     * Closes the transfer dialog and cleans up state
     */
    close() {
        this.clearState();
        if (this.uiManager) {
            this.uiManager.closeDialog();
        }
    }
}
