import * as util from "../../util.js";
import * as api from "../../api.js";
import { TransferMode } from "../../models/transfer-model.js";
import { AUTH_URL } from "../../../services/auth/constants.js";
import { transferStore } from "../../store/store.js";

const CONFIG = {
    PATH: { SEPARATOR: "/", UP: "..", CURRENT: "." },
    UI: {
        SIZE: { WIDTH: "500", HEIGHT: "400" },
        DELAY: 1000,
        ICONS: {
            FOLDER: "ui-icon ui-icon-folder",
            FILE: "ui-icon ui-icon-file",
        },
    },
};

class ApiError extends Error {
    constructor(data) {
        super(data.message);
        this.name = "ApiError";
        this.data = data;
        this.code = data.code;
    }
}

/**
 * EndpointBrowser Component
 * Handles browsing and selecting files/directories from endpoints
 */
class EndpointBrowser {
    #controller;

    /**
     * @param {object} props - Browser configuration
     * @param {object} props.controller - Yea
     * @param {object} props.endpoint - Endpoint details
     * @param {string} props.path - Initial path
     * @param {TransferMode[keyof TransferMode]} props.mode - Browser mode ('file'/'dir')
     * @param {Function} props.onSelect - Selection callback
     * @param {object} props.services - The service objects to use for API and dialog operations
     * @param {object} props.services.dialogs - Dialog service
     * @param {Function} props.services.dialogs.dlgAlert - Alert dialog function
     * @param {object} props.services.api - API service
     * @param {Function} props.services.api.getGlobusConsentURL - Globus authorization URL function
     */
    constructor(props) {
        const cachedComponentData =
            sessionStorage.getItem("resumeFlow") === 'true' && this.loadCache();
        this.props = cachedComponentData?.props
            ? {
                  endpoint: props.endpoint || cachedComponentData.props.endpoint,
                  mode: props.mode || cachedComponentData.props.mode,
                  onSelect: props.onSelect || Function("return " + cachedComponentData.props.onSelect),
                  controller: props.controller
              }
            : props;
        this.#controller = this.props.controller;
        this.state = {
            path: cachedComponentData?.state?.path || props.path,
            loading: false,
            timer: null,
        };
    }

    /**
     * Load component state from cache and Redux store
     * @returns {object | null} The cached component data
     */
    loadCache() {
        // First try to get from Redux store
        const state = transferStore.getState();
        if (state.resumeData && state.resumeData.endpointBrowserState) {
            return state.resumeData.endpointBrowserState;
        }
        
        // Fallback to sessionStorage for backward compatibility
        const cachedData = sessionStorage.getItem("endpointBrowserState");
        if (cachedData) {
            try {
                return JSON.parse(cachedData);
            } catch (error) {
                console.error("Failed to parse cached endpoint browser state:", error);
                return null;
            }
        }
        return null;
    }

    /**
     * Save component state to cache and Redux store
     */
    saveCache() {
        const stateData = {
            props: {
                endpoint: this.props.endpoint,
                mode: this.props.mode,
                onSelect: String(this.props.onSelect),
            },
            state: {
                path: this.state.path,
            },
        };
        
        try {
            // Save to sessionStorage for backward compatibility
            sessionStorage.setItem(
                "endpointBrowserState",
                JSON.stringify(stateData)
            );
            
            // If controller exists, it will handle saving to Redux store
            if (this.#controller) {
                // The controller already has a saveState method that will be called
                // in other methods like openConsentIframe
            } else {
                // Directly dispatch to Redux store if no controller
                transferStore.dispatch({
                    type: 'SAVE_ENDPOINT_BROWSER_STATE',
                    payload: stateData
                });
            }
        } catch (error) {
            console.error("Failed to save endpoint browser state:", error);
        }
    }

    pathNavigator() {
        return `
             <div class='endpoint-browser col-flex'>                                                                                                                  
                  <div class="path-navigator row-flex">                                                                                                               
                      <label class="path-label">Path:</label>                                                                                                         
                      <div class="path-input-container">                                                                                                              
                         <input type="text" id="path" value="${this.state.path}"/>                                                                                    
                      </div>                                                                                                                                          
                      <div>                                                                                                                                           
                          <button id="up" class="btn small">Up</button>                                                                                               
                      </div>                                                                                                                                          
                  </div>                                                                                                                                              
              </div>                                                                                                                                              
         `;
    }

