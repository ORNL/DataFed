/*jshint multistr: true */

function dlgEpBrowse( a_ep, a_path, a_mode, a_cb ) {
    var frame = $(document.createElement('div'));
    
    frame.html( "<div class='col-flex' style='height:100%'>\
                    <div style='flex:none'>\
                        <div class='row-flex' style='align-items:center'>\
                            <div style='flex:none'>Path:&nbsp</div>\
                            <div style='flex:auto'><input type='text' id='path' style='width:100%'></input></div>\
                            <div style='flex:none'>&nbsp<button id='up' class='btn small'>Up</button></div>\
                        </div>\
                    </div>\
                    <div style='flex:none;padding:.25em'></div>\
                    <div class='ui-widget-content' style='flex:1 1 100%;min-height:0;overflow:auto'>\
                        <div id='file_tree' class='no-border' style='min-height:0;overflow:none'></div>\
                    </div>\
                </div>");


    var path = a_path;
    var path_in_timer;
    var loading = false;

    $(".btn",frame).button();
    inputTheme( $('input:text',frame ));
    $("#path",frame).val(a_path);
    $(".btn",frame).button();

    $("#up",frame).on('click',function(){
        chdir("..");
    });

    function chdir( a_new_path ){
        if ( a_new_path == "." )
            return;

        clearTimeout( path_in_timer );

        // Ensure path has a terminal /
        if ( path.charAt( path.length-1) != "/" )
            path += "/";

        var new_path;
        if ( a_new_path == ".." ){

            if ( path.length == 1 ){
                return;
            }

            var idx = path.lastIndexOf("/", path.length-2);

            if ( idx > 0 )
                new_path = path.substr(0,idx+1);
            else
                new_path = "/";
        }else{
            new_path = path + a_new_path + "/";
        }
        //console.log("reload to:",new_path);

        reloadTree( new_path );
        path = new_path;
        $("#path",frame).val( new_path );
    }

    function reloadTree( a_new_path ){
        loading = true;
        $.ui.fancytree.getTree("#file_tree").reload( [] );
        epDirList( a_ep.id, a_new_path, false, function(data){
            if( data ){
                console.log("got result:",data);

                var tree_source = [];
                if ( data.code ){
                    tree_source.push({ title: "<span class='ui-state-error'>Error: " + data.message + "</span>", icon: false });
                }else{
                    tree_source.push({ title: ".", icon: "ui-icon ui-icon-folder", key: ".", is_dir: true });
                    tree_source.push({ title: "..", icon: "ui-icon ui-icon-folder", key: "..", is_dir: true });
                    for ( var i in data.DATA ){
                        entry = data.DATA[i];

                        if ( entry.type == "dir" ){
                            tree_source.push({ title: entry.name, icon: "ui-icon ui-icon-folder", key: entry.name, is_dir: true });
                        } else if ( entry.type == "file" ){
                            tree_source.push({ title: "<span style='float:left;width:5em'>" + sizeToString( entry.size ) + "</span> " + entry.last_modified.substr( 0, entry.last_modified.indexOf("+")) + "&nbsp&nbsp&nbsp" + entry.name, icon: "ui-icon ui-icon-file", key: entry.name });
                        }
                    }
                }
                $.ui.fancytree.getTree("#file_tree").reload( tree_source );
                $("#sel_btn").button("disable");
                loading = false;
            }else{
                loading = false;
            }
        });

    }

    var options = {
        title: "Browse End-Point " + a_ep.name,
        modal: true,
        width: '500',
        height: '400',
        resizable: true,
        closeOnEscape: true,
        buttons: [{
            id: "sel_btn",
            text: "Select",
            click: function() {
                clearTimeout( path_in_timer );
                if ( a_cb ){
                    var node = $.ui.fancytree.getTree("#file_tree").activeNode;
                    if ( node ){
                        a_cb( path + (path.charAt(path.length-1) == "/"?"":"/") + (node.key=="."?"":node.key) );
                        $(this).dialog('destroy').remove();
                    }
                }
            }
        },{
            text: "Cancel",
            click: function() {
                clearTimeout( path_in_timer );
                $(this).dialog('destroy').remove();
            }
        }],
        open: function(){
            $("#file_tree").fancytree({
                extensions: ["themeroller"],
                themeroller: {
                    activeClass: "ui-state-hover",
                    addClass: "",
                    focusClass: "",
                    hoverClass: "ui-state-active",
                    selectedClass: ""
                },
                source: [{title: "loading...",icon:false}],
                selectMode: 1,
                activate: function( ev, data ){
                    console.log("activate");
                    if (( data.node.data.is_dir && a_mode == "dir" && data.node.key != ".." ) || ( !data.node.data.is_dir && a_mode == "file" ))
                        $("#sel_btn").button("enable");
                    else
                        $("#sel_btn").button("disable");
                },
                dblclick: function( event, data ) {
                    console.log("activate", data );
                    if ( data.node.data.is_dir && !loading ){
                        chdir( data.node.key );
                    }
                }
            });
            reloadTree( a_path );
            $("#path",frame).on('input', function(){
                console.log("path manually changed");
                clearTimeout( path_in_timer );
                path_in_timer = setTimeout( function(){
                    path = $("#path",frame).val();
                    reloadTree( path );
                }, 1000 );
            });

        }
    };

    frame.dialog( options );
}
