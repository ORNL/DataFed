const DEFAULTS = {
    NODE_SIZE: 10,
    NODE_COLOR: "#6baed6", // Use CSS default
    LABEL_SIZE: 14,
    LABEL_COLOR: "#333333", // Use CSS default
    THEME: "light", // Default theme
};

/**
 * GraphState - Manages the state of the provenance graph visualization using the Observer pattern
 *
 * The Observer pattern is used here to:
 * 1. Persist user customizations of the graph layout (node positions, anchoring)
 * 2. Maintain visual styling choices (colors, sizes) between sessions
 * 3. Enable real-time updates when customizations are made in one view (e.g., modal dialog)
 *    to be reflected in another view (the graph itself)
 *
 * Potential future uses:
 * - Synchronizing graph changes with underlying data records
 * - Broadcasting updates when relationship data changes
 * - Enabling multiple views of the same graph data to stay in sync
 * - Supporting undo/redo functionality by tracking state changes
 * 
 * How to use:
 * - Components that need to observe state changes should implement an update(state) method
 * - Then register with graphStateManager.addObserver(observerComponent)
 * - When state changes occur, all observers will be notified
 */
class GraphState {
    constructor() {
        this.observers = [];
        this.state = {
            nodePositions: {}, // Store node positions
            nodeStyles: {}, // Store node customizations
            labelOffsets: {}, // Store label offsets
            labelStyles: {}, // Store label customizations
            theme: DEFAULTS.THEME, // Current theme
        };
        
        // Load saved state from localStorage if available
        try {
            const savedState = localStorage.getItem("datafed-graph-state");
            
            // Try to detect system theme from settings if available
            if (window.settings && window.settings.theme) {
                this.state.theme = window.settings.theme;
            }
            
            // Hook into settings.setTheme to keep our state in sync
            if (window.settings && typeof window.settings.setTheme === 'function') {
                const originalSetTheme = window.settings.setTheme;
                const graphState = this;
                
                window.settings.setTheme = function(theme) {
                    // Call original function
                    originalSetTheme(theme);
                    // Update our state and notify observers
                    graphState.setTheme(theme);
                };
            }
            if (savedState) {
                this.state = JSON.parse(savedState);
            }
        } catch (e) {
            console.error("Failed to load graph state:", e);
        }
    }

    addObserver(observer) {
        this.observers.push(observer);
    }

    notifyObservers() {
        this.observers.forEach((observer) => observer.update(this.state));
    }

    /**
     * Saves the current state of all nodes to localStorage
     * Only saves non-default values to reduce storage footprint
     * @param {Array} nodeData - Array of node objects with current state
     * @returns {boolean} - Success status of the save operation
     */
    /**
     * Sets the current theme and notifies observers
     * @param {string} theme - The theme to set ('light' or 'dark')
     */
    setTheme(theme) {
        if (theme === 'light' || theme === 'dark') {
            this.state.theme = theme;
            this.notifyObservers();
            
            // Update body class for CSS variables
            document.body.classList.remove('theme-light', 'theme-dark');
            document.body.classList.add('theme-' + theme);
            
            return true;
        }
        return false;
    }
    
    /**
     * Gets the current theme
     * @returns {string} - The current theme ('light' or 'dark')
     */
    getTheme() {
        return this.state.theme;
    }
    
    /**
     * Saves the current state of all nodes to localStorage
     * Only saves non-default values to reduce storage footprint
     * @param {Array} nodeData - Array of node objects with current state
     * @returns {boolean} - Success status of the save operation
     */
    saveState(nodeData) {
        // Save current theme and preserve it
        const currentTheme = this.state.theme;
        
        // Reset the state
        this.state = {
            nodePositions: {},
            nodeStyles: {},
            labelOffsets: {},
            labelStyles: {},
            theme: currentTheme, // Preserve theme
        };

        // Save state for each node, only storing non-default and non-zero values
        nodeData.forEach((node) => {
            // Only save position if node is anchored or has a position
            if (node.anchored || (node.x !== undefined && node.y !== undefined)) {
                const positionData = {};
                
                // Only add properties that are different from defaults
                if (node.x !== undefined) positionData.x = node.x;
                if (node.y !== undefined) positionData.y = node.y;
                if (node.anchored) positionData.anchored = true;
                
                // Only save if we have actual data to store
                if (Object.keys(positionData).length > 0) {
                    this.state.nodePositions[node.id] = positionData;
                }
            }

            // Save node style customizations - only non-default values
            const nodeStyle = {};
            if (node.nodeSize && node.nodeSize !== DEFAULTS.NODE_SIZE) {
                nodeStyle.size = node.nodeSize;
            }
            if (node.nodeColor && node.nodeColor !== DEFAULTS.NODE_COLOR) {
                nodeStyle.color = node.nodeColor;
            }
            if (Object.keys(nodeStyle).length > 0) {
                this.state.nodeStyles[node.id] = nodeStyle;
            }

            // Save label offsets - only if they exist and aren't zero
            if (node.labelOffsetX || node.labelOffsetY) {
                const offsetData = {};
                if (node.labelOffsetX) offsetData.x = node.labelOffsetX;
                if (node.labelOffsetY) offsetData.y = node.labelOffsetY;
                
                if (Object.keys(offsetData).length > 0) {
                    this.state.labelOffsets[node.id] = offsetData;
                }
            }

            // Save label style customizations - only non-default values
            const labelStyle = {};
            if (node.labelSize && node.labelSize !== DEFAULTS.LABEL_SIZE) {
                labelStyle.size = node.labelSize;
            }
            if (node.labelColor && node.labelColor !== DEFAULTS.LABEL_COLOR) {
                labelStyle.color = node.labelColor;
            }
            if (Object.keys(labelStyle).length > 0) {
                this.state.labelStyles[node.id] = labelStyle;
            }
        });

        // Store in localStorage
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

/**
 * ThemeObserver - Observer class for theme changes
 * Uses the Observer pattern to respond to theme changes
 */
class ThemeObserver {
    /**
     * Called by GraphState when state changes
     * @param {Object} state - The updated state object
     */
    update(state) {
        if (state && state.theme) {
            // Apply theme class to body
            document.body.classList.remove('theme-light', 'theme-dark');
            document.body.classList.add('theme-' + state.theme);
        }
    }
}

export { GraphState, DEFAULTS, ThemeObserver };
