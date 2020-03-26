/*jshint multistr: true */

function dlgQueryNewEdit(a_data,a_cb) {
    var frame = $(document.createElement('div'));
    frame.html(
        "<div class='col-flex' style='height:100%'>\
            <div style='flex:none'>\
                <table class='form-table'>\
                    <tr><td>Title: <span class='note'>*</span></td><td><input type='text' id='title' style='width:100%'></input></td></tr>\
                    <tr><td>ID/Alias:</td><td><input type='text' id='id_query' style='width:100%'></input></td></tr>\
                    <tr><td>Text:</td><td><textarea id='text_query' rows=3 style='width:100%;padding:0'></textarea></td></tr>\
                    <tr><td>Metadata:</td><td><textarea id='meta_query' rows=3 style='width:100%;padding:0'></textarea></td></tr>\
                    <tr><td>Scope:</td><td id='scope_cell'>\
                        <span class='my-check'><label for='scope_mydat-dlg'></label><input class='scope-dlg' type='checkbox' name='scope_mydat-dlg' id='scope_mydat-dlg'>&nbspMy Data</span>\
                        <span class='my-check'><label for='scope_myproj-dlg'></label><input class='scope-dlg' type='checkbox' name='scope_myproj-dlg' id='scope_myproj-dlg'>&nbspMy Projects</span>\
                        <span class='my-check'><label for='scope_otherproj-dlg'></label><input class='scope-dlg' type='checkbox' name='scope_otherproj-dlg' id='scope_otherproj-dlg'>&nbspOther Projects</span>\
                        <span class='my-check'><label for='scope_shared-dlg'></label><input class='scope-dlg' type='checkbox' name='scope_shared-dlg' id='scope_shared-dlg'>&nbspShared&nbspData</span>\
                        </td></tr>\
                </table>\
            </div>\
            <div style='flex:none'><br>Query Results:</div>\
            <div id='results' class='ui-widget-content' style='flex:1 1 50%;overflow:auto;padding:.5em'></div>\
        </div>" );

    var old_qry;
    if ( a_data ){
        dlg_title = "Edit Query " + a_data.id;
        old_qry = JSON.parse(a_data.query);
    }else
        dlg_title = "New Query";

    inputTheme( $('input:text',frame ));
    inputTheme( $('textarea',frame ));
    $(".scope-dlg",frame).checkboxradio();

    function parseSearchDialog(){
        var query = {};
        var tmp = $("#id_query",frame).val();
        if ( tmp )
            query.id = tmp;
        else
            delete query.id;

        tmp = $("#text_query",frame).val();
        if ( tmp )
            query.text = tmp;
        else
            delete query.text;

        tmp = $("#meta_query",frame).val();
        if ( tmp )
            query.meta = tmp;
        else
            delete query.meta;

        if ( old_qry.scope_manual ){
            query.scopes = old_qry.scopes;
        }else{
            query.scopes = [];

            if ( $("#scope_mydat-dlg",frame).prop("checked"))
                query.scopes.push({scope:SS_USER});
            if ( $("#scope_myproj-dlg",frame).prop("checked"))
                query.scopes.push({scope:SS_OWNED_PROJECTS});
            if ( $("#scope_otherproj-dlg",frame).prop("checked")){
                query.scopes.push({scope:SS_MANAGED_PROJECTS});
                query.scopes.push({scope:SS_MEMBER_PROJECTS});
            }
            if ( $("#scope_shared-dlg",frame).prop("checked")){
                query.scopes.push({scope:SS_SHARED_BY_ANY_USER});
                query.scopes.push({scope:SS_SHARED_BY_ANY_PROJECT});
            }
        }

        return query;
    }

    var options = {
        title: dlg_title,
        modal: true,
        width: 500,
        height: 500,
        resizable: true,
        buttons: [{
            text: "Cancel",
            click: function() {
                $(this).dialog('close');
            }
        },{
            text: "Test",
            click: function() {
                var qry = parseSearchDialog();
                console.log("qry:",qry);
                dataFind( qry, function( ok, items ){
                    console.log( "qry res:", ok, items );
                    if ( ok ){
                        var html;
                        if ( items.length > 0 ){
                            html = "<table style='width:100%;text-align:left;'><tr><th>ID/alias</th><th>Title</th></tr>";
                            for ( var i in items ){
                                var item = items[i];
                                html += "<tr><td style='vertical-align:top'>";
                                if ( item.alias )
                                    html += "(" + item.alias.substr(item.alias.lastIndexOf(":") + 1) + ")&nbsp";
                                else
                                    html += "[" + item.id.substr(2) + "]&nbsp";

                                html += "</td><td style='width:100%'>\"" + escapeHTML( item.title ) + "\"</td></tr>";
                            }
                            html += "</table>";
                        } else {
                            html = "(no results)";
                        }
                        $("#results",frame).html(html);
                    }else{
                        dlgAlert("Query Error",items);
                    }
                });
        
            }
        },{
            text: "Save",
            click: function() {
                if ( a_data ){
                    var obj = {};
                    getUpdatedValue( $("#title",frame).val(), a_data, obj, "title" );
                    var qry = parseSearchDialog();
                    var inst = $(this);
                    sendQueryUpdate( a_data.id, obj.title, qry, function(ok,data){
                        if ( ok ){
                            a_cb( data.query[0] );
                            inst.dialog('close');
                        }else{
                            dlgAlert("Query Save Error",data);
                        }
                    });
                }else{
                    // TODO Add create functionality
                }
            }
        }],
        resize: function(){
        },
        open: function(ev,ui){
            if ( a_data ){
                $("#title",frame).val(a_data.title);
                $("#id_query",frame).val(old_qry.id);
                $("#text_query",frame).val(old_qry.text);
                $("#meta_query",frame).val(old_qry.meta);

                for ( var i in old_qry.scopes ){
                    switch( old_qry.scopes[i].scope ){
                        case SS_PROJECT:
                        case SS_COLLECTION:
                        case SS_TOPIC:
                        case SS_SHARED_BY_USER:
                        case SS_SHARED_BY_PROJECT:
                            $("#scope_cell",frame).html("(manual scope selection - cannot be edited)");
                            old_qry.scope_manual = true;
                            return;
                    }
                }

                for ( i in old_qry.scopes ){
                    //console.log(old_qry.scopes[i]);
                    switch( old_qry.scopes[i].scope ){
                        case SS_USER:
                            $("#scope_mydat-dlg",frame).prop("checked",true).checkboxradio( "refresh" );
                            break;
                        case SS_OWNED_PROJECTS:
                            $("#scope_myproj-dlg",frame).prop("checked",true).checkboxradio( "refresh" );
                            break;
                        case SS_MANAGED_PROJECTS:
                        case SS_MEMBER_PROJECTS:
                            $("#scope_otherproj-dlg",frame).prop("checked",true).checkboxradio( "refresh" );
                            break;
                        case SS_SHARED_BY_ANY_USER:
                        case SS_SHARED_BY_ANY_PROJECT:
                            $("#scope_shared-dlg",frame).prop("checked",true).checkboxradio( "refresh" );
                            break;
                    }
                }
            }
        },
        close: function( ev, ui ) {
            $(this).dialog("destroy").remove();
        }
    };

    frame.dialog( options );
}
