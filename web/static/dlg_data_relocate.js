
// TODO - Need to handle changing account (verify, refresh allocs, reset collection to root)
// TODO - Need to handle changing collection (verify, check permissions)
// TODO - Add account picker dialog
// TODO - Add dest collection picker dialog

function dlgDataRelocate( a_src_items, a_dest, a_owner, a_cb) {
    console.log("dlgDataRelocate", a_src_items, a_dest, a_owner );

    var is_repo_dest = a_dest.startsWith("repo/");
    var dest_repo;
    var frame, allocs, repo_stats, recursive = true;

    // Check source permissions
    var ok = true, count = a_src_items.length;
    for ( var i in a_src_items ){
        getPerms( a_src_items[i], PERM_DELETE, function( perms ){
            if (( perms & PERM_DELETE ) == 0 ){
                if ( ok ){
                    ok = false;
                    dlgAlert( "Cannot Perform Action", "Requires DELETE permission at source." );
                    count--;
                }
            }else{
                if ( --count == 0 && ok ){
                    if ( is_repo_dest ){
                        console.log("Move to repo",a_dest);
                        dlgDataRelocate_init_1();
                    }else{
                        // Check dest permissions
                        getPerms( a_dest, PERM_CREATE, function( perms ){
                            if (( perms & PERM_CREATE ) == 0 ){
                                dlgAlert( "Cannot Perform Action", "Requires CREATE permission at destination." );
                            }else{
                                console.log("Move to owner", a_owner,"collection",a_dest);
                                dlgDataRelocate_init_1();
                            }
                        });
                    }
                }
            }
        });
    }

    function refresh( a_reload ){
        if ( a_reload ){
            repoCalcSize( a_src_items, recursive, function( ok, data ){
                console.log(ok,data);
                if ( ok ){
                    repo_stats = data.stats;
                    recalcSize();
                }
            });
        }else{
            recalcSize();
        }
    }

    function recalcSize(){
        var stats, size = 0, records = 0, files = 0;
        for ( var i in repo_stats ){
            stats = repo_stats[i];
            console.log("check",stats.repo,parseInt(stats.totalSz),dest_repo);
            console.log("check",stats.repo,parseInt(stats.totalSz),dest_repo,allocs[dest_repo].freeSize);
            if ( !is_repo_dest || stats.repo != dest_repo ){
                size += parseInt(stats.totalSz);
                records += stats.records;
                files += stats.files;
            }
        }

        $("#source_records",frame).val( records );
        $("#source_files",frame).val( files );
        $("#source_size",frame).val( sizeToString( size ));

        if ( records == 0 ){
            $("#go_btn").button("disable");
            $("#source_records",frame).addClass("ui-state-error");
        }else if ( size > allocs[dest_repo].freeSize ){
            $("#go_btn").button("disable");
            $("#dest_alloc-button",frame).addClass("ui-state-error");
            //dlgAlert("Data Relocate Error","Insufficient free space on selected destination allocation (" + dest_repo + ").");
        }else{
            $("#go_btn").button("enable");
            $("#dest_alloc-button",frame).removeClass("ui-state-error");
            $("#source_records",frame).removeClass("ui-state-error");
        }
    }

    function dlgDataRelocate_init_1(){
        allocListBySubject( a_owner, false, function( ok, data ){
            console.log( "allocs for", a_owner, ok, data );
            if ( !ok ){
                dlgAlert("Data Relocate Error","Could not access allocations for " + a_owner + ".");
                return;
            }else if ( data.length == 0 ){
                dlgAlert("Data Relocate Error","No allocations available for " + a_owner + ".");
                return;
            }

            var alloc, cap = false, dest_ok = true;
            allocs = {};
            for ( var i in data ){
                alloc = data[i];
                alloc.totSize = parseInt( alloc.totSize );
                alloc.maxSize = parseInt( alloc.maxSize );
                alloc.freeSize = alloc.maxSize > alloc.totSize?alloc.maxSize - alloc.totSize:0;
                allocs[alloc.repo] = alloc;
                if ( alloc.freeSize ){
                    cap = true;
                } else if ( is_repo_dest && alloc.repo == a_dest ){
                    dest_ok = false;
                }
            }

            if ( !cap ){
                dlgAlert("Data Relocate Error","All allocations are full.");
                return;
            }else if ( !dest_ok ){
                dlgAlert("Data Relocate Error","Destination allocation is full.");
            }

            dlgDataRelocate_init_2();
        });
    }

    function dlgDataRelocate_init_2(){
        frame = $(document.createElement('div'));

        var alloc, sel_html = "";
        
        for ( var i in allocs ){
            alloc = allocs[i];
            if (!dest_repo)
                dest_repo = alloc.repo;
            sel_html += "<option value='"+alloc.repo + "'";
            if ( parseInt( alloc.totSize ) < parseInt( alloc.maxSize )){
                if ( is_repo_dest && alloc.repo == a_dest ){
                    sel_html += " selected";
                    dest_repo = alloc.repo;
                }
            }else
                sel_html += " disabled";
            sel_html += ">"+alloc.repo.substr(5)+" ("+ sizeToString(alloc.totSize) + " / " + sizeToString(alloc.maxSize) +")</option>";
        }

        var html = "<div class='ui-widget-content text no-border' style='height:98%;overflow:auto'>\
        Source Information:\
        <table class='info-table' style='width:100%'><col width='35%'><col width='65%'>\
            <tr><td>No.&nbspRecords:</td><td><input style='width:100%' type='text' id='source_records' readonly value='Loading...'></input></td></tr>\
            <tr><td>No.&nbspFiles:</td><td><input style='width:100%' type='text' id='source_files' readonly value='Loading...'></input></td></tr>\
            <tr><td>Total&nbspSize:</td><td><input style='width:100%' type='text' id='source_size' readonly value='Loading...'></input></td></tr>\
            <tr><td>Recursive:</td><td><span class='my-check'><label for='source_recurse'></label><input type='checkbox' name='source_recurse' id='source_recurse' checked>&nbsp</span></td></tr>\
        </table>\
        <br>Destination Information:\
        <table class='info-table' style='width:100%'><col width='35%'><col width='65%'>\
            <tr><td>Account:</td><td><input title='Destination account ID' type='text' style='width:100%' id='dest_acc'></input></td></tr>\
            <tr><td>Collection:</td><td><input title='Destination collection ID/alias' type='text' style='width:100%' id='dest_coll'></input></td></tr>\
            <tr><td>Allocation:</td><td><select style='width:100%' title='Destination data repository allocation' id='dest_alloc'>" + sel_html + "</select></td></tr>\
        </table>\
        <br>Note: associated data records will be inaccessible until data transfer is complete.\
        </div>";

        frame.html( html );

        refresh( true );

        inputTheme( $('input:text',frame ));
        $(".btn",frame).button();
        $("#source_recurse",frame).checkboxradio().on( "change",function(ev){
            recursive = $("#source_recurse",frame).prop("checked");
            refresh(true);
        });
    
        //$("#go_btn").button("enable");
        $("#dest_acc",frame).val( a_owner );

        if ( is_repo_dest ){
            $("#dest_coll",frame).val( "n/a" );
        }else{
            $("#dest_coll",frame).val( a_dest );
        }

        if ( is_repo_dest )
            $("#dest_coll",frame).prop("disabled",true);

        var options = {
            title: "Relocate Data",
            modal: true,
            width: 400,
            height: 450,
            resizable: true,
            closeOnEscape: false,
            buttons: [{
                id: "go_btn",
                text: "Relocate",
                click: function() {
                    startReloation( function( ok, data ){
                        if ( !ok ){
                            dlgAlert("Data Relocate Error",data);
                        }else{
                            $(this).dialog('destroy').remove();
                            dlgAlert("Data Relocate","Relocation process initiated.");
                        }
                    });
                }
            },{
                text: "Cancel",
                click: function() {
                    $(this).dialog('destroy').remove();
                }
            }],
            open: function(ev,ui){
                $("select",frame).selectmenu({width:200}).on( "selectmenuchange",function(ev){
                    dest_repo = $("select",frame).val();
                    console.log("select change",dest_repo);
                    refresh(false);
                });
                $("#go_btn").button("disable");
            }
        };
    
        frame.dialog( options );
    }
}

