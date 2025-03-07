import { TransferMode } from "../../models/transfer-model.js";

/**
 * @module TransferReducer
 * @description Reducer for transfer-related state
 */

/**
 * Initial state for transfer reducer
 */
export const initialState = {
    transfers: [],
    currentTransfer: null,
    resumeData: null,
    uiState: null,
    endpointState: null
};

/**
 * Action types for transfer reducer
 */
export const ActionTypes = {
    SAVE_TRANSFER_STATE: 'SAVE_TRANSFER_STATE',
    CLEAR_TRANSFER_STATE: 'CLEAR_TRANSFER_STATE',
    ADD_TRANSFER: 'ADD_TRANSFER',
    UPDATE_TRANSFER: 'UPDATE_TRANSFER',
    SAVE_ENDPOINT_BROWSER_STATE: 'SAVE_ENDPOINT_BROWSER_STATE',
    UPDATE_UI_STATE: 'UPDATE_UI_STATE',
    UPDATE_ENDPOINT_STATE: 'UPDATE_ENDPOINT_STATE'
};

/**
 * Reducer function for transfer state
 * @param {object} state - Current state
 * @param {object} action - Action object with type and payload
 * @returns {object} New state
 */
export function transferReducer(state = initialState, action) {
    switch (action.type) {
        case ActionTypes.SAVE_TRANSFER_STATE:
            return { 
                ...state, 
                resumeData: action.payload 
            };
            
        case ActionTypes.CLEAR_TRANSFER_STATE:
            return { 
                ...state, 
                resumeData: null,
                uiState: null,
                endpointState: null
            };
            
        case ActionTypes.ADD_TRANSFER:
            return { 
                ...state, 
                transfers: [...state.transfers, action.payload],
                currentTransfer: action.payload
            };
            
        case ActionTypes.UPDATE_TRANSFER:
            return {
                ...state,
                transfers: state.transfers.map(transfer => 
                    transfer.id === action.payload.id 
                        ? { ...transfer, ...action.payload } 
                        : transfer
                ),
                currentTransfer: state.currentTransfer?.id === action.payload.id 
                    ? { ...state.currentTransfer, ...action.payload } 
                    : state.currentTransfer
            };
            
        case ActionTypes.SAVE_ENDPOINT_BROWSER_STATE:
            return {
                ...state,
                resumeData: state.resumeData ? {
                    ...state.resumeData,
                    endpointBrowserState: action.payload
                } : {
                    timestamp: Date.now(),
                    endpointBrowserState: action.payload
                }
            };
            
        case ActionTypes.UPDATE_UI_STATE:
            return {
                ...state,
                uiState: action.payload
            };
            
        case ActionTypes.UPDATE_ENDPOINT_STATE:
            return {
                ...state,
                endpointState: action.payload
            };
            
        default:
            return state;
    }
}

/**
 * Action creator for saving transfer state
 * @param {object} transferData - Transfer data to save
 * @returns {object} Action object
 */
export function saveTransferState(transferData) {
    return {
        type: ActionTypes.SAVE_TRANSFER_STATE,
        payload: transferData
    };
}

/**
 * Action creator for clearing transfer state
 * @returns {object} Action object
 */
export function clearTransferState() {
    return {
        type: ActionTypes.CLEAR_TRANSFER_STATE
    };
}

/**
 * Action creator for adding a transfer
 * @param {object} transfer - Transfer object to add
 * @returns {object} Action object
 */
export function addTransfer(transfer) {
    return {
        type: ActionTypes.ADD_TRANSFER,
        payload: transfer
    };
}

/**
 * Action creator for updating a transfer
 * @param {object} transfer - Transfer object with updates
 * @returns {object} Action object
 */
export function updateTransfer(transfer) {
    return {
        type: ActionTypes.UPDATE_TRANSFER,
        payload: transfer
    };
}

/**
 * Action creator for saving endpoint browser state
 * @param {object} state - The endpoint browser state to save
 * @returns {object} Action object
 */
export function saveEndpointBrowserState(state) {
    return {
        type: ActionTypes.SAVE_ENDPOINT_BROWSER_STATE,
        payload: state
    };
}

/**
 * Action creator for updating UI state
 * @param {object} state - UI state to save
 * @returns {object} Action object
 */
export function updateUIState(state) {
    return {
        type: ActionTypes.UPDATE_UI_STATE,
        payload: state
    };
}

/**
 * Action creator for updating endpoint state
 * @param {object} state - Endpoint state to save
 * @returns {object} Action object
 */
export function updateEndpointState(state) {
    return {
        type: ActionTypes.UPDATE_ENDPOINT_STATE,
        payload: state
    };
}
