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
     * ------------UI UPDATE HELPERS------------
     */

    #resetUIForSearch() {
        console.debug("Resetting UI for search.");
        this.state.currentEndpoint = null;
        this.state.endpointManagerList = null;
        this.#updateMatchesList([]);
        // Also disable start button as no endpoint is confirmed yet
        this.#controller.uiManager.enableBrowseButton(false);
        this.#controller.uiManager.enableStartButton(false);
    }

    #updateMatchesList(endpoints = []) {
        const matches = $("#matches", this.#controller.uiManager.state.frame);
        if (!endpoints || !endpoints.length) {
            matches.html("<option disabled selected>No Matches</option>");
            matches.prop("disabled", true);
        } else {
            const html = createMatchesHtml(endpoints);
            matches.html(html);
            matches.prop("disabled", false);
        }
    }

    #updateUIForEndpointFound(endpointData) {
        console.info("Updating UI for directly found endpoint:", endpointData);
        this.#updateMatchesList(endpointData);
        this.#controller.uiManager.handleSelectedEndpoint(endpointData);
        this.#controller.uiManager.enableBrowseButton(true);
        this.#controller.uiManager.handleSelectionChange();
    }

    #updateUIWithMatches(endpoints) {
        console.debug("Updating UI with autocomplete matches.");
        this.state.endpointManagerList = endpoints;
        endpoints.forEach((ep) => {
            ep.name = ep.canonical_name || ep.id;
        });
        this.#updateMatchesList(endpoints);
        // Buttons remain disabled until a selection is made from the list
        this.#controller.uiManager.enableBrowseButton(false);
        this.#controller.uiManager.enableStartButton(false);
    }

    #updateUIForNoMatches() {
        console.warn("Updating UI for no matches found.");
        this.state.endpointManagerList = null;
        // Don't clear currentEndpoint here, as it might be valid from a previous selection
        this.#updateMatchesList([]);
        this.#controller.uiManager.enableBrowseButton(false);
        this.#controller.uiManager.enableStartButton(false);
    }

    #updateUIForAutocompleteFailure(data) {
        console.error("Autocomplete error:", data);
        this.#updateUIForNoMatches();
        if (data?.code) {
            this.dialogs.dlgAlert("Globus Error", `Autocomplete failed: ${data.code}`);
        } else {
            this.dialogs.dlgAlert("Globus Error", "Autocomplete failed due to an unknown error.");
        }
    }

    /**
     * ------------SEARCH LOGIC------------
     */

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
                console.debug("Ignoring stale autocomplete response.");
                return;
            }

            if (ok && data?.DATA?.length) {
                this.#updateUIWithMatches(data.DATA);
            } else {
                if (!ok || data?.code) {
                    this.#updateUIForAutocompleteFailure(data);
                } else {
                    this.#updateUIForNoMatches();
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
        console.info(`Searching for endpoint: "${endpoint}" (Token: ${searchToken})`);
        // Reset UI for the new search immediately
        this.#resetUIForSearch();

        try {
            return this.api.epView(endpoint, (ok, data) => {
                if (searchToken !== this.state.currentSearchToken) {
                    console.warn("Ignoring stale epView response");
                    return;
                }

                if (ok && !data.code) {
                    console.info("Direct endpoint match found:", data.id);
                    this.#updateUIForEndpointFound(data);
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
            this.#resetUIForSearch();
            // Explicitly set placeholder for matches dropdown when input is empty
            const matches = $("#matches", this.#controller.uiManager.state.frame);
            if (matches.length) {
                matches.html("<option disabled selected>Enter Endpoint</option>");
                matches.prop("disabled", true);
            }
            return;
        }

        // Extract potential endpoint identifier (part before the first '/')
        const endpoint = path.split("/")[0];
        const currentEndpointName =
            this.state.currentEndpoint?.name || this.state.currentEndpoint?.id;

        console.info(
            `Path input: "${path}", Extracted endpoint: "${endpoint}", Current endpoint name: "${
                currentEndpointName || "None"
            }"`,
        );

        // Trigger search if endpoint identifier is present and differs from current
        // or if there's no current endpoint selected yet.
        // Edge case: input is just a /. Ideally we have some middleware validation to avoid this
        if (
            endpoint &&
            (!this.state.currentEndpoint || endpoint !== this.state.currentEndpoint.name)
        ) {
            console.info("Endpoint identifier changed or not set - searching for:", endpoint);
            this.searchEndpoint(endpoint, searchToken);
        } else if (endpoint && this.state.currentEndpoint && endpoint === currentEndpointName) {
            // Endpoint name hasn't changed, but path might have.
            // Ensure buttons reflect current state (e.g., if path became valid/invalid)
            console.debug("Endpoint name unchanged, re-evaluating selection state.");
            this.#controller.uiManager.handleSelectionChange();
        } else if (!endpoint) {
            // This case should be caught by the `!path` check earlier, but added for robustness.
            console.warn("Path input resulted in empty endpoint identifier.");
            this.#resetUIForSearch();
        }
        // If the endpoint identifier *is* the same as current, and non-empty, we do nothing here,
        // assuming the user is just editing the path part after the endpoint.
        // handleSelectionChange called above covers path validity checks.
    }
}
