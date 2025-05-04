function defineArrowMarkerDeriv(a_svg) {
    a_svg
        .append("defs")
        .append("marker")
        .attr("id", "arrow-derivation")
        .attr("refX", -2.5)
        .attr("refY", 2)
        .attr("orient", "auto")
        .attr("markerWidth", 5)
        .attr("markerHeight", 4)
        .append("svg:path")
        .attr("class", "arrow-path derivation")
        .attr("d", "M 5,0 L 0,2 L 5,4");
}

function defineArrowMarkerComp(a_svg) {
    a_svg
        .append("defs")
        .append("marker")
        .attr("id", "arrow-component")
        .attr("refX", -2.5)
        .attr("refY", 2)
        .attr("orient", "auto")
        .attr("markerWidth", 8)
        .attr("markerHeight", 4)
        .append("svg:path")
        .attr("class", "arrow-path component")
        .attr("d", "M 4,0 L 0,2 L 4,4 L 8,2");
}

// New version marker at 'end'
function defineArrowMarkerNewVer(a_svg, a_name) {
    a_svg
        .append("defs")
        .append("marker")
        .attr("id", "arrow-new-version")
        .attr("refX", -2.5)
        .attr("refY", 2)
        .attr("orient", "auto")
        .attr("markerWidth", 7)
        .attr("markerHeight", 4)
        .append("svg:path")
        .attr("class", "arrow-path new-version")
        .attr("d", "M 5,0 L 0,2 L 5,4 L 5,0 M 6,0 L 7,0 L 7,4 L 6,4 L 6,0");
}

export { defineArrowMarkerDeriv, defineArrowMarkerComp, defineArrowMarkerNewVer };
