import * as util from "./util.js";
import * as api from "./api.js";
import * as model from "./model.js";
import * as settings from "./settings.js";
import * as panel_info from "./panel_item_info.js";
import * as dlgPickUser from "./dlg_pick_user.js";
import * as dlgPickProj from "./dlg_pick_proj.js";

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
            console.log("cat tree post proc:", data );
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
        cur_coll = {},
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
        sort_rev = false,
        coll_off = 0;

        //coll_div_title = $("#coll_div_title",cat_panel);
        

    const icon_open = "ui-icon-play";

    $(".btn",cat_panel).button();

    this.getSelectedNodes = function(){
        if ( cat_tree_div.is( ":visible" )){
            return cat_tree.getSelectedNodes();
        }else if ( cur_sel ){
            return [{key: cur_sel, data: {}}];
        }else{
            return [];
        }
    }

    this.getActiveNode = function(){
        if ( cat_tree_div.is( ":visible" ))
            return cat_tree.activeNode;
        else if ( cur_sel ){
            return {key: cur_sel, data: {}};
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
        console.log("coll activate");
        var el = $(this), coll = el[0], id = "c/" + coll.id;

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
        var coll = cur_coll[a_coll_id];

        cat_coll_div.empty();
        cat_coll_div.hide();
        topics_panel.hide();

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

        a_parent.updateBtnState();
    }

    function onCollectionOpen( ev ){
        var el = $(this),
            coll=el.closest(".cat-coll"),
            id = "c/" + coll[0].id;

        cur_topic.push({ title: $(".cat-coll-title",coll).text(), id: id });
        setTopicPath();
        back_btn.button( "enable" );

        openCollTree( id );

        ev.stopPropagation()
    }

    function setTopics( data ){
        var html = "";
        if ( data.topic && data.topic.length ){
            var topic;
            for ( var i in data.topic ){
                topic = data.topic[i];
                //ui-button cat-topic
                html += "<div class='cat-topic' id='" + topic.id + "' data='" + topic.title + "'>\
                    <div class='cat-topic-div ui-button ui-corner-all"+(loading?" ui-button-disabled ui-state-disabled":"")+"' style='display:block;text-align:left'>\
                        <div class='row-flex'>\
                            <div style='flex:1 1 none;padding-top:2px'>" + topic.title.charAt(0).toUpperCase() + topic.title.substr(1) + "</div>\
                            <div style='flex:1 1 auto'><div class='cat-topic-cnt'>" + util.countToString(topic.collCnt) + "</div></div>\
                            <div class='cat-topic-btn-div' style='flex:none'><button class='btn btn-icon btn-cat-topic-open'" +
                            (loading?"disabled":"") +
                            "><span class='ui-icon ui-icon-play'></span></button></div>\
                        </div>\
                    </div>\
                </div>";
            }
        }else{
            html = "<div class='cat-topic-empty'>No Categories</div>";
        }

        topics_div.html( html );
        $(".btn",topics_div).button();
    }

    function setSearchTopics( data ){
        var html = "";
        if ( data.topic && data.topic.length ){
            var topic;
            topic_search_path = {};
            for ( var i in data.topic ){
                topic = data.topic[i];
                topic_search_path[topic.id] = topic.path;
                //html += "<div class='cat-topic-result ui-button ui-corner-all' id='" + topic.id + "'>" + topic.title + "</div>";
                html += "<button class='cat-topic-result btn' id='" + topic.id + "'>" + topic.title + "</button>";
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

            /*if ( item.brief ){
                $(".cat-coll-info-brief",div).text( item.brief );
            }else if ( item.desc ){
                if ( item.desc.length > 120 )
                    item.desc.slice(0,120) + " ..."
                $(".cat-coll-info-brief",div).text( item.desc );
            }else{
                $(".cat-coll-info-brief",div).text( "(no description)" );
            }*/
        }else{
            return "<div class='cat-coll-title-div ui-widget-content ui-corner-all ui-button'>\
                        <div class='row-flex'>\
                            <div class='cat-coll-title'>" + item.title + "</div>\
                            <div class='cat-coll-notes'>" + (item.notes?"&nbsp;"+util.generateNoteSpan(item)+"&nbsp;":"") + "</div>\
                            <div class='cat-coll-btn-div'>\
                                <button class='btn btn-icon btn-cat-coll-open'><span class='ui-icon "+ icon_open + "'></span></button>\
                            </div>\
                        </div>\
                        <div class='cat-coll-info-div'>\
                            <div class='cat-coll-info-brief'>"+ (item.brief?item.brief:"(no description)") + "</div>\
                            <div><table class='cat-coll-info-table'><tr><td>" + (item.ownerId.startsWith("u/")
                                ?"Owner:</td><td>" + item.ownerName
                                :"Project:</td><td>"+ item.ownerId.substr(2)) + "</td></tr>\
                                <tr><td>Collection ID:</td><td>" + item.id + (item.alias?" ("+item.alias+")":"") + "</td></tr>" +
                            "</table></div>\
                        </div>\
                    </div>";
        }
    }

    function setCollections( data ){
        //console.log("setCollections",data);
        var html = "", item;
        if ( data.coll && data.coll.length ){
            cur_coll = {};

            //console.log("data",data);
            for ( var i in data.coll ){
                //if ( html )
                //    html += "<hr>";
                item = data.coll[i];
                cur_coll[item.id] = item;

                html += "<div class='cat-coll' id='" + item.id.substr(2) + "'>" + makeCollDiv( item ) + "</div>";

                /*html +=
                    "<div class='cat-coll' id='" + item.id.substr(2) + "'>\
                        <div class='cat-coll-title-div ui-widget-content ui-corner-all ui-button'>\
                            <div class='row-flex'>\
                                <div class='cat-coll-title'>" + item.title + "</div>\
                                <div class='cat-coll-notes'>" + (item.notes?"&nbsp;"+util.generateNoteSpan(item)+"&nbsp;":"") + "</div>\
                                <div class='cat-coll-btn-div'>\
                                    <button class='btn btn-icon btn-cat-coll-open'><span class='ui-icon "+ icon_open + "'></span></button>\
                                </div>\
                            </div>\
                            <div class='cat-coll-info-div'>\
                                <div class='cat-coll-info-brief'>"+ (item.brief?item.brief:"(no description)") + "</div>\
                                <div><table class='cat-coll-info-table'><tr><td>" + (item.ownerId.startsWith("u/")
                                    ?"Owner:</td><td>" + item.ownerName
                                    :"Project:</td><td>"+ item.ownerId.substr(2)) + "</td></tr>\
                                    <tr><td>Collection ID:</td><td>" + item.id + (item.alias?" ("+item.alias+")":"") + "</td></tr>" +
                                "</table></div>\
                            </div>\
                        </div>\
                    </div>";*/
            }
        }else{
            html = "<div class='cat-coll-empty'>No matching collections.<p>Try other categories and/or adjust collection filters.</p></div>"
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

    function loadCollections(){
        $(".cat-coll-prev,.btn-cat-home,.btn-cat-back,.cat-topic-result",cat_panel).button("disable");
        $(".cat-coll-sort",cat_panel).selectmenu("disable");

        loading |= 2;

        cat_coll_div.html( "Loading..." );

        coll_qry.sort = parseInt( $(".cat-coll-sort",cat_panel).val() );
        if ( coll_qry.sort < 0 ){
            coll_qry.sort = -coll_qry.sort;
            coll_qry.sortRev = true;
        }else{
            coll_qry.sortRev = false;
        }

        coll_qry.offset = coll_off;
        coll_qry.count = settings.opts.page_sz;

        coll_qry.tags = topic_tags.concat( user_tags );

        var tmp = $("#cat_text_qry",cat_panel).val().trim();
        if ( tmp ){
            coll_qry.text = tmp;
        }else{
            delete coll_qry.text;
        }

        tmp = $("#cat_qry_owner",cat_panel).val().trim();
        if ( tmp ){
            coll_qry.owner = tmp;
        }else{
            delete coll_qry.owner;
        }

        console.log("col qry", coll_qry );
        api.collPubSearch( coll_qry, function( ok, data ){
            loading &= 1;

            if ( ok ){
                console.log("col data", data );

                setCollections( data );
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

    $("#cat_text_qry,#cat_qry_owner",cat_panel).on("keypress",function( ev ){
        if ( ev.keyCode == 13 ){
            if ( textTimer )
                clearTimeout( textTimer );
            ev.preventDefault();
            coll_off = 0;
            loadCollections();
        }
    });

    $("#cat_text_qry,#cat_qry_owner",cat_panel).on("input",function( ev ){
        if ( textTimer )
            clearTimeout( textTimer );

        textTimer = setTimeout(function(){
            coll_off = 0;
            loadCollections();
            textTimer = null;
        },500);
    });

    $("#cat_qry_text_clear",cat_panel).on("click",function(){
        if ( textTimer )
            clearTimeout( textTimer );
        $("#cat_text_qry",cat_panel).val("");
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
    $(".cat-coll-sort",cat_panel).selectmenu({ width: false });

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
                div = $( "#"+data.id.substr(2), cat_coll_div );
                if ( div.length ){
                    console.log("found",data,div);
                    makeCollDiv( data, div );
                }
            }
        }
    });
    
    top_res_div.html( "(loading...)" );

    loadTopics();
    coll_off = 0;
    loadCollections();

    return this;
}