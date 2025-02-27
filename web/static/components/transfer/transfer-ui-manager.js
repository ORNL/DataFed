import { ep_recent } from "../../settings.js";
import { TransferMode } from "../../models/transfer-model.js";
import { show } from "../endpoint-browse/index.js";
import { inputDisable, inputEnable, inputTheme, setStatusText } from "../../util.js";
import { createMatchesHtml, formatRecordTitle, getDialogTemplate } from "./transfer-templates.js";

/**
 * @class TransferUIManager
 *
 * Manages the UI components and interactions for file transfer operations
 */
export class TransferUIManager {
    #controller;

    /**
     * Creates a new TransferUIManager instance
     * @param {object} controller - The dialog controller instance
     * @param {object} services - The service objects to use for API and dialog operations
     * @param {object} services.dialogs - Dialog service
     * @param {Function} services.dialogs.dlgAlert - Alert dialog function
     * @param {object} services.api - API service
     * @param {Function} services.api.epView - Endpoint view API function
     * @param {Function} services.api.xfrStart - Transfer start API function
     */
    constructor(controller, services) {
        this.#controller = controller;
        this.api = services.api; // Dependency injection
        this.dialogs = services.dialogs; // Dependency injection

        this.cachedComponentData = sessionStorage.getItem("resumeFlow") === true && this.loadCache();
        this.inputTimer = null;
        this.state = this.cachedComponentData?.state || {
            recordTree: null,
            frame: null,
            encryptRadios: null,
        };
    }

    /**
     * Save component state to cache
     * @returns {object | null} The cached component data
     */
    loadCache() {
        return sessionStorage.getItem("transferDialogUIState");
    }

    saveCache() {
        sessionStorage.setItem("transferDialogUIState", JSON.stringify({
            state: {
                recordTree: String(this.state.recordTree),
                frame: String(this.state.frame),
                encryptRadios: String(this.state.encryptRadios),
            }
        }));
    }

    /**
     * Safely executes a UI operation with error handling
     * @param {Function} operation - The UI operation to execute
     */
    safeUIOperation(operation) {
        try {
            operation();
        } catch (error) {
            console.error("UI Operation failed:", error);
            this.reInitializeUIComponents();
        }
    }

    /**
     * ------------INITIALIZERS------------
     */

    initializeComponents() {
        this.createDialog(this.getDialogLabels());
        this.initializeButtons();
        this.initializeRecordDisplay();
        this.initializeEndpointInput();
        this.initializeTransferOptions();
        this.initializeBrowseButton();
    }

    initializeButtons() {
        const buttons = {
            ".btn": {},
            "#browse": {
                disabled: true,
            },
            "#go_btn": {
                disabled: true,
            },
        };

        Object.entries(buttons).forEach(([selector, options]) => {
            const button = $(selector, this.state.frame);
            if (button.length && !button.hasClass("ui-button")) {
                button.button(options);
            }
        });
    }

    initializeRecordDisplay() {
        if (!this.#controller.ids?.length) {
            $("#title", this.state.frame).html("(new record)");
            return;
        }

        const treeConfig = {
            extensions: ["themeroller"],
            themeroller: { activeClass: "my-fancytree-active", hoverClass: "" },
            source: this.getRecordTreeData(),
            checkbox: true,
            selectMode: 3,
            icon: false,
            init: (_, data) => (this.state.recordTree = data.tree),
            select: () => this.state.recordTree && this.handleSelectionChange(),
        };

        const recordsElement = $("#records", this.state.frame);
        recordsElement.show().fancytree(treeConfig);
        this.state.recordTree = $.ui.fancytree.getTree(recordsElement);
    }

    initializeEndpointInput() {
        const pathInput = $("#path", this.state.frame);
        inputTheme(pathInput);

        /**
         * Set initial value from cached state if available.
         * If there were multiple endpoints, the first one is selected and the rest are ignored
         */
        this.cachedComponentData &&
            this.#controller.endpointManager.handlePathInput(
                this.#controller.endpointManager.state.currentSearchToken,
            );

