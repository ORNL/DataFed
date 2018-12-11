function dlgCollNewEdit( a_data, a_parent, a_cb ){
    var frame = $(document.createElement('div'));
    frame.html(
        "<table class='form-table'>\
            <tr><td>Title:</td><td><input type='text' id='title' style='width:100%'></input></td></tr>\
            <tr><td>Alias:</td><td><input type='text' id='alias' style='width:100%'></input></td></tr>\
            <tr><td >Description:</td><td><textarea id='desc' rows=5 style='width:100%'></textarea></td></tr>\
            <tr id='parent_row'><td>Parent:</td><td><input type='text' id='coll' style='width:100%'></input></td></tr>\
            </table>" );

    var dlg_title;
    if ( a_data ) {
        dlg_title = "Edit Collection " + a_data.id;
    } else {
        dlg_title = "New Collection";
    }

    inputTheme($('input',frame));
    inputTheme($('textarea',frame));

    var options = {
        title: dlg_title,
        modal: true,
        width: 500,
        height: 'auto',
        resizable: true,
        closeOnEscape: false,
        buttons: [{
            text: a_data?"Update":"Create",
            click: function() {
                var obj = {};

                obj.title = $("#title",frame).val().trim();
                if ( !obj.title ) {
                    dlgAlert( "Data Entry Error", "Title cannot be empty");
                    return;
                }

                obj.alias = $("#alias",frame).val().trim();
                if ( obj.alias.length && !isValidAlias( obj.alias ))
                    return;

                obj.desc = $("#desc",frame).val().trim();

                var url = "/api/col/";

                if ( a_data ){
                    url += "update";
                    obj.id = a_data.id;

                    if ( obj.title == a_data.title )
                        delete obj.title;
                    if ( obj.desc == a_data.desc )
                        delete obj.desc;
                    if ( obj.alias == a_data.alias )
                        delete obj.alias;
                }else{
                    obj.parentId = $("#coll",frame).val().trim();

                    url += "create"
                }

                var inst = $(this);

                //console.log( "create coll", obj );

                _asyncPost( url, obj, function( ok, data ){
                    if ( ok ) {
                        inst.dialog('destroy').remove();
                        console.log( "data:",data);
                        if ( a_cb )
                            a_cb(data.coll[0],obj.parentId);
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
            if ( a_data ){
                $("#title",frame).val(a_data.title);
                if ( a_data.alias ){
                    var idx =  a_data.alias.lastIndexOf(":");
                    a_data.alias = (idx==-1?a_data.alias:a_data.alias.substr(idx+1));
                    $("#alias",frame).val(a_data.alias);
                }
                $("#desc",frame).val(a_data.desc);
                $("#parent_row",frame).css("display","none");
            } else {
                $("#title",frame).val("");
                $("#alias",frame).val("");
                $("#desc",frame).val("");
                $("#coll",frame).val(a_parent?a_parent:"");
            }
        }
    };


    frame.dialog( options );
}
