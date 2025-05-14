import * as util from "../../util.js";
import * as model from "../../model.js";
import * as api from "../../api.js";
import * as panel_info from "../../panel_item_info.js";
import {
    defineArrowMarkerComp,
    defineArrowMarkerDeriv,
    defineArrowMarkerNewVer,
} from "./assets/arrow-markers.js";
import { DEFAULTS, GraphState } from "./state.js";
import {
    createCustomizationModal,
    showCustomizationModal as showModal,
} from "./customization_modal.js";
import {
    graphPruneCalc,
    makeLabel,
    createNode,
    graphPrune,
    graphPruneReset,
    graphCountConnected,
} from "./utils.js";

// Dynamically load the graph styles CSS
(function loadGraphStyles() {
    if (!document.getElementById("graph-styles-css")) {
        const link = document.createElement("link");
        link.id = "graph-styles-css";
        link.rel = "stylesheet";
        link.type = "text/css";
        link.href = "./graph_styles.css";
        document.head.appendChild(link);
    }
    // Add custom styles for the customization modal and anchored nodes
    if (!document.getElementById("customization-modal-css")) {
        const link = document.createElement("link");
        link.id = "customization-modal-css";
        link.rel = "stylesheet";
        link.type = "text/css";
        link.href = "./customization_modal.css";
        document.head.appendChild(link);
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

        // Node color input
        const nodeColorInput = document.getElementById("node-color-input");
        nodeColorInput.addEventListener("input", function () {
            if (currentCustomizationNode) {
                currentCustomizationNode.nodeColor = this.value;
                renderGraph();
            }
        });

        // Label size slider
        const labelSizeSlider = document.getElementById("label-size-slider");
        const labelSizeValue = labelSizeSlider.nextElementSibling;

        labelSizeSlider.addEventListener("input", function () {
            labelSizeValue.textContent = this.value;
            if (currentCustomizationNode) {
                currentCustomizationNode.labelSize = parseInt(this.value);
                renderGraph();
            }
        });

        // Label color input
        const labelColorInput = document.getElementById("label-color-input");
        labelColorInput.addEventListener("input", function () {
            if (currentCustomizationNode) {
                currentCustomizationNode.labelColor = this.value;
                renderGraph();
            }
        });

        // Anchor checkbox
        const anchorCheckbox = document.getElementById("anchor-checkbox");
        anchorCheckbox.addEventListener("change", function () {
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
        const closeButton = document.getElementById("close-customization");
        closeButton.addEventListener("click", function () {
            modal.style.display = "none";
        });

        // Apply button
        const applyButton = document.getElementById("apply-customization");
        applyButton.addEventListener("click", function () {
            modal.style.display = "none";
            // Save state automatically when applying changes
            inst.saveGraphState();
        });

        // Close modal when clicking outside
        document.addEventListener("click", function (e) {
            if (
                modal.style.display === "block" &&
                !modal.contains(e.target) &&
                !e.target.closest(".node")
            ) {
                modal.style.display = "none";
            }
        });
    }

    this.checkGraphUpdate = function (a_data, a_source) {
        console.log("graph check updates", a_data, a_source);
        console.log("sel node", sel_node);
        // source is sel_node_id, so check sel_node
        if (a_data.size !== sel_node.size) {
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
    this.saveGraphState = function () {
        if (graphStateManager.saveState(node_data)) {
            alert("Graph state saved successfully");
            return true;
        } else {
            alert("Failed to save graph state");
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
                    tipElement.style.display = "block";
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
            closeButton.style.position = "absolute";
            closeButton.style.top = "5px";
            closeButton.style.right = "10px";
            closeButton.style.cursor = "pointer";
            closeButton.style.pointerEvents = "all";
            closeButton.style.fontSize = "20px";
            closeButton.addEventListener("click", function () {
                const tipElement = document.getElementById(helpTipId);
                if (tipElement) {
                    tipElement.style.display = "none";
                }
            });
            helpTip.appendChild(closeButton);

            const helpText = document.createElement("div");
            helpText.innerHTML =
                "<strong>Graph Controls:</strong><br>" +
                "• Drag nodes to move them<br>" +
                "• Shift+Drag to anchor nodes<br>" +
                "• Alt+Drag to move label<br>" +
                "• Right-click for customization options<br>" +
                "• Double-click to toggle anchor";
            helpTip.appendChild(helpText);
            helpTip.style.display = "block"; // Initially visible
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
                if (d.comp) inst.collapseNode();
                else inst.expandNode();
                d3.event.stopPropagation();
            })
            .on("click", function (d, i) {
                selNode(d, this.parentNode);

                if (d3.event.ctrlKey) {
                    if (d.comp) inst.collapseNode();
                    else inst.expandNode();
                }

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
            // TODO - remove this
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
            if (node_data[i].id === a_id) return node_data[i];
        }
    }

    function findLink(a_id) {
        for (let i in link_data) {
            if (link_data[i].id === a_id) return link_data[i];
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
        if (sel_node) {
            let i,
                link,
                dest,
                loc_trim = [];

            sel_node.comp = false;

            for (i = sel_node.links.length - 1; i >= 0; i--) {
                link = sel_node.links[i];
                dest = link.source !== sel_node ? link.source : link.target;
                graphPruneCalc(dest, [sel_node.id], sel_node);

                if (!dest.prune && dest.row === undefined) {
                    graphPruneReset(link_data, node_data);
                    link.prune += 1;
                    //graphPrune();
                }

                if (dest.prune) {
                    //console.log("PRUNE ALL");
                    graphPrune(node_data, link_data, dest);
                } else if (dest.row === undefined) {
                    graphPruneReset(link_data, node_data);
                    loc_trim.push(link);
                    //link.prune = true;
                    //graphPrune();
                } else {
                    //console.log("PRUNE NONE");
                    graphPruneReset(link_data, node_data);
                }
            }

            if (loc_trim.length < sel_node.links.length) {
                for (i in loc_trim) {
                    loc_trim[i].prune = true;
                }
                graphPrune(link_data, node_data);
            }
            renderGraph();
        }
    };

    this.hideNode = function () {
        if (sel_node && sel_node.id !== focus_node_id && node_data.length > 1) {
            sel_node.prune = true;
            // Check for disconnection of the graph
            console.log("hide", sel_node.id);
            let start =
                sel_node.links[0].source === sel_node
                    ? sel_node.links[0].target
                    : sel_node.links[0].source;
            console.log("start", start);
            if (graphCountConnected(start, []) === node_data.length - 1) {
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
    // TODO add deselect selected node highlight on double-click

    defineArrowMarkerDeriv(svg);
    defineArrowMarkerComp(svg);
    defineArrowMarkerNewVer(svg);

    links_grp = svg.append("g").attr("class", "links");

    nodes_grp = svg.append("g").attr("class", "nodes");

    model.registerUpdateListener(this.updateData);

    return this;
}
