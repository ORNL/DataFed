import { DEFAULTS } from "./state.js";

export function createCustomizationModal() {
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
    modalHeader.style.cursor = "move";
    modalHeader.style.padding = "5px";
    modalHeader.style.marginBottom = "10px";
    modalHeader.style.backgroundColor = "#f5f5f5";
    modalHeader.style.borderBottom = "1px solid #ddd";
    modalHeader.style.borderRadius = "8px 8px 0 0";

    // Title in the draggable header
    const title = document.createElement("h3");
    title.textContent = "Customize Node & Label";
    title.style.margin = "0";
    title.style.padding = "5px";
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
    nodeColorInput.value = "#6baed6"; // Default blue color

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
    labelColorInput.value = "#333333"; // Default text color

    labelColorRow.appendChild(labelColorInput);
    labelSection.appendChild(labelColorRow);

    modal.appendChild(labelSection);

    // Anchor controls
    const anchorSection = document.createElement("div");
    anchorSection.className = "section";

    const anchorCheckbox = document.createElement("input");
    anchorCheckbox.type = "checkbox";
    anchorCheckbox.id = "anchor-checkbox";

    const anchorLabel = document.createElement("label");
    anchorLabel.htmlFor = "anchor-checkbox";
    anchorLabel.textContent = "Anchor Node";
    anchorLabel.style.display = "inline";
    anchorLabel.style.marginLeft = "5px";

    anchorSection.appendChild(anchorCheckbox);
    anchorSection.appendChild(anchorLabel);

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

// Function to make the customization modal draggable
function makeModalDraggable(modal) {
    let offsetX, offsetY, isDragging = false;
    const header = modal.querySelector(".modal-header") || modal;

    header.addEventListener("mousedown", function(e) {
        isDragging = true;
        offsetX = e.clientX - modal.offsetLeft;
        offsetY = e.clientY - modal.offsetTop;
        e.preventDefault();
    });

    document.addEventListener("mousemove", function(e) {
        if (isDragging) {
            modal.style.left = `${e.clientX - offsetX}px`;
            modal.style.top = `${e.clientY - offsetY}px`;
        }
    });

    document.addEventListener("mouseup", function() {
        isDragging = false;
    });
}
