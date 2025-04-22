import { createMatchesHtml } from "./transfer-templates.js";

/**
 * @class TransferEndpointManager
 *
 * Manages endpoint operations and state for file transfers
 */
export class TransferEndpointManager {
    #controller;

    /**
     * Creates a new TransferEndpointManager instance
     * @param {object} controller - The transfer controller instance
     * @param {object} services - The service objects to use for API and dialog operations
     * @param {object} services.dialogs - Dialog service
     * @param {Function} services.dialogs.dlgAlert - Alert dialog function
     * @param {object} services.api - API service
     * @param {Function} services.api.epView - Endpoint view API function
     * @param {Function} services.api.epAutocomplete - Endpoint autocomplete API function
     */
    constructor(controller, services) {
        this.initialized = false;
        this.#controller = controller;
        this.api = services.api; // Dependency injection
        this.dialogs = services.dialogs; // Dependency injection

        // Search tracking mechanism to prevent race conditions:
        // Without this, out-of-order API responses could update the UI with stale data
        // Example: User types "abc" then quickly types "xyz"
        //  - "abc" search starts (token: 1)
        //  - "xyz" search starts (token: 2)
        //  - "abc" results return (ignored, token mismatch)
        //  - "xyz" results return (processed, matching token)
        this.state = {
            currentEndpoint: null,
            endpointManagerList: null, // List of endpoint matches
            currentSearchToken: null, // Tracks the latest valid search request
            searchTokenIterator: 0, // Generates unique tokens for each search request
            initialized: false, // Flag to indicate that the dialog is initialized
        };
    }

    /**
     * Performs autocomplete search for endpoints
     * @param {string} endpoint - The endpoint search term
     * @param {string} searchToken - Token to track current search request
     */
    searchEndpointAutocomplete(endpoint, searchToken) {
        this.api.epAutocomplete(endpoint, (ok, data) => {
            // Prevent race conditions by ignoring responses from outdated searches
            // Without this check, rapid typing could cause UI flickering and incorrect results
            // as slower API responses return after newer searches
            if (searchToken !== this.state.currentSearchToken) {
                return;
            }

            if (ok && data.DATA && data.DATA.length) {
                this.state.endpointManagerList = data.DATA;
                // Process endpoints and update UI
                data.DATA.forEach((ep) => {
                    ep.name = ep.canonical_name || ep.id;
                });
                this.updateMatchesList(data.DATA);
                // Ensure browse button is disabled until a selection is made from matches
                this.#controller.uiManager.enableBrowseButton(false);
                // Also disable start button as no endpoint is confirmed yet
                this.#controller.uiManager.enableStartButton(false);
            } else {
                console.warn("No matches found via autocomplete");
                this.state.endpointManagerList = null;
                this.updateMatchesList([]);
                // Disable browse/start buttons as no endpoint could be resolved
                this.#controller.uiManager.enableBrowseButton(false);
                this.#controller.uiManager.enableStartButton(false);
                if (data.code) {
                    console.error("Autocomplete error:", data);
                    // Optionally show an alert, but often just showing "No Matches" is enough
                    this.dialogs.dlgAlert("Globus Error", data.code);
                }
            }
        });
    }

    /**
     * Searches for a specific endpoint by trying epView first, then falling back to autocomplete.
     * @param {string} endpoint - The endpoint identifier (UUID, canonical name, display name, etc.)
     * @param {string} searchToken - Token to track current search request
     */
    searchEndpoint(endpoint, searchToken) {
        console.info("Searching for endpoint:", endpoint);
        // Reset matches list and disable buttons initially for the new search
        this.updateMatchesList([]);
        this.#controller.uiManager.enableBrowseButton(false);
        this.#controller.uiManager.enableStartButton(false);
        this.state.currentEndpoint = null; // Clear current endpoint until resolved

        // 1. Try direct epView first (handles UUIDs, canonical names)
        this.api.epView(endpoint, (ok, data) => {
            if (searchToken !== this.state.currentSearchToken) {
                console.warn("Ignoring stale epView response (direct attempt)");
                return;
            }

            if (ok && !data.code) {
                // Exact match found via epView
                console.info("Direct endpoint match found via epView:", data);
                // Update UI immediately with the single, confirmed match
                this.#controller.uiManager.handleSelectedEndpoint(data);
                // Enable browse button now that we have a valid endpoint
                this.#controller.uiManager.enableBrowseButton(true);
                // Trigger selection change check which might enable the start button
                this.#controller.uiManager.handleSelectionChange();
            } else {
                // epView failed, likely not a UUID/canonical name. Try autocomplete.
                console.warn("Direct epView failed for '"+ endpoint +"', trying autocomplete. Error:", data?.code || "N/A");
                this.searchEndpointAutocomplete(endpoint, searchToken);
            }
        });
    }

