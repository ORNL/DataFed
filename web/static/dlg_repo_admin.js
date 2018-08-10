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
                    </table>\
                </div>\
                <div style='flex:none' class='ui-widget-header'>Administrators:</div>\
                <div style='flex:1 1 45%' class='ui-widget-content text'>\
                    <div id='admin_tree' class='no-border' style='min-height:0'></div>\
                </div>\
                <div style='flex:none'>\
                    <button class='btn small' id='add_admin'>Add</button>\
                    <button class='btn small' id='rem_admin'>Remove</button>\
                </div>\
            </div>\
            <div style='flex:none'>&nbsp</div>\
            <div class='col-flex' style='flex:1 1 55%;height:100%'>\
                <div style='none' class='ui-widget-header'>Allocations:</div>\
                <div style='flex:1 1 50%' class='ui-widget-content text'>\
                    <div id='alloc_tree' class='no-border' style='min-height:0'></div>\
                </div>\
                <div style='flex:none'>\
                    <button class='btn small' id='add_alloc'>Add</button>\
                    <button class='btn small' id='edit_alloc'>Edit</button>\
                    <button class='btn small' id='rem_alloc'>Remove</button>\
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
            selectMode: 1
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
            selectMode: 1
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
    }

    this.initForm = function(){
        console.log("repo:",inst.repo);
        if ( inst.repo ){
            $("#id",inst.frame).val(inst.repo.id.substr(5));
            $("#title",inst.frame).val(inst.repo.title);
            $("#desc",inst.frame).val(inst.repo.desc);
            $("#total_sz",inst.frame).val(sizeToString( inst.repo.totalSz ));
            var admin;
            for ( var i in inst.repo.admin ){
                admin = inst.repo.admin[i];
                inst.admin_tree.rootNode.addNode({title:admin.substr(2),icon:"ui-icon ui-icon-person",key:admin});
            }
        }
    }

    this.initAlloc = function(){
        console.log("alloc:",inst.alloc);
        if ( inst.alloc && inst.alloc.length ){
            var alloc;
            for ( var i in inst.alloc ){
                alloc = inst.alloc[i];
                inst.alloc_tree.rootNode.addNode({title:alloc.name,icon:alloc.id.startsWith("u/")?"ui-icon ui-icon-person":"ui-icon ui-icon-box",key:alloc.id});
            }
        }
    }
}