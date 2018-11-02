function dlgSearchWizard( a_cb ) {
    if ( !a_cb ){
        console.log("search wiz with no cb");
        return;
    }

    var frame = $(document.createElement('div'));
    frame.html("Hello!");

    var options = {
        title: "Search Wizard",
        modal: true,
        width: 500,
        height: 600,
        resizable: true,
        closeOnEscape: true,
        buttons: [{
            text: "Search",
            click: function() {
                var scope = SS_MY_DATA | SS_MY_PROJ;
                var qry = "title != null";
                a_cb( qry, scope );
                $(this).dialog('destroy').remove();
            }
        },{
            text: "Cancel",
            click: function() {
                $(this).dialog('destroy').remove();
            }
        }],
        open: function(ev,ui){
        }
    };

    frame.dialog( options );
}