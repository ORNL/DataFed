import * as api from "../../api.js";
import * as dialogs from "../../dialogs.js";

export class TransferEndpointManager {
  constructor(dialog) {
    this.initialized = false;
    this.controller = dialog;
    this.currentEndpoint = null;
    this.endpointManagerList = null;
    this.searchCounter = 0;
    this.currentSearchToken = null;
  }

  /**
   * ------------GET------------
   */

  getEndpointStatus(endpoint) {
    if (!endpoint.activated && endpoint.expires_in === -1) return 'active';
    if (endpoint.activated) return `${Math.floor(endpoint.expires_in / 3600)} hrs`;
    return 'inactive';
  }

  searchEndpointAutocomplete(endpoint, searchToken) {
    api.epAutocomplete(endpoint, (ok, data) => {
      // Only proceed if this is still the current search
      if (searchToken !== this.currentSearchToken) {
        console.log('Ignoring stale autocomplete response');
        return;
      }

      if (ok && data.DATA && data.DATA.length) {
        console.log('Autocomplete matches found:', data.DATA.length);
        this.endpointManagerList = data.DATA;
        // Process endpoints and update UI
        data.DATA.forEach(ep => {
          ep.name = ep.canonical_name || ep.id;
        });
        this.updateMatchesList(data.DATA);
      } else {
        console.log('No matches found');
        this.endpointManagerList = null;
        this.updateMatchesList([]);
        if (data.code) {
          console.error('Autocomplete error:', data);
          dialogs.dlgAlert("Globus Error", data.code);
        }
      }
    });
  }

  searchEndpoint(endpoint, searchToken) {
    console.log('Searching for endpoint:', endpoint);

    try {
      return api.epView(endpoint, (ok, data) => {
        // Only proceed if this is still the current search
        if (searchToken !== this.currentSearchToken) {
          console.log('Ignoring stale epView response');
          return;
        }

        if (ok && !data.code) {
          console.log('Direct endpoint match found:', data);
          this.controller.uiManager.updateEndpoint(data);
          this.controller.uiManager.state.endpointOk = true;
          this.controller.uiManager.updateButtonStates();
        } else {
          // No exact match found, try autocomplete
          console.log('No direct match, trying autocomplete');
          this.searchEndpointAutocomplete(endpoint, searchToken);
        }
      });
    } catch (error) {
      dialogs.dlgAlert("Globus Error", error);
    }

  }

  /**
   * ------------UPDATE------------
   */

  updateMatchesList(endpoints = []) {
    const matches = $("#matches", this.controller.uiManager.frame);
    if (!endpoints.length) {
      matches.html("<option disabled selected>No Matches</option>");
      matches.prop("disabled", true);
      return;
    }

    const html = this.controller.uiManager.createMatchesHtml(endpoints);
    matches.html(html);
    matches.prop("disabled", false);
  }

  /**
   * ------------HANDLERS------------
   */

  handlePathInput(searchToken) {
    if (!this.initialized) {
      console.log('Dialog not yet initialized - delaying path input handling');
      setTimeout(() => this.handlePathInput(searchToken), 100);
      return;
    }

    console.log('handlePathInput called with token:', searchToken, 'current token:', this.currentSearchToken);

    if (searchToken !== this.currentSearchToken) {
      console.log('Token mismatch - ignoring stale request');
      return;
    }

    const path = $("#path", this.controller.uiManager.frame).val().trim();
    console.log('Processing path:', path);

    if (!path.length) {
      console.log('Empty path - disabling endpoint');
      this.endpointManagerList = null;
      this.updateMatchesList([]);
      this.controller.uiManager.updateButtonStates();
      return;
    }

    const endpoint = path.split('/')[0];
    console.log('Extracted endpoint:', endpoint, 'Current endpoint:', this.currentEndpoint?.name);


    if (!this.currentEndpoint || endpoint !== this.currentEndpoint.name) {
      console.log('Endpoint changed or not set - searching for new endpoint');
      this.controller.uiManager.updateButtonStates();
      this.searchEndpoint(endpoint, searchToken);
    }
  }

}