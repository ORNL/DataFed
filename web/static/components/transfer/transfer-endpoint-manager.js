import * as api from "../../api.js";
import { dlgAlert } from "../../dialogs.js";
import { createMatchesHtml } from "./transfer-templates.js";

/**
 * @classDesc Manages endpoint operations and state for file transfers
 * @class TransferEndpointManager
 */
export class TransferEndpointManager {
    #controller;

    /**
     * Creates a new TransferEndpointManager instance
     * @param {Object} controller - The transfer controller instance
     */
    constructor(controller) {
        this.initialized = false;
        this.#controller = controller;
        this.currentEndpoint = null;
        this.endpointManagerList = null;
        // Search tracking mechanism to prevent race conditions:
        //  * searchTokenIterator generates unique tokens for each search request
        //  * currentSearchToken tracks the latest valid search request
        // Without this, out-of-order API responses could update the UI with stale data
        // Example: User types "abc" then quickly types "xyz"
        //  - "abc" search starts (token: 1)
        //  - "xyz" search starts (token: 2)
        //  - "abc" results return (ignored, token mismatch)
        //  - "xyz" results return (processed, matching token)
        this.currentSearchToken = null;
        this.searchTokenIterator = 0;
    }

    /**
     * ------------GET------------
     */

    /**
     * Gets the status of an endpoint
     * @param {Object} endpoint - The endpoint object
     * @param {boolean} endpoint.activated - Whether the endpoint is activated
     * @param {number} endpoint.expires_in - Time until expiration in seconds
     * @returns {string} Status string indicating endpoint state
     */
    getEndpointStatus(endpoint) {
        if (!endpoint.activated && endpoint.expires_in === -1) return "active";
        if (endpoint.activated) return `${Math.floor(endpoint.expires_in / 3600)} hrs`;
        return "inactive";
    }

    /**
     * Performs autocomplete search for endpoints
     * @param {string} endpoint - The endpoint search term
     * @param {string} searchToken - Token to track current search request
     */
    searchEndpointAutocomplete(endpoint, searchToken) {
        api.epAutocomplete(endpoint, (ok, data) => {
            // Prevent race conditions by ignoring responses from outdated searches
            // Without this check, rapid typing could cause UI flickering and incorrect results
            // as slower API responses return after newer searches
            if (searchToken !== this.currentSearchToken) {
                return;
            }

            if (ok && data.DATA && data.DATA.length) {
                this.endpointManagerList = data.DATA;
                // Process endpoints and update UI
                data.DATA.forEach((ep) => {
                    ep.name = ep.canonical_name || ep.id;
                });
                this.updateMatchesList(data.DATA);
            } else {
                console.warn("No matches found");
                this.endpointManagerList = null;
                this.updateMatchesList([]);
                if (data.code) {
                    console.error("Autocomplete error:", data);
                    dlgAlert("Globus Error", data.code);
                }
            }
        });
    }

    /**
     * Searches for a specific endpoint
     * @param {string} endpoint - The endpoint to search for
     * @param {string} searchToken - Token to track current search request
     * @returns {Promise|undefined} API response promise if available
     */
    searchEndpoint(endpoint, searchToken) {
        console.log("Searching for endpoint:", endpoint);

        try {
            return api.epView(endpoint, (ok, data) => {
                if (searchToken !== this.currentSearchToken) {
                    console.warn("Ignoring stale epView response");
                    return;
                }

                if (ok && !data.code) {
                    console.log("Direct endpoint match found:", data);
                    this.#controller.uiManager.updateEndpoint(data);
                    this.#controller.uiManager.state.endpointOk = true;
                    this.#controller.uiManager.updateButtonStates();
                } else {
                    console.warn("No direct match, trying autocomplete");
                    this.searchEndpointAutocomplete(endpoint, searchToken);
                }
            });
        } catch (error) {
            dlgAlert("Globus Error", error);
        }
    }

    /**
     * ------------UPDATE------------
     */

    /**
     * Updates the list of endpoint matches in the UI
     * @param {Array<Object>} [endpoints=[]] - Array of endpoint objects
     */
    updateMatchesList(endpoints = []) {
        const matches = $("#matches", this.#controller.uiManager.state.frame);
        if (!endpoints.length) {
            matches.html("<option disabled selected>No Matches</option>");
            matches.prop("disabled", true);
            return;
        }

        const html = createMatchesHtml(endpoints);
        matches.html(html);
        matches.prop("disabled", false);
    }

    /**
     * ------------HANDLERS------------
     */

    /**
     * Handles path input changes and triggers endpoint search
     * @param {string} searchToken - Token to track current search request
     */
    handlePathInput(searchToken) {
        if (!this.initialized) {
            console.warn("Dialog not yet initialized - delaying path input handling");
            setTimeout(() => this.handlePathInput(searchToken), 100);
            return;
        }

        // Validate that we're processing the most recent search request
        // This prevents wasted API calls and UI updates for abandoned searches
        if (searchToken !== this.currentSearchToken) {
            console.log("Token mismatch - ignoring stale request");
            return;
        }

        const path = $("#path", this.#controller.uiManager.state.frame).val().trim();
        console.log("Processing path:", path);

        if (!path.length) {
            console.log("Empty path - disabling endpoint");
            this.endpointManagerList = null;
            this.updateMatchesList([]);
            this.#controller.uiManager.updateButtonStates();
            return;
        }

        const endpoint = path.split("/")[0];
        console.log(
            "Extracted endpoint:",
            endpoint,
            "Current endpoint:",
            this.currentEndpoint?.name,
        );

        if (!this.currentEndpoint || endpoint !== this.currentEndpoint.name) {
            console.log("Endpoint changed or not set - searching for new endpoint");
            this.#controller.uiManager.updateButtonStates();
            this.searchEndpoint(endpoint, searchToken);
        }
    }
}
