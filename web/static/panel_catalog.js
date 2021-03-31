import * as util from "./util.js";
import * as api from "./api.js";
import * as model from "./model.js";
import * as settings from "./settings.js";
import * as panel_info from "./panel_item_info.js";
//import * as dialogs from "./dialogs.js";
import * as dlgPickUser from "./dlg_pick_user.js";
import * as dlgPickProj from "./dlg_pick_proj.js";
import * as dlgSchemaList from "./dlg_schema_list.js";
import * as dlgQueryBuild from "./dlg_query_builder.js";


export function newCatalogPanel( a_id, a_frame, a_parent ){
    return new CatalogPanel( a_id, a_frame, a_parent );
}

function CatalogPanel( a_id, a_frame, a_parent ){

    $( "#cat_coll_tree", a_frame ).fancytree({
        toggleEffect: false,
        extensions: ["themeroller"],
        themeroller: {
            activeClass: "my-fancytree-active",
            hoverClass: ""
        },
        source: [],
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
            if ( data.node.parent ){
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
                    if ( item.id[0]=="c" ){
                        entry = { title: util.generateTitle(item),folder:true,lazy:true,key:item.id,offset:0,scope:item.owner?item.owner:scope };
                    }else{ // data records
                        entry = { title: util.generateTitle(item),key:item.id, icon: util.getDataIcon( item ),
                            checkbox:false, doi:item.doi, scope:item.owner?item.owner:scope, size:item.size };
                    }

                    data.result.push( entry );
                }

                if ( data.result && data.result.length == 0 ){
                    data.result.push({title:"(empty)",icon:false,checkbox:false,nodrag:true});
                }
            }else{
                data.result = data.response;
            }
        },
    });


    //this.tree_div = $(a_id,a_frame);
    //this.tree = cat_tree;

    var cat_panel = $(".cat-panel"),
        cur_topic_div = $("#cat_cur_topic",cat_panel),
        cur_topic = [],
        back_btn = $(".btn-cat-back",cat_panel),
        top_res_div = $("#cat_topic_result_div",cat_panel),
        cat_coll_div = $("#cat_coll_div",cat_panel),
        topics_panel = $(".topics-div",cat_panel),
        topics_div = $("#cat_topics_div",cat_panel),
        date_from = $("#cat_qry_date_from",cat_panel),
        date_from_ts = $("#cat_qry_date_from_ts",cat_panel),
        date_to = $("#cat_qry_date_to",cat_panel),
        date_to_ts = $("#cat_qry_date_to_ts",cat_panel),
        cur_items = {},
        cur_sel = null,
        cat_tree_div = $("#cat_coll_tree", cat_panel),
        cat_tree = $.ui.fancytree.getTree( "#cat_coll_tree", cat_panel ),
        keyNav = false,
        search_sel_mode = false,
        coll_qry = { tags: [], offset: 0, count: 50 },
        topic_tags = [], user_tags = [],
        tags_div = $("#cat_tags_div",cat_panel),
        topic_search_path = {},
        loading = 0,
        cur_mode = model.SM_COLLECTION,
        coll_off = 0;

        //coll_div_title = $("#coll_div_title",cat_panel);
        

    const icon_open = "ui-icon-play";

    $(".btn",cat_panel).button();

    this.getSelectedNodes = function(){
        if ( cat_tree_div.is( ":visible" )){
            return cat_tree.getSelectedNodes();
        }else if ( cur_sel ){
            return [{key: cur_sel, data: cur_items[cur_sel]}];
        }else{
            return [];
        }
    }

    this.getActiveNode = function(){
        if ( cat_tree_div.is( ":visible" ))
            return cat_tree.activeNode;
        else if ( cur_sel ){
            return {key: cur_sel, data: cur_items[cur_sel]};
        }else{
            return null;
        }
    }

    function setTopicPath(){
        var topic;

        if ( cur_topic.length ){
            topic = "";
            for ( var i in cur_topic ){
                if ( topic.length ){
                    if ( cur_topic[i].id.charAt(0) == 't' )
                        topic += ".";
                    else
                        topic += " - ";
                }
                topic += cur_topic[i].title;
            }
        }else{
            topic = "Home";
        }

        cur_topic_div.text( topic );
    }

    function updateTopicNav(){
        if ( !loading ){
            $(".btn-cat-home,.cat-topic-result",cat_panel).button("enable");
            back_btn.button( cur_topic.length?"enable":"disable" );
            $(".cat-topic-div",topics_div).removeClass("ui-button-disabled ui-state-disabled");
            $(".btn",topics_div).button("enable");
            panel_info.showSelectedInfo();
            $(".cat-mode",cat_panel).selectmenu("enable");
            $(".cat-coll-sort",cat_panel).selectmenu("enable");
        }
    }

    function loadTopics( a_topic_id, a_cb ){
        topics_div.html( "Loading..." );
        $(".btn-cat-home,.btn-cat-back,.cat-topic-result",cat_panel).button("disable");
        loading |= 1;

        api.topicListTopics( a_topic_id, null, null, function( ok, data ){
            loading &= 2;

            if ( ok ){
                setTopics( data );
            }

            updateTopicNav();

            if ( a_cb )
                a_cb( ok );
        });

    }

    function onTopicClick( ev ){
        if ( loading )
            return;

        var topic = $(this).closest(".cat-topic"),
            name = topic.attr("data");

        cur_topic.push({ title: name, id: topic[0].id });
        setTopicPath();

        loadTopics( topic[0].id );

        topic_tags.push( name );

        coll_off = 0;
        loadCollections();

        ev.stopPropagation()
    }

    function onTopicActivate( ev ){
        var el = $(this);

        $(".cat-topic-div",topics_div).removeClass("ui-state-active");
        $(".cat-topic-div",el).addClass("ui-state-active");

        console.log("topic ID",el[0].id);

        panel_info.showSelectedInfo( el[0].id );
        a_parent.updateBtnState();

        ev.stopPropagation()
    }

    function onSearchTopicClick( ev ){
        var topic_id = $(this)[0].id;

        //topic = $(this)[0].innerHTML,

        //console.log("topic",topic);
        if ( cat_tree_div.is( ":visible" )){
            closeCollTree();
        }else{
            cur_sel = null;
            a_parent.updateBtnState();
        }

        if ( topic_id in topic_search_path ){
            cur_topic = topic_search_path[topic_id];
        }else{
            cur_topic = [];
        }

        topic_tags = [];
        for ( var i in cur_topic )
            topic_tags.push( cur_topic[i].title );

        setTopicPath();

        loadTopics( topic_id );

        coll_off = 0;
        loadCollections();
    }

    function onCollectionActivate( ev ){
        //console.log("coll activate");
        var el = $(this), coll = el[0], id = coll.id.charAt(0) + "/" + coll.id.substr(2);

        $(".cat-coll-title-div,.cat-item-title",cat_coll_div).removeClass("ui-state-active");
        $(".cat-coll-title-div",el).addClass("ui-state-active");

        panel_info.showSelectedInfo( id );
        cur_sel = id;
        a_parent.updateBtnState();

        ev.stopPropagation()
    }


    /*
    function onDataActivate( ev ){
        console.log("data activate");
        var el = $(this), item = el.parent()[0], func;
        //console.log("this",$(this));
        if ( item.id.startsWith( "c/" ))
            func = api.collView;
        else
            func = api.dataView;

        func( item.id, function( ok, data ){
            if ( ok ){
                panel_info.showSelectedInfo( item.id );
                $(".cat-item-title,.cat-coll-title-div",cat_coll_div).removeClass("ui-state-active");
                el.addClass("ui-state-active");
            }else{
                dialogs.dlgAlert("Error Reading Item",data);
            }
        });

        ev.stopPropagation()
    }*/

    function openCollTree( a_coll_id ){
        if ( cur_mode != model.SM_COLLECTION )
            return;

        var coll = cur_items[a_coll_id];

        cat_coll_div.empty();
        cat_coll_div.hide();
        topics_panel.hide();
        $(".cat-mode",cat_panel).selectmenu("disable");
        $(".cat-coll-sort",cat_panel).selectmenu("disable");

        cat_tree.reload([{title: util.generateTitle( coll ), key: a_coll_id, scope: coll.owner, folder: true, lazy: true, selected: true }])
            .done( function(){
                cat_tree.rootNode.children[0].setExpanded();
            });

        cat_tree_div.show();
        a_parent.updateBtnState();
    }

    function closeCollTree(){
        cat_tree_div.hide();
        cur_sel = null;

        cat_tree.reload([]);

        cat_coll_div.show();
        topics_panel.show();
        $(".cat-mode",cat_panel).selectmenu("enable");
        $(".cat-coll-sort",cat_panel).selectmenu("enable");

        a_parent.updateBtnState();
    }

    function onCollectionOpen( ev ){
        var el = $(this),
            coll=el.closest(".cat-coll"),
            id = coll[0].id;

        id = id.charAt(0) + "/" + id.substr(2);

        cur_topic.push({ title: $(".cat-coll-title",coll).text(), id: id });
        setTopicPath();
        back_btn.button( "enable" );

        openCollTree( id );

        ev.stopPropagation()
    }

    function setTopics( data ){
        var html = "";
        if ( data.topic && data.topic.length ){
            var topic, title;
            for ( var i in data.topic ){
                topic = data.topic[i];
                //ui-button cat-topic
                title = util.escapeHTML(topic.title);
                html += "<div class='cat-topic' id='" + topic.id + "' data='" + title + "'>\
                    <div class='cat-topic-div ui-button ui-corner-all"+(loading?" ui-button-disabled ui-state-disabled":"")+"' style='display:block;text-align:left'>\
                        <div class='row-flex'>\
                            <div style='flex:1 1 none;padding-top:2px'>" + title.charAt(0).toUpperCase() + title.substr(1) + "</div>\
                            <div style='flex:1 1 auto'><div class='cat-topic-cnt'>" + util.countToString(topic.collCnt) + "</div></div>\
                            <div class='cat-topic-btn-div' style='flex:none'><button class='btn btn-icon btn-cat-topic-open'" +
                            (loading?"disabled":"") +
                            "><span class='ui-icon ui-icon-play'></span></button></div>\
                        </div>\
                    </div>\
                </div>";
            }
        }else{
            html = "<div class='cat-topic-empty'>No sub-categories</div>";
        }

        topics_div.html( html );
        $(".btn",topics_div).button();
    }

    function setSearchTopics( data ){
        var html = "";
        if ( data.topic && data.topic.length ){
            var topic,title;
            topic_search_path = {};
            for ( var i in data.topic ){
                topic = data.topic[i];
                topic_search_path[topic.id] = topic.path;
                title = util.escapeHTML(topic.title);
                //html += "<div class='cat-topic-result ui-button ui-corner-all' id='" + topic.id + "'>" + topic.title + "</div>";
                html += "<button class='cat-topic-result btn' id='" + topic.id + "'>" + title + "</button>";
            }
            top_res_div.html( html );
            $(".btn",top_res_div).button();
        }else{
            html = "<div class='cat-topic-result-empty'>No Matches</div>";
            top_res_div.html( html );
        }
    }

    function makeCollDiv( item, div ){
        if ( div ){
            $(".cat-coll-title",div).text( item.title );
            $(".cat-coll-notes",div).html( (item.notes?"&nbsp;"+util.generateNoteSpan(item)+"&nbsp;":"") );
            // There is no way to update brief since it is not returned by updates
        }else{
            //return "<div class='cat-coll-title-div ui-widget-content ui-corner-all '>\
            return "<div class='cat-coll-title-div'>\
                        <div class='row-flex'>\
                            <div class='cat-coll-icon'><span class='ui-icon ui-icon-"+util.getItemIcon(item)+"'></span></div>\
                            <div class='cat-coll-title'>" + util.escapeHTML(item.title) + "</div>\
                            <div class='cat-coll-notes'>" + (item.notes?"&nbsp;"+util.generateNoteSpan(item)+"&nbsp;":"") + "</div>"+
                            (cur_mode==model.SM_COLLECTION?"<div class='cat-coll-btn-div'><button class='btn btn-icon btn-cat-coll-open'><span class='ui-icon "+ icon_open + "'></span></button></div>":"") +
                        "</div>\
                        <div class='cat-coll-info-div'>\
                            <div class='cat-coll-info-brief'>"+ (item.desc?util.escapeHTML(item.desc):"(no description)") + "</div>\
                            <div><table class='cat-coll-info-table'><tr><td>" + (item.owner.startsWith("u/")
                                ?"Owner:</td><td>" + item.ownerName
                                :"Project:</td><td>"+ item.owner.substr(2)) + "</td></tr>\
                                <tr><td>Collection ID:</td><td>" + item.id + (item.alias?" ("+item.alias+")":"") + "</td></tr>" +
                            "</table></div>\
                        </div>\
                    </div>";
        }
    }

    function setItems( data ){
        //console.log("setItems",data);
        var html = "", item;
        if ( data.item && data.item.length ){
            cur_items = {};

            //console.log("cur_items",data);
            for ( var i in data.item ){
                item = data.item[i];
                cur_items[item.id] = item;
                html += "<div class='cat-coll' id='" + item.id.charAt(0) + "_" + item.id.substr(2) + "'>" + makeCollDiv( item ) + "</div>";
            }
        }else{
            html = "<div class='cat-coll-empty'>No matching collections or data records.<p>Try other categories and/or adjust filter options.</p></div>"
        }

        $(".cat-coll-prev",cat_panel).button(data.offset?"enable":"disable");
        $(".cat-coll-next",cat_panel).button((data.offset+data.count)<data.total?"enable":"disable");

        cat_coll_div.html( html );
        $(".btn",cat_coll_div).button();
        cur_sel = null;
        a_parent.updateBtnState();
    }

    /*
    function setData( a_data, a_container, a_parent ){
        console.log("setData",a_data);
        var html, item;

        if ( a_data.item && a_data.item.length ){
            //console.log("data",data);
            html = ""; //"<div class='cat-item-path'>Viewing <span class='cat-coll-cur-path'>/</span></div>";
            for ( var i in a_data.item ){
                item = a_data.item[i];
                if ( item.id.startsWith("d/")){
                    html +=
                    "<div class='cat-item' id='" + item.id + "'>\
                        <div class='cat-item-title row-flex'>\
                            <div style='flex:none'><span style='font-size:120%' class='ui-icon ui-icon-"+util.getDataIcon(item)+"'></span></div>\
                            <div class='' style='flex:1 1 auto'>&nbsp;" + item.title + "</div>\
                        </div>\
                    </div>";
                }else{
                    html += 
                    "<div class='cat-item' id='" + item.id + "'>\
                        <div class='cat-item-title cat-folder row-flex'>\
                            <div style='flex:none'><span style='font-size:120%' class='ui-icon ui-icon-"+util.getKeyIcon(item.id)+"'></span></div>\
                            <div class='' style='flex:1 1 auto'>&nbsp;" + item.title + "</div>\
                            <div style='flex:none'><button class='btn btn-icon btn-cat-folder-open'><span class='ui-icon "+icon_open+"'></span></button></div>\
                        </div>\
                    </div>";
                }
            }
        }else{
            html = "<div class='cat-data-empty'>No data data in this collection.</div>"
        }

        a_container.html( html );
       
        $(".btn",a_container).button();
    }
    */

    $(".btn-cat-home",cat_panel).on("click",function(){
        if ( cat_tree_div.is( ":visible" )){
            closeCollTree();
        }else{
            cur_sel = null;
            a_parent.updateBtnState();
        }

        cat_coll_div.html( "Loading..." );

        loadTopics( null, function(){
            cur_topic=[];
            cur_topic_div.text( "Home" );
        });

        topic_tags = [];
        coll_off = 0;
        loadCollections();
    });

    $(".btn-cat-back",cat_panel).on("click",function(){
        if ( cat_tree_div.is( ":visible" )){
            closeCollTree();
        }else{
            cur_sel = null;
            a_parent.updateBtnState();
        }

        cat_coll_div.html( "Loading..." );
        var top_id = cur_topic.length>1?cur_topic[cur_topic.length-2].id:null

        if ( cur_topic.length ){
            cur_topic.pop();
            setTopicPath();
        }

        topic_tags.pop();

        loadTopics( top_id );
        coll_off = 0;
        loadCollections();
    });


    $(".btn-cat-topic-res-cls",cat_panel).on("click",function(){
        $("#cat_topic_result_div").hide();
        $(".cat-search-div",cat_panel).hide();
    });

    function searchTopics(){
        var phrase = $("#cat_topic_search_phrase",cat_panel).val().trim();
        if ( phrase ){
            topics_panel.show();
            top_res_div.html( "(loading...)" ).show();

            api.topicSearch( phrase, function( ok, data ){
                //console.log("topicSearch handler",data);
                if ( ok ){
                    setSearchTopics( data );
                }else{
                    setSearchTopics({});
                    util.setStatusText( "Topic search error " + data, true );
                }
            });
        }else{
            setSearchTopics({});
        }
    }

    
    
    $(".btn-cat-search",cat_panel).on("click",function(){
        $(".cat-search-div",cat_panel).toggle();
    });

    $(".btn-cat-topic-search",cat_panel).on("click",function(){
        searchTopics();
    });

    $("#cat_topic_search_phrase").on('keypress', function (e) {
        if (e.keyCode == 13){
            searchTopics();
        }
    });

    topics_div.on("click", ".cat-topic", onTopicActivate );
    topics_div.on("dblclick", ".cat-topic", onTopicClick );
    topics_div.on("click", ".btn-cat-topic-open", onTopicClick );

    $("#cat_topic_result_div",cat_panel).on("click", ".cat-topic-result", onSearchTopicClick );
    cat_coll_div.on("click", ".cat-coll", onCollectionActivate );
    cat_coll_div.on("click", ".btn-cat-coll-open", onCollectionOpen );
    cat_coll_div.on("dblclick", ".cat-coll-title-div", onCollectionOpen );

    cat_panel.on("click", ".cat-coll-next", onCollectionsNext );
    cat_panel.on("click", ".cat-coll-prev", onCollectionsPrev );

    $(".cat-mode",cat_panel).on("selectmenuchange", function(){
        cur_mode = parseInt( $(".cat-mode",cat_panel).val() );
        if ( cur_mode == model.SM_DATA ){
            $("#cat_qry_data_div",cat_panel).show();
        }else{
            $("#cat_qry_data_div",cat_panel).hide();
        }
        loadCollections();
    });

    $(".cat-coll-sort",cat_panel).on("selectmenuchange", function(){
        loadCollections();
    });
    

    /*cat_panel.on("click", ".cat-coll-sort-dir", function(){
        if ( sort_rev ){
            sort_rev = false;
            $(".cat-coll-sort-dir span",cat_panel).removeClass("ui-icon-arrow-1-s").addClass("ui-icon-arrow-1-n");
        }else{
            sort_rev = true;
            $(".cat-coll-sort-dir span",cat_panel).removeClass("ui-icon-arrow-1-n").addClass("ui-icon-arrow-1-s");
        }
    });*/
    

    this.getCollectionQuery = function(){
        return coll_qry;
    }


    tags_div.tagit({
        autocomplete: {
            delay: 500,
            minLength: 3,
            source: "/api/tag/autocomp"
        },
        caseSensitive: false,
        removeConfirmation: true,
        afterTagAdded: function( ev, ui ){
            user_tags.push( ui.tagLabel );
            coll_off = 0;
            loadCollections();
        },
        beforeTagRemoved: function( ev, ui ){
            var idx = user_tags.indexOf( ui.tagLabel );
            if ( idx != -1 )
                user_tags.splice( idx, 1 );
            coll_off = 0;
            loadCollections();
        }
    });

    $(".tagit-new",cat_panel).css("clear","left");

    $("#cat_qry_tags_clear",cat_panel).on("click",function(){
        tags_div.tagit("removeAll");
        coll_off = 0;
        loadCollections();
    });

    var textTimer = null;

    $("#cat_text_qry,#cat_qry_owner,#cat_qry_creator,#cat_meta_qry,#cat_qry_sch_id",cat_panel).on("keypress",function( ev ){
        if ( ev.keyCode == 13 ){
            if ( textTimer )
                clearTimeout( textTimer );
            ev.preventDefault();
            coll_off = 0;
            loadCollections();
        }
    });

    $("#cat_text_qry,#cat_qry_owner,#cat_qry_creator",cat_panel).on("input",function( ev ){
        if ( textTimer )
            clearTimeout( textTimer );

        textTimer = setTimeout(function(){
            coll_off = 0;
            loadCollections();
            textTimer = null;
        },1000);
    });

    $("#cat_qry_text_clear",cat_panel).on("click",function(){
        if ( textTimer )
            clearTimeout( textTimer );
        $("#cat_text_qry",cat_panel).val("");
        coll_off = 0;
        loadCollections();
    });

    $("#cat_qry_sch_pick",cat_panel).on("click",function(){
        dlgSchemaList.show( true, false, function( schema ){
            $("#cat_qry_sch_id",cat_panel).val( schema.id + ":" + schema.ver );
            coll_off = 0;
            loadCollections();
        });
    });

    $("#cat_qry_sch_clear",cat_panel).on("click",function(){
        if ( textTimer )
            clearTimeout( textTimer );
        $("#cat_qry_sch_id",cat_panel).val("");
        coll_off = 0;
        loadCollections();
    });

    $("#cat_qry_build",cat_panel).on("click",function(){
        console.log("qry build click");
        dlgQueryBuild.show();
    });

    $("#cat_qry_meta_clear",cat_panel).on("click",function(){
        if ( textTimer )
            clearTimeout( textTimer );
        $("#cat_meta_qry",cat_panel).val("");
        coll_off = 0;
        loadCollections();
    });

    $( "#cat_qry_meta_err", cat_panel ).change( function(){
        if ( textTimer )
            clearTimeout( textTimer );
        coll_off = 0;
        loadCollections();
    });

    $("#cat_qry_owner_pick_user",cat_panel).on("click",function(){
        dlgPickUser.show( "u/"+settings.user.uid, [], true, function( users ){
            $("#cat_qry_owner",cat_panel).val( users[0] );
            coll_off = 0;
            loadCollections();
        });
    });

    $("#cat_qry_owner_pick_proj",cat_panel).on("click",function(){
        dlgPickProj.show( [], true, function( proj ){
            $("#cat_qry_owner",cat_panel).val( proj[0] );
            coll_off = 0;
            loadCollections();
        });
    });

    $("#cat_qry_owner_clear",cat_panel).on("click",function(){
        if ( textTimer )
            clearTimeout( textTimer );
        $("#cat_qry_owner",cat_panel).val("");
        coll_off = 0;
        loadCollections();
    });

    $("#cat_qry_creator_pick_user",cat_panel).on("click",function(){
        dlgPickUser.show( "u/"+settings.user.uid, [], true, function( users ){
            $("#cat_qry_creator",cat_panel).val( users[0] );
            coll_off = 0;
            loadCollections();
        });
    });

    $("#cat_qry_creator_clear",cat_panel).on("click",function(){
        if ( textTimer )
            clearTimeout( textTimer );
        $("#cat_qry_creator",cat_panel).val("");
        coll_off = 0;
        loadCollections();
    });

    $("#cat_qry_datetime_clear",cat_panel).on("click",function(){
        if ( textTimer )
            clearTimeout( textTimer );

        date_from.val("");
        date_to.val("");
        coll_off = 0;
        loadCollections();
    });

    var search_sel_mode = false;

    $("#cat_top_sidebar").resizable({
        handles:"s",
        stop: function(event, ui){
            /*
            var cellPercentH=100 * ui.originalElement.outerHeight()/ $(".topics-div",cat_panel).innerHeight();
            ui.originalElement.css('height', cellPercentH + '%');  
            var nextCell = ui.originalElement.next();
            var nextPercentH=100 * nextCell.outerHeight()/ $(".topics-div",cat_panel).innerHeight();
            nextCell.css('height', nextPercentH + '%');
            */
        }
    });

    util.inputTheme( $('input,textarea',cat_panel));
    $(".cat-mode",cat_panel).selectmenu({ width: false });
    $(".cat-coll-sort",cat_panel).selectmenu({ width: false });

    $(".accordion.acc-act",cat_panel).accordion({
        header: "h3",
        collapsible: true,
        heightStyle: "content",
        create: function( ev, ui ){
            ui.header.removeClass("ui-state-active");
        },
        activate: function( ev, ui ){
            ui.newHeader.removeClass("ui-state-active");
        }
    });

    $(".accordion:not(.acc-act)",cat_panel).accordion({
        header: "h3",
        collapsible: true,
        heightStyle: "content",
        active: false,
        activate: function( ev, ui ){
            ui.newHeader.removeClass("ui-state-active");
        }
    });

    date_from.datepicker({
        altField: "#cat_qry_date_from_ts",
        altFormat: "@",
        beforeShow: function(){
            var _to = date_to.val();
            if ( _to ){
                date_from.datepicker( "option", "maxDate", _to );
            }
        },
        onClose: function( date ){
            if ( date ){
                coll_off = 0;
                loadCollections();
            }
        }
    });

    date_to.datepicker({
        altField: "#cat_qry_date_to_ts",
        altFormat: "@",
        beforeShow: function( input, picker ){
            var _from = date_from.val();
            if ( _from ){
                date_to.datepicker( "option", "minDate", _from );
            }
        },
        onClose: function( date ){
            if ( date ){
                coll_off = 0;
                loadCollections();
            }
        }
    });

    // Prevent active tabs from being highlighted
    /*$(".accordion .ui-accordion-header",cat_panel).click(function(e) {
        $(this).removeClass("ui-state-active");
    });*/

    this.setSearchSelectMode = function( a_enabled ){
        search_sel_mode = a_enabled;
        //cat_tree.setOption("checkbox",a_enabled);
    };

    this.refreshUI = function( a_ids, a_data, a_reload ){
        // This doesn't work yet
        /*console.log("cat refresh",a_ids,a_data);
        if ( !a_ids || !a_data ){
            if ( cat_tree_div.is( ":visible" )){
                cat_tree.reload();
            }else{
                loadCollections();
            }
        }*/
    }
    
    model.registerUpdateListener( function( a_data ){
        console.log("cat panel updating:",a_data);
        var data;

        if ( cat_tree_div.is( ":visible" )){
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
    
            a_parent.updateBtnState();
        }else{
            // Only care about collections in updates
            var div;
            for ( var i in a_data ){
                data = a_data[i];
                div = $( "#"+data.id.charAt(0)+"_"+data.id.substr(2), cat_coll_div );
                if ( div.length ){
                    console.log("found",data,div);
                    makeCollDiv( data, div );
                }
            }
        }
    });
 
    function loadCollections(){
        $(".cat-coll-prev,.btn-cat-home,.btn-cat-back,.cat-topic-result",cat_panel).button("disable");
        $(".cat-mode",cat_panel).selectmenu("disable");
        $(".cat-coll-sort",cat_panel).selectmenu("disable");

        loading |= 2;

        cat_coll_div.html( "Loading..." );

        coll_qry.scope = model.SS_PUBLIC;
        coll_qry.mode = parseInt( $(".cat-mode",cat_panel).val() );
        coll_qry.sort = parseInt( $(".cat-coll-sort",cat_panel).val() );

        if ( coll_qry.sort < 0 ){
            coll_qry.sort = -coll_qry.sort;
            coll_qry.sortRev = true;
        }else{
            coll_qry.sortRev = false;
        }

        coll_qry.offset = coll_off;
        coll_qry.count = settings.opts.page_sz;
        coll_qry.catTags = topic_tags;
        coll_qry.tags = user_tags;

        var tmp = $("#cat_text_qry",cat_panel).val().trim();
        if ( tmp ){
            coll_qry.text = tmp;
        }else{
            delete coll_qry.text;
        }

        if ( coll_qry.mode == model.SM_DATA ){
            tmp = $("#cat_qry_sch_id",cat_panel).val().trim();
            if ( tmp ){
                coll_qry.schId = tmp;
            }else{
                delete coll_qry.schId;
            }

            tmp = $("#cat_meta_qry",cat_panel).val().trim();
            if ( tmp ){
                coll_qry.meta = tmp;
            }else{
                delete coll_qry.meta;
            }

            if ( $( "#cat_qry_meta_err", cat_panel ).prop("checked")){
                coll_qry.metaErr = true;
            }else{
                delete coll_qry.metaErr;
            }
        }else{
            delete coll_qry.schId;
            delete coll_qry.meta;
            delete coll_qry.metaErr;
        }

        tmp = $("#cat_qry_owner",cat_panel).val().trim();
        if ( tmp ){
            coll_qry.owner = tmp;
        }else{
            delete coll_qry.owner;
        }

        tmp = $("#cat_qry_creator",cat_panel).val().trim();
        if ( tmp ){
            coll_qry.creator = tmp;
        }else{
            delete coll_qry.creator;
        }

        if ( date_from.val() ){
            coll_qry.from = parseInt( date_from_ts.val() )/1000;
        }else{
            delete coll_qry.from;
        }

        if ( date_to.val() ){
            coll_qry.to = parseInt( date_to_ts.val() )/1000;
        }else{
            delete coll_qry.to;
        }

        console.log("cat qry", coll_qry );

        api.dataSearch( coll_qry, function( ok, data ){
            loading &= 1;

            if ( ok ){
                setItems( data );
            }else{
                setItems( [] );
                util.setStatusText( data, true );
                //dialogs.dlgAlert( "Catalog Search Error", data );
            }

            updateTopicNav();
        });
    }

    function onCollectionsNext(){
        coll_off += settings.opts.page_sz;

        loadCollections();
    }

    function onCollectionsPrev(){
        if ( coll_off > settings.opts.page_sz )
            coll_off -= settings.opts.page_sz;
        else
        coll_off = 0;

        loadCollections();
    }

    top_res_div.html( "(loading...)" );

    loadTopics();
    coll_off = 0;
    loadCollections();

    return this;
}