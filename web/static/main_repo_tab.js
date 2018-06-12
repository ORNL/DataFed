function repoShowSelectedInfo( key ){
    $("#repo_info").html( key );
}

function setupRepoTab(){
    var tree_source = [
        {title:"My Allocations",folder:true,lazy:true,key:"myalloc"},
        {title:"Project Allocations (member)",folder:true,lazy:true,key:"prjbymem"},
        {title:"Project Allocations (admin)",folder:true,lazy:true,key:"prjbyadm"},
        {title:"Repo Administration",folder:true,lazy:true,key:"admin"},
    ];

    $("#repo_tree").fancytree({
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
        lazyLoad: function( event, data ) {
            if ( data.node.key == "myalloc" ){
                data.result = {
                    url: "/api/repo/list/by_alloc",
                    cache: false
                };
            } else if ( data.node.key == "prjbyadm" ){
                data.result = {
                    url: "/api/prj/list/by_admin",
                    cache: false
                };
            } else if ( data.node.key == "prjbymem" ){
                data.result = {
                    url: "/api/prj/list/by_member",
                    cache: false
                };
            } else if ( data.node.key == "admin" ){
                data.result = {
                    url: "/api/repo/list/by_admin",
                    cache: false
                };
            }
        },
        postProcess: function( event, data ) {
            console.log( "pos proc:", data );
            if ( data.node.key == "myalloc" ){
                data.result = [];
                var item;
                for ( var i in data.response ) {
                    item = data.response[i];
                    data.result.push( { title: item.name, folder: true, lazy: true, key: item.id } );
                }
            } else if ( data.node.key == "prjbyadm" || data.node.key == "prjbymem" ){
                //console.log("proj list resp",data.response);
                data.result = [];
                if ( data.response.length ){
                    var item;
                    for ( var i in data.response ) {
                        item = data.response[i];
                        data.result.push({ title: item.name + " (" + item.id + ")", folder: true, key: "p/"+item.id, lazy: true });
                    }
                }else{
                    data.result.push({ title: "(none)", icon: false  });
                }
            } else if ( data.node.key == "admin" ) {
                data.result = [];
                var item;
                for ( var i in data.response ) {
                    item = data.response[i];
                    data.result.push( { title: item.name, folder: true, lazy: true, key: item.id } );
                }
            }
        },
        activate: function( event, data ) {
            //console.log("click",data.node );
            //data.node.setSelected(true);
            repoShowSelectedInfo( data.node.key );
        }
    });
}
