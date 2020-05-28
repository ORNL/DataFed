import * as util from "./util.js";
import * as model from "./model.js";
import * as api from "./api.js";
import * as dialogs from "./dialogs.js";


export function show( a_subject, a_annotation, a_new_state, a_comment_idx, cb ){
    const content =
        "<table class='form-table'>\
        <tr><td>Subject:</td><td id='td_subject'></td></tr>\
        <tr id='tr_id'><td>ID:</td><td id='td_note_id'></td></tr>\
        <tr><td>Type:</td><td><select id='type'><option value='0'>Question</option><option value='1'>Information</option>\
        <option value='2'>Warning</option><option value='3'>Error</option></td></tr>\
        <tr><td>Title:&nbsp<span class='note'>*</span></td><td><input type='text' id='title' style='width:100%' maxlength='80'></input></td></tr>\
        <tr><td style='vertical-align:top'>Comment:&nbsp<span class='note'>*</span></td><td><textarea id='comment' rows=8 style='width:100%' maxlength='2000'></textarea></td></tr>\
        </table>\
        <div id='div_activate' style='padding:1em 0 0 0'><label for='activate'>Activate on open</label><input id='activate' type='checkbox'></input></div>";


    var frame = $(document.createElement('div'));
    frame.html( content );

    $(".btn",frame).button();
    util.inputTheme($('input',frame));
    util.inputTheme($('textarea',frame));
    var title;

    if ( a_annotation ){ // Edit annotation
        if ( a_comment_idx != 0 ){
            $("#title",frame).prop('readonly', true);
        }

        if ( a_comment_idx != null ){
            title = "Edit Annotation Comments";
            $("#comment",frame).val(a_annotation.comment[a_comment_idx].comment);
        }else{
            switch( a_new_state ){
                case model.NOTE_OPEN: title = "Re-Open Annotation"; break;
                case model.NOTE_CLOSED: title = "Close Annotation"; break;
                case model.NOTE_ACTIVE: title = "Activate Annotation"; break;
                default: title = "Reply to Annotation"; break;
            }
        }
        
        $("#td_note_id",frame).text(a_annotation.id);
        $("#title",frame).val(a_annotation.title);
        $("#div_activate",frame).hide();
    }else{
        title = "New Annotation";
        $("#tr_id",frame).hide();
        $("#activate",frame).checkboxradio();
    }

    $("#td_subject",frame).text(( a_subject.charAt(0) == 'c'?"Collection '":"Data Record '") + a_subject + "'" );

    var options = {
        title: title,
        modal: true,
        width: 550,
        height: 'auto',
        resizable: true,
        buttons: [{
            text: "Cancel",
            click: function() {
                $(this).dialog('close');
                cb();
            }
        },{
            text: "Ok",
            click: function() {
                var type = parseInt($("#type",frame).val()),
                    title = $("#title",frame).val().trim(),
                    comment = $("#comment",frame).val().trim(),
                    activate = $("#activate",frame).prop("checked"),
                    dlg_inst = $(this);

                if ( a_annotation ){
                    if ( a_comment_idx != null ){
                        api.annotationCommentEdit( a_annotation.id, comment, a_comment_idx, title!=a_annotation.title?title:null, function( ok, data ){
                            if ( !ok ){
                                dialogs.dlgAlert( "Server Error", data );
                            } else {
                                dlg_inst.dialog('close');
                                cb( data );
                            }
                        });
                    }else{
                        api.annotationUpdate( a_annotation.id, comment, a_new_state, function( ok, data ){
                            if ( !ok ){
                                dialogs.dlgAlert( "Server Error", data );
                            } else {
                                dlg_inst.dialog('close');
                                cb();
                            }
                        });
                    }
                }else{
                    api.annotationCreate( a_subject, type, title, comment, activate, function( ok, data ){
                        if ( !ok ){
                            dialogs.dlgAlert( "Server Error", data );
                        } else {
                            dlg_inst.dialog('close');
                            cb();
                        }
                    });
                }
            }
        }],
        open: function(event,ui){
            var widget = frame.dialog( "widget" );
            $(".ui-dialog-buttonpane",widget).append("<span class='note' style='padding:1em;line-height:200%'>* Required fields</span>");

            $("select",frame).selectmenu({width:200});
            if ( a_annotation ){
                console.log("note type",a_annotation.type);
                $("#type",frame).val(model.NoteTypeFromString[a_annotation.type]);
                //$("#type",frame ).selectmenu("disable");
                $('option:not(:selected)',frame).prop('disabled', true);
                $("#type",frame).selectmenu("refresh");
            }
        },
        close: function( ev, ui ) {
            $(this).dialog("destroy").remove();
        }
    };


    frame.dialog( options );
}
