function repoShowSelectedInfo( key ){
    $("#repo_info").html( key );
}

function setupRepoTab(){
    var tree_source = [
        {title:"My Allocations",folder:true,lazy:true,key:"myalloc"},
        {title:"Project Allocations",folder:true,lazy:true,key:"prjalloc"},
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
                    url: "/api/repo/alloc/list/by_user",
                    cache: false
                };
            } else if ( data.node.key == "prjalloc" ){
                data.result = {
                    url: "/api/prj/list?owner=true&admin=true",
                    cache: false
                };
            } else if ( data.node.key == "admin" ){
                data.result = {
                    url: "/api/repo/list/by_admin",
                    cache: false
                };
            } else if (data.node.key.startsWith("p/")){
                data.result = {
                    url: "/api/repo/alloc/list/by_proj?id="+data.node.key,
                    cache: false
                };
            }
        },
        postProcess: function( event, data ) {
            console.log( "pos proc:", data );
            if ( data.node.key == "myalloc" || data.node.key.startsWith("p/")){
                data.result = [];
                if ( data.response.length ){
                    var item;
                    for ( var i in data.response ) {
                        item = data.response[i];
                        data.result.push( { title: item.repo + " (" + item.usage +" of "+item.alloc + " GB used)", icon: false } );
                    }
                }else{
                    data.result.push({ title: "(none)", icon: false  });
                }
            } else if ( data.node.key == "prjalloc" ){
                data.result = [];
                if ( data.response.length ){
                    var item;
                    for ( var i in data.response ) {
                        item = data.response[i];
                        data.result.push({ title: "\"" + item.title + "\" [" + item.id.substr(2) + "]",icon:"ui-icon ui-icon-box", folder: true, key: item.id, lazy: true });
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
