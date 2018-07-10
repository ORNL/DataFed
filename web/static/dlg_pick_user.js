function makeDlgPickUser(){
    console.log("making dialog pick user");

    var inst = this;

    this.content =
        "<div class='col-flex' style='height:100%'>\
            <div style='flex:none;padding:.5rem 0 0 0'>Users:</div>\
            <div class='ui-widget-content text' style='flex:1 1 auto;overflow:auto'>\
                <div id='dlg_user_tree' class='no-border'></div>\
            </div>\
        </div>";

    this.show = function( a_uid, a_excl, cb ){
        inst.frame = $(document.createElement('div'));
        inst.frame.html( inst.content );
        inst.uid = a_uid;
        inst.excl = a_excl;

        console.log("Exclude:", inst.excl );

        var options = {
            title: "Select User(s)",
            modal: true,
            width: 400,
            height: 'auto',
            resizable: true,
            closeOnEscape: false,
            buttons: [{
                text: "Ok",
                click: function() {
                    users = [];
                    var tree = $("#dlg_user_tree",inst.frame).fancytree("getTree");
                    var sel = tree.getSelectedNodes();
                    var key;
                    for ( var i in sel ){
                        key = sel[i].key;
                        if ( users.indexOf( key ) == -1 )
                            users.push( key );
                    }
                    cb( users );
                    $(this).dialog('destroy').remove();
                }
            },{
                text: "Cancel",
                click: function() {
                    $(this).dialog('destroy').remove();
                }
            }],
            open: function(event,ui){
                var src = [
                    {title:"Collaborators",icon:false,folder:true,lazy:true,checkbox:false,key:"collab"},
                    {title:"By Groups",icon:false,folder:true,lazy:true,checkbox:false,key:"groups"},
                    {title:"All",icon:false,folder:true,lazy:true,checkbox:false,key:"all"}
                ];

                //src.push({title:"By Projects",icon:false,folder:true,lazy:true,checkbox:false,key:"projects"});

                $("#dlg_user_tree",inst.frame).fancytree({
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
                        if ( data.node.key == "collab" ) {
                            data.result = {
                                url: "/api/usr/list/collab",
                                cache: false
                            };
                        } else if ( data.node.key == "groups" ) {
                            data.result = {
                                url: "/api/grp/list?uid="+inst.uid,
                                cache: false
                            };
                        } else if ( data.node.key == "all" ) {
                            data.result = {
                                url: "/api/usr/list/all",
                                cache: false
                            };
                        } else if ( data.node.key.startsWith("g/")){
                            data.result = {
                                url: "/api/grp/view?uid="+inst.uid+"&gid="+data.node.key.substr(2),
                                cache: false
                            };
                        }
                    },
                    postProcess: function( event, data ) {
                        if ( data.node.key == "collab" || data.node.key == "all" ){
                            data.result = [];
                            var user;
                            for ( var i in data.response ) {
                                user = data.response[i];
                                if ( inst.excl.indexOf( user.uid ) == -1 )
                                    data.result.push({ title: user.name + " ("+user.uid.substr(2) +")", key: user.uid });
                            }
                        } else if ( data.node.key == "groups" ){
                            data.result = [];
                            var group;
                            for ( var i in data.response ) {
                                group = data.response[i];
                                if ( inst.excl.indexOf( "g/"+group.gid ) == -1 )
                                    data.result.push({ title: group.title + " ("+group.gid +")",icon:false,checkbox:false,folder:true,lazy:true,key:"g/"+group.gid });
                            }
                        } else if ( data.node.key.startsWith("g/")){
                            data.result = [];
                            var mem;
                            for ( var i in data.response.member ) {
                                mem = data.response.member[i];
                                if ( inst.excl.indexOf( mem ) == -1 )
                                    data.result.push({ title: mem.substr(2),icon:false,key:mem});
                            }
                        }
                    }
                });
            }
        };

        inst.frame.dialog( options );
    }
}