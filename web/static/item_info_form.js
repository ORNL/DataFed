function showSelectedItemInfo( item ){
    if ( !item || !item.id ){
        return;
    }

    var i, date = new Date(), t = item.id.charAt( 0 ), text, cls;

    switch ( t ){
        case 'd': text = "Data Record"; cls = item.doi?".sidp":".sid"; break;
        case 'c': text = "Collection"; cls = ".sic"; break;
        case 'u': text = "User"; cls = ".siu"; break;
        case 'p': text = "Project"; cls = ".sip"; break;
        case 'r': text = "Allocation"; cls = ".sia"; break;
        case 'q': text = "Query"; cls = ".siq"; break;
        default:
            return;
    }

    $("#sel_info_div").hide();
    var form = $("#sel_info_form");

    $(".sel-info-table td:nth-child(2)",form).html("<span style='color:#808080'>(none)</span>");

    $("#sel_info_type",form).text( text );
    $("#sel_info_id",form).text( item.id );

    if ( item.title )
        $("#sel_info_title",form).text( item.title );

    if ( item.name )
        $("#sel_info_name",form).text( item.name );

    if ( item.alias && cls != ".sidp" )
        $("#sel_info_alias",form).text( item.alias );

    if ( item.doi )
        $("#sel_info_doi",form).text( item.doi );

    if ( item.desc )
        $("#sel_info_desc",form).text( item.desc );

    if ( item.keyw )
        $("#sel_info_keyw",form).text( item.keyw );

    if ( item.owner )
        $("#sel_info_owner",form).text( item.owner );

    if ( item.creator )
        $("#sel_info_creator",form).text( item.creator );

    if ( cls == ".sid" ){
        $("#sel_info_repo",form).text( item.repoId.substr(5) );
        $("#sel_info_size",form).text( sizeToString( item.size ) );
        if ( item.source )
            $("#sel_info_src",form).text( item.source );

        $("#sel_info_ext",form).text(( item.ext?item.ext+" ":"") + ( item.extAuto?"(auto)":"" ));
    }

    if ( cls == ".siq" ){
        var qry = JSON.parse( item.query );

        if ( qry.id )
            $("#sel_info_qry_id",form).text( qry.id );
        if ( qry.text )
            $("#sel_info_qry_text",form).text( qry.text );
        if ( qry.meta )
            $("#sel_info_qry_meta",form).text( qry.meta );
    }

    if ( cls == ".sia" ){
        var is_user = item.user.startsWith("u/");
        $("#sel_info_title",form).text( "Allocation for " + (is_user?" user ":" project ") + item.user );
        $("#sel_info_desc",form).text( "Browse data records by allocation." );

        $("#sel_info_data_lim",form).text( sizeToString( item.dataLimit ));
        var used = Math.max( Math.floor(10000*item.dataSize/item.dataLimit)/100, 0 );
        $("#sel_info_data_sz",form).text( sizeToString( item.dataSize ) + " (" + used + " %)" );
        $("#sel_info_rec_lim",form).text( item.recLimit );
        $("#sel_info_rec_cnt",form).text( item.recCount );
    }

    if ( item.email )
        $("#sel_info_email",form).text( item.email );

    if ( item.ct ){
        date.setTime(item.ct*1000);
        $("#sel_info_ct",form).text( date.toLocaleDateString("en-US", g_date_opts) );
    }

    if ( item.ut ){
        date.setTime(item.ut*1000);
        $("#sel_info_ut",form).text( date.toLocaleDateString("en-US", g_date_opts) );
    }

    if ( item.dt ){
        date.setTime(item.dt*1000);
        $("#sel_info_dt",form).text( date.toLocaleDateString("en-US", g_date_opts) );
    }

    if ( item.deps && item.deps.length ){
        var dep,id;
        text = "";
        for ( i in item.deps ){
            dep = item.deps[i];
            id = dep.id + (dep.alias?" ("+dep.alias+")":"");

            if ( dep.dir == "DEP_OUT" ){
                switch(dep.type){
                    case "DEP_IS_DERIVED_FROM":
                        text += "Derived from " + id + "<br>";
                        break;
                    case "DEP_IS_COMPONENT_OF":
                        text += "Component of " + id + "<br>";
                        break;
                    case "DEP_IS_NEW_VERSION_OF":
                        text += "New version of " + id + "<br>";
                        break;
                }
            }else{
                switch(dep.type){
                    case "DEP_IS_DERIVED_FROM":
                        text += "Precursor of " + id + "<br>";
                        break;
                    case "DEP_IS_COMPONENT_OF":
                        text += "Container of " + id + "<br>";
                        break;
                    case "DEP_IS_NEW_VERSION_OF":
                        text += "Old version of " + id + "<br>";
                        break;
                }
            }

            $("#sel_info_prov",form).html( text );
        }
    }

    if ( cls == ".sip" ){
        text = "";
        if ( item.admin && item.admin.length ){
            for ( i in item.admin )
                text += item.admin[i].substr(2) + " ";
            $("#sel_info_admins",form).text( text );
        }

        if ( item.member && item.member.length ){
            text = "";
            for ( i in item.member )
                text += item.member[i].substr(2) + " ";
            $("#sel_info_members",form).text( text );
        }
    }

    if ( item.alloc && item.alloc.length ){
        var alloc,free;
        text = "";
        for ( i = 0; i < item.alloc.length; i++ ){
            alloc = item.alloc[i];
            free = Math.max( Math.floor(1000*(alloc.dataLimit - alloc.dataSize)/alloc.dataLimit)/100, 0 );
            text += alloc.repo + ": " + sizeToString( alloc.dataSize ) + " of " + sizeToString( alloc.dataLimit ) + " used (" + free + "% free)" + (i==0?" (default)":"") + "<br>";
        }
        $("#sel_info_allocs",form).html( text );
    }

    $(".sid,.sidp,.sic,.sip,.siu,.siq,.sia",form).hide();
    $(cls,form).show();

    form.show();
}

