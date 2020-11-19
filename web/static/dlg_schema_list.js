import * as settings from "./settings.js";
import * as util from "./util.js";
import * as api from "./api.js";
import * as dialogs from "./dialogs.js";
import * as dlgPickUser from "./dlg_pick_user.js";
import * as dlgSchema from "./dlg_schema.js";

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
                    //src.push({ title: sch.id + (sch.ver?"-"+sch.ver:"") + (sch.cnt?" (" + sch.cnt + ")":"") + (sch.ownNm?" " + sch.ownNm:"") + (sch.ownId?" (" + sch.ownId +")":""), key: sch.id + ":" + sch.ver });
                    src.push({ title: sch.id + (sch.ver?"-"+sch.ver:"") + (sch.cnt?" (" + sch.cnt + ")":""), own_nm: sch.ownNm, own_id: sch.ownId, id: sch.id, ver: sch.ver, key: sch.id + ":" + sch.ver });
                }
            }else{
                src.push({ title: "(no matches)" });
            }
            tree.reload( src );
        }else{
            dialogs.dlgAlert( "Schema Search Error", data );
        }
    });
};

function getSelSchema( a_cb ){
    var data = tree.getSelectedNodes()[0].data;
    api.schemaView( data.id, data.ver, function( ok, reply ){
        console.log("schema",reply);
        if ( ok && reply.schema ){
            a_cb( reply.schema[0] );
        }else{
            dialogs.dlgAlert( "Schema Load Error", reply );
        }
    });
};


export function show( a_select, a_cb ){
    var frame = $(document.createElement('div'));

    frame.html(
        "<div class='col-flex' style='height:100%'>\
            <div style='flex:3 3 75%;overflow:auto;padding:0' class='ui-widget ui-widget-content content'>\
                <table id='sch_tree'>\
                    <colgroup><col width='*'></col><col></col><col></col></colgroup>\
                    <tbody><tr><td style='white-space: nowrap;padding: 0 2em 0 0'></td><td style='white-space: nowrap;padding: 0 2em 0 0'></td></tr></tbody>\
                </table>\
            </div>\
            <div style='flex:none;padding-top:0.5em'>\
                <button id='sch_new' class='btn' title='Create new schema'>New</button>\
                <button id='sch_view' class='btn btn-sel' title='View schema details' disabled>View</button>\
                <button id='sch_edit' class='btn btn-sel' title='Edit schema' disabled>Edit</button>\
                <button id='sch_rev' class='btn btn-sel' title='Create new revision of schema' disabled>Revise</button>\
                <button id='sch_del' class='btn btn-sel' title='Delete schema' disabled>Delete</button>\
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
        width: 600,
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
        extensions: ["themeroller","table"],
        themeroller: {
            activeClass: "my-fancytree-active",
            hoverClass: ""
        },
        table: {
            nodeColumnIdx: 0,
        },
        source: src,
        nodata: false,
        selectMode: 1,
        icon: false,
        checkbox: false,
        activate: function( ev, data ){
            data.node.setSelected( true );
            $(".btn-sel",frame).button("enable");
        },
        renderColumns: function( ev, data ) {
            var node = data.node, $tdList = $(node.tr).find(">td");

            //$tdList.eq(1).text(node.data.own_nm);
            if ( node.data.own_nm ){
                $tdList.eq(1).html("<span title='"+node.data.own_id.substr(2)+"'>"+node.data.own_nm+"</span>");
            }
            //$tdList.eq(2).text(node.data.own_id?"("+node.data.own_id+")":"");

        },
    });

    tree = $.ui.fancytree.getTree($("#sch_tree",frame));

    loadSchemas();


    $("#pick_user",frame).click(function(){
        dlgPickUser.show( "u/"+settings.user.uid, [], true, function( users ){
            $("#srch_owner",frame).val( users[0].substr(2) );
        });
    });

    $("#sch_view",frame).on("click",function(){
        getSelSchema( function( schema ){
            dlgSchema.show( dlgSchema.mode_view, schema );
        });
    });

    $("#sch_edit",frame).on("click",function(){
        getSelSchema( function( schema ){
            dlgSchema.show( dlgSchema.mode_edit, schema );
        });
    });

    $("#sch_new",frame).on("click",function(){
        dlgSchema.show( dlgSchema.mode_new );
    });

    $("#sch_rev",frame).on("click",function(){
        getSelSchema( function( schema ){
            dlgSchema.show( dlgSchema.mode_rev, schema );
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

