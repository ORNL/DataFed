import * as model from "./model.js";
import * as util from "./util.js";
import * as settings from "./settings.js";
import * as api from "./api.js";
import * as dialogs from "./dialogs.js";
import * as dlgEpBrowse from "./dlg_ep_browse.js";

/**
 * Custom error class for transfer-related errors
 */
class TransferError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'TransferError';
    this.code = code;
  }
}

/**
 * Manages dialog state
 */
class TransferState {
  constructor() {
    this.frame = null;
    this.currentEndpoint = null;
    this.endpointList = null;
    this.searchCounter = 0;
    this.currentSearchToken = null;
    this.inputTimer = null;
    this.selectionOk = true;
    this.endpointOk = false;
  }

  reset() {
    this.currentEndpoint = null;
    this.endpointOk = false;
    this.selectionOk = true;
  }
}

/**
 * Model class for transfer dialog data and state
 */
/**
 * Model class for transfer dialog data and validation
 */
class TransferModel {
  /**
   * @param {number} mode - Transfer mode (GET/PUT)
   * @param {Array<Object>} records - Data records
   */
  constructor(mode, records) {
    this.mode = mode;
    this.records = records || [];
    this.selectedIds = new Set();
    this.endpoint = null;
    this.transferConfig = {
      path: records?.[0]?.source || '',  // Initialize with source if available
      encrypt: 1,
      extension: '',
      origFilename: false
    };

    if (records) {
      this.stats = this.calculateStats();
      this.processRecords();
    }
  }

  /**
   * Validates transfer configuration
   * @throws {TransferError} If validation fails
   */
  validateConfig(config) {
    if (!config?.path?.trim()) {
      throw new TransferError("Path cannot be empty", "INVALID_PATH");
    }
    if (config.encrypt === undefined) {
      throw new TransferError("Encryption mode must be specified", "INVALID_ENCRYPT");
    }
    if (this.mode === model.TT_DATA_PUT && config.extension && !config.extension.match(/^[a-zA-Z0-9._-]*$/)) {
      throw new TransferError("Invalid file extension format", "INVALID_EXTENSION");
    }
    return true;
  }

  calculateStats() {
    return this.records.reduce((stats, record) => {
      if (this.isRecordValid(record)) {
        stats.totalSize += parseInt(record.size);
        this.selectedIds.add(record.id);
      } else {
        stats.skippedCount++;
      }
      return stats;
    }, {totalSize: 0, skippedCount: 0});
  }

  /**
   * Process records to calculate totals and selection state
   * @private
   */
  processRecords() {
    this.records.forEach(record => {
      if (this.isRecordValid(record)) {
        this.totalSize += parseInt(record.size);
        this.selectedIds.add(record.id);
      } else {
        this.skippedCount++;
      }
    });
  }

  /**
   * Check if record is valid for transfer
   * @param {Object} record - Data record
   * @returns {boolean}
   */
  isRecordValid(record) {
    return record.size > 0 && !record.locked;
  }

  /**
   * Get selected record IDs
   * @returns {Array<string>}
   */
  getSelectedIds() {
    return Array.from(this.selectedIds);
  }

  /**
   * Get record tree data for display
   * @returns {Array<Object>} Tree node data
   */
  getRecordTreeData() {
    return this.records.map(item => {
      const info = this.getRecordInfo(item);
      return {
        title: this.formatRecordTitle(item, info),
        selected: info.selectable,
        unselectable: !info.selectable,
        key: item.id
      };
    });
  }

  /**
   * Get record information
   * @private
   * @param {Object} item Record item
   * @returns {Object} Record info
   */
  getRecordInfo(item) {
    if (item.size === 0) {
      return {info: "(empty)", selectable: false};
    }
    if (item.locked) {
      return {info: "(locked)", selectable: false};
    }
    return {
      info: util.sizeToString(item.size),
      selectable: true
    };
  }

  /**
   * Format record title for display
   * @private
   */
  formatRecordTitle(item, info) {
    const titleText = `${item.id}&nbsp&nbsp&nbsp<span style='display:inline-block;width:9ch'>${info.info}</span>&nbsp${item.title}`;
    return info.selectable ? titleText : `<span style='color:#808080'>${titleText}</span>`;
  }

  setEndpointList(endpoints) {
    this.endpointList = endpoints;
  }

  clearEndpoint() {
    this.endpoint = null;
    this.endpointOk = false;
  }

