import * as util from "../../util.js";
import { DEFAULTS } from "./state.js";

/**
 * @typedef {Object} NodeLink
 * @property {string} id - Unique identifier for the link
 * @property {Node|string} source - Source node or node ID
 * @property {Node|string} target - Target node or node ID
 * @property {number} ty - Type of dependency relationship (0=derivation, 1=component, 2=new-version)
 * @property {boolean} [prune] - Flag indicating if this link should be pruned (removed)
 */

/**
 * @typedef {Object} DataItem
 * @property {string} id - Unique identifier for the data item
 * @property {string} [doi] - Digital Object Identifier, if available
 * @property {number} [size] - Size of the data item
 * @property {string} [notes] - Notes or annotations attached to the item
 * @property {boolean} [inhErr] - Flag indicating if the item has inherited errors
 * @property {boolean} [locked] - Flag indicating if the item is locked
 * @property {string} [alias] - Display name/alias for the item
 * @property {number} [gen] - Generation number (for hierarchical layout)
 * @property {Array<Object>} [dep] - Dependencies for the item
 * @property {Array<Object>} [deps] - Extended dependency information for the item
 */

/**
 * @typedef {Object} Node
 * @property {string} id - Unique identifier for the node
 * @property {string} [doi] - Digital Object Identifier, if available
 * @property {number} [size] - Size of data associated with this node
 * @property {string} [notes] - Notes or annotations attached to the node
 * @property {boolean} [inhErr] - Flag indicating if the node has inherited errors
 * @property {boolean} [locked] - Flag indicating if the node is locked
 * @property {Array<NodeLink>} links - Links connected to this node
 * @property {string} label - Display label for the node
 * @property {number} [row] - Row position in hierarchical layout
 * @property {number} [col] - Column position in hierarchical layout
 * @property {boolean} [comp] - Flag indicating if this is a composite node
 * @property {boolean} [prune] - Flag indicating if this node should be pruned (removed)
 * 
 * // Position and physics properties
 * @property {number} x - X-coordinate position
 * @property {number} y - Y-coordinate position
 * @property {number} [fx] - Fixed X-coordinate (when node is anchored)
 * @property {number} [fy] - Fixed Y-coordinate (when node is anchored)
 * @property {boolean} [anchored] - Flag indicating if the node position is fixed/anchored
 * 
 * // Visual customization properties
 * @property {number} [nodeSize] - Custom size of the node
 * @property {string} [nodeColor] - Custom color of the node
 * @property {number} [labelSize] - Custom size of the node label
 * @property {string} [labelColor] - Custom color of the node label
 * @property {number} [labelOffsetX] - X-offset for the label position
 * @property {number} [labelOffsetY] - Y-offset for the label position
 * 
 * // Interaction state
 * @property {boolean} [draggingLabel] - Flag indicating if the label is being dragged
 * @property {number} [labelDragStartX] - Starting X position for label dragging
 * @property {number} [labelDragStartY] - Starting Y position for label dragging
 */

/**
 * Factory function to create a new node from a data item
 * @param {DataItem} item - The data item to create a node from
 * @returns {Node} - A new node object with properties from the item
 */
function createNode(item) {
    const node = {
        id: item.id,
        doi: item.doi,
        size: item.size,
        notes: item.notes,
        inhErr: item.inhErr,
        locked: item.locked,
        links: [],
        nodeSize: DEFAULTS.NODE_SIZE,
        labelSize: DEFAULTS.LABEL_SIZE,
    };

    makeLabel(node, item);

    if (item.gen !== undefined) {
        node.row = item.gen;
        node.col = 0;
    }

    return node;
}

/**
 * Creates a label for a node based on its properties
 * @param {Node} node - The node object to create a label for
 * @param {DataItem} item - The data item containing information for the label
 */
function makeLabel(node, item) {
    if (item.alias) {
        node.label = item.alias;
    } else node.label = item.id;

    node.label += util.generateNoteSpan(item, true);
}

/**
 * Counts the number of connected nodes in the graph
 * @param {Node} a_node - The starting node
 * @param {Array<string>} a_visited - Array of already visited node IDs
 * @param {NodeLink} [a_from] - The link that led to this node (to avoid backtracking)
 * @returns {number} - Count of connected nodes
 */
