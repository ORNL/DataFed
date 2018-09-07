function makeDlAllocNewEdit(){
    var inst = this;

    this.content =
        "<table width='100%'>\
        <tr><td style='vertical-align:middle' id='subj_label'>Subject&nbspID:</td><td><input type='text' id='subject' style='width:100%' disabled></input></td></tr>\
        <tr id='subj_btn_row' style='display:none'><td style='vertical-align:middle'>Select:</td><td>\
                <button class='btn small' id='set_user'>User</button>\
                <button class='btn small' id='set_proj'>Project</button>\
            </td></tr>\
        <tr><td style='vertical-align:middle'>Allocation:</td><td><input type='text' id='alloc' style='width:100%'></input></td></tr>\
        <tr><td style='vertical-align:middle'>Usage:</td><td><input type='text' id='usage' style='width:100%' readonly></input></td></tr>\
        </table>\
        ";

    this.show = function( a_repo, a_alloc, a_excl, a_cb ){
        inst.frame = $(document.createElement('div'));
        inst.frame.html( inst.content );

        if ( a_alloc ){
            inst.alloc = a_alloc;
            if ( a_alloc.id.startsWith("p/"))
                $("#subj_label",inst.frame).html( "Project&nbspID:" );
            else
                $("#subj_label",inst.frame).html( "User&nbspID:" );

            $("#subject",inst.frame).val( a_alloc.id );
            $("#alloc",inst.frame).val( a_alloc.alloc );
            $("#usage",inst.frame).val( a_alloc.usage );
        }else{
            inst.alloc = {repo:a_repo,id:null,alloc:0,usage:0};
            $("#subj_btn_row",inst.frame).show();
            $("#subject",inst.frame).prop("disabled",false);
            $("#usage",inst.frame).val( "0" );
            $(".btn",inst.frame).button();

            $("#set_user",inst.frame).click(function(){
                dlgPickUser.show( "u/"+g_user.uid, a_excl, true, function( users ){
                    inst.alloc.id = users[0];
                    $("#subject",inst.frame).val( inst.alloc.id );
                });
            });

            $("#set_proj",inst.frame).click(function(){
                alert("Feature not implemented yet");
            });
        }

        $('input',inst.frame).addClass("ui-widget ui-widget-content");

        var options = {
            title: (a_alloc?"Edit":"Add") + " Allocation",
            modal: true,
            width: 400,
            height: 'auto',
            resizable: true,
            closeOnEscape: false,
            buttons: [{
                text: "Ok",
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

                    var alloc = parseSize( $("#alloc",inst.frame).val() );

                    if ( alloc == null ){
                        dlgAlert("Data Entry Error","Invalid allocation value.");
                        return;
                    }

                    if ( alloc == 0 ){
                        dlgAlert("Data Entry Error","Allocation cannot be 0.");
                        return;
                    }

                    /*if ( alloc < inst.alloc.usage ){
                        dlgAlert("Data Entry Error","Allocation cannot be less than current usage.");
                        return;
                    }*/

                    inst.alloc.alloc = alloc;
                    var dlg_inst = $(this);
                    allocSet( a_repo, inst.alloc.id, alloc, function( ok, data ){
                        console.log( "allocSet resp:", ok, data );
                        if ( ok ){
                            a_cb( inst.alloc );
                            dlg_inst.dialog('destroy').remove();
                        }else{
                            dlgAlert("Allocation Error","Allocation "+(a_alloc?"update":"creation")+" failed ("+data+").");
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
            }
        };

        inst.frame.dialog( options );
    }
}