  /**
   * Get default path for endpoint
   * @param {Object} endpoint Endpoint data
   * @returns {string} Default path
   */
  getDefaultPath(endpoint) {
    if (!this.endpoint) return '';
    const path = this.endpoint.name +
      (this.endpoint.default_directory || "/");
    return path.replace("{server_default}/", '');
    ;
  }
}

/**
 * TransferDialog class manages the UI and logic for data transfers
 */
/**
 * TransferDialog class manages the UI and logic for data transfers
 */
/**
 * Handles all event bindings and callbacks
 */
class EventHandler {
  constructor(dialog) {
    this.dialog = dialog;
    this.boundHandlers = {
      pathInput: this.handlePathInput.bind(this),
      matchesChange: this.handleMatchesChange.bind(this),
      transfer: this.handleTransfer.bind(this),
      selectionChange: this.handleSelectionChange.bind(this)
    };
  }

  /**
   * Attaches all event handlers
   */
  attachEvents() {
    const frame = this.dialog.state.frame;
    $("#path", frame).on('input', this.boundHandlers.pathInput);
    $("#matches", frame).on('change', this.boundHandlers.matchesChange);
    $("#records", frame).on('select', this.boundHandlers.selectionChange);
    this.attachTransferHandlers();
  }

  /**
   * Attaches transfer-specific handlers
   */
  attachTransferHandlers() {
    const frame = this.dialog.state.frame;
    $("#browse", frame).on('click', () => this.dialog.handleBrowse());
    $("#activate", frame).on('click', () => {
      if (this.dialog.state.currentEndpoint) {
        window.open(`https://app.globus.org/file-manager?origin_id=${
          encodeURIComponent(this.dialog.state.currentEndpoint.id)}`, '');
      }
    });
  }

  /**
   * Handles path input changes
   * @param {Event} event Input event
   */
  handlePathInput(event) {
    clearTimeout(this.dialog.state.inputTimer);
    this.dialog.state.currentSearchToken = ++this.dialog.state.searchCounter;
    const value = $(event.target).val().trim();
    this.dialog.state.inputTimer = setTimeout(() => 
      this.dialog.handleEndpointSearch(value), 250);
  }

  /**
   * Handles matches selection changes
   * @param {Event} event Change event
   */
  handleMatchesChange(event) {
    this.dialog.handleMatchesChange(event);
  }

  /**
   * Handles transfer button click
   */
  async handleTransfer() {
    try {
      const config = this.dialog.getTransferConfig();
      this.dialog.model.validateConfig(config);
      await this.dialog.startTransfer(config);
    } catch (error) {
      if (error instanceof TransferError) {
        dialogs.dlgAlert("Transfer Error", error.message);
      } else {
        console.error("Unexpected error:", error);
        dialogs.dlgAlert("Error", "An unexpected error occurred");
      }
    }
  }

  /**
   * Handles selection changes
   */
  handleSelectionChange() {
    this.dialog.handleSelectionChange();
  }
}

/**
 * TransferDialog class manages the UI and logic for data transfers
 */
class TransferDialog {
  /**
   * @param {number} mode - Transfer mode (GET/PUT)
   * @param {Array<Object>} ids - Records to transfer
   * @param {Function} callback - Completion callback
   */
  constructor(mode, ids, callback) {
    this.model = new TransferModel(mode, ids);
    this.mode = mode;
    this.ids = ids;
    this.callback = callback;
    this.state = new TransferState();
    this.eventHandler = new EventHandler(this);
  }
  constructor(dialog) {
    this.dialog = dialog;
    this.boundHandlers = {
      pathInput: this.handlePathInput.bind(this),
      matchesChange: this.handleMatchesChange.bind(this),
      transfer: this.handleTransfer.bind(this),
      selectionChange: this.handleSelectionChange.bind(this)
    };
  }

  /**
   * Attaches all event handlers
   */
  attachEvents() {
    const frame = this.dialog.state.frame;
    $("#path", frame).on('input', this.boundHandlers.pathInput);
    $("#matches", frame).on('change', this.boundHandlers.matchesChange);
    $("#records", frame).on('select', this.boundHandlers.selectionChange);
    this.attachTransferHandlers();
  }

