function dlgEpBrowse( a_ep, a_mode ) {
    var frame = $(document.createElement('div'));
    
    frame.html( "Path: <span id='path'>/</span><button id='up' class='btn'>Up</button><div id='file_tree'></div>");
    var path = "/";

    $(".btn",frame).button();

    $("#up",frame).on('click',function(){
            reloadTree("..");
    });

    function reloadTree( a_path ){
        var new_path;
        if ( a_path == ".." ){
            if ( path.length == 1 )
                return;
            var idx = path.lastIndexOf("/");
            if ( idx > 0 )
                new_path = path.substr(0,idx);
            else
                new_path = "/";
        }else{
            if ( path.length > 1 )
                new_path = path + "/" + a_path;
            else
                new_path = path + a_path;
        }

        console.log("reload to:",new_path);

        epDirList( a_ep, new_path,function(data){
            if( data ){
                console.log("got result:",data);
    
                var tree_source = [];
    
                for ( var i in data.DATA ){
                    entry = data.DATA[i];
                    /*
                    if ( entry.type == "dir" ){
                        tree_source.push({ title: entry.name + " " + entry.permissions, folder:true, lazy: true, key: entry.name });
                    } else if ( entry.type == "file" ){
                        tree_source.push({ title: entry.name + " " + entry.size + " " + entry.permissions, key: entry.name });
                    }*/
                    if ( entry.type == "dir" ){
                        tree_source.push({ title: entry.name + " " + entry.permissions, icon: "ui-icon ui-icon-folder", key: entry.name, is_dir: true });
                    } else if ( entry.type == "file" ){
                        tree_source.push({ title: entry.name + " " + entry.size + " " + entry.permissions, icon: "ui-icon ui-icon-file", key: entry.name });
                    }
                }
                $("#file_tree").fancytree( "getTree").reload( tree_source );
                path = new_path;
            }
        });

    }

    epDirList( a_ep, "/",function(data){
        if( data ){
            console.log("got result:",data);

            var tree_source = [];

            for ( var i in data.DATA ){
                entry = data.DATA[i];
                /*
                if ( entry.type == "dir" ){
                    tree_source.push({ title: entry.name + " " + entry.permissions, folder:true, lazy: true, key: entry.name });
                } else if ( entry.type == "file" ){
                    tree_source.push({ title: entry.name + " " + entry.size + " " + entry.permissions, key: entry.name });
                }*/
                if ( entry.type == "dir" ){
                    tree_source.push({ title: entry.name + " " + entry.permissions, icon: "ui-icon ui-icon-folder", key: entry.name, is_dir: true });
                } else if ( entry.type == "file" ){
                    tree_source.push({ title: entry.name + " " + entry.size + " " + entry.permissions, icon: "ui-icon ui-icon-file", key: entry.name });
                }
            }

            $("#file_tree").fancytree({
                extensions: ["themeroller"],
                themeroller: {
                    activeClass: "ui-state-hover",
                    addClass: "",
                    focusClass: "",
                    hoverClass: "ui-state-active",
                    selectedClass: ""
                },
                source: tree_source,
                selectMode: 1,
                /*lazyLoad: function( event, data ) {
                    console.log("lazy load",data);
                    console.log("path:",data.node.getKeyPath());
                    data.result = {
                        url: "/ui/ep/dir/list?ep="+encodeURIComponent(a_ep)+"&path="+encodeURIComponent(data.node.getKeyPath() + "/" ),
                        cache: false
                    };
                },*/
                postProcess: function( event, data ) {
                    console.log("post proc",data);
                    if ( data.response.DATA ){
                        data.result = [];

                        if ( data.response.DATA.length ){
                            var entry;
                            for ( var i in data.response.DATA ){
                                entry = data.response.DATA[i];
                                if ( entry.type == "dir" ){
                                    data.result.push({ title: entry.name + " " + entry.permissions, folder:true, lazy: true, key: entry.name });
                                } else if ( entry.type == "file" ){
                                    data.result.push({ title: entry.name + " " + entry.size + " " + entry.permissions, key: entry.name });
                                }
                            }
                        }
                    }
                },
                dblclick: function( event, data ) {
                    console.log("activate", data );
                    if ( data.node.data.is_dir ){
                        reloadTree( data.node.key );
                    }
                }
            });
        }
    });

    var options = {
        title: "Browse End-Point " + a_ep,
        modal: true,
        width: '500',
        height: '400',
        resizable: true,
        closeOnEscape: true,
        buttons: [{
            text: "Select",
            click: function() {
            }
        },{
            text: "Cancel",
            click: function() {
                $(this).dialog('destroy').remove();
            }
        }],
        open: function(){
        }
    };

    frame.dialog( options );
};
