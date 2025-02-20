import * as util from "../../util.js";
import * as api from "../../api.js";

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
    /**
     * @param {object} props - Browser configuration
     * @param {object} props.endpoint - Endpoint details
     * @param {string} props.path - Initial path
     * @param {string} props.mode - Browser mode ('file'/'dir')
     * @param {Function} props.onSelect - Selection callback
     * @param {object} props.services - The service objects to use for API and dialog operations
     * @param {object} props.services.dialogs - Dialog service
     * @param {Function} props.services.dialogs.dlgAlert - Alert dialog function
     * @param {object} props.services.api - API service
     * @param {Function} props.services.api.getGlobusConsentURL - Globus authorization URL function
     */
    constructor(props) {
        this.props = props;
        this.state = {
            path: props.path,
            loading: false,
            timer: null,
        };
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
        const notUp = node?.key !== CONFIG.PATH.UP;
        return (
            ((isDir && this.props.mode === "dir") || (!isDir && this.props.mode === "file")) &&
            notUp
        );
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
            // Fetch directory listing
            const data = await new Promise((resolve) => {
                api.epDirList(this.props.endpoint.id, this.state.path, false, resolve);
            });

            if (data.code) {
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
            const data = await new Promise((resolve) => {
                api.getGlobusConsentURL(
                    (_, data) => resolve(data),
                    this.props.endpoint.id,
                    error.data.required_scopes,
                );
            });
            title = `<span class='ui-state-error'>Consent Required: Please provide <a href="${data.consent_url}">consent</a>.</span>`;
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
 * @param {Function} callback - Selection callback
 */
export function show(endpoint, path, mode, callback) {
    const browser = new EndpointBrowser({
        endpoint,
        path,
        mode,
        onSelect: callback,
    });

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
