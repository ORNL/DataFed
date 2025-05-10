import * as util from "../../util.js";
import * as model from "../../model.js";
import * as api from "../../api.js";
import * as panel_info from "../../panel_item_info.js";
import { defineArrowMarkerComp, defineArrowMarkerDeriv, defineArrowMarkerNewVer } from "./assets/arrow-markers.js";

// Dynamically load the graph styles CSS
(function loadGraphStyles() {
    if (!document.getElementById('graph-styles-css')) {
        const link = document.createElement('link');
        link.id = 'graph-styles-css';
        link.rel = 'stylesheet';
        link.type = 'text/css';
        link.href = './graph_styles.css';
        document.head.appendChild(link);
    }
})();

// Add custom styles for the customization modal and anchored nodes
(function addCustomStyles() {
    if (!document.getElementById('graph-custom-styles')) {
        const style = document.createElement('style');
        style.id = 'graph-custom-styles';
        style.textContent = `
            .customization-modal {
                background: #fff;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                color: #333;
                font-family: sans-serif;
                padding: 20px;
                position: fixed;
                z-index: 1000;
                width: 300px;
            }
            .customization-modal h3 {
                margin-top: 0;
                border-bottom: 1px solid #eee;
                padding-bottom: 8px;
            }
            .customization-modal .section {
                margin-bottom: 15px;
            }
            .customization-modal label {
                display: block;
                margin-bottom: 5px;
                font-weight: bold;
            }
            .customization-modal .control-row {
                display: flex;
                align-items: center;
                margin-bottom: 10px;
            }
            .customization-modal .control-row input[type="range"] {
                flex: 1;
                margin-right: 10px;
            }
            .customization-modal .control-row .value {
                width: 40px;
                text-align: right;
            }
            .customization-modal .buttons {
                display: flex;
                justify-content: flex-end;
                margin-top: 15px;
                gap: 10px;
            }
            .customization-modal button {
                padding: 5px 10px;
                border-radius: 4px;
                border: 1px solid #ccc;
                background: #f5f5f5;
                cursor: pointer;
            }
            .customization-modal button:hover {
                background: #e5e5e5;
            }
            .customization-modal button.primary {
                background: #4a90e2;
                color: white;
                border-color: #3a80d2;
            }
            .customization-modal button.primary:hover {
                background: #3a80d2;
            }
            .anchored {
                stroke: #ffcc00;
                stroke-width: 2px;
            }
            .anchor-indicator {
                fill: #fff;
                stroke: #000;
                stroke-width: 1px;
                pointer-events: none;
            }
            .graph-controls {
                position: absolute;
                top: 10px;
                right: 10px;
                z-index: 100;
                display: flex;
                gap: 5px;
            }
            .graph-tooltip {
                position: absolute;
                bottom: 10px;
                left: 10px;
                background: rgba(0,0,0,0.7);
                color: white;
                padding: 10px;
                border-radius: 5px;
                font-size: 12px;
                line-height: 1.4;
                max-width: 250px;
                z-index: 100;
            }
        `;
        document.head.appendChild(style);
    }
})();

export function newGraphPanel(a_id, a_frame, a_parent) {
    return new GraphPanel(a_id, a_frame, a_parent);
}

// Default node and label styles
const DEFAULT_NODE_SIZE = 10;
const DEFAULT_NODE_COLOR = null; // Use CSS default
const DEFAULT_LABEL_SIZE = 14;
const DEFAULT_LABEL_COLOR = null; // Use CSS default

// Factory function for creating nodes
function createNode(item) {
    const node = {
        id: item.id,
        doi: item.doi,
        size: item.size,
        notes: item.notes,
        inhErr: item.inhErr,
        locked: item.locked,
        links: [],
        nodeSize: DEFAULT_NODE_SIZE,
        labelSize: DEFAULT_LABEL_SIZE
    };
    
    makeLabel(node, item);
    
    if (item.gen !== undefined) {
        node.row = item.gen;
        node.col = 0;
    }
    
    return node;
}

function makeLabel(node, item) {
    if (item.alias) {
        node.label = item.alias;
    } else node.label = item.id;

    node.label += util.generateNoteSpan(item, true);
}