        /**
         * Adds an input event listener to the path input element.
         * Clears any existing input timer, increments the current search token,
         * and sets a new input timer to handle the path input after a delay of 250ms.
         */
        pathInput.on("input", () => {
            clearTimeout(this.inputTimer);
            this.#controller.endpointManager.state.currentSearchToken = ++this.#controller
                .endpointManager.state.searchTokenIterator;

            this.inputTimer = setTimeout(() => {
                this.#controller.endpointManager.handlePathInput(
                    this.#controller.endpointManager.state.currentSearchToken,
                );
            }, 250);
        });

        /**
         * If there are recent endpoints, set the path input value to the first recent endpoint,
         * select the input, and initialize autocomplete with the recent endpoints.
         * Also, handle the path input immediately with the current search token.
         */
        if (ep_recent.length) {
            pathInput.val(ep_recent[0]);
            pathInput.select();
            pathInput.autocomplete({
                source: ep_recent,
                select: () => {
                    this.#controller.endpointManager.state.currentSearchToken = ++this.#controller
                        .endpointManager.searchTokenIterator;
                    this.#controller.endpointManager.handlePathInput(
                        this.#controller.endpointManager.state.currentSearchToken,
                    );
                    return true;
                },
            });
            this.#controller.endpointManager.handlePathInput(
                this.#controller.endpointManager.state.currentSearchToken,
            );
        }
    }

    initializeBrowseButton() {
        const pathInput = $("#path", this.state.frame);

        if (this.cachedComponentData) {
            this.showBrowseDialog(pathInput);
        }

        $("#browse", this.state.frame).on("click", () => {
            if (this.#controller.endpointManager.state.currentEndpoint) {
                this.showBrowseDialog(pathInput);
            }
        });
    }

    showBrowseDialog(pathInput) {
        const browsePath = this.getBrowsePath(pathInput.val());
        const mode = this.#controller.model.mode === TransferMode.TT_DATA_GET ? "dir" : "file";
        // On dialog view, cache necessary data for view reconstruction

        show(
          this.#controller.endpointManager.state.currentEndpoint,
          browsePath,
          mode,
          this.#controller,
          (selectedPath) => {
            const fullPath = this.#controller.endpointManager.state.currentEndpoint.name + selectedPath;
            pathInput.val(fullPath);
            this.enableStartButton(true);
          }
        );
    }

    initializeTransferOptions() {
        const radioButtons = $(":radio", this.state.frame);
        if (radioButtons.length) {
            radioButtons.checkboxradio();
        }

        // Initialize checkbox for GET mode
        if (this.#controller.model.mode === TransferMode.TT_DATA_GET) {
            const origFname = $("#orig_fname", this.state.frame);
            if (origFname.length) {
                origFname.checkboxradio();
            }
        }

        this.state.encryptRadios = {
            none: $("#encrypt_none", this.state.frame),
            available: $("#encrypt_avail", this.state.frame),
            required: $("#encrypt_req", this.state.frame),
        };

        inputTheme($("#ext", this.state.frame));
    }

    reInitializeUIComponents() {
        $(".btn", this.state.frame).button();
        $(":radio", this.state.frame).checkboxradio();
        if (this.#controller.model.mode === TransferMode.TT_DATA_GET) {
            $("#orig_fname", this.state.frame).checkboxradio();
        }
    }

    /**
     * Creates the main dialog element
     * @param {object} labels - Dialog labels
     * @returns {jQuery} Created dialog jQuery object
     */
    createDialog(labels) {
        this.state.frame = $(document.createElement("div"));
        this.state.frame.html(getDialogTemplate(labels, this.#controller.model.mode));
        return this.state.frame;
    }

    updateButtonState(selector, enable, frame) {
        this.safeUIOperation(() => {
            const element = $(selector, frame);
            enable ? inputEnable(element) : inputDisable(element);
        });
    }

    enableBrowseButton(enable) {
        this.updateButtonState("#browse", enable, this.state.frame);
    }

    enableStartButton(enable) {
        this.updateButtonState("#go_btn", enable, $(".ui-dialog-buttonpane.ui-widget-content"));
    }

    /**
     * Updates encryption options based on endpoint and scheme
     * @param {object} endpoint - The endpoint configuration
     * @param {string} scheme - The transfer scheme
     */
    updateEncryptionOptions(endpoint, scheme) {
        if (!this.state.encryptRadios) {
            return;
        }

        const options = this.getEncryptionOptions(endpoint, scheme);
        Object.entries(options).forEach(([key, settings]) => {
            const radio = this.state.encryptRadios[key];
            if (radio?.length && radio.hasClass("ui-checkboxradio")) {
                try {
                    if (settings.enabled !== undefined) {
                        radio.checkboxradio("option", "disabled", !settings.enabled);
                    }
                    if (settings.checked !== undefined && settings.checked) {
                        radio.prop("checked", true).checkboxradio("refresh");
                    }
                } catch (e) {
                    console.warn(`Failed to update radio button ${key}:`, e);
                }
            }
        });
    }

    /**
     * Updates the endpoint configuration and UI
     * @param {object} data - The endpoint data
     * @param {string} data.canonical_name - The canonical endpoint name
     * @param {string} data.id - The endpoint ID
     */
    handleSelectedEndpoint(data) {
        this.#controller.endpointManager.state.currentEndpoint = {
            ...data,
            name: data.canonical_name || data.id,
        };

        const pathInput = $("#path", this.state.frame);
        const currentPath = pathInput.val();
        if (
            !currentPath ||
            !currentPath.startsWith(this.#controller.endpointManager.state.currentEndpoint.name)
        ) {
            const newPath = this.getDefaultPath(
                this.#controller.endpointManager.state.currentEndpoint,
            );
            pathInput.val(newPath);
        }

        const endpoint = this.#controller.endpointManager.state.currentEndpoint;
        const matches = $("#matches", this.state.frame);
        matches.html(
            createMatchesHtml([
                {
                    description: endpoint.description,
                    display_name: endpoint.display_name,
                    name: endpoint.name,
                },
            ]),
        );
        matches.prop("disabled", false);
        this.enableBrowseButton(true);
        this.updateEndpointOptions(endpoint);
    }

    updateEndpointOptions(endpoint) {
        if (
            !endpoint ||
            !this.#controller.endpointManager.state.initialized ||
            !this.state.encryptRadios
        ) {
            console.warn("Cannot update endpoint options - not ready");
            return;
        }

        try {
            const scheme = endpoint.DATA?.[0]?.scheme;
            this.updateEncryptionOptions(endpoint, scheme);
        } catch (error) {
            console.error("Error in updateEndpointOptions:", error);
        }
    }

    /**
     * ------------GET------------
     */

    /**
     * Gets the default path for a given endpoint
     * @param {object} endpoint - The endpoint configuration object
     * @param {string} endpoint.name - The name of the endpoint
     * @param {string} [endpoint.default_directory] - The default directory path
     * @returns {string} The formatted default path
     */
    getDefaultPath(endpoint) {
        if (!endpoint) {
            return "";
        }

        const defaultDir = endpoint.default_directory || "/";
        const normalizedDir = defaultDir
            .replace("{server_default}/", "") // Remove API {server_default} prefix
            .replace(/\/+/g, "/"); // Remove multiple consecutive slashes

        // Ensure path starts with endpoint name and has proper formatting
        return `${endpoint.name}${normalizedDir.startsWith("/") ? "" : "/"}${normalizedDir}`;
    }

    /**
     * Gets the browse path from the current path
     * @param {string} currentPath - The current path
     * @returns {string} The formatted browse path
     */
    getBrowsePath(currentPath) {
        const defaultedPath = this.getDefaultPath(
            this.#controller.endpointManager.state.currentEndpoint,
        );
        const delimiter = currentPath.indexOf("/");

        // If no delimiter, return default path based on current endpoint
        if (delimiter === -1) {
            return defaultedPath;
        }

        let path = currentPath.substring(delimiter);
        return path.endsWith("/") ? path : path.substring(0, path.lastIndexOf("/") + 1);
    }

    /**
     * Gets the dialog labels based on transfer mode
     * @returns {object} Object containing endpoint, record, and dialogTitle labels
     */
    getDialogLabels() {
        const isGet = this.#controller.model.mode === TransferMode.TT_DATA_GET;
        return {
            endpoint: isGet ? "Destination" : "Source",
            record: isGet ? "Source" : "Destination",
            dialogTitle: isGet ? "Download Raw Data" : "Upload Raw Data",
        };
    }

    /**
     * Gets encryption options based on endpoint and scheme
     * @param {object} endpoint - The endpoint configuration
     * @param {string} scheme - The transfer scheme
     * @returns {object} Encryption options configuration
     */
    getEncryptionOptions(endpoint, scheme) {
        if (endpoint.force_encryption) {
            return {
                none: { enabled: false, checked: false },
                available: { enabled: false, checked: false },
                required: { enabled: true, checked: true },
            };
        } else if (!scheme || scheme === "gsiftp") {
            return {
                none: { enabled: true },
                available: { enabled: true },
                required: { enabled: true },
            };
        } else {
            return {
                none: { enabled: true, checked: true },
                available: { enabled: false, checked: false },
                required: { enabled: false, checked: false },
            };
        }
    }

    /**
     * Gets the record tree data for display
     * @returns {Array<object>} Array of tree node data objects
     */
    getRecordTreeData() {
        return this.#controller.model.records.map((item) => {
            const info = this.#controller.model.getRecordInfo(item);
            return {
                title: formatRecordTitle(item, info),
                selected: info.selectable,
                unselectable: !info.selectable,
                key: item.id,
            };
        });
    }

    /**
     * Gets the selected record IDs from the tree
     * @returns {Array<string>} Array of selected record IDs
     */
    getSelectedIds() {
        if (!this.state.recordTree) {
            console.warn("Record tree not initialized");
            return [];
        }
        // Check the model for records
        if (!this.#controller.model.records?.length) {
            console.warn("No records available");
            return [];
        }

        // If there's only 1 id, return it or an empty array if it's falsy
        if (this.#controller.model.records.length === 1) {
            const id = this.#controller.model.records[0].id;
            return id ? [id] : [];
        }

        return this.state.recordTree
            .getSelectedNodes()
            .map((node) => node.key)
            .filter(Boolean);
    }

    /**
     * Gets the current transfer configuration
     * @returns {object|null} Transfer configuration object or null if validation fails
     * @property {string} path - The transfer path
     * @property {string} encrypt - The encryption mode
     * @property {boolean} origFilename - Whether to use original filename
     * @property {string} extension - The file extension override
     */
    getTransferInput() {
        const path = $("#path", this.state.frame).val().trim();
        if (!path) {
            this.dialogs.dlgAlert("Input Error", "Path cannot be empty.");
            return null;
        }

        return {
            path,
            encrypt: $("input[name='encrypt_mode']:checked", this.state.frame).val(),
            origFilename: $("#orig_fname", this.state.frame).prop("checked"),
            extension: $("#ext", this.state.frame).val()?.trim(),
        };
    }

    /**
     * ------------HANDLERS------------
     */

    attachMatchesHandler() {
        $("#matches", this.state.frame).on("change", (ev) => {
            this.handleMatchesChange(ev);
        });
    }

    closeDialog() {
        clearTimeout(this.inputTimer);
        this.state.frame.dialog("close");
    }

    showDialog() {
        this.state.frame.dialog({
            title: this.getDialogLabels().dialogTitle,
            modal: true,
            width: "600",
            height: "auto",
            resizable: true,
            buttons: [
                {
                    text: "Cancel",
                    click: () => this.closeDialog(),
                },
                {
                    id: "go_btn",
                    text: "Start",
                    disabled: true,
                    click: () => this.handleTransfer(),
                },
            ],
            close: function () {
                $(this).dialog("destroy").remove();
            },
        });
    }

    /**
     * Handles changes in endpoint matches selection
     * @param {Event} event - The change event object
     */
    async handleMatchesChange(event) {
        const selectedIndex = $(event.target).prop("selectedIndex") - 1;
        if (selectedIndex < 0) {
            return;
        }

        const endpoints = this.#controller.endpointManager.state.endpointManagerList;
        if (!endpoints?.length) {
            return;
        }

        const endpoint = this.#controller.endpointManager.state.endpointManagerList[selectedIndex];
        if (!endpoint || !endpoint.id) {
            console.warn("Invalid endpoint data:", endpoint);
            return;
        }

        // Set endpoint list to selected endpoint once we validate it
        this.#controller.endpointManager.state.endpointManagerList = endpoint;
        try {
            const data = await new Promise((resolve, reject) => {
                this.api.epView(endpoint.id, (ok, data) => {
                    if (ok && !data.code) {
                        resolve(data);
                    } else {
                        reject(data);
                    }
                });
            });

            this.handleSelectedEndpoint(data);
        } catch (error) {
            this.dialogs.dlgAlert("Globus Error", error);
        }
    }

    handleSelectionChange() {
        if (!this.state.recordTree) {
            console.warn("Record tree not initialized when handling selection change");
            return;
        }
        const atLeastOneNodeSelected = this.state.recordTree.getSelectedNodes().length > 0;
        const config = this.getTransferInput();
        if (!config) {
            this.enableStartButton(false);
        }

        this.enableStartButton(atLeastOneNodeSelected && !config?.path.endsWith("/"));
    }

    /**
     * Handles the transfer operation
     * @private
     */
    handleTransfer() {
        // TODO Validate extension overwrites
        const config = this.getTransferInput();
        if (!config) {
            return;
        }

        if (
            this.#controller.model.mode === TransferMode.TT_DATA_GET ||
            this.#controller.model.mode === TransferMode.TT_DATA_PUT
        ) {
            this.startTransfer(config);
        } else {
            this.#controller.callback(config.path, config.encrypt);
            this.closeDialog();
        }
    }

    /**
     * Handles transfer response from the server
     * @param {boolean} ok - Whether the transfer was successful
     * @param {object} data - Response data from server
     */
    handleTransferResponse(ok, data) {
        if (ok) {
            clearTimeout(this.inputTimer);
            this.closeDialog();
            setStatusText(`Task '${data.task.id}' created for data transfer.`);
            this.#controller.callback?.();
        } else {
            this.dialogs.dlgAlert("Transfer Error", data);
        }
    }

    /**
     * Initiates the transfer operation
     * @param {object} config - Transfer configuration
     * @param {string} config.path - Transfer path
     * @param {string} config.extension - File extension
     * @param {string} config.encrypt - Encryption mode
     * @param {boolean} config.origFilename - Use original filename flag
     */
    startTransfer(config) {
        const ids = this.getSelectedIds();

        this.api.xfrStart(
            ids,
            this.#controller.model.mode,
            config.path,
            config.extension,
            config.encrypt,
            config.origFilename,
            (ok, data) => this.handleTransferResponse(ok, data),
        );
    }
}
