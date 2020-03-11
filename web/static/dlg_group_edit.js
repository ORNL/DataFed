/*jshint multistr: true */

function makeDlgGroupEdit(){
    var inst = this;

    this.content =
        "<div class='col-flex' style='height:100%'>\
            <div style='flex:none'>\
                <table style='width:100%'>\
                <tr><td>ID:</td><td><input type='text' id='gid' style='width:100%'></input></td></tr>\
                <tr><td>Title:</td><td><input type='text' id='title' style='width:100%'></input></td></tr>\
                <tr><td >Description:</td><td><textarea id='desc' rows=3 style='width:100%'></textarea></td></tr>\
                </table>\
            </div>\
            <div style='flex:none'>Members:</div>\
            <div class='ui-widget-content text' style='flex:1 1 100%;overflow:auto'>\
                <div id='member_list' class='no-border' style='overflow:auto'></div>\
            </div>\
            <div style='flex:none;padding:.25rem'><button id='btn_add' class='btn small'>Add</button>&nbsp<button id='btn_remove' class='btn small'>Remove</button>&nbsp<button id='btn_clear' class='btn small'>Clear</button></div>\
            </div>\
        </div>";

    this.show = function( a_uid, a_excl, group, cb ){

        inst.frame = $(document.createElement('div'));
        inst.frame.html( inst.content );
        inst.uid = a_uid;
        inst.excl = a_excl;

        console.log("Exclude:", inst.excl );

        $(".btn",inst.frame).button();
        inputTheme($('input',inst.frame));
        inputTheme($('textarea',inst.frame));

        var src = [];

        if ( group ){
            inputDisable($("#gid",inst.frame)).val( group.gid );
            $("#title",inst.frame).val( group.title );
            $("#desc",inst.frame).val( group.desc );

            if ( group.member && group.member.length ){
                $("#btn_clear",inst.frame).button("enable" );

                for ( var i in group.member ){
                    src.push({ title: group.member[i].substr(2), icon: false, key: group.member[i]});
                }
            }else{
                group.member = [];
                $("#btn_clear",inst.frame).button("disable" );
            }

            inst.group = jQuery.extend(true, {}, group );
        } else {
            inst.group = { member: [] };
            $("#btn_clear",inst.frame).button("disable");
        }

        /*if ( !src.length )
            src.push({title: "(empty)", icon: false, key: null });*/


        $("#btn_remove",inst.frame).button("disable" );

        $("#member_list",inst.frame).fancytree({
            extensions: ["themeroller"],
            themeroller: {
                activeClass: "ui-state-hover",
                addClass: "",
                focusClass: "",
                hoverClass: "ui-state-active",
                selectedClass: ""
            },
            source: src,
            selectMode: 1,
            activate: function( event, data ) {
                console.log( "activated" );
                inst.userSelected();
            },
        });

        var options = {
            title: group?"Edit Group "+group.gid:"New Group",
            modal: true,
            width: 600,
            height: 450,
            resizable: true,
            closeOnEscape: false,
            buttons: [{
                text: "Ok",
                click: function() {
                    inst.group.gid = $("#gid",inst.frame).val();
                    inst.group.title = $("#title",inst.frame).val();
                    inst.group.desc = $("#desc",inst.frame).val();

                    var dlg_inst = $(this);
                    var uid;
                    var i;
                    if ( group ){
                        if ( inst.group.title == group.title )
                            delete inst.group.title;
                        if ( inst.group.desc == group.desc )
                            delete inst.group.desc;

                        inst.group.add = [];
                        inst.group.rem = [];

                        for ( i in inst.group.member ){
                            uid = inst.group.member[i];
                            if ( group.member.indexOf( uid ) == -1 ){
                                inst.group.add.push( uid );
                            }
                        }

                        for ( i in group.member ){
                            uid = group.member[i];
                            if ( inst.group.member.indexOf( uid ) == -1 ){
                                inst.group.rem.push( uid );
                            }
                        }

                        groupUpdate( inst.group, function( ok, data ){
                            if ( !ok ){
                                dlgAlert( "Server Error", data );
                            } else {
                                //console.log( "data:", data );
                                dlg_inst.dialog('destroy').remove();
                                cb( data );
                            }
                        });
                    } else {
                        groupCreate( inst.uid, inst.group, function( ok, data ){
                            if ( !ok ){
                                dlgAlert( "Server Error", data );
                            } else {
                                //console.log( "data:", data );
                                dlg_inst.dialog('destroy').remove();
                                cb( data );
                            }
                        });
                    }
                }
            },{
                text: "Cancel",
                click: function() {
                    $(this).dialog('destroy').remove();
                    cb();
                }
            }],
            open: function(event,ui){
                
            }
        };

        $("#btn_remove",inst.frame).click( function(){ inst.removeUser(); });
        $("#btn_clear",inst.frame).click( function(){ inst.clearUsers(); });
        $("#btn_add",inst.frame).click( function(){ inst.addUsers(); });

        inst.frame.dialog( options );
    };

    this.removeUser = function(){
        var tree = $("#member_list",inst.frame).fancytree("getTree");
        var node = tree.getActiveNode();
        if ( node ){
            var i = inst.group.member.indexOf( node.key );
            if ( i > -1 ) {
                inst.group.member.splice( i, 1 );
                node.remove();
            }
            $("#btn_remove",inst.frame).button("disable");
            if ( inst.group.member.length == 0 )
                $("#btn_clear",inst.frame).button("enable" );
        }
    };

    this.addUsers = function(){
        dlgPickUser( inst.uid, inst.excl, false, function( uids ){
            if ( uids.length > 0 ){
                var tree = $("#member_list",inst.frame).fancytree("getTree");
                var i,id;
                for ( i in uids ){
                    id = uids[i];
                    if ( inst.excl.indexOf( id ) == -1 && !tree.getNodeByKey( id )){
                        tree.rootNode.addNode({title: id.substr(2),icon:false,key:id });
                        inst.group.member.push(id);
                    }
                }
                if ( inst.group.member.length )
                    $("#btn_clear",inst.frame).button("enable" );
            }
        });
    };

    this.clearUsers = function(){
        inst.group.member = [];
        var tree = $("#member_list",inst.frame).fancytree("getTree");
        tree.clear();
        $("#btn_clear",inst.frame).button("disable");
        $("#btn_remove",inst.frame).button("disable");
    };

    this.userSelected = function(){
        var b = $("#btn_remove",inst.frame);
        $("#btn_remove",inst.frame).button("enable");
    };
}