import { createStore } from "./index.js";
import { persistStore, persistReducer } from "redux-persist";
import sessionStorage from "redux-persist/lib/storage/session"; // Use sessionStorage
import { transferReducer, initialState as transferInitialState } from "./reducers/transfer-reducer.js";

/**
 * @module AppStore
 * @description Application store configuration with redux-persist
 */

// Configuration for redux-persist
const persistConfig = {
    key: 'transfer',
    storage: sessionStorage,
    whitelist: ['resumeData', 'transferUIState'] // Persist both resumeData and transferUIState
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
export function loadTransferState() {
    const state = transferStore.getState();
    return state.resumeData || null;
}

/**
 * Clears transfer state from the store and persistence
 */
export function clearTransferState() {
    transferStore.dispatch({ type: 'CLEAR_TRANSFER_STATE' });
    persistor.purge(); // Clear persisted state
}
