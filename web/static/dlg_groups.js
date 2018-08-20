function makeDlgGroups(){
    console.log("making dialog groups");

    var inst = this;

    this.content =
        "<div class='col-flex' style='height:100%'>\
            <div style='flex:none;padding:.5rem 0 0 0'>Groups:</div>\
            <div class='ui-widget-content text' style='flex:1 1 100%;overflow:auto'>\
                <div id='dlg_group_tree' class='no-border'></div>\
            </div>\
            <div style='flex:none;white-space:nowrap;padding:.25rem 0 0 0'>\
                <button id='dlg_add_grp' class='btn small'>New</button>\
                <button id='dlg_edit_grp' class='btn small' disabled>Edit</button>\
                <button id='dlg_rem_grp' class='btn small' disabled>Delete</button>\
            </div>\
        </div>";

    this.show = function( a_uid, a_excl, cb, select ){
        inst.frame = $(document.createElement('div'));
        inst.frame.html( inst.content );
        inst.uid = a_uid;
        inst.excl = a_excl;

        $("#dlg_add_grp",inst.frame).click( inst.addGroup );
        $("#dlg_edit_grp",inst.frame).click( inst.editGroup );
        $("#dlg_rem_grp",inst.frame).click( inst.remGroup );

        var options = {
            title: select?"Select Group(s)":"Manage Groups",
            modal: true,
            width: 500,
            height: 400,
            resizable: true,
            closeOnEscape: false,
            buttons: [{
                text: select?"Ok":"Close",
                click: function() {
                    if ( select && cb ){
                        groups = [];
                        var tree = $("#dlg_group_tree",inst.frame).fancytree("getTree");
                        var sel = tree.getSelectedNodes();
                        for ( var i in sel ){
                            groups.push( sel[i].key );
                        }
                        cb( groups );
                    } else if ( cb )
                        cb();

                    $(this).dialog('destroy').remove();
                }
            }],
            open: function(event,ui){
                groupList(inst.uid,function( ok, data){
                    console.log( "group list:", ok, data );
                    var src = [];
                    var group;
                    for ( var i in data ){
                        group = data[i];
                        if ( inst.excl.indexOf( "g/" + group.gid ) == -1 )
                            src.push({title: group.title + " (" +group.gid + ")",folder:true,lazy:true,icon:false,key:"g/"+group.gid });
                    }

                    $("#dlg_group_tree",inst.frame).fancytree({
                        extensions: ["themeroller"],
                        themeroller: {
                            activeClass: "ui-state-hover",
                            addClass: "",
                            focusClass: "",
                            hoverClass: "ui-state-active",
                            selectedClass: ""
                        },
                        source: src,
                        selectMode: select?2:1,
                        checkbox: select,
                        lazyLoad: function( event, data ) {
                            data.result = {
                                url: "/api/grp/view?uid="+encodeURIComponent(inst.uid)+"&gid="+encodeURIComponent(data.node.key.substr(2)),
                                cache: false
                            };
                        },
                        postProcess: function( event, data ) {
                            if ( data.node.lazy ){
                                data.result = [];
                                if ( data.response.desc )
                                    data.result.push( { title:"["+data.response.desc+"]", icon: false, checkbox: false,key:"desc" } );
                                var mem;
                                for ( var i in data.response.member ) {
                                    mem = data.response.member[i];
                                    data.result.push( { title: mem.substr(2), icon: false, checkbox: false,key:mem } );
                                }
                            }
                        },
                        activate: function( event, data ) {
                            console.log( data.node.key );
                            if ( data.node.key.startsWith("g/")){
                                $("#dlg_edit_grp",inst.frame).button("enable" );
                                $("#dlg_rem_grp",inst.frame).button("enable" );
                            }else{
                                $("#dlg_edit_grp",inst.frame).button("disable");
                                $("#dlg_rem_grp",inst.frame).button("disable");
                            }
                    }
                    });
                });
            }
        };
        if ( select ){
            options.buttons.push({
                text: "Cancel",
                click: function() {
                    cb();
                    $( this ).dialog( "close" );
                }
            });
        }

        inst.frame.dialog( options );
        $(".btn",inst.frame).button();
    }

    this.selectNone = function(){
        $("#dlg_edit_grp",inst.frame).prop("disabled", true );
        $("#dlg_rem_grp",inst.frame).prop("disabled", true );
    }

    this.addGroup = function( ){
        console.log("Add group");
        dlgGroupEdit.show( inst.uid, inst.excl, null, function( group ){
            if ( group ){
                var tree = $("#dlg_group_tree",inst.frame).fancytree("getTree");
                tree.rootNode.addNode({title: group.title + " (" +group.gid + ")",folder:true,lazy:true,icon:false,key:"g/"+group.gid });
            }
        });
    }

    this.remGroup = function(){
        console.log("Remove group");
        var tree = $("#dlg_group_tree",inst.frame).fancytree("getTree");
        var node = tree.getActiveNode();
        if ( node ){
            confirmChoice( "Confirm Delete", "Delete group '" + node.key.substr(2) + "'?", ["Delete","Cancel"], function( choice ) {
                console.log( choice );
                if ( choice == 0 ) {
                    groupDelete( inst.uid, node.key.substr(2), function() {
                        node.remove();
                        inst.selectNone();
                    });
                }
            });
        }
    }

    this.editGroup = function(){
        console.log("Edit group");
        var tree = $("#dlg_group_tree",inst.frame).fancytree("getTree");
        var node = tree.getActiveNode();
        if ( node ){
            console.log( "node", node );
            groupView( inst.uid, node.key.substr(2), function( ok, group ){
                if ( ok ){
                    dlgGroupEdit.show( inst.uid, inst.excl, group, function( group_new ){
                        if ( group_new ){
                            node.setTitle( group_new.title + " (" +group_new.gid + ")");
                            node.resetLazy();
                        }
                    });
                }
            });
        }
    }
}