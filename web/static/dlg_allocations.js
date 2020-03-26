function dlgAllocations(){
    var content = "<div id='alloc_table'></div>";
    var frame = $(document.createElement('div'));
    frame.html( content );
/*
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
            <tr><td>&lt 1 KB:</td><td>" + data.histogram[0].toFixed(1) + " %</td></tr>\
            <tr><td>1 KB to 1 MB:</td><td>" + data.histogram[1].toFixed(1) + " %</td></tr>\
            <tr><td>1 MB to 1 GB:</td><td>" + data.histogram[2].toFixed(1) + " %</td></tr>\
            <tr><td>1 GB to 1 TB:</td><td>" + data.histogram[3].toFixed(1) + " %</td></tr>\
            <tr><td>&gt 1 TB:</td><td>" + data.histogram[4].toFixed(1) + " %</td></tr>\
            </table>";

            dlgAlert( "Allocation Statistics", msg );
        }
    });
*/

    function refreshAllocTable( data ){
        console.log("refreshAllocTable",data);
        var html;
        if ( data.length ){
            html = "<table class='info_table'><tr><th>Repo ID</th><th>Max Size</th><th>Total Size</th><th>Max Count</th><th>Records</th><th>Files</th><th>Avg. Size</th></tr>";
            var alloc;
            for ( var i in data ){
                alloc = data[i];
                html += "<tr><td>"+alloc.repo+"</td><td>"+sizeToString(alloc.maxSize)+"</td><td>"+sizeToString(alloc.totSize)+"</td><td>"+alloc.maxCount+"</td><td>"+
                    alloc.stats.records + "</td><td>" + alloc.stats.files + "</td><td>" + (alloc.stats.files?sizeToString( alloc.stats.totalSz/alloc.stats.files ):"n/a") + "</td></tr>";
            }
            html += "</table>";
        }else{
            html = "No allocations.";
        }

        $("#alloc_table",frame).html(html);
    }

    allocListBySubject( undefined, true, function( ok, data ){
        //console.log( "allocs:", ok, data );

        refreshAllocTable( data );

        var options = {
            title: "Allocations",
            modal: true,
            width: 600,
            height: 300,
            resizable: true,
            buttons: [{
                text: "Refresh",
                click: function() {
                    // TODO Add opt to gather statistics
                    allocListBySubject( undefined, true, function( ok, data ){
                        refreshAllocTable( data );
                    });
                }
            },{
                text: "Close",
                click: function() {
                    $(this).dialog('close');
                }
            }],
            open: function(event,ui){
            },
            close: function( ev, ui ) {
                $(this).dialog("destroy").remove();
            }
        };

        frame.dialog( options );
        $(".btn",frame).button();
    });
}

