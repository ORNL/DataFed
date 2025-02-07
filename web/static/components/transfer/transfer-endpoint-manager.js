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
     * Performs autocomplete search for endpoints
     * @param {string} endpoint - The endpoint search term
     * @param {string} searchToken - Token to track current search request
     */
    searchEndpointAutocomplete(endpoint, searchToken) {
        this.api.epAutocomplete(endpoint, (ok, data) => {
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
                    this.dialogs.dlgAlert("Globus Error", data.code);
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
        console.info("Searching for endpoint:", endpoint);

        try {
            return this.api.epView(endpoint, (ok, data) => {
                if (searchToken !== this.currentSearchToken) {
                    console.warn("Ignoring stale epView response");
                    return;
                }

                if (ok && !data.code) {
                    console.info("Direct endpoint match found:", data);
                    this.#controller.uiManager.enableBrowseButton(true);
                    this.#controller.uiManager.handleSelectedEndpoint(data);
                } else {
                    console.warn("No direct match, trying autocomplete");
                    this.searchEndpointAutocomplete(endpoint, searchToken);
                }
            });
        } catch (error) {
            this.dialogs.dlgAlert("Globus Error", error);
        }
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
            console.info("Token mismatch - ignoring stale request");
            return;
        }

        // TODO What if the path is prepopulated to a dir and the mode is put? 
        const pathElement = $("#path", this.#controller.uiManager.state.frame);
        const path = pathElement?.val()?.trim() || "";

        // No input or set input to empty, reset state
        if (!path || !path.length) {
            this.endpointManagerList = null;
            this.currentEndpoint = null;
            this.updateMatchesList([]);
            this.#controller.uiManager.enableStartButton(false);
            this.#controller.uiManager.enableBrowseButton(false);
            return;
        }

        const endpoint = path.split("/")[0];
        console.info(
            "Extracted endpoint:",
            endpoint,
            "Current endpoint:",
            this.currentEndpoint?.name,
        );

        // Edge case: input is just a /. Ideally we have some middleware validation to avoid this
        if (endpoint && (!this.currentEndpoint || endpoint !== this.currentEndpoint.name)) {
            console.info("Endpoint changed or not set - searching for new endpoint");
            this.searchEndpoint(endpoint, searchToken);
        }
    }
}
