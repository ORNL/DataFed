import { createStore } from "./index.js";
import { transferReducer, initialState as transferInitialState } from "./reducers/transfer-reducer.js";

/**
 * @module AppStore
 * @description Application store configuration
 */

// Create and export the transfer store
export const transferStore = createStore(transferReducer, transferInitialState);

/**
 * Persists transfer state to session storage
 * @param {Object} state - State to persist
 */
export function persistTransferState(state) {
    if (state) {
        sessionStorage.setItem("transferState", JSON.stringify(state));
    }
}

/**
 * Loads transfer state from session storage
 * @returns {Object|null} Loaded state or null
 */
export function loadTransferState() {
    const savedState = sessionStorage.getItem("transferState");
    return savedState ? JSON.parse(savedState) : null;
}

/**
 * Clears transfer state from session storage
 */
export function clearTransferState() {
    sessionStorage.removeItem("transferState");
}

// Subscribe to store changes to persist state
transferStore.subscribe(() => {
    const state = transferStore.getState();
    if (state.resumeData) {
        persistTransferState(state.resumeData);
    } else {
        clearTransferState();
    }
});
