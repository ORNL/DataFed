function dlgStartTransfer( a_mode, a_data, a_cb ) {
    var frame = $(document.createElement('div'));
    //frame.html( "<span id='prefix'>Source</span> Path:<input type='text' id='path' style='width:95%'></input>" );

    frame.html( "<div class='ui-widget'>\
        <span id='title'></span><br><br>\
        Endpoint:<br>\
        <select id='matches' disabled><option disabled selected>No Matches</option></select><br>\
        <div style='padding:.25em 0'>\
        <button class='btn' id='refresh'>Refresh</button>&nbsp<button class='btn' id='activate' disabled>Activate</button>&nbsp<button class='btn' id='browse' style='margin:0' disabled>Browse</button></div><br>\
        Path:<br>\
        <textarea class='ui-widget-content' id='path' rows=3 style='width:100%'></textarea><br>" +
        (a_mode == XFR_PUT?"File extension override: <input id='ext' type='text'></input><br>":"") +
        "</div>");

        //<input class='ui-widget-content' id='path' style='width:100%'></input><br>\

    var label = ["Get","Put","Select"];
    var dlg_title = label[a_mode] + " Data";

    if ( a_data ){
        if ( a_data.alias ){
            var pos = a_data.alias.lastIndexOf(":");
            dlg_title += " \"" + a_data.alias.substr(pos+1) + "\" [" + a_data.id + "]";
        }else
            dlg_title += " " + a_data.id;

        $("#title",frame).html( "\"" + escapeHTML( a_data.title ) + "\"" );
    }

    var matches = $("#matches",frame);
    var path_in = $("#path",frame);
    var ep_list = null;
    var cur_ep = null;

    inputTheme(path_in);

    matches.on('selectmenuchange', function( ev, ui ) {
        if ( ep_list && ui.item ){
            cur_ep = ep_list[ui.item.index-1];

            path_in.val( cur_ep.name + (cur_ep.default_directory?cur_ep.default_directory:"/"));
            if ( cur_ep.activated || cur_ep.expires_in == -1 )
                $("#browse",frame).button("enable");
            else
                $("#browse",frame).button("disable");

            if ( cur_ep.expires_in == -1 )
                $("#activate",frame).button("disable");
            else
                $("#activate",frame).button("enable");
        }
    });

    $(".btn",frame).button();

    $("#refresh",frame).on('click', function(){
        clearTimeout( in_timer );
        $("#browse",frame).button("disable");
        $("#activate",frame).button("disable");
        cur_ep = null;
        in_timer = setTimeout( inTimerExpired, 250 );
    });

    $("#browse",frame).on('click',function(){
        console.log("browse ep:",path_in.val());
        var path = path_in.val();
        var delim = path.indexOf("/");
        if ( delim != -1 )
            path = path.substr(delim);
        else
            path = cur_ep.default_directory?cur_ep.default_directory:"/";
        console.log("path:",path);
        dlgEpBrowse( cur_ep, path, (a_mode == XFR_GET)?"dir":"file", function( sel ){
            path_in.val( cur_ep.name + sel );
        });
    });

    $("#activate",frame).on('click',function(){
        console.log("activate ep:",path_in.val());
        window.open('https://www.globus.org/app/endpoints/'+ encodeURIComponent(cur_ep.id) +'/activate','');
    });

    var in_timer;
    function inTimerExpired(){
        var ep = path_in.val();
        var delim = ep.indexOf("/");
        if ( delim != -1 )
            ep = ep.substr(0,delim);
        console.log("cur_ep", cur_ep, "ep", ep );
        if ( !cur_ep || ep != cur_ep.name ){
            //cur_ep = ep;
            $("#browse",frame).button("disable");
            $("#activate",frame).button("disable");

            console.log("ep changed:",ep);

            epView( ep, function( ok, data ){
                if ( ok && !data.code ){
                    //console.log( "OK", data );
                    cur_ep = data;
                    cur_ep.name = cur_ep.canonical_name || cur_ep.id;

                    var html = "<option title='" + (cur_ep.description?cur_ep.description:"(no info)") + "'>" + (cur_ep.display_name || cur_ep.name) + " (";

                    if ( cur_ep.activated )
                        html += Math.floor( cur_ep.expires_in/3600 ) + " hrs";
                    else if ( cur_ep.expires_in == -1 )
                        html += "active";
                    else
                        html += "inactive";
                        
                    html += ")</option>";

                    matches.html( html );
                    matches.selectmenu("refresh");
                    matches.selectmenu("enable");

                    if ( cur_ep.activated || cur_ep.expires_in == -1 )
                        $("#browse",frame).button("enable");

                    if ( cur_ep.expires_in != -1 )
                        $("#activate",frame).button("enable");
                }else{
                    cur_ep = null;
                    epAutocomplete( ep, function( ok, data ){
                        console.log("ep matches:", ok, data );
                        if ( ok ){
                            if ( data.DATA && data.DATA.length ){
                                ep_list = data.DATA;
                                var ep;
                                var html = "<option disabled selected>" + data.DATA.length + " match" + (data.DATA.length>1?"es":"") + "</option>";
                                for ( var i in data.DATA ){
                                    ep = data.DATA[i];
                                    ep.name = ep.canonical_name || ep.id;
                                    html += "<option title='" + ep.description + "'>" + (ep.display_name || ep.name) + " (";
                                    if ( !ep.activated && ep.expires_in == -1 )
                                        html += "active)</option>";
                                    else
                                        html += (ep.activated?Math.floor( ep.expires_in/3600 ) + " hrs":"inactive") + ")</option>";

                                    //html += "<option class='" + (ep.activated?"ep-act":"ep-inact") + "'>" + (ep.display_name || ep.canonical_name || ep.id) + " (" + (ep.activated?Math.floor( ep.expires_in/3600 ) + " hrs":"inactive") + ")</option>";

                                    //console.log( ep.display_name || ep.canonical_name || ep.id, ep.description, ep.organization );
                                }
                                console.log( html );
                                matches.html( html );
                                matches.selectmenu("refresh");
                                matches.selectmenu("enable");
                            }else{
                                ep_list = null;
                                matches.html( "<option disabled selected>No Matches</option>" );
                                matches.selectmenu("refresh");
                                matches.selectmenu("disable");

                                if ( data.code ){
                                    dlgAlert( "Globus Error", data.code );
                                }
                            }
                        }
                    });
                }
            });
        }
    }

    var options = {
        title: dlg_title,
        modal: true,
        width: 'auto',
        height: 'auto',
        resizable: true,
        closeOnEscape: false,
        buttons: [{
            text: label[a_mode],
            click: function() {
                var raw_path = $("#path",frame).val().trim();
                if ( !raw_path ) {
                    dlgAlert("Input Error","Path cannot be empty.");
                    return;
                }
                var inst = $(this);
                if ( a_mode != XFR_SELECT ){
                    var ext = $("#ext",frame).val();
                    if ( ext )
                        ext.trim();

                    xfrStart( a_data.id, a_mode, raw_path, ext, function( ok, data ){
                        if ( ok ){
                            clearTimeout( in_timer );
                            inst.dialog('destroy').remove();
                            dlgAlert( "Transfer Initiated", "Data transfer ID and progress will be shown under the 'Transfers' tab on the main window." );
                        }else{
                            dlgAlert( "Transfer Error", data );
                        }
                    });
                }else{
                    a_cb( raw_path );
                    clearTimeout( in_timer );
                    $(this).dialog('destroy').remove();
                }
/*
                var url = "/api/dat/";

                if ( a_mode == XFR_GET )
                    url += "get";
                else if ( a_mode == XFR_PUT )
                    url += "put";
                else{
                    a_cb( raw_path );
                    clearTimeout( in_timer );
                    $(this).dialog('destroy').remove();
                    return;
                }

                var path = encodeURIComponent(raw_path);

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

                        clearTimeout( in_timer );
                        inst.dialog('destroy').remove();
                        dlgAlert( "Transfer Initiated", "Data transfer ID and progress will be shown under the 'Transfers' tab on the main window." );
                    } else {
                        dlgAlert( "Transfer Error", data );
                    }
                });
*/
            }
        },{
            text: "Cancel",
            click: function() {
                clearTimeout( in_timer );
                $(this).dialog('destroy').remove();
            }
        }],
        open: function(){
            if ( g_ep_recent.length ){
                path_in.val( g_ep_recent[0] );
                path_in.select();
                path_in.autocomplete({
                    source: g_ep_recent,
                    select: function(){
                        clearTimeout( in_timer );
                        in_timer = setTimeout( inTimerExpired, 250 );
                    }
                });
                inTimerExpired();
            }
            //matches.selectmenu({width:"90%"});
            matches.selectmenu({width: 400});

            path_in.on('input', function(){
                console.log("input changed");
                clearTimeout( in_timer );
                in_timer = setTimeout( inTimerExpired, 750 );
            });
        }
    };

    frame.dialog( options );
}