// Create customization modal for node and label editing
function createCustomizationModal() {
    // Remove existing modal if it exists
    const existingModal = document.getElementById('customization-modal');
    if (existingModal) {
        document.body.removeChild(existingModal);
    }
    
    const modal = document.createElement('div');
    modal.id = 'customization-modal';
    modal.className = 'customization-modal';
    modal.style.display = 'none';
    
    // Add a draggable header
    const modalHeader = document.createElement('div');
    modalHeader.className = 'modal-header';
    modalHeader.style.cursor = 'move';
    modalHeader.style.padding = '5px';
    modalHeader.style.marginBottom = '10px';
    modalHeader.style.backgroundColor = '#f5f5f5';
    modalHeader.style.borderBottom = '1px solid #ddd';
    modalHeader.style.borderRadius = '8px 8px 0 0';
    
    // Title in the draggable header
    const title = document.createElement('h3');
    title.textContent = 'Customize Node & Label';
    title.style.margin = '0';
    title.style.padding = '5px';
    modalHeader.appendChild(title);
    modal.appendChild(modalHeader);
    
    // Node customization section
    const nodeSection = document.createElement('div');
    nodeSection.className = 'section';
    
    const nodeLabel = document.createElement('label');
    nodeLabel.textContent = 'Node Size';
    nodeSection.appendChild(nodeLabel);
    
    const nodeSizeRow = document.createElement('div');
    nodeSizeRow.className = 'control-row';
    
    const nodeSizeSlider = document.createElement('input');
    nodeSizeSlider.type = 'range';
    nodeSizeSlider.min = '5';
    nodeSizeSlider.max = '30';
    nodeSizeSlider.value = DEFAULT_NODE_SIZE;
    nodeSizeSlider.id = 'node-size-slider';
    
    const nodeSizeValue = document.createElement('span');
    nodeSizeValue.className = 'value';
    nodeSizeValue.textContent = DEFAULT_NODE_SIZE;
    
    nodeSizeRow.appendChild(nodeSizeSlider);
    nodeSizeRow.appendChild(nodeSizeValue);
    nodeSection.appendChild(nodeSizeRow);
    
    const nodeColorLabel = document.createElement('label');
    nodeColorLabel.textContent = 'Node Color';
    nodeSection.appendChild(nodeColorLabel);
    
    const nodeColorRow = document.createElement('div');
    nodeColorRow.className = 'control-row';
    
    const nodeColorInput = document.createElement('input');
    nodeColorInput.type = 'color';
    nodeColorInput.id = 'node-color-input';
    nodeColorInput.value = '#6baed6'; // Default blue color
    
    nodeColorRow.appendChild(nodeColorInput);
    nodeSection.appendChild(nodeColorRow);
    
    modal.appendChild(nodeSection);
    
    // Label customization section
    const labelSection = document.createElement('div');
    labelSection.className = 'section';
    
    const labelSizeLabel = document.createElement('label');
    labelSizeLabel.textContent = 'Label Size';
    labelSection.appendChild(labelSizeLabel);
    
    const labelSizeRow = document.createElement('div');
    labelSizeRow.className = 'control-row';
    
    const labelSizeSlider = document.createElement('input');
    labelSizeSlider.type = 'range';
    labelSizeSlider.min = '8';
    labelSizeSlider.max = '24';
    labelSizeSlider.value = DEFAULT_LABEL_SIZE;
    labelSizeSlider.id = 'label-size-slider';
    
    const labelSizeValue = document.createElement('span');
    labelSizeValue.className = 'value';
    labelSizeValue.textContent = DEFAULT_LABEL_SIZE;
    
    labelSizeRow.appendChild(labelSizeSlider);
    labelSizeRow.appendChild(labelSizeValue);
    labelSection.appendChild(labelSizeRow);
    
    const labelColorLabel = document.createElement('label');
    labelColorLabel.textContent = 'Label Color';
    labelSection.appendChild(labelColorLabel);
    
    const labelColorRow = document.createElement('div');
    labelColorRow.className = 'control-row';
    
    const labelColorInput = document.createElement('input');
    labelColorInput.type = 'color';
    labelColorInput.id = 'label-color-input';
    labelColorInput.value = '#333333'; // Default text color
    
    labelColorRow.appendChild(labelColorInput);
    labelSection.appendChild(labelColorRow);
    
    modal.appendChild(labelSection);
    
    // Anchor controls
    const anchorSection = document.createElement('div');
    anchorSection.className = 'section';
    
    const anchorCheckbox = document.createElement('input');
    anchorCheckbox.type = 'checkbox';
    anchorCheckbox.id = 'anchor-checkbox';
    
    const anchorLabel = document.createElement('label');
    anchorLabel.htmlFor = 'anchor-checkbox';
    anchorLabel.textContent = 'Anchor Node';
    anchorLabel.style.display = 'inline';
    anchorLabel.style.marginLeft = '5px';
    
    anchorSection.appendChild(anchorCheckbox);
    anchorSection.appendChild(anchorLabel);
    
    modal.appendChild(anchorSection);
    
    // Buttons
    const buttonsDiv = document.createElement('div');
    buttonsDiv.className = 'buttons';
    
    const applyButton = document.createElement('button');
    applyButton.textContent = 'Apply';
    applyButton.className = 'primary';
    applyButton.id = 'apply-customization';
    
    const closeButton = document.createElement('button');
    closeButton.textContent = 'Close';
    closeButton.id = 'close-customization';
    
    buttonsDiv.appendChild(closeButton);
    buttonsDiv.appendChild(applyButton);
    
    modal.appendChild(buttonsDiv);
    
    document.body.appendChild(modal);
    
    // Make the modal draggable
    makeModalDraggable(modal);
    
    return modal;
}

// Function to make the customization modal draggable
function makeModalDraggable(modal) {
    let offsetX, offsetY, isDragging = false;
    const header = modal.querySelector('.modal-header') || modal;

    header.addEventListener('mousedown', function(e) {
        isDragging = true;
        offsetX = e.clientX - modal.offsetLeft;
        offsetY = e.clientY - modal.offsetTop;
        e.preventDefault();
    });

    document.addEventListener('mousemove', function(e) {
        if (isDragging) {
            modal.style.left = `${e.clientX - offsetX}px`;
            modal.style.top = `${e.clientY - offsetY}px`;
        }
    });

    document.addEventListener('mouseup', function() {
        isDragging = false;
    });
}

// Observer pattern for state management
class GraphState {
    constructor() {
        this.observers = [];
        this.state = {
            nodePositions: {}, // Store node positions
            nodeStyles: {},    // Store node customizations
            labelOffsets: {},  // Store label offsets
            labelStyles: {}    // Store label customizations
        };
    }
    
    addObserver(observer) {
        this.observers.push(observer);
    }
    
    notifyObservers() {
        this.observers.forEach(observer => observer.update(this.state));
    }
    
    saveState(nodeData) {
        // Clear previous state
        this.state = {
            nodePositions: {},
            nodeStyles: {},
            labelOffsets: {},
            labelStyles: {}
        };
        
        // Save state for each node
        nodeData.forEach(node => {
            this.state.nodePositions[node.id] = {
                x: node.x,
                y: node.y,
                anchored: node.anchored || false
            };
            
            // Save node style customizations
            if (node.nodeSize !== DEFAULT_NODE_SIZE || node.nodeColor) {
                this.state.nodeStyles[node.id] = {
                    size: node.nodeSize || DEFAULT_NODE_SIZE,
                    color: node.nodeColor || DEFAULT_NODE_COLOR
                };
            }
            
            // Save label offsets
            if (node.labelOffsetX !== undefined || node.labelOffsetY !== undefined) {
                this.state.labelOffsets[node.id] = {
                    x: node.labelOffsetX || 0,
                    y: node.labelOffsetY || 0
                };
            }
            
            // Save label style customizations
            if (node.labelSize !== DEFAULT_LABEL_SIZE || node.labelColor) {
                this.state.labelStyles[node.id] = {
                    size: node.labelSize || DEFAULT_LABEL_SIZE,
                    color: node.labelColor || DEFAULT_LABEL_COLOR
                };
            }
        });
        
        // Store in localStorage
        try {
            localStorage.setItem('datafed-graph-state', JSON.stringify(this.state));
            this.notifyObservers();
            return true;
        } catch (e) {
            console.error('Failed to save graph state:', e);
            return false;
        }
    }
    
    loadState(nodeData) {
        try {
            const savedState = localStorage.getItem('datafed-graph-state');
            if (!savedState) {
                return false;
            }
            
            this.state = JSON.parse(savedState);
            
            // Apply saved state to current nodes
            nodeData.forEach(node => {
                // Apply position and anchor state
                if (this.state.nodePositions[node.id]) {
                    const pos = this.state.nodePositions[node.id];
                    node.x = pos.x;
                    node.y = pos.y;
                    
                    if (pos.anchored) {
                        node.anchored = true;
                        node.fx = pos.x;
                        node.fy = pos.y;
                    }
                }
                
                // Apply node style customizations
                if (this.state.nodeStyles[node.id]) {
                    const style = this.state.nodeStyles[node.id];
                    node.nodeSize = style.size;
                    node.nodeColor = style.color;
                }
                
                // Apply label offsets
                if (this.state.labelOffsets[node.id]) {
                    const offset = this.state.labelOffsets[node.id];
                    node.labelOffsetX = offset.x;
                    node.labelOffsetY = offset.y;
                }
                
                // Apply label style customizations
                if (this.state.labelStyles[node.id]) {
                    const style = this.state.labelStyles[node.id];
                    node.labelSize = style.size;
                    node.labelColor = style.color;
                }
            });
            
            this.notifyObservers();
            return true;
        } catch (e) {
            console.error('Failed to load graph state:', e);
            return false;
        }
    }
}

