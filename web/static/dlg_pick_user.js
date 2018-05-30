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

    this.show = function( cb ){
        inst.frame = $(document.createElement('div'));
        inst.frame.html( inst.content );

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
                    {title:"By Groups",folder:true,lazy:true,checkbox:false,key:"groups"},
                    {title:"By Projects",folder:true,lazy:true,checkbox:false,key:"projects"},
                    {title:"All",folder:true,lazy:true,checkbox:false,key:"all"}
                ];

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
                                data.result.push({ title: user.name + " ("+user.uid +")", key: "u/"+user.uid });
                            }
                        }
                    }
                });
            }
        };

        inst.frame.dialog( options );
    }
}