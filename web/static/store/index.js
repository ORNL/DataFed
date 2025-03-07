/**
 * @module Store
 * @description A simple Redux-like state management implementation
 */

/**
 * Creates a Redux-like store
 * @param {Function} reducer - The reducer function
 * @param {Object} initialState - The initial state
 * @returns {Object} Store object with getState, dispatch, and subscribe methods
 */
export const createStore = (reducer, initialState) => {
    let state = initialState;
    let listeners = [];

    /**
     * Gets the current state
     * @returns {Object} The current state
     */
    function getState() {
        return state;
    }

    /**
     * Dispatches an action to update state
     * @param {Object} action - The action object with type and payload
     * @returns {Object} The action object
     */
    function dispatch(action) {
        state = reducer(state, action);
        listeners.forEach((listener) => listener());
        return action;
    }

    /**
     * Subscribes to state changes
     * @param {Function} listener - The listener function
     * @returns {Function} Unsubscribe function
     */
    function subscribe(listener) {
        listeners.push(listener);
        return function unsubscribe() {
            listeners = listeners.filter((l) => l !== listener);
        };
    }

    // Initialize the state
    dispatch({ type: "@@INIT" });

    return {
        getState,
        dispatch,
        subscribe,
    };
};
