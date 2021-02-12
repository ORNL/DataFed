//import * as model from "./model.js";
//import * as util from "./util.js";
import * as api from "./api.js";
import * as dialogs from "./dialogs.js";
import * as settings from "./settings.js";

var topic_tree;

window.pageLoadTopic = function( key, offset ){
    //console.log("topic pageLoad",key, offset);
    var node = topic_tree.getNodeByKey( key );
    if ( node ){
        node.data.offset = offset;
        //console.log("new offset:",node.data.offset);
        node.load(true);
    }
};

export function show( a_cb ){
    var ele = $(document.createElement('div')),
        frame = $(ele),
        html = "<div class='ui-widget-content' style='height:98%;min-height:0;overflow:auto'>\
                        <div id='dlg_topic_tree' class='no-border' style='min-height:0;overflow:none'></div>\
                </div>";

    frame.html( html );
    var selection = false;
    //var tree;

    api.topicListTopics( null, 0, null, function( ok, a_data ){
        if ( ok ){
            var top,title;

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
                    data.result = { url: api.topicListTopics_url( data.node.key, data.node.data.offset, settings.opts.page_sz ), cache: false };
                },
                postProcess: function( event, data ) {
                    data.result = [];
                    //console.log("post proc:",data.response);

                    if ( data.response.offset > 0 || data.response.total > (data.response.offset + data.response.count) ){
                        var pages = Math.ceil(data.response.total/settings.opts.page_sz), page = 1+data.response.offset/settings.opts.page_sz;
                        data.result.push({ title:"<button class='btn small''"+(page==1?" disabled":"")+" onclick='pageLoadTopic(\""+data.node.key+
                            "\",0)'>First</button> <button class='btn small'"+(page==1?" disabled":"")+" onclick='pageLoadTopic(\""+data.node.key+
                            "\","+(page-2)*settings.opts.page_sz+")'>Prev</button> Page " + page + " of " + pages + " <button class='btn small'"+
                            (page==pages?" disabled":"")+" onclick='pageLoadTopic(\""+data.node.key+"\","+page*settings.opts.page_sz+
                            ")'>Next</button> <button class='btn small'"+(page==pages?" disabled":"")+" onclick='pageLoadTopic(\""+data.node.key+
                            "\","+(pages-1)*settings.opts.page_sz+")'>Last</button>",folder:false,icon:false,checkbox:false,hasBtn:true});
                    }

                    for ( var i in data.response.topic ) {
                        top = data.response.topic[i];
                        title = util.escapeHTML(top.title);
                        //if ( top.id.startsWith("t/"))
                        data.result.push({ title: title.charAt(0).toUpperCase() + title.substr(1), folder:true, icon:false, lazy: true, key: top.id, offset: 0 } );
                    }

                    //if ( !data.result.length )
                    //    data.result.push({title:"(empty)",icon:false});
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
            topic_tree = $.ui.fancytree.getTree("#dlg_topic_tree");
            //$("#dlg_topic_tree", frame).fancytree("getTree");
        }else{
            dialogs.dlgAlert("Service Error",data);
        }
    });

    var options = {
        title: "Select Category",
        modal: true,
        width: 400,
        height: 500,
        resizable: true,
        buttons: [{
            text: "Cancel",
            click: function() {
                $(this).dialog('close');
            }
        },{
            id: "sel_btn",
            text: "Select",
            click: function() {
                var node = topic_tree.activeNode;
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
                $(this).dialog('close');
            }
        }],
        open: function(event,ui){
            $("#sel_btn").button("disable");
        },
        close: function( ev, ui ) {
            $(this).dialog("destroy").remove();
        }
    };

    frame.dialog( options );
}