  /**
   * Attaches transfer-specific handlers
   */
  attachTransferHandlers() {
    const frame = this.dialog.state.frame;
    $("#browse", frame).on('click', () => this.dialog.handleBrowse());
    $("#activate", frame).on('click', () => {
      if (this.dialog.state.currentEndpoint) {
        window.open(`https://app.globus.org/file-manager?origin_id=${
          encodeURIComponent(this.dialog.state.currentEndpoint.id)}`, '');
      }
    });
  }

  /**
   * Handles path input changes
   * @param {Event} event Input event
   */
  handlePathInput(event) {
    clearTimeout(this.dialog.state.inputTimer);
    this.dialog.state.currentSearchToken = ++this.dialog.state.searchCounter;
    const value = $(event.target).val().trim();
    this.dialog.state.inputTimer = setTimeout(() => 
      this.dialog.handleEndpointSearch(value), 250);
  }

  /**
   * Handles matches selection changes
   * @param {Event} event Change event
   */
  handleMatchesChange(event) {
    this.dialog.handleMatchesChange(event);
  }

  /**
   * Handles transfer button click
   */
  async handleTransfer() {
    try {
      const config = this.dialog.getTransferConfig();
      this.dialog.model.validateConfig(config);
      await this.dialog.startTransfer(config);
    } catch (error) {
      if (error instanceof TransferError) {
        dialogs.dlgAlert("Transfer Error", error.message);
      } else {
        console.error("Unexpected error:", error);
        dialogs.dlgAlert("Error", "An unexpected error occurred");
      }
    }
  }

