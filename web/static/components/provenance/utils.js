// Depth-first-search to required nodes, mark for pruning
export function graphPruneCalc(a_node, a_visited, a_source) {
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
