import * as api from "./api.js";
import * as util from "./util.js";
import * as model from "./model.js";
import * as settings from "./settings.js";
import * as query_builder from "./query_builder.js";
import * as dlgPickUser from "./dlg_pick_user.js";
import * as dlgPickProj from "./dlg_pick_proj.js";
import * as dlgSchemaList from "./dlg_schema_list.js";
import * as dlgQueryBuild from "./dlg_query_builder.js";

//$("#run_qry_btn").addClass("ui-state-error");


export function newSearchPanel( a_frame, a_parent ){
    return new SearchPanel( a_frame, a_parent );
}

function SearchPanel( a_frame, a_parent ){
    var inst = this,
        tags_div = $("#srch_tags_div",a_frame),
        user_tags = [],
        date_from = $("#srch_date_from",a_frame),
        date_from_ts = $("#srch_date_from_ts",a_frame),
        date_to = $("#srch_date_to",a_frame),
        date_to_ts = $("#srch_date_to_ts",a_frame),
        enabled = false,
        srch_scope = $("#srch_scope",a_frame),
        qry_doc = null,
        suppress_run = false;


    this.setSearchSelect = function( a_id_set ){
        var html = "";
        if ( a_id_set && !util.isObjEmpty( a_id_set )){
            var title;
            for ( var id in a_id_set ){
                title = a_id_set[id];
                html += "<div class='srch-scope-item' data='" + id +
                    "' title='" + id + "'><div class='row-flex' style='width:100%'><div style='flex:1 1 auto;white-space:nowrap;overflow:hidden'>" + title +
                    "</div><div class='srch-scope-btn-div' style='flex:none'><button class='srch-scope-rem-btn btn btn-icon'><span class='ui-icon ui-icon-close'></span></button></div></div></div>";
            }
            srch_scope.html(html);
            $(".btn",srch_scope).button();
            $("#srch_run_btn,#srch_save_btn",a_frame).button("option","disabled",false);
            enabled = true;
        }else{
            srch_scope.html(html);
            $("#srch_run_btn,#srch_save_btn",a_frame).button("option","disabled",true);
            enabled = false;
        }
    }

    this.setQuery = function( query ){
        // Protobuf Enums returned as string names, not integers
        var sm = model.SearchModeFromString[query.mode];
        $(".srch-mode",a_frame).val( sm ).selectmenu("refresh");
        $(".srch-sort",a_frame).val( query.sortRev?-model.SortFromString[query.sort]:model.SortFromString[query.sort]).selectmenu("refresh");

        $("#srch_id",a_frame).val( query.id?query.id:"" );
        $('#srch_id_div').accordion( "option", "active", query.id?0:false );

        $("#srch_text",a_frame).val( query.text?query.text:"" );
        $('#srch_text_div').accordion( 'option', { active: query.text?0:false });

        if ( query.tags ){
            suppress_run = true;
            tags_div.tagit("removeAll");
            for ( var i in query.tags ){
                tags_div.tagit("createTag", query.tags[i] );
            }
            suppress_run = false;
            $('#srch_tags_div').accordion( 'option', { active: 0 });
        }else{
            suppress_run = true;
            tags_div.tagit("removeAll");
            suppress_run = false;
            $('#srch_tags_div').accordion( 'option', { active: false });
        }

        if ( query.from || query.to ){
            console.log("form:",query.from,",to:",query.to);
            date_from.datepicker( "setDate", query.from? new Date( query.from * 1000 ): null );
            date_to.datepicker( "setDate", query.to? new Date( query.to * 1000 ): null );
            $('#srch_date_div').accordion( 'option', { active: 0 });
        }else{
            date_from.datepicker( "setDate", null );
            date_to.datepicker( "setDate", null );
            $('#srch_date_div').accordion( 'option', { active: false });
        }

        $("#srch_creator",a_frame).val( query.creator?query.creator:"" );
        $('#srch_creator_div').accordion( "option", "active", query.creator?0:false );

        if ( sm == model.SM_DATA ){
            $("#srch_sch_id",a_frame).val( query.schId?query.schId:"" );
            $("#srch_meta",a_frame).val( query.meta?query.meta:"" );
            $("#srch_meta_err", a_frame ).prop( "checked", query.metaErr?true:false );
            $('#srch_meta_div').accordion( 'option', { active: (query.schId || query.meta || query.metaErr)?0:false });
            $(".srch-data-options",a_frame).show();
        }else{
            $(".srch-data-options",a_frame).hide();
            $("#srch_sch_id",a_frame).val( "" );
            $("#srch_meta",a_frame).val( "" );
            $("#srch_meta_err", a_frame ).prop( "checked", false );
        }
    }

    this.getQuery = function(){
        var tmp, query = {empty:true};

        query.mode = parseInt( $(".srch-mode",a_frame).val() );

        query.sort = parseInt( $(".srch-sort",a_frame).val() );
        if ( query.sort < 0 ){
            query.sort = -query.sort;
            query.sortRev = true;
        }else{
            query.sortRev = false;
        }

        tmp = $("#srch_id",a_frame).val();
        if ( tmp ){
            query.id = tmp;
            query.empty = false;
        }

        tmp = $("#srch_text",a_frame).val();
        if ( tmp ){
            query.text = tmp;
            query.empty = false;
        }
    
        query.tags = user_tags;
        if ( query.tags.length ){
            query.empty = false;
        }

        if ( date_from.val() ){
            query.from = parseInt( date_from_ts.val() )/1000;
            query.empty = false;
        }

        if ( date_to.val() ){
            query.to = parseInt( date_to_ts.val() )/1000;
            query.empty = false;
        }

        tmp = $("#srch_creator",a_frame).val().trim();
        if ( tmp ){
            query.creator = tmp;
            query.empty = false;
        }

        if ( query.mode == model.SM_DATA ){
            tmp = $("#srch_sch_id",a_frame).val();
            if ( tmp ){
                query.schId = tmp;
                query.empty = false;
            }

            tmp = $("#srch_meta",a_frame).val();
            if ( tmp ){
                query.meta = tmp;
                query.empty = false;
            }
        
            if ( $( "#srch_meta_err", a_frame ).prop("checked")){
                query.metaErr = true;
                query.empty = false;
            }
        }

        return query;
    }

    this._setMetaQuery = function( a_qry ){
        var expr = query_builder.queryToExpression( a_qry );
        if ( expr ){
            qry_doc = a_qry;
            $("#srch_meta",a_frame).val( expr );
        }
    }

    this._runSearch = function(){
        a_parent.searchPanel_Run( inst.getQuery() );
    }

    // ----- Run query button -----

    $("#srch_run_btn",a_frame).on("click", function(){
        inst._runSearch();
    });

    // ----- Save query button -----

    $("#srch_save_btn",a_frame).on("click", function(){
        a_parent.searchPanel_Save( inst.getQuery() );
    });


    // ----- Search mode -----

    $(".srch-mode",a_frame).on("selectmenuchange", function(){
        var cur_mode = parseInt( $(".srch-mode",a_frame).val() );
        if ( cur_mode == model.SM_DATA ){
            $(".srch-data-options",a_frame).show();
        }else{
            $(".srch-data-options",a_frame).hide();
        }
    });

    // ----- Search Scope (selection) -----

    $("#srch_scope",a_frame).on("click",".srch-scope-rem-btn",function(){
        var el = $(this),
            item = el.closest(".srch-scope-item"),
            id = item.attr("data");

        a_parent.searchPanel_RemoveScope( id );
        item.remove();
    });

    $("#srch_scope_add",a_frame).on("click",function(){
        //inst.setSearchSelect();
        //a_parent.searchPanel_ClearScope();
        var sel = a_parent.searchPanel_GetSelection();
        inst.setSearchSelect( sel );
    });

    $("#srch_scope_clear",a_frame).on("click",function(){
        inst.setSearchSelect();
        a_parent.searchPanel_ClearScope();
    });

    // ----- Tag input setup -----

    tags_div.tagit({
        autocomplete: {
            delay: 500,
            minLength: 3,
            source: "/api/tag/autocomp"
        },
        caseSensitive: false,
        removeConfirmation: true,
        afterTagAdded: function( ev, ui ){
            user_tags.push( ui.tagLabel );
            if ( !suppress_run ){
                inst._runSearch();
            }
        },
        beforeTagRemoved: function( ev, ui ){
            var idx = user_tags.indexOf( ui.tagLabel );
            if ( idx != -1 )
                user_tags.splice( idx, 1 );
        },
        afterTagRemoved: function(){
            if ( !suppress_run ){
                inst._runSearch();
            }
        }
    });

    $(".tagit-new",a_frame).css("clear","left");

    $("#srch_tags_clear",a_frame).on("click",function(){
        if ( user_tags.length ){
            suppress_run = true;
            tags_div.tagit("removeAll");
            suppress_run = false;
            inst._runSearch();
        }
    });

    // ----- Search ID setup -----

    $("#srch_id_clear",a_frame).on("click",function(){
        if ( $("#srch_id",a_frame).val().trim().length ){
            $("#srch_id",a_frame).val("");
            inst._runSearch();
        }
    });
    
    // ----- Text fields input setup -----

    $("#srch_id,#srch_text,#srch_creator,#srch_sch_id",a_frame).on("keypress",function( ev ){
        if ( ev.keyCode == 13 ){
            ev.preventDefault();
            if ( enabled ){
                inst._runSearch();
            }
        }else{
            qry_doc = null;
        }
    });

    $("#srch_text_clear",a_frame).on("click",function(){
        if ( $("#srch_text",a_frame).val().trim().length ){
            $("#srch_text",a_frame).val("");
            inst._runSearch();
        }
    });

    // ----- Schema input setup -----

    $("#srch_sch_pick",a_frame).on("click",function(){
        dlgSchemaList.show( true, false, function( schema ){
            var id = schema.id + ":" + schema.ver;
            if ( $("#srch_sch_id",a_frame).val() != id ){
                $("#srch_sch_id",a_frame).val( id );
                inst._runSearch();
            }
        });
    });

    // ----- Metadata input setup -----

    $("#srch_meta",a_frame).on("keypress",function( ev ){
        if ( ev.keyCode == 13 ){
            ev.preventDefault();
            if ( enabled ){
                inst._runSearch();
            }
        }else{
            qry_doc = null;
        }
    });

    $("#srch_meta_build",a_frame).on("click",function(){
        var sch_id = $("#srch_sch_id",a_frame).val().trim();
        if ( sch_id ){
            api.schemaView( sch_id, true, function( ok, reply ){
                if ( !ok ){
                    util.setStatusText( reply, true );
                }
                dlgQueryBuild.show( ok?reply.schema[0]:null, qry_doc, function( qry ){
                    inst._setMetaQuery( qry );
                });
            });
        }else{
            dlgQueryBuild.show( null, qry_doc, function( qry ){
                inst._setMetaQuery( qry );
            });
        }
    });

    $("#srch_meta_clear",a_frame).on("click",function(){
        if ( $("#srch_meta",a_frame).val().trim().length ){
            $("#srch_meta,#srch_sch_id",a_frame).val("");
            qry_doc = null;
            inst._runSearch();
        }
    });

    $( "#srch_meta_err", a_frame ).on("change",function(){
        inst._runSearch();
    })

    // ----- Creator input setup -----

    $("#srch_creator_pick_user",a_frame).on("click",function(){
        dlgPickUser.show( "u/"+settings.user.uid, [], true, function( users ){
            if ( $("#srch_creator",a_frame).val().trim() != users[0] ){
                $("#srch_creator",a_frame).val( users[0] );
                inst._runSearch();
            }
        });
    });

    $("#srch_creator_clear",a_frame).on("click",function(){
        if ( $("#srch_creator",a_frame).val().trim().length ){
            $("#srch_creator",a_frame).val("");
            inst._runSearch();
        }
    });

    // ----- Date input setup -----

    date_from.datepicker({
        altField: "#srch_date_from_ts",
        altFormat: "@",
        beforeShow: function(){
            var _to = date_to.val();
            if ( _to ){
                date_from.datepicker( "option", "maxDate", _to );
            }
        },
        onClose: function( date ){
            if ( date ){
                inst._runSearch();
            }
        }
    });

    date_to.datepicker({
        altField: "#srch_date_to_ts",
        altFormat: "@",
        beforeShow: function( input, picker ){
            var _from = date_from.val();
            if ( _from ){
                date_to.datepicker( "option", "minDate", _from );
            }
        },
        onClose: function( date ){
            if ( date ){
                inst._runSearch();
            }
        }
    });

    $("#srch_datetime_clear",a_frame).on("click",function(){
        date_from.val("");
        date_to.val("");
        inst._runSearch();
    });

    util.inputTheme( $('input,textarea', a_frame ));

    $(".srch-mode",a_frame).selectmenu({ width: false });
    $(".srch-sort",a_frame).selectmenu({ width: false });

    $(".srch-mode,.srch-sort",a_frame).on("selectmenuchange",function(){
        inst._runSearch();
    });

    $(".accordion.acc-act",a_frame).accordion({
        header: "h3",
        collapsible: true,
        heightStyle: "content",
        create: function( ev, ui ){
            ui.header.removeClass("ui-state-active");
        },
        activate: function( ev, ui ){
            ui.newHeader.removeClass("ui-state-active");
        }
    });

    $(".accordion:not(.acc-act)",a_frame).accordion({
        header: "h3",
        collapsible: true,
        heightStyle: "content",
        active: false,
        activate: function( ev, ui ){
            ui.newHeader.removeClass("ui-state-active");
        }
    });

    return this;
}
