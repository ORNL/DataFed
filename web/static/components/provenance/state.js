const DEFAULTS = {
    NODE_SIZE: 10,
    NODE_COLOR: null, // Use CSS default
    LABEL_SIZE: 14,
    LABEL_COLOR: null, // Use CSS default
};

// Observer pattern for state management
class GraphState {
    constructor() {
        this.observers = [];
        this.state = {
            nodePositions: {}, // Store node positions
            nodeStyles: {}, // Store node customizations
            labelOffsets: {}, // Store label offsets
            labelStyles: {}, // Store label customizations
        };
    }

    addObserver(observer) {
        this.observers.push(observer);
    }

    notifyObservers() {
        this.observers.forEach((observer) => observer.update(this.state));
    }

    saveState(nodeData) {
        // Clear previous state
        this.state = {
            nodePositions: {},
            nodeStyles: {},
            labelOffsets: {},
            labelStyles: {},
        };

        // Save state for each node
        nodeData.forEach((node) => {
            this.state.nodePositions[node.id] = {
                x: node.x,
                y: node.y,
                anchored: node.anchored || false,
            };

            // Save node style customizations
            if (node.nodeSize !== DEFAULTS.NODE_SIZE || node.nodeColor) {
                this.state.nodeStyles[node.id] = {
                    size: node.nodeSize || DEFAULTS.NODE_SIZE,
                    color: node.nodeColor || DEFAULTS.NODE_COLOR,
                };
            }

            // Save label offsets
            if (node.labelOffsetX !== undefined || node.labelOffsetY !== undefined) {
                this.state.labelOffsets[node.id] = {
                    x: node.labelOffsetX || 0,
                    y: node.labelOffsetY || 0,
                };
            }

            // Save label style customizations
            if (node.labelSize !== DEFAULTS.LABEL_SIZE || node.labelColor) {
                this.state.labelStyles[node.id] = {
                    size: node.labelSize || DEFAULTS.LABEL_SIZE,
                    color: node.labelColor || DEFAULTS.LABEL_COLOR,
                };
            }
        });

        // Store in localStorage
        // TODO - Consider saving graph to file to export to another program or 1 graph
        try {
            localStorage.setItem("datafed-graph-state", JSON.stringify(this.state));
            this.notifyObservers();
            return true;
        } catch (e) {
            console.error("Failed to save graph state:", e);
            return false;
        }
    }
}

export { GraphState, DEFAULTS };
