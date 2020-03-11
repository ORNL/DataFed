/*jshint multistr: true */

function dlgPickProject( a_excl, a_single_sel, cb ){
    var content =
        "<div class='ui-widget-content text' style='height:98%;overflow:auto'>\
            <div id='dlg_proj_tree' class='no-border'></div>\
        </div>";

    this.projPageLoad = function( key, offset ){
        var node = tree.getNodeByKey( key );
        if ( node ){
            node.data.offset = offset;
            setTimeout(function(){
                node.load(true);
            },0);
        }
    };

    var frame = $(document.createElement('div'));
    frame.html( content );

    var options = {
        title: "Select Project(s)",
        modal: true,
        width: 400,
        height: 500,
        resizable: true,
        closeOnEscape: false,
        buttons: [{
            id: "ok_btn",
            text: "Ok",
            click: function() {
                users = [];
                //var tree = $("#dlg_proj_tree",frame).fancytree("getTree");
                var sel = tree.getSelectedNodes();
                var key;
                for ( var i in sel ){
                    key = sel[i].key;
                    if ( users.indexOf( key ) == -1 )
                        users.push( key );
                }
                cb( users );
                $(this).dialog('destroy').remove();
            }
        },{
            text: "Cancel",
            click: function() {
                $(this).dialog('destroy').remove();
            }
        }],
        open: function(){
            $("#ok_btn").button("disable");
        }
    };

    var src = [
        {title:"All By ID",icon:"ui-icon ui-icon-folder",folder:true,lazy:true,checkbox:false,key:"all-id",offset:0},
        {title:"All By Title",icon:"ui-icon ui-icon-folder",folder:true,lazy:true,checkbox:false,key:"all-title",offset:0}
    ];

    $("#dlg_proj_tree",frame).fancytree({
        extensions: ["themeroller"],
        themeroller: {
            activeClass: "ui-state-hover",
            addClass: "",
            focusClass: "",
            hoverClass: "ui-state-active",
            selectedClass: ""
        },
        source: src,
        selectMode: a_single_sel?1:2,
        select: function(){
            if ( tree.getSelectedNodes().length ){
                $("#ok_btn").button("enable");
            }else{
                $("#ok_btn").button("disable");
            }
        },
        checkbox: true,
        lazyLoad: function( event, data ) {
            if ( data.node.key == "all-id" ) {
                data.result = {
                    url: "/api/prj/list?sort=0&offset="+data.node.data.offset+"&count="+g_opts.page_sz,
                    cache: false
                };
            } else if ( data.node.key == "all-title" ) {
                data.result = {
                    url: "/api/prj/list?sort=1&offset="+data.node.data.offset+"&count="+g_opts.page_sz,
                    cache: false
                };
            }
        },
        postProcess: function( event, data ) {
            if ( data.node.lazy ){
                console.log("post proc",data.response);
                data.result = [];
                var proj, i;
                if ( data.node.key == "all-title" ){
                    for ( i in data.response.item ) {
                        proj = data.response.item[i];
                        data.result.push({ title: "\"" + proj.title + "\"  ("+proj.id +")",icon:"ui-icon ui-icon-box",key: proj.id, unselectable: (a_excl.indexOf( proj.id ) != -1) });
                    }
                } else {
                    for ( i in data.response.item ) {
                        proj = data.response.item[i];
                        data.result.push({ title: proj.id + "  (\"" + proj.title + ")\"",icon:"ui-icon ui-icon-box",key: proj.id, unselectable: (a_excl.indexOf( proj.id ) != -1) });
                    }
                }

                if ( data.response.offset > 0 || data.response.total > (data.response.offset + data.response.count) ){
                    var pages = Math.ceil(data.response.total/g_opts.page_sz), page = 1+data.response.offset/g_opts.page_sz;
                    data.result.push({title:"<button class='btn small''"+(page==1?" disabled":"")+" onclick='projPageLoad(\""+data.node.key+"\",0)'>First</button> <button class='btn small'"+(page==1?" disabled":"")+" onclick='projPageLoad(\""+data.node.key+"\","+(page-2)*g_opts.page_sz+")'>Prev</button> Page " + page + " of " + pages + " <button class='btn small'"+(page==pages?" disabled":"")+" onclick='projPageLoad(\""+data.node.key+"\","+page*g_opts.page_sz+")'>Next</button> <button class='btn small'"+(page==pages?" disabled":"")+" onclick='projPageLoad(\""+data.node.key+"\","+(pages-1)*g_opts.page_sz+")'>Last</button>",folder:false,icon:false,checkbox:false,hasBtn:true});
                }
            }
        },
        renderNode: function(ev,data){
            if ( data.node.data.hasBtn ){
                $(".btn",data.node.li).button();
            }
        },
    });

    var tree = $("#dlg_proj_tree",frame).fancytree("getTree");

    frame.dialog( options );
}
