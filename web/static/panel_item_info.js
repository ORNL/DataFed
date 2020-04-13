import * as util from "./util.js";
import * as settings from "./settings.js";
import * as api from "./api.js";

var form = $("#sel_info_form");
var div = $("#sel_info_div");
var data_md_tree = null;
var data_md_empty = true;
var data_md_empty_src = [{title:"(n/a)", icon:false}];
var data_md_exp = {};

export function showSelectedInfo( node ){
    if ( !node ){
        showSelectedItemInfo();
        return;
    }

    console.log( "node key:", node.key, "scope:", node.data?node.data.scope:"n/a" );
    var key;

    if ( typeof node == 'string' )
        key = node;
    else if ( node.key == "shared_proj" && node.data.scope )
        key = node.data.scope;
    else if ( node.key.startsWith( "t/" ) && node.data.scope )
        key = node.data.scope;
    else if ( node.data.key_pfx )
        key = node.key.substr( node.data.key_pfx.length );
    else
        key = node.key;

    if ( key[0] == "c" ) {
        api.viewColl( key, function( item ){
            showSelectedItemInfo( item );
        }); 
    }else if ( key[0] == "d" ) {
        api.dataView( key, function( item ){
            showSelectedItemInfo( item );
        }); 
    }else if ( key == "mydata" ) {
        showSelectedHTML( "Owned Data<br><br>All data owned by you." );
    }else if ( key == "proj_own" ) {
        showSelectedHTML( "Owned Projects<br><br>All projects owned by you." );
    }else if ( key == "proj_adm" ) {
        showSelectedHTML( "Managed Projects<br><br>Projects owned by other users that are managed by you." );
    }else if ( key == "proj_mem" ) {
        showSelectedHTML( "Member Projects<br><br>Projects owned by other users where you are a member." );
    }else if ( key == "shared_all" ) {
        showSelectedHTML( "Shared Data<br><br>Data shared with you by other users and projects." );
    }else if ( key == "shared_user" ) {
        showSelectedHTML( "Shared Data by User<br><br>Data shared with you by other users." );
    }else if ( key == "shared_proj" ) {
        showSelectedHTML( "Shared Data by Project<br><br>Data shared with you by other projects." );
    }else if ( key == "queries" ) {
        showSelectedHTML( "Saved Queries<br><br>All saved queries created by you." );
    }else if ( key.startsWith("p/")){
        showSelectedProjInfo( key );
    }else if ( key.startsWith("q/")){
        api.sendQueryView( key, function( ok, item ){
            showSelectedItemInfo( item );
        }); 
    }else if ( key.startsWith("u/")){
        showSelectedUserInfo( key );
    }else if ( key.startsWith( "shared_user_" ) && node.data.scope ){
        showSelectedUserInfo( node.data.scope );
    }else if ( key.startsWith( "shared_proj_" ) && node.data.scope ){
        showSelectedProjInfo( node.data.scope );
    }else if ( key == "allocs" ) {
        showSelectedHTML( "Data Allocations<br><br>Lists allocations and associated data records." );
    }else if ( key.startsWith("published")) {
        showSelectedHTML( "Public Collections<br><br>Lists collections made public and available in DataFed catalogs." );
    }else if ( key.startsWith( "repo/" )) {
        showSelectedAllocInfo( node.data.repo, node.data.scope );
    }else{
        showSelectedItemInfo();
    }
}

export function showSelectedItemInfo( item ){
    if ( item && item.id ){
        showSelectedItemForm( item );
        if ( item.metadata ){
            showSelectedMetadata( item.metadata );
        }else{
            showSelectedMetadata();
        }
    }else{
        showSelectedMetadata();
        //showSelectedHTML( "Insufficient permissions to view data record." );
    }
}

function showSelectedHTML( html ){
    form.hide();
    div.html(html).show();
    showSelectedMetadata();
}

function showSelectedUserInfo( key ){
    api.userView( key, true, function( ok, item ){
        if ( ok, item ){
            item.id = item.uid;
            showSelectedItemInfo( item );
        }else{
            showSelectedItemInfo();
        }
    }); 
}

function showSelectedProjInfo( key ){
    api.viewProj( key, function( item ){
        showSelectedItemInfo( item );
    }); 
}

