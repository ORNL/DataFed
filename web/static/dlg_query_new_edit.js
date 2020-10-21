import * as api from "./api.js";
import * as model from "./model.js";
import * as util from "./util.js";
import * as dialogs from "./dialogs.js";

export function show( a_data, a_cb ) {
    var frame = $(document.createElement('div'));
    frame.html(
        "<div class='col-flex' style='height:100%'>\
            <div style='flex:none'>\
                <table class='form-table'>\
                    <tr><td>Title: <span class='note'>*</span></td><td><input type='text' id='title' style='width:100%'></input></td></tr>\
                    <tr><td>ID/Alias:</td><td><input type='text' id='id_query' style='width:100%'></input></td></tr>\
                    <tr><td>Text:</td><td><textarea id='text_query' rows=3 style='width:100%;padding:0'></textarea></td></tr>\
                    <tr><td style='vertical-align:top'>Tags:</td><td><ul id='tags' class='input-bg'></ul></td></tr>\
                    <tr><td>Metadata:</td><td><textarea id='meta_query' rows=3 style='width:100%;padding:0'></textarea></td></tr>\
                    <tr><td>Scope:</td><td id='scope_cell'>\
                        <span class='my-check'><label for='scope_mydat-dlg'></label><input class='scope-dlg' type='checkbox' name='scope_mydat-dlg' id='scope_mydat-dlg'>&nbspPersonal</span>\
                        <span class='my-check'><label for='scope_proj-dlg'></label><input class='scope-dlg' type='checkbox' name='scope_proj-dlg' id='scope_proj-dlg'>&nbspProjects</span>\
                        <span class='my-check'><label for='scope_shared-dlg'></label><input class='scope-dlg' type='checkbox' name='scope_shared-dlg' id='scope_shared-dlg'>&nbspShared</span>\
                        </td></tr>\
                </table>\
            </div>\
            <div style='flex:none'><br>Query Results:</div>\
            <div id='results' class='ui-widget-content' style='flex:1 1 50%;overflow:auto;padding:.5em'></div>\
        </div>" );

    var old_qry, dlg_title;

    if ( a_data ){
        dlg_title = "Edit Query " + a_data.id;
        old_qry = JSON.parse(a_data.query);
    }else
        dlg_title = "New Query";

    var tag_el = $("#tags",frame);

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

        query.tags = tag_el.tagit("assignedTags");

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
                query.scopes.push({scope:model.SS_USER});
            if ( $("#scope_proj-dlg",frame).prop("checked"))
                query.scopes.push({scope:model.SS_PROJECTS});
            if ( $("#scope_shared-dlg",frame).prop("checked")){
                query.scopes.push({scope:model.SS_SHARED_BY_ANY_USER});
                query.scopes.push({scope:model.SS_SHARED_BY_ANY_PROJECT});
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
                api.dataFind( qry, function( ok, reply ){
                    if ( ok ){
                        console.log("items:",reply);
                        var html;
                        if ( reply.item && reply.item.length > 0 ){
                            html = "<table style='width:100%;text-align:left;'>";
                            for ( var i in reply.item ){
                                var item = reply.item[i];
                                html += "<tr><td style='vertical-align:top'>";
                                if ( item.alias )
                                    html += item.alias.substr(item.alias.lastIndexOf(":") + 1);
                                else
                                    html += item.id;

                                html += "</td><td style='width:100%'>\"" + util.escapeHTML( item.title ) + "\"</td></tr>";
                            }
                            html += "</table>";
                        } else {
                            html = "(no results)";
                        }
                        $("#results",frame).html(html);
                    }else{
                        dialogs.dlgAlert("Query Error",reply);
                    }
                });
        
            }
        },{
            text: "Save",
            click: function() {
                if ( a_data ){
                    var obj = {};
                    util.getUpdatedValue( $("#title",frame).val(), a_data, obj, "title" );
                    var qry = parseSearchDialog();
                    var inst = $(this);
                    api.sendQueryUpdate( a_data.id, obj.title, qry, function(ok,data){
                        if ( ok ){
                            a_cb( data.query[0] );
                            inst.dialog('close');
                        }else{
                            dialogs.dlgAlert("Query Save Error",data);
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
                tag_el.tagit({
                    autocomplete: {
                        delay: 500,
                        minLength: 3,
                        source: "/api/tag/autocomp"
                    },
                    caseSensitive: false
                });

                util.inputTheme( $('input:text',frame ));
                util.inputTheme( $('textarea',frame ));
                $(".scope-dlg",frame).checkboxradio();

                $("#title",frame).val(a_data.title);
                $("#id_query",frame).val(old_qry.id);
                $("#text_query",frame).val(old_qry.text);
                $("#meta_query",frame).val(old_qry.meta);

                if ( old_qry.tags && old_qry.tags.length ){
                    for ( var t in old_qry.tags ){
                        tag_el.tagit("createTag", old_qry.tags[t] );
                    }
                }

                for ( var i in old_qry.scopes ){
                    switch( old_qry.scopes[i].scope ){
                        case model.SS_PROJECT:
                        case model.SS_COLLECTION:
                        case model.SS_TOPIC:
                        case model.SS_SHARED_BY_USER:
                        case model.SS_SHARED_BY_PROJECT:
                            $("#scope_cell",frame).html("(manual scope selection - cannot be edited)");
                            old_qry.scope_manual = true;
                            return;
                    }
                }

                for ( i in old_qry.scopes ){
                    //console.log(old_qry.scopes[i]);
                    switch( old_qry.scopes[i].scope ){
                        case model.SS_USER:
                            $("#scope_mydat-dlg",frame).prop("checked",true).checkboxradio( "refresh" );
                            break;
                        case model.SS_PROJECTS:
                            $("#scope_proj-dlg",frame).prop("checked",true).checkboxradio( "refresh" );
                            break;
                        case model.SS_SHARED_BY_ANY_USER:
                        case model.SS_SHARED_BY_ANY_PROJECT:
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
