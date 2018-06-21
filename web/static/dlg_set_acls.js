function makeDlgSetACLs(){
    console.log("making dialog Set ACLs");

    var inst = this;

    this.content =
        "<div class='col-flex' style='height:100%'>\
            <div style='flex:none'>ID/Alias: <span id='dlg_id'></span></div>\
                <div class='row-flex' style='flex:1 1 auto'>\
                    <div class='col-flex' style='flex:1 1 50%'>\
                        <div style='flex:none;padding:.5rem 0 0 0'>Rules:</div>\
                        <div class='ui-widget-content text' style='flex:1 1 auto;overflow:auto'>\
                            <div id='dlg_rule_tree' class='no-border'></div>\
                        </div>\
                        <div style='flex:none;white-space:nowrap;padding:.25rem 0 0 0'>\
                            <button id='dlg_add_user' class='btn small'>+ User</button>\
                            <button id='dlg_add_group' class='btn small'>+ Group</button>\
                            <button id='dlg_rem' class='btn small'>Remove</button>\
                        </div>\
                    </div>\
                    <div style='flex:none'>&nbsp</div>\
                    <div class='col-flex' style='flex:1 1 50%'>\
                        <div style='flex:none;padding:.5rem 0 0 0'>Permissions:</div>\
                        <div class='ui-widget-content text' style='flex:1 1 auto;overflow:auto'>\
                            <table class='info_table' style='width:100%'>\
                            <tr><td>List:</td><td><select id='dlg_list_sel'><option value='grant'>Grant</option><option value='deny'>Deny</option><option value='inherit'>Inherit</option></select><br><br><br></td></tr>\
                            <tr><td>View:</td><td><select id='dlg_view_sel'><option value='grant'>Grant</option><option value='deny'>Deny</option><option value='inherit'>Inherit</option></select></td></tr>\
                            <tr><td>Update:</td><td><select id='dlg_upd_sel'><option value='grant'>Grant</option><option value='deny'>Deny</option><option value='inherit'>Inherit</option></select></td></tr>\
                            <tr><td>Admin:</td><td><select id='dlg_admin_sel'><option value='grant'>Grant</option><option value='deny'>Deny</option><option value='inherit'>Inherit</option></select></td></tr>\
                            <tr><td>Tag:</td><td><select id='dlg_tag_sel'><option value='grant'>Grant</option><option value='deny'>Deny</option><option value='inherit'>Inherit</option></select></td></tr>\
                            <tr><td>Annotate:</td><td><select id='dlg_note_sel'><option value='grant'>Grant</option><option value='deny'>Deny</option><option value='inherit'>Inherit</option></select></td></tr>\
                            <tr><td>Read:</td><td><select id='dlg_read_sel'><option value='grant'>Grant</option><option value='deny'>Deny</option><option value='inherit'>Inherit</option></select></td></tr>\
                            <tr><td>Write:</td><td><select id='dlg_write_sel'><option value='grant'>Grant</option><option value='deny'>Deny</option><option value='inherit'>Inherit</option></select></td></tr>\
                            <tr id='dlg_create_row' style='display:none'><td>Create:</td><td><select id='dlg_create_sel'><option value='grant'>Grant</option><option value='deny'>Deny</option><option value='inherit'>Inherit</option></select></td></tr>\
                            </table>\
                        </div>\
                        <div  style='flex:none;white-space:nowrap;padding:.25rem 0 0 0'>\
                            <button id='dlg_grant_all' class='btn small'>Grant</button>\
                            <button id='dlg_deny_all' class='btn small'>Deny</button>\
                            <button id='dlg_inherit_all' class='btn small'>Inherit</button>\
                        </div>\
                    </div>\
                    <div id='col_div_1' style='flex:none;display:none'>&nbsp</div>\
                    <div id='col_div_2' class='col-flex' style='flex:1 1 50%;display:none'>\
                        <div style='flex:none;padding:.5rem 0 0 0'>Inherited:</div>\
                        <div class='ui-widget-content text' style='flex:1 1 auto;overflow:auto'>\
                            <table class='info_table' style='width:100%'>\
                            <tr><td>List:</td><td style='overflow:visible'><select id='dlg_inh_list_sel'><option value='grant'>Grant</option><option value='deny'>Deny</option><option value='inherit'>Inherit</option></select></td></tr>\
                            <tr><td>View:</td><td><select id='dlg_inh_view_sel'><option value='grant'>Grant</option><option value='deny'>Deny</option><option value='inherit'>Inherit</option></select></td></tr>\
                            <tr><td>Update:</td><td><select id='dlg_inh_upd_sel'><option value='grant'>Grant</option><option value='deny'>Deny</option><option value='inherit'>Inherit</option></select></td></tr>\
                            <tr><td>Admin:</td><td><select id='dlg_inh_admin_sel'><option value='grant'>Grant</option><option value='deny'>Deny</option><option value='inherit'>Inherit</option></select></td></tr>\
                            <tr><td>Tag:</td><td><select id='dlg_inh_tag_sel'><option value='grant'>Grant</option><option value='deny'>Deny</option><option value='inherit'>Inherit</option></select></td></tr>\
                            <tr><td>Annotate:</td><td><select id='dlg_inh_note_sel'><option value='grant'>Grant</option><option value='deny'>Deny</option><option value='inherit'>Inherit</option></select></td></tr>\
                            <tr><td>Read:</td><td><select id='dlg_inh_read_sel'><option value='grant'>Grant</option><option value='deny'>Deny</option><option value='inherit'>Inherit</option></select></td></tr>\
                            <tr><td>Write:</td><td><select id='dlg_inh_write_sel'><option value='grant'>Grant</option><option value='deny'>Deny</option><option value='inherit'>Inherit</option></select></td></tr>\
                            <tr><td>Create:</td><td><select id='dlg_inh_create_sel'><option value='grant'>Grant</option><option value='deny'>Deny</option><option value='inherit'>Inherit</option></select></td></tr>\
                            </table>\
                        </div>\
                        <div  style='flex:none;white-space:nowrap;padding:.25rem 0 0 0'>\
                            <button id='dlg_inh_grant_all' class='btn small'>Grant</button>\
                            <button id='dlg_inh_deny_all' class='btn small'>Deny</button>\
                            <button id='dlg_inh_inherit_all' class='btn small'>Inherit</button>\
                        </div>\
                    </div>\
                </div>\
        </div>";

    this.show = function( item ){
        console.log( "show", item );
        inst.frame = $(document.createElement('div'));
        inst.frame.html( inst.content );
        inst.uid = item.owner;
        inst.is_coll = (item.id[0]=="c");

        if ( inst.is_coll ){
            $("#col_div_1",inst.frame).show();
            $("#col_div_2",inst.frame).show();
            $("#dlg_create_row",inst.frame).show();
/*
            $("#dlg_inh_grant_all",inst.frame).click( function(){ inst.setAllPermInh("grant"); });
            $("#dlg_inh_deny_all",inst.frame).click( function(){ inst.setAllPermInh("deny"); });
            $("#dlg_inh_inherit_all",inst.frame).click( function(){ inst.setAllPermInh("inherit"); });

            $("#dlg_inh_list_sel",inst.frame).change( function(){ inst.selectInhHandler( $(this), PERM_LIST )});
            $("#dlg_inh_view_sel",inst.frame).change( function(){ inst.selectInhHandler( $(this), PERM_VIEW )});
            $("#dlg_inh_upd_sel",inst.frame).change( function(){ inst.selectInhHandler( $(this), PERM_UPDATE )});
            $("#dlg_inh_admin_sel",inst.frame).change( function(){ inst.selectInhHandler( $(this), PERM_ADMIN )});
            $("#dlg_inh_tag_sel",inst.frame).change( function(){ inst.selectInhHandler( $(this), PERM_TAG )});
            $("#dlg_inh_note_sel",inst.frame).change( function(){ inst.selectInhHandler( $(this), PERM_NOTE )});
            $("#dlg_inh_read_sel",inst.frame).change( function(){ inst.selectInhHandler( $(this), PERM_READ )});
            $("#dlg_inh_write_sel",inst.frame).change( function(){ inst.selectInhHandler( $(this), PERM_WRITE )});

            $("#dlg_create_sel",inst.frame).change( function(){ inst.selectHandler( $(this), PERM_CREATE )});
            $("#dlg_inh_create_sel",inst.frame).change( function(){ inst.selectInhHandler( $(this), PERM_CREATE )});
*/
        }

/*
        $("#dlg_grant_all",inst.frame).click( function(){ inst.setAllPerm("grant"); });
        $("#dlg_deny_all",inst.frame).click( function(){ inst.setAllPerm("deny"); });
        $("#dlg_inherit_all",inst.frame).click( function(){ inst.setAllPerm("inherit"); });
        $("#dlg_add_user",inst.frame).click( function(){ inst.addUser(); });
        $("#dlg_add_group",inst.frame).click( function(){ inst.addGroup(); });
        $("#dlg_rem",inst.frame).click( function(){ inst.remUserGroup(); });

        $("#dlg_list_sel",inst.frame).change( function(){ inst.selectHandler( $(this), PERM_LIST )});
        $("#dlg_view_sel",inst.frame).change( function(){ inst.selectHandler( $(this), PERM_VIEW )});
        $("#dlg_upd_sel",inst.frame).change( function(){ inst.selectHandler( $(this), PERM_UPDATE )});
        $("#dlg_admin_sel",inst.frame).change( function(){ inst.selectHandler( $(this), PERM_ADMIN )});
        $("#dlg_tag_sel",inst.frame).change( function(){ inst.selectHandler( $(this), PERM_TAG )});
        $("#dlg_note_sel",inst.frame).change( function(){ inst.selectHandler( $(this), PERM_NOTE )});
        $("#dlg_read_sel",inst.frame).change( function(){ inst.selectHandler( $(this), PERM_READ )});
        $("#dlg_write_sel",inst.frame).change( function(){ inst.selectHandler( $(this), PERM_WRITE )});
*/
    
    
        aclView( item.id, function( ok, data ){
            if ( !ok || !data ) {
                //alert( "Could not get ACLs for " + item.id );
                alert( data );
                return;
            }
            console.log("data",data);

            if ( !data.rule )
                data.rule = [];

            // Insert a default rule if not present (for UI needs)
            var ins_def = true;
            for ( var i in data.rule ){
                if ( data.rule[i].id == "default" ) {
                    ins_def = false;
                    break;
                }
            }

            if ( ins_def ){
                data.rule.push({id:"default",grant:0,deny:0,inhgrant:0,inhdeny:0});
            }

            if ( data.rule ) {
                inst.orig_rules = data.rule.slice();
                inst.new_rules = data.rule;
            } else {
                inst.orig_rules = [];
                inst.new_rules = [];
            }

            var options = {
                title: "Sharing for " + (inst.is_coll?"Collection \"":"Data \"") + item.title + "\"",
                modal: true,
                width: inst.is_coll?600:425,
                height: 'auto',
                resizable: true,
                closeOnEscape: false,
                buttons: [{
                    text: "Ok",
                    click: function() {
                        var dlg_inst = $(this);
                        console.log( "SAVE ACLS:", inst.new_rules );
                        aclUpdate( item.id, inst.new_rules, function( ok, data ){
                            if ( !ok )
                                alert( "ACL Update Failed", data.errMsg );
                            else
                                dlg_inst.dialog('destroy').remove();
                        });
                    }
                },{
                    text: "Cancel",
                    click: function() {
                        $(this).dialog('destroy').remove();
                    }
                }],
                open: function(event,ui){
                    $("#dlg_id",inst.frame).html((item.alias?"("+item.alias+")":"["+item.id.substr(2)+"]") );
                    var src = inst.buildTreeSource( inst.orig_rules );

                    $("#dlg_rule_tree",inst.frame).fancytree({
                        extensions: ["themeroller"],
                        themeroller: {
                            activeClass: "ui-state-hover",
                            addClass: "",
                            focusClass: "",
                            hoverClass: "ui-state-active",
                            selectedClass: ""
                        },
                        source: src,
                        selectMode: 1,
                        lazyLoad: function( event, data ) {
                            if ( data.node.key.startsWith("g/")){
                                data.result = {
                                    url: "/api/grp/view?uid="+inst.uid+"&gid="+data.node.key.substr(2),
                                    cache: false
                                };
                            }
                        },
                        postProcess: function( event, data ) {
                            if ( data.node.key.startsWith("g/")){
                                //console.log("resp:",data.response);
                                data.result = [];
                                if ( data.response.member && data.response.member.length ){
                                    for ( var i in data.response.member ) {
                                        data.result.push({ title: data.response.member[i], icon: false });
                                    }
                                }else{
                                    data.result.push({ title: "(empty)", icon: false  });
                                }
                            }
                        },
                        activate: function( event, data ) {
                            inst.updateSelection( data.node.key, data.node.data.rule );
                        },
                    });
                    inst.disablePermControls( true );
                }
            };

            inst.frame.dialog( options );
            $(".btn",inst.frame).button();
            $("select",inst.frame).selectmenu({
                    width:"auto",
            });
        });
    }

    this.buildTreeSource = function( rules ){
        var user_rules = [];
        var group_rules = [];
        var def_rule = null;
        var sub;

        for ( var i in rules ){
            sub = rules[i];
            if ( sub.id.startsWith( "u/" ))
                user_rules.push({title: sub.id.substring(2), key: sub.id, rule: sub });
            else if ( sub.id.startsWith( "g/" ))
                group_rules.push({title: sub.id.substring(2), key: sub.id, rule: sub, folder:true, lazy:true });
            else
                def_rule = sub;
        }

        var src = [
            {title:"Users",folder:true,children:user_rules,key:"users"},
            {title:"Groups",folder:true,children:group_rules,key:"groups"},
            {title:"Default", folder:false, key:"default", rule:def_rule }
        ];

        return src;
    }

    this.selectHandler = function( obj, perm ){
        if ( inst.cur_rule ) {
            console.log( "value", obj.val(), "prev val:", inst.cur_rule );

            var mask = PERM_ALL & ~perm;
            if ( obj.val() == "grant" ) {
                inst.cur_rule.grant |= perm;
                inst.cur_rule.deny &= mask;
            } else if ( obj.val() == "deny" ) {
                inst.cur_rule.grant &= mask;
                inst.cur_rule.deny |= perm;
            } else {
                inst.cur_rule.grant &= mask;
                inst.cur_rule.deny &= mask;
            }
            console.log( "new val:", inst.cur_rule );
        }
    }

    this.selectInhHandler = function( obj, perm ){
        if ( inst.cur_rule ) {
            console.log( "value", obj.val(), "prev val:", inst.cur_rule );

            var mask = PERM_ALL & ~perm;
            if ( obj.val() == "grant" ) {
                inst.cur_rule.inhgrant |= perm;
                inst.cur_rule.inhdeny &= mask;
            } else if ( obj.val() == "deny" ) {
                inst.cur_rule.inhgrant &= mask;
                inst.cur_rule.inhdeny |= perm;
            } else {
                inst.cur_rule.inhgrant &= mask;
                inst.cur_rule.inhdeny &= mask;
            }
            console.log( "new val:", inst.cur_rule );
        }
    }

    this.setAllPerm = function( value ){
        if ( inst.cur_rule ){
            if ( value == "grant" ){
                inst.cur_rule.grant = PERM_ALL;
                inst.cur_rule.deny = 0;
            } else if ( value == "deny" ){
                inst.cur_rule.grant = 0;
                inst.cur_rule.deny = PERM_ALL;
            } else {
                inst.cur_rule.grant = 0;
                inst.cur_rule.deny = 0;
            }
        }

        $("#dlg_view_sel",this.frame).val(value);
        $("#dlg_list_sel",this.frame).val(value);
        $("#dlg_upd_sel",this.frame).val(value);
        $("#dlg_admin_sel",this.frame).val(value);
        $("#dlg_tag_sel",this.frame).val(value);
        $("#dlg_note_sel",this.frame).val(value);
        $("#dlg_read_sel",this.frame).val(value);
        $("#dlg_write_sel",this.frame).val(value);
        $("#dlg_create_sel",this.frame).val(value);
    }

    this.setAllPermInh = function( value ){
        if ( inst.cur_rule ){
                if ( value == "grant" ){
                inst.cur_rule.inhgrant = PERM_ALL;
                inst.cur_rule.inhdeny = 0;
            } else if ( value == "deny" ){
                inst.cur_rule.inhgrant = 0;
                inst.cur_rule.inhdeny = PERM_ALL;
            } else {
                inst.cur_rule.inhgrant = 0;
                inst.cur_rule.inhdeny = 0;
            }
        }

        $("#dlg_inh_view_sel",this.frame).val(value);
        $("#dlg_inh_list_sel",this.frame).val(value);
        $("#dlg_inh_upd_sel",this.frame).val(value);
        $("#dlg_inh_admin_sel",this.frame).val(value);
        $("#dlg_inh_tag_sel",this.frame).val(value);
        $("#dlg_inh_note_sel",this.frame).val(value);
        $("#dlg_inh_read_sel",this.frame).val(value);
        $("#dlg_inh_write_sel",this.frame).val(value);
        $("#dlg_inh_create_sel",this.frame).val(value);
    }

    this.setPermsFromRule = function( rule ){
        console.log( "setPermsFromRule", rule );
        if ( !rule ) {
            inst.setAllPerm("inherit");
            if ( inst.is_coll )
                inst.setAllPermInh("inherit");
        } else {
            inst.setPerm( "#dlg_view_sel", rule, PERM_VIEW );
            inst.setPerm( "#dlg_list_sel", rule, PERM_LIST );
            inst.setPerm( "#dlg_upd_sel", rule, PERM_UPDATE );
            inst.setPerm( "#dlg_admin_sel", rule, PERM_ADMIN );
            inst.setPerm( "#dlg_tag_sel", rule, PERM_TAG );
            inst.setPerm( "#dlg_note_sel", rule, PERM_NOTE );
            inst.setPerm( "#dlg_read_sel", rule, PERM_READ );
            inst.setPerm( "#dlg_write_sel", rule, PERM_WRITE );
            inst.setPerm( "#dlg_create_sel", rule, PERM_CREATE );
            if ( inst.is_coll ) {
                inst.setPermInh( "#dlg_inh_view_sel", rule, PERM_VIEW );
                inst.setPermInh( "#dlg_inh_list_sel", rule, PERM_LIST );
                inst.setPermInh( "#dlg_inh_upd_sel", rule, PERM_UPDATE );
                inst.setPermInh( "#dlg_inh_admin_sel", rule, PERM_ADMIN );
                inst.setPermInh( "#dlg_inh_tag_sel", rule, PERM_TAG );
                inst.setPermInh( "#dlg_inh_note_sel", rule, PERM_NOTE );
                inst.setPermInh( "#dlg_inh_read_sel", rule, PERM_READ );
                inst.setPermInh( "#dlg_inh_write_sel", rule, PERM_WRITE );
                inst.setPermInh( "#dlg_inh_create_sel", rule, PERM_CREATE );
            }
        }
    }

    inst.setPerm = function( id, rule, perm ) {
        if ( rule.deny & perm )
            $(id,this.frame).val("deny");
        else if ( rule.grant & perm )
            $(id,this.frame).val("grant");
        else
            $(id,this.frame).val("inherit");
    }

    inst.setPermInh = function( id, rule, perm ) {
        if ( rule.inhdeny & perm )
            $(id,this.frame).val("deny");
        else if ( rule.inhgrant & perm )
            $(id,this.frame).val("grant");
        else
            $(id,this.frame).val("inherit");
    }

    this.disablePermControls = function( disabled, no_remove ){
        if ( disabled )
            inst.setAllPerm("inherit");
        $("#dlg_view_sel",inst.frame).prop("disabled", disabled );
        $("#dlg_list_sel",inst.frame).prop("disabled", disabled );
        $("#dlg_upd_sel",inst.frame).prop("disabled", disabled );
        $("#dlg_admin_sel",inst.frame).prop("disabled", disabled );
        $("#dlg_tag_sel",inst.frame).prop("disabled", disabled );
        $("#dlg_note_sel",inst.frame).prop("disabled", disabled );
        $("#dlg_read_sel",inst.frame).prop("disabled", disabled );
        $("#dlg_write_sel",inst.frame).prop("disabled", disabled );
        $("#dlg_create_sel",inst.frame).prop("disabled", disabled );
        $("#dlg_grant_all",inst.frame).prop("disabled", disabled );
        $("#dlg_deny_all",inst.frame).prop("disabled", disabled );
        $("#dlg_inherit_all",inst.frame).prop("disabled", disabled );
        if ( no_remove )
            $("#dlg_rem",inst.frame).prop("disabled", true );
        else
            $("#dlg_rem",inst.frame).prop("disabled", disabled );

        if ( inst.is_coll ) {
            if ( disabled )
                inst.setAllPermInh("inherit");
            $("#dlg_inh_view_sel",inst.frame).prop("disabled", disabled );
            $("#dlg_inh_list_sel",inst.frame).prop("disabled", disabled );
            $("#dlg_inh_upd_sel",inst.frame).prop("disabled", disabled );
            $("#dlg_inh_admin_sel",inst.frame).prop("disabled", disabled );
            $("#dlg_inh_tag_sel",inst.frame).prop("disabled", disabled );
            $("#dlg_inh_note_sel",inst.frame).prop("disabled", disabled );
            $("#dlg_inh_read_sel",inst.frame).prop("disabled", disabled );
            $("#dlg_inh_write_sel",inst.frame).prop("disabled", disabled );
            $("#dlg_inh_create_sel",inst.frame).prop("disabled", disabled );
            $("#dlg_inh_grant_all",inst.frame).prop("disabled", disabled );
            $("#dlg_inh_deny_all",inst.frame).prop("disabled", disabled );
            $("#dlg_inh_inherit_all",inst.frame).prop("disabled", disabled );
        }
    }

    this.updateSelection = function( key, rule ){
        console.log('update:',key);
        inst.cur_rule = null;
        for ( var i in inst.new_rules ) {
            if ( inst.new_rules[i].id == key ) {
                inst.cur_rule = inst.new_rules[i];
                break;
            }
        }

        if ( key.startsWith( "u/" )) {
            inst.disablePermControls( false );
            inst.setPermsFromRule( rule );
        } else if ( key.startsWith("g/")) {
            inst.disablePermControls(false,(key=='g/members'?true:false));
            inst.setPermsFromRule(rule);
        } else if ( key == "default" ) {
            inst.disablePermControls( false, true );
            inst.setPermsFromRule( rule );
        } else {
            inst.disablePermControls( true );
        }
    }

    this.addUser = function(){
        console.log("add user" );

        dlgPickUser.show( function( uids ){
            var tree = $("#dlg_rule_tree",inst.frame).fancytree("getTree");
            var id;
            var rule;
            for ( var i in uids ){
                id = uids[i];
                if ( !tree.getNodeByKey( id )){
                    rule = {id: id, grant: 0, deny: 0, inhgrant:0, inhdeny: 0 };
                    inst.new_rules.push( rule );
                    tree.rootNode.children[0].addNode({title: id.substr(2), key: id, rule: rule });
                }
            }
        });
    }

    this.addGroup = function(){
        console.log("add group" );

        dlgGroups.show( inst.uid, function( gids ){
            var tree = $("#dlg_rule_tree",inst.frame).fancytree("getTree");
            var id;
            var rule;
            for ( var i in gids ){
                id = gids[i];
                if ( !tree.getNodeByKey( id )){
                    rule = {id: id, grant: 0, deny: 0, inhgrant:0, inhdeny: 0 };
                    inst.new_rules.push( rule );
                    tree.rootNode.children[1].addNode({title: id.substr(2), key: id, rule: rule, folder:true, lazy:true });
                }
            }
        }, true );
    }

    this.remUserGroup = function(){
        console.log("remove user/group", inst.cur_rule);
        if ( inst.cur_rule ){
            var key = inst.cur_rule.id;
            if ( key == "default" )
                return;
            if ( key == "g/members" )
                return;

            var tree = $("#dlg_rule_tree",inst.frame).fancytree("getTree");
            var node = tree.getActiveNode();
            if ( node.key == key ){
                for ( var i in inst.new_rules ) {
                    if ( inst.new_rules[i].id == key ){
                        inst.new_rules.splice( i, 1 );
                        break;
                    }
                }
                inst.cur_rule = null;
                inst.disablePermControls( true );
                node.remove();
            }
        }
    }
}