function graphCountConnected(a_node, a_visited, a_from) {
    let count = 0;

    // Only count unvisited, non-pruned nodes
    if (a_visited.indexOf(a_node.id) < 0 && !a_node.prune) {
        a_visited.push(a_node.id);
        count++;
        let link, dest;
        
        // Recursively count connected nodes
        for (let i in a_node.links) {
            link = a_node.links[i];
            if (link !== a_from) {
                dest = link.source === a_node ? link.target : link.source;
                count += graphCountConnected(dest, a_visited, link);
            }
        }
    }

    return count;
}

/**
 * Calculates which nodes should be pruned using depth-first search
 * @param {Node} a_node - The node to evaluate for pruning
 * @param {Array<string>} a_visited - Array of already visited node IDs
 * @param {Node} a_source - The source node that led to this node
 * @returns {boolean} - Whether the node should be pruned
 */
function graphPruneCalc(a_node, a_visited, a_source) {
    if (a_visited.indexOf(a_node.id) < 0) {
        a_visited.push(a_node.id);

        // Don't prune root nodes (those with row defined)
        if (a_node.row !== undefined) {
            return false;
        }

        let i,
            prune,
            dest,
            link,
            keep = false;

        // Check all connected nodes
        for (i in a_node.links) {
            link = a_node.links[i];
            dest = link.source !== a_node ? link.source : link.target;
            if (dest !== a_source) {
                prune = graphPruneCalc(dest, a_visited, a_node);
                // If any connected node should be kept, this node should be kept too
                keep |= !prune;
            }
        }

        // If nothing connected to this node should be kept, mark for pruning
        if (!keep) {
            a_node.prune = true;
            for (i in a_node.links) a_node.links[i].prune = true;
        }
    }

    return a_node.prune;
}

/**
 * Removes links and nodes that are marked for pruning
 * @param {Array<NodeLink>} link_data - Array of link objects
 * @param {Array<Node>} node_data - Array of node objects
 */
function graphPrune(link_data, node_data) {
    let i, j, item;

    // Prune links
    // Iterate backwards to safely remove items from the array
    for (i = link_data.length - 1; i >= 0; i--) {
        item = link_data[i];
        if (item.prune) {
            //console.log("pruning link:",item);
            // If the source node of the link exists and is not marked for pruning,
            // update its 'comp' status and remove this link from its 'links' array.
            if (item.source && !item.source.prune) {
                item.source.comp = false; // Mark source node as not a composition
                j = item.source.links.indexOf(item);
                if (j !== -1) {
                    item.source.links.splice(j, 1);
                } else {
                    console.log("BAD INDEX IN SOURCE LINKS!");
                }
            }
            // If the target node of the link exists and is not marked for pruning,
            // update its 'comp' status and remove this link from its 'links' array.
            if (item.target && !item.target.prune) {
                item.target.comp = false; // Mark target node as not a composition
                j = item.target.links.indexOf(item);
                if (j !== -1) {
                    item.target.links.splice(j, 1);
                } else {
                    console.log("BAD INDEX IN TARGET LINKS!");
                }
            }
            // Remove the link from the global link_data array.
            link_data.splice(i, 1);
        }
    }

    // Prune nodes
    // Iterate backwards to safely remove items from the array
    for (i = node_data.length - 1; i >= 0; i--) {
        item = node_data[i];
        if (item.prune) {
            //console.log("pruning node:",item);
            // Remove the node from the global node_data array.
            node_data.splice(i, 1);
        }
    }
}

/**
 * Resets all prune flags in the graph
 * @param {Array<NodeLink>} link_data - Array of link objects
 * @param {Array<Node>} node_data - Array of node objects
 */
function graphPruneReset(link_data, node_data) {
    let i;
    for (i in node_data) {
        node_data[i].prune = false;
    }
    for (i in link_data) {
        link_data[i].prune = false;
    }
}

/**
 * Checks if a node is a leaf node (has only one connection)
 * @param {Node} node - The node to check
 * @returns {boolean} - True if this is a leaf node, false otherwise
 */
function isLeafNode(node) {
    // A leaf node only has one connection to the rest of the graph
    return node.links.length === 1;
}

export { createNode, makeLabel, graphPruneCalc, graphPrune, graphPruneReset, graphCountConnected, isLeafNode };
