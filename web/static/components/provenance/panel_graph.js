import * as util from "../../util.js";
import * as model from "../../model.js";
import * as api from "../../api.js";
import * as panel_info from "../../panel_item_info.js";
import {
    defineArrowMarkerComp,
    defineArrowMarkerDeriv,
    defineArrowMarkerNewVer,
} from "./assets/arrow-markers.js";
import { DEFAULTS, GraphState, ThemeObserver } from "./state.js";
import {
    createCustomizationModal,
    showCustomizationModal as showModal,
} from "./customization_modal.js";
import {
    createNode,
    graphCountConnected,
    graphPrune,
    graphPruneCalc,
    graphPruneReset,
    isLeafNode,
    makeLabel,
} from "./utils.js";

// Dynamically load the styles CSS
(function loadStyles() {
    if (!document.getElementById("graph-styles-css")) {
        const link = document.createElement("link");
        link.id = "graph-styles-css";
        link.rel = "stylesheet";
        link.type = "text/css";
        link.href = "./styles/graph_styles.css";
        document.head.appendChild(link);
    }
    // Add custom styles for the customization modal
    if (!document.getElementById("customization-modal-css")) {
        const link = document.createElement("link");
        link.id = "customization-modal-css";
        link.rel = "stylesheet";
        link.type = "text/css";
        link.href = "./styles/customization_modal.css";
        document.head.appendChild(link);
    }

    // Apply initial theme class from settings if available
    if (window.settings && window.settings.theme) {
        document.body.classList.add("theme-" + window.settings.theme);
    }
})();

export function newGraphPanel(a_id, a_frame, a_parent) {
    return new GraphPanel(a_id, a_frame, a_parent);
}

