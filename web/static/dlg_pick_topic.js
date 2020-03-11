/*jshint multistr: true */

function dlgPickTopic( a_cb ){
    var frame = $(document.createElement('div'));
    var html = "<div class='ui-widget-content' style='height:98%;min-height:0;overflow:auto'>\
                        <div id='dlg_topic_tree' class='no-border' style='min-height:0;overflow:none'></div>\
                </div>";

    frame.html( html );
    var selection = false;
    var tree;

    this.dlgPickTopicPageLoad = function( key, offset ){
        console.log("topic pageLoad",key, offset);
        var node = tree.getNodeByKey( key );
        if ( node ){
            node.data.offset = offset;
            //console.log("new offset:",node.data.offset);
            node.load(true);
        }
    };

    topicList( null, 0, g_opts.page_size, false, function( ok, a_data ){
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
                    data.result = {
                        url: "/api/top/list?id=" + encodeURIComponent( data.node.key ) + "&data=false&offset="+data.node.data.offset+"&count="+g_opts.page_sz,
                        cache: false
                    };
                },
                postProcess: function( event, data ) {
                    data.result = [];
                    console.log("post proc:",data.response);
                    for ( var i in data.response.item ) {
                        top = data.response.item[i];
                        //if ( top.id.startsWith("t/"))
                        data.result.push({ title: top.title.charAt(0).toUpperCase() + top.title.substr(1),folder:true, icon: "ui-icon ui-icon-grip-solid-horizontal",lazy:true,key:top.id,offset:0 } );
                    }

                    if ( data.response.offset > 0 || data.response.total > (data.response.offset + data.response.count) ){
                        var pages = Math.ceil(data.response.total/g_opts.page_sz), page = 1+data.response.offset/g_opts.page_sz;
                        data.result.push({title:"<button class='btn small''"+(page==1?" disabled":"")+" onclick='dlgPickTopicPageLoad(\""+data.node.key+"\",0)'>First</button> <button class='btn small'"+(page==1?" disabled":"")+" onclick='dlgPickTopicPageLoad(\""+data.node.key+"\","+(page-2)*g_opts.page_sz+")'>Prev</button> Page " + page + " of " + pages + " <button class='btn small'"+(page==pages?" disabled":"")+" onclick='dlgPickTopicPageLoad(\""+data.node.key+"\","+page*g_opts.page_sz+")'>Next</button> <button class='btn small'"+(page==pages?" disabled":"")+" onclick='dlgPickTopicPageLoad(\""+data.node.key+"\","+(pages-1)*g_opts.page_sz+")'>Last</button>",folder:false,icon:false,checkbox:false,hasBtn:true});
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
                },
                renderNode: function(ev,data){
                    if ( data.node.data.hasBtn ){
                        $(".btn",data.node.li).button();
                    }
                }
            });
            tree = $("#dlg_topic_tree", frame).fancytree("getTree");
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

                    for ( var i = 0; i < nodes.length; i++ ){
                        if ( !nodes[i].key.startsWith("t/"))
                            break;

                        if ( i > 0 )
                            topic += ".";
                        topic += nodes[i].title;
                    }

                    a_cb( topic.toLowerCase() );
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
