import { expect } from "chai";
import {
    createNode,
    makeLabel,
    graphPruneCalc,
    graphPrune,
    graphPruneReset,
    graphCountConnected,
} from "../../../static/components/provenance/utils.js";
import { DEFAULTS } from "../../../static/components/provenance/state.js";

describe("utils", function () {
    describe("createNode", function () {
        it("should create a node with correct properties", function () {
            const item = {
                id: "test-id",
                doi: "test-doi",
                size: 100,
                notes: "test notes",
                inhErr: false,
                locked: true,
                alias: "test-alias",
            };

            const node = createNode(item);

            expect(node).to.be.an("object");
            expect(node.id).to.equal(item.id);
            expect(node.doi).to.equal(item.doi);
            expect(node.size).to.equal(item.size);
            expect(node.notes).to.equal(item.notes);
            expect(node.inhErr).to.equal(item.inhErr);
            expect(node.locked).to.equal(item.locked);
            expect(node.links).to.be.an("array").that.is.empty;
            expect(node.nodeSize).to.equal(DEFAULTS.NODE_SIZE);
            expect(node.labelSize).to.equal(DEFAULTS.LABEL_SIZE);
            expect(node.label).to.include(item.alias);
        });

        it("should set row and col when gen is provided", function () {
            const item = {
                id: "test-id",
                gen: 3,
            };

            const node = createNode(item);

            expect(node.row).to.equal(3);
            expect(node.col).to.equal(0);
        });

        it("should use id as label when alias is not provided", function () {
            const item = {
                id: "test-id",
            };

            const node = createNode(item);

            expect(node.label).to.include(item.id);
        });
    });

    describe("makeLabel", function () {
        it("should use alias when available", function () {
            const node = {};
            const item = {
                id: "test-id",
                alias: "test-alias",
            };

            makeLabel(node, item);

            expect(node.label).to.include(item.alias);
        });

        it("should use id when alias is not available", function () {
            const node = {};
            const item = {
                id: "test-id",
            };

            makeLabel(node, item);

            expect(node.label).to.include(item.id);
        });
    });

    describe("graphCountConnected", function () {
        it("should count connected nodes correctly", function () {
            const node1 = { id: "node1", links: [], prune: false };
            const node2 = { id: "node2", links: [], prune: false };
            const node3 = { id: "node3", links: [], prune: false };

            const link1 = { source: node1, target: node2 };
            const link2 = { source: node2, target: node3 };

            node1.links.push(link1);
            node2.links.push(link1, link2);
            node3.links.push(link2);

            const visited = [];
            const count = graphCountConnected(node1, visited, null);

            expect(count).to.equal(3);
            expect(visited).to.include.members(["node1", "node2", "node3"]);
        });

        it("should not count pruned nodes", function () {
            const node1 = { id: "node1", links: [], prune: false };
            const node2 = { id: "node2", links: [], prune: true };

            const link = { source: node1, target: node2 };

            node1.links.push(link);
            node2.links.push(link);

            const visited = [];
            const count = graphCountConnected(node1, visited, null);

            expect(count).to.equal(1);
            expect(visited).to.include("node1");
            expect(visited).not.to.include("node2"); // Still visited, but not counted
        });

        it("should not revisit already visited nodes", function () {
            const node1 = { id: "node1", links: [], prune: false };
            const node2 = { id: "node2", links: [], prune: false };

            const link = { source: node1, target: node2 };

            node1.links.push(link);
            node2.links.push(link);

            const visited = ["node2"]; // Pre-visit node2
            const count = graphCountConnected(node1, visited, null);

            expect(count).to.equal(1); // Only node1 is counted
            expect(visited).to.include.members(["node1", "node2"]);
        });
    });

    describe("graphPruneCalc", function () {
        it("should mark nodes for pruning correctly", function () {
            // Create a graph where some nodes should be pruned
            const rootNode = { id: "root", links: [], row: 0 }; // Has row, should not be pruned
            const node1 = { id: "node1", links: [] }; // No connections to required nodes, should be pruned
            const node2 = { id: "node2", links: [] }; // Connected to root, should not be pruned

            const link1 = { source: rootNode, target: node2 };

            rootNode.links.push(link1);
            node2.links.push(link1);

            const visited = [];

            // Node1 should be marked for pruning
            graphPruneCalc(node1, visited, null);
            expect(node1.prune).to.be.true;

            // Reset visited array
            visited.length = 0;

            // Node2 should not be marked for pruning because it's connected to rootNode
            graphPruneCalc(node2, visited, null);
            expect(node2.prune).to.be.undefined;
        });

        it("should return early if node has row defined", function () {
            const node = { id: "node", links: [], row: 0 };
            const visited = [];

            const result = graphPruneCalc(node, visited, null);

            expect(result).to.be.false;
            expect(node.prune).to.be.undefined;
        });

        it("should not revisit already visited nodes", function () {
            const node = { id: "node", links: [] };
            const visited = ["node"]; // Pre-visit the node

            const result = graphPruneCalc(node, visited, null);

            expect(result).to.be.undefined; // No return value when node is already visited
            expect(node.prune).to.be.undefined; // Node is not modified
        });
    });

    describe("graphPrune", function () {
        it("should remove pruned nodes and links", function () {
            // Create nodes and links with some marked for pruning
            const node1 = { id: "node1", links: [], prune: true };
            const node2 = { id: "node2", links: [], prune: false };
            const node3 = { id: "node3", links: [], prune: true };

            const link1 = { source: node1, target: node2, prune: true };
            const link2 = { source: node2, target: node3, prune: true };

            node1.links.push(link1);
            node2.links.push(link1, link2);
            node3.links.push(link2);

            const nodeData = [node1, node2, node3];
            const linkData = [link1, link2];

            graphPrune(linkData, nodeData);

            // Check that pruned nodes and links are removed
            expect(nodeData).to.have.lengthOf(1);
            expect(nodeData[0].id).to.equal("node2");
            expect(linkData).to.have.lengthOf(0);

            // Check that links are removed from remaining nodes
            expect(node2.links).to.have.lengthOf(0);
            expect(node2.comp).to.be.false;
        });

        it("should handle edge cases with missing source or target", function () {
            const node = { id: "node", links: [], prune: false };
            const link = { source: node, target: null, prune: true };

            node.links.push(link);

            const nodeData = [node];
            const linkData = [link];

            graphPrune(linkData, nodeData);

            expect(nodeData).to.have.lengthOf(1);
            expect(linkData).to.have.lengthOf(0);
            expect(node.links).to.have.lengthOf(0);
        });

        it("should correctly prune a link with a missing target and update the source node's comp status", function () {
            const nodeS = { id: "nodeS", links: [], prune: false, comp: true };
            const link = { source: nodeS, target: null, prune: true };
            nodeS.links.push(link);

            const nodeData = [nodeS];
            const linkData = [link];

            graphPrune(linkData, nodeData);

            expect(nodeData).to.have.lengthOf(1);
            expect(nodeData[0]).to.equal(nodeS);
            expect(linkData).to.be.empty;
            expect(nodeS.links).to.be.empty;
            expect(nodeS.comp).to.be.false;
        });

        it("should correctly prune a link with a missing source and update the target node's comp status", function () {
            const nodeT = { id: "nodeT", links: [], prune: false, comp: true };
            const link = { source: null, target: nodeT, prune: true };
            nodeT.links.push(link);

            const nodeData = [nodeT];
            const linkData = [link];

            graphPrune(linkData, nodeData);

            expect(nodeData).to.have.lengthOf(1);
            expect(nodeData[0]).to.equal(nodeT);
            expect(linkData).to.be.empty;
            expect(nodeT.links).to.be.empty;
            expect(nodeT.comp).to.be.false;
        });

        it("should not modify data if no nodes or links are marked for pruning", function () {
            const node1 = { id: "node1", links: [], prune: false, comp: true };
            const node2 = { id: "node2", links: [], prune: false, comp: true };
            const link1 = { source: node1, target: node2, prune: false };
            node1.links.push(link1);
            node2.links.push(link1);

            const nodeData = [node1, node2];
            const linkData = [link1];

            const originalNodeData = [...nodeData];
            const originalLinkData = [...linkData];
            const originalNode1Links = [...node1.links];
            const originalNode2Links = [...node2.links];
            const originalNode1Comp = node1.comp;
            const originalNode2Comp = node2.comp;

            graphPrune(linkData, nodeData);

            expect(nodeData).to.deep.equal(originalNodeData);
            expect(linkData).to.deep.equal(originalLinkData);
            expect(node1.links).to.deep.equal(originalNode1Links);
            expect(node2.links).to.deep.equal(originalNode2Links);
            expect(node1.comp).to.equal(originalNode1Comp);
            expect(node2.comp).to.equal(originalNode2Comp);
        });

        it("should remove only pruned links and update 'comp' status and 'links' array of non-pruned nodes", function () {
            const node1 = { id: "node1", links: [], prune: false, comp: true };
            const node2 = { id: "node2", links: [], prune: false, comp: true };
            const link1 = { source: node1, target: node2, prune: true };
            node1.links.push(link1);
            node2.links.push(link1);

            const nodeData = [node1, node2];
            const linkData = [link1];

            graphPrune(linkData, nodeData);

            expect(nodeData).to.have.lengthOf(2);
            expect(nodeData).to.include.members([node1, node2]);
            expect(linkData).to.be.empty;
            expect(node1.links).to.be.empty;
            expect(node1.comp).to.be.false;
            expect(node2.links).to.be.empty;
            expect(node2.comp).to.be.false;
        });

        it("should remove all nodes and links if all are marked for pruning", function () {
            const node1 = { id: "node1", links: [], prune: true };
            const node2 = { id: "node2", links: [], prune: true };
            const link1 = { source: node1, target: node2, prune: true };
            // Simulate links being added to nodes, though they might be removed by graphPruneCalc setting prune on links
            if (node1.links) node1.links.push(link1);
            else node1.links = [link1];
            if (node2.links) node2.links.push(link1);
            else node2.links = [link1];

            const nodeData = [node1, node2];
            const linkData = [link1];

            graphPrune(linkData, nodeData);

            expect(nodeData).to.be.empty;
            expect(linkData).to.be.empty;
        });
    });

    describe("graphPruneReset", function () {
        it("should reset prune flags on all nodes", function () {
            const node1 = { id: "node1", prune: true };
            const node2 = { id: "node2", prune: true };

            const nodeData = [node1, node2];

            graphPruneReset(nodeData);

            expect(node1.prune).to.be.false;
            expect(node2.prune).to.be.false;
        });

        it("should reset prune flags on all links when provided", function () {
            const node1 = { id: "node1", prune: true };
            const link1 = { id: "link1", prune: true };
            const link2 = { id: "link2", prune: true };

            const nodeData = [node1];
            const linkData = [link1, link2];

            graphPruneReset(nodeData, linkData);

            expect(node1.prune).to.be.false;
            expect(link1.prune).to.be.false;
            expect(link2.prune).to.be.false;
        });
    });
});
