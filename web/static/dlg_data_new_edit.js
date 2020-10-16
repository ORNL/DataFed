import * as api from "./api.js";
import * as model from "./model.js";
import * as util from "./util.js";
import * as settings from "./settings.js";
import * as dialogs from "./dialogs.js";
import * as dlgStartXfer from "./dlg_start_xfer.js";

export var DLG_DATA_MODE_NEW = 0;
export var DLG_DATA_MODE_EDIT = 1;
export var DLG_DATA_MODE_DUP = 2;

const DLG_DATA_LABEL = ["New", "Edit", "Copy"];
const DLG_DATA_BTN_LABEL = ["Create", "Update", "Create"];


export function show( a_mode, a_data, a_parent, a_upd_perms, a_cb ){
    var ele = document.createElement('div');
    ele.id = (a_data?a_data.id.replace("/","_"):"d_new")+"_edit";
    var frame = $(ele),
        dlg_inst,
        jsoned,
        ref_rows = 1,
        orig_deps = [],
        encrypt_mode = 1,
        is_published,
        parent_coll;
    
    console.log("data:",a_data);

    //<tr><td>Tags:</td><td colspan='3'><input title='Tags (optional, space delimited)' type='text' id='tags' style='width:100%'></input></td></tr>

    frame.html(
        "<div id='dlg-tabs' style='height:100%;padding:0' class='tabs-no-header no-border'>\
            <ul>\
                <li><a href='#tab-dlg-gen'>General</a></li>\
                <li><a href='#tab-dlg-ref'>References</a></li>\
                <li><a href='#tab-dlg-data'>Data</a></li>\
                <li><a href='#tab-dlg-meta'>Metadata</a></li>\
            </ul>\
            <div id='tab-dlg-gen' style='padding:1em'>\
                <table class='form-table'>\
                    <tr><td>Title: <span class='note'>*</span></td><td colspan='3'><input title='Title string (required)' type='text' id='title' maxlength='80' style='width:100%'></input></td></tr>\
                    <tr><td>Alias:</td><td colspan='3'><input title='Alias ID (optional)' type='text' maxlength='40' id='alias' style='width:100%'></input></td></tr>\
                    <tr><td style='vertical-align:top'>Description:</td><td colspan='3'><textarea title='Description string (optional)' id='desc' maxlength='2000' rows=6 style='width:100%;padding:0'></textarea></td></tr>\
                    <tr><td style='vertical-align:top'>Tags:</td><td colspan='3'><ul id='tags' class='input-bg'></ul></td></tr>\
                    <tr id='dlg_coll_row'><td>Parent: <span class='note'>*</span></td><td colspan='3'><input title='Parent collection ID or alias (required)' type='text' id='coll' style='width:100%'></input></td></tr>\
                </table>\
            </div>\
            <div id='tab-dlg-ref' style='padding:1em'>\
                <div class='col-flex' style='height:100%'>\
                    <div style='flex:1 1 auto;overflow:auto'>\
                        <table id='ref-table'>\
                            <tr class='ref-row'><td><select><option value='0'>Is derived from</option><option value='1'>Is a component of</option><option value='2'>Is newer version of</option></select></td><td style='width:100%'><input type='text' style='width:100%'></input></td><td><button title='Remove reference' class='btn rem-ref' style='height:1.3em;padding:0 0.1em'><span class='ui-icon ui-icon-close' style='font-size:.9em'></span></button></td></tr>\
                        </table>\
                    </div>\
                    <div style='flex:none;padding:1em 0 0 .1em'><button title='Add new reference' class='btn add-ref'>Add Reference</button></div>\
                </div>\
            </div>\
            <div id='tab-dlg-data' style='padding:1em'>\
                <span title='Set data mode to published.' style='display:inline-block;white-space:nowrap'><label for='published'>Published Data</label><input id='published' type='checkbox'></input> <span id='pub_del_warn_ast' style='display:none' class='note'>**</span></span><br><br>\
                <div id='working_data'>\
                    <table class='form-table'>\
                        <tr id='dlg_alloc_row'><td>Allocation:</td><td colspan='3'><select title='Data repository allocation (required)' id='alloc'><option value='bad'>----</option></select></td></tr>\
                        <tr id='dlg_put_row'><td>Source:</td><td colspan='2'><input title='Full globus path to source data file (optional)' type='text' id='source_file' style='width:100%' readonly></input></td><td style='width:1em'><button title='Browse end-points' id='pick_source' class='btn btn-icon-tiny'><span class='ui-icon ui-icon-file'></span></button></tr>\
                        <tr><td>Extension:</td><td><input title='Data record file extension (optional)' type='text' id='extension' style='width:100%'></input></td><td colspan='2'><span title='Automatically assign extension from source data file' style='display:inline-block;white-space:nowrap'><label for='ext_auto'>Auto&nbspExt.</label><input id='ext_auto' type='checkbox'></input></span></td></tr>\
                    </table>\
                </div>\
                <div id='published_data' style='display:none'>\
                    <table class='form-table'>\
                        <tr><td>DOI:</td><td colspan='3'><input title='DOI number (optional)' type='text' id='doi' style='width:100%'></input></td></tr>\
                        <tr><td>Data&nbspURL:</td><td colspan='3'><input title='Data URL (optional)' type='text' id='data_url' style='width:100%'></input></td></tr>\
                    </table>\
                </div><br><br>\
                <div id='pub_del_warn' style='display:none;width:100%' class='note'>\
                    ** Setting record to published will delete associated DataFed-managed raw data.\
                </div>\
                <div id='pub_upd_warn' style='display:none' class='note'>\
                    Note: Editing data source information of published records is not recommended due to potential impact on data subscribers.\
                </div>\
            </div>\
            <div id='tab-dlg-meta' style='padding:1em'>\
                <div class='col-flex' style='height:100%'>\
                    <div style='flex:none'>\
                        Enter metadata as JSON: <span style='float:right'><a href='https://github.com/ajaxorg/ace/wiki/Default-Keyboard-Shortcuts' target='_blank'>editor help</a></span>\
                    </div>\
                    <div class='ui-widget ui-widget-content' style='flex:1 1 100%;padding:0'>\
                        <div id='md' style='height:100%;width:100%'></div>\
                    </div>\
                    <div id='dlg_md_row2' style='flex:none;padding:.5em 2px 2px 2px'><span>Metadata update mode:</span>\
                        <input type='radio' id='md_merge' name='md_mode' value='merge'/>\
                        <label for='md_merge'>Merge</label>\
                        <input type='radio' id='md_set' name='md_mode' value='set' checked/>\
                        <label for='md_set'>Replace</label>\
                    </div>\
                </div>\
            </div>\
        </div>" );

    var dlg_title;
    if ( a_data && ( a_mode == DLG_DATA_MODE_EDIT || a_mode == DLG_DATA_MODE_DUP ))
        dlg_title = DLG_DATA_LABEL[a_mode] + " Data Record " + a_data.id;
    else if ( a_mode == DLG_DATA_MODE_NEW )
        dlg_title = "New Data Record";
    else
        return;

    var tag_el = $("#tags",frame);

    $("#pick_source",frame).on("click",function(){
        dlgStartXfer.show( null, null, function( a_path, a_encrypt_mode ){
            $("#source_file",frame).val( a_path );
            encrypt_mode = a_encrypt_mode;
            if ( $("#ext_auto",frame).prop("checked") )
                updateAutoExt();
        });
    });

    $(".add-ref",frame).on("click",function(){
        addRef();
    });

    $(".rem-ref",frame).on("click",function(ev){
        remRef(ev);
    });


    function addRef(){
        var row = $("<tr class='ref-row'><td><select><option value='0'>Is derived from</option><option value='1'>Is a component of</option><option value='2'>Is newer version of</option></select></td><td style='width:100%'><input type='text' style='width:100%'></input></td><td><button title='Remove reference' class='btn rem-ref' style='height:1.3em;padding:0 0.1em'><span class='ui-icon ui-icon-close' style='font-size:.9em'></span></button></td></tr>");

        row.insertAfter("#ref-table tr:last",frame);
        $("select",row).selectmenu({width:200});
        $(".btn",row).button();
        util.inputTheme( $('input:text',row ));

        $(".rem-ref",row).on("click",function(ev){
            remRef(ev);
        });
        ref_rows++;
    }

    function remRef(ev){
        var tr = ev.currentTarget.closest("tr");
        if ( ref_rows > 1 ){
            if ( tr ){
                tr.remove();
            }
            ref_rows--;
        }else{
            $("input",tr).val("");
        }
    }

    function updateAllocSelect(){
        var coll_id = $("#coll",frame).val();
        api.allocListByObject( coll_id, function( ok, data ){
            var html;
            var have_cap = false;
            if ( ok ){
                if ( data.length == 0 ){
                    html="<option value='bad'>(no allocations)</option>";
                    dialogs.dlgAlert("Allocation Error", "Cannot create new data record for this user/project. No available storage allocations.");
                    // Close dialog
                    dlg_inst.dialog('close');
                    return;
                }else{
                    var alloc;
                    html = "";
                    for ( var i in data ){
                        alloc = data[i];
                        html += "<option value='"+alloc.repo + "'";

                        if ( parseInt( alloc.dataSize ) < parseInt( alloc.dataLimit ) && alloc.recCount < alloc.recLimit )
                            have_cap = true;
                        else
                            html += " disabled";

                        html += ">"+ alloc.repo.substr(5) + " ("+ util.sizeToString(alloc.dataSize) + " / " + util.sizeToString(alloc.dataLimit) +")</option>";
                    }

                    if ( !have_cap ){
                        dialogs.dlgAlert("Data Allocation Error","Cannot create new data record for this user/project. All available storage allocations are full. ");
                        // Close dialog
                        dlg_inst.dialog('close');
                        return;
                    }else{
                        $("#do_it").button("enable");
                    }
                }
            }else{
                html="<option value='bad'>(invalid parent)</option>";
            }
            $("#alloc",frame).html(html);
            $("#alloc",frame).selectmenu("refresh");
        });
    }

    function updateAutoExt(){
        var src = $("#source_file",frame).val(),ext="";
        if ( src ){
            var p = src.indexOf("/");
            if ( p != -1 ){
                p = src.indexOf(".",p);
                if ( p != -1 ){
                    ext = src.substr(p) + " ";
                }
            }
        }
        $("#extension",frame).val( ext + '(auto)');
    }

    function callback( ok, reply ){
        if ( ok ) {
            // Start transfer if source changed
            var tmp = $("#source_file").val().trim();
            if ( !is_published && tmp && ( !a_data || tmp != a_data.source || a_mode == DLG_DATA_MODE_DUP )){
                api.xfrStart( [reply.data[0].id], model.TT_DATA_PUT, tmp, 0, encrypt_mode, function( ok2, reply2 ){
                    if ( ok2 ){
                        util.setStatusText("Transfer initiated. Track progress under 'Transfer' tab.");
                    }else{
                        dialogs.dlgAlert( "Transfer Error", reply2 );
                    }
                });
            }
            
            dlg_inst.dialog('close');

            if ( a_cb )
                a_cb( reply.data[0], parent_coll );
        } else {
            dialogs.dlgAlert( "Data "+DLG_DATA_BTN_LABEL[a_mode]+" Error", reply );
        }
    }

    var options = {
        title: dlg_title,
        modal: false,
        width: 500,
        height: 530,
        position:{ my: "left", at: "center+10", of: "body" },
        resizable: true,
        resizeStop: function(ev,ui){
            $("#dlg-tabs",frame).tabs("refresh");
        },
        buttons: [{
            text: "Cancel",
            click: function() {
                $(this).dialog('close');
            }
        },{
            id: "do_it",
            text: DLG_DATA_BTN_LABEL[a_mode],
            click: function() {
                var anno = jsoned.getSession().getAnnotations();

                if ( anno && anno.length ){
                    dialogs.dlgAlert( "Data Entry Error", "Metadata field has unresolved errors.");
                    return;
                }

                var obj = {},
                    id,
                    type,
                    deps = [];

                $(".ref-row",frame).each(function(idx,ele){
                    id = $("input",ele).val();
                    if ( id ){
                        type = parseInt($("select",ele).val());
                        deps.push({ id: id, type: type });
                    }
                });

                if ( $("#published",frame).prop("checked") )
                    is_published = true;
                else
                    is_published = false;


                if ( a_data && a_mode == DLG_DATA_MODE_EDIT ){
                    util.getUpdatedValue( $("#title",frame).val(), a_data, obj, "title" );
                    util.getUpdatedValue( $("#alias",frame).val(), a_data, obj, "alias" );
                    util.getUpdatedValue( $("#desc",frame).val(), a_data, obj, "desc" );
                    util.getUpdatedValue( jsoned.getValue(), a_data, obj, "metadata" );

                    // TODO Only assign tags if changed
                    obj.tags = tag_el.tagit("assignedTags");

                    if (( !obj.tags || obj.tags.length == 0 ) && a_data.tags && a_data.tags.length ){
                        obj.tagsClear = true;
                    }

                    if ( is_published ){
                        var doi = $("#doi",frame).val(),
                            data_url = $("#data_url",frame).val();

                        if ( !doi || !data_url ){
                            dialogs.dlgAlert( "Data Entry Error", "DOI and Data URL must be specified for published data.");
                            return;
                        }
                        util.getUpdatedValue( doi, a_data, obj, "doi" );
                        util.getUpdatedValue( data_url, a_data, obj, "dataUrl" );
                    }else{
                        if ( a_data.doi ){
                            obj.doi="";
                            obj.dataUrl="";
                        }

                        if ( $("#ext_auto",frame).prop("checked") ){
                            if ( !a_data.extAuto )
                                obj.extAuto = true;
                        }else{
                            if ( a_data.extAuto )
                                obj.extAuto = false;

                            util.getUpdatedValue( $("#extension",frame).val(), a_data, obj, "ext" );
                        }
                    }

                    if ( obj.metadata != undefined && $('input[name=md_mode]:checked', frame ).val() == "set" )
                        obj.mdset = true;

                    // Analyze changes to dependencies to generate add/rem lists

                    var i, dep;

                    obj.depAdd = [];
                    obj.depRem = [];

                    for ( i in orig_deps ){
                        dep = orig_deps[i];

                        if ( deps.findIndex( function( el ){
                            if ( dep.id != el.id || dep.type != el.type )
                                return false;
                            else
                                return true;
                        }) == -1 ){
                            obj.depRem.push( dep );
                        }
                    }

                    for ( i in deps ){
                        dep = deps[i];

                        if ( orig_deps.findIndex( function( el ){
                            if ( dep.id != el.id || dep.type != el.type )
                                return false;
                            else
                                return true;
                        }) == -1 ){
                            obj.depAdd.push( dep );
                        }

                        // Check for duplicate dependencies
                        if ( deps.findIndex( function( el, idx ){
                            if ( idx == i || dep.id != el.id || dep.type != el.type )
                                return false;
                            else
                                return true;
                        }) != -1 ){
                            dialogs.dlgAlert( "Data Entry Error", "Duplicate references entered.");
                            return;
                        }
                    }

                    //console.log("dep add:",obj.depAdd);
                    //console.log("dep rem:",obj.depRem);

                    if ( Object.keys(obj).length === 0 ){
                        $(this).dialog('close');
                        return;
                    }

                    obj.id = a_data.id;
                    api.dataUpdate( obj, callback );
                }else{
                    // Create new record

                    util.getUpdatedValue( $("#title",frame).val(), {}, obj, "title" );
                    util.getUpdatedValue( $("#alias",frame).val(), {}, obj, "alias" );
                    util.getUpdatedValue( $("#desc",frame).val(), {}, obj, "desc" );
                    //util.getUpdatedValue( $("#tags",frame).val(), {}, obj, "tags" );

                    if ( is_published ){
                        util.getUpdatedValue( $("#doi",frame).val(), {}, obj, "doi" );
                        util.getUpdatedValue( $("#data_url",frame).val(), {}, obj, "dataUrl" );
                        if ( !obj.doi || !obj.dataUrl ){
                            dialogs.dlgAlert( "Data Entry Error", "DOI and Data URL must be specified for published data.");
                            return;
                        }
                    }else{
                        if ( $("#ext_auto",frame).prop("checked") ){
                            obj.extAuto = true;
                        }else{
                            util.getUpdatedValue( $("#extension",frame).val(), {}, obj, "ext" );
                        }
                    }

                    var tmp = jsoned.getValue();
                    if ( tmp )
                        obj.metadata = tmp;

                    if ( deps.length )
                        obj.deps = deps;

                    var repo_id = $("#alloc").val();
                    if ( repo_id == "bad" ){
                        dialogs.dlgAlert( "Data Entry Error", "Parent collection is invalid");
                        return;
                    }else if (repo_id != 'default' )
                        obj.repoId = repo_id;

                    obj.tags = tag_el.tagit("assignedTags");

                    obj.parentId = $("#coll",frame).val().trim();
                    parent_coll = obj.parentId;
                    api.dataCreate( obj, callback );
                }
            }
        }],
        resize: function(){
            jsoned.resize();
        },
        open: function(ev,ui){
            dlg_inst = $(this);

            $(this).css('padding', '0');

            $("#dlg-tabs",frame).tabs({heightStyle:"fill"});

            var widget = frame.dialog( "widget" );
            $(".ui-dialog-buttonpane",widget).append("<span class='note' style='padding:1em;line-height:200%'>* Required fields</span>");

            $("select",frame).selectmenu({width:200});

            tag_el.tagit({
                autocomplete: {
                    delay: 500,
                    minLength: 3,
                    source: "/api/tag/autocomp"
                },
                caseSensitive: false
            });
        
            jsoned = ace.edit( $("#md",frame).get(0), {
                theme:(settings.theme=="light"?"ace/theme/light":"ace/theme/dark"),
                mode:"ace/mode/json",
                fontSize:16,
                autoScrollEditorIntoView:true,
                wrap:true
            });

            util.inputTheme( $('input:text',frame ));
            util.inputTheme( $('textarea',frame ));
            $(".btn",frame).button();
        
            var parent;
            if ( a_data ){
                $("#title",frame).val(a_data.title);
                if ( a_data.alias ){
                    var idx =  a_data.alias.lastIndexOf(":");
                    a_data.alias = (idx==-1?a_data.alias:a_data.alias.substr(idx+1));
                    $("#alias",frame).val(a_data.alias);
                }

                $("#desc",frame).val(a_data.desc);
                
                if ( a_data.tags && a_data.tags.length ){
                    for ( var t in a_data.tags ){
                        tag_el.tagit("createTag", a_data.tags[t] );
                    }
                }

                if ( a_data.metadata ){
                    var md = JSON.parse( a_data.metadata );
                    var txt = JSON.stringify( md, null, 4 );
                    jsoned.setValue( txt, -1);
                }

                if ( a_data.deps && a_data.deps.length ){
                    var i, dep, row;
                    for ( i in a_data.deps ){
                        dep = a_data.deps[i];
                        if ( dep.dir == "DEP_OUT" ){
                            orig_deps.push({ id: dep.alias?dep.alias: dep.id, type: model.DepTypeFromString[dep.type] });
                            row = $("#ref-table tr:last",frame);
                            $("input",row).val( dep.alias?dep.alias: dep.id );
                            $("select",row).val(model.DepTypeFromString[dep.type]).selectmenu("refresh");
                            addRef();
                        }
                    }
                }

                if ( a_mode == DLG_DATA_MODE_EDIT ){
                    $("#published",frame).prop("disabled",true);

                    if (( a_upd_perms & model.PERM_WR_META ) == 0 ){
                        jsoned.setReadOnly(true);
                        jsoned.container.style.opacity=0.45;
                        $("#md_status").text("(read only)");
                        $("#md_mode",frame).prop('disabled',true);
                        $("#md_merge",frame).attr('disabled',true);
                        $("#md_set",frame).attr('disabled',true);
                    }
                    if (( a_upd_perms & model.PERM_WR_REC ) == 0 ){
                        util.inputDisable( $("#title,#desc,#alias", frame ));
                        util.inputDisable( $(".add-ref,.rem-ref,.ref-row input", frame ));
                        $(".ref-row select", frame ).selectmenu("disable");
                    }

                    if (( a_upd_perms & model.PERM_WR_DATA ) == 0 ){
                        util.inputDisable( $("#extension,#doi,data_url,#pick_source", frame ));
                        $("#ext_auto",frame).prop("disabled",true);
                    }

                    $("#dlg_coll_row",frame).css("display","none");
                    $("#dlg_alloc_row",frame).css("display","none");
                    $("#source_file",frame).val(a_data.source);
                    if ( a_data.extAuto ){
                        $("#ext_auto",frame).prop("checked",true);
                        $("#extension",frame).val(a_data.ext?a_data.ext + " (auto)":"(auto)").prop("disabled",true);
                    }else{
                        $("#extension",frame).val(a_data.ext?a_data.ext:"");
                    }
                    $("#doi",frame).val(a_data.doi);
                    $("#data_url",frame).val(a_data.dataUrl);
                    if ( a_data.dataUrl ){
                        $("#published",frame).prop("checked",true);
                        $("#working_data",frame).hide();
                        $("#published_data",frame).show();
                        $("#pub_upd_warn",frame).show();
                        util.inputDisable( $("#alias", frame ));
                    }else if ( a_data.size > 0 ){
                        $("#pub_del_warn,#pub_del_warn_ast",frame).show();
                    }
                }else{
                    $("#dlg_md_row2",frame).css("display","none");
                    if ( a_parent )
                        parent = a_parent;
                    else
                        parent = "root";
                }
            } else {
                $("#title",frame).val("");
                $("#alias",frame).val("");
                $("#desc",frame).val("");
                //$("#tags",frame).val("");
                //$("#md",frame).val("");
                $("#dlg_md_row2",frame).css("display","none");
                if ( a_parent )
                    parent = a_parent;
                $("#ext_auto",frame).prop("checked",true);
                $("#extension",frame).val("(auto)").prop("disabled",true);
            }

            $("#published",frame).checkboxradio().on( "change",function(ev){
                var pub = $("#published",frame).prop("checked");
                if ( pub ){
                    $("#working_data",frame).hide();
                    $("#published_data",frame).show();
                    $("#alias", frame ).val("");
                    util.inputDisable( $("#alias", frame ));
                }else{
                    $("#working_data",frame).show();
                    $("#published_data",frame).hide();
                    util.inputEnable( $("#alias", frame ));
                }
            });

            $("#ext_auto",frame).checkboxradio().on( "change",function(ev){
                var auto = $("#ext_auto",frame).prop("checked");
                if ( auto ){
                    updateAutoExt();
                    $("#extension",frame).prop("disabled",true);
                }else{
                    $("#extension",frame).val('').prop("disabled",false);
                }
            });

            var changetimer;
            if ( a_mode == DLG_DATA_MODE_NEW )
                $("#do_it").button("disable");

            $("#coll",frame).val( parent ).on( "input", function(){
                if ( changetimer )
                    clearTimeout( changetimer );
                else{
                    $("#do_it").button("disable");
                }

                changetimer = setTimeout( function(){
                    changetimer = null;
                    updateAllocSelect();
                }, 1000 );
            });

            // Alloc cannot be changed on edit currently
            if ( parent ){
                $("#alloc",frame).selectmenu();
                updateAllocSelect();
            }

            jsoned.resize();
        },
        close: function( ev, ui ) {
            jsoned.destroy();
            $(this).dialog("destroy").remove();
        }
    };

    frame.dialog( options );
}
