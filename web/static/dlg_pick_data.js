/*jshint multistr: true */

function dlgPickData( a_cb ){
    var frame = $(document.createElement('div'));
    var html = "<div class='ui-widget-content' style='height:98%;min-height:0;overflow:auto'>\
                    Not Implemented Yet\
                </div>";

    frame.html( html );

    var options = {
        title: "Select Data Record",
        modal: true,
        width: 400,
        height: 300,
        resizable: true,
        closeOnEscape: false,
        buttons: [{
            id: "sel_btn",
            text: "Select",
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
            $("#sel_btn").button("disable");
        }
    };

    frame.dialog( options );
}
