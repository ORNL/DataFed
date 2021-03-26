import * as util from "./util.js";
import * as api from "./api.js";
import * as model from "./model.js";
import * as settings from "./settings.js";
import * as dlgPickUser from "./dlg_pick_user.js";
import * as dlgPickProj from "./dlg_pick_proj.js";
import * as dlgSchemaList from "./dlg_schema_list.js";
import * as dlgQueryBuild from "./dlg_query_builder.js";


export function newSearchPanel( a_frame, a_parent ){
    return new SearchPanel( a_frame, a_parent );
}

function SearchPanel( a_frame, a_parent ){
    var inst = this,
        tags_div = $("#srch_tags_div",a_frame),
        user_tags = [],
        textTimer = null,
        date_from = $("#srch_date_from",a_frame),
        date_from_ts = $("#srch_date_from_ts",a_frame),
        date_to = $("#srch_date_to",a_frame),
        date_to_ts = $("#srch_date_to_ts",a_frame);

    this.buildSearch = function(){
        var tmp, query = {};

        query.mode = parseInt( $(".srch-mode",a_frame).val() );

        query.sort = parseInt( $(".srch-sort",a_frame).val() );
        if ( query.sort < 0 ){
            query.sort = -query.sort;
            query.sortRev = true;
        }else{
            query.sortRev = false;
        }

        tmp = $("#srch_id",a_frame).val();
        if ( tmp )
            query.id = tmp;

        tmp = $("#srch_text",a_frame).val();
        if ( tmp )
            query.text = tmp;
    
        query.tags = user_tags;

        if ( date_from.val() ){
            query.from = parseInt( date_from_ts.val() )/1000;
        }

        if ( date_to.val() ){
            query.to = parseInt( date_to_ts.val() )/1000;
        }

        tmp = $("#srch_creator",a_frame).val().trim();
        if ( tmp ){
            query.owner = tmp;
        }

        if ( query.mode == model.SM_DATA ){
            tmp = $("#srch_sch_id",a_frame).val();
            if ( tmp )
                query.schId = tmp;

            tmp = $("#srch_meta",a_frame).val();
            if ( tmp )
                query.meta = tmp;
        
            if ( $( "#srch_meta_err", a_frame ).prop("checked")){
                query.metaErr = true;
            }
        }

        return query;
    }
        
    // ----- Run query button -----

    $("#srch_run_btn",a_frame).on("click", function(){
        a_parent.searchPanel_Run( inst.buildSearch() );
    });

    // ----- Save query button -----

    $("#srch_save_btn",a_frame).on("click", function(){

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
            //coll_off = 0;
            //loadCollections();
        },
        beforeTagRemoved: function( ev, ui ){
            var idx = user_tags.indexOf( ui.tagLabel );
            if ( idx != -1 )
                user_tags.splice( idx, 1 );
            //coll_off = 0;
            //loadCollections();
        }
    });

    $(".tagit-new",a_frame).css("clear","left");

    $("#srch_tags_clear",a_frame).on("click",function(){
        tags_div.tagit("removeAll");
        //coll_off = 0;
        //loadCollections();
    });

    // ----- Text input setup -----

    $("#srch_text,#srch_creator,#srch_meta,#srch_sch_id",a_frame).on("keypress",function( ev ){
        if ( ev.keyCode == 13 ){
            if ( textTimer )
                clearTimeout( textTimer );
            ev.preventDefault();
            //coll_off = 0;
            //loadCollections();
        }
    });

    $("#srch_text,#srch_creator",a_frame).on("input",function( ev ){
        if ( textTimer )
            clearTimeout( textTimer );

        textTimer = setTimeout(function(){
            //coll_off = 0;
            //loadCollections();
            textTimer = null;
        },2000);
    });

    $("#srch_text_clear",a_frame).on("click",function(){
        if ( textTimer )
            clearTimeout( textTimer );
        $("#srch_text",a_frame).val("");
        //coll_off = 0;
        //loadCollections();
    });

    // ----- Schema input setup -----

    $("#srch_sch_pick",a_frame).on("click",function(){
        dlgSchemaList.show( true, false, function( schema ){
            $("#srch_sch_id",a_frame).val( schema.id + ":" + schema.ver );
            //coll_off = 0;
            //loadCollections();
        });
    });

    $("#srch_sch_clear",a_frame).on("click",function(){
        if ( textTimer )
            clearTimeout( textTimer );
        $("#srch_sch_id",a_frame).val("");
        //coll_off = 0;
        //loadCollections();
    });

    // ----- Metadata input setup -----

    $("#srch_meta_build",a_frame).on("click",function(){
        dlgQueryBuild.show();
    });

    $("#srch_meta_clear",a_frame).on("click",function(){
        if ( textTimer )
            clearTimeout( textTimer );
        $("#srch_meta",a_frame).val("");
        //coll_off = 0;
        //loadCollections();
    });

    $("#srch_meta_err",a_frame).change( function(){
        if ( textTimer )
            clearTimeout( textTimer );
        //coll_off = 0;
        //loadCollections();
    });

    // ----- Creator input setup -----

    $("#srch_creator_pick_user",a_frame).on("click",function(){
        dlgPickUser.show( "u/"+settings.user.uid, [], true, function( users ){
            $("#srch_creator",a_frame).val( users[0] );
            //coll_off = 0;
            //loadCollections();
        });
    });

    $("#srch_creator_clear",a_frame).on("click",function(){
        if ( textTimer )
            clearTimeout( textTimer );
        $("#srch_creator",a_frame).val("");
        //coll_off = 0;
        //loadCollections();
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
                //coll_off = 0;
                //loadCollections();
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
                //coll_off = 0;
                //loadCollections();
            }
        }
    });

    $("#srch_datetime_clear",a_frame).on("click",function(){
        if ( textTimer )
            clearTimeout( textTimer );

        date_from.val("");
        date_to.val("");
        //coll_off = 0;
        //loadCollections();
    });

    return this;
}
