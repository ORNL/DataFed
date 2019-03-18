function dlgRepoManage(){
    var content =
        "<div class='col-flex' style='height:100%'>\
            <div style='flex:none;padding:.5rem 0 0 0'>Repositories:</div>\
            <div class='ui-widget-content text' style='flex:1 1 100%;overflow:auto'>\
                <div id='dlg_repo_tree' class='no-border'></div>\
            </div>\
            <div style='flex:none;white-space:nowrap;padding:.25rem 0 0 0'>\
                <button id='dlg_add_repo' class='btn small'>New</button>\
                <button id='dlg_edit_repo' class='btn small' disabled>Edit</button>\
                <button id='dlg_rem_repo' class='btn small' disabled>Delete</button>\
            </div>\
        </div>";

    var frame = $(document.createElement('div'));
    frame.html( content );

    function selectNone(){
        $("#dlg_edit_repo",frame).prop("disabled", true );
        $("#dlg_rem_repo",frame).prop("disabled", true );
    }

    function addRepo(){
        console.log("Add repo");
        dlgRepoEdit( null, function(){
            setStatusText("Repo created");
            refreshRepoList();
        });
    }

    function remRepo(){
        console.log("Remove repo");
        var tree = $("#dlg_repo_tree",frame).fancytree("getTree");
        var node = tree.getActiveNode();
        if ( node ){
            dlgConfirmChoice("Confirm Delete","Delete repo "+node.key.substr(5)+"? All associated data and allocations must be purged before repo can be deleted.",["Delete","Cancel"],function(choice){
                if ( choice == 0 ){
                    repoDelete( node.key );
                    setStatusText("Repo deleted");
                    refreshRepoList();
                }
            });
        }
    }

    function editRepo(){
        console.log("Edit repo");
        var tree = $("#dlg_repo_tree",frame).fancytree("getTree");
        var node = tree.getActiveNode();
        if ( node ){
            dlgRepoEdit( node.key, function(){
                setStatusText("Repo updated");
                refreshRepoList();
            });
        }
    }

    function refreshRepoList(){
        repoList(false,true,function( ok, data){
            if ( !ok ){
                dlgAlert("Repo List Error",data);
                return;
            }

            //console.log( "repo list:", ok, data );
            var src = [];
            var repo;
            for ( var i in data ){
                repo = data[i];
                src.push({title: repo.id + " (" + repo.domain + ")",folder:true,lazy:true,icon:false,key:repo.id });
            }
            $("#dlg_repo_tree",frame).fancytree("getTree").reload(src);
        });
    }

    $("#dlg_add_repo",frame).click( addRepo );
    $("#dlg_edit_repo",frame).click( editRepo );
    $("#dlg_rem_repo",frame).click( remRepo );

    var options = {
        title: "Manage Data Repositories",
        modal: true,
        width: 500,
        height: 400,
        resizable: true,
        closeOnEscape: false,
        buttons: [{
            text: "Close",
            click: function() {

                $(this).dialog('destroy').remove();
            }
        }],
        open: function(event,ui){
            repoList(false,true,function( ok, data){
                if ( !ok ){
                    dlgAlert("Repo List Error",data);
                    return;
                }

                console.log( "repo list:", ok, data );
                var src = [];
                var repo;
                for ( var i in data ){
                    repo = data[i];
                    src.push({title: repo.id + " (" + repo.domain + ")",folder:true,lazy:true,icon:false,key:repo.id });
                }

                $("#dlg_repo_tree",frame).fancytree({
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
                        data.result = {
                            url: "/api/repo/view?id="+encodeURIComponent(data.node.key),
                            cache: false
                        };
                    },
                    postProcess: function( event, data ) {
                        if ( data.node.lazy && data.response.length ){
                            console.log("resp:",data.response);
                            data.result = [];
                            var repo = data.response[0];
                            if ( repo.title )
                                data.result.push( { title:"title: "+repo.title,icon:false } );
                            if ( repo.desc )
                                data.result.push( { title:"desc: "+repo.desc,icon:false } );
                            if ( repo.capacity )
                                data.result.push( { title:"capacity: "+sizeToString(repo.capacity),icon:false } );
                            //var adm;
                            //for ( var i in data.response.admin ) {
                            //    adm = data.response.admin[i];
                            //    data.result.push( { title: mem.substr(2), icon: false, checkbox: false,key:mem } );
                            // }
                        }
                    },
                    activate: function( event, data ) {
                        console.log( data.node.key );
                        if ( data.node.key.startsWith("repo/")){
                            $("#dlg_edit_repo",frame).button("enable" );
                            $("#dlg_rem_repo",frame).button("enable" );
                        }else{
                            $("#dlg_edit_repo",frame).button("disable");
                            $("#dlg_rem_repo",frame).button("disable");
                        }
                    }
                });
            });
        }
    };

    frame.dialog( options );
    $(".btn",frame).button();
}

