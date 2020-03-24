/*jshint multistr: true */

function dlgSettings( a_cb ){
    var content = "\
        User Interface<hr>\
        <table class='setting-table'>\
            <tr><td>Task History:</td><td><select id='task-poll-hours'>\
                <option value='1'>1 Hour</option>\
                <option value='12'>12 Hours</option>\
                <option value='24'>1 Day</option>\
                <option value='168'>1 Week</option>\
                <option value='720'>1 Month</option>\
                </select></td></tr>\
            <tr><td>Paging Size:</td><td><select id='page-size'>\
                <option value='10'>10</option>\
                <option value='20'>20</option>\
                <option value='50'>50</option>\
                <option value='100'>100</option>\
                </select></td></tr>\
            <tr><td>App. Theme:</td><td><select id='theme-sel'>\
                <option value='light'>Light</option>\
                <option value='dark'>Dark</option>\
                </select></td></tr>\
        </table>\
        <br>Account Settings<hr>\
        <table class='setting-table'>\
            <tr><td>Default Alloc.:</td><td><select id='def-alloc'><option value='none'>None</option></select></td></tr>\
            <tr><td>E-mail:</td><td><input id='new_email'></input></td></tr>\
        </table>\
        <br>Command-Line Interface<hr>\
        <table class='setting-table'>\
            <tr><td>New password:</td><td><input type='password' id='cli_new_pw'></input></td></tr>\
            <tr><td>Confirm:</td><td><input type='password' id='cli_confirm_pw'></input></td></tr>\
            <tr><td></td><td><button class='btn' style='margin:.5em 0 0 0' id='btn_revoke_cred'>Revoke Credentials</button></td></tr>\
        </table>";

    var frame = $(document.createElement('div'));
    frame.html( content );
    inputTheme( $('input:text,input:password',frame ));
    $(".btn",frame).button();
    var emailFilter = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

    $("#btn_revoke_cred",frame).click( function(){
        dlgConfirmChoice( "Revoke CLI Credentials", "Revoke credentials for ALL configured environments? The SDMS CLI will revert to interactive mode until new credentials are configured using the CLI 'setup' command.", ["Cancel","Revoke"], function(choice){
            if ( choice == 1 ){
                _asyncGet( "/api/usr/revoke_cred", null, function( ok, data ){
                    if ( !ok )
                        dlgAlert( "Revoke Credentials Error", data );
                });
            }
        });
    });

    var options = {
        title: "DataFed Settings",
        modal: true,
        width: 450,
        height: 500,
        resizable: true,
        closeOnEscape: false,
        buttons: [{
            text: "Save",
            click: function(){
                var reload = false, save = false, upd_email, upd_pass;

                var tmp = $("#new_email",frame).val();
                if ( tmp != g_user.email ){
                    if (!emailFilter.test(String(tmp).toLowerCase())) {
                        dlgAlert( "Data Entry Error", "Invalid e-mail" );
                        return;
                    }else{
                        upd_email = tmp;
                        g_user.email = tmp;
                    }
                }

                tmp = $("#cli_new_pw",frame).val();
                if ( tmp ){
                    var pw2 = $('#cli_confirm_pw',frame).val();
                    if ( tmp != pw2 ){
                        dlgAlert( "Update CLI Password", "Passwords do not match" );
                        return;
                    }else{
                        upd_pass = tmp;
                    }
                }

                tmp = $("#page-size",frame).val();
                if ( tmp != g_opts.page_sz ){
                    g_opts.page_sz = parseInt(tmp);
                    save = true;
                    reload = true;
                }

                tmp = $("#task-poll-hours",frame).val();
                if ( tmp != g_opts.task_hist ){
                    g_opts.task_hist = parseInt(tmp);
                    save = true;
                }

                tmp = $("#def-alloc",frame).val();
                if ( tmp != g_opts.def_alloc ){
                    g_opts.def_alloc = tmp;
                    save = true;
                }

                tmp = $("#theme-sel",frame).val();
                if ( tmp != g_theme ){
                    themeSet( tmp );
                }

                if ( save ){
                    _asyncGet( "/api/usr/update?uid=u/"+g_user.uid+"&opts="+encodeURIComponent(JSON.stringify(g_opts)), null, function( ok, data ){
                        if ( !ok )
                            dlgAlert( "Update Options Error", data );
                        else
                            setStatusText("Options saved.");
                    });
                }

                if ( upd_pass || upd_email ){
                    var url = "/api/usr/update?uid=u/"+g_user.uid;
                    if ( upd_pass )
                        url += "&pw=" + encodeURIComponent(upd_pass);
                    if ( upd_email )
                        url += "&email=" + encodeURIComponent(upd_email);
                    _asyncGet(url, null, function( ok, data ){
                        if ( !ok )
                            dlgAlert( "Update Error", data );
                    });
                }

                if ( a_cb )
                    a_cb( reload );

                $(this).dialog('destroy').remove();
            }
        },{
            text: "Cancel",
            click: function() {
                $(this).dialog('destroy').remove();
            }
        }],
        open: function(event,ui){
            $("#page-size",frame).val(g_opts.page_sz).selectmenu({width:150});
            $("#theme-sel",frame).val(g_theme).selectmenu({width:150});
            $("#task-poll-hours",frame).val(g_opts.task_hist).selectmenu({width:150});
            $("#def-alloc",frame).val(g_opts.def_alloc).selectmenu({width:225});
            $("#new_email",frame).val( g_user.email );
        }
    };

    allocListBySubject(null,null, function( ok, data ){
        var html = "";
        if ( ok && data.length ){
            var alloc;
            for ( var i = 0; i < data.length; i++ ){
                alloc = data[i];
                html += "<option value='"+alloc.repo + "'";
                if ( i == 0 )
                    html += " selected";
                html += ">"+alloc.repo.substr(5)+" ("+ sizeToString(alloc.dataSize) + " / " + sizeToString(alloc.dataLimit) +")</option>";
            }
        }

        $("#def-alloc",frame).html(html);

        frame.dialog( options );
    });

}
