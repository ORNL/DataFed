import { createStore } from "./index.js";
import { persistStore, persistReducer } from "redux-persist";
import sessionStorage from "redux-persist/lib/storage/session";
import {
    transferReducer,
    initialState as transferInitialState,
    ActionTypes,
} from "./reducers/transfer-reducer.js";

/**
 * @module AppStore
 * @description Application store configuration with redux-persist
 */

// Redux-persist
const persistConfig = {
    key: "transfer",
    storage: sessionStorage,
    whitelist: ["resumeData", "uiState", "endpointState", "transfers", "currentTransfer"], // Persist all relevant state
    debug: process.env.NODE_ENV !== "production", // Enable debug in non-production environments
    serialize: true,
    deserialize: true,
};

const persistedReducer = persistReducer(persistConfig, transferReducer);
export const transferStore = createStore(persistedReducer, transferInitialState);
export const persistor = persistStore(transferStore);

/**
 * Loads transfer state from the persisted store
 * @returns {object | null} Loaded state or null
 */
export const loadTransferState = () => {
    try {
        const state = transferStore.getState();
        return state.resumeData || null;
    } catch (error) {
        console.error("Failed to load transfer state:", error);
        return null;
    }
};

/**
 * Saves the current transfer state
 * @param {object} data - The transfer data to save
 */
export const saveTransferState = (data) => {
    try {
        transferStore.dispatch({
            type: ActionTypes.SAVE_TRANSFER_STATE,
            payload: data,
        });
    } catch (error) {
        console.error("Failed to save transfer state:", error);
    }
};

/**
 * Updates the UI state in the store
 * @param {object} state - The UI state to save
 */
export const updateUIState = (state) => {
    try {
        transferStore.dispatch({
            type: ActionTypes.UPDATE_UI_STATE,
            payload: state,
        });
    } catch (error) {
        console.error("Failed to update UI state:", error);
    }
};

/**
 * Updates the endpoint state in the store
 * @param {object} state - The endpoint state to save
 */
export const updateEndpointState = (state) => {
    try {
        transferStore.dispatch({
            type: ActionTypes.UPDATE_ENDPOINT_STATE,
            payload: state,
        });
    } catch (error) {
        console.error("Failed to update endpoint state:", error);
    }
};

/**
 * Clears transfer state from the store and persistence
 */
export const clearTransferState = () => {
    try {
        transferStore.dispatch({ type: ActionTypes.CLEAR_TRANSFER_STATE });
        persistor.purge(); // Clear persisted state

        // Additional cleanup for any related storage items
        const storageKeys = Object.keys(sessionStorage);
        storageKeys.forEach((key) => {
            if (key.startsWith("persist:") || key.includes("transfer")) {
                sessionStorage.removeItem(key);
            }
        });
    } catch (error) {
        console.error("Failed to clear transfer state:", error);
        // Attempt a more aggressive cleanup if the dispatch fails
        sessionStorage.removeItem(`persist:${persistConfig.key}`);
        sessionStorage.clear(); // Last resort: clear all session storage
    }
};

/**
 * Checks if the persisted state is valid and usable
 * @returns {boolean} Whether the state is valid
 */
export const isPersistedStateValid = () => {
    try {
        const state = transferStore.getState();

        // Basic validation checks
        if (!state || typeof state !== "object") return false;

        // Check if resumeData exists and has required properties
        if (state.resumeData) {
            const { id, mode, timestamp } = state.resumeData;

            // Validate required fields exist
            if (!id || !mode || !timestamp) return false;

            // Check if state is too old (older than 24 hours)
            const maxAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
            if (Date.now() - timestamp > maxAge) return false;
        }

        return true;
    } catch (error) {
        console.error("Error validating persisted state:", error);
        return false;
    }
};
