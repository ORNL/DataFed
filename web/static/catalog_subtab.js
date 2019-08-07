function CatalogSubTab( browser, frame ){
    var inst = this;

    this.browser = browser;
    this.frame = frame;

    this.catTreePageLoad = function( key, offset ){
        //console.log("pageLoad",key, offset);
        var node = inst.cat_tree.getNodeByKey( key );
        if ( node ){
            node.data.offset = offset;
            setTimeout(function(){
                node.load(true);
            },0);
        }
    }

    $("#catalog_tree", frame ).fancytree({
        toggleEffect: false,
        extensions: ["themeroller"],
        themeroller: {
            activeClass: "my-fancytree-active",
            addClass: "",
            focusClass: "",
            hoverClass: "my-fancytree-hover",
            selectedClass: ""
        },
        source:[
            {title:"Topics <i class='browse-reload ui-icon ui-icon-reload'></i>",checkbox:false,folder:true,icon:"ui-icon ui-icon-structure",lazy:true,nodrag:true,key:"topics",offset:0}
        ],
        selectMode: 1,
        activate: function( event, data ) {
            data.node.setSelected( true );
            browser.showSelectedInfo( data.node );
        },
        select: function( event, data ) {
            /*if ( data.node.isSelected() ){
                data.node.visit( function( node ){
                    node.setSelected( false );
                });
                var parents = data.node.getParentList();
                for ( i in parents ){
                    parents[i].setSelected( false );
                }
            }*/

            browser.updateBtnState();
        },
        collapse: function( event, data ) {
            if ( data.node.isLazy() ){
                data.node.resetLazy();
            }
        },
        click: function(event, data) {
            if ( data.targetType == "icon" && data.node.isFolder() ){
                data.node.toggleExpanded();
            }
        },
        lazyLoad: function( event, data ) {
            if ( data.node.key == "topics" ) {
                data.result = {
                    url: "/api/top/list?offset="+data.node.data.offset+"&count="+g_opts.page_sz,
                    cache: false
                };
            } else if ( data.node.key.startsWith( "t/" )){
                data.result = {
                    url: "/api/top/list?id=" + encodeURIComponent( data.node.key ) + "&offset="+data.node.data.offset+"&count="+g_opts.page_sz,
                    cache: false
                };
            }
        },
        postProcess: function( event, data ) {
            if ( data.node.key == "topics" || data.node.key.startsWith("t/") ) {
                data.result = [];
                var item,entry;
                var items = data.response.item;
                console.log("topic resp:",data.response);
                for ( var i in items ) {
                    item = items[i];
                    if ( item.id[0]=="t" ){
                        entry = { title: item.title.charAt(0).toUpperCase() + item.title.substr(1),folder:true,lazy:true,scope:"topics",key:item.id,icon:"ui-icon ui-icon-grip-solid-horizontal",nodrag:true,offset:0 };
                    }else{
                        entry = { title:browser.generateTitle(item),tooltip:browser.generateTooltip(item),scope:item.owner,key:item.id,icon:item.doi?"ui-icon ui-icon-linkext":"ui-icon ui-icon-file",checkbox:false,doi:item.doi };
                    }
    
                    data.result.push( entry );
                }
    
                if ( data.response.offset > 0 || data.response.total > (data.response.offset + data.response.count) ){
                    var pages = Math.ceil(data.response.total/g_opts.page_sz), page = 1+data.response.offset/g_opts.page_sz;
                    data.result.push({title:"<button class='btn small''"+(page==1?" disabled":"")+" onclick='catTreePageLoad(\""+data.node.key+"\",0)'>First</button> <button class='btn small'"+(page==1?" disabled":"")+" onclick='catTreePageLoad(\""+data.node.key+"\","+(page-2)*g_opts.page_sz+")'>Prev</button> Page " + page + " of " + pages + " <button class='btn small'"+(page==pages?" disabled":"")+" onclick='catTreePageLoad(\""+data.node.key+"\","+page*g_opts.page_sz+")'>Next</button> <button class='btn small'"+(page==pages?" disabled":"")+" onclick='catTreePageLoad(\""+data.node.key+"\","+(pages-1)*g_opts.page_sz+")'>Last</button>",folder:false,icon:false,checkbox:false,hasBtn:true});
                }
            }

            if ( data.result && data.result.length == 0 ){
                data.result.push({title:"(empty)",icon:false,checkbox:false,nodrag:true});
            }
        },
    });

    this.cat_tree_div = $('#catalog_tree',frame);
    this.cat_tree = this.cat_tree_div.fancytree('getTree');

    return this;
}