function GraphPanel(a_id, a_frame, a_parent) {
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
        r = DEFAULTS.NODE_SIZE;

    // Customization modal for node/label editing
    let customizationModal = null;
    let currentCustomizationNode = null;

    // State management using observer pattern
    let graphStateManager = new GraphState();

    // Register theme observer to manage theme changes
    const themeObserver = new ThemeObserver();
    graphStateManager.addObserver(themeObserver);

    // Set initial theme from settings if available
    if (window.settings && window.settings.theme) {
        graphStateManager.setTheme(window.settings.theme);

        // Hook into the global theme setting to keep in sync
        if (typeof window.settings.setTheme === "function") {
            const originalSetTheme = window.settings.setTheme;
            window.settings.setTheme = function (theme) {
                // Call original function
                originalSetTheme(theme);
                // Update our graph state
                graphStateManager.setTheme(theme);
            };
        }
    }

    this.load = function (a_id, a_sel_node_id) {
        focus_node_id = a_id;
        sel_node_id = a_sel_node_id ? a_sel_node_id : a_id;
        sel_node = null;

        api.dataGetDepGraph(a_id, function (a_data) {
            link_data = [];
            let new_node_data = [];
            let id_map = {};

            // Create nodes using factory pattern
            let id;
            for (let i in a_data.item) {
                const item = a_data.item[i];
                const node = createNode(item);

                if (item.id === a_id) {
                    node.comp = true;
                }

                if (item.id === sel_node_id) {
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
                if (id_map[node.id] !== undefined) {
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
            // Initialize graph controls
            inst.addGraphControls();
            panel_info.showSelectedInfo(sel_node_id, inst.checkGraphUpdate);
            a_parent.updateBtnState();
        });
    };

    // Set up event handlers for the customization modal
    function setupCustomizationModalEvents() {
        const modal = document.getElementById("customization-modal");
        if (!modal) return;

        // Store original and temporary changes
        let originalValues = {};
        let tempChanges = {};

        // Function to save original values when the modal opens
        window.saveOriginalValues = function (node) {
            if (!node) return;

            // Save all original values that can be modified
            originalValues = {
                nodeColor: node.nodeColor,
                labelSize: node.labelSize,
                labelColor: node.labelColor,
                anchored: node.anchored,
                fx: node.fx,
                fy: node.fy,
            };
        };

        // Function to restore original values when cancelling
        function restoreOriginalValues() {
            if (!currentCustomizationNode) return;

            // Restore all original values
            if (originalValues.nodeColor !== undefined) {
                currentCustomizationNode.nodeColor = originalValues.nodeColor;
            } else {
                delete currentCustomizationNode.nodeColor;
            }

            if (originalValues.labelSize !== undefined) {
                currentCustomizationNode.labelSize = originalValues.labelSize;
            } else {
                delete currentCustomizationNode.labelSize;
            }

            if (originalValues.labelColor !== undefined) {
                currentCustomizationNode.labelColor = originalValues.labelColor;
            } else {
                delete currentCustomizationNode.labelColor;
            }

            // Render to show original values
            renderGraph();
        }

        // Node color input
        const nodeColorInput = document.getElementById("node-color-input");
        nodeColorInput.addEventListener("input", function () {
            if (currentCustomizationNode) {
                // Store in temp changes and apply for preview only
                tempChanges.nodeColor = this.value;
                currentCustomizationNode.nodeColor = this.value;
                renderGraph();
            }
        });

        // Label size slider
        const labelSizeSlider = document.getElementById("label-size-slider");
        const labelSizeValue = labelSizeSlider.nextElementSibling;

        labelSizeSlider.addEventListener("input", function () {
            labelSizeValue.textContent = `${this.value}px`;
            if (currentCustomizationNode) {
                // Store in temp changes and apply for preview only
                tempChanges.labelSize = parseInt(this.value);
                currentCustomizationNode.labelSize = parseInt(this.value);
                renderGraph();
            }
        });

        // Label color input
        const labelColorInput = document.getElementById("label-color-input");
        labelColorInput.addEventListener("input", function () {
            if (currentCustomizationNode) {
                // Store in temp changes and apply for preview only
                tempChanges.labelColor = this.value;
                currentCustomizationNode.labelColor = this.value;
                renderGraph();
            }
        });

        // Anchor checkbox - store change but don't apply until "Apply" button is clicked
        const anchorCheckbox = document.getElementById("anchor-checkbox");
        anchorCheckbox.addEventListener("change", function () {
            if (currentCustomizationNode) {
                // Store the anchoring state in temporary changes
                tempChanges.anchorChecked = this.checked;
                tempChanges.nodeX = currentCustomizationNode.x;
                tempChanges.nodeY = currentCustomizationNode.y;

                // Just preview the change without actually fixing the position
                const previewClass = document.querySelector(".anchor-preview");
                if (previewClass) {
                    previewClass.style.display = this.checked ? "block" : "none";
                }
            }
        });

        // Close button - discard changes
        const closeButton = document.getElementById("close-customization");
        closeButton.addEventListener("click", function () {
            // Revert any preview changes back to original values
            restoreOriginalValues();

            // Hide anchor preview if showing
            const previewClass = document.querySelector(".anchor-preview");
            if (previewClass) {
                previewClass.style.display = "none";
            }

            // Clear temporary changes
            tempChanges = {};
            modal.style.display = "none";
            currentCustomizationNode = null;
        });

        // Apply button - commit all changes
        const applyButton = document.getElementById("apply-customization");
        applyButton.addEventListener("click", function () {
            if (!currentCustomizationNode) {
                modal.style.display = "none";
                return;
            }

            // Apply all changes permanently

            // Node color change
            if (tempChanges.hasOwnProperty("nodeColor")) {
                currentCustomizationNode.nodeColor = tempChanges.nodeColor;
            }

            // Label size change
            if (tempChanges.hasOwnProperty("labelSize")) {
                currentCustomizationNode.labelSize = tempChanges.labelSize;
            }

            // Label color change
            if (tempChanges.hasOwnProperty("labelColor")) {
                currentCustomizationNode.labelColor = tempChanges.labelColor;
            }

            // Apply the anchoring change if it was made
            if (tempChanges.hasOwnProperty("anchorChecked")) {
                currentCustomizationNode.anchored = tempChanges.anchorChecked;

                if (tempChanges.anchorChecked) {
                    // Fix the node position
                    currentCustomizationNode.fx = tempChanges.nodeX;
                    currentCustomizationNode.fy = tempChanges.nodeY;
                } else {
                    // Release the fixed position
                    delete currentCustomizationNode.fx;
                    delete currentCustomizationNode.fy;
                }
            }

            // Save changes to persistent state if state manager exists
            if (graphStateManager) {
                graphStateManager.saveState(node_data);
            }

            // Update the visualization
            renderGraph();

            // Clear temporary changes
            tempChanges = {};
            modal.style.display = "none";
            currentCustomizationNode = null;
        });

        // Close modal when clicking outside
        document.addEventListener("click", function (e) {
            if (
                modal.style.display === "block" &&
                !modal.contains(e.target) &&
                !e.target.closest(".node")
            ) {
                // Handle the same way as clicking Close button
                closeButton.click();
            }
        });
    }

    this.checkGraphUpdate = function (a_data, a_source) {
        console.log("graph check updates", a_data, a_source);
        console.log("sel node", sel_node);
        if (a_data.size !== sel_node.size) {
            console.log("size diff, update!");
            model.update([a_data]);
        }
    };

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
    this.addGraphControls = function (containerSelector) {
        const controlsId = "graph-controls";
        const helpTipId = "graph-help-tooltip";
        let controlsDiv = document.getElementById(controlsId);
        let helpTip = document.getElementById(helpTipId);

        // Create container for graph controls if it doesn't exist
        if (!controlsDiv) {
            controlsDiv = document.createElement("div");
            controlsDiv.id = controlsId;
            controlsDiv.className = "graph-controls";

            // "Show Help" button
            const showHelpButton = document.createElement("button");
            showHelpButton.textContent = "Show Help";
            showHelpButton.id = "show-graph-help-button";
            showHelpButton.addEventListener("click", function () {
                const tipElement = document.getElementById(helpTipId);
                if (tipElement) {
                    tipElement.classList.add("visible");
                }
            });
            controlsDiv.appendChild(showHelpButton);
        }

        // Create help tooltip if it doesn't exist
        if (!helpTip) {
            helpTip = document.createElement("div");
            helpTip.id = helpTipId;
            helpTip.className = "graph-tooltip";

            const closeButton = document.createElement("span");
            closeButton.innerHTML = "&times;"; // X button
            closeButton.className = "graph-tooltip-close";
            closeButton.addEventListener("click", function () {
                const tipElement = document.getElementById(helpTipId);
                if (tipElement) {
                    tipElement.classList.remove("visible");
                }
            });
            helpTip.appendChild(closeButton);

            const helpText = document.createElement("div");
            helpText.innerHTML =
                "<strong>Graph Controls:</strong><br>" +
                "• Drag nodes to move them<br>" +
                "• Shift+Drag From node to anchor nodes<br>" +
                "• Alt+Drag From node to move label<br>" +
                "• Right-click for customization options<br>" +
                "• Double-click to toggle anchor";
            helpTip.appendChild(helpText);
            helpTip.classList.add("visible"); // Initially visible
        }

        // Add controls and tooltip to the graph container's parent
        let graphContainerParent;
        if (containerSelector) {
            graphContainerParent = document.querySelector(containerSelector);
        } else {
            const selector = a_id.startsWith("#") ? a_id : "#" + a_id;
            const svgElement = document.querySelector(selector);
            if (svgElement && svgElement.parentElement) {
                graphContainerParent = svgElement.parentElement;
            }
        }

        if (graphContainerParent) {
            graphContainerParent.style.position = "relative"; // Important for absolute positioning of tooltip
            if (!document.getElementById(controlsId) && controlsDiv) {
                // Append only if not already there
                graphContainerParent.appendChild(controlsDiv);
            }
            if (!document.getElementById(helpTipId) && helpTip) {
                // Append only if not already there
                graphContainerParent.appendChild(helpTip);
            }
        } else {
            console.error(
                "Graph container parent not found for controls:",
                containerSelector || a_id,
            );
        }
    };

    function selNode(d, parentNode) {
        if (sel_node !== d) {
            d3.select(".highlight").attr("class", "select hidden");
            d3.select(parentNode).select(".select").attr("class", "select highlight");
            sel_node = d;
            sel_node_id = d.id;
            panel_info.showSelectedInfo(d.id, inst.checkGraphUpdate);
            a_parent.updateBtnState();
        }
    }

    /**
     * Renders the graph using D3.js force layout
     *
     * IMPORTANT: D3.js force layout automatically converts link source and target properties.
     * Before rendering: source and target are string IDs
     * After rendering: source and target become references to the actual node objects
     *
     * This transformation happens as part of D3's internal processing and is essential
     * for the force-directed layout to work correctly. However, it means the structure
     * of link objects changes during the application lifecycle.
     */
    function renderGraph() {
        let g;

        links = links_grp.selectAll("line").data(link_data, function (d) {
            return d.id;
        });

        links
            .enter()
            .append("line")
            .attr("marker-start", function (d) {
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

            .attr("class", function (d) {
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

            if (d.id === focus_node_id) res += "main";
            else if (d.row !== undefined) res += "prov";
            else {
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
            if (d.id === sel_node_id) {
                return "select highlight";
            } else return "select hidden";
        });

        g = nodes
            .enter()
            .append("g")
            .attr("class", "node")
            .call(d3.drag().on("start", dragStarted).on("drag", dragged).on("end", dragEnded));

        g.append("circle")
            .attr("r", function (d) {
                return d.nodeSize || r;
            })
            .attr("class", function (d) {
                let res = "obj ";
                //console.log("node enter 1");

                if (d.id === focus_node_id) res += "main";
                else if (d.row !== undefined) res += "prov";
                else {
                    res += "other";
                    //console.log("new other node", d );
                }

                if (d.comp) res += " comp";
                else res += " part";

                return res;
            })
            .style("fill", function (d) {
                return d.nodeColor || null; // Use CSS default if not specified
            })
            .on("mouseover", function (d) {
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
            .on("click", function (d) {
                // Select the node when clicked
                selNode(d, this.parentNode);
                d3.event.stopPropagation();
            })
            .on("contextmenu", function (d, i) {
                // Prevent default context menu
                d3.event.preventDefault();

                // Select the node if not already selected
                selNode(d, this.parentNode);

                // Show customization modal at mouse position
                currentCustomizationNode = showModal(
                    d,
                    d3.event.pageX,
                    d3.event.pageY,
                    currentCustomizationNode,
                    renderGraph,
                );

                d3.event.stopPropagation();
            });

        g.append("circle")
            .attr("r", function (d) {
                // Scale the selection circle based on the node size
                return (d.nodeSize || r) * 1.5;
            })
            .attr("class", function (d) {
                if (d.id === sel_node_id) {
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

        n2.append("line")
            .attr("pointer-events", "none")
            .attr("x1", -r * 0.5)
            .attr("y1", 0)
            .attr("x2", r * 0.5)
            .attr("y2", 0)
            .attr("class", "data");

        n2.append("line")
            .attr("pointer-events", "none")
            .attr("x1", -r * 0.5)
            .attr("y1", r * 0.3)
            .attr("x2", r * 0.5)
            .attr("y2", r * 0.3)
            .attr("class", "data");

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
            .style("font-size", function (d) {
                return (d.labelSize || DEFAULTS.LABEL_SIZE) + "px";
            })
            .style("fill", function (d) {
                return d.labelColor || DEFAULTS.LABEL_COLOR;
            })
            .on("contextmenu", function (d, i) {
                // Prevent default context menu
                d3.event.preventDefault();

                // Select the node if not already selected
                selNode(d, this.parentNode);

                // Show customization modal at mouse position
                currentCustomizationNode = showModal(
                    d,
                    d3.event.pageX,
                    d3.event.pageY,
                    currentCustomizationNode,
                    renderGraph,
                );

                d3.event.stopPropagation();
            })
            // Make labels draggable independently with Alt key
            .call(
                d3
                    .drag()
                    .on("start", function (d) {
                        if (!d3.event.active) simulation.alphaTarget(0.3).restart();
                        d.draggingLabel = true;
                        d.labelDragStartX = d3.event.x;
                        d.labelDragStartY = d3.event.y;
                        d3.event.sourceEvent.stopPropagation();
                    })
                    .on("drag", function (d) {
                        if (!d.labelOffsetX) d.labelOffsetX = 0;
                        if (!d.labelOffsetY) d.labelOffsetY = 0;

                        // Update the label offset based on drag movement
                        d.labelOffsetX += d3.event.x - d.labelDragStartX;
                        d.labelOffsetY += d3.event.y - d.labelDragStartY;

                        // Update the start position for the next drag event
                        d.labelDragStartX = d3.event.x;
                        d.labelDragStartY = d3.event.y;

                        // Update the visualization
                        simTick();
                        d3.event.sourceEvent.stopPropagation();
                    })
                    .on("end", function (d) {
                        if (!d3.event.active) simulation.alphaTarget(0);
                        d.draggingLabel = false;
                        d3.event.sourceEvent.stopPropagation();
                    }),
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
                            return d.row !== undefined ? 75 + d.row * 75 : 0;
                        })
                        .strength(function (d) {
                            return d.row !== undefined ? 0.05 : 0;
                        }),
                )
                .force(
                    "col",
                    d3
                        .forceX(function (d, i) {
                            return d.col !== undefined ? graph_center_x : 0;
                        })
                        .strength(function (d) {
                            return d.col !== undefined ? 0.05 : 0;
                        }),
                )
                .force("link", linkForce)
                .force(
                    "collide",
                    d3.forceCollide().radius(function (d) {
                        // Base radius plus some extra space based on label length
                        return r * 1.5 + (d.label ? d.label.length * 0.8 : 0);
                    }),
                )
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
        if (d.draggingLabel) {
            // Dragging the label independently
            // Update the label offset based on drag movement
            d.labelOffsetX += d3.event.x - d.labelDragStartX;
            d.labelOffsetY += d3.event.y - d.labelDragStartY;

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
            // Prevent the double-click from triggering zoom
            d3.event.sourceEvent.preventDefault();
            d3.event.sourceEvent.stopPropagation();

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

            // We're using double-click for anchoring, so don't also use it for expand/collapse
            return;
        }

        //console.log("at:",d);
        if (d3.event.sourceEvent) d3.event.sourceEvent.stopPropagation();
    }

    /**
     * Finds a node by its ID in the node_data array
     *
     * @param {string} a_id - The ID of the node to find
     * @returns {Object|undefined} - The node object if found, undefined otherwise
     */
    function findNode(a_id) {
        return node_data.find((node) => node.id === a_id);
    }

    /**
     * Finds a link by its ID in the link_data array
     *
     * IMPORTANT: Link objects have a dynamic structure that changes during the D3 force layout process:
     *
     * When initially created:
     * {
     *   id: string,       // Unique identifier for the link (usually "sourceId-targetId")
     *   source: string,    // ID of the source node
     *   target: string,    // ID of the target node
     *   ty: number        // Type of dependency relationship
     * }
     *
     * After D3 force layout processing:
     * {
     *   id: string,       // Unique identifier for the link
     *   source: Object,    // Reference to the source node object
     *   target: Object,    // Reference to the target node object
     *   ty: number        // Type of dependency relationship
     * }
     *
     * This transformation happens automatically when D3.js processes the links for
     * force-directed layout, as noted in the comment above renderGraph().
     *
     * @param {string} a_id - The ID of the link to find
     * @returns {Object|undefined} - The link object if found, undefined otherwise
     */
    function findLink(a_id) {
        return link_data.find((link) => link.id === a_id);
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

                        if (dep.dir === "DEP_IN") id = dep.id + "-" + rec.id;
                        else id = rec.id + "-" + dep.id;

                        link = findLink(id);
                        if (link) continue;

                        link = { id: id, ty: model.DepTypeFromString[dep.type] };
                        if (dep.dir === "DEP_IN") {
                            link.source = dep.id;
                            link.target = rec.id;
                        } else {
                            link.source = rec.id;
                            link.target = dep.id;
                        }

                        sel_node.links.push(link);

                        new_node = findNode(dep.id);
                        if (!new_node) {
                            // Create the new node
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

    /**
     * Collapses the selected node by removing its connected nodes
     * while maintaining the overall graph structure
     *
     * The collapse operation works by:
     * 1. Identifying nodes connected to the selected node
     * 2. Marking nodes for pruning that aren't needed for the graph structure
     * 3. Removing those nodes and their links from the visualization
     * 4. Updating the graph to maintain the core relationships
     */
    this.collapseNode = function () {
        // Only collapse nodes that are marked as composite and selected
        if (sel_node && sel_node.comp) {
            let i,
                link,
                dest,
                loc_trim = [];

            // Mark node as no longer a composite
            sel_node.comp = false;

            // Process each link connected to the selected node
            for (i = sel_node.links.length - 1; i >= 0; i--) {
                link = sel_node.links[i];
                // Get the node at the other end of the link
                dest = link.source !== sel_node ? link.source : link.target;

                // Calculate which nodes should be pruned (removed) based on connectivity
                graphPruneCalc(dest, [sel_node.id], sel_node);

                // If the destination node shouldn't be pruned and isn't a root node
                if (!dest.prune && dest.row === undefined) {
                    // Reset prune flags and mark this link for pruning
                    graphPruneReset(link_data, node_data);
                    link.prune = true;
                    loc_trim.push(link);
                }

                // Handle nodes marked for pruning
                if (dest.prune) {
                    // Remove this node and its links from the visualization
                    graphPrune(link_data, node_data);
                } else if (dest.row === undefined) {
                    // For non-root nodes that aren't being pruned,
                    // reset flags and track the link for potential pruning
                    graphPruneReset(link_data, node_data);
                    loc_trim.push(link);
                } else {
                    // For root nodes, just reset prune flags
                    graphPruneReset(link_data, node_data);
                }
            }

            // If we have links to prune, mark them and remove them
            if (loc_trim.length > 0) {
                for (i in loc_trim) {
                    loc_trim[i].prune = true;
                }
                graphPrune(link_data, node_data);
            }

            // Update the visualization with the changes
            renderGraph();
        }
    };

    /**
     * Hides the selected node by removing it from the visualization
     *
     * The hide operation only works on leaf nodes (nodes with only one connection)
     * to preserve the overall graph structure. Hide differs from collapse in that:
     * - Hide: Completely removes a node (only works on leaf nodes)
     * - Collapse: Simplifies a part of the graph while maintaining relationships
     */
    this.hideNode = function () {
        if (sel_node && sel_node.id !== focus_node_id && node_data.length > 1) {
            if (isLeafNode(sel_node)) {
                // Additional check to verify removing this node won't disconnect the graph
                // Get the node at the other end of the single connection
                const connectedNode =
                    sel_node.links[0].source === sel_node
                        ? sel_node.links[0].target
                        : sel_node.links[0].source;

                // Ensure all other nodes can still be reached after removal
                if (graphCountConnected(connectedNode, [sel_node.id]) === node_data.length - 1) {
                    sel_node.prune = true;

                    for (let i in sel_node.links) {
                        sel_node.links[i].prune = true;
                    }

                    // Must use full link_data array (not just sel_node.links) so that
                    // all connections are properly removed from the visualization
                    graphPrune(link_data, node_data);

                    sel_node = node_data[0];
                    sel_node_id = sel_node.id;
                    renderGraph();
                } else {
                    // We should never really reach here since we can't hide a leaf-node
                    sel_node.prune = false;
                    util.setStatusText("Cannot hide this node as it would disconnect the graph");
                }
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
        let j,
            node,
            item,
            l,
            l1,
            same,
            dep_cnt,
            render = false;

        // Scan updates for dependency changes that impact current graph,
        // if found, reload entire graph from DB
        // If not reloading, scan for changes to title, annotations, status...

        for (let i in a_data) {
            item = a_data[i];
            node = findNode(i);
            if (node) {
                if (item.depsAvail) {
                    // See if deps have changed
                    l1 = {};
                    for (j in node.links) {
                        l = node.links[j];
                        if (l.source.id === i) l1[l.target.id] = l.ty;
                    }

                    same = true;
                    dep_cnt = 0;
                    for (j in item.dep) {
                        l = item.dep[j];
                        if (l.dir === "DEP_OUT") {
                            if (l1[l.id] !== model.DepTypeFromString[l.type]) {
                                same = false;
                                break;
                            }
                            dep_cnt++;
                        }
                    }

                    if (same && Object.keys(l1).length !== dep_cnt) {
                        same = false;
                    }

                    if (!same) {
                        // Reload graph
                        inst.load(focus_node_id, sel_node_id);
                        return;
                    }
                }

                render = true;
                node.locked = item.locked;
                node.notes = item.notes;
                node.size = item.size;
                makeLabel(node, item);
                if (node === sel_node) panel_info.showSelectedInfo(sel_node_id);
            } else if (item.depsAvail) {
                // See if this node might need to be added to graph
                for (j in item.dep) {
                    l = item.dep[j];
                    if (l.dir === "DEP_OUT" && findNode(l.id)) {
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

    function simTick() {
        // Update node positions
        nodes.attr("transform", function (d) {
            return "translate(" + d.x + "," + d.y + ")";
        });

        // Update label positions with offsets if they exist
        nodes
            .selectAll("text.label")
            .attr("x", function (d) {
                // Base position
                let baseX = d.locked ? r + 12 : r;
                // Apply offset if it exists
                return baseX + (d.labelOffsetX || 0);
            })
            .attr("y", function (d) {
                // Apply offset if it exists
                return -r + (d.labelOffsetY || 0);
            })
            // Apply custom label styles
            .style("font-size", function (d) {
                return (d.labelSize || DEFAULTS.LABEL_SIZE) + "px";
            })
            .style("fill", function (d) {
                return d.labelColor || DEFAULTS.LABEL_COLOR;
            });

        // Update node styles and anchored status
        nodes
            .selectAll("circle.obj")
            .attr("r", function (d) {
                return d.nodeSize || r;
            })
            .style("fill", function (d) {
                return d.nodeColor || null; // Use CSS default if not specified
            })
            .classed("anchored", function (d) {
                return d.anchored === true;
            });

        // Update selection highlight circles to match node size
        nodes.selectAll("circle.select").attr("r", function (d) {
            return (d.nodeSize || r) * 1.5;
        });

        // Add a visual indicator for anchored nodes
        nodes.selectAll("circle.obj").each(function (d) {
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
    let zoom = d3
        .zoom()
        .on("zoom", function () {
            svg.attr("transform", d3.event.transform);
        })
        .filter(function () {
            // Disable zoom on double-click to prevent conflicts with node anchoring
            return !d3.event.button && d3.event.detail < 2;
        });

    // TODO Select in our frame only
    svg = d3.select(a_id).call(zoom).append("g");
    // TODO add deselect selected node highlight on double-click

    defineArrowMarkerDeriv(svg);
    defineArrowMarkerComp(svg);
    defineArrowMarkerNewVer(svg);

    links_grp = svg.append("g").attr("class", "links");

    nodes_grp = svg.append("g").attr("class", "nodes");

    model.registerUpdateListener(this.updateData);

    return this;
}