    fileTree() {
        return `
             <div class="endpoint-browser file-tree-view ui-widget content">
                 <table id="file_tree">
                     <colgroup>
                         <col/>
                         <col/>
                         <col/>
                     </colgroup>
                     <tbody>
                         <tr>
                             <td></td>
                             <td></td>
                             <td></td>
                         </tr>                                                                                                                                        
                     </tbody>
                 </table>
             </div>
         `;
    }

    /**
     * Renders dialog content
     * @returns {jQuery} Dialog element
     */
    render() {
        this.element =
            $(`                                                                                                                                           
         <div class="endpoint-browser">                                                                                                                           
             ${this.pathNavigator()}                                                                                                                        
             <div class="spacer"></div>                                                                                                                           
             ${this.fileTree()}                                                                                                                             
         </div>                                                                                                                                                   
     `);

        this.initUI();
        return this.element;
    }

    /**
     * Initialize UI components and event handlers
     */
    initUI() {
        // Initialize buttons and inputs
        $(".btn", this.element).button();
        util.inputTheme($("input:text", this.element));

        // Attach event handlers
        $("#up", this.element).on("click", () => this.navigate(CONFIG.PATH.UP));
        $("#path", this.element).on("input", () => {
            clearTimeout(this.state.timer);
            this.state.timer = setTimeout(() => {
                this.state.path = $("#path", this.element).val();
                this.loadTree();
            }, CONFIG.UI.DELAY);
        });

        // Initialize FancyTree with configuration
        $("#file_tree", this.element).fancytree({
            checkbox: false,
            extensions: ["themeroller", "table"],
            nodata: false,
            themeroller: { activeClass: "my-fancytree-active", hoverClass: "" },
            table: { nodeColumnIdx: 0 },
            source: [{ title: "loading...", icon: false, is_dir: true }],
            selectMode: 1,
            // Render additional columns (size and date)
            renderColumns: this.renderTreeColumns,
            // Handle node selection
            activate: (_, data) => {
                data.node.setSelected(true);
                $("#sel_btn").button(this.isValidSelection(data.node) ? "enable" : "disable");
            },
            // Handle double-click navigation
            dblclick: (_, data) => {
                if (data.node.data.is_dir && !this.state.loading) {
                    this.navigate(data.node.key);
                }
            },
        });

        this.loadTree();
    }

    renderTreeColumns(_, data) {
        const $cols = $(data.node.tr).find(">td");
        if (data.node.data.is_dir) {
            $cols.eq(0).prop("colspan", 3).nextAll().remove();
            return;
        }
        $cols.eq(1).text(data.node.data.size);
        $cols.eq(2).text(data.node.data.date);
    }

    /**
     * @param {object} node - Tree node
     * @returns {boolean} Whether selection is valid
     */
    isValidSelection(node) {
        const isDir = node?.data?.is_dir;
        const notUpDirInput = node?.key !== CONFIG.PATH.UP;

        const dirMode = isDir && this.props.mode === TransferMode.TT_DATA_GET;
        const fileMode = !isDir && this.props.mode === TransferMode.TT_DATA_PUT;

        return (dirMode || fileMode) && notUpDirInput;
    }
    
    /**
     * Save component state to redux-persist store
     */
    saveToStore() {
        if (this.#controller) {
            // Save endpoint browser state to the controller's state
            const endpointBrowserState = {
                props: {
                    endpoint: this.props.endpoint,
                    mode: this.props.mode,
                    onSelect: String(this.props.onSelect),
                },
                state: {
                    path: this.state.path,
                }
            };
            
            // Add endpoint browser state to controller state before saving
            this.#controller.addEndpointBrowserState(endpointBrowserState);
            this.#controller.saveState();
        } else {
            // Directly save to Redux store if no controller
            this.saveCache();
        }
    }