function showSelectedAllocInfo( repo, user ){
    api.allocView( repo, user, function( ok, data ){
        if ( ok ){
            var item = data.alloc[0];
            item.user = item.id;
            item.id = item.repo;
            showSelectedItemInfo( item );
        }else{
            showSelectedItemInfo();
        }
    });
}


function showSelectedItemForm( item ){
    var i, date = new Date(), t = item.id.charAt( 0 ), text, cls;

    switch ( t ){
        case 'd': text = "Data Record"; cls = item.doi?".sidp":".sid"; break;
        case 'c': text = "Collection"; cls = ".sic"; break;
        case 'u': text = "User"; cls = ".siu"; break;
        case 'p': text = "Project"; cls = ".sip"; break;
        case 'r': text = "Allocation"; cls = ".sia"; break;
        case 'q': text = "Query"; cls = ".siq"; break;
        default:
            return;
    }

    div.hide();

    $(".sel-info-table td:nth-child(2)",form).html("<span style='color:#808080'>(none)</span>");

    $("#sel_info_type",form).text( text );
    $("#sel_info_id",form).text( item.id );

    if ( item.title )
        $("#sel_info_title",form).text( item.title );

    if ( item.name )
        $("#sel_info_name",form).text( item.name );

    if ( item.alias && cls != ".sidp" )
        $("#sel_info_alias",form).text( item.alias );

    if ( item.doi )
        $("#sel_info_doi",form).text( item.doi );

    if ( item.dataUrl )
        $("#sel_info_url",form).text( item.dataUrl );

    if ( item.desc )
        $("#sel_info_desc",form).text( item.desc );

    if ( item.keyw )
        $("#sel_info_keyw",form).text( item.keyw );

    if ( item.owner )
        $("#sel_info_owner",form).text( item.owner );

    if ( item.creator )
        $("#sel_info_creator",form).text( item.creator );

    if ( cls == ".sid" ){
        $("#sel_info_repo",form).text( item.repoId.substr(5) );
        $("#sel_info_size",form).text( util.sizeToString( item.size ) );
        if ( item.source )
            $("#sel_info_src",form).text( item.source );

        $("#sel_info_ext",form).text(( item.ext?item.ext+" ":"") + ( item.extAuto?"(auto)":"" ));
    }

    if ( cls == ".siq" ){
        var qry = JSON.parse( item.query );

        if ( qry.id )
            $("#sel_info_qry_id",form).text( qry.id );
        if ( qry.text )
            $("#sel_info_qry_text",form).text( qry.text );
        if ( qry.meta )
            $("#sel_info_qry_meta",form).text( qry.meta );
    }

    if ( cls == ".sia" ){
        var is_user = item.user.startsWith("u/");
        $("#sel_info_title",form).text( "Allocation for " + (is_user?" user ":" project ") + item.user );
        $("#sel_info_desc",form).text( "Browse data records by allocation." );

        $("#sel_info_data_lim",form).text( util.sizeToString( item.dataLimit ));
        var used = Math.max( Math.floor(10000*item.dataSize/item.dataLimit)/100, 0 );
        $("#sel_info_data_sz",form).text( util.sizeToString( item.dataSize ) + " (" + used + " %)" );
        $("#sel_info_rec_lim",form).text( item.recLimit );
        $("#sel_info_rec_cnt",form).text( item.recCount );
    }

    if ( item.email )
        $("#sel_info_email",form).text( item.email );

    if ( item.ct ){
        date.setTime(item.ct*1000);
        $("#sel_info_ct",form).text( date.toLocaleDateString("en-US", settings.date_opts) );
    }

    if ( item.ut ){
        date.setTime(item.ut*1000);
        $("#sel_info_ut",form).text( date.toLocaleDateString("en-US", settings.date_opts) );
    }

    if ( item.dt ){
        date.setTime(item.dt*1000);
        $("#sel_info_dt",form).text( date.toLocaleDateString("en-US", settings.date_opts) );
    }

    if ( item.deps && item.deps.length ){
        var dep,id;
        text = "";
        for ( i in item.deps ){
            dep = item.deps[i];
            id = dep.id + (dep.alias?" ("+dep.alias+")":"");

            if ( dep.dir == "DEP_OUT" ){
                switch(dep.type){
                    case "DEP_IS_DERIVED_FROM":
                        text += "Derived from " + id + "<br>";
                        break;
                    case "DEP_IS_COMPONENT_OF":
                        text += "Component of " + id + "<br>";
                        break;
                    case "DEP_IS_NEW_VERSION_OF":
                        text += "New version of " + id + "<br>";
                        break;
                }
            }else{
                switch(dep.type){
                    case "DEP_IS_DERIVED_FROM":
                        text += "Precursor of " + id + "<br>";
                        break;
                    case "DEP_IS_COMPONENT_OF":
                        text += "Container of " + id + "<br>";
                        break;
                    case "DEP_IS_NEW_VERSION_OF":
                        text += "Old version of " + id + "<br>";
                        break;
                }
            }

            $("#sel_info_prov",form).html( text );
        }
    }

    if ( cls == ".sip" ){
        text = "";
        if ( item.admin && item.admin.length ){
            for ( i in item.admin )
                text += item.admin[i].substr(2) + " ";
            $("#sel_info_admins",form).text( text );
        }

        if ( item.member && item.member.length ){
            text = "";
            for ( i in item.member )
                text += item.member[i].substr(2) + " ";
            $("#sel_info_members",form).text( text );
        }
    }

    if ( item.alloc && item.alloc.length ){
        var alloc,free;
        text = "";
        for ( i = 0; i < item.alloc.length; i++ ){
            alloc = item.alloc[i];
            free = Math.max( 100*(alloc.dataLimit - alloc.dataSize)/alloc.dataLimit, 0 );
            text += alloc.repo + ": " + util.sizeToString( alloc.dataSize ) + " of " + util.sizeToString( alloc.dataLimit ) + " used (" + free.toFixed(1) + "% free)" + (i==0?" (default)":"") + "<br>";
        }
        $("#sel_info_allocs",form).html( text );
    }

    $(".sid,.sidp,.sic,.sip,.siu,.siq,.sia",form).hide();
    $(cls,form).show();

    form.show();
}

