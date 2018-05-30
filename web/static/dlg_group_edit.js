function makeDlgGroupEdit(){
    var inst = this;

    this.content =
        "<table style='width:100%;height:100%'>\
        <tr><td>ID:</td><td><input type='text' id='gid' style='width:100%'></input></td></tr>\
        <tr><td>Title:</td><td><input type='text' id='title' style='width:100%'></input></td></tr>\
        <tr><td >Description:</td><td><textarea id='desc' rows=3 style='width:100%'></textarea></td></tr>\
        <tr style='height:100%'><td>Members:</td><td>\
        <div class='ui-widget-content text' style='height:100%;overflow:auto'>\
            <div id='member_list' class='no-border' ></div>\
        </div>\
        </td></tr>\
        <tr><td></td><td><button id='btn_add_user' class='btn small'>Add</button>&nbsp<button id='btn_rem_user' class='btn small'>Remove</button></td></tr>\
        </table>";

    this.show = function( group, cb ){
        inst.frame = $(document.createElement('div'));
        inst.frame.html( inst.content );
        var src = [];

        if ( group ){
            $("#gid",inst.frame).val( group.gid );
            $("#title",inst.frame).val( group.title );
            $("#desc",inst.frame).val( group.desc );

            if ( group.member && group.member.length ){
                for ( var i in group.member ){
                    src.push({ title: group.member[i], icon: false, key: group.member[i]});
                }
            }
        }

        if ( !src.length )
            src.push({title: "(empty)", icon: false, key: null });

        $(".btn",inst.frame).button();

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
        });

        var options = {
            title: group?"Edit Group "+group.gid:"New Group",
            modal: true,
            width: 400,
            height: 450,
            resizable: true,
            closeOnEscape: false,
            buttons: [{
                text: "Ok",
                click: function() {

                    $(this).dialog('destroy').remove();
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

        inst.frame.dialog( options );
    }
}