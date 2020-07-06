import * as util from "./util.js";
import * as model from "./model.js";
import * as settings from "./settings.js";
import * as panel_info from "./panel_item_info.js";

export function newCatalogPanel( a_id, a_frame, a_parent ){
    return new CatalogPanel( a_id, a_frame, a_parent );
}

function CatalogPanel( a_id, a_frame, a_parent ){
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
        source:[
            {title:"By Topic",checkbox:false,folder:true,icon:"ui-icon ui-icon-structure",lazy:true,nodrag:true,key:"topics",offset:0}
        ],
        nodata: false,
        selectMode: 2,
        activate: function( event, data ) {
            if ( keyNav ){
                cat_tree.selectAll(false);
                data.node.setSelected(true);
                keyNav = false;
            }

            panel_info.showSelectedInfo( data.node );
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
            if ( data.node.key == "topics" ) {
                data.result = {
                    url: "/api/top/list?offset="+data.node.data.offset+"&count="+settings.opts.page_sz,
                    cache: false
                };
            } else if ( data.node.key.startsWith( "t/" )){
                data.result = {
                    url: "/api/top/list?id=" + encodeURIComponent( data.node.key ) + "&offset="+data.node.data.offset+"&count="+settings.opts.page_sz,
                    cache: false
                };
            } else if ( data.node.key.startsWith( "c/" )){
                data.result = {
                    url: "/api/col/read?offset="+data.node.data.offset+"&count="+settings.opts.page_sz+"&id=" + encodeURIComponent( data.node.key ),
                    cache: false
                };
            }
        },
        postProcess: function( event, data ) {
            if ( data.node.key == "topics" || data.node.key.startsWith("t/") || data.node.key.startsWith("c/" )) {
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
                            entry = { title: item.title.charAt(0).toUpperCase() + item.title.substr(1),folder:true,lazy:true,key:item.id,icon:"ui-icon ui-icon-grip-solid-horizontal",offset:0 };
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

    this.setSearchSelectMode = function( a_enabled ){
        search_sel_mode = a_enabled;
        cat_tree.setOption("checkbox",a_enabled);
    };

    this.tree_div = $(a_id,a_frame);
    this.tree = cat_tree;

    model.registerUpdateListener( function( a_data ){
        console.log("cat panel updating:",a_data);
        // Find impacted nodes in catalog tree and update title
        cat_tree.visit( function(node){
            if ( node.key in a_data ){
                util.refreshNodeTitle( node, a_data[node.key] );
            }
        });
    });
    
    return this;
}