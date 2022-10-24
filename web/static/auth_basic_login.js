import * as dialogs from "/dialogs.js";
import * as api from "/api.js";
import * as util from "/util.js";

$(".btn-help").on( "click", function(){
    window.open('https://ornl.github.io/DataFed/','datafed-docs');
});

function handleInputs( is_register )
{
    var uid, pw1;

    if ( is_register ){
        uid = document.getElementById('input2-uid').value.trim();
        pw1 = document.getElementById('input2-pw').value;
    }else{
        uid = document.getElementById('input1-uid').value.trim();
        pw1 = document.getElementById('input1-pw').value;
    }

    if ( !uid.length ){
        dialogs.dlgAlert( "Invalid Input", "User ID must be provided." );
        return;
    }

    if ( !pw1.length  ){
        dialogs.dlgAlert( "Invalid Input", "Password must be provided." );
        return;
    }

    if ( is_register ){
        var pw2 = document.getElementById('input2-pw-verify').value,
            name = document.getElementById('input2-name').value.trim();

        if ( name.length < 0 ){
            dialogs.dlgAlert( "Invalid Input", "Name is required." );
            return;
        }

        if ( pw1 != pw2 ){
            dialogs.dlgAlert( "Invalid Input", "Verification password does not match." );
            return;
        }

        api._asyncGet( "/api/usr/register/basic?uid="+encodeURIComponent(uid)+"&name="+encodeURIComponent(name), null, function(){
            console.log("user reg basic ok");

            api.userRegister( pw1, function( ok, reply ){
                console.log("user reg:",ok,reply);

                if ( ok ){
                    window.location = "/ui/main";
                }else{
                    dialogs.dlgAlert( "Registration Error", reply );
                }
            });
        });
    } else {

    }

    console.log( uid, pw1, pw2 );
}

$(".btn-login").on( "click", function(){
    handleInputs( false );
});

$(".btn-register").on( "click", function(){
    handleInputs( true );
});

$(".btn-cancel").on( "click", function(){
    location.href = "/";
});

$(document).ready(function(){
    window.name = 'DataFed Login (basic)';

    var tmpl_data = JSON.parse(document.getElementById('template_data').innerHTML);
    if ( tmpl_data.test_mode == "true" ){
        $("#test_mode").show(); 
    }

    $(".btn").button();
    util.inputTheme($('input'));

    /*document.getElementById('input-uid').addEventListener("keypress",function( ev ){
        console.log( ev.code );
    });*/
});


