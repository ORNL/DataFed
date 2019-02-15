var DLG_DATA_NEW = 0;
var DLG_DATA_EDIT = 1;
var DLG_DATA_DUP = 2;
var DLG_DATA_LABEL = ["New", "Edit", "Copy"];
var DLG_DATA_BTN_LABEL = ["Create", "Update", "Duplicate"];

//<tr><td title='Metadata JSON document (optional)'>Metadata:</td><td colspan='2'><textarea id='md' rows=7 style='width:100%'></textarea></td></tr>

function dlgDataNewEdit(a_mode,a_data,a_parent,a_upd_perms,a_cb) {
    var frame = $(document.createElement('div'));
    frame.html(
        "<div class='col-flex' style='height:100%'>\
            <div style='flex:none'>\
                <table class='form-table'>\
                    <tr><td>Title: <span class='note'>*</span></td><td colspan='2'><input title='Title string (required)' type='text' id='title' style='width:100%'></input></td></tr>\
                    <tr><td>Alias:</td><td colspan='2'><input title='Alias ID (optional)' type='text' id='alias' style='width:100%'></input></td></tr>\
                    <tr><td>Description:</td><td colspan='2'><textarea title='Description string (optional)' id='desc' rows=4 style='width:100%;padding:0'></textarea></td></tr>\
                    <tr><td>Keywords:</td><td colspan='2'><input title='Keywords (optional, comma delimited)' type='text' id='keyw' style='width:100%'></input></td></tr>\
                    <tr><td>Topic:</td><td><input title='Topic string (optional)' type='text' id='topic' style='width:100%'></input></td><td style='width:1em'><button title='Browse topics' id='pick_topic' class='btn' style='height:1.3em;padding:0 0.1em'><span class='ui-icon ui-icon-structure' style='font-size:.9em'></span></button></td></tr>\
                    <tr id='dlg_coll_row'><td>Parent: <span class='note'>*</span></td><td colspan='2'><input title='Parent collection ID or alias (required)' type='text' id='coll' style='width:100%'></input></td></tr>\
                    <tr id='dlg_alloc_row'><td style='vertical-align:middle'>Allocation:</td><td colspan='2'><select title='Data repository allocation (required)' id='alloc'><option value='bad'>----</option></select></td></tr>\
                    <tr id='dlg_put_row'><td>Raw data:</td><td><input title='Raw data remote source (optional)' type='text' id='source_file' style='width:100%'></input></td><td style='width:1em'><button title='Browse end-points' id='pick_source' class='btn' style='height:1.3em;padding:0 0.1em'><span class='ui-icon ui-icon-file' style='font-size:.9em'></span></button></tr>\
                </table>\
            </div>\
            <div style='flex:none;padding:1em 2px 2px 2px'>Metadata: <span id='md_status'></span><span style='float:right'><a href='https://github.com/ajaxorg/ace/wiki/Default-Keyboard-Shortcuts' target='_blank'>editor help</a></span></div>\
            <div class='ui-widget ui-widget-content' style='flex:1 1 100%;min-height:0;padding:0'>\
                <div id='md' style='height:100%;width:100%'></div>\
            </div>\
            <div id='dlg_md_row2' style='flex:none;padding:.5em 2px 2px 2px'><span>Metadata update mode:</span>\
                <input type='radio' id='md_merge' name='md_mode' value='merge'/>\
                <label for='md_merge'>Merge</label>\
                <input type='radio' id='md_set' name='md_mode' value='set' checked/>\
                <label for='md_set'>Replace</label>\
            </div>\
            <div class='note' style='flex:none;padding:1em 2px 2px 2px'>* Required fields</div>\
        </div>" );

    var dlg_title;
    if ( a_data && ( a_mode == DLG_DATA_EDIT || a_mode == DLG_DATA_DUP ))
        dlg_title = DLG_DATA_LABEL[a_mode] + " Data " + a_data.id;
    else if ( a_mode == DLG_DATA_NEW )
        dlg_title = "New Data";
    else
        return;

    inputTheme( $('input:text',frame ));
    inputTheme( $('textarea',frame ));

    $(".btn",frame).button();
    $("#pick_topic",frame).on("click",function(){
        dlgPickTopic( function( topic ){
            $("#topic",frame).val( topic );
        });
    });

    $("#pick_source",frame).on("click",function(){
        dlgStartTransfer( XFR_SELECT, null, function( path ){
            $("#source_file",frame).val( path );
        });
    });

    var jsoned;

    function updateAllocSelect(){
        var coll_id = $("#coll",frame).val();
        //console.log("updateAllocSelect", coll_id );
        allocListByObject( coll_id, function( ok, data ){
            console.log( "updateAllocSelect", ok, data );
            var html;
            var have_cap = false;
            if ( ok ){
                var alloc;
                html = "";
                for ( var i in data ){
                    alloc = data[i];
                    //console.log( "alloc", alloc );
                    html += "<option value='"+alloc.repo + "'";
                    if ( parseInt( alloc.usage ) < parseInt( alloc.alloc ))
                        have_cap = true;
                    else
                        html += " disabled";
                    html += ">"+alloc.repo.substr(5)+" ("+ sizeToString(alloc.usage) + " / " + sizeToString(alloc.alloc) +")</option>";
                }

                if ( !have_cap || !data.length ){
                    if ( data.length && !have_cap ){
                        dlgAlert("Data Allocation Error","All available storage allocations are full.");
                        frame.dialog('destroy').remove();
                        return;
                    }else{
                        viewColl( coll_id, function( data2 ){
                            console.log(data2);
                            if ( data2 ){
                                if ( data2.owner.startsWith( "u/" )){
                                    dlgAlert("Data Allocation Error","No available storage allocations.");
                                    frame.dialog('destroy').remove();
                                    return;
                                }else{
                                    viewProj( data2.owner, function( proj ){
                                        if ( proj ){
                                            if ( !proj.subRepo ){
                                                dlgAlert("Data Allocation Error","No available storage allocations.");
                                                frame.dialog('destroy').remove();
                                                return;
                                            }else if ( parseInt( proj.subUsage ) >= parseInt( proj.subAlloc )){
                                                dlgAlert("Data Allocation Error","Project sub-allocation is full.");
                                                frame.dialog('destroy').remove();
                                                return;
                                            }else{
                                                $("#do_it").button("enable");
                                            }
                                        }else{
                                            $("#do_it").button("enable");
                                        }
                                    });
                                }
                            }else{
                                // Something went wrong - collection changed, no view permission?
                                // Just go ahead and let user try to create since we can't confirm default is valid here
                                $("#do_it").button("enable");
                            }
                        });
                    }
                }else{
                    $("#do_it").button("enable");
                }
            }else{
                html="<option value='bad'>----</option>";
            }
            $("#alloc",frame).html(html);
            $("#alloc",frame).selectmenu("refresh");
        });
    }

    var options = {
        title: dlg_title,
        modal: true,
        width: 500,
        height: 600,
        resizable: true,
        closeOnEscape: false,
        buttons: [{
            id: "do_it",
            text: DLG_DATA_BTN_LABEL[a_mode],
            click: function() {
                var obj = {};
                var url = "/api/dat/";

                var anno = jsoned.getSession().getAnnotations();
                if ( anno && anno.length ){
                    dlgAlert( "Data Entry Error", "Metadata field has unresolved errors.");
                    return;
                }

                if ( a_data && a_mode == DLG_DATA_EDIT ){
                    url += "update";

                    getUpdatedValue( $("#title",frame).val(), a_data, obj, "title" );
                    getUpdatedValue( $("#alias",frame).val(), a_data, obj, "alias" );
                    getUpdatedValue( $("#desc",frame).val(), a_data, obj, "desc" );
                    getUpdatedValue( $("#keyw",frame).val(), a_data, obj, "keyw" );
                    getUpdatedValue( $("#topic",frame).val().toLowerCase(), a_data, obj, "topic" );
                    getUpdatedValue( jsoned.getValue(), a_data, obj, "metadata" );

                    if ( obj.metadata != undefined && $('input[name=md_mode]:checked', frame ).val() == "set" )
                        obj.mdset = true;

                    if ( Object.keys(obj).length === 0 ){
                        jsoned.destroy();
                        $(this).dialog('destroy').remove();
                        return;
                    }

                    obj.id = a_data.id;
                }else{
                    url += "create";

                    getUpdatedValue( $("#title",frame).val(), {}, obj, "title" );
                    getUpdatedValue( $("#alias",frame).val(), {}, obj, "alias" );
                    getUpdatedValue( $("#desc",frame).val(), {}, obj, "desc" );
                    getUpdatedValue( $("#keyw",frame).val(), {}, obj, "keyw" );
                    getUpdatedValue( $("#topic",frame).val(), {}, obj, "topic" );
                    var tmp = jsoned.getValue();
                    if ( tmp )
                        obj.metadata = tmp;
                }

                if ( a_mode != DLG_DATA_EDIT ){
                    var repo_id = $("#alloc").val();
                    if ( repo_id == "bad" ){
                        dlgAlert( "Data Entry Error", "Parent collection is invalid");
                        return;
                    }else if (repo_id != 'default' )
                        obj.repoId = repo_id;

                    obj.parentId = $("#coll",frame).val().trim();
                }

                var inst = $(this);

                _asyncPost( url, obj, function( ok, data ){
                    if ( ok ) {
                        tmp = $("#source_file").val().trim();
                        if ( tmp && a_mode != DLG_DATA_EDIT ){
                            xfrStart( data.data[0].id, XFR_PUT, tmp, function( ok2, data2 ){
                                if ( ok2 ){
                                    dlgAlert( "Transfer Initiated", "Data transfer ID and progress will be shown under the 'Transfers' tab on the main window." );
                                }else{
                                    dlgAlert( "Transfer Error", data2 );
                                }
                            });
                        }

                        jsoned.destroy();
                        inst.dialog('destroy').remove();
                        //console.log( "data:",data);
                        if ( a_cb )
                            a_cb(data.data[0],obj.parentId);

                    } else {
                        dlgAlert( "Data "+DLG_DATA_BTN_LABEL[a_mode]+" Error", data );
                    }
                });
            }
        },{
            text: "Cancel",
            click: function() {
                jsoned.destroy();
                $(this).dialog('destroy').remove();
            }
        }],
        resize: function(){
            jsoned.resize();
        },
        open: function(ev,ui){
            jsoned = ace.edit("md", {
                theme:(g_theme=="light"?"ace/theme/light":"ace/theme/dark"),
                mode:"ace/mode/json",
                fontSize:16,
                autoScrollEditorIntoView:true
                //wrap:true
            });

            var parent;
            if ( a_data ){
                $("#title",frame).val(a_data.title);
                if ( a_data.alias ){
                    var idx =  a_data.alias.lastIndexOf(":");
                    a_data.alias = (idx==-1?a_data.alias:a_data.alias.substr(idx+1));
                    $("#alias",frame).val(a_data.alias);
                }

                $("#desc",frame).val(a_data.desc);
                $("#keyw",frame).val(a_data.keyw);
                $("#topic",frame).val(a_data.topic);

                if ( a_data.metadata )
                    jsoned.setValue( a_data.metadata, -1 );

                if ( a_mode == DLG_DATA_EDIT ){
                    if (( a_upd_perms & PERM_WR_META ) == 0 ){
                        jsoned.setReadOnly(true);
                        $("#md_status").text("(read only)");
                        $("#md_mode",frame).prop('disabled',true);
                        $("#md_merge",frame).attr('disabled',true);
                        $("#md_set",frame).attr('disabled',true);
                    }
                    if (( a_upd_perms & PERM_WR_REC ) == 0 ){
                        inputDisable( $("#title,#desc,#alias,#topic,#keyw", frame ));
                        $("#pick_topic",frame).button("disable");
                    }

                    $("#dlg_coll_row",frame).css("display","none");
                    $("#dlg_alloc_row",frame).css("display","none");
                    $("#dlg_put_row",frame).css("display","none");
                }else{
                    $("#dlg_md_row2",frame).css("display","none");
                    parent = "root";
                }
            } else {
                $("#title",frame).val("");
                $("#alias",frame).val("");
                $("#desc",frame).val("");
                $("#keyw",frame).val("");
                $("#topic",frame).val("");
                //$("#md",frame).val("");
                $("#dlg_md_row2",frame).css("display","none");
                if ( a_parent )
                    parent = a_parent;
            }


            if ( parent ){
                var changetimer;
                $("#do_it").button("disable");
                $("#coll",frame).val( parent ).on( "input", function(){
                    if ( changetimer )
                        clearTimeout( changetimer );
                    else{
                        $("#do_it").button("disable");
                    }

                    changetimer = setTimeout( updateAllocSelect, 1000 );
                });
                $("#alloc",frame).selectmenu();
                updateAllocSelect();
            }
            jsoned.resize();
        }
    };

    frame.dialog( options );
}