    /**
     * Navigate to new path
     * @param {string} newPath - Target path
     */
    navigate(newPath) {
        clearTimeout(this.state.timer);
        // Ensure path ends with separator
        const current = this.state.path.endsWith(CONFIG.PATH.SEPARATOR)
            ? this.state.path
            : this.state.path + CONFIG.PATH.SEPARATOR;

        let updatedPath;
        if (newPath === CONFIG.PATH.UP) {
            // Handle "up" navigation
            if (current.length === 1) {
                // Already at root
                return;
            }
            const idx = current.lastIndexOf(CONFIG.PATH.SEPARATOR, current.length - 2);
            updatedPath = idx > 0 ? current.substring(0, idx + 1) : CONFIG.PATH.SEPARATOR;
        } else {
            // Navigate to subdirectory
            updatedPath = current + newPath + CONFIG.PATH.SEPARATOR;
        }
        // Update state and UI
        this.state.path = updatedPath;
        $("#path", this.element).val(updatedPath);
        this.loadTree();
    }

    /**
     * Load tree data from API
     */
    async loadTree() {
        if (this.state.loading) {
            return;
        }

        // Set loading state
        this.state.loading = true;
        $("#sel_btn").button("disable");
        $("#file_tree").fancytree("disable");

        try {
            const ep_status = await new Promise((resolve) => {
                api.epView(this.props.endpoint.id, (ok, data) => resolve(data));
            });
            const is_mapped = ep_status.entity_type.includes("mapped");// Fetch directory listing
            const data = await new Promise((resolve) => {
                api.epDirList(this.props.endpoint.id, this.state.path, false,is_mapped,
                    this.props.endpoint.id,
                    resolve,
            );
            });

            if (data.needs_consent || data.code) {
                // TODO: needs consent flag only works first time, if base token has consent it will no longer work.
                throw new ApiError(data);
            }

            const source = this.getTreeSource(data);
            $.ui.fancytree.getTree("#file_tree").reload(source);
        } catch (error) {
            const errorSource = await this.createErrorSource(error);
            $.ui.fancytree.getTree("#file_tree").reload(errorSource);
        } finally {
            this.state.loading = false;
            $("#file_tree").fancytree("enable");
        }
    }

    /**
     * Get tree source data
     * @param {object} data - API response data
     * @returns {Array} Tree source data
     */
    getTreeSource(data) {
        return [
            {
                title: CONFIG.PATH.UP,
                icon: CONFIG.UI.ICONS.FOLDER,
                key: CONFIG.PATH.UP,
                is_dir: true,
            },
            ...data.DATA.map((entry) =>
                entry.type === "dir"
                    ? {
                          title: entry.name,
                          icon: CONFIG.UI.ICONS.FOLDER,
                          key: entry.name,
                          is_dir: true,
                      }
                    : {
                          title: entry.name,
                          icon: CONFIG.UI.ICONS.FILE,
                          key: entry.name,
                          is_dir: false,
                          size: util.sizeToString(entry.size),
                          date: new Date(entry.last_modified.replace(" ", "T")).toLocaleString(),
                      },
            ),
        ];
    }

    /**
     * Handle API error responses
     * @param {object} error - API response data
     * @returns {Promise<Array>} Error message source
     */
    async createErrorSource(error) {
        let title = "";

        if (error instanceof ApiError && error.code === "ConsentRequired") {
            // Save state only when consent is required to restore it later

            // Generate consent URL
            const data = await new Promise((resolve) => {
                api.getGlobusConsentURL(
                    (_, data) => resolve(data),
                    this.props.endpoint.id,
                    error.data.required_scopes,
                );
            });
            // Create a consent link with onclick handler
            title = `<span class='ui-state-error'>Consent Required: Please provide 
                <a href="#" id="consent-link" data-url="${data.consent_url}">consent</a>.
            </span>`;

            // Add the click handler after rendering
            setTimeout(() => {
                const consentLink = document.getElementById("consent-link");
                if (consentLink) {
                    document.getElementById("consent-link").addEventListener("click", (e) => {
                        e.preventDefault();

                        // Save state to redux-persist store before redirecting
                        this.saveToStore();
                        
                        // Set resumeFlow flag in sessionStorage
                        sessionStorage.setItem('resumeFlow', 'true');
                        
                        // Redirect to consent URL
                        this.openConsentIframe(consentLink.getAttribute("data-url"));
                    });
                }
            }, 0);
        } else {
            title = `<span class='ui-state-error'>Error: ${error instanceof ApiError ? error.data.message : error.message}</span>`;
        }

        return [
            {
                title,
                icon: false,
                is_dir: true,
            },
        ];
    }

