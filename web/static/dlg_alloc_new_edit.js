function makeDlAllocNewEdit(){
    var inst = this;

    this.content =
        "<table width='100%'>\
        <tr><td style='vertical-align:middle' id='subj_label'>Subject&nbspID:</td><td><input type='text' id='subject' style='width:100%'></input></td></tr>\
        <tr id='subj_btn_row' style='display:none'><td style='vertical-align:middle'></td><td style='text-align:right'>\
                <button class='btn small' id='set_user'>Users</button>\
                <button class='btn small' id='set_proj'>Projects</button>\
            </td></tr>\
        <tr><td style='vertical-align:middle'>Max. Data Size:</td><td><input type='text' id='data_limit' style='width:100%'></input></td></tr>\
        <tr><td style='vertical-align:middle'>Total Data size:</td><td><input type='text' id='data_size' style='width:100%' readonly></input></td></tr>\
        <tr><td style='vertical-align:middle'>Max. Rec. Count:</td><td><input type='text' id='rec_limit' style='width:100%'></input></td></tr>\
        </table>\
        ";

    this.show = function( a_repo, a_alloc, a_excl, a_cb ){
        inst.frame = $(document.createElement('div'));
        inst.frame.html( inst.content );

        inputTheme($('input',inst.frame));

        if ( a_alloc ){
            inst.alloc = a_alloc;
            if ( a_alloc.id.startsWith("p/"))
                $("#subj_label",inst.frame).html( "Project&nbspID:" );
            else
                $("#subj_label",inst.frame).html( "User&nbspID:" );

            inputDisable($("#subject",inst.frame)).val( a_alloc.id );
            $("#data_limit",inst.frame).val( a_alloc.dataLimit );
            $("#data_size",inst.frame).val( a_alloc.dataSize );
            $("#rec_limit",inst.frame).val( a_alloc.recLimit );
        }else{
            inst.alloc = {repo:a_repo,id:null,dataLimit:0,dataSize:0,recLimit:0};
            $("#subj_btn_row",inst.frame).show();
            $("#subject",inst.frame);
            $("#data_size",inst.frame).val( "0" );
            $("#rec_limit",inst.frame).val( 1000 );
            $(".btn",inst.frame).button();

            $("#set_user",inst.frame).click(function(){
                dlgPickUser( "u/"+g_user.uid, a_excl, true, function( users ){
                    inst.alloc.id = users[0];
                    $("#subject",inst.frame).val( inst.alloc.id );
                });
            });

            $("#set_proj",inst.frame).click(function(){
                dlgPickProject( a_excl, true, function( projs ){
                    inst.alloc.id = projs[0];
                    $("#subject",inst.frame).val( inst.alloc.id );
                });
            });
        }

        inputDisable($("#data_size",inst.frame));

        var options = {
            title: (a_alloc?"Edit":"Add") + " Allocation",
            modal: true,
            width: 400,
            height: 'auto',
            resizable: true,
            closeOnEscape: false,
            buttons: [{
                text: (a_alloc?"Update":"Add"),
                click: function() {
                    if ( !a_alloc ){
                        inst.alloc.id = $("#subject",inst.frame).val();
                        if ( !inst.alloc.id ){
                            dlgAlert("Data Entry Error","Subject ID cannot be empty.");
                            return;
                        }
                        if ( !inst.alloc.id.startsWith("u/") && !inst.alloc.id.startsWith("p/")){
                            dlgAlert("Data Entry Error","Invalid subject ID (must include 'u/' or 'p/' prefix.");
                            return;
                        }
                    }

                    var data_limit = parseSize( $("#data_limit",inst.frame).val() );

                    if ( data_limit == null ){
                        dlgAlert("Data Entry Error","Invalid max size value.");
                        return;
                    }

                    if ( data_limit == 0 ){
                        dlgAlert("Data Entry Error","Max size cannot be 0.");
                        return;
                    }

                    var rec_limit = parseInt( $("#rec_limit",inst.frame).val() );

                    if ( isNaN( rec_limit )){
                        dlgAlert("Data Entry Error","Invalid max count value.");
                        return;
                    }

                    if ( rec_limit == 0 ){
                        dlgAlert("Data Entry Error","Max count cannot be 0.");
                        return;
                    }

                    inst.alloc.dataLimit = data_limit;
                    inst.alloc.recLimit = rec_limit;

                    var dlg_inst = $(this);
                    if ( a_alloc ){
                        allocSet( a_repo, inst.alloc.id, data_limit, rec_limit, function( ok, data ){
                            if ( ok ){
                                a_cb( inst.alloc );
                                dlg_inst.dialog('destroy').remove();
                            }else{
                                dlgAlert("Allocation Error","Allocation update failed ("+data+").");
                            }
                        });
                    }else{
                        allocCreate( a_repo, inst.alloc.id, data_limit, rec_limit, function( ok, data ){
                            if ( ok ){
                                a_cb( inst.alloc );
                                dlg_inst.dialog('destroy').remove();
                            }else{
                                dlgAlert("Allocation Error","Allocation creation failed ("+data+").");
                            }
                        });
                    }

                }
            },{
                text: "Cancel",
                click: function() {
                    $(this).dialog('destroy').remove();
                }
            }],
            open: function(event,ui){
            }
        };

        inst.frame.dialog( options );
    }
}