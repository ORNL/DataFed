function dlgPickTopic( a_cb ){
    var frame = $(document.createElement('div'));
    var html = "<div class='ui-widget-content' style='height:98%;min-height:0;overflow:auto'>\
                        <div id='dlg_topic_tree' class='no-border' style='min-height:0;overflow:none'></div>\
                </div>";

    frame.html( html );
    var selection = false;

    topicList( null, function( ok, a_data ){
        if ( ok ){
            var top;

            $("#dlg_topic_tree", frame).fancytree({
                extensions: ["themeroller"],
                themeroller: {
                    activeClass: "ui-state-hover",
                    addClass: "",
                    focusClass: "",
                    hoverClass: "ui-state-active",
                    selectedClass: ""
                },
                source: a_data,
                selectMode: 1,
                autoCollapse: true,
                clickFolderMode: 3,
                lazyLoad: function( event, data ) {
                    console.log("node:",data.node);
                    console.log("key:",data.node.key);
                    data.result = {
                        url: "/api/top/list?id=" + encodeURIComponent( data.node.key ),
                        cache: false
                    };
                },
                postProcess: function( event, data ) {
                    data.result = [];
                    console.log("post proc:",data.response);
                    for ( var i in data.response ) {
                        top = data.response[i];
                        if ( top.id.startsWith("t/"))
                            data.result.push({ title: top.title,folder:true, icon: "ui-icon ui-icon-grip-solid-horizontal",lazy:true,key:top.id } );
                    }
                    if ( !data.result.length )
                        data.result.push({title:"(empty)",icon:false});
                },
                collapse: function( ev, data ){
                    console.log("reset",data.node);
                    data.node.resetLazy();
                },
                /*beforeActivate: function(ev,data){
                    if ( !data.node.key.startsWith("t/"))
                        return false;
                },*/
                activate: function() {
                    if ( !selection ){
                        selection = true;
                        $("#sel_btn").button("enable");
                    }
                }
            });
        }else{
            dlgAlert("Service Error",data);
        }
    });

    var options = {
        title: "Select Topic",
        modal: true,
        width: 400,
        height: 500,
        resizable: true,
        closeOnEscape: false,
        buttons: [{
            id: "sel_btn",
            text: "Select",
            click: function() {
                var node = $("#dlg_topic_tree", frame).fancytree("getTree").activeNode;
                if ( node ){
                    var topic = "", nodes = node.getParentList( false, true );
                    //console.log("nodes:",nodes);
                    for ( var i = 0; i < nodes.length; i++ ){
                        if ( !nodes[i].key.startsWith("t/"))
                            break;
                        //console.log("node",i,nodes[i]);
                        if ( i > 0 )
                            topic += ".";
                        topic += nodes[i].title;
                    }

                    a_cb( topic );
                }
                $(this).dialog('destroy').remove();
            }
        },{
            text: "Cancel",
            click: function() {
                $(this).dialog('destroy').remove();
            }
        }],
        open: function(event,ui){
            $("#sel_btn").button("disable");
        }
    };

    frame.dialog( options );
}
