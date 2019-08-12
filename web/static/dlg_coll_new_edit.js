function dlgCollNewEdit( a_data, a_parent, a_upd_perms, a_cb ){
    var frame = $(document.createElement('div'));
    frame.html(
        "<table class='form-table'>\
            <tr><td>Title: <span class='note'>*</span></td><td colspan='2'><input type='text' id='title' style='width:100%'></input></td></tr>\
            <tr><td>Alias:</td><td colspan='2'><input type='text' id='alias' style='width:100%'></input></td></tr>\
            <tr><td >Description:</td><td colspan='2'><textarea id='desc' rows=5 style='width:100%'></textarea></td></tr>\
            <tr id='parent_row'><td>Parent: <span class='note'>*</span></td><td colspan='2'><input type='text' id='coll' style='width:100%'></input></td></tr>\
            <tr><td>Topic: <span class='note'>**</span></td><td><input title='Topic for publication' type='text' id='topic' style='width:100%'></input></td><td style='width:1em'><button title='Browse topics' id='pick_topic' class='btn' style='height:1.3em;padding:0 0.1em'><span class='ui-icon ui-icon-structure' style='font-size:.9em'></span></button></td></tr>\
            <tr><td>&nbsp</td></tr>\
            <tr><td colspan='3'><span class='note'>*&nbsp Required fields</span></td></tr>\
            <tr><td colspan='3'><span class='note'>** Enables anonymous read for all contained items</span></td></tr>\
            </table>" );

            
    var dlg_title;
    if ( a_data ) {
        dlg_title = "Edit Collection " + a_data.id;
    } else {
        dlg_title = "New Collection";
    }

    inputTheme($('input',frame));
    inputTheme($('textarea',frame));
    $(".btn",frame).button();

    $("#pick_topic",frame).on("click",function(){
        dlgPickTopic( function( topic ){
            $("#topic",frame).val( topic );
        });
    });

    var options = {
        title: dlg_title,
        modal: true,
        width: 500,
        height: 'auto',
        resizable: true,
        closeOnEscape: false,
        buttons: [{
            text: "Cancel",
            click: function() {
                $(this).dialog('destroy').remove();
            }
        },{
            text: a_data?"Update":"Create",
            click: function() {
                var obj = {};
                var url = "/api/col/";

                if ( a_data ){
                    url += "update";

                    getUpdatedValue( $("#title",frame).val(), a_data, obj, "title" );
                    getUpdatedValue( $("#alias",frame).val(), a_data, obj, "alias" );
                    getUpdatedValue( $("#desc",frame).val(), a_data, obj, "desc" );
                    getUpdatedValue( $("#topic",frame).val().toLowerCase(), a_data, obj, "topic" );

                    if ( obj.topic ){
                        obj.ispublic = true;
                    }else if ( obj.topic !== undefined ){
                        obj.ispublic = false;
                    }

                    if ( Object.keys(obj).length === 0 ){
                        $(this).dialog('destroy').remove();
                        return;
                    }

                    obj.id = a_data.id;
                }else{
                    obj.parentId = $("#coll",frame).val().trim();

                    getUpdatedValue( $("#title",frame).val(), {}, obj, "title" );
                    getUpdatedValue( $("#alias",frame).val(), {}, obj, "alias" );
                    getUpdatedValue( $("#desc",frame).val(), {}, obj, "desc" );
                    getUpdatedValue( $("#topic",frame).val().toLowerCase(), {}, obj, "topic" );

                    if ( obj.topic )
                        obj.ispublic = true;

                    url += "create"
                }

                var inst = $(this);

                //console.log( "create coll", obj );

                _asyncPost( url, obj, function( ok, data ){
                    if ( ok ) {
                        inst.dialog('destroy').remove();
                        if ( a_cb )
                            a_cb(data.coll[0]);
                    } else {
                        dlgAlert( "Collection " + (a_data?"Update":"Create") + " Error", data );
                    }
                });
            }
        }],
        open: function(){
            if ( a_data ){
                console.log("coll data:",a_data);
                $("#title",frame).val(a_data.title);
                if ( a_data.alias ){
                    var idx =  a_data.alias.lastIndexOf(":");
                    a_data.alias = (idx==-1?a_data.alias:a_data.alias.substr(idx+1));
                    $("#alias",frame).val(a_data.alias);
                }
                $("#desc",frame).val(a_data.desc);
                $("#parent_row",frame).css("display","none");
                $("#topic",frame).val(a_data.topic);

                if (( a_upd_perms & PERM_WR_REC ) == 0 ){
                    inputDisable( $("#title,#desc,#alias,#topic,#pick_topic", frame ));
                }

            } else {
                $("#title",frame).val("");
                $("#alias",frame).val("");
                $("#desc",frame).val("");
                $("#coll",frame).val(a_parent?a_parent:"");
                $("#topic",frame).val("");
            }
        }
    };


    frame.dialog( options );
}
