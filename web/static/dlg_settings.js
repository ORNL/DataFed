function dlgSettings(){
    var content =
        "<div class='ui-widget-content text' style='height:98%;overflow:auto'>\
            Hello!\
        </div>";

    var frame = $(document.createElement('div'));
    frame.html( content );

    var options = {
        title: "DataFed Settings",
        modal: true,
        width: 600,
        height: 300,
        resizable: true,
        closeOnEscape: false,
        buttons: [{
            text: "Save",
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

    frame.dialog( options );
    $(".btn",frame).button();
}
