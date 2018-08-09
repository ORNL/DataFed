function makeDlgAllocations(){
    var inst = this;

    this.content =
        "This is a placeholder for UI that will allow regular users to request new user/project allocations \
        or update existing allocations. Until this capability is implemented, users must manually request allcations \
        from repository or system administrators.";

    this.show = function(){
        inst.frame = $(document.createElement('div'));
        inst.frame.html( inst.content );
        //inst.uid = a_uid;

        //$("#dlg_add_grp",inst.frame).click( inst.addGroup );

        var options = {
            title: "Allocations",
            modal: true,
            width: 400,
            height: 300,
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