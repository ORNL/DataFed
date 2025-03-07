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
    resumeData: null
};

/**
 * Action types for transfer reducer
 */
export const ActionTypes = {
    SAVE_TRANSFER_STATE: 'SAVE_TRANSFER_STATE',
    CLEAR_TRANSFER_STATE: 'CLEAR_TRANSFER_STATE',
    ADD_TRANSFER: 'ADD_TRANSFER',
    UPDATE_TRANSFER: 'UPDATE_TRANSFER',
    SAVE_ENDPOINT_BROWSER_STATE: 'SAVE_ENDPOINT_BROWSER_STATE'
};

/**
 * Reducer function for transfer state
 * @param {Object} state - Current state
 * @param {Object} action - Action object with type and payload
 * @returns {Object} New state
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
                resumeData: null 
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
            
        default:
            return state;
    }
}

/**
 * Action creator for saving transfer state
 * @param {Object} transferData - Transfer data to save
 * @returns {Object} Action object
 */
export function saveTransferState(transferData) {
    return {
        type: ActionTypes.SAVE_TRANSFER_STATE,
        payload: transferData
    };
}

/**
 * Action creator for clearing transfer state
 * @returns {Object} Action object
 */
export function clearTransferState() {
    return {
        type: ActionTypes.CLEAR_TRANSFER_STATE
    };
}

/**
 * Action creator for adding a transfer
 * @param {Object} transfer - Transfer object to add
 * @returns {Object} Action object
 */
export function addTransfer(transfer) {
    return {
        type: ActionTypes.ADD_TRANSFER,
        payload: transfer
    };
}

/**
 * Action creator for updating a transfer
 * @param {Object} transfer - Transfer object with updates
 * @returns {Object} Action object
 */
export function updateTransfer(transfer) {
    return {
        type: ActionTypes.UPDATE_TRANSFER,
        payload: transfer
    };
}

/**
 * Action creator for saving endpoint browser state
 * @param {Object} state - The endpoint browser state to save
 * @returns {Object} Action object
 */
export function saveEndpointBrowserState(state) {
    return {
        type: ActionTypes.SAVE_ENDPOINT_BROWSER_STATE,
        payload: state
    };
}
