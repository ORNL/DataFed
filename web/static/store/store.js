import { createStore } from "./index.js";
import { persistStore, persistReducer } from "redux-persist";
import sessionStorage from "redux-persist/lib/storage/session"; // Use sessionStorage
import {
    transferReducer,
    initialState as transferInitialState,
    ActionTypes
} from "./reducers/transfer-reducer.js";

/**
 * @module AppStore
 * @description Application store configuration with redux-persist
 */

// Configuration for redux-persist
const persistConfig = {
    key: "transfer",
    storage: sessionStorage,
    whitelist: ["resumeData", "uiState", "endpointState", "transfers", "currentTransfer"], // Persist all relevant state
    timeout: 2000 // Increase timeout for larger state objects
};

// Create a persisted reducer
const persistedReducer = persistReducer(persistConfig, transferReducer);

// Create and export the transfer store with the persisted reducer
export const transferStore = createStore(persistedReducer, transferInitialState);

// Create and export the persistor
export const persistor = persistStore(transferStore);

/**
 * Loads transfer state from the persisted store
 * @returns {Object|null} Loaded state or null
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
 * @param {Object} data - The transfer data to save
 */
export const saveTransferState = (data) => {
    try {
        transferStore.dispatch({
            type: ActionTypes.SAVE_TRANSFER_STATE,
            payload: data
        });
    } catch (error) {
        console.error("Failed to save transfer state:", error);
    }
};

/**
 * Updates the UI state in the store
 * @param {Object} state - The UI state to save
 */
export const updateUIState = (state) => {
    try {
        transferStore.dispatch({
            type: ActionTypes.UPDATE_UI_STATE,
            payload: state
        });
    } catch (error) {
        console.error("Failed to update UI state:", error);
    }
};

/**
 * Clears transfer state from the store and persistence
 */
export const clearTransferState = () => {
    try {
        transferStore.dispatch({ type: ActionTypes.CLEAR_TRANSFER_STATE });
        persistor.purge(); // Clear persisted state
    } catch (error) {
        console.error("Failed to clear transfer state:", error);
        // Attempt a more aggressive cleanup if the dispatch fails
        sessionStorage.removeItem(`persist:${persistConfig.key}`);
    }
};
