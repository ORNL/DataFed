function dlgDepGraph( main, a_id, a_owner ){
    var frame = $(document.createElement('div'));
    /*
    var dep_link_color = "#049";
    var comp_link_color = "#999";
    var ver_link_color = "#900";
    var main_node_color = "#080";
    var prov_node_color = "#049";
    var other_node_color = "#555"
    var comp_node_color = "#fff"
    var part_node_color = "#888"
    */

    var html = "<style>\
        </style>\
        <div class='row-flex' style='flex:1 1 auto;height:100%'>\
            <svg class='ui-widget-content' style='flex:1 1 55%'>\
            </svg>\
            <div style='flex:1 1 45%;height:100%'>\
                <div class='col-flex' style='height:100%'>\
                    <div style='flex:none;padding:.25em' class='ui-widget-header'>Selection Information:</div>\
                    <div class='ui-widget-content' style='flex:1 1 auto;border-bottom:0;overflow:auto;padding:.25em'>\
                        <div id='id'></div><br>\
                        <div id='title'></div><br>\
                        <div id='descr_hdr' class='sub-header'>Description</div>\
                        <div style='padding:.25em;max-height:10em;overflow:auto' class='ui-widget-content'>\
                            <div id='descr'></div>\
                        </div><br>\
                        <div id='details_hdr' class='sub-header'>Details</div>\
                        <div style='padding:.25em' class='ui-widget-content'>\
                            <div id='details'></div>\
                        </div><br>\
                        <div id='meta_hdr' class='sub-header'>Metadata</div>\
                        <div style='padding:.25em' class='ui-widget-content'>\
                            <div id='meta'><div id='data_md_tree' class='no-border'></div></div>\
                        </div>\
                    </div>\
                </div>\
            </div>\
        </div>";

    frame.html( html );

    var r = 10;
    var node_data, nodes_grp, nodes;
    var link_data, links_grp, links;
    var svg, simulation;
    var dlg_ready = false;
    var graph_loaded = false
    var g_sel_node = null;
    var data_md_tree = null;
    var data_md_empty = true;
    var data_md_empty_src = [{title:"(n/a)", icon:false}];
    var data_md_exp = {};

    $("#descr_hdr",frame).button().click( function(){
        $("#descr",frame).slideToggle();
    });

    $("#details_hdr",frame).button().click( function(){
        $("#details",frame).slideToggle();
    });

    $("#meta_hdr",frame).button().click( function(){
        $("#meta",frame).slideToggle();
    });

    loadGraph();

    function simTick() {
        //console.log("tick");
        nodes
            .attr("transform", function(d) {
                return "translate(" + d.x + "," + d.y + ")"; });

        links
            .attr("x1", function(d) { return d.source.x; })
            .attr("y1", function(d) { return d.source.y; })
            .attr("x2", function(d) { return d.target.x; })
            .attr("y2", function(d) { return d.target.y; });
    }

    function dragStarted(d) {
        //console.log("drag start",d.id);
        if (!d3.event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d3.event.x;
        d.fy = d3.event.y;
    }

    function dragged(d) {
        //console.log("drag",d3.event.x,d3.event.y);
        d.fx = d3.event.x;
        d.fy = d3.event.y;
        simTick(); 
    }

    function dragEnded(d) {
        //console.log("drag start",d.id);
        if (!d3.event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
    }

    function defineArrowMarker( svg, name ){
        svg.append('defs').append('marker')
            .attr('id','arrow-'+name)
            .attr('refX',-3)
            .attr('refY',2)
            .attr('orient','auto')
            .attr('markerWidth',6)
            .attr('markerHeight',4)
            .append('svg:path')
                .attr('class','arrow-path ' + name)
                .attr('d', 'M 6,0 L 0,2 L 6,4')
    }

    function buildObjSrcTree( obj, base ){
        var src = [], k2;
        Object.keys(obj).forEach(function(k) {
            k2 = escapeHTML(k);

            if ( obj[k] === null ){
                src.push({title:k2 + " : null", icon: false })
            }else if ( typeof obj[k] === 'object' ){
                var fkey=base+"."+k2;
                if ( data_md_exp[fkey] ){
                    data_md_exp[fkey] = 10;
                }
                src.push({title:k2, icon: true, folder: true, expanded: data_md_exp[fkey]?true:false, children: buildObjSrcTree(obj[k],fkey)})
            }else if ( typeof obj[k] === 'string' ){
                src.push({title:k2 + " : \"" + escapeHTML( obj[k] ) + "\"", icon: false })
            }else{
                src.push({title:k2 + " : " + obj[k], icon: false })
            }
        });

        return src;
    }

    function showSelectedMetadata( md_str )
    {
        console.log("showSelectedMetadata",md_str);
        if ( md_str ){
            for ( var i in data_md_exp ){
                if ( data_md_exp[i] == 1 )
                    delete data_md_exp[i];
                else
                    data_md_exp[i]--;
            }

            var md = JSON.parse( md_str );
            if ( data_md_exp["Metadata"] )
                data_md_exp["Metadata"] = 10;

            var src = [{title:"Metadata", icon: "ui-icon ui-icon-folder", folder: true, expanded: data_md_exp["Metadata"]?true:false, children: buildObjSrcTree(md,"Metadata")}];

            data_md_tree.reload( src );
            data_md_empty = false;
        } else if ( !data_md_empty ) {
            data_md_tree.reload(data_md_empty_src);
            data_md_empty = true;
        }
    }

    function showSelectedNodeInfo(){
        if ( g_sel_node ){
            viewData( g_sel_node.id, function( item ){
                if ( item ){
                    var date = new Date();
                    var html = "Data ID: " + item.id;
                    if ( item.alias )
                        html += "<br>Alias: " + item.alias;
                    $("#id",frame).html(html);
                    $("#title",frame).text("\"" + item.title + "\"");

                    if ( item.desc )
                        $("#descr",frame).text( item.desc );
                    else
                        $("#descr",frame).text("(n/a)");

                    html = "<table class='info_table'><col width='30%'><col width='70%'>";
                    html += "<tr><td>Keywords:</td><td>" + (item.keyw?item.keyw:"n/a") + "</td></tr>";
                    html += "<tr><td>Topic:</td><td>" + (item.topic?item.topic:"n/a") + "</td></tr>";
                    html += "<tr><td>Locked:</td><td>" + (item.locked?"yes":"no") + "</td></tr>";
                    html += "<tr><td>Repo:</td><td>" + item.repoId.substr(5) + "</td></tr>";
                    html += "<tr><td>Size:</td><td>" + sizeToString( item.size ) + "</td></tr>";
                    if ( item.ct ){
                        date.setTime(item.ct*1000);
                        html += "<tr><td>Created:</td><td>" + date.toLocaleDateString("en-US", g_date_opts) + "</td></tr>";
                    }
                    if ( item.ut ){
                        date.setTime(item.ut*1000);
                        html += "<tr><td>Updated:</td><td>" + date.toLocaleDateString("en-US", g_date_opts) + "</td></tr>";
                    }
                    if ( item.dt ){
                        date.setTime(item.dt*1000);
                        html += "<tr><td>Uploaded:</td><td>" + date.toLocaleDateString("en-US", g_date_opts)+ "</td></tr>";
                    }
                    html += "<tr><td>Owner:</td><td>" + item.owner.substr(2) + (item.owner[0]=="p"?" (project)":"") + "</td></tr>";
                    html += "</table>";

                    $("#details",frame).html(html);
                    showSelectedMetadata( item.metadata );
                }else{
                    $("#id",frame).html("Data ID: " + g_sel_node.id + (g_sel_node.id!=g_sel_node.label?"<br>Alias: "+g_sel_node.label:""));
                    $("#title",frame).text(g_sel_node.title);
                    $("#descr",frame).text("n/a");
                    $("#details",frame).text("n/a");
                    showSelectedMetadata();
                }
            });
        }
    }

    function loadGraph(){
        //console.log("owner:",a_owner);
        dataGetDeps( a_id, function( a_data ){
            //console.log("dep data:",a_data);
            var item, i, j, dep, node;
            node_data = [];
            link_data = [];

            for ( i in a_data.item ){
                item = a_data.item[i];
                console.log("node:",item);
                node = {id:item.id,title:item.title}
                if ( item.alias ){
                    if ( item.owner && item.owner != a_owner )
                        node.label = item.owner.charAt(0)+":"+item.owner.substr(2)+":"+item.alias;
                    else
                        node.label = item.alias;
                }else
                    node.label = item.id;

                if ( item.gen != undefined ){
                    node.row = item.gen;
                    node.col = 0;
                }

                node_data.push(node);
                for ( j in item.dep ){
                    dep = item.dep[j];
                    link_data.push({source:item.id,target:dep.id,ty:DepTypeFromString[dep.type],id:item.id+"-"+dep.id});
                }
            }
            graph_loaded = true;
            if ( dlg_ready )
                refreshGraph();
        });
    }

    function refreshGraph(){
        var g;

        links = links_grp.selectAll('line')
            .data( link_data, function(d) { return d.id; });

        links.enter()
            .append("line")
                .attr('marker-start',function(d){
                    switch ( d.ty ){
                        case 0: return 'url(#arrow-derivation)';
                        case 1: return 'url(#arrow-component)';
                        case 2: return 'url(#arrow-new-version)';
                    }
                })
                .attr('class',function(d){
                    switch ( d.ty ){
                        case 0: return 'link derivation';
                        case 1: return 'link component';
                        case 2: return 'link new-version';
                    }
                });
                /*.attr('stroke',function(d){
                    switch ( d.ty ){
                        case 0: return dep_link_color;
                        case 1: return comp_link_color;
                        case 2: return ver_link_color;
                    }
                });*/

        links.exit()
            .remove();

        links = links_grp.selectAll('line');

        nodes = nodes_grp.selectAll('g')
            .data( node_data, function(d) { return d.id; });

        g = nodes.enter()
            .append("g")
                .attr("class", "node")
                .call(d3.drag()
                    .on("start", dragStarted)
                    .on("drag", dragged)
                    .on("end", dragEnded));

        g.append("circle")
            .attr("r", r)
            /*.attr("fill", function(d){
                if ( d.id == a_id )
                    return main_node_color;
                else if ( d.row != undefined )
                    return prov_node_color;
                else
                    return other_node_color;
            })
            .style('stroke',function(d){
                if ( d.id == a_id )
                    return comp_node_color;
                else
                    return part_node_color;
            })*/
            .attr('class',function(d){
                var res;

                if ( d.id == a_id )
                    res = "main";
                else if ( d.row != undefined )
                    res = "prov";
                else
                    res = "other";

                if ( d.id == a_id )
                    res += " comp";
                else
                    res += " part";

                return res;
            })
            .on("click", function(d,i){
                d3.select(".highlight")
                    .attr("class","select hidden");
                d3.select(this.parentNode).select(".select")
                    .attr("class","select highlight");
                g_sel_node = d;
                showSelectedNodeInfo();
            });

        g.append("circle")
            .attr("r", r*1.5)
            .attr("class", function(d){
                if ( d.id == a_id ){
                    g_sel_node = d;
                    return "select highlight";
                }else
                    return "select hidden";
            });

        g.append("text")
            .text(function(d) {
                return d.label;
            })
            .attr('x', r)
            .attr('y', -r)
            .attr("fill", "white");

        nodes.exit()
            .remove();

        nodes = nodes_grp.selectAll('g');

        if ( simulation ){
            console.log("restart sim");
            simulation
                .nodes(node_data)
                .force("link").links(link_data);

            simulation.alpha(1).restart();
        }else{
            var linkForce = d3.forceLink(link_data)
                .strength(function(d){
                    switch(d.ty){
                        case 0: return .2;
                        case 1: return .2;
                        case 2: return .1;
                    }
                })
                .id( function(d) { return d.id; })

            simulation = d3.forceSimulation()
                .nodes(node_data)
                //.force('center', d3.forceCenter(200,200))
                .force('charge', d3.forceManyBody()
                    .strength(-200))
                .force('row', d3.forceY( function(d,i){ return d.row != undefined ?(200 + d.row*75):0; })
                    .strength( function(d){ return d.row != undefined ?.1:0; }))
                .force('col', d3.forceX(function(d,i){ return d.col != undefined?200:0; })
                    .strength( function(d){ return d.col != undefined ?.1:0; }))
                .force("link", linkForce )
                .on('tick', simTick);

        }

        showSelectedNodeInfo();
    }


    var options = {
        title: "Dependency Graph for Data Record " + a_id,
        modal: true,
        width: 750,
        height: 550,
        resizable: true,
        closeOnEscape: true,
        buttons:[{
            text: "Edit",
            click: function(){
                if ( g_sel_node ){
                    dataEdit( g_sel_node.id, function( data ){
                    });
                }
            }
        },{
            text: "Delete",
            click: function(){
                if ( g_sel_node ){
                    dataDelete( g_sel_node.id,  function(){
                    });
                }
            }
        },{
            text: "Share",
            click: function(){
                if ( g_sel_node ){
                    dataShare( g_sel_node.id );
                }
            }
        },{
            text: "Lock",
            click: function(){
                if ( g_sel_node ){
                    dataLock( g_sel_node.id, true, function(){
                    });
                }
            }
        },{
            text: "Unlock",
            click: function(){
                if ( g_sel_node ){
                    dataLock( g_sel_node.id, false, function(){
                    });
                }
            }
        },{
            text: "Get",
            click: function(){
                if ( g_sel_node ){
                    dataGet( g_sel_node.id );
                }
            }
        },{
            text: "Put",
            click: function(){
                if ( g_sel_node ){
                    dataPut( g_sel_node.id );
                }
            }
        },{
            text: "Close",
            click: function() {
                $(this).dialog('destroy').remove();
            }
        }],
        open: function(event,ui){
            $(this).css('padding', '0');
            $('.ui-dialog-buttonpane').css('margin','0');

            $("#data_md_tree",frame).fancytree({
                extensions: ["themeroller"],
                themeroller: {
                    activeClass: "",
                    addClass: "",
                    focusClass: "",
                    hoverClass: "fancytree-hover",
                    selectedClass: ""
                },
                source: data_md_empty_src,
                selectMode: 1,
                beforeExpand: function(event,data){
                    var path = data.node.title;
                    var par = data.node.parent;
                    while ( par ){
                        if ( par.title == "root" && !par.parent )
                            break;
                        path = par.title + "." + path;
                        par = par.parent;
                    }
        
                    if ( data.node.isExpanded() ){
                        delete data_md_exp[path];
                    }else{
                        data_md_exp[path] = 10;
                    }
                }
            });

            data_md_tree = $("#data_md_tree",frame).fancytree("getTree");

            var zoom = d3.zoom();

            svg = d3.select("svg")
            .call(zoom.on("zoom", function () {
                svg.attr("transform", d3.event.transform)
            }))
            .append("g")

            defineArrowMarker(svg, "derivation");
            defineArrowMarker(svg, "component");
            defineArrowMarker(svg, "new-version");

            links_grp = svg.append("g")
                .attr("class", "links");

            nodes_grp = svg.append("g")
                .attr("class", "nodes");

            dlg_ready = true;
            if ( graph_loaded )
                refreshGraph();
        }
    };

    frame.dialog( options );
}
