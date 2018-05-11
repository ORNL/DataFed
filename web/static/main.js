var g_user = null;

function loadUser() {
    console.log( "loadUser" );

    var user = Cookies.get( 'sdms-user' );

    if ( user ) {
        g_user = JSON.parse( user );
    } else {
        g_user = null;
    }

    console.log( "user: ", g_user );
}

function logout() {
    console.log( "logout");
    g_user = null;
    //Cookies.remove( 'sdms-user', { path: "/ui" });
    window.location = "/ui/logout";
}

function _asyncGet( a_path, a_raw_json_data, a_callback ) {
    $.ajax({
        url : a_path,
        global : false,
        type : 'get',
        data: a_raw_json_data,
        dataType: 'json',
        success : function( a_data ) {
            if ( a_callback )
                a_callback( true, a_data );
        },
        error : function( a_xhr, a_status, a_thrownError ) {
            //console.log( 'asyncGet error: ', a_xhr );
            //console.log( 'asyncGet error: ', a_status );
            //console.log( 'asyncGet error: ', a_thrownError );
            //console.log( 'asyncGet error: ', a_xhr.responseText );
            if ( a_callback ) {
                if ( a_xhr.responseText )
                    a_callback( false, a_xhr.responseText );
                else if ( a_thrownError )
                    a_callback( false, a_thrownError );
                else if ( a_status )
                    a_callback( false, a_status );
                else
                    a_callback( false, "Unknown error" );
            }
        },
        timeout: 5000
    });
}

function viewData( a_id, a_callback ) {
    console.log("viewData()");
    _asyncGet( "/api/dat/view?id=" + a_id, null, function( ok, data ){
        if ( ok ) {
            console.log("viewData ok, data:", data, typeof data );
            a_callback( data );
        }
        else {
            console.log("viewData failed:", data );
            a_callback();
        }
    });
}

function createData( a_title, a_alias, a_desc, a_md, a_coll, a_callback ) {
    console.log("createData()");
    _asyncGet( "/api/dat/create?title="+a_title+"&alias="+a_alias+"&desc="+a_desc+"&md="+a_md+"&coll="+a_coll, null, a_callback );
}

function viewColl( a_id, a_callback ) {
    console.log("viewColl()");
    _asyncGet( "/api/col/view?id=" + a_id, null, function( ok, data ){
        if ( ok ) {
            console.log("viewColl ok, data:", data, typeof data );
            a_callback( data );
        }
        else {
            console.log("viewColl failed:", data );
            a_callback();
        }
    });
}

function dlgNewEdit(a_mode,a_data) {
    var frame = $('#dlg_new');
    var dlg_title;
    if ( a_data ) {
        dlg_title = (a_mode?"Edit Collection ":"Edit Data ") + a_data.id;
    } else {
        dlg_title = a_mode?"New Collection":"New Data";
    }

    var options = {
        title: dlg_title,
        modal: true,
        width: 400,
        height: 'auto',
        resizable: true,
        closeOnEscape: false,
        buttons: [{
            text: a_data?"Update":"Create",
            click: function() {
                var title = encodeURIComponent($("#title",frame).val());
                if ( !title ) {
                    alert("Title cannot be empty");
                    return;
                }

                var alias = encodeURIComponent($("#alias",frame).val());
                var desc = encodeURIComponent($("#desc",frame).val());
                var coll = encodeURIComponent($("#coll",frame).val());
                var md = encodeURIComponent($("#md",frame).val());

                var url = "/api/";
                if ( a_mode )
                    url += "col";
                else
                    url += "dat";

                if ( a_data )
                    url += "/update?id="+a_data.id + "&";
                else
                    url += "/create?"
                var delim = "";

                if ( title ) {
                    url += "title="+title;
                    delim = "&";
                }

                if ( alias ) {
                    url += delim + "alias="+alias;
                    delim = "&";
                }

                if ( desc ) {
                    url += delim + "desc="+desc;
                    delim = "&";
                }

                if ( a_mode == 0 ){
                    if ( md ) {
                        url += delim + "md="+md;
                        delim = "&";

                        if ( a_data ) {
                            if ( $('input[name=md_mode]:checked', frame ).val() == "set" )
                                url += "&mdSet=true";
                        }
                    }
                }

                if ( coll )
                    url += delim + "coll="+coll;

                console.log( "URL in js", url );

                var inst = $(this);
                _asyncGet( url, null, function( ok, data ){
                    if ( ok ) {
                        if ( a_data )
                            alert( "Updated record " + data.data[0].id );
                        else
                            alert( "Created record " + data.data[0].id );
                        inst.dialog( "close" );
                        $('#data_tree').fancytree('getTree').reload( tree_source );
                    } else {
                        alert( "Error: " + data );
                    }
                });
            }
        },{
            text: "Cancel",
            click: function() {
                $( this ).dialog( "close" );
            }
        }],
        open: function(event,ui){
            if ( a_data ){
                $("#title",frame).val(a_data.title);
                $("#alias",frame).val(a_data.alias);
                $("#desc",frame).val(a_data.desc);
                $("#md",frame).val(a_data.metadata);
                document.getElementById("dlg_coll_row").style.display = 'none';
                if ( a_mode )
                    document.getElementById("dlg_md_row2").style.display = 'none';
                else
                    document.getElementById("dlg_md_row2").style.display = '';
            } else {
                $("#title",frame).val("");
                $("#alias",frame).val("");
                $("#desc",frame).val("");
                $("#coll",frame).val("");
                $("#md",frame).val("");
                document.getElementById("dlg_coll_row").style.display = '';
                document.getElementById("dlg_md_row2").style.display = 'none';
            }

            if ( a_mode ){
                $("#md",frame).val("");
                document.getElementById("dlg_md_row").style.display = 'none';
            } else
                document.getElementById("dlg_md_row").style.display = '';
        }
    };


    frame.dialog( options );
}

function deleteSelected() {
    var item = $('#data_tree').fancytree('getTree').activeNode;
    var url = "/api/";
    var msg = "<div>Are you sure you want to delete ";

    if ( item.key[0] == "d" ) {
        msg += "data";
        url += "dat";
    } else {
        msg += "collection";
        url += "col";
    }

    msg += " ID " + item.key + "?<div>";

    $( msg ).dialog({
        title: "Confirm Deletion",
        modal: true,
        buttons: [
            {
                text: "Yes",
                click: function() {
                    var inst = $(this);
                    url += "/delete?id=" + item.key;
                    _asyncGet( url, null, function( ok, data ){
                        if ( ok ) {
                            inst.dialog( "close" );
                            $('#data_tree').fancytree('getTree').reload( tree_source );
                        } else {
                            alert( "Delete failed: " + data );
                        }
                    });
                }
            },{
                text: "Cancel",
                click: function() {
                    $( this ).dialog( "close" );
                }
            }
        ]
    });
}

function editSelected() {
    var key = $('#data_tree').fancytree('getTree').activeNode.key;

    if ( key[0] == "c" ) {
        viewColl( key, function( data ){
            dlgNewEdit(1,data.data[0]);
        }); 
    } else if ( key[0] == "d" ) {
        viewData( key, function( data ){
            dlgNewEdit(0,data.data[0]);
        }); 
    }
}

console.log( "main.js loaded");