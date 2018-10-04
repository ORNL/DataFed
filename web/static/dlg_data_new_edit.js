var DLG_DATA_NEW = 0;
var DLG_DATA_EDIT = 1;
var DLG_DATA_COPY = 2;
var DLG_DATA_LABEL = ["New", "Edit", "Copy"];
var DLG_DATA_BTN_LABEL = ["Create", "Update", "Copy"];

function dlgDataNewEdit(a_mode,a_data,a_parent,a_cb) {
    var frame = $(document.createElement('div'));
    frame.html(
        "<table class='form-table'>\
            <tr><td title='Title string (required)'>Title:</td><td><input type='text' id='title' style='width:100%'></input></td></tr>\
            <tr><td title='Alias ID (optional)'>Alias:</td><td><input type='text' id='alias' style='width:100%'></input></td></tr>\
            <tr><td title='Description string (optional)'>Description:</td><td><textarea id='desc' rows=5 style='width:100%'></textarea></td></tr>\
            <tr><td title='Metadata JSON document (optional)'>Metadata:</td><td><textarea id='md' rows=7 style='width:100%'></textarea></td></tr>\
            <tr id='dlg_md_row2'><td title='Metadata update mode - merge fields or replace entire document'>MD-mode:</td><td>\
                <input type='radio' id='md_merge' name='md_mode' value='merge' checked>\
                <label for='md_merge'>Merge</label>\
                <input type='radio' id='md_set'  name='md_mode' value='set'>\
                <label for='md_mode'>Replace</label>\
                </td></tr>\
            <tr id='dlg_coll_row'><td title='Parent collection ID or alias (required)'>Parent:</td><td><input type='text' id='coll' style='width:100%'></input></td></tr>\
            <tr id='dlg_alloc_row'><td title='Data repository allocation (required)' style='vertical-align:middle'>Allocation:</td><td><select id='alloc'><option value='bad'>----</option></select></td></tr>\
            </table>" );

    var dlg_title, coll_id;
    if ( a_data && ( a_mode == DLG_DATA_EDIT || a_mode == DLG_DATA_COPY ))
        dlg_title = DLG_DATA_LABEL[a_mode] + " Data " + a_data.id;
    else if ( a_mode == DLG_DATA_NEW )
        dlg_title = "New Data";
    else
        return;

    $('input',frame).addClass("ui-widget ui-widget-content");
    $('textarea',frame).addClass("ui-widget ui-widget-content");

    function updateAllocSelect(){
        var coll_id = $("#coll",frame).val();
        //console.log("updateAllocSelect", coll_id );
        allocListByOwner( coll_id, function( ok, data ){
            //console.log( "updateAllocSelect", ok, data );
            var html;
            var have_cap = false;
            if ( ok ){
                var alloc;
                html = "<option value='default'>Default</option>";
                for ( var i in data ){
                    alloc = data[i];
                    console.log( "alloc", alloc );
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
        height: 'auto',
        resizable: true,
        closeOnEscape: false,
        buttons: [{
            id: "do_it",
            text: DLG_DATA_BTN_LABEL[a_mode],
            click: function() {
                var obj = {};
                var tmp;

                obj.title = $("#title",frame).val().trim();
                if ( !obj.title ) {
                    dlgAlert( "Data Entry Error", "Title cannot be empty");
                    return;
                }

                tmp = $("#alias",frame).val().trim();
                if ( tmp.length ){
                    if ( !isValidAlias( tmp ))
                        return;

                    obj.alias = tmp;
                }

                tmp = $("#desc",frame).val().trim();
                if ( tmp.length )
                    obj.desc = tmp;

                if ( a_mode != DLG_DATA_EDIT ){
                    var repo_id = $("#alloc").val();
                    if ( repo_id == "bad" ){
                        dlgAlert( "Data Entry Error", "Parent collection is invalid");
                        return;
                    }else if (repo_id != 'default' )
                        obj.repoId = repo_id;

                    obj.parentId = $("#coll",frame).val().trim();
                }

                tmp = $("#md",frame).val().trim();
                if ( tmp.length ){
                    try{
                        JSON.parse( tmp );
                        obj.metadata = tmp;
                    }catch(e){
                        dlgAlert("Input Error","Metadata field must be valid JSON.");
                        return;
                    }
                }

                if ( obj.md && a_data ) {
                    if ( $('input[name=md_mode]:checked', frame ).val() == "set" )
                        obj.mdset = true;
                }

                var url = "/api/dat/";

                if ( a_data && a_mode == DLG_DATA_EDIT ){
                    url += "update";
                    obj.id = a_data.id;

                    if ( obj.title && obj.title == a_data.title )
                        delete obj.title;
                    if ( obj.desc && obj.desc == a_data.desc )
                        delete obj.desc;
                    if ( obj.alias && obj.alias == a_data.alias )
                        delete obj.alias;
                    if ( obj.metadata && obj.metadata == a_data.metadata ){
                        delete obj.metadata;
                        delete obj.mdset;
                    }

                }else
                    url += "create"


                var inst = $(this);

                console.log( "create data", obj );

                _asyncPost( url, obj, function( ok, data ){
                    if ( ok ) {
                        inst.dialog('destroy').remove();
                        //console.log( "data:",data);
                        if ( a_cb )
                            a_cb(data.data[0]);
                    } else {
                        dlgAlert( "Data "+DLG_DATA_BTN_LABEL[a_mode]+" Error", data );
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
            var parent;
            if ( a_data ){
                $("#title",frame).val(a_data.title);
                if ( a_data.alias ){
                    var idx =  a_data.alias.lastIndexOf(":");
                    a_data.alias = (idx==-1?a_data.alias:a_data.alias.substr(idx+1));
                    $("#alias",frame).val(a_data.alias);
                }

                $("#desc",frame).val(a_data.desc);
                $("#md",frame).val(a_data.metadata);

                if ( a_mode == DLG_DATA_EDIT ){
                    $("#dlg_coll_row",frame).css("display","none");
                    $("#dlg_alloc_row",frame).css("display","none");
                }else{
                    $("#dlg_md_row2",frame).css("display","none");
                    parent = "root";
                }
            } else {
                $("#title",frame).val("");
                $("#alias",frame).val("");
                $("#desc",frame).val("");
                $("#md",frame).val("");
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
        }
    };

    frame.dialog( options );
}