    /**
     * ------------UPDATE------------
     */

    /**
     * Updates the list of endpoint matches in the UI
     * @param {Array<object>} [endpoints=[]] - Array of endpoint objects
     */
    updateMatchesList(endpoints = []) {
        const matches = $("#matches", this.#controller.uiManager.state.frame);
        // Ensure matches element exists before proceeding
        if (!matches.length) {
            console.warn("Matches dropdown element not found in UI.");
            return;
        }
        if (!endpoints.length) {
            matches.html("<option disabled selected>No Matches</option>");
            matches.prop("disabled", true);
        } else {
            const html = createMatchesHtml(endpoints);
            matches.html(html);
            matches.prop("disabled", false);
        }
    }

    /**
     * ------------HANDLERS------------
     */

    /**
     * Handles path input changes and triggers endpoint search
     * @param {string} searchToken - Token to track current search request
     */
    handlePathInput(searchToken) {
        // Check initialization state using the manager's own state
        if (!this.state.initialized) {
            console.warn("Dialog not yet initialized - delaying path input handling");
            // Ensure 'this' context is preserved in setTimeout
            setTimeout(() => this.handlePathInput(searchToken), 100);
            return;
        }

        // Validate search token
        if (searchToken !== this.state.currentSearchToken) {
            console.info("Token mismatch - ignoring stale request");
            return;
        }

        const pathElement = $("#path", this.#controller.uiManager.state.frame);
        const path = pathElement?.val()?.trim() || "";

        // Handle empty input
        if (!path) {
            console.info("Path input cleared.");
            this.state.endpointManagerList = null;
            this.state.currentEndpoint = null;
            this.updateMatchesList([]);
            this.#controller.uiManager.enableStartButton(false);
            this.#controller.uiManager.enableBrowseButton(false);
            // Clear the matches dropdown explicitly
            const matches = $("#matches", this.#controller.uiManager.state.frame);
            if (matches.length) {
                matches.html("<option disabled selected>Enter Endpoint</option>");
                matches.prop("disabled", true);
            }
            return;
        }

        const endpoint = path.split("/")[0];
        console.info(
            "Extracted endpoint:", endpoint,
            "Current endpoint name:", this.state.currentEndpoint?.name || "None"
        );

        // Trigger search if endpoint identifier is present and differs from current
        // or if there's no current endpoint selected yet.
        if (endpoint && (!this.state.currentEndpoint || endpoint !== this.state.currentEndpoint.name)) {
            console.info("Endpoint identifier changed or not set - searching for:", endpoint);
            this.searchEndpoint(endpoint, searchToken);
        } else if (endpoint && this.state.currentEndpoint && endpoint === this.state.currentEndpoint.name) {
            // Endpoint name hasn't changed, but path might have.
            // Ensure buttons reflect current state (e.g., if path became valid/invalid)
            console.info("Endpoint name unchanged, re-evaluating selection state.");
            this.#controller.uiManager.handleSelectionChange();
        } else if (!endpoint) {
             // This case should be caught by the `!path` check earlier, but added for robustness.
             console.warn("Path input resulted in empty endpoint identifier.");
             this.state.currentEndpoint = null;
             this.updateMatchesList([]);
             this.#controller.uiManager.enableStartButton(false);
             this.#controller.uiManager.enableBrowseButton(false);
        }
    }
}
