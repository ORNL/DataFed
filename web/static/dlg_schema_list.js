import * as settings from "./settings.js";
import * as util from "./util.js";
import * as api from "./api.js";
import * as dlgPickUser from "./dlg_pick_user.js";

var tree;

window.schemaPageLoad = function( key, offset ){
    var node = tree.getNodeByKey( key );
    if ( node ){
        node.data.offset = offset;
        setTimeout(function(){
            node.load(true);
        },0);
    }
};

function loadSchemas(){
    api.schemaSearch({}, function(ok,data){
        if ( ok ){
            console.log( "sch res: ", data );
            var src = [];
            if ( data.schema ){
                var sch;
                for ( var i in data.schema ){
                    sch = data.schema[i];
                    src.push({ title: sch.id + " ver " + sch.ver + " (" + sch.cnt + ")", key: sch.id });
                }
            }else{
                src.push({ title: "(no matches)" });
            }
            tree.reload( src );
        }else{
            dialogs.dlgAlert( "Schema Search Error", data );
        }
    });
}

export function show( a_select, a_cb ){
    var frame = $(document.createElement('div'));

    frame.html(
        "<div class='col-flex' style='height:100%'>\
            <div style='flex:3 3 75%;overflow:auto;padding:0' class='content'>\
                <div id='sch_tree' class='content no-border'></div>\
            </div>\
            <div style='flex:none;padding-top:0.5em'>Search Options:</div>\
            <div style='flex:none;padding:0.5em 0 0 0.5em'>\
                <table class='form-table'>\
                    <tr><td>ID:</td><td colspan='2'><input id='srch_id' type='text' style='width:100%;box-sizing:border-box'></input></td></tr>\
                    <tr><td>Keywords:</td><td colspan='2'><input id='srch_txt' type='text' style='width:100%;box-sizing:border-box'></input></td></tr>\
                    <tr><td>Owner:</td><td><input id='srch_owner' type='text' style='width:100%;box-sizing:border-box'></input></td>\
                        <td><button title='Select user' id='pick_user' class='btn btn-icon-tiny'><span class='ui-icon ui-icon-person'></span></button></td></tr>\
                    <tr><td>Sort By:</td><td>\
                        <select id='srch_sort'>\
                            <option value='1' selected>ID</option>\
                            <option value='2'>Popularity</option>\
                        </select>\
                    </td></tr>\
                </table>\
            </div>\
        </div>" );

    var dlg_opts = {
        title: (a_select?"Select Schema":"Manage Schemas"),
        modal: true,
        width: 450,
        height: 500,
        resizable: true,
        buttons:[],
        open: function(event,ui){
            $(".btn",frame).button();
            if ( a_select ){
                $("#ok_btn").button("disable");
            }
            $("#srch_sort",frame).selectmenu();
        },
        close: function( ev, ui ) {
            $(this).dialog("destroy").remove();
        }
    };

    if ( a_select ){
        dlg_opts.buttons.push({
            text: "Cancel",
            click: function() {
                $(this).dialog('close');
            }
        });
    }

    dlg_opts.buttons.push({
        id:"ok_btn",
        text: (a_select?"Select":"Close"),
        click: function() {
            if ( a_cb ){
                a_cb();
            }
            $(this).dialog('close');
        }
    });

    util.inputTheme( $('input:text', frame ));
    //var search_input = $("#search_input",frame);

    var src = [{title:"Loading...",icon:false,folder:false}];

    $("#sch_tree",frame).fancytree({
        extensions: ["themeroller"],
        themeroller: {
            activeClass: "my-fancytree-active",
            hoverClass: ""
        },
        source: src,
        nodata: false,
        selectMode: 1,
        icon: false,
        checkbox: false,
        click: function( ev, data ) {
            if ( data.node.isSelected() )
                data.node.setSelected( false );
            else
                data.node.setSelected( true );
        },
        activate: function( ev, data ){
            data.node.setSelected( true );
        }
    });

    tree = $.ui.fancytree.getTree($("#sch_tree",frame));

    loadSchemas();

    $("#pick_user",frame).click(function(){
        dlgPickUser.show( "u/"+settings.user.uid, [], true, function( users ){
            $("#srch_owner",frame).val( users[0].substr(2) );
        });
    });

    //var in_timer;

    /*search_input.on( "input", function(e) {
        if ( in_timer )
            clearTimeout( in_timer );

        in_timer = setTimeout( function(){
            var node = tree.getNodeByKey("search");
            node.load(true).done( function(){ node.setExpanded(true); });
        }, 500 );
    });*/

    frame.dialog( dlg_opts );
}

