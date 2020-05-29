import * as util from "./util.js";
import * as model from "./model.js";
import * as settings from "./settings.js";
import * as api from "./api.js";
import * as dlgAnnotation from "./dlg_annotation.js";

var form = $("#sel_info_form");
var div = $("#sel_info_div");
var note_div = $("#note-div");
var note_details = $("#note-details");
var data_md_tree = null;
var data_md_empty = true;
var tree_empty_src = [{title:"<span style='color:#808080;margin-left:-1.4em;margin-top:-.5em'>(none)</span>", icon:false}];
var data_md_exp = {};
var note_active_tree = null;
var note_open_tree = null;
var note_closed_tree = null;
var note_icon = ["circle-help","circle-info","alert","flag"];
var cur_item = null;
var cur_notes;

export function showSelectedInfo( node, cb ){
    cur_item = null;

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
            cur_item = item;
            if ( cb ) cb( item );
        }); 
    }else if ( key[0] == "d" ) {
        api.dataView( key, function( item ){
            showSelectedItemInfo( item );
            cur_item = item;
            if ( cb ) cb( item );
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
        showSelectedProjInfo( key, cb );
    //}else if ( key.startsWith("n/")){
    //    showSelectedNoteInfo( key );
    }else if ( key.startsWith("q/")){
        api.sendQueryView( key, function( ok, item ){
            showSelectedItemInfo( item );
            cur_item = item;
            if ( cb ) cb( item );
        }); 
    }else if ( key.startsWith("u/")){
        showSelectedUserInfo( key, cb );
    }else if ( key.startsWith( "shared_user_" ) && node.data.scope ){
        showSelectedUserInfo( node.data.scope, cb );
    }else if ( key.startsWith( "shared_proj_" ) && node.data.scope ){
        showSelectedProjInfo( node.data.scope, cb );
    }else if ( key == "allocs" ) {
        showSelectedHTML( "Data Allocations<br><br>Lists allocations and associated data records." );
    }else if ( key.startsWith("published")) {
        showSelectedHTML( "Public Collections<br><br>Lists collections made public and available in DataFed catalogs." );
    }else if ( key.startsWith( "repo/" )) {
        showSelectedAllocInfo( node.data.repo, node.data.scope, cb );
    }else{
        showSelectedItemInfo();
    }
}

export function showSelectedItemInfo( item ){
    if ( item && item.id ){
        showSelectedItemForm( item );
        if ( item.id.startsWith( "d/" ) || item.id.startsWith( "c/" )){
            setupAnnotationTab( item.id );
        }
        if ( item.metadata ){
            showSelectedMetadata( item.metadata );
        }else{
            showSelectedMetadata();
        }
    }else{
        form.hide();
        note_div.hide();
        showSelectedMetadata();
        //showSelectedHTML( "Insufficient permissions to view data record." );
    }
}

function showSelectedHTML( html ){
    form.hide();
    note_div.hide();
    div.html(html).show();
    showSelectedMetadata();
}

function showSelectedUserInfo( key, cb ){
    api.userView( key, true, function( ok, item ){
        if ( ok, item ){
            console.log("userView:",item);
            item.id = item.uid;
            showSelectedItemInfo( item );
            cur_item = item;
            if ( cb ) cb( item );
        }else{
            showSelectedItemInfo();
        }
    }); 
}

function showSelectedProjInfo( key, cb ){
    api.viewProj( key, function( item ){
        showSelectedItemInfo( item );
        cur_item = item;
        if ( cb ) cb( item );
    }); 
}

$("#note_active_tree").fancytree({
    extensions: ["themeroller"],
    themeroller: {
        activeClass: "my-fancytree-active",
        addClass: "",
        focusClass: "",
        hoverClass: "my-fancytree-hover",
        selectedClass: ""
    },
    source: [],
    nodata: false,
    selectMode: 1,
    activate: function( event, data ) {
        showSelectedNoteInfo( data.node );
    }
});

note_active_tree = $.ui.fancytree.getTree("#note_active_tree");

$("#note_open_tree").fancytree({
    extensions: ["themeroller"],
    themeroller: {
        activeClass: "my-fancytree-active",
        addClass: "",
        focusClass: "",
        hoverClass: "my-fancytree-hover",
        selectedClass: ""
    },
    source: [],
    nodata: false,
    selectMode: 1,
    activate: function( event, data ) {
        showSelectedNoteInfo( data.node );
    }
});

note_open_tree = $.ui.fancytree.getTree("#note_open_tree");

$("#note_closed_tree").fancytree({
    extensions: ["themeroller"],
    themeroller: {
        activeClass: "my-fancytree-active",
        addClass: "",
        focusClass: "",
        hoverClass: "my-fancytree-hover",
        selectedClass: ""
    },
    source: [],
    nodata: false,
    selectMode: 1,
    activate: function( event, data ) {
        showSelectedNoteInfo( data.node );
    }
});

note_closed_tree = $.ui.fancytree.getTree("#note_closed_tree");

function setupAnnotationTab( a_subject_id, a_cb ){
    note_details.html("");

    api.annotationListBySubject( a_subject_id, function( ok, data ){
        if ( ok ){
            //console.log("data:",data);
            var note_active = [],
                note_open = [],
                note_closed = [],
                note, entry, ns, nt;

            var act = $("#note-tabs").tabs('option', 'active');

            cur_notes = new Set();

            if ( data.note ){
                for ( var i = 0; i < data.note.length; i++ ) {
                    note = data.note[i];
                    nt = model.NoteTypeFromString[note.type];
                    ns = model.NoteStateFromString[note.state];
                    //console.log("note:",note);

                    entry = {title:note.title,icon:"ui-icon ui-icon-" + note_icon[nt], key: note.id, subject: a_subject_id };
                    if ( ns == model.NOTE_ACTIVE ){
                        if ( note_active.length == 0 && act != 0 )
                            entry.active = true;
                        note_active.push(entry);
                        cur_notes.add( nt );
                    }else if ( ns == model.NOTE_OPEN ){
                        if ( note_open.length == 0  && act != 1 )
                            entry.active = true;
                        note_open.push(entry);
                        cur_notes.add( nt );
                    }else{
                        if ( note_closed.length == 0  && act != 2 )
                            entry.active = true;
                        note_closed.push(entry);
                    }
                }
            }

            if ( note_active.length ){
                note_active_tree.reload(note_active).done( function(){
                    if ( act == 0 )
                        note_active_tree.activateKey( note_active[0].key );
                });
            }else{
                note_active_tree.reload(tree_empty_src);
            }

            if ( note_open.length ){
                note_open_tree.reload(note_open).done( function(){
                    if ( act == 1 )
                        note_open_tree.activateKey( note_open[0].key );
                });
            }else{
                note_open_tree.reload(tree_empty_src);
            }

            if ( note_closed.length ){
                note_closed_tree.reload(note_closed).done( function(){
                    if ( act == 2 )
                        note_closed_tree.activateKey( note_closed[0].key );
                });
            }else{
                note_closed_tree.reload(tree_empty_src);
            }

            var disabled = [];
            if ( note_active.length == 0 )
                disabled.push(0);
            if ( note_open.length == 0 )
                disabled.push(1);
            if ( note_closed.length == 0 )
                disabled.push(2);

            $("#note-tabs").tabs("option","disabled",disabled);

            note_div.show();

            if ( a_cb ) a_cb();
        }
    });
}

function showSelectedNoteInfo( node ){
    if ( !node.key.startsWith("n/")){
        note_details.html("");
        return;
    }

    api.annotationView( node.key, function( ok, data ){
        //console.log("note reply:",ok,data);
        if ( ok && data.note ){
            var note = data.note[0],
                nt = model.NoteTypeFromString[note.type],
                ns = model.NoteStateFromString[note.state],
                html, comm, date_ct = new Date(), date_ut = new Date();

            date_ct.setTime(note.ct*1000);
            date_ut.setTime(note.ut*1000);

            //<tr><td>ID:</td><td>"+note.id+"</td></tr>\

            html = "<div class='col-flex' style='height:100%'><div style='flex:1 1 auto;overflow:auto'>\
                <div style='padding:0 0 .5em 0'>Annotation Information:</div>\
                <table class='sel-note-table' style='padding:0 0 0 .5em'>\
                <tr><td>Title:</td><td>"+util.escapeHTML(note.title)+"</td></tr>\
                <tr><td>Type:</td><td>"+model.NoteTypeLabel[nt]+" ["+model.NoteStateLabel[ns] + "]</td></tr>\
                <tr><td>Creator:</td><td>"+note.comment[0].user.substr(2)+"</td></tr>\
                <tr><td>Created:</td><td>"+date_ct.toLocaleDateString("en-US", settings.date_opts)+"</td></tr>\
                <tr><td>Updated:</td><td>"+date_ut.toLocaleDateString("en-US", settings.date_opts)+"</td></tr>\
                </table>";

            var is_creator = ( note.comment[0].user == "u/"+settings.user.uid );
            html += "<div style='padding:1em 0 0 0'>Annotation History:</div>";

            for ( var i in note.comment ){
                comm = note.comment[i];
                date_ut.setTime(comm.time*1000);
                html += "<div style='padding:1em 0 0 0'>" + date_ut.toLocaleDateString("en-US", settings.date_opts) + ", <b>"+ comm.user.substr(2) + " ";

                switch ( comm.state ){
                    case "NOTE_OPEN": html += "opened"; break;
                    case "NOTE_CLOSED": html += "closed"; break;
                    case "NOTE_ACTIVE": html += "activated"; break;
                    default: html += "replied to"; break;
                }

                html += "</b> annotation:<br>";

                if ( comm.user == "u/"+settings.user.uid ){
                    html += "<div class='row-flex' style='padding:.5em;align-items:flex-end'><div class='ui-widget-content' style='flex:1 1 auto;padding:0.5em;white-space:pre-wrap'>" + util.escapeHTML(comm.comment) + "</div>";
                    html += "<div style='flex:none;padding:0 0 0 1em'><button class='btn btn-note-edit' id='btn_note_edit_"+i+"'>Edit</button></div></div>";
                }else{
                    html += "<div class='ui-widget-content' style='margin:0.5em;padding:0.5em;white-space:pre-wrap'>" + util.escapeHTML(comm.comment) + "</div>";
                }

                html += "</div>";
            }

            html += "</div><div style='flex:none;padding:1em 0 0 0'>";

            if ( ns != model.NOTE_CLOSED ){
                html += "<button class='btn btn-note-comment'>Reply</button>&nbsp";
            }

            if ( ns == model.NOTE_CLOSED && is_creator ){
                html += "<button class='btn btn-note-reopen'>Reopen</button>&nbsp";
            }

            if ( ns == model.NOTE_OPEN && is_creator ){
                html += "<button class='btn btn-note-activate'>Activate</button>&nbsp";
            }

            if ( ns == model.NOTE_ACTIVE && is_creator ){
                html += "<button class='btn btn-note-deactivate'>Deactivate</button>&nbsp";
            }

            if (( ns == model.NOTE_ACTIVE || ns == model.NOTE_OPEN ) && is_creator ){
                html += "<button class='btn btn-note-close'>Close</button>";
            }

            html += "</div></div>";

            note_details.html(html);

            $(".btn",note_details).button();
            $(".btn-note-edit",note_details).on("click",function(){
                console.log("edit!",this.id);
                var idx = parseInt( this.id.substr( this.id.lastIndexOf( "_" ) + 1 ));
                dlgAnnotation.show( note.subject, note, null, idx, function( data ){
                    if ( data ){
                        showSelectedNoteInfo( node );
                        node.setTitle( data.note[0].title );
                    }
                });
            });

            $(".btn-note-comment",note_details).on("click",function(){
                console.log("comment!");
                dlgAnnotation.show( note.subject, note, null, null, function(){
                    showSelectedNoteInfo( node );
                });
            });

            $(".btn-note-reopen",note_details).on("click",function(){
                console.log("reopen!");
                dlgAnnotation.show( note.subject, note, model.NOTE_OPEN, null, function(){
                    updateSelectedNote( node.key, node.data.subject );
                });
            });

            $(".btn-note-close",note_details).on("click",function(){
                console.log("close!");
                dlgAnnotation.show( note.subject, note, model.NOTE_CLOSED, null, function(){
                    updateSelectedNote( node.key, node.data.subject );
                });
            });

            $(".btn-note-activate",note_details).on("click",function(){
                console.log("activate!");
                dlgAnnotation.show( note.subject, note, model.NOTE_ACTIVE, null, function(){
                    updateSelectedNote( node.key, node.data.subject );
                });
            });

            $(".btn-note-deactivate",note_details).on("click",function(){
                dlgAnnotation.show( note.subject, note, model.NOTE_OPEN, null, function(){
                    updateSelectedNote( node.key, node.data.subject );
                });
            });
        }
    });
}


function updateSelectedNote( a_note_id, a_subject_id ){
    setupAnnotationTab( a_subject_id, function(){
        if ( note_active_tree.activateKey( a_note_id )){
            $("#note-tabs").tabs({active:0});
        }else if ( note_open_tree.activateKey( a_note_id )){
            $("#note-tabs").tabs({active:1});
        }else if( note_closed_tree.activateKey( a_note_id )){
            $("#note-tabs").tabs({active:2});
        }

        cur_item.notes = [];

        cur_notes.forEach( function( nt ){
            cur_item.notes.push( nt );
        });
    
        window.refreshUI( cur_item.id, cur_item );
    });
}

$("#note-tabs").tabs({
    heightStyle:"content",
    active: 0,
    activate: function(ev,ui){
        //console.log("tab act:",ui);
        var node;

        if ( ui.newPanel[0].id == "tab-note-active" ){
            node = note_active_tree.getActiveNode();
        }else if ( ui.newPanel[0].id == "tab-note-open" ){
            node = note_open_tree.getActiveNode();
        }else{
            node = note_closed_tree.getActiveNode();
        }

        if ( node )
            showSelectedNoteInfo( node );
        else
            note_details.html("");
    }
});

function showSelectedAllocInfo( repo, user, cb ){
    api.allocView( repo, user, function( ok, data ){
        if ( ok ){
            var item = data.alloc[0];
            item.user = item.id;
            item.id = item.repo;
            showSelectedItemInfo( item );
            if ( cb ) cb( item );
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

    $(".sel-info-table td:nth-child(2)",form).not(".ignore").html("<span style='color:#808080'>(none)</span>");

    $("#sel_info_type",form).text( text );
    $("#sel_info_id",form).text( item.id );

    if ( item.title )
        $("#sel_info_title",form).text( item.title );

    if ( item.nameLast )
        $("#sel_info_name",form).text( item.nameFirst + " " + item.nameLast );

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

    if ( item.topic )
        $("#sel_info_topic",form).text( item.topic );

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
        var src = util.buildObjSrcTree( md, "md", data_md_exp );
        data_md_tree.reload( src );
        data_md_empty = false;
    } else if ( !data_md_empty ) {
        data_md_tree.reload(tree_empty_src);
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
    source: tree_empty_src,
    nodata: false,
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
