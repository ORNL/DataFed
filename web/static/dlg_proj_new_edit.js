/*jshint multistr: true */

function dlgProjNewEdit( a_data, a_upd_perms, a_cb ) {
    var frame = $(document.createElement('div'));
    var html = "<div class='col-flex' style='height:100%'>\
        <div style='flex:none'>\
            <table class='form-table'>\
                <tr><td>ID:</td><td><input type='text' id='id' style='width:100%'></input></td></tr>\
                <tr><td>Title:</td><td><input type='text' id='title' style='width:100%'></input></td></tr>\
                <tr><td style='vertical-align:top'>Description:</td><td><textarea id='desc' rows=3 style='width:100%;padding:0'></textarea></td></tr>\
                <tr><td>Owner:</td><td><input type='text' id='owner_id' style='width:100%'></input></td></tr>\
                <tr><td>Sub&#8209;allocation:</td><td><select id='suballoc'><option value='1'>None</option></select></td></tr>\
                <tr><td>Alloc.&nbspSize:</td><td><input type='text' id='suballoc_size' style='width:100%'></input></td></tr>\
            </table>\
        </div>\
        <div style='flex:none'>&nbsp</div>\
        <div class='row-flex' style='flex: 1 1 100%;min-height:0'>\
            <div class='col-flex' style='flex: 1 1 50%;height:100%'>\
                <div style='flex:none'>Members:</div>\
                <div class='ui-widget-content text' style='flex:1 1 100%;min-height:5em;overflow:auto'>\
                    <div id='proj_mem_tree' class='no-border'></div>\
                </div>\
                <div style='flex:none;padding-top:.25em'><button id='add_mem_btn' class='btn'>Add</button>&nbsp<button id='rem_mem_btn' class='btn' disabled>Remove</button></div>\
            </div>\
            <div style='flex:none'>&nbsp</div>\
            <div class='col-flex' style='flex: 1 1 50%;height:100%'>\
                <div style='flex:none'>Admins:</div>\
                <div class='ui-widget-content text' style='flex:1 1 100%;min-height:5em;overflow:auto'>\
                    <div id='proj_adm_tree' class='no-border'></div>\
                </div>\
                <div style='flex:none;padding-top:.25em'><button id='add_adm_btn' class='btn'>Add</button>&nbsp<button id='rem_adm_btn' class='btn' disabled>Remove</button></div>\
            </div>\
        </div>";

    frame.html( html );

    var proj;
    if ( a_data )
        proj = Object.assign({}, a_data);
    else
        proj = { owner: "u/"+g_user.uid };

    var alloc_list = [];

    inputTheme($('input',frame));
    inputTheme($('textarea',frame));
    inputDisable($('#owner_id',frame));

    var options = {
        title: a_data?"Edit Project " + a_data.id:"New Project",
        modal: true,
        width: 500,
        height: 550,
        resizable: true,
        closeOnEscape: false,
        buttons: [{
            text: "Cancel",
            click: function() {
                $(this).dialog('destroy').remove();
            }
        },{
            text: a_data?"Update":"Create",
            click: function() {
                var obj,i = {};

                var subRepo = $("#suballoc",frame).val();
                var subAlloc = $("#suballoc_size",frame).val();

                var url = "";

                if ( a_data ){
                    getUpdatedValue( $("#title",frame).val(), a_data, obj, "title" );
                    getUpdatedValue( $("#desc",frame).val(), a_data, obj, "desc" );
                }else{
                    obj.title = $("#title",frame).val().trim();
                    obj.desc = $("#desc",frame).val().trim();
                }

                if ( obj.title )
                    url += "&title="+ encodeURIComponent(obj.title);

                if ( obj.desc )
                    url += "&desc="+ encodeURIComponent(obj.desc);

                if ( subRepo != "ignore" && (( !a_data && subRepo != "none" ) || (a_data && (subRepo != a_data.subRepo || subAlloc != a_data.subAlloc )))){
                    //console.log("repo:",subRepo );
                    if ( subRepo == "none" ){
                        url += "&sub_repo=none";
                    }else{
                        var alloc_sz = parseSize( subAlloc );
                        //console.log( "alloc_sz", alloc_sz );
                        if ( alloc_sz == null || alloc_sz < 0 ){
                            dlgAlert("Input Error","Invalid sub-allocation size.");
                            return;
                        }

                        for ( i in alloc_list ){
                            if ( alloc_list[i].repo == subRepo ){
                                if ( alloc_sz > alloc_list[i].maxSize ){
                                    dlgAlert("Input Error","Sub-allocation size exceeds selected allocation capacity.");
                                    return;
                                }

                                break;
                            }
                        }

                        if ( a_data && (subRepo == a_data.subRepo))
                            url += "&sub_alloc=" + alloc_sz;
                        else
                            url += "&sub_repo=" + subRepo + "&sub_alloc=" + alloc_sz;
                    }
                }

                var mem_tree =  $("#proj_mem_tree",frame).fancytree("getTree");
                var adm_tree =  $("#proj_adm_tree",frame).fancytree("getTree");

                var admins = [];
                adm_tree.visit( function(node){
                    admins.push( node.key );
                });

                var members = [];
                mem_tree.visit( function(node){
                    members.push( node.key );
                });

                if ( a_data ){
                    var diff;
                    console.log("ex admins:",a_data.admin,",new:",admins);
                    if ( a_data.admin && a_data.admin.length ){
                        diff = true;
                        if ( a_data.admin.length == admins.length ){
                            diff = false;
                            for ( i = 0; i < admins.length; i++ ){
                                if ( a_data.admin[i] != admins[i] ){
                                    diff = true;
                                    break;
                                }
                            }
                        }
                        if ( diff ){
                            url += "&admins=" + JSON.stringify( admins );
                        }
                    }else if ( admins.length ){
                        url += "&admins=" + JSON.stringify( admins );
                    }

                    if ( a_data.member && a_data.member.length ){
                        diff = true;
                        if ( a_data.member.length == members.length ){
                            diff = false;
                            for ( i = 0; i < members.length; i++ ){
                                if ( a_data.member[i] != members[i] ){
                                    diff = true;
                                    break;
                                }
                            }
                        }
                        if ( diff ){
                            url += "&members=" + JSON.stringify( members );
                        }
                    }else if ( members.length ){
                        url += "&members=" + JSON.stringify( members );
                    }

                }else{
                    if ( members.length )
                        url += "&members=" + JSON.stringify( members );

                    if ( admins.length )
                        url += "&admins=" + JSON.stringify( admins );
                }

                if ( url ){
                    if ( a_data )
                        url = "/api/prj/update?id=" + encodeURIComponent( a_data.id ) + url;
                    else
                        url = "/api/prj/create?id=" + encodeURIComponent( $("#id",frame).val().trim() ) + url;

                    console.log( "URL", url );

                    var inst = $(this);
                    _asyncGet( url, null, function( ok, data ){
                        if ( ok ) {
                            inst.dialog('destroy').remove();
                            console.log( "data:",data);
                            if ( a_cb )
                                a_cb(data[0]);
                        } else {
                            dlgAlert( "Project " + (a_data?"Update":"Create") + " Error", data );
                        }
                    });
                }else{
                    $(this).dialog('destroy').remove();
                }
            }
        }],
        open: function(event,ui){
            if ( a_data && a_data.alloc ){
                $("#suballoc",frame).html("<option value='ignore'>Allocation(s) in use</option>").selectmenu({width:"auto",disabled:true});
                inputDisable($("#suballoc_size",frame));
            }else{
                allocListBySubject( undefined, false, function( ok, data ){
                    console.log( ok, data );
                    var alloc_opt = "<option value='none'>None</option>";

                    if ( ok ){
                        alloc_list = data;
                        var alloc;
                        var found = false;
                        for ( var i in data ){
                            alloc = data[i];

                            alloc_opt += "<option value='"+alloc.repo+"'";
                            if ( a_data && a_data.subRepo == alloc.repo ){
                                alloc_opt += " selected";
                                found = true;
                            }
                            console.log( "alloc", alloc );
                            alloc_opt += ">"+alloc.repo.substr(5)+" ("+ sizeToString(alloc.totSize) + " / " + sizeToString(alloc.maxSize) +")</option>";
                        }

                        if ( found ){
                            if (( a_upd_perms & PERM_WR_REC ) != 0 ){
                                inputEnable($("#suballoc_size",frame));
                            }
                        }else{
                            // Unlikely
                            inputDisable($("#suballoc_size",frame));
                        }
                    }

                    $("#suballoc",frame).html(alloc_opt).selectmenu({width:"auto",disabled:a_data?!(a_upd_perms&PERM_WR_REC):false}).on('selectmenuchange', function( ev, ui ) {
                        console.log("alloc changed",ui.item.value,$("#suballoc",frame).val());

                        if ( ui.item.value == "none" ){
                            inputDisable($("#suballoc_size",frame)).val("");
                        }else{
                            inputEnable($("#suballoc_size",frame));
                        }
                    });
                });
            }
            var mem_src = [];
            var adm_src = [];

            if ( a_data ){
                inputDisable($("#id",frame)).val(a_data.id);
                $("#title",frame).val(a_data.title);
                $("#desc",frame).val(a_data.desc);
                $("#owner_id",frame).val(a_data.owner);
                if ( a_data.subRepo )
                    $("#suballoc_size",frame).val(a_data.subAlloc);

                if (( a_upd_perms & PERM_WR_REC ) == 0 ){
                    inputDisable($("#title,#desc,#suballoc_size,#add_adm_btn,#rem_adm_btn",frame));
                }

                for ( var i in a_data.member )
                    mem_src.push({title: a_data.member[i].substr(2),icon:false,key: a_data.member[i] });

                for ( i in a_data.admin )
                    adm_src.push({title: a_data.admin[i].substr(2),icon:false,key: a_data.admin[i] });

            }else{
                $("#owner_id",frame).val(g_user.uid);
            }

            $("#proj_mem_tree",frame).fancytree({
                extensions: ["themeroller"],
                themeroller: {
                    activeClass: "ui-state-hover",
                    addClass: "",
                    focusClass: "",
                    hoverClass: "ui-state-active",
                    selectedClass: ""
                },
                source: mem_src,
                selectMode: 1,
                checkbox: false,
                activate: function( event, data ) {
                    $("#rem_mem_btn",frame).button("option", "disabled", false);
                }
            });

            $("#proj_adm_tree",frame).fancytree({
                extensions: ["themeroller"],
                themeroller: {
                    activeClass: "ui-state-hover",
                    addClass: "",
                    focusClass: "",
                    hoverClass: "ui-state-active",
                    selectedClass: ""
                },
                source: adm_src,
                selectMode: 1,
                checkbox: false,
                activate: function( event, data ) {
                    if (( a_upd_perms & PERM_WR_REC ) != 0 ){
                        $("#rem_adm_btn",frame).button("option", "disabled", false);
                    }
                }
            });

            var mem_tree =  $("#proj_mem_tree",frame).fancytree("getTree");
            var adm_tree =  $("#proj_adm_tree",frame).fancytree("getTree");
            var uid;

            $("#add_mem_btn",frame).click( function(){
                var excl = [proj.owner];
                adm_tree.visit(function(node){
                    excl.push(node.key);
                });
                mem_tree.visit(function(node){
                    excl.push(node.key);
                });

                dlgPickUser( "u/"+g_user.uid, excl, false, function( uids ){
                    for ( i in uids ){
                        uid = uids[i];
                        mem_tree.rootNode.addNode({title: uid.substr(2),icon:false,key: uid });
                    }
                });
            });

            $("#rem_mem_btn",frame).click( function(){
                var node = mem_tree.getActiveNode();
                if ( node ){
                    node.remove();
                    $("#rem_mem_btn",frame).button("option", "disabled", true);
                }
            });

            $("#add_adm_btn",frame).click( function(){
                var excl = [proj.owner];
                adm_tree.visit(function(node){
                    console.log("excl adm:",node.key);
                    excl.push(node.key);
                });
                mem_tree.visit(function(node){
                    console.log("excl mem:",node.key);
                    excl.push(node.key);
                });
                console.log("excl:",excl);
                dlgPickUser( "u/"+g_user.uid, excl, false, function( uids ){
                    console.log("sel:",uids);
                    for ( i in uids ){
                        uid = uids[i];

                        adm_tree.rootNode.addNode({title: uid.substr(2),icon:false,key: uid });
                    }
                });
            });

            $("#rem_adm_btn",frame).click( function(){
                var node = adm_tree.getActiveNode();
                if ( node ){
                    node.remove();
                    $("#rem_adm_btn",frame).button("option", "disabled", true);
                }
            });

            $(".btn",frame).button();
        }
    };


    frame.dialog( options );
}