  /**
   * Handles selection changes
   */
  handleSelectionChange() {
    this.dialog.handleSelectionChange();
  }
}

  show() {
    this.state.frame = this.createDialog();
    this.initializeComponents();
    this.attachEventHandlers();
    this.showDialog();
  }

  safeUIOperation(operation) {
    try {
      operation();
    } catch (error) {
      console.error("UI Operation failed:", error);
      this.initializeUIComponents();
    }
  }

  /**
   * Creates the dialog DOM structure
   * @private
   * @returns {jQuery} Dialog jQuery element
   */
  createDialog() {
    const frame = $(document.createElement('div'));
    const labels = this.getDialogLabels();
    frame.html(this.getDialogTemplate(labels));
    return frame;
  }

  getBrowsePath(currentPath) {
    const delimiter = currentPath.indexOf("/");
    if (delimiter === -1) return this.state.currentEndpoint.default_directory || "/";
    let path = currentPath.substr(delimiter);
    return path.endsWith("/") ? path : path.substr(0, path.lastIndexOf("/") + 1);
  }

  getDialogLabels() {
    const isGet = this.mode === model.TT_DATA_GET;
    return {
      endpoint: isGet ? "Destination" : "Source",
      record: isGet ? "Source" : "Destination",
      dialogTitle: isGet ? "Download Raw Data" : "Upload Raw Data"
    };
  }

  getDialogOptions() {
    return {
      title: this.getDialogLabels().dialogTitle,
      modal: true,
      width: '600',
      height: 'auto',
      resizable: true,
      buttons: [
        {
          text: "Cancel",
          click: () => this.closeDialog()
        },
        {
          id: "go_btn",
          text: "Start",
          click: () => this.handleTransfer()
        }
      ],
      open: () => this.showDialog(),
      close: (ev, ui) => {
        $(this).dialog("destroy").remove();
      }
    };
  }

  getDialogTemplate(labels) {
    return `
             <div class='ui-widget' style='height:95%'>
                 ${labels.record}: <span id='title'></span><br>
                 <div class='col-flex' style='height:100%'>
                     <div id='records' class='ui-widget ui-widget-content'
                          style='flex: 1 1 auto;display:none;height:6em;overflow:auto'>
                     </div>
                     <div style='flex:none'><br>
                         <span>${labels.endpoint} Path:</span>
                         <div style='display: flex; align-items: flex-start;'>
                             <textarea class='ui-widget-content' id='path' rows=3
                                      style='width:100%;resize:none;'></textarea>
                             <button class='btn small' id='browse'
                                     style='margin-left:10px; line-height:1.5; vertical-align: top;'
                                     disabled>Browse</button>
                         </div>
                         <br>
                         <select class='ui-widget-content ui-widget' id='matches'
                                 size='7' style='width: 100%;' disabled>
                             <option disabled selected>No Matches</option>
                         </select>
                         ${this.getTransferOptionsTemplate()}
                     </div>
                 </div>
             </div>
         `;
  }

  handleSelectionChange() {
    const selectedNodes = this.recordTree.getSelectedNodes();
    this.state.selectionOk = selectedNodes.length > 0;
    this.updateButtonStates();
  }

  getSelectedIds() {
    if (this.model.records.length === 1) {
      return [this.model.records[0].id];
    }

    return this.recordTree.getSelectedNodes()
      .map(node => node.key);
  }

  /**
   * ------------INITIALIZERS------------
   */

  /**
   * Leader
   */
  initializeComponents() {
    this.initializeRecordDisplay();
    this.initializeEndpointInput();
    this.initializeTransferOptions();
    this.initializeBrowseButton()
    this.updateButtonStates();

    // Add activation button handling
    $("#activate", this.state.frame).on('click', () => {
      window.open(`https://app.globus.org/file-manager?origin_id=${
        encodeURIComponent(this.state.currentEndpoint.id)}`, '');
    });
  }

  initializeUIComponents() {
    // Initialize all buttons
    $(".btn", this.state.frame).button();

    // Initialize radio buttons
    $(":radio", this.state.frame).checkboxradio();

    // Initialize checkboxes if needed
    if (this.model.mode === model.TT_DATA_GET) {
      $("#orig_fname", this.state.frame).checkboxradio();
    }

    // Initialize the go button
    $("#go_btn").button().button("disable");

    // Initialize browse button
    $("#browse", this.state.frame).button().button("disable");
  }

  initializeBrowseButton() {
    $("#browse", this.state.frame).on('click', () => {
      if (!this.state.currentEndpoint) return;

      const pathInput = $("#path", this.state.frame);
      let browsePath = this.getBrowsePath(pathInput.val());

      dlgEpBrowse.show(
        this.state.currentEndpoint,
        browsePath,
        this.model.mode === model.TT_DATA_GET ? "dir" : "file",
        (selectedPath) => {
          pathInput.val(this.state.currentEndpoint.name + selectedPath);
        }
      );
    });
  }

  initializeEndpointInput() {
    const pathInput = $("#path", this.state.frame);
    util.inputTheme(pathInput);

    pathInput.on('input', () => {
      clearTimeout(this.state.inputTimer);
      this.state.currentSearchToken = ++this.state.searchCounter;
      this.state.inputTimer = setTimeout(() =>
        this.handleEndpointSearch(pathInput.val().trim()), 250);
    });

    if (settings.ep_recent.length) {
      pathInput.val(settings.ep_recent[0]);
      pathInput.select();
      pathInput.autocomplete({
        source: settings.ep_recent,
        select: () => this.handlePathInput(pathInput.val().trim())
      });
      this.handlePathInput(pathInput.val().trim());
    }
  }

  initializeRecordDisplay() {
    if (!this.ids) {
      $("#title", this.state.frame).html("(new record)");
      return;
    }

    if (this.ids.length > 0) {
      this.initializeRecordTree();
    }
  }

  initializeTransferOptions() {
    $(":radio", this.state.frame).checkboxradio();

    if (this.model.mode === model.TT_DATA_GET) {
      $("#orig_fname", this.state.frame).checkboxradio();
    }

    util.inputTheme($("#ext", this.state.frame));
  }

  initializeRecordTree() {
    const treeConfig = {
      extensions: ["themeroller"],
      themeroller: {
        activeClass: "my-fancytree-active",
        hoverClass: ""
      },
      source: this.model.getRecordTreeData(),
      checkbox: true,
      selectMode: 3,
      icon: false,
      select: () => this.handleSelectionChange()
    };

    $("#records", this.state.frame).show()
      .fancytree(treeConfig);

    this.recordTree = $.ui.fancytree.getTree("#records");
  }

  /**
   * ------------TRANSFERS------------
   */

  getTransferConfig() {
    const path = $("#path", this.state.frame).val().trim();
    if (!path) {
      dialogs.dlgAlert("Input Error", "Path cannot be empty.");
      return null;
    }

    return {
      path,
      encrypt: $("input[name='encrypt_mode']:checked", this.state.frame).val(),
      origFilename: $("#orig_fname", this.state.frame).prop("checked"),
      extension: $("#ext", this.state.frame).val()?.trim()
    };
  }

  startTransfer(config) {
    const ids = this.getSelectedIds();

    api.xfrStart(
      ids,
      this.mode,
      config.path,
      config.extension,
      config.encrypt,
      config.origFilename,
      (ok, data) => this.handleTransferResponse(ok, data)
    );
  }

  getTransferOptionsTemplate() {
    const encryptionOptions = `
             <br>Transfer Encryption:&nbsp
             <input type='radio' id='encrypt_none' name='encrypt_mode' value='0'>
             <label for='encrypt_none'>None</label>&nbsp
             <input type='radio' id='encrypt_avail' name='encrypt_mode' value='1' checked/>
             <label for='encrypt_avail'>If Available</label>&nbsp
             <input type='radio' id='encrypt_req' name='encrypt_mode' value='2'/>
             <label for='encrypt_req'>Required</label><br>
         `;

    const modeSpecificOptions = this.mode === model.TT_DATA_PUT
      ? `<br>File extension override: <input id='ext' type='text'></input><br>`
      : `<br><label for='orig_fname'>Download to original filename(s)</label>
                <input id='orig_fname' type='checkbox'></input>`;

    return encryptionOptions + modeSpecificOptions;
  }

  /**
   * ------------HANDLERS------------
   */

  attachEventHandlers() {
    this.attachMatchesHandler();
  }

  attachMatchesHandler() {
    $("#matches", this.state.frame).on('change', (ev) => {
      this.handleMatchesChange(ev);
    });
  }

  handleTransfer() {
    const config = this.getTransferConfig();
    if (!config) return;

    if (this.mode === model.TT_DATA_GET || this.mode === model.TT_DATA_PUT) {
      this.startTransfer(config);
    } else {
      this.callback(config.path, config.encrypt);
      this.closeDialog();
    }
  }

  handleMatchesChange(event) {
    if (!this.endpointList) return;

    const selectedIndex = $(event.target).prop('selectedIndex') - 1;
    const endpoint = this.endpointList[selectedIndex].id;

    api.epView(endpoint, (ok, data) => {
      if (ok && !data.code) {
        this.updateEndpoint(data);
      } else {
        dialogs.dlgAlert("Globus Error", data);
      }
    });
  }

  handleTransferResponse(ok, data) {
    if (ok) {
      clearTimeout(this.state.inputTimer);
      this.closeDialog();
      util.setStatusText(`Task '${data.task.id}' created for data transfer.`);
      this.callback?.();
    } else {
      dialogs.dlgAlert("Transfer Error", data);
    }
  }

  handlePathInput(searchToken) {
    if (searchToken !== this.currentSearchToken) return;

    const path = $("#path", this.state.frame).val().trim();
    if (!path.length) {
      this.endpointList = null;
      this.updateMatchesList();
      return;
    }

    const endpoint = path.split('/')[0];
    if (!this.state.currentEndpoint || endpoint !== this.state.currentEndpoint.name) {
      this.state.endpointOk = false;
      this.updateButtonStates();
      this.searchEndpoint(endpoint);
    }
  }

  closeDialog() {
    clearTimeout(this.inputTimer);
    this.state.frame.dialog('close');
  }

  showDialog() {
    this.state.frame.dialog(this.getDialogOptions());
  }

  ensureButtonInitialized(buttonSelector) {
    const $button = $(buttonSelector, this.state.frame);
    if (!$button.hasClass("ui-button")) {
      $button.button();
    }
    return $button;
  }

  setButtonState(buttonSelector, enable) {
    const $button = this.ensureButtonInitialized(buttonSelector);
    $button.button(enable ? "enable" : "disable");
  }

  /**
   * ------------UPDATE------------
   */

  updateButtonStates() {
    this.safeUIOperation(() => {
      const buttonsEnabled = this.state.selectionOk && this.state.endpointOk;
      this.setButtonState("#go_btn", buttonsEnabled);
      this.setButtonState("#browse", this.state.endpointOk);
    });
  }

  updateEndpointOptions(endpoint) {
    const browseBtn = $("#browse", this.state.frame);
    const activateBtn = $("#activate", this.state.frame);

    this.state.endpointOk = endpoint.activated || endpoint.expires_in === -1;
    browseBtn.button(this.state.endpointOk ? "enable" : "disable");
    activateBtn.button(endpoint.expires_in === -1 ? "disable" : "enable");

    if (endpoint.force_encryption) {
      $("#encrypt_none").checkboxradio("option", "disabled", true);
      $("#encrypt_avail").checkboxradio("option", "disabled", true);
      $("#encrypt_req").prop('checked', true).checkboxradio("option", "disabled", false);
    } else if (!endpoint.DATA[0].scheme || endpoint.DATA[0].scheme === "gsiftp") {
      $("#encrypt_none").checkboxradio("option", "disabled", false);
      $("#encrypt_avail").checkboxradio("option", "disabled", false);
      $("#encrypt_req").checkboxradio("option", "disabled", false);
    } else {
      $("#encrypt_none").prop('checked', true).checkboxradio("option", "disabled", false);
      $("#encrypt_avail").checkboxradio("option", "disabled", true);
      $("#encrypt_req").checkboxradio("option", "disabled", true);
    }

    $(":radio").button("refresh");
    this.updateButtonStates();
  }

  updateEndpoint(data) {
    this.state.currentEndpoint = {
      ...data,
      name: data.canonical_name || data.id
    };

    const pathInput = $("#path", this.state.frame);
    pathInput.val(this.model.getDefaultPath(this.state.currentEndpoint));

    let html = `<option title="${util.escapeHTML(this.state.currentEndpoint.description || '(no info)')}">${
      util.escapeHTML(this.state.currentEndpoint.display_name || this.state.currentEndpoint.name)} (`;

    if (this.state.currentEndpoint.activated) {
      html += `${Math.floor(this.state.currentEndpoint.expires_in / 3600)} hrs`;
    } else if (this.state.currentEndpoint.expires_in === -1) {
      html += "active";
    } else {
      html += "inactive";
    }

    html += ")</option>";

    const matches = $("#matches", this.state.frame);
    matches.html(html);
    matches.prop("disabled", false);

    this.updateEndpointOptions(this.state.currentEndpoint);
  }

  updateMatchesList(endpoints) {
    const matches = $("#matches", this.state.frame);
    const html = this.generateMatchesHtml(endpoints);
    matches.html(html);
    matches.prop("disabled", false);
  }

  generateMatchesHtml(endpoints) {
    const html = [`<option disabled selected>${endpoints.length} match${endpoints.length > 1 ? 'es' : ''}</option>`];

    endpoints.forEach(ep => {
      const status = this.getEndpointStatus(ep);
      html.push(`                                                                                                                                                                                                                       
         <option title="${util.escapeHTML(ep.description || '(no info)')}">${
        util.escapeHTML(ep.display_name || ep.name)} (${status})</option>                                                                                                                                                             
       `);
    });

    return html.join('');
  }

  formatEndpointOption(endpoint) {
    const name = endpoint.display_name || endpoint.name;
    const status = this.getEndpointStatus(endpoint);

    return `<option title="${util.escapeHTML(endpoint.description || '(no info)')}">${
      util.escapeHTML(name)} (${status})</option>`;
  }

  getEndpointStatus(endpoint) {
    if (!endpoint.activated && endpoint.expires_in === -1) return 'active';
    if (endpoint.activated) return `${Math.floor(endpoint.expires_in / 3600)} hrs`;
    return 'inactive';
  }

  /**
   * ------------MISC------------
   */

  async handleEndpointSearch(searchToken, endpoint) {
    if (searchToken !== this.state.currentSearchToken) return;

    try {
      const data = await this.searchEndpoint(endpoint);

      if (data.isValid) {
        this.updateEndpoint(data);
      } else {
        const matches = await this.searchEndpoint(endpoint);
        if (searchToken !== this.state.currentSearchToken) return;

        this.updateEndpoint(matches);
      }
    } catch (error) {
      dialogs.dlgAlert("Globus Error", error);
    }
  }

  searchEndpoint(endpoint) {
    return new Promise((resolve, _) => {
      api.epView(endpoint, (ok, data) => {
        if (ok && !data.code) {
          resolve({isValid: true, ...data});
        } else {
          resolve({isValid: false, error: data});
        }
      });
    });
  }
}

/**
 * Shows the transfer dialog
 * @param {number} mode Transfer mode
 * @param {Array<Object>} records Records to transfer
 * @param {Function} callback Completion callback
 */
export function show(mode, records, callback) {
  try {
    const dialog = new TransferDialog(mode, records, callback);
    dialog.show();
  } catch (error) {
    console.error("Error showing transfer dialog:", error);
    if (error instanceof TransferError) {
      dialogs.dlgAlert("Transfer Error", error.message);
    } else {
      dialogs.dlgAlert("Error", "Failed to open transfer dialog");
    }
  }
}
