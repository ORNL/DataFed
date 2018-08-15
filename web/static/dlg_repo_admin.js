function makeDlgRepoAdmin(){
    var inst = this;

    this.content =
        "<div class='row-flex' style='height:100%'>\
            <div class='col-flex' style='flex:1 1 50%;height:100%'>\
                <div style='flex:none' class='ui-widget-header'>Configuration:</div>\
                <div style='flex:none'>\
                        <table style='width:100%'>\
                        <tr><td>ID:</td><td><input type='text' id='id' style='width:100%' readonly></input></td></tr>\
                        <tr><td>Title:</td><td><input type='text' id='title' style='width:100%'></input></td></tr>\
                        <tr><td>Description:</td><td><textarea id='desc' rows=3 style='width:100%'></textarea></td></tr>\
                        <tr><td>Capacity:</td><td><input type='text' id='total_sz' style='width:100%'></input></td></tr>\
                        <tr><td>Used:</td><td><input type='text' id='used' style='width:100%' readonly></input></td></tr>\
                        <tr><td>Files:</td><td><input type='text' id='no_files' style='width:100%' readonly></input></td></tr>\
                    </table>\
                </div>\
                <div style='flex:none' class='ui-widget-header'>Administrators:</div>\
                <div style='flex:1 1 45%;overflow:auto' class='ui-widget-content text'>\
                    <div id='admin_tree' class='no-border' style='min-height:0'></div>\
                </div>\
                <div style='flex:none'>\
                    <button class='btn small' id='add_adm_btn'>Add</button>\
                    <button class='btn small' id='rem_adm_btn' disabled>Remove</button>\
                </div>\
            </div>\
            <div style='flex:none'>&nbsp</div>\
            <div class='col-flex' style='flex:1 1 55%;height:100%'>\
                <div style='none' class='ui-widget-header'>Allocations:</div>\
                <div style='flex:1 1 50%;overflow:auto' class='ui-widget-content text'>\
                    <div id='alloc_tree' class='no-border' style='min-height:0'></div>\
                </div>\
                <div style='flex:none'>\
                    <button class='btn small' id='add_alloc_btn'>Add</button>\
                    <button class='btn small' id='stat_alloc_btn' disabled>Stats</button>\
                    <button class='btn small' id='edit_alloc_btn' disabled>Edit</button>\
                    <button class='btn small' id='rem_alloc_btn' disabled>Remove</button>\
                </div>\
            </div>\
        </div>";


    this.show = function( a_repo_id, a_cb ){
        inst.frame = $(document.createElement('div'));
        inst.frame.html( inst.content );
        inst.repo = null;
        inst.alloc = null;

        $("#admin_tree",inst.frame).fancytree({
            extensions: ["themeroller"],
            themeroller: {
                activeClass: "ui-state-hover",
                addClass: "",
                focusClass: "",
                hoverClass: "ui-state-active",
                selectedClass: ""
            },
            source: [],
            selectMode: 1,
            activate: function( event, data ) {
                $("#rem_adm_btn",inst.frame).button("option", "disabled", false);
            }
        });

        inst.admin_tree = $("#admin_tree",inst.frame).fancytree("getTree");

        $("#alloc_tree",inst.frame).fancytree({
            extensions: ["themeroller"],
            themeroller: {
                activeClass: "ui-state-hover",
                addClass: "",
                focusClass: "",
                hoverClass: "ui-state-active",
                selectedClass: ""
            },
            source: [],
            selectMode: 1,
            activate: function( event, data ) {
                $("#stat_alloc_btn",inst.frame).button("option", "disabled", false);
                $("#edit_alloc_btn",inst.frame).button("option", "disabled", false);
                $("#rem_alloc_btn",inst.frame).button("option", "disabled", false);
            }
        });

        inst.alloc_tree = $("#alloc_tree",inst.frame).fancytree("getTree");

        repoView( a_repo_id, function( ok, repo ){
            if ( ok && repo.length ){
                inst.repo = repo[0];
                inst.initForm();
            }
        });

        allocList( a_repo_id, function( ok, alloc ){
            if ( ok ){
                inst.alloc = alloc;
                inst.initAlloc();
            }
        });

        var options = {
            title: "Data Repository Administration",
            modal: true,
            width: 650,
            height: 500,
            resizable: true,
            closeOnEscape: true,
            buttons: [{
                text: "Ok",
                click: function() {
                    if ( a_cb )
                        a_cb();
                    $(this).dialog('destroy').remove();
                }
            },{
                text: "Cancel",
                click: function() {
                    $(this).dialog('destroy').remove();
                }
            }],
            open: function(event,ui){
            }
        };

        inst.frame.dialog( options );
        $(".btn",inst.frame).button();

        $("#add_adm_btn",inst.frame).click( function(){
            var excl = [];
            inst.admin_tree.visit(function(node){
                //console.log("excl adm:",node.key);
                excl.push(node.key);
            });

            dlgPickUser.show( "u/"+g_user.uid, excl, false, function( uids ){
                console.log("sel:",uids);
                for ( i in uids ){
                    uid = uids[i];
                    inst.admin_tree.rootNode.addNode({title: uid.substr(2),icon:"ui-icon ui-icon-person",key: uid });
                }
            });
        });

        $("#rem_adm_btn",inst.frame).click( function(){
            var node = inst.admin_tree.getActiveNode();
            if ( node ){
                node.remove();
                $("#rem_adm_btn",inst.frame).button("option", "disabled", true);
            }
        });

        $("#add_alloc_btn",inst.frame).click( function(){
            var excl = [];
            inst.alloc_tree.visit(function(node){
                excl.push(node.key);
            });
            
            dlgAllocNewEdit.show( a_repo_id, null, excl, function( alloc ){
                console.log( "new alloc:", alloc );
                inst.addAllocNode( alloc );
            });
        });

        $("#edit_alloc_btn",inst.frame).click( function(){
            var node = inst.alloc_tree.getActiveNode();
            if ( node ){
                dlgAllocNewEdit.show( a_repo_id, node.data.alloc, [], function( alloc ){
                    console.log( "updated alloc:", alloc );
                    node.data.alloc = alloc;
                    inst.updateAllocTitle( node );
                });
            }
        });

        $("#stat_alloc_btn",inst.frame).click( function(){
            var node = inst.alloc_tree.getActiveNode();
            if ( node ){
                allocStats( a_repo_id, node.key, function( ok, data ){
                    if ( ok ){
                        // Update alloc tree with latest total_sz
                        node.data.alloc.totalSz = data.totalSz;
                        //node.setTitle( node.key.substr(2) + "  (" +sizeToString(data.totalSz) +"/"+sizeToString( node.data.alloc.alloc )+")");
                        inst.updateAllocTitle( node );

                        var msg =
                        "<table class='info_table'>\
                        <tr><td>No. of Records:</td><td>" + data.records + "</td></tr>\
                        <tr><td>No. of Files:</td><td>" + data.files + "</td></tr>\
                        <tr><td>Total size:</td><td>" + sizeToString( data.totalSz ) + "</td></tr>\
                        <tr><td>Average size:</td><td>" + sizeToString( data.files>0?data.totalSz/data.files:0 ) + "</td></tr>\
                        <tr><td>&lt 1 KB:</td><td>" + data.histogram[0] + " %</td></tr>\
                        <tr><td>1 KB to 1 MB:</td><td>" + data.histogram[1] + " %</td></tr>\
                        <tr><td>1 MB to 1 GB:</td><td>" + data.histogram[2] + " %</td></tr>\
                        <tr><td>1 GB to 1 TB:</td><td>" + data.histogram[3] + " %</td></tr>\
                        <tr><td>&gt 1 TB:</td><td>" + data.histogram[4] + " %</td></tr>\
                        </table>";

                        dlgAlert( "Allocation Statistics", msg );
                    }
                });
            }
        });

        $("#rem_alloc_btn",inst.frame).click( function(){
            var node = inst.alloc_tree.getActiveNode();
            if ( node ){
                confirmChoice("Confirm Delete", "Delete allocation for " + (node.key.startsWith("u/")?"user ":"project ") + node.key.substr(2) + "?", ["Delete","Cancel"], function( choice ){
                    if ( choice == 0 ){
                        console.log( "Delete allocation" );
                        allocSet( a_repo_id, node.key, 0, function( ok, data ){
                            console.log( ok, data );
                            if ( ok )
                                node.remove();
                        });
                    }
                });
            }
        });
    }

    this.initForm = function(){
        //console.log("repo:",inst.repo);
        if ( inst.repo ){
            $("#id",inst.frame).val(inst.repo.id.substr(5));
            $("#title",inst.frame).val(inst.repo.title);
            $("#desc",inst.frame).val(inst.repo.desc);
            $("#total_sz",inst.frame).val(sizeToString( inst.repo.totalSz ));
            $("#used",inst.frame).val(sizeToString( 2500000 ));
            $("#no_files",inst.frame).val("1020");
            var admin;
            for ( var i in inst.repo.admin ){
                admin = inst.repo.admin[i];
                inst.admin_tree.rootNode.addNode({title:admin.substr(2),icon:"ui-icon ui-icon-person",key:admin});
            }
        }
    }

    this.initAlloc = function(){
        //console.log("alloc:",inst.alloc);
        if ( inst.alloc && inst.alloc.length ){
            for ( var i in inst.alloc ){
                inst.addAllocNode( inst.alloc[i] );
            }
        }
    }

    inst.addAllocNode = function( alloc ){
        inst.alloc_tree.rootNode.addNode({title:alloc.id.substr(2) + "  (" +sizeToString(alloc.usage) +"/"+sizeToString( alloc.alloc )+")",icon:alloc.id.startsWith("u/")?"ui-icon ui-icon-person":"ui-icon ui-icon-box",key:alloc.id,alloc:alloc});
    }

    inst.updateAllocTitle = function( node ){
        node.setTitle( node.key.substr(2) + "  (" +sizeToString(node.data.alloc.usage) +"/"+sizeToString( node.data.alloc.alloc )+")");
    }
}