function GraphPanel(a_id, a_frame, a_parent) {
    //let graph_div = $(a_id,a_frame);
    let inst = this;
    let node_data = [];
    let link_data = [];
    let graph_center_x = 200;
    let nodes_grp = null;
    let nodes = null;
    let links_grp = null;
    let links = null;
    let svg = null;
    let simulation = null;
    let sel_node = null;
    let focus_node_id,
        sel_node_id,
        r = DEFAULT_NODE_SIZE;

    // Customization modal for node/label editing
    let customizationModal = null;
    let currentCustomizationNode = null;
    
    // State management using observer pattern
    let graphStateManager = new GraphState();

    this.load = function (a_id, a_sel_node_id) {
        focus_node_id = a_id;
        sel_node_id = a_sel_node_id ? a_sel_node_id : a_id;
        sel_node = null;

        //console.log("owner:",a_owner);
        api.dataGetDepGraph(a_id, function (a_data) {
            link_data = [];
            let new_node_data = [];
            let id_map = {};

            // Create nodes using factory pattern
            let id;
            for (let i in a_data.item) {
                const item = a_data.item[i];
                const node = createNode(item);

                if (item.id == a_id) {
                    node.comp = true;
                }

                if (item.id == sel_node_id) {
                    sel_node = node;
                }

                id_map[node.id] = new_node_data.length;
                new_node_data.push(node);

                // Create links
                for (let j in item.dep) {
                    const dep = item.dep[j];
                    id = item.id + "-" + dep.id;
                    link_data.push({
                        source: item.id,
                        target: dep.id,
                        ty: model.DepTypeFromString[dep.type],
                        id: id,
                    });
                }
            }

            // Connect links to nodes
            for (let i in link_data) {
                const dep = link_data[i];
                const sourceNode = new_node_data[id_map[dep.source]];
                sourceNode.links.push(dep);
                const targetNode = new_node_data[id_map[dep.target]];
                targetNode.links.push(dep);
            }

            // Copy any existing position data to new nodes
            for (let i in node_data) {
                const node = node_data[i];
                if (id_map[node.id] != undefined) {
                    const node2 = new_node_data[id_map[node.id]];
                    
                    // Copy position
                    node2.x = node.x;
                    node2.y = node.y;
                    
                    // Copy anchor state
                    if (node.anchored) {
                        node2.anchored = true;
                        node2.fx = node.x;
                        node2.fy = node.y;
                    }
                    
                    // Copy customizations
                    if (node.nodeSize) node2.nodeSize = node.nodeSize;
                    if (node.nodeColor) node2.nodeColor = node.nodeColor;
                    if (node.labelSize) node2.labelSize = node.labelSize;
                    if (node.labelColor) node2.labelColor = node.labelColor;
                    if (node.labelOffsetX !== undefined) node2.labelOffsetX = node.labelOffsetX;
                    if (node.labelOffsetY !== undefined) node2.labelOffsetY = node.labelOffsetY;
                }
            }

            node_data = new_node_data;

            if (!sel_node) {
                if (node_data.length) {
                    sel_node = node_data[0];
                    sel_node_id = sel_node.id;
                } else {
                    sel_node_id = null;
                }
            }

            // Initialize customization modal if not already created
            if (!customizationModal) {
                customizationModal = createCustomizationModal();
                setupCustomizationModalEvents();
            }

            renderGraph();
            panel_info.showSelectedInfo(sel_node_id, inst.checkGraphUpdate);
            a_parent.updateBtnState();
            
            // Initialize graph controls
            inst.addGraphControls();
        });
    };
    
    // Set up event handlers for the customization modal
    function setupCustomizationModalEvents() {
        const modal = document.getElementById('customization-modal');
        if (!modal) return;
        
        // Node size slider
        const nodeSizeSlider = document.getElementById('node-size-slider');
        const nodeSizeValue = nodeSizeSlider.nextElementSibling;
        
        nodeSizeSlider.addEventListener('input', function() {
            nodeSizeValue.textContent = this.value;
            if (currentCustomizationNode) {
                currentCustomizationNode.nodeSize = parseInt(this.value);
                renderGraph();
            }
        });
        
        // Node color input
        const nodeColorInput = document.getElementById('node-color-input');
        nodeColorInput.addEventListener('input', function() {
            if (currentCustomizationNode) {
                currentCustomizationNode.nodeColor = this.value;
                renderGraph();
            }
        });
        
        // Label size slider
        const labelSizeSlider = document.getElementById('label-size-slider');
        const labelSizeValue = labelSizeSlider.nextElementSibling;
        
        labelSizeSlider.addEventListener('input', function() {
            labelSizeValue.textContent = this.value;
            if (currentCustomizationNode) {
                currentCustomizationNode.labelSize = parseInt(this.value);
                renderGraph();
            }
        });
        
        // Label color input
        const labelColorInput = document.getElementById('label-color-input');
        labelColorInput.addEventListener('input', function() {
            if (currentCustomizationNode) {
                currentCustomizationNode.labelColor = this.value;
                renderGraph();
            }
        });
        
        // Anchor checkbox
        const anchorCheckbox = document.getElementById('anchor-checkbox');
        anchorCheckbox.addEventListener('change', function() {
            if (currentCustomizationNode) {
                currentCustomizationNode.anchored = this.checked;
                if (this.checked) {
                    currentCustomizationNode.fx = currentCustomizationNode.x;
                    currentCustomizationNode.fy = currentCustomizationNode.y;
                } else {
                    delete currentCustomizationNode.fx;
                    delete currentCustomizationNode.fy;
                }
                renderGraph();
            }
        });
        
        // Close button
        const closeButton = document.getElementById('close-customization');
        closeButton.addEventListener('click', function() {
            modal.style.display = 'none';
        });
        
        // Apply button
        const applyButton = document.getElementById('apply-customization');
        applyButton.addEventListener('click', function() {
            modal.style.display = 'none';
            // Save state automatically when applying changes
            inst.saveGraphState();
        });
        
        // Close modal when clicking outside
        document.addEventListener('click', function(e) {
            if (modal.style.display === 'block' && !modal.contains(e.target) && !e.target.closest('.node')) {
                modal.style.display = 'none';
            }
        });
    }
    
    // Show customization modal for a node
    function showCustomizationModal(node, x, y) {
        if (!customizationModal) {
            customizationModal = createCustomizationModal();
            setupCustomizationModalEvents();
        }
    
        currentCustomizationNode = node;
    
        // Update modal controls to reflect current node state
        const nodeSizeSlider = document.getElementById('node-size-slider');
        const nodeSizeValue = nodeSizeSlider.nextElementSibling;
        nodeSizeSlider.value = node.nodeSize || DEFAULT_NODE_SIZE;
        nodeSizeValue.textContent = nodeSizeSlider.value;
    
        const nodeColorInput = document.getElementById('node-color-input');
        // Get the actual current node color, either from custom setting or from computed style
        if (node.nodeColor) {
            nodeColorInput.value = node.nodeColor;
        } else {
            // Try to get the default color from CSS if possible
            const nodeElement = d3.select(`[id="${node.id}"] circle.obj`).node();
            if (nodeElement) {
                const computedStyle = window.getComputedStyle(nodeElement);
                const fillColor = computedStyle.fill;
                if (fillColor && fillColor !== 'none') {
                    // Convert RGB to hex if needed
                    if (fillColor.startsWith('rgb')) {
                        const rgb = fillColor.match(/\d+/g);
                        if (rgb && rgb.length === 3) {
                            const hex = '#' + rgb.map(x => {
                                const hex = parseInt(x).toString(16);
                                return hex.length === 1 ? '0' + hex : hex;
                            }).join('');
                            nodeColorInput.value = hex;
                        } else {
                            nodeColorInput.value = '#6baed6'; // Default blue
                        }
                    } else {
                        nodeColorInput.value = fillColor;
                    }
                } else {
                    nodeColorInput.value = '#6baed6'; // Default blue
                }
            } else {
                nodeColorInput.value = '#6baed6'; // Default blue
            }
        }
        
        const labelSizeSlider = document.getElementById('label-size-slider');
        const labelSizeValue = labelSizeSlider.nextElementSibling;
        labelSizeSlider.value = node.labelSize || DEFAULT_LABEL_SIZE;
        labelSizeValue.textContent = labelSizeSlider.value;
        
        const labelColorInput = document.getElementById('label-color-input');
        labelColorInput.value = node.labelColor || '#333333';
        
        const anchorCheckbox = document.getElementById('anchor-checkbox');
        anchorCheckbox.checked = node.anchored || false;
        
        // Position and show modal
        customizationModal.style.left = `${x}px`;
        customizationModal.style.top = `${y}px`;
        customizationModal.style.display = 'block';
    }

    this.checkGraphUpdate = function (a_data, a_source) {
        console.log("graph check updates", a_data, a_source);
        console.log("sel node", sel_node);
        // source is sel_node_id, so check sel_node
        if (a_data.size != sel_node.size) {
            console.log("size diff, update!");
            model.update([a_data]);
        }
    };

    // TODO Why are IDs separate from data?

    this.update = function (a_ids, a_data) {
        // Only updates locked and alias of impacted nodes

        let ids = Array.isArray(a_ids) ? a_ids : [a_ids];
        let data = Array.isArray(a_data) ? a_data : [a_data];
        let i,
            node,
            item,
            render = false;

        for (i = 0; i < ids.length; i++) {
            node = findNode(ids[i]);
            if (node) {
                render = true;
                item = data[i];

                node.locked = item.locked;
                node.notes = item.notes;
                console.log("updating:", node);

                makeLabel(node, item);
            }
        }

        if (render) renderGraph();
    };

    this.clear = function () {
        links_grp.selectAll("*").remove();
        nodes_grp.selectAll("*").remove();
        node_data = [];
        link_data = [];
    };

    this.resized = function (a_width, a_height) {
        graph_center_x = a_width / 2;
    };

    this.getSelectedID = function () {
        if (sel_node) return sel_node.id;
    };
    
    // Save the current graph state
    this.saveGraphState = function() {
        if (graphStateManager.saveState(node_data)) {
            alert('Graph state saved successfully');
            return true;
        } else {
            alert('Failed to save graph state');
            return false;
        }
    };
    
    // Load a previously saved graph state
    this.loadGraphState = function() {
        if (graphStateManager.loadState(node_data)) {
            // Restart simulation with new positions
            if (simulation) {
                simulation.alpha(1).restart();
            }
            
            // Re-render the graph
            renderGraph();
            
            alert('Graph state loaded successfully');
            return true;
        } else {
            alert('No saved graph state found');
            return false;
        }
    };

    this.getSelectedNodes = function () {
        let sel = [];
        if (sel_node) {
            sel.push({
                key: sel_node.id,
                data: { doi: sel_node.doi, size: sel_node.size },
                parent: { key: "" },
            });
        }
        return sel;
    };

    this.getSubjectID = function () {
        if (focus_node_id) return focus_node_id;
    };
    
    // Add UI buttons for saving and loading graph state
    this.addGraphControls = function(container) {
        // Create container for graph controls if it doesn't exist
        if (!document.getElementById('graph-controls')) {
            const controlsDiv = document.createElement('div');
            controlsDiv.id = 'graph-controls';
            controlsDiv.className = 'graph-controls';
            
            // Save button
            const saveBtn = document.createElement('button');
            saveBtn.textContent = 'Save Graph';
            saveBtn.className = 'ui-button ui-widget ui-corner-all';
            saveBtn.title = 'Save the current graph state including node positions, anchors, and customizations';
            saveBtn.addEventListener('click', function() {
                inst.saveGraphState();
            });
            
            // Load button
            const loadBtn = document.createElement('button');
            loadBtn.textContent = 'Load Graph';
            loadBtn.className = 'ui-button ui-widget ui-corner-all';
            loadBtn.title = 'Load a previously saved graph state';
            loadBtn.addEventListener('click', function() {
                inst.loadGraphState();
            });
            
            // Reset button
            const resetBtn = document.createElement('button');
            resetBtn.textContent = 'Reset View';
            resetBtn.className = 'ui-button ui-widget ui-corner-all';
            resetBtn.title = 'Reset all customizations and anchors';
            resetBtn.addEventListener('click', function() {
                // Reset all node customizations
                node_data.forEach(function(node) {
                    node.nodeSize = DEFAULT_NODE_SIZE;
                    node.nodeColor = DEFAULT_NODE_COLOR;
                    node.labelSize = DEFAULT_LABEL_SIZE;
                    node.labelColor = DEFAULT_LABEL_COLOR;
                    node.labelOffsetX = 0;
                    node.labelOffsetY = 0;
                    node.anchored = false;
                    delete node.fx;
                    delete node.fy;
                });
                
                // Restart simulation
                if (simulation) {
                    simulation.alpha(1).restart();
                }
                
                renderGraph();
            });
            
            // Help tooltip
            const helpTip = document.createElement('div');
            helpTip.className = 'graph-tooltip';
            helpTip.innerHTML = 
                '<strong>Graph Controls:</strong><br>' +
                '• Drag nodes to move them<br>' +
                '• Shift+Drag to anchor nodes<br>' +
                '• Alt+Drag to move label<br>' +
                '• Right-click for customization options<br>' +
                '• Double-click to toggle anchor';
            
            // Add buttons to container
            controlsDiv.appendChild(saveBtn);
            controlsDiv.appendChild(loadBtn);
            controlsDiv.appendChild(resetBtn);
            
            // Add container to the graph
            let graphContainer;
            if (container) {
                graphContainer = document.querySelector(container);
            } else {
                // Make sure we don't double-prefix with #
                const selector = a_id.startsWith('#') ? a_id : '#' + a_id;
                graphContainer = document.querySelector(selector);
            }
            
            if (graphContainer) {
                graphContainer.style.position = 'relative';
                graphContainer.appendChild(controlsDiv);
                graphContainer.appendChild(helpTip);
            } else {
                console.error('Graph container not found:', container || '#' + a_id);
            }
        }
    };

    // NOTE: D3 changes link source and target IDs strings (in link_data) to node references (in node_data) when renderGraph runs
    function renderGraph() {
        let g;

        links = links_grp.selectAll("line").data(link_data, function (d) {
            return d.id;
        });

        links
            .enter()
            .append("line")
            .attr("marker-start", function (d) {
                //console.log("link enter 1");
                switch (d.ty) {
                    case 0:
                        return "url(#arrow-derivation)";
                    case 1:
                        return "url(#arrow-component)";
                    case 2:
                        return "url(#arrow-new-version)";
                    default:
                        return "";
                }
            })
            /*.attr('marker-end',function(d){
                    //console.log("link enter 1");
                    switch ( d.ty ){
                        case 2: return 'url(#arrow-new-version)';
                        default: return '';
                    }
                })*/
            .attr("class", function (d) {
                //console.log("link enter 2");
                switch (d.ty) {
                    case 0:
                        return "link derivation";
                    case 1:
                        return "link component";
                    case 2:
                        return "link new-version";
                }
            });

        links.exit().remove();

        links = links_grp.selectAll("line");

        nodes = nodes_grp.selectAll("g").data(node_data, function (d) {
            return d.id;
        });

        // Update
        nodes.select("circle.obj").attr("class", function (d) {
            let res = "obj ";

            //console.log("upd node", d );

            if (d.id == focus_node_id) res += "main";
            else if (d.row != undefined) res += "prov";
            else {
                //console.log("upd other node", d );
                res += "other";
            }

            if (d.comp) res += " comp";
            else res += " part";

            return res;
        });

        nodes
            .select("text.label")
            .html(function (d) {
                return d.label;
            })
            .attr("x", function (d) {
                if (d.locked) return r + 12;
                else return r;
            });

        nodes.select("text.locked").html(function (d) {
            if (d.locked) return "&#xe6bb";
            else return "";
        });

        nodes.selectAll(".node > circle.select").attr("class", function (d) {
            if (d.id == sel_node_id) {
                //sel_node = d;
                return "select highlight";
            } else return "select hidden";
        });

        g = nodes
            .enter()
            .append("g")
            .attr("class", "node")
            .call(d3.drag().on("start", dragStarted).on("drag", dragged).on("end", dragEnded));

        g.append("circle")
            .attr("r", function(d) {
                return d.nodeSize || r;
            })
            .attr("class", function (d) {
                let res = "obj ";
                //console.log("node enter 1");

                if (d.id == focus_node_id) res += "main";
                else if (d.row != undefined) res += "prov";
                else {
                    res += "other";
                    //console.log("new other node", d );
                }

                if (d.comp) res += " comp";
                else res += " part";

                return res;
            })
            .style("fill", function(d) {
                return d.nodeColor || null; // Use CSS default if not specified
            })
            .on("mouseover", function (d) {
                //console.log("mouse over");
                const nodeSize = d.nodeSize || r;
                d3.select(this)
                    .transition()
                    .duration(150)
                    .attr("r", nodeSize * 1.5);
            })
            .on("mouseout", function (d) {
                const nodeSize = d.nodeSize || r;
                d3.select(this).transition().duration(500).attr("r", nodeSize);
            })
            .on("dblclick", function (d, i) {
                //console.log("dbl click");
                if (d.comp) inst.collapseNode();
                else inst.expandNode();
                d3.event.stopPropagation();
            })
            .on("click", function (d, i) {
                if (sel_node != d) {
                    d3.select(".highlight").attr("class", "select hidden");
                    d3.select(this.parentNode).select(".select").attr("class", "select highlight");
                    sel_node = d;
                    sel_node_id = d.id;
                    panel_info.showSelectedInfo(d.id, inst.checkGraphUpdate);
                    a_parent.updateBtnState();
                }

                if (d3.event.ctrlKey) {
                    if (d.comp) inst.collapseNode();
                    else inst.expandNode();
                }

                d3.event.stopPropagation();
            })
            .on("contextmenu", function(d, i) {
                // Prevent default context menu
                d3.event.preventDefault();
                
                // Select the node if not already selected
                if (sel_node != d) {
                    d3.select(".highlight").attr("class", "select hidden");
                    d3.select(this.parentNode).select(".select").attr("class", "select highlight");
                    sel_node = d;
                    sel_node_id = d.id;
                    panel_info.showSelectedInfo(d.id, inst.checkGraphUpdate);
                    a_parent.updateBtnState();
                }
                
                // Show customization modal at mouse position
                showCustomizationModal(d, d3.event.pageX, d3.event.pageY);
                
                d3.event.stopPropagation();
            });

        g.append("circle")
            .attr("r", function(d) {
                // Scale the selection circle based on the node size
                return (d.nodeSize || r) * 1.5;
            })
            .attr("class", function (d) {
                //console.log("node enter 3");

                if (d.id == sel_node_id) {
                    //sel_node = d;
                    return "select highlight";
                } else return "select hidden";
            });

        let n2 = g.filter(function (d) {
            return d.size;
        });
        n2.append("line")
            .attr("pointer-events", "none")
            .attr("x1", -r * 0.5)
            .attr("y1", -r * 0.3)
            .attr("x2", r * 0.5)
            .attr("y2", -r * 0.3)
            .attr("class", "data");
        //.attr("stroke-width", 1 )
        //.attr("stroke", "white" );

        n2.append("line")
            .attr("pointer-events", "none")
            .attr("x1", -r * 0.5)
            .attr("y1", 0)
            .attr("x2", r * 0.5)
            .attr("y2", 0)
            .attr("class", "data");
        //.attr("stroke-width", 1 )
        //.attr("stroke", "white" );

        n2.append("line")
            .attr("pointer-events", "none")
            .attr("x1", -r * 0.5)
            .attr("y1", r * 0.3)
            .attr("x2", r * 0.5)
            .attr("y2", r * 0.3)
            .attr("class", "data");
        //.attr("stroke-width", 1 )
        //.attr("stroke", "white" );

        g.append("text")
            .attr("class", "label")
            .html(function (d) {
                return d.label;
            })
            .attr("x", function (d) {
                if (d.locked) return r + 12;
                else return r;
            })
            .attr("y", -r)
            .style("font-size", function(d) {
                return (d.labelSize || DEFAULT_LABEL_SIZE) + "px";
            })
            .style("fill", function(d) {
                return d.labelColor || DEFAULT_LABEL_COLOR;
            })
            .on("contextmenu", function(d, i) {
                // Prevent default context menu
                d3.event.preventDefault();
                
                // Select the node if not already selected
                if (sel_node != d) {
                    d3.select(".highlight").attr("class", "select hidden");
                    d3.select(this.parentNode).select(".select").attr("class", "select highlight");
                    sel_node = d;
                    sel_node_id = d.id;
                    panel_info.showSelectedInfo(d.id, inst.checkGraphUpdate);
                    a_parent.updateBtnState();
                }
                
                // Show customization modal at mouse position
                showCustomizationModal(d, d3.event.pageX, d3.event.pageY);
                
                d3.event.stopPropagation();
            })
            // Make labels draggable independently with Alt key
            .call(d3.drag()
                .on("start", function(d) {
                    if (!d3.event.active) simulation.alphaTarget(0.3).restart();
                    d.draggingLabel = true;
                    d.labelDragStartX = d3.event.x;
                    d.labelDragStartY = d3.event.y;
                    d3.event.sourceEvent.stopPropagation();
                })
                .on("drag", function(d) {
                    if (!d.labelOffsetX) d.labelOffsetX = 0;
                    if (!d.labelOffsetY) d.labelOffsetY = 0;
                    
                    // Update the label offset based on drag movement
                    d.labelOffsetX += (d3.event.x - d.labelDragStartX);
                    d.labelOffsetY += (d3.event.y - d.labelDragStartY);
                    
                    // Update the start position for the next drag event
                    d.labelDragStartX = d3.event.x;
                    d.labelDragStartY = d3.event.y;
                    
                    // Update the visualization
                    simTick();
                    d3.event.sourceEvent.stopPropagation();
                })
                .on("end", function(d) {
                    if (!d3.event.active) simulation.alphaTarget(0);
                    d.draggingLabel = false;
                    d3.event.sourceEvent.stopPropagation();
                })
            );

        g.append("text")
            .attr("class", "locked")
            .html(function (d) {
                if (d.locked) return "&#xe6bb";
                else return "";
            })
            .attr("x", r - 3)
            .attr("y", -r + 1);

        nodes.exit().remove();

        nodes = nodes_grp.selectAll("g");

        if (simulation) {
            //console.log("restart sim");
            simulation.nodes(node_data).force("link").links(link_data);

            simulation.alpha(1).restart();
        } else {
            let linkForce = d3
                .forceLink(link_data)
                .strength(function (d) {
                    switch (d.ty) {
                        case 0:
                            return 0.1;
                        case 1:
                            return 0.1;
                        case 2:
                            return 0.1;
                    }
                })
                .id(function (d) {
                    return d.id;
                });

            simulation = d3
                .forceSimulation()
                .nodes(node_data)
                //.force('center', d3.forceCenter(200,200))
                .force("charge", d3.forceManyBody().strength(-300))
                .force(
                    "row",
                    d3
                        .forceY(function (d, i) {
                            return d.row != undefined ? 75 + d.row * 75 : 0;
                        })
                        .strength(function (d) {
                            return d.row != undefined ? 0.05 : 0;
                        }),
                )
                .force(
                    "col",
                    d3
                        .forceX(function (d, i) {
                            return d.col != undefined ? graph_center_x : 0;
                        })
                        .strength(function (d) {
                            return d.col != undefined ? 0.05 : 0;
                        }),
                )
                .force("link", linkForce)
                .force("collide", d3.forceCollide().radius(function(d) {
                    // Base radius plus some extra space based on label length
                    return r * 1.5 + (d.label ? d.label.length * 0.8 : 0);
                }))
                .on("tick", simTick);
        }
    }

    function dragStarted(d) {
        //console.log("drag start",d.id);
        if (!d3.event.active) simulation.alphaTarget(0.3).restart();
        
        // If node was previously anchored, maintain that state
        if (d.anchored) {
            // Node is already anchored, just update position
            d.fx = d3.event.x;
            d.fy = d3.event.y;
        } else {
            // Normal behavior
            d.fx = d3.event.x;
            d.fy = d3.event.y;
        }
        
        // Check if Alt key is pressed to drag the label independently
        if (d3.event.sourceEvent && d3.event.sourceEvent.altKey) {
            d.draggingLabel = true;
            d.labelDragStartX = d3.event.x;
            d.labelDragStartY = d3.event.y;
            
            // Initialize label offsets if they don't exist
            if (d.labelOffsetX === undefined) d.labelOffsetX = 0;
            if (d.labelOffsetY === undefined) d.labelOffsetY = 0;
        }
        
        if (d3.event.sourceEvent) d3.event.sourceEvent.stopPropagation();
    }

    function dragged(d) {
        //console.log("drag",d3.event.x,d3.event.y);
        
        if (d.draggingLabel) {
            // Dragging the label independently
            // Update the label offset based on drag movement
            d.labelOffsetX += (d3.event.x - d.labelDragStartX);
            d.labelOffsetY += (d3.event.y - d.labelDragStartY);
            
            // Update the start position for the next drag event
            d.labelDragStartX = d3.event.x;
            d.labelDragStartY = d3.event.y;
        } else {
            // Normal node dragging
            d.fx = d3.event.x;
            d.fy = d3.event.y;
        }
        
        simTick();
        if (d3.event.sourceEvent) d3.event.sourceEvent.stopPropagation();
    }

    function dragEnded(d) {
        //console.log("drag end",d.id);
        if (!d3.event.active) simulation.alphaTarget(0);
        
        if (d.draggingLabel) {
            // End of label dragging
            d.draggingLabel = false;
            // Label position is already updated in the dragged function
        } else {
            // Check if shift key is pressed to anchor the node
            if (d3.event.sourceEvent && d3.event.sourceEvent.shiftKey) {
                // Keep the fixed position (anchored)
                d.anchored = true;
                // Visual feedback for anchored state
                d3.select(d3.event.sourceEvent.target.parentNode)
                    .select("circle.obj")
                    .classed("anchored", true);
            } else if (!d.anchored) {
                // Normal behavior - release the node if it's not anchored
                d.x = d.fx;
                d.y = d.fy;
                delete d.fx;
                delete d.fy;
            }
        }
        
        // Double-click to toggle anchor state
        if (d3.event.sourceEvent && d3.event.sourceEvent.detail === 2 && !d.draggingLabel) {
            d.anchored = !d.anchored;
            if (d.anchored) {
                d.fx = d.x;
                d.fy = d.y;
                // Visual feedback for anchored state
                d3.select(d3.event.sourceEvent.target.parentNode)
                    .select("circle.obj")
                    .classed("anchored", true);
            } else {
                delete d.fx;
                delete d.fy;
                // Remove visual feedback for anchored state
                d3.select(d3.event.sourceEvent.target.parentNode)
                    .select("circle.obj")
                    .classed("anchored", false);
            }
        }
        
        //console.log("at:",d);
        if (d3.event.sourceEvent) d3.event.sourceEvent.stopPropagation();
    }

    function findNode(a_id) {
        for (let i in node_data) {
            if (node_data[i].id == a_id) return node_data[i];
        }
    }

    function findLink(a_id) {
        for (let i in link_data) {
            if (link_data[i].id == a_id) return link_data[i];
        }
    }

    this.expandNode = function () {
        if (sel_node && !sel_node.comp) {
            api.dataView(sel_node_id, function (data) {
                console.log("expand node data:", data);
                if (data) {
                    let rec = data;

                    sel_node.comp = true;

                    let dep, new_node, link, i, id;

                    for (i in rec.deps) {
                        dep = rec.deps[i];
                        //console.log("dep:",dep);

                        if (dep.dir == "DEP_IN") id = dep.id + "-" + rec.id;
                        else id = rec.id + "-" + dep.id;

                        link = findLink(id);
                        if (link) continue;

                        link = { id: id, ty: model.DepTypeFromString[dep.type] };
                        if (dep.dir == "DEP_IN") {
                            link.source = dep.id;
                            link.target = rec.id;
                        } else {
                            link.source = rec.id;
                            link.target = dep.id;
                        }

                        sel_node.links.push(link);

                        new_node = findNode(dep.id);
                        if (!new_node) {
                            new_node = {
                                id: dep.id,
                                notes: dep.notes,
                                inhErr: dep.inhErr,
                                links: [link],
                            };
                            makeLabel(new_node, dep);
                            node_data.push(new_node);
                        } else {
                            new_node.links.push(link);
                        }

                        link_data.push(link);
                    }

                    renderGraph();
                }
            });
        }
    };

    this.collapseNode = function () {
        //console.log("collapse node");
        if (sel_node) {
            let i,
                link,
                dest,
                loc_trim = [];

            sel_node.comp = false;

            for (i = sel_node.links.length - 1; i >= 0; i--) {
                link = sel_node.links[i];
                //console.log("lev 0 link:",link);
                dest = link.source != sel_node ? link.source : link.target;
                graphPruneCalc(dest, [sel_node.id], sel_node);

                if (!dest.prune && dest.row == undefined) {
                    graphPruneReset(-1);
                    link.prune += 1;
                    //graphPrune();
                }

                if (dest.prune) {
                    //console.log("PRUNE ALL");
                    graphPrune();
                } else if (dest.row == undefined) {
                    //console.log("PRUNE LOCAL EDGE ONLY");
                    graphPruneReset();
                    loc_trim.push(link);
                    //link.prune = true;
                    //graphPrune();
                } else {
                    //console.log("PRUNE NONE");
                    graphPruneReset();
                }
            }

            if (loc_trim.length < sel_node.links.length) {
                for (i in loc_trim) {
                    loc_trim[i].prune = true;
                }
                graphPrune();
            }

            //graphPruneReset();

            renderGraph();
        }
    };

    this.hideNode = function () {
        if (sel_node && sel_node.id != focus_node_id && node_data.length > 1) {
            sel_node.prune = true;
            // Check for disconnection of the graph
            console.log("hide", sel_node.id);
            let start =
                sel_node.links[0].source == sel_node
                    ? sel_node.links[0].target
                    : sel_node.links[0].source;
            console.log("start", start);
            if (graphCountConnected(start, []) == node_data.length - 1) {
                for (let i in sel_node.links) {
                    console.log("prune", i, sel_node.links[i]);
                    sel_node.links[i].prune = true;
                }
                graphPrune();

                sel_node = node_data[0];
                sel_node_id = sel_node.id;
                renderGraph();
            } else {
                sel_node.prune = false;
                util.setStatusText("Cannot hide non-leaf nodes (try collapsing)");
            }
        } else {
            util.setStatusText("Cannot hide starting node");
        }
    };

    // Called automatically from API module when data records are impacted by edits or annotations
    this.updateData = function (a_data) {
        //console.log( "graph updating:", a_data );

        let j,
            node,
            item,
            l,
            l1,
            same,
            dep_cnt,
            render = false;

        //if ( focus_node_id )
        //    inst.load( focus_node_id, sel_node_id );

        // Scan updates for dependency changes that impact current graph,
        // if found, reload entire graph from DB
        // If not reloading, scan for changes to title, annotations, status...

        for (let i in a_data) {
            item = a_data[i];
            //console.log("examine:",i,item);
            node = findNode(i);
            if (node) {
                if (item.depsAvail) {
                    //console.log("deps avail on existing node:",node.links);
                    // See if deps have changed
                    l1 = {};
                    for (j in node.links) {
                        l = node.links[j];
                        if (l.source.id == i) l1[l.target.id] = l.ty;
                    }
                    //console.log("l1:",l1);

                    same = true;
                    dep_cnt = 0;
                    for (j in item.dep) {
                        l = item.dep[j];
                        //console.log("chk dep",l);
                        if (l.dir == "DEP_OUT") {
                            if (l1[l.id] != model.DepTypeFromString[l.type]) {
                                //console.log("type mismatch",l.id,l1[l.id],l.type);
                                same = false;
                                break;
                            }
                            dep_cnt++;
                        }
                    }

                    if (same && Object.keys(l1).length != dep_cnt) {
                        //console.log("len mismatch", Object.keys( l1 ).length, dep_cnt);
                        same = false;
                    }

                    if (!same) {
                        // Reload graph
                        //console.log("must reload graph (diff deps)");
                        inst.load(focus_node_id, sel_node_id);
                        return;
                    }
                }

                render = true;
                node.locked = item.locked;
                node.notes = item.notes;
                node.size = item.size;
                //console.log("updating:", node);
                makeLabel(node, item);
                if (node == sel_node) panel_info.showSelectedInfo(sel_node_id);
            } else if (item.depsAvail) {
                // See if this node might need to be added to graph
                for (j in item.dep) {
                    l = item.dep[j];
                    if (l.dir == "DEP_OUT" && findNode(l.id)) {
                        //console.log("must reload graph (new ext deps)");
                        inst.load(focus_node_id, sel_node_id);
                        return;
                    }
                }
            }
        }

        if (render) {
            renderGraph();
            a_parent.updateBtnState();
        }
    };

    function graphCountConnected(a_node, a_visited, a_from) {
        let count = 0;

        if (a_visited.indexOf(a_node.id) < 0 && !a_node.prune) {
            a_visited.push(a_node.id);
            count++;
            let link, dest;
            for (let i in a_node.links) {
                link = a_node.links[i];
                if (link != a_from) {
                    dest = link.source == a_node ? link.target : link.source;
                    count += graphCountConnected(dest, a_visited, link);
                }
            }
        }

        return count;
    }

    function graphPrune() {
        let i, j, item;

        for (i = link_data.length - 1; i >= 0; i--) {
            item = link_data[i];
            if (item.prune) {
                //console.log("pruning link:",item);
                if (!item.source.prune) {
                    item.source.comp = false;
                    j = item.source.links.indexOf(item);
                    if (j != -1) {
                        item.source.links.splice(j, 1);
                    } else {
                        console.log("BAD INDEX IN SOURCE LINKS!");
                    }
                }
                if (!item.target.prune) {
                    item.target.comp = false;
                    j = item.target.links.indexOf(item);
                    if (j != -1) {
                        item.target.links.splice(j, 1);
                    } else {
                        console.log("BAD INDEX IN TARGET LINKS!");
                    }
                }
                link_data.splice(i, 1);
            }
        }

        for (i = node_data.length - 1; i >= 0; i--) {
            item = node_data[i];
            if (item.prune) {
                //console.log("pruning node:",item);
                node_data.splice(i, 1);
            }
        }
    }

    function graphPruneReset() {
        let i;
        for (i in node_data) {
            node_data[i].prune = false;
        }
        for (i in link_data) {
            link_data[i].prune = false;
        }
    }

    function simTick() {
        //console.log("tick");
        
        // Update node positions
        nodes.attr("transform", function (d) {
            return "translate(" + d.x + "," + d.y + ")";
        });
        
        // Update label positions with offsets if they exist
        nodes.selectAll("text.label")
            .attr("x", function(d) {
                // Base position (from original code)
                let baseX = d.locked ? r + 12 : r;
                
                // Apply offset if it exists
                if (d.labelOffsetX !== undefined) {
                    return baseX + d.labelOffsetX;
                }
                return baseX;
            })
            .attr("y", function(d) {
                // Base position (from original code)
                let baseY = -r;
                
                // Apply offset if it exists
                if (d.labelOffsetY !== undefined) {
                    return baseY + d.labelOffsetY;
                }
                return baseY;
            })
            // Apply custom label styles
            .style("font-size", function(d) {
                return (d.labelSize || DEFAULT_LABEL_SIZE) + "px";
            })
            .style("fill", function(d) {
                return d.labelColor || DEFAULT_LABEL_COLOR;
            });
            
        // Update node styles and anchored status
        nodes.selectAll("circle.obj")
            .attr("r", function(d) {
                return d.nodeSize || r;
            })
            .style("fill", function(d) {
                return d.nodeColor || null; // Use CSS default if not specified
            })
            .classed("anchored", function(d) {
                return d.anchored === true;
            });
            
        // Update selection highlight circles to match node size
        nodes.selectAll("circle.select")
            .attr("r", function(d) {
                return (d.nodeSize || r) * 1.5;
            });

        // Add visual indicator for anchored nodes
        nodes.selectAll("circle.obj").each(function(d) {
            // Remove any existing anchor indicator
            d3.select(this.parentNode).selectAll(".anchor-indicator").remove();
            
            // Add anchor indicator for anchored nodes
            if (d.anchored) {
                d3.select(this.parentNode)
                    .append("circle")
                    .attr("class", "anchor-indicator")
                    .attr("r", 3)
                    .attr("cx", 0)
                    .attr("cy", 0);
            }
        });

        links
            .attr("x1", function (d) {
                return d.source.x;
            })
            .attr("y1", function (d) {
                return d.source.y;
            })
            .attr("x2", function (d) {
                return d.target.x;
            })
            .attr("y2", function (d) {
                return d.target.y;
            });
    }

    // Graph Init
    let zoom = d3.zoom();

    // TODO Select in our frame only
    svg = d3
        .select(a_id)
        .call(
            zoom.on("zoom", function () {
                svg.attr("transform", d3.event.transform);
            }),
        )
        .append("g");
        
    // Add tooltip to explain interaction controls
    d3.select(a_id)
        .append("div")
        .attr("class", "graph-tooltip")
        .html("<strong>Graph Controls:</strong><br>" +
              "• Drag: Move node<br>" +
              "• Shift+Drag: Anchor node<br>" +
              "• Alt+Drag: Move label<br>" +
              "• Right-click: Customize node/label<br>" +
              "• Double-click: Toggle anchor");

    defineArrowMarkerDeriv(svg);
    defineArrowMarkerComp(svg);
    defineArrowMarkerNewVer(svg);

    links_grp = svg.append("g").attr("class", "links");

    nodes_grp = svg.append("g").attr("class", "nodes");

    model.registerUpdateListener(this.updateData);

    return this;
}

// Depth-first-search to required nodes, mark for pruning
function graphPruneCalc(a_node, a_visited, a_source) {
    if (a_visited.indexOf(a_node.id) < 0) {
        a_visited.push(a_node.id);

        if (a_node.row !== undefined) {
            return false;
        }

        let i,
            prune,
            dest,
            link,
            keep = false;

        for (i in a_node.links) {
            link = a_node.links[i];
            dest = link.source !== a_node ? link.source : link.target;
            if (dest !== a_source) {
                prune = graphPruneCalc(dest, a_visited, a_node);
                keep |= !prune;
            }
        }

        if (!keep) {
            a_node.prune = true;
            for (i in a_node.links) a_node.links[i].prune = true;
        }
    }

    return a_node.prune;
}
