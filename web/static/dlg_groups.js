function makeDlgGroups(){
    console.log("making dialog groups");

    var inst = this;

    this.content =
        "<div class='col-flex' style='height:100%'>\
            <div class='row-flex' style='flex:1 1 100%'>\
                <div class='col-flex' style='flex:1 1 34%;padding:.25em'>\
                    <div style='flex:none;padding:.5rem 0 0 0'>Groups:</div>\
                    <div class='ui-widget-content text' style='flex:1 1 100%;overflow:auto'>\
                        <div id='dlg_group_tree' class='no-border'></div>\
                    </div>\
                </div>\
                <div class='col-flex' style='flex:1 1 33%;padding:.25em'>\
                    <div style='flex:none;padding:.5rem 0 0 0'>Info:</div>\
                    <div id='grp_info' class='ui-widget-content text' style='flex:1 1 100%;overflow:auto'>\
                    </div>\
                </div>\
                <div class='col-flex' style='flex:1 1 33%;padding:.25em'>\
                    <div style='flex:none;padding:.5rem 0 0 0'>Members:</div>\
                    <div id='grp_members' class='ui-widget-content text' style='flex:1 1 100%;overflow:auto'>\
                    </div>\
                </div>\
            </div>\
            <div style='flex:none;white-space:nowrap;padding:.25rem 0 0 0'>\
                <button id='dlg_add_grp' class='btn small'>New</button>\
                <button id='dlg_edit_grp' class='btn small' disabled>Edit</button>\
                <button id='dlg_rem_grp' class='btn small' disabled>Delete</button>\
            </div>\
        </div>";

    this.show = function( cb, select ){
        inst.frame = $(document.createElement('div'));
        inst.frame.html( inst.content );

        $("#dlg_add_grp",inst.frame).click( inst.addGroup );
        $("#dlg_edit_grp",inst.frame).click( inst.editGroup );
        $("#dlg_rem_grp",inst.frame).click( inst.remGroup );

        var options = {
            title: select?"Select Groups(s)":"Manage Groups",
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
                        var key;
                        for ( var i in sel ){
                            key = sel[i].key;
                            if ( groups.indexOf( key ) == -1 )
                                groups.push( key );
                        }
                        cb( groups );
                    } else if ( cb )
                        cb();

                    $(this).dialog('destroy').remove();
                }
            }],
            open: function(event,ui){
                groupList(function( ok, data){
                    console.log( "group list:", ok, data );
                    var src = [];
                    var group;
                    for ( var i in data ){
                        group = data[i];
                        src.push({title: group.gid /*title*/, key: "g/"+group.gid });
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
                        /*
                        lazyLoad: function( event, data ) {
                            data.result = {
                                url: "/api/grp/view?gid="+data.node.key.substr(2),
                                cache: false
                            };
                        },
                        postProcess: function( event, data ) {
                            console.log( "pos proc:", data );
                            if ( data.node.lazy )
                                data.result = [];
                            
                            var item;
                            for ( var i in data.response.data ) {
                                item = data.response.data[i];
                                is_folder = item.id[0]=="c"?true:false;
            

                                data.result.push( { title: item, , key: item.id, checkbox: false } );
                            }
                    },*/
                        activate: function( event, data ) {
                            inst.showSelectedInfo( data.node.key );
                        }
                    });
                });
            }
        };
        if ( select ){
            options.buttons.push({
                text: "Cancel",
                click: function() {
                    $( this ).dialog( "close" );
                }
            });
        }

        inst.frame.dialog( options );
    }

    this.showSelectedInfo = function( key ){
        groupView( key, function( ok, group ){
            console.log( "group:", group );
            if ( ok ) {
                $("#dlg_edit_grp",inst.frame).prop("disabled", false );
                $("#dlg_rem_grp",inst.frame).prop("disabled", false );

                /*
                var html = "<table class='info_table'><col width='30%'><col width='70%'>";
                    html += "<tr><td>ID:</td><td>" + group.gid + "</td></tr>";
                    html += "<tr><td>Title:</td><td>" + group.title + "</td></tr>";
                    html += "<tr><td>Desc:</td><td>" + (group.desc?group.desc:"(none)") + "</td></tr>";
                    html += "<tr><td>Members:</td><td>";
                    if ( group.member && group.member.length ){
                        for ( var i in group.member ){
                            html += group.member[i] + "</br>"
                        }
                    } else {
                        html += "(empty)";
                    }

                    html += "</td></tr></table>";
                */
                var html = "" + group.title + "<p>" + (group.desc?group.desc:"(no description)") + "</p>";
                $("#grp_info",inst.frame).html(html);

                html = "";
                if ( group.member && group.member.length ){
                    for ( var i in group.member ){
                        html += group.member[i] + "<br>"
                    }
                } else {
                    html += "(none)";
                }
                $("#grp_members",inst.frame).html(html);

            } else {
                $("#grp_info",inst.frame).html("");
                $("#grp_members",inst.frame).html("");
            }
        });
    }

    this.selectNone = function(){
        $("#grp_info",inst.frame).html( "" );
        $("#grp_members",inst.frame).html( "" );
        $("#dlg_edit_grp",inst.frame).prop("disabled", true );
        $("#dlg_rem_grp",inst.frame).prop("disabled", true );
    }

    this.addGroup = function(){
        console.log("Add group");
        dlgGroupEdit.show( null, function( group ){
            console.log("Added");
        });
    }

    this.remGroup = function(){
        console.log("Remove group");
        var tree = $("#dlg_group_tree").fancytree("getTree");
        var node = tree.getActiveNode();
        if ( node ){
            confirmChoice( "Confirm Delete", "Delete group '" + node.key.substr(2) + "'?", ["Delete","Cancel"], function( choice ) {
                console.log( choice );
                if ( choice == 0 ) {
                    groupDelete( node.key, function() {
                        node.remove();
                        inst.selectNone();
                    });
                }
            });
        }
    }

    this.editGroup = function(){
        console.log("Edit group");
        var tree = $("#dlg_group_tree").fancytree("getTree");
        var node = tree.getActiveNode();
        if ( node ){
            groupView( node.key, function( ok, group ){
                if ( ok ){
                    dlgGroupEdit.show( group, function( group_new ){
                        console.log("edited");
                    });
                }
            });
        }
    }
}