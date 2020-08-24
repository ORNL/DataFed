import * as util from "./util.js";
import * as api from "./api.js";
import * as model from "./model.js";
import * as settings from "./settings.js";
import * as panel_info from "./panel_item_info.js";

export function newCatalogPanel( a_id, a_frame, a_parent ){
    return new CatalogPanel( a_id, a_frame, a_parent );
}

function CatalogPanel( a_id, a_frame, a_parent ){
    /*
    $( a_id, a_frame ).fancytree({
        toggleEffect: false,
        extensions: ["themeroller","dnd5"],
        themeroller: {
            activeClass: "my-fancytree-active",
            addClass: "",
            focusClass: "",
            hoverClass: "my-fancytree-hover",
            selectedClass: ""
        },
        dnd5:{
            scroll: false,
            preventForeignNodes: true,
            dropEffectDefault: "copy",
            dragStart: function(node, data) {
                if ( node.data.nodrag )
                    return false;

                var key = node.key;

                if ( node.key.startsWith("t/")){
                    if ( node.data.scope ){
                        key = node.data.scope;
                    }else{
                        key = node.title.toLowerCase();
                        while ( node.parent && !node.parent.data.nodrag ){
                            node = node.parent;
                            key = node.title.toLowerCase() + "." + key;
                        }
                    }
                }
                

                data.dataTransfer.setData("text/plain",key);

                return true;
            }
        },
        source: { url: api.topicList_url( null, 0, settings.opts.page_sz ), cache: false },
        nodata: false,
        selectMode: 2,
        activate: function( event, data ) {
            if ( keyNav ){
                cat_tree.selectAll(false);
                data.node.setSelected(true);
                keyNav = false;
            }

            panel_info.showSelectedInfo( data.node, a_parent.checkTreeUpdate );
        },
        select: function( event, data ) {
            if ( data.node.isSelected() ){
                data.node.visit( function( node ){
                    node.setSelected( false );
                });
                var parents = data.node.getParentList();
                for ( var i in parents ){
                    parents[i].setSelected( false );
                }
            }

            a_parent.updateBtnState();
        },
        collapse: function( event, data ) {
            if ( data.node.isLazy() ){
                data.node.resetLazy();
            }
        },
        renderNode: function(ev,data){
            if ( data.node.data.hasBtn ){
                $(".btn",data.node.li).button();
            }
        },
        click: function(event, data) {
            if ( data.targetType == "icon" && data.node.isFolder() ){
                data.node.toggleExpanded();
            } else if ( !search_sel_mode ) {
                if ( data.originalEvent.shiftKey && (data.originalEvent.ctrlKey || data.originalEvent.metaKey)) {
                    util.treeSelectRange( cat_tree, data.node );
                }else if ( data.originalEvent.ctrlKey || data.originalEvent.metaKey ) {
                    if ( data.node.isSelected() ){
                        data.node.setSelected( false );
                    }else{
                        data.node.setSelected( true );
                    }
                }else if ( data.originalEvent.shiftKey ) {
                    cat_tree.selectAll(false);
                    util.treeSelectRange( cat_tree, data.node );
                }else{
                    cat_tree.selectAll(false);
                    data.node.setSelected( true );
                }
            }
        },
        keydown: function(ev, data) {
            if( ev.keyCode == 38 || ev.keyCode == 40 ){
                keyNav = true;
            }
        },
        lazyLoad: function( event, data ) {
            if ( data.node.key.startsWith( "t/" )){
                data.result = { url: api.topicList_url( data.node.key, data.node.data.offset, settings.opts.page_sz ), cache: false };
            } else if ( data.node.key.startsWith( "c/" )){
                data.result = { url: api.collRead_url( data.node.key, data.node.data.offset, settings.opts.page_sz ), cache: false };
            }
        },
        postProcess: function( event, data ) {
            //console.log("cat tree post proc:", data );
            if ( data.node.parent == null || data.node.key.startsWith("t/") || data.node.key.startsWith("c/" )) {
                data.result = [];
                var item,entry;
                var items = data.response.item;
                var scope = data.node.data.scope;

                if ( data.response.offset > 0 || data.response.total > (data.response.offset + data.response.count) ){
                    var pages = Math.ceil(data.response.total/settings.opts.page_sz), page = 1+data.response.offset/settings.opts.page_sz;
                    data.result.push({title:"<button class='btn small''"+(page==1?" disabled":"")+" onclick='pageLoadCat(\""+data.node.key+
                        "\",0)'>First</button> <button class='btn small'"+(page==1?" disabled":"")+" onclick='pageLoadCat(\""+data.node.key+
                        "\","+(page-2)*settings.opts.page_sz+")'>Prev</button> Page " + page + " of " + pages + " <button class='btn small'"+
                        (page==pages?" disabled":"")+" onclick='pageLoadCat(\""+data.node.key+"\","+page*settings.opts.page_sz+
                        ")'>Next</button> <button class='btn small'"+(page==pages?" disabled":"")+" onclick='pageLoadCat(\""+
                        data.node.key+"\","+(pages-1)*settings.opts.page_sz+")'>Last</button>",folder:false,icon:false,checkbox:false,hasBtn:true});
                }

                for ( var i in items ) {
                    item = items[i];
                    if ( item.id[0]=="t" ){
                        if ( item.title.startsWith("u/") ){
                            entry = { title: item.title.substr(2),folder:true,lazy:true,key:item.id,scope:item.title,icon:"ui-icon ui-icon-person",offset:0};
                        }else if ( item.title.startsWith("p/") ){
                            entry = { title: item.title.substr(2),folder:true,lazy:true,key:item.id,scope:item.title,icon:"ui-icon ui-icon-box",offset:0 };
                        }else{
                            entry = { title: item.title.charAt(0).toUpperCase() + item.title.substr(1),folder:true,lazy:true,key:item.id,icon:"ui-icon ui-icon-structure",offset:0 };
                        }
                    }else if ( item.id[0]=="c" ){
                        entry = { title: util.generateTitle(item),folder:true,lazy:true,key:item.id,offset:0,scope:item.owner?item.owner:scope };
                    }else{ // data records
                        entry = { title: util.generateTitle(item),key:item.id, icon: util.getDataIcon( item ),
                            checkbox:false, doi:item.doi, scope:item.owner?item.owner:scope, size:item.size };
                    }

                    data.result.push( entry );
                }
            }

            if ( data.result && data.result.length == 0 ){
                data.result.push({title:"(empty)",icon:false,checkbox:false,nodrag:true});
            }
        },
    });

    var cat_tree = $.ui.fancytree.getTree( "#catalog_tree", a_frame );
    var keyNav = false, search_sel_mode = false;

    this.tree_div = $(a_id,a_frame);
    this.tree = cat_tree;
    */
    var cat_panel = $(".cat-panel"),
        cur_topic_div = $("#cat_cur_topic",cat_panel),
        cur_topic = [],
        back_btn = $(".btn-cat-back",cat_panel),
        top_res_div = $("#cat_topic_result_div",cat_panel),
        cat_coll_div = $("#cat_coll_div",cat_panel),
        topics_panel = $(".topics-div",cat_panel),
        topics_div = $("#cat_topics_div",cat_panel);


    $(".btn",cat_panel).button();

    //$("#cat_topics",cat_panel).selectable({});
    function onTopicClick( ev ){
        var topic = $(this)[0].innerHTML,
            topic_id = $(this)[0].id;

        api.topicListTopics( topic_id, null, null, function( ok, data ){
            if ( ok ){
                cur_topic.push({ name: topic, id: topic_id });
                topic = "";
                for ( var i in cur_topic ){
                    if ( topic.length )
                        topic += ".";
                    topic += cur_topic[i].name;
                }

                cur_topic_div.text( topic );
                back_btn.button("option","disabled",false);
                setTopics( data );
            }
        });

        api.topicListColl( topic_id, 0, 100, function( ok, data ){
            if ( ok ){
                setCollections( data );
            }
        });
    }

    function onSearchTopicClick( ev ){
        var topic = $(this)[0].innerHTML,
            topic_id = $(this)[0].id;

        console.log("topic",topic);

        api.topicListTopics( topic_id, null, null, function( ok, data ){
            if ( ok ){
                cur_topic = [];
                cur_topic_div.text( topic );
                back_btn.button("option","disabled",true);
                setTopics( data );
            }
        });

        api.topicListColl( topic_id, 0, 100, function( ok, data ){
            if ( ok ){
                setCollections( data );
            }
        });
    }

    function onCollectionActivate( ev ){
        var el = $(this), coll = el[0];
        //console.log("this",$(this));
        api.collView( coll.id, function( ok, data ){
            if ( ok ){
                panel_info.showSelectedInfo( coll.id );
                $(".cat-coll-title-div",cat_coll_div).removeClass("ui-state-active");
                $(".cat-coll-title-div",el).addClass("ui-state-active");
            }else{
                dialogs.dlgAlert("Error Reading Collection",data);
            }
        });

        ev.stopPropagation()
    }


    function onDataActivate( ev ){
        var el = $(this), item = el[0], func;
        //console.log("this",$(this));
        if ( item.id.startsWith( "c/" ))
            func = api.collView;
        else
            func = api.dataView;

        func( item.id, function( ok, data ){
            if ( ok ){
                panel_info.showSelectedInfo( item.id );
                $(".cat-data",cat_coll_div).removeClass("ui-state-active");
                el.addClass("ui-state-active");
            }else{
                dialogs.dlgAlert("Error Reading Item",data);
            }
        });

        ev.stopPropagation()
    }

    function onCollectionOpenClose( ev ){
        var el = $(this), coll=el.closest(".cat-coll");

        $(".cat-data-div", cat_coll_div ).remove();
        topics_panel.hide();

        coll.append("<div class='cat-data-div'>(loading...)</div>");
        var cont = $( ".cat-data-div", coll );

        //cont.html( "(loading...)" );

        api.collRead( coll[0].id, 0, 100, function( ok, data ){
            if ( ok ){
                setData( data, cont );
            }else{
                dialogs.dlgAlert("Error Reading Collection",data);
            }
        })
    }

    function setTopics( data ){
        var html = "";
        if ( data.item && data.item.length ){
            var topic;
            for ( var i in data.item ){
                topic = data.item[i];
                html += "<div class='cat-topic' id='" + topic.id + "'>" + topic.title.charAt(0).toUpperCase() + topic.title.substr(1) + "</div>";
            }
        }else{
            html = "(none)";
        }

        topics_div.html( html );
    }

    function setSearchTopics( data ){
        var html = "";
        if ( data.item && data.item.length ){
            var topic;
            for ( var i in data.item ){
                topic = data.item[i];
                html += "<div class='cat-topic' id='" + topic.id + "'>" + topic.title + "</div>";
            }
        }else{
            html = "(no matches)";
        }

        top_res_div.html( html );
    }

    function setCollections( data ){
        console.log("setCollections",data);
        var html = "", item;
        if ( data.item && data.item.length ){
            //console.log("data",data);
            for ( var i in data.item ){
                if ( html )
                    html += "<hr>";
                item = data.item[i];
                html +=
                    "<div class='cat-coll' id='" + item.id + "'>\
                        <div class='row-flex cat-coll-title-div'>\
                            <div class='cat-coll-title'>" + item.title + "</div>\
                            <div class='cat-coll-btn-div'>\
                                <button class='btn btn-icon btn-cat-coll-open'><span class='ui-icon ui-icon-fullscreen'>x</span></button>\
                            </div>\
                        </div>\
                    </div>";
            }
        }else{
            html = "<div class='cat-coll-empty'>No data collections for this topic.</div>"
        }

        cat_coll_div.html( html );
        $(".btn",cat_coll_div).button();

        //$(".cat-topic",cat_panel).on("click", onTopicClick );
    }

    function setData( a_data, a_container ){
        console.log("setData",a_data);
        var html = "", item;
        if ( a_data.item && a_data.item.length ){
            //console.log("data",data);
            for ( var i in a_data.item ){
                item = a_data.item[i];
                html += "<div class='cat-data' id='" + item.id + "'>" + item.title + "</div>";
            }
        }else{
            html = "<div class='cat-data-empty'>No data data in this collection.</div>"
        }

        a_container.html( html );
    }

    $(".btn-cat-home",cat_panel).on("click",function(){
        topics_panel.show();

        cat_coll_div.html( "(loading...)" );
        top_res_div.html( "(loading...)" );

        api.topicListTopics( null, null, null, function( ok, data ){
            if ( ok ){
                setTopics( data );
                cur_topic=[];
                cur_topic_div.text( "Home" );
                back_btn.button("option","disabled",true);
            }
        });

        api.topicListColl( "t/root", 0, 100, function( ok, data ){
            if ( ok ){
                setCollections( data );
            }
        });
    });

    $(".btn-cat-back",cat_panel).on("click",function(){
        topics_panel.show();

        cat_coll_div.html( "(loading...)" );
        top_res_div.html( "(loading...)" );

        var top_id = cur_topic.length>1?cur_topic[cur_topic.length-2].id:"t/root";

        api.topicListTopics( top_id, null, null, function( ok, data ){
            if ( ok ){
                setTopics( data );
                if ( cur_topic.length > 1 ){
                    cur_topic.pop();

                    var topic = "";
                    for ( var i in cur_topic ){
                        if ( topic.length )
                            topic += ".";
                        topic += cur_topic[i].name;
                    }
                    cur_topic_div.text( topic );
                }else{
                    cur_topic=[];
                    cur_topic_div.text( "Home" );
                    back_btn.button("option","disabled",true);
                }
            }
        });

        api.topicListColl( top_id, 0, 100, function( ok, data ){
            if ( ok ){
                setCollections( data );
            }
        });
    });

    $(".btn-cat-topic-res-cls",cat_panel).on("click",function(){
        $("#cat_topic_result_div").hide();
    });

    function searchTopics(){
        var phrase = $("#cat_topic_search_phrase",cat_panel).val().trim();
        if ( phrase ){
            topics_panel.show();
            top_res_div.html( "(loading...)" ).show();

            api.topicSearch( phrase, function( ok, data ){
                console.log("topicSearch handler")
                if ( ok ){
                    setSearchTopics(data);
                }else{
                    setSearchTopics([]);
                    dlgAlert("Topic Search Error",data);
                }
            });
        }else{
            setSearchTopics([]);
        }
    }

    $(".btn-cat-topic-search",cat_panel).on("click",function(){
        searchTopics();
    });

    $("#cat_topic_search_phrase").on('keypress', function (e) {
        if (e.keyCode == 13){
            searchTopics();
        }
    });

    cat_coll_div.html( "(loading...)" );
    top_res_div.html( "(loading...)" );

    api.topicListTopics( null, null, null, function( ok, data ){
        if ( ok ){
            setTopics( data );
        }
    });

    api.topicListColl( "t/root", 0, 100, function( ok, data ){
        if ( ok ){
            setCollections( data );
        }
    });

    topics_div.on("click", ".cat-topic", onTopicClick );
    $("#cat_topic_result_div",cat_panel).on("click", ".cat-topic", onSearchTopicClick );
    cat_coll_div.on("click", ".cat-coll", onCollectionActivate );
    cat_coll_div.on("click", ".btn-cat-coll-open", onCollectionOpenClose );
    cat_coll_div.on("dblclick", ".cat-coll", onCollectionOpenClose );
    cat_coll_div.on("click", ".cat-data", onDataActivate );

    var search_sel_mode = false;

    this.setSearchSelectMode = function( a_enabled ){
        search_sel_mode = a_enabled;
        //cat_tree.setOption("checkbox",a_enabled);
    };

    model.registerUpdateListener( function( a_data ){
        //console.log("cat panel updating:",a_data);

        /*var data;
        // Find impacted nodes in catalog tree and update title
        cat_tree.visit( function(node){
            if ( node.key in a_data ){
                data = a_data[node.key];
                // Update size if changed
                if ( node.key.startsWith("d/") && node.data.size != data.size ){
                    node.data.size = data.size;
                }

                util.refreshNodeTitle( node, data );
            }
        });

        a_parent.updateBtnState();*/
    });
    
    return this;
}