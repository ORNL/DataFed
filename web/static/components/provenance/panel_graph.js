import * as util from "../../util.js";
import * as model from "../../model.js";
import * as api from "../../api.js";
import * as panel_info from "../../panel_item_info.js";
import {
    defineArrowMarkerComp,
    defineArrowMarkerDeriv,
    defineArrowMarkerNewVer,
} from "./assets/arrow-markers.js";

export function newGraphPanel(a_id, a_frame, a_parent) {
    return new GraphPanel(a_id, a_frame, a_parent);
}

function makeLabel(node, item) {
    //console.log("makeLabel",node,item);
    if (item.alias) {
        node.label = item.alias;
    } else node.label = item.id;

    node.label += util.generateNoteSpan(item, true);
}

function GraphPanel(a_id, a_frame, a_parent) {
    //var graph_div = $(a_id,a_frame);
    var inst = this;
    var node_data = [];
    var link_data = [];
    var graph_center_x = 200;
    var nodes_grp = null;
    var nodes = null;
    var links_grp = null;
    var links = null;
    var svg = null;
    var simulation = null;
    var sel_node = null;
    var focus_node_id,
        sel_node_id,
        r = 10;

    this.load = function (a_id, a_sel_node_id) {
        focus_node_id = a_id;
        sel_node_id = a_sel_node_id ? a_sel_node_id : a_id;
        sel_node = null;

        //console.log("owner:",a_owner);
        api.dataGetDepGraph(a_id, function (a_data) {
            var item, i, j, dep, node;

            link_data = [];

            var new_node_data = [];
            var id,
                id_map = {};

            for (i in a_data.item) {
                item = a_data.item[i];
                //console.log("node:",item);
                node = {
                    id: item.id,
                    doi: item.doi,
                    size: item.size,
                    notes: item.notes,
                    inhErr: item.inhErr,
                    locked: item.locked,
                    links: [],
                };

                makeLabel(node, item);

                if (item.gen != undefined) {
                    node.row = item.gen;
                    node.col = 0;
                }

                if (item.id == a_id) {
                    node.comp = true;
                }

                if (item.id == sel_node_id) {
                    sel_node = node;
                }

                id_map[node.id] = new_node_data.length;
                new_node_data.push(node);
                for (j in item.dep) {
                    dep = item.dep[j];
                    id = item.id + "-" + dep.id;
                    link_data.push({
                        source: item.id,
                        target: dep.id,
                        ty: model.DepTypeFromString[dep.type],
                        id: id,
                    });
                }
            }

            for (i in link_data) {
                dep = link_data[i];

                node = new_node_data[id_map[dep.source]];
                node.links.push(dep);
                node = new_node_data[id_map[dep.target]];
                node.links.push(dep);
            }

            // Copy any existing position data to new nodes
            var node2;
            for (i in node_data) {
                node = node_data[i];
                if (id_map[node.id] != undefined) {
                    node2 = new_node_data[id_map[node.id]];
                    node2.x = node.x;
                    node2.y = node.y;
                }
            }

            node_data = new_node_data;

            if (!sel_node) {
                if (node_data.length) {
                    sel_node = node_data[0];
                    sel_node_id = sel_node.id;
                } else {
                    sel_node_id = null;
                }
            }

            renderGraph();
            panel_info.showSelectedInfo(sel_node_id, inst.checkGraphUpdate);
            a_parent.updateBtnState();
        });
    };

    this.checkGraphUpdate = function (a_data, a_source) {
        console.log("graph check updates", a_data, a_source);
        console.log("sel node", sel_node);
        // source is sel_node_id, so check sel_node
        if (a_data.size != sel_node.size) {
            console.log("size diff, update!");
            model.update([a_data]);
        }
    };

    // TODO Why are IDs separate from data?

    this.update = function (a_ids, a_data) {
        // Only updates locked and alias of impacted nodes

        var ids = Array.isArray(a_ids) ? a_ids : [a_ids];
        var data = Array.isArray(a_data) ? a_data : [a_data];
        var i,
            node,
            item,
            render = false;

        for (i = 0; i < ids.length; i++) {
            node = findNode(ids[i]);
            if (node) {
                render = true;
                item = data[i];

                node.locked = item.locked;
                node.notes = item.notes;
                console.log("updating:", node);

                makeLabel(node, item);
            }
        }

        if (render) renderGraph();
    };

    this.clear = function () {
        links_grp.selectAll("*").remove();
        nodes_grp.selectAll("*").remove();
        node_data = [];
        link_data = [];
    };

    this.resized = function (a_width, a_height) {
        graph_center_x = a_width / 2;
    };

    this.getSelectedID = function () {
        if (sel_node) return sel_node.id;
    };

    this.getSelectedNodes = function () {
        var sel = [];
        if (sel_node) {
            sel.push({
                key: sel_node.id,
                data: { doi: sel_node.doi, size: sel_node.size },
                parent: { key: "" },
            });
        }
        return sel;
    };

    this.getSubjectID = function () {
        if (focus_node_id) return focus_node_id;
    };

    // NOTE: D3 changes link source and target IDs strings (in link_data) to node references (in node_data) when renderGraph runs
    function renderGraph() {
        var g;

        links = links_grp.selectAll("line").data(link_data, function (d) {
            return d.id;
        });

        links
            .enter()
            .append("line")
            .attr("marker-start", function (d) {
                //console.log("link enter 1");
                switch (d.ty) {
                    case 0:
                        return "url(#arrow-derivation)";
                    case 1:
                        return "url(#arrow-component)";
                    case 2:
                        return "url(#arrow-new-version)";
                    default:
                        return "";
                }
            })
            /*.attr('marker-end',function(d){
                    //console.log("link enter 1");
                    switch ( d.ty ){
                        case 2: return 'url(#arrow-new-version)';
                        default: return '';
                    }
                })*/
            .attr("class", function (d) {
                //console.log("link enter 2");
                switch (d.ty) {
                    case 0:
                        return "link derivation";
                    case 1:
                        return "link component";
                    case 2:
                        return "link new-version";
                }
            });

        links.exit().remove();

        links = links_grp.selectAll("line");

        nodes = nodes_grp.selectAll("g").data(node_data, function (d) {
            return d.id;
        });

        // Update
        nodes.select("circle.obj").attr("class", function (d) {
            var res = "obj ";

            //console.log("upd node", d );

            if (d.id == focus_node_id) res += "main";
            else if (d.row != undefined) res += "prov";
            else {
                //console.log("upd other node", d );
                res += "other";
            }

            if (d.comp) res += " comp";
            else res += " part";

            return res;
        });

        nodes
            .select("text.label")
            .html(function (d) {
                return d.label;
            })
            .attr("x", function (d) {
                if (d.locked) return r + 12;
                else return r;
            });

        nodes.select("text.locked").html(function (d) {
            if (d.locked) return "&#xe6bb";
            else return "";
        });

        nodes.selectAll(".node > circle.select").attr("class", function (d) {
            if (d.id == sel_node_id) {
                //sel_node = d;
                return "select highlight";
            } else return "select hidden";
        });

        g = nodes
            .enter()
            .append("g")
            .attr("class", "node")
            .call(d3.drag().on("start", dragStarted).on("drag", dragged).on("end", dragEnded));

        g.append("circle")
            .attr("r", r)
            .attr("class", function (d) {
                var res = "obj ";
                //console.log("node enter 1");

                if (d.id == focus_node_id) res += "main";
                else if (d.row != undefined) res += "prov";
                else {
                    res += "other";
                    //console.log("new other node", d );
                }

                if (d.comp) res += " comp";
                else res += " part";

                return res;
            })
            .on("mouseover", function (d) {
                //console.log("mouse over");
                d3.select(this)
                    .transition()
                    .duration(150)
                    .attr("r", r * 1.5);
            })
            .on("mouseout", function (d) {
                d3.select(this).transition().duration(500).attr("r", r);
            })
            .on("dblclick", function (d, i) {
                //console.log("dbl click");
                if (d.comp) inst.collapseNode();
                else inst.expandNode();
                d3.event.stopPropagation();
            })
            .on("click", function (d, i) {
                if (sel_node != d) {
                    d3.select(".highlight").attr("class", "select hidden");
                    d3.select(this.parentNode).select(".select").attr("class", "select highlight");
                    sel_node = d;
                    sel_node_id = d.id;
                    panel_info.showSelectedInfo(d.id, inst.checkGraphUpdate);
                    a_parent.updateBtnState();
                }

                if (d3.event.ctrlKey) {
                    if (d.comp) inst.collapseNode();
                    else inst.expandNode();
                }

                d3.event.stopPropagation();
            });

        g.append("circle")
            .attr("r", r * 1.5)
            .attr("class", function (d) {
                //console.log("node enter 3");

                if (d.id == sel_node_id) {
                    //sel_node = d;
                    return "select highlight";
                } else return "select hidden";
            });

        var n2 = g.filter(function (d) {
            return d.size;
        });
        n2.append("line")
            .attr("pointer-events", "none")
            .attr("x1", -r * 0.5)
            .attr("y1", -r * 0.3)
            .attr("x2", r * 0.5)
            .attr("y2", -r * 0.3)
            .attr("class", "data");
        //.attr("stroke-width", 1 )
        //.attr("stroke", "white" );

        n2.append("line")
            .attr("pointer-events", "none")
            .attr("x1", -r * 0.5)
            .attr("y1", 0)
            .attr("x2", r * 0.5)
            .attr("y2", 0)
            .attr("class", "data");
        //.attr("stroke-width", 1 )
        //.attr("stroke", "white" );

        n2.append("line")
            .attr("pointer-events", "none")
            .attr("x1", -r * 0.5)
            .attr("y1", r * 0.3)
            .attr("x2", r * 0.5)
            .attr("y2", r * 0.3)
            .attr("class", "data");
        //.attr("stroke-width", 1 )
        //.attr("stroke", "white" );

        g.append("text")
            .attr("class", "label")
            .html(function (d) {
                return d.label;
            })
            .attr("x", function (d) {
                if (d.locked) return r + 12;
                else return r;
            })
            .attr("y", -r);

        g.append("text")
            .attr("class", "locked")
            .html(function (d) {
                if (d.locked) return "&#xe6bb";
                else return "";
            })
            .attr("x", r - 3)
            .attr("y", -r + 1);

        nodes.exit().remove();

        nodes = nodes_grp.selectAll("g");

        if (simulation) {
            //console.log("restart sim");
            simulation.nodes(node_data).force("link").links(link_data);

            simulation.alpha(1).restart();
        } else {
            var linkForce = d3
                .forceLink(link_data)
                .strength(function (d) {
                    switch (d.ty) {
                        case 0:
                            return 0.1;
                        case 1:
                            return 0.1;
                        case 2:
                            return 0.1;
                    }
                })
                .id(function (d) {
                    return d.id;
                });

            simulation = d3
                .forceSimulation()
                .nodes(node_data)
                //.force('center', d3.forceCenter(200,200))
                .force("charge", d3.forceManyBody().strength(-300))
                .force(
                    "row",
                    d3
                        .forceY(function (d, i) {
                            return d.row != undefined ? 75 + d.row * 75 : 0;
                        })
                        .strength(function (d) {
                            return d.row != undefined ? 0.05 : 0;
                        }),
                )
                .force(
                    "col",
                    d3
                        .forceX(function (d, i) {
                            return d.col != undefined ? graph_center_x : 0;
                        })
                        .strength(function (d) {
                            return d.col != undefined ? 0.05 : 0;
                        }),
                )
                .force("link", linkForce)
                .force("collide", d3.forceCollide().radius(function(d) {
                    // Base radius plus some extra space based on label length
                    return r * 1.5 + (d.label ? d.label.length * 0.8 : 0);
                }))
                .on("tick", simTick);
        }
    }

    function dragStarted(d) {
        //console.log("drag start",d.id);
        if (!d3.event.active) simulation.alphaTarget(0.3).restart();
        
        // If node was previously anchored, maintain that state
        if (d.anchored) {
            // Node is already anchored, just update position
            d.fx = d3.event.x;
            d.fy = d3.event.y;
        } else {
            // Normal behavior
            d.fx = d3.event.x;
            d.fy = d3.event.y;
        }
        
        // Check if Alt key is pressed to drag the label independently
        if (d3.event.sourceEvent.altKey) {
            d.draggingLabel = true;
            d.labelDragStartX = d3.event.x;
            d.labelDragStartY = d3.event.y;
        }
        
        d3.event.sourceEvent.stopPropagation();
    }

    function dragged(d) {
        //console.log("drag",d3.event.x,d3.event.y);
        
        if (d.draggingLabel) {
            // Dragging the label independently
            if (!d.labelOffsetX) d.labelOffsetX = 0;
            if (!d.labelOffsetY) d.labelOffsetY = 0;
            
            // Update the label offset based on drag movement
            d.labelOffsetX += (d3.event.x - d.labelDragStartX);
            d.labelOffsetY += (d3.event.y - d.labelDragStartY);
            
            // Update the start position for the next drag event
            d.labelDragStartX = d3.event.x;
            d.labelDragStartY = d3.event.y;
        } else {
            // Normal node dragging
            d.fx = d3.event.x;
            d.fy = d3.event.y;
        }
        
        simTick();
        d3.event.sourceEvent.stopPropagation();
    }

    function dragEnded(d) {
        //console.log("drag end",d.id);
        if (!d3.event.active) simulation.alphaTarget(0);
        
        if (d.draggingLabel) {
            // End of label dragging
            d.draggingLabel = false;
            // Label position is already updated in the dragged function
        } else {
            // Check if shift key is pressed to anchor the node
            if (d3.event.sourceEvent.shiftKey) {
                // Keep the fixed position (anchored)
                d.anchored = true;
            } else if (!d.anchored) {
                // Normal behavior - release the node if it's not anchored
                d.x = d.fx;
                d.y = d.fy;
                delete d.fx;
                delete d.fy;
            }
        }
        
        // Double-click to toggle anchor state
        if (d3.event.sourceEvent.detail === 2 && !d.draggingLabel) {
            d.anchored = !d.anchored;
            if (d.anchored) {
                d.fx = d.x;
                d.fy = d.y;
            } else {
                delete d.fx;
                delete d.fy;
            }
        }
        
        //console.log("at:",d);
        d3.event.sourceEvent.stopPropagation();
    }

    function findNode(a_id) {
        for (var i in node_data) {
            if (node_data[i].id == a_id) return node_data[i];
        }
    }

    function findLink(a_id) {
        for (var i in link_data) {
            if (link_data[i].id == a_id) return link_data[i];
        }
    }

    this.expandNode = function () {
        if (sel_node && !sel_node.comp) {
            api.dataView(sel_node_id, function (data) {
                console.log("expand node data:", data);
                if (data) {
                    var rec = data;

                    sel_node.comp = true;

                    var dep, new_node, link, i, id;

                    for (i in rec.deps) {
                        dep = rec.deps[i];
                        //console.log("dep:",dep);

                        if (dep.dir == "DEP_IN") id = dep.id + "-" + rec.id;
                        else id = rec.id + "-" + dep.id;

                        link = findLink(id);
                        if (link) continue;

                        link = { id: id, ty: model.DepTypeFromString[dep.type] };
                        if (dep.dir == "DEP_IN") {
                            link.source = dep.id;
                            link.target = rec.id;
                        } else {
                            link.source = rec.id;
                            link.target = dep.id;
                        }

                        sel_node.links.push(link);

                        new_node = findNode(dep.id);
                        if (!new_node) {
                            new_node = {
                                id: dep.id,
                                notes: dep.notes,
                                inhErr: dep.inhErr,
                                links: [link],
                            };
                            makeLabel(new_node, dep);
                            node_data.push(new_node);
                        } else {
                            new_node.links.push(link);
                        }

                        link_data.push(link);
                    }

                    renderGraph();
                }
            });
        }
    };

    this.collapseNode = function () {
        //console.log("collapse node");
        if (sel_node) {
            var i,
                link,
                dest,
                loc_trim = [];

            sel_node.comp = false;

            for (i = sel_node.links.length - 1; i >= 0; i--) {
                link = sel_node.links[i];
                //console.log("lev 0 link:",link);
                dest = link.source != sel_node ? link.source : link.target;
                graphPruneCalc(dest, [sel_node.id], sel_node);

                if (!dest.prune && dest.row == undefined) {
                    graphPruneReset(-1);
                    link.prune += 1;
                    //graphPrune();
                }

                if (dest.prune) {
                    //console.log("PRUNE ALL");
                    graphPrune();
                } else if (dest.row == undefined) {
                    //console.log("PRUNE LOCAL EDGE ONLY");
                    graphPruneReset();
                    loc_trim.push(link);
                    //link.prune = true;
                    //graphPrune();
                } else {
                    //console.log("PRUNE NONE");
                    graphPruneReset();
                }
            }

            if (loc_trim.length < sel_node.links.length) {
                for (i in loc_trim) {
                    loc_trim[i].prune = true;
                }
                graphPrune();
            }

            //graphPruneReset();

            renderGraph();
        }
    };

    this.hideNode = function () {
        if (sel_node && sel_node.id != focus_node_id && node_data.length > 1) {
            sel_node.prune = true;
            // Check for disconnection of the graph
            console.log("hide", sel_node.id);
            var start =
                sel_node.links[0].source == sel_node
                    ? sel_node.links[0].target
                    : sel_node.links[0].source;
            console.log("start", start);
            if (graphCountConnected(start, []) == node_data.length - 1) {
                for (var i in sel_node.links) {
                    console.log("prune", i, sel_node.links[i]);
                    sel_node.links[i].prune = true;
                }
                graphPrune();

                sel_node = node_data[0];
                sel_node_id = sel_node.id;
                renderGraph();
            } else {
                sel_node.prune = false;
                util.setStatusText("Cannot hide non-leaf nodes (try collapsing)");
            }
        } else {
            util.setStatusText("Cannot hide starting node");
        }
    };

    // Called automatically from API module when data records are impacted by edits or annotations
    this.updateData = function (a_data) {
        //console.log( "graph updating:", a_data );

        var j,
            node,
            item,
            l,
            l1,
            same,
            dep_cnt,
            render = false;

        //if ( focus_node_id )
        //    inst.load( focus_node_id, sel_node_id );

        // Scan updates for dependency changes that impact current graph,
        // if found, reload entire graph from DB
        // If not reloading, scan for changes to title, annotations, status...

        for (var i in a_data) {
            item = a_data[i];
            //console.log("examine:",i,item);
            node = findNode(i);
            if (node) {
                if (item.depsAvail) {
                    //console.log("deps avail on existing node:",node.links);
                    // See if deps have changed
                    l1 = {};
                    for (j in node.links) {
                        l = node.links[j];
                        if (l.source.id == i) l1[l.target.id] = l.ty;
                    }
                    //console.log("l1:",l1);

                    same = true;
                    dep_cnt = 0;
                    for (j in item.dep) {
                        l = item.dep[j];
                        //console.log("chk dep",l);
                        if (l.dir == "DEP_OUT") {
                            if (l1[l.id] != model.DepTypeFromString[l.type]) {
                                //console.log("type mismatch",l.id,l1[l.id],l.type);
                                same = false;
                                break;
                            }
                            dep_cnt++;
                        }
                    }

                    if (same && Object.keys(l1).length != dep_cnt) {
                        //console.log("len mismatch", Object.keys( l1 ).length, dep_cnt);
                        same = false;
                    }

                    if (!same) {
                        // Reload graph
                        //console.log("must reload graph (diff deps)");
                        inst.load(focus_node_id, sel_node_id);
                        return;
                    }
                }

                render = true;
                node.locked = item.locked;
                node.notes = item.notes;
                node.size = item.size;
                //console.log("updating:", node);
                makeLabel(node, item);
                if (node == sel_node) panel_info.showSelectedInfo(sel_node_id);
            } else if (item.depsAvail) {
                // See if this node might need to be added to graph
                for (j in item.dep) {
                    l = item.dep[j];
                    if (l.dir == "DEP_OUT" && findNode(l.id)) {
                        //console.log("must reload graph (new ext deps)");
                        inst.load(focus_node_id, sel_node_id);
                        return;
                    }
                }
            }
        }

        if (render) {
            renderGraph();
            a_parent.updateBtnState();
        }
    };

    function graphCountConnected(a_node, a_visited, a_from) {
        var count = 0;

        if (a_visited.indexOf(a_node.id) < 0 && !a_node.prune) {
            a_visited.push(a_node.id);
            count++;
            var link, dest;
            for (var i in a_node.links) {
                link = a_node.links[i];
                if (link != a_from) {
                    dest = link.source == a_node ? link.target : link.source;
                    count += graphCountConnected(dest, a_visited, link);
                }
            }
        }

        return count;
    }

    function graphPrune() {
        var i, j, item;

        for (i = link_data.length - 1; i >= 0; i--) {
            item = link_data[i];
            if (item.prune) {
                //console.log("pruning link:",item);
                if (!item.source.prune) {
                    item.source.comp = false;
                    j = item.source.links.indexOf(item);
                    if (j != -1) {
                        item.source.links.splice(j, 1);
                    } else {
                        console.log("BAD INDEX IN SOURCE LINKS!");
                    }
                }
                if (!item.target.prune) {
                    item.target.comp = false;
                    j = item.target.links.indexOf(item);
                    if (j != -1) {
                        item.target.links.splice(j, 1);
                    } else {
                        console.log("BAD INDEX IN TARGET LINKS!");
                    }
                }
                link_data.splice(i, 1);
            }
        }

        for (i = node_data.length - 1; i >= 0; i--) {
            item = node_data[i];
            if (item.prune) {
                //console.log("pruning node:",item);
                node_data.splice(i, 1);
            }
        }
    }

    function graphPruneReset() {
        var i;
        for (i in node_data) {
            node_data[i].prune = false;
        }
        for (i in link_data) {
            link_data[i].prune = false;
        }
    }

    function simTick() {
        //console.log("tick");
        
        // Update node positions
        nodes.attr("transform", function (d) {
            return "translate(" + d.x + "," + d.y + ")";
        });
        
        // Update label positions with offsets if they exist
        nodes.selectAll("text.label")
            .attr("x", function(d) {
                // Base position (from original code)
                let baseX = d.locked ? r + 12 : r;
                
                // Apply offset if it exists
                if (d.labelOffsetX !== undefined) {
                    return baseX + d.labelOffsetX;
                }
                return baseX;
            })
            .attr("y", function(d) {
                // Base position (from original code)
                let baseY = -r;
                
                // Apply offset if it exists
                if (d.labelOffsetY !== undefined) {
                    return baseY + d.labelOffsetY;
                }
                return baseY;
            });
            
        // Update anchored status visual indicator
        nodes.selectAll("circle.obj")
            .classed("anchored", function(d) {
                return d.anchored === true;
            });

        links
            .attr("x1", function (d) {
                return d.source.x;
            })
            .attr("y1", function (d) {
                return d.source.y;
            })
            .attr("x2", function (d) {
                return d.target.x;
            })
            .attr("y2", function (d) {
                return d.target.y;
            });
    }

    // Graph Init
    var zoom = d3.zoom();

    // TODO Select in our frame only
    svg = d3
        .select(a_id)
        .call(
            zoom.on("zoom", function () {
                svg.attr("transform", d3.event.transform);
            }),
        )
        .append("g");
        
    // Add tooltip to explain interaction controls
    d3.select(a_id)
        .append("div")
        .attr("class", "graph-tooltip")
        .html("<strong>Graph Controls:</strong><br>" +
              "• Drag: Move node<br>" +
              "• Shift+Drag: Anchor node<br>" +
              "• Alt+Drag: Move label<br>" +
              "• Double-click: Toggle anchor");

    defineArrowMarkerDeriv(svg);
    defineArrowMarkerComp(svg);
    defineArrowMarkerNewVer(svg);

    links_grp = svg.append("g").attr("class", "links");

    nodes_grp = svg.append("g").attr("class", "nodes");

    model.registerUpdateListener(this.updateData);

    return this;
}

// Depth-first-search to required nodes, mark for pruning
function graphPruneCalc(a_node, a_visited, a_source) {
    if (a_visited.indexOf(a_node.id) < 0) {
        a_visited.push(a_node.id);

        if (a_node.row != undefined) {
            return false;
        }

        var i,
            prune,
            dest,
            link,
            keep = false;

        for (i in a_node.links) {
            link = a_node.links[i];
            dest = link.source != a_node ? link.source : link.target;
            if (dest != a_source) {
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
