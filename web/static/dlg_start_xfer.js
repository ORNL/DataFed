function dlgStartTransfer( a_mode, a_data ) {
    var frame = $(document.createElement('div'));
    //frame.html( "<span id='prefix'>Source</span> Path:<input type='text' id='path' style='width:95%'></input>" );

    frame.html( "<div class='ui-widget'>\
        <label><span id='prefix'>Source</span> Path:</label>\
        <select id='path'>\
            <option value=''>Select one...</option>\
            <option value='ActionScript'>ActionScript</option>\
            <option value='AppleScript'>AppleScript</option>\
            <option value='Asp'>Asp</option>\
        </select>\
    </div>");
    
    var dlg_title = (a_mode?"Get Data ":"Put Data ");
    if ( a_data.alias ){
        var pos = a_data.alias.lastIndexOf(":");
        dlg_title += "\"" + a_data.alias.substr(pos+1) + "\" [" + a_data.id + "]";
    }else
        dlg_title += a_data.id;

    if ( a_mode )
        $("#prefix",frame).html("Destination");

    var in_timer;
    function inTimerExpired(){
        console.log("timer expired");
    }

    /*
    $("#path",frame).on('input', function(){
        console.log("keypress - reset timer");
        in_timer = setTimeout( inTimerExpired, 1000 );
    });
*/

    //$("#path",frame).val("olcf#dtn_atlas/~/");

    var options = {
        title: dlg_title,
        modal: true,
        width: 400,
        height: 'auto',
        resizable: true,
        closeOnEscape: false,
        buttons: [{
            text: a_mode?"Get":"Put",
            click: function() {
                var path = encodeURIComponent($("#path",frame).val());
                if ( !path ) {
                    alert("Path cannot be empty");
                    return;
                }

                var url = "/api/dat/";
                if ( a_mode )
                    url += "get";
                else
                    url += "put";

                url += "?id=" + a_data.id + "&path=" + path;

                var inst = $(this);
                _asyncGet( url, null, function( ok, data ){
                    if ( ok ) {
                        inst.dialog('destroy').remove();
                    } else {
                        alert( "Error: " + data );
                    }
                });
            }
        },{
            text: "Cancel",
            click: function() {
                $(this).dialog('destroy').remove();
            }
        }],
        open: function(){
            $("#path",frame).combobox();
        }
    };

    frame.dialog( options );
}

