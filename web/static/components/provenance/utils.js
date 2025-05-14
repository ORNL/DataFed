import * as util from "../../util.js";
import { DEFAULTS } from "./state.js";

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

function makeLabel(node, item) {
    if (item.alias) {
        node.label = item.alias;
    } else node.label = item.id;

    node.label += util.generateNoteSpan(item, true);
}

function graphCountConnected(a_node, a_visited, a_from) {
    let count = 0;

    if (a_visited.indexOf(a_node.id) < 0 && !a_node.prune) {
        a_visited.push(a_node.id);
        count++;
        let link, dest;
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

function graphPruneReset(node_data) {
    let i;
    for (i in node_data) {
        node_data[i].prune = false;
    }
    for (i in link_data) {
        link_data[i].prune = false;
    }
}

export {
    createNode,
    makeLabel,
    graphPruneCalc,
    graphPrune,
    graphPruneReset,
    graphCountConnected
}