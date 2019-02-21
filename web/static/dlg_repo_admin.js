function makeDlgRepoAdmin(){
    var inst = this;

    this.content =
        "<div class='row-flex' style='height:100%'>\
            <div class='col-flex' style='flex:1 1 50%;height:100%'>\
                <div style='flex:none' class='ui-widget-header'>Configuration:</div>\
                <div style='flex:none'>\
                    <table style='width:100%'>\
                        <tr><td style='vertical-align:middle'>ID:</td><td><input type='text' id='id' style='width:100%' disabled></input></td></tr>\
                        <tr><td style='vertical-align:middle'>Title:</td><td><input type='text' id='title' style='width:100%'></input></td></tr>\
                        <tr><td style='vertical-align:top'>Description:</td><td><textarea id='desc' rows=3 style='width:100%;resize:none;padding:0'></textarea></td></tr>\
                        <tr><td style='vertical-align:middle'>Domain:</td><td><input type='text' id='domain' style='width:100%'></input></td></tr>\
                        <tr><td style='vertical-align:middle'>Exp Path:</td><td><input type='text' id='exp_path' style='width:100%'></input></td></tr>\
                        <tr><td style='vertical-align:middle'>Capacity:</td><td><input type='text' id='capacity' style='width:100%'></input></td></tr>\
                    </table>\
                </div>\
                <div style='flex:none' class='ui-widget-header'>Administrators:</div>\
                <div style='flex:1 1 45%;overflow:auto' class='ui-widget-content text'>\
                    <div id='admin_tree' class='no-border' style='min-height:0'></div>\
                </div>\
                <div style='flex:none;padding:.25em 0'>\
                    <button class='btn small' id='add_adm_btn'>Add</button>\
                    <button class='btn small' id='rem_adm_btn' disabled>Remove</button>\
                    &nbsp&nbsp&nbsp&nbsp<button class='btn small' id='apply_btn' disabled>Apply</button>\
                </div>\
                <div style='flex:none' class='ui-widget-header'>Statistics:</div>\
                <div style='flex:none' >\
                    <table style='width:100%'>\
                        <tr><td style='vertical-align:middle'>Record&nbspCount:</td><td><input type='text' id='no_records' style='width:100%' disabled></input></td></tr>\
                        <tr><td style='vertical-align:middle'>File&nbspCount:</td><td><input type='text' id='no_files' style='width:100%' disabled></input></td></tr>\
                        <tr><td style='vertical-align:middle'>Capacity&nbspUsed:</td><td><input type='text' id='used' style='width:100%' disabled></input></td></tr>\
                    </table>\
                </div>\
            </div>\
            <div style='flex:none'>&nbsp</div>\
            <div class='col-flex' style='flex:1 1 55%;height:100%'>\
                <div style='none' class='ui-widget-header'>Allocations:</div>\
                <div style='flex:1 1 50%;overflow:auto' class='ui-widget-content text'>\
                    <div id='alloc_tree' class='no-border' style='min-height:0'></div>\
                </div>\
                <div style='flex:none;padding:.25em 0'>\
                    <button class='btn small' id='add_alloc_btn'>Add</button>\
                    <button class='btn small' id='stat_alloc_btn' disabled>Stats</button>\
                    <button class='btn small' id='edit_alloc_btn' disabled>Edit</button>\
                    <button class='btn small' id='del_alloc_btn' disabled>Delete</button>\
                </div>\
            </div>\
        </div>";


    this.show = function( a_repo_id, a_cb ){
        inst.frame = $(document.createElement('div'));
        inst.frame.html( inst.content );
        inst.repo = null;
        inst.alloc = null;
        inst.changed = 0;

        inputTheme($('input',inst.frame));
        inputTheme($('textarea',inst.frame));
    
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
                $("#del_alloc_btn",inst.frame).button("option", "disabled", false);
            }
        });

        inst.alloc_tree = $("#alloc_tree",inst.frame).fancytree("getTree");

        repoView( a_repo_id, function( ok, repo ){
            if ( ok && repo.length ){
                inst.repo = repo[0];
                inst.initForm();
            }
        });

        allocStats( a_repo_id, null, function( ok, stats ){
            if ( ok ){
                inst.stats = stats;
                inst.initStats();
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
            height: 550,
            resizable: true,
            closeOnEscape: true,
            buttons: [{
                text: "Close",
                click: function() {
                    if ( a_cb )
                        a_cb();
                    $(this).dialog('destroy').remove();
                }
            }],
            open: function(event,ui){
            }
        };

        inst.frame.dialog( options );
        $(".btn",inst.frame).button();
        $("#title",inst.frame).on('input', function(){ inst.repoInputChanged(1); });
        $("#desc",inst.frame).on('input', function(){ inst.repoInputChanged(2); });
        $("#domain",inst.frame).on('input', function(){ inst.repoInputChanged(4); });
        $("#capacity",inst.frame).on('input', function(){ inst.repoInputChanged(8); });
        $("#exp_path",inst.frame).on('input', function(){ inst.repoInputChanged(0x20); });

        $("#apply_btn",inst.frame).click( function(){
            var title = (inst.changed & 1)?$("#title",inst.frame).val():null;
            var desc = (inst.changed & 2)?$("#desc",inst.frame).val():null;
            var domain = (inst.changed & 4)?$("#domain",inst.frame).val():null;
            var exp_path = (inst.changed & 0x20)?$("#exp_path",inst.frame).val():null;
            var capacity = (inst.changed & 8)?parseSize( $("#capacity",inst.frame).val() ):null;
            var admins = null;
            if ( inst.changed & 16 ){
                admins = [];
                inst.admin_tree.visit( function(node){
                    admins.push( node.key );
                });
            }
            repoUpdate( a_repo_id, title, desc, domain, exp_path, capacity, admins, function( ok, data ){
                if ( ok ){
                    inst.changed = 0;
                    $("#apply_btn",inst.frame).button("option", "disabled", true);
                }else{
                    dlgAlert( "Repo Update Failed", data );
                }
            });
        });

        $("#add_adm_btn",inst.frame).click( function(){
            var excl = [];
            inst.admin_tree.visit(function(node){
                //console.log("excl adm:",node.key);
                excl.push(node.key);
            });

            dlgPickUser( "u/"+g_user.uid, excl, false, function( uids ){
                console.log("sel:",uids);
                for ( i in uids ){
                    uid = uids[i];
                    inst.admin_tree.rootNode.addNode({title: uid.substr(2),icon:"ui-icon ui-icon-person",key: uid });
                }
                inst.repoInputChanged(16);
            });
        });

        $("#rem_adm_btn",inst.frame).click( function(){
            var node = inst.admin_tree.getActiveNode();
            if ( node ){
                node.remove();
                $("#rem_adm_btn",inst.frame).button("option", "disabled", true);
            }
            inst.repoInputChanged(16);
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
                        //console.log("stats:",data);
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
                        </table><br>Histogram:<br><br><table class='info_table'>\
                        <tr><th></th><th>1's</th><th>10's</th><th>100's</th></tr>\
                        <tr><td>B:</td><td>" + data.histogram[0] + "</td><td>"+ data.histogram[1] + "</td><td>"+ data.histogram[2] + "</td></tr>\
                        <tr><td>KB:</td><td>" + data.histogram[3] + "</td><td>"+ data.histogram[4] + "</td><td>"+ data.histogram[5] + "</td></tr>\
                        <tr><td>MB:</td><td>" + data.histogram[6] + "</td><td>"+ data.histogram[7] + "</td><td>"+ data.histogram[8] + "</td></tr>\
                        <tr><td>GB:</td><td>" + data.histogram[9] + "</td><td>"+ data.histogram[10] + "</td><td>"+ data.histogram[11] + "</td></tr>\
                        <tr><td>TB:</td><td>" + data.histogram[12] + "</td></tr>\
                        </table>";

                        dlgAlert( "Allocation Statistics", msg );
                    }
                });
            }
        });

        $("#del_alloc_btn",inst.frame).click( function(){
            var node = inst.alloc_tree.getActiveNode();
            if ( node ){
                dlgConfirmChoice("Confirm Delete", "Delete allocation for " + (node.key.startsWith("u/")?"user ":"project ") + node.key.substr(2) + "?", ["Delete","Cancel"], function( choice ){
                    if ( choice == 0 ){
                        console.log( "Delete allocation" );
                        allocSet( a_repo_id, node.key, 0, function( ok, data ){
                            console.log( ok, data );
                            if ( ok )
                                node.remove();
                            else
                                dlgAlert( "Allocation Delete Error", data );
                        });
                    }
                });
            }
        });
    }

    this.repoInputChanged = function( a_bit ){
        this.changed |= a_bit;
        $("#apply_btn",inst.frame).button("option","disabled",false);
    }

    this.initForm = function(){
        //console.log("repo:",inst.repo);
        if ( inst.repo ){
            $("#id",inst.frame).val(inst.repo.id.substr(5));
            $("#title",inst.frame).val(inst.repo.title);
            $("#desc",inst.frame).val(inst.repo.desc);
            $("#domain",inst.frame).val( inst.repo.domain );
            $("#exp_path",inst.frame).val( inst.repo.expPath );
            $("#capacity",inst.frame).val( inst.repo.capacity );
            var admin;
            for ( var i in inst.repo.admin ){
                admin = inst.repo.admin[i];
                inst.admin_tree.rootNode.addNode({title:admin.substr(2),icon:"ui-icon ui-icon-person",key:admin});
            }
        }
    }

    this.initStats = function(){
        if ( inst.stats ){
            $("#used",inst.frame).val(sizeToString( inst.stats.totalSz ));
            $("#no_records",inst.frame).val(inst.stats.records);
            $("#no_files",inst.frame).val(inst.stats.files);
        }
    }

    this.initAlloc = function(){
        //console.log("alloc:",inst.alloc);
        if ( inst.alloc && inst.alloc.length ){
            var alloc;
            for ( var i in inst.alloc ){
                alloc = inst.alloc[i];
                inst.addAllocNode( alloc );
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