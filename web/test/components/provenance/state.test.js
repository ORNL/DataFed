import { expect } from "chai";
import { DEFAULTS, GraphState } from "../../../static/components/provenance/state.js";

describe("state", function () {
    describe("DEFAULTS", function () {
        it("should have the expected default values", function () {
            expect(DEFAULTS).to.be.an("object");
            expect(DEFAULTS.NODE_SIZE).to.equal(10);
            expect(DEFAULTS.NODE_COLOR).to.be.null;
            expect(DEFAULTS.LABEL_SIZE).to.equal(14);
            expect(DEFAULTS.LABEL_COLOR).to.be.null;
        });
    });

    describe("GraphState", function () {
        let graphState;

        beforeEach(function () {
            // Create a fresh GraphState instance before each test
            graphState = new GraphState();

            // Mock localStorage
            global.localStorage = {
                items: {},
                getItem: function (key) {
                    return this.items[key] || null;
                },
                setItem: function (key, value) {
                    this.items[key] = value;
                },
            };

            // Mock console.error
            global.console.error = function () {};
        });

        afterEach(function () {
            // Clean up
            delete global.localStorage;
        });

        it("should initialize with empty state and observers", function () {
            expect(graphState.observers).to.be.an("array").that.is.empty;
            expect(graphState.state).to.be.an("object");
            expect(graphState.state.nodePositions).to.be.an("object").that.is.empty;
            expect(graphState.state.nodeStyles).to.be.an("object").that.is.empty;
            expect(graphState.state.labelOffsets).to.be.an("object").that.is.empty;
            expect(graphState.state.labelStyles).to.be.an("object").that.is.empty;
        });

        it("should add observers correctly", function () {
            const observer = { update: () => {} };
            graphState.addObserver(observer);

            expect(graphState.observers).to.have.lengthOf(1);
            expect(graphState.observers[0]).to.equal(observer);
        });

        it("should notify observers when state changes", function () {
            let notified = false;
            const observer = {
                update: function (state) {
                    notified = true;
                    expect(state).to.equal(graphState.state);
                },
            };

            graphState.addObserver(observer);
            graphState.notifyObservers();

            expect(notified).to.be.true;
        });

        it("should save node positions correctly", function () {
            const nodeData = [{ id: "node1", x: 100, y: 200, anchored: true }];

            graphState.saveState(nodeData);

            expect(graphState.state.nodePositions.node1).to.deep.equal({
                x: 100,
                y: 200,
                anchored: true,
            });
        });

        it("should save node styles when they differ from defaults", function () {
            const nodeData = [
                {
                    id: "node1",
                    nodeSize: 20, // Different from default
                    nodeColor: "red", // Different from default
                },
            ];

            graphState.saveState(nodeData);

            expect(graphState.state.nodeStyles.node1).to.deep.equal({
                size: 20,
                color: "red",
            });
        });

        it("should not save node styles when they match defaults", function () {
            const nodeData = [
                {
                    id: "node1",
                    nodeSize: DEFAULTS.NODE_SIZE, // Same as default
                    nodeColor: DEFAULTS.NODE_COLOR, // Same as default
                },
            ];

            graphState.saveState(nodeData);

            expect(graphState.state.nodeStyles).to.be.an("object").that.is.empty;
        });

        it("should save label offsets correctly", function () {
            const nodeData = [{ id: "node1", labelOffsetX: 5, labelOffsetY: 10 }];

            graphState.saveState(nodeData);

            expect(graphState.state.labelOffsets.node1).to.deep.equal({
                x: 5,
                y: 10,
            });
        });

        it("should save label styles when they differ from defaults", function () {
            const nodeData = [
                {
                    id: "node1",
                    labelSize: 20, // Different from default
                    labelColor: "blue", // Different from default
                },
            ];

            graphState.saveState(nodeData);

            expect(graphState.state.labelStyles.node1).to.deep.equal({
                size: 20,
                color: "blue",
            });
        });

        it("should not save label styles when they match defaults", function () {
            const nodeData = [
                {
                    id: "node1",
                    labelSize: DEFAULTS.LABEL_SIZE, // Same as default
                    labelColor: DEFAULTS.LABEL_COLOR, // Same as default
                },
            ];

            graphState.saveState(nodeData);

            expect(graphState.state.labelStyles).to.be.an("object").that.is.empty;
        });

        it("should store state in localStorage", function () {
            const nodeData = [{ id: "node1", x: 100, y: 200 }];

            graphState.saveState(nodeData);

            const storedState = JSON.parse(localStorage.getItem("datafed-graph-state"));
            expect(storedState).to.deep.equal(graphState.state);
        });

        it("should return true when state is saved successfully", function () {
            const nodeData = [{ id: "node1", x: 100, y: 200 }];

            const result = graphState.saveState(nodeData);

            expect(result).to.be.true;
        });

        it("should handle errors when saving state", function () {
            // Mock localStorage to throw an error
            global.localStorage.setItem = function () {
                throw new Error("Storage error");
            };

            const nodeData = [{ id: "node1", x: 100, y: 200 }];

            const result = graphState.saveState(nodeData);

            expect(result).to.be.false;
        });
    });
});
