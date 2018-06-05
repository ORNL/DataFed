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
            <div class='row-flex' style='flex:1 1 100%'>\
                <div class='col-flex' style='flex:1 1 40%'>\
                    <div style='flex:none'>Members:</div>\
                    <div class='ui-widget-content text' style='flex:1 1 100%;overflow:auto'>\
                        <div id='member_list' class='no-border' style='overflow:auto'></div>\
                    </div>\
                    <div style='flex:none;padding:.25rem'><button id='btn_remove' class='btn small'>Remove</button>&nbsp<button id='btn_clear' class='btn small'>Clear</button></div>\
                </div>\
                <div>&nbsp</div>\
                <div class='col-flex' style='flex:1 1 60%'>\
                    <div style='flex:none'>Available:</div>\
                    <div class='ui-widget-content text' style='flex:1 1 100%;overflow:auto'>\
                        <div id='avail_list' class='no-border' style='overflow:auto'></div>\
                    </div>\
                    <div style='flex:none;padding:.25rem'><button id='btn_add' class='btn small'>Add</button></div>\
                </div>\
            </div>\
        </div>";

    this.show = function( group, cb ){

        inst.frame = $(document.createElement('div'));
        inst.frame.html( inst.content );

        $(".btn",inst.frame).button();

        var src = [];

        if ( group ){
            //inst.group = Object.assign( {}, group );
            inst.group = jQuery.extend(true, {}, group );

            $("#gid",inst.frame).val( group.gid ).prop("disabled", true);
            $("#title",inst.frame).val( group.title );
            $("#desc",inst.frame).val( group.desc );

            if ( group.member && group.member.length ){
                $("#btn_clear",inst.frame).button("enable" );

                for ( var i in group.member ){
                    src.push({ title: group.member[i], icon: false, key: group.member[i]});
                }
            }
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


        src = [
            {title:"By Groups",folder:true,lazy:true,checkbox:false,key:"groups"},
            {title:"By Projects",folder:true,lazy:true,checkbox:false,key:"projects"},
            {title:"All",folder:true,lazy:true,checkbox:false,key:"all"}
        ];

        $("#avail_list",inst.frame).fancytree({
            extensions: ["themeroller"],
            themeroller: {
                activeClass: "ui-state-hover",
                addClass: "",
                focusClass: "",
                hoverClass: "ui-state-active",
                selectedClass: ""
            },
            source: src,
            selectMode: 2,
            checkbox: true,
            lazyLoad: function( event, data ) {
                if ( data.node.key == "all" ) {
                    data.result = {
                        url: "/api/usr/list",
                        cache: false
                    };
                }
            },
            postProcess: function( event, data ) {
                //console.log( "post proc:", data );
                if ( data.node.key == "all" ){
                    data.result = [];
                    var user;
                    for ( var i in data.response ) {
                        user = data.response[i];
                        data.result.push({ title: user.name + " ("+user.uid +")", key: user.uid });
                    }
                }
            }
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

                    if ( !inst.group.gid.length ){
                        alert("Group ID cannot be empty");
                        return;
                    }

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
                            console.log( "check:", uid );
                            if ( group.member.indexOf( uid ) == -1 ){
                                inst.group.add.push( uid );
                                console.log( "  adding" );
                            }
                        }
                        console.log( "Add:", inst.group.add );

                        for ( i in group.member ){
                            uid = group.member[i];
                            console.log( "check:", uid );
                            if ( inst.group.member.indexOf( uid ) == -1 ){
                                inst.group.rem.push( uid );
                                console.log( "  removing" );
                            }
                        }
                        console.log( "Remove:", inst.group.rem );

                        groupUpdate( inst.group, function( ok, data ){
                            if ( !ok ){
                                alert( data );
                            } else {
                                dlg_inst.dialog('destroy').remove();
                            }
                        });
                    } else {
                        groupCreate( inst.group, function( ok, data ){
                            if ( !ok ){
                                alert( data );
                            } else {
                                dlg_inst.dialog('destroy').remove();
                            }
                        });
                    }
                }
            },{
                text: "Cancel",
                click: function() {
                    $(this).dialog('destroy').remove();
                }
            }],
            open: function(event,ui){
                
            }
        };

        $("#btn_remove",inst.frame).click( function(){ inst.removeUser(); });
        $("#btn_clear",inst.frame).click( function(){ inst.clearUsers(); });
        $("#btn_add",inst.frame).click( function(){ inst.addUsers(); });

        inst.frame.dialog( options );
    }

    this.removeUser = function(){
        var tree = $("#member_list",inst.frame).fancytree("getTree");
        var node = tree.getActiveNode();
        if ( node ){
            console.log( "key:", node.key );
            var i = inst.group.member.indexOf( node.key );
            console.log( "idx:", i );
            if ( i > -1 ) {
                inst.group.member.splice( i, 1 );
                console.log( "members:", inst.group.member );
                node.remove();
            }
            $("#btn_remove",inst.frame).button("disable");
        }
    }

    this.addUsers = function(){
        var tree = $("#avail_list",inst.frame).fancytree("getTree");
        var sel = tree.getSelectedNodes();
        var tree2 = $("#member_list",inst.frame).fancytree("getTree");
        var key;
        console.log( sel, inst.group.member );
        for ( var i in sel ){
            key = sel[i].key;
            if ( inst.group.member.indexOf( key ) == -1 ){
                inst.group.member.push( key );
                tree2.rootNode.addNode({ title: key, icon: false, key: key });
            }
        }
        if ( inst.group.member.length )
            $("#btn_clear",inst.frame).button("enable" );

        tree.selectAll( false );
    }

    this.clearUsers = function(){
        inst.group.member = [];
        console.log( "members:", inst.group.member );
        var tree = $("#member_list",inst.frame).fancytree("getTree");
        tree.clear();
        $("#btn_clear",inst.frame).button("disable");
        $("#btn_remove",inst.frame).button("disable");
    }

    this.userSelected = function(){
        var b = $("#btn_remove",inst.frame);
        console.log( "btn:",b);
        $("#btn_remove",inst.frame).button("enable");
    }
}