import * as util from "./util.js";
import * as api from "./api.js";
import * as dialogs from "./dialogs.js";


export function show( a_subject, a_annotation, a_comment_idx, cb ){
    const content =
        "<table class='form-table'>\
        <tr><td>Subject:</td><td id='td_subject'></td></tr>\
        <tr id='tr_id'><td>ID:</td><td id='td_note_id'></td></tr>\
        <tr><td>Type:</td><td><select id='type'><option value='0'>Question</option><option value='1'>Information</option>\
        <option value='2'>Warning</option><option value='5'>Error</option></td></tr>\
        <tr><td>Title:&nbsp<span class='note'>*</span></td><td><input type='text' id='title' style='width:100%' maxlength='80'></input></td></tr>\
        <tr><td style='vertical-align:top'>Comment:&nbsp<span class='note'>*</span></td><td><textarea id='comment' rows=8 style='width:100%' maxlength='2000'></textarea></td></tr>\
        </table>\
        <div id='div_activate' style='padding:1em 0 0 0'><label for='activate'>Activate on open</label><input id='activate' type='checkbox'></input></div>";


    var frame = $(document.createElement('div'));
    frame.html( content );

    $(".btn",frame).button();
    util.inputTheme($('input',frame));
    util.inputTheme($('textarea',frame));

    if ( a_annotation ){ // Edit annotation
        if ( a_comment_idx != 0 ){
            util.inputDisable( $("#title", frame ));
        }

        util.inputDisable( $("#type", frame ));
        $("#div_activate",frame).hide();
    }else{
        $("#tr_id",frame).hide();
        $("#activate",frame).checkboxradio();
    }

    $("#td_subject",frame).text(( a_subject.charAt(0) == 'c'?"Collection '":"Data Record '") + a_subject + "'" );

    var options = {
        title: a_annotation?"Edit Annotation Comment":"New Annotation",
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
                    title = $("#title",frame).val(),
                    comment = $("#comment",frame).val(),
                    activate = $("#activate",frame).prop("checked"),
                    dlg_inst = $(this);

                if ( a_annotation ){
                    /*api.annotationUpdate( , function( ok, data ){
                    }*/
                }else{
                    console.log("activate:",activate);
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
        },
        close: function( ev, ui ) {
            $(this).dialog("destroy").remove();
        }
    };


    frame.dialog( options );
}
