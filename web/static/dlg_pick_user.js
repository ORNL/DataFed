import * as settings from "./settings.js";
import * as util from "./util.js";
import * as api from "./api.js";
import * as dialogs from "./dialogs.js";

var tree, result_tree;

window.userPageLoad = function( key, offset ){
    var node = tree.getNodeByKey( key );
    if ( node ){
        node.data.offset = offset;
        setTimeout(function(){
            node.load(true);
        },0);
    }
};

window.userResPageLoad = function( offset ){

};

export function show(  a_uid, a_excl, a_single_sel, cb ){
    var frame = $(document.createElement('div'));
    frame.html(
        "<div id='user_tabs' style='height:100%;padding:0;overflow:none' class='tabs-no-header no-border'>\
            <ul>\
                <li><a href='#tab_user_browse'>Browse</a></li>\
                <li><a href='#tab_user_search'>Search</a></li>\
            </ul>\
            <div id='tab_user_browse' class='ui-widget-content text' style='overflow:auto;padding:0'>\
                <div id='user_tree' class='no-border'></div>\
            </div>\
            <div id='tab_user_search' class='ui-widget-content' style='overflow:auto;padding:.5em'>\
                <div class='col-flex' style='height:100%'>\
                    <div style='flex:none'>Name/UID:</div>\
                    <div style='flex:none;padding:0.25em 0 0 0'><input id='search_input' type='text' style='width:100%'></input></div>\
                    <div style='flex:none;padding:0.5em 0 .25em 0'>Search Results:</div>\
                    <div style='flex:auto' class='ui-widget-content text'>\
                        <div id='results_tree' class='no-border'></div>\
                    </div>\
                </div>\
            </div>\
        </div>" );

    var sel_users = [];

    var options = {
        title: "Select User(s)",
        modal: true,
        width: 400,
        height: 500,
        resizable: true,
        resizeStop: function(ev,ui){
            $("#user_tabs",frame).tabs("refresh");
        },
        buttons: [{
            text: "Cancel",
            click: function() {
                $(this).dialog('close');
            }
        },{
            id:"ok_btn",
            text: "Ok",
            click: function() {
                cb( sel_users );
                $(this).dialog('close');
            }
        }],
        open: function(event,ui){
            $(this).css('padding', '0');
            $("#user_tabs",frame).tabs({heightStyle:"fill"});
            $("#ok_btn").button("disable");
        },
        close: function( ev, ui ) {
            $(this).dialog("destroy").remove();
        }
    };

    $( "#user_tabs", frame ).tabs({ active: 0 });

    util.inputTheme( $('input:text', frame ));

    var src = [
        {title:"Collaborators",icon:"ui-icon ui-icon-view-list",folder:true,lazy:true,checkbox:false,key:"collab"},
        {title:"By Groups",icon:"ui-icon ui-icon-view-list",folder:true,lazy:true,checkbox:false,key:"groups"},
        {title:"All",icon:"ui-icon ui-icon-folder",folder:true,lazy:true,checkbox:false,key:"all",offset:0}
    ];

    $("#user_tree",frame).fancytree({
        extensions: ["themeroller"],
        themeroller: {
            activeClass: "ui-state-hover",
            addClass: "",
            focusClass: "",
            hoverClass: "ui-state-active",
            selectedClass: ""
        },
        source: src,
        nodata: false,
        selectMode: a_single_sel?1:2,
        select: function( ev, data ){
            var idx = sel_users.indexOf( data.node.key );
            if ( data.node.isSelected()){
                if ( idx == -1 ){
                    sel_users.push( data.node.key );
                    tree.visit( function( vnode ){
                        if ( vnode.key == data.node.key )
                            vnode.setSelected( true );
                    });
                }
            }else{
                if ( idx != -1 ){
                    sel_users.splice( idx, 1 );
                    tree.visit( function( vnode ){
                        if ( vnode.key == data.node.key )
                            vnode.setSelected( false );
                    });
                }
            }

            if ( sel_users.length ){
                $("#ok_btn").button("enable");
            }else{
                $("#ok_btn").button("disable");
            }
        },
        checkbox: true,
        lazyLoad: function( ev, data ) {
            if ( data.node.key == "collab" ) {
                data.result = {
                    url: "/api/usr/list/collab?offset="+data.node.data.offset+"&count="+settings.opts.page_sz,
                    cache: false
                };
            } else if ( data.node.key == "groups" ) {
                data.result = {
                    url: "/api/grp/list?uid="+a_uid,
                    cache: false
                };
            } else if ( data.node.key == "all" ) {
                data.result = {
                    url: "/api/usr/list/all?offset="+data.node.data.offset+"&count="+settings.opts.page_sz,
                    cache: false
                };
            } else if ( data.node.key.startsWith("g/")){
                data.result = {
                    url: "/api/grp/view?uid="+encodeURIComponent(a_uid)+"&gid="+encodeURIComponent(data.node.key.substr(2)),
                    cache: false
                };
            }
        },
        postProcess: function( ev, data ) {
            var i;

            if ( data.node.key == "collab" || data.node.key == "all" ){
                console.log( "user list:",data.response);
                data.result = [];

                if ( data.response.offset > 0 || data.response.total > (data.response.offset + data.response.count) ){
                    var pages = Math.ceil(data.response.total/settings.opts.page_sz), page = 1+data.response.offset/settings.opts.page_sz;
                    data.result.push({title:"<button class='btn small''"+(page==1?" disabled":"")+" onclick='userPageLoad(\""+data.node.key+
                        "\",0)'>First</button> <button class='btn small'"+(page==1?" disabled":"")+" onclick='userPageLoad(\""+data.node.key+
                        "\","+(page-2)*settings.opts.page_sz+")'>Prev</button> Page " + page + " of " + pages + " <button class='btn small'"+
                        (page==pages?" disabled":"")+" onclick='userPageLoad(\""+data.node.key+"\","+page*settings.opts.page_sz+
                        ")'>Next</button> <button class='btn small'"+(page==pages?" disabled":"")+" onclick='userPageLoad(\""+data.node.key+
                        "\","+(pages-1)*settings.opts.page_sz+")'>Last</button>",folder:false,icon:false,checkbox:false,hasBtn:true});
                }

                var user;
                for ( i in data.response.user ) {
                    user = data.response.user[i];
                    data.result.push({ title: user.nameLast + ", " + user.nameFirst + " ("+user.uid.substr(2) +")",icon:"ui-icon ui-icon-person",key: user.uid,unselectable:(a_excl.indexOf( user.uid ) != -1), selected: sel_users.indexOf( user.uid ) != -1 });
                }

            } else if ( data.node.key == "groups" ){
                data.result = [];
                var group;
                for ( i in data.response ) {
                    group = data.response[i];
                    if ( a_excl.indexOf( "g/"+group.gid ) == -1 )
                        data.result.push({ title: group.title + " ("+group.gid +")",icon:"ui-icon ui-icon-persons",checkbox:false,folder:true,lazy:true,key:"g/"+group.gid });
                }
            } else if ( data.node.key.startsWith("g/")){
                data.result = [];
                var mem;
                for ( i in data.response.member ) {
                    mem = data.response.member[i];
                    if ( a_excl.indexOf( mem ) == -1 )
                        data.result.push({ title: mem.substr(2),icon:"ui-icon ui-icon-person",key:mem});
                }
            }
        },
        renderNode: function(ev,data){
            if ( data.node.data.hasBtn ){
                $(".btn",data.node.li).button();
            }
        },
    });

    tree = $.ui.fancytree.getTree($("#user_tree",frame));

    $("#results_tree",frame).fancytree({
        extensions: ["themeroller"],
        themeroller: {
            activeClass: "ui-state-hover",
            addClass: "",
            focusClass: "",
            hoverClass: "ui-state-active",
            selectedClass: ""
        },
        source: [{title:"(no results)",icon:false,checkbox:false}],
        nodata: false,
        selectMode: a_single_sel?1:2,
        select: function( ev, data ){
            var idx = sel_users.indexOf( data.node.key );
            if ( data.node.isSelected()){
                if ( idx == -1 ){
                    sel_users.push( data.node.key );
                    tree.visit( function( vnode ){
                        if ( vnode.key == data.node.key )
                            vnode.setSelected( true );
                    });
                }
            }else{
                if ( idx != -1 ){
                    sel_users.splice( idx, 1 );
                    tree.visit( function( vnode ){
                        if ( vnode.key == data.node.key )
                            vnode.setSelected( false );
                    });
                }
            }

            if ( sel_users.length ){
                $("#ok_btn").button("enable");
            }else{
                $("#ok_btn").button("disable");
            }
        },
        checkbox: true,
        renderNode: function(ev,data){
            if ( data.node.data.hasBtn ){
                $(".btn",data.node.li).button();
            }
        },
    });

    result_tree = $.ui.fancytree.getTree($("#results_tree",frame));

    var in_timer;
    var search_input = $("#search_input",frame);

    search_input.on( "input", function(e) {
        if ( in_timer )
            clearTimeout( in_timer );

        in_timer = setTimeout( function(){
            var val = search_input.val().trim();
            if ( val ){
                api.userFindByNameUID( search_input.val(), 0, settings.opts.page_sz, function( ok, data ){
                    if ( ok ){
                        if ( data.user && data.user.length ){
                            console.log("results:",data);
                            var res = [], user;

                            if ( data.offset > 0 || data.total > (data.offset + data.count) ){
                                var pages = Math.ceil(data.total/settings.opts.page_sz), page = 1+data.offset/settings.opts.page_sz;
                                res.push({title:"<button class='btn small''"+(page==1?" disabled":"")+" onclick='userResPageLoad(0)'>First</button> " +
                                    "<button class='btn small'"+(page==1?" disabled":"")+" onclick='userResPageLoad(" +
                                    (page-2)*settings.opts.page_sz+")'>Prev</button> Page " + page + " of " + pages + " <button class='btn small'"+
                                    (page==pages?" disabled":"")+" onclick='userResPageLoad("+page*settings.opts.page_sz+
                                    ")'>Next</button> <button class='btn small'"+(page==pages?" disabled":"")+" onclick='userResPageLoad("+
                                    (pages-1)*settings.opts.page_sz+")'>Last</button>",folder:false,icon:false,checkbox:false,hasBtn:true});
                            }

                            for ( var i in data.user ){
                                user = data.user[i];
                                res.push({ title: user.nameLast + ", " + user.nameFirst + " ("+user.uid.substr(2) +")",icon:"ui-icon ui-icon-person",key: user.uid,unselectable:(a_excl.indexOf( user.uid ) != -1), selected: sel_users.indexOf( user.uid ) != -1 });
                            }

                            result_tree.reload(res);
                        }else{
                            result_tree.reload([{title:"(no results)",icon:false,checkbox:false}]);
                        }
                    }else{
                        result_tree.reload([{title:"(no results)",icon:false,checkbox:false}]);
                        dialogs.dlgAlert( "User Search Error", data );
                    }
                });
            }else{
                // Clear results;
                result_tree.reload([{title:"(no results)",icon:false,checkbox:false}]);
            }
        }, 500 );
    });
    
    frame.dialog( options );
}

