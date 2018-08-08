function makeDlgAllocations(){
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

    this.show = function(){
        inst.frame = $(document.createElement('div'));
        inst.frame.html( inst.content );
        //inst.uid = a_uid;

        //$("#dlg_add_grp",inst.frame).click( inst.addGroup );

        var options = {
            title: "Allocation Configuration",
            modal: true,
            width: 500,
            height: 400,
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
        $(".btn",inst.frame).button();
    }

}