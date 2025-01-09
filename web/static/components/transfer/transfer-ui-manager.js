import * as dialogs from "../../dialogs.js";
import * as util from "../../util.js";
import * as settings from "../../settings.js";
import * as dlgEpBrowse from "../../dlg_ep_browse.js";
import * as api from "../../api.js";
import { TransferMode } from "../../models/transfer-model.js";

export class TransferUIManager {
    #controller;
    #frame;
    #state;

    constructor(dialog, services = { api, dialogs }) {
        this.#controller = dialog;
        this.api = services.api; // dependency injection
        this.dialogs = services.dialogs; // dependency injection
        this.#frame = null;
        this.encryptRadios = null;
        this.inputTimer = null;
        this.#state = {
            selectionOk: true,
            endpointOk: false,
        };
    }

    safeUIOperation(operation) {
        try {
            operation();
        } catch (error) {
            console.error("UI Operation failed:", error);
            this.reInitializeUIComponents();
        }
    }

    cleanup() {
        if (this.recordTree) {
            try {
                this.recordTree.destroy();
            } catch (error) {
                console.warn("Error cleaning up record tree:", error);
            }
            this.recordTree = null;
        }
    }

    /**
     * ------------BUTTON------------
     */

    ensureButtonInitialized(buttonSelector) {
        const $button = $(buttonSelector, this.#frame);
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
     * ------------GET------------
     */

    /**
     * Get default path for endpoint
     * @param {Object} endpoint Endpoint data
     * @returns {string} Default path
     */
    getDefaultPath(endpoint) {
        if (!endpoint) return "";

        const defaultDir = endpoint.default_directory || "/";
        const normalizedDir = defaultDir
            .replace("{server_default}/", "") // Remove API {server_default} prefix
            .replace(/\/+/g, "/"); // Remove multiple consecutive slashes

        // Ensure path starts with endpoint name and has proper formatting
        return `${endpoint.name}${normalizedDir.startsWith("/") ? "" : "/"}${normalizedDir}`;
    }

    /**
     * Get browse path from current path
     * @param currentPath
     * @returns {string}
     */
    getBrowsePath(currentPath) {
        const defaultedPath = this.getDefaultPath(this.#controller.endpointManager.currentEndpoint);
        const delimiter = currentPath.indexOf("/");

        // If no delimiter, return default path based on current endpoint
        if (delimiter === -1) return defaultedPath;

        let path = currentPath.prototype.substring(delimiter);
        return path.endsWith("/") ? path : path.prototype.substring(0, path.lastIndexOf("/") + 1);
    }

    getDialogLabels() {
        const isGet = this.#controller.model.mode === TransferMode.TT_DATA_GET;
        return {
            endpoint: isGet ? "Destination" : "Source",
            record: isGet ? "Source" : "Destination",
            dialogTitle: isGet ? "Download Raw Data" : "Upload Raw Data",
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

    getDialogOptions() {
        return {
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
                    click: () => this.handleTransfer(),
                },
            ],
            open: () => this.showDialog(),
            close: function (ev, ui) {
                this.cleanup();
                $(this).dialog("destroy").remove();
            },
        };
    }

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
     * Get record tree data for display
     * @returns {Array<Object>} Tree node data
     */
    getRecordTreeData() {
        return this.#controller.model.records.map((item) => {
            const info = this.#controller.model.RecordInfo(item);
            return {
                title: this.formatRecordTitle(item, info),
                selected: info.selectable,
                unselectable: !info.selectable,
                key: item.id,
            };
        });
    }

    /**
     * Format record title for display
     * @private
     */
    formatRecordTitle(item, info) {
        const titleText = util.escapeHTML(
            `${item.id}&nbsp&nbsp&nbsp<span style='display:inline-block;width:9ch'>${info.info}</span>&nbsp${item.title}`,
        );
        return info.selectable ? titleText : `<span style='color:#808080'>${titleText}</span>`;
    }

    getSelectedIds() {
        if (!this.recordTree) {
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

        return this.recordTree
            .getSelectedNodes()
            .map((node) => node.key)
            .filter(Boolean);
    }

    getTransferConfig() {
        const path = $("#path", this.#frame).val().trim();
        if (!path) {
            this.dialogs.dlgAlert("Input Error", "Path cannot be empty.");
            return null;
        }

        return {
            path,
            encrypt: $("input[name='encrypt_mode']:checked", this.#frame).val(),
            origFilename: $("#orig_fname", this.#frame).prop("checked"),
            extension: $("#ext", this.#frame).val()?.trim(),
        };
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

        const modeSpecificOptions =
            this.#controller.model.mode === TransferMode.TT_DATA_GET
                ? `<br>File extension override: <input id='ext' type='text'><br>`
                : `<br><label for='orig_fname'>Download to original filename(s)</label><input id='orig_fname' type='checkbox'>`;

        return encryptionOptions + modeSpecificOptions;
    }

    /**
     * ------------INITIALIZERS------------
     */

    initializeComponents() {
        this.initializeRecordDisplay();
        this.initializeEndpointInput();
        this.initializeTransferOptions();
        this.initializeBrowseButton();
        this.updateButtonStates();

        // Add activation button handling
        $("#activate", this.#frame).on("click", () => {
            window.open(
                `https://app.globus.org/file-manager?origin_id=${encodeURIComponent(
                    this.#controller.endpointManager.currentEndpoint.id,
                )}`,
                "",
            );
        });
    }

    initializeRecordDisplay() {
        if (!this.#controller.ids?.length) {
            $("#title", this.#frame).html("(new record)");
            return;
        }

        this.initializeRecordTree();
    }

    initializeRecordTree() {
        const treeConfig = {
            extensions: ["themeroller"],
            themeroller: {
                activeClass: "my-fancytree-active",
                hoverClass: "",
            },
            source: this.getRecordTreeData(),
            checkbox: true,
            selectMode: 3,
            icon: false,
            select: () => this.handleSelectionChange(),
        };

        $("#records", this.#frame).show().fancytree(treeConfig);
        const recordsElement = $("#records", this.#frame);
        if (!recordsElement.length) {
            console.error("Records element not found");
            return;
        }

        recordsElement.show().fancytree(treeConfig);

        this.recordTree = $.ui.fancytree.getTree("#records");
    }

    initializeEndpointInput() {
        const pathInput = $("#path", this.#frame);
        util.inputTheme(pathInput);

        pathInput.on("input", () => {
            clearTimeout(this.inputTimer);
            this.#controller.endpointManager.currentSearchToken = ++this.#controller.endpointManager
                .searchCounter;

            this.inputTimer = setTimeout(() => {
                this.#controller.endpointManager.handlePathInput(
                    this.#controller.endpointManager.currentSearchToken,
                );
            }, 250);
        });

        if (settings.ep_recent.length) {
            pathInput.val(settings.ep_recent[0]);
            pathInput.select();
            pathInput.autocomplete({
                source: settings.ep_recent,
                select: () => {
                    this.#controller.endpointManager.currentSearchToken = ++this.#controller
                        .endpointManager.searchCounter;
                    this.#controller.endpointManager.handlePathInput(
                        this.#controller.endpointManager.currentSearchToken,
                    );
                    return true;
                },
            });
            this.#controller.endpointManager.handlePathInput(
                ++this.#controller.endpointManager.searchCounter,
            );
        }
    }

    initializeBrowseButton() {
        $("#browse", this.#frame).on("click", () => {
            if (!this.#controller.endpointManager.currentEndpoint) return;

            const pathInput = $("#path", this.#frame);
            let browsePath = this.getBrowsePath(pathInput.val());

            dlgEpBrowse.show(
                this.#controller.endpointManager.currentEndpoint,
                browsePath,
                this.#controller.model.mode === TransferMode.TT_DATA_GET ? "dir" : "file",
                (selectedPath) => {
                    pathInput.val(
                        this.#controller.endpointManager.currentEndpoint.name + selectedPath,
                    );
                },
            );
        });
    }

    initializeTransferOptions() {
        const radioButtons = $(":radio", this.#frame);
        if (radioButtons.length) {
            radioButtons.checkboxradio();
        }

        // Initialize checkbox for GET mode
        if (this.#controller.model.mode === TransferMode.TT_DATA_GET) {
            const origFname = $("#orig_fname", this.#frame);
            if (origFname.length) {
                origFname.checkboxradio();
            }
        }

        this.encryptRadios = {
            none: $("#encrypt_none", this.#frame),
            available: $("#encrypt_avail", this.#frame),
            required: $("#encrypt_req", this.#frame),
        };

        util.inputTheme($("#ext", this.#frame));
    }

    reInitializeUIComponents() {
        $(".btn", this.#frame).button();
        $(":radio", this.#frame).checkboxradio();
        if (this.#controller.model.mode === TransferMode.TT_DATA_GET) {
            $("#orig_fname", this.#frame).checkboxradio();
        }
        $("#go_btn").button().button("disable");
        $("#browse", this.#frame).button().button("disable");
    }

    /**
     * ------------CREATE------------
     */

    createDialog(labels) {
        this.#frame = $(document.createElement("div"));
        this.#frame.html(this.getDialogTemplate(labels));
        return this.#frame;
    }

    createMatchesHtml(endpoints) {
        const html = [
            `<option disabled selected>${endpoints.length} match${endpoints.length > 1 ? "es" : ""}</option>`,
        ];

        endpoints.forEach((ep) => {
            const status = this.#controller.endpointManager.getEndpointStatus(ep);
            html.push(`                                                                                                                                                                                                                       
         <option title="${util.escapeHTML(ep.description || "(no info)")}">${util.escapeHTML(
             ep.display_name || ep.name,
         )} (${status})</option>                                                                                                                                                             
       `);
        });

        return html.join("");
    }

    /**
     * ------------UPDATE------------
     */

    updateButtonStates() {
        this.safeUIOperation(() => {
            const buttonsEnabled = this.#state.selectionOk && this.#state.endpointOk;
            this.setButtonState("#go_btn", buttonsEnabled);
            this.setButtonState("#browse", this.#state.endpointOk);
        });
    }

    updateEncryptionOptions(endpoint, scheme) {
        if (!this.encryptRadios) return;

        const options = this.getEncryptionOptions(endpoint, scheme);
        Object.entries(options).forEach(([key, settings]) => {
            const radio = this.encryptRadios[key];
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

    updateEndpoint(data) {
        this.#controller.endpointManager.currentEndpoint = {
            ...data,
            name: data.canonical_name || data.id,
        };

        const pathInput = $("#path", this.#frame);
        const currentPath = pathInput.val();
        if (
            !currentPath ||
            !currentPath.startsWith(this.#controller.endpointManager.currentEndpoint.name)
        ) {
            const newPath = this.getDefaultPath(this.#controller.endpointManager.currentEndpoint);
            pathInput.val(newPath);
        }

        let html = `<option title="${util.escapeHTML(this.#controller.endpointManager.currentEndpoint.description || "(no info)")}">${util.escapeHTML(
            this.#controller.endpointManager.currentEndpoint.display_name ||
                this.#controller.endpointManager.currentEndpoint.name,
        )} (`;

        if (this.#controller.endpointManager.currentEndpoint.activated) {
            html += `${Math.floor(this.#controller.endpointManager.currentEndpoint.expires_in / 3600)} hrs`;
        } else if (this.#controller.endpointManager.currentEndpoint.expires_in === -1) {
            html += "active";
        } else {
            html += "inactive";
        }

        html += ")</option>";

        const matches = $("#matches", this.#frame);
        matches.html(html);
        matches.prop("disabled", false);

        this.updateEndpointOptions(this.#controller.endpointManager.currentEndpoint);
    }

    updateEndpointOptions(endpoint) {
        if (!endpoint || !this.#controller.endpointManager.initialized || !this.encryptRadios) {
            console.warn("Cannot update endpoint options - not ready");
            return;
        }

        try {
            const browseBtn = $("#browse", this.#frame);
            const activateBtn = $("#activate", this.#frame);

            this.#state.endpointOk = endpoint.activated || endpoint.expires_in === -1;

            if (browseBtn.length) {
                browseBtn.button(this.#state.endpointOk ? "enable" : "disable");
            }
            if (activateBtn.length) {
                activateBtn.button(endpoint.expires_in === -1 ? "disable" : "enable");
            }

            const scheme = endpoint.DATA?.[0]?.scheme;
            this.updateEncryptionOptions(endpoint, scheme);

            this.updateButtonStates();
        } catch (error) {
            console.error("Error in updateEndpointOptions:", error);
        }
    }

    /**
     * ------------HANDLERS------------
     */

    attachMatchesHandler() {
        $("#matches", this.#frame).on("change", (ev) => {
            this.handleMatchesChange(ev);
        });
    }

    closeDialog() {
        clearTimeout(this.inputTimer);
        this.#frame.dialog("close");
    }

    showDialog() {
        this.#frame.dialog(this.getDialogOptions());
    }

    handleMatchesChange(event) {
        if (
            !this.#controller.endpointManager.endpointManagerList ||
            !this.#controller.endpointManager.endpointManagerList.length
        ) {
            console.warn("No endpoint list available");
            return;
        }

        const selectedIndex = $(event.target).prop("selectedIndex") - 1;
        if (
            selectedIndex < 0 ||
            selectedIndex >= this.#controller.endpointManager.endpointManagerList.length
        ) {
            console.error("Invalid selection index:", selectedIndex);
            return;
        }

        const endpoint = this.#controller.endpointManager.endpointManagerList[selectedIndex];
        if (!endpoint || !endpoint.id) {
            console.log("Invalid endpoint data:", endpoint);
            return;
        }

        this.api.epView(endpoint.id, (ok, data) => {
            if (ok && !data.code) {
                this.updateEndpoint(data);
            } else {
                this.dialogs.dlgAlert("Globus Error", data);
            }
        });
    }

    handleSelectionChange() {
        const selectedNodes = this.recordTree.getSelectedNodes();
        this.#state.selectionOk = selectedNodes.length > 0;
        this.updateButtonStates();
    }

    handleTransfer() {
        const config = this.getTransferConfig();
        if (!config) return;

        if (
            this.#controller.model.mode === TransferMode.TT_DATA_GET ||
            this.#controller.model.mode === TransferMode.TT_DATA_GET
        ) {
            this.startTransfer(config);
        } else {
            this.#controller.callback(config.path, config.encrypt);
            this.closeDialog();
        }
    }

    handleTransferResponse(ok, data) {
        if (ok) {
            clearTimeout(this.inputTimer);
            this.closeDialog();
            util.setStatusText(`Task '${data.task.id}' created for data transfer.`);
            this.#controller.callback?.();
        } else {
            this.dialogs.dlgAlert("Transfer Error", data);
        }
    }

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
