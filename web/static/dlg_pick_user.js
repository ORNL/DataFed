import * as settings from "./settings.js";

var tree;

window.userPageLoad = function( key, offset ){
    var node = tree.getNodeByKey( key );
    if ( node ){
        node.data.offset = offset;
        setTimeout(function(){
            node.load(true);
        },0);
    }
};


export function show(  a_uid, a_excl, a_single_sel, cb ){
    var frame = $(document.createElement('div'));
    frame.html(
        "<div class='ui-widget-content text' style='height:98%;overflow:auto'>\
            <div id='dlg_user_tree' class='no-border'></div>\
        </div>" );

    var sel_users = [];

    var options = {
        title: "Select User(s)",
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
            id:"ok_btn",
            text: "Ok",
            click: function() {
                cb( sel_users );
                $(this).dialog('close');
            }
        }],
        open: function(event,ui){
            $("#ok_btn").button("disable");
        },
        close: function( ev, ui ) {
            $(this).dialog("destroy").remove();
        }
    };

    var src = [
        {title:"Collaborators",icon:"ui-icon ui-icon-view-list",folder:true,lazy:true,checkbox:false,key:"collab"},
        {title:"By Groups",icon:"ui-icon ui-icon-view-list",folder:true,lazy:true,checkbox:false,key:"groups"},
        {title:"All",icon:"ui-icon ui-icon-folder",folder:true,lazy:true,checkbox:false,key:"all",offset:0}
    ];

    $("#dlg_user_tree",frame).fancytree({
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
                var user;
                for ( i in data.response.user ) {
                    user = data.response.user[i];
                    data.result.push({ title: user.name + " ("+user.uid.substr(2) +")",icon:"ui-icon ui-icon-person",key: user.uid,unselectable:(a_excl.indexOf( user.uid ) != -1), selected: sel_users.indexOf( user.uid ) != -1 });
                }

                if ( data.response.offset > 0 || data.response.total > (data.response.offset + data.response.count) ){
                    var pages = Math.ceil(data.response.total/settings.opts.page_sz), page = 1+data.response.offset/settings.opts.page_sz;
                    data.result.push({title:"<button class='btn small''"+(page==1?" disabled":"")+" onclick='userPageLoad(\""+data.node.key+
                        "\",0)'>First</button> <button class='btn small'"+(page==1?" disabled":"")+" onclick='userPageLoad(\""+data.node.key+
                        "\","+(page-2)*settings.opts.page_sz+")'>Prev</button> Page " + page + " of " + pages + " <button class='btn small'"+
                        (page==pages?" disabled":"")+" onclick='userPageLoad(\""+data.node.key+"\","+page*settings.opts.page_sz+
                        ")'>Next</button> <button class='btn small'"+(page==pages?" disabled":"")+" onclick='userPageLoad(\""+data.node.key+
                        "\","+(pages-1)*settings.opts.page_sz+")'>Last</button>",folder:false,icon:false,checkbox:false,hasBtn:true});
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

    tree = $.ui.fancytree.getTree($("#dlg_user_tree",frame));

    frame.dialog( options );
}

