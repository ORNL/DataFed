function dlgDataNewEdit(a_mode,a_data,a_parent,a_cb) {
    var frame = $(document.createElement('div'));
    frame.html(
        "<table style='width:100%'>\
            <tr><td>Title:</td><td><input type='text' id='title' style='width:100%'></input></td></tr>\
            <tr><td>Alias:</td><td><input type='text' id='alias' style='width:100%'></input></td></tr>\
            <tr><td >Description:</td><td><textarea id='desc' rows=3 style='width:100%'></textarea></td></tr>\
            <tr id='dlg_md_row'><td>Metadata:</td><td><textarea id='md' rows=3 style='width:100%'></textarea></td></tr>\
            <tr id='dlg_md_row2'><td>Metadata mode:</td><td>\
                <input type='radio' id='md_merge' name='md_mode' value='merge' checked>\
                <label for='md_merge'>Merge</label>\
                <input type='radio' id='md_set'  name='md_mode' value='set'>\
                <label for='md_mode'>Set</label>\
                </td></tr>\
            <tr id='dlg_coll_row'><td>Parent:</td><td><input type='text' id='coll' style='width:100%'></input></td></tr>\
            </table>" );

    var dlg_title;
    if ( a_data ) {
        dlg_title = (a_mode?"Edit Collection ":"Edit Data ") + a_data.id;
    } else {
        dlg_title = a_mode?"New Collection":"New Data";
    }

    var options = {
        title: dlg_title,
        modal: true,
        width: 400,
        height: 'auto',
        resizable: true,
        closeOnEscape: false,
        buttons: [{
            text: a_data?"Update":"Create",
            click: function() {
                console.log( "Create data" );

                var title = encodeURIComponent($("#title",frame).val());
                if ( !title ) {
                    console.log( "bad title" );
                    alert("Title cannot be empty");
                    return;
                }

                var alias = encodeURIComponent($("#alias",frame).val());
                if ( !isValidAlias( alias )){
                    console.log( "bad alias" );

                    return;
                }

                alias = encodeURIComponent(alias);
                var desc = encodeURIComponent($("#desc",frame).val());
                var coll = encodeURIComponent($("#coll",frame).val());
                var metadata = $("#md",frame).val().trim();
                if ( metadata.length ){
                    try{
                        JSON.parse( metadata );
                    }catch(e){
                        dlgAlert("Input Error","Metadata field must be valid JSON.");
                        return;
                    }
                }

                var md = encodeURIComponent(metadata);
                console.log( "build url" );

                var url = "/api/";
                if ( a_mode )
                    url += "col";
                else
                    url += "dat";

                if ( a_data )
                    url += "/update?id="+a_data.id + "&";
                else
                    url += "/create?"
                var delim = "";

                if ( title ) {
                    url += "title="+title;
                    delim = "&";
                }

                if ( alias ) {
                    url += delim + "alias="+alias;
                    delim = "&";
                }

                if ( desc ) {
                    url += delim + "desc="+desc;
                    delim = "&";
                }

                if ( a_mode == 0 ){
                    if ( md ) {
                        url += delim + "md="+md;
                        delim = "&";

                        if ( a_data ) {
                            if ( $('input[name=md_mode]:checked', frame ).val() == "set" )
                                url += "&mdset=true";
                        }
                    }
                }

                if ( coll )
                    url += delim + "coll="+coll;

                console.log( "URL in js", url );

                var inst = $(this);

                _asyncGet( url, null, function( ok, data ){
                    if ( ok ) {
                        inst.dialog('destroy').remove();
                        //console.log( "data:",data);
                        if ( a_cb )
                            a_cb(data.data[0]);
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
        open: function(event,ui){
            if ( a_data ){
                $("#title",frame).val(a_data.title);
                if ( a_data.alias ){
                    var idx =  a_data.alias.lastIndexOf(":");
                    $("#alias",frame).val(idx==-1?a_data.alias:a_data.alias.substr(idx+1));
                }
                $("#desc",frame).val(a_data.desc);
                $("#md",frame).val(a_data.metadata);
                $("#dlg_coll_row",frame).css("display","none");
                if ( a_mode )
                    $("#dlg_md_row2",frame).css("display","none");
                else
                    $("#dlg_md_row2",frame).css("display","show");
            } else {
                $("#title",frame).val("");
                $("#alias",frame).val("");
                $("#desc",frame).val("");
                $("#coll",frame).val(a_parent?a_parent:"");
                $("#md",frame).val("");
                $("#dlg_coll_row",frame).css("display","show");
                $("#dlg_md_row2",frame).css("display","none");
            }

            if ( a_mode ){
                $("#md",frame).val("");
                $("#dlg_md_row",frame).css("display","none");
            } else
                $("#dlg_md_row",frame).css("display","show");
        }
    };


    frame.dialog( options );
}
