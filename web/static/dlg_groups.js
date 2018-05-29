function makeDlgGroups(){
    console.log("making dialog groups");

    var inst = this;

    this.content =
        "<div class='col-flex' style='height:100%'>\
            <div style='flex:none;padding:.5rem 0 0 0'>Groups:</div>\
            <div class='ui-widget-content text' style='flex:1 1 auto;overflow:auto'>\
                <div id='dlg_group_tree' class='no-border'></div>\
            </div>\
        </div>";

    this.show = function( cb, select ){
        inst.frame = $('#dlg_pop');
        inst.frame.html( inst.content );

        var options = {
            title: select?"Select Groups(s)":"Manage Groups",
            modal: true,
            width: 400,
            height: 'auto',
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

                    $(this).dialog( "close" );
                }
            }],
            open: function(event,ui){
                groupList(function( ok, data){
                    console.log( "group list:", ok, data );
                    var src = [];
                    var group;
                    for ( var i in data ){
                        group = data[i];
                        src.push({title: group.title + " ("+group.gid+")", key: "g/"+group.gid });
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
}