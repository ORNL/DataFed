function dlgStartTransfer( a_mode, a_data ) {
    var frame = $(document.createElement('div'));
    //frame.html( "<span id='prefix'>Source</span> Path:<input type='text' id='path' style='width:95%'></input>" );

    frame.html( "<div class='ui-widget'>\
        <span id='prefix'>Source</span> Path:<br>\
        <input class='ui-widget-content' id='path' style='width:100%'></input><br><br>\
        Matching&nbspEndpoints:&nbsp\
        <select id='matches' disabled><option disabled selected>No Matches</option></select><br>\
    </div>");
    
    var dlg_title = (a_mode?"Get Data ":"Put Data ");
    if ( a_data.alias ){
        var pos = a_data.alias.lastIndexOf(":");
        dlg_title += "\"" + a_data.alias.substr(pos+1) + "\" [" + a_data.id + "]";
    }else
        dlg_title += a_data.id;

    if ( a_mode )
        $("#prefix",frame).html("Destination");

    var matches = $( "#matches",frame );
    var path_in = $("#path",frame);
    var ep_list = null;

    matches.on('selectmenuchange', function( ev, ui ) {
        if ( ep_list && ui.item ){
            var ep = ep_list[ui.item.index-1];
            //console.log( "index:",ui.item.index);
            path_in.val((ep.canonical_name || ep.id) + (ep.default_directory?ep.default_directory:"/") );
        }
    });

    var in_timer;
    function inTimerExpired(){
        console.log("timer expired");
        epAutocomplete( path_in.val(), function( ok, data ){
            console.log("ep matches:", data );
            if ( ok ){
                if ( data.DATA && data.DATA.length ){
                    ep_list = data.DATA;
                    var ep;
                    var html = "<option disabled selected>" + data.DATA.length + " match" + (data.DATA.length>1?"es":"") + "</option>";
                    for ( var i in data.DATA ){
                        ep = data.DATA[i];
                        html += "<option title='" + ep.description + "'>" + (ep.display_name || ep.canonical_name || ep.id) + " (" + (ep.activated?Math.floor( ep.expires_in/3600 ) + " hrs":"inactive") + ")</option>";

                        //html += "<option class='" + (ep.activated?"ep-act":"ep-inact") + "'>" + (ep.display_name || ep.canonical_name || ep.id) + " (" + (ep.activated?Math.floor( ep.expires_in/3600 ) + " hrs":"inactive") + ")</option>";

                        //console.log( ep.display_name || ep.canonical_name || ep.id, ep.description, ep.organization );
                    }
                    //console.log( html );
                    matches.html( html );
                    matches.selectmenu("refresh");
                    matches.selectmenu("enable");
                }else{
                    ep_list = null;
                    matches.html( "<option disabled selected>No Matches</option>" );
                    matches.selectmenu("refresh");
                    matches.selectmenu("disable");
                }
            }
        });
    }

    path_in.on('input', function(){
        clearTimeout( in_timer );
        console.log("keypress - reset timer");
        in_timer = setTimeout( inTimerExpired, 750 );
    });


    var options = {
        title: dlg_title,
        modal: true,
        width: 'auto',
        height: 'auto',
        resizable: true,
        closeOnEscape: false,
        buttons: [{
            text: a_mode?"Get":"Put",
            click: function() {
                var raw_path = $("#path",frame).val();
                var path = encodeURIComponent(raw_path);
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
                        var p = g_ep_recent.indexOf(raw_path);
                        if ( p < 0 ){
                            g_ep_recent.unshift(raw_path);
                            if ( g_ep_recent.length > 20 )
                                g_ep_recent.length = 20;
                            epRecentSave();
                        }else if ( p > 0 ) {
                            g_ep_recent.unshift( g_ep_recent[p] );
                            g_ep_recent.splice( p+1, 1 );
                            epRecentSave();
                        }

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
            if ( g_ep_recent.length ){
                path_in.val( g_ep_recent[0] );
                path_in.select();
                path_in.autocomplete({ source: g_ep_recent });
            }
            $(".btn",frame).button();
            matches.selectmenu();
        }
    };

    frame.dialog( options );
}

