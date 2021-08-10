import * as dialogs from "/dialogs.js";

window.retry = function() {
    window.location = "/ui/logout";
}

window.register = function() {
    var pw1 = document.getElementById('pw1').value;
    var pw2 = document.getElementById('pw2').value;

    if ( pw1 != pw2 )
        dialogs.dlgAlert( "Password Error", "Passwords do not match." );
    else
        window.location = "/ui/do_register?pw="+pw1;
}

$(document).ready(function(){
    var tmpl_data = JSON.parse(document.getElementById('template_data').innerHTML);

    $(".btn").button();
    $('input').addClass("ui-widget ui-widget-content");

    if ( tmpl_data.uname.indexOf(' ') == -1 && uname.indexOf(',') == -1 ){
        //$('#register_btn').button('disable');
        $("#uid_bad").show();

        dialogs.dlgAlert("Invalid User Name","Your Globus account name (" + tmpl_data.uname +
            ") does not contain distinct first and last names. Please update your Globus account profile and retry DataFed login.");
    }else{
        $("#uid_ok").show();
    }
});
