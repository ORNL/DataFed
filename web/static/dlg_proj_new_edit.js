/*jshint multistr: true */

function dlgProjNewEdit( a_data, a_upd_perms, a_cb ) {
    var ele = document.createElement('div');
    ele.id = (a_data?a_data.id.replace("/","_"):"p_new")+"_edit";
    var frame = $(ele);
    var def_alloc;

    var html = "<div class='col-flex' style='height:100%'>\
        <div style='flex:none'>\
            <table class='form-table'>\
                <tr><td>ID: <span class='note'>*</span></td><td><input type='text' id='id' style='width:100%'></input></td></tr>\
                <tr><td>Title: <span class='note'>*</span></td><td><input type='text' id='title' style='width:100%'></input></td></tr>\
                <tr><td style='vertical-align:top'>Description:</td><td><textarea id='desc' rows=3 style='width:100%;padding:0'></textarea></td></tr>\
                <tr id='def_alloc_row' style='display:hidden'><td>Default&nbspAlloc:</td><td><select id='def_alloc'><option value='none'>None</option></select></td></tr>\
                <tr><td>Owner:</td><td><input type='text' id='owner_id' style='width:100%'></input></td></tr>\
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

    inputTheme($('input',frame));
    inputTheme($('textarea',frame));
    inputDisable($('#owner_id',frame));

    var options = {
        title: a_data?"Edit Project " + a_data.id:"New Project",
        modal: false,
        width: 500,
        height: 550,
        position:{ my: "left", at: "center+10", of: "body" },
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
                var obj ={}, i, url = "";

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

                var new_def_alloc, close_cnt = 0;

                if ( a_data ){
                    var diff;

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

                    if ( url ){
                        close_cnt++;
                        url = "/api/prj/update?id=" + encodeURIComponent( a_data.id ) + url;
                    }

                    var tmp = $("#def_alloc",frame).val();
                    if ( tmp != def_alloc ){
                        new_def_alloc = tmp;
                        close_cnt++;
                    }
                }else{
                    var id = $("#id",frame).val().trim();

                    if ( !id ){
                        setStatusText( "ID field is required.", true );
                        return;
                    }

                    if ( !obj.title ){
                        setStatusText( "Title field is required.", true );
                        return;
                    }

                    if ( members.length )
                        url += "&members=" + JSON.stringify( members );

                    if ( admins.length )
                        url += "&admins=" + JSON.stringify( admins );

                    url = "/api/prj/create?id=" + encodeURIComponent( id ) + url;
                    close_cnt = 1;
                }

                var result;

                function do_close(){
                    console.log( "do_close", do_close );
                    if ( --close_cnt <= 0 ){
                        setStatusText("Settings saved.");

                        if ( a_cb )
                            a_cb(result);

                        $(this).dialog('destroy').remove();
                    }
                }

                if ( close_cnt == 0 )
                    do_close();

                //var inst = $(this);
                if ( url ){
                    console.log( "URL", url );
                    _asyncGet( url, null, function( ok, data ){
                        if ( !ok ) {
                            dlgAlert( "Project " + (a_data?"Update":"Create") +" Error", data );
                        }else{
                            result = data[0];
                            do_close();
                        }
                    });
                }

                if ( new_def_alloc ){
                    console.log( "Set def alloc", new_def_alloc );
                    setDefaultAlloc( new_def_alloc, a_data.id, function( ok, data ){
                        if ( !ok ){
                            dlgAlert("Error Setting Default Allocation", data );
                        }else
                            do_close();
                    });
                }
            }
        }],
        open: function(event,ui){
            var widget = frame.dialog( "widget" );
            $(".ui-dialog-buttonpane",widget).append("<span class='note' style='padding:1em;line-height:200%'>* Required fields</span>");

            var mem_src = [];
            var adm_src = [];

            if ( a_data ){
                inputDisable($("#id",frame)).val(a_data.id);
                $("#title",frame).val(a_data.title);
                $("#desc",frame).val(a_data.desc);
                $("#def_alloc",frame).selectmenu({width:225});
                $("#def_alloc_row",frame).show();
                $("#owner_id",frame).val(a_data.owner);

                if (( a_upd_perms & PERM_WR_REC ) == 0 )
                    inputDisable($("#title,#desc,#add_adm_btn,#rem_adm_btn",frame));

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

    if ( a_data ){
        allocListBySubject( a_data.id, null, function( ok, data ){
            var html = "";
            if ( ok && data.length ){
                var alloc;
                for ( var i = 0; i < data.length; i++ ){
                    alloc = data[i];
                    html += "<option value='" + alloc.repo + "'";
                    if ( i == 0 ){
                        html += " selected";
                        def_alloc = alloc.repo;
                    }
                    html += ">" + alloc.repo.substr(5) + " ("+ sizeToString(alloc.dataSize) + " / " + sizeToString(alloc.dataLimit) +")</option>";
                }
            }

            $("#def_alloc",frame).html(html);

            frame.dialog( options );
        });
    }else{
        frame.dialog( options );
    }

}
