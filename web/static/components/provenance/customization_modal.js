import { DEFAULTS } from "./state.js";

function showCustomizationModal(node, x, y, currentCustomizationNode) {
    const modal = document.getElementById("customization-modal");
    if (!modal) return;

    // Set the current node being customized
    currentCustomizationNode = node;

    // Save original values for reverting if cancelled
    if (window.saveOriginalValues) {
        window.saveOriginalValues(node);
    }

    const nodeColorInput = document.getElementById("node-color-input");
    // Helper function to convert RGB to hex format
    const rgbToHex = (rgb) => {
        return "#" + rgb.map((x) => parseInt(x).toString(16).padStart(2, "0")).join("");
    };

    // Helper function to get the default color from CSS
    const getDefaultColor = (node) => {
        const nodeElement = d3.select(`[id="${node.id}"] circle.obj`).node();
        if (!nodeElement) {
            return DEFAULTS.NODE_COLOR;
        }

        const computedStyle = window.getComputedStyle(nodeElement);
        const fillColor = computedStyle.fill;

        if (fillColor && fillColor !== "none") {
            if (fillColor.startsWith("rgb")) {
                const rgb = fillColor.match(/\d+/g);
                return rgb && rgb.length === 3 ? rgbToHex(rgb) : DEFAULTS.NODE_COLOR;
            }
            return fillColor;
        }

        return DEFAULTS.NODE_COLOR;
    };

    // Get the actual current node color
    nodeColorInput.value = node.nodeColor || getDefaultColor(node);

    const labelSizeSlider = document.getElementById("label-size-slider");
    const labelSizeValue = labelSizeSlider.nextElementSibling;
    labelSizeSlider.value = node.labelSize || DEFAULTS.LABEL_SIZE;
    labelSizeValue.textContent = `${labelSizeSlider.value}px`;

    const labelColorInput = document.getElementById("label-color-input");
    labelColorInput.value = node.labelColor || DEFAULTS.LABEL_COLOR;

    const anchorCheckbox = document.getElementById("anchor-checkbox");
    anchorCheckbox.checked = node.anchored || false;

    // Position and show modal
    modal.style.left = `${x}px`;
    modal.style.top = `${y}px`;
    modal.style.display = "block";

    // Return the current node for reference
    return currentCustomizationNode;
}

/**
 * Makes a modal element draggable by its header
 * Optimized to only attach document listeners during drag operations
 * @param {HTMLElement} modal - The modal element to make draggable
 */
function makeModalDraggable(modal) {
    let offsetX, offsetY;
    const header = modal.querySelector(".modal-header") || modal;

    // Handle mouse movement during drag
    function handleMouseMove(e) {
        modal.style.left = `${e.clientX - offsetX}px`;
        modal.style.top = `${e.clientY - offsetY}px`;
    }

    // Handle end of drag operation
    function handleMouseUp() {
        // Remove event listeners when dragging ends to improve performance
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
    }

    // Start dragging when mousedown on header
    header.addEventListener("mousedown", function (e) {
        // Calculate initial offset
        offsetX = e.clientX - modal.offsetLeft;
        offsetY = e.clientY - modal.offsetTop;

        // Add event listeners for dragging only when needed
        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);

        e.preventDefault();
    });
}

function createCustomizationModal() {
    // Remove existing modal if it exists
    const existingModal = document.getElementById("customization-modal");
    if (existingModal) {
        document.body.removeChild(existingModal);
    }

    const modal = document.createElement("div");
    modal.id = "customization-modal";
    modal.className = "customization-modal";
    modal.style.display = "none";

    // Add a draggable header
    const modalHeader = document.createElement("div");
    modalHeader.className = "modal-header";

    // Title in the draggable header
    const title = document.createElement("h3");
    title.textContent = "Customize Node & Label";
    modalHeader.appendChild(title);
    modal.appendChild(modalHeader);

    // Node customization section
    const nodeSection = document.createElement("div");
    nodeSection.className = "section";

    // Node color picker
    const nodeColorLabel = document.createElement("label");
    nodeColorLabel.textContent = "Node Color";
    nodeSection.appendChild(nodeColorLabel);

    const nodeColorRow = document.createElement("div");
    nodeColorRow.className = "control-row";

    const nodeColorInput = document.createElement("input");
    nodeColorInput.type = "color";
    nodeColorInput.id = "node-color-input";
    nodeColorInput.value = DEFAULTS.NODE_COLOR;

    nodeColorRow.appendChild(nodeColorInput);
    nodeSection.appendChild(nodeColorRow);

    modal.appendChild(nodeSection);

    // Label customization section
    const labelSection = document.createElement("div");
    labelSection.className = "section";

    const labelSizeLabel = document.createElement("label");
    labelSizeLabel.textContent = "Label Size";
    labelSection.appendChild(labelSizeLabel);

    const labelSizeRow = document.createElement("div");
    labelSizeRow.className = "control-row";

    const labelSizeSlider = document.createElement("input");
    labelSizeSlider.type = "range";
    labelSizeSlider.min = "8";
    labelSizeSlider.max = "24";
    labelSizeSlider.value = DEFAULTS.LABEL_SIZE;
    labelSizeSlider.id = "label-size-slider";

    const labelSizeValue = document.createElement("span");
    labelSizeValue.className = "value";
    labelSizeValue.textContent = `${DEFAULTS.LABEL_SIZE}px`;

    labelSizeRow.appendChild(labelSizeSlider);
    labelSizeRow.appendChild(labelSizeValue);
    labelSection.appendChild(labelSizeRow);

    // Label color picker
    const labelColorLabel = document.createElement("label");
    labelColorLabel.textContent = "Label Color";
    labelSection.appendChild(labelColorLabel);

    const labelColorRow = document.createElement("div");
    labelColorRow.className = "control-row";

    const labelColorInput = document.createElement("input");
    labelColorInput.type = "color";
    labelColorInput.id = "label-color-input";
    labelColorInput.value = DEFAULTS.LABEL_COLOR; // Default text color

    labelColorRow.appendChild(labelColorInput);
    labelSection.appendChild(labelColorRow);

    modal.appendChild(labelSection);

    // Anchor controls
    const anchorSection = document.createElement("div");
    anchorSection.className = "section";

    const anchorRow = document.createElement("div");
    anchorRow.className = "control-row checkbox-row";

    const anchorCheckbox = document.createElement("input");
    anchorCheckbox.type = "checkbox";
    anchorCheckbox.id = "anchor-checkbox";

    const anchorLabel = document.createElement("label");
    anchorLabel.htmlFor = "anchor-checkbox";
    anchorLabel.textContent = "Anchor Node";
    anchorLabel.classList.add("inline-label");

    anchorRow.appendChild(anchorCheckbox);
    anchorRow.appendChild(anchorLabel);
    anchorSection.appendChild(anchorRow);

    modal.appendChild(anchorSection);

    // Buttons
    const buttonsDiv = document.createElement("div");
    buttonsDiv.className = "buttons";

    const applyButton = document.createElement("button");
    applyButton.textContent = "Apply";
    applyButton.className = "primary";
    applyButton.id = "apply-customization";

    const closeButton = document.createElement("button");
    closeButton.textContent = "Close";
    closeButton.id = "close-customization";

    buttonsDiv.appendChild(closeButton);
    buttonsDiv.appendChild(applyButton);

    modal.appendChild(buttonsDiv);

    document.body.appendChild(modal);

    // Make the modal draggable
    makeModalDraggable(modal);

    return modal;
}

export { showCustomizationModal, createCustomizationModal };