    /**
     * Opens a modal iframe for Globus consent
     * @param {string} consentUrl - The URL for the consent page
     */
    openConsentIframe(consentUrl) {
        // Save component state to cache and Redux store before opening consent iframe
        this.saveCache();
        this.saveToStore();
        
        const iframeContainer = $(`
        <div id="consent-iframe-container" style="width:100%; height:100%;">
          <iframe id="consent-iframe" src="${consentUrl}" style="width:100%; height:100%; border:none;"></iframe>                      
        </div>
        `);

        // Add message listener to detect when consent is complete
        window.addEventListener("message", this.handleConsentMessage.bind(this), false);

        // Show iframe in dialog
        iframeContainer.dialog({
            title: "Globus Authorization",
            modal: true,
            width: 800,
            height: 600,
            resizable: true,
            buttons: [
                {
                    text: "Cancel",
                    click: function () {
                        // Remove resumeFlow flag if user cancels
                        sessionStorage.removeItem('resumeFlow');
                        window.removeEventListener("message", this.handleConsentMessage.bind(this));
                        $(this).dialog("close");
                    }.bind(this),
                },
            ],
            close: function () {
                window.removeEventListener("message", this.handleConsentMessage.bind(this));
                $(this).dialog("destroy").remove();
            }.bind(this),
        });
    }

    /**
     * Handles messages from the consent iframe
     * @param {MessageEvent} event - The message event
     */
    handleConsentMessage(event) {
        // Verify the origin for security
        // You should replace this with your actual Globus domain
        if (!event.origin.match(AUTH_URL)) {
            return;
        }

        // Check if consent was granted
        if (event.data && event.data.type === "globus_auth_complete") {
            // Close the iframe dialog
            $("#consent-iframe-container").dialog("close");

            // Set resumeFlow flag to true to indicate we should resume after page reload
            sessionStorage.setItem('resumeFlow', 'true');
            
            // Reload the tree with the new authorization
            this.loadTree();
        }
    }

    /**
     * Handle selection confirmation
     */
    handleSelect() {
        const node = $.ui.fancytree.getTree("#file_tree").activeNode;
        if (!node || !this.props.onSelect) {
            return;
        }

        // Construct full path for selected node
        const path =
            this.state.path +
            (this.state.path.endsWith(CONFIG.PATH.SEPARATOR) ? "" : CONFIG.PATH.SEPARATOR) +
            (node.key === CONFIG.PATH.CURRENT ? "" : node.key);

        this.props.onSelect(path);
    }

    cleanup() {
        clearTimeout(this.state.timer);
    }
}

/**
 * Show endpoint browser dialog
 * @param {object} endpoint - Endpoint configuration
 * @param {string} path - Initial path
 * @param {string} mode - Browser mode ('file'/'dir')
 * @param {Object} controller - handler
 * @param {Function} callback - Selection callback
 */
export function show(endpoint, path, mode, controller, callback) {
    const browser = new EndpointBrowser({
        endpoint,
        path,
        mode,
        controller,
        onSelect: callback,
    });
    console.log("browser, path, mode, callback", endpoint, path, mode, callback);
    browser.render().dialog({
        title: `Browse End-Point ${endpoint.name}`,
        modal: true,
        width: CONFIG.UI.SIZE.WIDTH,
        height: CONFIG.UI.SIZE.HEIGHT,
        resizable: true,
        buttons: [
            {
                text: "Cancel",
                click: function () {
                    browser.cleanup();
                    $(this).dialog("close");
                },
            },
            {
                id: "sel_btn",
                text: "Select",
                click: function () {
                    browser.handleSelect();
                    browser.cleanup();
                    $(this).dialog("close");
                },
            },
        ],
        close: function () {
            browser.cleanup();
            $(this).dialog("destroy").remove();
        },
    });
}