function showSelectedMetadata( md_str )
{
    //console.log("showSelectedMetadata, inst:",inst);
    if ( md_str ){
        for ( var i in data_md_exp ){
            if ( data_md_exp[i] == 1 )
                delete data_md_exp[i];
            else
                data_md_exp[i]--;
        }

        var md = JSON.parse( md_str );
        var src = util.buildObjSrcTree(md,"md",this);
        data_md_tree.reload( src );
        data_md_empty = false;
    } else if ( !data_md_empty ) {
        data_md_tree.reload(data_md_empty_src);
        data_md_empty = true;
    }
}


$("#data_md_tree").fancytree({
    extensions: ["themeroller","filter","dnd5"],
    themeroller: {
        activeClass: "my-fancytree-active",
        addClass: "",
        focusClass: "",
        hoverClass: "my-fancytree-hover",
        selectedClass: ""
    },
    dnd5:{
        preventNonNodes: true,
        dropEffectDefault: "copy",
        scroll: false,
        dragStart: function(node, data) {
            console.log( "dnd start" );
            data.dataTransfer.setData("text/plain",node.key);
            return true;
        }
    },
    filter:{
        autoExpand: true,
        mode: "hide"
    },
    source: data_md_empty_src,
    selectMode: 1,
    beforeExpand: function(event,data){
        // Handle auto-expansion
        var path = data.node.title;
        var par = data.node.parent;
        while ( par ){
            if ( par.title == "root" && !par.parent )
                break;
            path = par.title + "." + path;
            par = par.parent;
        }

        path = "md." + path;

        if ( data.node.isExpanded() ){
            delete data_md_exp[path];
        }else{
            data_md_exp[path] = 10;
        }
    }
});

data_md_tree = $.ui.fancytree.getTree("#data_md_tree");

$("#md_filter_text").on('keypress', function (e) {
    if (e.keyCode == 13){
        var text = $("#md_filter_text").val();
        data_md_tree.filterNodes( text );
    }
});

$("#md_filter_apply").on('click', function (e) {
    var text = $("#md_filter_text").val();
    data_md_tree.filterNodes( text );
});

$("#md_filter_reset").on('click', function (e) {
    $("#md_filter_text").val("");
    data_md_tree.clearFilter();
    var node = data_md_tree.getActiveNode();
    if ( node ){
        node.li.scrollIntoView();
    }
});
