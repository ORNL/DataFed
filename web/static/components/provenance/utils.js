import * as util from "../../util.js";
import { DEFAULTS } from "./state.js";

/**
 * @typedef {object} NodeLink
 * @property {string} id - Unique identifier for the link
 * @property {Node|string} source - Source node or node ID
 * @property {Node|string} target - Target node or node ID
 * @property {number} ty - Type of dependency relationship (0=derivation, 1=component, 2=new-version)
 * @property {boolean} [prune] - Flag indicating if this link should be pruned (removed)
 */

/**
 * @typedef {object} DataItem
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
 * @typedef {object} Node
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
 * Counts the number of connected nodes in the graph that can be reached from a starting node
 *
 * Critical for the "hide" operation to ensure removing a node won't disconnect the graph.
 * Used to verify that all nodes (except the one being hidden) remain connected
 * after removing a particular node.
 *
 * @param {Node} a_node - The starting node to begin the traversal from
 * @param {Array<string>} a_visited - Array of already visited node IDs (to exclude from count)
 * @param {NodeLink} [a_from] - The link that led to this node (to avoid backtracking)
 * @returns {number} - Count of connected nodes reachable from the starting node
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
 * This function is used as part of the "collapse" functionality in the graph,
 * which removes less important nodes while maintaining key relationships.
 *
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
 * Detaches a link from a given node.
 * This involves marking the node as not a composition ('comp = false')
 * and removing the link from the node's 'links' array.
 *
 * @param {object} node - The node object (e.g., link.source or link.target)
 * from which the link will be detached. Expected to have 'prune', 'comp',
 * and 'links' properties.
 * @param {object} linkToDetach - The link object to detach from the node.
 * @param {string} nodeName - A string identifier for the node (e.g., "source" or "target")
 * used for logging purposes.
 */
function detachLinkFromNode(node, linkToDetach, nodeName) {
    // Check if the node exists and is not marked for pruning
    if (node && !node.prune) {
        node.comp = false; // Mark node as not a composition (part of detachment logic)

        // Find the index of the link in the node's links array
        const linkIndex = node.links.indexOf(linkToDetach);

        if (linkIndex !== -1) {
            // If found, remove the link from the array
            node.links.splice(linkIndex, 1);
        } else {
            // If not found, log an error message
            console.log(
                `BAD INDEX IN ${nodeName.toUpperCase()} LINKS! Link not found when trying to detach.`,
            );
        }
    }
}

/**
 * Removes links and nodes that are marked for pruning using a more functional approach
 *
 * This function is used for both the "collapse" and "hide" functionality:
 * - Collapse: Removes less important nodes while maintaining the overall graph structure
 * - Hide: Removes leaf nodes that the user wants to hide from the visualization
 *
 * @param {Array<NodeLink>} link_data - Array of link objects
 * @param {Array<Node>} node_data - Array of node objects
 * @returns {void} - Modifies the arrays in place
 */
function graphPrune(link_data, node_data) {
    // First, process any link cleanup for nodes that will remain
    // This needs to be done before filtering to maintain references
    const prunedLinks = link_data.filter((item) => item.prune);

    // For each pruned link, update the references in its connected nodes
    // (but only for nodes that aren't being pruned themselves)
    prunedLinks.forEach((link) => {
        // Handle source node if it exists and won't be pruned
        detachLinkFromNode(link.source, link, "source");
        // Handle target node if it exists and won't be pruned
        detachLinkFromNode(link.target, link, "target");
    });

    // Filter out pruned links + nodes from the main array
    const filteredLinks = link_data.filter((item) => !item.prune);
    const filteredNodes = node_data.filter((item) => !item.prune);
    // Clear the array
    node_data.length = 0;
    link_data.length = 0;
    // Refill with filtered items
    link_data.push(...filteredLinks);
    node_data.push(...filteredNodes);
}

/**
 * Resets all prune flags in the graph
 * Used during graph manipulation to clear previous pruning states
 * before calculating new ones during collapse and hide operations
 *
 * @param {Array<NodeLink>} link_data - Array of link objects
 * @param {Array<Node>} node_data - Array of node objects
 */
function graphPruneReset(link_data, node_data) {
    node_data.forEach((node) => {
        node.prune = false;
    });
    link_data.forEach((link) => {
        link.prune = false;
    });
}

/**
 * Checks if a node is a leaf node (has only one connection)
 * Used as an initial quick check for the hide functionality - only leaf nodes can be hidden
 * to preserve the graph's connectivity and structure
 *
 * Note: This is a necessary but not sufficient condition for safe removal.
 * After confirming a node is a leaf, we still need to use graphCountConnected
 * to verify that removing it won't disconnect the graph.
 *
 * @param {Node} node - The node to check
 * @returns {boolean} - True if this is a leaf node, false otherwise
 */
function isLeafNode(node) {
    // A leaf node only has one connection to the rest of the graph
    return node.links.length === 1;
}

export {
    createNode,
    makeLabel,
    graphPruneCalc,
    graphPrune,
    graphPruneReset,
    graphCountConnected,
    isLeafNode,
};
